/**
 * GURPS Ultra-Tech's cybernetics, as rules the table reads (pp. 207-219):
 * the Surgical Procedures Table, each implant's procedure by TL, removing,
 * salvaging and second-hand parts, chip slots, psych implants, cognitive
 * enhancement and uplift.
 */

/** The four procedures (p. 207). */
export type Procedure = "simple" | "minor" | "major" | "radical";
export const PROCEDURES: readonly Procedure[] = ["simple", "minor", "major", "radical"];

/** The Surgical Procedures Table (p. 207): the modifier (brain or eye in brackets), time, injury on failure, recovery and fee. */
export const PROCEDURE_TABLE: Readonly<Record<Procedure, { modifier: number; brainModifier: number; minutes: number; injury: string; recoverySeconds: number; fee: number }>> = {
  simple: { modifier: 4, brainModifier: 2, minutes: 15, injury: "1", recoverySeconds: 3600, fee: 100 },
  minor: { modifier: 2, brainModifier: 0, minutes: 60, injury: "1d/2", recoverySeconds: 86400, fee: 1000 },
  major: { modifier: 0, brainModifier: -2, minutes: 120, injury: "1d", recoverySeconds: 7 * 86400, fee: 10000 },
  radical: { modifier: -3, brainModifier: -5, minutes: 240, injury: "3d", recoverySeconds: 28 * 86400, fee: 100000 },
};

/** An implant's procedure: at its TL, easing at higher TLs, how many operations, and whether it is brain or eye surgery. */
export interface ImplantProcedure {
  procedure: Procedure;
  /** Operations it takes: two for a pair of eyes or limbs. */
  count?: number;
  brain?: boolean;
  eye?: boolean;
  /** An easier procedure from a TL on. */
  eased?: ReadonlyArray<{ tl: number; procedure: Procedure }>;
}

const at = (tl: number, procedure: Procedure) => [{ tl, procedure }] as const;
const BRAIN = { brain: true } as const;

