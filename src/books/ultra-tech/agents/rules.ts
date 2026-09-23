/**
 * GURPS Ultra-Tech's biochemical and nanotech weapons (pp. 159-162, 206), as
 * pure rules: each agent as the Basic Set's poison numbers (Campaigns
 * p. 437), what a failed roll does beyond its damage, clouds and smoke, and
 * the nanomachine contests.
 */

export type Delivery = "blood" | "contact" | "digestive" | "followUp" | "respiratory";

/** The poison numbers the system's dose machinery takes. */
export interface AgentPoison {
  delivery: Delivery[];
  delaySeconds: number;
  resistanceModifier: number | null;
  damage: "toxic" | "fatigue" | "none";
  dice: number;
  adds: number;
  intervalSeconds: number;
  cycles: number;
  reference: string;
}

export const AGENTS = [
  "riotGas", "nerveGas", "nerveGasResidue", "sleepGas", "paralysisGas", "pheromoneSpray", "radiantPrism",
  "nervePoison", "contactNervePoison", "sleepPoison", "contactSleepPoison",
  "nanoburn", "nanoburnDamage", "dominator", "dominatorSuperscience", "parasiteSeed",
] as const;
export type Agent = (typeof AGENTS)[number];

const poison = (p: Partial<AgentPoison> & { reference: string }): AgentPoison => ({
  delivery: [], delaySeconds: 0, resistanceModifier: null, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, ...p,
});

/**
 * Each agent as poison numbers (pp. 159-162). A cloud's agents are dosed
 * again for every second spent in it; the nerve agents run a cycle a
 * minute for six; nanoburn's damage is a second dose that allows no roll.
 */
export const AGENT_POISONS: Readonly<Record<Agent, AgentPoison>> = Object.freeze({
  riotGas: poison({ delivery: ["respiratory"], resistanceModifier: -4, reference: "Ultra-Tech p. 159" }),
  nerveGas: poison({ delivery: ["contact"], resistanceModifier: -6, damage: "toxic", dice: 1, intervalSeconds: 60, cycles: 6, reference: "Ultra-Tech p. 160" }),
  nerveGasResidue: poison({ delivery: ["contact"], resistanceModifier: -3, damage: "toxic", dice: 1, intervalSeconds: 60, cycles: 6, reference: "Ultra-Tech p. 160" }),
  sleepGas: poison({ delivery: ["contact"], resistanceModifier: -6, reference: "Ultra-Tech p. 160" }),
  paralysisGas: poison({ delivery: ["contact"], resistanceModifier: -6, reference: "Ultra-Tech p. 160" }),
  pheromoneSpray: poison({ delivery: ["respiratory"], resistanceModifier: -2, reference: "Ultra-Tech p. 160" }),
  radiantPrism: poison({ delivery: ["respiratory"], damage: "toxic", adds: 1, reference: "Ultra-Tech p. 160" }),
  nervePoison: poison({ delivery: ["followUp"], resistanceModifier: -7, damage: "toxic", dice: 1, intervalSeconds: 60, cycles: 6, reference: "Ultra-Tech p. 161" }),
  contactNervePoison: poison({ delivery: ["contact"], resistanceModifier: -5, damage: "toxic", dice: 1, intervalSeconds: 60, cycles: 6, reference: "Ultra-Tech p. 161" }),
  sleepPoison: poison({ delivery: ["followUp"], resistanceModifier: -6, reference: "Ultra-Tech p. 161" }),
  contactSleepPoison: poison({ delivery: ["contact"], resistanceModifier: -4, reference: "Ultra-Tech p. 161" }),
  nanoburn: poison({ delivery: ["followUp"], resistanceModifier: -6, reference: "Ultra-Tech p. 161" }),
  nanoburnDamage: poison({ delaySeconds: 180, damage: "toxic", dice: 1, adds: -1, intervalSeconds: 180, cycles: 10, reference: "Ultra-Tech p. 161" }),
  dominator: poison({ delivery: ["followUp"], delaySeconds: 6 * 3600, resistanceModifier: -6, reference: "Ultra-Tech p. 162" }),
  dominatorSuperscience: poison({ delivery: ["followUp"], delaySeconds: 60, resistanceModifier: -6, reference: "Ultra-Tech p. 162" }),
  parasiteSeed: poison({ delivery: ["followUp", "digestive"], delaySeconds: 3600, resistanceModifier: -4, intervalSeconds: 3600, cycles: 99, reference: "Ultra-Tech p. 162" }),
});

/** One thing a failed roll does beyond damage: a condition and how long, or a line alone. */
export interface AgentEffect {
  condition: string | null;
  /** Seconds; null for as long as the victim stays in the cloud, or until removed. */
  seconds: number | null;
  note: string;
}

const minutes = (m: number) => Math.max(1, Math.floor(m)) * 60;

/**
 * What a failed roll against an agent does (pp. 159-162), by its margin of
 * failure and whether it was a critical failure.
 */
