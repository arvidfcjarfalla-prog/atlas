"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";

const SUGGESTIONS = [
  "Befolkningstäthet i Europa",
  "Kaffeställen i Stockholm",
  "Jordbävningar senaste veckan",
  "BNP per capita i Afrika",
];

export default function AppHomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const pendingHandled = useRef(false);

  // Recover pending map after OAuth redirect
  useEffect(() => {
    if (authLoading || !user || pendingHandled.current) return;
    pendingHandled.current = true;

    try {
      const pendingSave = sessionStorage.getItem("atlas_pending_save");
      const pendingMapRaw = sessionStorage.getItem("atlas_pending_map");
      if (!pendingSave || !pendingMapRaw) return;

      // Clear immediately to prevent double-save on re-render
      sessionStorage.removeItem("atlas_pending_save");
      sessionStorage.removeItem("atlas_pending_map");

      const pendingMap = JSON.parse(pendingMapRaw);
      if (!pendingMap?.manifest) return;

      fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pendingMap.manifest.title ?? pendingMap.prompt?.slice(0, 60) ?? "Namnlös karta",
          prompt: pendingMap.prompt ?? "",
          manifest: pendingMap.manifest,
          is_public: false,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const mapId = data?.map?.id;
          if (mapId) {
            queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
            router.replace(`/app/map/${mapId}`);
          }
        })
        .catch(() => {});
    } catch { /* ignore parse errors */ }
  }, [authLoading, user, router]);

  function handleSubmit() {
    const q = value.trim();
    if (!q) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(q)}`);
  }

  return (
    <div
      className="relative h-full"
      style={{ backgroundColor: "#0d1217" }}
    >
      {/* Prompt bar — fixed at bottom center */}
      <div className="absolute bottom-7 left-1/2 w-full max-w-xl -translate-x-1/2 px-6">
        <div
          className="flex items-center overflow-hidden rounded-2xl transition-all"
          style={{
            background: "rgba(16,22,30,0.72)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: focused
              ? "1px solid rgba(255,255,255,0.15)"
              : "1px solid rgba(255,255,255,0.06)",
            boxShadow: focused
              ? "0 0 0 3px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.30)"
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
                fontFamily: "'Courier New', monospace",
                color: "#908c85",
                backgroundColor: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
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
