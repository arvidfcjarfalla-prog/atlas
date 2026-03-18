"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { Suspense } from "react";

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
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/dashboard`,
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
        redirectTo: `${window.location.origin}/auth/callback?redirect=/dashboard`,
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
        <div style={{ width: "100%", maxWidth: 380, padding: "0 24px", textAlign: "center" }}>
          <div style={{ marginBottom: 24, fontSize: 40 }}>📬</div>
          <h1 style={{ fontFamily: "'Geist',sans-serif", fontSize: 20, fontWeight: 500, color: "#F8F9FB", marginBottom: 12 }}>
            Kolla din e-post
          </h1>
          <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.50)", lineHeight: 1.6 }}>
            Vi skickade en bekräftelselänk till <strong style={{ color: "rgba(248,249,251,0.80)" }}>{email}</strong>.
            Klicka på länken för att aktivera ditt konto.
          </p>
          <a href="/login" style={{ display: "inline-block", marginTop: 28, fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.40)", textDecoration: "none" }}>
            Tillbaka till inloggning
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0d14]">
      <style>{`
        input::placeholder { color: rgba(248,249,251,0.30) }
      `}</style>

      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        {/* Logo */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 22, fontWeight: 500, color: "#F8F9FB", letterSpacing: "-0.01em" }}>atlas</span>
        </div>

        <h1 style={{ fontFamily: "'Geist',sans-serif", fontSize: 20, fontWeight: 500, color: "#F8F9FB", marginBottom: 8, textAlign: "center" }}>
          Skapa konto
        </h1>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.45)", textAlign: "center", marginBottom: 32 }}>
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
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.80)", cursor: "pointer", marginBottom: 20, transition: "background 150ms ease", opacity: (oauthLoading || loading) ? 0.5 : 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {oauthLoading ? "Öppnar Google…" : "Fortsätt med Google"}
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
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(12,14,18,0.60)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", fontFamily: "'Geist',sans-serif", fontSize: 15, color: "#F8F9FB", outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.30)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
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
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(12,14,18,0.60)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px", fontFamily: "'Geist',sans-serif", fontSize: 15, color: "#F8F9FB", outline: "none" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.30)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || oauthLoading}
            style={{ marginTop: 4, width: "100%", background: "#1D4ED8", border: "none", borderRadius: 10, padding: "11px 0", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer", opacity: (loading || oauthLoading) ? 0.6 : 1, transition: "background 150ms ease" }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#2563EB"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1D4ED8"; }}
          >
            {loading ? "Skapar konto…" : "Skapa konto"}
          </button>
        </form>

        <p style={{ marginTop: 28, textAlign: "center", fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.35)" }}>
          Har du redan konto?{" "}
          <a href="/login" style={{ color: "rgba(248,249,251,0.70)", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#F8F9FB"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.70)"; }}>
            Logga in
          </a>
        </p>
        <p style={{ marginTop: 16, textAlign: "center" }}>
          <a href="/" style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.25)", textDecoration: "none" }}>
            ← Tillbaka till kartan
          </a>
        </p>
      </div>
    </div>
  );
}
