import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Sparkles } from "lucide-react";

interface APIScreenProps {
  onSubmit: (apiKey: string) => Promise<void>;
}

export default function APIScreen({ onSubmit }: APIScreenProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("Please enter your API key");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSubmit(apiKey.trim());
    } catch (err: any) {
      setError(err.message || "Failed to validate API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen text-white p-4 relative overflow-hidden font-sans"
      style={{ background: 'radial-gradient(ellipse at center, #0a1628 0%, #060b15 40%, #000000 100%)' }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 z-0 pointer-events-none flex justify-center items-center">
        <div className="w-[500px] h-[500px] bg-[#4285F4] rounded-full blur-[200px] opacity-[0.04]" />
      </div>

      {/* ArcLight branding */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 mb-8 text-center"
      >
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          ArcLight
        </h1>
        <div className="mt-2 h-[1px] w-24 mx-auto bg-gradient-to-r from-transparent via-[#4285F4]/50 to-transparent" />
      </motion.div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="z-10 w-full max-w-md"
      >
        <div className="relative rounded-2xl p-[1.5px] overflow-hidden">
          {/* Animated border */}
          <div
            className="absolute inset-[-100%] z-0"
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, #4285F4 12%, transparent 25%, transparent 50%, #4285F4 62%, transparent 75%)`,
              animation: 'api-spin 6s linear infinite',
            }}
          />
          <div
            className="absolute inset-[-100%] z-0 opacity-40"
            style={{
              background: `conic-gradient(from 180deg, transparent 0%, #4285F4 12%, transparent 25%, transparent 50%, #4285F4 62%, transparent 75%)`,
              animation: 'api-spin 6s linear infinite',
              filter: 'blur(8px)',
            }}
          />

          {/* Card content */}
          <div className="relative z-[1] bg-[#111318] rounded-2xl p-7 sm:p-8">
            {/* Welcome message for first-time users */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-[#4285F4]" />
                <h2 className="text-lg font-semibold text-[#e8eaed]">Welcome to ArcLight</h2>
              </div>
              <p className="text-[14px] text-[#9aa0a6] leading-[1.7]">
                To get started, you'll need a Google AI Studio API key. This connects ArcLight to Gemini AI so you can chat, create, and explore.
              </p>
            </motion.div>

            {/* Step guide */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="mb-6 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center mt-0.5">
                  <span className="text-[11px] font-semibold text-[#4285F4]">1</span>
                </div>
                <div>
                  <p className="text-[13px] text-[#e8eaed]">
                    Visit{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#89b4f8] hover:text-[#aecbfa] underline decoration-[#89b4f8]/30 hover:decoration-[#aecbfa]/50 transition-colors"
                    >
                      Google AI Studio
                      <ExternalLink size={12} />
                    </a>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center mt-0.5">
                  <span className="text-[11px] font-semibold text-[#4285F4]">2</span>
                </div>
                <p className="text-[13px] text-[#e8eaed]">Click <span className="text-[#89b4f8] font-medium">"Create API Key"</span> and copy it</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center mt-0.5">
                  <span className="text-[11px] font-semibold text-[#4285F4]">3</span>
                </div>
                <p className="text-[13px] text-[#e8eaed]">Paste it below — you only need to do this once</p>
              </div>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[12px] text-[#9aa0a6] mb-2 font-medium">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-3 bg-[#1e1f20] border border-[#2a2b2c] rounded-xl text-[15px] text-[#e8eaed] placeholder-[#5f6368] focus:outline-none focus:border-[#4285F4]/50 focus:ring-1 focus:ring-[#4285F4]/20 transition-all"
                  disabled={loading}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-900/40 rounded-xl"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] text-red-400 leading-relaxed">{error}</p>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-6 bg-[#4285F4] hover:bg-[#5a9bf4] rounded-xl text-white font-medium text-[15px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#4285F4]/20 hover:shadow-[#4285F4]/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Continue
                  </>
                )}
              </button>
            </motion.form>

            {/* Footer note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.6 }}
              className="mt-5 text-[12px] text-[#5f6368] text-center leading-relaxed"
            >
              Your key is stored securely in your account and never shared.
            </motion.p>
          </div>
        </div>
      </motion.div>

      <style>{`
        @keyframes api-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
