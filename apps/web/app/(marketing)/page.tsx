import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Atlas — AI-Driven Cartography",
  description:
    "Describe any map in natural language. Atlas finds the data, picks the visualization, and renders it.",
};

const LandingClient = dynamic(() => import("./landing"), { ssr: false });

export default function MarketingPage() {
  return <LandingClient />;
}
