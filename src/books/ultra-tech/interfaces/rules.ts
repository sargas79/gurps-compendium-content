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
