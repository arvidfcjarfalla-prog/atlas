export function Colophon() {
  return (
    <footer className="relative bg-paper">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-12 gap-x-6 md:gap-x-10 gap-y-6 border-t border-ink pt-8">
          <div className="col-span-12 md:col-span-4">
            <p className="font-serif text-xl text-ink font-semibold">Materialitycheck</p>
            <p className="mt-1 marginalia">
              Klimatrapportering för bygg-underleverantörer. Sverige.
            </p>
          </div>
          <div className="col-span-6 md:col-span-2">
            <p className="label mb-3">Produkt</p>
            <ul className="font-serif text-sm space-y-2 text-inkSoft">
              <li>
                <a href="#sa-funkar-det" className="hover:text-clay">Så funkar det</a>
              </li>
              <li>
                <a href="#problem" className="hover:text-clay">Problemet</a>
              </li>
              <li>
                <a href="#waitlist" className="hover:text-clay">Tidig tillgång</a>
              </li>
            </ul>
          </div>
          <div className="col-span-6 md:col-span-2">
            <p className="label mb-3">Källor</p>
            <ul className="font-serif text-sm space-y-2 text-inkSoft">
              <li>
                <a
                  href="https://www.boverket.se/sv/klimatdeklaration/klimatdatabas/om-klimatdatabas/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-clay"
                >
                  Boverkets klimatdatabas
                </a>
              </li>
              <li>
                <a
                  href="https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2021787-om-klimatdeklaration-for-byggnader_sfs-2021-787/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-clay"
                >
                  Lag 2021:787
                </a>
              </li>
              <li>
                <a
                  href="https://www.boverket.se/sv/byggande/hallbart-byggande-och-forvaltning/livscykelanalys/miljodata-och-lca-verktyg/standarder-for-lca/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-clay"
                >
                  EN 15978 / 15804
                </a>
              </li>
            </ul>
          </div>
          <div className="col-span-12 md:col-span-4 md:text-right">
            <p className="label mb-3">Kontakt</p>
            <a
              href="mailto:hej@materialitycheck.se"
              className="font-serif text-lg text-ink hover:text-clay"
            >
              hej@materialitycheck.se
            </a>
            <p className="mt-3 marginalia">
              Vi svarar inom en arbetsdag.
            </p>
          </div>
        </div>
        <div className="mt-10 pt-4 border-t border-ruleSoft flex items-baseline justify-between font-mono text-xs text-inkMuted">
          <span>© {new Date().getFullYear()} Materialitycheck AB</span>
          <span className="italic font-serif">satt i Source Serif &amp; IBM Plex</span>
        </div>
      </div>
    </footer>
  );
}
