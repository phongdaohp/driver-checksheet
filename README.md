# RRC – Check Sheet Lái Xe (Driver Daily/Periodic Checksheet)

Ứng dụng web nội bộ cho lái xe RRC thực hiện checklist công việc hằng ngày và định kỳ,
có đăng nhập username/password riêng cho từng người, PHC có tài khoản quản trị để xem
báo cáo tổng hợp. Chạy được trên điện thoại qua trình duyệt (không cần cài app).

## Kiến trúc

- **Frontend**: HTML/CSS/JS thuần, được Vercel phục vụ thẳng từ CDN (nhanh, không qua server)
- **Backend**: Node.js + Express, chạy dạng **Vercel Serverless Function** tại `/api/*`
- **Database**: **Supabase** (PostgreSQL) — miễn phí, dữ liệu bền vững

> App **không "ngủ"** như trên Render, nhưng project Supabase gói Free sẽ **tự pause sau
> 7 ngày không có hoạt động nào**. Đã xử lý sẵn: `vercel.json` khai báo một **Cron Job**
> gọi `/api/health` mỗi ngày, mà endpoint đó có chạy `SELECT 1` nên database luôn được
> tính là đang hoạt động. Không cần làm gì thêm.

---

## 🚀 Hướng dẫn deploy (~20 phút)

### Bước 1 — Tạo database Supabase (5 phút)

1. Vào **https://supabase.com** → **Sign up** → **New project**.
2. Đặt tên (VD `rrc-checksheet`), chọn region **Southeast Asia (Singapore)** cho gần Việt Nam.
3. Đặt **Database Password** — **lưu lại ngay**, lát nữa cần dán vào chuỗi kết nối.
4. Đợi project khởi tạo xong (~2 phút), rồi vào **Project Settings → Database →
   Connection string**.
5. ⚠️ **Chọn đúng tab "Transaction pooler" (cổng 6543)**, KHÔNG dùng "Direct connection"
   (cổng 5432). Copy chuỗi, thay `[YOUR-PASSWORD]` bằng mật khẩu ở bước 3.

   *Vì sao bắt buộc: Vercel chạy serverless, mỗi request có thể mở một kết nối mới.
   Dùng direct connection sẽ cạn giới hạn kết nối của Supabase rất nhanh và app bắt đầu
   lỗi ngẫu nhiên khi nhiều lái xe cùng vào.*

### Bước 2 — Khởi tạo bảng và tài khoản admin (5 phút)

Bước này **chạy một lần từ máy anh**, trước khi deploy.

```bash
cd backend
npm install
cp .env.example .env
```

Mở `.env` và điền:
- `DATABASE_URL` — chuỗi "Transaction pooler" lấy ở Bước 1
- `JWT_SECRET` — tạo bằng: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_ADMIN_USER` / `SEED_ADMIN_PASS` — tài khoản PHC đầu tiên

```bash
npm run seed
```

Thấy dòng `Seed/khởi tạo database hoàn tất.` là xong. Có thể vào Supabase →
**Table Editor** kiểm tra: phải thấy 5 bảng và 12 hạng mục trong `checklist_items`.

> ⚠️ **Khác với bản chạy trên Render trước đây**: server **không còn tự tạo bảng mỗi
> lần khởi động**. Trên Vercel mỗi request có thể là một tiến trình mới, chạy lệnh tạo
> bảng ở mỗi request vừa chậm vừa vô nghĩa. Nên **phải chạy `npm run seed` bằng tay**
> — lần đầu, và mỗi khi thêm hạng mục checklist mới (xem mục cuối README).

### Bước 3 — Đưa code lên GitHub (5 phút)

1. Vào **https://github.com** → **New repository**, đặt tên `rrc-driver-checksheet`,
   để **Private** (đây là code nội bộ công ty). Không tick "Add README".
2. Mở terminal tại thư mục `driver-checksheet` (thư mục **gốc**, không phải `backend`)
   rồi chạy:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<ten-tai-khoan>/rrc-driver-checksheet.git
   git push -u origin main
   ```
   (`git init` và commit đầu tiên đã làm sẵn.)

   File `.env` đã được `.gitignore` loại trừ nên mật khẩu database **không** bị đẩy lên
   GitHub — đúng như mong muốn.

### Bước 4 — Deploy lên Vercel (5 phút)

1. Vào **https://vercel.com** → **Sign up** bằng tài khoản GitHub.
2. **Add New → Project** → chọn repo `rrc-driver-checksheet` → **Import**.
3. Ở phần cấu hình:
   - **Framework Preset**: `Other`
   - **Root Directory**: bấm **Edit** và chọn **`backend`** ⚠️
     *(code nằm trong thư mục `backend/`, còn repo bắt đầu từ thư mục cha để chứa cả
     README này. Chọn sai chỗ này là Vercel không tìm thấy app.)*
   - Build/Output settings: **không cần sửa gì** — `vercel.json` đã lo hết
