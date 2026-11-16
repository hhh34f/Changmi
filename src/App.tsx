import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CalendarClock,
  Calculator,
  ChevronRight,
  Coins,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Monitor,
  Plus,
  Smartphone,
  Users,
  Webhook,
  X,
} from 'lucide-react';
import { AdjustmentsView } from './components/AdjustmentsView';
import { AttendanceView } from './components/AttendanceView';
import { BottomSheet } from './components/BottomSheet';
import { ChangmiLogo } from './components/ChangmiLogo';
import { EmployeesView } from './components/EmployeesView';
import { OverviewView } from './components/OverviewView';
import { PaySlipModal } from './components/PaySlipModal';
import { PayrollView } from './components/PayrollView';
import { WelcomeModeScreen } from './components/WelcomeModeScreen';
import { WorkspaceView } from './components/WorkspaceView';
import {
  getWorkspaceAccessToken,
  initGoogleAuth,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
} from './services/googleAuth';
import type { ParsedFormAttendanceEntry } from './services/googleWorkspace';
import type {
  AdjustmentType,
  AttendanceStatus,
  Employee,
  EmployeePayrollSummary,
  LayoutMode,
  StoreDatabase,
  WorkspaceConfig,
} from './types';
import { calculateEmployeePayroll, calculateMonthlyOverview } from './utils/payroll';

type TabId = 'overview' | 'employees' | 'attendance' | 'adjustments' | 'payroll' | 'workspace';

const DEVICE_MODE_STORAGE_KEY = 'changmi_device_mode';

const ALL_MODULES: Array<{
  id: TabId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Tổng quan', description: 'Số liệu giờ làm & quỹ lương nhanh', icon: LayoutDashboard },
  { id: 'attendance', label: 'Chấm công', description: 'Nhật ký ca làm & sửa chấm công', icon: CalendarClock },
  { id: 'payroll', label: 'Bảng lương', description: 'Tổng hợp lương & in phiếu lương', icon: Calculator },
  { id: 'employees', label: 'Nhân viên', description: 'Quản lý hồ sơ nhân sự & lương giờ', icon: Users },
  { id: 'adjustments', label: 'Thưởng & Trừ', description: 'Thưởng hiệu suất, tip, phạt trễ', icon: Coins },
  { id: 'workspace', label: 'Google Workspace', description: 'Google Form Dropdown & 4-tab Sheet', icon: FileSpreadsheet },
];

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Yêu cầu thất bại.');
  }
  return data as T;
}