export function agentEffects(agent: Agent, margin: number, criticalFailure: boolean): AgentEffect[] {
  const m = Math.max(0, Math.floor(Number(margin) || 0));
  switch (agent) {
    case "riotGas":
      return m >= 5
        ? [{ condition: "retching", seconds: null, note: "riotGasRetching" }]
        : [{ condition: "nauseated", seconds: null, note: "riotGasNauseated" }];
    case "sleepGas":
      return [{ condition: "unconscious", seconds: minutes(m), note: "sleepGas" }];
    case "paralysisGas":
      if (criticalFailure) return [{ condition: "coma", seconds: null, note: "paralysisGasCritical" }];
      return m >= 3 ? [{ condition: "paralysis", seconds: minutes(m), note: "paralysisGasParalysed" }] : [{ condition: null, seconds: null, note: "paralysisGasFalls" }];
    case "pheromoneSpray":
      return [{ condition: null, seconds: null, note: "pheromoneSpray" }];
    case "sleepPoison":
    case "contactSleepPoison":
      return m >= 5 ? [{ condition: "unconscious", seconds: minutes(m), note: "sleepPoisonOut" }] : [{ condition: "drowsy", seconds: null, note: "sleepPoisonDrowsy" }];
    case "nanoburn":
      return [{ condition: "paralysis", seconds: 3 * minutes(m), note: "nanoburn" }];
    case "dominator":
    case "dominatorSuperscience":
      return [{ condition: null, seconds: null, note: "dominator" }];
    case "parasiteSeed":
      return [{ condition: null, seconds: null, note: "parasiteSeed" }];
    default:
      return [];
  }
}

/** Paralysis gas's critical failure also does 1d (p. 160). */
export const PARALYSIS_GAS_CRITICAL_DAMAGE = "1d";

/** A parasite seed takes 3 HT a failed hour; at 0 the victim becomes a nanomorph (p. 162). */
export const PARASITE_HT_LOSS = 3;

/**
 * The nerve agents' symptoms by the thresholds of HP lost (pp. 160-161): a
 * third brings coughing and a mild Neurological Disorder, a half nausea and a
 * severe one, two-thirds a crippling one. Only one disorder at a time.
 */
export function nerveSymptoms(threshold: string): { condition: string | null; disorder: "Mild" | "Severe" | "Crippling" } | null {
  if (threshold === "1/3") return { condition: "coughing", disorder: "Mild" };
  if (threshold === "1/2") return { condition: "nauseated", disorder: "Severe" };
  if (threshold === "2/3") return { condition: null, disorder: "Crippling" };
  return null;
}

/** The agents whose symptoms follow HP lost. */
export const NERVE_AGENTS: ReadonlySet<Agent> = new Set(["nerveGas", "nerveGasResidue", "nervePoison", "contactNervePoison"]);

/** Whether a victim's traits keep an agent out: a sealed suit, no breath, filtered air, or no metabolism. */
export function protectedFrom(agent: Agent, victim: { sealed: boolean; doesntBreathe: boolean; filterLungs: boolean; metabolicImmunity: boolean }): "sealed" | "breath" | "metabolic" | null {
  const p = AGENT_POISONS[agent];
  if (victim.metabolicImmunity) return "metabolic";
  const respiratory = p.delivery.includes("respiratory");
  const contact = p.delivery.includes("contact");
  if ((respiratory || contact) && victim.sealed) return "sealed";
  if (respiratory && (victim.doesntBreathe || victim.filterLungs)) return "breath";
  return null;
}

/** A chemical cloud lasts 300 seconds; in a wind of 1 mph or more, 300 divided by the wind (p. 159). */
export function cloudSeconds(windMph: number): number {
  const wind = Math.max(0, Number(windMph) || 0);
  return wind >= 1 ? Math.round(300 / wind) : 300;
}

export type Smoke = "screening" | "colored" | "hot" | "prism" | "electromagnetic" | "radiantPrism";

/** What smoke blocks and at what penalty (p. 160). */
export const SMOKES: Readonly<Record<Smoke, { vision: number; senses: readonly string[]; blocks: readonly string[]; longevity: number }>> = Object.freeze({
  screening: { vision: -10, senses: [], blocks: ["ladar"], longevity: 1 },
  colored: { vision: -7, senses: [], blocks: ["ladar"], longevity: 1 },
  hot: { vision: -10, senses: ["infravision", "hyperspectral", "nightVision"], blocks: ["ladar"], longevity: 1 },
  prism: { vision: -10, senses: ["infravision", "hyperspectral", "nightVision"], blocks: ["ladar", "lasers"], longevity: 1 },
  electromagnetic: { vision: -10, senses: ["infravision", "hyperspectral", "nightVision"], blocks: ["ladar", "radar"], longevity: 1 },
  radiantPrism: { vision: -10, senses: ["infravision", "hyperspectral", "nightVision"], blocks: ["ladar", "lasers", "radar"], longevity: 0.5 },
});

