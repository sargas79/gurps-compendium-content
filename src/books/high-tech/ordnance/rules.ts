/**
 * High-Tech's grenades, land mines, rifle grenades and nuclear weapons
 * (pp. 189-196), as pure rules: the figures the book prints and what follows
 * from them. The Foundry side is in `index.ts`.
 *
 * The records carry the statistics; what they can't (a grenade's fuse and
 * igniter, a mine's kind, what a rifle grenade needs on the rifle) is kept
 * here, by the record's name, as the tables print it.
 */

// ── hand grenades (pp. 190-192) ──

/**
 * How a grenade is set going: a pin that holds the arming handle (the fuse
 * starts when the handle flies off), a string or cord that starts the fuse as
 * it is pulled, or a fuse that is lit.
 */
export type Igniter = "pin" | "string" | "lit";

export interface GrenadeFacts {
  /** The fuse's seconds, least and most; null for an impact fuse, or one the table doesn't give. */
  fuse: readonly [number, number] | null;
  /** An impact fuse: it goes off where it lands. */
  impact?: boolean;
  igniter: Igniter;
  /** Ready maneuvers to set it going (notes [1]-[3], p. 192). */
  readies: number;
  /** Seconds of smoke over a radius in yards, left where it lands. */
  cloud?: { radius: number; seconds: number };
  /** The cloud is tear gas, not smoke (the M7, p. 192). */
  tearGas?: boolean;
  /** A canister that burns bare flesh touching it: the burn's dice (the AN-M8, p. 192). */
  hotCanister?: string;
  /** A flashbang: a Vision- and Hearing-Based affliction, stun recovered at HT-5 (note [7]). */
  flashbang?: boolean;
  /** Thermite: seconds it burns (p. 192). */
  thermiteSeconds?: number;
  /** White phosphorus: hot fragments and a smokescreen (p. 193). */
  whitePhosphorus?: boolean;
  /** Throwing at -5 without the special technique (p. 192). */
  unfamiliarPenalty?: number;
}

const pin = (fuse: readonly [number, number] | null, more: Partial<GrenadeFacts> = {}): GrenadeFacts => ({ fuse, igniter: "pin", readies: 1, ...more });
const stick = (fuse: readonly [number, number], more: Partial<GrenadeFacts> = {}): GrenadeFacts => ({ fuse, igniter: "string", readies: 2, ...more });

/** The Hand Grenades Table's fuses and igniters (p. 192), and the variants the text gives (pp. 190-193). */
export const GRENADES: Readonly<Record<string, GrenadeFacts>> = Object.freeze({
  // [1]: a Ready to light the fuse, five if it must be put in first (the priming, below).
  "Grenade à Main": { fuse: [3, 5], igniter: "lit", readies: 1 },
  // The Mle 1882's mechanical time fuse, armed by pulling a ring (p. 190).
  "Grenade à Main Mle 1882": { fuse: [5, 5], igniter: "string", readies: 1 },
  // [2]: two Readies to screw off the cap and pull the cord.
  Stielhandgranate: stick([4, 5]),
  StiHGr24: stick([4, 5]),
  "StiHGr24 (Fragmentation Sleeve)": stick([4, 5]),
  "Geballte Ladung": stick([4, 5]),
  NbHGr39: stick([7, 8], { cloud: { radius: 7, seconds: 90 } }),
  "Mills Number 36M Mk I": pin([7, 7]),
  "AMC MK II": pin([4, 5]),
  "AMC MK III": pin([4, 5]),
  "Eihandgranate 39": { fuse: [4, 5], igniter: "string", readies: 1 },
  "AN-M8": pin([1, 2], { cloud: { radius: 7, seconds: 80 }, hotCanister: "1d-2" }),
  // The AN-M8's tear-gas sibling: a 7-yard cloud for 25 seconds (p. 192).
  M7: pin([1, 2], { cloud: { radius: 7, seconds: 25 }, tearGas: true, hotCanister: "1d-2" }),
  M18: pin([1, 2], { cloud: { radius: 7, seconds: 70 } }),
  M83: pin([1, 2], { cloud: { radius: 7, seconds: 50 } }),
  "AN-M14": pin([1, 2], { thermiteSeconds: 40 }),
  "RPG-43": pin(null, { impact: true, unfamiliarPenalty: -5 }),
  M26: pin([4, 5]),
  "M34 WP": pin([4, 5], { whitePhosphorus: true, cloud: { radius: 5, seconds: 60 } }),
  M67: pin([4, 5]),
  "Diehl DM51": pin([4, 5]),
  "Diehl DM51 (Without Sleeve)": pin([4, 5]),
  "Schermuly Stun": pin([1, 2], { flashbang: true }),
  "ARGES HG 86": pin([4, 5]),
  "M452 Stingball": pin([2, 3], { flashbang: true }),
  "M452C Comboball": pin([2, 3], { flashbang: true }),
  // Improvised: a burning fuse or an impact fuse, the maker's choice (p. 191).
  "Jam-Tin Grenade": { fuse: null, igniter: "lit", readies: 1 },
  "Jam-Tin Grenade (Fragmentation)": { fuse: null, igniter: "lit", readies: 1 },
});

