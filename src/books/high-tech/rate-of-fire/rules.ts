/**
 * High-Tech's rules for how fast a gun fires (pp. 82-84, 250-252), as pure
 * functions. The Foundry side is in `index.ts`.
 *
 *   - **Trigger mechanisms (p. 82):** single-action, double-action,
 *     double-action-only and safe-action, with what each does to Acc. The
 *     weapon tables print no trigger type, so a gun's is set on the gun or
 *     worked out here from what the tables do print.
 *   - **Automatic weapons (pp. 82-83):** a fire selector's settings, limited
 *     bursts, and high-cyclic controlled bursts ("#").
 *   - **Fast-firing (p. 84):** a semiautomatic or double-action gun pulled up
 *     to RoF 6, and a single-action revolver cocked with the off thumb.
 *   - **Fanning and thumbing (pp. 83-84):** a single-action revolver fired
 *     faster by working the hammer, and what their critical failures do.
 */

// ── trigger mechanisms (p. 82) ─────────────────────────────────────────────

/** Single-action, double-action, double-action-only and safe-action (p. 82). */
export const TRIGGERS = ["sa", "da", "dao", "safe"] as const;
export type Trigger = (typeof TRIGGERS)[number];

/**
 * The Acc a double-action pull costs an aimed shot (p. 82): -1, for a DA gun
 * fired uncocked and for every shot of a DAO gun, where it is permanent.
 */
export const DOUBLE_ACTION_ACC_PENALTY = 1;

/** What a gun's statistics say about it, for working out its trigger. */
export interface GunFacts {
  skill: string;
  shots: string;
  rateOfFire: number;
}

/**
 * Whether a gun looks like a revolver from its statistics: a pistol whose
 * rounds are loaded one at a time (an "i" in Shots) into five chambers or
 * more. A derringer or a double-barrelled pistol holds fewer; a pepperbox
 * counts, as it fires the same way. The gun's own setting overrides this.
 */
export function looksLikeRevolver(gun: GunFacts): boolean {
  if (!/\(pistol\)\s*$/i.test(String(gun.skill ?? "").trim())) return false;
  const match = /^(\d+)\((\d+)i\)/i.exec(String(gun.shots ?? "").replace(/,/g, "").trim());
  return match !== null && Number(match[1]) >= 5;
}

/**
 * A gun's trigger where the gun doesn't say (p. 82). A revolver at RoF 1 has
 * to be cocked for each shot, so it is single-action; one at RoF 2 or more is
 * double-action. Everything else is taken as single-action, the book's
 * standard for TL6 semiautomatic pistols and for rifles, SMGs and machine
 * guns at every TL; single-action changes nothing once a self-loader has
 * fired. The book names no standard for later pistols: a GM sets DA, DAO or
 * safe-action on the gun from its description.
 */
export function workedOutTrigger(revolver: boolean, rateOfFire: number): Trigger {
  if (revolver) return Number(rateOfFire) <= 1 ? "sa" : "da";
  return "sa";
}

/**
 * The -1 an aimed shot takes for a double-action pull (p. 82): a DA gun that
 * wasn't cocked first. It can't take away Acc the shot didn't get, so it is
 * nothing where aiming gave nothing. DAO's is on the row already.
 */
export function doubleActionAimPenalty(trigger: Trigger, cocked: boolean, accuracyGiven: number): number {
  if (trigger !== "da" || cocked) return 0;
  const given = Math.max(0, Math.floor(accuracyGiven));
  return given > 0 ? -Math.min(DOUBLE_ACTION_ACC_PENALTY, given) : 0;
}

/** A DAO gun's Acc, permanently a point lower (p. 82), never below 0. */
export function doubleActionOnlyAccuracy(accuracy: number): number {
  return Math.max(0, (Number(accuracy) || 0) - DOUBLE_ACTION_ACC_PENALTY);
}

/**
 * Whether a gun is almost impossible to discharge by unsafe handling (p. 82):
 * the heavy pull of a DAO trigger, and safe-action's.
 */
export function resistsAccidentalDischarge(trigger: Trigger): boolean {
  return trigger === "dao" || trigger === "safe";
}

// ── automatic weapons (pp. 82-83) ──────────────────────────────────────────

/** The full-auto-only mark (Characters p. 270), and the high-cyclic controlled burst's (p. 83). */
export const FULL_AUTO_ONLY = "!";
export const HIGH_CYCLIC = "#";

/** A mode's Rate of Fire as the table prints it: RoF, its mark, and a second setting after a slash. */
export interface RateOfFire {
  rateOfFire: number;
  mark: string;
  second: number;
  secondMark: string;
}

/**
 * A fire selector's settings (p. 82): the listed RoF, the second setting a
 * table prints after a slash, and single shots at RoF 3 for any setting of
 * RoF 4+ that isn't full-auto only. A gun with one setting has no selector.
 */
