"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { MapRow } from "../../lib/supabase/types";
import type { User } from "@supabase/supabase-js";

// ─── Family metadata ──────────────────────────────────────────

const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth",
    color: "#6B8CFF",
    bg: "radial-gradient(ellipse at 30% 40%, rgba(107,140,255,0.18) 0%, transparent 65%), radial-gradient(ellipse at 75% 70%, rgba(107,140,255,0.08) 0%, transparent 55%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <path d="M20 40 L60 20 L100 35 L140 15 L185 30 L180 80 L140 95 L100 75 L60 90 L20 70Z" fill="rgba(107,140,255,0.12)" stroke="rgba(107,140,255,0.30)" strokeWidth="1"/>
        <path d="M20 70 L60 90 L100 75 L140 95 L180 80 L175 115 L135 125 L95 110 L55 120 L18 105Z" fill="rgba(107,140,255,0.22)" stroke="rgba(107,140,255,0.35)" strokeWidth="1"/>
        <path d="M60 20 L100 35 L100 75 L60 90 L20 70 L20 40Z" fill="rgba(107,140,255,0.08)" stroke="rgba(107,140,255,0.20)" strokeWidth="0.8"/>
        <path d="M100 35 L140 15 L180 30 L180 80 L140 95 L100 75Z" fill="rgba(107,140,255,0.30)" stroke="rgba(107,140,255,0.40)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  heatmap: {
    label: "Heatmap",
    color: "#FF6B35",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(255,107,53,0.22) 0%, transparent 60%), radial-gradient(ellipse at 70% 30%, rgba(255,160,60,0.14) 0%, transparent 50%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="80" cy="65" rx="55" ry="42" fill="rgba(255,107,53,0.08)"/>
        <ellipse cx="80" cy="65" rx="38" ry="28" fill="rgba(255,107,53,0.16)"/>
        <ellipse cx="80" cy="65" rx="22" ry="16" fill="rgba(255,107,53,0.28)"/>
        <ellipse cx="80" cy="65" rx="10" ry="8" fill="rgba(255,107,53,0.50)"/>
        <ellipse cx="145" cy="45" rx="30" ry="22" fill="rgba(255,160,60,0.10)"/>
        <ellipse cx="145" cy="45" rx="16" ry="12" fill="rgba(255,160,60,0.22)"/>
        <ellipse cx="145" cy="45" rx="6" ry="5" fill="rgba(255,160,60,0.45)"/>
      </svg>
    ),
  },
  point: {
    label: "Punkter",
    color: "#B06AFF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(176,106,255,0.14) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        {[[40,55],[70,35],[95,60],[120,40],[150,55],[165,30],[55,90],[90,105],[130,85],[160,95],[45,75],[110,70]].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2.5} fill="rgba(176,106,255,0.70)" opacity={0.5 + (i % 4) * 0.12}/>
        ))}
      </svg>
    ),
  },
  cluster: {
    label: "Kluster",
    color: "#B06AFF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(176,106,255,0.14) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <circle cx="70" cy="60" r="22" fill="rgba(176,106,255,0.18)" stroke="rgba(176,106,255,0.35)" strokeWidth="1"/>
        <circle cx="70" cy="60" r="8" fill="rgba(176,106,255,0.60)"/>
        <text x="70" y="64" textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace">12</text>
        <circle cx="140" cy="50" r="16" fill="rgba(176,106,255,0.14)" stroke="rgba(176,106,255,0.30)" strokeWidth="1"/>
        <circle cx="140" cy="50" r="6" fill="rgba(176,106,255,0.55)"/>
        <text x="140" y="54" textAnchor="middle" fill="white" fontSize="7" fontFamily="monospace">7</text>
        <circle cx="110" cy="100" r="12" fill="rgba(176,106,255,0.12)" stroke="rgba(176,106,255,0.25)" strokeWidth="1"/>
        <circle cx="110" cy="100" r="5" fill="rgba(176,106,255,0.50)"/>
        <text x="110" y="103" textAnchor="middle" fill="white" fontSize="6" fontFamily="monospace">4</text>
      </svg>
    ),
  },
  flow: {
    label: "Flöde",
    color: "#38C8F0",
    bg: "radial-gradient(ellipse at 20% 50%, rgba(56,200,240,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 50%, rgba(56,200,240,0.08) 0%, transparent 50%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <path d="M30 70 C70 30, 130 110, 170 70" stroke="rgba(56,200,240,0.55)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M30 70 C65 50, 125 95, 170 70" stroke="rgba(56,200,240,0.30)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M30 70 C70 100, 130 45, 170 70" stroke="rgba(56,200,240,0.20)" strokeWidth="1" fill="none" strokeLinecap="round"/>
        <circle cx="30" cy="70" r="5" fill="rgba(56,200,240,0.80)"/>
        <circle cx="170" cy="70" r="5" fill="rgba(56,200,240,0.80)"/>
        <polygon points="162,65 170,70 162,75" fill="rgba(56,200,240,0.90)"/>
      </svg>
    ),
  },
  isochrone: {
    label: "Isokon",
    color: "#34D399",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(52,211,153,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="100" cy="70" rx="70" ry="50" fill="rgba(52,211,153,0.06)" stroke="rgba(52,211,153,0.20)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="100" cy="70" rx="48" ry="34" fill="rgba(52,211,153,0.10)" stroke="rgba(52,211,153,0.30)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="100" cy="70" rx="28" ry="20" fill="rgba(52,211,153,0.18)" stroke="rgba(52,211,153,0.45)" strokeWidth="1"/>
        <circle cx="100" cy="70" r="5" fill="rgba(52,211,153,0.90)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportionell",
    color: "#FBBF24",
    bg: "radial-gradient(ellipse at 45% 50%, rgba(251,191,36,0.14) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
        <circle cx="90" cy="65" r="30" fill="rgba(251,191,36,0.14)" stroke="rgba(251,191,36,0.35)" strokeWidth="1"/>
        <circle cx="145" cy="55" r="18" fill="rgba(251,191,36,0.18)" stroke="rgba(251,191,36,0.40)" strokeWidth="1"/>
        <circle cx="55" cy="90" r="12" fill="rgba(251,191,36,0.22)" stroke="rgba(251,191,36,0.45)" strokeWidth="1"/>
        <circle cx="160" cy="95" r="7" fill="rgba(251,191,36,0.30)" stroke="rgba(251,191,36,0.50)" strokeWidth="1"/>
      </svg>
    ),
  },
};

