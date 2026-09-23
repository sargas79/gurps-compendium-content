/**
 * GURPS Ultra-Tech's body armour and protective gear, as rules the table reads
 * (pp. 170-181, 187-190): what a suit protects against in trait terms, which
 * attacks laser-resistant armour is worth its full DR against, the tailored
 * armour builder, and the armour systems a piece can carry.
 */

import type { BeamFamily } from "../beams/rules.js";

// ── threat protection (pp. 171, 176-181) ─────────────────────────────────────

/** What a piece of protective gear gives, in the Basic Set's trait terms (p. 171). */
export interface Protection {
  sealed?: boolean;
  vacuumSupport?: boolean;
  /** Pressure support up to this many atmospheres. */
  pressureAtm?: number;
  /** Radiation Protection Factor. */
  radiationPf?: number;
  /** Climate control: the comfort zone it gives, in °F. */
  climate?: readonly [number, number];
  /** Glare-resistant: Protected Vision. */
  glare?: boolean;
  /** Hearing protection: Protected Hearing. */
  hearing?: boolean;
  /** A mask over the face: Protected Vision and Protected Smell (p. 176). */
  mask?: boolean;
  /** Filters what is breathed. */
  filter?: boolean;
  /** Carries its own air: the wearer doesn't need to breathe what is outside. */
  air?: boolean;
}

/** A piece of protective gear: what it gives on its own, and with what it needs worn with it. */
export interface ProtectiveGear {
  alone?: Protection;
  /** The helmet or mask that completes it, and what the two give together. */
  completedBy?: { pieces: RegExp; key: string; grants: Protection };
  /** Seconds to put on and take off. */
  don?: { on: number; off: number; skill?: string };
}

const SPACE_HELMET = /^(bubble helmet|space combat helmet|visored space helmet|flexible space helmet)$/i;
const SPACE_OR_COMBAT_HELMET = /^(bubble helmet|space combat helmet|visored space helmet|flexible space helmet|combat infantry helmet)$/i;
const AIR_MASK = /^air mask$/i;
const MASK_OR_COMBAT_HELMET = /^(air mask|combat infantry helmet)$/i;
const MASK_OR_GILL = /^(air mask|artificial gill)$/i;

const VACC_SUIT: ProtectiveGear = {
  completedBy: { pieces: SPACE_HELMET, key: "spaceHelmet", grants: { sealed: true, climate: [-459, 250], pressureAtm: 10, radiationPf: 2, vacuumSupport: true, air: true } },
  don: { on: 30, off: 30, skill: "Vacc Suit" },
};
const TACSUIT: ProtectiveGear = { completedBy: { pieces: MASK_OR_COMBAT_HELMET, key: "maskOrHelmet", grants: { sealed: true, climate: [-40, 120] } } };
const DRYSUIT: ProtectiveGear = { completedBy: { pieces: MASK_OR_GILL, key: "maskOrGill", grants: { sealed: true, climate: [-50, 90] } } };
const MASK: ProtectiveGear = { alone: { mask: true }, don: { on: 3, off: 1 } };
const GLARE: ProtectiveGear = { alone: { glare: true } };
const SEALED_HELMET = (extra: Protection = {}): ProtectiveGear => ({ alone: extra, don: { on: 3, off: 3 } });

