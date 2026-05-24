import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f1ebdd",
        paperDeep: "#e8e0cd",
        ink: "#1a1614",
        inkSoft: "#3a3430",
        inkMuted: "#6b635a",
        rule: "#c9bfa8",
        ruleSoft: "#dcd2bb",
        clay: "#a8462a",
        clayDeep: "#7c3019",
        moss: "#2f4a32",
        accent: "#a8462a",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "Times New Roman", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "display-xl": ["clamp(3.5rem, 9vw, 7rem)", { lineHeight: "0.92", letterSpacing: "-0.025em" }],
        "display-lg": ["clamp(2.5rem, 6vw, 4.75rem)", { lineHeight: "0.98", letterSpacing: "-0.02em" }],
        "display-md": ["clamp(1.875rem, 4vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.015em" }],
      },
      maxWidth: {
        prose: "38rem",
        column: "44rem",
      },
    },
  },
  plugins: [],
};

export default config;
