/**
 * Who acts first (GURPS Martial Arts pp. 103, 108, 110): Who Draws First?,
 * Stop Hits, Cascading Waits, and A Matter of Inches. The pure rules.
 *
 * Which standoff it is and who wins its tie are High-Tech's too, so they live
 * in the shared standoff engine (`src/shared/standoff/`); this keeps Martial
 * Arts' own modifiers for it.
 */

import type { ModifierKey } from "../../../shared/standoff/rules.js";

export { drawCase, drawWinner, type DrawCase, type Drawer, type ModifierKey } from "../../../shared/standoff/rules.js";

// ── A Matter of Inches (p. 110) ──

export type WeaponLength = "extremelyLong" | "veryLong" | "long" | "medium" | "short" | "veryShort";
/** Longest first. */
export const WEAPON_LENGTHS: readonly WeaponLength[] = ["extremelyLong", "veryLong", "long", "medium", "short", "veryShort"];

/** The weapons the length scale lists. "(any)" takes every weapon of that name. */
const LENGTH_NAMES: Record<WeaponLength, readonly string[]> = {
  extremelyLong: ["bill", "dueling polearm (any)", "eku", "glaive", "halberd", "heavy spear", "horse-cutter (any)", "long spear", "long staff", "naginata", "pollaxe", "quarterstaff", "rope dart", "spear", "trident"],
  veryLong: ["chain whip", "flail", "great axe", "greatsword", "javelin", "kusari", "kusarigama", "kusarijutte", "lajatang", "maul", "monk's spade", "scythe", "short spear", "sodegarami", "tetsubo", "three-part staff", "urumi", "warhammer", "whip"],
  long: ["bastard sword", "estoc", "gada", "katana", "longsword", "rapier (any)"],
  medium: ["axe", "backsword", "bokken", "broadsword", "cavalry saber", "dao", "jian", "jo", "large falchion", "late katana", "light club", "mace", "mensurschläger", "morningstar", "pick"],
  short: ["baton", "bola perdida", "bolas", "cutlass", "dusack", "falchion", "hatchet", "hook sword", "jutte", "kick", "knobbed club", "kukri", "life-preserver", "long knife", "nunchaku", "qian kun ri yue dao", "saber", "sai", "shortsword", "sickle", "small axe", "small falchion", "small mace", "smallsword (any)", "tonfa", "weighted scarf"],
  veryShort: ["balisong", "bite", "dagger (any)", "deer antlers", "elbow", "katar (any)", "knee", "knife", "knife-wheel", "main-gauche", "punch", "shield bash", "short baton", "slashing wheel", "stiletto", "straight razor"],
};

/** A weapon's place on the length scale: what's stored on it, else what its name says, else null. */
export function lengthOf(name: string, stored?: string | null): WeaponLength | null {
  if (WEAPON_LENGTHS.includes(stored as WeaponLength)) return stored as WeaponLength;
  const plain = String(name ?? "").toLowerCase().replace(/\s*\(.*$/, "").replace(/[’]/g, "'").trim();
  if (!plain) return null;
  for (const length of WEAPON_LENGTHS) {
    for (const entry of LENGTH_NAMES[length]) {
      const any = entry.endsWith(" (any)");
      const base = any ? entry.slice(0, -" (any)".length) : entry;
      if (plain === base || (any && plain.startsWith(`${base} `))) return length;
    }
  }
  return null;
}

/** Relative weapon weight: how heavy the weapon feels. Bare hands get +0 for feints and parries. */
export function relativeWeight(options: { st: number; weaponSt: number | null; bareHands: boolean; unbalanced: boolean; feintOrParry?: boolean }): number {
  if (options.bareHands) return options.feintOrParry ? 0 : 2;
  const st = Number(options.st) || 0;
  const needed = Number(options.weaponSt) || 0;
  let value = 0;
  if (needed > 0) {
    if (st < needed) value = st - needed;
    else if (st >= 3 * needed) value = 3;
    else if (st >= 2 * needed) value = 2;
    else if (st >= 1.5 * needed) value = 1;
  }
  return value + (options.unbalanced ? -1 : 0);
}

/** Absolute weapon weight: how heavy the weapon is, for Beats and parrying flails. */
export function absoluteWeight(options: { bareHands: boolean; weight: number; unbalanced: boolean }): number {
  if (options.bareHands) return 0;
  if (options.unbalanced) return 1;
  const weight = Number(options.weight) || 0;
  if (weight <= 1.5) return -2;
  if (weight < 3) return -1;
  return 0;
}

/** The longest Reach a Reach statistic gives: "C" is 0, "2,3*" is 3, "1-3*" is 3. */
export function longestReach(reach: string): number {
  const numbers = String(reach ?? "").match(/\d+/g)?.map(Number) ?? [];
  return numbers.length ? Math.max(...numbers) : 0;
}

/** What breaks a tie between two weapons already out. */
export interface TimedWeapon { reach: number; length: WeaponLength | null; swing: boolean; weight: number }

/**
 * Who goes first when the contest is tied (p. 110): the longer Reach, then the
 * longer weapon on the scale, then a thrust before a swing, then the lighter
 * weapon. Negative puts `a` first, positive `b`, and 0 is truly simultaneous.
 */
export function tieBreak(a: TimedWeapon, b: TimedWeapon): number {
  if (a.reach !== b.reach) return b.reach - a.reach;
  const rank = (w: TimedWeapon) => (w.length === null ? WEAPON_LENGTHS.length : WEAPON_LENGTHS.indexOf(w.length));
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.swing !== b.swing) return a.swing ? 1 : -1;
  if (a.weight !== b.weight) return a.weight - b.weight;
  return 0;
}

