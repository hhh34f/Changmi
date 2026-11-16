export interface SheetSchemaSpec {
  tabName: string;
  description: string;
  columns: { name: string; type: string; example: string; note: string }[];
}

export const GOOGLE_SHEETS_SCHEMA: SheetSchemaSpec[] = [
  {
    tabName: 'NhanVien',
    description: 'Danh sách hồ sơ nhân viên (cả Hiền & Linh làm Phục vụ) và mức lương theo giờ tại Quán Mì Cay Changmi',
    columns: [
      { name: 'MaNV', type: 'Text', example: 'EMP001', note: 'Mã hệ thống tự cấp (nhân viên không cần gõ)' },
      { name: 'HoTen', type: 'Text', example: 'Hiền', note: 'Họ tên hiển thị trong Dropdown (Hiền, Linh...)' },
      { name: 'SoDienThoai', type: 'Text', example: '0901234567', note: 'Số điện thoại liên hệ' },
      { name: 'ViTri', type: 'Text', example: 'Phục vụ', note: 'Phục vụ / Bếp / Thu ngân / Pha chế' },
      { name: 'LuongTheoGio', type: 'Number', example: '20000', note: 'Mặc định 20.000 VNĐ/giờ' },
      { name: 'TrangThai', type: 'Text', example: 'active', note: 'active (Đang làm) hoặc inactive (Đã nghỉ)' },
      { name: 'NgayTao', type: 'Date', example: '2026-11-01', note: 'Ngày bắt đầu làm việc' },
    ],
  },
  {
    tabName: 'ChamCong',
    description: 'Nhật ký check-in / check-out chọn theo Tên nhân viên từ Google Form Dropdown hoặc Admin chỉnh sửa',
    columns: [
      { name: 'ID', type: 'Text', example: 'CC-20261114-01', note: 'Mã bản ghi chấm công' },
      { name: 'TenNhanVien', type: 'Text', example: 'Hiền', note: 'Chọn từ Dropdown (Hiền, Linh...)' },
      { name: 'NgayLam', type: 'Date', example: '2026-11-14', note: 'Định dạng YYYY-MM-DD' },
      { name: 'GioVao', type: 'Time', example: '08:00', note: 'Giờ Check-in (HH:mm)' },
      { name: 'GioRa', type: 'Time', example: '16:30', note: 'Giờ Check-out (HH:mm), trống nếu chưa ra ca' },
      { name: 'SoGioLam', type: 'Formula/Number', example: '8.5', note: 'Tự động tính = (GioRa - GioVao)' },
      { name: 'TrangThai', type: 'Text', example: 'present', note: 'present (Có mặt) / late (Đi trễ) / absent (Vắng)' },
      { name: 'Nguon', type: 'Text', example: 'google_form', note: 'google_form / manual / webhook' },
      { name: 'GhiChu', type: 'Text', example: 'Ca sáng phục vụ', note: 'Lý do sửa giờ hoặc ghi chú ca làm' },
    ],
  },
  {
    tabName: 'ThuongTru',
    description: 'Biến động lương thưởng, phụ cấp, tiền tip và các khoản khấu trừ trong tháng',
    columns: [
      { name: 'ID', type: 'Text', example: 'TT-001', note: 'Mã biến động' },
      { name: 'TenNhanVien', type: 'Text', example: 'Linh', note: 'Chọn tên nhân viên từ Dropdown' },
      { name: 'Ngay', type: 'Date', example: '2026-11-14', note: 'Ngày phát sinh (YYYY-MM-DD)' },
      { name: 'Loai', type: 'Text', example: 'bonus', note: 'bonus (Thưởng/Phụ cấp) hoặc deduction (Trừ lương)' },
      { name: 'HangMuc', type: 'Text', example: 'Tiền tip & Phụ cấp', note: 'Phân loại khoản thưởng/trừ' },
      { name: 'SoTien', type: 'Number', example: '100000', note: 'Số tiền VNĐ (số dương)' },
      { name: 'LyDo', type: 'Text', example: 'Phụ quán ngày đông khách', note: 'Ghi chú chi tiết' },
    ],
  },
  {
    tabName: 'BangLuongThang',
    description: 'Tổng hợp bảng lương thực nhận hàng tháng theo công thức tự động',
    columns: [
      { name: 'Thang', type: 'Text', example: '2026-11', note: 'Kỳ lương YYYY-MM' },
      { name: 'HoTen', type: 'Text', example: 'Hiền', note: 'Tên nhân viên' },
      { name: 'ViTri', type: 'Text', example: 'Phục vụ', note: 'Vị trí làm việc' },
      { name: 'TongGioLam', type: 'Number', example: '156.5', note: 'Tổng số giờ làm hợp lệ trong tháng' },
      { name: 'LuongGio', type: 'Number', example: '20000', note: 'Đơn giá VNĐ/giờ' },
      { name: 'LuongCoBan', type: 'Number', example: '3130000', note: '= TongGioLam * LuongGio' },
      { name: 'TongThuong', type: 'Number', example: '200000', note: 'Tổng Thưởng & Phụ cấp' },
      { name: 'TongTru', type: 'Number', example: '50000', note: 'Tổng khoản trừ lương' },
      { name: 'LuongThucNhan', type: 'Number', example: '3280000', note: '= LuongCoBan + TongThuong - TongTru' },
    ],
  },
];

