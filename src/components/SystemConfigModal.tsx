// ONLY UI CHANGED — NO METHODS / LOGIC TOUCHED

import { useState, useEffect, useRef } from "react";
import { X, Sparkles, Heart, Briefcase, Users, Flame, Mic, Terminal, LineChart, Newspaper, Building, Bug, Cpu, Languages, Radio } from "lucide-react";
import { AppConfig, MoodType, VoiceType, getConfig, saveConfig, MODEL_OPTIONS, LANGUAGE_OPTIONS } from "../services/configService";
import { resetZoyaSession } from "../services/geminiService";
import { motion, AnimatePresence } from "framer-motion";

interface SystemConfigModalProps {
  onClose: () => void;
}

export default function SystemConfigModal({ onClose }: SystemConfigModalProps) {
  const [activeTab, setActiveTab] = useState<"MOOD" | "EXPERT" | "VOICE" | "MODEL" | "RULE BREAK">("MOOD");
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveConfig(config);
    resetZoyaSession();
  }, [config]);

 // REPLACE ONLY THE TEXT CONTENTS BELOW
// NO LOGIC / METHODS CHANGED

const moods: { id: MoodType; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "FUNNY",
    title: "CREATIVE",
    desc: "Engaging, witty, and conversational responses with a light and entertaining tone.",
    icon: <Sparkles size={16} />
  },
  {
    id: "ROMANTIC",
    title: "EMPATHETIC",
    desc: "Warm, thoughtful, and emotionally expressive communication style.",
    icon: <Heart size={16} />
  },
  {
    id: "WORK_MODE",
    title: "FOCUSED",
    desc: "Professional, efficient, and productivity-oriented interaction mode.",
    icon: <Briefcase size={16} />
  },
  {
    id: "FRIENDLY",
    title: "ASSISTANT",
    desc: "Supportive, reliable, and naturally conversational everyday assistance.",
    icon: <Users size={16} />
  },
  {
    id: "GAALI_MODE",
    title: "INTENSE",
    desc: "Direct, assertive, and high-energy communication style.",
    icon: <Flame size={16} />
  },
];

const ruleBreakModes: { id: MoodType; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "UNCENSORED_MODE",
    title: "ADVANCED MODE",
    desc: "Expanded response flexibility for technical and unrestricted discussions.",
    icon: <Terminal size={16} />
  },
  {
    id: "MALWARE_EXPERT",
    title: "CYBERSECURITY RESEARCH",
    desc: "Focused on reverse engineering, security analysis, and vulnerability research.",
    icon: <Bug size={16} />
  },
];

const expertModes: { id: MoodType; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "TRADING",
    title: "MARKET ANALYST",
    desc: "Insights into trading strategies, investing, market structure, and financial analysis.",
    icon: <LineChart size={16} />
  },
  {
    id: "NEWS_ANALYST",
    title: "NEWS INTELLIGENCE",
    desc: "Summarized coverage of global, financial, and technology-related developments.",
    icon: <Newspaper size={16} />
  },
  {
    id: "BUSINESS",
    title: "BUSINESS STRATEGY",
    desc: "Guidance for growth, management, investment, and operational decision-making.",
    icon: <Building size={16} />
  },
];

