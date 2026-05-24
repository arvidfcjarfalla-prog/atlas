import { WaitlistForm } from "./waitlist-form";

export function ClosingCTA() {
  return (
    <section
      id="waitlist"
      className="relative border-b border-ink bg-ink text-paper"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-12 gap-x-6 md:gap-x-10 gap-y-10">
          <header className="col-span-12 md:col-span-5">
            <p className="font-mono text-sm text-clay">§ 03</p>
            <h2 className="mt-4 font-serif text-display-lg font-semibold leading-[0.96]">
              Var med
              <br />
              <span className="italic font-normal text-clay">från första</span>
              <br />
              kohorten.
            </h2>
            <p className="mt-8 max-w-prose font-serif text-xl text-paper/85 leading-snug">
              Hösten 2026 öppnar Materialitycheck för betalda pilotprojekt med ett dussin
              underleverantörer. Anmäl intresse nu så ringer vi för en kort behovsbild.
            </p>
            <p className="mt-6 marginalia text-paper/60">
              Ingen säljare. En av oss på telefon, max 15 minuter.
            </p>
          </header>

          <div className="col-span-12 md:col-span-7 md:pl-10 md:border-l md:border-paper/20">
            {/* WaitlistForm uses ink-on-paper styles by default;
                wrap in a paper card so the form stays legible on dark bg. */}
            <div className="bg-paper text-ink p-8 md:p-10 -mt-2">
              <p className="label mb-6">Tidig tillgång — kostnadsfritt</p>
              <WaitlistForm />
              <p className="mt-6 marginalia">
                Vi mejlar dig när nästa kohort öppnar. Ingen spam. Avregistrering med ett
                klick.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