/**
 * The penalty for the parries already made with a weapon this turn (p. 110):
 * -4 each adjusted by relative weight (a bonus offsets it, never past zero),
 * the total halved against the defender for Trained by a Master or Weapon
 * Master, and no halving for a fencing weapon.
 */
export function multipleParryPenalty(previous: number, weight: number, trained: boolean): number {
  const count = Math.max(0, Math.floor(previous));
  if (!count) return 0;
  const total = count * Math.min(0, -4 + weight);
  return trained ? Math.floor(total / 2) || 0 : total;
}

// ── Who Draws First? (p. 103) ──

/** One side of a standoff, for its modifiers. */
export interface DrawSide {
  greased: boolean;
  handOnWeapon: boolean;
  swing: boolean;
  st: number;
  weapon: { reach: number; length: WeaponLength | null; weight: number; weaponSt: number | null; bareHands: boolean; unbalanced: boolean };
}

/**
 * A drawing fighter's special modifiers (p. 103): grease +1, a hand on the
 * weapon +4, -1 for the longer weapon and -1 for the heavier one unless he has
 * 1.5 times its ST. With A Matter of Inches (p. 110) a swing is -1, the scale
 * breaks a tie in Reach, and relative weight replaces the heavier weapon's -1.
 */
export function drawModifiers(self: DrawSide, foe: DrawSide, inches: boolean): ModifierKey[] {
  const lines: ModifierKey[] = [];
  if (self.greased) lines.push({ key: "greased", value: 1 });
  if (self.handOnWeapon) lines.push({ key: "handOnWeapon", value: 4 });
  const rank = (w: DrawSide["weapon"]) => (w.length === null ? WEAPON_LENGTHS.length : WEAPON_LENGTHS.indexOf(w.length));
  const longer = self.weapon.reach > foe.weapon.reach || (inches && self.weapon.reach === foe.weapon.reach && rank(self.weapon) < rank(foe.weapon));
  if (longer) lines.push({ key: "longer", value: -1 });
  if (inches) {
    const weight = relativeWeight({ st: self.st, weaponSt: self.weapon.weaponSt, bareHands: self.weapon.bareHands, unbalanced: self.weapon.unbalanced });
    if (weight) lines.push({ key: "weight", value: weight });
    if (self.swing) lines.push({ key: "swing", value: -1 });
  } else if (self.weapon.weight > foe.weapon.weight && !(Number(self.weapon.weaponSt) > 0 && self.st >= 1.5 * Number(self.weapon.weaponSt))) {
    lines.push({ key: "heavier", value: -1 });
  }
  return lines;
}

