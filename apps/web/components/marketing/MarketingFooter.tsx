import Link from "next/link";

const sage = "#8ecba0";
const tx = "#e4e0d8";
const tx2 = "#908c85";
const tx3 = "#5a5752";
const bd = "rgba(255,255,255,0.05)";

const mono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

const COLUMNS = [
  {
    title: "PRODUCT",
    links: [
      { label: "Use Cases", href: "/use-cases" },
      { label: "Pricing", href: "/pricing" },
      { label: "Enterprise", href: "/enterprise" },
      { label: "Docs", href: "#" },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { label: "API Reference", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Status", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer style={{ padding: "40px 36px 24px", borderTop: `1px solid ${bd}`, maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 32, marginBottom: 32 }}>
        {/* Logo column */}
        <div>
          <div className="flex items-center gap-2 mb-[14px]">
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: sage }} />
            <span style={{ fontSize: 14, fontFamily: "Georgia, 'Times New Roman', serif", color: tx }}>Atlas</span>
          </div>
          <p style={{ ...mono, fontSize: 10, color: tx3, lineHeight: 1.6 }}>
            AI-driven cartography.<br />From prompt to map.
          </p>
        </div>

        {/* Link columns */}
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p style={{ ...mono, fontSize: 9, color: tx3, letterSpacing: "0.1em", marginBottom: 12 }}>
              {col.title}
            </p>
            {col.links.map((link) => (
              <p key={link.label} style={{ marginBottom: 6 }}>
                <Link
                  href={link.href}
                  style={{ ...mono, fontSize: 11, color: tx2, textDecoration: "none" }}
                >
                  {link.label}
                </Link>
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 16,
          borderTop: `1px solid ${bd}`,
          ...mono,
          fontSize: 9,
          color: tx3 + "66",
        }}
      >
        <span>&copy; 2026 Atlas</span>
        <span>MapLibre GL JS</span>
      </div>
    </footer>
  );
}
