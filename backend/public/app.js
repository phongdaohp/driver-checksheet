/* RRC Driver Checksheet - Frontend SPA (vanilla JS, no build step needed) */

const el = (sel) => document.querySelector(sel);
const app = el('#app');

const state = {
  token: localStorage.getItem('rrc_token') || null,
  user: JSON.parse(localStorage.getItem('rrc_user') || 'null'),
  driverTab: 'daily',
  adminTab: 'overview',
};

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('rrc_token', token);
  localStorage.setItem('rrc_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rrc_token');
  localStorage.removeItem('rrc_user');
}

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, Object.assign({}, opts, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401) { clearSession(); render(); }
    throw new Error((data && data.error) || 'Đã có lỗi xảy ra');
  }
  return data;
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* Chống XSS: MỌI dữ liệu từ server/người dùng phải đi qua hàm này trước khi ghép
   vào innerHTML. Thiếu nó, ghi chú của lái xe sẽ chạy như mã HTML trong trình duyệt
   PHC và lộ token đăng nhập. Chỉ bỏ qua esc() khi giá trị CHỦ Ý là HTML do chính
   file này sinh ra (VD tabsHtml, contentHtml, statusPill(), các khối .map(...)). */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Hien trang thai "dang xu ly" ngay tren nut trong luc cho may chu tra loi.
   Khong co no, nguoi dung bam xong khong thay phan hoi gi va se bam lai nhieu lan --
   ro nhat khi dung 4G, hoac o lan bam dau tien sau luc ham serverless "nguoi".
   Nut bi vo hieu hoa trong luc chay nen cung chan luon viec bam trung. */
async function withBusy(btn, label, fn) {
  if (!btn || btn.disabled) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>' + esc(label);
  try {
    return await fn();
  } finally {
    // Khi thanh cong, man hinh thuong duoc ve lai nen nut cu da roi khoi DOM.
    // Chi khoi phuc neu nut van con do (truong hop loi -- de nguoi dung bam lai duoc).
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

function fmtDate(d) {
  return d;
}
/* Ngày hôm nay theo GIỜ VIỆT NAM (GMT+7), dạng "YYYY-MM-DD".
   KHÔNG dùng toISOString() — hàm đó trả giờ UTC, chậm hơn 7 tiếng, nên checklist
   nộp trước 07:00 sáng sẽ bị ghi sang ngày hôm trước. Cũng không dùng giờ máy của
   điện thoại, vì lái xe có thể đặt sai múi giờ. Xem thêm backend/time.js. */
const TZ_VN = 'Asia/Ho_Chi_Minh';
function todayISO() {
  const p = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_VN, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  for (const { type, value } of fmt.formatToParts(new Date())) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}
function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d1 = new Date(dateStr + 'T00:00:00');
  const d2 = new Date(todayISO() + 'T00:00:00');
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}
// submitted_at đã được máy chủ quy đổi sẵn sang giờ VN, dạng "YYYY-MM-DD HH:MM:SS" -> lấy HH:MM
function formatTime(datetimeStr) {
  if (!datetimeStr) return '-';
  const parts = datetimeStr.split(' ');
  return parts[1] ? parts[1].slice(0, 5) : datetimeStr;
}

/* ---------------- LOGIN ---------------- */
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="logo">RORZE</div>
        <div class="subtitle">Check Sheet Lái Xe - RRC</div>
        <form id="loginForm">
          <input type="text" id="username" placeholder="Tên đăng nhập" autocomplete="username" required>
          <input type="password" id="password" placeholder="Mật khẩu" autocomplete="current-password" required>
          <div class="error-msg" id="loginError"></div>
          <button type="submit" class="primary">Đăng nhập</button>
        </form>
      </div>
    </div>
  `;
  el('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = el('#username').value.trim();
    const password = el('#password').value;
    const errBox = el('#loginError');
    errBox.textContent = '';
    await withBusy(el('#loginForm button[type="submit"]'), 'Đang đăng nhập…', async () => {
      try {
        const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        saveSession(data.token, data.user);
        render();
      } catch (err) {
        errBox.textContent = err.message;
      }
    });
  });
}

/* ---------------- FORCE CHANGE PASSWORD ---------------- */
function renderChangePassword(forced) {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="logo">RORZE</div>
        <div class="subtitle">${forced ? 'Lần đầu đăng nhập - vui lòng đổi mật khẩu' : 'Đổi mật khẩu'}</div>
        <form id="pwForm">
          ${forced ? '' : '<input type="password" id="oldPassword" placeholder="Mật khẩu hiện tại" required>'}
          <input type="password" id="newPassword" placeholder="Mật khẩu mới (tối thiểu 8 ký tự)" required>
          <input type="password" id="newPassword2" placeholder="Nhập lại mật khẩu mới" required>
          <div class="error-msg" id="pwError"></div>
          <button type="submit" class="primary">Xác nhận</button>
        </form>
        ${forced ? '' : '<button class="secondary" id="cancelPw" style="margin-top:8px">Hủy</button>'}
      </div>
    </div>
  `;
  el('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = el('#pwError');
    const newPassword = el('#newPassword').value;
    const newPassword2 = el('#newPassword2').value;
    if (newPassword !== newPassword2) { errBox.textContent = 'Mật khẩu nhập lại không khớp'; return; }
    await withBusy(el('#pwForm button[type="submit"]'), 'Đang lưu…', async () => {
      try {
        const body = { newPassword };
        if (!forced) body.oldPassword = el('#oldPassword').value;
        await api('/auth/change-password', { method: 'POST', body: JSON.stringify(body) });
        state.user.must_change_password = false;
        localStorage.setItem('rrc_user', JSON.stringify(state.user));
        toast('Đổi mật khẩu thành công');
        render();
      } catch (err) {
        errBox.textContent = err.message;
      }
    });
  });
  if (!forced) el('#cancelPw').addEventListener('click', render);
}

