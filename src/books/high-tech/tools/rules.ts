/**
 * High-Tech's tools, forced entry and household hazards, as pure rules
 * (pp. 24-33, 50). What the system meets them through is in `index.ts`.
 *
 *   - **Tool kits (p. 24):** a mini-tool kit is -2 for the one specialty it
 *     is made for; a portable kit is basic equipment for its own specialty
 *     and -2 for the skill's other specialties; a workshop is +2 for its own,
 *     and the wrong shop is better than nothing, -2 for a reasonably close
 *     craft to -5 for a distant one. Kits and shops for the arts and light
 *     crafts cost a quarter and weigh a tenth. A vehicle mechanic's or
 *     armourer's kit or shop does major repairs up to 10 tons; a larger one
 *     costs and weighs (tons)/10 times as much.
 *   - **Labs and machine shops (pp. 29, 50):** a portable lab takes a while
 *     to set up or pack; a computer-aided workshop turns out so many pounds
 *     of parts an hour from a CAD project file.
 *   - **Forced-entry tools (pp. 25-30):** saws, drills, cutters and torches
 *     do their damage each second of work (or each bite, or every few
 *     seconds), against the materials the book names; heavy bolt cutters want
 *     an ST+4 roll; a rock drill and a lock buster pass on the blow of the
 *     sledgehammer that strikes them, the lock buster doubled against a
 *     padlock. The hand ram needs two Ready maneuvers between strikes for
 *     anybody short of ST 20, the hydraulic door opener three of pumping, and
 *     the spreader/cutter four to open its jaws. The glass cutter wants a DX
 *     or Forced Entry roll (-6 in a realistic game); duct tape holds a
 *     prisoner until a ST-3 or Escape roll.
 *   - **Chainsaws (pp. 27-28):** an (0.5) armour divisor against concrete,
 *     metal and the like; a blow that fails to penetrate rolls 1d: 1-2
 *     nothing, 3-5 the saw stalls, 6 the chain snaps (at TL7 it strikes the
 *     wielder for 1d cutting; at TL8 the saw is broken until repaired). A
 *     carbide chain costs double and drops the divisor and the mishaps.
 *   - **Nail guns (p. 28):** fired at DX-4 or Guns (Pistol)-4.
 *   - **Household hazards (pp. 31-33):** a ruptured propane cylinder is a
 *     burning explosion with 1d cutting fragments; stoves, blenders, coffee,
 *     hotplates, toasters and waffle irons burn or cut; an institutional
 *     microwave does a hit point a second; and lead is a slow digestive
 *     poison whose victim, past half their HP, suffers worse.
 */

/** What size a kit of tools is (p. 24): blank for gear that isn't one. */
export const KIT_SIZES = ["", "mini", "portable", "workshop"] as const;
export type KitSize = (typeof KIT_SIZES)[number];

/** A portable kit or a workshop used for another specialty of its skill (p. 24). */
export const OTHER_SPECIALTY: Readonly<Partial<Record<KitSize, number>>> = { portable: -2, workshop: -2 };

/** The wrong workshop: a reasonably close craft, and a distant one (p. 24). */
export const CLOSE_CRAFT = -2;
export const DISTANT_CRAFT = -5;

/** Kits and shops for the arts and light crafts (p. 24). */
export const LIGHT_CRAFT = Object.freeze({ cost: 0.25, weight: 0.1 });

/** The vehicle a mechanic's or armourer's kit or shop does major repairs on, in tons (p. 24). */
export const VEHICLE_TONS = 10;

