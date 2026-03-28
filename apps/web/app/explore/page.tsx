"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { MapRow } from "../../lib/supabase/types";
import type { User } from "@supabase/supabase-js";

// ─── CSS var shorthand ────────────────────────────────────────

const v = (name: string) => `hsl(var(${name}))`;

// ─── Family metadata ──────────────────────────────────────────

const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth", color: "#4A9EBF",
    bg: "radial-gradient(ellipse at 30% 40%, rgba(74,158,191,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M24 48 L72 24 L120 42 L168 18 L222 36 L216 96 L168 114 L120 90 L72 108 L24 84Z" fill="rgba(74,158,191,0.10)" stroke="rgba(74,158,191,0.30)" strokeWidth="1"/>
        <path d="M24 84 L72 108 L120 90 L168 114 L216 96 L210 123 L162 130 L114 116 L66 126 L22 112Z" fill="rgba(74,158,191,0.20)" stroke="rgba(74,158,191,0.34)" strokeWidth="1"/>
        <path d="M72 24 L120 42 L120 90 L72 108 L24 84 L24 48Z" fill="rgba(74,158,191,0.07)" stroke="rgba(74,158,191,0.22)" strokeWidth="0.8"/>
        <path d="M120 42 L168 18 L216 36 L216 96 L168 114 L120 90Z" fill="rgba(74,158,191,0.28)" stroke="rgba(74,158,191,0.38)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  heatmap: {
    label: "Heatmap", color: "#E05252",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(220,82,82,0.22) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="96" cy="72" rx="66" ry="50" fill="rgba(220,82,82,0.06)"/>
        <ellipse cx="96" cy="72" rx="46" ry="34" fill="rgba(220,82,82,0.12)"/>
        <ellipse cx="96" cy="72" rx="26" ry="19" fill="rgba(220,82,82,0.22)"/>
        <ellipse cx="96" cy="72" rx="12" ry="9" fill="rgba(220,82,82,0.44)"/>
        <ellipse cx="174" cy="50" rx="36" ry="26" fill="rgba(234,120,12,0.08)"/>
        <ellipse cx="174" cy="50" rx="19" ry="14" fill="rgba(234,120,12,0.18)"/>
        <ellipse cx="174" cy="50" rx="7" ry="6" fill="rgba(234,120,12,0.36)"/>
      </svg>
    ),
  },
  point: {
    label: "Punkter", color: "#9B72CF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(155,114,207,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        {[[48,60],[84,38],[114,66],[144,44],[180,60],[198,32],[66,98],[108,112],[156,92],[192,105],[54,82],[132,76]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 4.5 : i % 3 === 1 ? 3.5 : 3} fill="rgba(155,114,207,0.75)" opacity={0.45 + (i % 4) * 0.14}/>
        ))}
      </svg>
    ),
  },
  cluster: {
    label: "Kluster", color: "#9B72CF",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(155,114,207,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="84" cy="66" r="26" fill="rgba(155,114,207,0.12)" stroke="rgba(155,114,207,0.30)" strokeWidth="1"/>
        <circle cx="84" cy="66" r="10" fill="rgba(155,114,207,0.65)"/>
        <text x="84" y="70" textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace">12</text>
        <circle cx="168" cy="54" r="19" fill="rgba(155,114,207,0.10)" stroke="rgba(155,114,207,0.26)" strokeWidth="1"/>
        <circle cx="168" cy="54" r="7" fill="rgba(155,114,207,0.58)"/>
        <text x="168" y="58" textAnchor="middle" fill="white" fontSize="7" fontFamily="monospace">7</text>
        <circle cx="132" cy="106" r="14" fill="rgba(155,114,207,0.08)" stroke="rgba(155,114,207,0.22)" strokeWidth="1"/>
        <circle cx="132" cy="106" r="5" fill="rgba(155,114,207,0.52)"/>
        <text x="132" y="109" textAnchor="middle" fill="white" fontSize="6" fontFamily="monospace">4</text>
      </svg>
    ),
  },
  flow: {
    label: "Flöde", color: "#3AADCC",
    bg: "radial-gradient(ellipse at 20% 50%, rgba(58,173,204,0.18) 0%, transparent 55%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M36 68 C84 28, 156 108, 204 68" stroke="rgba(58,173,204,0.60)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M36 68 C78 50, 150 92, 204 68" stroke="rgba(58,173,204,0.28)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M36 68 C84 96, 156 44, 204 68" stroke="rgba(58,173,204,0.16)" strokeWidth="1" fill="none" strokeLinecap="round"/>
        <circle cx="36" cy="68" r="5.5" fill="rgba(58,173,204,0.80)"/>
        <circle cx="204" cy="68" r="5.5" fill="rgba(58,173,204,0.80)"/>
        <polygon points="194,62 204,68 194,74" fill="rgba(58,173,204,0.90)"/>
      </svg>
    ),
  },
  isochrone: {
    label: "Isokon", color: "#2EAE82",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(46,174,130,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="120" cy="68" rx="84" ry="55" fill="rgba(46,174,130,0.05)" stroke="rgba(46,174,130,0.20)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="58" ry="38" fill="rgba(46,174,130,0.09)" stroke="rgba(46,174,130,0.28)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="34" ry="22" fill="rgba(46,174,130,0.16)" stroke="rgba(46,174,130,0.40)" strokeWidth="1"/>
        <circle cx="120" cy="68" r="6" fill="rgba(46,174,130,0.88)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportionell", color: "#D4963A",
    bg: "radial-gradient(ellipse at 45% 50%, rgba(212,150,58,0.16) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="108" cy="68" r="36" fill="rgba(212,150,58,0.10)" stroke="rgba(212,150,58,0.30)" strokeWidth="1"/>
        <circle cx="174" cy="54" r="22" fill="rgba(212,150,58,0.14)" stroke="rgba(212,150,58,0.36)" strokeWidth="1"/>
        <circle cx="66" cy="94" r="14" fill="rgba(212,150,58,0.19)" stroke="rgba(212,150,58,0.42)" strokeWidth="1"/>
        <circle cx="192" cy="98" r="8" fill="rgba(212,150,58,0.26)" stroke="rgba(212,150,58,0.48)" strokeWidth="1"/>
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

// ─── Family pill ──────────────────────────────────────────────

function FamilyPill({ family }: { family: string }) {
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
      background: `${meta.color}22`,
      border: `1px solid ${meta.color}44`,
      borderRadius: 6, padding: "2px 7px 2px 6px",
      fontFamily: "'Geist Mono', monospace", fontSize: 10,
      color: meta.color, letterSpacing: "0.06em", fontWeight: 500,
      textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, display: "inline-block", flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

// ─── Card thumbnail ───────────────────────────────────────────

function CardThumbnail({ map, hovered }: { map: MapRow; hovered: boolean }) {
  const family = getFamily(map);
  const meta = FAMILY_META[family] ?? FALLBACK_META;

  return (
    <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", borderRadius: "10px 10px 0 0", background: v("--ui-thumb-bg") }}>
      {map.thumbnail_url ? (
        <img
          src={map.thumbnail_url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 380ms ease", transform: hovered ? "scale(1.04)" : "scale(1)" }}
        />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 350ms ease", opacity: hovered ? 1 : 0.6 }} />
          <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
        </>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", background: v("--ui-surface"), border: `1px solid ${v("--ui-border")}` }}>
      <div style={{ aspectRatio: "16/9", background: v("--ui-skeleton-base"), animation: "shimmer 1.6s ease-in-out infinite" }} />
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ height: 13, width: "58%", background: v("--ui-skeleton-base"), borderRadius: 4, marginBottom: 8, animation: "shimmer 1.6s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "35%", background: v("--ui-skeleton-base"), borderRadius: 4, animation: "shimmer 1.6s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Map card (public, read-only) ─────────────────────────────

function MapCard({ map, index }: { map: MapRow; index: number }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const family = getFamily(map);

  const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div
      onClick={() => router.push(`/maps/${map.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10, overflow: "hidden", background: v("--ui-surface"),
        border: `1px solid ${v("--ui-border")}`,
        boxShadow: hovered ? "0 8px 32px rgba(0,0,0,0.50)" : "0 1px 4px rgba(0,0,0,0.30)",
        transition: "box-shadow 220ms ease, transform 220ms ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        cursor: "pointer",
        animationDelay: `${index * 40}ms`,
        animation: "fadeUp 280ms ease both",
      }}
    >
      <div style={{ position: "relative" }}>
        <CardThumbnail map={map} hovered={hovered} />
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.52)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 200ms ease",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "10px 10px 0 0",
        }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, fontWeight: 500, color: "white", letterSpacing: "-0.01em" }}>
            Visa karta →
          </span>
        </div>
      </div>

      <div style={{ padding: "11px 14px 13px", borderTop: `1px solid ${v("--ui-border")}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
          <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 600, color: v("--ui-text"), margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, letterSpacing: "-0.02em" }}>
            {map.title}
          </h3>
          <FamilyPill family={family} />
        </div>
        <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: v("--ui-text-faint"), margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {dateStr}
        </p>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "100px 0 60px", gap: 16, animation: "fadeUp 300ms ease" }}>
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
        <rect x="4" y="10" width="24" height="28" rx="3" fill={v("--ui-surface")} stroke={v("--ui-border")} strokeWidth="1.2"/>
        <rect x="36" y="6" width="24" height="36" rx="3" fill={v("--ui-surface")} stroke={v("--ui-border")} strokeWidth="1.2"/>
        <path d="M10 20 L20 15 L28 20" stroke={v("--ui-accent")} strokeWidth="1.2" fill="none" strokeOpacity="0.6"/>
        <circle cx="46" cy="22" r="6" fill={v("--ui-accent-subtle")} stroke={v("--ui-accent")} strokeWidth="1.2" strokeOpacity="0.6"/>
        <circle cx="46" cy="22" r="2" fill={v("--ui-accent")}/>
      </svg>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 15, fontWeight: 500, color: v("--ui-text-muted"), margin: "0 0 6px" }}>
          Inga publika kartor än
        </p>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: v("--ui-text-faint"), margin: "0 0 24px" }}>
          Bygg en karta och dela den — så syns den här.
        </p>
        <a href="/" style={{
          fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500,
          color: v("--ui-interactive-active"),
          background: v("--ui-cta-primary-bg"),
          border: `1px solid ${v("--ui-cta-primary-border")}`,
          borderRadius: 8, padding: "9px 18px", textDecoration: "none",
          letterSpacing: "-0.01em",
        }}>
          Skapa en karta
        </a>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────

function AtlasHeader({ user }: { user: User | null }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20,
      height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px",
      background: "hsla(var(--ui-header-bg))",
      backdropFilter: "blur(14px)",
      borderBottom: `1px solid ${v("--ui-border")}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 600, color: v("--ui-text"), letterSpacing: "-0.03em" }}>atlas</span>
        </a>
        <span style={{ width: 1, height: 14, background: v("--ui-border") }} />
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: v("--ui-text-faint"), letterSpacing: "0.06em", textTransform: "uppercase" }}>Utforska</span>
      </div>

      <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {user ? (
          /* restrained pill — dark surface, white text, no teal */
          <a
            href="/app/gallery"
            style={{
              fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500,
              color: v("--ui-cta-text"),
              background: v("--ui-cta-primary-bg"),
              border: `1px solid ${v("--ui-cta-primary-border")}`,
              borderRadius: 8, padding: "6px 14px", textDecoration: "none",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Mina kartor
          </a>
        ) : (
          <>
            <a href="/login" style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: v("--ui-text-muted"), textDecoration: "none", padding: "6px 10px", letterSpacing: "-0.01em" }}>
              Logga in
            </a>
            {/* Primary CTA: near-white text on elevated dark surface */}
            <a href="/signup" style={{
              fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500,
              color: v("--ui-interactive-active"),
              background: v("--ui-cta-primary-bg"),
              border: `1px solid ${v("--ui-cta-primary-border")}`,
              borderRadius: 8, padding: "6px 14px", textDecoration: "none",
            }}>
              Skapa konto
            </a>
          </>
        )}
      </nav>
    </header>
  );
}

// ─── Sort tabs ────────────────────────────────────────────────

type SortMode = "newest" | "trending" | "top";
const SORT_TABS: { id: SortMode; label: string; soon?: boolean }[] = [
  { id: "newest", label: "Senaste" },
  { id: "trending", label: "Trendande", soon: true },
  { id: "top", label: "Topprankade", soon: true },
];

// ─── Explore page ─────────────────────────────────────────────

export default function ExplorePage() {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [user, setUser] = useState<User | null>(null);

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
    <div data-mode="discover" style={{ minHeight: "100vh", background: v("--ui-bg"), color: v("--ui-text") }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:.4} 50%{opacity:.7} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <AtlasHeader user={user} />

      <main style={{
        maxWidth: 1160, margin: "0 auto", padding: "48px 28px 80px",
        backgroundImage: "radial-gradient(circle, var(--ui-texture-dot) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}>
        <div style={{ marginBottom: 32, animation: "fadeUp 200ms ease" }}>
          <h1 style={{ fontFamily: "'Geist', sans-serif", fontSize: 26, fontWeight: 600, color: v("--ui-text"), margin: "0 0 6px", letterSpacing: "-0.04em" }}>
            Utforska kartor
          </h1>
          <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: v("--ui-text-muted"), margin: 0 }}>
            Kartor skapade av Atlas-användare. Klicka för att utforska.
          </p>
        </div>

        {/* Sort / filter row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, borderBottom: `1px solid ${v("--ui-border")}` }}>
          <div style={{ display: "flex" }}>
            {SORT_TABS.map((tab) => {
              const isActive = sort === tab.id && !tab.soon;
              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.soon && setSort(tab.id)}
                  disabled={tab.soon}
                  style={{
                    fontFamily: "'Geist', sans-serif", fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    /* white/near-white when active, muted gray otherwise — no teal on text */
                    color: tab.soon
                      ? v("--ui-text-faint")
                      : isActive
                        ? v("--ui-interactive-active")
                        : v("--ui-interactive-rest"),
                    background: "none", border: "none",
                    cursor: tab.soon ? "default" : "pointer",
                    padding: "8px 14px 10px",
                    /* teal only on the active underline — thin, restrained */
                    borderBottom: isActive
                      ? `1px solid ${v("--ui-accent-line")}`
                      : "1px solid transparent",
                    marginBottom: -1,
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "color 150ms ease",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {tab.label}
                  {tab.soon && (
                    <span style={{
                      fontFamily: "'Geist Mono', monospace", fontSize: 9,
                      color: v("--ui-text-faint"),
                      background: v("--ui-skeleton-base"),
                      border: `1px solid ${v("--ui-border")}`,
                      borderRadius: 4, padding: "1px 5px",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                      Snart
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!loading && (
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: v("--ui-text-faint"), letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {maps.length} kartor
            </span>
          )}
        </div>

        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {Array.from({ length: 9 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && maps.length === 0 && <EmptyState />}

        {!loading && maps.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {maps.map((map, i) => (
              <MapCard key={map.id} map={map} index={i} />
            ))}
          </div>
        )}

        {!loading && !user && maps.length > 0 && (
          <div style={{
            marginTop: 60, padding: "32px",
            background: v("--ui-surface"),
            border: `1px solid ${v("--ui-border")}`,
            /* subtle teal left accent line — the only teal touch */
            borderLeft: `2px solid ${v("--ui-accent-line")}`,
            borderRadius: 12, textAlign: "center", animation: "fadeUp 300ms ease",
          }}>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 15, fontWeight: 500, color: v("--ui-text"), margin: "0 0 5px", letterSpacing: "-0.02em" }}>
              Bygg och spara dina egna kartor
            </p>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: v("--ui-text-muted"), margin: "0 0 20px", lineHeight: 1.6 }}>
              Skapa ett gratis konto — spara, dela och visa dina kartor.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {/* secondary: ghost */}
              <a href="/" style={{
                fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 400,
                color: v("--ui-text-muted"),
                background: "transparent",
                border: `1px solid ${v("--ui-border")}`,
                borderRadius: 8, padding: "9px 18px", textDecoration: "none",
                letterSpacing: "-0.01em",
              }}>
                Prova utan konto
              </a>
              {/* primary: elevated dark, near-white text — no teal fill */}
              <a href="/signup" style={{
                fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500,
                color: v("--ui-interactive-active"),
                background: v("--ui-cta-primary-bg"),
                border: `1px solid ${v("--ui-cta-primary-border")}`,
                borderRadius: 8, padding: "9px 18px", textDecoration: "none",
                letterSpacing: "-0.01em",
              }}>
                Skapa konto gratis
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
