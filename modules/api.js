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

let User = syzoj.model('user');
let Problem = syzoj.model('problem');
let File = syzoj.model('file');
const Email = require('../libs/email');
const jwt = require('jsonwebtoken');

function setLoginCookie(username, password, res) {
  res.cookie('login', JSON.stringify([username, password]));
}

// Login
app.post('/api/login', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    let user = await User.fromName(req.body.username);

    if (!user) throw 1001;
    else if (user.password == null || user.password === '') res.send({ error_code: 1003 });
    else if (user.password !== req.body.password) res.send({ error_code: 1002 });
    else if (!syzoj.utils.isValidUsername(req.body.verification)) res.send({error_code: 1004 });
    else if (req.body.verification !== syzoj.config.verf_code) res.send({ error_code: 1004 });
    else {
      req.session.user_id = user.id;
      setLoginCookie(user.username, user.password, res);
      res.send({ error_code: 1 });
    }
  } catch (e) {
    syzoj.log(e);
    res.send({ error_code: e });
  }
});

app.post('/api/forget', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    let user = await User.fromEmail(req.body.email);
    if (!user) throw 1001;
    let sendObj = {
      userId: user.id,
    };

    const token = jwt.sign(sendObj, syzoj.config.email_jwt_secret, {
      subject: 'forget',
      expiresIn: '12h'
    });

    const vurl = req.protocol + '://' + req.get('host') + syzoj.utils.makeUrl(['api', 'forget_confirm'], { token: token });
    try {
      await Email.send(user.email,
        `${user.username} ??? ${syzoj.config.title} ??????????????????`,
        `<p>????????????????????????????????????</p><p><a href="${vurl}">${vurl}</a></p><p>?????????????????? 12h?????????????????? ${user.username}????????????????????????</p>`
      );
    } catch (e) {
      return res.send({
        error_code: 2010,
        message: require('util').inspect(e)
      });
      return null;
    }

    res.send({ error_code: 1 });
  } catch (e) {
    syzoj.log(e);
    res.send(JSON.stringify({ error_code: e }));
  }
});

/*
// Sign up
app.post('/api/sign_up', async (req, res) => {
  try {
    if (!res.locals.user || !res.locals.user.is_admin) throw new ErrorMessage('?????????????????????????????????');

    res.setHeader('Content-Type', 'application/json');
    let user = await User.fromName(req.body.username);
    if (user) throw 2008;
    user = await User.findOne({ where: { email: req.body.email } });
    if (user) throw 2009;


    // Because the salt is "syzoj2_xxx" and the "syzoj2_xxx" 's md5 is"59cb..."
    // the empty password 's md5 will equal "59cb.."
    let syzoj2_xxx_md5 = '59cb65ba6f9ad18de0dcd12d5ae11bd2';
    if (req.body.password === syzoj2_xxx_md5) throw 2007;
    if (!(req.body.email = req.body.email.trim())) throw 2006;
    if (!syzoj.utils.isValidUsername(req.body.username)) throw 2002;

    if (syzoj.config.register_mail) {
      let sendObj = {
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
      };

      const token = jwt.sign(sendObj, syzoj.config.email_jwt_secret, {
        subject: 'register',
        expiresIn: '2d'
      });

      const vurl = req.protocol + '://' + req.get('host') + syzoj.utils.makeUrl(['api', 'sign_up_confirm'], { token: token });
      try {
        await Email.send(req.body.email,
          `${req.body.username} ??? ${syzoj.config.title} ??????????????????`,
          `<p>?????????????????????????????? ${syzoj.config.title} ????????????</p><p><a href="${vurl}">${vurl}</a></p><p>??????????????? ${req.body.username}????????????????????????</p>`
        );
      } catch (e) {
        return res.send({
          error_code: 2010,
          message: require('util').inspect(e)
        });
      }

      res.send(JSON.stringify({ error_code: 2 }));
    } else {
      user = await User.create({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        public_email: true
      });
      await user.save();

      req.session.user_id = user.id;
      setLoginCookie(user.username, user.password, res);

      res.send(JSON.stringify({ error_code: 1 }));
    }
  } catch (e) {
    syzoj.log(e);
    res.send(JSON.stringify({ error_code: e }));
  }
});
*/

