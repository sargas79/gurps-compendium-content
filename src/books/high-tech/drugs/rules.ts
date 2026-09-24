/**
 * High-Tech's hygiene supplies, drugs and poisons (pp. 221, 226-227), as pure
 * rules: what each record is, the bonuses the supplies and drugs give, and
 * the five poisons as the shared engine's poison numbers with what each cycle
 * does beyond its damage.
 */

import { poisonNumbers, type Delivery, type PoisonNumbers } from "../../../shared/drugs/rules.js";

/** The hygiene supplies of p. 221, used daily (worn, in the sheet's terms). */
export const HYGIENE = ["soap", "footPowder", "insectRepellent", "saltTablets", "sunscreen", "vitamins", "handSanitizer"] as const;
/** The drugs of pp. 226-227, each given a dose at a time. */
export const DRUGS = [
  "ammonia", "castorOil", "morphine", "quinine", "charcoal", "analgesics", "antibiotics", "antibioticOintment",
  "antimalarial", "antitoxin", "chelating", "psychiatric", "truthSerum", "dmso",
] as const;
/** The poisons of p. 227. */
export const POISONS = ["curare", "ricin", "strychnine", "botulin", "thallium"] as const;

export type Hygiene = (typeof HYGIENE)[number];
export type Drug = (typeof DRUGS)[number];
export type HtPoison = (typeof POISONS)[number];
export type DrugKind = Hygiene | Drug | HtPoison;
export const DRUG_KINDS: readonly DrugKind[] = [...HYGIENE, ...DRUGS, ...POISONS];

export const isHygiene = (kind: string): kind is Hygiene => (HYGIENE as readonly string[]).includes(kind);
export const isDrug = (kind: string): kind is Drug => (DRUGS as readonly string[]).includes(kind);
export const isPoison = (kind: string): kind is HtPoison => (POISONS as readonly string[]).includes(kind);

/**
 * The records by name, as the captured and by-hand records name them: a
 * supply or a multi-dose bottle says how much in brackets after the plain
 * name, so each is matched on the name's start.
 */
const NAMES: ReadonlyArray<[RegExp, DrugKind]> = [
  [/^soap\b/i, "soap"],
  [/^foot powder\b/i, "footPowder"],
  [/^insect repell[ae]nt\b/i, "insectRepellent"],
  [/^salt tablets\b/i, "saltTablets"],
  [/^sunscreen\b/i, "sunscreen"],
  [/^vitamin pills\b/i, "vitamins"],
  [/^hand sanitizer\b/i, "handSanitizer"],
  [/^ammonia inhalants?\b/i, "ammonia"],
  [/^castor oil\b/i, "castorOil"],
  [/^morphine\b/i, "morphine"],
  [/^quinine\b/i, "quinine"],
  [/^activated charcoal\b/i, "charcoal"],
  [/^analgesics?\b/i, "analgesics"],
  [/^antibiotic ointment\b/i, "antibioticOintment"],
  [/^antibiotics\b/i, "antibiotics"],
  [/^antimalarial pills\b/i, "antimalarial"],
  [/^antitoxin kit\b/i, "antitoxin"],
  [/^chelating agents?\b/i, "chelating"],
  [/^psychiatric drugs?\b/i, "psychiatric"],
  [/^truth serum\b/i, "truthSerum"],
  [/^dmso\b/i, "dmso"],
  [/^curare\b/i, "curare"],
  [/^ricin\b/i, "ricin"],
  [/^strychnine\b/i, "strychnine"],
  [/^botulin(um)? toxins?\b/i, "botulin"],
  [/^(irradiated )?thallium\b/i, "thallium"],
];

/** What a record is to these rules, by its name, or "" for none of them. */
export function drugKindByName(name: string): DrugKind | "" {
  const text = String(name ?? "").trim();
  return NAMES.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

const WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twenty: 20 };

/**
 * How many doses one record holds, read off its name -- "(10 doses)",
 * "(10-use bottle)", "(four-use bottle)", "(bottle of 50)", "(10-dose tube)"
 * -- or the book's figure where the name says only "vial": 20 uses of
 * ammonia inhalants (p. 226). A dose priced alone holds one.
 */
export function dosesPerRecord(name: string, kind: DrugKind | ""): number {
  const text = String(name ?? "");
  const count = /\((\w+)[ -](?:doses?|uses?)\b/i.exec(text)?.[1] ?? /\bof (\d+)\)/i.exec(text)?.[1];
  if (count) return Number(count) || WORDS[count.toLowerCase()] || 1;
  if (kind === "ammonia") return AMMONIA_USES;
  return 1;
}

