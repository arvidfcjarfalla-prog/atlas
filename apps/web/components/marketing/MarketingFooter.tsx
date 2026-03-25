import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer
      className="border-t"
      style={{
        padding: "20px 0",
        borderColor: "rgba(255,255,255,0.06)",
        background: "#0a0d14",
      }}
    >
      <div className="flex items-center justify-between max-w-[1120px] mx-auto px-4 sm:px-8">
        <span
          className="font-geist text-[13px] font-medium"
          style={{ color: "rgba(248,249,251,0.25)" }}
        >
          atlas
        </span>
        <div className="flex gap-5">
          {[
            { label: "Explore", href: "/explore" },
            { label: "Dashboard", href: "/app" },
            { label: "GitHub", href: "https://github.com" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="font-geist-mono text-[10px] font-normal uppercase tracking-[0.06em] transition-colors duration-150"
              style={{ color: "rgba(248,249,251,0.12)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgba(248,249,251,0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(248,249,251,0.12)";
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
