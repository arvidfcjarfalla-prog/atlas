"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── AuthModal ────────────────────────────────────────────────
// Inline auth sheet — no page navigation.
// Opens over the editor when user tries to save without being logged in.
// On successful login, calls onSuccess(user) so the parent can retry the action.

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
  reason?: string; // e.g. "för att spara din karta"
}

type Mode = "login" | "signup";

export function AuthModal({ open, onClose, onSuccess, reason = "för att fortsätta" }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode("login");
      setEmail("");
      setPassword("");
      setError(null);
      setLoading(false);
      setOauthLoading(false);
      setSignupDone(false);
    }
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) return;

    if (mode === "signup" && password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken");
      return;
    }

    setLoading(true);
    setError(null);

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Fel e-post eller lösenord");
        setLoading(false);
        return;
      }
      if (data.user) onSuccess(data.user);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/app` },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setSignupDone(true);
      setLoading(false);
    }
  }, [mode, email, password, onSuccess]);

  const handleGoogle = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    setOauthLoading(true);
    setError(null);
    sessionStorage.setItem("atlas_pending_save", "1");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=/app` },
    });
  }, []);

  const handleGithub = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    setOauthLoading(true);
    setError(null);
    sessionStorage.setItem("atlas_pending_save", "1");
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=/app` },
    });
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(4,6,12,0.70)",
          backdropFilter: "blur(4px)",
          animation: "fadeIn 150ms ease",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
        background: "#0e1118",
        border: "1px solid rgba(255,255,255,0.10)",
        borderBottom: "none",
        borderRadius: "16px 16px 0 0",
        padding: "28px 24px 36px",
        maxWidth: 420,
        margin: "0 auto",
        animation: "slideUp 220ms cubic-bezier(0.32,0.72,0,1)",
        boxShadow: "0 -24px 80px rgba(0,0,0,0.60)",
      }}>
        {/* Handle */}
        <div style={{ width: 32, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, margin: "0 auto 24px" }} />

        {signupDone ? (
          /* Signup confirmation */
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>📬</div>
            <h2 style={{ fontFamily: "'Geist', sans-serif", fontSize: 17, fontWeight: 500, color: "#F8F9FB", margin: "0 0 8px" }}>
              Kolla din e-post
            </h2>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.45)", lineHeight: 1.6, margin: "0 0 24px" }}>
              Vi skickade en bekräftelselänk till <strong style={{ color: "rgba(248,249,251,0.75)" }}>{email}</strong>. Aktivera kontot och logga in.
            </p>
            <button onClick={() => setMode("login")} style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.55)", background: "none", border: "none", cursor: "pointer" }}>
              ← Logga in istället
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Geist', sans-serif", fontSize: 17, fontWeight: 500, color: "#F8F9FB", margin: "0 0 4px" }}>
                {mode === "login" ? "Logga in" : "Skapa konto"} {reason}
              </h2>
              <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.38)", margin: 0 }}>
                Din karta sparas direkt efteråt.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: "rgba(201,79,79,0.10)", border: "1px solid rgba(201,79,79,0.25)", borderRadius: 8, padding: "9px 12px", marginBottom: 16 }}>
                <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "#C94F4F", margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthLoading || loading}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 10, padding: "10px 0", fontFamily: "'Geist', sans-serif", fontSize: 14, color: "rgba(248,249,251,0.75)", cursor: "pointer", marginBottom: 16, transition: "background 150ms ease", opacity: (oauthLoading || loading) ? 0.5 : 1 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              {oauthLoading ? "Öppnar Google…" : "Fortsätt med Google"}
            </button>

            {/* GitHub */}
            <button
              type="button"
              onClick={handleGithub}
              disabled={oauthLoading || loading}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 10, padding: "10px 0", fontFamily: "'Geist', sans-serif", fontSize: 14, color: "rgba(248,249,251,0.75)", cursor: "pointer", marginBottom: 16, transition: "background 150ms ease", opacity: (oauthLoading || loading) ? 0.5 : 1 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(248,249,251,0.75)">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              {oauthLoading ? "Öppnar GitHub…" : "Fortsätt med GitHub"}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 12, color: "rgba(248,249,251,0.25)" }}>eller</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-post"
                required
                autoComplete="email"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, padding: "10px 13px", fontFamily: "'Geist', sans-serif", fontSize: 14, color: "#F8F9FB", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Lösenord (minst 8 tecken)" : "Lösenord"}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, padding: "10px 13px", fontFamily: "'Geist', sans-serif", fontSize: 14, color: "#F8F9FB", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
              <button
                type="submit"
                disabled={loading || oauthLoading}
                style={{ marginTop: 2, width: "100%", background: "#1D4ED8", border: "none", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist', sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: (loading || oauthLoading) ? 0.6 : 1, transition: "background 150ms ease" }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#2563EB"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1D4ED8"; }}
              >
                {loading ? (mode === "login" ? "Loggar in…" : "Skapar konto…") : (mode === "login" ? "Logga in" : "Skapa konto")}
              </button>
            </form>

            {/* Mode toggle */}
            <p style={{ marginTop: 16, textAlign: "center", fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.30)", margin: "16px 0 0" }}>
              {mode === "login" ? "Inget konto? " : "Har du redan konto? "}
              <button
                type="button"
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.65)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                {mode === "login" ? "Skapa konto" : "Logga in"}
              </button>
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </>
  );
}
