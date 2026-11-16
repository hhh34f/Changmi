import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import type { EmployeePayrollSummary } from '../types';
import { formatHours, formatVND } from '../utils/payroll';

interface PaySlipModalProps {
  summary: EmployeePayrollSummary | null;
  onClose: () => void;
}

export const PaySlipModal: React.FC<PaySlipModalProps> = ({ summary, onClose }) => {
  useEffect(() => {
    if (!summary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [summary, onClose]);

  if (!summary) return null;

  const { employee, month } = summary;
  const [yearStr, monthStr] = month.split('-');
  const displayMonth = `${monthStr}/${yearStr}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payslip-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="no-print sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="no-print flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 shrink-0">
          <div className="min-w-0">
            <h3 id="payslip-title" className="text-base font-semibold text-slate-900 truncate">
              Phiếu lương — {employee.name} ({employee.department})
            </h3>
            <p className="text-xs text-slate-500">Kỳ lương tháng {displayMonth}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              <span>In phiếu</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng phiếu lương"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Pay Slip Body */}
        <div className="overflow-y-auto p-4 sm:p-8 space-y-5" data-testid="payslip-content">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
                Quán Mì Cay Changmi
              </p>
              <h4 className="mt-1 text-xl font-bold text-slate-900">PHIẾU THANH TOÁN LƯƠNG</h4>
              <p className="mt-0.5 text-sm text-slate-500">Kỳ lương: Tháng {displayMonth}</p>
            </div>
            <div className="text-sm text-slate-700 sm:text-right space-y-0.5">
              <p>
                Nhân viên: <span className="font-semibold text-slate-900">{employee.name}</span>
              </p>
              <p className="text-xs text-slate-600">
                Vị trí: {employee.department} · Đơn giá:{' '}
                <span className="font-mono">{formatVND(employee.hourlyRate)}/h</span>
              </p>
              {employee.phone && (
                <p className="font-mono text-xs text-slate-500">SĐT: {employee.phone}</p>
              )}
            </div>
          </div>

          {/* Core Formula Breakdown */}
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">1. Lương theo giờ làm việc</p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatHours(summary.totalHours)} ({summary.totalShifts} ca) × {formatVND(employee.hourlyRate)}/h
                </p>
              </div>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatVND(summary.basePay)}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">2. Tiền Thưởng & Phụ cấp</p>
                <p className="text-xs text-slate-500">
                  {summary.bonusList.length > 0
                    ? `${summary.bonusList.length} khoản cộng trong tháng`
                    : 'Không phát sinh khoản thưởng'}
                </p>
              </div>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                + {formatVND(summary.totalBonus)}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">3. Khoản Trừ lương</p>
                <p className="text-xs text-slate-500">
                  {summary.deductionList.length > 0
                    ? `${summary.deductionList.length} khoản khấu trừ trong tháng`
                    : 'Không phát sinh khoản trừ'}
                </p>
              </div>
              <span className="font-mono tabular-nums font-semibold text-red-700">
                - {formatVND(summary.totalDeduction)}
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-50 px-4 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">LƯƠNG THỰC NHẬN</p>
                <p className="text-xs text-slate-500">
                  = (Tổng số giờ làm × Lương theo giờ) + Tổng Thưởng - Tổng Trừ
                </p>
              </div>
              <span className="font-mono tabular-nums text-xl font-bold text-red-700">
                {formatVND(summary.netPay)}
              </span>
            </div>
          </div>

          {/* Itemized Bonus & Deduction Details */}
          {(summary.bonusList.length > 0 || summary.deductionList.length > 0) && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Chi tiết thưởng / phụ cấp & khấu trừ
              </h5>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
                {[...summary.bonusList, ...summary.deductionList]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <span className="font-mono text-slate-500">{item.date}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-medium text-slate-900">{item.category}</span>
                        {item.reason && (
                          <span className="ml-1.5 text-slate-500">— {item.reason}</span>
                        )}
                      </div>
                      <span
                        className={`font-mono tabular-nums font-medium shrink-0 ${
                          item.type === 'bonus' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {item.type === 'bonus' ? '+' : '-'}
                        {formatVND(item.amount)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Signature Footer */}
          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
            <div>
              <p className="font-semibold text-slate-800">Đại diện Quán Mì Cay Changmi</p>
              <p className="mt-10 text-slate-400">(Ký & ghi rõ họ tên)</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Nhân viên xác nhận</p>
              <p className="mt-10 text-slate-400">{employee.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
