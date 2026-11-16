import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Download,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Webhook,
} from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus, Employee, LayoutMode } from '../types';
import { calculateShiftHours, formatHours, isDateInRange } from '../utils/payroll';
import { BottomSheet } from './BottomSheet';
import { ConfirmDialog } from './ConfirmDialog';

interface AttendanceViewProps {
  layoutMode: LayoutMode;
  employees: Employee[];
  attendance: AttendanceRecord[];
  month: string;
  webhookSecret: string;
  quickManualSignal?: number;
  quickWebhookSignal?: number;
  onCreateAttendance: (payload: {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    status: AttendanceStatus;
    note: string;
  }) => Promise<void>;
  onUpdateAttendance: (
    id: string,
    payload: {
      employeeId: string;
      date: string;
      checkIn: string;
      checkOut: string | null;
      status: AttendanceStatus;
      note: string;
    }
  ) => Promise<void>;
  onDeleteAttendance: (id: string) => Promise<void>;
  onSimulateWebhook: (payload: {
    secret: string;
    employeeId: string;
    employeeName: string;
    action: 'checkin' | 'checkout';
    date: string;
    time: string;
    note: string;
  }) => Promise<void>;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Có mặt',
  late: 'Đi trễ',
  absent: 'Vắng',
};

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  layoutMode,
  employees,
  attendance,
  month,
  webhookSecret,
  quickManualSignal,
  quickWebhookSignal,
  onCreateAttendance,
  onUpdateAttendance,
  onDeleteAttendance,
  onSimulateWebhook,
}) => {
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent' | 'incomplete'>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'hours_desc'>('date_desc');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttendanceRecord | null>(null);

  // Dropdown-based Employee selection (NO manual ID typing)
  const [empId, setEmpId] = useState(employees[0]?.id ?? '');
  const [date, setDate] = useState(`${month}-14`);
  const [checkIn, setCheckIn] = useState('08:00');
  const [checkOut, setCheckOut] = useState('16:30');
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('present');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Webhook simulator modal state (Dropdown-based Employee selection)
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [whEmpId, setWhEmpId] = useState(employees[0]?.id ?? '');
  const [whAction, setWhAction] = useState<'checkin' | 'checkout'>('checkout');
  const [whDate, setWhDate] = useState(`${month}-14`);
  const [whTime, setWhTime] = useState('16:30');
  const [whNote, setWhNote] = useState('Điểm danh từ Google Form');
  const [whError, setWhError] = useState<string | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'active'), [employees]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (selectedEmpId !== 'all' ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'date_desc' ? 1 : 0);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = attendance.filter((r) => {
      if (!r.date.startsWith(month)) return false;
      if (!isDateInRange(r.date, dateFrom, dateTo)) return false;
      if (selectedEmpId !== 'all' && r.employeeId !== selectedEmpId) return false;
      const emp = empById.get(r.employeeId);
      if (q && !(emp?.name ?? '').toLowerCase().includes(q) && !r.note.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'incomplete') return !r.checkOut && r.status !== 'absent';
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });

    if (sortBy === 'date_asc') {
      return [...list].sort((a, b) => (a.date === b.date ? a.checkIn.localeCompare(b.checkIn) : a.date.localeCompare(b.date)));
    }
    if (sortBy === 'hours_desc') {
      return [...list].sort(
        (a, b) =>
          calculateShiftHours(b.checkIn, b.checkOut, b.status) -
          calculateShiftHours(a.checkIn, a.checkOut, a.status)
      );
    }
    return [...list].sort((a, b) => (a.date === b.date ? b.checkIn.localeCompare(a.checkIn) : b.date.localeCompare(a.date)));
  }, [attendance, month, dateFrom, dateTo, selectedEmpId, search, statusFilter, sortBy, empById]);

  const employeeHoursSummary = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of attendance) {
      if (!r.date.startsWith(month)) continue;
      totals.set(
        r.employeeId,
        (totals.get(r.employeeId) ?? 0) + calculateShiftHours(r.checkIn, r.checkOut, r.status)
      );
    }
    return employees.map((emp) => ({
      employee: emp,
      hours: Math.round((totals.get(emp.id) ?? 0) * 100) / 100,
    }));
  }, [attendance, employees, month]);

  const openAddModal = () => {
    setEditingRecord(null);
    setEmpId(selectedEmpId !== 'all' ? selectedEmpId : activeEmployees[0]?.id ?? employees[0]?.id ?? '');
    setDate(`${month}-14`);
    setCheckIn('08:00');
    setCheckOut('16:30');
    setAttStatus('present');
    setNote('');
    setFormError(null);
    setModalOpen(true);
  };

  const openWebhookModal = () => {
    setWhError(null);
    setWhEmpId(activeEmployees[0]?.id ?? employees[0]?.id ?? '');
    setWhDate(`${month}-14`);
    setWebhookModalOpen(true);
  };

  useEffect(() => {
    if (quickManualSignal && quickManualSignal > 0) {
      openAddModal();
    }
  }, [quickManualSignal]);

  useEffect(() => {
    if (quickWebhookSignal && quickWebhookSignal > 0) {
      openWebhookModal();
    }
  }, [quickWebhookSignal]);

  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEmpId(rec.employeeId);
    setDate(rec.date);
    setCheckIn(rec.checkIn || '08:00');
    setCheckOut(rec.checkOut ?? '');
    setAttStatus(rec.status ?? 'present');
    setNote(rec.note);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!empId || !date || (attStatus !== 'absent' && !checkIn)) {
      setFormError('Vui lòng chọn Tên nhân viên, Ngày làm và Giờ vào ca.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        employeeId: empId,
        date,
        checkIn: attStatus === 'absent' ? '00:00' : checkIn,
        checkOut: attStatus === 'absent' ? null : checkOut.trim() ? checkOut.trim() : null,
        status: attStatus,
        note: note.trim(),
      };
      if (editingRecord) {
        await onUpdateAttendance(editingRecord.id, payload);
      } else {
        await onCreateAttendance(payload);
      }
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Không thể lưu dữ liệu chấm công.');
    } finally {
      setSaving(false);
    }
  };

  const handleWebhookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhError(null);
    const chosenEmp = empById.get(whEmpId);
    if (!chosenEmp) {
      setWhError('Vui lòng chọn tên nhân viên.');
      return;
    }

    setSaving(true);
    try {
      await onSimulateWebhook({
        secret: webhookSecret,
        employeeId: chosenEmp.id,
        employeeName: chosenEmp.name,
        action: whAction,
        date: whDate,
        time: whTime,
        note: whNote,
      });
      setWebhookModalOpen(false);
    } catch (err: any) {
      setWhError(err?.message || 'Không thể gửi dữ liệu điểm danh.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportAttendanceCsv = () => {
    const header = ['Ngay', 'TenNhanVien', 'ViTri', 'CheckIn', 'CheckOut', 'SoGio', 'TrangThai', 'Nguon', 'GhiChu'];
    const rows = filteredRecords.map((rec) => {
      const emp = empById.get(rec.employeeId);
      const hrs = calculateShiftHours(rec.checkIn, rec.checkOut, rec.status);
      return [
        rec.date,
        emp?.name ?? rec.employeeCode,
        emp?.department ?? '',
        rec.status === 'absent' ? '—' : rec.checkIn,
        rec.status === 'absent' ? '—' : rec.checkOut ?? 'Chưa check-out',
        String(hrs),
        STATUS_LABELS[rec.status ?? 'present'],
        rec.source,
        rec.note,
      ];
    });
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nhat-ky-cham-cong-changmi-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedEmpId('all');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setSortBy('date_desc');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Monthly Hour Summary Strip (2-col on mobile, 4-col on lg) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {employeeHoursSummary.map(({ employee, hours }) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => setSelectedEmpId(selectedEmpId === employee.id ? 'all' : employee.id)}
            className={`flex min-h-[56px] items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
              selectedEmpId === employee.id
                ? 'border-red-700 bg-red-50/70'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{employee.name}</p>
              <p className="text-xs text-slate-500 truncate">{employee.department}</p>
            </div>
            <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-slate-900 shrink-0">
              {formatHours(hours)}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile Compact Action Bar + Grouped Filter Sheet Trigger */}
      <div className={`${layoutMode === 'mobile' ? 'flex' : 'flex md:hidden'} items-center justify-between gap-2`}>
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
          onClick={openWebhookModal}
          aria-label="Test Google Form Webhook"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-slate-700 active:bg-slate-50"
        >
          <Webhook className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-red-700 px-3.5 text-sm font-medium text-white active:bg-red-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>Chấm công</span>
        </button>
      </div>

      {/* Desktop Toolbar */}
      <div
        className={`${
          layoutMode === 'mobile' ? 'hidden' : 'hidden md:block'
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
                placeholder="Tìm tên, ghi chú..."
                aria-label="Tìm kiếm chấm công"
                className="h-11 w-48 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="att-emp-filter" className="sr-only">
                Chọn tên nhân viên
              </label>
              <select
                id="att-emp-filter"
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

            <div className="flex items-center gap-1.5">
              <label htmlFor="att-date-from" className="text-xs text-slate-500 whitespace-nowrap">
                Từ
              </label>
              <input
                id="att-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
              />
              <label htmlFor="att-date-to" className="text-xs text-slate-500 whitespace-nowrap">
                Đến
              </label>
              <input
                id="att-date-to"
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
              onClick={handleExportAttendanceCsv}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất báo cáo
            </button>
            <button
              type="button"
              onClick={openWebhookModal}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Webhook className="h-3.5 w-3.5 text-slate-500" />
              Test Google Form Webhook
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Sửa chấm công thủ công
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Tất cả ca' },
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
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === opt.id
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

      {/* Mobile Attendance Cards */}
      <div
        className={
          layoutMode === 'mobile' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3 md:hidden'
        }
      >
        {filteredRecords.map((rec) => {
          const emp = empById.get(rec.employeeId);
          const status = rec.status ?? 'present';
          const computedHours = calculateShiftHours(rec.checkIn, rec.checkOut, status);
          const sourceLabel =
            rec.source === 'google_form' ? 'Google Form' : rec.source === 'webhook' ? 'Webhook' : 'Admin nhập';

          return (
            <div key={rec.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base font-semibold text-slate-900">
                      {emp?.name ?? rec.employeeCode}
                    </h3>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{emp?.department ?? 'Phục vụ'}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="font-mono text-slate-700">{rec.date}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span
                      className={`font-medium ${
                        status === 'absent'
                          ? 'text-red-700'
                          : status === 'late'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-base font-bold text-slate-900">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {formatHours(computedHours)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <div className="font-mono tabular-nums text-slate-800">
                  {status === 'absent' ? (
                    <span className="text-slate-500">Nghỉ / Vắng</span>
                  ) : (
                    <span>
                      Vào <strong className="font-semibold">{rec.checkIn}</strong> · Ra{' '}
                      {rec.checkOut ? (
                        <strong className="font-semibold">{rec.checkOut}</strong>
                      ) : (
                        <span className="font-sans font-semibold text-amber-700">Chưa check-out</span>
                      )}
                    </span>
                  )}
                </div>
                <span className="text-slate-500">
                  {sourceLabel}
                  {rec.editedByAdmin ? ' · Đã sửa' : ''}
                </span>
              </div>

              {rec.note && (
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
                  {rec.note}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => openEditModal(rec)}
                  aria-label={`Sửa chấm công ${emp?.name ?? rec.employeeCode} ngày ${rec.date}`}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                  <span>Chỉnh sửa ca</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(rec)}
                  aria-label={`Xóa chấm công ${emp?.name ?? rec.employeeCode} ngày ${rec.date}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 active:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredRecords.length === 0 && (
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            {employees.length === 0
              ? 'Chưa có nhân viên nào. Vui lòng thêm nhân viên trước khi ghi nhận chấm công.'
              : `Không có lịch sử chấm công phù hợp trong tháng ${month}.`}
          </div>
        )}
      </div>

      {/* Desktop Attendance Table */}
      <div
        className={`${
          layoutMode === 'mobile' ? 'hidden' : 'hidden md:block'
        } rounded-2xl border border-slate-200 bg-white overflow-hidden`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Ngày</th>
                <th className="px-4 py-3 whitespace-nowrap">Nhân viên</th>
                <th className="px-4 py-3 whitespace-nowrap">Check-in</th>
                <th className="px-4 py-3 whitespace-nowrap">Check-out</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Số giờ</th>
                <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                <th className="px-4 py-3 whitespace-nowrap">Nguồn</th>
                <th className="px-4 py-3 whitespace-nowrap">Ghi chú</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Chỉnh sửa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRecords.map((rec) => {
                const emp = empById.get(rec.employeeId);
                const status = rec.status ?? 'present';
                const computedHours = calculateShiftHours(rec.checkIn, rec.checkOut, status);
                return (
                  <tr key={rec.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{rec.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{emp?.name ?? rec.employeeCode}</span>
                      <span className="ml-1.5 text-xs text-slate-500">· {emp?.department ?? 'Phục vụ'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {status === 'absent' ? '—' : rec.checkIn}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap">
                      {status === 'absent' ? (
                        <span className="text-slate-400">—</span>
                      ) : rec.checkOut ? (
                        <span className="text-slate-900">{rec.checkOut}</span>
                      ) : (
                        <span className="text-amber-700 font-sans text-xs font-medium">Chưa check-out</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatHours(computedHours)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          status === 'absent'
                            ? 'text-red-700'
                            : status === 'late'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      <span>
                        {rec.source === 'google_form'
                          ? 'Google Form'
                          : rec.source === 'webhook'
                          ? 'Webhook'
                          : 'Admin nhập'}
                      </span>
                      {rec.editedByAdmin && (
                        <>
                          <span className="mx-1 text-slate-300">·</span>
                          <span className="text-amber-700 font-medium">Đã sửa</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={rec.note}>
                      {rec.note || '—'}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(rec)}
                          aria-label={`Sửa chấm công ${emp?.name ?? rec.employeeCode} ngày ${rec.date}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(rec)}
                          aria-label={`Xóa chấm công ${emp?.name ?? rec.employeeCode} ngày ${rec.date}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">
                    Không có lịch sử chấm công phù hợp trong tháng {month}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Filter, Search & Sort Bottom Sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Bộ lọc & Tìm kiếm chấm công"
        titleId="att-filter-title"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="att-mobile-search" className="block text-xs font-medium text-slate-700 mb-1.5">
              Tìm tên hoặc ghi chú
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="att-mobile-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nhập tên, ghi chú ca..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="att-mobile-emp" className="block text-xs font-medium text-slate-700 mb-1.5">
              Chọn tên nhân viên
            </label>
            <select
              id="att-mobile-emp"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="att-mobile-from" className="block text-xs font-medium text-slate-700 mb-1.5">
                Từ ngày
              </label>
              <input
                id="att-mobile-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-red-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="att-mobile-to" className="block text-xs font-medium text-slate-700 mb-1.5">
                Đến ngày
              </label>
              <input
                id="att-mobile-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 focus:border-red-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">Trạng thái ca làm</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'all', label: 'Tất cả ca' },
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
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium ${
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
            <label htmlFor="att-mobile-sort" className="block text-xs font-medium text-slate-700 mb-1.5">
              Sắp xếp
            </label>
            <select
              id="att-mobile-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'date_asc' | 'hours_desc')}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="date_desc">Mới nhất trước</option>
              <option value="date_asc">Cũ nhất trước</option>
              <option value="hours_desc">Số giờ làm nhiều nhất</option>
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
                handleExportAttendanceCsv();
                setFilterSheetOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>Xuất báo cáo chấm công CSV</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Manual Add / Edit Attendance Bottom Sheet — Name Dropdown Only */}
      <BottomSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRecord ? 'Chỉnh sửa chấm công' : 'Chấm công thủ công'}
        subtitle="Chọn tên nhân viên từ danh sách quán"
        titleId="att-modal-title"
        maxWidthClass="sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {formError}
            </div>
          )}

          {employees.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Chưa có nhân viên trong danh sách quán. Vui lòng thêm nhân viên trước khi chấm công.
            </div>
          )}

          <div>
            <label htmlFor="att-employee" className="block text-xs font-medium text-slate-700 mb-1.5">
              Chọn tên nhân viên *
            </label>
            <select
              id="att-employee"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="att-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                Ngày làm việc *
              </label>
              <input
                id="att-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="att-status" className="block text-xs font-medium text-slate-700 mb-1.5">
                Trạng thái ca *
              </label>
              <select
                id="att-status"
                value={attStatus}
                onChange={(e) => setAttStatus(e.target.value as AttendanceStatus)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none"
              >
                <option value="present">Có mặt</option>
                <option value="late">Đi trễ</option>
                <option value="absent">Vắng</option>
              </select>
            </div>
          </div>

          {attStatus !== 'absent' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="att-checkin" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Giờ Check-in *
                </label>
                <input
                  id="att-checkin"
                  type="time"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="att-checkout" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Giờ Check-out
                </label>
                <input
                  id="att-checkout"
                  type="time"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
            <span>Số giờ làm tính tự động:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {attStatus === 'absent'
                ? '0 giờ (Vắng)'
                : checkOut
                ? formatHours(calculateShiftHours(checkIn, checkOut, attStatus))
                : '0 giờ (Chưa check-out)'}
            </span>
          </div>

          <div>
            <label htmlFor="att-note" className="block text-xs font-medium text-slate-700 mb-1.5">
              Lý do sửa / Ghi chú ca làm
            </label>
            <input
              id="att-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Quên check-in buổi sáng, đi làm bù..."
              className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 text-sm focus:border-red-700 focus:outline-none"
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
              {saving ? 'Đang lưu...' : editingRecord ? 'Cập nhật ca' : 'Lưu chấm công'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Test Google Form Webhook Bottom Sheet — Name Dropdown Only */}
      <BottomSheet
        open={webhookModalOpen}
        onClose={() => setWebhookModalOpen(false)}
        title="Giả lập Google Form Webhook"
        subtitle="Gửi phản hồi điểm danh theo tên nhân viên"
        titleId="wh-modal-title"
        maxWidthClass="sm:max-w-md"
      >
        <form onSubmit={handleWebhookSubmit} className="space-y-4">
          {whError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {whError}
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Mô phỏng nhân viên chọn tên từ Dropdown trên Google Form và gửi về hệ thống. Nếu chọn Check-out, hệ thống sẽ tự ghép với ca chưa check-out trong ngày.
          </p>

          {employees.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Chưa có nhân viên trong danh sách quán. Hãy thêm nhân viên trước khi gửi điểm danh.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wh-emp" className="block text-xs font-medium text-slate-700 mb-1.5">
                Chọn tên nhân viên *
              </label>
              <select
                id="wh-emp"
                value={whEmpId}
                onChange={(e) => setWhEmpId(e.target.value)}
                disabled={employees.length === 0}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none disabled:bg-slate-50"
              >
                {employees.length === 0 ? (
                  <option value="">Chưa có nhân viên</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="wh-action" className="block text-xs font-medium text-slate-700 mb-1.5">
                Loại chấm công
              </label>
              <select
                id="wh-action"
                value={whAction}
                onChange={(e) => setWhAction(e.target.value as 'checkin' | 'checkout')}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none"
              >
                <option value="checkin">Check-in (Vào ca)</option>
                <option value="checkout">Check-out (Tan ca)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wh-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                Ngày
              </label>
              <input
                id="wh-date"
                type="date"
                required
                value={whDate}
                onChange={(e) => setWhDate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="wh-time" className="block text-xs font-medium text-slate-700 mb-1.5">
                Giờ gửi Form
              </label>
              <input
                id="wh-time"
                type="time"
                required
                value={whTime}
                onChange={(e) => setWhTime(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-red-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="wh-note" className="block text-xs font-medium text-slate-700 mb-1.5">
              Ghi chú gửi kèm
            </label>
            <input
              id="wh-note"
              type="text"
              value={whNote}
              onChange={(e) => setWhNote(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 text-sm focus:border-red-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setWebhookModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Đang gửi...' : 'Gửi dữ liệu'}
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Xóa bản ghi chấm công?"
        description={`Bạn sắp xóa lượt chấm công ngày ${confirmDelete?.date ?? ''} (${confirmDelete?.checkIn ?? ''} – ${
          confirmDelete?.checkOut ?? 'Chưa ra'
        }). Tổng giờ làm tháng của nhân viên sẽ được tính lại ngay lập tức.`}
        confirmLabel="Xóa bản ghi"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await onDeleteAttendance(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
};
