import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEmployeePayroll,
  calculateMonthlyOverview,
  calculateShiftHours,
  findEmployeeByNameOrCode,
  formatVND,
  isDateInRange,
  normalizeFormDate,
  normalizeFormTime,
} from './payroll';
import type { AdjustmentRecord, AttendanceRecord, Employee } from '../types';

const hien: Employee = {
  id: 'emp-001',
  code: 'EMP001',
  name: 'Hiền',
  phone: '0901 234 567',
  department: 'Phục vụ',
  hourlyRate: 20000,
  status: 'active',
  createdAt: '2026-11-01T08:00:00.000Z',
};

const linh: Employee = {
  id: 'emp-002',
  code: 'EMP002',
  name: 'Linh',
  phone: '0907 654 321',
  department: 'Phục vụ',
  hourlyRate: 20000,
  status: 'active',
  createdAt: '2026-11-01T08:00:00.000Z',
};

test('calculateShiftHours calculates standard, overnight, missing, and absent shifts accurately', () => {
  assert.equal(calculateShiftHours('08:00', '16:30'), 8.5);
  assert.equal(calculateShiftHours('17:00', '22:15', 'late'), 5.25);
  assert.equal(calculateShiftHours('18:00', '01:30'), 7.5);
  assert.equal(calculateShiftHours('08:00', null), 0);
  assert.equal(calculateShiftHours('08:00', '16:00', 'absent'), 0);
});

test('calculateEmployeePayroll applies (Hours * HourlyRate) + Bonus - Deduction and tracks late/absent counts', () => {
  const attendance: AttendanceRecord[] = [
    {
      id: 'att-1',
      employeeId: hien.id,
      employeeCode: hien.code,
      date: '2026-11-02',
      checkIn: '08:00',
      checkOut: '16:00', // 8h
      hours: 8,
      status: 'present',
      source: 'google_form',
      note: 'Ca sáng',
      editedByAdmin: false,
      updatedAt: '2026-11-02T16:00:00Z',
    },
    {
      id: 'att-2',
      employeeId: hien.id,
      employeeCode: hien.code,
      date: '2026-11-03',
      checkIn: '14:15',
      checkOut: '22:45', // 8.5h
      hours: 8.5,
      status: 'late',
      source: 'manual',
      note: 'Quên check-in, đi trễ 15p',
      editedByAdmin: true,
      updatedAt: '2026-11-03T22:50:00Z',
    },
    {
      id: 'att-3',
      employeeId: hien.id,
      employeeCode: hien.code,
      date: '2026-11-04',
      checkIn: '08:00',
      checkOut: '16:00',
      hours: 0,
      status: 'absent',
      source: 'manual',
      note: 'Nghỉ phép',
      editedByAdmin: true,
      updatedAt: '2026-11-04T09:00:00Z',
    },
  ];

  const adjustments: AdjustmentRecord[] = [
    {
      id: 'adj-1',
      employeeId: hien.id,
      employeeCode: hien.code,
      date: '2026-11-03',
      type: 'bonus',
      category: 'Thưởng hiệu suất',
      amount: 150000,
      reason: 'Hỗ trợ quán ngày đông khách',
      createdAt: '2026-11-03T22:00:00Z',
    },
    {
      id: 'adj-2',
      employeeId: hien.id,
      employeeCode: hien.code,
      date: '2026-11-04',
      type: 'deduction',
      category: 'Đi trễ',
      amount: 30000,
      reason: 'Đi trễ 15 phút',
      createdAt: '2026-11-04T09:00:00Z',
    },
  ];

  const summary = calculateEmployeePayroll(hien, attendance, adjustments, '2026-11');
  assert.equal(summary.totalShifts, 3);
  assert.equal(summary.lateShifts, 1);
  assert.equal(summary.absentShifts, 1);
  assert.equal(summary.totalHours, 16.5);
  assert.equal(summary.basePay, 330000);
  assert.equal(summary.totalBonus, 150000);
  assert.equal(summary.totalDeduction, 30000);
  assert.equal(summary.netPay, 450000);
});

test('findEmployeeByNameOrCode matches staff by dropdown name seamlessly', () => {
  assert.equal(findEmployeeByNameOrCode([hien, linh], { employeeName: 'Hiền' })?.id, 'emp-001');
  assert.equal(findEmployeeByNameOrCode([hien, linh], { employeeName: ' linh ' })?.id, 'emp-002');
  assert.equal(findEmployeeByNameOrCode([hien, linh], { employeeName: 'Hiền (EMP001)' })?.id, 'emp-001');
  assert.equal(findEmployeeByNameOrCode([hien, linh], { employeeCode: 'EMP002' })?.id, 'emp-002');
});

test('isDateInRange and calculateMonthlyOverview work properly', () => {
  assert.equal(isDateInRange('2026-11-12', '2026-11-10', '2026-11-14'), true);
  assert.equal(isDateInRange('2026-11-09', '2026-11-10', '2026-11-14'), false);
  assert.equal(formatVND(20000), '20.000 VNĐ');
  assert.equal(normalizeFormDate('14/11/2026'), '2026-11-14');
  assert.equal(normalizeFormTime('8:05'), '08:05');

  const overview = calculateMonthlyOverview(
    [hien, linh],
    [
      {
        id: 'a1',
        employeeId: linh.id,
        employeeCode: linh.code,
        date: '2026-11-10',
        checkIn: '16:30',
        checkOut: '22:30',
        hours: 6,
        status: 'present',
        source: 'google_form',
        note: '',
        editedByAdmin: false,
        updatedAt: '2026-11-10T22:30:00Z',
      },
    ],
    [],
    '2026-11'
  );
  assert.equal(overview.totalHours, 6);
  assert.equal(overview.totalNetPayroll, 120000);
});
