"use client";

import { useEffect, useRef, useState } from "react";
import { MapCarousel } from "@/components/marketing/MapCarousel";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PromptInput } from "@/components/marketing/PromptInput";

const sage = "#8ecba0";
const gold = "#d4a574";
const bl = "#5db8ca";
const c1 = "#0d1217";
const c2 = "#111820";
const c3 = "#182028";
const mapBg = "#0f1419";
const tx = "#e4e0d8";
const tx2 = "#908c85";
const tx3 = "#5a5752";
const bd = "rgba(255,255,255,0.05)";
const bd2 = "rgba(255,255,255,0.08)";

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
const srf: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

// Demo constants
const P1 = "European wind energy capacity by region";
const P2 = "Show only countries above 10 GW";
const P3 = "Which grew fastest since 2020?";
const R3 = "Denmark \u2014 +4.2 GW, North Sea offshore expansion.";
const GEN_STEPS = ["Matched \u2192 Eurostat \u00b7 nrg_ind_ren", "Generating MapManifest", "Compiling GL layers \u00b7 quantile", "Rendering"];

// Use case gallery — drop screenshots into public/marketing/
const gallery = [
  { id: 1, title: "Forest area globally", img: "/marketing/uc-1.jpg" },
  { id: 2, title: "GDP per capita Africa", img: "/marketing/uc-2.jpg" },
  { id: 3, title: "Renewable energy EU", img: "/marketing/uc-3.jpg" },
  { id: 4, title: "Coffee shops Tokyo", img: "/marketing/uc-4.jpg" },
  { id: 5, title: "Trade as % of GDP Asia", img: "/marketing/uc-5.jpg" },
];

// US grid map for editor mock
const US: [number, number, string, number][] = [
  [0, 0, "AK", .15], [0, 10, "ME", .32], [1, 1, "WA", .65], [1, 4, "MT", .18], [1, 5, "ND", .12],
  [1, 6, "MN", .55], [1, 8, "WI", .48], [1, 9, "MI", .58], [1, 10, "VT", .30], [2, 1, "OR", .52],
  [2, 2, "ID", .22], [2, 3, "WY", .14], [2, 4, "SD", .16], [2, 5, "IA", .38], [2, 6, "IL", .82],
  [2, 7, "IN", .50], [2, 8, "OH", .62], [2, 9, "PA", .72], [2, 10, "NY", .95], [3, 1, "CA", .88],
  [3, 2, "NV", .42], [3, 3, "UT", .35], [3, 4, "CO", .68], [3, 5, "NE", .28], [3, 6, "KS", .32],
  [3, 7, "MO", .55], [3, 8, "KY", .40], [3, 9, "VA", .65], [3, 10, "NJ", .78], [4, 2, "AZ", .48],
  [4, 3, "NM", .30], [4, 4, "OK", .35], [4, 5, "AR", .25], [4, 6, "TN", .45], [4, 7, "NC", .58],
  [4, 8, "SC", .38], [4, 9, "MD", .60], [4, 10, "CT", .62], [5, 3, "TX", .92], [5, 5, "LA", .32],
  [5, 6, "MS", .18], [5, 7, "AL", .35], [5, 8, "GA", .62], [5, 9, "FL", .78], [5, 10, "MA", .68],
  [6, 10, "HI", .28],
];

const themes: Record<string, { name: string; colors: string[] }> = {
  clean: { name: "Clean", colors: ["#184868", "#2878a0", "#48a8c4", "#78d0e0", "#a8f0f0"] },
  muted: { name: "Muted", colors: ["#283848", "#406068", "#608888", "#88b0b4", "#b0d0d0"] },
  warm: { name: "Warm", colors: ["#3a2a18", "#6a4a2a", "#9a7a4a", "#c4a870", "#e8d8a0"] },
  contrast: { name: "Vivid", colors: ["#0a1830", "#1a4898", "#2a90e0", "#58ccff", "#c8f0ff"] },
};

type DemoPhase = "idle" | "typing" | "gen" | "map" | "t2" | "t3" | "r3" | "done";
const bkStyle: React.CSSProperties = { borderRight: `1.5px solid ${sage}66`, marginLeft: 1, animation: "blink .7s step-end infinite", display: "inline-block", width: 0, height: "1em" };

