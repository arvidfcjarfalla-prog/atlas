"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { MapRow } from "../../lib/supabase/types";
import type { User } from "@supabase/supabase-js";

// ─── Shared family metadata (mirrors dashboard) ───────────────

const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth", color: "#6B8CFF",
    bg: "radial-gradient(ellipse at 30% 40%, rgba(107,140,255,0.18) 0%, transparent 65%), radial-gradient(ellipse at 75% 70%, rgba(107,140,255,0.08) 0%, transparent 55%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M20 40 L60 20 L100 35 L140 15 L185 30 L180 80 L140 95 L100 75 L60 90 L20 70Z" fill="rgba(107,140,255,0.12)" stroke="rgba(107,140,255,0.30)" strokeWidth="1"/>
        <path d="M20 70 L60 90 L100 75 L140 95 L180 80 L175 115 L135 125 L95 110 L55 120 L18 105Z" fill="rgba(107,140,255,0.22)" stroke="rgba(107,140,255,0.35)" strokeWidth="1"/>
        <path d="M60 20 L100 35 L100 75 L60 90 L20 70 L20 40Z" fill="rgba(107,140,255,0.08)" stroke="rgba(107,140,255,0.20)" strokeWidth="0.8"/>
        <path d="M100 35 L140 15 L180 30 L180 80 L140 95 L100 75Z" fill="rgba(107,140,255,0.30)" stroke="rgba(107,140,255,0.40)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  heatmap: {
    label: "Heatmap", color: "#FF6B35",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(255,107,53,0.22) 0%, transparent 60%), radial-gradient(ellipse at 70% 30%, rgba(255,160,60,0.14) 0%, transparent 50%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
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
    label: "Punkter", color: "#B06AFF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(176,106,255,0.14) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
        {[[40,55],[70,35],[95,60],[120,40],[150,55],[165,30],[55,90],[90,105],[130,85],[160,95],[45,75],[110,70]].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i%3===0?4:i%3===1?3:2.5} fill="rgba(176,106,255,0.70)" opacity={0.5+(i%4)*0.12}/>
        ))}
      </svg>
    ),
  },
  cluster: {
    label: "Kluster", color: "#B06AFF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(176,106,255,0.14) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
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
    label: "Flöde", color: "#38C8F0",
    bg: "radial-gradient(ellipse at 20% 50%, rgba(56,200,240,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 50%, rgba(56,200,240,0.08) 0%, transparent 50%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
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
    label: "Isokon", color: "#34D399",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(52,211,153,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="100" cy="70" rx="70" ry="50" fill="rgba(52,211,153,0.06)" stroke="rgba(52,211,153,0.20)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="100" cy="70" rx="48" ry="34" fill="rgba(52,211,153,0.10)" stroke="rgba(52,211,153,0.30)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="100" cy="70" rx="28" ry="20" fill="rgba(52,211,153,0.18)" stroke="rgba(52,211,153,0.45)" strokeWidth="1"/>
        <circle cx="100" cy="70" r="5" fill="rgba(52,211,153,0.90)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportionell", color: "#FBBF24",
    bg: "radial-gradient(ellipse at 45% 50%, rgba(251,191,36,0.14) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 200 140" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="90" cy="65" r="30" fill="rgba(251,191,36,0.14)" stroke="rgba(251,191,36,0.35)" strokeWidth="1"/>
        <circle cx="145" cy="55" r="18" fill="rgba(251,191,36,0.18)" stroke="rgba(251,191,36,0.40)" strokeWidth="1"/>
        <circle cx="55" cy="90" r="12" fill="rgba(251,191,36,0.22)" stroke="rgba(251,191,36,0.45)" strokeWidth="1"/>
        <circle cx="160" cy="95" r="7" fill="rgba(251,191,36,0.30)" stroke="rgba(251,191,36,0.50)" strokeWidth="1"/>
      </svg>
    ),
  },
};

const FALLBACK_META = FAMILY_META.choropleth;

function getFamily(map: MapRow): string {
  try {
    const layers = (map.manifest as Record<string, unknown>)?.layers as Record<string, unknown>[] | undefined;
    return (layers?.[0]?.style as Record<string, string> | undefined)?.mapFamily ?? "choropleth";
  } catch { return "choropleth"; }
}

// ─── Sort tabs (future: wire up to API) ──────────────────────

type SortMode = "newest" | "trending" | "top";

