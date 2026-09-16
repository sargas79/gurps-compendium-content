/**
 * Ultra-Tech's interfaces and media: the HUD, neural interfaces, virtual
 * reality levels, translators, sensies, augmented reality, virtual and AI
 * tutors, dream teachers and instaskill nano (pp. 24, 47-59).
 */

/** A HUD gives +1 to skill when reacting quickly matters (p. 24). */
export const HUD_BONUS = 1;

/** The skills the book names as benefiting from a HUD (p. 24). */
export const HUD_SKILLS = [/^driving\b/i, /^piloting\b/i, /^free fall\b/i];

/** The VR levels, lowest first (p. 54). */
export const VR_LEVELS = ["gloves", "basic", "full", "total"] as const;
export type VrLevel = (typeof VR_LEVELS)[number];

/** The Complexity each VR level's interface needs (p. 54). */
export const VR_COMPLEXITY: Readonly<Record<VrLevel, number>> = Object.freeze({ gloves: 2, basic: 3, full: 5, total: 6 });

/** A VR manager of a Complexity supports up to: 4 basic, 5 full, 6 total (p. 54). */
export function managerSupports(complexity: number): VrLevel | null {
  if (complexity >= 6) return "total";
  if (complexity >= 5) return "full";
  if (complexity >= 4) return "basic";
  return null;
}

/** The reality a user experiences: the lower of the interface and the manager (p. 54). */
export function experiencedLevel(interfaceLevel: VrLevel, managerComplexity: number): VrLevel | null {
  const managed = managerSupports(managerComplexity);
  if (!managed) return null;
  return VR_LEVELS[Math.min(VR_LEVELS.indexOf(interfaceLevel), VR_LEVELS.indexOf(managed))] ?? null;
}

/** A translator's comprehension level and its Complexity (p. 48). */
export type Comprehension = "broken" | "accented" | "native";

/**
 * A translator program's Complexity (p. 48): 3 broken, 4 accented, 5 native;
 * -1 for each artificial language, +1 between species that think differently,
 * +1 across senses or frequencies.
 */
export function translatorComplexity(level: Comprehension, options: { artificial?: number; interspecies?: boolean; crossSense?: boolean } = {}): number {
  const base = { broken: 3, accented: 4, native: 5 }[level];
  return base - Math.max(0, Math.min(2, options.artificial ?? 0)) + (options.interspecies ? 1 : 0) + (options.crossSense ? 1 : 0);
}

/** An unusual language pair costs twice as much, an obscure one five times (p. 48). */
export const PAIR_COST = Object.freeze({ common: 1, unusual: 2, obscure: 5 });

/** Two translators in series: one grade below the less capable, with a second's delay (p. 48). */
export function seriesComprehension(a: Comprehension, b: Comprehension): Comprehension | "none" {
  const order: Comprehension[] = ["broken", "accented", "native"];
  const lower = Math.min(order.indexOf(a), order.indexOf(b)) - 1;
  return lower < 0 ? "none" : order[lower]!;
}

/** A universal translator's comprehension after hours of exposure: broken at 1, accented at 6, native at 24 (p. 48). */
export function universalTranslatorLevel(hours: number): Comprehension | "none" {
  if (hours >= 24) return "native";
  if (hours >= 6) return "accented";
  if (hours >= 1) return "broken";
  return "none";
}

/** A sensie in surface mode: -3 to other tasks, half the shock, +4 to HT, Will and Fright Checks (p. 57). */
export const SENSIE_SURFACE = Object.freeze({ tasks: -3, shock: 0.5, resist: 4 });

/** The bandwidth a real-time sensie needs: 1 GB/s immersion, 0.1 GB/s surface (p. 58). */
export const SENSIE_BANDWIDTH = Object.freeze({ immersion: 1, surface: 0.1 });

/** Dreamgame addiction is a cheap, legal, incapacitating non-chemical addiction [-10] (p. 55). */
export const DREAMGAME_ADDICTION = -10;

/** A virtual tutor gives an effective skill of 12; Complexity 3 for an Easy skill, 4 otherwise (p. 57). */
export const VIRTUAL_TUTOR_SKILL = 12;
export function virtualTutorComplexity(easy: boolean): number {
  return easy ? 3 : 4;
}

/** A cosmetic filter raises video Appearance a level, to Very Handsome at most (p. 56). */
export const APPEARANCE_LEVELS = ["Hideous", "Ugly", "Unattractive", "Average", "Attractive", "Handsome", "Very Handsome"] as const;
export function filteredAppearance(level: string): string {
  const at = APPEARANCE_LEVELS.findIndex((a) => a.toLowerCase() === String(level).toLowerCase());
  if (at < 0) return level;
  return APPEARANCE_LEVELS[Math.min(APPEARANCE_LEVELS.length - 1, at + 1)]!;
}

/** Visual enhancement: +1 to Vision rolls (p. 56). */
export const VISUAL_ENHANCEMENT = 1;

/** How fast a study aid teaches, as the Basic Set's study rates (Campaigns p. 293). */
export type StudyRate = "selfStudy" | "teacher" | "intensive" | "education";

/** An AI tutor: a non-volitional one is self-study (half speed), a volitional one a teacher (p. 59). */
export function aiTutorRate(volitional: boolean): StudyRate {
  return volitional ? "teacher" : "selfStudy";
}