/** A vial of ammonia inhalants is good for 20 uses (p. 226). */
export const AMMONIA_USES = 20;

// ── hygiene (p. 221) ──

/** What a roll is, as the supplies and drugs read it. */
export interface RollFacts {
  tags: readonly string[];
  /** The disease the roll is against: the contagion roll's record, or the illness's name. */
  disease: string;
}

/** A supply or drug in use, as the rolls weigh it. */
export interface InUse {
  kind: DrugKind;
  name: string;
}

/** Fungal infections of the feet (p. 221). */
const FUNGAL = /fung|trench foot|jungle rot|athlete'?s foot|ringworm|tinea/i;
/** Diseases carried by insects (p. 221), by name: the Basic Set's diseases say how they spread, not what carries them. */
const INSECT_BORNE = /malaria|yellow fever|dengue|typhus|plague|sleeping sickness|trypanosom|leishmani|lyme|encephalitis|west nile|zika|chikungunya|filaria|river blindness|chagas|tularemia|insect|mosquito|tick|flea|louse|lice/i;
/** Malaria, which quinine and the antimalarials fight (p. 226). */
const MALARIA = /malaria/i;

export const SOAP_BONUS = 1;
export const SANITIZER_BONUS = 1;
export const FOOT_POWDER_BONUS = 2;
export const REPELLENT_BONUS = 3;
export const SALT_TABLET_BONUS = 1;
/** Sunscreen: DR 2 against sunburn for 2-4 hours (p. 221). */
export const SUNSCREEN_DR = 2;
/** Quinine and the antimalarials: +5 to avoid catching malaria, +3 to recover from it (p. 226). */
export const MALARIA_PREVENTION = 5;
export const MALARIA_RECOVERY = 3;

/**
 * The lines the supplies and drugs in daily use put on a roll (pp. 221, 226):
 * soap +1 to Contagion and Infection, hand sanitizer +1 to Contagion, foot
 * powder +2 against a fungal infection of the feet, insect repellent +3
 * against an insect-borne disease, salt tablets +1 on the HT roll against
 * the heat's FP loss, and quinine or an antimalarial +5 to avoid malaria and
 * +3 to recover from it (the better of the two, as one is the other's
 * substitute).
 */
export function dailyUseLines(inUse: readonly InUse[], roll: RollFacts): Array<{ kind: DrugKind; name: string; value: number }> {
  const tags = roll.tags;
  const contagion = tags.includes("contagion");
  const infection = tags.includes("infection");
  const illness = tags.includes("illness");
  const lines: Array<{ kind: DrugKind; name: string; value: number }> = [];
  const first = (kind: DrugKind) => inUse.find((u) => u.kind === kind);
  const add = (kind: DrugKind, value: number, when: boolean) => {
    const used = when ? first(kind) : undefined;
    if (used) lines.push({ kind, name: used.name, value });
  };
  add("soap", SOAP_BONUS, contagion || infection);
  add("handSanitizer", SANITIZER_BONUS, contagion);
  add("footPowder", FOOT_POWDER_BONUS, (contagion || infection || illness) && FUNGAL.test(roll.disease));
  add("insectRepellent", REPELLENT_BONUS, contagion && INSECT_BORNE.test(roll.disease));
  add("saltTablets", SALT_TABLET_BONUS, tags.includes("exposure") && tags.includes("heat"));
  if (MALARIA.test(roll.disease) && (contagion || illness)) {
    const drug = first("quinine") ?? first("antimalarial");
    if (drug) lines.push({ kind: drug.kind, name: drug.name, value: contagion ? MALARIA_PREVENTION : MALARIA_RECOVERY });
  }
  return lines;
}

// ── drugs (pp. 226-227) ──

/** Half the TL, rounded down: antibiotics, antibiotic ointment, chelating agents and the most an antitoxin gives (pp. 226-227). */
export function halfTl(tl: number): number {
  return Math.max(0, Math.floor((Number(tl) || 0) / 2));
}

/** Castor oil's +1 against a digestive poison's ongoing effects, activated charcoal's +3 (p. 226). */
export const CASTOR_OIL_BONUS = 1;
export const CHARCOAL_BONUS = 3;

/** The antitoxins' range: +1 to +TL/2 against one poison (p. 226). */
export function antitoxinBonuses(tl: number): number[] {
  const most = Math.max(1, halfTl(tl));
  return Array.from({ length: most }, (_, i) => i + 1);
}