4. Mở mục **Environment Variables**, thêm 2 biến:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | chuỗi "Transaction pooler" ở Bước 1 |
   | `JWT_SECRET` | đúng chuỗi đã dùng ở Bước 2 |

   *Không cần `SEED_ADMIN_USER`/`SEED_ADMIN_PASS` trên Vercel — hai biến đó chỉ dùng
   lúc chạy `npm run seed` từ máy anh.*

5. Bấm **Deploy**, đợi ~1 phút.
6. Mở URL Vercel cấp (VD `https://rrc-driver-checksheet.vercel.app`) → đăng nhập bằng
   tài khoản admin ở Bước 2 → **đổi mật khẩu ngay** (hệ thống sẽ tự bắt buộc).

**Xong — mọi lái xe giờ có thể mở link này trên điện thoại để dùng.**

### Cài lên màn hình chính như app (PWA)

App đã được cấu hình thành **PWA**, nên lái xe cài được lên điện thoại: có icon riêng,
mở ra toàn màn hình không thấy thanh địa chỉ trình duyệt, dùng y như app tải từ store —
nhưng không cần qua App Store / CH Play và không tốn dung lượng.

Gửi hướng dẫn này cho lái xe:

- **Android (Chrome)**: mở link → Chrome tự hiện thanh **"Cài đặt ứng dụng"** ở dưới
  màn hình → bấm **Cài đặt**. Nếu không thấy, bấm nút **⋮** góc trên phải →
  **"Thêm vào Màn hình chính"**.
- **iPhone (Safari)**: mở link → bấm nút **Chia sẻ** (hình vuông có mũi tên đi lên, ở
  thanh dưới) → kéo xuống chọn **"Thêm vào MH chính"** → bấm **Thêm**.
  *Bắt buộc dùng Safari — Chrome trên iPhone không cài được.*

> ⚠️ Chỉ cài được khi truy cập qua **HTTPS** (link Vercel thật) hoặc `localhost`.
> Mở bằng địa chỉ IP nội bộ kiểu `http://192.168.x.x` sẽ không hiện nút cài.

**Lưu ý về offline**: app cài rồi vẫn **cần mạng để dùng**. Service worker chỉ lưu sẵn
phần giao diện nên mất sóng vẫn mở được app, nhưng không nộp được checklist. Muốn nộp
khi không có sóng (VD dưới hầm gửi xe) thì phải làm thêm hàng đợi offline — hiện chưa có.

Thay icon bằng logo thật của công ty: ghi đè 3 file trong `public/icons/`, giữ nguyên
tên và kích thước (`icon-192.png` 192×192, `icon-512.png` 512×512,
`apple-touch-icon.png` 180×180).

### Sau khi deploy — kiểm tra nhanh

Mở `https://<link-cua-anh>/api/health` trên trình duyệt. Phải thấy:

```json
{ "ok": true, "db": "up", "time": "..." }
```

Nếu thấy `"db": "down"` → `DATABASE_URL` sai, hoặc quên đổi `[YOUR-PASSWORD]`, hoặc
đang dùng nhầm chuỗi "Direct connection" thay vì "Transaction pooler".

---

## Lưu ý về gói Free

- **Vercel Hobby (free) theo điều khoản chỉ dành cho mục đích phi thương mại.** App nội
  bộ công ty về mặt điều khoản được tính là commercial. Rủi ro thực tế thấp, nhưng nếu
  công ty muốn hoàn toàn đúng điều khoản thì cần gói **Pro (~$20/tháng)**.
- **Supabase Free**: 500MB database (app này dùng vài MB/năm — thừa sức), tối đa 2
  project đang hoạt động mỗi tổ chức.
- Mỗi lần `git push`, Vercel tự động build & deploy lại.

---

## Cấu trúc thư mục

```
driver-checksheet/
  backend/
    api/index.js         # điểm vào cho Vercel Serverless Function
    vercel.json          # định tuyến /api/* + khai báo Cron chống pause database
    server.js            # khai báo Express app; chỉ tự mở cổng khi chạy local
    db.js                # kết nối Postgres + schema + dữ liệu mặc định
    seed.js              # chạy tay: tạo bảng + hạng mục + admin đầu tiên
    routes/
      auth.js            # đăng nhập, đổi mật khẩu
      checklist.js       # API cho lái xe
      admin.js           # API cho PHC (quản lý tài khoản, báo cáo)
    middleware/auth.js   # kiểm tra JWT, phân quyền admin
    public/              # frontend (index.html, app.js, styles.css)
      manifest.json      # khai báo PWA: tên app, icon, mở toàn màn hình
      sw.js              # service worker (network-first, không cache /api/)
      icons/             # icon app 192/512 + apple-touch-icon
    .env.example
    package.json
```

## Chạy thử trên máy cá nhân

Sau khi đã làm Bước 2 ở trên:

```bash
cd backend
npm start
```

Mở `http://localhost:3000`. Khi chạy local, Express tự phục vụ luôn frontend; trên
Vercel thì frontend do CDN phục vụ.

## Tạo tài khoản cho lái xe

