export type ScoreTone = "under" | "even" | "over";

/** "-2", "E", "+3", "—". Use everywhere a relative-to-par score is rendered. */
export function formatToPar(toPar: number | null | undefined): string {
  if (toPar == null) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/**
 * Augusta-style colour tone for a relative-to-par score. Maps to the
 * `score-under` / `score-even` / `score-over` design tokens (§4).
 */
export function toParTone(toPar: number | null | undefined): ScoreTone {
  if (toPar == null || toPar === 0) return "even";
  return toPar < 0 ? "under" : "over";
}
