/**
 * Ultra-Tech's swarmbots: building a swarm from its size, bots, chassis,
 * power supply and type, the statistics it fights with, and what the combat
 * swarms do to whoever is caught in them (pp. 35-37, 92, 164, 169).
 */

/** Microbots are insect-sized, nanobots cell-sized (p. 35). */
export type BotSize = "microbot" | "nanobot";

/** The chassis a swarm is built on (p. 36). */
export const CHASSIS = ["crawler", "aerostat", "armoredCrawler", "dust", "flier", "hopper", "space", "swimmer", "cgFlier"] as const;
export type Chassis = (typeof CHASSIS)[number];

export interface ChassisFigures {
  /** Added to the swarm's cost, as a fraction: +100% is 1. */
  cost: number;
  move: Partial<Record<BotSize, { ground: number; air: number; water: number }>>;
  /** Which bots it is available to; both where left out. */
  only?: BotSize;
  /** Hit points multiplier. */
  hp?: number;
  /** Superscience or a later TL. */
  tl?: number;
  /** The one swarm type it may be. */
  types?: readonly string[];
}

const both = (ground: number, air: number, water: number) => ({ microbot: { ground, air, water }, nanobot: { ground, air, water } });

/** Each chassis's Move and cost (p. 36). Microbots take neither dust nor aerostat (p. 35). */
export const CHASSIS_FIGURES: Readonly<Record<Chassis, ChassisFigures>> = Object.freeze({
  aerostat: { cost: 0, only: "nanobot", move: { microbot: { ground: 0, air: 2, water: 0 }, nanobot: { ground: 0, air: 1, water: 0 } } },
  crawler: { cost: 0, move: both(3, 0, 1) },
  armoredCrawler: { cost: 1, hp: 2, move: both(2, 0, 0) },
  dust: { cost: -0.8, only: "nanobot", types: ["surveillance"], move: both(0, 0, 0) },
  flier: { cost: 1, move: { microbot: { ground: 1, air: 6, water: 0 }, nanobot: { ground: 1, air: 3, water: 0 } } },
  hopper: { cost: 0.5, only: "microbot", move: both(4, 0, 0) },
  space: { cost: 0, move: both(1, 0, 0) },
  swimmer: { cost: 0, move: { microbot: { ground: 0, air: 0, water: 4 }, nanobot: { ground: 0, air: 0, water: 1 } } },
  cgFlier: { cost: 2, tl: 11, move: { microbot: { ground: 1, air: 20, water: 0 }, nanobot: { ground: 1, air: 10, water: 0 } } },
});

/** A swarm's power supply (pp. 36-37). */
export const POWER_SUPPLIES = ["cells", "beamed", "gastrobot", "rtg", "solar", "organovore", "broadcast"] as const;
export type PowerSupply = (typeof POWER_SUPPLIES)[number];

export const POWER_FIGURES: Readonly<Record<PowerSupply, { cost: number; tl: number; lc?: number }>> = Object.freeze({
  cells: { cost: 0, tl: 10 },
  beamed: { cost: 0.5, tl: 10 },
  gastrobot: { cost: 1, tl: 10 },
  rtg: { cost: 1, tl: 10, lc: 1 },
  solar: { cost: 0.5, tl: 10 },
  organovore: { cost: 2, tl: 11, lc: 3 },
  broadcast: { cost: 1, tl: 11 },
});

/** How long a swarm's own cells run each bot, in hours: 12 at TL10, 72 at TL11, five days at TL12 (p. 36). */
export function cellEnduranceHours(tl: number): number {
  if (tl >= 12) return 120;
  if (tl >= 11) return 72;
  return 12;
}

/** Hours of running a solar swarm recharges per hour dormant in full sunlight: TL-7 (p. 36). */
export function solarRechargeHours(tl: number): number {
  return Math.max(0, tl - 7);
}

/** An RTG powers a bot for a year (p. 36). */
export const RTG_HOURS = 365 * 24;

