import type { AdjustmentRecord, AttendanceRecord, Employee, EmployeePayrollSummary } from '../types';
import { normalizeFormDate, normalizeFormTime } from '../utils/payroll';

export interface GoogleFormMetadata {
  formId: string;
  info: {
    title: string;
    documentTitle?: string;
  };
  responderUri?: string;
  items?: Array<{
    itemId?: string;
    title?: string;
    questionItem?: {
      question?: {
        questionId?: string;
        choiceQuestion?: {
          type?: string;
          options?: Array<{ value: string }>;
        };
      };
    };
  }>;
}

export interface ParsedFormAttendanceEntry {
  externalResponseId: string;
  employeeName?: string;
  employeeCode?: string;
  action: 'checkin' | 'checkout';
  date: string;
  time: string;
  note: string;
  submittedAt: string;
}

export async function fetchGoogleFormInfo(formId: string, accessToken: string): Promise<GoogleFormMetadata> {
  const safeId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Không thể đọc thông tin Google Form.');
  }
  return data as GoogleFormMetadata;
}

export async function createAttendanceGoogleForm(
  accessToken: string,
  employeeNames: string[]
): Promise<GoogleFormMetadata> {
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: 'Điểm danh Nhân viên — Quán Mì Cay Changmi',
        documentTitle: 'Changmi - Form Điểm danh Hàng ngày',
      },
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    throw new Error(created?.error?.message || 'Không thể tạo Google Form mới.');
  }

  const options = (employeeNames.length > 0 ? employeeNames : ['Nhân viên mới (Cập nhật sau)']).map((name) => ({
    value: name,
  }));

  const safeId = encodeURIComponent(created.formId);
  const updateRes = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          updateFormInfo: {
            info: {
              description:
                'Nhân viên Quán Mì Cay Changmi vui lòng chọn tên của bạn từ danh sách thả xuống và chọn Check-in hoặc Check-out mỗi đầu/cuối ca làm.',
            },
            updateMask: 'description',
          },
        },
        {
          createItem: {
            item: {
              title: 'Chọn tên nhân viên',
              questionItem: {
                question: {
                  required: true,
                  choiceQuestion: {
                    type: 'DROP_DOWN',
                    options,
                  },
                },
              },
            },
            location: { index: 0 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Loại chấm công',
              questionItem: {
                question: {
                  required: true,
                  choiceQuestion: {
                    type: 'RADIO',
                    options: [
                      { value: 'Check-in (Vào ca)' },
                      { value: 'Check-out (Tan ca)' },
                    ],
                  },
                },
              },
            },
            location: { index: 1 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Ghi chú ca làm (nếu có)',
              questionItem: {
                question: {
                  required: false,
                  textQuestion: { paragraph: false },
                },
              },
            },
            location: { index: 2 },
          },
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(err?.error?.message || 'Đã tạo Form nhưng lỗi thêm câu hỏi.');
  }

  return fetchGoogleFormInfo(created.formId, accessToken);
}

/**
 * Updates the staff name dropdown choices on an existing linked Google Form.
 */
export async function updateGoogleFormEmployeeDropdown(
  formId: string,
  employeeNames: string[],
  accessToken: string
): Promise<void> {
  const form = await fetchGoogleFormInfo(formId, accessToken);
  const items = form.items ?? [];
  const targetIndex = items.findIndex((it) => {
    const t = (it.title ?? '').toLowerCase();
    return (
      Boolean(it.questionItem?.question?.choiceQuestion) &&
      (t.includes('tên') || t.includes('nhân viên') || t.includes('staff'))
    );
  });

  if (targetIndex === -1) {
    throw new Error('Không tìm thấy câu hỏi danh sách tên nhân viên (Dropdown) trong Google Form này.');
  }

  if (employeeNames.length === 0) {
    throw new Error('Chưa có nhân viên đang làm việc để đồng bộ lên Google Form.');
  }
  const targetItem = items[targetIndex];
  const options = employeeNames.map((name) => ({
    value: name,
  }));

  const safeId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          updateItem: {
            item: {
              itemId: targetItem.itemId,
              title: targetItem.title,
              questionItem: {
                question: {
                  required: true,
                  choiceQuestion: {
                    type: 'DROP_DOWN',
                    options,
                  },
                },
              },
            },
            location: { index: targetIndex },
            updateMask: 'questionItem.question.choiceQuestion.options',
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'Không thể cập nhật danh sách tên nhân viên lên Google Form.');
  }
}

