"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";

const SUGGESTIONS = [
  "Befolkningstäthet i Europa",
  "Kaffeställen i Stockholm",
  "Jordbävningar senaste veckan",
  "BNP per capita i Afrika",
];

export default function AppHomePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  function handleSubmit() {
    const q = value.trim();
    if (!q) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(q)}`);
  }

  const displayName = profile?.display_name ?? user?.email?.split("@")[0];

  return (
    <div
      className="relative flex h-full flex-col items-center justify-center"
      style={{ backgroundColor: "#0d1217" }}
    >
      {/* Welcome */}
      <div className="mb-8 text-center">
        <h1
          className="mb-2 text-2xl font-semibold tracking-tight"
          style={{
            fontFamily: "Georgia, serif",
            color: "#e4e0d8",
          }}
        >
          {displayName ? `Hej, ${displayName}` : "Välkommen till Atlas"}
        </h1>
        <p className="text-sm" style={{ color: "#908c85" }}>
          Beskriv en karta du vill skapa
        </p>
      </div>

      {/* Prompt bar */}
      <div className="w-full max-w-xl px-6">
        <div
          className="flex items-center overflow-hidden rounded-2xl transition-all"
          style={{
            background: "rgba(16,22,30,0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: focused
              ? "1px solid rgba(142,203,160,0.35)"
              : "1px solid rgba(255,255,255,0.06)",
            boxShadow: focused
              ? "0 0 0 3px rgba(142,203,160,0.08), 0 8px 32px rgba(0,0,0,0.30)"
              : "0 8px 32px rgba(0,0,0,0.20)",
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Beskriv din nästa karta..."
            className="h-14 flex-1 bg-transparent px-5 text-[15px] outline-none placeholder:text-[#5a5752]"
            style={{
              fontFamily: "'Geist', sans-serif",
              color: "#e4e0d8",
            }}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            className="mr-2.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-all"
            style={{
              backgroundColor: value.trim() ? "#d4a574" : "rgba(212,165,116,0.15)",
              cursor: value.trim() ? "pointer" : "default",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={value.trim() ? "#0d1217" : "rgba(212,165,116,0.4)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Suggestion pills */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setValue(s);
                router.push(`/app/map/new?prompt=${encodeURIComponent(s)}`);
              }}
              className="rounded-full px-3.5 py-1.5 text-xs transition-colors hover:border-white/10 hover:bg-white/[0.06]"
              style={{
                fontFamily: "'Geist', sans-serif",
                color: "#908c85",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