/** Smoke takes a second per 5 yards of radius to form (p. 160); High-Tech's smoke too, so the engine is shared. */
export { smokeFormSeconds } from "../../../shared/smoke/rules.js";

/** Radiant prism penalizes infrared- and radar-aimed attacks and sighting by -5 (p. 160). */
export const RADIANT_PRISM_SENSOR = -5;

/** Mask: -6 to Forensics for chemical traces and to tracking by scent through it (p. 160). */
export const MASK = -6;

/** Firefoam puts out fires of up to TL-8 dice; larger ones burn lower for 3d seconds (p. 160). */
export function firefoamDice(tl: number): number {
  return Math.max(0, Math.floor(tl) - 8);
}

/** Metal embrittlement: 3d corrosion an hour for 12 hours, times SM on an object of SM +2 or more inside the area (p. 161). */
export function embrittlementDamage(sm: number): { dice: number; multiplier: number; hours: number } {
  return { dice: 3, multiplier: sm >= 2 ? Math.floor(sm) : 1, hours: 12 };
}

/** Metabolic nanoweapons' cost by how they're delivered (p. 161). */
export const NANO_DELIVERY = Object.freeze({ blood: 2, contactGel: 2, contactGas: 10, digestive: 1, followUp: 1, respiratory: 5 });
export type NanoDelivery = keyof typeof NANO_DELIVERY;

/** Dominator nano: $100 times the disadvantages' points, doubled to reverse itself, doubled again for superscience (p. 162). */
export function dominatorCost(points: number, reversible: boolean, superscience: boolean): number {
  return 100 * Math.abs(Math.floor(Number(points) || 0)) * (reversible ? 2 : 1) * (superscience ? 2 : 1);
}

/** Aegis nano's skill: 10 at TL10, 12 at TL11, 14 at TL12 (pp. 162, 206). */
export function aegisSkill(tl: number): number {
  return tl >= 12 ? 14 : tl >= 11 ? 12 : 10;
}

/** Splatter's and shrike's skill: splatter 12 at TL11 and 14 at TL12; shrike 12, 14, 16 from TL10, +1 per doubling of doses (p. 162). */
export function splatterSkill(tl: number): number {
  return tl >= 12 ? 14 : 12;
}
export function shrikeSkill(tl: number, doublings: number): number {
  return (tl >= 12 ? 16 : tl >= 11 ? 14 : 12) + Math.max(0, Math.floor(doublings));
}

/**
 * Splatter's detonation (p. 162): 1d a dose for each minute it circulated,
 * at most 30d a dose, -1 a die for each contest Aegis won. Six wins and it's
 * gone.
 */
export function splatterDetonation(options: { doses: number; minutes: number; aegisWins: number }): { dice: number; perDie: number; exterminated: boolean } {
  const doses = Math.max(1, Math.floor(options.doses));
  const dice = Math.min(30 * doses, doses * Math.max(0, Math.floor(options.minutes)));
  const wins = Math.max(0, Math.floor(options.aegisWins));
  return { dice, perDie: -wins, exterminated: wins >= 6 };
}

/** A splatter formula: "5d-15" for 5 dice at -3 a die. */
export function splatterFormula(dice: number, perDie: number): string {
  const adds = dice * perDie;
  return adds ? `${dice}d${adds}` : `${dice}d`;
}

/** Nanotracers hide from Aegis and diagnostic nano: -2 at TL10, -4 at TL11, -6 at TL12; +5 to track (p. 161). */
export function nanotracerConcealment(tl: number): number {
  return tl >= 12 ? -6 : tl >= 11 ? -4 : -2;
}
export const NANOTRACER_TRACKING = 5;

/** The musk's Bad Smell lasts two weeks, a day less for each hour of washing (p. 160). */
export function muskDays(hoursWashed: number): number {
  return Math.max(0, 14 - Math.max(0, Math.floor(hoursWashed)));
}

/** Musk's Bad Smell lasts two weeks (p. 160); pheromone spray's Lecherousness (9) the margin's minutes after the cloud (p. 160). */
export const MUSK_SECONDS = 14 * 24 * 3600;
export const PHEROMONE_TRAIT = "Lecherousness (9)";

/**
 * The Neurological Disorder a nerve agent leaves, by the HP lost (p. 160): Mild
 * from 1/3, Severe from 1/2, Crippling from 2/3; none below 1/3.
 */
export function nerveDisorderAt(hpLost: number, hpMax: number): "Mild" | "Severe" | "Crippling" | null {
  if (!(hpMax > 0)) return null;
  const part = Math.max(0, hpLost) / hpMax;
  if (part >= 2 / 3) return "Crippling";
  if (part >= 1 / 2) return "Severe";
  if (part >= 1 / 3) return "Mild";
  return null;
}