export default function App() {
  const [layoutMode, setLayoutMode] = useState<LayoutMode | null>(() => {
    try {
      const saved = sessionStorage.getItem(DEVICE_MODE_STORAGE_KEY);
      return saved === 'desktop' || saved === 'mobile' ? saved : null;
    } catch {
      return null;
    }
  });

  const handleSelectMode = (mode: LayoutMode) => {
    setLayoutMode(mode);
    setDrawerOpen(false);
    setQuickSheetOpen(false);
    try {
      sessionStorage.setItem(DEVICE_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const handleOpenModePicker = () => {
    setLayoutMode(null);
    setDrawerOpen(false);
    setQuickSheetOpen(false);
    try {
      sessionStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const [db, setDb] = useState<StoreDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth);
  const [paySlipTarget, setPaySlipTarget] = useState<EmployeePayrollSummary | null>(null);

  // Mobile-First Navigation Patterns: Off-Canvas Drawer & Center Quick-Create Sheet
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);

  // Quick-action signals to immediately open targeted form sheets after switching tabs
  const [quickAddEmpSignal, setQuickAddEmpSignal] = useState(0);
  const [quickManualAttSignal, setQuickManualAttSignal] = useState(0);
  const [quickWebhookSignal, setQuickWebhookSignal] = useState(0);
  const [quickBonusSignal, setQuickBonusSignal] = useState(0);
  const [quickDeductionSignal, setQuickDeductionSignal] = useState(0);

  // Google Workspace OAuth client state (token cached in memory only)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getWorkspaceAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const state = await apiRequest<StoreDatabase>('/api/state');
      setDb(state);
    } catch (err: any) {
      setLoadError(err?.message || 'Không thể kết nối máy chủ dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStateQuietly = useCallback(async () => {
    const state = await apiRequest<StoreDatabase>('/api/state');
    setDb(state);
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  useEffect(() => {
    const unsub = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(null);
      }
    );
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const { user, accessToken: token } = await signInWithGoogleWorkspace();
      setGoogleUser(user);
      setAccessToken(token);
    } catch (err: any) {
      setAuthError(err?.message || 'Đăng nhập Google không thành công.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    setGoogleUser(null);
    setAccessToken(null);
  };

  const payrollSummaries = useMemo(() => {
    if (!db) return [];
    return db.employees.map((emp) =>
      calculateEmployeePayroll(emp, db.attendance, db.adjustments, selectedMonth)
    );
  }, [db, selectedMonth]);

  const overviewStats = useMemo(() => {
    if (!db) {
      return {
        month: selectedMonth,
        activeEmployeeCount: 0,
        totalEmployees: 0,
        totalHours: 0,
        totalBasePay: 0,
        totalBonus: 0,
        totalDeduction: 0,
        totalNetPayroll: 0,
        incompleteShiftsCount: 0,
        lateShiftsCount: 0,
        totalShiftsCount: 0,
      };
    }
    return calculateMonthlyOverview(db.employees, db.attendance, db.adjustments, selectedMonth);
  }, [db, selectedMonth]);

  const monthAttendance = useMemo(() => {
    if (!db) return [];
    return db.attendance
      .filter((a) => a.date.startsWith(selectedMonth))
      .sort((a, b) => (a.date === b.date ? b.checkIn.localeCompare(a.checkIn) : b.date.localeCompare(a.date)));
  }, [db, selectedMonth]);

  const monthAdjustments = useMemo(() => {
    if (!db) return [];
    return db.adjustments
      .filter((a) => a.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db, selectedMonth]);

  // API Mutations
  const handleCreateEmployee = async (payload: {
    code?: string;
    name: string;
    phone: string;
    department: string;
    hourlyRate: number;
  }) => {
    const res = await apiRequest<{ state: StoreDatabase }>('/api/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setDb(res.state);
  };

  const handleUpdateEmployee = async (
    id: string,
    payload: Partial<Pick<Employee, 'code' | 'name' | 'phone' | 'department' | 'hourlyRate' | 'status'>>
  ) => {
    const res = await apiRequest<{ state: StoreDatabase }>(`/api/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setDb(res.state);
  };

  const handleDeleteEmployee = async (id: string, hard: boolean) => {
    const res = await apiRequest<{ state: StoreDatabase }>(`/api/employees/${id}?hard=${hard}`, {
      method: 'DELETE',
    });
    setDb(res.state);
  };

  const handleCreateAttendance = async (payload: {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    status: AttendanceStatus;
    note: string;
  }) => {
    const res = await apiRequest<{ state: StoreDatabase }>('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ ...payload, source: 'manual' }),
    });
    setDb(res.state);
  };

  const handleUpdateAttendance = async (
    id: string,
    payload: {
      employeeId: string;
      date: string;
      checkIn: string;
      checkOut: string | null;
      status: AttendanceStatus;
      note: string;
    }
  ) => {
    const res = await apiRequest<{ state: StoreDatabase }>(`/api/attendance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setDb(res.state);
  };

  const handleDeleteAttendance = async (id: string) => {
    const res = await apiRequest<{ state: StoreDatabase }>(`/api/attendance/${id}`, {
      method: 'DELETE',
    });
    setDb(res.state);
  };

  const handleSimulateWebhook = async (payload: {
    secret: string;
    employeeId: string;
    employeeName: string;
    action: 'checkin' | 'checkout';
    date: string;
    time: string;
    note: string;
  }) => {
    const res = await apiRequest<{ state: StoreDatabase }>('/api/webhook/google-form', {
      method: 'POST',
      body: JSON.stringify({ ...payload, source: 'google_form' }),
    });
    setDb(res.state);
  };

  const handleBulkImportAttendance = async (entries: ParsedFormAttendanceEntry[]) => {
    const res = await apiRequest<{
      importedCount: number;
      updatedCount: number;
      skippedCount: number;
      state: StoreDatabase;
    }>('/api/attendance/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
    setDb(res.state);
    return {
      importedCount: res.importedCount,
      updatedCount: res.updatedCount,
      skippedCount: res.skippedCount,
    };
  };

  const handleCreateAdjustment = async (payload: {
    employeeId: string;
    date: string;
    type: AdjustmentType;
    category: string;
    amount: number;
    reason: string;
  }) => {
    const res = await apiRequest<{ state: StoreDatabase }>('/api/adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setDb(res.state);
  };

  const handleDeleteAdjustment = async (id: string) => {
    const res = await apiRequest<{ state: StoreDatabase }>(`/api/adjustments/${id}`, {
      method: 'DELETE',
    });
    setDb(res.state);
  };

  const handleSaveWorkspaceConfig = async (config: Partial<WorkspaceConfig>) => {
    const res = await apiRequest<{ state: StoreDatabase }>('/api/workspace/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    setDb(res.state);
  };

  const activeNavLabel = ALL_MODULES.find((n) => n.id === activeTab)?.label ?? 'Tổng quan';

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  const triggerQuickAction = (kind: 'attendance' | 'webhook' | 'bonus' | 'deduction' | 'employee') => {
    setQuickSheetOpen(false);
    if (kind === 'attendance') {
      setActiveTab('attendance');
      setQuickManualAttSignal((s) => s + 1);
    } else if (kind === 'webhook') {
      setActiveTab('attendance');
      setQuickWebhookSignal((s) => s + 1);
    } else if (kind === 'bonus') {
      setActiveTab('adjustments');
      setQuickBonusSignal((s) => s + 1);
    } else if (kind === 'deduction') {
      setActiveTab('adjustments');
      setQuickDeductionSignal((s) => s + 1);
    } else if (kind === 'employee') {
      setActiveTab('employees');
      setQuickAddEmpSignal((s) => s + 1);
    }
  };

  const isDrawerTabActive = activeTab === 'employees' || activeTab === 'adjustments' || activeTab === 'workspace';

  if (layoutMode === null) {
    return <WelcomeModeScreen onSelectMode={handleSelectMode} />;
  }

  const isDesktopMode = layoutMode === 'desktop';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Mode Persistent Left Sidebar */}
      {isDesktopMode && (
        <aside className="no-print hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white sticky top-0 h-screen">
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <ChangmiLogo size="sm" showWordmark subtitle="Chấm công & Tính lương" />
          </div>

          <nav aria-label="Menu phân hệ máy tính" className="flex-1 overflow-y-auto p-3 space-y-1">
            {ALL_MODULES.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeTab === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => selectTab(mod.id)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-red-50 font-semibold text-red-800'
                      : 'font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-red-700' : 'text-slate-500'}`} />
                  <span className="truncate">{mod.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 p-3 space-y-2">
            <button
              type="button"
              onClick={() => handleSelectMode('mobile')}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <span className="inline-flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-slate-600" />
                <span>Chuyển sang Điện thoại</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={handleOpenModePicker}
              className="flex min-h-[40px] w-full items-center justify-center rounded-xl px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              Về màn hình chọn thiết bị
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Sticky Top App Bar */}
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between gap-3 px-3.5 sm:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              {isDesktopMode ? (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Mở menu Quản lý"
                  className="lg:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <Menu className="h-5 w-5" />
                </button>
              ) : (
                <ChangmiLogo size="sm" />
              )}
              {isDesktopMode && (
                <div className="lg:hidden">
                  <ChangmiLogo size="sm" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="hidden sm:inline font-display text-[15px] font-semibold text-slate-900 whitespace-nowrap">
                    Quán Mì Cay Changmi
                  </span>
                  <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                    /
                  </span>
                  <h1 className="font-display text-base font-semibold text-slate-900 truncate">
                    {activeNavLabel}
                  </h1>
                </div>
                <p className="sm:hidden text-xs text-slate-500 leading-none truncate">Quán Mì Cay Changmi</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <label htmlFor="global-month" className="hidden md:inline text-xs font-medium text-slate-600">
                  Kỳ lương:
                </label>
                <input
                  id="global-month"
                  type="month"
                  aria-label="Kỳ lương"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="min-h-[40px] sm:min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs sm:text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
                />
              </div>

              {!isDesktopMode ? (
                <button
                  type="button"
                  onClick={() => handleSelectMode('desktop')}
                  aria-label="Chuyển sang giao diện Máy tính"
                  title="Chuyển sang giao diện Máy tính"
                  className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Monitor className="h-4 w-4 text-slate-600" />
                  <span className="hidden sm:inline">Máy tính</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelectMode('mobile')}
                  aria-label="Chuyển sang giao diện Điện thoại"
                  title="Chuyển sang giao diện Điện thoại"
                  className="lg:hidden inline-flex min-h-[40px] min-w-[40px] sm:min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Smartphone className="h-4 w-4 text-slate-600" />
                </button>
              )}

              {isDesktopMode && (
                <>
                  {!accessToken ? (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isLoggingIn}
                      className="gsi-material-button hidden md:inline-flex !h-10 !px-3 !text-xs"
                    >
                      <div className="gsi-material-button-state" />
                      <div className="gsi-material-button-content-wrapper !gap-2">
                        <div className="gsi-material-button-icon !h-4 !w-4 !min-w-4">
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            />
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            />
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            />
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">
                          {isLoggingIn ? 'Đang kết nối...' : 'Sign in with Google'}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                      <span className="max-w-[140px] truncate text-xs font-medium text-slate-700">
                        {googleUser?.email || googleUser?.displayName || 'Đã kết nối Google'}
                      </span>
                      <button
                        type="button"
                        onClick={handleGoogleSignOut}
                        className="text-xs font-medium text-red-700 hover:text-red-800 whitespace-nowrap"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main
          className={`flex-1 w-full mx-auto ${
            isDesktopMode
              ? 'px-3.5 pt-4 pb-8 sm:px-6 sm:pt-6 max-w-7xl'
              : 'px-3.5 pt-3.5 pb-24 sm:px-6 sm:pt-6 sm:pb-24 max-w-4xl'
          }`}
        >
          {authError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {authError}
            </div>
          )}

          {loading && !db && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            </div>
          )}

          {loadError && !db && (
            <div className="rounded-2xl border border-red-200 bg-white p-8 text-center space-y-3">
              <p className="text-sm font-medium text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={fetchState}
                className="min-h-[44px] rounded-xl bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800"
              >
                Thử tải lại
              </button>
            </div>
          )}

          {db && (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  layoutMode={layoutMode}
                  month={selectedMonth}
                  stats={overviewStats}
                  payrollSummaries={payrollSummaries}
                  employees={db.employees}
                  recentAttendance={monthAttendance}
                  recentAdjustments={monthAdjustments}
                  onNavigate={selectTab}
                  onOpenPaySlip={setPaySlipTarget}
                  onRecalculatePayroll={refreshStateQuietly}
                  onQuickManualAttendance={() => triggerQuickAction('attendance')}
                  onQuickAddEmployee={() => triggerQuickAction('employee')}
                />
              )}

              {activeTab === 'employees' && (
                <EmployeesView
                  layoutMode={layoutMode}
                  employees={db.employees}
                  attendance={db.attendance}
                  month={selectedMonth}
                  quickAddSignal={quickAddEmpSignal}
                  onCreateEmployee={handleCreateEmployee}
                  onUpdateEmployee={handleUpdateEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                />
              )}

              {activeTab === 'attendance' && (
                <AttendanceView
                  layoutMode={layoutMode}
                  employees={db.employees}
                  attendance={db.attendance}
                  month={selectedMonth}
                  webhookSecret={db.workspace.webhookSecret}
                  quickManualSignal={quickManualAttSignal}
                  quickWebhookSignal={quickWebhookSignal}
                  onCreateAttendance={handleCreateAttendance}
                  onUpdateAttendance={handleUpdateAttendance}
                  onDeleteAttendance={handleDeleteAttendance}
                  onSimulateWebhook={handleSimulateWebhook}
                />
              )}

              {activeTab === 'adjustments' && (
                <AdjustmentsView
                  layoutMode={layoutMode}
                  employees={db.employees}
                  adjustments={db.adjustments}
                  month={selectedMonth}
                  quickBonusSignal={quickBonusSignal}
                  quickDeductionSignal={quickDeductionSignal}
                  onCreateAdjustment={handleCreateAdjustment}
                  onDeleteAdjustment={handleDeleteAdjustment}
                />
              )}

              {activeTab === 'payroll' && (
                <PayrollView
                  layoutMode={layoutMode}
                  month={selectedMonth}
                  employees={db.employees}
                  stats={overviewStats}
                  payrollSummaries={payrollSummaries}
                  onOpenPaySlip={setPaySlipTarget}
                  onNavigateWorkspace={() => selectTab('workspace')}
                  onRecalculatePayroll={refreshStateQuietly}
                />
              )}

              {activeTab === 'workspace' && (
                <WorkspaceView
                  layoutMode={layoutMode}
                  googleUser={googleUser}
                  accessToken={accessToken}
                  isLoggingIn={isLoggingIn}
                  onGoogleSignIn={handleGoogleSignIn}
                  onGoogleSignOut={handleGoogleSignOut}
                  workspace={db.workspace}
                  onSaveConfig={handleSaveWorkspaceConfig}
                  onBulkImportAttendance={handleBulkImportAttendance}
                  employees={db.employees}
                  attendance={db.attendance}
                  adjustments={db.adjustments}
                  payrollSummaries={payrollSummaries}
                  month={selectedMonth}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Sticky Bottom Navigation Bar (Mobile Mode only) */}
      {!isDesktopMode && (
        <nav
          aria-label="Điều hướng chính"
          className="no-print fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md"
        >
          <div className="mx-auto max-w-3xl px-1 sm:px-4">
            <div className="grid grid-cols-5 items-center h-16">
              {/* 1. Tổng quan */}
              <button
                type="button"
                onClick={() => selectTab('overview')}
                aria-label="Tổng quan"
                aria-current={activeTab === 'overview' ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] min-w-[44px] gap-0.5 rounded-xl px-1 transition-colors ${
                  activeTab === 'overview' ? 'text-red-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="h-5 w-5 shrink-0" />
                <span className={`text-xs leading-tight whitespace-nowrap ${activeTab === 'overview' ? 'font-semibold' : 'font-medium'}`}>
                  Tổng quan
                </span>
              </button>

              {/* 2. Chấm công */}
              <button
                type="button"
                onClick={() => selectTab('attendance')}
                aria-label="Chấm công"
                aria-current={activeTab === 'attendance' ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] min-w-[44px] gap-0.5 rounded-xl px-1 transition-colors ${
                  activeTab === 'attendance' ? 'text-red-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <CalendarClock className="h-5 w-5 shrink-0" />
                <span className={`text-xs leading-tight whitespace-nowrap ${activeTab === 'attendance' ? 'font-semibold' : 'font-medium'}`}>
                  Chấm công
                </span>
              </button>

              {/* 3. Hành động chính ở giữa: Tạo mới / Điểm danh nhanh */}
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setQuickSheetOpen(true)}
                  aria-label="Tạo mới nhanh"
                  className="flex flex-col items-center justify-center min-h-[48px] min-w-[56px] rounded-2xl bg-red-700 px-3 py-1 text-white shadow-sm hover:bg-red-800 active:scale-[0.97] transition-transform"
                >
                  <Plus className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-semibold leading-tight whitespace-nowrap">Tạo mới</span>
                </button>
              </div>

              {/* 4. Bảng lương */}
              <button
                type="button"
                onClick={() => selectTab('payroll')}
                aria-label="Bảng lương"
                aria-current={activeTab === 'payroll' ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] min-w-[44px] gap-0.5 rounded-xl px-1 transition-colors ${
                  activeTab === 'payroll' ? 'text-red-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Calculator className="h-5 w-5 shrink-0" />
                <span className={`text-xs leading-tight whitespace-nowrap ${activeTab === 'payroll' ? 'font-semibold' : 'font-medium'}`}>
                  Bảng lương
                </span>
              </button>

              {/* 5. Quản lý (Off-canvas Drawer: Nhân viên, Thưởng & Trừ, Google Workspace) */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Mở menu Quản lý"
                aria-expanded={drawerOpen}
                className={`flex flex-col items-center justify-center min-h-[48px] min-w-[44px] gap-0.5 rounded-xl px-1 transition-colors ${
                  isDrawerTabActive || drawerOpen ? 'text-red-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Menu className="h-5 w-5 shrink-0" />
                <span className={`text-xs leading-tight whitespace-nowrap ${isDrawerTabActive || drawerOpen ? 'font-semibold' : 'font-medium'}`}>
                  Quản lý
                </span>
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* Off-Canvas Management Drawer */}
      {drawerOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[85vw] max-w-sm bg-white h-full border-l border-slate-200 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
              <div>
                <h2 id="drawer-title" className="text-base font-semibold text-slate-900">
                  Quản lý Quán Mì Cay Changmi
                </h2>
                <p className="text-xs text-slate-500">Chọn phân hệ hoặc đồng bộ Google</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng menu Quản lý"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
              {ALL_MODULES.map((mod) => {
                const Icon = mod.icon;
                const isActive = activeTab === mod.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => selectTab(mod.id)}
                    className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isActive ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{mod.label}</p>
                        <p className="text-xs text-slate-500 truncate">{mod.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-4 space-y-2.5 bg-slate-50">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectMode(isDesktopMode ? 'mobile' : 'desktop')}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isDesktopMode ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                  <span>{isDesktopMode ? 'Điện thoại' : 'Máy tính'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenModePicker}
                  className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Chọn lại thiết bị
                </button>
              </div>
              {!accessToken ? (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="gsi-material-button w-full !min-h-[44px]"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Đang kết nối...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {googleUser?.displayName || 'Tài khoản Google'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{googleUser?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Center Action Quick-Create Bottom Sheet */}
      <BottomSheet
        open={quickSheetOpen}
        onClose={() => setQuickSheetOpen(false)}
        title="Thao tác nhanh"
        subtitle="Chọn tên nhân viên dạng Dropdown cho mọi thao tác"
        titleId="quick-action-title"
        maxWidthClass="sm:max-w-md"
      >
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => triggerQuickAction('attendance')}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-left hover:bg-red-50 active:bg-red-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-700 text-white">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Chấm công / Bổ sung ca làm</p>
              <p className="text-xs text-slate-600">Chọn tên nhân viên từ Dropdown & nhập giờ vào/ra</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => triggerQuickAction('bonus')}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Coins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Thêm Thưởng / Phụ cấp</p>
              <p className="text-xs text-slate-600">Cộng thưởng hiệu suất, tiền tip, phụ cấp ca</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => triggerQuickAction('deduction')}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <Coins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Thêm Khoản Trừ lương</p>
              <p className="text-xs text-slate-600">Ghi nhận phạt đi trễ, tạm ứng hoặc khấu trừ</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => triggerQuickAction('employee')}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Thêm Nhân viên mới</p>
              <p className="text-xs text-slate-600">Tự động cập nhật vào tất cả Dropdown của quán</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => triggerQuickAction('webhook')}
            className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Webhook className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Test Google Form Webhook</p>
              <p className="text-xs text-slate-600">Giả lập nhân viên gửi điểm danh qua Form</p>
            </div>
          </button>
        </div>
      </BottomSheet>

      <PaySlipModal summary={paySlipTarget} onClose={() => setPaySlipTarget(null)} />
    </div>
  );
}
