import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Use Cases — Atlas",
  description:
    "See how researchers, journalists, urban planners, and educators use Atlas to create maps from natural language.",
};

const USE_CASES = [
  {
    title: "Research & Academia",
    description:
      "Visualize socioeconomic indicators, environmental data, and demographic patterns for papers and presentations.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    title: "Business Intelligence",
    description:
      "Map market penetration, supply chain logistics, and customer density to uncover regional opportunities.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
  {
    title: "Journalism",
    description:
      "Produce publication-ready maps for stories on elections, migration, climate, and urban development.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </svg>
    ),
  },
  {
    title: "Urban Planning",
    description:
      "Analyze transportation, zoning, infrastructure, and population distribution for informed city development.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01" />
        <path d="M16 6h.01" />
        <path d="M12 6h.01" />
        <path d="M12 10h.01" />
        <path d="M12 14h.01" />
        <path d="M16 10h.01" />
        <path d="M16 14h.01" />
        <path d="M8 10h.01" />
        <path d="M8 14h.01" />
      </svg>
    ),
  },
  {
    title: "Environmental Monitoring",
    description:
      "Track wildfires, air quality, deforestation, and natural hazards with near-real-time data overlays.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 22V2L7 7l10 5" />
        <path d="M7 7v15" />
      </svg>
    ),
  },
  {
    title: "Education",
    description:
      "Help students explore world data interactively — from geography and economics to history and ecology.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(197,62%,38%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
      </svg>
    ),
  },
];

export default function UseCasesPage() {
  return (
    <>
      <MarketingNav variant="solid" />

      {/* Hero */}
      <section className="pt-24 pb-16 px-4 sm:px-8 text-center">
        <span
          className="font-geist-mono text-[10px] font-medium uppercase tracking-[0.14em] block mb-4"
          style={{ color: "rgba(248,249,251,0.25)" }}
        >
          Use cases
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
          Maps for every discipline
        </h1>
        <p
          className="font-geist text-[15px] mt-4 max-w-[480px] mx-auto"
          style={{ color: "rgba(248,249,251,0.40)" }}
        >
          From academic research to newsroom storytelling, Atlas turns natural
          language into publication-ready maps.
        </p>
      </section>

      {/* Cards grid */}
      <section className="pb-24 px-4 sm:px-8">
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="rounded-xl p-6 transition-[border-color,transform] duration-200 hover:-translate-y-[2px]"
              style={{
                border: "1px solid rgba(255,255,255,0.06)",
                background: "#14181f",
              }}
            >
              <div className="mb-4">{uc.icon}</div>
              <h3
                className="font-geist text-[16px] font-medium mb-2"
                style={{ color: "rgba(248,249,251,0.85)" }}
              >
                {uc.title}
              </h3>
              <p
                className="font-geist text-[14px] leading-relaxed"
                style={{ color: "rgba(248,249,251,0.40)" }}
              >
                {uc.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="py-20 text-center px-4 sm:px-8"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#0a0d14",
        }}
      >
        <h2
          className="font-display mb-4"
          style={{
            fontSize: "clamp(24px, 3vw, 40px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "rgba(248,249,251,0.90)",
          }}
        >
          Ready to try?
        </h2>
        <Link
          href="/app"
          className="inline-block font-geist text-sm font-medium text-white px-6 py-3 rounded-xl transition-colors duration-150"
          style={{ background: "hsl(197,62%,38%)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "hsl(197,62%,44%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "hsl(197,62%,38%)";
          }}
        >
          Get started — free
        </Link>
      </section>

      <MarketingFooter />
    </>
  );
}
