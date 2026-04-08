"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, BarChart3, Globe as LucideGlobe, Layers, MapPin, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { AtlasRenderPipeline } from "@/components/marketing/AtlasRenderPipeline";
import { FAMILY_META } from "@/components/family-meta";
import { EDITORIAL } from "@/lib/editorial-tokens";

const PAPER = EDITORIAL.paper;
const INK = EDITORIAL.ink;
const INK_MUTED = EDITORIAL.inkMuted;
const GOLD = EDITORIAL.gold;
const HERO_DARK = "#111820";
const FOOTER_DARK = "#0d1217";

// Hero constants — mirror /app hub hero (apps/web/app/app/(hub)/page.tsx)
const HERO_SUGGESTIONS = [
  "Population density in Europe",
  "Coffee shops in Stockholm",
  "Earthquake activity last 7 days",
  "GDP per capita across Africa",
];
const HERO_CYCLING_PROMPTS = [
  "Income levels across Swedish municipalities",
  "Seismic activity along the Pacific Rim",
  "Population density in European countries",
  "Crime statistics by Swedish municipality",
  "Forest coverage across South America",
];
const HERO_SUBTITLE_PHRASES = [
  "choropleth maps",
  "heatmaps",
  "flow visualizations",
  "3D extrusions",
  "point maps",
  "cluster maps",
];

const DATA_SOURCES = [
  "Eurostat", "World Bank", "Statistics Sweden", "FRED", "US Census",
  "Statistics Norway", "Statistics Finland", "Statistics Iceland",
  "Statistics Denmark", "Statistics Estonia", "Statistics Latvia",
  "Statistics Slovenia", "Statistics Switzerland", "OpenStreetMap", "Data Commons",
];

