/**
 * GURPS Ultra-Tech's firearm accessories (pp. 149-152), as pure rules: what
 * a scope, a HUD link, targeting software, a harness, a grip or a gravitic
 * compensator is worth to a shot, and what each adds to a weapon's price and
 * weight.
 *
 * The scope after aiming, the targeting program and the ST penalty a new ST
 * requirement leaves are the shared accessory rules, which High-Tech reads too.
 */

export { minStPenaltyAfter, scopeAfterAiming, targetingProgramBonus } from "../../../shared/accessories/rules.js";

export type ScopeKind = "cts" | "ets";
export type HarnessKind = "gyrostabilized" | "articulated" | "servomount";
export type AccessControl = "ring" | "grip" | "both";
export type TripodKind = "tripod" | "powered";

export const SCOPE_KINDS: readonly ScopeKind[] = ["cts", "ets"];
export const HARNESS_KINDS: readonly HarnessKind[] = ["gyrostabilized", "articulated", "servomount"];
export const ACCESS_CONTROLS: readonly AccessControl[] = ["ring", "grip", "both"];
export const TRIPOD_KINDS: readonly TripodKind[] = ["tripod", "powered"];

/** A targeting scope's price, weight and cell (p. 149). */
export const SCOPES = Object.freeze({
  cts: { cost: 1000, weight: 0.5, power: "A/100 hr." },
  ets: { cost: 8000, weight: 2, power: "B/400 hr." },
});

/** A scope's bonus to aimed shots: +2 (CTS) or +3 (ETS) at TL9-10, one more at TL11 and again at TL12 (p. 149). */
export function scopeBonus(kind: ScopeKind, tl: number): number {
  const base = kind === "cts" ? 2 : 3;
  return base + (tl >= 12 ? 2 : tl >= 11 ? 1 : 0);
}

/** A scope's magnification: the CTS 4x, the ETS 8x at TL9-10, doubling at TL11 and TL12 (p. 149). */
export function scopeMagnification(kind: ScopeKind, tl: number): number {
  const base = kind === "cts" ? 4 : 8;
  return base * (tl >= 12 ? 4 : tl >= 11 ? 2 : 1);
}

/** What a scope sees as a passive sensor: a TL9 CTS infravision, every other hyperspectral (p. 149). */
export function scopeVision(kind: ScopeKind, tl: number): "infravision" | "hyperspectral" {
  return kind === "cts" && tl <= 9 ? "infravision" : "hyperspectral";
}

/** A HUD link: +1 Acc within 300 yards, not with another targeting system's Acc bonus (p. 149). */
export const HUD_LINK = Object.freeze({ accuracy: 1, yards: 300 });

/** The HUD link's Acc bonus at a range, beside whatever a scope already gives. */
export function hudLinkBonus(yards: number | null, otherTargeting: number): number {
  if (otherTargeting > 0) return 0;
  if (yards !== null && yards > HUD_LINK.yards) return 0;
  return HUD_LINK.accuracy;
}

/** Every TL9+ firearm has a laser sight, a HUD link, a grip or ring and a diagnostic computer for free (p. 149). */
export function hasSmartgunElectronics(tl: number, firearm: boolean): boolean {
  return firearm && tl >= 9;
}

/** TacNet: +1 Tactics at Complexity 5, +2 at 6, with everyone in communication (p. 149). */
export function tacNetBonus(complexity: number): number {
  return complexity >= 6 ? 2 : complexity >= 5 ? 1 : 0;
}

/**
 * Target tracking follows 10 targets at Complexity 2, one more Complexity
 * and double the price for each tenfold increase (p. 150).
 */
export function targetTracking(targets: number): { complexity: number; costMultiplier: number } {
  const steps = Math.max(0, Math.ceil(Math.log10(Math.max(10, targets) / 10) - 1e-9));
  return { complexity: 2 + steps, costMultiplier: 5 * 2 ** steps };
}

/** Software prices as a multiple of the table's (pp. 149-150). */
export const PROGRAM_COST = Object.freeze({ silhouette: 2, tacNet: 10, targeting: 5, targetTracking: 5 });

/**
 * A mounted weapon slaved to a targeting program and a tactical active sensor
 * locked on: every scope, computer and sensor bonus is replaced by one equal
 * to the weapon's Acc (p. 150).
 */
export function activeSensorTargeting(accuracy: number): number {
  return Math.max(0, accuracy);
}

/** Accessory rails: $100 and 0.2 lbs. each, up to four (p. 150). */
export const RAIL = Object.freeze({ cost: 100, weight: 0.2, most: 4 });

/**
 * A harness's price and weight for a weapon's loaded weight (pp. 150-152):
 * gyrostabilized $1,000 plus $200 and 1 lb. a pound, articulated $50 and
 * 0.5 lbs. a pound, and a shoulder servomount $5,000 plus $1,000 and 3 lbs.
 */
