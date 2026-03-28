import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    // Include consuming apps
    "../../apps/*/app/**/*.{ts,tsx}",
    "../../apps/*/components/**/*.{ts,tsx}",
    "../../packages/*/src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        geist: ["Geist", "sans-serif"],
        "geist-mono": ["Geist Mono", "monospace"],
        display: ["Georgia", "'Times New Roman'", "serif"],
      },
      fontSize: {
        heading: ["15px", { lineHeight: "1.33", fontWeight: "600", letterSpacing: "-0.01em" }],
        title: ["13px", { lineHeight: "1.38", fontWeight: "500", letterSpacing: "-0.006em" }],
        body: ["13px", { lineHeight: "1.54", fontWeight: "400" }],
        caption: ["11px", { lineHeight: "1.45", fontWeight: "400" }],
        label: ["10px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.04em" }],
        data: ["13px", { lineHeight: "1.38", fontWeight: "400" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        strike: "hsl(var(--strike))",
        explosion: "hsl(var(--explosion))",
        military: "hsl(var(--military))",
        naval: "hsl(var(--naval))",
        warning: "hsl(var(--warning))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        med: "var(--dur-med)",
        slow: "var(--dur-slow)",
      },
      zIndex: {
        overlay: "var(--z-overlay)",
        sidebar: "var(--z-sidebar)",
        panel: "var(--z-panel)",
        controls: "var(--z-controls)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up var(--dur-med) var(--ease-out) both",
        "slide-in-right": "slide-in-right var(--dur-slow) var(--ease-out) both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
