import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light' | 'compact';
  showWordmark?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'light',
  showWordmark = true,
}) => {
  const roofColor = variant === 'dark' ? '#FFFFFF' : '#1E1B4B';
  const accentStart = variant === 'dark' ? '#FBBF24' : '#6366F1';
  const accentEnd = variant === 'dark' ? '#F59E0B' : '#4338CA';
  const textColor = variant === 'dark' ? 'text-white' : 'text-slate-900';

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0">
      <svg
        width={variant === 'compact' ? 30 : 38}
        height={variant === 'compact' ? 30 : 38}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`swoosh-${variant}`} x1="6" y1="42" x2="58" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={accentStart} />
            <stop offset="100%" stopColor={accentEnd} />
          </linearGradient>
        </defs>
        <path
          d="M12 31L32 14L52 31"
          stroke={roofColor}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="26" y="25" width="5" height="5" rx="1" fill={roofColor} />
        <rect x="33" y="25" width="5" height="5" rx="1" fill={roofColor} />
        <rect x="26" y="32" width="5" height="5" rx="1" fill={roofColor} />
        <rect x="33" y="32" width="5" height="5" rx="1" fill={roofColor} />
        <path
          d="M8 43C20 51 41 48 56 32C44 43 24 44 8 39V43Z"
          fill={`url(#swoosh-${variant})`}
        />
      </svg>
      {showWordmark && (
        <span className={`font-display font-bold tracking-tight whitespace-nowrap ${variant === 'compact' ? 'text-base' : 'text-lg'} ${textColor}`}>
          Rent a House
        </span>
      )}
    </div>
  );
};
