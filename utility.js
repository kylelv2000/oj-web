/*
 *  This file is part of SYZOJ.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *
 *  SYZOJ is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  SYZOJ is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public
 *  License along with SYZOJ. If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

Array.prototype.forEachAsync = Array.prototype.mapAsync = async function (fn) {
  return Promise.all(this.map(fn));
};

Array.prototype.filterAsync = async function (fn) {
  let a = await this.mapAsync(fn);
  return this.filter((x, i) => a[i]);
};

global.ErrorMessage = class ErrorMessage {
  constructor(message, nextUrls, details) {
    this.message = message;
    this.nextUrls = nextUrls || {};
    this.details = details;
  }
};

let Promise = require('bluebird');
let path = require('path');
let fs = Promise.promisifyAll(require('fs-extra'));
let util = require('util');
let renderer = require('moemark-renderer');
let moment = require('moment');
let url = require('url');
let querystring = require('querystring');
let pygmentize = require('pygmentize-bundled-cached');
let gravatar = require('gravatar');
let filesize = require('file-size');
let AsyncLock = require('async-lock');

function escapeHTML(s) {
  // Code from http://stackoverflow.com/questions/5251520/how-do-i-escape-some-html-in-javascript/5251551
  return s.replace(/[^0-9A-Za-z ]/g, (c) => {
    return "&#" + c.charCodeAt(0) + ";";
  });
}

function highlightPygmentize(code, lang, cb) {
  pygmentize({
    lang: lang,
    format: 'html',
    options: {
      nowrap: true,
      classprefix: 'pl-'
    }
  }, code, (err, res) => {
    if (err || res.toString() === 'undefined') {
      cb(escapeHTML(code));
    } else {
      cb(res);
    }
  });
}

renderer.config.highlight = highlightPygmentize;

module.exports = {
  resolvePath(s) {
    let a = Array.from(arguments);
    a.unshift(__dirname);
    return path.resolve.apply(null, a);
  },
  markdown(obj, keys, noReplaceUI) {
    let XSS = require('xss');
    let CSSFilter = require('cssfilter');
    let whiteList = Object.assign({}, require('xss/lib/default').whiteList);
    delete whiteList.audio;
    delete whiteList.video;
    for (let tag in whiteList) whiteList[tag] = whiteList[tag].concat(['style', 'class']);
    let xss = new XSS.FilterXSS({
      css: {
        whiteList: Object.assign({}, require('cssfilter/lib/default').whiteList, {
          'vertical-align': true,
          top: true,
          bottom: true,
          left: true,
          right: true,
          "white-space": true
        })
      },
      whiteList: whiteList,
      stripIgnoreTag: true
    });
    let replaceXSS = s => {
      s = xss.process(s);
      if (s) {
        s = `<div style="position: relative; overflow: hidden; ">${s}</div>`;
      }
      return s;
    };
    let replaceUI = s => {
      if (noReplaceUI) return s;

      s = s.split('<pre>').join('<div class="ui existing segment"><pre style="margin-top: 0; margin-bottom: 0; ">').split('</pre>').join('</pre></div>')
           .split('<table>').join('<table class="ui celled table">')
           .split('<blockquote>').join('<div class="ui message">').split('</blockquote>').join('</div>');

      let cheerio = require('cheerio');
      let $ = cheerio.load('<html><head></head><body></body></html>');
      let body = $('body');
      body.html(s);

      let a = $('img:only-child');
      for (let img of Array.from(a)) {
        if (!img.prev && !img.next) {
          $(img).css('display', 'block');
          $(img).css('margin', '0 auto');
        }
      }

      return body.html();
    };
    return new Promise((resolve, reject) => {
      if (!keys) {
        if (!obj || !obj.trim()) resolve("");
        else renderer(obj, { mathjaxUseHtml: true }, s => {
            resolve(replaceUI(replaceXSS(s)));
        });
      } else {
        let res = obj, cnt = keys.length;
        for (let key of keys) {
          renderer(res[key], { mathjaxUseHtml: true }, (s) => {
            res[key] = replaceUI(replaceXSS(s));
            if (!--cnt) resolve(res);
          });
        }
      }
    });
  },
  formatDate(ts, format) {
    if (ts == null) {
      return "Unknown";
    }
    let m = moment(ts * 1000);
    m.locale('eu');
    return m.format(format || 'L H:mm:ss');
  },
  formatTime(x) {
    let sgn = x < 0 ? '-' : '';
    x = Math.abs(x);
    function toStringWithPad(x) {
      x = parseInt(x);
      if (x < 10) return '0' + x.toString();
      else return x.toString();
    }
    return sgn + util.format('%s:%s:%s', toStringWithPad(x / 3600), toStringWithPad(x / 60 % 60), toStringWithPad(x % 60));
  },
  formatSize(x) {
    let res = filesize(x, { fixed: 1 }).calculate();
    if (res.result === parseInt(res.result)) res.fixed = res.result.toString();
    if (res.suffix.startsWith('Byte')) res.suffix = 'B';
    else res.suffix = res.suffix.replace('iB', '');
    return res.fixed + ' ' + res.suffix;
  },
  judgeServer(suffix) {
    return JSON.stringify(url.resolve(syzoj.config.judge_server_addr, suffix));
  },
  parseDate(s) {
    return parseInt(+new Date(s) / 1000);
  },
  getCurrentDate(removeTime) {
    let d = new Date;
    if (removeTime) {
      d.setHours(0);
      d.setMinutes(0);
      d.setSeconds(0);
      d.setMilliseconds(0);
    }
    return parseInt(+d / 1000);
  },
  makeUrl(req_params, form) {
    let res = '';
    if (!req_params) res = '/';
    else if (req_params.originalUrl) {
      let u = url.parse(req_params.originalUrl);
      res = u.pathname;
    } else {
      if (!Array.isArray(req_params)) req_params = [req_params];
      for (let param of req_params) res += '/' + param;
    }
    let encoded = querystring.encode(form);
    if (encoded) res += '?' + encoded;
    return res;
  },
  escapeHTML: escapeHTML,
  highlight(code, lang) {
    return new Promise((resolve, reject) => {
      highlightPygmentize(code, lang, res => {
        resolve(res);
      });
    });
  },
  gravatar(email, size) {
    return gravatar.url(email, { s: size, d: 'mm' }).replace('www', 'cn');
  },
  async parseTestdata(dir, submitAnswer) {
    if (!await syzoj.utils.isDir(dir)) return null;

    try {
      // Get list of *files*
      let list = await (await fs.readdirAsync(dir)).filterAsync(async x => await syzoj.utils.isFile(path.join(dir, x)));

      let res = [];
      if (!list.includes('data.yml')) {
        res[0] = {};
        res[0].cases = [];
        for (let file of list) {
          let parsedName = path.parse(file);
          if (parsedName.ext === '.in') {
            if (list.includes(`${parsedName.name}.out`)) {
              let o = {
                input: file,
                output: `${parsedName.name}.out`
              };
              if (submitAnswer) o.answer = `${parsedName.name}.out`;
              res[0].cases.push(o);
            }

            if (list.includes(`${parsedName.name}.ans`)) {
              let o = {
                input: file,
                output: `${parsedName.name}.ans`
              };
              if (submitAnswer) o.answer = `${parsedName.name}.out`;
              res[0].cases.push(o);
            }
          }
        }

        res[0].type = 'sum';
        res[0].score = 100;
        res[0].cases.forEach((e) => { e.key = (e.input.match(/\d+/g) || []).map((x) => parseInt(x)).concat(e.input); });
        res[0].cases.sort((a, b) => {
          for (let i = 0; i < Math.max(a.key.length, b.key.length); ++i) {
            if (a.key[i] == undefined) return -1;
            if (b.key[i] == undefined) return +1;
            if (a.key[i] !== b.key[i]) return (a.key[i] < b.key[i] ? -1 : +1);
          }
          return 0;
        });

        res.spj = list.some(s => s.startsWith('spj_'));
      } else {
        let config = require('js-yaml').load((await fs.readFileAsync(dir + '/data.yml')));

        let input = config.inputFile, output = config.outputFile, answer = config.userOutput;

        res = config.subtasks.map(st => ({
          score: st.score,
          type: st.type,
          cases: st.cases.map(c => {
            function getFileName(template, id, mustExist) {
              let s = template.split('#').join(String(id));
              if (mustExist && !list.includes(s)) throw `??????????????? ${s}`;
              return s;
            }

            let o = {};
            if (input) o.input = getFileName(input, c, true);
            if (output) o.output = getFileName(output, c, true);
            if (answer) o.answer = getFileName(answer, c, false);

            return o;
          })
        }));

        res = res.filter(x => x.cases && x.cases.length !== 0);

        res.spj = !!config.specialJudge;
      }

      return res;
    } catch (e) {
      console.log(e);
      return { error: e };
    }
  },
  ansiToHTML(s) {
    let Convert = require('ansi-to-html');
    let convert = new Convert({ escapeXML: true });
    return convert.toHtml(s);
  },
  paginate(count, currPage, perPage) {
    currPage = parseInt(currPage);
    if (!currPage || currPage < 1) currPage = 1;

    let pageCnt = Math.ceil(count / perPage);
    if (currPage > pageCnt) currPage = pageCnt;

    return {
      currPage: currPage,
      perPage: perPage,
      pageCnt: pageCnt,
      toSQL: () => {
        if (!pageCnt) return '';
        else return ` LIMIT ${(currPage - 1) * perPage},${perPage}`
      }
    };
  },
  removeTitleTag(s) {
    return s.replace(/???[\S\s]+????/, '');
  },
  md5(data) {
    let crypto = require('crypto');
    let md5 = crypto.createHash('md5');
    md5.update(data);
    return md5.digest('hex');
  },
  isValidUsername(s) {
    return /^[a-zA-Z0-9\-\_]+$/.test(s);
  },
  locks: [],
  lock(key, cb) {
    let s = JSON.stringify(key);
    if (!this.locks[s]) this.locks[s] = new AsyncLock();
    return this.locks[s].acquire(s, cb);
  },
  encrypt(buffer, password) {
    if (typeof buffer === 'string') buffer = Buffer.from(buffer);
    let crypto = require('crypto');
    let cipher = crypto.createCipher('aes-256-ctr', password);
    return Buffer.concat([cipher.update(buffer), cipher.final()]);
  },
  decrypt(buffer, password) {
    let crypto = require('crypto');
    let decipher = crypto.createDecipher('aes-256-ctr', password);
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
  },
  async isFile(path) {
    try {
      return (await fs.statAsync(path)).isFile();
    } catch (e) {
      return false;
    }
  },
  async isDir(path) {
    try {
      return (await fs.statAsync(path)).isDirectory();
    } catch (e) {
      return false;
    }
  },
  async saveConfig() {
    let fs = require('fs-extra');
    fs.writeFileAsync(syzoj.rootDir + '/config.json', JSON.stringify(syzoj.config, null, 2));
  },
  withTimeoutRetry(func) {
    let attemptCount = 0;
    return new Promise((resolve, reject) => {
      function attempt() {
        if (attemptCount++) console.log(`syzoj.utils.withTimeout(): attemptCount = ${attemptCount}`);
        Promise.method(func)().timeout(5000)
        .then(resolve)
        .catch(Promise.TimeoutError, attempt)
        .catch(reject);
      }
      attempt();
    });
  }
};