Đăng nhập bằng tài khoản admin (PHC) → tab **"Tài khoản"** → điền tên đăng nhập, mật
khẩu tạm thời, họ tên, biển số xe cho từng lái xe. Lái xe đăng nhập lần đầu bằng mật
khẩu tạm thời và sẽ bị bắt buộc đổi mật khẩu ngay. PHC có thể khóa tài khoản (khi lái
xe nghỉ việc) hoặc đặt lại mật khẩu trực tiếp trên giao diện.

## Tính năng

**Lái xe:**
- Xác nhận đầu ngày: "Có chạy xe hôm nay không?" — nếu không, xác nhận nhanh không
  cần checklist; nếu có, thực hiện checklist đầy đủ.
- Checklist hằng ngày: đánh dấu "Bình thường / Có vấn đề / Không áp dụng" từng hạng
  mục, bắt buộc ghi chú khi báo có vấn đề. Có thể cập nhật lại trong ngày.
- Việc định kỳ: xem lần thực hiện gần nhất, đánh dấu đã thực hiện kèm ghi chú.
- Xem lịch sử checklist của chính mình, tự đổi mật khẩu.

**PHC (Admin):**
- Tổng quan theo ngày: ai đã nộp (kèm giờ hoàn thành thực tế), ai không sử dụng xe,
  ai chưa nộp, ai đang báo có vấn đề.
- Chi tiết từng lần nộp, lọc theo lái xe/khoảng ngày.
- Theo dõi tình trạng việc định kỳ của từng lái xe.
- Quản lý tài khoản: tạo mới, khóa/mở khóa, đặt lại mật khẩu.

## Bảo mật

- Mật khẩu băm bằng bcrypt, không lưu dạng chữ thường.
- Xác thực bằng JWT (hết hạn sau 12 giờ).
- Phân quyền: chỉ tài khoản `role = admin` gọi được API `/api/admin/*`.
- **Bắt buộc** đổi `JWT_SECRET` trước khi dùng thật.
- Vercel tự cấp HTTPS miễn phí — mật khẩu được mã hóa khi truyền qua mạng.
- Chống XSS: hàm `esc()` trong `public/app.js`. **Mọi dữ liệu do người dùng nhập phải
  đi qua `esc()` trước khi ghép vào `innerHTML`** — thiếu một chỗ là ghi chú của lái xe
  chạy được như mã HTML trong trình duyệt PHC và lộ token đăng nhập.
- Security header (CSP, X-Frame-Options, nosniff, HSTS) khai báo ở 2 nơi: middleware
  trong `server.js` cho `/api/*`, và `vercel.json` cho file tĩnh do CDN phục vụ.
  CSP đặt `script-src 'self'` nên **không được thêm inline `<script>` hay thuộc tính
  `onclick=`/`onerror=`** vào giao diện, nếu không sẽ bị trình duyệt chặn.

### Đã rà soát và còn tồn đọng

Đã kiểm bằng cách tấn công thật vào server đang chạy. Chặn tốt: truy cập không token,
lái xe leo quyền admin, giả mạo JWT (kể cả `alg=none`), IDOR, SQL injection, dò tên
đăng nhập, lộ `password_hash`, stored XSS.

Ba điểm **chưa xử lý**, cân nhắc khi có thời gian:

| Mức | Vấn đề | Hướng xử lý |
|---|---|---|
| Trung bình | Khóa tài khoản không thu hồi token đang mở (còn hiệu lực tới 12h) | Thêm bảng phiên, hoặc rút ngắn hạn token |
| Trung bình | Không giới hạn số lần đăng nhập sai | Đếm số lần sai theo tài khoản, lưu ở database (bộ nhớ tiến trình vô dụng trên serverless) |
| Thấp | `app.use(cors())` mở cho mọi domain | Giới hạn origin đúng tên miền Vercel |

## Giờ hiển thị

Giờ nộp checklist hiển thị theo **UTC** (chậm hơn giờ Việt Nam 7 tiếng) — đây là hành
vi có từ bản đầu và được giữ nguyên khi chuyển sang Postgres, để tránh lẫn lộn giữa lỗi
chuyển đổi và thay đổi cố ý. Nếu muốn đổi sang giờ Việt Nam, sửa hàm `toUtcString`
trong `db.js` (nơi đang quy đổi về UTC) — chỉ một chỗ duy nhất.

## Sửa/thêm hạng mục checklist

1. Mở `backend/db.js`, sửa mảng `DAILY_ITEMS` hoặc `PERIODIC_ITEMS`.
2. `git push` — Vercel tự deploy lại.
3. **Chạy `npm run seed` từ máy anh** để thêm hạng mục mới vào database.

Bước 3 là bắt buộc và dễ quên: nếu chỉ push mà không seed, code mới đã lên nhưng hạng
mục mới **chưa** có trong database nên sẽ không hiện ra. Lệnh seed an toàn khi chạy lại
nhiều lần — không xóa hạng mục cũ, không tạo trùng.
