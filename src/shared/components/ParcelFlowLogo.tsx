import React from 'react';

interface ParcelFlowLogoProps {
  variant?: 'mark' | 'full' | 'compact';
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
  className?: string;
}

/**
 * ParcelFlow Custom Brand Mark
 * Concept: "Every parcel has a clear path."
 * Design: Minimalist isometric routing node with a dynamic parcel trajectory vector.
 */
export const ParcelFlowLogo: React.FC<ParcelFlowLogoProps> = ({
  variant = 'full',
  size = 'md',
  theme = 'light',
  className = ''
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl'
  };

  const isDark = theme === 'dark';

  const markSvg = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${iconSizes[size]} shrink-0 transition-transform duration-200 group-hover:scale-105`}
      aria-hidden="true"
    >
      {/* Background container with subtle industrial radius */}
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="7"
        className={isDark ? 'fill-zinc-900 stroke-zinc-700/80' : 'fill-stone-100 stroke-stone-300'}
        strokeWidth="1.5"
      />
      
      {/* Outer routing conveyor path (subtle precision line) */}
      <path
        d="M7 16H11L14 11H21L24 16H25"
        className={isDark ? 'stroke-zinc-600' : 'stroke-stone-400'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 2"
      />

      {/* Isometric parcel cube with precision faceted planes */}
      {/* Top plane */}
      <path
        d="M16 8.5L22 11.5L16 14.5L10 11.5L16 8.5Z"
        className={isDark ? 'fill-amber-500/30 stroke-amber-400' : 'fill-amber-100 stroke-amber-600'}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Left plane */}
      <path
        d="M10 11.5V18.5L16 21.5V14.5L10 11.5Z"
        className={isDark ? 'fill-zinc-800 stroke-zinc-600' : 'fill-stone-200/90 stroke-stone-400'}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Right plane with teal accent indicating directional sorting path */}
      <path
        d="M16 14.5V21.5L22 18.5V11.5L16 14.5Z"
        className={isDark ? 'fill-teal-900/60 stroke-teal-400' : 'fill-teal-50 stroke-teal-600'}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* Dynamic flow vector through the parcel center (restrained amber) */}
      <path
        d="M13 13L16 14.5L19 13"
        className={isDark ? 'stroke-amber-400' : 'stroke-amber-700'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sorting guide dot */}
      <circle
        cx="16"
        cy="25"
        r="1.5"
        className={isDark ? 'fill-teal-400' : 'fill-teal-600'}
      />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <div className={`inline-flex items-center ${className}`} title="ParcelFlow">
        {markSvg}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {markSvg}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-bold tracking-tight ${textSizes[size]} ${
              isDark ? 'text-zinc-100' : 'text-stone-900'
            }`}
          >
            Parcel<span className={isDark ? 'text-amber-400' : 'text-amber-600'}>Flow</span>
          </span>
          {variant === 'full' && (
            <span
              className={`text-[9px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded ${
                isDark
                  ? 'bg-zinc-800 text-teal-300 border border-zinc-700'
                  : 'bg-stone-200 text-stone-700 border border-stone-300'
              }`}
            >
              SYS
            </span>
          )}
        </div>
        {variant === 'full' && (
          <span
            className={`text-[10px] tracking-tight font-medium mt-0.5 ${
              isDark ? 'text-zinc-400' : 'text-stone-500'
            }`}
          >
            Smart Logistics &amp; Fulfillment
          </span>
        )}
      </div>
    </div>
  );
};