/** The swarm types by cost per square yard, TL and LC (p. 37). */
export const SWARM_TYPES: Readonly<Record<string, { cost: number; tl: number; lc: number; page: number }>> = Object.freeze({
  bughunter: { cost: 4000, tl: 10, lc: 3, page: 106 },
  cannibal: { cost: 15000, tl: 12, lc: 1, page: 169 },
  cleaning: { cost: 1000, tl: 10, lc: 4, page: 69 },
  construction: { cost: 1000, tl: 10, lc: 4, page: 86 },
  decontamination: { cost: 1000, tl: 10, lc: 3, page: 87 },
  defoliator: { cost: 1000, tl: 10, lc: 3, page: 87 },
  devourer: { cost: 8000, tl: 10, lc: 1, page: 169 },
  disassembler: { cost: 10000, tl: 11, lc: 1, page: 169 },
  explorer: { cost: 500, tl: 10, lc: 4, page: 80 },
  firefly: { cost: 100, tl: 10, lc: 4, page: 74 },
  forensic: { cost: 4000, tl: 10, lc: 3, page: 107 },
  gremlin: { cost: 2000, tl: 10, lc: 2, page: 164 },
  harvester: { cost: 2000, tl: 10, lc: 4, page: 87 },
  massage: { cost: 200, tl: 10, lc: 4, page: 41 },
  painter: { cost: 500, tl: 10, lc: 4, page: 87 },
  paramedical: { cost: 6000, tl: 10, lc: 3, page: 201 },
  pesticide: { cost: 1000, tl: 10, lc: 3, page: 87 },
  play: { cost: 200, tl: 10, lc: 4, page: 41 },
  pollinator: { cost: 1000, tl: 10, lc: 4, page: 87 },
  repair: { cost: 500, tl: 10, lc: 4, page: 87 },
  security: { cost: 1000, tl: 10, lc: 3, page: 104 },
  sentry: { cost: 5000, tl: 10, lc: 3, page: 169 },
  stinger: { cost: 1500, tl: 10, lc: 2, page: 169 },
  surveillance: { cost: 500, tl: 10, lc: 3, page: 106 },
  terminator: { cost: 1500, tl: 10, lc: 1, page: 169 },
});

/** The type a record's name is: "Stinger Swarm" is a stinger. */
export function typeByName(name: string): string | null {
  const match = /^(\w+) swarm$/i.exec(String(name ?? "").trim());
  const key = match?.[1]?.toLowerCase() ?? "";
  return key in SWARM_TYPES ? key : null;
}

/** A repair swarm costs $250 more per kind of equipment it repairs (p. 37). */
export const REPAIR_PER_MODEL = 250;

/** Self-replicating: ten times the cost, TL12, LC0, only three types, and it must eat (pp. 37, 92). */
export const SELF_REPLICATING = Object.freeze({ cost: 10, tl: 12, lc: 0, types: ["defoliator", "devourer", "pesticide"], power: ["gastrobot", "organovore"] });

/** Disguising a swarm costs $1,000 a square yard; an aerostat swarm can't be (p. 36). */
export const DISGUISE_COST = 1000;

/** A swarm's statistics per bot size (p. 37); a square yard weighs about two pounds. */
export const SWARM_WEIGHT = 2;

export interface SwarmDesign {
  squareYards: number;
  bots: BotSize;
  chassis: Chassis;
  power: PowerSupply;
  /** The swarm type, and a second one for a multi-function swarm. */
  type: string | null;
  secondType?: string | null;
  disguised?: boolean;
  selfReplicating?: boolean;
  /** Kinds of equipment a repair swarm repairs beyond the first. */
  extraModels?: number;
  /** The TL it is built at. */
  tl: number;
  /** The per-square-yard price the record states, where it differs from the table. */
  typeCost?: number | null;
}

/** What is wrong with a design, as keys a sheet can say. */
export function designProblems(design: SwarmDesign): string[] {
  const problems: string[] = [];
  const chassis = CHASSIS_FIGURES[design.chassis];
  if (chassis.only && chassis.only !== design.bots) problems.push("chassisBots");
  if (chassis.types && design.type && !chassis.types.includes(design.type)) problems.push("chassisType");
  if (chassis.tl && design.tl < chassis.tl) problems.push("chassisTl");
  if (design.bots === "nanobot" && design.tl < 11) problems.push("nanobotTl");
  if (POWER_FIGURES[design.power].tl > design.tl) problems.push("powerTl");
  if (design.disguised && design.chassis === "aerostat") problems.push("aerostatDisguise");
  if (design.secondType) {
    const multi = design.bots === "microbot" ? 11 : 12;
    if (design.tl < multi) problems.push("multiFunctionTl");
  }
  if (design.selfReplicating) {
    if (design.tl < SELF_REPLICATING.tl) problems.push("selfReplicatingTl");
    if (!design.type || !SELF_REPLICATING.types.includes(design.type)) problems.push("selfReplicatingType");
    if (!SELF_REPLICATING.power.includes(design.power)) problems.push("selfReplicatingPower");
  }
  if (design.type === "disassembler" && design.bots === "microbot") problems.push("disassemblerBots");
  return problems;
}

