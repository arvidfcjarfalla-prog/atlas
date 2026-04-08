"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { DENSITY_RAMP } from "./stages";
import type { Stage } from "./stages";

type Props = {
  stage: Stage;
};

const TINY_SWEDEN_PATH =
  "M180 20 L200 60 L210 140 L195 220 L230 310 L215 380 L170 430 L140 410 L155 340 L130 260 L145 180 L165 100 Z";

// Stage 1 — Describe: prompt + what Atlas will create
function VizDescribe() {
  return (
    <div className="arp-subviz">
      <div className="arp-viz-describe">
        <div className="arp-viz-prompt" aria-label="Example prompt input">
          <span className="arp-viz-caret">›</span>
          <span className="arp-viz-text">
            Befolkningstäthet per kommun i Sverige
            <span className="arp-viz-cursor" />
          </span>
          <span className="arp-viz-kbd">⏎</span>
        </div>
        <div className="arp-viz-understood" aria-label="What Atlas will create">
          <span className="arp-viz-understood-label">Atlas will create</span>
          <span className="arp-viz-understood-value">
            A choropleth — one of 14 map types — showing population density across 290 municipalities
          </span>
        </div>
      </div>
    </div>
  );
}

// Stage 2 — Source: editorial ledger-spread with a Georgia italic claim line.
// Staggered CSS entrance fires once when the component enters the viewport.
// Uses a low threshold (0) so it triggers as soon as any part is visible —
// the original 0.4 threshold failed in the scrollytelling layout because the
// element never reached 40% visibility before the user scrolled past.
function VizSources() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px 200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="arp-subviz arp-source-v2"
      data-active={active ? "true" : "false"}
      aria-label="Atlas data sources"
    >
      <div className="arp-source-rule" aria-hidden="true" />

      <div className="arp-source-grid">
        <div className="arp-source-col">
          <div className="arp-source-eyebrow">OFFICIELLA KÄLLOR</div>
          <div className="arp-source-display">70+</div>
          <div className="arp-source-list">
            <span>SCB</span>
            <span>EUROSTAT</span>
            <span>WORLD BANK</span>
            <span>FRED</span>
            <span>OECD</span>
            <span>SMHI</span>
            <span className="arp-source-more">+64</span>
          </div>
        </div>

        <div className="arp-source-divider" aria-hidden="true" />

        <div className="arp-source-col">
          <div className="arp-source-eyebrow">ELLER DIN EGEN</div>
          <div className="arp-source-display-sm">Din data.</div>
          <div className="arp-source-list">
            <span>CSV</span>
            <span>XLSX</span>
            <span>JSON</span>
            <span>PARQUET</span>
          </div>
        </div>
      </div>

      <p className="arp-source-claim">Varje karta visar sin källa.</p>
    </div>
  );
}

