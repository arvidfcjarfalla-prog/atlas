import Link from "next/link";

const sage = "#8ecba0";
const tx = "#e4e0d8";
const tx2 = "#b0aca5";
const tx3 = "#9a968e";
const bd = "rgba(255,255,255,0.05)";

const mono: React.CSSProperties = { fontFamily: "'Geist Mono', ui-monospace, monospace" };

type FooterLink = { label: string; href: string; soon?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "PRODUCT",
    links: [
      { label: "Use Cases", href: "/use-cases" },
      { label: "Pricing", href: "/pricing" },
      { label: "Enterprise", href: "/enterprise" },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { label: "Changelog", href: "#", soon: true },
      { label: "Status", href: "#", soon: true },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", href: "#", soon: true },
      { label: "Contact", href: "#", soon: true },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer style={{ padding: "40px 36px 24px", borderTop: `1px solid ${bd}`, maxWidth: 1060, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
          gap: 32,
          marginBottom: 32,
        }}
        className="mkt-footer-grid"
      >
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
                {link.soon ? (
                  <span
                    style={{ ...mono, fontSize: 11, color: `${tx2}66`, cursor: "default" }}
                    aria-disabled="true"
                  >
                    {link.label}
                  </span>
                ) : (
                  <Link
                    href={link.href}
                    style={{ ...mono, fontSize: 11, color: tx2, textDecoration: "none" }}
                  >
                    {link.label}
                  </Link>
                )}
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
          color: tx3,
        }}
      >
        <span>&copy; 2026 Atlas</span>
        <span>MapLibre GL JS</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media(max-width:640px){
          .mkt-footer-grid{grid-template-columns:1fr 1fr!important;row-gap:28px!important}
        }
      ` }} />
    </footer>
  );
}