/** A grenade's facts, by its record's name; any other thrown grenade has a pin and a fuse the GM gives. */
export function grenadeFacts(name: string, thrownExplosive = false): GrenadeFacts | null {
  const facts = GRENADES[String(name ?? "").trim()];
  if (facts) return facts;
  return thrownExplosive && /\bgrenade\b/i.test(String(name ?? "")) ? pin(null) : null;
}

/**
 * The seconds priming a grenade takes before it can be used: at TL6-8 grenade
 * and detonator come apart and are put together before combat, ten seconds
 * each (p. 190); a TL5 lit-fuse grenade takes five Readies to put its fuse in
 * (note [1], p. 192). Improvised grenades are made with their fuse.
 */
export function primingSeconds(tl: number, facts: GrenadeFacts, count = 1): number {
  const each = facts.igniter === "lit" ? (tl >= 6 ? 0 : 5) : 10;
  return each * Math.max(1, Math.floor(Number(count) || 1));
}

/** Whether the fuse is burning once the grenade is armed: a pulled string or a lit fuse; a pin waits for the handle. */
export const fuseStartsOnArming = (facts: GrenadeFacts): boolean => facts.igniter !== "pin";

/** What a throw leaves: how long until it goes off, and whether anyone can throw it back. */
export interface FuseAfterThrow {
  /** Seconds left at the least, and at the most; null for an impact or unknown fuse. */
  left: readonly [number, number] | null;
  /** A defender needs a Ready to pick it up and an attack to throw it (p. B410): two seconds. */
  throwBack: boolean;
}

/** Seconds a defender needs to throw a grenade back: pick it up, then throw it (p. B410). */
export const THROW_BACK_SECONDS = 2;

/**
 * A grenade thrown with `burned` seconds of its fuse gone (the Waits taken
 * while cooking it off, p. 190).
 */
export function afterThrow(facts: GrenadeFacts, burned: number): FuseAfterThrow {
  if (!facts.fuse || facts.impact) return { left: null, throwBack: false };
  const gone = Math.max(0, Math.floor(Number(burned) || 0));
  const left = [Math.max(0, facts.fuse[0] - gone), Math.max(0, facts.fuse[1] - gone)] as const;
  return { left, throwBack: left[0] >= THROW_BACK_SECONDS };
}

/** Whether a grenade still held goes off: its fuse's least time has run. */
export function goesOffInHand(facts: GrenadeFacts, burned: number): boolean {
  return Boolean(facts.fuse && !facts.impact && Math.floor(Number(burned) || 0) >= facts.fuse[0]);
}

/** Setting a hand-grenade booby trap: Soldier, or Traps+4, and a couple of minutes (p. 190). */
export const BOOBY_TRAP = { skills: [{ skill: "Soldier", modifier: 0 }, { skill: "Traps", modifier: 4 }], minutes: 2 } as const;

/** Improvised grenades: Explosives (Demolition) and ten minutes each; a fuse from scratch at +2 (p. 191). */
export const IMPROVISED_GRENADE = { skill: "Explosives (Demolition)", modifier: 0, fuseModifier: 2, minutes: 10 } as const;

/** A flashbang: Protected Hearing and Protected Vision each +5 to resist; the stun recovered at HT-5 (note [7], p. 192). */
export const FLASHBANG = { protectedBonus: 5, recovery: -5 } as const;

