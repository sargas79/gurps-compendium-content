/**
 * GURPS Ultra-Tech's melee weapons (pp. 162-166), as pure rules: blades of
 * superfine, monowire, hyperdense or nanothorn edge and vibroblades as
 * calculated fields that reprice a weapon and change its rows, rocket
 * strikers, monowire whips and switchblades, contact stunners and neurolashes,
 * force swords and limpet mines.
 */

export type Blade = "superfine" | "monowire" | "hyperdense" | "nanothorn";
export const BLADES: readonly Blade[] = ["superfine", "monowire", "hyperdense", "nanothorn"];

/** What a blade can be fitted to: the damage types a weapon's modes do. */
export interface BladeWeapon {
  blade: Blade | "";
  vibro: boolean;
  damageTypes: readonly string[];
  /** A monowire whip or switchblade, which a nanothorn edge upgrades cheaply (p. 164). */
  monowireWeapon: boolean;
}

export type BladeProblem = "notEdged" | "notCutting" | "vibroMonowire" | "vibroNanothorn";

const edged = (w: BladeWeapon) => w.damageTypes.some((t) => t === "cut" || t === "imp");
const cutting = (w: BladeWeapon) => w.damageTypes.includes("cut");

/**
 * What the book forbids (pp. 163-164): superfine, hyperdense and vibro edges
 * need a cutting or impaling weapon, monowire and nanothorn a cutting one;
 * a vibroblade can't be monowire or nanothorn. Blades are one choice, so
 * two edges can't be taken together.
 */
export function bladeProblems(weapon: BladeWeapon): BladeProblem[] {
  const out: BladeProblem[] = [];
  if ((weapon.blade === "superfine" || weapon.blade === "hyperdense" || weapon.vibro) && !edged(weapon)) out.push("notEdged");
  if ((weapon.blade === "monowire" || weapon.blade === "nanothorn") && !cutting(weapon)) out.push("notCutting");
  if (weapon.vibro && weapon.blade === "monowire") out.push("vibroMonowire");
  if (weapon.vibro && weapon.blade === "nanothorn") out.push("vibroNanothorn");
  return out;
}

/** A weapon's price with its blade (pp. 163-164). */
export function bladePrice(weapon: BladeWeapon, list: { cost: number; weight: number }): { cost: number; weight: number } {
  const cost = Math.max(0, list.cost);
  const weight = Math.max(0, list.weight);
  let factor = 1;
  if (weapon.blade === "superfine") factor = weapon.vibro ? 30 : 6;
  else if (weapon.vibro) factor = 10;
  if (weapon.blade === "monowire") factor *= 10;
  if (weapon.blade === "nanothorn") factor *= weapon.monowireWeapon ? 4 : 20;
  let priced = cost * factor;
  // Hyperdense: $500 a pound of the original weapon, or 10 times, whichever is more.
  if (weapon.blade === "hyperdense") priced = Math.max(500 * weight, 10 * cost) * (weapon.vibro ? 10 : 1);
  return { cost: Math.round(priced * 100) / 100, weight: Math.round(weight * (weapon.blade === "hyperdense" ? 1.5 : 1) * 1000) / 1000 };
}

/** A hyperdense blade's ST requirement: 1.5 times, rounded up (p. 164). */
export function bladeMinSt(minSt: number | null, blade: Blade | ""): number | null {
  if (minSt === null || blade !== "hyperdense") return minSt;
  return Math.ceil(minSt * 1.5);
}

/** What a blade and a running vibro edge do to one of the weapon's blows. */
export interface BladeBlow {
  damageType: string;
  armorDivisor: number;
  dice: number;
  adds: number;
}

/**
 * A blow with the weapon's blade (pp. 163-164): superfine +2 and (2),
 * monowire +2 cutting and (10), hyperdense +2 and (5), nanothorn corrosion
 * at (10); a running vibroblade +1d cutting (+1 at TL11, +2 at TL12) and (3),
 * (5) if superfine or (10) if hyperdense.
 */
