"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import type { MapRow } from "@/lib/supabase/types";
import { FAMILY_META, FALLBACK_META, MAP_TYPE_ORDER } from "@/components/family-meta";
import { MapTypeBlock } from "@/components/MapTypeBlock";
import { EDITORIAL } from "@/lib/editorial-tokens";
import { TEMPLATES, type MapTemplate } from "@/lib/templates";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Paperclip, ArrowUpIcon, Globe, BarChart3, MapPin, Layers } from "lucide-react";

// Group templates by family — used to populate example thumbnails per block
const TEMPLATES_BY_FAMILY: Record<string, MapTemplate[]> = TEMPLATES.reduce(
  (acc, t) => {
    (acc[t.family] ||= []).push(t);
    return acc;
  },
  {} as Record<string, MapTemplate[]>,
);

// ── Palette ──────────────────────────────────────────────────────────────────
// Hero:   Dark atmospheric (#1a2332 → #2a3444) with graticule pattern
// Cards:  Light warm (#f8f7f5)
// Prompt: White card floating on dark hero
// Accents: Sage #4a9e68, Gold #c4915a

const SUGGESTIONS = [
  "Population density in Europe",
  "Coffee shops in Stockholm",
  "Earthquake activity last 7 days",
  "GDP per capita across Africa",
];

const CYCLING_PROMPTS = [
  "Income levels across Swedish municipalities",
  "Seismic activity along the Pacific Rim",
  "Population density in European countries",
  "Crime statistics by Swedish municipality",
  "Forest coverage across South America",
];

// Subtitle typewriter — cycles through what Atlas does
const SUBTITLE_PHRASES = [
  "choropleth maps",
  "heatmaps",
  "flow visualizations",
  "3D extrusions",
  "point maps",
  "cluster maps",
];

