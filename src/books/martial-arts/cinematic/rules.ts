/**
 * The book's other cinematic combat rules (GURPS Martial Arts pp. 130,
 * 132-133): mind games, faking it, Unarmed Etiquette, Shaking It Off, Shout It
 * Out!, Proxy Fighting and Bullet Time. The pure rules.
 */

// ── the Contest of Wills (p. 130) ──

/** Each side rolls Will, or Intimidation or Mental Strength where better. */
export function willsScore(options: { will: number; intimidation: number | null; mentalStrength: number | null }): number {
  return Math.max(options.will, options.intimidation ?? -Infinity, options.mentalStrength ?? -Infinity);
}

/**
 * A side's modifiers: Fearlessness, +5 each for Indomitable and Unfazeable,
 * +1 per three full levels the better fighter's best combat skill beats the
 * other's, and Reputation turned either way.
 */
export function willsModifiers(options: {
  fearlessness: number;
  indomitable: boolean;
  unfazeable: boolean;
  bestCombatSkill: number | null;
  foeBestCombatSkill: number | null;
  reputation: number;
}): Array<{ key: string; value: number }> {
  const lines: Array<{ key: string; value: number }> = [];
  if (options.fearlessness > 0) lines.push({ key: "fearlessness", value: Math.floor(options.fearlessness) });
  if (options.indomitable) lines.push({ key: "indomitable", value: 5 });
  if (options.unfazeable) lines.push({ key: "unfazeable", value: 5 });
  const edge = Math.floor(((options.bestCombatSkill ?? 0) - (options.foeBestCombatSkill ?? 0)) / 3);
  if (options.bestCombatSkill !== null && edge > 0) lines.push({ key: "betterFighter", value: edge });
  if (options.reputation) lines.push({ key: "reputation", value: Math.floor(options.reputation) });
  return lines;
}

/**
 * One turn of the contest: settled only when one side succeeds and the other
 * fails, and then the winner's margin of victory is found as for a Quick
 * Contest.
 */
export function willsRound(first: { success: boolean; margin: number }, second: { success: boolean; margin: number }): { winner: "first" | "second"; margin: number } | null {
  if (first.success === second.success) return null;
  return { winner: first.success ? "first" : "second", margin: Math.abs(first.margin) + Math.abs(second.margin) };
}

/** The loser's reaction roll gets the margin as a bonus, and an attack on the winner takes it as a penalty. */
export function willsAftermath(margin: number): { reaction: number; attack: number } {
  const m = Math.max(0, Math.floor(margin));
  return { reaction: m, attack: -m || 0 };
}

// ── concentration and fear (p. 130) ──

/** A failed self-control roll distracts a fighter, unless the disadvantage drives him to fight anyway. */
export function distracts(disadvantage: string): boolean {
  return !/^(berserk|bloodlust)\b/i.test(String(disadvantage ?? "").trim());
}

/** A distracted fighter fights at -2 DX. */
export const DISTRACTED_DX = -2;

/** Intimidation against minor NPCs: +1 per five of their number they know the heroes have beaten, to +4. */
export function defeatedFoesBonus(defeated: number): number {
  return Math.min(4, Math.max(0, Math.floor((Number(defeated) || 0) / 5)));
}

// ── faking it (p. 130) ──

/** Stage Combat's defaults: Combat Art or Sport at -2, combat skills and Performance at -3. */
export function stageCombatDefault(options: { combatArt: number | null; combat: number | null; performance: number | null }): number | null {
  const options3 = [
    options.combatArt === null ? null : options.combatArt - 2,
    options.combat === null ? null : options.combat - 3,
    options.performance === null ? null : options.performance - 3,
  ].filter((v): v is number => v !== null);
  return options3.length ? Math.max(...options3) : null;
}

/** A skill based on another attribute: its level moved by the difference between the attributes. */
export function rebasedLevel(level: number, from: number, to: number): number {
  return level - from + to;
}

// ── Unarmed Etiquette (p. 132) ──

/** Weapons and shields can't parry or block an unarmed attack. */
export function etiquetteRefuses(options: { delivery: string; defense: "dodge" | "parry" | "block"; bareHanded: boolean }): boolean {
  if (options.delivery !== "unarmed") return false;
  if (options.defense === "block") return true;
  return options.defense === "parry" && !options.bareHanded;
}

// ── Shout It Out! (p. 132) ──

/** A shouted attack gives the target -1 to defend; a shouted defense gets +1. */
export const SHOUTED_ATTACK = -1;
export const SHOUTED_DEFENSE = 1;

/** The first secret style not yet shouted this battle, or null. */
export function unshoutedStyle(styles: readonly string[], shouted: readonly string[]): string | null {
  return styles.find((style) => !shouted.includes(style)) ?? null;
}

/** The GM's limit: one secret style per full 50 character points. */
export function secretStylesAllowed(points: number): number {
  return Math.max(0, Math.floor((Number(points) || 0) / 50));
}

// ── Proxy Fighting (pp. 132-133) ──

export type Proxy = "object" | "slapArm" | "slapLeg" | "slapHead" | "puppetWilling" | "puppetUnwilling";
export const PROXIES: readonly Proxy[] = ["object", "slapArm", "slapLeg", "slapHead", "puppetWilling", "puppetUnwilling"];

/** How far an object can be knocked into someone: ST/2, rounded up. */
export function proxyRange(st: number): number {
  return Math.ceil(Math.max(0, Number(st) || 0) / 2);
}

/**
 * A proxy's penalty: -4 through an object or a willing puppet; -4 plus the
 * borrowed part's penalty to slap someone into a foe; and the unwilling
 * puppet's ST/2, rounded up, but never better than -4.
 */
export function proxyPenalty(proxy: Proxy, proxySt = 0): number {
  switch (proxy) {
    case "slapArm":
    case "slapLeg":
      return -6;
    case "slapHead":
      return -9;
    case "puppetUnwilling":
      return Math.min(-4, -Math.ceil((Number(proxySt) || 0) / 2));
    default:
      return -4;
  }
}

/** A master can only use a person as a proxy if his best melee skill beats the proxy's. */
export function commandsProxy(masterBest: number | null, proxyBest: number | null): boolean {
  return masterBest !== null && masterBest > (proxyBest ?? -Infinity);
}

// ── Bullet Time (p. 133) ──

/** Bullet Time costs 3 bonus character points. */
export const BULLET_TIME_COST = 3;

/** The book suggests limiting it to Enhanced Time Sense, Trained by a Master or Weapon Master. */
export function bulletTimeSuggested(traitNames: readonly string[]): boolean {
  return traitNames.some((name) => /^(enhanced time sense|trained by a master|weapon master)\b/i.test(name));
}