export default function LandingClient() {
  // Demo animation state
  const demoRef = useRef<HTMLDivElement>(null);
  const demoStarted = useRef(false);
  const [dp, setDp] = useState<DemoPhase>("idle");
  const [dt, setDt] = useState(0);   // typed chars for P1
  const [dg, setDg] = useState(-1);  // gen step index
  const [df, setDf] = useState(false); // filter active
  const [d2, setD2] = useState(0);   // typed chars for P2
  const [d3, setD3] = useState(0);   // typed chars for P3
  const [dr, setDr] = useState(0);   // typed chars for R3

  // Gallery hover
  const [ucHover, setUcHover] = useState<number | null>(null);

  // IntersectionObserver to trigger demo
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !demoStarted.current) {
        demoStarted.current = true;
        setTimeout(() => setDp("typing"), 400);
      }
    }, { threshold: 0.2 });
    if (demoRef.current) obs.observe(demoRef.current);
    return () => obs.disconnect();
  }, []);

  // Demo phase state machine — full 7-phase loop matching prototype
  useEffect(() => {
    if (dp === "typing") {
      let i = 0; setDt(0);
      const v = setInterval(() => { if (i < P1.length) { i++; setDt(i); } else { clearInterval(v); setTimeout(() => setDp("gen"), 500); } }, 30);
      return () => clearInterval(v);
    }
    if (dp === "gen") {
      setDg(0);
      [0, 600, 1100, 1600].forEach((d, i) => setTimeout(() => setDg(i), d));
      setTimeout(() => setDp("map"), 2200);
    }
    if (dp === "map") {
      const t = setTimeout(() => setDp("t2"), 1500);
      return () => clearTimeout(t);
    }
    if (dp === "t2") {
      let i = 0; setD2(0);
      const v = setInterval(() => { if (i < P2.length) { i++; setD2(i); } else { clearInterval(v); setDf(true); setTimeout(() => setDp("t3"), 1200); } }, 35);
      return () => clearInterval(v);
    }
    if (dp === "t3") {
      let i = 0; setD3(0);
      const v = setInterval(() => { if (i < P3.length) { i++; setD3(i); } else { clearInterval(v); setTimeout(() => setDp("r3"), 400); } }, 35);
      return () => clearInterval(v);
    }
    if (dp === "r3") {
      let i = 0; setDr(0);
      const v = setInterval(() => { if (i < R3.length) { i++; setDr(i); } else { clearInterval(v); setTimeout(() => setDp("done"), 400); } }, 22);
      return () => clearInterval(v);
    }
    if (dp === "done") {
      const t = setTimeout(() => {
        setDt(0); setDg(-1); setDf(false); setD2(0); setD3(0); setDr(0);
        setTimeout(() => setDp("typing"), 500);
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [dp]);

  const dShow = ["map", "t2", "t3", "r3", "done"].includes(dp);

  return (
    <div style={{ minHeight: "100vh", color: tx, ...srf, background: `linear-gradient(180deg, ${c1} 0%, ${c2} 35%, ${c3} 55%, ${c2} 75%, ${c1} 100%)` }}>
      <MarketingNav />

      {/* ═══ HERO ═══ */}
      <div style={{ position: "relative", minHeight: "calc(100vh - 50px)", overflow: "hidden" }}>
        <MapCarousel />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(13,18,23,0.88) 0%, rgba(13,18,23,0.55) 40%, rgba(13,18,23,0.35) 65%, rgba(13,18,23,0.6) 100%)", pointerEvents: "none", zIndex: 2 }} />

        <section style={{ position: "relative", zIndex: 5, display: "flex", alignItems: "center", minHeight: "calc(100vh - 50px)", padding: "0 36px", maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ maxWidth: 480 }}>
            <div className="s1" style={{ ...mono, fontSize: 10, color: sage, letterSpacing: "0.22em", marginBottom: 24 }}>AI-DRIVEN CARTOGRAPHY</div>
            <h1 className="s2" style={{ fontSize: "clamp(2.6rem, 4vw, 3.8rem)", fontWeight: 400, lineHeight: 1.06, letterSpacing: "-0.02em", marginBottom: 24 }}>
              Maps that <span style={{ color: sage, fontStyle: "italic" }}>think</span> for themselves.
            </h1>
            <p className="s3" style={{ fontSize: 16, lineHeight: 1.7, color: tx2, marginBottom: 34, maxWidth: 400 }}>
              Describe a map, upload data, or start from a prompt. Atlas finds the data, picks the projection, and renders it.
            </p>
            <div className="s4">
              <PromptInput />
            </div>
          </div>
        </section>
      </div>

      {/* ═══ DEMO ═══ */}
      <section ref={demoRef} style={{ padding: "60px 36px 70px" }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 400, marginBottom: 8 }}>Describe, refine, share.</h2>
            <p style={{ ...mono, fontSize: 11, color: tx3 }}>From prompt to published map in seconds.</p>
          </div>

          <div style={{
            border: `1px solid ${bd2}`, borderRadius: 12, overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            background: "rgba(16,22,30,0.95)",
          }}>
            {!dShow ? (
              <div style={{ minHeight: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
                {dp !== "gen" && (
                  <div style={{ textAlign: "center", maxWidth: 440 }}>
                    <p style={{ ...mono, fontSize: 9, color: sage + "55", letterSpacing: "0.2em", marginBottom: 18 }}>DESCRIBE YOUR MAP</p>
                    <div style={{ borderBottom: `1px solid ${sage}15`, paddingBottom: 10 }}>
                      <p style={{ ...srf, fontSize: 20, fontStyle: "italic", color: tx, minHeight: 28 }}>
                        {P1.slice(0, dt)}
                        {dp === "typing" && dt < P1.length && <span style={bkStyle} />}
                      </p>
                    </div>
                  </div>
                )}
                {dp === "gen" && (
                  <div style={{ textAlign: "left", maxWidth: 300 }}>
                    <p style={{ ...mono, fontSize: 9, color: sage + "44", letterSpacing: "0.18em", marginBottom: 10 }}>GENERATING</p>
                    {GEN_STEPS.map((s, i) => {
                      const done = i < dg; const active = i === dg;
                      return (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, opacity: done || active ? 1 : 0.08 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: done ? sage : active ? tx : sage + "22" }} />
                          <span style={{ ...mono, fontSize: 10, color: done ? sage + "88" : active ? tx : sage + "22" }}>
                            {s}{done && <span style={{ color: sage, marginLeft: 6 }}>{"\u2713"}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", minHeight: 380 }}>
                {/* Map area — drop screenshot into public/marketing/demo-map.webp */}
                <div style={{ position: "relative", borderRight: `1px solid ${bd}`, overflow: "hidden", background: mapBg }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/marketing/demo-map.jpg"
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      animation: "demoMapReveal 0.8s cubic-bezier(0.16,1,0.3,1) both",
                      transition: "filter 0.6s ease",
                      filter: df ? "brightness(0.7) contrast(1.1)" : "none",
                    }}
                  />
                  {df && (
                    <div style={{ position: "absolute", top: 10, right: 10, ...mono, fontSize: 8, color: sage, background: `${sage}0c`, border: `1px solid ${sage}18`, padding: "3px 8px", borderRadius: 4, zIndex: 2 }}>
                      &gt;10 GW filter
                    </div>
                  )}
                </div>
                {/* Chat panel */}
                <div style={{ display: "flex", flexDirection: "column", background: "rgba(8,12,15,0.5)" }}>
                  <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
                    {/* Initial prompt */}
                    <div style={{ padding: "7px 14px" }}>
                      <p style={{ ...mono, fontSize: 7, color: tx3, marginBottom: 2 }}>you</p>
                      <p style={{ ...srf, fontSize: 12, fontStyle: "italic", color: tx + "bb" }}>{P1}</p>
                    </div>
                    {/* Atlas response */}
                    <div style={{ padding: "7px 14px", background: "rgba(255,255,255,0.015)", borderTop: `1px solid ${bd}`, borderBottom: `1px solid ${bd}`, margin: "2px 0" }}>
                      <p style={{ ...mono, fontSize: 7, color: sage + "55", marginBottom: 2 }}>atlas</p>
                      <p style={{ ...mono, fontSize: 10, color: sage + "88" }}>Choropleth ready &middot; 12 countries</p>
                    </div>
                    {/* Follow-up: filter */}
                    {d2 > 0 && (
                      <div style={{ padding: "7px 14px" }}>
                        <p style={{ ...mono, fontSize: 7, color: tx3, marginBottom: 2 }}>you</p>
                        <p style={{ ...srf, fontSize: 12, fontStyle: "italic", color: tx + "bb" }}>
                          {P2.slice(0, d2)}{dp === "t2" && d2 < P2.length && <span style={bkStyle} />}
                        </p>
                      </div>
                    )}
                    {/* Atlas filter response */}
                    {["t3", "r3", "done"].includes(dp) && (
                      <div style={{ padding: "7px 14px", background: "rgba(255,255,255,0.015)", borderTop: `1px solid ${bd}`, borderBottom: `1px solid ${bd}` }}>
                        <p style={{ ...mono, fontSize: 7, color: sage + "55", marginBottom: 2 }}>atlas</p>
                        <p style={{ ...mono, fontSize: 10, color: sage + "88" }}>Updated &middot; 7 countries</p>
                      </div>
                    )}
                    {/* Follow-up: fastest growth */}
                    {d3 > 0 && (
                      <div style={{ padding: "7px 14px" }}>
                        <p style={{ ...mono, fontSize: 7, color: tx3, marginBottom: 2 }}>you</p>
                        <p style={{ ...srf, fontSize: 12, fontStyle: "italic", color: tx + "bb" }}>
                          {P3.slice(0, d3)}{dp === "t3" && d3 < P3.length && <span style={bkStyle} />}
                        </p>
                      </div>
                    )}
                    {/* Atlas answer */}
                    {dr > 0 && (
                      <div style={{ padding: "7px 14px", background: "rgba(255,255,255,0.015)", borderTop: `1px solid ${bd}` }}>
                        <p style={{ ...mono, fontSize: 7, color: sage + "55", marginBottom: 2 }}>atlas</p>
                        <p style={{ ...mono, fontSize: 10, color: tx + "88" }}>{R3.slice(0, dr)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ SEGMENTS ═══ */}
      <section style={{ padding: "40px 36px 60px", maxWidth: 940, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { t: "For creators", d: "Publish interactive maps people can explore.", cta: "Get share link", color: sage },
            { t: "For teams", d: "Create clean maps for decks, reports, and analysis.", cta: "Download PDF", color: bl },
          ].map((seg) => (
            <SegmentCard key={seg.t} {...seg} />
          ))}
        </div>
      </section>

      {/* ═══ USE CASES MINI ═══ */}
      <section style={{ padding: "40px 36px 60px", maxWidth: 940, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 400, marginBottom: 28 }}>Real use cases</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {gallery.map((m) => {
            const h = ucHover === m.id;
            return (
              <div key={m.id} onMouseEnter={() => setUcHover(m.id)} onMouseLeave={() => setUcHover(null)}
                style={{ textAlign: "center", cursor: "pointer", transform: h ? "translateY(-3px)" : "none", transition: "transform .2s" }}>
                <div style={{ height: 80, borderRadius: 6, overflow: "hidden", border: `1px solid ${h ? bd2 : bd}`, marginBottom: 6, background: c1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.img}
                    alt={m.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: h ? 1 : 0.75,
                      transition: "opacity .2s, transform .2s",
                      transform: h ? "scale(1.04)" : "scale(1)",
                    }}
                  />
                </div>
                <p style={{ ...mono, fontSize: 9, color: h ? tx : tx2 }}>{m.title}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ INTERACTIVE EDITOR MOCK ═══ */}
      <section style={{ padding: "50px 36px 70px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Powerful, not complicated.</h2>
          <p style={{ ...mono, fontSize: 11, color: tx3 }}>Layers, themes, and AI &mdash; all in one canvas. Try it.</p>
        </div>
        <div style={{ animation: "mkt-float 8s ease-in-out infinite", willChange: "transform" }}>
          <HeroEditorMock />
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{ padding: "50px 36px 60px", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 400, marginBottom: 10 }}>Start building maps today.</h2>
        <p style={{ ...mono, fontSize: 10, color: tx3, marginBottom: 26 }}>FREE TO START &middot; NO CREDIT CARD</p>
        <a href="/app" style={{ display: "inline-block", background: gold, color: c1, border: "none", padding: "14px 36px", ...mono, fontSize: 12, fontWeight: 700, borderRadius: 6, textDecoration: "none" }}>
          Get Started Free
        </a>
      </section>

      <MarketingFooter />
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes demoMapReveal{0%{opacity:0;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
      `}</style>
    </div>
  );
}

function SegmentCard({ t, d, cta, color }: { t: string; d: string; cta: string; color: string }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ border: `1px solid ${hover ? bd2 : bd}`, borderRadius: 10, padding: "24px 22px", background: hover ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", transition: "all .2s", cursor: "pointer" }}>
      <h3 style={{ fontSize: 18, fontWeight: 400, color: tx, marginBottom: 6 }}>{t}</h3>
      <p style={{ fontSize: 12, color: tx2, lineHeight: 1.6, marginBottom: 14 }}>{d}</p>
      <button style={{ background: color + "15", border: `1px solid ${color}28`, color, padding: "8px 16px", fontFamily: "'Courier New', monospace", fontSize: 10, borderRadius: 6, cursor: "pointer" }}>{cta}</button>
    </div>
  );
}

function HeroEditorMock() {
  const [hov, setHov] = useState<string | null>(null);
  const [theme, setTheme] = useState("clean");
  const [mode, setMode] = useState("interactive");
  const [lyrs, setLyrs] = useState([
    { id: 1, name: "Total Sales by State", c: "#78d0e0", vis: true },
    { id: 2, name: "City markers", c: gold, vis: true },
    { id: 3, name: "State borders", c: tx3, vis: false },
  ]);
  const th = themes[theme];
  const cW = 36, cH = 28, pX = 80, pY = 12;
  const mapColor = (v: number) => {
    const i = Math.min(Math.floor(v * th.colors.length), th.colors.length - 1);
    return th.colors[i];
  };
  const hs = hov ? US.find(([, , id]) => id === hov) : null;

  return (
    <div style={{ border: `1px solid ${bd2}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)", background: "rgba(16,22,30,0.95)" }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${bd}`, background: "rgba(8,12,15,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 14 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: sage }} />
          <span style={{ fontSize: 12, ...srf, color: tx }}>Atlas</span>
        </div>
        <div style={{ width: 1, height: 16, background: bd, marginRight: 10 }} />
        <span style={{ ...srf, fontSize: 11, color: tx + "cc", marginRight: 10 }}>Sales by Region</span>
        {/* Mode toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 5, padding: 1, marginLeft: 4 }}>
          {["Interactive", "Presentation"].map(m => (
            <button key={m} onClick={() => setMode(m.toLowerCase())}
              style={{ padding: "3px 10px", fontSize: 9, color: mode === m.toLowerCase() ? tx : tx3, background: mode === m.toLowerCase() ? "rgba(255,255,255,0.07)" : "transparent", border: "none", borderRadius: 4, cursor: "pointer" }}>{m}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ background: gold, padding: "3px 12px", borderRadius: 4, cursor: "pointer" }}>
          <span style={{ fontSize: 9, color: c1, fontWeight: 700, ...mono }}>Share</span>
        </div>
      </div>

      {/* Editor body */}
      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px", height: 360 }}>
        {/* Layers panel */}
        <div style={{ borderRight: `1px solid ${bd}`, padding: "12px 10px", display: "flex", flexDirection: "column", background: "rgba(8,12,15,0.3)" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: tx, marginBottom: 10 }}>Layers</span>
          {lyrs.map(l => (
            <div key={l.id} onClick={() => setLyrs(ls => ls.map(x => x.id === l.id ? { ...x, vis: !x.vis } : x))}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 6px", marginBottom: 2, background: l.vis ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: 6, cursor: "pointer" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: l.vis ? l.c : tx3 + "33" }} />
              <span style={{ fontSize: 10, color: l.vis ? tx : tx3, flex: 1 }}>{l.name}</span>
              {l.vis && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2,6L5,9L10,3" fill="none" stroke={sage + "88"} strokeWidth="1.3" strokeLinecap="round" /></svg>}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ background: sage + "0a", border: `1px solid ${sage}1a`, padding: 7, borderRadius: 6, textAlign: "center", cursor: "pointer" }}>
            <span style={{ fontSize: 9, color: sage }}>{"\u2726"} Generate</span>
          </div>
        </div>

        {/* Map area */}
        <div style={{ position: "relative", background: mapBg, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 48% 40%, #121820 0%, ${mapBg} 55%)` }} />
          <svg width="100%" height="100%" viewBox={`${pX - 16} ${pY - 10} ${cW * 11 + 32} ${cH * 7 + 20}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0 }}>
            {US.map(([row, col, id, val]) => {
              const x = pX + col * cW, y = pY + row * cH;
              const isH = hov === id;
              return (
                <g key={id} onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)} style={{ cursor: "pointer" }}>
                  <rect x={x + 0.5} y={y + 0.5} width={cW - 1} height={cH - 1} rx={2}
                    fill={mapColor(val)} fillOpacity={isH ? 0.95 : 0.78}
                    stroke={isH ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.2)"} strokeWidth={isH ? 1 : 0.3}
                    style={{ transition: "all .1s" }} />
                  <text x={x + cW / 2} y={y + cH / 2} textAnchor="middle" dominantBaseline="middle"
                    fill={val > 0.45 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)"}
                    fontSize={isH ? 8 : 7} fontFamily="'Segoe UI', sans-serif" fontWeight={isH ? 600 : 400}>{id}</text>
                </g>
              );
            })}
          </svg>
          {/* Hover tooltip */}
          {hs && (
            <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 5, background: "rgba(12,16,20,0.95)", border: `1px solid ${bd2}`, padding: "6px 14px", borderRadius: 7, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...mono, fontSize: 9, color: tx }}>{hs[2]}</span>
              <span style={{ fontSize: 16, ...srf, fontWeight: 600, color: tx }}>{Math.round(hs[3] * 100)}%</span>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", borderRadius: 2, overflow: "hidden" }}>
            {th.colors.map((c, i) => <div key={i} style={{ width: 14, height: 5, background: c }} />)}
          </div>
        </div>

        {/* Style panel */}
        <div style={{ borderLeft: `1px solid ${bd}`, padding: "12px 10px", overflowY: "auto", background: "rgba(8,12,15,0.3)" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: tx, display: "block", marginBottom: 10 }}>Style</span>
          <span style={{ fontSize: 8, color: tx3, marginBottom: 6, display: "block" }}>Theme</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 10 }}>
            {Object.entries(themes).map(([k, v]) => (
              <button key={k} onClick={() => setTheme(k)}
                style={{ padding: "5px 6px", borderRadius: 5, cursor: "pointer", textAlign: "left" as const, border: theme === k ? `1.5px solid ${sage}55` : "1.5px solid transparent", background: theme === k ? "rgba(255,255,255,0.04)" : "transparent" }}>
                <div style={{ display: "flex", gap: 1, marginBottom: 3, borderRadius: 2, overflow: "hidden" }}>
                  {v.colors.map((c, i) => <div key={i} style={{ flex: 1, height: 6, background: c }} />)}
                </div>
                <span style={{ fontSize: 8, color: theme === k ? tx : tx3 }}>{v.name}</span>
              </button>
            ))}
          </div>
          <span style={{ fontSize: 8, color: tx3, marginBottom: 4, display: "block" }}>Output</span>
          <div style={{ display: "flex", gap: 3 }}>
            {["Interactive", "PDF"].map((t, i) => (
              <button key={t} style={{ flex: 1, background: i === 0 ? "rgba(255,255,255,0.05)" : "transparent", border: `1px solid ${i === 0 ? bd2 : bd}`, padding: 4, fontSize: 9, color: i === 0 ? tx : tx3, borderRadius: 4, cursor: "pointer" }}>{t}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
