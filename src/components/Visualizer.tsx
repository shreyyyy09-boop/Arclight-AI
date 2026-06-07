import { motion } from "framer-motion";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
}

export default function Visualizer({ state }: VisualizerProps) {
  const getRingAnimation = (index: number, reverse: boolean = false) => {
    const baseSpeed = state === "listening" ? 3 : state === "processing" ? 1.5 : state === "speaking" ? 2 : 15;
    return {
      rotate: reverse ? [-360, 0] : [0, 360],
      transition: { duration: baseSpeed + index * 2, repeat: Infinity, ease: "linear" as const }
    };
  };

  const getPulseAnimation = () => {
    if (state === "speaking") {
      return {
        scale: [1, 1.05, 0.98, 1.02, 1],
        opacity: [0.8, 1, 0.8, 1, 0.8],
        transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" as const }
      };
    }
    if (state === "listening") {
      return {
        scale: [1, 1.02, 1],
        opacity: [0.7, 1, 0.7],
        transition: { duration: 1, repeat: Infinity, ease: "easeInOut" as const }
      };
    }
    if (state === "processing") {
      return {
        scale: [0.98, 1.02, 0.98],
        opacity: [0.6, 0.9, 0.6],
        transition: { duration: 0.8, repeat: Infinity, ease: "linear" as const }
      };
    }
    return {
      scale: [1, 1.01, 1],
      opacity: [0.4, 0.6, 0.4],
      transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const }
    };
  };

  const getTheme = () => {
    switch (state) {
      case "listening": return { color: "#a855f7", glow: "shadow-violet-500/60" };
      case "processing": return { color: "#c084fc", glow: "shadow-violet-400/80" };
      case "speaking": return { color: "#d8b4fe", glow: "shadow-violet-300/80" };
      default: return { color: "#7e22ce", glow: "shadow-violet-700/40" };
    }
  };

  const theme = getTheme();

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      {/* Ambient Glow */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[45%] h-[45%] rounded-full blur-[60px]`}
        style={{ backgroundColor: theme.color, opacity: 0.08 }}
      />

      {/* Ring 1: Faint outer thin solid */}
      <motion.div
        animate={getRingAnimation(5, false)}
        className="absolute w-[95%] h-[95%] rounded-full border border-dashed border-[#9333ea] opacity-10"
      />

      {/* Ring 2: Detailed dashed */}
      <motion.div
        animate={getRingAnimation(4, true)}
        className="absolute w-[85%] h-[85%] rounded-full border border-dotted border-[#a855f7] opacity-20"
      />

      {/* Ring 3: Inner solid */}
      <motion.div
        animate={getRingAnimation(3, false)}
        className="absolute w-[75%] h-[75%] rounded-full border-[1.5px] border-[#a855f7] opacity-30 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
      />

      {/* Ring 4: Gap Solid Arc */}
      <motion.div
        animate={getRingAnimation(2, true)}
        className="absolute w-[62%] h-[62%] rounded-full border-[2px] border-[#c084fc] border-t-transparent border-b-transparent opacity-40 shadow-[inset_0_0_10px_rgba(192,132,252,0.3)]"
      />
      
      {/* Ring 5: Core bright thick ring */}
      <motion.div
        animate={getRingAnimation(1, false)}
        className="absolute w-[50%] h-[50%] rounded-full border-[3px] border-[#c084fc] border-l-transparent opacity-70 shadow-[0_0_30px_rgba(192,132,252,0.5)]"
      />

      {/* Inner Core Bubble */}
      <motion.div
        animate={getPulseAnimation()}
        className="absolute w-[42%] h-[42%] rounded-full bg-gradient-to-b from-[#9333ea]/20 to-[#4c1d95]/50 backdrop-blur-[2px] flex flex-col items-center justify-center shadow-[inset_0_0_40px_rgba(147,51,234,0.7)] border border-[#9333ea]/40"
      >
        <div className="absolute w-[70%] text-center text-gray-300 text-[9px] sm:text-[10px] md:text-xs font-serif tracking-[0.2em] opacity-80" style={{ top: '40%', transform: 'translateY(-50%)', textShadow: "0 0 10px rgba(255,255,255,0.3)" }}>
          Arclight
        </div>
        {/* Horizontal Laser Line */}
        <div className="absolute w-[80%] h-[1px] bg-[#c084fc] shadow-[0_0_8px_#c084fc,0_0_15px_#c084fc]" style={{ top: '50%' }} />
      </motion.div>
    </div>
  );  
}
