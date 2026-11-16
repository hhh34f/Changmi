import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Check, Copy, ExternalLink, FileSpreadsheet, RefreshCw, Users } from 'lucide-react';
import { buildAppsScriptCode, GOOGLE_SHEETS_SCHEMA } from '../data/appsScriptTemplate';
import {
  createAttendanceGoogleForm,
  createChangmiSpreadsheet,
  fetchAndParseFormResponses,
  syncAllDataToGoogleSheet,
  updateGoogleFormEmployeeDropdown,
  type ParsedFormAttendanceEntry,
} from '../services/googleWorkspace';
import type {
  AdjustmentRecord,
  AttendanceRecord,
  Employee,
  EmployeePayrollSummary,
  LayoutMode,
  WorkspaceConfig,
} from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface WorkspaceViewProps {
  layoutMode: LayoutMode;
  googleUser: User | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  workspace: WorkspaceConfig;
  onSaveConfig: (config: Partial<WorkspaceConfig>) => Promise<void>;
  onBulkImportAttendance: (entries: ParsedFormAttendanceEntry[]) => Promise<{
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
  }>;
  employees: Employee[];
  attendance: AttendanceRecord[];
  adjustments: AdjustmentRecord[];
  payrollSummaries: EmployeePayrollSummary[];
  month: string;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  layoutMode,
  googleUser,
  accessToken,
  isLoggingIn,
  onGoogleSignIn,
  onGoogleSignOut,
  workspace,
  onSaveConfig,
  onBulkImportAttendance,
  employees,
  attendance,
  adjustments,
  payrollSummaries,
  month,
}) => {
  const isMobileLayout = layoutMode === 'mobile';
  const [formIdInput, setFormIdInput] = useState(workspace.formId);
  const [sheetIdInput, setSheetIdInput] = useState(workspace.spreadsheetId);
  const [secretInput, setSecretInput] = useState(workspace.webhookSecret);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    details: string[];
    confirmLabel: string;
    onExecute: () => Promise<void>;
  } | null>(null);

  const activeEmployeeNames = employees.filter((e) => e.status === 'active').map((e) => e.name);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/google-form`
      : 'https://your-app-url/api/webhook/google-form';

  const appsScriptCode = buildAppsScriptCode(webhookUrl, secretInput || 'changmi-2026-secret');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('save');
    try {
      await onSaveConfig({
        formId: formIdInput.trim(),
        spreadsheetId: sheetIdInput.trim(),
        webhookSecret: secretInput.trim(),
      });
      setFeedback({ type: 'success', message: 'Đã lưu cấu hình Google Form ID, Sheet ID và Webhook Secret.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Lỗi lưu cấu hình.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncFormResponses = async () => {
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Vui lòng nhấn "Sign in with Google" trước khi đồng bộ.' });
      return;
    }
    if (!formIdInput.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập Google Form ID hoặc tạo mới Form điểm danh.' });
      return;
    }

    setBusyAction('sync-form');
    setFeedback(null);
    try {
      const entries = await fetchAndParseFormResponses(formIdInput.trim(), accessToken);
      const res = await onBulkImportAttendance(entries);
      await onSaveConfig({ formId: formIdInput.trim() });
      setFeedback({
        type: 'success',
        message: `Đã đồng bộ Google Form: thêm mới ${res.importedCount} ca, cập nhật check-out ${res.updatedCount} ca, bỏ qua ${res.skippedCount} phản hồi đã có/không khớp tên NV.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Lỗi đọc phản hồi từ Google Form.' });
    } finally {
      setBusyAction(null);
    }
  };

  const requestCreateGoogleForm = () => {
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Vui lòng đăng nhập Google trước khi tạo biểu mẫu mới.' });
      return;
    }
    setPendingConfirm({
      title: 'Tạo Google Form Điểm danh (Dropdown chọn tên) trên Google Drive?',
      description:
        'Hệ thống sẽ tạo một Google Form mới mang tên "Điểm danh Nhân viên — Quán Mì Cay Changmi" với câu hỏi Dropdown chọn tên nhân viên, Loại chấm công và Ghi chú.',
      details: [
        `Danh sách Dropdown nhân viên: ${
          activeEmployeeNames.length > 0 ? activeEmployeeNames.join(', ') : 'Chưa có nhân viên (sẽ cập nhật sau)'
        }`,
        'Câu hỏi Check-in (Vào ca) / Check-out (Tan ca)',
        'Tự động lưu Form ID vào cấu hình hệ thống',
      ],
      confirmLabel: 'Xác nhận tạo Google Form',
      onExecute: async () => {
        setBusyAction('create-form');
        setFeedback(null);
        try {
          const form = await createAttendanceGoogleForm(accessToken, activeEmployeeNames);
          setFormIdInput(form.formId);
          await onSaveConfig({ formId: form.formId });
          setFeedback({
            type: 'success',
            message: `Đã tạo Google Form Dropdown thành công (Form ID: ${form.formId}).`,
          });
        } catch (err: any) {
          setFeedback({ type: 'error', message: err?.message || 'Không thể tạo Google Form.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const requestSyncDropdownToForm = () => {
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Vui lòng đăng nhập Google trước khi cập nhật Form.' });
      return;
    }
    if (!formIdInput.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập hoặc tạo Google Form ID trước.' });
      return;
    }

    setPendingConfirm({
      title: 'Cập nhật danh sách tên nhân viên lên Google Form Dropdown?',
      description: `Thao tác này sẽ cập nhật lại các lựa chọn tên nhân viên trong Google Form (${formIdInput.trim()}) khớp với nhân sự đang hoạt động tại Quán Mì Cay Changmi.`,
      details: [
        `Danh sách sẽ đồng bộ (${activeEmployeeNames.length} nhân viên): ${activeEmployeeNames.join(', ')}`,
      ],
      confirmLabel: 'Cập nhật Dropdown Form',
      onExecute: async () => {
        setBusyAction('sync-dropdown');
        setFeedback(null);
        try {
          await updateGoogleFormEmployeeDropdown(formIdInput.trim(), activeEmployeeNames, accessToken);
          setFeedback({
            type: 'success',
            message: `Đã cập nhật ${activeEmployeeNames.length} tên nhân viên (${activeEmployeeNames.join(', ')}) lên Google Form Dropdown.`,
          });
        } catch (err: any) {
          setFeedback({ type: 'error', message: err?.message || 'Không thể cập nhật Google Form.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const requestCreateGoogleSheet = () => {
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Vui lòng đăng nhập Google trước khi tạo bảng tính mới.' });
      return;
    }
    setPendingConfirm({
      title: 'Tạo Google Sheet mới cho Quán Mì Cay Changmi?',
      description:
        'Hệ thống sẽ tạo một tệp Google Sheets mới trong tài khoản Google của bạn với 4 trang tính (tabs) tiêu chuẩn.',
      details: [
        'Tên file: "Quán Mì Cay Changmi — Dữ liệu Chấm công & Tính lương"',
        '4 Tabs: NhanVien, ChamCong, ThuongTru, BangLuongThang',
        'Tự động lưu Spreadsheet ID vào cấu hình hệ thống',
      ],
      confirmLabel: 'Xác nhận tạo Google Sheet',
      onExecute: async () => {
        setBusyAction('create-sheet');
        setFeedback(null);
        try {
          const created = await createChangmiSpreadsheet(accessToken);
          setSheetIdInput(created.spreadsheetId);
          await onSaveConfig({ spreadsheetId: created.spreadsheetId });
          setFeedback({
            type: 'success',
            message: `Đã tạo Google Sheet mới thành công (ID: ${created.spreadsheetId}).`,
          });
        } catch (err: any) {
          setFeedback({ type: 'error', message: err?.message || 'Không thể tạo Google Sheet.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const requestSyncToGoogleSheet = () => {
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Vui lòng đăng nhập Google trước khi đồng bộ dữ liệu lên Sheet.' });
      return;
    }
    if (!sheetIdInput.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập Google Spreadsheet ID hoặc tạo mới Sheet trước.' });
      return;
    }

    setPendingConfirm({
      title: 'Xác nhận ghi & cập nhật dữ liệu lên Google Sheets?',
      description: `Thao tác này sẽ ghi đè nội dung các vùng dữ liệu trên Google Sheet có ID "${sheetIdInput.trim()}" bằng dữ liệu hiện tại của Quán Mì Cay Changmi.`,
      details: [
        `Tab NhanVien: ${employees.length} nhân viên`,
        `Tab ChamCong: ${attendance.length} bản ghi chấm công`,
        `Tab ThuongTru: ${adjustments.length} khoản thưởng/trừ`,
        `Tab BangLuongThang (${month}): ${payrollSummaries.length} dòng tổng hợp lương`,
      ],
      confirmLabel: 'Xác nhận đồng bộ lên Sheet',
      onExecute: async () => {
        setBusyAction('sync-sheet');
        setFeedback(null);
        try {
          const res = await syncAllDataToGoogleSheet(
            sheetIdInput.trim(),
            { employees, attendance, adjustments, payrollSummaries, month },
            accessToken
          );
          await onSaveConfig({
            spreadsheetId: sheetIdInput.trim(),
            lastSyncedAt: new Date().toISOString(),
          });
          setFeedback({
            type: 'success',
            message: `Đã đồng bộ thành công ${res.updatedCells} ô dữ liệu lên Google Sheets.`,
          });
        } catch (err: any) {
          setFeedback({ type: 'error', message: err?.message || 'Không thể ghi dữ liệu lên Google Sheets.' });
        } finally {
          setBusyAction(null);
        }
      },
    });
  };

  const handleCopy = async (text: string, which: 'script' | 'webhook') => {
    await navigator.clipboard.writeText(text);
    if (which === 'script') {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Dedicated Tab Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs sm:text-sm text-slate-600">
          Nhân viên đồng bộ vào Form Dropdown:{' '}
          <span className="font-semibold text-slate-900">{activeEmployeeNames.join(', ') || 'Chưa có'}</span>
          {workspace.lastSyncedAt && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              <span className="text-xs">Đồng bộ gần nhất: {new Date(workspace.lastSyncedAt).toLocaleString('vi-VN')}</span>
            </>
          )}
        </div>
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2">
          <button
            type="button"
            onClick={handleSyncFormResponses}
            disabled={busyAction !== null}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busyAction === 'sync-form' ? 'animate-spin' : ''}`} />
            Đồng bộ phản hồi Form
          </button>
          <button
            type="button"
            onClick={requestSyncDropdownToForm}
            disabled={busyAction !== null}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
          >
            <Users className="h-4 w-4" />
            Cập nhật tên lên Form
          </button>
          <button
            type="button"
            onClick={requestSyncToGoogleSheet}
            disabled={busyAction !== null}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-red-700 px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-red-800 whitespace-nowrap disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Đẩy dữ liệu lên Sheet
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* 1. Google Workspace Auth & Live Sync Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Kết nối Google Workspace (Google Forms & Google Sheets)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Đăng nhập bằng tài khoản Google quản lý quán để tạo Form điểm danh (Dropdown chọn tên nhân viên), đồng bộ phản hồi và xuất dữ liệu lên Google Sheets.
            </p>
          </div>

          {!accessToken ? (
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={isLoggingIn}
              className="gsi-material-button shrink-0"
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
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
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-medium text-slate-900">{googleUser?.displayName || googleUser?.email}</p>
                <p className="text-xs text-emerald-700">Đã cấp quyền Forms & Sheets</p>
              </div>
              <button
                type="button"
                onClick={onGoogleSignOut}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-t border-slate-200 pt-2">
            {/* Google Form Config */}
            <div className="space-y-3 py-4 lg:pr-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">1. Google Form Điểm danh (Dropdown tên NV)</h3>
                {formIdInput.trim() && (
                  <a
                    href={`https://docs.google.com/forms/d/${encodeURIComponent(formIdInput.trim())}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
                  >
                    Mở Form
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div>
                <label htmlFor="ws-form-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Google Form ID
                </label>
                <input
                  id="ws-form-id"
                  type="text"
                  value={formIdInput}
                  onChange={(e) => setFormIdInput(e.target.value)}
                  placeholder="Dán ID từ link docs.google.com/forms/d/[FORM_ID]/edit"
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-xs sm:text-sm focus:border-red-700 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSyncFormResponses}
                  disabled={busyAction !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'sync-form' ? 'animate-spin' : ''}`} />
                  Đồng bộ phản hồi Form
                </button>
                <button
                  type="button"
                  onClick={requestCreateGoogleForm}
                  disabled={busyAction !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Tạo Form Changmi mới
                </button>
              </div>
            </div>

            {/* Google Sheets Config */}
            <div className="space-y-3 py-4 lg:pl-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">2. Google Sheets Tập trung</h3>
                {sheetIdInput.trim() && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetIdInput.trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
                  >
                    Mở Google Sheet
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <div>
                <label htmlFor="ws-sheet-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Google Spreadsheet ID
                </label>
                <input
                  id="ws-sheet-id"
                  type="text"
                  value={sheetIdInput}
                  onChange={(e) => setSheetIdInput(e.target.value)}
                  placeholder="Dán ID từ link docs.google.com/spreadsheets/d/[SHEET_ID]/edit"
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-xs sm:text-sm focus:border-red-700 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={requestSyncToGoogleSheet}
                  disabled={busyAction !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Đẩy dữ liệu lên Sheet
                </button>
                <button
                  type="button"
                  onClick={requestCreateGoogleSheet}
                  disabled={busyAction !== null}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Tạo Google Sheet 4 tab
                </button>
              </div>
            </div>
          </div>

          {/* Webhook Secret + Save Config */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-slate-200 pt-4">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ws-webhook-url" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Webhook Endpoint nhận dữ liệu từ Apps Script
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="ws-webhook-url"
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(webhookUrl, 'webhook')}
                    aria-label="Sao chép đường dẫn Webhook"
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    {copiedWebhook ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
                    {copiedWebhook ? 'Đã chép' : 'Chép'}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="ws-secret" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Webhook Secret
                </label>
                <input
                  id="ws-secret"
                  type="text"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 px-3.5 font-mono text-xs sm:text-sm focus:border-red-700 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busyAction !== null}
              className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {busyAction === 'save' ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Deliverable 1: Google Sheet 4-Tab Schema */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Cấu trúc Dữ liệu Google Sheet (4 Trang tính chuẩn)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Thiết kế bảng và các cột dữ liệu cho Quán Mì Cay Changmi để lưu trữ tập trung Nhân viên, Chấm công, Thưởng/Trừ và Bảng lương Tháng.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {GOOGLE_SHEETS_SCHEMA.map((sheet) => (
            <div key={sheet.tabName} className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="font-mono text-xs font-semibold text-red-700">Tab: {sheet.tabName}</p>
                <p className="mt-0.5 text-xs text-slate-600">{sheet.description}</p>
              </div>
              {/* Mobile Field Cards */}
              <div className={`divide-y divide-slate-100 ${isMobileLayout ? 'block' : 'md:hidden'}`}>
                {sheet.columns.map((col) => (
                  <div key={col.name} className="px-4 py-2.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">{col.name}</span>
                      <span className="text-xs text-slate-500">{col.type}</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="font-mono text-slate-800">{col.example}</span> · {col.note}
                    </p>
                  </div>
                ))}
              </div>
              {/* Desktop Table */}
              <table className={`${isMobileLayout ? 'hidden' : 'hidden md:table'} w-full text-left text-xs`}>
                <thead className="border-b border-slate-200 bg-white text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Cột</th>
                    <th className="px-3 py-2 font-medium">Kiểu</th>
                    <th className="px-3 py-2 font-medium">Ví dụ / Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheet.columns.map((col) => (
                    <tr key={col.name}>
                      <td className="px-3 py-1.5 font-mono font-medium text-slate-900">{col.name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{col.type}</td>
                      <td className="px-3 py-1.5 text-slate-600">
                        <span className="font-mono text-slate-800">{col.example}</span> · {col.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Deliverable 2: Complete Google Apps Script */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Mã nguồn Google Apps Script (<span className="font-mono">Code.gs</span>)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Dán đoạn mã dưới đây vào Extensions → Apps Script trên Google Sheet liên kết với Google Form của quán.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(appsScriptCode, 'script')}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {copiedScript ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
            {copiedScript ? 'Đã sao chép Code.gs' : 'Sao chép toàn bộ Code.gs'}
          </button>
        </div>

        <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
          <code>{appsScriptCode}</code>
        </pre>
      </section>

      {/* 4. Deliverable 4: Step-by-Step Setup Guide */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">
          Hướng dẫn Cài đặt & Đưa vào Hoạt động cho Quán Mì Cay Changmi
        </h2>
        <ol className="space-y-3 text-sm text-slate-700 list-decimal pl-5 leading-relaxed">
          <li>
            <strong>Tạo Google Form Điểm danh (chọn tên Dropdown):</strong> Đăng nhập Google ở mục 1 phía trên và bấm{' '}
            <span className="font-medium text-slate-900">"Tạo Form Changmi mới"</span>. Hệ thống sẽ tạo sẵn câu hỏi{' '}
            <span className="font-medium text-slate-900">Chọn tên nhân viên (Dropdown)</span> để nhân viên chỉ cần chạm chọn tên của mình, không bao giờ gõ sai mã. Khi thêm nhân viên mới ở tab Nhân viên, hãy nhấn{' '}
            <span className="font-medium text-slate-900">"Cập nhật tên lên Form"</span> để đồng bộ danh sách tự động.
          </li>
          <li>
            <strong>Liên kết Google Sheet tập trung:</strong> Nhấn{' '}
            <span className="font-medium text-slate-900">"Tạo Google Sheet 4 tab"</span> để tự động tạo file gồm 4 trang tính chuẩn (<span className="font-mono text-xs">NhanVien</span>, <span className="font-mono text-xs">ChamCong</span>, <span className="font-mono text-xs">ThuongTru</span>, <span className="font-mono text-xs">BangLuongThang</span>). Bấm{' '}
            <span className="font-medium text-slate-900">"Đẩy dữ liệu lên Sheet"</span> bất kỳ lúc nào để sao lưu bảng công và bảng lương lên Drive.
          </li>
          <li>
            <strong>Kích hoạt đồng bộ tự động (Webhook Trigger):</strong> Mở Google Sheet → chọn{' '}
            <span className="font-medium text-slate-900">Tiện ích mở rộng (Extensions) → Apps Script</span>, dán đoạn mã{' '}
            <span className="font-mono text-xs">Code.gs</span> ở trên và lưu lại. Vào mục{' '}
            <span className="font-medium text-slate-900">Trình kích hoạt (Triggers) → Thêm trình kích hoạt</span>: chọn hàm{' '}
            <span className="font-mono text-xs">onFormSubmit</span>, nguồn sự kiện{' '}
            <span className="font-medium text-slate-900">Từ bảng tính (From spreadsheet)</span>, loại sự kiện{' '}
            <span className="font-medium text-slate-900">Khi gửi biểu mẫu (On form submit)</span>.
          </li>
          <li>
            <strong>Xử lý ngoại lệ & Chốt lương cuối tháng:</strong> Khi nhân viên quên check-in/check-out, Quản lý vào tab{' '}
            <span className="font-medium text-slate-900">Chấm công</span> để chọn tên nhân viên từ dropdown và sửa giờ; nhập thưởng, phụ cấp hoặc trừ tiền tại tab{' '}
            <span className="font-medium text-slate-900">Thưởng & Trừ</span>; sau đó vào tab{' '}
            <span className="font-medium text-slate-900">Bảng lương</span> để in <span className="font-medium text-slate-900">Phiếu lương cá nhân</span> gửi cho toàn bộ nhân viên.
          </li>
        </ol>
      </section>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description ?? ''}
        details={pendingConfirm?.details}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Xác nhận'}
        busy={busyAction !== null}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          const fn = pendingConfirm.onExecute;
          setPendingConfirm(null);
          await fn();
        }}
      />
    </div>
  );
};
