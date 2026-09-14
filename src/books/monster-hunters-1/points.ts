/**
 * Monster Hunters 1's points (GURPS Monster Hunters 1: Champions pp. 23, 28,
 * 31): destiny points, wildcard bonus points, and spending them on outcomes.
 *
 * The system spends points on outcomes -- buying a roll up, a flesh wound, a
 * piece of guidance -- from unspent character points. This book adds two more
 * pools, registered with the system's point-pool registry and kept under
 * `system.extensions.gurps-compendium-content.points`:
 *
 *   - destiny points, from a Destiny advantage, regained one a session;
 *   - wildcard bonus points, one per 12 points in each wildcard skill, handed
 *     out afresh each session and paying only for that skill.
 *
 * A negative Destiny sets points aside for the GM instead.
 */

import { MODULE_ID } from "../../shared/module.js";

/** "Destiny at the 5-, 10-, or 15-point level lets you start the game with 1, 2, or 3 destiny points" (p. 23). */
export function destinyPoints(traitPoints: number): { own: number; gm: number } {
  const level = Math.min(3, Math.floor(Math.abs(traitPoints) / 5));
  return traitPoints > 0 ? { own: level, gm: 0 } : { own: 0, gm: traitPoints < 0 ? level : 0 };
}

/** "You regain one destiny point each game session, but can never have more than you started the game with" (p. 23). */
export function regainDestiny(current: number, starting: number): number {
  return Math.max(0, Math.min(starting, current + 1));
}

/** "For every 12 points spent on a wildcard skill, the user receives one bonus point for that skill" (p. 28). */
export function wildcardBonusPoints(pointsInSkill: number): number {
  return Math.max(0, Math.floor(Math.max(0, pointsInSkill) / 12));
}

/** "Users with at least 12 points in a wildcard skill ignore penalties for familiarity" (p. 28). */
export function wildcardIgnoresFamiliarity(pointsInSkill: number): boolean {
  return pointsInSkill >= 12;
}

export type PointUse = "buySuccess" | "fleshWound" | "guidance";

/**
 * Whether a pool may pay for a use (p. 31). Destiny points have "no special
 * restrictions". Wildcard bonus points pay for a success roll only "against
 * that skill"; for a flesh wound or guidance only where the skill was
 * involved, which the GM decides, so those carry a check for the GM.
 */
export function mayPay(pool: { kind: "destiny" } | { kind: "wildcard"; skill: string }, use: PointUse, roll: { skill?: string } = {}): { allowed: boolean; gmCheck: boolean } {
  if (pool.kind !== "wildcard") return { allowed: true, gmCheck: false };
  if (use === "buySuccess") {
    const asked = (roll.skill ?? "").trim().toLowerCase();
    // With no roll to match -- the sheet listing what a character holds -- the pool is shown.
    return { allowed: !asked || asked === pool.skill.trim().toLowerCase(), gmCheck: false };
  }
  return { allowed: true, gmCheck: true };
}

/** What the module stores on a character. Null for a pool never spent from, which starts full. */
export interface StoredPoints {
  destiny?: number | null;
  gmDestiny?: number | null;
  wildcard?: Array<{ skill: string; value: number }>;
}

/** A character's pools: what each holds now, and the most it can. */
export interface Pools {
  destiny: { value: number; max: number };
  gmDestiny: { value: number; max: number };
  wildcard: Array<{ skill: string; value: number; max: number; fullyTrained: boolean }>;
}

/** The pools a character has, from their Destiny trait and wildcard skills, over what is stored. */
export function poolsFrom(options: {
  destinyTraitPoints: number;
  wildcardSkills: Array<{ name: string; points: number }>;
  stored: StoredPoints | undefined;
}): Pools {
  const destiny = destinyPoints(options.destinyTraitPoints);
  const stored = options.stored ?? {};
  const clamp = (value: unknown, max: number) => Math.min(max, Math.max(0, Number(value ?? max) || 0));
  return {
    destiny: { value: clamp(stored.destiny ?? destiny.own, destiny.own), max: destiny.own },
    gmDestiny: { value: clamp(stored.gmDestiny ?? destiny.gm, destiny.gm), max: destiny.gm },
    wildcard: options.wildcardSkills.map((skill) => {
      const max = wildcardBonusPoints(skill.points);
      const kept = (stored.wildcard ?? []).find((p) => p.skill === skill.name);
      return { skill: skill.name, max, value: kept ? clamp(kept.value, max) : max, fullyTrained: wildcardIgnoresFamiliarity(skill.points) };
    }),
  };
}

/** A character's pools, read off their items and the module's stored points. */
export function poolsOf(actor: any): Pools {
  const items = [...(actor?.items ?? [])];
  const destinyTrait = items.find((i: any) => i.type === "trait" && /^\s*destiny\b/i.test(String(i.name ?? "")));
  const wildcardSkills = items.filter((i: any) => i.type === "skill" && i.system?.difficulty === "W");
  return poolsFrom({
    destinyTraitPoints: destinyTrait ? Number(destinyTrait.system?.totalPoints ?? destinyTrait.system?.points ?? 0) || 0 : 0,
    wildcardSkills: wildcardSkills.map((s: any) => ({ name: String(s.name ?? ""), points: Number(s.system?.points ?? 0) || 0 })),
    stored: actor?.system?.extensions?.[MODULE_ID]?.points,
  });
}

/** The state to store after a session starts: wildcard points handed out, a destiny point regained, the GM's set aside. */
export function refreshed(pools: Pools): Required<StoredPoints> {
  return {
    destiny: regainDestiny(pools.destiny.value, pools.destiny.max),
    gmDestiny: pools.gmDestiny.max,
    wildcard: pools.wildcard.map((p) => ({ skill: p.skill, value: p.max })),
  };
}

/** The state to store after spending from a pool, or null where it can't pay. */
export function spent(pools: Pools, pool: { kind: "destiny" } | { kind: "wildcard"; skill: string }, cost: number): Required<StoredPoints> | null {
  const base: Required<StoredPoints> = {
    destiny: pools.destiny.value,
    gmDestiny: pools.gmDestiny.value,
    wildcard: pools.wildcard.map((p) => ({ skill: p.skill, value: p.value })),
  };
  if (pool.kind === "destiny") {
    if (pools.destiny.value < cost) return null;
    return { ...base, destiny: pools.destiny.value - cost };
  }
  const entry = base.wildcard.find((p) => p.skill === pool.skill);
  if (!entry || entry.value < cost) return null;
  entry.value -= cost;
  return base;
}
