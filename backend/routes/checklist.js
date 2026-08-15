const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/items', requireAuth, async (req, res) => {
  try {
    const daily = await db.all('SELECT * FROM checklist_items WHERE category = ? AND active = TRUE ORDER BY sort_order', ['daily']);
    const periodic = await db.all('SELECT * FROM checklist_items WHERE category = ? AND active = TRUE ORDER BY sort_order', ['periodic']);
    res.json({ daily, periodic });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/daily', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const submission = await db.get('SELECT * FROM daily_submissions WHERE user_id = ? AND work_date = ?', [req.user.id, date]);
    if (!submission) return res.json({ submission: null, items: [] });
    const items = await db.all(`
      SELECT dsi.*, ci.code, ci.name FROM daily_submission_items dsi
      JOIN checklist_items ci ON ci.id = dsi.checklist_item_id
      WHERE dsi.submission_id = ?
    `, [submission.id]);
    res.json({ submission, items });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.post('/daily', requireAuth, async (req, res) => {
  try {
    const { work_date, items, day_type, note } = req.body || {};
    const date = work_date || todayStr();
    const type = day_type === 'no_car_use' ? 'no_car_use' : 'driving';

    if (type === 'driving') {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Thiếu danh sách hạng mục checklist' });
      }
      for (const it of items) {
        if (!it.checklist_item_id || !['ok', 'issue', 'na'].includes(it.status)) {
          return res.status(400).json({ error: 'Dữ liệu hạng mục không hợp lệ' });
        }
      }
    }

    const submissionId = await db.transaction(async (tx) => {
      let submission = await tx.get('SELECT * FROM daily_submissions WHERE user_id = ? AND work_date = ?', [req.user.id, date]);
      if (submission) {
        await tx.run('DELETE FROM daily_submission_items WHERE submission_id = ?', [submission.id]);
        await tx.run(`UPDATE daily_submissions SET submitted_at = now(), day_type = ?, note = ? WHERE id = ?`, [type, note || null, submission.id]);
      } else {
        submission = await tx.get(
          'INSERT INTO daily_submissions (user_id, work_date, day_type, note) VALUES (?, ?, ?, ?) RETURNING id',
          [req.user.id, date, type, note || null]
        );
      }
      if (type === 'driving') {
        for (const it of items) {
          await tx.run(
            'INSERT INTO daily_submission_items (submission_id, checklist_item_id, status, note) VALUES (?, ?, ?, ?)',
            [submission.id, it.checklist_item_id, it.status, it.note || null]
          );
        }
      }
      return submission.id;
    });

    res.json({ ok: true, submission_id: submissionId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM daily_submissions WHERE user_id = ?';
    const params = [req.user.id];
    if (from) { sql += ' AND work_date >= ?'; params.push(from); }
    if (to) { sql += ' AND work_date <= ?'; params.push(to); }
    sql += ' ORDER BY work_date DESC LIMIT 90';
    const submissions = await db.all(sql, params);
    res.json({ submissions });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.get('/periodic/status', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM checklist_items WHERE category = ? AND active = TRUE ORDER BY sort_order', ['periodic']);
    const lastDone = await db.all(`
      SELECT checklist_item_id, MAX(done_date) as last_done
      FROM periodic_logs WHERE user_id = ?
      GROUP BY checklist_item_id
    `, [req.user.id]);
    const map = Object.fromEntries(lastDone.map(r => [r.checklist_item_id, r.last_done]));
    res.json({ items: items.map(it => ({ ...it, last_done: map[it.id] || null })) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

router.post('/periodic', requireAuth, async (req, res) => {
  try {
    const { checklist_item_id, done_date, note } = req.body || {};
    if (!checklist_item_id) return res.status(400).json({ error: 'Thiếu hạng mục' });
    const date = done_date || todayStr();
    await db.run(
      'INSERT INTO periodic_logs (user_id, checklist_item_id, done_date, note) VALUES (?, ?, ?, ?)',
      [req.user.id, checklist_item_id, date, note || null]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ' }); }
});

module.exports = router;