/** A skill's name compared as the system compares tools with skills, without its specialty. */
export function skillBase(key: string): string {
  return key.replace(/\s*\(.*$/, "").trim();
}

/** A comma- or semicolon-separated list, as a person types one. */
export function listOf(text: unknown): string[] {
  return String(text ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** A kit the character carries, as the wrong-specialty rule reads it. */
export interface CarriedKit {
  size: KitSize;
  /** The skills it is the tools of (`forSkills`). */
  skills: readonly string[];
  /** A workshop's reasonably close crafts, and its distant ones. */
  close: readonly string[];
  distant: readonly string[];
}

/**
 * What a kit is worth to a skill it isn't made for (p. 24), or null where it
 * is no help: its own skill (which the system already reads) or one it has
 * nothing to do with. `key` is the system's `toolSkillKey`.
 */
export function kitFor(kit: CarriedKit, skill: string, key: (name: string) => string): number | null {
  const wanted = key(skill);
  if (!wanted || !kit.size) return null;
  const own = kit.skills.map(key).filter(Boolean);
  if (own.includes(wanted)) return null;
  let best: number | null = null;
  const take = (value: number | undefined) => { if (value !== undefined && (best === null || value > best)) best = value; };
  if (own.some((k) => skillBase(k) === skillBase(wanted))) take(OTHER_SPECIALTY[kit.size]);
  if (kit.size === "workshop") {
    const named = (list: readonly string[]) => list.map(key).some((k) => k === wanted || (!k.includes("(") && k === skillBase(wanted)));
    if (named(kit.close)) take(CLOSE_CRAFT);
    if (named(kit.distant)) take(DISTANT_CRAFT);
  }
  return best;
}

/** The best any of the kits is worth to a skill none is made for, or null for none. */
export function wrongKitModifier(kits: readonly CarriedKit[], skill: string, key: (name: string) => string): number | null {
  const values = kits.map((kit) => kitFor(kit, skill, key)).filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

/** What a kit's price is multiplied by: a light craft's, and a large vehicle's (p. 24). */
export function kitPriceMultipliers(kit: { lightCraft: boolean; vehicleTons: number }): { cost: number; weight: number } {
  const tons = Number(kit.vehicleTons) || 0;
  const vehicle = tons > VEHICLE_TONS ? tons / VEHICLE_TONS : 1;
  return {
    cost: (kit.lightCraft ? LIGHT_CRAFT.cost : 1) * vehicle,
    weight: (kit.lightCraft ? LIGHT_CRAFT.weight : 1) * vehicle,
  };
}

/** A tool's work: the damage it does to what it is used on (pp. 25-30). */
export interface Work {
  /** "sw-3", "thr", or dice ("1d+2", "12d", "1"). */
  damage: string;
  type: string;
  divisor: number;
  /** Seconds each application takes: 1 for "per second", 0 for a single blow or bite. */
  every: number;
  /** Times the damage is multiplied: a lock buster's 2 against a padlock. */
  multiplier: number;
  /** A key naming what it works on; blank for anything. */
  against: string;
  /** The ST roll using it takes, as a modifier (heavy bolt cutters: +4), or null for none. */
  stRoll: number | null;
  /** What a carbide or diamond edge adds to the damage (p. 25). */
  carbideBonus: number;
}

/** What a tool works on, by the keys the records use (pp. 25-30). */
export const WORK_MATERIALS = ["", "wood", "metalBars", "rope", "woodPlasticMetal", "concreteRock", "rock", "padlock"] as const;
export type WorkMaterial = (typeof WORK_MATERIALS)[number];

/** Adds to a dice formula: "1d+2" and 1 make "1d+3"; "12d" and -1 make "12d-1". */
export function addToDice(formula: string, bonus: number): string {
  const n = Math.trunc(Number(bonus) || 0);
  if (!n) return formula;
  const m = /^(\d*d)([+-]\d+)?$/i.exec(formula.trim());
  if (m) {
    const adds = (Number(m[2]) || 0) + n;
    return `${m[1]}${adds > 0 ? `+${adds}` : adds < 0 ? String(adds) : ""}`;
  }
  const flat = Number(formula);
  return Number.isFinite(flat) && formula.trim() !== "" ? String(flat + n) : formula;
}

/**
 * The damage a tool's work does in a character's hands: a thrust or swing is
 * the character's, through `strike`; dice are the tool's own. A carbide edge
 * adds its bonus, and a multiplier is written on the end ("2d+5x2").
 */
export function workDamage(work: Pick<Work, "damage" | "multiplier" | "carbideBonus">, strike: (base: "thr" | "sw", modifier: number) => string, carbide: boolean): string {
  const bonus = carbide ? work.carbideBonus : 0;
  const text = work.damage.trim();
  const muscle = /^(sw|thr)\s*([+-]\s*\d+)?$/i.exec(text);
  const damage = muscle
    ? strike(muscle[1]!.toLowerCase() as "thr" | "sw", (Number((muscle[2] ?? "0").replace(/\s+/g, "")) || 0) + bonus)
    : addToDice(text, bonus);
  return work.multiplier > 1 && damage ? `${damage}x${work.multiplier}` : damage;
}

/**
 * The Ready maneuvers a tool takes before each use (pp. 29-30): the hand
 * ram's two between strikes, waived for a wielder of ST 20 or more; the door
 * opener's three of pumping; the spreader's four to open its jaws.
 */
export function readiesNeeded(readies: number, waivedAtSt: number, st: number): number {
  if (waivedAtSt > 0 && st >= waivedAtSt) return 0;
  return Math.max(0, Math.floor(Number(readies) || 0));
}

/** A chainsaw's armour divisor against concrete, metal and the like (p. 27). */
export const HARD_MATERIAL_DIVISOR = 0.5;

/** A carbide chain's price (p. 28). */
export const CARBIDE_CHAIN_COST = 2;

/** What a chainsaw does on a blow that fails to penetrate DR (p. 27), from 1d. */
export type ChainsawMishap = "none" | "stall" | "snap";
export function chainsawMishap(roll: number): ChainsawMishap {
  const die = Math.floor(Number(roll) || 0);
  if (die >= 6) return "snap";
  return die >= 3 ? "stall" : "none";
}

/** A snapped chain lashes the wielder at TL7, and only breaks the saw at TL8 (p. 27). */
export function snapStrikesWielder(tl: number): boolean {
  return tl < 8;
}

/** The snapped chain's blow on the wielder (p. 27). */
export const SNAPPED_CHAIN = Object.freeze({ damage: "1d", type: "cut" });

/** A nail gun's penalty to Guns (Pistol) (p. 28). */
export const NAIL_GUN_PENALTY = -4;

/**
 * A nail gun's skill (p. 28): DX-4 or Guns (Pistol)-4. The system already
 * rolls a character without the skill at its default, DX-4; one with it
 * rolls it at -4, which is never below DX-4 for a skill bought with points.
 */
export function nailGunLevel(level: number, atDefault: boolean): number {
  return atDefault ? level : level + NAIL_GUN_PENALTY;
}

/** The glass cutter (p. 26): -6 in a realistic game; a critical failure cuts the hand. */
export const GLASS_CUTTER_REALISTIC = -6;
export const GLASS_CUTTER_WOUND = Object.freeze({ damage: "1d-2", type: "cut" });

/** What cutting a disk of glass comes to: done, a noisy break, or a noisy break and a cut hand (p. 26). */
export function glassCutterOutcome(success: boolean, criticalFailure: boolean): "cut" | "noisy" | "cutHand" {
  if (success) return "cut";
  return criticalFailure ? "cutHand" : "noisy";
}

/** Duct tape as a restraint (p. 26): ST-3, or Escape. */
export const DUCT_TAPE_ST = -3;

/** The roll a taped prisoner breaks free with: the better of ST-3 and Escape (p. 26). */
export function breakFreeRoll(st: number, escape: number | null): { skill: "ST" | "Escape"; level: number } {
  const byStrength = Math.floor(Number(st) || 10) + DUCT_TAPE_ST;
  return escape !== null && escape > byStrength ? { skill: "Escape", level: escape } : { skill: "ST", level: byStrength };
}

/** What a household thing does when it hurts somebody (pp. 31-32). */
export const HAZARD_KINDS = ["", "explosion", "burn", "cut", "injury"] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/** A propane cylinder ruptured near a flame is a burning explosion throwing 1d cutting fragments (p. 31). */
export const PROPANE_FRAGMENTS = "1d";
/** The DR a propane cylinder's rupturing blow has to get through (p. 31). */
export const PROPANE_DR = 6;

/** GURPS's dice in order: 1d-1, 1d, 1d+1, 1d+2, 2d-1, 2d, ... */
function diceIndex(formula: string): number | null {
  const m = /^(\d+)d([+-]\d+)?$/i.exec(formula.trim());
  if (!m) return null;
  const dice = Number(m[1]);
  const adds = Number(m[2] ?? 0);
  if (adds < -1 || adds > 2) return null;
  return dice * 4 + adds;
}

function diceAt(index: number): string {
  const dice = Math.floor((index + 1) / 4);
  const adds = index - dice * 4;
  return `${dice}d${adds > 0 ? `+${adds}` : adds < 0 ? String(adds) : ""}`;
}

/**
 * The dice a hazard printed as a range does, from least to most: a hot
 * stove's "1d-1 to 2d, by the temperature" (p. 32) is 1d-1, 1d, 1d+1, 1d+2,
 * 2d-1 and 2d. A single figure is a range of one.
 */
export function diceRange(from: string, to: string): string[] {
  const a = diceIndex(from);
  const b = to.trim() ? diceIndex(to) : a;
  if (a === null || b === null || b < a) return [from];
  return Array.from({ length: b - a + 1 }, (_, i) => diceAt(a + i));
}

/**
 * Lead (p. 33): digestive, at a dose of a quarter-ounce or more, three
 * months' delay, HT-4 to resist, 1d toxic, again every six weeks for three
 * cycles. A month is taken as 30 days.
 */
export const LEAD_POISON = Object.freeze({
  name: "Lead",
  delivery: ["digestive"],
  delaySeconds: 90 * 86400,
  resistanceModifier: -4,
  damage: "toxic",
  dice: 1,
  adds: 0,
  intervalSeconds: 42 * 86400,
  cycles: 3,
  reference: "High-Tech p. 33",
});

/** Whether a cycle of lead poisoning has taken the victim past half their HP, where the worse symptoms start (p. 33). */
export function leadSymptomsWorsen(thresholds: readonly string[]): boolean {
  return thresholds.includes("1/2");
}
