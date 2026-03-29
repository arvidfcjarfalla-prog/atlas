import type { Metadata } from "next";
import LandingClient from "./landing";

export const metadata: Metadata = {
  title: "Atlas — AI-Driven Cartography",
  description:
    "Describe any map in natural language. Atlas finds the data, picks the visualization, and renders it.",
  openGraph: {
    title: "Atlas — AI-Driven Cartography",
    description:
      "Describe any map in natural language. Atlas finds the data, picks the visualization, and renders it.",
    type: "website",
    siteName: "Atlas",
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas — AI-Driven Cartography",
    description:
      "Describe any map in natural language. Atlas finds the data, picks the visualization, and renders it.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Atlas",
      description:
        "AI-driven map platform. Describe any map in natural language — Atlas finds the data, picks the visualization, and renders it.",
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "0",
        highPrice: "29",
        offerCount: 3,
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Atlas?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Atlas is an AI-driven cartography platform. Describe any map in natural language, and Atlas finds the data from 70+ official sources (Eurostat, World Bank, SCB, FRED, and more), picks the right visualization, and renders an interactive map.",
          },
        },
        {
          "@type": "Question",
          name: "What data sources does Atlas support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Atlas connects to 70+ official statistical sources including Eurostat, World Bank, Statistics Sweden (SCB), FRED, US Census, and many more. It automatically finds and joins the right dataset for your prompt.",
          },
        },
        {
          "@type": "Question",
          name: "What types of maps can I create?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Atlas supports 14 map families: choropleth, point, cluster, heatmap, proportional symbol, flow, isochrone, extrusion, animated route, timeline, hexbin, hexbin-3d, screen grid, and trip maps.",
          },
        },
        {
          "@type": "Question",
          name: "Is Atlas free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Atlas offers a free plan with 5 maps and 3 data sources. Pro is $29/month with unlimited maps, all data sources, and export to PDF, SVG, and GeoJSON. Every account starts with a 14-day free Pro trial — no credit card required.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need to know GIS or coding?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Atlas uses natural language — just describe the map you want in plain English. The AI handles data sourcing, projection, classification, and rendering automatically.",
          },
        },
      ],
    },
  ],
};

export default function MarketingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingClient />
    </>
  );
}