/**
 * What aspirin and the like take off pain's penalty (p. 226): 1 or 2, after
 * the pain threshold has halved or doubled it, and never more than the pain
 * costs. The penalty is Moderate -2, Severe -4, Terrible -6, halved for High
 * Pain Threshold and doubled for Low (Campaigns p. 428).
 */
export function analgesicRelief(grade: "moderate" | "severe" | "terrible" | null, threshold: "high" | "normal" | "low", relief = 2): number {
  if (!grade) return 0;
  const base = grade === "moderate" ? 2 : grade === "severe" ? 4 : 6;
  const penalty = threshold === "high" ? Math.floor(base / 2) : threshold === "low" ? base * 2 : base;
  return Math.min(penalty, Math.max(1, Math.min(2, Math.floor(relief))));
}

/**
 * Morphine takes the painkillers' rules (p. 226; Campaigns p. 441): a HT-4
 * roll to resist, and on a failure High Pain Threshold, Unfazeable, Laziness
 * and euphoria for hours equal to the margin of failure.
 */
export const PAINKILLER = { resistanceModifier: -4, secondsPerMargin: 3600 } as const;

/** How long the painkiller works: the margin of failure's hours, at least one. */
export function painkillerSeconds(margin: number): number {
  return Math.max(1, Math.floor(Math.abs(Number(margin) || 0))) * PAINKILLER.secondsPerMargin;
}

/**
 * Truth serum (p. 227): after 30 seconds, 1d FP, and a HT-1 roll to avoid -2
 * to Will and to self-control rolls for (20 - HT)/2 minutes.
 */
export const TRUTH_SERUM = { fatigue: "1d", resistanceModifier: -1, penalty: -2, delaySeconds: 30 } as const;

export function truthSerumSeconds(ht: number): number {
  return Math.max(1, Math.floor((20 - (Number(ht) || 10)) / 2)) * 60;
}

/** Smelling salts let a stunned or unconscious person roll HT to recover at once (p. 226). */
export const AMMONIA_ROLL = 0;

/**
 * DMSO carries a blood or digestive agent through the skin: a dose of it
 * makes a dose of either a contact agent (p. 227). Anything else it leaves as
 * it was.
 */
export function withDmso(delivery: readonly Delivery[]): Delivery[] {
  return delivery.some((d) => d === "blood" || d === "digestive") ? ["contact"] : [...delivery];
}

/** The disadvantages p. 227 names as psychiatric drugs' candidates for a Mitigator. */
export const PSYCHIATRIC_CANDIDATES = [
  "Chronic Depression", "Epilepsy", "Flashbacks", "Lunacy", "Manic-Depressive", "Paranoia", "Phantom Voices",
  "Short Attention Span", "Split Personality",
] as const;

/** A day's dose of a psychiatric drug holds its disadvantages at bay for a day. */
export const PSYCHIATRIC_DOSE_SECONDS = 86400;