/** Each implant's procedure, by the name its trait and equipment records share (pp. 208-219). */
export const IMPLANTS: Readonly<Record<string, ImplantProcedure>> = {
  "Biomonitor Implant": { procedure: "minor", eased: at(10, "simple") },
  "Bionic Arm (One)": { procedure: "major" },
  "Bionic Arm (Two)": { procedure: "major", count: 2 },
  "Bionic Hand": { procedure: "major" },
  "Bionic Ear": { procedure: "minor" },
  "Bionic Ears": { procedure: "minor", count: 2 },
  "Bionic Ears (Advanced)": { procedure: "minor", count: 2 },
  "Bionic Eye (One)": { procedure: "major", eye: true },
  "Bionic Eye (Two)": { procedure: "major", eye: true, count: 2 },
  "Bionic Leg (One)": { procedure: "major" },
  "Bionic Leg (Two)": { procedure: "major", count: 2 },
  "Bionic Organ Transplant": { procedure: "major", eased: at(11, "minor") },
  "Boosted Heart": { procedure: "major", eased: at(11, "minor") },
  "Cybervoder": { procedure: "minor" },
  "Silvertongue Implant": { procedure: "minor" },
  "Bomb Implant": { procedure: "simple" },
  "Boosted Reflexes": { procedure: "major", eased: at(10, "minor") },
  "Cyber Claws": { procedure: "minor" },
  "Cyber Claws (in Bionic Hands)": { procedure: "simple" },
  "Filter Implant": { procedure: "minor", eased: at(11, "simple") },
  "Flesh Pocket": { procedure: "simple" },
  "Gyrobalance": { procedure: "minor" },
  "Hidden Compartments": { procedure: "simple" },
  "Implant Radio": { procedure: "simple" },
  "Implant Video Comm": { procedure: "minor", eased: at(10, "simple") },
  "Memory Flesh": { procedure: "radical", eased: at(10, "major") },
  "Subdermal Armor": { procedure: "radical", eased: at(10, "major") },
  "Smart Tattoos": { procedure: "simple" },
  "Stinger": { procedure: "minor" },
  "Bionic Arm Weapon Mount": { procedure: "minor" },
  "Bionic Hand Weapon Mount": { procedure: "minor" },
  "Heavy Weapon Arm Mount": { procedure: "minor" },
  "Accelerated Reflexes": { procedure: "radical", eased: at(12, "major") },
  "Bioplastic Skin": { procedure: "major" },
  "Cyberhair (Shoulder-Length)": { procedure: "major", eased: at(11, "minor") },
  "Cyberhair (Waist-Length)": { procedure: "major", eased: at(11, "minor") },
  "Cyberhair (Knee-Length)": { procedure: "major", eased: at(11, "minor") },
  "Variskin": { procedure: "minor", eased: at(11, "simple") },
  "Gill Implant": { procedure: "major", eased: at(11, "minor") },
  "Hive Implant": { procedure: "minor" },
  "Intestinal Recycler": { procedure: "major", eased: at(11, "minor") },
  "Nanoweave Subdermal Armor": { procedure: "major", eased: at(11, "minor") },
  "Polyskin Body": { procedure: "radical" },
  "Polyskin Face": { procedure: "major" },
  "Reinforced Skeleton": { procedure: "radical", eased: at(11, "major") },
  "Ripsnake": { procedure: "major" },
  "Sexmorph": { procedure: "major", eased: at(12, "minor") },
  "Slickskin": { procedure: "major", eased: at(11, "minor") },
  "Thermal Imaging Eyes": { procedure: "major", eye: true, count: 2 },
  "Hyperspectral Eyes": { procedure: "major", eye: true, count: 2 },
  "Hyperdense Skeleton": { procedure: "radical", eased: at(12, "major") },
  "Monocrys Subdermal Armor": { procedure: "major" },
  "Living Metal Skin": { procedure: "radical" },
  // Brain implants (pp. 215-218).
  "Braintap Jack": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Wireless Braintap": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Computer Implant": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Chip Slots": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Skip Slots": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Neural Interface Jack": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Wireless Neural Interface": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Neurotherapy Implant": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Psych Implant": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Biological Operating System Implant (BOS)": { procedure: "major", ...BRAIN, eased: at(11, "minor") },
  "Sensie Transeiver Jack": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Wireless Sensie Transceiver": { procedure: "major", ...BRAIN, eased: at(10, "minor") },
  "Cognitive Enhancement": { procedure: "major", ...BRAIN },
  "Puppet Implant": { procedure: "radical", ...BRAIN, eased: at(10, "major") },
  "Backup Brain": { procedure: "radical", ...BRAIN },
  // Uplift (pp. 218-219).
  "Finger Paws": { procedure: "major", count: 2, eased: at(11, "minor") },
  "Neural Uplift": { procedure: "radical", ...BRAIN, eased: at(10, "major") },
  // Total cyborgs (p. 219).
  "Total Cyborg Brain Transplant": { procedure: "radical", ...BRAIN, eased: at(10, "major") },
};

/** An implant's procedure entry by name, or null. */
export function implantOf(name: string): ImplantProcedure | null {
  const key = String(name ?? "").trim();
  return IMPLANTS[key] ?? Object.entries(IMPLANTS).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? null;
}

/** The procedure an implant takes at a TL. */
export function procedureAt(entry: ImplantProcedure, tl: number): Procedure {
  let procedure = entry.procedure;
  for (const step of entry.eased ?? []) if (tl >= step.tl) procedure = step.procedure;
  return procedure;
}

/** One step easier: a neural uplift on an animal of racial IQ 1-3 (p. 219). */
export function easier(procedure: Procedure): Procedure {
  return PROCEDURES[Math.max(0, PROCEDURES.indexOf(procedure) - 1)]!;
}

/** What an operation is. */
export type Operation = "install" | "remove" | "removeScrap" | "salvage";

/** An operation's terms: the Surgery modifier, minutes, injury on failure, recovery and fee (pp. 207-208). */
export interface OperationTerms {
  modifier: number;
  minutes: number;
  injury: string;
  recoverySeconds: number;
  fee: number;
  /** Mechanic (Robotics) may stand in for Surgery. */
  mechanicAllowed: boolean;
}

