import React from "react";
import { SWEDEN_CHOROPLETH_PATHS, SWEDEN_CHOROPLETH_VIEW_BOX } from "./generated/sweden-choropleth";
import {
  THUMB_VIEW_BOX,
  WORLD_OUTLINE_PATHS,
  EUROPE_OUTLINE_PATHS,
  POINT_DATA,
  PROP_DATA,
  HEAT_DATA,
  FLOW_DATA,
  EXTRUSION_DATA,
  CLUSTER_DATA,
} from "./generated/family-thumbnails";

// ─── Shared editorial chrome for thumbnail SVGs ──────────────────
// All 7 family thumbnails share: viewBox setup, 4 registration ticks,
// and a bottom-right provenance label. This frame renders that chrome
// once and lets each family only define its unique data layer.
function ThumbnailFrame({
  viewBox = THUMB_VIEW_BOX,
  provenance,
  children,
}: {
  viewBox?: string;
  provenance: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={viewBox}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      style={{ position: "absolute", inset: 0 }}
    >
      {children}
      {/* Registration ticks — atlas proof plate detail */}
      <g stroke="#c4915a" strokeWidth="1" opacity="0.45">
        <line x1="280" y1="2" x2="280" y2="10" />
        <line x1="280" y1="410" x2="280" y2="418" />
        <line x1="2" y1="210" x2="10" y2="210" />
        <line x1="550" y1="210" x2="558" y2="210" />
      </g>
      {/* Provenance marginalia */}
      <text
        x="532"
        y="402"
        fill="#c4915a"
        fillOpacity="0.45"
        fontSize="7"
        fontFamily="'Geist Mono', monospace"
        letterSpacing="0.14em"
        textAnchor="end"
      >
        {provenance}
      </text>
    </svg>
  );
}

