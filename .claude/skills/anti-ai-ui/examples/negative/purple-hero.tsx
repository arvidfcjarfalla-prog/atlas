// COUNTER-EXAMPLE — DO NOT EMIT THIS.
// Hits 6/10 composite vibe-check items:
// purple gradient, gradient-text headline, pill badge, dual CTA, max-w-7xl, Inter sole font.
export function PurpleHeroSlop() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          New
        </span>
        <h1 className="mt-6 text-balance tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent text-6xl font-bold">
          Unlock the future of seamlessly powerful workflows
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          Beautifully crafted, lightning-fast, built for the future.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <button className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-white">Get started</button>
          <button className="rounded-lg border px-6 py-3">Learn more</button>
        </div>
      </div>
    </section>
  );
}