export default function LandingClient() {
  const router = useRouter();

  // ── Hero state (mirrors /app hub hero) ──────────────────────────────
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Closing prompt bar ──────────────────────────────────────────────
  const [closingValue, setClosingValue] = useState("");
  const [closingFocused, setClosingFocused] = useState(false);
  const closingRef = useRef<HTMLTextAreaElement>(null);

  function handleClosingSubmit() {
    const q = closingValue.trim();
    if (!q) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(q)}`);
  }

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "52px";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  const adjustClosingHeight = useCallback(() => {
    const ta = closingRef.current;
    if (!ta) return;
    ta.style.height = "52px";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  // Cycling placeholder typewriter
  const [placeholder, setPlaceholder] = useState("Describe what you want to map...");
  const [promptIndex, setPromptIndex] = useState(0);
  const [cycling, setCycling] = useState(false);
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setCycling(true), 2400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!cycling || value) return;
    const text = HERO_CYCLING_PROMPTS[promptIndex];
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setPlaceholder(text);
      const t = setTimeout(() => setPromptIndex((p) => (p + 1) % HERO_CYCLING_PROMPTS.length), 3200);
      return () => clearTimeout(t);
    }

    let i = 0;
    setPlaceholder("");

    cycleIntervalRef.current = setInterval(() => {
      if (i < text.length) {
        i++;
        setPlaceholder(text.slice(0, i));
      } else {
        if (cycleIntervalRef.current) clearInterval(cycleIntervalRef.current);
        cycleTimeoutRef.current = setTimeout(() => setPromptIndex((p) => (p + 1) % HERO_CYCLING_PROMPTS.length), 2800);
      }
    }, 36);

    return () => {
      if (cycleIntervalRef.current) clearInterval(cycleIntervalRef.current);
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
    const word = HERO_SUBTITLE_PHRASES[subtitleIdx];
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setSubtitleWord(word);
      const t = setTimeout(() => setSubtitleIdx((p) => (p + 1) % HERO_SUBTITLE_PHRASES.length), 2800);
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
        subtitleTimeoutRef.current = setTimeout(() => setSubtitleIdx((p) => (p + 1) % HERO_SUBTITLE_PHRASES.length), 2200);
      }
    }, 50);

    return () => {
      if (subtitleIntervalRef.current) clearInterval(subtitleIntervalRef.current);
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    };
  }, [subtitleIdx, subtitleTyping]);

  const handleInputClick = useCallback(() => {
    if (value === "" && cycling && placeholder && placeholder !== "Describe what you want to map...") {
      setValue(placeholder);
      setCycling(false);
      setTimeout(() => textareaRef.current?.select(), 0);
    }
  }, [value, cycling, placeholder]);

  function handleHeroSubmit() {
    const q = value.trim();
    if (!q) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(q)}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: "'Geist', -apple-system, system-ui, sans-serif" }}>
      <MarketingNav />

      {/* ═══ HERO — mirrors /app hub hero, sits on HERO_DARK with hero-bg.png ═══ */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: HERO_DARK,
          minHeight: "calc(100vh - 56px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,16,24,0.28)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 55% 45%, rgba(10,16,24,0.50) 0%, transparent 100%)", pointerEvents: "none" }} />

        <div className="px-6" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          <div style={{ width: "100%", maxWidth: 640 }}>
            <h1 style={{
              fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.03em",
              textAlign: "center",
              margin: "0 0 12px",
              lineHeight: 1.15,
              textShadow: "0 2px 24px rgba(0,0,0,0.5)",
              animation: "heroFadeUp 400ms ease both",
            }}>
              Describe It. Map It.
            </h1>

            <p style={{
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              color: "rgba(255,255,255,0.50)",
              textAlign: "center",
              margin: "0 0 32px",
              letterSpacing: "-0.01em",
              textShadow: "0 1px 12px rgba(0,0,0,0.4)",
              animation: "heroFadeUp 400ms 40ms ease both",
            }}>
              Atlas builds publication-ready{" "}
              <span style={{ color: "rgba(255,255,255,0.80)", borderBottom: "1px solid rgba(255,255,255,0.20)" }}>
                {subtitleWord}
              </span>
              <span style={{ borderRight: "2px solid rgba(255,255,255,0.5)", marginLeft: 1, animation: "mkt-blink 0.8s step-end infinite" }} />
            </p>

            <div style={{ animation: "heroFadeUp 400ms 60ms ease both" }} className="relative rounded-2xl">
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
                    aria-label="Describe the map you want to create"
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
                        handleHeroSubmit();
                      }
                    }}
                    placeholder={placeholder}
                    className={cn(
                      "w-full px-5 py-4 resize-none bg-transparent border-none text-[16px]",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4915a]/30 focus-visible:ring-offset-0",
                      "placeholder:text-[#b8b3ac] min-h-[52px]",
                    )}
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontStyle: "italic",
                      color: "#1a1a1a",
                      overflow: "hidden",
                    }}
                  />
                </div>

                <div className="flex items-center justify-between px-3 pb-3 pt-1">
                  <button
                    type="button"
                    className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-black/[0.04]"
                    aria-label="Upload data (coming soon)"
                  >
                    <Paperclip className="h-4 w-4" style={{ color: "#b8b3ac" }} />
                    <span
                      className="hidden text-xs group-hover:inline transition-opacity"
                      style={{ fontFamily: "'Geist Mono', monospace", color: "#9c9790" }}
                    >
                      Upload
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleHeroSubmit}
                    aria-label="Generate map"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                      value.trim() ? "cursor-pointer" : "cursor-default",
                    )}
                    style={{
                      backgroundColor: value.trim() ? GOLD : "rgba(196,145,90,0.15)",
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

            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-2"
              style={{ animation: "heroFadeUp 400ms 140ms ease both" }}
            >
              {HERO_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setValue(s);
                    router.push(`/app/map/new?prompt=${encodeURIComponent(s)}`);
                  }}
                  className="hero-chip flex items-center gap-2 rounded-full px-4 py-2 text-xs backdrop-blur-md"
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    color: "rgba(255,255,255,0.85)",
                    backgroundColor: "rgba(12,18,26,0.45)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer",
                  }}
                >
                  {s.includes("density") && <LucideGlobe className="h-3.5 w-3.5" />}
                  {s.includes("Coffee") && <MapPin className="h-3.5 w-3.5" />}
                  {s.includes("Earthquake") && <Layers className="h-3.5 w-3.5" />}
                  {s.includes("GDP") && <BarChart3 className="h-3.5 w-3.5" />}
                  {s}
                </button>
              ))}
            </div>

            <div
              className="mt-4"
              style={{ textAlign: "center", animation: "heroFadeUp 400ms 200ms ease both" }}
            >
              <a
                href="/app"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.55)",
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                }}
              >
                Free to start · No credit card →
              </a>
            </div>

            <button
              type="button"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginTop: 48,
                marginLeft: "auto",
                marginRight: "auto",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                animation: "heroFadeUp 400ms 300ms ease both",
              }}
            >
              <span style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.70)",
                marginBottom: 8,
              }}>
                See how it works
              </span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.65)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: "heroScrollBounce 2s ease-in-out infinite" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>
      </div>


      {/* ═══ DATA SOURCES TICKER — dark theme, extends hero ═══ */}
      <section style={{ padding: "28px 0 36px", background: HERO_DARK }}>
        <p style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          textAlign: "center",
          color: "rgba(255,255,255,0.70)",
          letterSpacing: "0.18em",
          marginBottom: 20,
          textTransform: "uppercase" as const,
        }}>
          Connected to 70+ official data sources
        </p>
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            overflow: "hidden",
            maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="mkt-ticker" style={{ display: "flex", gap: 36, whiteSpace: "nowrap", width: "max-content" }}>
            {[0, 1].map((copy) => (
              <div key={copy} style={{ display: "flex", gap: 36, alignItems: "center" }}>
                {DATA_SOURCES.map((src) => (
                  <span
                    key={`${copy}-${src}`}
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.65)",
                    }}
                  >
                    {src}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS — AtlasRenderPipeline (5-stage scrollytelling) ═══ */}
      {/* The pipeline component already renders on paper internally; .arp-chapter CSS override strips its default rounded-card treatment so it flows as a full-bleed chapter. */}
      <section
        id="how-it-works"
        className="arp-chapter"
        style={{ background: PAPER, scrollMarginTop: 80 }}
      >
        <AtlasRenderPipeline />
      </section>

      {/* ═══ MAP TYPES SHOWCASE — bridge between pipeline and CTA ═══ */}
      <section style={{ padding: "clamp(80px, 10vw, 120px) 28px", background: PAPER }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.22em",
              color: GOLD,
              textTransform: "uppercase" as const,
              fontWeight: 500,
              marginBottom: 20,
            }}>
              Not just choropleths
            </div>
            <h2 style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontSize: "clamp(36px, 4.5vw, 56px)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: INK,
              margin: 0,
            }}>
              14 map types. Atlas picks the right one.
            </h2>
          </div>
          <div className="mkt-showcase-grid">
            {([
              { family: "choropleth", label: "Choropleth", desc: "Regional comparisons" },
              { family: "heatmap", label: "Heatmap", desc: "Density patterns" },
              { family: "flow", label: "Flow map", desc: "Movement & connections" },
              { family: "proportional-symbol", label: "Proportional", desc: "Scaled by value" },
              { family: "extrusion", label: "3D Extrusion", desc: "Height as data" },
              { family: "point", label: "Point map", desc: "Locations on a map" },
            ] as const).map((t) => {
              const meta = FAMILY_META[t.family];
              return (
                <div key={t.family} className="mkt-showcase-card">
                  <div style={{
                    aspectRatio: "4/3",
                    position: "relative",
                    overflow: "hidden",
                    background: "#111820",
                    borderRadius: "10px 10px 0 0",
                  }}>
                    {meta?.thumbnail}
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: meta?.bg ?? "transparent",
                      pointerEvents: "none",
                    }} />
                  </div>
                  <div style={{
                    padding: "12px 14px 14px",
                    background: "#fafaf7",
                    borderRadius: "0 0 10px 10px",
                    border: "1px solid rgba(26,31,28,0.06)",
                    borderTop: 0,
                  }}>
                    <div style={{
                      fontFamily: "'Geist', sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      color: INK,
                      marginBottom: 2,
                    }}>
                      {t.label}
                    </div>
                    <div style={{
                      fontFamily: "'Geist Mono', monospace",
                      fontSize: 10,
                      color: INK_MUTED,
                      letterSpacing: "0.02em",
                    }}>
                      {t.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <a
              href="/app"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 12,
                fontWeight: 500,
                color: GOLD,
                textDecoration: "none",
                padding: "10px 20px",
                border: `1px solid ${GOLD}33`,
                borderRadius: 8,
                transition: "background 200ms ease, border-color 200ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD}0a`; e.currentTarget.style.borderColor = `${GOLD}55`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${GOLD}33`; }}
            >
              Explore all 14 map types →
            </a>
          </div>
        </div>
      </section>

      {/* ═══ CLOSING CTA — paper editorial ═══ */}
      <section style={{ padding: "clamp(96px, 14vw, 160px) 28px", background: PAPER, textAlign: "center" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.22em",
            color: GOLD,
            textTransform: "uppercase" as const,
            fontWeight: 500,
            marginBottom: 20,
          }}>
            Start building
          </div>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontSize: "clamp(40px, 5vw, 64px)",
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: INK,
            margin: "0 0 24px",
            textWrap: "balance" as const,
          }}>
            Your next map is one sentence away.
          </h2>
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: INK_MUTED,
            margin: "0 auto 40px",
            maxWidth: 520,
          }}>
            Free to start. No credit card. Describe what you want, Atlas does the rest.
          </p>
          <a
            href="/app"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 32px",
              borderRadius: 999,
              background: GOLD,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              boxShadow: "0 1px 2px rgba(154, 111, 63, 0.2), 0 8px 24px rgba(154, 111, 63, 0.20)",
              transition: "transform 220ms ease, box-shadow 220ms ease",
            }}
          >
            Try Atlas free
            <span style={{ fontSize: 16 }}>→</span>
          </a>
        </div>
      </section>

      {/* ═══ CLOSING SCENE — tall portrait matte painting, Rocket-style vertical reveal ═══ */}
      {/* 2:3 portrait image at 100% width → naturally ~1.5× viewport tall on desktop.
          Hard cut from CTA above. User scrolls: stars → horizon glow → archipelago → foreground → wordmark + prompt. */}
      <section style={{ position: "relative", width: "100%", background: FOOTER_DARK }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/closing-bg.png"
          alt=""
          style={{ display: "block", width: "100%", height: "auto", pointerEvents: "none" }}
        />

        {/* Top vignette — darkens star field so UI reads cleanly */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "38%",
            background: "linear-gradient(to bottom, rgba(13,18,23,0.72) 0%, rgba(13,18,23,0.30) 60%, rgba(13,18,23,0) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Bottom fade into footer */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "14%",
            background: `linear-gradient(to bottom, rgba(13,18,23,0) 0%, ${FOOTER_DARK} 100%)`,
            pointerEvents: "none",
          }}
        />

        {/* Wordmark + prompt bar — at the top, over the dark star field */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            zIndex: 1,
            padding: "clamp(48px, 6vw, 88px) 24px 0",
          }}
        >
          <div
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.3em",
              color: "rgba(255,255,255,0.45)",
              textTransform: "uppercase" as const,
              fontWeight: 500,
              marginBottom: 14,
              textShadow: "0 1px 12px rgba(0,0,0,0.7)",
            }}
          >
            AI-driven cartography
          </div>
          <div
            role="presentation"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontSize: "clamp(56px, 9vw, 140px)",
              fontWeight: 400,
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              margin: "0 0 clamp(28px, 4vw, 48px)",
              textShadow: "0 2px 48px rgba(0,0,0,0.65), 0 1px 4px rgba(0,0,0,0.4)",
            }}
          >
            Atlas
          </div>

          {/* Prompt bar */}
          <div style={{ width: "100%", maxWidth: 580 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.97)",
                border: closingFocused ? "1px solid rgba(196,145,90,0.45)" : "1px solid rgba(255,255,255,0.15)",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: closingFocused
                  ? "0 0 0 3px rgba(196,145,90,0.10), 0 12px 40px rgba(0,0,0,0.50)"
                  : "0 12px 40px rgba(0,0,0,0.40), 0 2px 8px rgba(0,0,0,0.20)",
                transition: "border-color 250ms ease, box-shadow 250ms ease",
              }}
            >
              <Textarea
                ref={closingRef}
                value={closingValue}
                aria-label="Describe the map you want to create"
                onChange={(e) => { setClosingValue(e.target.value); adjustClosingHeight(); }}
                onFocus={() => setClosingFocused(true)}
                onBlur={() => setClosingFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleClosingSubmit();
                  }
                }}
                placeholder="Describe what you want to map..."
                className={cn(
                  "w-full px-5 py-4 resize-none bg-transparent border-none text-[16px]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4915a]/30 focus-visible:ring-offset-0",
                  "placeholder:text-[#b8b3ac] min-h-[52px]",
                )}
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                  color: "#1a1a1a",
                  overflow: "hidden",
                }}
              />
              <div className="flex items-center justify-end px-3 pb-3 pt-1">
                <button
                  type="button"
                  onClick={handleClosingSubmit}
                  aria-label="Generate map"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                    closingValue.trim() ? "cursor-pointer" : "cursor-default",
                  )}
                  style={{
                    backgroundColor: closingValue.trim() ? GOLD : "rgba(196,145,90,0.15)",
                    transition: "background-color 160ms ease",
                  }}
                >
                  <ArrowUpIcon
                    className="h-4 w-4"
                    style={{ color: closingValue.trim() ? "#ffffff" : "rgba(196,145,90,0.45)" }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER — MarketingFooter uses dark-theme tokens; wrap it on FOOTER_DARK so its light text reads correctly. ═══ */}
      <div style={{ background: FOOTER_DARK }}>
        <MarketingFooter />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes mkt-blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes mkt-ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .mkt-ticker{animation:mkt-ticker-scroll 40s linear infinite}
        @keyframes heroFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes heroScrollBounce{0%,100%{transform:translateY(0);opacity:0.4}50%{transform:translateY(6px);opacity:0.8}}
        .hero-chip{transition:background-color 160ms ease,border-color 160ms ease,color 160ms ease}
        .hero-chip:hover{background-color:rgba(12,18,26,0.60)!important;border-color:rgba(255,255,255,0.22)!important;color:#ffffff!important}
        .arp-chapter .arp-island{border-radius:0!important;box-shadow:none!important}
        .arp-chapter .arp-island::before{border-radius:0!important}
        .mkt-showcase-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
        .mkt-showcase-card{border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(26,31,28,0.06),0 8px 24px rgba(26,31,28,0.04);transition:transform 280ms cubic-bezier(0.165,0.84,0.44,1),box-shadow 280ms cubic-bezier(0.165,0.84,0.44,1)}
        .mkt-showcase-card:hover{transform:translateY(-3px);box-shadow:0 1px 3px rgba(26,31,28,0.06),0 12px 32px rgba(26,31,28,0.10)}
        @media(max-width:768px){.mkt-showcase-grid{grid-template-columns:repeat(2,1fr);gap:14px}}
        @media(prefers-reduced-motion:reduce){
          .mkt-ticker{animation:none}
          @keyframes heroFadeUp{from,to{opacity:1;transform:none}}
          @keyframes heroScrollBounce{from,to{transform:none;opacity:0.6}}
          @keyframes mkt-blink{from,to{opacity:1}}
        }
      ` }} />
    </div>
  );
}
