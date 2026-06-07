import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error("Google sign-in did not return an ID token.");
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err: any) {
      console.error("Google login failed:", err);
      setError(err.message || "Failed to sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: any) {
      const msg = err.code === "auth/invalid-credential"
        ? "Invalid email or password. Please try again."
        : err.code === "auth/email-already-in-use"
        ? "This email is already registered. Try signing in."
        : err.code === "auth/weak-password"
        ? "Password should be at least 6 characters."
        : err.code === "auth/invalid-email"
        ? "Please enter a valid email address."
        : err.message || "Authentication failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await sendPasswordResetEmail(auth, email.trim());
      setForgotSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
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

      {/* Branding */}
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
              animation: 'login-spin 6s linear infinite',
            }}
          />
          <div
            className="absolute inset-[-100%] z-0 opacity-40"
            style={{
              background: `conic-gradient(from 180deg, transparent 0%, #4285F4 12%, transparent 25%, transparent 50%, #4285F4 62%, transparent 75%)`,
              animation: 'login-spin 6s linear infinite',
              filter: 'blur(8px)',
            }}
          />

          {/* Card content */}
          <div className="relative z-[1] bg-[#111318] rounded-2xl p-7 sm:p-8">

            {/* Forgot Password View */}
            <AnimatePresence mode="wait">
              {showForgot ? (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <h2 className="text-lg font-semibold text-[#e8eaed] mb-2">Reset Password</h2>
                  <p className="text-[14px] text-[#9aa0a6] leading-[1.7] mb-6">
                    {forgotSent
                      ? "Check your inbox for the password reset link."
                      : "Enter your email and we'll send you a reset link."}
                  </p>

                  {!forgotSent && (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div>
                        <label className="block text-[12px] text-[#9aa0a6] mb-2 font-medium">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@gmail.com"
                          className="w-full px-4 py-3 bg-[#1e1f20] border border-[#2a2b2c] rounded-xl text-[15px] text-[#e8eaed] placeholder-[#5f6368] focus:outline-none focus:border-[#4285F4]/50 focus:ring-1 focus:ring-[#4285F4]/20 transition-all"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-6 bg-[#4285F4] hover:bg-[#5a9bf4] rounded-xl text-white font-medium text-[15px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#4285F4]/20"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {loading ? "Sending..." : "Send Reset Link"}
                      </button>
                    </form>
                  )}

                  <button
                    onClick={() => { setShowForgot(false); setForgotSent(false); setError(""); }}
                    className="mt-5 w-full text-center text-[13px] text-[#89b4f8] hover:text-[#aecbfa] transition-colors"
                  >
                    Back to sign in
                  </button>
                </motion.div>
              ) : (
                /* Main Auth View */
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25 }}
                >
                  {/* Header */}
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-[#e8eaed] mb-1">
                      {isSignup ? "Create your account" : "Welcome back"}
                    </h2>
                    <p className="text-[14px] text-[#9aa0a6] leading-[1.7]">
                      {isSignup ? "Sign up to start using ArcLight." : "Sign in to continue to ArcLight."}
                    </p>
                  </div>

                  {/* Google Sign-In */}
                  <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-3 px-4 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[#e8eaed] font-medium text-[15px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mb-5"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {loading ? "Signing in..." : "Continue with Google"}
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-[#2a2b2c]" />
                    <span className="text-[12px] text-[#5f6368] font-medium">or</span>
                    <div className="flex-1 h-px bg-[#2a2b2c]" />
                  </div>

                  {/* Email/Password Form */}
                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div>
                      <label className="block text-[12px] text-[#9aa0a6] mb-2 font-medium">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@gmail.com"
                        autoComplete="email"
                        className="w-full px-4 py-3 bg-[#1e1f20] border border-[#2a2b2c] rounded-xl text-[15px] text-[#e8eaed] placeholder-[#5f6368] focus:outline-none focus:border-[#4285F4]/50 focus:ring-1 focus:ring-[#4285F4]/20 transition-all"
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] text-[#9aa0a6] mb-2 font-medium">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          autoComplete={isSignup ? "new-password" : "current-password"}
                          className="w-full px-4 py-3 pr-11 bg-[#1e1f20] border border-[#2a2b2c] rounded-xl text-[15px] text-[#e8eaed] placeholder-[#5f6368] focus:outline-none focus:border-[#4285F4]/50 focus:ring-1 focus:ring-[#4285F4]/20 transition-all"
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f6368] hover:text-[#9aa0a6] transition-colors p-0.5"
                        >
                          {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                        </button>
                      </div>
                    </div>

                    {/* Error */}
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

                    {/* Forgot password link */}
                    {!isSignup && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowForgot(true); setError(""); }}
                          className="text-[12px] text-[#89b4f8] hover:text-[#aecbfa] transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-6 bg-[#4285F4] hover:bg-[#5a9bf4] rounded-xl text-white font-medium text-[15px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#4285F4]/20 hover:shadow-[#4285F4]/30"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {isSignup ? "Creating account..." : "Signing in..."}
                        </>
                      ) : (
                        <>
                          <LogIn size={16} strokeWidth={1.5} />
                          {isSignup ? "Create account" : "Sign in"}
                        </>
                      )}
                    </button>
                  </form>

                  {/* Toggle signup/signin */}
                  <p className="mt-5 text-center text-[13px] text-[#9aa0a6]">
                    {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                    <button
                      onClick={() => { setIsSignup(!isSignup); setError(""); }}
                      className="text-[#89b4f8] hover:text-[#aecbfa] font-medium transition-colors"
                    >
                      {isSignup ? "Sign in" : "Sign up"}
                    </button>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="z-10 mt-6 text-[12px] text-[#5f6368]"
      >
        Secured by Firebase
      </motion.p>

      <style>{`
        @keyframes login-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
