"use client";

import { useEffect, useRef, useState } from "react";
import { CityLightsCanvas } from "@/components/marketing/CityLightsCanvas";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PromptInput } from "@/components/marketing/PromptInput";

// ── Scene labels cycling every 4s ──
const SCENE_LABELS = [
  "Wildfire incidents — Europe",
  "Earthquake activity — Pacific",
  "Global shipping routes",
  "Population density — EU",
];

// ── Showcase cards (static) ──
const SHOWCASE_CARDS = [
  {
    prompt: "GDP per capita by country",
    type: "Choropleth · World Bank",
    thumbClass: "choropleth" as const,
  },
  {
    prompt: "Hotels in Paris",
    type: "Cluster · OpenStreetMap",
    thumbClass: "cluster" as const,
  },
  {
    prompt: "Gini coefficient worldwide",
    type: "Diverging · World Bank",
    thumbClass: "diverging" as const,
  },
];

// ── Stats ──
const STATS = [
  { value: "170+", label: "indicators" },
  { value: "250+", label: "POI types" },
  { value: "7,800+", label: "live flights" },
  { value: "1,248", label: "heritage sites" },
];

const SOURCES = [
  "World Bank",
  "Eurostat",
  "OpenStreetMap",
  "NASA",
  "SCB",
  "UNESCO",
  "OpenSky",
];

