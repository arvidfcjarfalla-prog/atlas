export function ProblemSolution() {
  return (
    <section id="problem" className="relative border-b border-ink bg-paperDeep/40">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-12 gap-x-6 md:gap-x-10 gap-y-10">
          {/* Section number + label */}
          <header className="col-span-12 md:col-span-3 md:sticky md:top-8 md:self-start">
            <p className="font-mono text-sm text-clay">§ 01</p>
            <h2 className="mt-3 font-serif text-2xl md:text-3xl text-ink leading-tight">
              Excel,
              <br />
              <span className="italic">mejl</span> och
              <br />
              tidspress.
            </h2>
            <p className="mt-6 marginalia max-w-[18rem]">
              Klimatdeklarationen är{" "}
              <span className="font-mono not-italic">byggherrens</span> ansvar enligt
              lag 2021:787 — men i praktiken blir det total&shy;entreprenörens, som i sin
              tur skickar bördan nedåt i kedjan.
            </p>
          </header>

          {/* Main narrative column */}
          <article className="col-span-12 md:col-span-6 max-w-column">
            <p className="dropcap font-serif text-lg leading-relaxed text-inkSoft">
              Sedan januari 2022 måste varje ny byggnad med bygglov följas av en
              klimatdeklaration. Sedan dess har 3 274 deklarationer lämnats in till
              Boverket — 1 509 av dem bara förra året.<a href="#fn1" className="fn">1</a>{" "}
              Volymen växer brant inför kommande gränsvärden, som enligt EPBD-direktivet
              ska börja gälla senast januari 2030. Att låta bli är inte ett alternativ.
            </p>

            <p className="mt-6 font-serif text-lg leading-relaxed text-inkSoft">
              Bördan att samla in data faller, i nio fall av tio, på{" "}
              <em>totalentreprenören</em>. Skanska, NCC, Peab och JM har redan en
              klimat&shy;bilaga i sina avtalsmallar. När slutbesked närmar sig skickas
              Excel-mallar ut till underleverantörer med samma fråga: ge oss EPD:er,
              transportdistanser och spill — för månader av leveranser, gärna inom några
              dagar.
            </p>

            <div className="my-12">
              <p className="pullquote">
                Den underleverantör som inte hinner svara med skarpa data straffas direkt
                — projektet tvingas använda Boverkets generiska värden, som ligger cirka
                25 % över medelvärdet.
              </p>
            </div>

            <p className="font-serif text-lg leading-relaxed text-inkSoft">
              Resultatet är ett pappersarbete som ingen tycker är roligt och ingen gör
              bra. EPD-bilagor letas upp i mejlmappar. Leveranssedlar fotograferas. Någon
              skriver av siffror till en Excel-flik som heter <span className="font-mono">A1-A3</span>{" "}
              och en till som heter <span className="font-mono">A4</span>. Två veckor senare
              skickas det tillbaka, totalentreprenören flikar in det i sitt LCA-verktyg —
              Bidcon, OneClickLCA, BM — och förhoppningsvis går siffrorna ihop.<a href="#fn2" className="fn">2</a>
            </p>

            <p className="mt-6 font-serif text-lg leading-relaxed text-inkSoft">
              <span className="font-semibold text-ink">Vad Materialitycheck gör:</span>{" "}
              tar emot det underleverantören redan har — produktnamn, leverans&shy;sedlar,
              EPD-PDF:er — och översätter det automatiskt till resursrader mappade mot
              rätt post i Boverkets klimatdatabas. Saknas en specifik EPD plockar vi det
              närmaste generiska värdet och flaggar det öppet. Det totalentreprenören får
              tillbaka är inte en Excel-fil utan en signerbar rapport, med spårbarhet ned
              till varje rad.
            </p>
          </article>

          {/* Marginalia / sidebar — stats */}
          <aside className="col-span-12 md:col-span-3 md:pt-2">
            <dl className="space-y-8">
              <div className="rule-thin pt-4">
                <dt className="label">A1–A3-andel</dt>
                <dd className="mt-2 font-serif text-display-md text-clay leading-none">
                  80–90%
                </dd>
                <p className="mt-2 marginalia">
                  av klimat&shy;påverkan finns i bärverk, klimatskärm och innerväggar —
                  byggdelar där underleverantörer äger råvarudatan.
                </p>
              </div>
              <div className="rule-thin pt-4">
                <dt className="label">Generiskt påslag</dt>
                <dd className="mt-2 font-serif text-display-md text-clay leading-none">
                  +25%
                </dd>
                <p className="mt-2 marginalia">
                  konservativt påslag i Boverkets databas. Varje saknad EPD blir en
                  betongklump i kalkylen.
                </p>
              </div>
              <div className="rule-thin pt-4">
                <dt className="label">Deklarationer 2025</dt>
                <dd className="mt-2 font-serif text-display-md text-clay leading-none">
                  1 509
                </dd>
                <p className="mt-2 marginalia">
                  registrerade hos Boverket. Inför gränsvärdena växer volymen brant.
                </p>
              </div>
            </dl>
          </aside>

          {/* Footnotes row */}
          <footer className="col-span-12 mt-10 pt-6 border-t border-ruleSoft">
            <ol className="font-mono text-xs leading-relaxed text-inkMuted space-y-1.5 max-w-3xl">
              <li id="fn1">
                <span className="text-clay">1.</span> Boverket, Uppföljning och statistik
                om klimatdeklarationer, 2026.
              </li>
              <li id="fn2">
                <span className="text-clay">2.</span> Branschinitiativet{" "}
                <em>Miljödata Nu</em> (IVL/BEAst) försöker standardisera via digitala
                leveranssedlar — adoption är dock fortsatt fragmenterad.
              </li>
            </ol>
          </footer>
        </div>
      </div>
    </section>
  );
}