// Stage 3 — Render: three visual tokens mirroring on-map chrome
// (legend, source chip, tooltip) instead of a flat checklist.
function VizFeatures() {
  return (
    <div className="arp-subviz">
      <div className="arp-render-tokens" aria-label="Rendered map features">
        {/* Mini legend — mirrors .arp-map-legend on the map card */}
        <div className="arp-render-token">
          <span className="arp-render-token-label">Legend</span>
          <div className="arp-render-legend-bar">
            <div className="arp-render-swatches">
              {DENSITY_RAMP.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <div className="arp-render-range">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </div>

        {/* Source pill — mirrors .arp-source-chip on the map card */}
        <div className="arp-render-token">
          <span className="arp-render-token-label">Source</span>
          <div className="arp-render-source">
            <span className="arp-render-source-dot" aria-hidden="true" />
            <span>Källa: SCB BE0101 · 2024</span>
          </div>
        </div>

        {/* Tooltip preview — mirrors .arp-cursor-tooltip on the map card */}
        <div className="arp-render-token">
          <span className="arp-render-token-label">Hover</span>
          <div className="arp-render-tooltip">
            <span className="arp-render-tt-label">Stockholm</span>
            <span className="arp-render-tt-value">5 400 inv/km²</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 4 — Refine: editorial chat showing creative iteration.
// Card-based layout: user prompts in Georgia italic, AI responses as
// status rows with a gold dot. Matches the editorial palette without
// looking like a terminal or iMessage.
function VizChat() {
  return (
    <div className="arp-subviz">
      <div className="arp-chat" aria-label="Creative chat session">
        <div className="arp-chat-turn">
          <div className="arp-chat-user">
            Befolkningstäthet per kommun 2023
          </div>
          <div className="arp-chat-ai">
            <span className="arp-chat-dot" aria-hidden="true" />
            <span>Choropleth · 290 kommuner · SCB BE0101</span>
          </div>
        </div>
        <div className="arp-chat-turn">
          <div className="arp-chat-user">
            Animera förändringen från 2010 till 2023
          </div>
          <div className="arp-chat-ai">
            <span className="arp-chat-dot" aria-hidden="true" />
            <span>Timeline · 14 frames · 2010–2023</span>
          </div>
        </div>
        <div className="arp-chat-turn">
          <div className="arp-chat-user arp-chat-active">
            Lägg till ett lager med medelinkomst
            <span className="arp-viz-cursor" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Stage 5 — Export: four outcome-focused destination cards
function VizDestinations() {
  return (
    <div className="arp-subviz">
      <div className="arp-viz-destinations" aria-label="Export destinations">
        {/* Embed it live — browser frame with interactive map */}
        <div className="arp-dest">
          <div className="arp-dest-preview">
            <svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x={6} y={6} width={148} height={68} rx={3} fill="#fafaf7" stroke="#dcdbd4" strokeWidth={0.8} />
              {/* Browser chrome */}
              <circle cx={14} cy={13} r={2} fill="#dcdbd4" />
              <circle cx={21} cy={13} r={2} fill="#dcdbd4" />
              <circle cx={28} cy={13} r={2} fill="#dcdbd4" />
              <rect x={36} y={11} width={60} height={4} rx={2} fill="#f0eeea" />
              <line x1={6} y1={19} x2={154} y2={19} stroke="#dcdbd4" strokeWidth={0.5} />
              {/* Map area */}
              <rect x={12} y={24} width={136} height={44} rx={1} fill="#f0e6d2" stroke="#c4915a" strokeWidth={0.4} />
              <g transform="translate(58 26) scale(0.07)" fill="#c4915a" stroke="#9a6f3f" strokeWidth={1}>
                <path d={TINY_SWEDEN_PATH} />
              </g>
              {/* Play indicator */}
              <circle cx={142} cy={30} r={3.5} fill="#c4915a" opacity={0.8} />
              <polygon points="141,28.5 141,31.5 143.5,30" fill="#fafaf7" />
            </svg>
          </div>
          <div className="arp-dest-label">Embed it live</div>
          <div className="arp-dest-meta">INTERACTIVE · IFRAME</div>
        </div>

        {/* Drop into a deck — slide frame with map */}
        <div className="arp-dest">
          <div className="arp-dest-preview">
            <svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x={6} y={6} width={148} height={68} rx={3} fill="#fafaf7" stroke="#dcdbd4" strokeWidth={0.8} />
              <rect x={12} y={11} width={48} height={4} rx={1} fill="#3c4149" />
              <rect x={12} y={18} width={32} height={2.5} rx={1} fill="#9a968e" />
              <g transform="translate(86 24) scale(0.08)" fill="#c4915a" stroke="#9a6f3f" strokeWidth={1}>
                <path d={TINY_SWEDEN_PATH} />
              </g>
              {/* Slide number */}
              <rect x={134} y={64} width={14} height={6} rx={1} fill="#f0eeea" />
              <rect x={137} y={66} width={8} height={2} rx={0.5} fill="#9a968e" />
            </svg>
          </div>
          <div className="arp-dest-label">Drop into a deck</div>
          <div className="arp-dest-meta">KEYNOTE · PPTX</div>
        </div>

        {/* Drop into a report — document page with map block */}
        <div className="arp-dest">
          <div className="arp-dest-preview">
            <svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x={36} y={6} width={88} height={68} rx={2} fill="#fafaf7" stroke="#dcdbd4" strokeWidth={0.8} />
              <rect x={42} y={11} width={50} height={3} rx={0.5} fill="#1a1f1c" />
              <rect x={42} y={16} width={30} height={1.5} rx={0.5} fill="#9a968e" />
              <rect x={42} y={22} width={76} height={26} rx={1} fill="#f0e6d2" stroke="#c4915a" strokeWidth={0.5} />
              <g transform="translate(68 25) scale(0.05)" fill="#9a6f3f">
                <path d={TINY_SWEDEN_PATH} />
              </g>
              <rect x={42} y={52} width={70} height={1.5} rx={0.5} fill="#9a968e" />
              <rect x={42} y={56} width={74} height={1.5} rx={0.5} fill="#9a968e" />
              <rect x={42} y={60} width={66} height={1.5} rx={0.5} fill="#9a968e" />
              <rect x={42} y={64} width={72} height={1.5} rx={0.5} fill="#9a968e" />
              <rect x={42} y={68} width={52} height={1.5} rx={0.5} fill="#9a968e" />
            </svg>
          </div>
          <div className="arp-dest-label">Drop into a report</div>
          <div className="arp-dest-meta">PNG · SVG · PDF</div>
        </div>

        {/* Share a link — URL preview / unfurl card */}
        <div className="arp-dest">
          <div className="arp-dest-preview">
            <svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x={6} y={6} width={148} height={68} rx={3} fill="#fafaf7" stroke="#dcdbd4" strokeWidth={0.8} />
              {/* Link icon */}
              <g transform="translate(14 14)" stroke="#c4915a" strokeWidth={1.5} fill="none" strokeLinecap="round">
                <path d="M6 0 L0 0 C-3 0 -5 2 -5 5 L-5 11 C-5 14 -3 16 0 16 L6 16" />
                <path d="M10 0 L16 0 C19 0 21 2 21 5 L21 11 C21 14 19 16 16 16 L10 16" />
                <line x1={5} y1={8} x2={11} y2={8} />
              </g>
              {/* OG preview card */}
              <rect x={12} y={36} width={136} height={32} rx={2} fill="#f0eeea" stroke="#dcdbd4" strokeWidth={0.5} />
              <rect x={52} y={42} width={50} height={3} rx={0.5} fill="#3c4149" />
              <rect x={52} y={48} width={70} height={1.8} rx={0.5} fill="#9a968e" />
              <rect x={52} y={53} width={60} height={1.8} rx={0.5} fill="#9a968e" />
              <rect x={16} y={40} width={30} height={24} rx={1} fill="#f0e6d2" stroke="#c4915a" strokeWidth={0.4} />
              <g transform="translate(22 42) scale(0.04)" fill="#9a6f3f">
                <path d={TINY_SWEDEN_PATH} />
              </g>
            </svg>
          </div>
          <div className="arp-dest-label">Share a link</div>
          <div className="arp-dest-meta">URL · COLLABORATE</div>
        </div>
      </div>
    </div>
  );
}

function StageSubViz({ id }: { id: Stage["id"] }) {
  switch (id) {
    case 1:
      return <VizDescribe />;
    case 2:
      return <VizSources />;
    case 3:
      return <VizFeatures />;
    case 4:
      return <VizChat />;
    case 5:
      return <VizDestinations />;
    default:
      return null;
  }
}

export const StageBlock = forwardRef<HTMLElement, Props>(function StageBlock(
  { stage },
  ref,
) {
  return (
    <section
      ref={ref}
      className="arp-stage-block"
      data-stage={stage.id}
      aria-labelledby={`arp-stage-${stage.id}-title`}
    >
      <div className="arp-stage-num">{stage.eyebrow}</div>
      <h3 className="arp-stage-title" id={`arp-stage-${stage.id}-title`}>
        {stage.title}
      </h3>
      <p className="arp-stage-body">{stage.body}</p>

      <StageSubViz id={stage.id} />

      <ul className="arp-stage-bullets">
        {stage.bullets.map((b) => (
          <li key={b.num}>
            <span className="arp-bnum">{b.num}</span>
            <span>{b.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});
