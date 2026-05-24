export function Masthead() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <header className="relative z-10 border-b border-ink">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-baseline justify-between gap-6 text-[0.7rem] font-sans uppercase tracking-[0.2em] text-inkMuted">
        <span className="hidden sm:inline">{today}</span>
        <span className="hidden md:inline">Stockholm · Sverige</span>
        <span className="hidden md:inline">Volym I · Utgåva 01</span>
        <span>Klimatdeklarationer · Bygg</span>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-6 flex items-end justify-between gap-8 border-t border-ink">
        <a href="/" className="flex flex-col leading-none">
          <span className="font-serif font-semibold text-3xl md:text-4xl tracking-tight text-ink">
            Materialitycheck
          </span>
          <span className="mt-1.5 font-sans uppercase tracking-[0.22em] text-[0.65rem] text-inkMuted">
            Klimatrapportering för underleverantörer
          </span>
        </a>
        <nav className="hidden md:flex items-baseline gap-7 font-sans text-[0.78rem] uppercase tracking-[0.18em] text-ink">
          <a href="#problem" className="hover:text-clay transition-colors">
            Problemet
          </a>
          <a href="#sa-funkar-det" className="hover:text-clay transition-colors">
            Så funkar det
          </a>
          <a href="#waitlist" className="hover:text-clay transition-colors">
            Tidig tillgång
          </a>
        </nav>
      </div>
    </header>
  );
}