/** White phosphorus's hot fragments: burning, at (0.2), striking again every 10 seconds for a minute (pp. 172, 193). */
export const WP_FRAGMENTS = { type: "burn", every: 10, for: 60 } as const;

// ── Molotov cocktails against vehicles (p. 191) ──

/**
 * Burning fuel through an unprotected engine grating: a vital-area hit (-3),
 * then a HT roll at once and every three seconds until the fire burns out
 * (2d x 5 seconds). The first failure stops the engine; the second sets it
 * on fire, and it is destroyed.
 */
export const MOLOTOV_ENGINE = { toHit: -3, every: 3, burnDice: 2, burnTimes: 5 } as const;

export type EngineFate = "runs" | "brokenDown" | "destroyed";

/** The engine's fate from its HT and the 3d rolls in order, over a fire of `seconds`. */
export function engineFire(ht: number, seconds: number, rolls: readonly number[]): { fate: EngineFate; checks: Array<{ second: number; roll: number; success: boolean }> } {
  const checks: Array<{ second: number; roll: number; success: boolean }> = [];
  let failures = 0;
  for (let second = 0, i = 0; second < Math.max(1, seconds) && i < rolls.length; second += MOLOTOV_ENGINE.every, i += 1) {
    const roll = Math.floor(Number(rolls[i]) || 0);
    const success = roll <= 4 || (roll <= 16 && roll <= ht);
    checks.push({ second, roll, success });
    if (!success) failures += 1;
    if (failures >= 2) break;
  }
  return { fate: failures >= 2 ? "destroyed" : failures === 1 ? "brokenDown" : "runs", checks };
}

/** How many checks a fire of `seconds` calls for. */
export const engineChecks = (seconds: number): number => Math.max(1, Math.ceil(Math.max(1, seconds) / MOLOTOV_ENGINE.every));

// ── land mines (pp. 189-190) ──

export type MineKind = "pressure" | "bounding" | "directional";

export interface MineFacts {
  kind: MineKind;
  /** An anti-lifting fuse's penalty to taking it up; any failure sets it off (TMi35, p. 189). */
  antiLifting?: number;
  /** A directional mine's shotload: pellets, the attack's basic skill, 1/2D and Max (p. 189). */
  pellets?: { count: number; skill: number; halfDamage: number; max: number; recoil: number };
  /** Seconds before it is armed, and before it destroys itself (M86 PDM, p. 189). */
  armsAfter?: number;
  selfDestructs?: number;
}

/** The Land Mines Table's mines and the text's variants (p. 189). */
export const MINES: Readonly<Record<string, MineFacts>> = Object.freeze({
  TMi35: { kind: "pressure", antiLifting: -2 },
  "OZM-3": { kind: "bounding" },
  SMi35: { kind: "bounding" },
  M16: { kind: "bounding" },
  // Tripwires after 25 seconds, armed 40 seconds after that; self-destructs after four hours.
  "M86 PDM": { kind: "bounding", armsAfter: 65, selfDestructs: 4 * 3600 },
  "M18A1 Claymore": { kind: "directional", pellets: { count: 700, skill: 9, halfDamage: 55, max: 270, recoil: 1 } },
  "M5 Modular Crowd Control Munition": { kind: "directional", pellets: { count: 600, skill: 9, halfDamage: 15, max: 75, recoil: 1 } },
});

export const mineFacts = (name: string): MineFacts | null => MINES[String(name ?? "").trim()] ?? null;

/** Placing a ready-made mine, an improvised one, finding one by probing, and disarming it (p. 189). */
export const MINE_TASKS = {
  place: [{ skill: "Explosives (Demolition)", modifier: 4 }, { skill: "Soldier", modifier: 0 }, { skill: "Traps", modifier: 2 }],
  improvised: [{ skill: "Explosives (Demolition)", modifier: -2 }],
  probe: [{ skill: "Explosives (EOD)", modifier: 0 }, { skill: "Soldier", modifier: -5 }],
  disarm: [{ skill: "Explosives (EOD)", modifier: 0 }],
} as const;
export type MineTask = keyof typeof MINE_TASKS;