export const FIRE_SETTINGS = ["primary", "second", "semi"] as const;
export type FireSetting = (typeof FIRE_SETTINGS)[number];

/** The RoF a selective-fire gun fires single shots at (pp. 82-83). */
export const SEMI_RATE_OF_FIRE = 3;

export function fireSettings(rof: RateOfFire): FireSetting[] {
  const settings: FireSetting[] = ["primary"];
  if (rof.second > 0) settings.push("second");
  const selective = (n: number, mark: string) => n > SEMI_RATE_OF_FIRE && mark !== FULL_AUTO_ONLY;
  if (selective(rof.rateOfFire, rof.mark) || (rof.second > 0 && selective(rof.second, rof.secondMark))) settings.push("semi");
  return settings;
}

/** The setting that follows this one on the selector, round again to the first. */
export function nextFireSetting(settings: readonly FireSetting[], current: FireSetting): FireSetting {
  const at = settings.indexOf(current);
  return settings[(at + 1) % settings.length] ?? "primary";
}

/** Bursts a limited-burst gun may fire in one attack (p. 83). */
export const MAX_BURSTS = 3;

/**
 * A gun's burst limit where it doesn't set one (p. 83): a high-cyclic gun is
 * always limited, and its RoF is three bursts (9# for three-round bursts),
 * or one where it doesn't divide by three. Anything else has no limiter.
 */
export function workedOutBurstLimit(rof: Pick<RateOfFire, "rateOfFire" | "mark">): number {
  if (rof.mark !== HIGH_CYCLIC) return 0;
  const n = Math.max(1, Math.floor(rof.rateOfFire));
  return n % MAX_BURSTS === 0 ? n / MAX_BURSTS : n;
}

/** The shots a limited-burst gun may fire in an attack: whole bursts, up to three, within its RoF (p. 83). */
export function burstShots(limit: number, rateOfFire: number): number[] {
  const size = Math.max(1, Math.floor(limit));
  const most = Math.max(size, Math.floor(rateOfFire));
  const shots: number[] = [];
  for (let bursts = 1; bursts <= MAX_BURSTS && bursts * size <= most; bursts++) shots.push(bursts * size);
  return shots;
}

/** The Recoil high-cyclic controlled bursts are counted with (p. 83). */
export const HIGH_CYCLIC_RECOIL = 1;

/** What a setting makes of a gun's row. */
export interface SettingRow {
  rateOfFire: number;
  /** The Recoil in place of the gun's, or null to leave it. */
  recoil: number | null;
  /** Rounds per burst where the setting fires limited bursts, 0 otherwise. */
  burstLimit: number;
  noSprayingFire: boolean;
  noSuppressionFire: boolean;
}

/**
 * The row a selector setting gives (pp. 82-83). Single shots are RoF 3, too
 * few for Spraying or Suppression Fire. The listed setting of a limited-burst
 * gun can't spray; a high-cyclic one can't suppress either, and counts its
 * hits at Rcl 1. The second setting is the gun's normal full-auto.
 */
export function settingRow(setting: FireSetting, rof: RateOfFire, burstLimit: number): SettingRow {
  if (setting === "semi") {
    return { rateOfFire: Math.min(SEMI_RATE_OF_FIRE, Math.max(1, rof.rateOfFire)), recoil: null, burstLimit: 0, noSprayingFire: true, noSuppressionFire: true };
  }
  if (setting === "second" && rof.second > 0) {
    return { rateOfFire: rof.second, recoil: null, burstLimit: 0, noSprayingFire: false, noSuppressionFire: false };
  }
  const limit = Math.max(0, Math.floor(burstLimit));
  const highCyclic = rof.mark === HIGH_CYCLIC;
  return {
    rateOfFire: rof.rateOfFire,
    recoil: highCyclic ? HIGH_CYCLIC_RECOIL : null,
    burstLimit: limit,
    noSprayingFire: limit > 0,
    noSuppressionFire: highCyclic,
  };
}

// ── fast-firing (p. 84) ────────────────────────────────────────────────────

/** Fast-firing's penalty, bought off by the Fast-Firing technique (pp. 84, 251). */
export const FAST_FIRING_PENALTY = -4;
/** The most a gun can be fast-fired at (p. 84). */
export const FAST_FIRING_MAX = 6;
/** Rcl added at RoF 5 and 6 (p. 84). */
export const FAST_FIRING_RECOIL: Readonly<Record<number, number>> = { 5: 2, 6: 4 };

/**
 * A single-action revolver held in two hands (p. 84): the off thumb cocks
 * it, RoF 2 at no penalty; fast-fired, up to RoF 4 at -2, bought off by
 * Two-Handed Thumbing (p. 252).
 */