/** The ready fighter's modifiers against a Fast-Draw: only +1 for Combat Reflexes, and A Matter of Inches' lines. */
export function readyModifiers(self: DrawSide, combatReflexes: boolean, inches: boolean): ModifierKey[] {
  const lines: ModifierKey[] = combatReflexes ? [{ key: "combatReflexes", value: 1 }] : [];
  if (inches) {
    const weight = relativeWeight({ st: self.st, weaponSt: self.weapon.weaponSt, bareHands: self.weapon.bareHands, unbalanced: self.weapon.unbalanced });
    if (weight) lines.push({ key: "weight", value: weight });
    if (self.swing) lines.push({ key: "swing", value: -1 });
  }
  return lines;
}

// ── Stop Hits (p. 108) ──

export interface StopHitRoll {
  hit: boolean;
  margin: number;
  /** A Matter of Inches: a swing takes 1 off the margin, and relative weight adjusts it. */
  swing?: boolean;
  weight?: number;
  weapon?: TimedWeapon;
}

/** Which of two fighters trading a Stop Hit defends at the penalty. */
export function stopHitPenalized(a: StopHitRoll, b: StopHitRoll, inches: boolean): { a: boolean; b: boolean } {
  if (!a.hit && !b.hit) return { a: false, b: false };
  if (a.hit !== b.hit) return { a: b.hit, b: a.hit };
  const score = (r: StopHitRoll) => r.margin + (inches ? (r.swing ? -1 : 0) + (Number(r.weight) || 0) : 0);
  if (score(a) !== score(b)) return score(a) > score(b) ? { a: false, b: true } : { a: true, b: false };
  if (inches && a.weapon && b.weapon) {
    const order = tieBreak(a.weapon, b.weapon);
    if (order) return order < 0 ? { a: false, b: true } : { a: true, b: false };
  }
  return { a: true, b: true };
}

/** The penalty itself: -1, or -3 to parry with the weapon he attacked with. */
export function stopHitPenalty(parryingWithAttackingWeapon: boolean): number {
  return parryingWithAttackingWeapon ? -3 : -1;
}

// ── Cascading Waits (p. 108) ──

/** How far a waiting fighter must go: nowhere, a step, or yards. */
export type WaitDistance = "none" | "step" | number;

/** A waiting fighter's modifiers: Combat Reflexes, Basic Speed, distance, a late interrupt, and A Matter of Inches. */
export function waitModifiers(options: { combatReflexes: boolean; basicSpeed: number; distance: WaitDistance; late: boolean; swing?: boolean; weight?: number }, inches: boolean): ModifierKey[] {
  const lines: ModifierKey[] = [];
  if (options.combatReflexes) lines.push({ key: "combatReflexes", value: 1 });
  const speed = Math.floor(Number(options.basicSpeed) || 0);
  if (speed) lines.push({ key: "basicSpeed", value: speed });
  if (options.distance === "none") lines.push({ key: "stationary", value: 2 });
  else if (typeof options.distance === "number" && options.distance > 0) lines.push({ key: "distance", value: -Math.floor(options.distance) });
  if (options.late) lines.push({ key: "late", value: -2 });
  if (inches) {
    if (options.swing) lines.push({ key: "swing", value: -1 });
    if (options.weight) lines.push({ key: "weight", value: options.weight });
  }
  return lines;
}

export interface WaitResult { id: string; success: boolean; margin: number; ets: boolean; weapon?: TimedWeapon }

/**
 * The order the waiting fighters act in: those with Enhanced Time Sense first,
 * then successes by decreasing margin, then failures by increasing margin of
 * failure. Fighters still tied share a group; with A Matter of Inches their
 * weapons break the tie where they can.
 */
export function waitOrder(results: readonly WaitResult[], inches: boolean): string[][] {
  const score = (r: WaitResult) => (r.success ? r.margin : -r.margin - 1000);
  const compare = (a: WaitResult, b: WaitResult) => {
    if (a.ets !== b.ets) return a.ets ? -1 : 1;
    if (score(a) !== score(b)) return score(b) - score(a);
    return inches && a.weapon && b.weapon ? tieBreak(a.weapon, b.weapon) : 0;
  };
  const sorted = [...results].sort(compare);
  const groups: WaitResult[][] = [];
  for (const result of sorted) {
    const last = groups.at(-1);
    if (last && compare(last[0]!, result) === 0) last.push(result);
    else groups.push([result]);
  }
  return groups.map((group) => group.map((r) => r.id));
}
