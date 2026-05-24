import { Masthead } from "@/components/masthead";
import { Hero } from "@/components/hero";
import { ProblemSolution } from "@/components/problem-solution";
import { HowItWorks } from "@/components/how-it-works";
import { ClosingCTA } from "@/components/closing-cta";
import { Colophon } from "@/components/colophon";

export default function Page() {
  return (
    <main className="relative z-10">
      <Masthead />
      <Hero />
      <ProblemSolution />
      <HowItWorks />
      <ClosingCTA />
      <Colophon />
    </main>
  );
}