export const TWO_HANDED_FREE_RATE = 2;
export const TWO_HANDED_MAX = 4;
export const TWO_HANDED_PENALTY = -2;

/** What fast-firing needs to know of a gun. */
export interface FastFiringGun {
  rateOfFire: number;
  /** Any of its settings fires full-auto (RoF 4+): it isn't fast-fired. */
  fullAuto: boolean;
  burstLimited: boolean;
  singleActionRevolver: boolean;
}

/**
 * The RoFs a gun can be fast-fired at (p. 84): above its own up to 6 for a
 * gun of RoF 2 or 3 that isn't full-auto; 2 to 4 for a single-action
 * revolver held in two hands. None for a limited-burst gun, which can't.
 */
export function fastFiringRates(gun: FastFiringGun): number[] {
  if (gun.burstLimited || gun.fullAuto) return [];
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  if (gun.singleActionRevolver && gun.rateOfFire <= 1) return range(TWO_HANDED_FREE_RATE, TWO_HANDED_MAX);
  if (gun.rateOfFire >= 2 && gun.rateOfFire <= 3) return range(gun.rateOfFire + 1, FAST_FIRING_MAX);
  return [];
}

/**
 * A penalty a technique buys off (pp. 250-252), for a technique at this level
 * relative to its skill: it defaults to the skill at the penalty and can't
 * exceed the skill, so what's left of the penalty is its relative level.
 * Without the technique, the whole penalty.
 */
export function boughtOff(penalty: number, relativeLevel: number | null): number {
  if (relativeLevel === null || !Number.isFinite(relativeLevel)) return penalty;
  return Math.max(penalty, Math.min(0, Math.round(relativeLevel)));
}

/** What a fast-fired attack takes: a skill penalty the technique may buy off, and Rcl added. */
export interface FastFired {
  penalty: number;
  recoilModifier: number;
}

/**
 * Fast-firing at this RoF (p. 84): -4 and +2 or +4 Rcl at RoF 5 and 6; a
 * two-handed single-action revolver takes nothing at RoF 2 and -2 above it.
 */
export function fastFired(rateOfFire: number, twoHandedRevolver: boolean, relativeLevel: number | null): FastFired {
  if (twoHandedRevolver) {
    return { penalty: rateOfFire > TWO_HANDED_FREE_RATE ? boughtOff(TWO_HANDED_PENALTY, relativeLevel) : 0, recoilModifier: 0 };
  }
  return { penalty: boughtOff(FAST_FIRING_PENALTY, relativeLevel), recoilModifier: FAST_FIRING_RECOIL[rateOfFire] ?? 0 };
}

// ── fanning and thumbing (pp. 83-84) ───────────────────────────────────────

/** Fanning: -4, bought off by the technique, for RoF 2 (p. 83). */
export const FANNING_PENALTY = -4;
/** Each RoF above 2, up to 5, a further -2 no technique buys off (p. 83). */
export const FANNING_STEP_PENALTY = -2;
export const FANNING_RATES = [2, 3, 4, 5] as const;
/** At RoF 5 the Rcl goes up by 2, which can't be bought off either (p. 83). */
export const FANNING_TOP_RECOIL = 2;

/** Thumbing: -2, bought off by the technique, for RoF 2 (p. 83). */
export const THUMBING_PENALTY = -2;
export const THUMBING_RATE = 2;

/** What fanning at this RoF takes (p. 83). */
export function fanned(rateOfFire: number, relativeLevel: number | null): { penalty: number; recoilModifier: number } {
  const rof = Math.max(2, Math.min(5, Math.floor(rateOfFire)));
  return {
    penalty: boughtOff(FANNING_PENALTY, relativeLevel) + FANNING_STEP_PENALTY * (rof - 2),
    recoilModifier: rof === 5 ? FANNING_TOP_RECOIL : 0,
  };
}

/** What thumbing takes (p. 83). */
export function thumbed(relativeLevel: number | null): { penalty: number } {
  return { penalty: boughtOff(THUMBING_PENALTY, relativeLevel) };
}

/**
 * A fanning critical failure (p. 83): no shots fire, and on 1d a 1-3 drops
 * the gun; a 4-6 bruises the hand, moderate pain for as many minutes as the
 * roll failed by.
 */
export function fanningFumble(die: number, margin: number): { dropped: boolean; painMinutes: number } {
  if (die <= 3) return { dropped: true, painMinutes: 0 };
  return { dropped: false, painMinutes: Math.max(0, Math.floor(margin)) };
}

/** A tied-back trigger, or one taken off, leaves only fanning and thumbing (p. 84). */
export const TRIGGER_TIES = ["", "tied", "removed"] as const;
export type TriggerTie = (typeof TRIGGER_TIES)[number];
