export type LayoutMode = 'desktop' | 'mobile';

export type Department = 'Phục vụ' | 'Bếp' | 'Thu ngân' | 'Pha chế' | 'Quản lý';

export type EmployeeStatus = 'active' | 'inactive';

export interface Employee {
  id: string;
  code: string; // Internal unique ID e.g., EMP001
  name: string;
  phone: string;
  department: Department | string;
  hourlyRate: number; // Default 20000 VND
  status: EmployeeStatus;
  createdAt: string;
}

export type AttendanceSource = 'google_form' | 'manual' | 'webhook';

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  date: string; // YYYY-MM-DD
  checkIn: string; // HH:mm
  checkOut: string | null; // HH:mm or null if forgotten/pending
  hours: number;
  status: AttendanceStatus;
  source: AttendanceSource;
  note: string;
  editedByAdmin: boolean;
  externalResponseId?: string;
  updatedAt: string;
}

export type AdjustmentType = 'bonus' | 'deduction';

export interface AdjustmentRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  date: string; // YYYY-MM-DD
  type: AdjustmentType;
  category: string;
  amount: number; // Positive integer VND
  reason: string;
  createdAt: string;
}

export interface WorkspaceConfig {
  formId: string;
  spreadsheetId: string;
  webhookSecret: string;
  lastSyncedAt: string | null;
}

export interface StoreDatabase {
  storeName: string;
  defaultHourlyRate: number;
  employees: Employee[];
  attendance: AttendanceRecord[];
  adjustments: AdjustmentRecord[];
  workspace: WorkspaceConfig;
}

export interface EmployeePayrollSummary {
  employee: Employee;
  month: string; // YYYY-MM
  totalShifts: number;
  lateShifts: number;
  absentShifts: number;
  incompleteShifts: number;
  manualEditedShifts: number;
  totalHours: number;
  basePay: number;
  totalBonus: number;
  totalDeduction: number;
  netPay: number;
  attendanceList: AttendanceRecord[];
  bonusList: AdjustmentRecord[];
  deductionList: AdjustmentRecord[];
}

export interface MonthlyOverviewStats {
  month: string;
  activeEmployeeCount: number;
  totalEmployees: number;
  totalHours: number;
  totalBasePay: number;
  totalBonus: number;
  totalDeduction: number;
  totalNetPayroll: number;
  incompleteShiftsCount: number;
  lateShiftsCount: number;
  totalShiftsCount: number;
}
