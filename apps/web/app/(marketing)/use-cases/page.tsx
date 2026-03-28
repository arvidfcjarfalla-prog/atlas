"use client";

import { useState } from "react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CaseIcon } from "@/components/marketing/CaseIcon";

const sage = "#8ecba0";
const gold = "#d4a574";
const c1 = "#0d1217";
const c2 = "#111820";
const tx = "#e4e0d8";
const tx2 = "#908c85";
const tx3 = "#5a5752";
const bd = "rgba(255,255,255,0.05)";
const bd2 = "rgba(255,255,255,0.08)";
const bl = "#5db8ca";
const cr = "#e8a050";
const cy = "#5abcaa";
const rd = "#d06060";

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

const CASES = [
  { title: "Research & Academia", desc: "Visualize study data, population distributions, and environmental datasets with publication-ready maps.", icon: "research" as const, color: bl, examples: ["Species migration patterns", "Climate change indicators", "Census data visualization"] },
  { title: "Business Intelligence", desc: "Turn sales data, market analysis, and regional KPIs into interactive dashboards your team can explore.", icon: "chart" as const, color: gold, examples: ["Regional sales performance", "Market penetration by city", "Supply chain optimization"] },
  { title: "Journalism & Media", desc: "Create compelling visual stories with data-driven maps that engage readers and clarify complex events.", icon: "pen" as const, color: cr, examples: ["Election results by district", "Conflict zone timelines", "Migration flow reporting"] },
  { title: "Urban Planning", desc: "Analyze zoning, traffic patterns, infrastructure, and demographic data to make better planning decisions.", icon: "grid" as const, color: sage, examples: ["Zoning density analysis", "Public transit coverage", "Green space accessibility"] },
  { title: "Non-profits & NGOs", desc: "Communicate impact, track field operations, and present findings with clear, accessible visualizations.", icon: "globe" as const, color: cy, examples: ["Aid distribution mapping", "Water access coverage", "Deforestation tracking"] },
  { title: "Real Estate & Finance", desc: "Map property values, market trends, risk assessments, and investment opportunities across regions.", icon: "building" as const, color: rd, examples: ["Property price heatmaps", "Investment risk by region", "Rental yield analysis"] },
];

export default function UseCasesPage() {
  return (
    <div style={{ minHeight: "100vh", color: tx, fontFamily: "Georgia, 'Times New Roman', serif", background: `linear-gradient(180deg, ${c1} 0%, ${c2} 50%, ${c1} 100%)` }}>
      <MarketingNav />

      {/* Hero */}
      <section className="s1" style={{ padding: "80px 36px 40px", textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ ...mono, fontSize: 10, color: sage, letterSpacing: "0.2em", marginBottom: 20 }}>USE CASES</div>
        <h1 style={{ fontSize: "clamp(2rem, 3.2vw, 2.8rem)", fontWeight: 400, lineHeight: 1.1, marginBottom: 16 }}>
          Built for every kind of <span style={{ color: sage, fontStyle: "italic" }}>map maker</span>.
        </h1>
        <p style={{ fontSize: 15, color: tx2, lineHeight: 1.7 }}>From academic research to enterprise dashboards, Atlas adapts to how you work.</p>
      </section>

      {/* Cards grid */}
      <section style={{ padding: "40px 36px 80px", maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {CASES.map((c, i) => (
            <UseCaseCard key={c.title} {...c} stagger={i} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "40px 36px 70px", textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 400, marginBottom: 10 }}>Don&apos;t see your use case?</h2>
        <p style={{ ...mono, fontSize: 11, color: tx3, marginBottom: 24 }}>Atlas is flexible enough for any data that has a geographic dimension.</p>
        <a href="/app" style={{ display: "inline-block", background: gold, color: c1, border: "none", padding: "12px 32px", ...mono, fontSize: 11, fontWeight: 700, borderRadius: 6, textDecoration: "none" }}>Try it Free</a>
      </section>

      <MarketingFooter />
    </div>
  );
}

function UseCaseCard({ title, desc, icon, color, examples, stagger }: typeof CASES[number] & { stagger: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`s${Math.min(stagger, 4)}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${hover ? bd2 : bd}`,
        borderRadius: 12,
        padding: "28px 24px",
        background: hover ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.008)",
        transition: "all .25s",
        cursor: "pointer",
        transform: hover ? "translateY(-3px)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <CaseIcon name={icon} color={color} hover={hover} />
        <h3 style={{ fontSize: 16, fontWeight: 400, color: tx }}>{title}</h3>
      </div>
      <p style={{ fontSize: 13, color: tx2, lineHeight: 1.65, marginBottom: 18 }}>{desc}</p>
      <div style={{ borderTop: `1px solid ${bd}`, paddingTop: 14 }}>
        {examples.map((ex) => (
          <div key={ex} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, opacity: hover ? 0.7 : 0.35, transition: "opacity .2s" }} />
            <span style={{ ...mono, fontSize: 10, color: hover ? tx2 : tx3, transition: "color .2s" }}>{ex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