/** The book's protective gear, by name without its TL. */
const GEAR: ReadonlyArray<[RegExp, ProtectiveGear]> = [
  [/^(civilian|reflex|nanoweave|monocrys|smart|energy) vacc suit$/i, VACC_SUIT],
  // "With the addition of a vacc suit helmet, it is sealed, providing climate control (-50° F to 150°F) and vacuum support" (p. 178).
  [/^skinsuit$/i, { completedBy: { pieces: SPACE_HELMET, key: "spaceHelmet", grants: { sealed: true, climate: [-50, 150], vacuumSupport: true } } }],
  // The hood is part of the suit, and it recycles its air for six weeks (p. 179).
  [/^space biosuit$/i, { alone: { sealed: true, climate: [-459, 250], pressureAtm: 10, vacuumSupport: true, air: true } }],
  [/^combat hardsuit$/i, {
    alone: { radiationPf: 2 },
    completedBy: { pieces: SPACE_OR_COMBAT_HELMET, key: "combatOrSpaceHelmet", grants: { sealed: true, climate: [-140, 140], radiationPf: 5 } },
    don: { on: 3, off: 3 },
  }],
  [/^space armor$/i, { completedBy: { pieces: SPACE_HELMET, key: "spaceHelmet", grants: { sealed: true, climate: [-459, 250], pressureAtm: 10, radiationPf: 10, vacuumSupport: true } } }],
  [/^(reflex|nanoweave|monocrys|energy) tacsuit$/i, TACSUIT],
  [/^desert environment suit$/i, { alone: { climate: [-20, 120] } }],
  [/^(drysuit|gill suit)$/i, DRYSUIT],
  [/^heatsuit$/i, { alone: { climate: [-250, 100] } }],
  [/^protective suit$/i, { completedBy: { pieces: AIR_MASK, key: "airMask", grants: { sealed: true } } }],
  [/^expedition suit$/i, { alone: { climate: [-120, 120] }, completedBy: { pieces: AIR_MASK, key: "airMask", grants: { sealed: true } } }],
  [/^filter skin$/i, { alone: { sealed: true } }],
  [/^air mask$/i, { alone: { mask: true }, don: { on: 2, off: 1 } }],
  [/^filter mask$/i, { alone: { mask: true, filter: true }, don: { on: 2, off: 1 } }],
  [/^(artificial gill|respirator)$/i, MASK],
  [/^reducing respirator$/i, { alone: { mask: true, glare: true }, don: { on: 3, off: 1 } }],
  [/^(armored shades|light infantry helmet visor)$/i, GLARE],
  // Filter masks are built into its cheek pieces (p. 180).
  [/^combat infantry helmet$/i, SEALED_HELMET({ hearing: true, filter: true })],
  [/^(space combat helmet|visored space helmet)$/i, SEALED_HELMET({ hearing: true })],
  [/^(bubble helmet|flexible space helmet)$/i, SEALED_HELMET()],
  // Powered suits (pp. 182-185): a suit with a separate helmet is sealed only with it on.
  [/^(infantry )?combat walker$/i, { alone: { sealed: true, filter: true, hearing: true, climate: [-20, 140], radiationPf: 10 } }],
  [/^marine combat walker$/i, { alone: { sealed: true, hearing: true, climate: [-20, 150], pressureAtm: 10, radiationPf: 10, air: true } }],
  [/^space combat walker$/i, { alone: { sealed: true, hearing: true, climate: [-459, 300], pressureAtm: 30, radiationPf: 10, vacuumSupport: true, air: true } }],
  [/^zero-g worksuit$/i, { alone: { sealed: true, climate: [-459, 300], radiationPf: 10, vacuumSupport: true, air: true } }],
  [/^powered combat armor$/i, battlesuit(/^powered combat armor helmet$/i, { climate: [-459, 250], pressureAtm: 10, radiationPf: 10 })],
  [/^commando battlesuit$/i, battlesuit(/^commando battlesuit helmet$/i, { climate: [-459, 500], pressureAtm: 20, radiationPf: 10 })],
  [/^heavy battlesuit$/i, battlesuit(/^heavy battlesuit helmet$/i, { climate: [-459, 500], pressureAtm: 10, radiationPf: 5 })],
  [/^dreadnought battlesuit$/i, battlesuit(/^dreadnought battlesuit helmet$/i, { climate: [-459, 1000], pressureAtm: 100, radiationPf: 20 })],
  [/^(powered combat armor|commando battlesuit|heavy battlesuit|dreadnought battlesuit) helmet$/i, SEALED_HELMET({ hearing: true, filter: true })],
  [/^hex suit$/i, { alone: { sealed: true, climate: [-459, 800], pressureAtm: 50, radiationPf: 100, vacuumSupport: true, air: true }, don: { on: 60, off: 60 } }],
  [/^cybersuit$/i, { alone: { sealed: true, vacuumSupport: true, filter: true, hearing: true, climate: [-459, 250], pressureAtm: 30, radiationPf: 5, air: true }, don: { on: 3, off: 1 } }],
  [/^military cybersuit$/i, { alone: { sealed: true, vacuumSupport: true, filter: true, hearing: true, climate: [-459, 1000], pressureAtm: 100, radiationPf: 10, air: true }, don: { on: 3, off: 1 } }],
  // No air of its own: it needs a tank in space (p. 185).
  [/^nanosuit$/i, { alone: { sealed: true, vacuumSupport: true, filter: true, climate: [-400, 500], pressureAtm: 10, radiationPf: 10 } }],
  [/^warsuit$/i, { alone: { sealed: true, vacuumSupport: true, filter: true, hearing: true, climate: [-459, 10000], pressureAtm: 1000, radiationPf: 100, air: true } }],
];