/**
 * A swarm's price (pp. 35-37): the types' cost per square yard, the chassis's
 * and the power supply's percentages added together on it, the disguise's
 * $1,000 on top, ten times for self-replicating, all per square yard.
 */
export function swarmCost(design: SwarmDesign): { perSquareYard: number; total: number } {
  const first = design.typeCost ?? (design.type ? SWARM_TYPES[design.type]?.cost ?? 0 : 0);
  const second = design.secondType ? SWARM_TYPES[design.secondType]?.cost ?? 0 : 0;
  const repair = Math.max(0, Math.floor(design.extraModels ?? 0)) * REPAIR_PER_MODEL;
  const percent = 1 + CHASSIS_FIGURES[design.chassis].cost + POWER_FIGURES[design.power].cost;
  let perSquareYard = (first + second + repair) * Math.max(0, percent) + (design.disguised ? DISGUISE_COST : 0);
  if (design.selfReplicating) perSquareYard *= SELF_REPLICATING.cost;
  perSquareYard = Math.round(perSquareYard * 100) / 100;
  return { perSquareYard, total: Math.round(perSquareYard * Math.max(0, design.squareYards) * 100) / 100 };
}

/** A swarm's Legality Class: the lowest of its types', its power supply's and self-replication's. */
export function swarmLegality(design: SwarmDesign, recordLc: number | null = null): number | null {
  const classes = [recordLc, design.type ? SWARM_TYPES[design.type]?.lc : null, design.secondType ? SWARM_TYPES[design.secondType]?.lc : null, POWER_FIGURES[design.power].lc, design.selfReplicating ? SELF_REPLICATING.lc : null]
    .filter((lc): lc is number => typeof lc === "number");
  return classes.length ? Math.min(...classes) : null;
}

/** A swarm's statistics (p. 37), for a square yard of it. */
export interface SwarmStatistics {
  st: number;
  dx: number;
  iq: number;
  ht: number;
  hp: number;
  will: number;
  per: number;
  speed: number;
  move: { ground: number; air: number; water: number };
  weight: number;
}

export function swarmStatistics(bots: BotSize, chassis: Chassis, tl: number): SwarmStatistics {
  const micro = bots === "microbot";
  const figures = CHASSIS_FIGURES[chassis];
  return {
    st: micro ? 2 : 1,
    dx: 10,
    iq: Math.max(0, tl - (micro ? 7 : 8)),
    ht: 10,
    hp: (micro ? 10 : 20) * (figures.hp ?? 1),
    will: 10,
    per: micro ? tl : tl - 1,
    speed: tl / 2,
    move: figures.move[bots] ?? { ground: 0, air: 0, water: 0 },
    weight: SWARM_WEIGHT,
  };
}

/** How long a swarm runs before it needs recharging, in hours, or null for as long as it likes. */
export function swarmEnduranceHours(power: PowerSupply, tl: number): number | null {
  if (power === "cells" || power === "solar") return cellEnduranceHours(tl);
  if (power === "rtg") return RTG_HOURS;
  return null;
}

/** What a combat swarm does (pp. 164, 169). */
export interface SwarmAttack {
  /** Rolled damage, or null for a flat amount. */
  dice: string | null;
  flat: number;
  divisor: number;
  damageType: "cor" | "tox" | "fat" | "cr";
  /** Who it hurts. */
  against: "anyone" | "living" | "machinery" | "swarms" | "electronics";
  /** What keeps it out: sealed DR only, the Sealed advantage, or nothing but not being machinery. */
  protection: "sealedDr" | "sealed" | "none";
  /** Clothing and armour slow it for a few seconds, as they do the Basic Set's tiny swarms. */
  slowedByClothing: boolean;
  /** Per square yard rather than per swarm. */
  perSquareYard: boolean;
}