const SORT_TABS: { id: SortMode; label: string; soon?: boolean }[] = [
  { id: "newest", label: "Senaste" },
  { id: "trending", label: "Trendande", soon: true },
  { id: "top", label: "Topprankade", soon: true },
];

// ─── Explore card ─────────────────────────────────────────────

function ExploreCard({ map, index }: { map: MapRow; index: number }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  const family = getFamily(map);
  const meta = FAMILY_META[family] ?? FALLBACK_META;

  const heightPattern = [240, 190, 270, 210, 255, 185];
  const thumbHeight = heightPattern[index % heightPattern.length];

  const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
  });

  function handleUseSimilar(e: React.MouseEvent) {
    e.stopPropagation();
    // Pre-fill the landing page prompt and navigate
    const encoded = encodeURIComponent(map.prompt);
    router.push(`/?prompt=${encoded}`);
  }

  return (
    <div
      style={{ breakInside: "avoid", marginBottom: 12, cursor: "pointer", position: "relative", borderRadius: 12, overflow: "hidden", background: "#0e1118", border: "1px solid rgba(255,255,255,0.07)", transition: "border-color 200ms ease" }}
      onClick={() => router.push(`/maps/${map.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", height: thumbHeight, background: "#0b0d15", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 400ms ease", opacity: hovered ? 1 : 0.7 }} />
        <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        {/* Hover overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(8,10,18,0.97) 0%, rgba(8,10,18,0.55) 55%, transparent 100%)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 220ms ease",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          padding: "16px 14px",
        }}>
          {/* Prompt snippet */}
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "rgba(248,249,251,0.50)", margin: "0 0 12px", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            "{map.prompt}"
          </p>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => router.push(`/maps/${map.id}`)}
              style={{ flex: 1, height: 30, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 7, fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500, color: "rgba(248,249,251,0.80)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "background 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
            >
              Visa karta
            </button>
            <button
              onClick={handleUseSimilar}
              style={{ flex: 1, height: 30, background: "rgba(107,140,255,0.15)", border: "1px solid rgba(107,140,255,0.30)", borderRadius: 7, fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500, color: "#8AABFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "background 150ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(107,140,255,0.25)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(107,140,255,0.15)"; }}
            >
              Bygg liknande →
            </button>
          </div>
        </div>

        {/* Family pill */}
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: `1px solid ${meta.color}28`, borderRadius: 6, padding: "3px 8px 3px 6px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: meta.color, letterSpacing: "0.04em" }}>{meta.label}</span>
        </div>

        {/* Future: rating badge placeholder — uncomment when live
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          ★ 4.8
        </div>
        */}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.85)", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {map.title}
        </h3>
        <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "rgba(248,249,251,0.22)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dateStr}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  const heights = [240, 190, 270];
  return (
    <div style={{ breakInside: "avoid", marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#0e1118" }}>
      <div style={{ height: heights[index % 3], background: "rgba(255,255,255,0.03)", animation: "shimmer 1.8s ease-in-out infinite" }} />
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ height: 12, width: "55%", background: "rgba(255,255,255,0.05)", borderRadius: 4, animation: "shimmer 1.8s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "100px 0 60px", gap: 20, animation: "fadeUp 300ms ease" }}>
      <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
        <rect x="6" y="14" width="30" height="36" rx="3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        <rect x="44" y="8" width="30" height="44" rx="3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        <path d="M14 26 L26 20 L36 26" stroke="rgba(107,140,255,0.25)" strokeWidth="1" fill="none"/>
        <path d="M14 26 L20 34 L30 31 L36 26" stroke="rgba(107,140,255,0.25)" strokeWidth="1" fill="none" strokeDasharray="2 2"/>
        <circle cx="56" cy="28" r="7" fill="rgba(56,200,240,0.08)" stroke="rgba(56,200,240,0.22)" strokeWidth="1"/>
        <circle cx="56" cy="28" r="2.5" fill="rgba(56,200,240,0.40)"/>
      </svg>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 15, fontWeight: 500, color: "rgba(248,249,251,0.45)", margin: "0 0 8px" }}>
          Inga publika kartor än
        </p>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.25)", margin: "0 0 24px" }}>
          Bygg en karta och dela den — så syns den här.
        </p>
        <a href="/" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.70)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "8px 16px", textDecoration: "none" }}>
          Skapa en karta →
        </a>
      </div>
    </div>
  );
}

// ─── Explore page ─────────────────────────────────────────────

export default function ExplorePage() {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [user, setUser] = useState<User | null>(null);

  // Auth state — just for nav, no gate
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/maps/public")
      .then((r) => r.json())
      .then((json) => { setMaps(json.maps ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#080a12", color: "#F8F9FB" }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.7} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 52, background: "rgba(8,10,18,0.90)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500, color: "rgba(248,249,251,0.90)", letterSpacing: "-0.01em" }}>atlas</span>
          </a>
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)", display: "inline-block" }} />
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.35)" }}>Utforska</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user ? (
            <a href="/dashboard" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.70)", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "6px 13px", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, transition: "all 150ms ease" }}
              onMouseEnter={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = "#F8F9FB"; a.style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={(e) => { const a = e.currentTarget as HTMLAnchorElement; a.style.color = "rgba(248,249,251,0.70)"; a.style.background = "rgba(255,255,255,0.07)"; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Mina kartor
            </a>
          ) : (
            <>
              <a href="/login" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.45)", textDecoration: "none", transition: "color 150ms ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.80)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(248,249,251,0.45)"; }}>
                Logga in
              </a>
              <a href="/signup" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "#F8F9FB", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "6px 13px", textDecoration: "none", transition: "all 150ms ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.14)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.09)"; }}>
                Skapa konto
              </a>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 32, animation: "fadeUp 200ms ease" }}>
          <h1 style={{ fontFamily: "'Geist', sans-serif", fontSize: 26, fontWeight: 500, color: "#F8F9FB", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Utforska kartor
          </h1>
          <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: "rgba(248,249,251,0.35)", margin: 0 }}>
            Kartor skapade av Atlas-användare. Klicka för att utforska — eller bygg din egen version.
          </p>
        </div>

        {/* Sort tabs — future: trending + top_rated activate when backend supports it */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 0 }}>
          {SORT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.soon && setSort(tab.id)}
              disabled={tab.soon}
              style={{
                fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500,
                color: tab.soon ? "rgba(248,249,251,0.20)" : sort === tab.id ? "rgba(248,249,251,0.90)" : "rgba(248,249,251,0.40)",
                background: "none", border: "none", cursor: tab.soon ? "default" : "pointer",
                padding: "8px 14px 10px",
                borderBottom: sort === tab.id && !tab.soon ? "1px solid rgba(248,249,251,0.60)" : "1px solid transparent",
                marginBottom: -1, transition: "color 150ms ease",
                display: "flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={(e) => { if (!tab.soon && sort !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.65)"; }}
              onMouseLeave={(e) => { if (!tab.soon && sort !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.40)"; }}
            >
              {tab.label}
              {tab.soon && (
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, color: "rgba(248,249,251,0.20)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.04em" }}>
                  SNART
                </span>
              )}
            </button>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "rgba(248,249,251,0.20)", letterSpacing: "0.04em" }}>
              {!loading && `${maps.length} kartor`}
            </span>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ columns: "3 260px", columnGap: 12 }}>
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} index={i} />)}
          </div>
        )}

        {/* Empty */}
        {!loading && maps.length === 0 && <EmptyState />}

        {/* Masonry gallery */}
        {!loading && maps.length > 0 && (
          <div style={{ columns: "3 260px", columnGap: 12, animation: "fadeUp 250ms ease" }}>
            {maps.map((map, i) => (
              <ExploreCard key={map.id} map={map} index={i} />
            ))}
          </div>
        )}

        {/* Footer CTA — for non-logged-in visitors */}
        {!loading && !user && maps.length > 0 && (
          <div style={{ marginTop: 64, padding: "32px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, textAlign: "center", animation: "fadeUp 300ms ease" }}>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 15, fontWeight: 500, color: "rgba(248,249,251,0.70)", margin: "0 0 6px" }}>
              Bygg och spara dina egna kartor
            </p>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: "rgba(248,249,251,0.30)", margin: "0 0 20px" }}>
              Skapa ett gratis konto — du kan spara, dela och visa dina kartor.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <a href="/" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(248,249,251,0.70)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "9px 18px", textDecoration: "none" }}>
                Prova utan konto →
              </a>
              <a href="/signup" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "#F8F9FB", background: "rgba(107,140,255,0.20)", border: "1px solid rgba(107,140,255,0.35)", borderRadius: 8, padding: "9px 18px", textDecoration: "none", transition: "background 150ms ease" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(107,140,255,0.30)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(107,140,255,0.20)"; }}>
                Skapa konto gratis
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
