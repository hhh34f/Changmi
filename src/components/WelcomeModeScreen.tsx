import React from 'react';
import { ArrowRight, Monitor, Smartphone } from 'lucide-react';
import type { LayoutMode } from '../types';
import { ChangmiLogo } from './ChangmiLogo';

interface WelcomeModeScreenProps {
  onSelectMode: (mode: LayoutMode) => void;
}

export const WelcomeModeScreen: React.FC<WelcomeModeScreenProps> = ({ onSelectMode }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {/* Changmi Brand Hero */}
        <div className="flex flex-col items-center text-center">
          <ChangmiLogo
            size="lg"
            showWordmark
            subtitle="Hệ thống Quản lý Chấm công & Tính lương"
          />
        </div>

        {/* Device Mode Picker */}
        <section aria-labelledby="device-mode-heading" className="space-y-4">
          <div className="text-center space-y-1">
            <h1
              id="device-mode-heading"
              className="font-display text-lg sm:text-xl font-semibold text-slate-900"
            >
              Chọn giao diện sử dụng phù hợp với thiết bị của bạn
            </h1>
            <p className="text-sm text-slate-500">
              Hệ thống đã sạch dữ liệu mẫu và sẵn sàng vận hành thực tế.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <button
              type="button"
              onClick={() => onSelectMode('desktop')}
              className="group flex min-h-[168px] flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-red-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 active:scale-[0.99]"
            >
              <div className="space-y-4">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 group-hover:bg-red-700 group-hover:text-white transition-colors">
                  <Monitor className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Sử dụng trên Máy tính
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    Giao diện rộng toàn màn hình với thanh menu bên trái, bảng dữ liệu đa cột và thanh công cụ thao tác nhanh.
                  </p>
                </div>
              </div>

              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <span>Vào giao diện Máy tính</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode('mobile')}
              className="group flex min-h-[168px] flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-red-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 active:scale-[0.99]"
            >
              <div className="space-y-4">
                <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-red-50 text-red-700 group-hover:bg-red-700 group-hover:text-white transition-colors">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Sử dụng trên Điện thoại
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    Thanh điều hướng cố định phía dưới thuận ngón tay cái, danh sách dạng thẻ và bảng vuốt Bottom Sheet.
                  </p>
                </div>
              </div>

              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <span>Vào giao diện Điện thoại</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </div>
        </section>

        <p className="text-center text-xs text-slate-500">
          Lương mặc định 20.000 VNĐ/giờ · Có thể chuyển đổi giữa Máy tính và Điện thoại bất kỳ lúc nào
        </p>
      </div>
    </div>
  );
};