/** The disadvantages a psychiatric drug mitigates, from the item's comma-separated list, else the book's candidates. */
export function mitigatedList(text: string): string[] {
  const list = String(text ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [...PSYCHIATRIC_CANDIDATES];
}

/** Whether a trait's name is one a psychiatric drug mitigates: the name, with or without a bracketed level or specialty. */
export function mitigates(list: readonly string[], trait: string): boolean {
  const name = String(trait ?? "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
  return list.some((l) => l.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase() === name);
}

// ── poisons (p. 227) ──

const HOUR = 3600;

/**
 * The five poisons as the system's dose machinery runs them. Each does its
 * damage "regardless of the roll" (or has no roll), so the system's cycle is
 * the damage, with no roll of its own: a success would end the dose, which
 * the book doesn't do. The roll each cycle makes is this module's
 * (`POISON_ROLLS`), for what a failure adds.
 *
 *   - Curare: follow-up, a minute's delay, 2d toxic every 30 minutes for four cycles.
 *   - Ricin: blood, digestive or respiratory, 3d toxic every eight hours for ten.
 *   - Strychnine: digestive, 15 minutes' delay, seizures every five minutes
 *     for 2d hours (up to 12 hours; the hours are rolled on the first cycle).
 *   - Botulin: digestive, 4d toxic after 12 hours, then a roll against
 *     paralysis every 12 hours at a growing penalty until it sets in.
 *   - Irradiated thallium: digestive, three hours' delay, 1d toxic every 24
 *     hours for ten cycles, and the radiation's gastrointestinal syndrome.
 */
export const HT_POISONS: Readonly<Record<HtPoison, PoisonNumbers>> = Object.freeze({
  curare: poisonNumbers({ delivery: ["followUp"], delaySeconds: 60, damage: "toxic", dice: 2, intervalSeconds: 1800, cycles: 4, reference: "High-Tech p. 227" }),
  ricin: poisonNumbers({ delivery: ["blood", "digestive", "respiratory"], delaySeconds: 8 * HOUR, damage: "toxic", dice: 3, intervalSeconds: 8 * HOUR, cycles: 10, reference: "High-Tech p. 227" }),
  strychnine: poisonNumbers({ delivery: ["digestive"], delaySeconds: 900, intervalSeconds: 300, cycles: 144, reference: "High-Tech p. 227" }),
  botulin: poisonNumbers({ delivery: ["digestive"], delaySeconds: 12 * HOUR, intervalSeconds: 12 * HOUR, cycles: 99, reference: "High-Tech p. 227" }),
  thallium: poisonNumbers({ delivery: ["digestive"], delaySeconds: 3 * HOUR, damage: "toxic", dice: 1, intervalSeconds: 24 * HOUR, cycles: 10, reference: "High-Tech p. 227" }),
});

/** Strychnine's cycles: every five minutes for 2d hours (p. 227). */
export function strychnineCycles(hours: number): number {
  return Math.max(1, Math.floor(hours)) * 12;
}

/**
 * The HT roll a poison's cycle makes, by the cycle it is (1 for the first),
 * or null for none: curare HT-6, ricin HT-2, strychnine HT against choking,
 * botulin none on the first (the 4d, nausea and retching) and then HT-1,
 * HT-2... against paralysis, one more each cycle; thallium none.
 */
export function poisonRoll(poison: HtPoison, cycle: number): number | null {
  switch (poison) {
    case "curare":
      return -6;
    case "ricin":
      return -2;
    case "strychnine":
      return 0;
    case "botulin":
      return cycle <= 1 ? null : -(cycle - 1);
    default:
      return null;
  }
}

/** What one cycle of a poison does beyond its damage. */
export interface PoisonEffect {
  /** System conditions to apply; `lasting` for one with no end but healing. */
  conditions: Array<{ key: string; lasting?: boolean }>;
  /** Injury the module rolls itself (botulin's 4d on its first cycle). */
  injury: string | null;
  /** Localization keys under the module's Poison notes. */
  notes: string[];
  /** True where the dose runs no further. */
  ends: boolean;
}

/**
 * What a cycle does (p. 227), by the cycle it is, how its roll went (null for
 * none), and whether the victim failed the first roll (ricin's choking).
 */
export function poisonEffects(poison: HtPoison, cycle: number, roll: { success: boolean; criticalFailure: boolean } | null, failedFirst: boolean): PoisonEffect {
  const effect: PoisonEffect = { conditions: [], injury: null, notes: [], ends: false };
  const failed = roll !== null && !roll.success;
  const show = (condition: string, note: string) => {
    effect.conditions.push({ key: condition });
    effect.notes.push(note);
  };
  switch (poison) {
    case "curare":
      // Any failure paralyses; a critical failure chokes as well.
      if (failed) show("paralysis", "curareParalysed");
      if (failed && roll?.criticalFailure) show("choking", "curareChoking");
      break;
    case "ricin":
      // Nausea and vomiting whatever the roll; coughing on a failure; choking on a failure after a failed first roll.
      effect.conditions.push({ key: "nauseated" });
      effect.notes.push("ricinSick");
      if (failed) show("coughing", "ricinCoughing");
      if (failed && failedFirst && cycle > 1) show("choking", "ricinChoking");
      break;
    case "strychnine":
      effect.conditions.push({ key: "seizure" });
      effect.notes.push("strychnineSeizure");
      if (failed) show("choking", "strychnineChoking");
      break;
    case "botulin":
      if (cycle <= 1) {
        effect.injury = "4d";
        effect.conditions.push({ key: "nauseated" }, { key: "retching" });
        effect.notes.push("botulinOnset");
      } else if (failed) {
        // The paralysis heals as a lasting crippling injury of the lungs and spine.
        effect.conditions.push({ key: "paralysis", lasting: true });
        effect.notes.push("botulinParalysed");
        effect.ends = true;
      } else effect.notes.push("botulinHolds");
      break;
    case "thallium":
      if (cycle <= 1) effect.notes.push("thalliumRadiation");
      break;
  }
  return effect;
}