/** A battlesuit sealed by its own helmet, with its air (pp. 183-185). */
function battlesuit(helmet: RegExp, grants: Protection): ProtectiveGear {
  return { completedBy: { pieces: helmet, key: "suitHelmet", grants: { sealed: true, vacuumSupport: true, air: true, ...grants } } };
}

/** A name without the TL the table adds to it: "Combat Hardsuit (TL10)" is "Combat Hardsuit". */
export function baseName(name: string): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

/** A piece's protective gear entry, or null. */
export function protectiveGear(name: string): ProtectiveGear | null {
  const base = baseName(name);
  return GEAR.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/** What wearing a piece gives, given the names of everything else worn. */
export function protectionWorn(name: string, wornNames: readonly string[]): Protection | null {
  const gear = protectiveGear(name);
  if (!gear) return null;
  const completed = gear.completedBy && wornNames.some((other) => gear.completedBy!.pieces.test(baseName(other)));
  if (!completed) return gear.alone ?? null;
  return mergeProtection(gear.alone ?? {}, gear.completedBy!.grants);
}

/** Two sets of protection together: the better of each. */
export function mergeProtection(a: Protection, b: Protection): Protection {
  const climate = a.climate && b.climate
    ? ([Math.min(a.climate[0], b.climate[0]), Math.max(a.climate[1], b.climate[1])] as const)
    : (a.climate ?? b.climate);
  return {
    ...(a.sealed || b.sealed ? { sealed: true } : {}),
    ...(a.vacuumSupport || b.vacuumSupport ? { vacuumSupport: true } : {}),
    ...(a.pressureAtm || b.pressureAtm ? { pressureAtm: Math.max(a.pressureAtm ?? 0, b.pressureAtm ?? 0) } : {}),
    ...(a.radiationPf || b.radiationPf ? { radiationPf: Math.max(a.radiationPf ?? 0, b.radiationPf ?? 0) } : {}),
    ...(climate ? { climate } : {}),
    ...(a.glare || b.glare ? { glare: true } : {}),
    ...(a.hearing || b.hearing ? { hearing: true } : {}),
    ...(a.mask || b.mask ? { mask: true } : {}),
    ...(a.filter || b.filter ? { filter: true } : {}),
    ...(a.air || b.air ? { air: true } : {}),
  };
}

/**
 * Pressure Support's level for a suit rated to this many atmospheres
 * (Characters p. 77): 10 atmospheres is the first level, 100 the second, and
 * anything beyond the third.
 */
export function pressureSupportLevel(atmospheres: number): number {
  if (!(atmospheres > 1)) return 0;
  if (atmospheres <= 10) return 1;
  if (atmospheres <= 100) return 2;
  return 3;
}

// A suit's climate range as degrees added to the comfort zone: the engine High-Tech's climate control shares.
export { COMFORT_ZONE, climateTolerance } from "../../../shared/climate/rules.js";

/** The air tanks, and the hours each holds at TL9-12 (p. 176). */
export const AIR_TANK_HOURS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  large: [24, 36, 48, 72],
  medium: [12, 18, 24, 36],
  small: [4, 6, 8, 12],
  mini: [10 / 60, 15 / 60, 20 / 60, 30 / 60],
};

