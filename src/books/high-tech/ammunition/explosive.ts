/**
 * High-Tech's explosive-energy and cargo projectiles (pp. 169-172): the rules
 * around a round's blast and its cargo, with no Foundry in them.
 *
 * The book gives no formula for an explosion's damage (p. 169): the blast is
 * the one the gun's record prints, and these rules add what the round does
 * around it (decision D5, #335). `projectiles.ts` changes the shot itself.
 *
 *   - **Explosive-energy projectiles (pp. 169-170).** Every one is an
 *     incendiary attack. Its blast is linked to the hit (LE, HE, EFP, HEAT,
 *     HEDP, HESH, MS-HEAT, thermobaric) or follows it through the armour
 *     (SAPLE, APEX, SAPHE, SAPHEC, APHEX), and the rounds made to burst behind
 *     armour burst inside; some have no fragments. Early SAPLE is a dud unless
 *     1d comes up TL-2 or less; HESH's blast spalls the inside of armour it
 *     can't get through; MS-HEAT's precursor defeats reactive armour; a
 *     thermobaric blast is divided by only twice the distance. An HE round
 *     with the airburst upgrade (p. 175) does only its fragments' damage.
 *   - **Cargo projectiles (pp. 171-172).** Illumination (the darkness penalty
 *     in its radius no worse than -3, a signal flare's -5); smoke of five kinds;
 *     tear gas, with or without a vomiting agent (HT-2 against coughing and
 *     blindness, or retching, while in the cloud and for minutes after, and -3
 *     a yard to Vision); liquid rounds (paint, scent markers); poison gas (a
 *     Basic Set poison over the burst radius); white phosphorus (burning
 *     fragments that go on burning, and smoke).
 */

import { parseDice } from "../../../shared/loads/dice.js";
import { marginOfFailure } from "../../../shared/margin.js";
import type { LoadRow } from "../../../shared/loads/rows.js";
import type { SmokeFigures } from "../../../shared/smoke/rules.js";
import type { CargoProjectile, ExplosiveProjectile } from "./projectiles.js";

// ── explosive-energy projectiles (pp. 169-170) ──

/** How an explosive round's blast meets its target. */
interface BlastFigures {
  /** The blast follows the hit through the armour, rather than being rolled against DR beside it. */
  followUp: boolean;
  /** It is meant to burst behind the armour: an internal explosion (Campaigns p. 415). */
  internal: boolean;
  /** It throws cutting fragments. */
  fragments: boolean;
}

export const BLASTS: Readonly<Record<ExplosiveProjectile, BlastFigures>> = Object.freeze({
  le: { followUp: false, internal: false, fragments: true },
  // SAPLE: "treat as an internal explosion"; APEX, SAPHEC and APHEX burst behind the armour (pp. 169-170).
  saple: { followUp: true, internal: true, fragments: true },
  apex: { followUp: true, internal: true, fragments: true },
  he: { followUp: false, internal: false, fragments: true },
  saphe: { followUp: true, internal: false, fragments: true },
  // Thinner walls: a larger charge but little fragmentation.
  saphec: { followUp: true, internal: true, fragments: false },
  aphex: { followUp: true, internal: true, fragments: true },
  efp: { followUp: false, internal: false, fragments: false },
  heat: { followUp: false, internal: false, fragments: false },
  hedp: { followUp: false, internal: false, fragments: true },
  hesh: { followUp: false, internal: false, fragments: false },
  msheat: { followUp: false, internal: false, fragments: false },
  thermobaric: { followUp: false, internal: false, fragments: false },
});

/** Shaped charges, whose own line is the jet and whose blast is linked to it. */
const JETS: ReadonlySet<string> = new Set(["heat", "hedp", "msheat"]);

/** A thermobaric blast is divided by twice the distance, not three times (p. 170; Campaigns p. 104). */
export const THERMOBARIC_DIVISOR_PER_YARD = 2;

/** Early SAPLE explodes only on TL-2 or less on 1d at TL5-6 (p. 169). */
export function sapleExplodes(tl: number, roll: number): boolean {
  if (tl >= 7) return true;
  return roll <= tl - 2;
}

/** Whether a SAPLE round of this TL may be a dud: TL5-6 (p. 169). */
export const sapleMayDud = (tl: number): boolean => tl <= 6;

/**
 * HESH's spall (p. 170): where neither the hit nor the blast gets through DR,
 * a tenth of the blast's most damage, cutting, against a hundredth of the DR,
 * both rounded up, to whoever is on the other side. Not through laminated armour.
 */
