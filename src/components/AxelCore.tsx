// src/components/AxelCore.tsx
// J.A.R.V.I.S-inspired HUD core for ArcLight AI

import { motion } from "framer-motion";

interface AxelCoreProps {
  onSwitchToTyping?: () => void;
  activeChar?: "ARCLIGHT" | "NOVA" | null;
  isListening?: boolean;
  isSpeaking?: boolean;
}

export default function AxelCore({
  onSwitchToTyping,
  activeChar,
  isListening = false,
  isSpeaking = false,
}: AxelCoreProps) {
  const displayName = activeChar || "ARCLIGHT";
  const palette = isSpeaking
    ? { base: "#f472b6", glow: "#fb7185", dim: "#831843", label: "RESPONDING" }
    : isListening
      ? { base: "#22c55e", glow: "#86efac", dim: "#14532d", label: "LOCKED ON" }
      : activeChar === "NOVA"
        ? { base: "#8b5cf6", glow: "#c084fc", dim: "#4c1d95", label: "NOVA LINK" }
        : { base: "#0ea5e9", glow: "#22d3ee", dim: "#0c4a6e", label: "CORE READY" };
  const baseColor = palette.base;
  const glowColor = palette.glow;
  const dimColor = palette.dim;

  // Generate tick marks for rings
  const ticks = (count: number, radius: number, length: number) => {
    const elements: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 360;
      const rad = (angle * Math.PI) / 180;
      const x1 = 50 + (radius - length) * Math.cos(rad);
      const y1 = 50 + (radius - length) * Math.sin(rad);
      const x2 = 50 + radius * Math.cos(rad);
      const y2 = 50 + radius * Math.sin(rad);
      const isMajor = i % 5 === 0;
      elements.push(
        <line
          key={`tick-${radius}-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={isMajor ? glowColor : dimColor}
          strokeWidth={isMajor ? 0.8 : 0.3}
          opacity={isMajor ? 0.9 : 0.5}
        />
      );
    }
    return elements;
  };

  // Generate binary digits around ring
  const binaryRing = (count: number, radius: number) => {
    const elements: React.ReactNode[] = [];
    const digits = "01";
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const x = 50 + radius * Math.cos(rad);
      const y = 50 + radius * Math.sin(rad);
      elements.push(
        <text
          key={`bin-${radius}-${i}`}
          x={x}
          y={y}
          fill={i % 3 === 0 ? glowColor : dimColor}
          fontSize="1.5"
          fontFamily="monospace"
          textAnchor="middle"
          dominantBaseline="middle"
          opacity={i % 3 === 0 ? 0.7 : 0.3}
        >
          {digits[i % 2]}
        </text>
      );
    }
    return elements;
  };

  return (
    <div className="relative flex items-center justify-center w-[min(88vw,500px)] h-[min(88vw,500px)] sm:w-[600px] sm:h-[600px] max-h-[58dvh] max-w-[58dvh] sm:max-h-none sm:max-w-none">
      {/* Deep background glow */}
      <div className="absolute inset-0 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${baseColor}33 0%, transparent 68%)` }} />
      <motion.div
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-[10%] rounded-full blur-2xl"
        style={{ backgroundColor: `${baseColor}1f` }}
      />

      {/* ── Ring 1: Outermost segmented arc ── */}
      <motion.svg
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
        className="absolute w-full h-full"
      >
        <defs>
          <filter id="glow1">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke={baseColor}
          strokeWidth="0.4"
          strokeDasharray="6 3 1 3 12 8"
          opacity="0.6"
          filter="url(#glow1)"
        />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={dimColor}
          strokeWidth="0.2"
          strokeDasharray="1 5"
          opacity="0.4"
        />
      </motion.svg>

      {/* ── Ring 2: Tick marks ring (reverse) ── */}
      <motion.svg
        viewBox="0 0 100 100"
        animate={{ rotate: -360 }}
        transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
        className="absolute w-[92%] h-[92%]"
      >
        {ticks(60, 44, 2)}
        {binaryRing(40, 41)}
      </motion.svg>

      {/* ── Ring 3: Dashed arc ring ── */}
      <motion.svg
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute w-[78%] h-[78%]"
      >
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke={glowColor}
          strokeWidth="0.6"
          strokeDasharray="20 10 5 10"
          opacity="0.5"
          filter="url(#glow1)"
        />
        <circle
          cx="50"
          cy="50"
          r="35"
          fill="none"
          stroke={dimColor}
          strokeWidth="0.15"
          strokeDasharray="0.5 2"
          opacity="0.5"
        />
      </motion.svg>

      {/* ── Ring 4: Thick segmented arc (reverse fast) ── */}
      <motion.svg
        viewBox="0 0 100 100"
        animate={{ rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute w-[62%] h-[62%]"
      >
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={glowColor} stopOpacity="0.9" />
            <stop offset="50%" stopColor={baseColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="2"
          strokeDasharray="60 40"
          strokeLinecap="round"
          filter="url(#glow1)"
        />
        <circle
          cx="50"
          cy="50"
          r="27"
          fill="none"
          stroke={dimColor}
          strokeWidth="0.3"
          strokeDasharray="2 4"
          opacity="0.6"
        />
      </motion.svg>

      {/* ── Ring 5: Inner brackets (fast) ── */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="absolute w-[44%] h-[44%] rounded-full border-2 border-transparent border-t-sky-400/60 border-b-sky-400/60 shadow-[inset_0_0_30px_rgba(14,165,233,0.2)]"
      />

      {/* ── Ring 6: Inner thin ring (slow reverse) ── */}
      <motion.svg
        viewBox="0 0 100 100"
        animate={{ rotate: -360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute w-[36%] h-[36%]"
      >
        <circle
          cx="50"
          cy="50"
          r="18"
          fill="none"
          stroke={glowColor}
          strokeWidth="0.8"
          strokeDasharray="4 6"
          opacity="0.7"
        />
        {ticks(24, 16, 1.5)}
      </motion.svg>

      {/* ── Center Core ── */}
      <div className="relative flex items-center justify-center">
        {/* Breathing outer glow */}
        <motion.div
          animate={{
            scale: isListening ? [1, 1.3, 1] : [1, 1.15, 1],
            opacity: isListening ? [0.4, 0.8, 0.4] : [0.3, 0.6, 0.3],
          }}
          transition={{ duration: isListening ? 1.5 : 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-28 h-28 sm:w-40 sm:h-40 rounded-full blur-xl"
          style={{ backgroundColor: `${baseColor}33` }}
        />

        {/* Inner glow ring */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute w-20 h-20 sm:w-28 sm:h-28 rounded-full border"
          style={{ borderColor: `${glowColor}55`, boxShadow: `0 0 40px ${baseColor}55` }}
        />

        {/* Solid inner disc */}
        <div className="relative z-10 w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-black border-2 flex items-center justify-center" style={{ borderColor: `${glowColor}88`, boxShadow: `0 0 30px ${baseColor}66, inset 0 0 20px ${baseColor}22` }}>
          {/* Center dot pulse */}
          <motion.div
            animate={{
              scale: isSpeaking ? [1, 1.5, 1] : [1, 1.2, 1],
              opacity: isSpeaking ? [1, 0.6, 1] : [0.8, 1, 0.8],
            }}
            transition={{ duration: isSpeaking ? 0.8 : 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
            style={{ backgroundColor: glowColor, boxShadow: `0 0 15px ${baseColor}, 0 0 30px ${glowColor}` }}
          />
        </div>

        {/* Center text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="absolute mt-24 sm:mt-32 text-center"
        >
          <span
            className="font-mono text-[11px] sm:text-base tracking-[0.35em] sm:tracking-[0.4em] font-bold uppercase"
            style={{ color: glowColor, textShadow: `0 0 10px ${glowColor}, 0 0 30px ${baseColor}` }}
          >
            {displayName}
          </span>
          <div className="mt-1 h-[1px] w-24 bg-gradient-to-r from-transparent via-sky-500/50 to-transparent mx-auto" />
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-green-400 shadow-[0_0_8px_#4ade80] animate-pulse' : 'bg-sky-600'}`} />
            <span className="text-[9px] text-sky-600 font-mono tracking-[0.3em] uppercase">
              {isListening ? "LISTENING" : isSpeaking ? "SPEAKING" : palette.label}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Orbiting particles */}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <motion.div
          key={`particle-${i}`}
          animate={{ rotate: 360 }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "linear" }}
          className="absolute w-[85%] h-[85%] rounded-full"
          style={{ transform: `rotate(${deg}deg)` }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400/60 shadow-[0_0_6px_#22d3ee]" />
        </motion.div>
      ))}

      {/* Switch to Type button */}
      {onSwitchToTyping && (
        <motion.button
          onClick={onSwitchToTyping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="absolute bottom-0 flex items-center gap-2 px-5 py-2 rounded-full bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-300 text-xs font-mono tracking-widest uppercase transition-colors"
        >
          Switch to Type
        </motion.button>
      )}
    </div>
  );
}