/** A dream teacher: Intensive Training in IQ-based skills and languages; Education in DX- and HT-based ones (p. 59). */
export function dreamTeacherRate(attribute: string): StudyRate {
  return /^iq$/i.test(attribute) ? "intensive" : "education";
}

/**
 * A dream teacher program's Complexity (p. 59): 6 Easy, 7 Average, 8 Hard or a
 * language, 9 Very Hard; behaviour modification 7 for a -1 point
 * disadvantage, 8 for -2 to -10, 9 otherwise.
 */
export function dreamTeacherComplexity(target: { difficulty?: "E" | "A" | "H" | "VH"; language?: boolean; disadvantagePoints?: number }): number {
  if (target.disadvantagePoints !== undefined) {
    const points = Math.abs(target.disadvantagePoints);
    return points <= 1 ? 7 : points <= 10 ? 8 : 9;
  }
  if (target.language) return 8;
  return { E: 6, A: 7, H: 8, VH: 9 }[target.difficulty ?? "A"];
}

/**
 * Instaskill nano (p. 59): a dose gives a point in an IQ-based skill,
 * technique or language only to someone with no more than one point in it.
 */
export function instaskillTakes(points: number): boolean {
  return points <= 1;
}

/** It takes a day to assimilate (an hour with superscience) (p. 59). */
export function instaskillHours(superscience: boolean): number {
  return superscience ? 1 : 24;
}

/** Doses before assimilation: IQ or Phantom Voices [-5] for days by the margin, permanently on a critical failure (p. 59). */
export function instaskillOverdose(result: { success: boolean; criticalFailure: boolean; margin: number }): { phantomVoices: boolean; days: number | "permanent" } {
  if (result.success) return { phantomVoices: false, days: 0 };
  return { phantomVoices: true, days: result.criticalFailure ? "permanent" : result.margin };
}

/** Entertainment consoles are +1 Complexity for games, VR and sensies (p. 51). */
export const CONSOLE_GAME_BONUS = 1;

/** Interactive holoprojection through anything but a neural interface is at -6 (p. 53). */
export const HOLOPROJECTION_NO_INTERFACE = -6;

/** Yanking off a neural interface helmet before disconnecting: 1d injury; donning or removing it takes four seconds (p. 49). */
export const NEURAL_HELMET = Object.freeze({ yank: "1d", seconds: 4 });

/** What a holoprojection tries (p. 53): fool someone, frighten them, or pass as someone they know. */
export type HoloAim = "fool" | "fright" | "impersonate";

/**
 * The Quick Contest a holoprojection is (p. 53): the operator's skills, of which
 * "impersonate" takes the lowest, and the victim's scores, of which the higher.
 */
export function holoContest(aim: HoloAim): { operator: string[]; lowest: boolean; victim: string[] } {
  if (aim === "fool") return { operator: ["Electronics Operation (Media)"], lowest: false, victim: ["Per"] };
  if (aim === "fright") return { operator: ["Artist (Holoprojection)"], lowest: false, victim: ["IQ", "Per"] };
  return { operator: ["Acting", "Electronics Operation (Media)", "Artist (Holoprojection)"], lowest: true, victim: ["IQ", "Per"] };
}

/**
 * The victim's modifiers against a holoprojection (p. 53): +4 if warned, +10 if
 * it was made unsubtly or is examined with a sense it can't fool, +4 per fake
 * person after the first, the GM's -5 to +10 for how believable it is, and
 * -1 to the operator per -1 of darkness (a +1 to the victim).
 */
export function holoVictimModifier(options: { warned?: boolean; unsubtle?: boolean; people?: number; believability?: number; darkness?: number }): number {
  const people = Math.max(0, Math.floor(Number(options.people) || 0));
  const believability = Math.max(-5, Math.min(10, Math.floor(Number(options.believability) || 0)));
  const darkness = Math.max(0, Math.floor(Math.abs(Number(options.darkness) || 0)));
  return (options.warned ? 4 : 0) + (options.unsubtle ? 10 : 0) + 4 * Math.max(0, people - 1) + believability + darkness;
}

/** A scent synthesizer's masking odor: -5 on rolls to detect things by smell (p. 52); its nauseating odor is resisted at HT. */
export const SCENT_SYNTH = Object.freeze({ mask: -5, nauseaResist: 0 });

/** A sonic projector's range in yards: 200, 100 or 10, x1.5 at TL10, x2 at TL11, x3 at TL12 (p. 52). */
export function sonicProjectorRange(size: "large" | "medium" | "small", tl: number): number {
  const base = { large: 200, medium: 100, small: 10 }[size];
  return base * (tl >= 12 ? 3 : tl >= 11 ? 2 : tl >= 10 ? 1.5 : 1);
}

/**
 * The shock a sensie passes on (p. 57): the Basic Set's -1 per HP of injury, at
 * most -4, per 10 HP for the large (Campaigns p. 419); halved in surface mode.
 */
export function sensieShock(injury: number, hp: number, mode: "immersion" | "surface"): number {
  const per = Math.max(1, Math.floor(Math.max(0, Number(hp) || 0) / 10));
  const shock = Math.min(4, Math.floor(Math.max(0, Number(injury) || 0) / per));
  const passed = mode === "surface" ? Math.floor(shock / 2) : shock;
  return passed ? -passed : 0;
}
