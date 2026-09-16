/**
 * Ultra-Tech's robots: what a robot costs with its body, lenses and AI
 * software, its digital backup, a total cyborg's smaller computer, controlling
 * and reprogramming an AI, and the cinematic ways of beating a robot
 * (pp. 26-35).
 */

import { COMPUTER_MODELS, aiComplexity, softwareCost, type AiKind, type ComputerModel } from "../computers/rules.js";

/** The machine intelligence lenses by the name the templates give them (pp. 27-28). */
export const INTELLIGENCE_LENSES: Readonly<Record<string, AiKind | "drone" | "cyborgBrain">> = Object.freeze({
  "Cyborg Brain": "cyborgBrain",
  Drone: "drone",
  "Mind Emulation": "mindEmulation",
  "Non-Volitional AI": "nonVolitional",
  "Volitional AI": "volitional",
  "Weak Dedicated AI": "weakDedicated",
});

export type Intelligence = AiKind | "drone" | "cyborgBrain";

/** A drone's program is Complexity 3 (p. 27). */
export const DRONE_COMPLEXITY = 3;

/** The biomorphic lenses' change to the body's dollar cost (p. 28). */
export const BIOMORPHIC_COST: Readonly<Record<string, number>> = Object.freeze({
  "Sculpted Body": 0,
  Mannequin: 0.1,
  "Semi-Sculpted Body": 0.05,
  "Realistic Flesh": 0.2,
  Furry: 0.1,
  "Living Flesh": 0.5,
  "Synthetic Organs": 1,
});

/** The lens name after a template's prefix: "Biomorphic: Mannequin" is "Mannequin". */
export function lensName(templateName: string): { prefix: string; lens: string } {
  const text = String(templateName ?? "");
  const at = text.indexOf(": ");
  return at < 0 ? { prefix: "", lens: text } : { prefix: text.slice(0, at), lens: text.slice(at + 2) };
}

/** A lens's "+50%" or "+$10,000" change to a body's price. */
export function parseCostModifier(text: string): { percent: number; dollars: number } {
  const raw = String(text ?? "").replace(/,/g, "");
  const percent = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(raw);
  const dollars = /([+-])?\s*\$(\d+(?:\.\d+)?)/.exec(raw);
  return {
    percent: percent ? Number(percent[1]) / 100 : 0,
    dollars: dollars ? (dollars[1] === "-" ? -1 : 1) * Number(dollars[2]) : 0,
  };
}

/**
 * A robot body's price: the body's own, with its lenses' percentages added
 * together on the base cost and their dollar changes on top (pp. 28, 29).
 */
export function bodyPrice(base: number, modifiers: ReadonlyArray<{ percent: number; dollars: number }>): number {
  const percent = modifiers.reduce((sum, m) => sum + m.percent, 0);
  const dollars = modifiers.reduce((sum, m) => sum + m.dollars, 0);
  return Math.max(0, Math.round((base * (1 + percent) + dollars) * 100) / 100);
}

/** Each extra point of mental traits adds 5% to AI software, which never falls below 20% (p. 29). */
export const AI_POINT_COST = 0.05;
export const AI_COST_FLOOR = 0.2;

/** The Complexity an intelligence needs, or null for a cyborg brain, which needs none. */
export function intelligenceComplexity(kind: Intelligence, iq: number, lenses: { fast?: boolean; lowRes?: boolean } = {}): number | null {
  if (kind === "cyborgBrain") return null;
  if (kind === "drone") return DRONE_COMPLEXITY;
  return aiComplexity(kind, iq, lenses);
}

/**
 * An AI's software price (p. 29): the Software Cost Table's at its Complexity
 * and TL, plus 5% for each character point of mental traits bought on top,
 * never less than a fifth of the table's price. Null where the table has it
 * unavailable, and for intelligences that aren't software bought this way.
 */
