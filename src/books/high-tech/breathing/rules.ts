/**
 * High-Tech's breathing gear and environment suits, as rules the table reads
 * (pp. 72-76): what each mask, diving rig and suit is in the Basic Set's trait
 * terms, the air a tank or rebreather holds and what uses it up, and what the
 * suits do to their wearer. The trait terms, the merging and the tank rows by
 * TL are the shared protective gear engine's (src/shared/protective-gear),
 * which Ultra-Tech's masks and suits read with its own table at TL9-12.
 */

import { baseName, figureAtTl, protectionWornIn, type GearTable, type Protection, type ProtectiveGear } from "../../../shared/protective-gear/rules.js";

/** Which of the book's two switches a piece of gear answers to. */
export type BreathingRule = "breathing" | "suits";

/** A piece of the book's gear: what it gives, and whether a tank must feed it. */
interface Entry {
  rule: BreathingRule;
  gear: (tl: number) => ProtectiveGear;
  /** An air mask (pp. 72-73): the piece that seals a biohazard or NBC suit. */
  airMask?: boolean;
  /** Doesn't Breathe only while an air tank feeds it (pp. 73-74). */
  tankFed?: boolean;
}

// ── masks and diving gear (pp. 72-74, 76) ───────────────────────────────────

/** Every air mask takes three seconds to put on and one to take off (p. 72). */
export const MASK_DON = { on: 3, off: 1 } as const;

/**
 * What the masks the tables print give on the face: no sense of smell or
 * taste, and No Peripheral Vision -- or Tunnel Vision for the earliest gas
 * mask (pp. 72-73, 76). The immunity to eye and nose irritants they also give
 * is on the sheet: the system has no trait for it.
 */
const FACE_MASK = (tl: number, extra: Protection = {}): Protection => ({ noSmellTaste: true, restrictedVision: tl <= 5 ? "tunnel" : "noPeripheral", ...extra });

/** A climate-control system: 60° added to both ends of the comfort zone (p. 74). */
export const CLIMATE_CONTROL = { coldF: 60, heatF: 60 } as const;

const SPACE_HELMET = /^space suit space helmet$/i;
const EVA_HELMET = /^space suit, eva space helmet$/i;
const AIR_MASK = /^(gas mask|scba mask|scuba mask|ffm)$/i;

/** The helmets of both Apollo suits: Filter Lungs, Protected Hearing, Smell and Vision, and No Peripheral Vision (p. 75 notes 7, 9). */
const HELMET: Protection = { filter: true, hearing: true, smell: true, glare: true, restrictedVision: "noPeripheral" };

/** The suits' Doesn't Breathe comes from their air supply, not from the helmet: see `airSupply`. */
const SUIT_SEAL: Protection = { sealed: true, vacuumSupport: true, smell: true };

const ENTRIES: ReadonlyArray<[RegExp, Entry]> = [
  // A gas mask filters what the wearer breathes (p. 72 note 1); the TL5 hood gives Tunnel Vision (note 2).
  [/^gas mask$/i, { rule: "breathing", airMask: true, gear: (tl) => ({ alone: FACE_MASK(tl, { filter: true }), don: MASK_DON }) }],
  // SCBA and scuba masks breathe from a tank (p. 73 notes).
  [/^(scba mask|scuba mask|ffm)$/i, { rule: "breathing", airMask: true, tankFed: true, gear: () => ({ alone: FACE_MASK(7), don: MASK_DON }) }],
  // A rebreather carries its own gas (p. 76).
  [/^(early rebreather|rebreather|advanced rebreather)$/i, { rule: "breathing", gear: () => ({ alone: FACE_MASK(7) }) }],
  // The complete scuba set: a scuba mask and a medium tank among the rest (p. 60).
  [/^scuba gear$/i, { rule: "breathing", gear: () => ({ alone: FACE_MASK(7) }) }],
  // Hard-hat diving dress breathes what the surface pumps down (p. 74 note 1).
  [/^(closed-dress suit|hard-hat suit)$/i, { rule: "breathing", gear: () => ({ alone: { air: true, noSmellTaste: true, restrictedVision: "tunnel" } }) }],
  // Biohazard and NBC suits are sealed with an air mask worn under them (p. 75 note 1); the TL8 lining is PF 2.5 (p. 74).
  [/^biohazard suit$/i, { rule: "suits", gear: (tl) => ({ ...(tl >= 8 ? { alone: { radiationPf: 2.5 } } : {}), completedBy: { pieces: AIR_MASK, key: "airMask", grants: { sealed: true } } }) }],
  [/^nbc suit$/i, { rule: "suits", gear: () => ({ completedBy: { pieces: AIR_MASK, key: "airMask", grants: { sealed: true } } }) }],
  // The Apollo suits, sealed with their helmets (p. 75 notes 6, 8); the EVA suit's climate control adds 60° to both ends (p. 74).
  [/^space suit$/i, { rule: "suits", gear: () => ({ completedBy: { pieces: SPACE_HELMET, key: "spaceHelmet", grants: SUIT_SEAL } }) }],
  [/^space suit, eva$/i, { rule: "suits", gear: () => ({ alone: { comfort: CLIMATE_CONTROL }, completedBy: { pieces: EVA_HELMET, key: "evaHelmet", grants: SUIT_SEAL } }) }],
  [/^space suit(, eva)? space helmet$/i, { rule: "suits", gear: () => ({ alone: HELMET }) }],
];

