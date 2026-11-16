import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { readDatabase, updateDatabase } from './server/store';
import {
  calculateShiftHours,
  DEFAULT_HOURLY_RATE,
  findEmployeeByNameOrCode,
  normalizeFormDate,
  normalizeFormTime,
} from './src/utils/payroll';
import type { AdjustmentRecord, AttendanceRecord, AttendanceStatus, Employee } from './src/types';

const app = express();
app.use(express.json({ limit: '2mb' }));

function parseAttendanceStatus(raw: unknown): AttendanceStatus {
  if (raw === 'late' || raw === 'absent' || raw === 'present') return raw;
  return 'present';
}

function generateNextEmployeeCode(employees: Employee[]): string {
  let maxNum = employees.length;
  for (const emp of employees) {
    const match = /^EMP(\d+)$/i.exec(emp.code);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `EMP${String(maxNum + 1).padStart(3, '0')}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'changmi-payroll' });
});

app.get('/api/state', async (_req, res) => {
  try {
    const db = await readDatabase();
    res.json(db);
  } catch (error) {
    console.error('GET /api/state error:', error);
    res.status(500).json({ error: 'Không thể đọc dữ liệu hệ thống' });
  }
});

// Employees CRUD
app.post('/api/employees', async (req, res) => {
  try {
    const { code, name, phone, department, hourlyRate } = req.body ?? {};
    const cleanName = String(name ?? '').trim();
    const cleanDept = String(department ?? 'Phục vụ').trim() || 'Phục vụ';
    const rate = Number(hourlyRate) || DEFAULT_HOURLY_RATE;

    if (!cleanName) {
      res.status(400).json({ error: 'Vui lòng nhập Họ tên nhân viên.' });
      return;
    }
    if (rate < 0) {
      res.status(400).json({ error: 'Mức lương theo giờ không hợp lệ.' });
      return;
    }

    const outcome = await updateDatabase((db) => {
      const cleanCode = String(code ?? '').trim().toUpperCase() || generateNextEmployeeCode(db.employees);
      if (db.employees.some((e) => e.code.toUpperCase() === cleanCode)) {
        return { conflict: true as const, message: `Mã nhân viên ${cleanCode} đã tồn tại.` };
      }
      if (db.employees.some((e) => e.name.trim().toLowerCase() === cleanName.toLowerCase())) {
        return { conflict: true as const, message: `Nhân viên "${cleanName}" đã có trong danh sách.` };
      }
      const newEmp: Employee = {
        id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: cleanCode,
        name: cleanName,
        phone: String(phone ?? '').trim(),
        department: cleanDept,
        hourlyRate: Math.round(rate),
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      db.employees.push(newEmp);
      return { conflict: false as const, employee: newEmp };
    });

    if (outcome.result.conflict) {
      res.status(409).json({ error: outcome.result.message });
      return;
    }

    res.status(201).json({ employee: outcome.result.employee, state: outcome.db });
  } catch (error) {
    console.error('POST /api/employees error:', error);
    res.status(500).json({ error: 'Lỗi khi thêm nhân viên mới' });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, phone, department, hourlyRate, status } = req.body ?? {};

    const outcome = await updateDatabase((db) => {
      const idx = db.employees.findIndex((e) => e.id === id);
      if (idx === -1) return { notFound: true as const };

      const existing = db.employees[idx];
      const nextCode = code !== undefined ? String(code).trim().toUpperCase() : existing.code;

      if (
        nextCode !== existing.code &&
        db.employees.some((e) => e.id !== id && e.code.toUpperCase() === nextCode)
      ) {
        return { notFound: false as const, conflict: true as const };
      }

      const updated: Employee = {
        ...existing,
        code: nextCode || existing.code,
        name: name !== undefined ? String(name).trim() || existing.name : existing.name,
        phone: phone !== undefined ? String(phone).trim() : existing.phone,
        department: department !== undefined ? String(department).trim() || existing.department : existing.department,
        hourlyRate: hourlyRate !== undefined ? Math.max(0, Math.round(Number(hourlyRate))) : existing.hourlyRate,
        status: status === 'inactive' || status === 'active' ? status : existing.status,
      };
      db.employees[idx] = updated;

      for (const att of db.attendance) {
        if (att.employeeId === id) att.employeeCode = updated.code;
      }
      for (const adj of db.adjustments) {
        if (adj.employeeId === id) adj.employeeCode = updated.code;
      }

      return { notFound: false as const, conflict: false as const, employee: updated };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy nhân viên.' });
      return;
    }
    if (outcome.result.conflict) {
      res.status(409).json({ error: 'Mã nhân viên bị trùng với nhân viên khác.' });
      return;
    }

    res.json({ employee: outcome.result.employee, state: outcome.db });
  } catch (error) {
    console.error('PUT /api/employees/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật nhân viên' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const hardDelete = req.query.hard === 'true';

    const outcome = await updateDatabase((db) => {
      const idx = db.employees.findIndex((e) => e.id === id);
      if (idx === -1) return { notFound: true as const };

      if (hardDelete) {
        db.employees.splice(idx, 1);
        db.attendance = db.attendance.filter((a) => a.employeeId !== id);
        db.adjustments = db.adjustments.filter((a) => a.employeeId !== id);
      } else {
        db.employees[idx] = { ...db.employees[idx], status: 'inactive' };
      }
      return { notFound: false as const };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy nhân viên.' });
      return;
    }

    res.json({ ok: true, state: outcome.db });
  } catch (error) {
    console.error('DELETE /api/employees/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa/ẩn nhân viên' });
  }
});

// Attendance CRUD
app.post('/api/attendance', async (req, res) => {
  try {
    const { employeeId, date, checkIn, checkOut, status, note, source } = req.body ?? {};
    const attStatus = parseAttendanceStatus(status);
    if (!employeeId || !date || (attStatus !== 'absent' && !checkIn)) {
      res.status(400).json({ error: 'Vui lòng chọn Nhân viên, Ngày làm và Giờ vào ca.' });
      return;
    }

    const cleanDate = normalizeFormDate(String(date));
    const cleanIn = attStatus === 'absent' ? '00:00' : normalizeFormTime(String(checkIn));
    const cleanOut = attStatus === 'absent' ? null : checkOut ? normalizeFormTime(String(checkOut)) : null;

    const outcome = await updateDatabase((db) => {
      const emp = db.employees.find((e) => e.id === employeeId);
      if (!emp) return { notFound: true as const };

      const record: AttendanceRecord = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId: emp.id,
        employeeCode: emp.code,
        date: cleanDate,
        checkIn: cleanIn,
        checkOut: cleanOut,
        hours: calculateShiftHours(cleanIn, cleanOut, attStatus),
        status: attStatus,
        source: source === 'google_form' || source === 'webhook' ? source : 'manual',
        note: String(note ?? '').trim(),
        editedByAdmin: source !== 'google_form' && source !== 'webhook',
        updatedAt: new Date().toISOString(),
      };
      db.attendance.push(record);
      return { notFound: false as const, record };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Nhân viên không tồn tại.' });
      return;
    }

    res.status(201).json({ record: outcome.result.record, state: outcome.db });
  } catch (error) {
    console.error('POST /api/attendance error:', error);
    res.status(500).json({ error: 'Lỗi khi thêm bản ghi chấm công' });
  }
});

app.put('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, date, checkIn, checkOut, status, note } = req.body ?? {};

    const outcome = await updateDatabase((db) => {
      const idx = db.attendance.findIndex((a) => a.id === id);
      if (idx === -1) return { notFound: true as const };

      const existing = db.attendance[idx];
      let nextEmpId = existing.employeeId;
      let nextEmpCode = existing.employeeCode;

      if (employeeId && employeeId !== existing.employeeId) {
        const emp = db.employees.find((e) => e.id === employeeId);
        if (emp) {
          nextEmpId = emp.id;
          nextEmpCode = emp.code;
        }
      }

      const nextStatus = status !== undefined ? parseAttendanceStatus(status) : existing.status ?? 'present';
      const nextDate = date ? normalizeFormDate(String(date)) : existing.date;
      const nextIn =
        nextStatus === 'absent'
          ? '00:00'
          : checkIn
          ? normalizeFormTime(String(checkIn))
          : existing.checkIn;
      const nextOut =
        nextStatus === 'absent'
          ? null
          : checkOut === null || checkOut === ''
          ? null
          : checkOut !== undefined
          ? normalizeFormTime(String(checkOut))
          : existing.checkOut;

      const updated: AttendanceRecord = {
        ...existing,
        employeeId: nextEmpId,
        employeeCode: nextEmpCode,
        date: nextDate,
        checkIn: nextIn,
        checkOut: nextOut,
        hours: calculateShiftHours(nextIn, nextOut, nextStatus),
        status: nextStatus,
        note: note !== undefined ? String(note).trim() : existing.note,
        editedByAdmin: true,
        updatedAt: new Date().toISOString(),
      };
      db.attendance[idx] = updated;
      return { notFound: false as const, record: updated };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy bản ghi chấm công.' });
      return;
    }

    res.json({ record: outcome.result.record, state: outcome.db });
  } catch (error) {
    console.error('PUT /api/attendance/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật chấm công' });
  }
});

app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const outcome = await updateDatabase((db) => {
      const idx = db.attendance.findIndex((a) => a.id === id);
      if (idx === -1) return { notFound: true as const };
      db.attendance.splice(idx, 1);
      return { notFound: false as const };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy bản ghi chấm công.' });
      return;
    }

    res.json({ ok: true, state: outcome.db });
  } catch (error) {
    console.error('DELETE /api/attendance/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa chấm công' });
  }
});

// Bulk import parsed Google Form responses (supports employeeName or employeeCode)
app.post('/api/attendance/bulk-import', async (req, res) => {
  try {
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: 'Danh sách dữ liệu đồng bộ không hợp lệ.' });
      return;
    }

    const outcome = await updateDatabase((db) => {
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const entry of entries) {
        const emp = findEmployeeByNameOrCode(db.employees, {
          employeeId: entry.employeeId,
          employeeName: entry.employeeName,
          employeeCode: entry.employeeCode,
        });
        if (!emp) {
          skippedCount += 1;
          continue;
        }

        const externalId = entry.externalResponseId ? String(entry.externalResponseId) : undefined;
        if (externalId && db.attendance.some((a) => a.externalResponseId === externalId)) {
          skippedCount += 1;
          continue;
        }

        const cleanDate = normalizeFormDate(String(entry.date ?? ''));
        const cleanTime = normalizeFormTime(String(entry.time ?? '08:00'));
        const isCheckout = String(entry.action ?? '').toLowerCase() === 'checkout';

        if (isCheckout) {
          const openShift = [...db.attendance]
            .reverse()
            .find((a) => a.employeeId === emp.id && a.date === cleanDate && !a.checkOut && a.status !== 'absent');
          if (openShift) {
            openShift.checkOut = cleanTime;
            openShift.hours = calculateShiftHours(openShift.checkIn, cleanTime, openShift.status);
            openShift.updatedAt = new Date().toISOString();
            if (entry.note) {
              openShift.note = openShift.note ? `${openShift.note} · ${entry.note}` : String(entry.note);
            }
            updatedCount += 1;
            continue;
          }
        }

        const record: AttendanceRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          employeeId: emp.id,
          employeeCode: emp.code,
          date: cleanDate,
          checkIn: isCheckout ? '08:00' : cleanTime,
          checkOut: isCheckout ? cleanTime : null,
          hours: isCheckout ? calculateShiftHours('08:00', cleanTime, 'present') : 0,
          status: 'present',
          source: 'google_form',
          note: isCheckout
            ? `Check-out Form (thiếu check-in): ${entry.note ?? ''}`.trim()
            : String(entry.note ?? 'Check-in từ Google Form').trim(),
          editedByAdmin: false,
          externalResponseId: externalId,
          updatedAt: new Date().toISOString(),
        };
        db.attendance.push(record);
        importedCount += 1;
      }

      db.workspace.lastSyncedAt = new Date().toISOString();
      return { importedCount, updatedCount, skippedCount };
    });

    res.json({ ...outcome.result, state: outcome.db });
  } catch (error) {
    console.error('POST /api/attendance/bulk-import error:', error);
    res.status(500).json({ error: 'Lỗi khi đồng bộ dữ liệu Google Form' });
  }
});

// Webhook endpoint for Google Apps Script (supports employeeName dropdown OR employeeId OR employeeCode)
app.post('/api/webhook/google-form', async (req, res) => {
  try {
    const { secret, employeeId, employeeName, employeeCode, action, date, time, status, note, source } =
      req.body ?? {};
    const dbSnapshot = await readDatabase();

    if (dbSnapshot.workspace.webhookSecret && secret !== dbSnapshot.workspace.webhookSecret) {
      res.status(401).json({ error: 'Webhook secret không khớp.' });
      return;
    }

    if (!employeeId && !employeeName && !employeeCode) {
      res.status(400).json({ error: 'Vui lòng chọn tên nhân viên gửi chấm công.' });
      return;
    }

    const cleanDate = normalizeFormDate(String(date ?? new Date().toISOString().slice(0, 10)));
    const cleanTime = normalizeFormTime(
      String(
        time ??
          `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
      )
    );
    const isCheckOut = String(action ?? '').toLowerCase() === 'checkout';
    const attStatus = parseAttendanceStatus(status);

    const outcome = await updateDatabase((db) => {
      const emp = findEmployeeByNameOrCode(db.employees, {
        employeeId: employeeId ? String(employeeId) : undefined,
        employeeName: employeeName ? String(employeeName) : undefined,
        employeeCode: employeeCode ? String(employeeCode) : undefined,
      });
      if (!emp) return { notFound: true as const };

      if (isCheckOut) {
        const openShift = [...db.attendance]
          .reverse()
          .find((a) => a.employeeId === emp.id && a.date === cleanDate && !a.checkOut && a.status !== 'absent');
        if (openShift) {
          openShift.checkOut = cleanTime;
          openShift.hours = calculateShiftHours(openShift.checkIn, cleanTime, openShift.status);
          openShift.updatedAt = new Date().toISOString();
          if (note) {
            openShift.note = openShift.note ? `${openShift.note} · ${note}` : String(note);
          }
          db.workspace.lastSyncedAt = new Date().toISOString();
          return { notFound: false as const, mode: 'checkout-updated' as const, record: openShift };
        }
      }

      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId: emp.id,
        employeeCode: emp.code,
        date: cleanDate,
        checkIn: isCheckOut ? '08:00' : cleanTime,
        checkOut: isCheckOut ? cleanTime : null,
        hours: isCheckOut ? calculateShiftHours('08:00', cleanTime, attStatus) : 0,
        status: attStatus,
        source: source === 'google_form' ? 'google_form' : 'webhook',
        note: String(note ?? (isCheckOut ? 'Check-out qua Webhook' : 'Check-in qua Webhook')).trim(),
        editedByAdmin: false,
        updatedAt: new Date().toISOString(),
      };
      db.attendance.push(newRecord);
      db.workspace.lastSyncedAt = new Date().toISOString();
      return { notFound: false as const, mode: 'created' as const, record: newRecord };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy nhân viên tương ứng trong danh sách quán.' });
      return;
    }

    res.status(201).json({ ...outcome.result, state: outcome.db });
  } catch (error) {
    console.error('POST /api/webhook/google-form error:', error);
    res.status(500).json({ error: 'Lỗi xử lý Webhook Google Form' });
  }
});

