import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enterprise — Atlas",
  description:
    "SSO, custom connectors, SLA, and dedicated support — Atlas for teams that need control, compliance, and scale.",
};

const FEATURES = [
  {
    title: "SSO / SAML",
    description:
      "Single sign-on with your identity provider. SAML 2.0, OIDC, and Active Directory supported.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Custom Connectors",
    description:
      "Connect private databases, internal APIs, and proprietary data sources directly to Atlas.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    title: "SLA Guarantee",
    description:
      "99.9% uptime SLA with priority incident response and dedicated escalation path.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: "Dedicated Support",
    description:
      "Named account manager, onboarding assistance, and direct access to the engineering team.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: "Audit Logs",
    description:
      "Complete activity trail — who created, viewed, shared, and exported every map.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: "Custom Basemaps",
    description:
      "Bring your own basemap style — brand colors, restricted layers, or internal tile servers.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4a574" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
];

const COMPARISON = [
  { feature: "Maps", free: "5", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Exports per day", free: "1", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Private maps", free: "—", pro: "✓", enterprise: "✓" },
  { feature: "API access", free: "—", pro: "✓", enterprise: "✓" },
  { feature: "SSO / SAML", free: "—", pro: "—", enterprise: "✓" },
  { feature: "Custom connectors", free: "—", pro: "—", enterprise: "✓" },
  { feature: "SLA guarantee", free: "—", pro: "—", enterprise: "99.9%" },
  { feature: "Audit logs", free: "—", pro: "—", enterprise: "✓" },
];

export default function EnterprisePage() {
  return (
    <>
      <MarketingNav variant="solid" />

      {/* Hero */}
      <section className="pt-24 pb-16 px-4 sm:px-8 text-center">
        <span
          className="font-geist-mono text-[10px] font-medium uppercase tracking-[0.14em] block mb-4"
          style={{ color: "rgba(248,249,251,0.25)" }}
        >
          Enterprise
        </span>
        <h1
          className="font-display max-w-[640px] mx-auto"
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "rgba(248,249,251,0.90)",
          }}
        >
          Atlas for teams that need{" "}
          <span style={{ color: "#d4a574" }}>control</span>
        </h1>
        <p
          className="font-geist text-[15px] mt-4 max-w-[480px] mx-auto"
          style={{ color: "rgba(248,249,251,0.40)" }}
        >
          SSO, custom data connectors, SLA, and dedicated support — built for
          organizations that need compliance and scale.
        </p>
      </section>

      {/* Features grid */}
      <section className="pb-24 px-4 sm:px-8">
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-6"
              style={{
                border: "1px solid rgba(255,255,255,0.06)",
                background: "#14181f",
              }}
            >
              <div className="mb-4">{f.icon}</div>
              <h3
                className="font-geist text-[16px] font-medium mb-2"
                style={{ color: "rgba(248,249,251,0.85)" }}
              >
                {f.title}
              </h3>
              <p
                className="font-geist text-[14px] leading-relaxed"
                style={{ color: "rgba(248,249,251,0.40)" }}
              >
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section
        className="py-20 px-4 sm:px-8"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#0a0d14",
        }}
      >
        <div className="max-w-[800px] mx-auto">
          <h2
            className="font-display text-center mb-12"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "rgba(248,249,251,0.90)",
            }}
          >
            Compare plans
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <th
                    className="text-left font-geist text-[12px] font-medium uppercase tracking-[0.06em] py-3 pr-4"
                    style={{ color: "rgba(248,249,251,0.30)" }}
                  >
                    Feature
                  </th>
                  <th
                    className="text-center font-geist text-[12px] font-medium uppercase tracking-[0.06em] py-3 px-4"
                    style={{ color: "rgba(248,249,251,0.30)" }}
                  >
                    Free
                  </th>
                  <th
                    className="text-center font-geist text-[12px] font-medium uppercase tracking-[0.06em] py-3 px-4"
                    style={{ color: "rgba(248,249,251,0.30)" }}
                  >
                    Pro
                  </th>
                  <th
                    className="text-center font-geist text-[12px] font-medium uppercase tracking-[0.06em] py-3 px-4"
                    style={{ color: "#d4a574" }}
                  >
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr
                    key={row.feature}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td
                      className="font-geist text-[14px] py-3 pr-4"
                      style={{ color: "rgba(248,249,251,0.60)" }}
                    >
                      {row.feature}
                    </td>
                    <td
                      className="text-center font-geist-mono text-[13px] py-3 px-4"
                      style={{ color: "rgba(248,249,251,0.30)" }}
                    >
                      {row.free}
                    </td>
                    <td
                      className="text-center font-geist-mono text-[13px] py-3 px-4"
                      style={{ color: "rgba(248,249,251,0.50)" }}
                    >
                      {row.pro}
                    </td>
                    <td
                      className="text-center font-geist-mono text-[13px] py-3 px-4"
                      style={{
                        color:
                          row.enterprise === "✓" || row.enterprise === "99.9%"
                            ? "#d4a574"
                            : "rgba(248,249,251,0.30)",
                      }}
                    >
                      {row.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="py-20 text-center px-4 sm:px-8"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#0f1218",
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
          Book a demo
        </h2>
        <p
          className="font-geist text-[14px] mb-8"
          style={{ color: "rgba(248,249,251,0.40)" }}
        >
          See how Atlas fits your team&apos;s workflow.
        </p>
        <Link
          href="mailto:hello@atlas.dev"
          className="inline-block font-geist text-[14px] font-medium px-8 py-3.5 rounded-xl transition-opacity duration-150 hover:opacity-90"
          style={{
            background: "#d4a574",
            color: "#0a0d14",
          }}
        >
          Contact sales
        </Link>
        <p
          className="font-geist-mono text-[11px] mt-4"
          style={{ color: "rgba(248,249,251,0.25)" }}
        >
          hello@atlas.dev
        </p>
      </section>

      <MarketingFooter />
    </>
  );
}
