/**
 * Tournament combat (GURPS Martial Arts pp. 134-135): which skills a
 * competition uses, the Quick Contest method with its deadly hits, and the
 * detailed method's lulls, flurries and pressing. The pure rules.
 */

export type SkillKind = "art" | "sport" | "combat";

export type Competition =
  | "demonstration" | "nonContact" | "lightContact" | "fullContactProtected" | "fullContactUnprotected" | "noHoldsBarred" | "earlyJoust" | "lateJoust";

/** The skills each kind of competition is resolved with (pp. 134-135). */
export const COMPETITIONS: Readonly<Record<Competition, readonly SkillKind[]>> = {
  demonstration: ["art"],
  nonContact: ["art", "sport"],
  lightContact: ["sport"],
  fullContactProtected: ["sport"],
  fullContactUnprotected: ["combat"],
  noHoldsBarred: ["combat"],
  earlyJoust: ["combat"],
  lateJoust: ["sport"],
};

/** Whether a skill is a Combat Art or a Combat Sport skill, by its name ("Karate Art", "Lance Sport", "Combat Art (Karate)"). */
export function artOrSport(name: string): "art" | "sport" | null {
  const plain = String(name ?? "").trim();
  if (/^combat art\b|\bart(\s*\(|$)/i.test(plain)) return "art";
  if (/^combat sport\b|\bsport(\s*\(|$)/i.test(plain)) return "sport";
  return null;
}

/** The best skill a fighter may use in a competition, from skills already sorted into kinds. */
export function bestSkill<T extends { level: number; kind: SkillKind | null }>(skills: readonly T[], competition: Competition): T | null {
  const allowed = COMPETITIONS[competition];
  return [...skills].filter((s) => s.kind !== null && allowed.includes(s.kind)).sort((a, b) => b.level - a.level)[0] ?? null;
}

/**
 * The hits a deadly bout leaves (p. 134): the winner takes one if he failed his
 * roll, the loser always takes one, and a critical failure makes it three.
 * A tie leaves nobody the winner, so both count as losers.
 */
export function deadlyHits(side: { won: boolean; success: boolean; criticalFailure: boolean }): number {
  if (side.criticalFailure) return 3;
  if (side.won) return side.success ? 0 : 1;
  return 1;
}

/** A match of rounds or points: who has more wins, or null for a draw. */
export function matchWinner(wins: { first: number; second: number }): "first" | "second" | null {
  if (wins.first === wins.second) return null;
  return wins.first > wins.second ? "first" : "second";
}

// ── the detailed method (p. 134) ──

/** A lull lasts 4d seconds, a flurry 2d. */
export const LULL_DICE = "4d6";
export const FLURRY_DICE = "2d6";

export type Pressing = "both" | "first" | "second";

/**
 * What pressing does to a flurry: both pressing adds 2d seconds; one pressing
 * rolls Tactics, and a win adds his margin of victory while anything else
 * starts a lull at once.
 */
export function pressResult(pressing: Pressing, contest?: { outcome: "first" | "second" | "tie"; marginOfVictory: number }): { roll: boolean; seconds: number; lull: boolean } {
  if (pressing === "both") return { roll: true, seconds: 0, lull: false };
  if (contest && contest.outcome === pressing && contest.marginOfVictory > 0) return { roll: false, seconds: contest.marginOfVictory, lull: false };
  return { roll: false, seconds: 0, lull: true };
}

/** The next phase once one ends: a flurry after a lull, a lull after a flurry, and only lulls after a round's one flurry where that's the rule. */
export function nextPhase(options: { phase: "lull" | "flurry"; flurries: number; oneFlurry: boolean }): "lull" | "flurry" {
  if (options.phase === "flurry") return "lull";
  return options.oneFlurry && options.flurries >= 1 ? "lull" : "flurry";
}

/** The seconds of a flurry fought before it ended early: what the GM entered, within the flurry. */
export function secondsFought(entered: number, flurryLeft: number): number {
  return Math.max(0, Math.min(Math.floor(Number(flurryLeft) || 0), Math.floor(Number(entered) || 0)));
}