/** A bounding mine's burst is five feet up: whoever is flat on the ground at once takes none of its fragments (p. 189). */
export const avoidsBoundingFragments = (posture: unknown): boolean => ["lying", "prone", "crawling"].includes(String(posture ?? ""));

/** One target of a directional mine's shotload, as resolved. */
export interface VolleyTarget {
  id: string;
  distance: number;
  /** The attack's effective skill, the 3d roll, the margin, and the pellets that hit. */
  skill: number;
  roll: number;
  margin: number;
  hits: number;
  halfDamage: boolean;
  /** Past Max, or no pellets left for it. */
  missed: "range" | "spent" | null;
}

/**
 * A directional mine going off (p. 189): everyone in its cone is attacked at
 * basic skill 9, plus the rapid-fire bonus for its pellets, less the range
 * penalty for their distance from the mine. The attacks are resolved nearest
 * first, and once the pellets have all hit something nothing farther is hit.
 * Hits follow Rapid Fire (p. B373): one, and one more per full Recoil of
 * margin, never more than the pellets left.
 */
export function directionalVolley(
  targets: ReadonlyArray<{ id: string; distance: number; roll: number }>,
  pellets: NonNullable<MineFacts["pellets"]>,
  helpers: { rofBonus: number; rangePenalty: (yards: number) => number },
): VolleyTarget[] {
  let left = pellets.count;
  const out: VolleyTarget[] = [];
  for (const target of [...targets].sort((a, b) => a.distance - b.distance)) {
    const distance = Math.max(0, Number(target.distance) || 0);
    const skill = pellets.skill + helpers.rofBonus + helpers.rangePenalty(distance);
    const roll = Math.floor(Number(target.roll) || 0);
    const base = { id: target.id, distance, skill, roll, halfDamage: distance >= pellets.halfDamage };
    if (distance > pellets.max) {
      out.push({ ...base, margin: 0, hits: 0, missed: "range" });
      continue;
    }
    if (left <= 0) {
      out.push({ ...base, margin: 0, hits: 0, missed: "spent" });
      continue;
    }
    const success = roll <= 4 || (roll <= 16 && roll <= skill);
    const margin = success ? Math.max(0, skill - roll) : skill - roll;
    const hits = success ? Math.min(left, 1 + Math.floor(Math.max(0, margin) / Math.max(1, pellets.recoil))) : 0;
    left -= hits;
    out.push({ ...base, margin, hits, missed: null });
  }
  return out;
}

// ── rifle grenades (pp. 193-194) ──

export interface RifleGrenadeFacts {
  /** The spigot or cup it is fired from; none for a bullet-trap grenade off a NATO flash-hider. */
  launcher: "spigot" | "cup" | null;
  /** Propelled by a blank cartridge rather than a service round. */
  blank: boolean;
}

/** The Rifle Grenades Table and the text's variants (pp. 193-194). */
export const RIFLE_GRENADES: Readonly<Record<string, RifleGrenadeFacts>> = Object.freeze({
  "AMC M17, 56mm": { launcher: "spigot", blank: true },
  "Bergmann GSprgr30, 30mm": { launcher: "cup", blank: true },
  "Gewehrpropagandagranate, 30mm": { launcher: "cup", blank: true },
  "HASAG GGPzgr40, 40mm": { launcher: "cup", blank: true },
  "MECAR Energa-75, 75mm": { launcher: "spigot", blank: true },
  "Rafael Simon 150, 100mm": { launcher: null, blank: false },
});

export const rifleGrenadeFacts = (name: string): RifleGrenadeFacts | null => RIFLE_GRENADES[String(name ?? "").trim()] ?? null;

/** Fitting or taking off a launcher, loading the blank, and putting the grenade on (p. 193). */
export const RIFLE_GRENADE_SECONDS = { launcher: 5, blank: 3, grenade: 2 } as const;

/** The seconds readying a rifle grenade takes, with the launcher on already or not. */
export function readyRifleGrenadeSeconds(facts: RifleGrenadeFacts, launcherFitted: boolean): number {
  return (facts.launcher && !launcherFitted ? RIFLE_GRENADE_SECONDS.launcher : 0)
    + (facts.blank ? RIFLE_GRENADE_SECONDS.blank : 0)
    + RIFLE_GRENADE_SECONDS.grenade;
}

