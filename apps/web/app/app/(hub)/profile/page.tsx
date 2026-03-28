"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/use-auth";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#908c85",
  pro: "#8ecba0",
  enterprise: "#d4a574",
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapCount, setMapCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display name from profile
  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
    else if (user?.email) setDisplayName(user.email.split("@")[0]);
  }, [profile, user]);

  // Fetch map count
  useEffect(() => {
    if (!user) return;
    fetch("/api/maps?limit=1")
      .then((r) => r.json())
      .then((d) => setMapCount(d.total ?? 0))
      .catch(() => {});
  }, [user]);

  // Focus input when editing starts
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) await refreshProfile();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setEditing(false);
      setDisplayName(profile?.display_name || user?.email?.split("@")[0] || "");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (authLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: "#0d1217" }}
      >
        <span
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 13,
            color: "#5a5752",
          }}
        >
          Laddar…
        </span>
      </div>
    );
  }

  const plan = profile?.plan ?? "free";
  const initial = (
    profile?.display_name || user?.email || "?"
  )[0].toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "long",
      })
    : null;

  return (
    <div
      className="h-full overflow-auto"
      style={{ backgroundColor: "#0d1217", color: "#e4e0d8" }}
    >
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 28px 80px" }}>
        {/* Header */}
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 26,
            fontWeight: 600,
            color: "#e4e0d8",
            margin: "0 0 32px",
            letterSpacing: "-0.04em",
            animation: "fadeUp 200ms ease",
          }}
        >
          Profil
        </h1>

        {/* Account card */}
        <div
          style={{
            background: "rgba(16, 22, 30, 0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "24px",
            marginBottom: 20,
            animation: "fadeUp 250ms ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Avatar initial */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "rgba(142,203,160,0.12)",
                border: "1px solid rgba(142,203,160,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Georgia, serif",
                fontSize: 22,
                color: "#8ecba0",
                flexShrink: 0,
              }}
            >
              {initial}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Display name — inline editable */}
              {editing ? (
                <input
                  ref={inputRef}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  disabled={saving}
                  maxLength={100}
                  style={{
                    fontFamily: "'Geist', sans-serif",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#e4e0d8",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(142,203,160,0.3)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    margin: "-4px -8px",
                    outline: "none",
                    width: "calc(100% + 16px)",
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    fontFamily: "'Geist', sans-serif",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#e4e0d8",
                    background: "none",
                    border: "none",
                    padding: "4px 8px",
                    margin: "-4px -8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "background 150ms",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                  title="Klicka för att redigera"
                >
                  {profile?.display_name || user?.email?.split("@")[0]}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#5a5752"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginLeft: 6, verticalAlign: "middle" }}
                  >
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              )}

              {/* Email */}
              <div
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  color: "#5a5752",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.email}
              </div>
            </div>

            {/* Plan badge */}
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: PLAN_COLORS[plan],
                background: `${PLAN_COLORS[plan]}14`,
                border: `1px solid ${PLAN_COLORS[plan]}30`,
                borderRadius: 6,
                padding: "3px 8px",
                flexShrink: 0,
              }}
            >
              {PLAN_LABELS[plan]}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
            animation: "fadeUp 300ms ease",
          }}
        >
          <div
            style={{
              background: "rgba(16, 22, 30, 0.72)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "#5a5752",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Kartor
            </div>
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 22,
                color: "#e4e0d8",
              }}
            >
              {mapCount !== null ? mapCount : "–"}
            </div>
          </div>
          <div
            style={{
              background: "rgba(16, 22, 30, 0.72)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "#5a5752",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Medlem sedan
            </div>
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 16,
                color: "#e4e0d8",
              }}
            >
              {memberSince ?? "–"}
            </div>
          </div>
        </div>

        {/* Plan section */}
        <div
          style={{
            background: "rgba(16, 22, 30, 0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
            animation: "fadeUp 350ms ease",
          }}
        >
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "#5a5752",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 8,
            }}
          >
            Ditt abonnemang
          </div>
          <div
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 15,
              color: "#e4e0d8",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {PLAN_LABELS[plan]}
          </div>
          <p
            style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: 13,
              color: "#908c85",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            {plan === "free"
              ? "Skapa kartor med grundläggande funktioner. Uppgradera för fler kartor och avancerade features."
              : plan === "pro"
                ? "Obegränsade kartor, prioriterad AI-generering och anpassade baskartor."
                : "Allt i Pro plus teamhantering, SSO och dedikerad support."}
          </p>
          {plan === "free" && (
            <Link
              href="/pricing"
              className="inline-block rounded-lg px-4 py-2 text-sm font-medium transition-all hover:brightness-110"
              style={{
                backgroundColor: "#8ecba0",
                color: "#0d1217",
              }}
            >
              Uppgradera
            </Link>
          )}
        </div>

        {/* Danger zone */}
        <div
          style={{
            background: "rgba(16, 22, 30, 0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "20px 24px",
            animation: "fadeUp 400ms ease",
          }}
        >
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              color: "#5a5752",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            Konto
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-red-500/10"
            style={{
              color: "#e5534b",
              border: "1px solid rgba(229,83,75,0.2)",
              background: "none",
              cursor: "pointer",
            }}
          >
            Logga ut
          </button>
        </div>
      </main>
    </div>
  );
}
