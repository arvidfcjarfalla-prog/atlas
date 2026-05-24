import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Materialitycheck — Klimatrapportera A1–A5 utan Excel-helvete",
  description:
    "Underleverantörer i bygg: lämna in EPD-data, transporter och spill till totalentreprenören på minuter, inte dagar. Mappat mot Boverkets klimatdatabas.",
  metadataBase: new URL("https://materialitycheck.se"),
  openGraph: {
    title: "Materialitycheck",
    description:
      "Klimatrapportering för underleverantörer i bygg. Boverkets klimatdatabas. Scope A1–A5.",
    type: "website",
    locale: "sv_SE",
    siteName: "Materialitycheck",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="relative">{children}</body>
    </html>
  );
}