export function heshSpall(maxBlast: number, dr: number): { damage: number; dr: number; through: number } {
  const damage = Math.ceil(Math.max(0, maxBlast) / 10);
  const resisted = Math.ceil(Math.max(0, dr) / 100);
  return { damage, dr: resisted, through: Math.max(0, damage - resisted) };
}

/** The most a formula's dice can roll: 6 a die plus adds, times the multiple; null where it doesn't parse. */
export function maxDamage(formula: string): number | null {
  const d = parseDice(formula);
  return d ? (d.dice * 6 + d.adds) * d.multiplier : null;
}

/** A row line for the blast of the record: the row itself, or its linked line. */
type Line = LoadRow | NonNullable<LoadRow["followUp"]>;

/** The line holding the round's blast: the row where it is the blast, else its explosive linked line. */
function blastLine(row: LoadRow): Line | null {
  if (row.explosive) return row;
  return row.followUp?.explosive ? row.followUp : null;
}

export interface BlastNote { key: string; data?: Record<string, unknown> }

/**
 * What an explosive round makes of the record's row (pp. 169-170), its shot
 * already changed by `projectileRow`: incendiary, the blast linked or
 * following, bursting inside, with or without its fragments, and the notes
 * for what the row can't carry. `burstPrimary` says the mode's own line is
 * the blast (a shaped charge's is its jet, the blast linked to it).
 */
export function explosiveRow(row: LoadRow, p: ExplosiveProjectile, gun: { tl: number; burstPrimary: boolean }): { row: LoadRow; notes: BlastNote[] } {
  const out: LoadRow = { ...row, followUp: row.followUp ? { ...row.followUp } : null };
  const notes: BlastNote[] = [];
  const figures = BLASTS[p];
  // "Explosive-energy projectiles are also considered incendiary attacks" (p. 169).
  out.incendiary = true;
  const jet = JETS.has(p) && gun.burstPrimary;
  const blast = jet ? (out.followUp?.explosive ? out.followUp : null) : blastLine(out);
  if (blast && blast === out.followUp) {
    out.followUp.followUp = figures.followUp;
    if (figures.internal) out.followUp.blastPlacement = "internal";
  }
  if (blast && !figures.fragments) {
    blast.fragmentation = "";
    if (blast === out) {
      out.fragmentationType = "";
      out.fragmentationDivisor = 1;
      out.fragmentationLingerEvery = 0;
      out.fragmentationLingerFor = 0;
    }
  }
  if (p === "saple" && sapleMayDud(gun.tl)) notes.push({ key: "sapleDud", data: { roll: Math.max(0, gun.tl - 2) } });
  if (p === "hesh") {
    const most = blast ? maxDamage(blast.damage) : null;
    if (most !== null) notes.push({ key: "heshSpall", data: { damage: Math.ceil(most / 10) } });
  }
  if (p === "msheat") notes.push({ key: "msheat" });
  if (p === "thermobaric") notes.push({ key: "thermobaric" });
  if (figures.internal && blast && blast === out.followUp) notes.push({ key: "internal" });
  return { row: out, notes };
}

/**
 * An airburst HE round (p. 175): only its fragments do damage, in a cone
 * along the line of fire. The row becomes the fragments' attack; null where
 * the record's blast throws none.
 */
export function airburstFragments(row: LoadRow): LoadRow | null {
  const blast = blastLine(row);
  const dice = String(blast?.fragmentation ?? "").trim();
  if (!blast || !dice) return null;
  const own = blast === row;
  const type = own ? String(row.fragmentationType ?? "") : String((blast as NonNullable<LoadRow["followUp"]>).fragmentationType ?? "");
  const divisor = own ? Number(row.fragmentationDivisor) || 1 : Number((blast as NonNullable<LoadRow["followUp"]>).fragmentationDivisor) || 1;
  return {
    ...row,
    damage: dice,
    damageType: type || "cut",
    armorDivisor: divisor,
    explosive: false,
    fragmentation: "",
    fragmentationType: "",
    fragmentationDivisor: 1,
    fragmentationLingerEvery: 0,
    fragmentationLingerFor: 0,
    followUp: null,
  };
}

// ── cargo projectiles (pp. 171-172) ──

/** The kinds of smoke High-Tech prints (p. 171). */
export const HT_SMOKES = ["screening", "colored", "hot", "prism", "electromagnetic"] as const;
export type HighTechSmoke = (typeof HT_SMOKES)[number];

