"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import { useToast } from "@/lib/hooks/use-toast";
import { Toast } from "@/components/Toast";
import type { MapRow } from "@/lib/supabase/types";
import { FAMILY_META, FALLBACK_META, FamilyPill } from "@/components/family-meta";
import { TemplateCard } from "@/components/TemplateCard";
import { TEMPLATES, type MapTemplate } from "@/lib/templates";

function getFamily(map: MapRow): string {
  try {
    const layers = (map.manifest as Record<string, unknown>)?.layers as Record<string, unknown>[] | undefined;
    return (layers?.[0]?.style as Record<string, string> | undefined)?.mapFamily ?? "choropleth";
  } catch { return "choropleth"; }
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
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, show: showToast } = useToast();

  const handleTemplateClick = useCallback((template: MapTemplate) => {
    fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: template.manifest.title,
        prompt: `Mall: ${template.title}`,
        manifest: template.manifest as unknown as Record<string, unknown>,
        geojson_url: template.manifest.layers[0]?.sourceUrl ?? null,
        is_public: false,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const mapId = data?.map?.id;
        if (mapId) {
          queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
          router.push(`/app/map/${mapId}`);
        }
      })
      .catch(() => {});
  }, [router, queryClient]);

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

      <Toast toast={toast} />

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
          <div className="flex flex-col items-center py-16">
            <p style={{ fontFamily: "Georgia, serif", fontSize: 16, color: "#e4e0d8", marginBottom: 6 }}>Inga kartor än</p>
            <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: "#908c85", marginBottom: 32 }}>Börja med en mall eller skapa en karta från grunden</p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 14, width: "100%", maxWidth: 900, marginBottom: 32,
            }}>
              {TEMPLATES.map((t, i) => (
                <TemplateCard key={t.id} template={t} index={i} onClick={handleTemplateClick} />
              ))}
            </div>
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
