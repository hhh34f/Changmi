import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { Employee, EmployeePayrollSummary, LayoutMode, MonthlyOverviewStats } from '../types';
import { formatHours, formatVND } from '../utils/payroll';
import { BottomSheet } from './BottomSheet';

interface PayrollViewProps {
  layoutMode: LayoutMode;
  month: string;
  employees: Employee[];
  stats: MonthlyOverviewStats;
  payrollSummaries: EmployeePayrollSummary[];
  onOpenPaySlip: (summary: EmployeePayrollSummary) => void;
  onNavigateWorkspace: () => void;
  onRecalculatePayroll: () => Promise<void>;
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  layoutMode,
  month,
  employees,
  stats,
  payrollSummaries,
  onOpenPaySlip,
  onNavigateWorkspace,
  onRecalculatePayroll,
}) => {
  const isMobileLayout = layoutMode === 'mobile';
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'net_desc' | 'hours_desc' | 'name_asc'>('default');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [recalculating, setRecalculating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [yearStr, monthStr] = month.split('-');

  const roles = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return Array.from(set);
  }, [employees]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (selectedEmpId !== 'all' ? 1 : 0) +
    (roleFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0);

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = payrollSummaries.filter((item) => {
      if (selectedEmpId !== 'all' && item.employee.id !== selectedEmpId) return false;
      if (roleFilter !== 'all' && item.employee.department !== roleFilter) return false;
      if (q && !item.employee.name.toLowerCase().includes(q) && !item.employee.department.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    if (sortBy === 'net_desc') {
      return [...list].sort((a, b) => b.netPay - a.netPay);
    }
    if (sortBy === 'hours_desc') {
      return [...list].sort((a, b) => b.totalHours - a.totalHours);
    }
    if (sortBy === 'name_asc') {
      return [...list].sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'vi'));
    }
    return list;
  }, [payrollSummaries, selectedEmpId, roleFilter, search, sortBy]);

  const filteredTotals = useMemo(() => {
    return filteredSummaries.reduce(
      (acc, p) => ({
        hours: Math.round((acc.hours + p.totalHours) * 100) / 100,
        basePay: acc.basePay + p.basePay,
        bonus: acc.bonus + p.totalBonus,
        deduction: acc.deduction + p.totalDeduction,
        netPay: acc.netPay + p.netPay,
      }),
      { hours: 0, basePay: 0, bonus: 0, deduction: 0, netPay: 0 }
    );
  }, [filteredSummaries]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setNotice(null);
    try {
      await onRecalculatePayroll();
      setNotice(`Đã tính lại toàn bộ bảng lương tháng ${monthStr}/${yearStr} theo dữ liệu chấm công và thưởng/trừ mới nhất.`);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setRecalculating(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Thang',
      'HoTen',
      'ViTri',
      'SoCa',
      'TongGioLam',
      'LuongGio_VND',
      'LuongCoBan_VND',
      'ThuongPhuCap_VND',
      'TruLuong_VND',
      'LuongThucNhan_VND',
    ];
    const rows = filteredSummaries.map((p) => [
      month,
      p.employee.name,
      p.employee.department,
      String(p.totalShifts),
      String(p.totalHours),
      String(p.employee.hourlyRate),
      String(p.basePay),
      String(p.totalBonus),
      String(p.totalDeduction),
      String(p.netPay),
    ]);

    const csvContent =
      '\uFEFF' + [header, ...rows].map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bang-luong-changmi-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Mobile Action Bar + Grouped Filter Sheet Trigger */}
      <div className={`${isMobileLayout ? 'flex' : 'flex md:hidden'} items-center justify-between gap-2`}>
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 active:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4 text-slate-600" />
          <span>Bộ lọc & Sắp xếp</span>
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
          onClick={onNavigateWorkspace}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-red-700 px-3.5 text-xs font-semibold text-white active:bg-red-800 whitespace-nowrap"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Google Sheet</span>
        </button>
      </div>

      {/* Desktop Toolbar */}
      <div
        className={`${
          isMobileLayout ? 'hidden' : 'hidden md:flex'
        } flex-col xl:flex-row xl:items-center xl:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên nhân viên..."
              aria-label="Tìm kiếm bảng lương"
              className="h-11 w-48 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="payroll-emp-filter" className="sr-only">
              Lọc theo nhân viên
            </label>
            <select
              id="payroll-emp-filter"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả nhân viên</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="payroll-role-filter" className="sr-only">
              Lọc theo vị trí
            </label>
            <select
              id="payroll-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả vị trí</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
            onClick={handleExportCsv}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất báo cáo CSV
          </button>
          <button
            type="button"
            onClick={onNavigateWorkspace}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Đồng bộ Google Sheets
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {/* Mobile Payroll Summary & Employee Cards */}
      <div className={`space-y-3 ${isMobileLayout ? 'block' : 'md:hidden'}`}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng quỹ lương {monthStr}/{yearStr}</p>
            <p className="mt-1 font-mono tabular-nums text-xl font-bold text-red-700">
              {formatVND(filteredTotals.netPay)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>{filteredSummaries.length} nhân viên</p>
            <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-800">
              {formatHours(filteredTotals.hours)}
            </p>
          </div>
        </div>

        {filteredSummaries.map((item) => (
          <div key={item.employee.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{item.employee.name}</h3>
                <p className="text-xs text-slate-500">
                  {item.employee.department} · {item.totalShifts} ca ·{' '}
                  <span className="font-mono">{formatVND(item.employee.hourlyRate)}/h</span>
                </p>
                {item.incompleteShifts > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {item.incompleteShifts} ca chưa check-out
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">Thực nhận</p>
                <p className="font-mono tabular-nums text-lg font-bold text-red-700">
                  {formatVND(item.netPay)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 border-t border-b border-slate-100 py-2.5 text-xs">
              <div>
                <p className="text-slate-500">Tổng giờ</p>
                <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                  {formatHours(item.totalHours)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Lương cơ bản</p>
                <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                  {formatVND(item.basePay)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Thưởng / Phụ cấp</p>
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

            <button
              type="button"
              onClick={() => onOpenPaySlip(item)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-800 active:bg-slate-100"
            >
              <FileText className="h-4 w-4 text-red-700" />
              <span>Xem & In phiếu lương</span>
            </button>
          </div>
        ))}

        {filteredSummaries.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            {employees.length === 0
              ? 'Chưa có nhân viên để tính lương. Hãy thêm nhân viên ở mục Nhân viên để bắt đầu.'
              : 'Không tìm thấy nhân viên phù hợp với bộ lọc.'}
          </div>
        )}
      </div>

      {/* Desktop Detailed Payroll Table */}
      <div
        className={`${
          isMobileLayout ? 'hidden' : 'hidden md:block'
        } rounded-2xl border border-slate-200 bg-white overflow-hidden`}
      >
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Bảng tổng hợp lương Quán Mì Cay Changmi — Tháng {monthStr}/{yearStr}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Lương Thực Nhận = (Tổng số giờ làm × Lương theo giờ) + Tổng Thưởng - Tổng Trừ
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">
            Tổng toàn quán: {formatVND(stats.totalNetPayroll)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Nhân viên</th>
                <th className="px-4 py-3 whitespace-nowrap">Vị trí</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Số ca</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Tổng giờ</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Đơn giá / h</th>
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
                  <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {item.employee.name}
                    {item.incompleteShifts > 0 && (
                      <span className="block text-xs font-normal text-amber-700">
                        {item.incompleteShifts} ca chưa check-out
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.employee.department}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {item.totalShifts}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                    {formatHours(item.totalHours)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {formatVND(item.employee.hourlyRate)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
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
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-red-700 whitespace-nowrap">
                    {formatVND(item.netPay)}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenPaySlip(item)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Xem phiếu lương
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSummaries.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    {employees.length === 0
                      ? 'Chưa có nhân viên để tính lương. Hãy thêm nhân viên ở mục Nhân viên để bắt đầu.'
                      : 'Không tìm thấy nhân viên phù hợp với bộ lọc.'}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td colSpan={3} className="px-5 py-3 text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">
                  Tổng cộng ({filteredSummaries.length} nhân viên)
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatHours(filteredTotals.hours)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatVND(filteredTotals.basePay)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                  {filteredTotals.bonus > 0 ? `+${formatVND(filteredTotals.bonus)}` : '0 VNĐ'}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                  {filteredTotals.deduction > 0 ? `-${formatVND(filteredTotals.deduction)}` : '0 VNĐ'}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-base text-red-700 whitespace-nowrap">
                  {formatVND(filteredTotals.netPay)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Mobile Filter & Sort Bottom Sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Bộ lọc & Sắp xếp Bảng lương"
        titleId="payroll-filter-title"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="pay-mobile-search" className="block text-xs font-medium text-slate-700 mb-1.5">
              Tìm theo tên nhân viên
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pay-mobile-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nhập tên nhân viên..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pay-mobile-emp" className="block text-xs font-medium text-slate-700 mb-1.5">
              Chọn tên nhân viên
            </label>
            <select
              id="pay-mobile-emp"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="all">Tất cả nhân viên</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pay-mobile-role" className="block text-xs font-medium text-slate-700 mb-1.5">
              Vị trí làm việc
            </label>
            <select
              id="pay-mobile-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="all">Tất cả vị trí</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pay-mobile-sort" className="block text-xs font-medium text-slate-700 mb-1.5">
              Sắp xếp
            </label>
            <select
              id="pay-mobile-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'default' | 'net_desc' | 'hours_desc' | 'name_asc')}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="default">Mặc định</option>
              <option value="net_desc">Thực nhận cao nhất</option>
              <option value="hours_desc">Giờ làm nhiều nhất</option>
              <option value="name_asc">Tên A → Z</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedEmpId('all');
                setRoleFilter('all');
                setSortBy('default');
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
                handleExportCsv();
                setFilterSheetOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>Xuất bảng lương CSV</span>
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