/** Inside its minimum range, or failing to go off, a rifle grenade does 1d+1 crushing and nothing more (note [2], p. 194). */
export const RIFLE_GRENADE_DUD = { damage: "1d+1", type: "cr" } as const;

/** The grenade's Bulk is added to the rifle's (note [1], p. 194). */
export const rifleGrenadeBulk = (rifleBulk: number, grenadeBulk: number): number => Math.min(0, Math.floor(Number(rifleBulk) || 0)) + Math.min(0, Math.floor(Number(grenadeBulk) || 0));

// ── bombs (p. 194) ──

/** The fuel-air bomb, whose blast is divided by 2 x the distance (note [1], p. 194; pp. 186-187). */
export const FUEL_AIR_BOMBS: readonly string[] = Object.freeze(["500-lb. CBU-55/B, 256mm"]);

// ── nuclear weapons (pp. 195-196) ──

/** A nuclear blast's burning falls off with twice the distance, not three times (p. 195). */
export const NUCLEAR_BURN_DIVISOR_PER_YARD = 2;

/**
 * A nuclear weapon's mode, as the book writes it: crushing explosion linked
 * to burning explosion with radiation (and surge).
 */
export function isNuclearMode(mode: any): boolean {
  const linked = mode?.linked;
  return mode?.explosive === true && Boolean(linked) && String(linked.damageType ?? "") === "burn" && linked.radiation === true;
}

/**
 * EMP (p. 196): an HT-8(2) affliction on electronics and the Electrical. A
 * failure knocks the thing out until it is repaired: solid-state gear (TL7
 * and up) is repaired at -10, other devices at -4.
 */
export const EMP = { modifier: -8, divisor: 2, solidStateRepair: -10, otherRepair: -4, solidStateTl: 7 } as const;

/** EMP's resistance roll: HT-8, with the DR at (2) as a bonus. */
export function empResistance(ht: number, dr: number): number {
  return Math.floor(Number(ht) || 0) + EMP.modifier + Math.floor(Math.max(0, Number(dr) || 0) / EMP.divisor);
}

/** The repair penalty for gear the pulse knocked out. */
export const empRepairPenalty = (tl: number): number => ((Number(tl) || 0) >= EMP.solidStateTl ? EMP.solidStateRepair : EMP.otherRepair);

/** A nuclear device's yield in kilotons, from its name ("(0.1 kt)", "12.5 kilotons", "1 Mt"); null where it doesn't say. */
export function yieldKilotons(name: string): number | null {
  const match = /([\d.]+)\s*(kt|kilotons?|mt|megatons?)\b/i.exec(String(name ?? ""));
  if (!match) return null;
  const value = Number(match[1]);
  if (!(value > 0)) return null;
  return /^m/i.test(match[2] ?? "") ? value * 1000 : value;
}

/**
 * Fallout's footprint (p. 196): 800 yards by 200 downwind for 0.1 kiloton,
 * doubled in length and width for each tenfold yield.
 */
export function falloutFootprint(kilotons: number): { length: number; width: number } {
  const steps = Math.log10(Math.max(1e-6, Number(kilotons) || 0.1) / 0.1);
  const scale = 2 ** steps;
  return { length: Math.round(800 * scale), width: Math.round(200 * scale) };
}

/** Fallout's dose rate in rads an hour: 100 soon after, 10 from about two days, 1 from about two weeks (p. 196). */
export function falloutRate(hoursAfter: number): number {
  const h = Math.max(0, Number(hoursAfter) || 0);
  return h < 48 ? 100 : h < 336 ? 10 : 1;
}

/** The rads taken in the footprint from `hoursAfter` the blast for `hours`, at the rate each hour is at. */
export function falloutRads(hoursAfter: number, hours: number): number {
  const start = Math.max(0, Number(hoursAfter) || 0);
  const end = start + Math.max(0, Number(hours) || 0);
  let rads = 0;
  for (const [from, to, rate] of [[0, 48, 100], [48, 336, 10], [336, Infinity, 1]] as const) {
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap > 0) rads += overlap * rate;
  }
  return Math.round(rads * 100) / 100;
}
