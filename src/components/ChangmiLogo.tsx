import React from 'react';

interface ChangmiLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  subtitle?: string;
}

export const ChangmiLogo: React.FC<ChangmiLogoProps> = ({
  size = 'md',
  showWordmark = false,
  subtitle,
}) => {
  const boxClass =
    size === 'lg'
      ? 'h-20 w-20 rounded-3xl shadow-md shadow-red-900/15'
      : size === 'md'
      ? 'h-12 w-12 rounded-2xl'
      : 'h-8 w-8 rounded-xl';

  const svgClass =
    size === 'lg' ? 'h-12 w-12' : size === 'md' ? 'h-7 w-7' : 'h-4.5 w-4.5';

  return (
    <div className={`inline-flex items-center ${size === 'lg' ? 'flex-col text-center gap-3' : 'gap-2.5'}`}>
      <div
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-red-700 to-red-800 text-white ${boxClass}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" className={svgClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Chopsticks */}
          <path d="M18 17L39 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M21 20.5L40.5 13.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          {/* Rising steam / spicy aroma */}
          <path d="M14 14C14 11.2 16 10 16 7.5" stroke="#FCA5A5" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M21 12.5C21 10 22.8 8.8 22.8 6.5" stroke="#FCA5A5" strokeWidth="2.2" strokeLinecap="round" />
          {/* Noodle bowl rim & body */}
          <path
            d="M8 23.5H40C39.2 32.8 32.3 39 24 39C15.7 39 8.8 32.8 8 23.5Z"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* Subtle bowl base & chili accent */}
          <path d="M17.5 41.5H30.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          <path
            d="M15 28.5C18.5 31 29.5 31 33 28.5"
            stroke="#FCA5A5"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showWordmark && (
        <div className={size === 'lg' ? 'space-y-1' : 'min-w-0'}>
          <div
            className={`font-display font-bold tracking-tight text-slate-900 ${
              size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-sm sm:text-base truncate'
            }`}
          >
            Quán Mì Cay Changmi
          </div>
          {subtitle && (
            <p className={`text-slate-500 ${size === 'lg' ? 'text-sm sm:text-base' : 'text-xs truncate'}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