/**
 * High-Tech's smoke table (p. 171), for the shared smoke engine: screening
 * smoke -10 to sight and visually aimed attacks, coloured -7; hot smoke also
 * penalises Infravision and Hyperspectral Vision, prism smoke also blocks
 * lasers, electromagnetic smoke also affects Radar and Imaging Radar.
 */
export const HT_SMOKE_TABLE: Readonly<Record<HighTechSmoke, SmokeFigures & { tl: number }>> = Object.freeze({
  screening: { tl: 6, vision: -10, senses: [], blocks: [] },
  colored: { tl: 6, vision: -7, senses: [], blocks: [] },
  hot: { tl: 8, vision: -10, senses: ["infravision", "hyperspectral"], blocks: [] },
  prism: { tl: 8, vision: -10, senses: ["infravision", "hyperspectral"], blocks: ["lasers"] },
  electromagnetic: { tl: 8, vision: -10, senses: ["infravision", "hyperspectral"], blocks: ["radar"] },
});

/** The kinds of illumination round (p. 171): a parachute flare, a signal flare, an infrared flare (TL8). */
export const ILLUMINATIONS = ["parachute", "signal", "infrared"] as const;
export type Illumination = (typeof ILLUMINATIONS)[number];

/**
 * The worst darkness penalty left in a flare's radius (p. 171): -3 under a
 * parachute flare (and an infrared one, to those who see infrared), -5 under a
 * signal flare, or the actual penalty where that is better.
 */
export const ILLUMINATION_FLOOR: Readonly<Record<Illumination, number>> = Object.freeze({ parachute: -3, signal: -5, infrared: -3 });

/** The darkness penalty under a flare: the better of the actual one and the flare's floor. */
export function illuminatedDarkness(penalty: number, kind: Illumination): number {
  return Math.min(0, Math.max(Number(penalty) || 0, ILLUMINATION_FLOOR[kind]));
}

/** A flare burns what it touches: 1d a second for 10 seconds (p. 171). */
export const FLARE_BURN = { dice: "1d", seconds: 10 } as const;

/** What a liquid round carries (p. 172): paint (LC4), a scent marker (LC2), or something else. */
export const LIQUIDS = ["paint", "scent", "other"] as const;
export type Liquid = (typeof LIQUIDS)[number];
export const LIQUID_LC: Readonly<Record<Liquid, number | null>> = Object.freeze({ paint: 4, scent: 2, other: null });

/** A scent marker (p. 172): -4 to reactions, +4 to Smell rolls to find the one it marked within 4 yards, for at least an hour. */
export const SCENT_MARKER = { reaction: -4, smell: 4, yards: 4, seconds: 3600 } as const;

/** Tear gas is opaque: -3 to Vision a yard of it, at worst -10, as smoke (p. 171). */
export function tearGasVision(yards: number): number {
  return Math.max(-10, -3 * Math.max(1, Math.ceil(Number(yards) || 0)));
}

/** A cloud of tear gas or smoke takes a second per five yards of radius to form (p. 171). */
export { smokeFormSeconds } from "../../../shared/smoke/rules.js";

/**
 * The resistance rolls a cloud's gas calls for (p. 171; Campaigns pp. 428-429,
 * 439), as poisons the system doses: tear gas's two HT-2 rolls, against
 * coughing and against blindness, and a vomiting agent's HT-2 against
 * retching. What a failure does, and how long, is `gasEffect`.
 */
export const GASES = ["tearGasCoughing", "tearGasBlinding", "vomitingAgent"] as const;
export type Gas = (typeof GASES)[number];

export const GAS_POISONS: Readonly<Record<Gas, { delivery: string[]; delaySeconds: number; resistanceModifier: number; damage: "none"; dice: 0; adds: 0; intervalSeconds: 0; cycles: 1; reference: string }>> = Object.freeze({
  tearGasCoughing: { delivery: ["respiratory"], delaySeconds: 0, resistanceModifier: -2, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, reference: "High-Tech p. 171" },
  tearGasBlinding: { delivery: ["senseBased"], delaySeconds: 0, resistanceModifier: -2, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, reference: "High-Tech p. 171" },
  vomitingAgent: { delivery: ["respiratory"], delaySeconds: 0, resistanceModifier: -2, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, reference: "High-Tech p. 171" },
});

/** The gases a cloud of tear gas holds: both of tear gas's, and the vomiting agent's where one is mixed in. */
export function gasesOf(vomiting: boolean): Gas[] {
  return vomiting ? ["tearGasCoughing", "tearGasBlinding", "vomitingAgent"] : ["tearGasCoughing", "tearGasBlinding"];
}

