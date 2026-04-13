export type Stage =
  | "clarifying"
  | "confirming"
  | "generating"
  | "fetching"
  | "ready"
  | "saving"
  | "error"
  | "needs_input";

export const STAGE_LABELS: Record<Stage, string> = {
  clarifying: "Söker data\u2026",
  confirming: "Bekräfta inställningar",
  generating: "Genererar karta\u2026",
  fetching: "Hämtar geodata\u2026",
  ready: "Klar!",
  saving: "Sparar\u2026",
  error: "Något gick fel",
  needs_input: "Behöver mer information",
};

export const MAX_AUTO_ANSWER_ROUNDS = 3;

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}