app.get('/api/forget_confirm', async (req, res) => {
  try {
    try {
      jwt.verify(req.query.token, syzoj.config.email_jwt_secret, { subject: 'forget' });
    } catch (e) {
      throw new ErrorMessage("Token ????????????");
    }
    res.render('forget_confirm', {
      token: req.query.token
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.post('/api/reset_password', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    let obj;
    try {
      obj = jwt.verify(req.body.token, syzoj.config.email_jwt_secret, { subject: 'forget' });
    } catch (e) {
      throw 3001;
    }

    let syzoj2_xxx_md5 = '59cb65ba6f9ad18de0dcd12d5ae11bd2';
    if (req.body.password === syzoj2_xxx_md5) throw new ErrorMessage('?????????????????????');
    const user = await User.fromID(obj.userId);
    user.password = req.body.password;
    await user.save();

    res.send(JSON.stringify({ error_code: 1 }));
  } catch (e) {
    syzoj.log(e);
    if (typeof e === 'number') {
      res.send(JSON.stringify({ error_code: e }));
    } else {
      res.send(JSON.stringify({ error_code: 1000 }));
    }
  }
});

app.get('/api/sign_up_confirm', async (req, res) => {
  try {
    let obj;
    try {
      obj = jwt.verify(req.query.token, syzoj.config.email_jwt_secret, { subject: 'register' });
    } catch (e) {
      throw new ErrorMessage('???????????????????????????: ' + e.toString());
    }

    let user = await User.fromName(obj.username);
    if (user) throw new ErrorMessage('????????????????????????');
    user = await User.findOne({ where: { email: obj.email } });
    if (user) throw new ErrorMessage('???????????????????????????');

    // Because the salt is "syzoj2_xxx" and the "syzoj2_xxx" 's md5 is"59cb..."
    // the empty password 's md5 will equal "59cb.."
    let syzoj2_xxx_md5 = '59cb65ba6f9ad18de0dcd12d5ae11bd2';
    if (obj.password === syzoj2_xxx_md5) throw new ErrorMessage('?????????????????????');
    if (!(obj.email = obj.email.trim())) throw new ErrorMessage('???????????????????????????');
    if (!syzoj.utils.isValidUsername(obj.username)) throw new ErrorMessage('?????????????????????');

    user = await User.create({
      username: obj.username,
      password: obj.password,
      email: obj.email,
      public_email: true
    });
    await user.save();

    req.session.user_id = user.id;
    setLoginCookie(user.username, user.password, res);

    res.redirect(obj.prevUrl || '/');
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// Obslete!!!
app.get('/api/sign_up/:token', async (req, res) => {
  try {
    let obj;
    try {
      let decrypted = syzoj.utils.decrypt(Buffer.from(req.params.token, 'base64'), syzoj.config.email_jwt_secret).toString();
      obj = JSON.parse(decrypted);
    } catch (e) {
      throw new ErrorMessage('??????????????????????????????');
    }

    let user = await User.fromName(obj.username);
    if (user) throw new ErrorMessage('????????????????????????');
    user = await User.findOne({ where: { email: obj.email } });
    if (user) throw new ErrorMessage('???????????????????????????');

    // Because the salt is "syzoj2_xxx" and the "syzoj2_xxx" 's md5 is"59cb..."
    // the empty password 's md5 will equal "59cb.."
    let syzoj2_xxx_md5 = '59cb65ba6f9ad18de0dcd12d5ae11bd2';
    if (obj.password === syzoj2_xxx_md5) throw new ErrorMessage('?????????????????????');
    if (!(obj.email = obj.email.trim())) throw new ErrorMessage('???????????????????????????');
    if (!syzoj.utils.isValidUsername(obj.username)) throw new ErrorMessage('?????????????????????');

    user = await User.create({
      username: obj.username,
      password: obj.password,
      email: obj.email,
      public_email: true
    });
    await user.save();

    req.session.user_id = user.id;
    setLoginCookie(user.username, user.password, res);

    res.redirect(obj.prevUrl || '/');
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// Markdown
app.post('/api/markdown', async (req, res) => {
  try {
    let s = await syzoj.utils.markdown(req.body.s.toString());
    res.send(s);
  } catch (e) {
    syzoj.log(e);
    res.send(e);
  }
});

app.get('/static/uploads/answer/:md5', async (req, res) => {
  try {
    res.sendFile(File.resolvePath('answer', req.params.md5));
  } catch (e) {
    res.status(500).send(e);
  }
});