export function aiSoftwarePrice(options: { kind: Intelligence; iq: number; tl: number; extraPoints: number; lenses?: { fast?: boolean; lowRes?: boolean } }): { complexity: number; base: number; price: number } | null {
  if (options.kind === "cyborgBrain" || options.kind === "mindEmulation") return null;
  const complexity = intelligenceComplexity(options.kind, options.iq, options.lenses);
  if (complexity === null) return null;
  const base = softwareCost(complexity, options.tl);
  if (base === null) return null;
  const factor = Math.max(AI_COST_FLOOR, 1 + AI_POINT_COST * options.extraPoints);
  return { complexity, base, price: Math.round(base * factor * 100) / 100 };
}

/** The computer a racial template's Accessories perk names: "Accessories (Personal computer)". */
export function accessoryComputer(entries: readonly string[]): ComputerModel | null {
  for (const entry of entries) {
    const match = /accessor(?:y|ies)\s*\(([^)]*)\)/i.exec(entry);
    if (!match) continue;
    const text = String(match[1]).toLowerCase();
    const model = COMPUTER_MODELS.find((m) => new RegExp(`\\b${m}\\b`).test(text));
    if (model) return model;
  }
  return null;
}

/** A total cyborg's computer is one size smaller, to make room for the brain case (p. 27). */
export function cyborgComputer(model: ComputerModel): ComputerModel | null {
  const at = COMPUTER_MODELS.indexOf(model);
  return at > 0 ? COMPUTER_MODELS[at - 1] ?? null : null;
}

/**
 * A digital backup's size in gigabytes (p. 30): 0.005 for a Complexity 1
 * brain, ten times as much per level.
 */
export function backupGigabytes(complexity: number): number {
  return 0.005 * 10 ** Math.max(0, complexity - 1);
}

/** Making a backup takes at least a minute (p. 30). */
export const BACKUP_SECONDS = 60;

/** Reprogramming with physical access: Electronics Repair (Computer), 10 minutes an attempt (p. 35). */
export const PHYSICAL_ACCESS = Object.freeze({ skill: "Electronics Repair (Computers)", minutes: 10 });

/** Reprogramming without the codes: Computer Programming (AI) against IQ, an hour an attempt (p. 35). */
export const INVOLUNTARY = Object.freeze({ skill: "Computer Programming (AI)", hours: 1, automatonBonus: 3 });

/** The hacker's bonus against an AI with Automaton or Slave Mentality (p. 35). */
export function reprogrammingBonus(traits: readonly string[]): number {
  return traits.some((name) => /^(automaton|slave mentality)\b/i.test(name)) ? INVOLUNTARY.automatonBonus : 0;
}

/** A machine needs IQ 6 to be sapient, and a paradox only confuses a sapient one (pp. 29, 34). */
export const SAPIENT_IQ = 6;

/** Paint on the sensors: -10 to hit, and -10 for the blinded robot unless it has scanners (p. 34). */
export const PAINT_PENALTY = -10;

/** A panicked robot spins out of control for 1d turns (p. 34). */
export const PANIC_DICE = "1d6";

/** The IQ roll a robot knocked back makes in cinematic combat: -2 per yard (p. 34). */
export function knockbackStunPenalty(yards: number): number {
  return -2 * Math.max(0, Math.floor(yards));
}

/** The skills a paradox can be pressed with (p. 34). */
export const PARADOX_SKILLS = ["Psychology", "Fast-Talk", "Computer Programming (AI)"] as const;

/** A vat of molten metal does 10d corrosion a second (p. 34). */
export const MOLTEN_METAL = "10d6";

/** Whether a set of trait names makes an Automaton (the meta-trait or its lenses). */
export function isAutomaton(traits: readonly string[], lenses: readonly Intelligence[] = []): boolean {
  if (lenses.some((kind) => kind === "nonVolitional" || kind === "weakDedicated" || kind === "drone")) return true;
  return traits.some((name) => /^automaton\b/i.test(name));
}
