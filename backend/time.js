/* Xử lý múi giờ Việt Nam (GMT+7) cho toàn bộ ứng dụng.
 *
 * Vì sao cần: Postgres lưu thời điểm dạng timestamptz (một mốc tuyệt đối, không kèm
 * múi giờ hiển thị). Nếu quy đổi bằng toISOString() thì ra giờ UTC — chậm hơn giờ VN
 * 7 tiếng. Hậu quả không chỉ là hiển thị sai giờ:
 *
 *   Lái xe nộp checklist lúc 06:00 sáng 15/08 (giờ VN)
 *   -> toISOString() ra "2026-08-14T23:00:00Z"
 *   -> work_date bị ghi thành 14/08, tức NGÀY HÔM TRƯỚC.
 *
 * Nghĩa là mọi lần nộp trước 07:00 giờ VN đều bị xếp nhầm sang hôm trước — đúng
 * khung giờ lái xe kiểm tra xe trước ca sáng. PHC sẽ thấy "chưa nộp", và tệ hơn:
 * bảng daily_submissions có ràng buộc UNIQUE(user_id, work_date) nên bản ghi mới
 * sẽ GHI ĐÈ lên checklist của hôm trước.
 *
 * Việt Nam không áp dụng giờ mùa hè nên chênh lệch luôn cố định +7, nhưng vẫn dùng
 * tên vùng IANA thay vì cộng cứng 7 tiếng — rõ ý hơn và không sợ sai khi đổi vùng.
 */
const TZ = 'Asia/Ho_Chi_Minh';

// hourCycle 'h23' thay cho hour12:false — vài phiên bản Node trả về giờ "24" thay vì
// "00" lúc nửa đêm nếu dùng hour12:false.
const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function parts(d) {
  const o = {};
  for (const { type, value } of FMT.formatToParts(d)) o[type] = value;
  return o;
}

/** Mốc thời gian -> "YYYY-MM-DD HH:MM:SS" theo giờ Việt Nam.
 *  Giữ đúng định dạng mà public/app.js đang phụ thuộc (formatTime tách theo dấu cách). */
function toVnDateTime(v) {
  const p = parts(new Date(v));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Hôm nay theo giờ Việt Nam, dạng "YYYY-MM-DD". */
function todayVn() {
  const p = parts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

module.exports = { TZ, toVnDateTime, todayVn };
