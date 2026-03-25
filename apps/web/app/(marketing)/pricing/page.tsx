"use client";

import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import Link from "next/link";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "5 maps",
      "1 export per day",
      "Public maps only",
      "Community support",
    ],
    cta: "Get started",
    href: "/app",
    highlight: false,
    borderColor: "rgba(255,255,255,0.06)",
  },
  {
    name: "Pro",
    price: "$12",
    period: "/month",
    features: [
      "Unlimited maps",
      "Private maps",
      "Unlimited exports",
      "API access",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "#",
    highlight: true,
    borderColor: "hsl(197,62%,38%)",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "SSO / SAML",
      "Custom data connectors",
      "SLA guarantee",
      "Dedicated support",
      "Audit logs",
      "Custom basemaps",
    ],
    cta: "Contact us",
    href: "/enterprise",
    highlight: false,
    borderColor: "#d4a574",
  },
];

const FAQ = [
  {
    q: "Can I use Atlas without an account?",
    a: "Yes. You can generate and view maps anonymously. Creating an account lets you save, share, and export your maps.",
  },
  {
    q: "What data sources does Atlas support?",
    a: "Atlas connects to World Bank, Eurostat, OpenStreetMap, NASA, USGS, UNESCO, OpenSky Network, and more. New sources are added regularly.",
  },
  {
    q: "Can I use maps I create commercially?",
    a: "Yes. Maps you create are yours. Data source attributions are included automatically per their respective licenses.",
  },
  {
    q: "What export formats are available?",
    a: "PNG, SVG, and GeoJSON. Pro and Enterprise plans include high-resolution exports and embed codes.",
  },
  {
    q: "Is there an API?",
    a: "The Pro plan includes API access for programmatic map generation. Enterprise customers get dedicated API endpoints and higher rate limits.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "You can cancel anytime from your account settings. Your maps remain accessible on the free tier.",
  },
];

export default function PricingPage() {
  return (
    <>
      <MarketingNav variant="solid" />

      {/* Hero */}
      <section className="pt-24 pb-16 px-4 sm:px-8 text-center">
        <span
          className="font-geist-mono text-[10px] font-medium uppercase tracking-[0.14em] block mb-4"
          style={{ color: "rgba(248,249,251,0.25)" }}
        >
          Pricing
        </span>
        <h1
          className="font-display max-w-[600px] mx-auto"
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "rgba(248,249,251,0.90)",
          }}
        >
          Simple, transparent pricing
        </h1>
        <p
          className="font-geist text-[15px] mt-4 max-w-[440px] mx-auto"
          style={{ color: "rgba(248,249,251,0.40)" }}
        >
          Start free. Upgrade when you need more.
        </p>
      </section>

      {/* Tier cards */}
      <section className="pb-24 px-4 sm:px-8">
        <div className="max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="rounded-xl p-6 flex flex-col"
              style={{
                border: `1px solid ${tier.borderColor}`,
                background: tier.highlight ? "#111820" : "#14181f",
              }}
            >
              <h3
                className="font-geist text-[14px] font-medium uppercase tracking-[0.04em] mb-4"
                style={{ color: "rgba(248,249,251,0.50)" }}
              >
                {tier.name}
              </h3>
              <div className="mb-6">
                <span
                  className="font-display text-[42px]"
                  style={{
                    color: "rgba(248,249,251,0.90)",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {tier.price}
                </span>
                {tier.period && (
                  <span
                    className="font-geist text-[14px] ml-1"
                    style={{ color: "rgba(248,249,251,0.30)" }}
                  >
                    {tier.period}
                  </span>
                )}
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="hsl(197,62%,38%)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 flex-shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span
                      className="font-geist text-[14px]"
                      style={{ color: "rgba(248,249,251,0.60)" }}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className="block text-center font-geist text-[14px] font-medium py-3 rounded-xl transition-colors duration-150"
                style={{
                  background: tier.highlight
                    ? "hsl(197,62%,38%)"
                    : "transparent",
                  color: tier.highlight
                    ? "white"
                    : "rgba(248,249,251,0.60)",
                  border: tier.highlight
                    ? "none"
                    : "1px solid rgba(255,255,255,0.10)",
                }}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section
        className="py-20 px-4 sm:px-8"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#0a0d14",
        }}
      >
        <div className="max-w-[640px] mx-auto">
          <h2
            className="font-display text-center mb-12"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "rgba(248,249,251,0.90)",
            }}
          >
            Frequently asked questions
          </h2>
          <div className="space-y-0">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group border-b"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <summary
                  className="flex items-center justify-between py-5 cursor-pointer list-none font-geist text-[15px] font-medium"
                  style={{ color: "rgba(248,249,251,0.80)" }}
                >
                  {item.q}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(248,249,251,0.25)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0 ml-4 transition-transform duration-200 group-open:rotate-180"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p
                  className="pb-5 font-geist text-[14px] leading-relaxed"
                  style={{ color: "rgba(248,249,251,0.40)" }}
                >
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
