import { WaitlistForm } from "./waitlist-form";

export function Hero() {
  return (
    <section className="relative border-b border-ink">
      <div className="mx-auto max-w-7xl px-6 pt-16 md:pt-24 pb-20 md:pb-28">
        <div className="grid grid-cols-12 gap-x-6 md:gap-x-10 gap-y-12">
          {/* Marginalia — kicker */}
          <aside className="col-span-12 md:col-span-3 md:pt-3 order-1">
            <p className="label mb-4">§ 00 — Kort</p>
            <p className="marginalia">
              Boverkets klimatdatabas, version <span className="font-mono">02.07.000</span>,
              listar drygt 200 generiska byggprodukter — alla med ett påslag på cirka{" "}
              <span className="font-mono">+25 %</span> över faktiskt medelvärde. Varje saknad
              EPD från en underleverantör betalar projektet med en extra portion
              koldioxid på papperet.
            </p>
          </aside>

          {/* Headline column */}
          <div className="col-span-12 md:col-span-9 order-2">
            <p className="label mb-6">Ett verktyg för bygg-underentreprenörer</p>
            <h1 className="font-serif text-display-xl text-ink font-semibold">
              Klimat&shy;rapportera{" "}
              <span className="italic font-normal text-clay">A1–A5</span>
              <br />
              utan Excel&shy;helvete.
            </h1>
            <p className="mt-10 max-w-prose font-serif text-xl md:text-2xl leading-snug text-inkSoft">
              Du levererar betong, gips, fönster eller installation. Generalentreprenören
              kräver in EPD:er, leveranssedlar och spillsiffror — igår.{" "}
              <span className="italic">Materialitycheck</span> tar in det du redan har, mappar
              det mot Boverkets klimatdatabas, och lämnar tillbaka en rapport totalentreprenören
              kan signera.
            </p>
          </div>

          {/* Lead-in rule + waitlist */}
          <div className="col-span-12 order-3 mt-4">
            <div className="rule-thin pt-8 grid grid-cols-12 gap-x-6 md:gap-x-10">
              <div className="col-span-12 md:col-span-3">
                <p className="label">Tidig tillgång</p>
              </div>
              <div className="col-span-12 md:col-span-6">
                <WaitlistForm />
              </div>
              <div className="col-span-12 md:col-span-3">
                <p className="marginalia">
                  Vi släpper i mindre kohorter under hösten. Materialleverantörer först,
                  installations&shy;entreprenörer sen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
