"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";
import { AuthBackground, AuthCard } from "@/components/auth-background";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken");
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/app`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  async function handleGoogle() {
    if (!supabase) return;
    setOauthLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/app`,
      },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(false);
    }
  }

  async function handleGithub() {
    if (!supabase) return;
    setOauthLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/app`,
      },
    });
    if (error) {
      setError(error.message);
      setOauthLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0d14]">
        <AuthBackground />
        <AuthCard>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 24, fontSize: 40 }}>📬</div>
            <h1 style={{ fontFamily: "'Geist',sans-serif", fontSize: 20, fontWeight: 500, color: "#F8F9FB", marginBottom: 12 }}>
              Kolla din e-post
            </h1>
            <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.50)", lineHeight: 1.6 }}>
              Vi skickade en bekräftelselänk till <strong style={{ color: "rgba(248,249,251,0.80)" }}>{email}</strong>.
              Klicka på länken för att aktivera ditt konto.
            </p>
            <a href="/auth/login" style={{ display: "inline-block", marginTop: 28, fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.40)", textDecoration: "none" }}>
              Tillbaka till inloggning
            </a>
          </div>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0d14]">
      <style>{`
        input::placeholder { color: rgba(248,249,251,0.30) }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 40px rgba(12,14,18,0.95) inset !important;
          -webkit-text-fill-color: #F8F9FB !important;
          caret-color: #F8F9FB;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
      <AuthBackground />

      <AuthCard>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 22, fontWeight: 500, color: "#F8F9FB", letterSpacing: "-0.01em" }}>atlas</span>
        </div>

        <h1 style={{ fontFamily: "'Geist',sans-serif", fontSize: 20, fontWeight: 500, color: "#F8F9FB", marginBottom: 8, textAlign: "center" }}>
          Skapa konto
        </h1>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.45)", textAlign: "center", marginBottom: 28 }}>
          Spara och dela dina kartor
        </p>

        {error && (
          <div style={{ background: "rgba(201,79,79,0.12)", border: "1px solid rgba(201,79,79,0.30)", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
            <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "#C94F4F", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={oauthLoading || loading}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.80)", cursor: "pointer", marginBottom: 10, transition: "background 150ms ease", opacity: (oauthLoading || loading) ? 0.5 : 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {oauthLoading ? "Öppnar Google\u2026" : "Fortsätt med Google"}
        </button>

        {/* GitHub OAuth */}
        <button
          type="button"
          onClick={handleGithub}
          disabled={oauthLoading || loading}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.80)", cursor: "pointer", marginBottom: 20, transition: "background 150ms ease", opacity: (oauthLoading || loading) ? 0.5 : 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(248,249,251,0.80)">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          {oauthLoading ? "Öppnar GitHub\u2026" : "Fortsätt med GitHub"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.30)" }}>eller</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.45)", display: "block", marginBottom: 6 }}>E-post</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@exempel.se"
              required
              autoComplete="email"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(12,14,18,0.60)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 14px", fontFamily: "'Geist',sans-serif", fontSize: 15, color: "#F8F9FB", outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
            />
          </div>
          <div>
            <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 12, color: "rgba(248,249,251,0.45)", display: "block", marginBottom: 6 }}>Lösenord <span style={{ color: "rgba(248,249,251,0.25)" }}>(minst 8 tecken)</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(12,14,18,0.60)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 14px", fontFamily: "'Geist',sans-serif", fontSize: 15, color: "#F8F9FB", outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || oauthLoading}
            style={{ marginTop: 4, width: "100%", background: "rgba(142,203,160,0.15)", border: "1px solid rgba(142,203,160,0.25)", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#8ecba0", cursor: "pointer", opacity: (loading || oauthLoading) ? 0.6 : 1, transition: "all 150ms ease" }}
            onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(142,203,160,0.22)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(142,203,160,0.40)"; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(142,203,160,0.15)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(142,203,160,0.25)"; }}
          >
            {loading ? "Skapar konto\u2026" : "Skapa konto"}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: "center", fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.35)" }}>
          Har du redan konto?{" "}
          <a href="/auth/login" style={{ color: "rgba(248,249,251,0.70)", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#F8F9FB"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.70)"; }}>
            Logga in
          </a>
        </p>
        <p style={{ marginTop: 12, textAlign: "center" }}>
          <a href="/" style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.25)", textDecoration: "none" }}>
            &larr; Tillbaka till kartan
          </a>
        </p>
      </AuthCard>
    </div>
  );
}