export default function LandingClient() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stagger entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Scene label cycling
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSceneIndex((p) => (p + 1) % SCENE_LABELS.length);
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background layers */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 50% 40%, rgba(20,80,100,0.12) 0%, transparent 70%),
              radial-gradient(ellipse 60% 50% at 70% 60%, rgba(15,30,60,0.15) 0%, transparent 60%),
              #0a0d14
            `,
            zIndex: 0,
          }}
        />
        <CityLightsCanvas />

        {/* Vignette top */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: 120,
            background:
              "linear-gradient(to bottom, rgba(10,13,20,0.50) 0%, transparent 100%)",
            zIndex: 1,
          }}
        />

        {/* Vignette bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(10,13,20,0.95) 0%, rgba(10,13,20,0.40) 30%, transparent 60%)",
            zIndex: 1,
          }}
        />

        {/* Nav */}
        <MarketingNav variant="transparent" />

        {/* Hero content */}
        <div
          className="relative z-[2] flex flex-col items-center max-w-[640px] px-6"
        >
          {/* Label */}
          <span
            className="font-geist-mono text-[10px] font-medium uppercase tracking-[0.14em] mb-5 transition-all duration-700"
            style={{
              color: "rgba(248,249,251,0.25)",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(14px)",
            }}
          >
            AI-driven cartography
          </span>

          {/* H1 */}
          <h1
            className="font-display text-center mb-9 transition-all duration-700"
            style={{
              fontSize: "clamp(36px, 6vw, 64px)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "rgba(248,249,251,0.90)",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(14px)",
              transitionDelay: "70ms",
            }}
          >
            The world&apos;s data,
            <br />
            mapped.
          </h1>

          {/* Prompt input */}
          <div
            className="w-full transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(14px)",
              transitionDelay: "140ms",
            }}
          >
            <PromptInput size="large" placeholder="GDP per capita in Europe..." />
          </div>
        </div>

        {/* Scene indicator — bottom left */}
        <div
          className="absolute bottom-10 left-4 sm:left-8 z-[2] flex items-center gap-3"
        >
          <div
            className="w-6 h-px"
            style={{ background: "rgba(248,249,251,0.25)" }}
          />
          <span
            className="font-geist-mono text-[10px] font-normal uppercase tracking-[0.08em]"
            style={{ color: "rgba(248,249,251,0.25)" }}
          >
            {SCENE_LABELS[sceneIndex]}
          </span>
        </div>

        {/* Scene dots — bottom center */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[2] flex gap-[6px]">
          {SCENE_LABELS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-sm transition-all duration-300"
              style={{
                width: i === sceneIndex ? 16 : 4,
                background:
                  i === sceneIndex
                    ? "rgba(248,249,251,0.50)"
                    : "rgba(248,249,251,0.25)",
              }}
            />
          ))}
        </div>
      </section>

      {/* ═══ SHOWCASE ═══ */}
      <section
        style={{
          padding: "100px 0 80px",
          background: "#0f1218",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <span
            className="font-geist-mono text-[10px] font-medium uppercase tracking-[0.14em] block mb-[14px]"
            style={{ color: "rgba(248,249,251,0.25)" }}
          >
            Made with Atlas
          </span>
          <h2
            className="font-display mb-12"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "rgba(248,249,251,0.90)",
            }}
          >
            Three prompts, three maps.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SHOWCASE_CARDS.map((card) => (
              <div
                key={card.prompt}
                className="rounded-xl overflow-hidden transition-[border-color,transform] duration-200 cursor-pointer"
                style={{
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "#14181f",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.12)";
                  e.currentTarget.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.06)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  className="h-[200px] relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, #0c1825 0%, #162030 50%, #0a1520 100%)",
                  }}
                >
                  <ShowcaseThumb variant={card.thumbClass} />
                </div>
                <div className="p-4 px-[18px]">
                  <p
                    className="font-geist-mono text-[12px] font-normal mb-[6px]"
                    style={{ color: "rgba(248,249,251,0.50)" }}
                  >
                    &ldquo;{card.prompt}&rdquo;
                  </p>
                  <span
                    className="font-geist-mono text-[10px] font-normal uppercase tracking-[0.06em]"
                    style={{ color: "rgba(248,249,251,0.25)" }}
                  >
                    {card.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section
        style={{
          padding: "48px 0",
          background: "#0a0d14",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <div className="flex justify-center items-center gap-4 sm:gap-8 flex-wrap">
            {STATS.map((stat, i) => (
              <div key={stat.label} className="contents">
                {i > 0 && (
                  <div
                    className="w-[3px] h-[3px] rounded-full hidden sm:block"
                    style={{ background: "rgba(248,249,251,0.12)" }}
                  />
                )}
                <span
                  className="font-geist-mono text-[12px] font-medium tracking-[0.06em]"
                  style={{ color: "rgba(248,249,251,0.25)" }}
                >
                  <strong style={{ color: "rgba(248,249,251,0.50)", fontWeight: 500 }}>
                    {stat.value}
                  </strong>{" "}
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-center items-center gap-6 mt-4 flex-wrap">
            {SOURCES.map((src) => (
              <span
                key={src}
                className="font-geist-mono text-[10px] font-normal uppercase tracking-[0.08em]"
                style={{ color: "rgba(248,249,251,0.12)" }}
              >
                {src}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BOTTOM CTA ═══ */}
      <section
        style={{
          padding: "100px 0 120px",
          background: "#0f1218",
          textAlign: "center",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <h2
            className="font-display mb-3"
            style={{
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "rgba(248,249,251,0.90)",
            }}
          >
            What would you map?
          </h2>
          <p
            className="font-geist text-sm mb-9"
            style={{ color: "rgba(248,249,251,0.25)" }}
          >
            Describe any map. Atlas finds the data and renders it.
          </p>
          <PromptInput size="compact" placeholder="Breweries in Belgium..." />
          <p
            className="font-geist-mono text-[10px] uppercase tracking-[0.1em] mt-4"
            style={{ color: "rgba(248,249,251,0.12)" }}
          >
            No account needed · Free
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <MarketingFooter />
    </>
  );
}

// ── Showcase thumbnail patterns (CSS-only fake map previews) ──

function ShowcaseThumb({ variant }: { variant: "choropleth" | "cluster" | "diverging" }) {
  const styles: Record<string, React.CSSProperties> = {
    choropleth: {
      position: "absolute",
      inset: 20,
      borderRadius: 4,
      background: `
        radial-gradient(ellipse at 30% 40%, rgba(29,78,216,0.3) 0%, transparent 40%),
        radial-gradient(ellipse at 70% 60%, rgba(99,180,255,0.15) 0%, transparent 35%),
        radial-gradient(ellipse at 50% 30%, rgba(147,197,253,0.08) 0%, transparent 30%)
      `,
    },
    cluster: {
      position: "absolute",
      inset: 0,
      background: `
        radial-gradient(circle 8px at 40% 35%, rgba(56,189,248,0.6) 0%, transparent 100%),
        radial-gradient(circle 5px at 55% 45%, rgba(56,189,248,0.4) 0%, transparent 100%),
        radial-gradient(circle 12px at 45% 55%, rgba(56,189,248,0.5) 0%, transparent 100%),
        radial-gradient(circle 4px at 60% 30%, rgba(56,189,248,0.3) 0%, transparent 100%),
        radial-gradient(circle 6px at 35% 60%, rgba(56,189,248,0.35) 0%, transparent 100%),
        radial-gradient(circle 3px at 50% 40%, rgba(56,189,248,0.25) 0%, transparent 100%)
      `,
    },
    diverging: {
      position: "absolute",
      inset: 20,
      background: `
        radial-gradient(ellipse at 25% 50%, rgba(239,68,68,0.25) 0%, transparent 35%),
        radial-gradient(ellipse at 75% 50%, rgba(59,130,246,0.25) 0%, transparent 35%),
        radial-gradient(ellipse at 50% 50%, rgba(200,200,220,0.05) 0%, transparent 30%)
      `,
    },
  };

  return <div style={styles[variant]} />;
}
