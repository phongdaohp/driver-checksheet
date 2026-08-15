/* Service worker cho PWA.
 *
 * Chiến lược: NETWORK-FIRST cho file tĩnh, KHÔNG BAO GIỜ cache /api/.
 *
 * Vì sao không dùng cache-first (dù nhanh hơn vài trăm ms):
 *  - app.js / styles.css không gắn số phiên bản trong tên file. Cache-first sẽ khiến
 *    lái xe kẹt ở bản cũ sau khi anh deploy, cho tới khi service worker tự đổi vòng —
 *    đây là cái bẫy kinh điển của PWA.
 *  - Dữ liệu checklist tuyệt đối không được cache: lái xe phải luôn thấy tình trạng
 *    thật của hôm nay, không phải bản chụp từ lần mở trước.
 *
 * Kết quả: có mạng thì luôn lấy bản mới nhất; mất mạng thì vẫn mở được giao diện
 * (từ cache) nhưng các lời gọi API sẽ báo lỗi — app CHƯA làm việc offline thật sự.
 * Muốn nộp checklist khi không có sóng thì cần thêm hàng đợi IndexedDB (chưa làm).
 */
const CACHE = 'rrc-checksheet-v1';
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Chỉ can thiệp GET cùng origin. Mọi thứ khác để trình duyệt tự lo.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API: luôn đi thẳng ra mạng, không đụng cache.
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Chỉ lưu lại phản hồi thành công
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('/index.html'))
      )
  );
});