/* ---------------- SHARED LAYOUT ---------------- */
function layout(tabsHtml, contentHtml) {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">RORZE <small>${esc(state.user.full_name)} · ${state.user.role === 'admin' ? 'PHC' : 'Lái xe'}</small></div>
      <button class="logout" id="logoutBtn">Đăng xuất</button>
    </header>
    <nav class="tabs">${tabsHtml}</nav>
    <main id="mainContent">${contentHtml}</main>
  `;
  el('#logoutBtn').addEventListener('click', () => { clearSession(); render(); });
}

/* ---------------- DRIVER VIEW ---------------- */
async function renderDriverApp() {
  const tabs = [
    ['daily', 'Hằng ngày'],
    ['periodic', 'Định kỳ'],
    ['history', 'Lịch sử'],
    ['account', 'Tài khoản'],
  ];
  const tabsHtml = tabs.map(([k, label]) =>
    `<button data-tab="${k}" class="${state.driverTab === k ? 'active' : ''}">${label}</button>`
  ).join('');
  layout(tabsHtml, '<div class="empty-state">Đang tải…</div>');

  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => { state.driverTab = btn.dataset.tab; renderDriverApp(); });
  });

  const main = el('#mainContent');
  try {
    if (state.driverTab === 'daily') await renderDriverDaily(main);
    else if (state.driverTab === 'periodic') await renderDriverPeriodic(main);
    else if (state.driverTab === 'history') await renderDriverHistory(main);
    else if (state.driverTab === 'account') renderAccountTab(main);
  } catch (err) {
    main.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

async function renderDriverDaily(main) {
  const [{ daily }, existing] = await Promise.all([
    api('/checklist/items'),
    api('/checklist/daily?date=' + todayISO()),
  ]);
  const existingMap = {};
  (existing.items || []).forEach(it => { existingMap[it.checklist_item_id] = it; });
  const existingDayType = existing.submission ? existing.submission.day_type : null;

  function statusPill() {
    if (!existing.submission) return '<span class="pill no">Chưa nộp</span>';
    if (existing.submission.day_type === 'no_car_use') return '<span class="pill warn">Không sử dụng xe</span>';
    return `<span class="pill yes">Đã nộp lúc ${esc(formatTime(existing.submission.submitted_at))}</span>`;
  }

  main.innerHTML = `
    <div class="card" style="background:#fdf1f4;border-color:#f0c6d2;">
      <div class="row-flex">
        <strong>Checklist ngày ${todayISO()}</strong>
        ${statusPill()}
      </div>
      <div class="meta" style="margin-top:4px;">${existing.submission ? 'Bạn có thể cập nhật lại nếu cần.' : 'Vui lòng xác nhận trước khi bắt đầu ca làm việc.'}</div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Hôm nay bạn có sử dụng xe không?</h3>
      <div class="status-group">
        <button type="button" class="status-btn" id="dtDriving" data-daytype="driving">🚗 Có chạy xe</button>
        <button type="button" class="status-btn" id="dtNoCarUse" data-daytype="no_car_use">🚫 Không sử dụng xe hôm nay</button>
      </div>
    </div>

    <div id="drivingSection" style="display:none;">
      <div id="itemsList"></div>
      <button class="primary" id="submitDaily">Nộp checklist hôm nay</button>
    </div>

    <div id="noCarSection" class="card" style="display:none;">
      <div class="desc">Xác nhận rằng hôm nay bạn không được điều động sử dụng xe công ty, không cần thực hiện checklist kiểm tra xe.</div>
      <textarea class="note-input show" id="noCarNote" placeholder="Ghi chú (không bắt buộc) — ví dụ: nghỉ phép, xe đang bảo dưỡng…"></textarea>
      <button class="primary" id="submitNoCarUse">Xác nhận hoàn thành - không sử dụng xe</button>
    </div>
  `;

  const dtDriving = el('#dtDriving');
  const dtNoCarUse = el('#dtNoCarUse');
  const drivingSection = el('#drivingSection');
  const noCarSection = el('#noCarSection');

  function setDayType(type) {
    dtDriving.classList.toggle('active', type === 'driving');
    dtDriving.dataset.status = type === 'driving' ? 'ok' : '';
    dtNoCarUse.classList.toggle('active', type === 'no_car_use');
    dtNoCarUse.dataset.status = type === 'no_car_use' ? 'issue' : '';
    drivingSection.style.display = type === 'driving' ? 'block' : 'none';
    noCarSection.style.display = type === 'no_car_use' ? 'block' : 'none';
  }
  dtDriving.addEventListener('click', () => setDayType('driving'));
  dtNoCarUse.addEventListener('click', () => setDayType('no_car_use'));
  // Default: nếu đã có dữ liệu hôm nay thì hiện đúng lựa chọn cũ; nếu chưa có gì thì mặc định "Có chạy xe"
  setDayType(existingDayType === 'no_car_use' ? 'no_car_use' : 'driving');
  if (existing.submission && existing.submission.day_type === 'no_car_use' && existing.submission.note) {
    el('#noCarNote').value = existing.submission.note;
  }

  const itemsList = el('#itemsList');
  daily.forEach(item => {
    const prev = existingMap[item.id];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <h3>${esc(item.name)} ${item.alphard_only ? '<span class="tag">Chỉ xe Alphard</span>' : ''}</h3>
      <div class="desc">${esc(item.description || '')}</div>
      <div class="status-group">
        <button type="button" class="status-btn" data-status="ok">✓ Bình thường</button>
        <button type="button" class="status-btn" data-status="issue">⚠ Có vấn đề</button>
        <button type="button" class="status-btn" data-status="na">– Không áp dụng</button>
      </div>
      <textarea class="note-input" placeholder="Ghi chú chi tiết (bắt buộc nếu có vấn đề)…"></textarea>
    `;
    const btns = card.querySelectorAll('.status-btn');
    const noteInput = card.querySelector('.note-input');
    function setStatus(status) {
      btns.forEach(b => b.classList.toggle('active', b.dataset.status === status));
      card.dataset.status = status;
      noteInput.classList.toggle('show', status === 'issue');
    }
    btns.forEach(b => b.addEventListener('click', () => setStatus(b.dataset.status)));
    setStatus(prev ? prev.status : 'ok');
    if (prev && prev.note) noteInput.value = prev.note;
    itemsList.appendChild(card);
  });

  el('#submitDaily').addEventListener('click', async () => {
    const cards = itemsList.querySelectorAll('.card');
    const items = [];
    let missingNote = false;
    cards.forEach(c => {
      const status = c.dataset.status || 'ok';
      const note = c.querySelector('.note-input').value.trim();
      if (status === 'issue' && !note) missingNote = true;
      items.push({ checklist_item_id: Number(c.dataset.itemId), status, note: note || null });
    });
    if (missingNote) { toast('Vui lòng ghi chú rõ vấn đề cho các mục "Có vấn đề"'); return; }
    await withBusy(el('#submitDaily'), 'Đang nộp…', async () => {
      try {
        await api('/checklist/daily', { method: 'POST', body: JSON.stringify({ work_date: todayISO(), day_type: 'driving', items }) });
        toast('Đã nộp checklist thành công');
        renderDriverApp();
      } catch (err) {
        toast(err.message);
      }
    });
  });

  el('#submitNoCarUse').addEventListener('click', async () => {
    const note = el('#noCarNote').value.trim();
    await withBusy(el('#submitNoCarUse'), 'Đang gửi…', async () => {
      try {
        await api('/checklist/daily', {
          method: 'POST',
          body: JSON.stringify({ work_date: todayISO(), day_type: 'no_car_use', note: note || null }),
        });
        toast('Đã xác nhận hoàn thành - không sử dụng xe');
        renderDriverApp();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

async function renderDriverPeriodic(main) {
  const { items } = await api('/checklist/periodic/status');
  main.innerHTML = '<div id="periodicList"></div>';
  const list = el('#periodicList');
  items.forEach(item => {
    const ago = daysAgo(item.last_done);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row-flex">
        <h3 style="margin:0;">${esc(item.name)}</h3>
        <span class="tag">${esc(item.frequency_label || '')}</span>
      </div>
      <div class="desc">${esc(item.description || '')}</div>
      <div class="meta">${item.last_done ? `Lần gần nhất: ${esc(item.last_done)} (${ago} ngày trước)` : 'Chưa có ghi nhận nào'}</div>
      <textarea class="note-input show" placeholder="Ghi chú (nơi thực hiện, tình trạng…) - không bắt buộc"></textarea>
      <button class="secondary" data-item="${esc(item.checklist_item_id)}">Đánh dấu đã thực hiện hôm nay</button>
    `;
    card.querySelector('button').addEventListener('click', async (e) => {
      const note = card.querySelector('.note-input').value.trim();
      await withBusy(e.currentTarget, 'Đang ghi nhận…', async () => {
        try {
          await api('/checklist/periodic', {
            method: 'POST',
            body: JSON.stringify({ checklist_item_id: item.checklist_item_id, done_date: todayISO(), note: note || null }),
          });
          toast('Đã ghi nhận');
          renderDriverPeriodic(main);
        } catch (err) { toast(err.message); }
      });
    });
    list.appendChild(card);
  });
}

async function renderDriverHistory(main) {
  const { submissions } = await api('/checklist/history');
  if (submissions.length === 0) {
    main.innerHTML = '<div class="empty-state">Chưa có lịch sử checklist nào</div>';
    return;
  }
  main.innerHTML = submissions.map(s => `
    <div class="card">
      <div class="row-flex">
        <strong>${esc(s.work_date)}</strong>
        <span class="meta">${s.day_type === 'no_car_use' ? '' : 'Nộp lúc '}${esc(formatTime(s.submitted_at))}</span>
      </div>
      ${s.day_type === 'no_car_use' ? '<div class="meta" style="margin-top:4px;"><span class="pill warn">Không sử dụng xe</span></div>' : ''}
    </div>
  `).join('');
}

function renderAccountTab(main) {
  main.innerHTML = `
    <div class="card">
      <h3>Thông tin tài khoản</h3>
      <div class="meta">Họ tên: ${esc(state.user.full_name)}</div>
      <div class="meta">Tên đăng nhập: ${esc(state.user.username)}</div>
      <div class="meta">Vai trò: ${state.user.role === 'admin' ? 'PHC / Quản trị' : 'Lái xe'}</div>
      ${state.user.vehicle_plate ? `<div class="meta">Biển số xe: ${esc(state.user.vehicle_plate)}</div>` : ''}
      ${state.user.vehicle_model ? `<div class="meta">Loại xe: ${esc(state.user.vehicle_model)}</div>` : ''}
      <button class="secondary" style="margin-top:12px;" id="changePwBtn">Đổi mật khẩu</button>
    </div>
  `;
  el('#changePwBtn').addEventListener('click', () => renderChangePassword(false));
}

/* ---------------- ADMIN VIEW ---------------- */
async function renderAdminApp() {
  const tabs = [
    ['overview', 'Tổng quan'],
    ['submissions', 'Chi tiết'],
    ['periodic', 'Định kỳ'],
    ['users', 'Tài khoản'],
    ['account', 'Của tôi'],
  ];
  const tabsHtml = tabs.map(([k, label]) =>
    `<button data-tab="${k}" class="${state.adminTab === k ? 'active' : ''}">${label}</button>`
  ).join('');
  layout(tabsHtml, '<div class="empty-state">Đang tải…</div>');

  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => { state.adminTab = btn.dataset.tab; renderAdminApp(); });
  });

  const main = el('#mainContent');
  try {
    if (state.adminTab === 'overview') await renderAdminOverview(main);
    else if (state.adminTab === 'submissions') await renderAdminSubmissions(main);
    else if (state.adminTab === 'periodic') await renderAdminPeriodic(main);
    else if (state.adminTab === 'users') await renderAdminUsers(main);
    else if (state.adminTab === 'account') renderAccountTab(main);
  } catch (err) {
    main.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

async function renderAdminOverview(main) {
  const date = todayISO();
  const { drivers } = await api('/admin/overview?date=' + date);
  const submittedCount = drivers.filter(d => d.submitted).length;
  main.innerHTML = `
    <div class="card">
      <div class="row-flex"><strong>Tổng quan ngày ${esc(date)}</strong><span class="meta">${submittedCount}/${drivers.length} đã nộp</span></div>
    </div>
    <div class="card">
      <table class="report-table">
        <thead><tr><th>Lái xe</th><th>Xe</th><th>Giờ hoàn thành</th><th>Vấn đề</th></tr></thead>
        <tbody>
          ${drivers.map(d => `
            <tr>
              <td>${esc(d.full_name)}</td>
              <td>${esc(d.vehicle_plate || d.vehicle_model || '-')}</td>
              <td>${
                !d.submitted ? '<span class="pill no">Chưa nộp</span>'
                : d.day_type === 'no_car_use' ? '<span class="pill warn">Không sử dụng xe</span>'
                : `<span class="pill yes">${esc(formatTime(d.submitted_at))}</span>`
              }</td>
              <td>${d.issue_count > 0 ? `<span class="badge-count">${esc(d.issue_count)}</span>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAdminSubmissions(main) {
  const { users } = await api('/admin/users');
  const drivers = users.filter(u => u.role === 'driver');
  main.innerHTML = `
    <div class="filters">
      <select id="fUser"><option value="">Tất cả lái xe</option>${drivers.map(d => `<option value="${esc(d.id)}">${esc(d.full_name)}</option>`).join('')}</select>
      <input type="date" id="fFrom">
      <input type="date" id="fTo">
    </div>
    <div id="subList"></div>
  `;
  async function load() {
    const params = new URLSearchParams();
    if (el('#fUser').value) params.set('user_id', el('#fUser').value);
    if (el('#fFrom').value) params.set('from', el('#fFrom').value);
    if (el('#fTo').value) params.set('to', el('#fTo').value);
    const list = el('#subList');
    list.innerHTML = '<div class="empty-state"><span class="spinner"></span>Đang tải…</div>';
    const { submissions } = await api('/admin/submissions?' + params.toString());
    if (submissions.length === 0) { list.innerHTML = '<div class="empty-state">Không có dữ liệu</div>'; return; }
    list.innerHTML = submissions.map(s => {
      const issues = s.items.filter(i => i.status === 'issue');
      if (s.day_type === 'no_car_use') {
        return `
          <div class="card">
            <div class="row-flex">
              <strong>${esc(s.full_name)}</strong>
              <span class="meta">${esc(s.work_date)} · ${esc(formatTime(s.submitted_at))}</span>
            </div>
            <div class="meta">${esc(s.vehicle_plate || s.vehicle_model || '')}</div>
            <div class="meta" style="margin-top:6px;"><span class="pill warn">Không sử dụng xe</span> ${s.note ? '- ' + esc(s.note) : ''}</div>
          </div>
        `;
      }
      return `
        <div class="card">
          <div class="row-flex">
            <strong>${esc(s.full_name)}</strong>
            <span class="meta">${esc(s.work_date)} · ${esc(formatTime(s.submitted_at))}</span>
          </div>
          <div class="meta">${esc(s.vehicle_plate || s.vehicle_model || '')}</div>
          ${issues.length > 0 ? `
            <div style="margin-top:8px;">
              ${issues.map(i => `<div style="color:var(--issue);font-size:13px;margin-bottom:4px;">⚠ ${esc(i.name)}: ${esc(i.note || '(không có ghi chú)')}</div>`).join('')}
            </div>
          ` : '<div class="meta" style="color:var(--ok);margin-top:6px;">✓ Không có vấn đề</div>'}
        </div>
      `;
    }).join('');
  }
  el('#fUser').addEventListener('change', load);
  el('#fFrom').addEventListener('change', load);
  el('#fTo').addEventListener('change', load);
  await load();
}

async function renderAdminPeriodic(main) {
  const { result } = await api('/admin/periodic-status');
  if (result.length === 0) { main.innerHTML = '<div class="empty-state">Chưa có lái xe nào</div>'; return; }
  main.innerHTML = result.map(r => `
    <div class="card">
      <h3>${esc(r.driver.full_name)} ${r.driver.vehicle_plate ? `<span class="tag">${esc(r.driver.vehicle_plate)}</span>` : ''}</h3>
      <table class="report-table">
        <tbody>
          ${r.items.map(it => {
            const ago = daysAgo(it.last_done);
            return `<tr>
              <td>${esc(it.name)}<div class="meta">${esc(it.frequency_label || '')}</div></td>
              <td style="text-align:right;">${it.last_done ? `${esc(it.last_done)}<div class="meta">${ago} ngày trước</div>` : '<span class="pill warn">Chưa có</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

async function renderAdminUsers(main) {
  const { users } = await api('/admin/users');
  main.innerHTML = `
    <div class="card">
      <h3>Thêm tài khoản mới</h3>
      <form id="newUserForm">
        <input type="text" id="nu_username" placeholder="Tên đăng nhập" required>
        <input type="password" id="nu_password" placeholder="Mật khẩu tạm thời (tối thiểu 8 ký tự)" required>
        <input type="text" id="nu_fullname" placeholder="Họ và tên" required>
        <select id="nu_role">
          <option value="driver">Lái xe</option>
          <option value="admin">PHC / Quản trị</option>
        </select>
        <input type="text" id="nu_plate" placeholder="Biển số xe (không bắt buộc)">
        <input type="text" id="nu_model" placeholder="Loại xe, VD: Alphard (không bắt buộc)">
        <div class="error-msg" id="nuError"></div>
        <button type="submit" class="primary">Tạo tài khoản</button>
      </form>
    </div>
    <div id="usersList"></div>
  `;
  el('#nu_role').style.cssText = 'width:100%;padding:12px;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;font-size:15px;';
  ['nu_username', 'nu_password', 'nu_fullname', 'nu_plate', 'nu_model'].forEach(id => {
    el('#' + id).style.cssText = 'width:100%;padding:12px;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;font-size:15px;';
  });

  el('#newUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = el('#nuError');
    errBox.textContent = '';
    await withBusy(el('#newUserForm button[type="submit"]'), 'Đang tạo…', async () => {
      try {
        await api('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            username: el('#nu_username').value.trim(),
            password: el('#nu_password').value,
            full_name: el('#nu_fullname').value.trim(),
            role: el('#nu_role').value,
            vehicle_plate: el('#nu_plate').value.trim(),
            vehicle_model: el('#nu_model').value.trim(),
          }),
        });
        toast('Đã tạo tài khoản');
        renderAdminUsers(main);
      } catch (err) {
        errBox.textContent = err.message;
      }
    });
  });

  const list = el('#usersList');
  list.innerHTML = users.map(u => `
    <div class="card">
      <div class="row-flex">
        <div>
          <strong>${esc(u.full_name)}</strong>
          <div class="meta">@${esc(u.username)} · ${u.role === 'admin' ? 'PHC' : 'Lái xe'} ${u.vehicle_plate ? '· ' + esc(u.vehicle_plate) : ''}</div>
        </div>
        <span class="pill ${u.active ? 'yes' : 'no'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span>
      </div>
      <div class="status-group" style="margin-top:10px;">
        <button type="button" class="small" data-action="toggle" data-id="${esc(u.id)}" data-active="${u.active}">${u.active ? 'Khóa tài khoản' : 'Mở khóa'}</button>
        <button type="button" class="small" data-action="reset" data-id="${esc(u.id)}">Đặt lại mật khẩu</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const active = btn.dataset.active === '1' || btn.dataset.active === 'true';
      await withBusy(btn, 'Đang cập nhật…', async () => {
        try {
          await api('/admin/users/' + btn.dataset.id, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
          toast('Đã cập nhật');
          renderAdminUsers(main);
        } catch (err) { toast(err.message); }
      });
    });
  });
  list.querySelectorAll('[data-action="reset"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newPass = prompt('Nhập mật khẩu tạm thời mới (tối thiểu 8 ký tự):');
      if (!newPass) return;
      await withBusy(btn, 'Đang đặt lại…', async () => {
        try {
          await api('/admin/users/' + btn.dataset.id, { method: 'PATCH', body: JSON.stringify({ reset_password: newPass }) });
          toast('Đã đặt lại mật khẩu. Người dùng sẽ phải đổi mật khẩu khi đăng nhập lần tới.');
        } catch (err) { toast(err.message); }
      });
    });
  });
}

/* ---------------- ROOT RENDER ---------------- */
function render() {
  if (!state.token || !state.user) { renderLogin(); return; }
  if (state.user.must_change_password) { renderChangePassword(true); return; }
  if (state.user.role === 'admin') renderAdminApp();
  else renderDriverApp();
}

render();

/* Đăng ký service worker để app "cài" được lên màn hình chính (PWA).
   Chỉ chạy trên HTTPS hoặc localhost — trình duyệt không cho phép ở nơi khác.
   Nếu đăng ký lỗi thì bỏ qua: app vẫn chạy bình thường như web thường. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
