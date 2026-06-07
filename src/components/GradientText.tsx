import React from "react";

interface GradientTextProps {
  children: React.ReactNode;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
  className?: string;
}

// Inject keyframes once globally
const GRADIENT_STYLE_ID = "gradient-text-keyframes";
if (typeof document !== 'undefined' && !document.getElementById(GRADIENT_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = GRADIENT_STYLE_ID;
  s.textContent = `
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .gradient-text-animated {
      background-size: 200% auto;
      animation: gradient-shift linear infinite;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gradient-border-animated {
      background-size: 200% auto;
      animation: gradient-shift linear infinite;
    }
  `;
  document.head.appendChild(s);
}

const GradientText = React.memo(function GradientText({
  children,
  colors = ["#5227FF", "#1d0039", "#B497CF"],
  animationSpeed = 8,
  showBorder = false,
  className = "",
}: GradientTextProps) {
  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, ${colors.join(", ")})`,
    animationDuration: `${animationSpeed}s`,
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {showBorder && (
        <div
          className="gradient-border-animated absolute inset-0 rounded-lg"
          style={{
            ...gradientStyle,
            padding: "1px",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
          }}
        />
      )}

      <span
        className="gradient-text-animated"
        style={gradientStyle}
      >
        {children}
      </span>
    </div>
  );
});

export default GradientText;
