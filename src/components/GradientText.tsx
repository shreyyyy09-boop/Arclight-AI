import React from "react";

interface GradientTextProps {
  children: React.ReactNode;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
  className?: string;
}

const GradientText = React.memo(function GradientText({
  children,
  colors = ["#5227FF", "#1d0039", "#B497CF"],
  animationSpeed = 8,
  showBorder = false,
  className = "",
}: GradientTextProps) {
  const gradientStyle: React.CSSProperties = {
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
