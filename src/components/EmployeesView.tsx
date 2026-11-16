import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { AttendanceRecord, Employee, LayoutMode } from '../types';
import { calculateShiftHours, DEFAULT_HOURLY_RATE, formatHours, formatVND } from '../utils/payroll';
import { BottomSheet } from './BottomSheet';
import { ConfirmDialog } from './ConfirmDialog';

interface EmployeesViewProps {
  layoutMode: LayoutMode;
  employees: Employee[];
  attendance: AttendanceRecord[];
  month: string;
  quickAddSignal?: number;
  onCreateEmployee: (payload: {
    code?: string;
    name: string;
    phone: string;
    department: string;
    hourlyRate: number;
  }) => Promise<void>;
  onUpdateEmployee: (
    id: string,
    payload: Partial<Pick<Employee, 'code' | 'name' | 'phone' | 'department' | 'hourlyRate' | 'status'>>
  ) => Promise<void>;
  onDeleteEmployee: (id: string, hard: boolean) => Promise<void>;
}

const DEPARTMENT_OPTIONS = ['Phục vụ', 'Bếp', 'Thu ngân', 'Pha chế', 'Quản lý'];

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  layoutMode,
  employees,
  attendance,
  month,
  quickAddSignal,
  onCreateEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
}) => {
  const isMobileLayout = layoutMode === 'mobile';
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'name_asc' | 'hours_desc' | 'rate_desc'>('default');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('Phục vụ');
  const [hourlyRate, setHourlyRate] = useState(String(DEFAULT_HOURLY_RATE));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthlyHoursByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const att of attendance) {
      if (!att.date.startsWith(month)) continue;
      const prev = map.get(att.employeeId) ?? 0;
      map.set(att.employeeId, prev + calculateShiftHours(att.checkIn, att.checkOut, att.status));
    }
    return map;
  }, [attendance, month]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (roleFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = employees.filter((emp) => {
      if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
      if (roleFilter !== 'all' && emp.department !== roleFilter) return false;
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.phone.toLowerCase().includes(q)
      );
    });
    if (sortBy === 'name_asc') {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    if (sortBy === 'hours_desc') {
      return [...list].sort(
        (a, b) => (monthlyHoursByEmployee.get(b.id) ?? 0) - (monthlyHoursByEmployee.get(a.id) ?? 0)
      );
    }
    if (sortBy === 'rate_desc') {
      return [...list].sort((a, b) => b.hourlyRate - a.hourlyRate);
    }
    return list;
  }, [employees, search, roleFilter, statusFilter, sortBy, monthlyHoursByEmployee]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setName('');
    setPhone('');
    setDepartment('Phục vụ');
    setHourlyRate(String(DEFAULT_HOURLY_RATE));
    setFormError(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (quickAddSignal && quickAddSignal > 0) {
      openAddModal();
    }
  }, [quickAddSignal]);

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setPhone(emp.phone);
    setDepartment(emp.department);
    setHourlyRate(String(emp.hourlyRate));
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = name.trim();
    const parsedRate = Number(hourlyRate);

    if (!cleanName) {
      setFormError('Vui lòng nhập Họ và tên nhân viên.');
      return;
    }
    if (Number.isNaN(parsedRate) || parsedRate < 0) {
      setFormError('Mức lương theo giờ phải là số dương.');
      return;
    }

    setSaving(true);
    try {
      if (editingEmployee) {
        await onUpdateEmployee(editingEmployee.id, {
          name: cleanName,
          phone: phone.trim(),
          department,
          hourlyRate: parsedRate,
        });
      } else {
        await onCreateEmployee({
          name: cleanName,
          phone: phone.trim(),
          department,
          hourlyRate: parsedRate,
        });
      }
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Không thể lưu thông tin nhân viên.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    await onUpdateEmployee(emp.id, {
      status: emp.status === 'active' ? 'inactive' : 'active',
    });
  };

  const handleExportStaffCsv = () => {
    const header = ['HoTen', 'ViTri', 'SoDienThoai', 'LuongGio_VND', 'TongGioThang', 'TrangThai'];
    const rows = filteredEmployees.map((emp) => [
      emp.name,
      emp.department,
      emp.phone,
      String(emp.hourlyRate),
      String(Math.round((monthlyHoursByEmployee.get(emp.id) ?? 0) * 100) / 100),
      emp.status === 'active' ? 'Đang làm' : 'Đã nghỉ',
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `danh-sach-nhan-vien-changmi-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Mobile Action Bar + Grouped Filter/Search Sheet Trigger */}
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
          onClick={openAddModal}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-red-700 px-4 text-sm font-medium text-white active:bg-red-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm NV</span>
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
              placeholder="Tìm tên nhân viên, SĐT..."
              aria-label="Tìm kiếm nhân viên"
              className="h-11 w-56 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="emp-role-filter" className="sr-only">
              Lọc theo vị trí
            </label>
            <select
              id="emp-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-red-700 focus:bg-white focus:outline-none"
            >
              <option value="all">Tất cả vị trí</option>
              {DEPARTMENT_OPTIONS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'active', label: 'Đang làm' },
                { id: 'inactive', label: 'Đã nghỉ' },
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportStaffCsv}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            Xuất báo cáo
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Thêm nhân viên
          </button>
        </div>
      </div>

      {/* Mobile Staff Cards */}
      <div className={isMobileLayout ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3 md:hidden'}>
        {filteredEmployees.map((emp) => {
          const totalHours = monthlyHoursByEmployee.get(emp.id) ?? 0;
          return (
            <div
              key={emp.id}
              className={`rounded-2xl border border-slate-200 bg-white p-4 space-y-3 ${
                emp.status === 'inactive' ? 'opacity-70' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{emp.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {emp.department} ·{' '}
                    <span className={emp.status === 'active' ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                      {emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ / Ẩn'}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">Lương giờ</p>
                  <p className="font-mono tabular-nums text-sm font-bold text-slate-900">
                    {formatVND(emp.hourlyRate)}/h
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {emp.phone || 'Chưa có SĐT'}
                </span>
                <span>
                  Giờ {month}:{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatHours(totalHours)}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => openEditModal(emp)}
                  aria-label={`Sửa nhân viên ${emp.name}`}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" />
                  <span>Sửa</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleStatus(emp)}
                  aria-label={
                    emp.status === 'active'
                      ? `Ẩn nhân viên ${emp.name}`
                      : `Khôi phục nhân viên ${emp.name}`
                  }
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-50"
                >
                  {emp.status === 'active' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span>{emp.status === 'active' ? 'Ẩn' : 'Hiện'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(emp)}
                  aria-label={`Xóa nhân viên ${emp.name}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 active:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredEmployees.length === 0 && (
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <p className="text-sm text-slate-600">
              {employees.length === 0
                ? 'Chưa có nhân viên nào trong hệ thống. Hãy thêm nhân viên đầu tiên để bắt đầu chấm công.'
                : 'Không tìm thấy nhân viên phù hợp.'}
            </p>
            {employees.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
              >
                <Plus className="h-4 w-4" />
                <span>Thêm nhân viên đầu tiên</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop Employees Table */}
      <div className={`${isMobileLayout ? 'hidden' : 'hidden md:block'} rounded-2xl border border-slate-200 bg-white overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Họ và tên</th>
                <th className="px-4 py-3 whitespace-nowrap">Vị trí</th>
                <th className="px-4 py-3 whitespace-nowrap">Số điện thoại</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Lương theo giờ</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Giờ làm ({month})</th>
                <th className="px-4 py-3 whitespace-nowrap">Trạng thái</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.map((emp) => {
                const totalHours = monthlyHoursByEmployee.get(emp.id) ?? 0;
                return (
                  <tr
                    key={emp.id}
                    className={`hover:bg-slate-50/70 ${emp.status === 'inactive' ? 'opacity-65' : ''}`}
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">{emp.name}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{emp.department}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{emp.phone || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatVND(emp.hourlyRate)}/h
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatHours(totalHours)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                      <span className={emp.status === 'active' ? 'text-emerald-700' : 'text-slate-500'}>
                        {emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ / Ẩn'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          aria-label={`Sửa nhân viên ${emp.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(emp)}
                          aria-label={
                            emp.status === 'active'
                              ? `Ẩn nhân viên ${emp.name}`
                              : `Khôi phục nhân viên ${emp.name}`
                          }
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          {emp.status === 'active' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(emp)}
                          aria-label={`Xóa nhân viên ${emp.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        {employees.length === 0
                          ? 'Chưa có nhân viên nào trong hệ thống. Hãy thêm nhân viên đầu tiên để bắt đầu.'
                          : 'Không tìm thấy nhân viên phù hợp.'}
                      </p>
                      {employees.length === 0 && (
                        <button
                          type="button"
                          onClick={openAddModal}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Thêm nhân viên đầu tiên</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter & Search Bottom Sheet (Mobile) */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Lọc & Tìm kiếm nhân viên"
        titleId="emp-filter-title"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="emp-mobile-search" className="block text-xs font-medium text-slate-700 mb-1.5">
              Tìm tên hoặc số điện thoại
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="emp-mobile-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nhập tên nhân viên hoặc SĐT..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-red-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="emp-mobile-role" className="block text-xs font-medium text-slate-700 mb-1.5">
              Vị trí làm việc
            </label>
            <select
              id="emp-mobile-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="all">Tất cả vị trí</option>
              {DEPARTMENT_OPTIONS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-1.5">Trạng thái làm việc</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'active', label: 'Đang làm' },
                  { id: 'inactive', label: 'Đã nghỉ' },
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
            <label htmlFor="emp-mobile-sort" className="block text-xs font-medium text-slate-700 mb-1.5">
              Sắp xếp
            </label>
            <select
              id="emp-mobile-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'default' | 'name_asc' | 'hours_desc' | 'rate_desc')}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-red-700 focus:outline-none"
            >
              <option value="default">Mặc định</option>
              <option value="name_asc">Tên A → Z</option>
              <option value="hours_desc">Giờ làm nhiều nhất</option>
              <option value="rate_desc">Lương giờ cao nhất</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
                setStatusFilter('all');
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
                handleExportStaffCsv();
                setFilterSheetOpen(false);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Download className="h-4 w-4" />
              <span>Xuất danh sách CSV</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Add / Edit Employee Bottom Sheet (No Manual ID Entry Required) */}
      <BottomSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEmployee ? `Cập nhật ${editingEmployee.name}` : 'Thêm nhân viên mới'}
        subtitle="Tên nhân viên sẽ tự động xuất hiện trong tất cả Dropdown"
        titleId="employee-modal-title"
        maxWidthClass="sm:max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="emp-name" className="block text-xs font-medium text-slate-700 mb-1.5">
              Họ và tên nhân viên *
            </label>
            <input
              id="emp-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Minh"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 text-sm focus:border-red-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="emp-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                Vị trí làm việc *
              </label>
              <select
                id="emp-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-red-700 focus:outline-none"
              >
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="emp-rate" className="block text-xs font-medium text-slate-700 mb-1.5">
                Lương theo giờ (VNĐ) *
              </label>
              <input
                id="emp-rate"
                type="number"
                min={0}
                step={500}
                required
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm focus:border-red-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="emp-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
              Số điện thoại
            </label>
            <input
              id="emp-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0909 123 456"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-sm focus:border-red-700 focus:outline-none"
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
              {saving ? 'Đang lưu...' : editingEmployee ? 'Lưu thay đổi' : 'Thêm nhân viên'}
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Xóa vĩnh viễn nhân viên ${confirmDelete?.name ?? ''}?`}
        description="Thao tác này sẽ xóa hồ sơ nhân viên cùng toàn bộ lịch sử chấm công và thưởng/trừ liên quan khỏi hệ thống. Nếu chỉ muốn ẩn nhân viên đã nghỉ, hãy dùng nút Ẩn."
        confirmLabel="Xóa vĩnh viễn"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await onDeleteEmployee(confirmDelete.id, true);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
};