export const SWARM_ATTACKS: Readonly<Record<string, SwarmAttack>> = Object.freeze({
  devourer: { dice: "1d", flat: 0, divisor: 2, damageType: "cor", against: "anyone", protection: "sealedDr", slowedByClothing: false, perSquareYard: false },
  disassembler: { dice: "1d-2", flat: 0, divisor: 10, damageType: "cor", against: "anyone", protection: "sealedDr", slowedByClothing: false, perSquareYard: false },
  cannibal: { dice: "1d-2", flat: 0, divisor: 10, damageType: "cor", against: "electronics", protection: "sealedDr", slowedByClothing: false, perSquareYard: false },
  stinger: { dice: null, flat: 1, divisor: 1, damageType: "fat", against: "living", protection: "sealed", slowedByClothing: true, perSquareYard: false },
  terminator: { dice: null, flat: 1, divisor: 1, damageType: "tox", against: "living", protection: "sealed", slowedByClothing: false, perSquareYard: false },
  gremlin: { dice: null, flat: 1, divisor: 1, damageType: "cr", against: "machinery", protection: "sealed", slowedByClothing: false, perSquareYard: true },
  sentry: { dice: "2d", flat: 0, divisor: 1, damageType: "cr", against: "swarms", protection: "none", slowedByClothing: false, perSquareYard: false },
});

/** Seconds clothing and low-tech armour keep tiny swarms out (Campaigns p. 461). */
export const CLOTHING_SECONDS = Object.freeze({ none: 0, clothing: 2, armor: 5 });

/**
 * What a second in a combat swarm does to one victim: the injury (or fatigue)
 * after whatever protection counts, or 0 where the victim is proof against it.
 *
 * Only sealed DR stops a devourer's or disassembler's jaws, divided by the
 * armour divisor; the Sealed advantage keeps stingers and terminators out, and
 * only stingers are held off by clothing for the seconds the Basic Set gives
 * (p. 37).
 */
export function swarmInjury(options: {
  attack: SwarmAttack;
  rolled: number;
  squareYards: number;
  victim: { living: boolean; machine: boolean; swarm: boolean; sealed: boolean; dr: number };
  covering?: keyof typeof CLOTHING_SECONDS;
  secondsExposed?: number;
}): { amount: number; proof: "" | "notAffected" | "sealed" | "covered" } {
  const { attack, victim } = options;
  if (attack.against === "living" && !victim.living) return { amount: 0, proof: "notAffected" };
  if (attack.against === "machinery" && !victim.machine) return { amount: 0, proof: "notAffected" };
  if (attack.against === "electronics" && !victim.machine) return { amount: 0, proof: "notAffected" };
  if (attack.against === "swarms" && !victim.swarm) return { amount: 0, proof: "notAffected" };
  if (attack.protection === "sealed" && victim.sealed) return { amount: 0, proof: "sealed" };
  if (attack.slowedByClothing && !victim.sealed) {
    const holds = CLOTHING_SECONDS[options.covering ?? "none"];
    if ((options.secondsExposed ?? 0) < holds) return { amount: 0, proof: "covered" };
  }
  const base = attack.dice ? Math.max(0, options.rolled) : attack.flat * (attack.perSquareYard ? Math.max(1, options.squareYards) : 1);
  if (attack.protection === "sealedDr" && victim.sealed) {
    const dr = Math.floor(Math.max(0, victim.dr) / Math.max(1, attack.divisor));
    return { amount: Math.max(0, base - dr), proof: base - dr > 0 ? "" : "sealed" };
  }
  return { amount: base, proof: "" };
}

/**
 * A gremlin-infested machine's malfunction number (p. 164): 17, less one per
 * full 10% of its hit points lost.
 */
export function gremlinMalfunction(hpLost: number, hpMax: number): number {
  if (!(hpMax > 0)) return 17;
  const tenths = Math.floor((Math.max(0, hpLost) / hpMax) * 10 + 1e-9);
  return 17 - tenths;
}

/** A swarm doubles its size every hour or so while it has something to eat (p. 92). */
export function selfReplicatedSize(squareYards: number, hours: number): number {
  return squareYards * 2 ** Math.max(0, Math.floor(hours));
}

/** Swarm controller software is Complexity 4 (p. 37). */
export const CONTROLLER_COMPLEXITY = 4;
