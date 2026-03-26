import Link from "next/link";

export default function BackToAtlas() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      &larr; Atlas
    </Link>
  );
}