export async function fetchAndParseFormResponses(
  formId: string,
  accessToken: string
): Promise<ParsedFormAttendanceEntry[]> {
  const form = await fetchGoogleFormInfo(formId, accessToken);
  const safeId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeId}/responses`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Không thể tải danh sách phản hồi từ Google Form.');
  }

  const questionTitleById = new Map<string, string>();
  for (const item of form.items ?? []) {
    const qid = item.questionItem?.question?.questionId;
    if (qid && item.title) {
      questionTitleById.set(qid, item.title.toLowerCase());
    }
  }

  const responses = Array.isArray(data.responses) ? data.responses : [];
  const entries: ParsedFormAttendanceEntry[] = [];

  for (const resp of responses) {
    const answers = resp.answers ?? {};
    let employeeName = '';
    let employeeCode = '';
    let actionRaw = 'checkin';
    let note = '';
    let explicitDate = '';
    let explicitTime = '';

    for (const [qid, ansObj] of Object.entries(answers) as Array<[string, any]>) {
      const title = questionTitleById.get(qid) ?? '';
      const val = String(ansObj?.textAnswers?.answers?.[0]?.value ?? '').trim();
      if (!val) continue;

      if (title.includes('tên') || title.includes('nhân viên') || title.includes('name')) {
        if (/^EMP\d+$/i.test(val)) {
          employeeCode = val.toUpperCase();
        } else {
          employeeName = val;
        }
      } else if (title.includes('mã') || title.includes('code') || title.includes('manv')) {
        employeeCode = val.toUpperCase();
      } else if (title.includes('loại') || title.includes('check') || title.includes('trạng thái')) {
        actionRaw = val.toLowerCase();
      } else if (title.includes('ngày') || title.includes('date')) {
        explicitDate = val;
      } else if (title.includes('giờ') || title.includes('time')) {
        explicitTime = val;
      } else if (title.includes('ghi chú') || title.includes('note')) {
        note = val;
      }
    }

    if (!employeeName && !employeeCode) continue;

    const submittedAt = String(resp.lastSubmittedTime || resp.createTime || new Date().toISOString());
    const submittedDateObj = new Date(submittedAt);
    const localDate = Number.isNaN(submittedDateObj.getTime())
      ? new Date().toISOString().slice(0, 10)
      : `${submittedDateObj.getFullYear()}-${String(submittedDateObj.getMonth() + 1).padStart(2, '0')}-${String(
          submittedDateObj.getDate()
        ).padStart(2, '0')}`;
    const localTime = Number.isNaN(submittedDateObj.getTime())
      ? '08:00'
      : `${String(submittedDateObj.getHours()).padStart(2, '0')}:${String(submittedDateObj.getMinutes()).padStart(
          2,
          '0'
        )}`;

    const isCheckOut = actionRaw.includes('out') || actionRaw.includes('tan');
    entries.push({
      externalResponseId: String(resp.responseId),
      employeeName: employeeName || undefined,
      employeeCode: employeeCode || undefined,
      action: isCheckOut ? 'checkout' : 'checkin',
      date: explicitDate ? normalizeFormDate(explicitDate) : localDate,
      time: explicitTime ? normalizeFormTime(explicitTime) : localTime,
      note: note || (isCheckOut ? 'Check-out từ Google Form' : 'Check-in từ Google Form'),
      submittedAt,
    });
  }

  return entries;
}

export async function createChangmiSpreadsheet(accessToken: string): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
}> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: 'Quán Mì Cay Changmi — Dữ liệu Chấm công & Tính lương',
        locale: 'vi_VN',
      },
      sheets: [
        { properties: { title: 'NhanVien' } },
        { properties: { title: 'ChamCong' } },
        { properties: { title: 'ThuongTru' } },
        { properties: { title: 'BangLuongThang' } },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Không thể tạo Google Sheet mới.');
  }
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
  };
}

export async function syncAllDataToGoogleSheet(
  spreadsheetId: string,
  payload: {
    employees: Employee[];
    attendance: AttendanceRecord[];
    adjustments: AdjustmentRecord[];
    payrollSummaries: EmployeePayrollSummary[];
    month: string;
  },
  accessToken: string
): Promise<{ updatedCells: number; spreadsheetUrl: string }> {
  const safeId = encodeURIComponent(spreadsheetId.trim());

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = await metaRes.json();
  if (!metaRes.ok) {
    throw new Error(meta?.error?.message || 'Không thể truy cập Google Sheet đã chọn.');
  }

  const existingTitles = new Set<string>(
    (meta.sheets ?? []).map((s: any) => String(s?.properties?.title ?? ''))
  );
  const requiredTabs = ['NhanVien', 'ChamCong', 'ThuongTru', 'BangLuongThang'];
  const missingTabs = requiredTabs.filter((t) => !existingTitles.has(t));

  if (missingTabs.length > 0) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    if (!addRes.ok) {
      const err = await addRes.json();
      throw new Error(err?.error?.message || 'Không thể tạo các tab còn thiếu trong Google Sheet.');
    }
  }

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ranges: ['NhanVien!A1:G1000', 'ChamCong!A1:I5000', 'ThuongTru!A1:G2000', 'BangLuongThang!A1:J1000'],
    }),
  });

  const empById = new Map(payload.employees.map((e) => [e.id, e]));

  const nhanVienRows = [
    ['MaNV', 'HoTen', 'SoDienThoai', 'ViTri', 'LuongTheoGio', 'TrangThai', 'NgayTao'],
    ...payload.employees.map((e) => [
      e.code,
      e.name,
      e.phone,
      e.department,
      e.hourlyRate,
      e.status,
      e.createdAt.slice(0, 10),
    ]),
  ];

  const chamCongRows = [
    ['ID', 'TenNhanVien', 'NgayLam', 'GioVao', 'GioRa', 'SoGioLam', 'TrangThai', 'Nguon', 'GhiChu'],
    ...payload.attendance.map((a) => [
      a.id,
      empById.get(a.employeeId)?.name ?? a.employeeCode,
      a.date,
      a.checkIn,
      a.checkOut ?? '',
      a.hours,
      a.status,
      a.source,
      a.note,
    ]),
  ];

  const thuongTruRows = [
    ['ID', 'TenNhanVien', 'Ngay', 'Loai', 'HangMuc', 'SoTien', 'LyDo'],
    ...payload.adjustments.map((adj) => [
      adj.id,
      empById.get(adj.employeeId)?.name ?? adj.employeeCode,
      adj.date,
      adj.type,
      adj.category,
      adj.amount,
      adj.reason,
    ]),
  ];

  const bangLuongRows = [
    [
      'Thang',
      'HoTen',
      'ViTri',
      'TongGioLam',
      'LuongGio',
      'LuongCoBan',
      'TongThuong',
      'TongTru',
      'LuongThucNhan',
    ],
    ...payload.payrollSummaries.map((p) => [
      payload.month,
      p.employee.name,
      p.employee.department,
      p.totalHours,
      p.employee.hourlyRate,
      p.basePay,
      p.totalBonus,
      p.totalDeduction,
      p.netPay,
    ]),
  ];

  const writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'NhanVien!A1', values: nhanVienRows },
        { range: 'ChamCong!A1', values: chamCongRows },
        { range: 'ThuongTru!A1', values: thuongTruRows },
        { range: 'BangLuongThang!A1', values: bangLuongRows },
      ],
    }),
  });
  const writeData = await writeRes.json();
  if (!writeRes.ok) {
    throw new Error(writeData?.error?.message || 'Lỗi khi ghi dữ liệu lên Google Sheets.');
  }

  return {
    updatedCells: Number(writeData.totalUpdatedCells ?? 0),
    spreadsheetUrl: meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${safeId}`,
  };
}
