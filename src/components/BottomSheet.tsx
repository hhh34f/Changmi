import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  titleId?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  titleId = 'sheet-title',
  maxWidthClass = 'sm:max-w-lg',
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full ${maxWidthClass} max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        {/* Mobile Drag Handle Affordance */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-slate-900 truncate">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Đóng ${title}`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
};