/**
 * What a failed roll against a gas does (p. 171): coughing, blindness or
 * retching, for the time left in the cloud plus the margin in minutes (five
 * minutes a point of margin for the vomiting agent).
 */
export function gasEffect(gas: Gas, margin: number, cloudSeconds: number): { condition: "coughing" | "blinded" | "retching"; seconds: number } {
  const m = Math.max(1, marginOfFailure(margin));
  const inCloud = Math.max(0, Math.floor(Number(cloudSeconds) || 0));
  if (gas === "vomitingAgent") return { condition: "retching", seconds: inCloud + 5 * m * 60 };
  return { condition: gas === "tearGasCoughing" ? "coughing" : "blinded", seconds: inCloud + m * 60 };
}

/** Blindness (Campaigns p. 124): -10 to anything done by sight in combat. */
export const BLINDED_PENALTY = -10;

/**
 * Who a gas can't reach (Campaigns pp. 82, 429): a sealed suit keeps out
 * both; a body that doesn't breathe, or filters its air, keeps out what is
 * breathed in, but tear gas still reaches the eyes -- unless a mask makes the
 * wearer immune to eye and nose irritants (pp. 72-73).
 */
export function gasReaches(gas: Gas, victim: { sealed: boolean; doesntBreathe: boolean; filterLungs: boolean; irritantImmune?: boolean }): boolean {
  if (victim.sealed) return false;
  if (victim.irritantImmune && (gas === "tearGasBlinding" || gas === "tearGasCoughing")) return false;
  if (gas === "tearGasBlinding") return true;
  return !(victim.doesntBreathe || victim.filterLungs);
}

/** White phosphorus's hot fragments (p. 172): 1d(0.2) burning, every 10 seconds for a minute. */
export const WP_FRAGMENTS = { dice: "1d", type: "burn", divisor: 0.2, every: 10, for: 60 } as const;
/** Its smoke disperses once the phosphorus stops burning: a minute (p. 172). */
export const WP_SMOKE_SECONDS = 60;

/**
 * What a cargo round makes of the record's row (pp. 171-172), its hit already
 * changed by `projectileRow`. An ejecting-cargo round (illumination, smoke,
 * tear gas, liquid) has no blast: its harmless charge only lets the cargo out.
 * A bursting one (poison gas, white phosphorus) keeps the record's blast as a
 * follow-up to its hit, crushing for poison gas and burning for white
 * phosphorus, whose fragments burn on; both are incendiary attacks.
 */
export function cargoRow(row: LoadRow, p: CargoProjectile): { row: LoadRow; notes: BlastNote[] } {
  const out: LoadRow = { ...row, followUp: row.followUp ? { ...row.followUp } : null };
  const notes: BlastNote[] = [];
  if (p !== "poisonGas" && p !== "whitePhosphorus") {
    Object.assign(out, { explosive: false, fragmentation: "", fragmentationType: "", fragmentationDivisor: 1, fragmentationLingerEvery: 0, fragmentationLingerFor: 0, blastPlacement: "", followUp: null });
    if (p === "illumination") notes.push({ key: "flareBurn", data: { dice: FLARE_BURN.dice, seconds: FLARE_BURN.seconds } });
    if (p === "liquid") notes.push({ key: "liquid" });
    return { row: out, notes };
  }
  out.incendiary = true;
  const blast = blastLine(out);
  if (!blast) return { row: out, notes };
  if (blast === out.followUp) out.followUp.followUp = true;
  if (p === "poisonGas") {
    blast.damageType = "cr";
    notes.push({ key: "poisonGas" });
    return { row: out, notes };
  }
  // Its hot fragments are white phosphorus's own, 1d(0.2) burning, whatever the shell (p. 172).
  blast.damageType = "burn";
  blast.fragmentation = WP_FRAGMENTS.dice;
  if (blast === out) {
    Object.assign(out, { fragmentationType: WP_FRAGMENTS.type, fragmentationDivisor: WP_FRAGMENTS.divisor, fragmentationLingerEvery: WP_FRAGMENTS.every, fragmentationLingerFor: WP_FRAGMENTS.for });
  } else {
    // A linked line keeps its fragments' type and divisor, not how long they linger (API 1.72.0).
    Object.assign(out.followUp!, { fragmentationType: WP_FRAGMENTS.type, fragmentationDivisor: WP_FRAGMENTS.divisor });
    notes.push({ key: "wpLinger" });
  }
  notes.push({ key: "wpBrush" });
  return { row: out, notes };
}