export const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth", color: "#c4915a",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(196,145,90,0.08) 0%, transparent 70%)",
    thumbnail: (
      <ThumbnailFrame viewBox={SWEDEN_CHOROPLETH_VIEW_BOX} provenance="SVERIGE · 290 KOMMUNER">
        {/* Graticule — real parallels and meridians for Sweden's bbox */}
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          <line x1="0" y1="405" x2="560" y2="405" />
          <line x1="0" y1="269" x2="560" y2="269" />
          <line x1="0" y1="134" x2="560" y2="134" />
          <line x1="183" y1="0" x2="183" y2="420" />
          <line x1="247" y1="0" x2="247" y2="420" />
          <line x1="310" y1="0" x2="310" y2="420" />
          <line x1="373" y1="0" x2="373" y2="420" />
        </g>
        {/* Bathymetric rings — Norwegian Sea, engraver's flourish */}
        <g stroke="#c4915a" fill="none" strokeWidth="0.4">
          <ellipse cx="70" cy="200" rx="55" ry="70" opacity="0.12" />
          <ellipse cx="70" cy="200" rx="85" ry="108" opacity="0.07" />
          <ellipse cx="70" cy="200" rx="120" ry="150" opacity="0.04" />
          <ellipse cx="70" cy="200" rx="160" ry="200" opacity="0.025" />
        </g>
        {/* Swedish municipalities — 279 real polygons with knockout stroke */}
        <g stroke="#111820" strokeWidth="0.35" strokeLinejoin="round">
          {SWEDEN_CHOROPLETH_PATHS.map((p, i) => (
            <path key={i} d={p.d} fill={p.f} />
          ))}
        </g>
        {/* Legend — bottom-left */}
        <g transform="translate(28, 388)">
          <rect x="0" y="0" width="11" height="7" fill="#3d2f28" />
          <rect x="12" y="0" width="11" height="7" fill="#6b4a2b" />
          <rect x="24" y="0" width="11" height="7" fill="#a86d30" />
          <rect x="36" y="0" width="11" height="7" fill="#d89a3a" />
          <rect x="48" y="0" width="11" height="7" fill="#f0c56b" />
          <rect x="60" y="0" width="11" height="7" fill="#f7e3a8" />
          <text x="0" y="-4" fill="#8a857e" fontSize="7" fontFamily="'Geist Mono', monospace" letterSpacing="0.08em">LOW</text>
          <text x="71" y="-4" fill="#8a857e" fontSize="7" fontFamily="'Geist Mono', monospace" letterSpacing="0.08em" textAnchor="end">HIGH</text>
        </g>
      </ThumbnailFrame>
    ),
  },
  heatmap: {
    label: "Heatmap", color: "#d85a3a",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(216,90,58,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="30 HOTSPOTS · GLOBAL">
        <defs>
          <radialGradient id="heat-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f0704a" stopOpacity="0.75" />
            <stop offset="35%" stopColor="#d85a3a" stopOpacity="0.42" />
            <stop offset="75%" stopColor="#b04830" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#b04830" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          {WORLD_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g>
          {HEAT_DATA.map((h, i) => (
            <circle key={i} cx={h.x} cy={h.y} r={h.r} fill="url(#heat-grad)" />
          ))}
        </g>
      </ThumbnailFrame>
    ),
  },
  point: {
    label: "Point map", color: "#4a9eb0",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(74,158,176,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="120 CITIES · GLOBAL">
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          {WORLD_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill="#4a9eb0">
          {POINT_DATA.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.t === 0 ? 1.6 : p.t === 1 ? 2.4 : 3.4}
              opacity={p.t === 0 ? 0.55 : p.t === 1 ? 0.75 : 0.92}
            />
          ))}
        </g>
      </ThumbnailFrame>
    ),
  },
  cluster: {
    label: "Cluster map", color: "#a070c0",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(160,112,192,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="7 REGIONS · CLUSTERED">
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          {WORLD_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g>
          {CLUSTER_DATA.map((c, i) => {
            const r = 14 + Math.sqrt(c.n) * 4;
            return (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={r + 4} fill="rgba(160,112,192,0.08)" />
                <circle cx={c.x} cy={c.y} r={r} fill="rgba(160,112,192,0.18)" stroke="rgba(160,112,192,0.55)" strokeWidth="0.8" />
                <circle cx={c.x} cy={c.y} r="3" fill="#a070c0" />
                <text
                  x={c.x}
                  y={c.y + 3.5}
                  textAnchor="middle"
                  fill="#e4e0d8"
                  fontSize="9"
                  fontFamily="'Geist Mono', monospace"
                  fontWeight="500"
                  dx={r + 6}
                >
                  {c.n}
                </text>
              </g>
            );
          })}
        </g>
      </ThumbnailFrame>
    ),
  },
  flow: {
    label: "Flow map", color: "#6aaf7a",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(106,175,122,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="EU TRADE · 6 FLOWS">
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          {EUROPE_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill="none" strokeLinecap="round">
          {FLOW_DATA.map((f, i) => {
            const dx = f.ex - f.sx;
            const dy = f.ey - f.sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const mx = (f.sx + f.ex) / 2;
            const my = (f.sy + f.ey) / 2;
            const nx = -dy / dist;
            const ny = dx / dist;
            const curveHeight = Math.min(dist * 0.35, 60);
            const cx = mx + nx * curveHeight;
            const cy = my + ny * curveHeight;
            const strokeW = 0.8 + (f.w / 200) * 2.8;
            const opacity = 0.5 + (f.w / 200) * 0.4;
            return (
              <path
                key={i}
                d={`M${f.sx} ${f.sy} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${f.ex} ${f.ey}`}
                stroke="#6aaf7a"
                strokeOpacity={opacity}
                strokeWidth={strokeW}
              />
            );
          })}
        </g>
        <g fill="#6aaf7a">
          {FLOW_DATA.flatMap((f, i) => [
            <circle key={`s${i}`} cx={f.sx} cy={f.sy} r="3" opacity="0.85" />,
            <circle key={`e${i}`} cx={f.ex} cy={f.ey} r="3" opacity="0.85" />,
          ])}
        </g>
      </ThumbnailFrame>
    ),
  },
  isochrone: {
    label: "Isokon", color: "#059669",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(5,150,105,0.18) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="120" cy="68" rx="84" ry="55" fill="rgba(5,150,105,0.07)" stroke="rgba(5,150,105,0.26)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="58" ry="38" fill="rgba(5,150,105,0.12)" stroke="rgba(5,150,105,0.34)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="34" ry="22" fill="rgba(5,150,105,0.22)" stroke="rgba(5,150,105,0.48)" strokeWidth="1"/>
        <circle cx="120" cy="68" r="6" fill="rgba(5,150,105,0.90)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportional", color: "#e0a030",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(224,160,48,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="120 CITIES · BY POPULATION">
        <g stroke="#2a3642" strokeWidth="0.4" fill="none">
          {WORLD_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g>
          {PROP_DATA.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill="rgba(224,160,48,0.16)"
              stroke="rgba(224,160,48,0.55)"
              strokeWidth="0.6"
            />
          ))}
        </g>
      </ThumbnailFrame>
    ),
  },
  extrusion: {
    label: "Extruded map", color: "#6879c4",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(104,121,196,0.10) 0%, transparent 65%)",
    thumbnail: (
      <ThumbnailFrame provenance="EU · 290 NUTS2 REGIONS">
        <g stroke="#2a3642" strokeWidth="0.3" fill="none" opacity="0.6">
          {EUROPE_OUTLINE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g>
          {EXTRUSION_DATA.map((r, i) => {
            const shadowOpacity = 0.22;
            const topOpacity = 0.25 + r.c * 0.12;
            return (
              <g key={i}>
                <path
                  d={r.d}
                  fill="rgba(26,31,28,0.55)"
                  transform={`translate(${(r.h * 0.35).toFixed(1)}, ${r.h.toFixed(1)})`}
                  opacity={shadowOpacity}
                />
                <path
                  d={r.d}
                  fill={`rgba(104,121,196,${topOpacity.toFixed(2)})`}
                  stroke="rgba(104,121,196,0.45)"
                  strokeWidth="0.25"
                />
              </g>
            );
          })}
        </g>
      </ThumbnailFrame>
    ),
  },
};

