const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    const payload = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
    res.json({
      token,
      user: {
        ...payload,
        vehicle_plate: user.vehicle_plate,
        vehicle_model: user.vehicle_model,
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    if (!user.must_change_password) {
      if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password_hash)) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
      }
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?', [hash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, username, full_name, role, vehicle_plate, vehicle_model, must_change_password FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại' });
  }
});

module.exports = router;