export function harnessPrice(kind: HarnessKind, loadedWeight: number): { cost: number; weight: number; lc: number } {
  const w = Math.max(0, loadedWeight);
  if (kind === "gyrostabilized") return { cost: 1000 + 200 * w, weight: w, lc: 4 };
  if (kind === "articulated") return { cost: 50 * w, weight: 0.5 * w, lc: 4 };
  return { cost: 5000 + 1000 * w, weight: 3 * w, lc: 3 };
}

/** An articulated harness works as a bipod on your feet: ST to two-thirds, braced (p. 151). */
export function articulatedMinSt(minSt: number | null): number | null {
  return minSt === null ? null : Math.ceil((minSt * 2) / 3);
}

/** An articulated harness is generally for Bulk -4 or worse (p. 151). */
export function articulatedFits(bulk: number): boolean {
  return bulk <= -4;
}

/** A servomount weapon fired without a HUD: -2, and no Aim (p. 151). */
export const SERVOMOUNT_NO_HUD = -2;

/** Access control: $100 for a ring or grip, -2 to bypass, 10 seconds then 10 minutes a try (p. 150). */
export const ACCESS = Object.freeze({ cost: 100, bypass: -2, firstSeconds: 10, laterMinutes: 10, lc: 4 });

/** The price of access control on a weapon, whose smartgun electronics include one of the two (p. 149). */
export function accessControlCost(kind: AccessControl | "", smartgun: boolean): number {
  if (!kind) return 0;
  const bought = kind === "both" ? 2 : 1;
  return ACCESS.cost * Math.max(0, bought - (smartgun ? 1 : 0));
}

/**
 * Self-destruct anti-theft (p. 150): 10 seconds for the code, then 6dx4
 * explosion; circumventing it is Electronics Operation (Security)-3, half an
 * hour a try, a failure starting the countdown and a critical failure setting
 * it off.
 */
export const SELF_DESTRUCT = Object.freeze({ cost: 100, lc: 3, seconds: 10, damage: "6dx4", circumvent: -3, attemptMinutes: 30 });

export type CircumventOutcome = "disabled" | "countdown" | "explodes";

export function circumventSelfDestruct(success: boolean, critical: boolean): CircumventOutcome {
  if (success) return "disabled";
  return critical ? "explodes" : "countdown";
}

/** A diagnostic computer: +1 to fix damage or malfunctions (p. 151). */
export const DIAGNOSTIC_COMPUTER = 1;

/** A D-tag: $20; Electronics Operation (Security) to find, and again at -2 to kill it quietly (p. 151). */
export const D_TAG = Object.freeze({ cost: 20, deactivate: -2, lc: 4 });

/** An IFF interrogator reaches 500 yards at TL9, doubling each TL (p. 151). */
export function iffRange(tl: number): number {
  return 500 * 2 ** Math.max(0, tl - 9);
}
export const IFF_COST = 100;

/** A power holster adds +TL/2 to Fast-Draw (Knife, Pistol or Ammo) (p. 151). */
export function powerHolsterBonus(tl: number): number {
  return Math.floor(tl / 2);
}
export const POWER_HOLSTER_SKILLS = ["Fast-Draw (Knife)", "Fast-Draw (Pistol)", "Fast-Draw (Ammo)"] as const;

/** A sniper mirror: -4, at the range to the mirror plus the mirror to the target (p. 151). */
export const SNIPER_MIRROR = -4;
export function sniperMirrorRange(toMirror: number, mirrorToTarget: number): number {
  return Math.max(0, toMirror) + Math.max(0, mirrorToTarget);
}

/** A tripod ignores the weapon's ST, for weapons up to ST 25, three Readies on or off (p. 151). */
export const TRIPODS = Object.freeze({
  tripod: { cost: 1250, weight: 25, maxSt: 25, readies: 3, lc: 4 },
  powered: { cost: 5000, weight: 50, maxSt: 25, readies: 3, lc: 4 },
});

/** A smartgrip: ST requirement -1 for $500 (p. 152). */
export const SMARTGRIP = Object.freeze({ cost: 500, st: -1, lc: 4 });

/**
 * A gravitic compensator: Recoil 1 and ST 0, for $100, 1 lb. and a B cell
 * lasting 10 hours per 10 pounds of loaded weight or fraction (p. 152).
 */
export function graviticCompensator(loadedWeight: number): { cost: number; weight: number; cells: number } {
  const tens = Math.max(1, Math.ceil(Math.max(0, loadedWeight) / 10));
  return { cost: 100 * tens, weight: tens, cells: tens };
}

/** The Armoury specialization a weapon's skill is repaired with. */
export function armourySkillFor(weaponSkill: string): string {
  return /^(gunner|artillery)\b/i.test(weaponSkill.trim()) ? "Armoury (Heavy Weapons)" : "Armoury (Small Arms)";
}
