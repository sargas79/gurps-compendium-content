/**
 * The Electricity and Electronics supplement's conventions for its devices
 * (HT:EE pp. 8-9, 15), as pure functions: what a newly released device costs,
 * and a used one, what a prototype is under the Basic Set's invention rules,
 * a device's HP, HT and DR where its record states none, what a drop does to
 * its fragile parts and what the parts left below 0 HP do in use, and what
 * building one from a kit costs and takes.
 *
 * The Basic Set's own rules (the invention table, falling and collision
 * damage, an object's hit points and state) are the system's, handed in by
 * the caller from `api.rules`, so nothing here imports the system.
 */

/** The Basic Set's equipment grades, as the system's items keep them (Campaigns p. 345). */
export type EquipmentQuality = "none" | "improvised" | "basic" | "good" | "fine" | "best";

/** The Basic Set's four invention grades (Campaigns p. 473). */
export const COMPLEXITIES = ["simple", "average", "complex", "amazing"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

// ── cutting edge (HT:EE p. 8) ────────────────────────────────────────────────

/**
 * What a cutting-edge device costs at each grade, as a multiple of its listed
 * price: one grade up from the Basic Set's (Campaigns p. 345), so basic
 * quality costs what good would and good what fine would. Fine isn't normally
 * to be had while the device is new, so it has no price (HT:EE p. 8).
 */
export const CUTTING_EDGE_COST: Readonly<Partial<Record<EquipmentQuality, number>>> = { basic: 5, good: 20 };

/** What the Basic Set charges for each grade over the basic price (Campaigns p. 345). */
const GRADE_COST: Readonly<Partial<Record<EquipmentQuality, number>>> = { basic: 1, good: 5, fine: 20 };

/**
 * The factor a cutting-edge device's price is multiplied by, over the price
 * the system already asks for its grade (which holds the grade's x5 or x20):
 * x5 at basic, x4 at good (x20 in all). Null where the grade has no
 * cutting-edge price -- fine, which isn't sold new, and the grades nobody buys.
 */
export function cuttingEdgeFactor(quality: string): number | null {
  const q = quality as EquipmentQuality;
  const edge = CUTTING_EDGE_COST[q];
  const grade = GRADE_COST[q];
  return edge && grade ? edge / grade : null;
}

/** Whether a grade can't be bought for a cutting-edge device at all (HT:EE p. 8). */
export function unavailableWhileNew(quality: string): boolean {
  return quality === "fine";
}

// ── prototypes (HT:EE p. 8; Campaigns pp. 473-474) ──────────────────────────

/** The complexity a record gives, or null for none. */
export function complexityOf(value: unknown): Complexity | null {
  const v = String(value ?? "").trim().toLowerCase();
  return (COMPLEXITIES as readonly string[]).includes(v) ? (v as Complexity) : null;
}

/** A year as a record keeps it: a whole number, 0 for none. */
export function yearOf(value: unknown): number | null {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? n : null;
}

/** One row of the Basic Set's invention table, as `rules.gradeRow` gives it. */
export interface GradeRow {
  skill: number;
  concept: number;
  prototypeTime: { dice: { dice: number; adds: number }; unit: "days" | "months" };
  facilities: number;
}

/**
 * What it takes to invent a device of this complexity under the Basic Set
 * (Campaigns pp. 473-474), which a prototype's record points to (HT:EE p. 8):
 * the skill needed, the Concept roll's penalty, a Prototype roll's time and
 * the facilities' cost. An inventor of a later TL finds it a grade easier for
 * each TL he is ahead (p. 473), so the grade he faces comes first.
 */
export function inventionFigures(options: {
  complexity: Complexity;
  inventorTl: number | null;
  deviceTl: number | null;
  gradeRow: (grade: Complexity) => GradeRow;
  reinventing: (o: { grade: Complexity; inventorTl: number; inventionTl: number }) => Complexity;
}): { grade: Complexity; easier: boolean; row: GradeRow } {
  const { complexity, inventorTl, deviceTl } = options;
  const grade = inventorTl !== null && deviceTl !== null
    ? options.reinventing({ grade: complexity, inventorTl, inventionTl: deviceTl })
    : complexity;
  return { grade, easier: grade !== complexity, row: options.gradeRow(grade) };
}

/**
 * The time to make one copy of a device (Campaigns p. 474): half a Prototype
 * roll's for its grade -- a Complex item's copy takes 1d/2 months. Given as
 * the prototype's dice and unit, to be halved.
 */
export function copyTime(row: GradeRow): { dice: number; adds: number; unit: "days" | "months"; divisor: 2 } {
  return { dice: row.prototypeTime.dice.dice, adds: row.prototypeTime.dice.adds, unit: row.prototypeTime.unit, divisor: 2 };
}

// ── a device's HP, HT and DR (HT:EE p. 9) ───────────────────────────────────

/** HT when the record states none (HT:EE p. 9). */
export const DEVICE_HT = 10;
/** DR when the record states none, and a fragile device's -- a bulb, a tube (HT:EE p. 9). */
export const DEVICE_DR = 2;
export const FRAGILE_DR = 0;
/** A device of negligible weight has 1 HP (HT:EE p. 9). */
export const NEGLIGIBLE_HP = 1;

/**
 * A device's HP, HT and DR (HT:EE p. 9): HP from its weight as an Unliving
 * object (Campaigns p. 558's column, the system's `objectHitPoints`), 1 for
 * one of negligible weight; HT 10; DR 2, or 0 for a fragile one. What the
 * record states wins over each.
 */
export function deviceStatistics(options: {
  weight: number;
  fragile: boolean;
  stated: { hp: number | null; ht: number | null; dr: number | null };
  hitPoints: (weight: number) => number;
}): { hp: number; ht: number; dr: number } {
  const weight = Math.max(0, Number(options.weight) || 0);
  const fromWeight = weight > 0 ? Math.max(NEGLIGIBLE_HP, options.hitPoints(weight)) : NEGLIGIBLE_HP;
  return {
    hp: options.stated.hp ?? fromWeight,
    ht: options.stated.ht ?? DEVICE_HT,
    dr: options.stated.dr ?? (options.fragile ? FRAGILE_DR : DEVICE_DR),
  };
}

// ── breakable parts (HT:EE p. 8) ────────────────────────────────────────────

/** Where a device lands: hard (a hardwood floor, concrete) doubles its HP in the collision (Campaigns p. 431). */
export type Surface = "hard" | "soft";

/** What a fragile part has become, as the Basic Set's object states name it (Campaigns p. 484). */
export type PartState = "sound" | "damaged" | "failing" | "breaking" | "destroyed";

/**
 * What one fragile part comes to after a drop (HT:EE p. 8): it takes the
 * whole rolled damage with no DR -- the device's DR doesn't shield it -- and
 * is judged as an object (Campaigns p. 484). At -1xHP or worse it must roll
 * HT or break, as the book's tubes at -1 HP do; at -5xHP it is gone.
 */
export function partOutcome(options: {
  damage: number;
  hp: number;
  state: (current: number, max: number) => PartState;
}): { hpLeft: number; state: PartState; rollsHt: boolean } {
  const hp = Math.max(1, Math.floor(options.hp) || 1);
  const hpLeft = hp - Math.max(0, Math.floor(options.damage) || 0);
  const state = options.state(hpLeft, hp);
  return { hpLeft, state, rollsHt: state === "breaking" };
}

/** What the device itself takes from the same roll: whatever gets through its DR (HT:EE p. 8). */
export function deviceInjury(damage: number, dr: number): number {
  return Math.max(0, Math.floor(damage) - Math.max(0, Math.floor(dr)));
}

/**
 * How many of `count` like parts break: all of them past -5xHP, none short of
 * -1xHP, and between, each whose HT roll (3d, one per part) fails.
 */
export function partsBroken(state: PartState, count: number, htRolls: readonly number[], ht: number): number {
  const parts = Math.max(0, Math.floor(count) || 0);
  if (state === "destroyed") return parts;
  if (state !== "breaking") return 0;
  return htRolls.slice(0, parts).filter((roll) => !succeeds(roll, ht)).length;
}

/**
 * How many parts are left below 0 HP but working after a drop, each to roll
 * HT for every second the device is used (Campaigns p. 484): every whole part
 * at 0 HP or less, and the survivors of the HT rolls at -1xHP, who are no
 * better off. A drop that leaves the parts sound or merely damaged keeps the
 * count as it was; one that destroys them leaves none.
 */
export function partsFailing(state: PartState, whole: number, broken: number, before: number): number {
  const left = Math.max(0, Math.floor(whole) - Math.max(0, Math.floor(broken)));
  if (state === "failing" || state === "breaking") return left;
  if (state === "destroyed") return 0;
  return Math.min(left, Math.max(0, Math.floor(before) || 0));
}

/**
 * How many of the failing parts stop working in a second of use: each whose
 * HT roll (3d, one per part) fails. A part that stops is out until replaced,
 * as a broken one is.
 */
export function partsStopping(htRolls: readonly number[], failing: number, ht: number): number {
  return htRolls.slice(0, Math.max(0, Math.floor(failing) || 0)).filter((roll) => !succeeds(roll, ht)).length;
}

// ── used devices (HT:EE p. 8) ───────────────────────────────────────────────

/**
 * What a used device sells for, as a percentage of the new price: 50% to 80%
 * for a recent model, down to 10% or less for an old one that still works
 * (HT:EE p. 8). The GM picks the figure; these are the book's bounds.
 */
export const USED_RECENT = Object.freeze({ min: 50, max: 80 });
export const USED_OLD = 10;

/** A used price's percentage as the record keeps it: a whole number from 1 to 100, 0 for new. */
export function usedPercent(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return n > 0 ? Math.min(100, n) : 0;
}

/** A device's price bought used at `percent` of new, to the cent; the price itself when new. */
export function usedPrice(cost: number, percent: number): number {
  const p = usedPercent(percent);
  return p ? Math.round(Math.max(0, cost) * p) / 100 : cost;
}

/** A 3d roll against a target: 3-4 always succeed, 17-18 always fail (Campaigns p. 348), and the rest at or under it. */
function succeeds(roll: number, target: number): boolean {
  if (roll <= 4) return true;
  if (roll >= 17) return false;
  return roll <= target;
}

// ── kits (HT:EE p. 15) ──────────────────────────────────────────────────────

/** A copy built from parts costs 20% of retail (Campaigns p. 474); a kit's instructions add 5% (HT:EE p. 15). */
export const KIT_PARTS = 0.2;
export const KIT_INSTRUCTIONS = 0.05;

/** What a kit sells for: its parts and instructions, a quarter of the device's price (HT:EE p. 15). */
export function kitPrice(retail: number): number {
  return Math.round(Math.max(0, retail) * (KIT_PARTS + KIT_INSTRUCTIONS) * 100) / 100;
}

/**
 * The level a kit is built at (HT:EE p. 15): its instructions count as the
 * One-Task Wonder perk for the one device, so IQ, or a Hobby Skill, stands in
 * for the Engineer roll a copy would take. The best of them.
 */
export function kitBuilder(options: { iq: number; hobbies: ReadonlyArray<{ name: string; level: number }> }): { name: string | null; level: number } {
  const best = [...options.hobbies].filter((h) => Number.isFinite(h.level)).sort((a, b) => b.level - a.level)[0];
  return best && best.level > options.iq ? { name: best.name, level: best.level } : { name: null, level: options.iq };
}

/** The grade a device counts as for a copy's time: its record's complexity, else its retail price's (Campaigns p. 473). */
export function kitGrade(complexity: Complexity | null, retail: number, gradeForPrice: (retail: number) => Complexity): Complexity {
  return complexity ?? gradeForPrice(Math.max(0, retail));
}
