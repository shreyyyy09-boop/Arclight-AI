import React from 'react';

interface StarBorderProps {
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: string;
  [key: string]: any;
}

// Inject keyframes once globally
const STAR_BORDER_STYLE_ID = "star-border-keyframes";
if (typeof document !== 'undefined' && !document.getElementById(STAR_BORDER_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STAR_BORDER_STYLE_ID;
  s.textContent = `
    @keyframes star-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
}

const StarBorder: React.FC<StarBorderProps> = React.memo(({
  as: Component = 'div',
  className = '',
  color = '#4285F4',
  speed = '6s',
  children,
  ...rest
}) => {
  const Tag = Component as any;
  return (
    <div className="relative">
      {/* Border layer - overflow-hidden only here to clip gradient */}
      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl p-[1.5px] overflow-hidden pointer-events-none z-0 gpu-accelerated">
        <div
          className="absolute inset-[-100%]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, ${color} 12%, transparent 25%, transparent 50%, ${color} 62%, transparent 75%)`,
            animation: `star-spin ${speed} linear infinite`,
          }}
        />
        <div
          className="absolute inset-[-100%] opacity-50"
          style={{
            background: `conic-gradient(from 180deg, transparent 0%, ${color} 12%, transparent 25%, transparent 50%, ${color} 62%, transparent 75%)`,
            animation: `star-spin ${speed} linear infinite`,
            filter: 'blur(8px)',
          }}
        />
      </div>

      {/* Content area - NO overflow-hidden, dropdowns can escape */}
      <Tag
        className={`relative z-[1] rounded-2xl sm:rounded-3xl bg-[#1e1f20] ${className}`}
        {...rest}
      >
        {children}
      </Tag>
    </div>
  );
});

StarBorder.displayName = 'StarBorder';
export default StarBorder;
