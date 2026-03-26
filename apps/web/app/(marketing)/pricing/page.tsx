"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import BackToAtlas from "@/components/back-to-atlas";

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

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "For exploring and personal projects.",
    color: tx3,
    features: ["5 maps", "3 data sources", "Community support", "Basic export (PNG)", "Public maps only"],
    cta: "Get Started",
    primary: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    desc: "For professionals and small teams.",
    color: sage,
    features: ["Unlimited maps", "All data sources", "Priority support", "Export PDF, SVG, GeoJSON", "Private maps", "Custom themes", "API access", "Embed maps"],
    cta: "Start Free Trial",
    primary: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For organizations that need scale and control.",
    color: gold,
    features: ["Everything in Pro", "SSO / SAML", "Dedicated support", "Custom data connectors", "SLA guarantee", "Team management", "Audit logs", "On-premise option"],
    cta: "Contact Sales",
    primary: false,
  },
];

const FAQS = [
  { q: "Can I try Pro before paying?", a: "Yes. Every account starts with a 14-day free trial of Pro. No credit card required." },
  { q: "What happens when my trial ends?", a: "You'll be moved to the Free plan. All your maps are preserved — you just can't create new private ones until you upgrade." },
  { q: "Can I change plans later?", a: "Absolutely. Upgrade, downgrade, or cancel anytime from your account settings." },
  { q: "Do you offer discounts for education?", a: "Yes. We offer 50% off Pro for students and educators. Contact us with your .edu email." },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: "100vh", color: tx, ...srf, background: `linear-gradient(180deg, ${c1} 0%, ${c2} 50%, ${c1} 100%)` }}>
      <MarketingNav />

      {/* Hero */}
      <section className="s1" style={{ padding: "80px 36px 50px", textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}><BackToAtlas /></div>
        <div style={{ ...mono, fontSize: 10, color: sage, letterSpacing: "0.2em", marginBottom: 20 }}>PRICING</div>
        <h1 style={{ fontSize: "clamp(2rem, 3vw, 2.6rem)", fontWeight: 400, lineHeight: 1.1, marginBottom: 16 }}>Simple, transparent pricing.</h1>
        <p style={{ fontSize: 15, color: tx2, lineHeight: 1.7 }}>Start free. Upgrade when you need more.</p>
      </section>

      {/* Tier cards */}
      <section style={{ padding: "20px 36px 60px", maxWidth: 1060, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
          {PLANS.map((p) => (
            <PricingCard key={p.name} plan={p} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "40px 36px 70px", maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, fontWeight: 400, textAlign: "center", marginBottom: 28 }}>Questions?</h2>
        {FAQS.map((f, i) => (
          <div key={i} onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ borderTop: `1px solid ${bd}`, padding: "16px 0", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: openFaq === i ? tx : tx2 }}>{f.q}</span>
              <span style={{ ...mono, fontSize: 14, color: tx3, transform: openFaq === i ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
            </div>
            {openFaq === i && (
              <p style={{ fontSize: 12, color: tx2, lineHeight: 1.65, marginTop: 10, ...mono }}>{f.a}</p>
            )}
          </div>
        ))}
      </section>

      <MarketingFooter />
    </div>
  );
}

function PricingCard({ plan }: { plan: typeof PLANS[number] }) {
  const [hover, setHover] = useState(false);
  const router = useRouter();
  const p = plan;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px solid ${p.primary ? sage + "33" : hover ? bd2 : bd}`,
        borderRadius: 14,
        padding: "32px 28px",
        background: p.primary ? "rgba(142,203,160,0.03)" : "rgba(255,255,255,0.008)",
        transition: "all .25s",
        transform: hover ? "translateY(-4px)" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {p.primary && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${sage}, transparent)` }} />
      )}

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 400, color: tx, marginBottom: 4 }}>{p.name}</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 36, fontWeight: 400, color: tx, fontFamily: "Georgia, 'Times New Roman', serif" }}>{p.price}</span>
          {p.period && <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: tx3 }}>{p.period}</span>}
        </div>
        <p style={{ fontSize: 13, color: tx2, lineHeight: 1.5 }}>{p.desc}</p>
      </div>

      <button
        onClick={() => {
          if (p.name === "Enterprise") router.push("/enterprise");
          else if (p.name === "Free") router.push("/app");
        }}
        style={{
          width: "100%",
          background: p.primary ? sage : p.name === "Enterprise" ? gold : "rgba(255,255,255,0.05)",
          color: p.primary || p.name === "Enterprise" ? c1 : tx,
          border: `1px solid ${p.primary ? sage : p.name === "Enterprise" ? gold : bd2}`,
          padding: 11,
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 7,
          cursor: "pointer",
          marginBottom: 24,
        }}
      >
        {p.cta}
      </button>

      <div>
        {p.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3,7L6,10L11,4" fill="none" stroke={p.color === tx3 ? tx3 : p.color} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12, color: tx2 }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
