/**
 * Ultra-Tech's beam weapon options and heat (pp. 132-133): field-jacketing,
 * gravitic focus and FTL beams; overheating from sustained fire, and hotshots.
 */

import type { BeamFamily } from "./rules.js";

/** How a beam weapon was built. */
export interface BeamOptions {
  /** Field-jacketed, at no cost or at twice the cost, as the GM rules (p. 133). */
  fieldJacket: "" | "free" | "doubled";
  /** An FTL beam (p. 133). */
  ftl: boolean;
  /** Levels of gravitic focus, and whether they're turned on (p. 133). */
  gravFocus: number;
  gravFocusOn: boolean;
}

export const NO_BEAM_OPTIONS: BeamOptions = Object.freeze({ fieldJacket: "", ftl: false, gravFocus: 0, gravFocusOn: true });

/** "Grav-focusing is available for any type of laser, for microwave beams, and for any type of particle beam" (p. 133). */
export const GRAV_FOCUSABLE: ReadonlySet<BeamFamily> = new Set([
  "laser", "blueGreen", "ultraviolet", "dazzler", "rainbow", "xray", "graser", "electrolaser",
  "mad", "microwave", "blaster", "omniBlaster", "pulsar",
]);

/** "Up to (TL-9) levels of grav focus are possible" (p. 133). */
export function maxGravFocus(tl: number | null): number {
  return tl === null ? 0 : Math.max(0, Math.floor(tl) - 9);
}

/** What the options multiply the price by: field-jacketing at twice, and twice again for each level of focus (p. 133). */
export function beamOptionFactor(options: BeamOptions): number {
  return (options.fieldJacket === "doubled" ? 2 : 1) * 2 ** Math.max(0, Math.floor(options.gravFocus));
}

/** Whether a beam ignores the environment's limits: field-jacketed or FTL (p. 133). */
export function ignoresEnvironment(options: BeamOptions): boolean {
  return options.fieldJacket !== "" || options.ftl;
}

/**
 * Damage halved, as the book halves a beam's dice: half a die left over is +2
 * (p. 115). A multiplied formula halves its multiplier where it can.
 */
export function halveDamage(formula: string): string {
  const text = String(formula ?? "").trim();
  const multiplied = /^(\d+)d\s*[x×]\s*(\d+)$/i.exec(text);
  if (multiplied) {
    const dice = Number(multiplied[1]);
    const times = Number(multiplied[2]);
    if (times % 2 === 0) return times / 2 === 1 ? `${dice}d` : `${dice}d×${times / 2}`;
    return halveDamage(`${dice * times}d`);
  }
  const m = /^(\d+)d(?:\s*([+-])\s*(\d+))?$/i.exec(text);
  if (!m) return text;
  const dice = Number(m[1]);
  const adds = (m[2] === "-" ? -1 : 1) * Number(m[3] ?? 0);
  const halfDice = Math.floor(dice / 2);
  const totalAdds = Math.trunc(adds / 2) + (dice % 2 ? 2 : 0);
  // Less than a die left: a die less 4 is as near a half-die-plus-adds as dice come.
  if (halfDice === 0) return `1d${totalAdds - 4 > 0 ? `+${totalAdds - 4}` : totalAdds - 4 < 0 ? `${totalAdds - 4}` : ""}`;
  return `${halfDice}d${totalAdds > 0 ? `+${totalAdds}` : totalAdds < 0 ? `${totalAdds}` : ""}`;
}

/** A row under gravitic focus: damage halved and range ×10, level by level (p. 133). */
export function gravFocused(row: { damage: string; halfDamageRange: number; maxRange: number }, levels: number): { damage: string; halfDamageRange: number; maxRange: number } {
  let next = { ...row };
  for (let i = 0; i < Math.max(0, Math.floor(levels)); i += 1) {
    next = { damage: halveDamage(next.damage), halfDamageRange: next.halfDamageRange * 10, maxRange: next.maxRange * 10 };
  }
  return next;
}

/** A Gatling doesn't overheat, and can't fire hotshots (p. 133). */
export function isGatling(name: string): boolean {
  return /\bgatling\b/i.test(String(name ?? ""));
}

/** "Firing more than (RoF × 10) shots will overheat the weapon" (p. 133). */
export function heatLimit(rateOfFire: number): number {
  return Math.max(1, Math.floor(Number(rateOfFire) || 1)) * 10;
}

/** A weapon's heat: shots fired since it last cooled, and when it last fired. */
export interface Heat {
  shots: number;
  lastShot: number | null;
}

/** A pause this long between attacks keeps a beam from building heat, and a minute cools it (p. 133). */
export const PAUSE_SECONDS = 10;
export const COOL_SECONDS = 60;

/** Whether the weapon is overheated now. */
export function isOverheated(heat: Heat, limit: number, now: number): boolean {
  if (heat.lastShot !== null && now - heat.lastShot >= COOL_SECONDS) return false;
  return heat.shots > limit;
}

/**
 * The heat after firing some shots: a minute without firing cools it; short
 * of overheating, a pause of 10 seconds since the last attack starts the count
 * again; otherwise the shots add up.
 */
export function afterFiring(heat: Heat, shots: number, limit: number, now: number): Heat {
  const gap = heat.lastShot === null ? Number.POSITIVE_INFINITY : now - heat.lastShot;
  let count = heat.shots;
  if (gap >= COOL_SECONDS) count = 0;
  else if (count <= limit && gap >= PAUSE_SECONDS) count = 0;
  return { shots: count + Math.max(0, Math.floor(shots)), lastShot: now };
}

/** An overheated beam malfunctions on 14, a hotshot on 14, a hotshot while overheated on 12 (p. 133). */
export function heatMalfunction(overheated: boolean, hotshot: boolean): number | null {
  if (overheated && hotshot) return 12;
  if (overheated || hotshot) return 14;
  return null;
}

/** The dice a formula rolls, for a hotshot's +1 per die: "6d×5" is thirty (p. 133). */
export function diceIn(formula: string): number {
  const m = /^(\d+)d(?:\s*[x×]\s*(\d+))?/i.exec(String(formula ?? "").trim());
  return m ? Number(m[1]) * Number(m[2] ?? 1) : 0;
}

/** A hotshot's affliction penalty: the HT or Will penalty times 1.3, the extra part of it (p. 133). */
export function hotshotResistPenalty(modifier: number): number {
  const base = Math.min(0, Math.floor(Number(modifier) || 0));
  return Math.round(base * 1.3) - base;
}
