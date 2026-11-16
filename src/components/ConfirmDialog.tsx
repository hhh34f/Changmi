import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  details,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white px-5 pb-6 pt-3 sm:p-6 shadow-xl">
        <div className="sm:hidden pb-3 flex justify-center" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Đóng hộp thoại xác nhận"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {details && details.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700">
            {details.map((line, i) => (
              <li key={i} className="leading-relaxed">
                • {line}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap disabled:opacity-60 ${
              tone === 'danger' ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