export function operationTerms(procedure: Procedure, options: { operation: Operation; brainOrEye: boolean; robotic: boolean }): OperationTerms {
  const row = PROCEDURE_TABLE[procedure];
  let modifier = options.brainOrEye ? row.brainModifier : row.modifier;
  let minutes = row.minutes;
  let injury = row.injury;
  let recoverySeconds = row.recoverySeconds;
  let fee = row.fee;
  // Without robotic instruments, double the recovery and the damage; a simple procedure's failure does 1d/2 (p. 207).
  if (!options.robotic) {
    recoverySeconds *= 2;
    injury = procedure === "simple" ? "1d/2" : doubleDamage(injury);
  }
  if (options.operation === "remove") modifier += 1;
  if (options.operation === "removeScrap") {
    modifier += 2;
    minutes /= 2;
  }
  // From a corpse: a third of the time, a tenth of the fee, and no one to recover (p. 208).
  if (options.operation === "salvage") {
    minutes /= 3;
    fee /= 10;
    recoverySeconds = 0;
    injury = "";
  }
  if (options.operation !== "install") recoverySeconds = options.operation === "salvage" ? 0 : recoverySeconds;
  return { modifier, minutes, injury, recoverySeconds, fee, mechanicAllowed: options.operation === "salvage" };
}

/** A damage formula doubled: "1d" is "2d", "1d/2" is "1d", "3d" is "6d", "1" is "2". */
export function doubleDamage(formula: string): string {
  const half = /^(\d+)d\/2$/.exec(formula);
  if (half) return `${half[1]}d`;
  const dice = /^(\d+)d$/.exec(formula);
  if (dice) return `${Number(dice[1]) * 2}d`;
  const flat = Number(formula);
  return Number.isFinite(flat) ? String(flat * 2) : formula;
}

/** What an operation's roll came to (p. 207). */
export interface OperationOutcome {
  installed: boolean;
  recoverySeconds: number;
  /** The injury to roll, doubled on a critical failure, or "" for none. */
  injury: string;
  /** A critical failure: defective cybernetics, or brain injury for major or radical brain surgery. */
  defective: boolean;
  brainInjury: boolean;
}

export function operationOutcome(terms: OperationTerms, roll: { success: boolean; critical: boolean }, options: { procedure: Procedure; brain: boolean }): OperationOutcome {
  if (roll.success) {
    return { installed: true, recoverySeconds: roll.critical ? terms.recoverySeconds / 2 : terms.recoverySeconds, injury: "", defective: false, brainInjury: false };
  }
  return {
    installed: false,
    recoverySeconds: 0,
    injury: roll.critical && terms.injury ? doubleDamage(terms.injury) : terms.injury,
    defective: roll.critical,
    brainInjury: roll.critical && options.brain && (options.procedure === "major" || options.procedure === "radical"),
  };
}

/** A recovery period as the table gives it: hours, days or weeks. */
export function recoveryText(seconds: number): { value: number; unit: "hours" | "days" | "weeks" } {
  const hours = seconds / 3600;
  if (hours < 24) return { value: Math.round(hours * 10) / 10, unit: "hours" };
  const days = hours / 24;
  if (days < 7 || days % 7 !== 0) return { value: Math.round(days * 10) / 10, unit: "days" };
  return { value: days / 7, unit: "weeks" };
}

/**
 * How long a surge keeps electrical implants out, by margin of failure: seconds for an EMP
 * warhead (p. 157), minutes for a microwave disruptor (p. 121). At least 1.
 */
export function surgeOutage(source: "emp" | "microwave", margin: number): { seconds: number; value: number; unit: "seconds" | "minutes" } {
  const value = Math.max(1, Math.floor(margin));
  return source === "emp" ? { seconds: value, value, unit: "seconds" } : { seconds: value * 60, value, unit: "minutes" };
}

// ── parts and prices (pp. 208, 216-219) ──────────────────────────────────────

/** Second-hand parts are (1d+1) × 10% of the price, salvaged ones (1d+1) × 5% (p. 208). */
export function usedPercent(kind: "secondHand" | "salvaged", die: number): number {
  const d = Math.max(1, Math.min(6, Math.floor(die)));
  return (d + 1) * (kind === "secondHand" ? 10 : 5);
}

/** Chip slots: $5,000 a slot plus $3,000 a point a chip can hold; at most TL-7 slots and (TL-7) × 5 points a chip (p. 216). */
export function chipSlotPrice(slots: number, pointsPerChip: number): number {
  return 5000 * Math.max(0, Math.floor(slots)) + 3000 * Math.max(0, Math.floor(pointsPerChip));
}
export function chipSlotCaps(tl: number): { slots: number; pointsPerChip: number } {
  const n = Math.max(0, Math.floor(tl) - 7);
  return { slots: n, pointsPerChip: n * 5 };
}
/** A skill chip's price a character point at a TL (p. 216). */
export function skillChipPricePerPoint(tl: number): number {
  return tl >= 12 ? 100 : tl >= 11 ? 200 : tl >= 10 ? 500 : 1000;
}

