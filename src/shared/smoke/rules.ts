/**
 * Smoke, as two books print it: Ultra-Tech's screening, coloured, hot, prism
 * and electromagnetic smoke (p. 160) and High-Tech's smoke shells of the same
 * names at lower TLs (p. 171). Each book keeps its own table of what its
 * smoke does; this is how a cloud of it reads on the map, as the lines of a
 * modifier area (`../areas.ts`).
 */

import type { AreaLine } from "../areas.js";

/** What a kind of smoke does, as a book's table gives it. */
export interface SmokeFigures {
  /** The penalty to sight and visually aimed attacks in and through it. */
  vision: number;
  /** The other senses it penalises as much: infravision, hyperspectral vision, night vision. */
  senses: readonly string[];
  /** What it blocks outright: ladar, lasers, radar. */
  blocks: readonly string[];
}

/**
 * The lines a cloud of smoke puts on rolls in and through it: its penalty to
 * Vision and to attacks aimed by eye, and the same to infrared and
 * hyperspectral sensing where it is hot smoke.
 */
export function smokeAreaLines(smoke: SmokeFigures, labels: { vision: (value: number) => string; sensors: string }): AreaLine[] {
  const lines: AreaLine[] = [{ label: labels.vision(smoke.vision), value: smoke.vision, rolls: ["vision", "attack"], applies: "both" }];
  if (smoke.senses.length) lines.push({ label: labels.sensors, value: smoke.vision, rolls: ["infrared", "hyperspectral"], applies: "both" });
  return lines;
}

/** Smoke takes a second per 5 yards of radius to form (Ultra-Tech p. 160, High-Tech p. 171). */
export function smokeFormSeconds(radiusYards: number): number {
  return Math.max(1, Math.ceil(Math.max(0, radiusYards) / 5));
}
