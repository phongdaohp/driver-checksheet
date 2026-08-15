require('dotenv').config();
const { Pool, types } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('LỖI: Thiếu biến môi trường DATABASE_URL trong file .env.');
  console.error('=> Tạo project miễn phí tại https://supabase.com, vào Project Settings → Database →');
  console.error('   Connection string → chọn "Transaction pooler" (cổng 6543) rồi dán vào .env (xem README.md).');
  process.exit(1);
}

/* ---- Giữ nguyên định dạng chuỗi ngày/giờ mà frontend đang mong đợi ----
   public/app.js dùng formatTime() tách chuỗi theo dấu cách ("YYYY-MM-DD HH:MM:SS")
   và daysAgo() nối thêm "T00:00:00" vào ngày ("YYYY-MM-DD"). Mặc định node-postgres
   trả về object Date, khi JSON hóa sẽ thành ISO ("...T09:00:00.000Z") làm vỡ cả hai
   hàm đó. Hai dòng dưới giữ nguyên chuỗi thô của Postgres nên frontend không phải sửa. */
types.setTypeParser(1082, (v) => v);               // date -> "YYYY-MM-DD"
// timestamptz -> "YYYY-MM-DD HH:MM:SS" theo GIỜ VIỆT NAM (GMT+7). Tự quy đổi thay vì
// đọc chuỗi thô, để kết quả không phụ thuộc timezone mà Postgres đặt cho session.
const { toVnDateTime } = require('./time');
types.setTypeParser(1184, toVnDateTime);           // timestamptz
types.setTypeParser(1114, toVnDateTime);           // timestamp (phòng khi có cột cũ)

const pool = new Pool({
  connectionString,
  // Trên Vercel mỗi lần gọi hàm là một tiến trình riêng — giữ pool nhỏ để không cạn
  // connection của Supabase. Bắt buộc dùng chuỗi kết nối "Transaction pooler" (6543).
  max: Number(process.env.PG_POOL_MAX || 1),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

/* Đổi placeholder kiểu SQLite (?) sang kiểu Postgres ($1, $2, ...).
   Nhờ vậy toàn bộ câu lệnh trong routes/ giữ nguyên không phải sửa, kể cả mấy chỗ
   ghép SQL động (admin.js patch user / lọc submissions, checklist.js lọc history).
   LƯU Ý: chỉ an toàn khi không có câu lệnh nào chứa dấu "?" bên trong chuỗi literal.
   Toàn bộ query hiện tại đều thỏa điều kiện này — nếu sau này thêm query có "?" trong
   chuỗi, phải viết thẳng $1/$2 cho query đó. */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function get(sql, args = []) {
  const r = await pool.query(toPg(sql), args);
  return r.rows[0];
}
async function all(sql, args = []) {
  const r = await pool.query(toPg(sql), args);
  return r.rows;
}
async function run(sql, args = []) {
  const r = await pool.query(toPg(sql), args);
  return { changes: r.rowCount };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('driver','admin')) DEFAULT 'driver',
  vehicle_plate TEXT,
  vehicle_model TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('daily','periodic')),
  frequency_label TEXT,
  name TEXT NOT NULL,
  description TEXT,
  alphard_only BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS daily_submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_date DATE NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('driving','no_car_use')) DEFAULT 'driving',
  note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, work_date)
);

CREATE TABLE IF NOT EXISTS daily_submission_items (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES daily_submissions(id) ON DELETE CASCADE,
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  status TEXT NOT NULL CHECK (status IN ('ok','issue','na')) DEFAULT 'ok',
  note TEXT
);

