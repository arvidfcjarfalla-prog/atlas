import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Atlas — Multi-Map Platform",
  description: "Explore real-time maps of disasters, conflicts, infrastructure, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* viewport-fit=cover enables env(safe-area-inset-*) for iOS notch/home-indicator */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href="/fonts/fonts.css" />
        {/*
          FOUC prevention: pages set data-mode directly on their root div.
          This script only applies a fallback on <html> for unmatched pages.
          Modes: discover (dark gallery) | own (warm light) | create | refine
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=window.location.pathname;var m=p==='/explore'?'discover':p.startsWith('/app')?'app':p==='/app/gallery'?'own':'create';document.documentElement.setAttribute('data-mode',m);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