export function bladeBlow(blow: { damageType: string; armorDivisor: number }, blade: Blade | "", vibroOn: boolean, tl: number): BladeBlow {
  const out: BladeBlow = { damageType: blow.damageType, armorDivisor: Math.max(0, blow.armorDivisor || 1), dice: 0, adds: 0 };
  const cut = blow.damageType === "cut";
  const edge = cut || blow.damageType === "imp";
  if (!edge) return out;
  const divisor = (value: number) => {
    out.armorDivisor = Math.max(out.armorDivisor, value);
  };
  if (blade === "superfine") {
    out.adds += 2;
    divisor(2);
  } else if (blade === "hyperdense") {
    out.adds += 2;
    divisor(5);
  } else if (blade === "monowire" && cut) {
    out.adds += 2;
    divisor(10);
  } else if (blade === "nanothorn" && cut) {
    out.damageType = "cor";
    divisor(10);
  }
  if (vibroOn && blade !== "monowire" && blade !== "nanothorn") {
    if (cut) {
      out.dice += 1;
      out.adds += tl >= 12 ? 2 : tl >= 11 ? 1 : 0;
    }
    divisor(blade === "hyperdense" ? 10 : blade === "superfine" ? 5 : 3);
  }
  return out;
}

/** A vibroblade runs for 300 seconds divided by its weight on a C cell (p. 164). */
export function vibroSeconds(weight: number): number {
  return weight > 0 ? Math.round(300 / weight) : 0;
}

/** A rocket striker: +$500 and 1 lb., +6 Striking ST, +3 to the ST requirement (p. 163). */
export const ROCKET_STRIKER = Object.freeze({ cost: 500, weight: 1, strikingSt: 6, minSt: 3, lc: 3 });

/** Six boosted attacks at TL9, doubled for each TL after (p. 163). */
export function rocketStrikerUses(tl: number): number {
  return 6 * 2 ** Math.max(0, Math.floor(tl) - 9);
}

/** The weapons a rocket striker fits: great axes, picks, scythes, spears and warhammers (p. 163). */
export function rocketStrikerFits(skills: readonly string[]): boolean {
  return skills.some((s) => /\b(axe\/mace|two-handed axe\/mace|spear|polearm)\b/i.test(s));
}

/** How much a blow's dice change when Striking ST changes: the difference between two basic damages. */
export function damageDelta(before: { dice: number; adds: number }, after: { dice: number; adds: number }): { dice: number; adds: number } {
  return { dice: after.dice - before.dice, adds: after.adds - before.adds };
}

/** The farthest reach a reach column allows: "C-5" is 5, "1-7*" is 7, "C" is 0. */
export function longestReach(reach: string): number {
  const numbers = String(reach ?? "").match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : 0;
}

/** The nearest reach a reach column allows: "C-5" is 0, "1-7*" is 1. */
export function shortestReach(reach: string): number {
  const text = String(reach ?? "").trim();
  if (/^c/i.test(text)) return 0;
  const first = /\d+/.exec(text);
  return first ? Number(first[0]) : 0;
}

/** A reach within a weapon's column. */
export function clampReach(reach: number, column: string): number {
  return Math.max(shortestReach(column), Math.min(longestReach(column), Math.floor(Number(reach) || 0)));
}

/** A reach as the Combat tab shows it: 0 is "C". */
export function reachText(reach: number, whip: boolean): string {
  return reach <= 0 ? "C" : whip ? `${reach}*` : String(reach);
}

/** A monowire whip pulled taut round what it snared: thrust+1d(10) cutting every turn (p. 163). */
export const SNARE = Object.freeze({ extraDice: 1, armorDivisor: 10 });

/** Electric stun wands and zap gloves (p. 165). */
export const STUNNER = Object.freeze({
  /** HT-5 to recover each second; DR doesn't help. */
  recovery: -5,
  /** Nonmetallic armour adds +2 per point of DR to the roll to resist. */
  drBonus: 2,
});

/** The resistance bonus nonmetallic armour gives against a stunner's contact (p. 165). */
export function stunnerDrBonus(dr: number): number {
  return STUNNER.drBonus * Math.max(0, Math.floor(Number(dr) || 0));
}

export type Charged = "stunWand" | "zapGlove" | "neurolash" | "neuroglove" | "sonicShuriken";

/** Strikes on a cell: a stun wand's, neurolash's or neuroglove's 20, a zap glove's 10, a sonic shuriken's 1 (pp. 165-166). */
export const CHARGES: Readonly<Record<Charged, number>> = Object.freeze({ stunWand: 20, zapGlove: 10, neurolash: 20, neuroglove: 20, sonicShuriken: 1 });

/** What one strike spends: a zap glove on "kill" counts as two (p. 165). */
export function chargesPerStrike(kind: Charged, kill: boolean): number {
  return kind === "zapGlove" && kill ? 2 : 1;
}

