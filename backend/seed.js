// Chạy bằng "npm run seed" để tạo bảng + hạng mục checklist + tài khoản admin đầu tiên.
//
// QUAN TRỌNG (khác bản chạy trên Render trước đây): server KHÔNG còn tự gọi initDb()
// mỗi lần khởi động nữa, vì trên Vercel mỗi request có thể là một tiến trình mới —
// chạy lệnh tạo bảng ở mỗi request vừa chậm vừa vô nghĩa.
//
// => Phải chạy tay "npm run seed" một lần trước khi deploy lần đầu,
//    và chạy lại mỗi khi thêm hạng mục mới vào DAILY_ITEMS / PERIODIC_ITEMS trong db.js.
//
// Lệnh này an toàn khi chạy lại nhiều lần: không xóa hạng mục cũ, không tạo trùng.
const { initDb, pool } = require('./db');

initDb()
  .then(async () => {
    console.log('Seed/khởi tạo database hoàn tất.');
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Lỗi khi khởi tạo database:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