// Adjustments (Bonuses & Deductions) CRUD
app.post('/api/adjustments', async (req, res) => {
  try {
    const { employeeId, date, type, category, amount, reason } = req.body ?? {};
    const numAmount = Math.round(Number(amount));
    if (!employeeId || !date || (type !== 'bonus' && type !== 'deduction') || !numAmount || numAmount <= 0) {
      res.status(400).json({ error: 'Vui lòng chọn nhân viên, ngày, loại và nhập số tiền (> 0).' });
      return;
    }

    const outcome = await updateDatabase((db) => {
      const emp = db.employees.find((e) => e.id === employeeId);
      if (!emp) return { notFound: true as const };

      const record: AdjustmentRecord = {
        id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId: emp.id,
        employeeCode: emp.code,
        date: normalizeFormDate(String(date)),
        type,
        category: String(category ?? (type === 'bonus' ? 'Thưởng / Phụ cấp' : 'Trừ lương')).trim(),
        amount: numAmount,
        reason: String(reason ?? '').trim(),
        createdAt: new Date().toISOString(),
      };
      db.adjustments.push(record);
      return { notFound: false as const, record };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy nhân viên.' });
      return;
    }

    res.status(201).json({ record: outcome.result.record, state: outcome.db });
  } catch (error) {
    console.error('POST /api/adjustments error:', error);
    res.status(500).json({ error: 'Lỗi khi lưu khoản thưởng/trừ' });
  }
});

app.delete('/api/adjustments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const outcome = await updateDatabase((db) => {
      const idx = db.adjustments.findIndex((a) => a.id === id);
      if (idx === -1) return { notFound: true as const };
      db.adjustments.splice(idx, 1);
      return { notFound: false as const };
    });

    if (outcome.result.notFound) {
      res.status(404).json({ error: 'Không tìm thấy khoản thưởng/trừ.' });
      return;
    }

    res.json({ ok: true, state: outcome.db });
  } catch (error) {
    console.error('DELETE /api/adjustments/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa khoản thưởng/trừ' });
  }
});

// Workspace configuration
app.put('/api/workspace/config', async (req, res) => {
  try {
    const { formId, spreadsheetId, webhookSecret, lastSyncedAt } = req.body ?? {};
    const outcome = await updateDatabase((db) => {
      if (formId !== undefined) db.workspace.formId = String(formId).trim();
      if (spreadsheetId !== undefined) db.workspace.spreadsheetId = String(spreadsheetId).trim();
      if (webhookSecret !== undefined) db.workspace.webhookSecret = String(webhookSecret).trim();
      if (lastSyncedAt !== undefined) db.workspace.lastSyncedAt = lastSyncedAt;
      return db.workspace;
    });
    res.json({ workspace: outcome.result, state: outcome.db });
  } catch (error) {
    console.error('PUT /api/workspace/config error:', error);
    res.status(500).json({ error: 'Lỗi khi lưu cấu hình Google Workspace' });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Quán Mì Cay Changmi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