/** Which charged weapon a record is, by name. */
export function chargedByName(name: string): Charged | null {
  const text = String(name ?? "");
  if (/stun wand|shock club|stun stick/i.test(text)) return "stunWand";
  if (/zap glove/i.test(text)) return "zapGlove";
  if (/neuroglove/i.test(text)) return "neuroglove";
  if (/neurolash/i.test(text)) return "neurolash";
  if (/sonic shuriken/i.test(text)) return "sonicShuriken";
  return null;
}

/** A neurolash added to a melee weapon: +$500, 0.5 lbs., a B cell for 20 strikes (p. 165). */
export const NEUROLASH = Object.freeze({ cost: 500, weight: 0.5, lc: 3, highPowerLc: 2, tunableTl: 11 });

/** A tunable neurolash: +50% for each setting after the first (p. 165). */
export function neurolashFactor(settings: number): number {
  return 1 + 0.5 * Math.max(0, Math.floor(settings) - 1);
}

/** Only a high-power neurolash delivers a death beam's contact (p. 165). */
export function neurolashSettingAllowed(setting: string, highPower: boolean): boolean {
  return setting !== "deathBeam" || highPower;
}

/** A zap glove protects its hand with DR 5, and adds $400 and a pound to armour it's built into (p. 165). */
export const ZAP_GLOVE = Object.freeze({ dr: 5, armorCost: 400, armorWeight: 1 });

/** A neuroglove: DR 2, and a 1 in 6 chance that damage through it wrecks the weapon (p. 165). */
export const NEUROGLOVE = Object.freeze({ dr: 2, wreckedOn: 1 });

/** A sonic shuriken's drug sprayer: +$50, two doses, a follow-up once it penetrates (p. 166). */
export const SHURIKEN_SPRAYER = Object.freeze({ cost: 50, doses: 2 });

/** Limpet mines (p. 163): 0-100 seconds, ten to a magazine. */
export const LIMPET = Object.freeze({ longestDelay: 100, magazine: 10, fleshDamage: 1 });

/** Pulling a limpet mine off: a Ready and a ST roll, less a tenth of the DR it's stuck to or 20, whichever is less (p. 163). */
export function limpetRemovalPenalty(dr: number): number {
  const penalty = Math.min(Math.floor(Math.max(0, Number(dr) || 0) / 10), 20);
  return penalty ? -penalty : 0;
}

export type ForceWeapon = "forceBlade" | "forceGlaive" | "forceSword" | "forceWhip" | "stasisSwitchblade";

/** Which force weapon a record is, by name. */
export function forceWeaponByName(name: string): ForceWeapon | null {
  const text = String(name ?? "").trim();
  if (/^force blade$/i.test(text)) return "forceBlade";
  if (/^force glaive$/i.test(text)) return "forceGlaive";
  if (/^(variable )?force sword$/i.test(text)) return "forceSword";
  if (/^force whip$/i.test(text)) return "forceWhip";
  if (/^stasis switchblade$/i.test(text)) return "stasisSwitchblade";
  return null;
}

/** A force sword's variable length: +$500, reach C to 2 (p. 166). */
export const VARIABLE_FORCE_SWORD = Object.freeze({ cost: 500, reach: "C-2" });

/** A force blade takes a second to form (p. 166). */
export const FORCE_FORM_SECONDS = 1;

/**
 * Whether a force blade harms what it meets (p. 166): the weapon or limb it
 * parries, and one that parries or blocks it unless the defense was a
 * critical success. Only another force blade or a sonic blade is unharmed.
 */
export function forceBladeHarms(options: { otherIsForceOrSonic: boolean; criticalDefense: boolean; parriedByTheForceBlade: boolean }): boolean {
  if (options.otherIsForceOrSonic) return false;
  return options.parriedByTheForceBlade || !options.criticalDefense;
}

/** Whether a vibroblade's cell is spent: its running seconds used against 300 / weight (p. 164). */
export function vibroDrained(secondsUsed: number, weight: number): boolean {
  const total = vibroSeconds(weight);
  return total > 0 && secondsUsed >= total;
}

/** A neuroglove is wrecked on a 1 on 1d when damage to the hand gets through its DR (p. 165). */
export function neurogloveWrecked(roll: number): boolean {
  return Math.floor(Number(roll) || 0) <= NEUROGLOVE.wreckedOn;
}

/** A neurolash added to a weapon: an HT-5 (2) affliction with the blow (p. 165). */
export const ADDED_NEUROLASH = Object.freeze({ attribute: "HT", modifier: -5, armorDivisor: 2 });