function entryOf(name: string): Entry | null {
  const base = baseName(name);
  return ENTRIES.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/** The book's gear at a TL, as the shared engine reads a table. */
function tableAt(tl: number, rules: (rule: BreathingRule) => boolean): GearTable {
  return ENTRIES.filter(([, e]) => rules(e.rule)).map(([pattern, e]) => [pattern, e.gear(tl)] as const);
}

/** A piece's gear entry at its TL, or null. */
export function breathingGear(name: string, tl: number): (ProtectiveGear & { rule: BreathingRule }) | null {
  const entry = entryOf(name);
  return entry ? { ...entry.gear(tl), rule: entry.rule } : null;
}

/** What wearing a piece gives, given its TL, the names of everything else worn, and which switches are on. */
export function breathingProtection(name: string, tl: number, wornNames: readonly string[], rules: (rule: BreathingRule) => boolean = () => true): Protection | null {
  return protectionWornIn(tableAt(tl, rules), name, wornNames);
}

/** An air mask that seals a suit worn over it (pp. 72-73). */
export function isAirMask(name: string): boolean {
  return entryOf(name)?.airMask === true;
}

/** A mask that breathes from an air tank: SCBA, scuba and full-face masks (p. 73). */
export function isTankFed(name: string): boolean {
  return entryOf(name)?.tankFed === true;
}

/** Whether a piece is a gas mask (p. 72). */
export function isGasMask(name: string): boolean {
  return /^gas mask$/i.test(baseName(name));
}

/**
 * Masks up to TL7 muffle their wearer's voice: a listener needs a Hearing roll
 * to understand him, over a radio too. TL8 masks carry a voice amplifier
 * (pp. 72-73).
 */
export function mufflesSpeech(name: string, tl: number): boolean {
  return isAirMask(name) && tl <= 7;
}

/** The TL6 gas mask's hose, at -2 to hit, and a severed one lets the air in (p. 72). */
export const GAS_MASK_HOSE = { tl: 6, toHit: -2 } as const;

/** A gas mask's replaceable filter (p. 72). */
export const GAS_MASK_FILTER = { cost: 25, weight: 0.5 } as const;

// ── air (pp. 74, 76) ────────────────────────────────────────────────────────

/** Minutes of air each tank holds at TL6, TL7 and TL8 (p. 74). */
export const AIR_TANK_MINUTES: Readonly<Record<string, readonly number[]>> = {
  small: [12, 22, 45],
  medium: [22, 45, 90],
  large: [45, 90, 180],
};

/** A tank's size, from its name ("Air Tank, Small"), or null. */
export function airTankSize(name: string): string | null {
  const m = /^air tank,\s*(small|medium|large)$/i.exec(baseName(name));
  return m ? m[1]!.toLowerCase() : null;
}

/** Minutes a tank holds at a TL, held to TL6-8. */
export function airTankMinutes(size: string, tl: number): number {
  const minutes = AIR_TANK_MINUTES[size];
  return minutes ? figureAtTl(minutes, 6, tl) : 0;
}

/**
 * Minutes of gas a self-contained supply holds, by name at its TL, or null for
 * anything that isn't one: a tank, a rebreather (p. 76), the EVA suit's
 * life-support pack (p. 75 note 8), or the scuba set's medium tank (p. 60).
 */
export function supplyMinutes(name: string, tl: number): number | null {
  const size = airTankSize(name);
  if (size) return airTankMinutes(size, tl);
  const base = baseName(name);
  if (/^early rebreather$/i.test(base)) return 90;
  if (/^(rebreather|advanced rebreather)$/i.test(base)) return 240;
  if (/^space suit, eva$/i.test(base)) return 7 * 60;
  if (/^scuba gear$/i.test(base)) return airTankMinutes("medium", tl);
  return null;
}

/** A tank's air runs twice as long for a child under 12 (p. 74). */
export const CHILD_FACTOR = 2;

/**
 * The pressure at a depth of water, in atmospheres: one at the surface, and
 * another for every 33 feet (p. 74; Campaigns p. 435).
 */
export function pressureAtDepth(feet: number): number {
  return 1 + Math.max(0, Number(feet) || 0) / 33;
}

/**
 * Minutes of air left at a depth: the textbook duration, less what has been
 * used of it, divided by the pressure (p. 74).
 */
export function airLeft(minutes: number, used: number, depthFeet: number): number {
  return Math.max(0, minutes - Math.max(0, used)) / pressureAtDepth(depthFeet);
}

/**
 * The textbook minutes breathing for a while at a depth uses: a minute at 33
 * feet uses two of them.
 */
export function airUsedBreathing(minutes: number, depthFeet: number): number {
  return Math.max(0, minutes) * pressureAtDepth(depthFeet);
}

/** Every FP spent, and every failed Fright Check, takes a minute off the duration (p. 74). */
export const AIR_LOST = { perFp: 1, perFailedFright: 1 } as const;

/** Rebreathers are closed-circuit: no bubbles. The shallow-water ones breathe pure oxygen, dangerous below 30' (p. 76). */
export function isRebreather(name: string): boolean {
  return /^(early rebreather|rebreather|advanced rebreather)$/i.test(baseName(name));
}
export function breathesPureOxygen(name: string): boolean {
  return /^(early rebreather|rebreather)$/i.test(baseName(name));
}
export const OXYGEN_DEPTH_FEET = 30;

/** Scuba (Closed-Circuit): the optional specialty's defaults from and to Scuba (p. 76). */
export const CLOSED_CIRCUIT_DEFAULTS = { fromScuba: -4, toScuba: -2 } as const;

// ── environment suits (pp. 74-76) ───────────────────────────────────────────

/** The biohazard suit is so hot its wearer's FP losses triple (p. 74). */
export const BIOHAZARD_FP_FACTOR = 3;

export function isBiohazardSuit(name: string): boolean {
  return /^biohazard suit$/i.test(baseName(name));
}

/**
 * The FP costs the suit's heat triples: those of effort and of the weather
 * -- a fight, a march, extra effort, heat and cold. Spells, poisons, hunger,
 * lost sleep and suffocation cost what they cost.
 */
export const HOT_SUIT_REASONS: ReadonlySet<string> = new Set(["battle", "hiking", "extraEffort", "exposure"]);

/** The FP a cost comes to in a biohazard suit. */
export function hotSuitFp(fp: number): number {
  return Math.max(0, Math.round(fp)) * BIOHAZARD_FP_FACTOR;
}

/** The clean suit: +4 HT on the roll against catching a disease from a victim (p. 75 note 3). */
export const CLEAN_SUIT_CONTAGION = 4;

export function isCleanSuit(name: string): boolean {
  return /^clean suit$/i.test(baseName(name));
}

/** The anti-G suit: +3 to HT rolls to resist high acceleration (p. 74). */
export const ANTI_G_BONUS = 3;

/** Wet turnout gear: +5 DR against burning, and burning damage through it doubled (p. 75). */
export const WET_TURNOUT = { dr: 5, multiplier: 2 } as const;

/** An NBC suit's seal is reliable for 72 hours at most (p. 75). */
export const NBC_SEAL_HOURS = 72;

/**
 * Gear that comes with biomedical sensors: the sensors themselves, added to
 * armour, and the Apollo suits (p. 75).
 */
export function hasBiomedicalSensors(name: string): boolean {
  return /^(biomedical sensors|space suit|space suit, eva)$/i.test(baseName(name));
}
