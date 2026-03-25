import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  // Try by slug, then by id
  let { data } = await supabase
    .from("maps")
    .select("title, description, prompt, thumbnail_url, is_public")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (!data) {
    const byId = await supabase
      .from("maps")
      .select("title, description, prompt, thumbnail_url, is_public")
      .eq("id", slug)
      .eq("is_public", true)
      .single();
    data = byId.data;
  }

  if (!data) {
    return { title: "Kartan hittades inte — Atlas" };
  }

  const description = data.description ?? data.prompt ?? "En interaktiv karta skapad med Atlas";

  return {
    title: `${data.title} — Atlas`,
    description,
    openGraph: {
      title: data.title,
      description,
      ...(data.thumbnail_url ? { images: [{ url: data.thumbnail_url }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description,
    },
  };
}

export default function SharedMapLayout({ children }: Props) {
  return <>{children}</>;
}