const voices: { id: VoiceType; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: "WOMAN",
    title: "FEMALE — PROFESSIONAL",
    desc: "Clear and confident mature female voice.",
    icon: <Mic size={16} />
  },
  {
    id: "MAN",
    title: "MALE — PROFESSIONAL",
    desc: "Deep and composed mature male voice.",
    icon: <Mic size={16} />
  },
  {
    id: "GIRL",
    title: "FEMALE — YOUTHFUL",
    desc: "Energetic and youthful female voice profile.",
    icon: <Mic size={16} />
  },
  {
    id: "BOY",
    title: "MALE — YOUTHFUL",
    desc: "Natural and youthful male voice profile.",
    icon: <Mic size={16} />
  },
];
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xl"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-3xl shadow-[0_8px_40px_rgba(0,0,0,0.45)] flex flex-col h-[85vh] sm:h-auto"
        >
          {/* Gemini Glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-0 w-72 h-72 bg-blue-500/20 blur-3xl rounded-full" />
            <div className="absolute bottom-0 right-0 w-72 h-72 bg-cyan-400/10 blur-3xl rounded-full" />
          </div>

          {/* Header */}
          <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-wide">
                System Config
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Personalize your AI experience
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="relative flex overflow-x-auto border-b border-white/10 bg-white/[0.03]">
            {(["MOOD", "EXPERT", "VOICE", "MODEL", "RULE BREAK"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex-1 py-4 text-[11px] font-medium tracking-wide transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? "text-white"
                    : "text-white/45 hover:text-white/75"
                }`}
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 border-b-2 border-cyan-300"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <span className="relative z-10">{tab}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="relative p-4 flex-1 overflow-y-auto min-h-[320px] space-y-3">

            {/* MOOD */}
            {activeTab === "MOOD" && (
              <div className="space-y-3">
                {moods.map((m) => {
                  const isActive = config.mood === m.id;

                  return (
                    <button
                      key={m.id}
                      onClick={() => setConfig({ ...config, mood: m.id })}
                      className={`group w-full relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 ${
                        isActive
                          ? "border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_25px_rgba(34,211,238,0.18)]"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                            isActive
                              ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-300"
                              : "border-white/10 bg-white/[0.03] text-white/60"
                          }`}
                        >
                          {m.icon}
                        </div>

                        <div className="flex-1 text-left">
                          <h3 className={`text-sm font-semibold ${isActive ? "text-white" : "text-white/85"}`}>
                            {m.title}
                          </h3>

                          <p className="text-xs text-white/45 mt-1 leading-relaxed">
                            {m.desc}
                          </p>
                        </div>

                        {isActive && (
                          <motion.div
                            layoutId="activeDot"
                            className="w-3 h-3 rounded-full bg-cyan-300 shadow-[0_0_14px_#67e8f9]"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* EXPERT */}
            {activeTab === "EXPERT" && (
              <div className="space-y-3">
                {expertModes.map((m) => {
                  const isActive = config.mood === m.id;

                  return (
                    <button
                      key={m.id}
                      onClick={() => setConfig({ ...config, mood: m.id })}
                      className={`w-full rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-emerald-400/40 bg-emerald-400/10"
                          : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                          isActive ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.04] text-white/60"
                        }`}>
                          {m.icon}
                        </div>

                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-white">{m.title}</div>
                          <div className="text-xs text-white/45 mt-1">{m.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* VOICE */}
            {activeTab === "VOICE" && (
              <div className="space-y-3">
                <button
                  onClick={() => setConfig({ ...config, voiceQuality: config.voiceQuality === "ultra" ? "standard" : "ultra" })}
                  className={`w-full rounded-2xl border p-4 transition-all ${
                    config.voiceQuality === "ultra"
                      ? "border-fuchsia-400/40 bg-fuchsia-400/10 shadow-[0_0_25px_rgba(217,70,239,0.16)]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                      config.voiceQuality === "ultra" ? "bg-fuchsia-400/15 text-fuchsia-300" : "bg-white/[0.04] text-white/60"
                    }`}>
                      <Radio size={16} />
                    </div>

                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-white">ULTRA-REALISTIC AI VOICE</div>
                      <div className="text-xs text-white/45 mt-1">Natural pacing, expressive delivery, and human-like speech style.</div>
                    </div>

                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${config.voiceQuality === "ultra" ? "bg-fuchsia-400" : "bg-white/10"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.voiceQuality === "ultra" ? "translate-x-4" : ""}`} />
                    </div>
                  </div>
                </button>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/[0.04] text-cyan-300 flex items-center justify-center">
                      <Languages size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">MULTI-LANGUAGE SPEECH</div>
                      <div className="text-xs text-white/45 mt-1">Switch voice assistant and typing mic language instantly.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGE_OPTIONS.map((language) => {
                      const isActive = config.language === language;

                      return (
                        <button
                          key={language}
                          onClick={() => setConfig({ ...config, language })}
                          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? "bg-cyan-400/15 text-cyan-200 border border-cyan-300/30"
                              : "bg-white/[0.04] text-white/55 border border-white/10 hover:text-white"
                          }`}
                        >
                          {language}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {voices.map((v) => {
                  const isActive = config.voice === v.id;

                  return (
                    <button
                      key={v.id}
                      onClick={() => setConfig({ ...config, voice: v.id })}
                      className={`w-full rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-violet-400/40 bg-violet-400/10"
                          : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                          isActive ? "bg-violet-400/15 text-violet-300" : "bg-white/[0.04] text-white/60"
                        }`}>
                          {v.icon}
                        </div>

                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-white">{v.title}</div>
                          <div className="text-xs text-white/45 mt-1">{v.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* MODEL */}
            {activeTab === "MODEL" && (
              <div className="space-y-3">
                {MODEL_OPTIONS.map((m) => {
                  const isActive = config.model === m.id;

                  return (
                    <button
                      key={m.id}
                      onClick={() => setConfig({ ...config, model: m.id })}
                      className={`w-full rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-sky-400/40 bg-sky-400/10"
                          : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                          isActive ? "bg-sky-400/15 text-sky-300" : "bg-white/[0.04] text-white/60"
                        }`}>
                          <Cpu size={16} />
                        </div>

                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-white">{m.name}</div>
                          <div className="text-xs text-white/45 mt-1">{m.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* RULE BREAK */}
            {activeTab === "RULE BREAK" && (
              <div className="space-y-3">
                {ruleBreakModes.map((m) => {
                  const isActive = config.mood === m.id;

                  return (
                    <button
                      key={m.id}
                      onClick={() => setConfig({ ...config, mood: m.id })}
                      className={`w-full rounded-2xl border p-4 transition-all ${
                        isActive
                          ? "border-red-400/40 bg-red-400/10"
                          : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                          isActive ? "bg-red-400/15 text-red-300" : "bg-white/[0.04] text-white/60"
                        }`}>
                          {m.icon}
                        </div>

                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-white">{m.title}</div>
                          <div className="text-xs text-white/45 mt-1">{m.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="relative flex items-center justify-between px-5 py-4 border-t border-white/10 bg-white/[0.03]">
            <span className="text-[11px] text-white/40">
              Changes apply instantly
            </span>

            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-medium shadow-lg shadow-cyan-500/20 hover:scale-[1.03] active:scale-[0.98] transition-all"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
