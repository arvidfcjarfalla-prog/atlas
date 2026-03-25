"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import type { MapRow } from "@/lib/supabase/types";

// ─── Family metadata ──────────────────────────────────────────

const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth", color: "#2563EB",
    bg: "radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.10) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M24 48 L72 24 L120 42 L168 18 L222 36 L216 96 L168 114 L120 90 L72 108 L24 84Z" fill="rgba(37,99,235,0.09)" stroke="rgba(37,99,235,0.22)" strokeWidth="1"/>
        <path d="M24 84 L72 108 L120 90 L168 114 L216 96 L210 123 L162 130 L114 116 L66 126 L22 112Z" fill="rgba(37,99,235,0.17)" stroke="rgba(37,99,235,0.26)" strokeWidth="1"/>
        <path d="M72 24 L120 42 L120 90 L72 108 L24 84 L24 48Z" fill="rgba(37,99,235,0.06)" stroke="rgba(37,99,235,0.16)" strokeWidth="0.8"/>
        <path d="M120 42 L168 18 L216 36 L216 96 L168 114 L120 90Z" fill="rgba(37,99,235,0.22)" stroke="rgba(37,99,235,0.30)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  heatmap: {
    label: "Heatmap", color: "#DC2626",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(220,38,38,0.12) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="96" cy="72" rx="66" ry="50" fill="rgba(220,38,38,0.05)"/>
        <ellipse cx="96" cy="72" rx="46" ry="34" fill="rgba(220,38,38,0.10)"/>
        <ellipse cx="96" cy="72" rx="26" ry="19" fill="rgba(220,38,38,0.19)"/>
        <ellipse cx="96" cy="72" rx="12" ry="9" fill="rgba(220,38,38,0.38)"/>
        <ellipse cx="174" cy="50" rx="36" ry="26" fill="rgba(234,88,12,0.06)"/>
        <ellipse cx="174" cy="50" rx="19" ry="14" fill="rgba(234,88,12,0.14)"/>
        <ellipse cx="174" cy="50" rx="7" ry="6" fill="rgba(234,88,12,0.30)"/>
      </svg>
    ),
  },
  point: {
    label: "Punkter", color: "#7C3AED",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.09) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        {[[48,60],[84,38],[114,66],[144,44],[180,60],[198,32],[66,98],[108,112],[156,92],[192,105],[54,82],[132,76]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 4.5 : i % 3 === 1 ? 3.5 : 3} fill="rgba(124,58,237,0.65)" opacity={0.45 + (i % 4) * 0.14}/>
        ))}
      </svg>
    ),
  },
  cluster: {
    label: "Kluster", color: "#7C3AED",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.09) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="84" cy="66" r="26" fill="rgba(124,58,237,0.10)" stroke="rgba(124,58,237,0.24)" strokeWidth="1"/>
        <circle cx="84" cy="66" r="10" fill="rgba(124,58,237,0.55)"/>
        <text x="84" y="70" textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace">12</text>
        <circle cx="168" cy="54" r="19" fill="rgba(124,58,237,0.08)" stroke="rgba(124,58,237,0.20)" strokeWidth="1"/>
        <circle cx="168" cy="54" r="7" fill="rgba(124,58,237,0.48)"/>
        <text x="168" y="58" textAnchor="middle" fill="white" fontSize="7" fontFamily="monospace">7</text>
        <circle cx="132" cy="106" r="14" fill="rgba(124,58,237,0.07)" stroke="rgba(124,58,237,0.18)" strokeWidth="1"/>
        <circle cx="132" cy="106" r="5" fill="rgba(124,58,237,0.42)"/>
        <text x="132" y="109" textAnchor="middle" fill="white" fontSize="6" fontFamily="monospace">4</text>
      </svg>
    ),
  },
  flow: {
    label: "Flöde", color: "#0891B2",
    bg: "radial-gradient(ellipse at 20% 50%, rgba(8,145,178,0.10) 0%, transparent 55%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M36 68 C84 28, 156 108, 204 68" stroke="rgba(8,145,178,0.50)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M36 68 C78 50, 150 92, 204 68" stroke="rgba(8,145,178,0.24)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <circle cx="36" cy="68" r="5.5" fill="rgba(8,145,178,0.72)"/>
        <circle cx="204" cy="68" r="5.5" fill="rgba(8,145,178,0.72)"/>
      </svg>
    ),
  },
  isochrone: {
    label: "Isokon", color: "#059669",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(5,150,105,0.10) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="120" cy="68" rx="84" ry="55" fill="rgba(5,150,105,0.04)" stroke="rgba(5,150,105,0.16)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="58" ry="38" fill="rgba(5,150,105,0.07)" stroke="rgba(5,150,105,0.22)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="34" ry="22" fill="rgba(5,150,105,0.13)" stroke="rgba(5,150,105,0.34)" strokeWidth="1"/>
        <circle cx="120" cy="68" r="6" fill="rgba(5,150,105,0.80)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportionell", color: "#D97706",
    bg: "radial-gradient(ellipse at 45% 50%, rgba(217,119,6,0.09) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="108" cy="68" r="36" fill="rgba(217,119,6,0.09)" stroke="rgba(217,119,6,0.26)" strokeWidth="1"/>
        <circle cx="174" cy="54" r="22" fill="rgba(217,119,6,0.12)" stroke="rgba(217,119,6,0.30)" strokeWidth="1"/>
        <circle cx="66" cy="94" r="14" fill="rgba(217,119,6,0.16)" stroke="rgba(217,119,6,0.34)" strokeWidth="1"/>
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

function FamilyPill({ family }: { family: string }) {
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
      background: `${meta.color}14`, border: `1px solid ${meta.color}30`,
      borderRadius: 6, padding: "2px 7px 2px 6px",
      fontFamily: "'Geist Mono', monospace", fontSize: 10,
      color: meta.color, letterSpacing: "0.06em", fontWeight: 500, textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, display: "inline-block", flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

function CardThumbnail({ map, hovered }: { map: MapRow; hovered: boolean }) {
  const family = getFamily(map);
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  return (
    <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", borderRadius: "10px 10px 0 0", background: "#111820" }}>
      {map.thumbnail_url ? (
        <img src={map.thumbnail_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 380ms ease", transform: hovered ? "scale(1.04)" : "scale(1)" }} />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 350ms ease", opacity: hovered ? 1 : 0.7 }} />
          <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
        </>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", background: "#111820", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ aspectRatio: "16/9", background: "#182028", animation: "shimmer 1.6s ease-in-out infinite" }} />
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ height: 13, width: "55%", background: "#182028", borderRadius: 4, marginBottom: 8, animation: "shimmer 1.6s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "30%", background: "#182028", borderRadius: 4, animation: "shimmer 1.6s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

function LibraryCard({ map, index }: { map: MapRow; index: number; onDelete: (id: string) => void }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const family = getFamily(map);
  const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div
      onClick={() => router.push(`/app/map/${map.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10, overflow: "visible", background: "#111820",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.20)" : "0 1px 3px rgba(0,0,0,0.10)",
        transition: "box-shadow 220ms ease, transform 220ms ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        cursor: "pointer", position: "relative",
        animationDelay: `${index * 40}ms`,
        animation: "fadeUp 280ms ease both",
      }}
    >
      <div style={{ borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
        <CardThumbnail map={map} hovered={hovered} />
      </div>
      {map.is_public && (
        <div style={{
          position: "absolute", top: 10, left: 10, zIndex: 2,
          background: "rgba(5,150,105,0.88)", backdropFilter: "blur(6px)",
          borderRadius: 6, padding: "3px 8px",
          fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 500, color: "white",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Delad
        </div>
      )}
      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 600, color: "#e4e0d8", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>
          {map.title}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "#5a5752", letterSpacing: "0.06em", textTransform: "uppercase" }}>{dateStr}</span>
          <FamilyPill family={family} />
        </div>
      </div>
    </div>
  );
}

// ─── Gallery page ─────────────────────────────────────────────

export default function GalleryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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
    if (authLoading) return;
    if (!user) { router.replace("/auth/login?redirect=/app/gallery"); return; }
    async function load() {
      const res = await fetch("/api/maps");
      if (res.ok) {
        const json = await res.json();
        setMaps(json.maps ?? []);
      }
      setLoading(false);
    }
    load();
  }, [authLoading, user, router]);

  const handleDelete = useCallback(async (id: string) => {
    setMaps((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/maps/${id}`, { method: "DELETE" });
    showToast("Karta raderad");
  }, []);

  if (authLoading || (!user && loading)) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: "#0d1217" }}>
        <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: "#5a5752" }}>Laddar…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" style={{ backgroundColor: "#0d1217", color: "#e4e0d8" }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:.5} 50%{opacity:.8} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "#e4e0d8", borderRadius: 10, padding: "10px 18px",
          fontFamily: "'Geist', sans-serif", fontSize: 13, color: "#0d1217",
          zIndex: 200, boxShadow: "0 4px 24px rgba(0,0,0,0.20)",
          animation: "fadeUp 180ms ease", whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}

      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "48px 28px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, animation: "fadeUp 200ms ease" }}>
          <div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 600, color: "#e4e0d8", margin: "0 0 4px", letterSpacing: "-0.04em" }}>
              Mina kartor
            </h1>
            <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "#5a5752", margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {loading ? "Laddar…" : `${maps.length} karta${maps.length !== 1 ? "r" : ""}`}
            </p>
          </div>
        </div>

        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && maps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p style={{ fontFamily: "Georgia, serif", fontSize: 16, color: "#e4e0d8", marginBottom: 6 }}>Inga kartor än</p>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: "#908c85", marginBottom: 24 }}>Gå till hem-sidan för att skapa din första karta</p>
            <button
              onClick={() => router.push("/app")}
              className="rounded-lg px-5 py-2.5 text-sm font-medium transition-all hover:brightness-110"
              style={{ backgroundColor: "#d4a574", color: "#0d1217" }}
            >
              Skapa karta
            </button>
          </div>
        )}

        {!loading && maps.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, alignItems: "start" }}>
            {maps.map((map, i) => (
              <LibraryCard key={map.id} map={map} index={i} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
