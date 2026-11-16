import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  Clock,
  Download,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AdjustmentRecord,
  AttendanceRecord,
  Employee,
  EmployeePayrollSummary,
  LayoutMode,
  MonthlyOverviewStats,
} from '../types';
import { formatHours, formatVND } from '../utils/payroll';
import { BottomSheet } from './BottomSheet';

interface OverviewViewProps {
  layoutMode: LayoutMode;
  month: string;
  stats: MonthlyOverviewStats;
  payrollSummaries: EmployeePayrollSummary[];
  employees: Employee[];
  recentAttendance: AttendanceRecord[];
  recentAdjustments: AdjustmentRecord[];
  onNavigate: (tab: 'employees' | 'attendance' | 'adjustments' | 'payroll' | 'workspace') => void;
  onOpenPaySlip: (summary: EmployeePayrollSummary) => void;
  onRecalculatePayroll: () => Promise<void>;
  onQuickManualAttendance: () => void;
  onQuickAddEmployee: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  layoutMode,
  month,
  stats,
  payrollSummaries,
  employees,
  recentAttendance,
  recentAdjustments,
  onNavigate,
  onOpenPaySlip,
  onRecalculatePayroll,
  onQuickManualAttendance,
  onQuickAddEmployee,
}) => {
  const isMobileLayout = layoutMode === 'mobile';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent' | 'incomplete'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'net_desc' | 'hours_desc'>('default');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [yearStr, monthStr] = month.split('-');

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (sortBy !== 'default' ? 1 : 0);

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = payrollSummaries.filter((item) => {
      if (q) {
        const matchesName = item.employee.name.toLowerCase().includes(q);
        const matchesDept = item.employee.department.toLowerCase().includes(q);
        if (!matchesName && !matchesDept) return false;
      }
      if (statusFilter === 'late' && item.lateShifts === 0) return false;
      if (statusFilter === 'absent' && item.absentShifts === 0) return false;
      if (statusFilter === 'incomplete' && item.incompleteShifts === 0) return false;
      if (statusFilter === 'present' && item.totalShifts === 0) return false;
      return true;
    });
    if (sortBy === 'net_desc') {
      return [...list].sort((a, b) => b.netPay - a.netPay);
    }
    if (sortBy === 'hours_desc') {
      return [...list].sort((a, b) => b.totalHours - a.totalHours);
    }
    return list;
  }, [payrollSummaries, search, statusFilter, sortBy]);

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recentAttendance.filter((att) => {
      const emp = empById.get(att.employeeId);
      if (q && !(emp?.name ?? '').toLowerCase().includes(q)) return false;
      if (statusFilter === 'incomplete') return !att.checkOut && att.status !== 'absent';
      if (statusFilter !== 'all' && att.status !== statusFilter) return false;
      return true;
    });
  }, [recentAttendance, empById, search, statusFilter]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setNotice(null);
    try {
      await onRecalculatePayroll();
      setNotice(`Đã tính lại bảng lương tháng ${monthStr}/${yearStr} thành công.`);
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setRecalculating(false);
    }
  };

  const handleExportQuickCsv = () => {
    const header = ['Thang', 'HoTen', 'ViTri', 'TongGioLam', 'LuongGio', 'LuongCoBan', 'Thuong', 'Tru', 'ThucNhan'];
    const rows = filteredSummaries.map((p) => [
      month,
      p.employee.name,
      p.employee.department,
      String(p.totalHours),
      String(p.employee.hourlyRate),
      String(p.basePay),
      String(p.totalBonus),
      String(p.totalDeduction),
      String(p.netPay),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-tong-quan-changmi-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSortBy('default');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile Compact Action Bar + Filter Sheet Trigger */}
      <div className={`${isMobileLayout ? 'flex' : 'flex md:hidden'} items-center justify-between gap-2`}>
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 active:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4 text-slate-600" />
          <span>Bộ lọc & Tìm kiếm</span>
          {activeFilterCount > 0 && (
            <span className="font-mono text-xs font-semibold text-red-700">({activeFilterCount})</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleRecalculate}
          disabled={recalculating}
          aria-label="Tính lại bảng lương"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-slate-700 active:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onQuickManualAttendance}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-red-700 px-3.5 text-sm font-medium text-white active:bg-red-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>Chấm công</span>
        </button>
      </div>

      {/* Desktop Toolbar */}
      <div
        className={`${
          isMobileLayout ? 'hidden' : 'hidden md:flex'
        } flex-col xl:flex-row xl:items-center xl:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên nhân viên..."
              aria-label="Tìm kiếm nhân viên trong tổng quan"
              className="h-11 w-56 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'present', label: 'Có mặt' },
                { id: 'late', label: 'Đi trễ' },
                { id: 'absent', label: 'Vắng' },
                { id: 'incomplete', label: 'Thiếu check-out' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            Tính lại bảng lương
          </button>
          <button
            type="button"
            onClick={handleExportQuickCsv}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất báo cáo
          </button>
          <button
            type="button"
            onClick={onQuickManualAttendance}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Sửa chấm công thủ công
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {/* KPI Grid — 2x2 compact cards on mobile, 4 columns on xl */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Quỹ lương {monthStr}/{yearStr}</p>
          <p className="mt-1.5 font-mono tabular-nums text-lg sm:text-2xl font-bold text-slate-900">
            {formatVND(stats.totalNetPayroll)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Cơ bản: {formatVND(stats.totalBasePay)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Tổng giờ làm</p>
          <p className="mt-1.5 font-mono tabular-nums text-lg sm:text-2xl font-bold text-slate-900">
            {formatHours(stats.totalHours)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {stats.totalShiftsCount} lượt · {stats.lateShiftsCount} trễ
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('employees')}
          className="text-left rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 hover:bg-slate-50/70 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Nhân viên quán</p>
          <p className="mt-1.5 font-mono tabular-nums text-lg sm:text-2xl font-bold text-slate-900">
            {stats.activeEmployeeCount} / {stats.totalEmployees}
          </p>
          <p className="mt-1 text-xs text-red-700 font-medium">
            20.000 VNĐ/h · Quản lý →
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="text-left rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 hover:bg-slate-50/70 transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">Thiếu check-out</p>
          <p
            className={`mt-1.5 font-mono tabular-nums text-lg sm:text-2xl font-bold ${
              stats.incompleteShiftsCount > 0 ? 'text-amber-600' : 'text-emerald-700'
            }`}
          >
            {stats.incompleteShiftsCount} ca
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.incompleteShiftsCount > 0 ? 'Chạm để bổ sung →' : 'Đã đủ giờ ra'}
          </p>
        </button>
      </div>

      {/* Empty Store Onboarding Banner */}
      {employees.length === 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Quán Mì Cay Changmi đã sẵn sàng hoạt động
            </h2>
            <p className="text-sm text-slate-600">
              Chưa có dữ liệu nhân viên nào. Hãy thêm nhân viên đầu tiên để tự động cập nhật vào các danh sách chọn tên (Dropdown) và Google Form.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('workspace')}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Kết nối Google Workspace
            </button>
            <button
              type="button"
              onClick={onQuickAddEmployee}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm nhân viên đầu tiên</span>
            </button>
          </div>
        </section>
      )}

      {/* Payroll Preview: Mobile Cards / Desktop Table */}
      <section
        className={
          isMobileLayout
            ? 'space-y-3'
            : 'space-y-3 md:space-y-0 md:rounded-2xl md:border md:border-slate-200 md:bg-white'
        }
      >
        <div
          className={`flex items-center justify-between gap-3 ${
            isMobileLayout ? '' : 'md:border-b md:border-slate-200 md:px-5 md:py-4'
          }`}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Lương dự kiến tháng {monthStr}/{yearStr}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              (Số giờ × Lương giờ) + Thưởng - Trừ
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('payroll')}
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 whitespace-nowrap shrink-0 px-2"
          >
            <span>Chi tiết</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Mobile Payroll Cards */}
        <div className={isMobileLayout ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3 md:hidden'}>
          {filteredSummaries.map((item) => (
            <div
              key={item.employee.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{item.employee.name}</h3>
                  <p className="text-xs text-slate-500">
                    {item.employee.department} · <span className="font-mono">{formatVND(item.employee.hourlyRate)}/h</span>
                    {item.lateShifts > 0 ? ` · ${item.lateShifts} lần trễ` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">Thực nhận</p>
                  <p className="font-mono tabular-nums text-base font-bold text-red-700">
                    {formatVND(item.netPay)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-b border-slate-100 py-2.5 text-xs">
                <div>
                  <p className="text-slate-500">Giờ làm</p>
                  <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                    {formatHours(item.totalHours)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Thưởng</p>
                  <p className={`mt-0.5 font-mono tabular-nums font-semibold ${item.totalBonus > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {item.totalBonus > 0 ? `+${formatVND(item.totalBonus)}` : '0 VNĐ'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Trừ lương</p>
                  <p className={`mt-0.5 font-mono tabular-nums font-semibold ${item.totalDeduction > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                    {item.totalDeduction > 0 ? `-${formatVND(item.totalDeduction)}` : '0 VNĐ'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-mono">
                  Lương giờ: {formatVND(item.basePay)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenPaySlip(item)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-800 active:bg-slate-100 whitespace-nowrap"
                >
                  <Calculator className="h-4 w-4 text-red-700" />
                  <span>Phiếu lương</span>
                </button>
              </div>
            </div>
          ))}

          {filteredSummaries.length === 0 && (
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {employees.length === 0
                ? 'Chưa có nhân viên nào trong hệ thống.'
                : 'Không tìm thấy nhân viên phù hợp với bộ lọc hiện tại.'}
            </div>
          )}
        </div>

        {/* Desktop Payroll Table */}
        <div className={`${isMobileLayout ? 'hidden' : 'hidden md:block'} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Nhân viên</th>
                <th className="px-4 py-3 whitespace-nowrap">Vị trí</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Tổng giờ</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Lương cơ bản</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Thưởng / Phụ cấp</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Trừ lương</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Thực nhận</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Phiếu lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSummaries.map((item) => (
                <tr key={item.employee.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{item.employee.name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {formatVND(item.employee.hourlyRate)}/h
                      {item.lateShifts > 0 ? ` · ${item.lateShifts} lần trễ` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.employee.department}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatHours(item.totalHours)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {formatVND(item.basePay)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      item.totalBonus > 0 ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {item.totalBonus > 0 ? `+${formatVND(item.totalBonus)}` : '0 VNĐ'}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      item.totalDeduction > 0 ? 'text-red-700' : 'text-slate-400'
                    }`}
                  >
                    {item.totalDeduction > 0 ? `-${formatVND(item.totalDeduction)}` : '0 VNĐ'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {formatVND(item.netPay)}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenPaySlip(item)}
                      className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      Phiếu lương
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSummaries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                    {employees.length === 0
                      ? 'Chưa có nhân viên nào trong hệ thống.'
                      : 'Không tìm thấy nhân viên phù hợp với bộ lọc hiện tại.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Two-Column Activity Split: Recent Attendance + Recent Adjustments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
            <h3 className="text-sm font-semibold text-slate-900">Nhật ký chấm công gần đây</h3>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-red-700 hover:text-red-800 whitespace-nowrap shrink-0 px-1"
            >
              Xem tất cả →
            </button>
          </div>
          <div className="divide-y divide-slate-200">
            {filteredAttendance.slice(0, 5).map((att) => {
              const emp = empById.get(att.employeeId);
              return (
                <div key={att.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900">
                        {emp?.name ?? att.employeeCode}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="font-mono text-xs text-slate-500">{att.date}</span>
                      {att.status === 'late' && (
                        <>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-medium text-amber-700">Đi trễ</span>
                        </>
                      )}
                      {att.status === 'absent' && (
                        <>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-medium text-red-700">Vắng</span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {att.source === 'google_form' ? 'Google Form' : att.source === 'webhook' ? 'Webhook' : 'Admin nhập'}
                      {att.note ? ` · ${att.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-xs font-medium text-slate-900">
                      {att.status === 'absent' ? 'Nghỉ / Vắng' : `${att.checkIn} – ${att.checkOut ?? 'Chưa ra'}`}
                    </div>
                    {att.status === 'absent' ? (
                      <div className="mt-0.5 font-mono tabular-nums text-xs text-red-700">0 giờ</div>
                    ) : att.checkOut ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 font-mono tabular-nums text-xs text-emerald-700">
                        <Clock className="h-3 w-3" />
                        {formatHours(att.hours)}
                      </div>
                    ) : (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertCircle className="h-3 w-3" />
                        Thiếu check-out
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredAttendance.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Chưa có lượt chấm công phù hợp với bộ lọc.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
            <h3 className="text-sm font-semibold text-slate-900">Thưởng, Phụ cấp & Trừ lương</h3>
            <button
              type="button"
              onClick={() => onNavigate('adjustments')}
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-red-700 hover:text-red-800 whitespace-nowrap shrink-0 px-1"
            >
              Quản lý →
            </button>
          </div>
          <div className="divide-y divide-slate-200">
            {recentAdjustments.slice(0, 5).map((adj) => {
              const emp = empById.get(adj.employeeId);
              return (
                <div key={adj.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {emp?.name ?? adj.employeeCode}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-medium text-slate-600 truncate">{adj.category}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      <span className="font-mono">{adj.date}</span>
                      {adj.reason ? ` · ${adj.reason}` : ''}
                    </p>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-sm font-semibold shrink-0 ${
                      adj.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {adj.type === 'bonus' ? '+' : '-'}
                    {formatVND(adj.amount)}
                  </span>
                </div>
              );
            })}
            {recentAdjustments.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Chưa có khoản thưởng hoặc trừ lương nào trong tháng này.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Mobile Filter & Sort Bottom Sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Bộ lọc & Tìm kiếm"
        subtitle="Tổng quan chấm công và dự kiến lương"
        titleId="overview-filter-title"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="ov-mobile-search" className="block text-xs font-medium text-slate-700 mb-1.5">
              Tìm theo tên nhân viên
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="ov-mobile-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nhập tên nhân viên..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">Lọc theo trạng thái</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'present', label: 'Có mặt' },
                  { id: 'late', label: 'Đi trễ' },
                  { id: 'absent', label: 'Vắng' },
                  { id: 'incomplete', label: 'Thiếu check-out' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium transition-colors ${
                    statusFilter === opt.id
                      ? 'border-red-700 bg-red-50 text-red-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="ov-mobile-sort" className="block text-xs font-medium text-slate-700 mb-1.5">
              Sắp xếp nhân viên
            </label>
            <select
              id="ov-mobile-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'default' | 'net_desc' | 'hours_desc')}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="default">Mặc định</option>
              <option value="net_desc">Thực nhận cao nhất</option>
              <option value="hours_desc">Giờ làm nhiều nhất</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetFilters();
                setFilterSheetOpen(false);
              }}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
            >
              Xóa bộ lọc
            </button>
            <button
              type="button"
              onClick={() => setFilterSheetOpen(false)}
              className="min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-medium text-white"
            >
              Áp dụng
            </button>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                handleExportQuickCsv();
                setFilterSheetOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>Xuất báo cáo CSV</span>
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