/** Cognitive enhancement: $5,000 a point, at most 15, 45 or 60 points an operation by TL (p. 217). */
export function cognitiveCap(tl: number): number {
  return tl >= 12 ? 60 : tl >= 11 ? 45 : tl >= 10 ? 15 : 0;
}
export const COGNITIVE_PRICE_PER_POINT = 5000;

/** Neurotherapy $500 and psych implants $1,000 a point of disadvantage (p. 217). */
export const DISADVANTAGE_PRICE = { neurotherapy: 500, psych: 1000 } as const;

/** Weapon mounts: $100 a pound of weapon (p. 212). */
export const MOUNT_PRICE_PER_LB = 100;

/** Neural uplift: $5,000 × the animal's racial IQ (p. 219). */
export const UPLIFT_PRICE_PER_IQ = 5000;

/**
 * The Will roll's modifier to shake off (or keep off) a psych implant's
 * disadvantage once it's removed: +4 after three months, -1 for each doubling
 * of the time; none is needed before three months (p. 217).
 */
export function psychPermanenceModifier(months: number): number | null {
  if (!(months >= 3)) return null;
  return 4 - Math.floor(Math.log2(months / 3) + 1e-9);
}

/** Finding implants: Electronics Operation (Medical) or Diagnosis with a scanner (p. 208). */
export const DETECT_SKILLS = ["Electronics Operation (Medical)", "Diagnosis"] as const;

/**
 * An implant seed (p. 202): twice the implant's price, it grows only implants
 * that take a minor or simple operation at TL11, an hour for each $50 of cost.
 */
export const IMPLANT_SEED = Object.freeze({ costFactor: 2, tl: 11, dollarsPerHour: 50 });
export function seedGrows(entry: ImplantProcedure): boolean {
  const procedure = procedureAt(entry, IMPLANT_SEED.tl);
  return procedure === "minor" || procedure === "simple";
}
export function seedHours(cost: number): number {
  return Math.ceil(Math.max(0, Number(cost) || 0) / IMPLANT_SEED.dollarsPerHour);
}

/**
 * A bomb implant uses a smart grenade's cost (p. 210): a 40mm (mini) grenade is
 * $10 and a 25mm (thimble) $2.50 (p. 146), and a smart grenade adds $100 at TL9,
 * nothing at TL10+ (p. 147). The book prices no 15mm or 10mm hand grenade.
 */
export const BOMB_CALIBRES = ["40", "25", "15", "10"] as const;
export type BombCalibre = (typeof BOMB_CALIBRES)[number];
export function bombImplantCost(calibre: BombCalibre, tl: number): number | null {
  const grenade = calibre === "40" ? 10 : calibre === "25" ? 2.5 : null;
  if (grenade === null) return null;
  return grenade + (tl <= 9 ? 100 : 0);
}

/** A cyber-trap: Traps-4 to notice it before it goes off, no penalty looking for it; a Traps roll to disarm (p. 208). */
export const CYBER_TRAP = Object.freeze({ notice: -4, looking: 0 });

/** The disadvantage a replacement implant makes up for, suffered again while it heals in (Characters pp. 147, 149, 151, 142). */
const REPLACES: ReadonlyArray<[RegExp, { name: string; points: number }]> = [
  [/^bionic arm \(one\)/i, { name: "One Arm", points: -20 }],
  [/^bionic arm \(two\)/i, { name: "No Manipulators", points: -50 }],
  [/^bionic hand/i, { name: "One Hand", points: -15 }],
  [/^bionic eye \(one\)/i, { name: "One Eye", points: -15 }],
  [/^bionic eye \(two\)/i, { name: "Blindness", points: -50 }],
  [/^bionic ears/i, { name: "Deafness", points: -20 }],
  [/^bionic leg \(one\)/i, { name: "Lame (Missing Legs)", points: -20 }],
  [/^bionic leg \(two\)/i, { name: "Lame (Legless)", points: -30 }],
];

/** What a character suffers again while an implant recovers: the limb or sense it replaces. */
export function restoredWhileRecovering(implant: string): Array<{ name: string; points: number }> {
  const found = REPLACES.find(([pattern]) => pattern.test(implant.trim()));
  return found ? [{ ...found[1] }] : [];
}
