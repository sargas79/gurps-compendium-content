/**
 * Realistic injury (GURPS Martial Arts pp. 136, 138-139): partial injuries,
 * extreme dismemberment, severe bleeding, and lasting wounds. The pure rules.
 */

// ── partial injuries (p. 136) ──

/** What a wound's long-term pain does once 2×HT seconds have passed. */
export interface PartialInjury {
  /** DX penalty for actions with the part (the torso's is for everything). */
  dx: number;
  /** A Will roll to use the part, and the DX penalty on success. */
  willRoll: boolean;
  dodge: number;
  /** Move as a fraction of normal. */
  move: number;
}

/** The effect of `injury` to a part of a fighter with `hp` HP, before pain thresholds; null for none or a cripple. */
export function partialInjury(location: "arm" | "leg" | "torso", injury: number, hp: number): PartialInjury | null {
  const inj = Math.max(0, Number(injury) || 0);
  const max = Math.max(1, Number(hp) || 1);
  if (inj <= 0) return null;
  if (location === "torso") {
    if (inj > (2 * max) / 3) return { dx: -3, willRoll: false, dodge: 0, move: 0.5 };
    if (inj > max / 2) return { dx: -2, willRoll: false, dodge: 0, move: 0.8 };
    if (inj > max / 3) return { dx: -1, willRoll: false, dodge: 0, move: 1 };
    return null;
  }
  if (inj > max / 2) return null;
  if (inj > max / 3) return { dx: -5, willRoll: true, dodge: location === "leg" ? -2 : 0, move: location === "leg" ? 0.5 : 1 };
  if (inj > max / 5) return { dx: -3, willRoll: false, dodge: location === "leg" ? -1 : 0, move: location === "leg" ? 0.8 : 1 };
  return { dx: -1, willRoll: false, dodge: 0, move: 1 };
}

/** High Pain Threshold halves a DX penalty rounding toward none; Low multiplies by 1.5 rounding worse. */
export function painThreshold(dx: number, pain: "high" | "low" | null): number {
  if (dx >= 0) return 0;
  if (pain === "high") return -Math.floor(-dx / 2) || 0;
  if (pain === "low") return -Math.ceil(-dx * 1.5);
  return dx;
}

/** The Will roll's modifier for the pain thresholds (p. 136). */
export function painWill(pain: "high" | "low" | null): number {
  return pain === "high" ? 3 : pain === "low" ? -4 : 0;
}

/** Whether a wound has hurt long enough: 2×HT seconds (p. 136). */
export function painSetsIn(elapsedSeconds: number, ht: number): boolean {
  return elapsedSeconds >= 2 * Math.max(1, Number(ht) || 10);
}

// ── extreme dismemberment (p. 136) ──

/** The part a cut through carries on to. */
export function otherPart(location: string): string | null {
  return ["arm", "hand", "leg", "foot"].includes(location) ? location : null;
}

/** Whether a cut severs the part: injury over twice what cripples it (p. B421). */
export function severs(injury: number, crippling: number | null): boolean {
  return crippling !== null && crippling > 0 && injury > 2 * crippling;
}

/** The second part's effective DR (p. 136): its DR, the severed part's DR, and HP/2 for a limb or HP/3 for an extremity, rounded up. */
export function carryThroughDr(options: { newDr: number; severedDr: number; hp: number; limb: boolean }): number {
  return options.newDr + options.severedDr + Math.ceil(options.hp / (options.limb ? 2 : 3));
}

/** The injury the carried-through cut does: what gets past that DR, times 1.5 for cutting. */
export function carryThroughInjury(basicDamage: number, dr: number): number {
  return Math.floor(Math.max(0, basicDamage - dr) * 1.5);
}

// ── severe bleeding (p. 138) ──

/** A wound bleeding faster or harder than the Basic Set's, and whether bandages can stop it. */
export interface SevereWound {
  intervalSeconds: number;
  modifier: number;
  surgery: boolean;
}

const PIERCING = ["cut", "imp", "pi-", "pi", "pi+", "pi++"];