CREATE TABLE IF NOT EXISTS periodic_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  done_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_submissions_work_date ON daily_submissions(work_date);
CREATE INDEX IF NOT EXISTS idx_daily_submission_items_submission ON daily_submission_items(submission_id);
CREATE INDEX IF NOT EXISTS idx_periodic_logs_user_item ON periodic_logs(user_id, checklist_item_id);
`;

const DAILY_ITEMS = [
  { code: 'D01', name: 'Rửa xe, lau xe (ngoại thất & nội thất)', description: 'Rửa xe, lau xe, làm sạch bụi bẩn bên trong và bên ngoài xe bằng dụng cụ Công ty trang bị. Không dùng dung dịch tẩy rửa xả trực tiếp ra mương nước mưa. Không dùng hóa chất mùi nồng.', alphard_only: false },
  { code: 'D02', name: 'Kiểm tra lốp xe', description: 'Kiểm tra tình trạng lốp xe trước khi đưa đón chuyên gia.', alphard_only: false },
  { code: 'D03', name: 'Kiểm tra điện ắc-quy', description: 'Kiểm tra tình trạng ắc-quy trước khi đưa đón chuyên gia.', alphard_only: false },
  { code: 'D04', name: 'Kiểm tra cửa tự động, cốp tự động, đèn sau ghế', description: 'Riêng xe Alphard: kiểm tra thêm cửa tự động, cốp tự động, đèn sau ghế.', alphard_only: true },
  { code: 'D05', name: 'Kiểm tra camera hành trình', description: 'Kiểm tra camera hành trình có hoạt động bình thường không.', alphard_only: false },
  { code: 'D06', name: 'Check maps trước khi xuất phát', description: 'Check maps (5-10 phút) trước khi xuất phát; đánh giá tình trạng giao thông, chọn tuyến đường hợp lý.', alphard_only: false },
  { code: 'D07', name: 'Check lịch xe', description: 'Chủ động check lịch xe trước ngày làm việc mới.', alphard_only: false },
];
const PERIODIC_ITEMS = [
  { code: 'P01', freq: '3-4 lần/tháng', name: 'Vệ sinh thông thường định kỳ', description: 'Rửa xe, hút bụi toàn bộ nội thất tại cơ sở dịch vụ. Đảm bảo sạch cả trong và ngoài xe.' },
  { code: 'P02', freq: '3 tháng/lần', name: 'Vệ sinh chuyên sâu định kỳ', description: 'Vệ sinh tổng thể, làm sạch nội thất chuyên sâu, khử mùi/khử khuẩn tại cơ sở dịch vụ chuyên nghiệp.' },
  { code: 'P03', freq: 'Định kỳ', name: 'Kiểm tra đồ được cấp phát', description: 'Kiểm tra đồ được cấp phát trên xe. Hỏng hay mất phải báo ngay tới PHC.' },
  { code: 'P04', freq: 'Định kỳ', name: 'Kiểm tra thiết bị dự phòng', description: 'Kiểm tra lốp dự phòng, trục quay lốp dự phòng.' },
  { code: 'P05', freq: 'Định kỳ theo hãng', name: 'Bảo trì, bảo dưỡng tại xưởng chính hãng', description: 'Định kỳ bảo trì, bảo dưỡng, kiểm tra xe tại xưởng sửa chữa chính hãng (ngoại thất, nội thất, thiết bị đi kèm).' },
];

// Idempotent: chạy lại nhiều lần vẫn an toàn.
// KHÁC BẢN CŨ: không còn được gọi tự động lúc server khởi động (trên Vercel mỗi request
// có thể là một tiến trình mới — chạy DDL mỗi lần vừa chậm vừa vô nghĩa).
// Chạy tay bằng "npm run seed" trước khi deploy lần đầu, và sau mỗi lần thêm hạng mục.
async function initDb() {
  await pool.query(SCHEMA_SQL);

  // Bổ sung cột cho database tạo bởi phiên bản cũ hơn của app
  await pool.query(`ALTER TABLE daily_submissions ADD COLUMN IF NOT EXISTS day_type TEXT NOT NULL DEFAULT 'driving'`);
  await pool.query(`ALTER TABLE daily_submissions ADD COLUMN IF NOT EXISTS note TEXT`);

  for (const [i, it] of DAILY_ITEMS.entries()) {
    await run(
      `INSERT INTO checklist_items (code, category, frequency_label, name, description, alphard_only, sort_order)
       VALUES (?, 'daily', 'Hằng ngày', ?, ?, ?, ?)
       ON CONFLICT (code) DO NOTHING`,
      [it.code, it.name, it.description, it.alphard_only, i]
    );
  }
  for (const [i, it] of PERIODIC_ITEMS.entries()) {
    await run(
      `INSERT INTO checklist_items (code, category, frequency_label, name, description, alphard_only, sort_order)
       VALUES (?, 'periodic', ?, ?, ?, FALSE, ?)
       ON CONFLICT (code) DO NOTHING`,
      [it.code, it.freq, it.name, it.description, i]
    );
  }

  // COUNT(*) trong Postgres trả về bigint -> node-postgres đưa ra chuỗi. Ép ::int để so sánh số.
  const adminCount = (await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`)).c;
  if (adminCount === 0) {
    const bcrypt = require('bcryptjs');
    const defaultUser = process.env.SEED_ADMIN_USER || 'admin';
    const defaultPass = process.env.SEED_ADMIN_PASS || 'ChangeMe123!';
    const hash = bcrypt.hashSync(defaultPass, 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, role, must_change_password) VALUES (?, ?, ?, 'admin', TRUE)`,
      [defaultUser, hash, 'Quản trị PHC']
    );
    console.log(`Đã tạo tài khoản admin mặc định: username="${defaultUser}" password="${defaultPass}" — hãy đổi mật khẩu ngay sau khi đăng nhập.`);
  }
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txGet = async (sql, args = []) => (await client.query(toPg(sql), args)).rows[0];
    const txAll = async (sql, args = []) => (await client.query(toPg(sql), args)).rows;
    const txRun = async (sql, args = []) => ({ changes: (await client.query(toPg(sql), args)).rowCount });
    const result = await fn({ get: txGet, all: txAll, run: txRun });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Nuốt lỗi rollback để không che mất lỗi gốc (thứ thực sự cần xem trong log)
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Ping rẻ tiền để giữ project Supabase không bị "pause" sau 7 ngày không hoạt động
async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { get, all, run, initDb, transaction, ping, pool };
