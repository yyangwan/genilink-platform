import type { CSSProperties } from 'react';

type BrandMarkProps = {
  className?: string;
  signature?: boolean;
  style?: CSSProperties;
};

const signatureStyle: CSSProperties = {
  border: '1px solid rgba(255, 159, 45, 0.44)',
  background: 'linear-gradient(145deg, rgba(255, 187, 99, 0.2), rgba(255, 159, 45, 0.04)), #1d1b17',
  color: '#ff9f2d',
  boxShadow: 'inset 0 1px rgba(255, 255, 255, 0.11), 0 9px 26px rgba(255, 159, 45, 0.11)',
};

export function BrandMark({ className, signature = false, style }: BrandMarkProps) {
  return (
    <span className={className} style={signature ? { ...signatureStyle, ...style } : style} aria-hidden="true">
      <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 14.5h12.5c4.2 0 7.5 3.3 7.5 7.5s-3.3 7.5-7.5 7.5H20" />
        <path d="M23.5 10.5 12 22l11.5 11.5" />
        <circle cx="12" cy="14.5" r="2.2" fill="currentColor" />
        <circle cx="12" cy="29.5" r="2.2" fill="currentColor" />
        <circle cx="32" cy="22" r="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}
