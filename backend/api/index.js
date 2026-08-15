// Điểm vào cho Vercel Serverless Function.
// Vercel nạp file này và tự gọi app(req, res) — KHÔNG được gọi app.listen() ở đây.
// Mọi request /api/* đều được vercel.json chuyển hướng về đây.
module.exports = require('../server');