/** An air tank's size, from its name ("Air Tank (Medium)"), or null. */
export function airTankSize(name: string): string | null {
  const m = /^air tank \((large|medium|small|mini)\)$/i.exec(String(name ?? "").trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** Hours of air a tank holds at a TL, held to TL9-12. */
export function airTankHours(size: string, tl: number): number {
  const hours = AIR_TANK_HOURS[size];
  if (!hours) return 0;
  return hours[Math.max(0, Math.min(3, Math.floor(tl) - 9))]!;
}

/** Hooking up a tank and jettisoning it, in seconds (p. 171). */
export const TANK_SECONDS = { hookUp: 10, jettison: 2 } as const;

/** Seconds most body armour takes to put on or off, a piece (p. 171). */
export const BODY_ARMOR_SECONDS = 3;

/** A patch's penalty after this many failed attempts, and the air each attempt costs (p. 188). */
export function suitPatchPenalty(failures: number): number {
  return -Math.max(0, Math.floor(failures));
}
export const SUIT_PATCH = { seconds: 3, airMinutesLost: 10 } as const;

// ── laser-resistant armour (pp. 173-174) ─────────────────────────────────────

/** Which kind of laser-resistant armour a piece is, by name. */
export type LaserArmor = "ablative" | "reflec" | "retroReflective";

export function laserArmorKind(name: string): LaserArmor | null {
  const base = baseName(name);
  if (/^retro-reflective\b/i.test(base)) return "retroReflective";
  if (/^reflec\b/i.test(base)) return "reflec";
  if (/^ablative\b/i.test(base)) return "ablative";
  return null;
}

/** Every laser, X-ray and graser included: what ablative armour takes its full DR against (p. 173). */
const ANY_LASER: ReadonlySet<BeamFamily> = new Set(["laser", "blueGreen", "ultraviolet", "rainbow", "xray", "graser"]);
/** Lasers and microwaves, but not X-ray or gamma-ray lasers: reflec's (p. 173). */
const REFLECTED: ReadonlySet<BeamFamily> = new Set(["laser", "blueGreen", "ultraviolet", "rainbow", "mad", "microwave"]);
/** Visible-light and near-infrared lasers, which retro-reflective armour bounces back (p. 173). */
const BOUNCED: ReadonlySet<BeamFamily> = new Set(["laser", "blueGreen", "rainbow"]);

/** Whether a piece of laser-resistant armour gives its full DR against this family. */
export function fullDrAgainst(kind: LaserArmor, family: BeamFamily | null): boolean {
  if (!family) return false;
  return kind === "ablative" ? ANY_LASER.has(family) : REFLECTED.has(family);
}

/** Whether a family is one any laser-resistant armour, bioplas's transparency included, counts as a laser. */
export function isLaser(family: BeamFamily | null): boolean {
  return Boolean(family && ANY_LASER.has(family));
}

/** Whether retro-reflective armour bounces this family back. */
export function bouncesBack(family: BeamFamily | null): boolean {
  return Boolean(family && BOUNCED.has(family));
}

/** Semi-ablative DR lost: a point for every 10 points of basic laser damage rolled (p. 173). */
export function semiAblativeLoss(basicDamage: number, remainingDr: number): number {
  return Math.max(0, Math.min(Math.floor(remainingDr), Math.floor(Math.max(0, basicDamage) / 10)));
}

/** Damage bounced back: half of what the armour actually resisted (p. 173). */
export function bouncedDamage(basicDamage: number, effectiveDr: number): number {
  return Math.floor(Math.min(Math.max(0, basicDamage), Math.max(0, effectiveDr)) / 2);
}

/** DR divided by an armour divisor, as the Basic Set does: a fraction below 1 multiplies. */
export function afterDivisor(dr: number, divisor: number): number {
  const d = Number(divisor) || 1;
  return Math.floor(dr / d);
}

/** Reflec's detection bonus: +1, or +2 for a full suit (p. 173). */
export function reflecDetectionBonus(names: readonly string[]): number {
  const reflec = names.map(baseName).filter((n) => /^(reflec|retro-reflective) /i.test(n));
  if (!reflec.length) return 0;
  return reflec.some((n) => / suit$/i.test(n)) ? 2 : 1;
}

/** A rigid helmet made reflective: +20 DR against lasers and microwaves, for $50 (p. 173). */
export const REFLECTIVE_HELMET = { dr: 20, cost: 50 } as const;

/** Whether a family is one a reflective helmet counts against. */
export function reflectedByHelmet(family: BeamFamily | null): boolean {
  return Boolean(family && REFLECTED.has(family));
}

/** Bioplas that can be made transparent: any bioplas outfit and the space biosuit (p. 174). */
export function canBeTransparent(name: string): boolean {
  return /^(bioplas\b|space biosuit$)/i.test(baseName(name));
}

// ── tailored armour (pp. 174-175) ────────────────────────────────────────────

/** The coverage table's parts of the body, and what each is worth (p. 175). */
export const COVERAGE_PARTS = {
  skull: 0.05,
  face: 0.05,
  neck: 0.025,
  arms: 0.125,
  hands: 0.05,
  torso: 0.25,
  groin: 0.1,
  legs: 0.25,
  feet: 0.1,
} as const;
export type CoveragePart = keyof typeof COVERAGE_PARTS;
export const COVERAGE_PART_KEYS = Object.keys(COVERAGE_PARTS) as CoveragePart[];

/** How much of a part an outfit covers. */
/** Front and back halve the part; a front or back half of a part halves it again, and rolls as half coverage. */
export type Coverage = "none" | "full" | "front" | "back" | "half" | "frontHalf" | "backHalf" | "skimpy";
export const COVERAGES: readonly Coverage[] = ["full", "front", "back", "half", "frontHalf", "backHalf", "skimpy", "none"];

/** Each coverage's share of the part's multiplier (p. 175). */
const COVERAGE_SHARE: Record<Coverage, number> = { none: 0, full: 1, front: 0.5, back: 0.5, half: 0.5, frontHalf: 0.25, backHalf: 0.25, skimpy: 0.25 };

/** The outfit's coverage multiplier: the parts it covers, added up. */
export function coverageMultiplier(coverage: Partial<Record<CoveragePart, Coverage>>): number {
  let total = 0;
  for (const part of COVERAGE_PART_KEYS) total += COVERAGE_PARTS[part] * COVERAGE_SHARE[coverage[part] ?? "none"];
  return Math.round(total * 1e6) / 1e6;
}

/** The part a hit location belongs to: the vitals go with the torso, the eyes with the face (p. 175). */
export function partAt(location: string): CoveragePart | null {
  switch (location) {
    case "skull": return "skull";
    case "face": case "eye": return "face";
    case "neck": return "neck";
    case "arm": return "arms";
    case "hand": return "hands";
    case "torso": case "vitals": return "torso";
    case "groin": return "groin";
    case "leg": return "legs";
    case "foot": return "feet";
    default: return null;
  }
}

/** The 3d activation roll a partly covered part is struck at: 11 or less for half, 8 or less for skimpy (p. 175). */
export function coverageActivation(coverage: Coverage): number | null {
  return coverage === "half" || coverage === "frontHalf" || coverage === "backHalf" ? 11 : coverage === "skimpy" ? 8 : null;
}

/** Whether a front- or back-only part stands against a blow from this arc; an unknown arc counts. */
export function coversArc(coverage: Coverage, arc: string | null | undefined): boolean {
  if (coverage === "front" || coverage === "frontHalf") return !arc || arc === "front";
  if (coverage === "back" || coverage === "backHalf") return !arc || arc === "back";
  return coverage !== "none";
}

/** The outfit's style: DR, cost and weight multiplied, and LC shifted (p. 175). */
export type TailoredStyle = "heavy" | "normal" | "light" | "diaphanous";
export const STYLES: Record<TailoredStyle, { factor: number; lc: number }> = {
  heavy: { factor: 1.5, lc: -1 },
  normal: { factor: 1, lc: 0 },
  light: { factor: 2 / 3, lc: 1 },
  diaphanous: { factor: 0.5, lc: 1 },
};

/** The cut: cost multiplied (p. 175). */
export type TailoredCut = "average" | "stylish" | "original";
export const CUTS: Record<TailoredCut, number> = { average: 1, stylish: 4, original: 20 };

/** A tailored outfit's choices. */
export interface Tailoring {
  coverage: Partial<Record<CoveragePart, Coverage>>;
  style: TailoredStyle;
  cut: TailoredCut;
}

/** A tailored outfit's price and weight, from the suit's (p. 175). */
export function tailoredPrice(suit: { cost: number; weight: number }, tailoring: Tailoring): { cost: number; weight: number } {
  const coverage = coverageMultiplier(tailoring.coverage);
  const style = STYLES[tailoring.style]?.factor ?? 1;
  const cut = CUTS[tailoring.cut] ?? 1;
  return {
    cost: Math.round(suit.cost * coverage * style * cut * 100) / 100,
    weight: Math.round(suit.weight * coverage * style * 100) / 100,
  };
}

/** A tailored outfit's DR, from the suit's, rounded down. */
export function tailoredDr(dr: number, style: TailoredStyle): number {
  return Math.floor(dr * (STYLES[style]?.factor ?? 1) + 1e-9);
}

/** A tailored outfit's LC, held to 0-4. */
export function tailoredLc(lc: number | null, style: TailoredStyle): number | null {
  if (lc === null || !Number.isFinite(lc)) return null;
  return Math.max(0, Math.min(4, lc + (STYLES[style]?.lc ?? 0)));
}

// ── armour systems (pp. 187-190) ─────────────────────────────────────────────

/** Electromagnetic armour: its DR doubled, or tripled for laminate, against shaped charges and plasma (p. 187). */
export type Ema = "" | "standard" | "laminate";
export function emaMultiplier(ema: Ema): number {
  return ema === "laminate" ? 3 : ema === "standard" ? 2 : 1;
}

/** Warheads that are shaped charges (pp. 154-155). */
export const SHAPED_CHARGES: ReadonlySet<string> = new Set(["shaped", "hemp"]);

/**
 * Whether a blow used up one of the EMA's uses: it was stopped, and would not
 * have been without the doubling (p. 187).
 */
export function emaUseSpent(options: { penetrating: number; basicDamage: number; effectiveDr: number; pieceDr: number; multiplier: number; divisor: number }): boolean {
  if (options.penetrating > 0 || options.multiplier <= 1) return false;
  const extra = afterDivisor(options.pieceDr * (options.multiplier - 1), options.divisor);
  return options.basicDamage > options.effectiveDr - extra;
}

/** Reactive armour paste's DR at a TL, and against shaped charges (p. 189). */
export function reactivePasteDr(tl: number, shapedCharge: boolean): number {
  const base = tl >= 12 ? 40 : tl >= 11 ? 30 : 20;
  return shapedCharge ? base * 10 : base;
}

/**
 * Whether paste already spent on a location still covers the spot struck: 1d,
 * less a point for every detonation there, above 0 (p. 189). The first
 * detonation is always covered.
 */
export function pasteCovers(detonations: number, roll: number): boolean {
  if (detonations <= 0) return true;
  return roll - detonations > 0;
}

/** What a detonation does to the wearer (p. 189). */
export const PASTE_DETONATION = { damage: "1d", type: "cr", explosive: true } as const;

/** Beam-adaptive armour's price: $1,000 a pound, times the square of the types it adapts to (p. 190). */
export function adaptivePrice(types: number, weight: number): number {
  const n = Math.max(0, Math.min(4, Math.floor(types)));
  return n ? 1000 * n * n * Math.max(0, weight) : 0;
}

/**
 * The types adaptive armour holds after an attack of a family it isn't set
 * against: the newest first, up to as many as it can hold (p. 190). It adapts
 * when the attack penetrated, or did more than half what it needed to.
 */
export function adaptTo(current: readonly string[], family: string, slots: number, options: { penetrating: number; basicDamage: number; effectiveDr: number }): string[] | null {
  if (slots <= 0 || current.includes(family)) return null;
  if (!(options.penetrating > 0 || options.basicDamage > options.effectiveDr / 2)) return null;
  return [family, ...current].slice(0, slots);
}

/** Ablative foam: DR 8 against burning, Hardened against lasers, a point lost for every point struck (p. 187). */
export const ABLATIVE_FOAM = { dr: 8, hardened: 1, radarPenalty: -3, applySeconds: 3 } as const;

/** Foam left after a blow of this much basic damage. */
export function foamLeft(remaining: number, basicDamage: number): number {
  return Math.max(0, remaining - Math.max(0, Math.floor(basicDamage)));
}

/** Self-repair: living metal armour a point of DR or HP an hour, bioplas an HP every six hours (pp. 170-171, 190). */
export const SELF_REPAIR = { livingMetalHoursPerPoint: 1, bioplasHoursPerHp: 6 } as const;

/** Nasal filter plugs: +5 HT against breathed gas, less a point every two hours after four, none after ten (p. 188). */
export function nasalPlugBonus(hoursWorn: number): number {
  const hours = Math.max(0, hoursWorn);
  if (hours >= 10) return 0;
  if (hours <= 4) return 5;
  return Math.max(0, 5 - Math.floor((hours - 4) / 2));
}

/** A psionic mind shield's bonus: its TL-6 (p. 188). */
export function mindShieldBonus(tl: number): number {
  return Math.max(0, Math.floor(tl) - 6);
}

/** Biomedical sensors: +1 to Diagnosis in person, or Diagnosis at -2 from afar (p. 187). */
export const BIOMEDICAL = { inPerson: 1, remote: -2 } as const;

/** Suits that come with biomedical sensors (pp. 178-179). */
export function hasBiomedicalSensors(name: string): boolean {
  return /^(biomedical sensors|(civilian|reflex|nanoweave|monocrys|smart|energy) vacc suit|(reflex|nanoweave|monocrys|energy) tacsuit|combat hardsuit|space armor)$/i.test(baseName(name));
}

/** Near-miss indicator: +2 to Vision rolls to find where fire came from (p. 188). */
export const NEAR_MISS_BONUS = 2;

/** A warsuit is Hardened, with three levels against shaped-charge warheads and plasma bolts (p. 186). */
export const WARSUIT_HARDENED = Object.freeze({ all: 1, shapedOrPlasma: 3 });

/** An artificial gill or gill suit lets its wearer breathe underwater while powered (pp. 177-178). */
export function breathesUnderwater(name: string): boolean {
  return /^(artificial gill|gill suit)$/i.test(String(name ?? "").trim());
}

/** A reactor that nullifies the suit's infrared cloaking while it runs: the dreadnought battlesuit's (p. 185). */
export function reactorSpoilsInfrared(name: string): boolean {
  return /^dreadnought battlesuit$/i.test(String(name ?? "").trim());
}

/** Points of DR a self-repairing piece regains over some hours, a point each `hoursPerPoint` (pp. 171, 174). */
export function selfRepairPoints(hours: number, hoursPerPoint: number): number {
  if (!(hours > 0) || !(hoursPerPoint > 0)) return 0;
  return Math.floor(hours / hoursPerPoint);
}