const FALLBACK_META = FAMILY_META.choropleth;

// ─── Map card ────────────────────────────────────────────────

function MapCard({
  map,
  onRename,
  onDelete,
  onShare,
  index,
}: {
  map: MapRow;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onShare: (map: MapRow) => void;
  index: number;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(map.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const family = (() => {
    try {
      const layers = (map.manifest as Record<string, unknown>)?.layers as Record<string, unknown>[] | undefined;
      return (layers?.[0]?.style as Record<string, string> | undefined)?.mapFamily ?? "choropleth";
    } catch { return "choropleth"; }
  })();

  const meta = FAMILY_META[family] ?? FALLBACK_META;

  // Vary card heights for masonry rhythm — tall, medium, short pattern
  const heightPattern = [220, 180, 260, 200, 240, 175];
  const thumbHeight = heightPattern[index % heightPattern.length];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  }

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed) { setTitle(map.title); setEditing(false); return; }
    setEditing(false);
    if (trimmed !== map.title) onRename(map.id, trimmed);
  }

  const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div
      style={{ breakInside: "avoid", marginBottom: 12, cursor: "pointer", position: "relative", borderRadius: 12, overflow: "hidden", background: "#0e1118", border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={() => !editing && router.push(`/maps/${map.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", height: thumbHeight, background: "#0b0d15", overflow: "hidden" }}>
        {/* Ambient bg */}
        <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 400ms ease", opacity: hovered ? 1 : 0.7 }} />

        {/* SVG illustration */}
        <div style={{ position: "absolute", inset: 0 }}>
          {meta.thumbnail}
        </div>

        {/* Subtle grid */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        {/* Hover overlay — slides up */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(8,10,18,0.97) 0%, rgba(8,10,18,0.60) 50%, transparent 100%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 220ms ease",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          padding: "16px 14px",
        }}>
          {/* Prompt */}
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "rgba(248,249,251,0.45)", margin: "0 0 12px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {map.prompt}
          </p>

          {/* Action row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => router.push(`/maps/${map.id}`)}
              style={{ flex: 1, height: 30, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500, color: "rgba(248,249,251,0.80)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "background 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.16)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.10)"; }}
            >
              Öppna
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button
              onClick={() => onShare(map)}
              title="Dela"
              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, cursor: "pointer", color: "rgba(248,249,251,0.45)", transition: "all 120ms ease" }}
              onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.14)"; b.style.color = "rgba(248,249,251,0.80)"; }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.07)"; b.style.color = "rgba(248,249,251,0.45)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button
              onClick={() => onDelete(map.id)}
              title="Radera"
              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, cursor: "pointer", color: "rgba(248,249,251,0.35)", transition: "all 120ms ease" }}
              onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(201,79,79,0.15)"; b.style.color = "#C94F4F"; b.style.borderColor = "rgba(201,79,79,0.30)"; }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.07)"; b.style.color = "rgba(248,249,251,0.35)"; b.style.borderColor = "rgba(255,255,255,0.12)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Family pill — always visible */}
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: `1px solid ${meta.color}28`, borderRadius: 6, padding: "3px 8px 3px 6px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: meta.color, letterSpacing: "0.04em" }}>{meta.label}</span>
        </div>

        {/* Public badge */}
        {map.is_public && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.30)", borderRadius: 6, padding: "3px 7px", fontFamily: "'Geist', sans-serif", fontSize: 10, color: "#34d399" }}>
            Delad
          </div>
        )}
      </div>

      {/* Card footer */}
      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitle(map.title); setEditing(false); } }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 6, padding: "3px 7px", fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "#F8F9FB", outline: "none" }}
            autoFocus
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.85)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {map.title}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "rgba(248,249,251,0.22)" }}>{dateStr}</span>
              <button
                onClick={startEdit}
                title="Byt namn"
                style={{ padding: 3, background: "none", border: "none", cursor: "pointer", color: "rgba(248,249,251,0.20)", borderRadius: 4, transition: "color 120ms ease", display: "flex" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.55)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.20)"; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  const heights = [220, 180, 260];
  const h = heights[index % 3];
  return (
    <div style={{ breakInside: "avoid", marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#0e1118" }}>
      <div style={{ height: h, background: "rgba(255,255,255,0.03)", animation: "shimmer 1.8s ease-in-out infinite" }} />
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ height: 12, width: "60%", background: "rgba(255,255,255,0.05)", borderRadius: 4, animation: "shimmer 1.8s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Empty state SVG ──────────────────────────────────────────

function EmptyIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="45" height="50" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
      <rect x="65" y="10" width="45" height="60" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
      <path d="M25 38 L45 28 L55 35" stroke="rgba(107,140,255,0.25)" strokeWidth="1" fill="none"/>
      <path d="M25 38 L35 50 L50 45 L55 35" stroke="rgba(107,140,255,0.25)" strokeWidth="1" fill="none"/>
      <circle cx="80" cy="35" r="8" fill="rgba(56,200,240,0.08)" stroke="rgba(56,200,240,0.20)" strokeWidth="1"/>
      <circle cx="80" cy="35" r="3" fill="rgba(56,200,240,0.30)"/>
    </svg>
  );
}

// ─── Dashboard ────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function load() {
      if (!supabase) { router.replace("/login"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);
      const res = await fetch("/api/maps");
      if (res.ok) {
        const json = await res.json();
        setMaps(json.maps ?? []);
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRename = useCallback(async (id: string, title: string) => {
    setMaps((prev) => prev.map((m) => m.id === id ? { ...m, title } : m));
    await fetch(`/api/maps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Radera kartan permanent?")) return;
    setMaps((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/maps/${id}`, { method: "DELETE" });
    showToast("Karta raderad");
  }, []);

  const handleShare = useCallback(async (map: MapRow) => {
    if (!map.is_public) {
      const res = await fetch(`/api/maps/${map.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_public: true }) });
      if (res.ok) setMaps((prev) => prev.map((m) => m.id === map.id ? { ...m, is_public: true } : m));
    }
    const url = `${window.location.origin}/maps/${map.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    showToast("Länk kopierad!");
  }, []);

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080a12", color: "#F8F9FB" }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.7} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "rgba(8,10,18,0.96)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 18px", fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.75)", zIndex: 100, backdropFilter: "blur(16px)", boxShadow: "0 4px 32px rgba(0,0,0,0.5)", animation: "fadeUp 180ms ease" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 52, background: "rgba(8,10,18,0.90)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500, color: "rgba(248,249,251,0.90)", letterSpacing: "-0.01em" }}>atlas</span>
            <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.35)" }}>Mina kartor</span>
          </a>
          <a href="/explore" style={{ fontFamily: "'Geist', sans-serif", fontSize: 12, color: "rgba(248,249,251,0.28)", textDecoration: "none", transition: "color 150ms ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.65)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.28)"; }}>
            Utforska
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user && (
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "rgba(248,249,251,0.28)", letterSpacing: "0.01em" }}>
              {user.email}
            </span>
          )}
          <button
            onClick={handleSignOut}
            style={{ fontFamily: "'Geist', sans-serif", fontSize: 12, color: "rgba(248,249,251,0.35)", background: "none", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", padding: "5px 11px", borderRadius: 7, transition: "all 150ms ease" }}
            onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "rgba(248,249,251,0.70)"; b.style.borderColor = "rgba(255,255,255,0.16)"; b.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "rgba(248,249,251,0.35)"; b.style.borderColor = "rgba(255,255,255,0.08)"; b.style.background = "none"; }}
          >
            Logga ut
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 20px 80px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "rgba(248,249,251,0.25)", margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {loading ? "Laddar…" : `${maps.length} karta${maps.length !== 1 ? "r" : ""}`}
          </p>
          <a
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.80)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "7px 14px", textDecoration: "none", transition: "all 150ms ease" }}
            onMouseEnter={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = "rgba(255,255,255,0.10)"; a.style.color = "#F8F9FB"; a.style.borderColor = "rgba(255,255,255,0.18)"; }}
            onMouseLeave={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.background = "rgba(255,255,255,0.06)"; a.style.color = "rgba(248,249,251,0.80)"; a.style.borderColor = "rgba(255,255,255,0.10)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ny karta
          </a>
        </div>

        {/* Loading skeleton — masonry */}
        {loading && (
          <div style={{ columns: "3 260px", columnGap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} index={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && maps.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 0", gap: 20, animation: "fadeUp 300ms ease" }}>
            <EmptyIllustration />
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: "rgba(248,249,251,0.35)", margin: 0 }}>
              Inga sparade kartor än
            </p>
            <a
              href="/"
              style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.70)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "8px 16px", textDecoration: "none" }}
            >
              Skapa din första karta →
            </a>
          </div>
        )}

        {/* Masonry gallery */}
        {!loading && maps.length > 0 && (
          <div style={{ columns: "3 260px", columnGap: 12, animation: "fadeUp 250ms ease" }}>
            {maps.map((map, i) => (
              <MapCard
                key={map.id}
                map={map}
                index={i}
                onRename={handleRename}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
