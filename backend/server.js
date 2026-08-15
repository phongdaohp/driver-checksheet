require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const authRoutes = require('./routes/auth');
const checklistRoutes = require('./routes/checklist');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());

/* Security headers — lớp phòng thủ thứ hai cho XSS, và chặn nhúng iframe.
   CSP đặt được script-src 'self' vì app không dùng inline <script> hay thuộc tính
   onclick/onerror nào — nhờ vậy mã chèn kiểu <img onerror="..."> sẽ KHÔNG chạy dù
   có lọt qua khâu escape. Riêng style phải mở 'unsafe-inline' vì giao diện dùng 15
   chỗ style="..." trực tiếp.
   Trên Vercel, file tĩnh do CDN phục vụ không đi qua đây — vercel.json khai báo lại
   đúng bộ header này cho chúng. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/admin', adminRoutes);

// Health check kiêm "chống ngủ" cho Supabase: có chạm database (SELECT 1) nên mỗi lần
// gọi sẽ tính là project có hoạt động, tránh bị pause sau 7 ngày im lặng.
// Vercel Cron gọi endpoint này mỗi ngày (xem "crons" trong vercel.json).
app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check thất bại:', err);
    res.status(500).json({ ok: false, db: 'down', error: 'Không kết nối được database' });
  }
});

// Khi chạy local, Express tự phục vụ luôn frontend.
// Khi chạy trên Vercel, thư mục public/ đã được CDN phục vụ trước khi request chạm tới
// hàm này (xem vercel.json), nên phần dưới chỉ có tác dụng lúc chạy local.
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Chỉ mở cổng khi chạy trực tiếp ("npm start"). Trên Vercel, file api/index.js nạp
// module này và tự xử lý request — không được gọi listen() ở đó.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RRC Driver Checksheet server đang chạy tại http://localhost:${PORT}`);
  });
}

module.exports = app;
