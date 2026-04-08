// Stage definitions for AtlasRenderPipeline — the marketing "How it works" section.
// Five stages: Describe → Source → Render → Refine → Export.
// "Describe" merges prompt + intent parsing. "Refine" shows the chat-back iteration
// that comes AFTER the first render.

export type StageId = 1 | 2 | 3 | 4 | 5;

export type StageBullet = {
  num: string;
  text: string;
};

export type Stage = {
  id: StageId;
  key: string;
  label: string;
  num: string; // e.g. "01"
  eyebrow: string; // e.g. "01 / 05 · Describe"
  title: string;
  body: string;
  bullets: StageBullet[];
};

export const STAGES: Stage[] = [
  {
    id: 1,
    key: "describe",
    label: "Describe",
    num: "01",
    eyebrow: "01 / 05 · Describe",
    title: "Describe it. Then keep going.",
    body: "Write what you want in plain language — Swedish or English. Atlas picks from 14 map types, finds the data, and renders your first map. Then the conversation continues.",
    bullets: [
      { num: "1.1", text: "Write in Swedish or English" },
      { num: "1.2", text: "Atlas identifies the topic and geography" },
      { num: "1.3", text: "Chooses from 14 map types — choropleth, heatmap, flow, and more" },
      { num: "1.4", text: "Your first prompt is the beginning, not the end" },
    ],
  },
  {
    id: 2,
    key: "source",
    label: "Source",
    num: "02",
    eyebrow: "02 / 05 · Source",
    title: "Real data. Theirs or yours.",
    body: "Pull from official sources Atlas already knows — or drop in your own spreadsheet. Every figure stays traceable to its exact origin.",
    bullets: [
      { num: "2.1", text: "70+ official statistical sources connected" },
      { num: "2.2", text: "Upload your own CSV, XLSX, or JSON" },
      { num: "2.3", text: "Exact table IDs logged and cited automatically" },
      { num: "2.4", text: "Every figure traceable to its source" },
    ],
  },
  {
    id: 3,
    key: "render",
    label: "Render",
    num: "03",
    eyebrow: "03 / 05 · Render",
    title: "Your first map. Not your last.",
    body: "Legend, tooltip, source citation, color ramp — everything renders in seconds. But this is a starting point. The map is live, and so is the conversation.",
    bullets: [
      { num: "3.1", text: "Publication-ready from the first render" },
      { num: "3.2", text: "Source cited automatically" },
      { num: "3.3", text: "Pan, zoom, hover — fully interactive" },
      { num: "3.4", text: "Keep chatting to shape what comes next" },
    ],
  },
  {
    id: 4,
    key: "refine",
    label: "Refine",
    num: "04",
    eyebrow: "04 / 05 · Refine",
    title: "Keep building. The map evolves.",
    body: "Your first map is a starting point. Keep chatting to add layers, animate over time, switch map types, or combine datasets — Atlas updates the same map in place. No re-runs, no context lost.",
    bullets: [
      { num: "4.1", text: "Animate changes over time" },
      { num: "4.2", text: "Add layers — income, migration, housing" },
      { num: "4.3", text: "Switch map types mid-conversation" },
      { num: "4.4", text: "Every change keeps the source and context" },
    ],
  },
  {
    id: 5,
    key: "export",
    label: "Export",
    num: "05",
    eyebrow: "05 / 05 · Export",
    title: "Ship what you built.",
    body: "You described, sourced, rendered, and refined — now the result goes where it needs to. A slide deck, a live embed, a PDF for a brief. The map carries every choice you made along the way.",
    bullets: [
      { num: "5.1", text: "Export to PNG, SVG, or PDF in one click" },
      { num: "5.2", text: "Embed live — the map stays interactive" },
      { num: "5.3", text: "Every layer, animation, and source travels with it" },
      { num: "5.4", text: "From first prompt to final artifact — one conversation" },
    ],
  },
];

// Color ramp used by the Sweden choropleth. Index 0 = lightest (low density).
export const DENSITY_RAMP = [
  "#f7e3a8", // 0 — lightest
  "#f0c56b", // 1
  "#d89a3a", // 2
  "#a86d30", // 3
  "#6b4a2b", // 4
  "#3d2f28", // 5 — darkest
] as const;

// Fill → rank mapping. Used for tooltip values and the refine filter dim effect.
export const RANK_BY_FILL: Record<string, number> = {
  "#f7e3a8": 0,
  "#f0c56b": 1,
  "#d89a3a": 2,
  "#a86d30": 3,
  "#6b4a2b": 4,
  "#3d2f28": 5,
};

export const RANK_VALUE_LABELS = [
  "~12 inv/km²",
  "~45 inv/km²",
  "~120 inv/km²",
  "~380 inv/km²",
  "~1 200 inv/km²",
  "~5 400 inv/km²",
] as const;