export default function AppHomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const pendingHandled = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback((reset?: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (reset) { ta.style.height = "52px"; return; }
    ta.style.height = "52px";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  // Typewriter cycling placeholder
  const [placeholder, setPlaceholder] = useState("Describe what you want to map...");
  const [promptIndex, setPromptIndex] = useState(0);
  const [cycling, setCycling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setCycling(true), 2400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!cycling || value) return;
    const text = CYCLING_PROMPTS[promptIndex];
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setPlaceholder(text);
      const t = setTimeout(() => setPromptIndex((p) => (p + 1) % CYCLING_PROMPTS.length), 3200);
      return () => clearTimeout(t);
    }

    let i = 0;
    setPlaceholder("");

    intervalRef.current = setInterval(() => {
      if (i < text.length) {
        i++;
        setPlaceholder(text.slice(0, i));
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        cycleTimeoutRef.current = setTimeout(() => setPromptIndex((p) => (p + 1) % CYCLING_PROMPTS.length), 2800);
      }
    }, 36);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (cycleTimeoutRef.current) clearTimeout(cycleTimeoutRef.current);
    };
  }, [promptIndex, cycling, value]);

  // Subtitle typewriter — "Atlas builds publication-ready [cycling]"
  const [subtitleWord, setSubtitleWord] = useState("choropleth maps");
  const [subtitleIdx, setSubtitleIdx] = useState(0);
  const [subtitleTyping, setSubtitleTyping] = useState(false);
  const subtitleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subtitleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSubtitleTyping(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!subtitleTyping) return;
    const word = SUBTITLE_PHRASES[subtitleIdx];
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setSubtitleWord(word);
      const t = setTimeout(() => setSubtitleIdx((p) => (p + 1) % SUBTITLE_PHRASES.length), 2800);
      return () => clearTimeout(t);
    }

    let i = 0;
    setSubtitleWord("");

    subtitleIntervalRef.current = setInterval(() => {
      if (i < word.length) {
        i++;
        setSubtitleWord(word.slice(0, i));
      } else {
        if (subtitleIntervalRef.current) clearInterval(subtitleIntervalRef.current);
        subtitleTimeoutRef.current = setTimeout(() => setSubtitleIdx((p) => (p + 1) % SUBTITLE_PHRASES.length), 2200);
      }
    }, 50);

    return () => {
      if (subtitleIntervalRef.current) clearInterval(subtitleIntervalRef.current);
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    };
  }, [subtitleIdx, subtitleTyping]);

  // Recent maps for logged-in users
  const { data: recentMaps } = useQuery<MapRow[]>({
    queryKey: ["recent-maps"],
    queryFn: async () => {
      const res = await fetch("/api/maps?limit=4");
      if (!res.ok) return [];
      const data = await res.json();
      return data.maps ?? data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Click-to-adopt
  const handleInputClick = useCallback(() => {
    if (value === "" && cycling && placeholder && placeholder !== "Describe what you want to map...") {
      setValue(placeholder);
      setCycling(false);
      setTimeout(() => textareaRef.current?.select(), 0);
    }
  }, [value, cycling, placeholder]);

  // Recover pending map after OAuth redirect
  useEffect(() => {
    if (authLoading || !user || pendingHandled.current) return;
    pendingHandled.current = true;

    try {
      const pendingSave = sessionStorage.getItem("atlas_pending_save");
      const pendingMapRaw = sessionStorage.getItem("atlas_pending_map");
      if (!pendingSave || !pendingMapRaw) return;

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
  }, [authLoading, user, router, queryClient]);

  function handleSubmit() {
    const q = value.trim();
    if (!q) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(q)}`);
  }


  function handleOnboardingPrompt(prompt: string) {
    router.push(`/app/map/new?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scrollBounce { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(6px);opacity:0.8} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .hub-card {
          transition: transform 220ms ease, box-shadow 220ms ease;
        }
        .hub-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05) !important;
        }

        .hub-chip {
          transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
        }
        .hub-chip:hover {
          background-color: rgba(12,18,26,0.60) !important;
          border-color: rgba(255,255,255,0.22) !important;
          color: #ffffff !important;
        }

        .hub-see-all {
          transition: color 160ms ease;
        }
        .hub-see-all:hover {
          color: #1a1a1a !important;
        }

        .tpl-modal-close:hover {
          background: rgba(255,255,255,0.14) !important;
          color: rgba(255,255,255,0.75) !important;
        }
        .tpl-modal-cta-primary:hover {
          background: #d4a574 !important;
        }
        .tpl-modal-cta-secondary:hover {
          background: rgba(255,255,255,0.04) !important;
          color: #e4e0d8 !important;
          border-color: rgba(255,255,255,0.14) !important;
        }
      `}</style>

      <OnboardingOverlay onSelectPrompt={handleOnboardingPrompt} />

      {/* ── Hero: full viewport illustrated background ──────── */}
      {/* md:-ml-64 extends hero behind the fixed sidebar, md:pl-64 pushes content back */}
      <div
        className="md:-ml-64"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#111820",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Background image — fills entire hero */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-bg.png"
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 40%",
            pointerEvents: "none",
          }}
        />

        {/* Darken overlay — uniform base */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,16,24,0.28)",
          pointerEvents: "none",
        }} />

        {/* Radial focus — draws eye to center where prompt lives */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 70% 60% at 55% 45%, rgba(10,16,24,0.50) 0%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* md:pl-64 compensates for -ml-64 so content centers in visible area */}
        <div
          className="px-6 md:pl-64"
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ width: "100%", maxWidth: 640 }}>
            {/* Headline — large bold, Rocket-style */}
            <h1 style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              textAlign: "center",
              margin: "0 0 12px",
              lineHeight: 1.15,
              textShadow: "0 2px 24px rgba(0,0,0,0.5)",
              animation: "fadeUp 400ms ease both",
            }}>
              Describe It. Map It.
            </h1>
            {/* Subtitle with typewriter — cycling through map types */}
            <p style={{
              fontFamily: "'Geist', sans-serif",
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              color: "rgba(255,255,255,0.50)",
              textAlign: "center",
              margin: "0 0 32px",
              letterSpacing: "-0.01em",
              textShadow: "0 1px 12px rgba(0,0,0,0.4)",
              animation: "fadeUp 400ms 40ms ease both",
            }}>
              Atlas builds publication-ready{" "}
              <span style={{ color: "rgba(255,255,255,0.80)", borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
                {subtitleWord}
              </span>
              <span style={{ borderRight: "2px solid rgba(255,255,255,0.5)", marginLeft: 1, animation: "blink 0.8s step-end infinite" }} />
            </p>

            {/* White prompt card floating on dark */}
            <div
              style={{ animation: "fadeUp 400ms 60ms ease both" }}
              className="relative rounded-2xl"
            >
              <div style={{
                background: "rgba(255,255,255,0.97)",
                border: focused ? "1px solid rgba(196,145,90,0.45)" : "1px solid rgba(255,255,255,0.15)",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: focused
                  ? "0 0 0 3px rgba(196,145,90,0.10), 0 12px 40px rgba(0,0,0,0.30)"
                  : "0 12px 40px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.10)",
                transition: "border-color 250ms ease, box-shadow 250ms ease",
              }}>
                <div className="overflow-y-auto">
                  <Textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      if (e.target.value) setCycling(false);
                      adjustHeight();
                    }}
                    onClick={handleInputClick}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={placeholder}
                    className={cn(
                      "w-full px-5 py-4",
                      "resize-none",
                      "bg-transparent",
                      "border-none",
                      "text-[16px]",
                      "focus:outline-none",
                      "focus-visible:ring-0 focus-visible:ring-offset-0",
                      "placeholder:text-[#b8b3ac]",
                      "min-h-[52px]",
                    )}
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontStyle: "italic",
                      color: "#1a1a1a",
                      overflow: "hidden",
                    }}
                    autoFocus
                  />
                </div>

                {/* Bottom toolbar */}
                <div className="flex items-center justify-between px-3 pb-3 pt-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/[0.04]"
                      title="Upload data (coming soon)"
                    >
                      <Paperclip className="h-4 w-4" style={{ color: "#b8b3ac" }} />
                      <span
                        className="hidden text-xs group-hover:inline transition-opacity"
                        style={{ fontFamily: "'Geist Mono', monospace", color: "#9c9790" }}
                      >
                        Upload
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                      value.trim() ? "cursor-pointer" : "cursor-default",
                    )}
                    style={{
                      backgroundColor: value.trim() ? "#c4915a" : "rgba(196,145,90,0.15)",
                      transition: "background-color 160ms ease",
                    }}
                  >
                    <ArrowUpIcon
                      className="h-4 w-4"
                      style={{ color: value.trim() ? "#ffffff" : "rgba(196,145,90,0.45)" }}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Suggestion chips — ghost style on dark bg */}
            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-2"
              style={{ animation: "fadeUp 400ms 140ms ease both" }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setValue(s);
                    router.push(`/app/map/new?prompt=${encodeURIComponent(s)}`);
                  }}
                  className="hub-chip flex items-center gap-2 rounded-full px-4 py-2 text-xs backdrop-blur-md"
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    color: "rgba(255,255,255,0.85)",
                    backgroundColor: "rgba(12,18,26,0.45)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {s.includes("density") && <Globe className="h-3.5 w-3.5" />}
                  {s.includes("Coffee") && <MapPin className="h-3.5 w-3.5" />}
                  {s.includes("Earthquake") && <Layers className="h-3.5 w-3.5" />}
                  {s.includes("GDP") && <BarChart3 className="h-3.5 w-3.5" />}
                  {s}
                </button>
              ))}
            </div>
            {/* Scroll hint */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 48,
              animation: "fadeUp 400ms 300ms ease both",
            }}>
              <span style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 8,
              }}>
                Explore templates
              </span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: "scrollBounce 2s ease-in-out infinite" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── White zone: cards ─────────────────────────────── */}
      <div style={{ backgroundColor: "#f5f4f0", position: "relative" }}>
        {/* Shadow cast from hero — soft gradient transition */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: "linear-gradient(to bottom, rgba(10,15,22,0.08) 0%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Recent maps (logged-in) */}
        {user && recentMaps && recentMaps.length > 0 && (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16, animation: "fadeUp 400ms 180ms ease both",
            }}>
              <span style={{
                fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 500,
                color: "#9c9790", letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Dina senaste kartor
              </span>
              <button
                onClick={() => router.push("/app/gallery")}
                className="hub-see-all"
                style={{
                  fontFamily: "'Geist Mono', monospace", fontSize: 10,
                  color: "#9c9790", background: "none", border: "none",
                  cursor: "pointer", letterSpacing: "0.04em",
                }}
              >
                Visa alla &rarr;
              </button>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14,
            }}>
              {recentMaps.slice(0, 4).map((map, i) => {
                const family = (() => {
                  try {
                    const layers = (map.manifest as Record<string, unknown>)?.layers as Record<string, unknown>[] | undefined;
                    return (layers?.[0]?.style as Record<string, string> | undefined)?.mapFamily ?? "choropleth";
                  } catch { return "choropleth"; }
                })();
                const meta = FAMILY_META[family] ?? FALLBACK_META;
                const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });

                return (
                  <div
                    key={map.id}
                    onClick={() => router.push(`/app/map/${map.id}`)}
                    className="hub-card"
                    style={{
                      borderRadius: 12, overflow: "hidden", background: "#ffffff",
                      border: "1px solid rgba(120,100,70,0.08)",
                      boxShadow: "0 1px 3px rgba(140,110,70,0.06), 0 1px 4px rgba(140,110,70,0.04)",
                      cursor: "pointer", animation: `fadeUp 280ms ${i * 40}ms ease both`,
                    }}
                  >
                    <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#f6f4f0" }}>
                      {map.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={map.thumbnail_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <>
                          <div style={{ position: "absolute", inset: 0, background: meta.bg, opacity: 0.85 }} />
                          <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
                        </>
                      )}
                    </div>
                    <div style={{ padding: "10px 14px 12px" }}>
                      <h3 style={{
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: 14, fontWeight: 400, color: "#1a1a1a",
                        margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {map.title || "Namnlös karta"}
                      </h3>
                      <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "#9c9790" }}>
                        {dateStr}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile responsive overrides for MapTypeBlock */}
        <style>{`
          @media (max-width: 768px) {
            .mtb-visual { order: 1 !important; justify-self: start !important; }
            .mtb-text { order: 2 !important; justify-self: start !important; }
          }
        `}</style>

        {/* Editorial map-type section header */}
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          padding: "clamp(80px, 12vw, 128px) clamp(24px, 4vw, 48px) clamp(32px, 5vw, 48px)",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Geist Mono', monospace", fontSize: 11,
            letterSpacing: "0.22em", color: EDITORIAL.gold, fontWeight: 500,
            textTransform: "uppercase" as const,
            marginBottom: 20,
          }}>
            Atlas · Karttyper
          </div>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontSize: "clamp(40px, 4.5vw, 58px)",
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: EDITORIAL.ink,
            margin: 0,
            textWrap: "balance" as const,
            fontKerning: "normal",
            fontFeatureSettings: "'kern' 1, 'liga' 1",
          }}>
            Sju sätt att läsa världen
          </h2>
        </div>

        {/* Editorial blocks — one per map type, alternating alignment */}
        {MAP_TYPE_ORDER.map((t, i) => (
          <MapTypeBlock
            key={t.family}
            family={t.family}
            chapterNumber={i + 1}
            totalChapters={MAP_TYPE_ORDER.length}
            align={i % 2 === 0 ? "left" : "right"}
            examples={TEMPLATES_BY_FAMILY[t.family] ?? []}
            onExampleClick={(template) => {
              if (user) {
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
              } else {
                router.push(`/app/map/new?template=${template.id}`);
              }
            }}
          />
        ))}

        {/* Section footer — narrative closure + back to prompt */}
        <div style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "clamp(64px, 9vw, 96px) clamp(24px, 4vw, 48px) clamp(96px, 12vw, 160px)",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.22em",
            color: EDITORIAL.gold,
            textTransform: "uppercase" as const,
            fontWeight: 500,
            marginBottom: 18,
          }}>
            07 / 07 &middot; Slut
          </div>
          <p style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontSize: "clamp(22px, 2.6vw, 30px)",
            fontWeight: 400,
            lineHeight: 1.35,
            letterSpacing: "-0.012em",
            color: EDITORIAL.ink,
            margin: "0 0 28px",
            textWrap: "balance" as const,
          }}>
            Sju typer. En prompt. Atlas väljer rätt format åt dig.
          </p>
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setTimeout(() => textareaRef.current?.focus(), 600);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 22px 12px 24px",
              borderRadius: 999,
              border: "1px solid rgba(196,145,90,0.35)",
              background: "transparent",
              color: EDITORIAL.gold,
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase" as const,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 220ms ease, border-color 220ms ease, transform 220ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(196,145,90,0.08)";
              e.currentTarget.style.borderColor = "rgba(196,145,90,0.55)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(196,145,90,0.35)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            Börja skriva
          </button>
        </div>
      </div>
    </div>
  );
}
