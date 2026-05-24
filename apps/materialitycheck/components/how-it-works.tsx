const STEPS = [
  {
    n: "I",
    label: "Ta emot",
    title: "Skicka det du redan har.",
    body: "Mejla in EPD-PDF:er, dra in leveranssedlar, eller koppla din affärssystem-export. Materialitycheck läser produktnamn, mängder, transporter och avfallsfraktioner — också från de scannade PDF:er som ingen vill öppna.",
    mono: "PDF · CSV · BEAst · API",
  },
  {
    n: "II",
    label: "Mappa",
    title: "Vi matchar mot Boverkets klimatdatabas.",
    body: "Varje rad får en post i Boverkets klimatdatabas (version 02.07.000). Produktspecifika EPD:er går först, generiska värden används bara där skarp data saknas — och alltid med tydlig markering så totalentreprenören ser vad som är vad.",
    mono: "EPD-prioritering · generiskt fallback",
  },
  {
    n: "III",
    label: "Beräkna",
    title: "A1–A5 räknas enligt EN 15978.",
    body: "Produktskede (A1–A3) hämtas från EPD. Transport (A4) beräknas på faktiska distanser och fordonsklass. Bygg- och installationsskede (A5) tar in spill, energi och bortforsling. Allt redovisas i kg CO₂e per byggdel och totalt per byggprojekt.",
    mono: "kg CO₂e · per byggdel · per projekt",
  },
  {
    n: "IV",
    label: "Lämna",
    title: "Totalentreprenören får en signerbar rapport.",
    body: "Inte en Excel-flik. En sammanställning som mappar direkt mot deras BM- eller OneClickLCA-import, med spårbarhet ned till källdokument. Avvikelser flaggas. Versionshistorik bevaras. Tredjepartsgranskaren kan följa varje rad bakåt till sin EPD.",
    mono: "BM-import · OneClickLCA · spårbar",
  },
];

export function HowItWorks() {
  return (
    <section id="sa-funkar-det" className="relative border-b border-ink">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <header className="grid grid-cols-12 gap-x-6 md:gap-x-10 mb-16 md:mb-20">
          <div className="col-span-12 md:col-span-3">
            <p className="font-mono text-sm text-clay">§ 02</p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <h2 className="font-serif text-display-lg text-ink font-semibold leading-[0.98]">
              Fyra steg från
              <br />
              <span className="italic font-normal">leveranssedel</span> till
              klimatrapport.
            </h2>
            <p className="mt-8 max-w-prose font-serif text-xl text-inkSoft leading-snug">
              Ingen ny CAD-fil att underhålla. Ingen extra licens till ditt
              ekonomiansvarliga team. Du gör det du redan gör — vi gör resten läsbart för
              totalentreprenören.
            </p>
          </div>
        </header>

        <ol className="border-t border-ink">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="grid grid-cols-12 gap-x-6 md:gap-x-10 border-b border-rule py-10 md:py-12"
            >
              {/* Roman numeral + label */}
              <div className="col-span-12 md:col-span-3 flex md:flex-col items-baseline md:items-start gap-4 md:gap-2">
                <span className="font-serif text-display-md text-clay leading-none">
                  {step.n}
                </span>
                <span className="label">{step.label}</span>
              </div>

              {/* Title + body */}
              <div className="col-span-12 md:col-span-6">
                <h3 className="font-serif text-2xl md:text-[1.75rem] text-ink leading-tight font-medium">
                  {step.title}
                </h3>
                <p className="mt-4 font-serif text-lg text-inkSoft leading-relaxed max-w-column">
                  {step.body}
                </p>
              </div>

              {/* Mono caption */}
              <aside className="col-span-12 md:col-span-3 md:pt-3">
                <p className="font-mono text-xs uppercase tracking-wider text-inkMuted leading-relaxed">
                  {step.mono}
                </p>
                {i === STEPS.length - 1 && (
                  <p className="marginalia mt-3">
                    Hela kedjan är spårbar bakåt — varje siffra i rapporten leder till
                    sitt källdokument med ett klick.
                  </p>
                )}
              </aside>
            </li>
          ))}
        </ol>

        {/* Inline closing CTA */}
        <div className="mt-16 grid grid-cols-12 gap-x-6 md:gap-x-10 items-end">
          <div className="col-span-12 md:col-span-7">
            <p className="font-serif text-2xl md:text-3xl text-ink leading-snug max-w-column">
              Vi öppnar för en handfull underleverantörer i taget. Materialleverantörer
              först — installations&shy;entreprenörer i nästa kohort.
            </p>
          </div>
          <div className="col-span-12 md:col-span-5 md:text-right">
            <a
              href="#waitlist"
              className="inline-flex items-baseline gap-3 font-sans text-sm uppercase tracking-[0.22em] text-ink border-b border-ink hover:text-clay hover:border-clay transition-colors pb-1"
            >
              Anmäl intresse
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
