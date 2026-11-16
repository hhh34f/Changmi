import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { AdjustmentRecord, AdjustmentType, Employee, LayoutMode } from '../types';
import { formatVND, isDateInRange } from '../utils/payroll';
import { BottomSheet } from './BottomSheet';
import { ConfirmDialog } from './ConfirmDialog';

interface AdjustmentsViewProps {
  layoutMode: LayoutMode;
  employees: Employee[];
  adjustments: AdjustmentRecord[];
  month: string;
  quickBonusSignal?: number;
  quickDeductionSignal?: number;
  onCreateAdjustment: (payload: {
    employeeId: string;
    date: string;
    type: AdjustmentType;
    category: string;
    amount: number;
    reason: string;
  }) => Promise<void>;
  onDeleteAdjustment: (id: string) => Promise<void>;
}

const BONUS_CATEGORIES = ['Thưởng hiệu suất', 'Tiền tip & Phụ cấp', 'Phụ cấp ca gãy / Lễ', 'Thưởng chuyên cần', 'Khác'];
const DEDUCTION_CATEGORIES = ['Đi trễ / Về sớm', 'Nghỉ không phép', 'Làm vỡ / hỏng đồ dùng', 'Tạm ứng lương', 'Khác'];

export const AdjustmentsView: React.FC<AdjustmentsViewProps> = ({
  layoutMode,
  employees,
  adjustments,
  month,
  quickBonusSignal,
  quickDeductionSignal,
  onCreateAdjustment,
  onDeleteAdjustment,
}) => {
  const isMobileLayout = layoutMode === 'mobile';
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AdjustmentType>('all');
  const [empFilter, setEmpFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'amount_desc'>('date_desc');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdjustmentRecord | null>(null);

  const [empId, setEmpId] = useState(employees[0]?.id ?? '');
  const [type, setType] = useState<AdjustmentType>('bonus');
  const [category, setCategory] = useState(BONUS_CATEGORIES[0]);
  const [date, setDate] = useState(`${month}-14`);
  const [amount, setAmount] = useState('100000');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (empFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (sortBy !== 'date_desc' ? 1 : 0);

  const monthRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = adjustments.filter((a) => {
      if (!a.date.startsWith(month)) return false;
      if (!isDateInRange(a.date, dateFrom, dateTo)) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (empFilter !== 'all' && a.employeeId !== empFilter) return false;
      if (q) {
        const empName = (empById.get(a.employeeId)?.name ?? '').toLowerCase();
        if (
          !empName.includes(q) &&
          !a.category.toLowerCase().includes(q) &&
          !a.reason.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
    if (sortBy === 'amount_desc') {
      return [...list].sort((a, b) => b.amount - a.amount);
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [adjustments, month, dateFrom, dateTo, typeFilter, empFilter, search, sortBy, empById]);

  const totals = useMemo(() => {
    let bonus = 0;
    let deduction = 0;
    for (const r of monthRecords) {
      if (r.type === 'bonus') bonus += r.amount;
      else deduction += r.amount;
    }
    return { bonus, deduction, net: bonus - deduction };
  }, [monthRecords]);

  const openModal = (initialType: AdjustmentType) => {
    setType(initialType);
    setCategory(initialType === 'bonus' ? BONUS_CATEGORIES[0] : DEDUCTION_CATEGORIES[0]);
    setEmpId(empFilter !== 'all' ? empFilter : employees[0]?.id ?? '');
    setDate(`${month}-14`);
    setAmount(initialType === 'bonus' ? '100000' : '50000');
    setReason('');
    setFormError(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (quickBonusSignal && quickBonusSignal > 0) {
      openModal('bonus');
    }
  }, [quickBonusSignal]);

  useEffect(() => {
    if (quickDeductionSignal && quickDeductionSignal > 0) {
      openModal('deduction');
    }
  }, [quickDeductionSignal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const numAmount = Math.round(Number(amount));
    if (!empId || !date || !numAmount || numAmount <= 0) {
      setFormError('Vui lòng chọn nhân viên, ngày và nhập số tiền lớn hơn 0.');
      return;
    }

    setSaving(true);
    try {
      await onCreateAdjustment({
        employeeId: empId,
        date,
        type,
        category,
        amount: numAmount,
        reason: reason.trim(),
      });
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Không thể lưu khoản thưởng/trừ.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const header = ['Ngay', 'TenNhanVien', 'PhanLoai', 'HangMuc', 'SoTien_VND', 'LyDo'];
    const rows = monthRecords.map((item) => [
      item.date,
      empById.get(item.employeeId)?.name ?? item.employeeCode,
      item.type === 'bonus' ? 'Thưởng / Phụ cấp' : 'Trừ lương',
      item.category,
      String(item.amount),
      item.reason,
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `thuong-tru-changmi-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setEmpFilter('all');
    setDateFrom('');
    setDateTo('');
    setTypeFilter('all');
    setSortBy('date_desc');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Totals Strip (2-col + full on mobile, 3-col on sm+) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <p className="text-xs font-medium text-slate-500">Thưởng & Phụ cấp</p>
          <p className="mt-1 font-mono tabular-nums text-lg sm:text-xl font-bold text-emerald-700">
            + {formatVND(totals.bonus)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <p className="text-xs font-medium text-slate-500">Khoản Trừ lương</p>
          <p className="mt-1 font-mono tabular-nums text-lg sm:text-xl font-bold text-red-700">
            - {formatVND(totals.deduction)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <p className="text-xs font-medium text-slate-500">Chênh lệch điều chỉnh ({month})</p>
          <p className="mt-1 font-mono tabular-nums text-lg sm:text-xl font-bold text-slate-900">
            {totals.net >= 0 ? '+' : ''}
            {formatVND(totals.net)}
          </p>
        </div>
      </div>

      {/* Mobile Compact Action Bar + Grouped Filter Trigger */}
      <div className={`${isMobileLayout ? 'flex' : 'flex md:hidden'} items-center justify-between gap-2`}>
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 active:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4 text-slate-600" />
          <span>Bộ lọc</span>
          {activeFilterCount > 0 && (
            <span className="font-mono text-xs font-semibold text-red-700">({activeFilterCount})</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => openModal('deduction')}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 active:bg-red-100 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Trừ</span>
        </button>

        <button
          type="button"
          onClick={() => openModal('bonus')}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-2xl bg-red-700 px-3.5 text-xs font-semibold text-white active:bg-red-800 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Thưởng</span>
        </button>
      </div>

      {/* Desktop Toolbar */}
      <div
        className={`${
          isMobileLayout ? 'hidden' : 'hidden md:block'
        } space-y-3 rounded-2xl border border-slate-200 bg-white p-4`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, lý do..."
                aria-label="Tìm kiếm thưởng trừ"
                className="h-11 w-48 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="adj-emp-filter" className="sr-only">
                Chọn tên nhân viên
              </label>
              <select
                id="adj-emp-filter"
                value={empFilter}
                onChange={(e) => setEmpFilter(e.target.value)}
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

            <div className="flex items-center gap-1.5">
              <label htmlFor="adj-date-from" className="text-xs text-slate-500 whitespace-nowrap">
                Từ
              </label>
              <input
                id="adj-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
              />
              <label htmlFor="adj-date-to" className="text-xs text-slate-500 whitespace-nowrap">
                Đến
              </label>
              <input
                id="adj-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất báo cáo
            </button>
            <button
              type="button"
              onClick={() => openModal('deduction')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800 hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Thêm khoản trừ
            </button>
            <button
              type="button"
              onClick={() => openModal('bonus')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Thêm thưởng / phụ cấp
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'bonus', label: 'Thưởng / Phụ cấp' },
                { id: 'deduction', label: 'Trừ lương' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[36px] px-2 text-xs font-medium text-red-700 hover:text-red-800 whitespace-nowrap"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Mobile Cards */}
      <div className={isMobileLayout ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3 md:hidden'}>
        {monthRecords.map((item) => {
          const emp = empById.get(item.employeeId);
          return (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base font-semibold text-slate-900">
                      {emp?.name ?? item.employeeCode}
                    </h3>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{emp?.department ?? 'Phục vụ'}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    <span className="font-mono">{item.date}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className={`font-medium ${item.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {item.type === 'bonus' ? 'Cộng thưởng' : 'Trừ lương'}
                    </span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span>{item.category}</span>
                  </p>
                </div>

                <span
                  className={`font-mono tabular-nums text-base font-bold shrink-0 ${
                    item.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {item.type === 'bonus' ? '+' : '-'}
                  {formatVND(item.amount)}
                </span>
              </div>

              {item.reason && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 leading-relaxed">
                  {item.reason}
                </p>
              )}

              <div className="flex justify-end border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(item)}
                  aria-label={`Xóa khoản ${item.category} của ${emp?.name ?? item.employeeCode}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 text-xs font-semibold text-red-700 active:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Xóa khoản này</span>
                </button>
              </div>
            </div>
          );
        })}

        {monthRecords.length === 0 && (
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Chưa có khoản thưởng, phụ cấp hoặc trừ lương phù hợp trong tháng {month}.
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div
        className={`${
          isMobileLayout ? 'hidden' : 'hidden md:block'
        } rounded-2xl border border-slate-200 bg-white overflow-hidden`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Ngày</th>
                <th className="px-4 py-3 whitespace-nowrap">Nhân viên</th>
                <th className="px-4 py-3 whitespace-nowrap">Phân loại</th>
                <th className="px-4 py-3 whitespace-nowrap">Hạng mục</th>
                <th className="px-4 py-3 whitespace-nowrap">Lý do / Ghi chú</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Số tiền</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {monthRecords.map((item) => {
                const emp = empById.get(item.employeeId);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{item.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{emp?.name ?? item.employeeCode}</span>
                      <span className="ml-1.5 text-xs text-slate-500">· {emp?.department ?? 'Phục vụ'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                      <span className={item.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'}>
                        {item.type === 'bonus' ? 'Cộng thưởng' : 'Trừ lương'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{item.category}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-sm">{item.reason || '—'}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        item.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {item.type === 'bonus' ? '+' : '-'}
                      {formatVND(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(item)}
                        aria-label={`Xóa khoản ${item.category} của ${emp?.name ?? item.employeeCode}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {monthRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Chưa có khoản thưởng, phụ cấp hoặc trừ lương phù hợp trong tháng {month}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Filter & Sort Bottom Sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Bộ lọc & Tìm kiếm Thưởng / Trừ"
        titleId="adj-filter-title"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="adj-mobile-search" className="block text-xs font-medium text-slate-700 mb-1.5">
              Tìm tên hoặc lý do
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="adj-mobile-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nhập tên, hạng mục, lý do..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adj-mobile-emp" className="block text-xs font-medium text-slate-700 mb-1.5">
              Chọn tên nhân viên
            </label>
            <select
              id="adj-mobile-emp"
              value={empFilter}
              onChange={(e) => setEmpFilter(e.target.value)}
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
            <p className="text-xs font-medium text-slate-700 mb-1.5">Phân loại</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'bonus', label: 'Thưởng' },
                  { id: 'deduction', label: 'Trừ lương' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium ${
                    typeFilter === opt.id
                      ? 'border-red-700 bg-red-50 text-red-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-mobile-from" className="block text-xs font-medium text-slate-700 mb-1.5">
                Từ ngày
              </label>
              <input
                id="adj-mobile-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-red-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="adj-mobile-to" className="block text-xs font-medium text-slate-700 mb-1.5">
                Đến ngày
              </label>
              <input
                id="adj-mobile-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-red-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adj-mobile-sort" className="block text-xs font-medium text-slate-700 mb-1.5">
              Sắp xếp
            </label>
            <select
              id="adj-mobile-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'amount_desc')}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="date_desc">Mới nhất trước</option>
              <option value="amount_desc">Số tiền lớn nhất</option>
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
                handleExportCsv();
                setFilterSheetOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>Xuất báo cáo Thưởng & Trừ CSV</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Add Adjustment Bottom Sheet — Name Dropdown Only */}
      <BottomSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={type === 'bonus' ? 'Thêm Thưởng / Phụ cấp' : 'Thêm Khoản Trừ lương'}
        subtitle="Chọn tên nhân viên để cộng hoặc trừ vào kỳ lương"
        titleId="adj-modal-title"
        maxWidthClass="sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setType('bonus');
                setCategory(BONUS_CATEGORIES[0]);
              }}
              className={`min-h-[40px] rounded-lg py-1.5 text-xs font-medium transition-colors ${
                type === 'bonus' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              Thưởng / Phụ cấp (+)
            </button>
            <button
              type="button"
              onClick={() => {
                setType('deduction');
                setCategory(DEDUCTION_CATEGORIES[0]);
              }}
              className={`min-h-[40px] rounded-lg py-1.5 text-xs font-medium transition-colors ${
                type === 'deduction' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              Trừ lương (-)
            </button>
          </div>

          {employees.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Chưa có nhân viên nào. Vui lòng thêm nhân viên trước khi tạo khoản thưởng hoặc trừ lương.
            </div>
          )}

          <div>
            <label htmlFor="adj-emp" className="block text-xs font-medium text-slate-700 mb-1.5">
              Chọn tên nhân viên *
            </label>
            <select
              id="adj-emp"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              disabled={employees.length === 0}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none disabled:bg-slate-50"
            >
              {employees.length === 0 ? (
                <option value="">Chưa có nhân viên</option>
              ) : (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.department}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-cat" className="block text-xs font-medium text-slate-700 mb-1.5">
                Hạng mục *
              </label>
              <select
                id="adj-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none"
              >
                {(type === 'bonus' ? BONUS_CATEGORIES : DEDUCTION_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="adj-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                Ngày phát sinh *
              </label>
              <input
                id="adj-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adj-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
              Số tiền (VNĐ) *
            </label>
            <input
              id="adj-amount"
              type="number"
              min={1000}
              step={1000}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm focus:border-red-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="adj-reason" className="block text-xs font-medium text-slate-700 mb-1.5">
              Lý do / Ghi chú chi tiết
            </label>
            <textarea
              id="adj-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                type === 'bonus'
                  ? 'VD: Thưởng phụ quán ngày đông khách, chia tiền tip...'
                  : 'VD: Đi trễ 20 phút, làm vỡ chén...'
              }
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-red-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : 'Lưu điều chỉnh'}
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Xóa khoản thưởng / trừ lương?"
        description={`Bạn sắp xóa khoản "${confirmDelete?.category ?? ''}" (${formatVND(
          confirmDelete?.amount ?? 0
        )}). Bảng lương tháng sẽ tự động cập nhật lại.`}
        confirmLabel="Xóa khoản này"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await onDeleteAdjustment(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
};
