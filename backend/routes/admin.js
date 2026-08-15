const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { todayVn } = require('../time');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// "Hôm nay" của màn hình tổng quan cũng phải theo giờ VN, nếu không PHC mở app
// trước 07:00 sẽ thấy dữ liệu của hôm trước.
function todayStr() {
  return todayVn();
}

router.get('/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, username, full_name, role, vehicle_plate, vehicle_model, active, created_at
      FROM users ORDER BY role, full_name
    `);
    res.json({ users });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, full_name, role, vehicle_plate, vehicle_model } = req.body || {};
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Thiếu tên đăng nhập, mật khẩu hoặc họ tên' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });

    const hash = bcrypt.hashSync(password, 10);
    const created = await db.get(`
      INSERT INTO users (username, password_hash, full_name, role, vehicle_plate, vehicle_model, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, TRUE)
      RETURNING id
    `, [username.trim(), hash, full_name, role === 'admin' ? 'admin' : 'driver', vehicle_plate || null, vehicle_model || null]);
    res.json({ ok: true, id: created.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { full_name, active, vehicle_plate, vehicle_model, role, reset_password } = req.body || {};
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    const fields = [];
    const params = [];
    if (full_name !== undefined) { fields.push('full_name = ?'); params.push(full_name); }
    if (active !== undefined) { fields.push('active = ?'); params.push(!!active); }
    if (vehicle_plate !== undefined) { fields.push('vehicle_plate = ?'); params.push(vehicle_plate); }
    if (vehicle_model !== undefined) { fields.push('vehicle_model = ?'); params.push(vehicle_model); }
    if (role !== undefined) { fields.push('role = ?'); params.push(role === 'admin' ? 'admin' : 'driver'); }
    if (reset_password) {
      if (reset_password.length < 8) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
      fields.push('password_hash = ?', 'must_change_password = TRUE');
      params.push(bcrypt.hashSync(reset_password, 10));
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật' });

    params.push(id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/overview', async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const drivers = await db.all(`SELECT id, full_name, vehicle_plate, vehicle_model FROM users WHERE role = 'driver' AND active = TRUE ORDER BY full_name`);
    const submissions = await db.all(`SELECT * FROM daily_submissions WHERE work_date = ?`, [date]);
    const subByUser = Object.fromEntries(submissions.map(s => [s.user_id, s]));

    const issueCounts = await db.all(`
      SELECT ds.user_id, COUNT(*)::int AS issue_count
      FROM daily_submission_items dsi
      JOIN daily_submissions ds ON ds.id = dsi.submission_id
      WHERE ds.work_date = ? AND dsi.status = 'issue'
      GROUP BY ds.user_id
    `, [date]);
    const issueMap = Object.fromEntries(issueCounts.map(r => [r.user_id, r.issue_count]));

    const result = drivers.map(d => ({
      ...d,
      submitted: !!subByUser[d.id],
      day_type: subByUser[d.id] ? subByUser[d.id].day_type : null,
      submitted_at: subByUser[d.id] ? subByUser[d.id].submitted_at : null,
      issue_count: issueMap[d.id] || 0,
    }));
    res.json({ date, drivers: result });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/submissions', async (req, res) => {
  try {
    const { user_id, from, to, only_issues } = req.query;
    let sql = `
      SELECT ds.*, u.full_name, u.vehicle_plate, u.vehicle_model
      FROM daily_submissions ds JOIN users u ON u.id = ds.user_id
      WHERE 1=1
    `;
    const params = [];
    if (user_id) { sql += ' AND ds.user_id = ?'; params.push(Number(user_id)); }
    if (from) { sql += ' AND ds.work_date >= ?'; params.push(from); }
    if (to) { sql += ' AND ds.work_date <= ?'; params.push(to); }
    sql += ' ORDER BY ds.work_date DESC LIMIT 500';
    let submissions = await db.all(sql, params);

    const withItems = [];
    for (const s of submissions) {
      const items = await db.all(`
        SELECT dsi.*, ci.code, ci.name FROM daily_submission_items dsi
        JOIN checklist_items ci ON ci.id = dsi.checklist_item_id
        WHERE dsi.submission_id = ?
      `, [s.id]);
      withItems.push({ ...s, items });
    }
    submissions = withItems;

    if (only_issues === '1') {
      submissions = submissions.filter(s => s.items.some(i => i.status === 'issue'));
    }
    res.json({ submissions });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/periodic-status', async (req, res) => {
  try {
    const drivers = await db.all(`SELECT id, full_name, vehicle_plate FROM users WHERE role = 'driver' AND active = TRUE ORDER BY full_name`);
    const items = await db.all(`SELECT * FROM checklist_items WHERE category = 'periodic' AND active = TRUE ORDER BY sort_order`);
    const logs = await db.all(`
      SELECT user_id, checklist_item_id, MAX(done_date) as last_done
      FROM periodic_logs GROUP BY user_id, checklist_item_id
    `);
    const map = {};
    for (const l of logs) map[`${l.user_id}-${l.checklist_item_id}`] = l.last_done;

    const result = drivers.map(d => ({
      driver: d,
      items: items.map(it => ({
        checklist_item_id: it.id,
        code: it.code,
        name: it.name,
        frequency_label: it.frequency_label,
        last_done: map[`${d.id}-${it.id}`] || null,
      })),
    }));
    res.json({ result });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

module.exports = router;