/** The severe bleeding a wound causes, or null for an ordinary one. */
export function severeWound(options: { hitLocation: string; addonLocation?: string | null; damageType: string; severed?: "limb" | "extremity" | "superficial" | null }): SevereWound | null {
  const cut = options.damageType === "cut";
  const addon = String(options.addonLocation ?? "");
  if (options.severed === "limb") return { intervalSeconds: 30, modifier: cut ? -4 : -3, surgery: false };
  if (/\.ma-(arm|leg|neck)Vein$/.test(addon)) return { intervalSeconds: 30, modifier: cut ? -4 : -3, surgery: true };
  if (options.hitLocation === "vitals") return { intervalSeconds: 30, modifier: -4, surgery: true };
  if (options.hitLocation === "neck" && PIERCING.includes(options.damageType)) return { intervalSeconds: 30, modifier: -2, surgery: true };
  if ((options.hitLocation === "skull" || options.hitLocation === "eye") && (PIERCING.includes(options.damageType) || options.damageType === "burn")) return { intervalSeconds: 30, modifier: 0, surgery: true };
  if (options.severed === "extremity") return { intervalSeconds: 60, modifier: cut ? -3 : -2, surgery: false };
  if (options.severed === "superficial") return { intervalSeconds: 60, modifier: cut ? -2 : -1, surgery: false };
  return null;
}

/** Several severe wounds bleed at the fastest rate and the worst penalty. */
export function worstBleeding(wounds: readonly SevereWound[]): SevereWound | null {
  if (!wounds.length) return null;
  return {
    intervalSeconds: Math.min(...wounds.map((w) => w.intervalSeconds)),
    modifier: Math.min(...wounds.map((w) => w.modifier)),
    surgery: wounds.some((w) => w.surgery),
  };
}

// ── lasting and permanent injuries (pp. 138-139) ──

export type WoundTable = "neck" | "skull" | "veins" | "vitals";

/** The table a major wound rolls on, or null for a location without one. */
export function woundTable(hitLocation: string, addonLocation?: string | null): WoundTable | null {
  if (/\.ma-(arm|leg|neck)Vein$/.test(String(addonLocation ?? ""))) return "veins";
  if (hitLocation === "neck") return "neck";
  if (hitLocation === "skull" || hitLocation === "eye") return "skull";
  if (hitLocation === "vitals") return "vitals";
  return null;
}

/** A table's result on 3d: the effect's key, or null for no special effect. "reroll:<table>" sends it to another table. */
export function woundEffect(table: WoundTable, roll: number): string | null {
  const r = Math.max(3, Math.min(18, Math.floor(roll)));
  const tables: Record<WoundTable, Record<number, string | null>> = {
    neck: { 3: "lessHt", 4: "reroll:skull", 5: "reroll:skull", 6: "numb", 7: "numb", 14: "voice", 15: "voice", 16: "reroll:skull", 17: "reroll:skull", 18: "lessDx" },
    skull: { 3: "epilepsy", 4: "lessIq", 5: "lowEmpathy", 6: "amnesia", 7: "dyslexia", 8: "stuttering", 9: "badSight", 12: "hardOfHearing", 13: "hamFisted", 14: "neuroMild", 15: "lessSpeed", 16: "lessDx", 17: "neuroSevere", 18: "neuroCrippling" },
    veins: { 3: "lessHt", 4: "crippledLimb", 5: "crippledLimb", 6: "easyToKill", 7: "easyToKill", 14: "wounded", 15: "wounded", 16: "crippledLimb", 17: "crippledLimb", 18: "reroll:skull" },
    vitals: { 3: "lessHt", 4: "chronicPain", 5: "restrictedDiet", 6: "susceptible", 7: "lessFp", 8: "easyToKill", 13: "wounded", 14: "slowHealing", 15: "unfit", 16: "maintenanceDaily", 17: "maintenanceThrice", 18: "maintenanceConstant" },
  };
  return tables[table][r] ?? null;
}

/** How long a lasting effect lasts, by the HT roll (p. B422): short-term, lasting, or permanent. */
export function woundDuration(outcome: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean }): "shortTerm" | "lasting" | "permanent" {
  if (outcome.criticalFailure) return "permanent";
  return outcome.success ? "shortTerm" : "lasting";
}
