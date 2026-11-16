import type {
  AdjustmentRecord,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  EmployeePayrollSummary,
  MonthlyOverviewStats,
} from '../types';

export const DEFAULT_HOURLY_RATE = 20000;

/**
 * Parses HH:mm string into minutes from 00:00. Returns null if invalid.
 */
export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Calculates shift duration in decimal hours, rounded to 2 decimal places.
 * Returns 0 if status is 'absent' or checkOut is missing/invalid.
 * Supports overnight shifts (e.g. 18:00 -> 01:00 = 7 hours).
 */
export function calculateShiftHours(
  checkIn: string,
  checkOut: string | null | undefined,
  status: AttendanceStatus = 'present'
): number {
  if (status === 'absent') return 0;
  const inMin = parseTimeToMinutes(checkIn);
  const outMin = parseTimeToMinutes(checkOut);
  if (inMin === null || outMin === null) return 0;

  let diff = outMin - inMin;
  if (diff < 0) {
    diff += 24 * 60;
  }
  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Formats an integer amount into Vietnamese currency string (e.g., "20.000 VNĐ").
 */
export function formatVND(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('vi-VN').format(rounded);
  return `${formatted} VNĐ`;
}

/**
 * Formats decimal hours cleanly in Vietnamese style (e.g. "8.5 giờ").
 */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} giờ`;
}

/**
 * Checks whether a YYYY-MM-DD date string falls within optional dateFrom and dateTo bounds (inclusive).
 */
export function isDateInRange(date: string, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

/**
 * Matches an employee from a list using employeeId, employeeCode, or employeeName (case-insensitive, trimmed).
 */
export function findEmployeeByNameOrCode(
  employees: Employee[],
  query: { employeeId?: string; employeeCode?: string; employeeName?: string }
): Employee | undefined {
  if (query.employeeId) {
    const byId = employees.find((e) => e.id === query.employeeId);
    if (byId) return byId;
  }
  if (query.employeeName) {
    const cleanName = query.employeeName.trim().toLowerCase();
    const byName = employees.find((e) => e.name.trim().toLowerCase() === cleanName);
    if (byName) return byName;
  }
  if (query.employeeCode) {
    const cleanCode = query.employeeCode.trim().toUpperCase();
    const byCode = employees.find((e) => e.code.trim().toUpperCase() === cleanCode);
    if (byCode) return byCode;
  }
  // Fallback: sometimes Google Form dropdown value is formatted like "Hiền (EMP001)"
  if (query.employeeName) {
    const clean = query.employeeName.trim().toLowerCase();
    const match = employees.find(
      (e) => clean.startsWith(e.name.trim().toLowerCase()) || clean.includes(e.code.trim().toLowerCase())
    );
    if (match) return match;
  }
  return undefined;
}

/**
 * Computes detailed monthly payroll for a single employee:
 * Luong Thuc Nhan = (Tong so gio lam * Luong theo gio) + Tien Thuong/Phu cap - Tien Tru
 */
export function calculateEmployeePayroll(
  employee: Employee,
  attendance: AttendanceRecord[],
  adjustments: AdjustmentRecord[],
  month: string
): EmployeePayrollSummary {
  const empAttendance = attendance
    .filter((r) => r.employeeId === employee.id && r.date.startsWith(month))
    .sort((a, b) => (a.date === b.date ? a.checkIn.localeCompare(b.checkIn) : a.date.localeCompare(b.date)));

  let totalHours = 0;
  let incompleteShifts = 0;
  let lateShifts = 0;
  let absentShifts = 0;
  let manualEditedShifts = 0;

  for (const record of empAttendance) {
    const status = record.status ?? 'present';
    const computedHours = calculateShiftHours(record.checkIn, record.checkOut, status);
    totalHours += computedHours;
    if (status === 'late') lateShifts += 1;
    if (status === 'absent') absentShifts += 1;
    if (status !== 'absent' && !record.checkOut) {
      incompleteShifts += 1;
    }
    if (record.editedByAdmin || record.source === 'manual') {
      manualEditedShifts += 1;
    }
  }

  totalHours = Math.round(totalHours * 100) / 100;

  const empAdjustments = adjustments
    .filter((a) => a.employeeId === employee.id && a.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bonusList = empAdjustments.filter((a) => a.type === 'bonus');
  const deductionList = empAdjustments.filter((a) => a.type === 'deduction');

  const totalBonus = bonusList.reduce((sum, item) => sum + Math.max(0, Math.round(item.amount)), 0);
  const totalDeduction = deductionList.reduce((sum, item) => sum + Math.max(0, Math.round(item.amount)), 0);

  const basePay = Math.round(totalHours * employee.hourlyRate);
  const netPay = basePay + totalBonus - totalDeduction;

  return {
    employee,
    month,
    totalShifts: empAttendance.length,
    lateShifts,
    absentShifts,
    incompleteShifts,
    manualEditedShifts,
    totalHours,
    basePay,
    totalBonus,
    totalDeduction,
    netPay,
    attendanceList: empAttendance,
    bonusList,
    deductionList,
  };
}

/**
 * Aggregates store-wide payroll statistics for a given YYYY-MM month.
 */
export function calculateMonthlyOverview(
  employees: Employee[],
  attendance: AttendanceRecord[],
  adjustments: AdjustmentRecord[],
  month: string
): MonthlyOverviewStats {
  const summaries = employees.map((emp) => calculateEmployeePayroll(emp, attendance, adjustments, month));
  const activeEmployeeCount = employees.filter((e) => e.status === 'active').length;

  let totalHours = 0;
  let totalBasePay = 0;
  let totalBonus = 0;
  let totalDeduction = 0;
  let totalNetPayroll = 0;
  let incompleteShiftsCount = 0;
  let lateShiftsCount = 0;
  let totalShiftsCount = 0;

  for (const s of summaries) {
    totalHours += s.totalHours;
    totalBasePay += s.basePay;
    totalBonus += s.totalBonus;
    totalDeduction += s.totalDeduction;
    totalNetPayroll += s.netPay;
    incompleteShiftsCount += s.incompleteShifts;
    lateShiftsCount += s.lateShifts;
    totalShiftsCount += s.totalShifts;
  }

  return {
    month,
    activeEmployeeCount,
    totalEmployees: employees.length,
    totalHours: Math.round(totalHours * 100) / 100,
    totalBasePay,
    totalBonus,
    totalDeduction,
    totalNetPayroll,
    incompleteShiftsCount,
    lateShiftsCount,
    totalShiftsCount,
  };
}

/**
 * Normalizes date strings from Google Forms (DD/MM/YYYY, YYYY-MM-DD, ISO) to YYYY-MM-DD.
 */
export function normalizeFormDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalizes time strings (e.g. "8:05", "08:05:00", "14:30") to "HH:mm".
 */
export function normalizeFormTime(raw: string): string {
  const trimmed = raw.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return '08:00';
  const hh = Math.min(23, Math.max(0, Number(match[1])));
  const mm = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