export const FALLBACK_META = FAMILY_META.choropleth;

// ─── Rich family info for modal detail view ──────────────────────
export const FAMILY_INFO: Record<string, {
  typeName: string;
  typeNameEn: string;
  oneliner: string;
  description: string;
  bestFor: string;
  examples: string[];
}> = {
  choropleth: {
    typeName: "Regionkarta",
    typeNameEn: "Choropleth",
    oneliner: "Fyll regioner med färg baserat på data.",
    description: "Visar hur ett värde varierar geografiskt genom att färglägga hela regioner — länder, kommuner, postnummer. Ju mörkare färg, desto högre värde.",
    bestFor: "Jämförelser mellan områden, val, BNP, befolkning, inkomst",
    examples: ["BNP per capita i Europa", "Valresultat per kommun 2022", "Medelinkomst per postnummer"],
  },
  heatmap: {
    typeName: "Värmekarta",
    typeNameEn: "Heatmap",
    oneliner: "Visa koncentration och intensitet med färggradient.",
    description: "Visar var något sker oftast eller mest intensivt. Använder en färggradient för att markera densitet — perfekt när du har tusentals datapunkter.",
    bestFor: "Hotspots, densitet, trafikmönster, brottstatistik",
    examples: ["Trafikolyckor senaste året", "Airbnb-priser i London", "Jordskalv i Stilla havet"],
  },
  point: {
    typeName: "Punktkarta",
    typeNameEn: "Point map",
    oneliner: "Placera markörer på exakta platser.",
    description: "Visar specifika platser som punkter på kartan. Varje punkt representerar en adress, händelse eller plats av intresse.",
    bestFor: "Butiker, sensorer, händelser, adresser, POI:er",
    examples: ["Kaféer i centrala Stockholm", "Laddstationer i Norden", "UNESCO-världsarv i Asien"],
  },
  "proportional-symbol": {
    typeName: "Bubbelkarta",
    typeNameEn: "Proportional symbols",
    oneliner: "Symboler som skalas efter storlek.",
    description: "Placerar cirklar på kartan där storleken representerar ett värde. Större bubbla = högre värde.",
    bestFor: "Stadsdata, befolkning, omsättning per kontor, utsläpp",
    examples: ["Europas 50 största städer", "CO₂-utsläpp per land", "Omsättning per kontor"],
  },
  flow: {
    typeName: "Flödeskarta",
    typeNameEn: "Flow map",
    oneliner: "Visa rörelser och kopplingar mellan platser.",
    description: "Drar linjer mellan ursprung och destination för att visa rörelser. Tjockare linje = större volym.",
    bestFor: "Handel, migration, pendling, leveranskedjor",
    examples: ["Handelsflöden i EU", "Pendling till Stockholm", "Flygtrafik från Arlanda"],
  },
  extrusion: {
    typeName: "3D-karta",
    typeNameEn: "Extruded map",
    oneliner: "Lägg till höjd som en extra dimension.",
    description: "Extruderar regioner uppåt i 3D baserat på data. Skapar en dramatisk visualisering där man ser vilka områden som sticker ut.",
    bestFor: "Presentationer, befolkningsdata, storytelling",
    examples: ["Befolkningstäthet i 3D", "Bostadspriser i Sverige", "Energiproduktion per land"],
  },
  cluster: {
    typeName: "Klusterkarta",
    typeNameEn: "Cluster map",
    oneliner: "Gruppera närliggande punkter automatiskt.",
    description: "Grupperar närliggande punkter automatiskt med en siffra. Zooma in för enskilda punkter, zooma ut för grupper.",
    bestFor: "Stora dataset, sensornätverk, butikskedjor",
    examples: ["Alla McDonald's i USA", "Sensorer i IoT-nätverk", "Incidentrapporter"],
  },
};

// Featured families (shown larger) and rest (shown smaller)
export const MAP_TYPE_ORDER: { family: string; featured: boolean }[] = [
  { family: "choropleth", featured: true },
  { family: "heatmap", featured: true },
  { family: "point", featured: true },
  { family: "proportional-symbol", featured: false },
  { family: "flow", featured: false },
  { family: "extrusion", featured: false },
  { family: "cluster", featured: false },
];

export function FamilyPill({ family }: { family: string }) {
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