export function buildAppsScriptCode(webhookUrl: string, webhookSecret: string): string {
  return `/**
 * GOOGLE APPS SCRIPT - QUÁN MÌ CAY CHANGMI
 * Tự động nhận phản hồi từ Google Form (chọn Tên nhân viên dạng Dropdown)
 * -> Ghi vào tab ChamCong & Gửi Webhook về Web Dashboard.
 *
 * CẤU HÌNH CÂU HỎI TRONG GOOGLE FORM:
 * 1. Chọn tên nhân viên (Dropdown: Hiền, Linh, ...)
 * 2. Loại chấm công (Trắc nghiệm: "Check-in (Vào ca)" hoặc "Check-out (Tan ca)")
 * 3. Ghi chú ca làm (Văn bản ngắn - tùy chọn)
 */

const WEB_APP_WEBHOOK_URL = '${webhookUrl}';
const WEBHOOK_SECRET = '${webhookSecret}';

function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ChamCong');
  const namedValues = e.namedValues || {};
  const timestamp = new Date();

  const employeeName = extractField(namedValues, ['Chọn tên nhân viên', 'Tên nhân viên', 'Họ tên', 'HoTen']) || '';
  const actionRaw = extractField(namedValues, ['Loại chấm công', 'Trạng thái', 'Check-in / Check-out']) || 'Check-in';
  const note = extractField(namedValues, ['Ghi chú', 'Ghi chú ca làm']) || '';

  const dateStr = Utilities.formatDate(timestamp, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(timestamp, 'Asia/Ho_Chi_Minh', 'HH:mm');
  const isCheckOut = actionRaw.toLowerCase().includes('out') || actionRaw.toLowerCase().includes('tan');

  // 1. Ghi hoặc cập nhật vào tab ChamCong trong Google Sheet
  if (sheet && employeeName) {
    updateGoogleSheetAttendance(sheet, employeeName.trim(), dateStr, timeStr, isCheckOut, note);
  }

  // 2. Đồng bộ trực tiếp về Web Dashboard Quán Mì Cay Changmi theo Tên nhân viên
  const payload = {
    secret: WEBHOOK_SECRET,
    employeeName: employeeName.trim(),
    action: isCheckOut ? 'checkout' : 'checkin',
    date: dateStr,
    time: timeStr,
    status: 'present',
    note: note || (isCheckOut ? 'Check-out qua Google Form' : 'Check-in qua Google Form'),
    source: 'google_form'
  };

  UrlFetchApp.fetch(WEB_APP_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function updateGoogleSheetAttendance(sheet, empName, dateStr, timeStr, isCheckOut, note) {
  const data = sheet.getDataRange().getValues();
  if (!isCheckOut) {
    const id = 'CC-' + Date.now();
    sheet.appendRow([id, empName, dateStr, timeStr, '', 0, 'present', 'google_form', note]);
    return;
  }

  // Tìm ca chưa check-out gần nhất trong ngày của nhân viên để điền GioRa
  for (let i = data.length - 1; i >= 1; i--) {
    const rowName = String(data[i][1]).trim().toLowerCase();
    const rowDate = String(data[i][2]).slice(0, 10);
    const rowCheckIn = String(data[i][3]);
    const rowCheckOut = String(data[i][4]);

    if (rowName === empName.toLowerCase() && rowDate === dateStr && !rowCheckOut) {
      const hours = computeHours(rowCheckIn, timeStr);
      sheet.getRange(i + 1, 5).setValue(timeStr);
      sheet.getRange(i + 1, 6).setValue(hours);
      if (note) sheet.getRange(i + 1, 9).setValue(note);
      return;
    }
  }

  sheet.appendRow(['CC-' + Date.now(), empName, dateStr, '', timeStr, 0, 'present', 'google_form', 'Thiếu check-in: ' + note]);
}

function computeHours(inStr, outStr) {
  const [h1, m1] = inStr.split(':').map(Number);
  const [h2, m2] = outStr.split(':').map(Number);
  if (isNaN(h1) || isNaN(h2)) return 0;
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function extractField(namedValues, candidates) {
  for (const key of Object.keys(namedValues)) {
    const normalized = key.toLowerCase();
    for (const candidate of candidates) {
      if (normalized.includes(candidate.toLowerCase())) {
        return namedValues[key][0] || '';
      }
    }
  }
  return '';
}

/**
 * Hàm chạy thử nghiệm (Test) trong Apps Script Editor để kiểm tra kết nối Webhook
 */
function testSendWebhook() {
  const testPayload = {
    secret: WEBHOOK_SECRET,
    employeeName: 'Hiền',
    action: 'checkin',
    date: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
    time: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm'),
    status: 'present',
    note: 'Kiểm tra kết nối Apps Script thành công',
    source: 'google_form'
  };

  const res = UrlFetchApp.fetch(WEB_APP_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
`;
}
