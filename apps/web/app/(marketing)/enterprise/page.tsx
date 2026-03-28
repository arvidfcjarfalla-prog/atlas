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

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };
const srf: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };

const FEATURES = [
  { icon: "lock" as const, title: "SSO & SAML", desc: "Connect to your identity provider. Okta, Azure AD, Google Workspace supported out of the box." },
  { icon: "database" as const, title: "Custom data connectors", desc: "Bring your own databases — Snowflake, BigQuery, PostgreSQL. Maps update in real-time." },
  { icon: "users" as const, title: "Team management", desc: "Workspaces, roles, and permissions. Control who can view, edit, and publish." },
  { icon: "bolt" as const, title: "Dedicated infrastructure", desc: "Isolated compute, priority rendering, and guaranteed uptime with 99.9% SLA." },
  { icon: "shield" as const, title: "Audit & compliance", desc: "Full audit logs, data residency controls, SOC 2 Type II compliance." },
  { icon: "target" as const, title: "Dedicated success manager", desc: "A named point of contact who understands your workflow and helps you succeed." },
];

const COMPARISON = [
  ["Feature", "Pro", "Enterprise"],
  ["Maps", "Unlimited", "Unlimited"],
  ["SSO / SAML", "\u2014", "\u2713"],
  ["Custom data connectors", "\u2014", "\u2713"],
  ["SLA", "\u2014", "99.9%"],
  ["Audit logs", "\u2014", "\u2713"],
  ["Dedicated support", "\u2014", "\u2713"],
  ["On-premise", "\u2014", "Available"],
  ["Team workspaces", "Basic", "Advanced"],
];

export default function EnterprisePage() {
  return (
    <div style={{ minHeight: "100vh", color: tx, ...srf, background: `linear-gradient(180deg, ${c1} 0%, ${c2} 50%, ${c1} 100%)` }}>
      <MarketingNav />

      {/* Hero */}
      <section style={{ padding: "80px 36px 50px", textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
        <div className="s1" style={{ ...mono, fontSize: 10, color: gold, letterSpacing: "0.2em", marginBottom: 20 }}>ENTERPRISE</div>
        <h1 className="s2" style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", fontWeight: 400, lineHeight: 1.08, marginBottom: 20 }}>
          Atlas for your whole <span style={{ color: gold, fontStyle: "italic" }}>organization</span>.
        </h1>
        <p className="s3" style={{ fontSize: 16, color: tx2, lineHeight: 1.7, marginBottom: 32 }}>
          The same powerful cartography engine, built for teams that need security, scale, and support.
        </p>
        <button className="s4" style={{ background: gold, color: c1, border: "none", padding: "14px 36px", ...mono, fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
          Contact Sales
        </button>
      </section>

      {/* Logo placeholders */}
      <section style={{ padding: "30px 36px 50px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <p style={{ ...mono, fontSize: 9, color: tx3, letterSpacing: "0.15em", marginBottom: 20 }}>TRUSTED BY TEAMS AT</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
          {["Volvo", "Ericsson", "Klarna", "Spotify", "H&M"].map((name) => (
            <span key={name} style={{ ...mono, fontSize: 14, color: tx3 + "66", letterSpacing: "0.05em" }}>{name}</span>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: "40px 36px 60px", maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} {...f} stagger={i} />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ padding: "40px 36px 60px", maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 400, textAlign: "center", marginBottom: 28 }}>Enterprise vs Pro</h2>
        <div style={{ border: `1px solid ${bd}`, borderRadius: 12, overflow: "hidden" }}>
          {COMPARISON.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", borderBottom: i < COMPARISON.length - 1 ? `1px solid ${bd}` : "none", background: i === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              {row.map((cell, j) => (
                <div
                  key={j}
                  style={{
                    padding: "12px 16px",
                    ...(i === 0 ? { ...mono, fontSize: 9, color: tx3, letterSpacing: "0.08em" } : { fontSize: 12, color: j === 0 ? tx2 : cell === "\u2713" ? sage : cell === "\u2014" ? tx3 + "55" : tx2 }),
                    textAlign: j > 0 ? "center" : "left",
                  }}
                >
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "50px 36px 70px", textAlign: "center" }}>
        <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Ready to bring Atlas to your team?</h2>
        <p style={{ ...mono, fontSize: 11, color: tx3, marginBottom: 24 }}>We&apos;ll set up a personalized demo for your use case.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{ background: gold, color: c1, border: "none", padding: "14px 32px", ...mono, fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>Contact Sales</button>
          <a href="/pricing" style={{ display: "inline-flex", alignItems: "center", background: "transparent", border: `1px solid ${bd2}`, color: tx2, padding: "14px 32px", ...mono, fontSize: 12, borderRadius: 6, textDecoration: "none" }}>See Pricing</a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function FeatureCard({ icon, title, desc, stagger }: typeof FEATURES[number] & { stagger: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`s${Math.min(stagger, 4)}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${hover ? gold + "22" : bd}`,
        borderRadius: 12,
        padding: "28px 24px",
        background: hover ? "rgba(212,165,116,0.02)" : "rgba(255,255,255,0.005)",
        transition: "all .25s",
        transform: hover ? "translateY(-2px)" : "none",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <CaseIcon name={icon} color={gold} hover={hover} />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 400, color: tx, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 12, color: tx2, lineHeight: 1.6, ...mono }}>{desc}</p>
    </div>
  );
}
