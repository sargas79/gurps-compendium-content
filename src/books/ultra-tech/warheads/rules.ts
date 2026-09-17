/**
 * What a warhead does to the row of the weapon firing it (Ultra-Tech pp.
 * 152-159), and which weapons may load it.
 */

import { WARHEADS, sizeClass, type Blast, type Size, type WarheadKind } from "./catalogue.js";

/** The weapon a warhead is loaded into. */
export interface Launcher {
  calibreMm: number | null;
  tl: number;
  grenade: boolean;
  /** A Gauss gun, railgun or electromagnetic grenade launcher. */
  electromagnetic: boolean;
  railgun: boolean;
  shotgun: boolean;
  homing: boolean;
}

/** Why a warhead can't be loaded, or null where it can. */
export function refusal(kind: WarheadKind, launcher: Launcher): string | null {
  const w = WARHEADS[kind];
  if (launcher.tl < w.tl) return "tl";
  if (launcher.grenade ? !w.grenades : !w.guns) return launcher.grenade ? "notGrenade" : "notGun";
  const min = typeof w.minMm === "function" ? w.minMm(launcher.tl) : w.minMm;
  if (min === null) return "tl";
  const calibre = launcher.calibreMm;
  if (min > 0 && (calibre === null || calibre < min)) return "tooSmall";
  if (w.belowMm !== undefined && (calibre === null || calibre >= w.belowMm)) return "tooLarge";
  if (w.notElectromagnetic && launcher.electromagnetic) return "electromagnetic";
  if (w.notRailgun && launcher.railgun) return "railgun";
  if (w.homingOnly && !launcher.homing) return "homing";
  if (w.shotgunsOnly && !launcher.shotgun) return "shotgun";
  return null;
}

/** The warheads a weapon may load. */
export function loadable(launcher: Launcher): WarheadKind[] {
  return (Object.keys(WARHEADS) as WarheadKind[]).filter((kind) => refusal(kind, launcher) === null);
}

/** A row's figures a warhead changes. */
export interface WarheadRow {
  damage: string;
  damageType: string;
  armorDivisor: number;
  halfDamageRange: number;
  maxRange: number;
  projectiles: number;
  skillBonus: number;
  explosive: boolean;
  incendiary: boolean;
  doubleKnockback: boolean;
  radiation: boolean;
  /** Surge on the round's own line (since GWorld API 1.63.0 carried to the apply). */
  surge?: boolean;
  fragmentation: string;
  affliction: boolean;
  afflictionAttribute: string;
  afflictionModifier: number;
  followUp: null | { damage: string; damageType: string; explosive: boolean; armorDivisor: number; fragmentation?: string; followUp?: boolean; radiation?: boolean; surge?: boolean; label: string };
  /** Keys of notes to add: a special effect's size, or a rule the row can't carry. */
  notes: Array<{ key: string; data?: Record<string, unknown> }>;
}

const PIERCING = ["pi-", "pi", "pi+", "pi++"];

/** A piercing type moved up or down the ladder, held at the ends; other types unchanged. */
export function stepPiercing(type: string, steps: number): string {
  const i = PIERCING.indexOf(type);
  if (i < 0) return type;
  return PIERCING[Math.max(0, Math.min(PIERCING.length - 1, i + steps))]!;
}

interface Dice { dice: number; adds: number; multiplier: number }

function parse(formula: string): Dice | null {
  const m = /^(\d*)d([+-]\d+)?(?:[x×](\d+))?$/i.exec(String(formula ?? "").replace(/\s+/g, ""));
  if (!m) return null;
  return { dice: m[1] ? Number(m[1]) : 1, adds: m[2] ? Number(m[2]) : 0, multiplier: m[3] ? Number(m[3]) : 1 };
}

function format(d: Dice): string {
  const adds = d.adds > 0 ? `+${d.adds}` : d.adds < 0 ? `${d.adds}` : "";
  return `${d.dice}d${adds}${d.multiplier > 1 ? `x${d.multiplier}` : ""}`;
}

/** "+1 damage per die" (pp. 152-158). */
export function plusPerDie(formula: string, perDie: number): string {
  const d = parse(formula);
  if (!d || !perDie) return formula;
  return format({ ...d, adds: d.adds + d.dice * perDie });
}

/** Damage divided by a whole factor: dice and adds alike, half a die as +2, at least 1d-4. */
export function divideDamage(formula: string, by: number): string {
  const d = parse(formula);
  if (!d || by <= 1) return formula;
  const total = (d.dice * 3.5 + d.adds) * d.multiplier / by;
  const dice = Math.floor(total / 3.5);
  if (dice < 1) return format({ dice: 1, adds: Math.max(-4, Math.round(total - 3.5)), multiplier: 1 });
  return format({ dice, adds: Math.round(total - dice * 3.5), multiplier: 1 });
}

/** A range multiplied, rounded. */
const times = (range: number, factor: number) => Math.round((Number(range) || 0) * factor);

/** The table entry for a warhead at this size (or variant). */
function entryFor(kind: WarheadKind, size: Size | null, variant: string) {
  const w = WARHEADS[kind];
  if (!w.table) return null;
  // Yields and masses are the table's keys; a psi-bomb's message is chosen beside its size.
  if (w.variants && w.variants.some((v) => v in w.table!)) return w.table[variant || w.variants[0]!] ?? null;
  return size === null ? null : (w.table[String(size)] ?? null);
}

function withBlast(row: WarheadRow, blast: Blast, perDie: number): WarheadRow {
  return {
    ...row,
    damage: plusPerDie(blast.damage, perDie),
    damageType: blast.type,
    armorDivisor: blast.divisor ?? 1,
    explosive: blast.explosive === true,
    incendiary: blast.incendiary === true,
    doubleKnockback: blast.doubleKnockback === true,
    radiation: blast.radiation === true,
    surge: blast.surge === true,
    fragmentation: blast.fragmentation ?? "",
  };
}

/**
 * The row a weapon fires with this warhead loaded. `variant` is the yield,
 * mass or message where the warhead has one; `atmospheres` is the air a
 * thermobaric warhead goes off in.
 */
export function warheadRow(kind: WarheadKind, row: WarheadRow, launcher: Launcher, options: { variant?: string; atmospheres?: number } = {}): WarheadRow {
  const w = WARHEADS[kind];
  const small = launcher.calibreMm === null || launcher.calibreMm < 20;
  const size = sizeClass(launcher.calibreMm);
  const perDie = w.perDieFromTl !== undefined && launcher.tl >= w.perDieFromTl ? 1 : 0;
  const entry = entryFor(kind, size, options.variant ?? "");
  let next: WarheadRow = { ...row, notes: [...row.notes] };

  switch (kind) {
    case "aphc":
      return { ...next, armorDivisor: 2, damageType: small ? stepPiercing(next.damageType, -1) : next.damageType };
    case "apds":
      return { ...next, armorDivisor: 2, damageType: small ? stepPiercing(next.damageType, -1) : next.damageType, damage: plusPerDie(next.damage, 1), halfDamageRange: times(next.halfDamageRange, 1.5), maxRange: times(next.maxRange, 1.5) };
    case "apep":
      return { ...next, armorDivisor: 3, damageType: small ? stepPiercing(next.damageType, -1) : next.damageType, halfDamageRange: times(next.halfDamageRange, 2), maxRange: times(next.maxRange, 2) };
    case "aphd":
      return { ...next, armorDivisor: 5, damageType: small ? stepPiercing(next.damageType, -1) : next.damageType, halfDamageRange: times(next.halfDamageRange, 2), maxRange: times(next.maxRange, 2) };
    case "hp":
      return { ...next, armorDivisor: 0.5, damageType: stepPiercing(next.damageType, 1) };
    case "baton":
      return { ...next, damageType: "cr", armorDivisor: 0.25, doubleKnockback: true, halfDamageRange: times(next.halfDamageRange, 0.2), maxRange: times(next.maxRange, 0.2) };
    case "monochain":
      next = { ...next, damage: divideDamage(next.damage, 2), halfDamageRange: times(next.halfDamageRange, 0.5), maxRange: times(next.maxRange, 0.5), skillBonus: next.skillBonus + 1 };
      next.notes.push({ key: "monochain" });
      return next;
    case "shotshell":
      next = { ...next, damage: divideDamage(next.damage, 4), damageType: next.damageType === "pi++" || next.damageType === "pi+" ? "pi" : next.damageType, halfDamageRange: times(next.halfDamageRange, 0.5), maxRange: times(next.maxRange, 0.5), projectiles: Math.max(1, next.projectiles) * 9 };
      next.notes.push({ key: "shotshell" });
      return next;
    case "burrow":
      next = { ...next, armorDivisor: 0.5 };
      next.notes.push({ key: "burrow", data: { seconds: Math.round(launcher.calibreMm ?? 0) } });
      return next;
    default:
      break;
  }

  if (!entry) return next;

  // The round's own piercing damage, kept at a divisor, with the blast following or linked.
  if (!launcher.grenade && (w.delivery === "followUp" || w.delivery === "linked")) {
    // APHEX takes a Gauss gun's divisor down to (2); a concussion round takes none from one (pp. 153-154).
    const roundDivisor = kind === "aphex" && launcher.electromagnetic ? 2 : kind === "hec" && launcher.electromagnetic ? 1 : (w.roundDivisor ?? 1);
    const blast = entry.primary;
    return {
      ...next,
      armorDivisor: roundDivisor,
      followUp: { damage: plusPerDie(blast.damage, perDie), damageType: blast.type, explosive: blast.explosive === true, armorDivisor: blast.divisor ?? 1, ...(blast.fragmentation ? { fragmentation: blast.fragmentation } : {}), followUp: w.delivery === "followUp", label: kind },
    };
  }
  if (w.delivery === "halfLinked") {
    const blast = entry.primary;
    next = { ...next, damage: divideDamage(next.damage, 2), armorDivisor: w.roundDivisor ?? 1, followUp: { damage: blast.damage, damageType: blast.type, explosive: false, armorDivisor: 1, followUp: false, surge: true, label: kind } };
    next.notes.push({ key: "surgeLinked" });
    return next;
  }

  // Replaced by the warhead: a grenade's own effect, or a gun's round.
  if (w.affliction) {
    const modifier = w.affliction.modifier[String(size)] ?? 0;
    next = { ...next, damage: "—", damageType: "cr", armorDivisor: w.affliction.divisor ?? 1, explosive: false, incendiary: false, radiation: false, doubleKnockback: false, fragmentation: "", affliction: true, afflictionAttribute: w.affliction.attribute, afflictionModifier: kind === "psiBomb" && options.variant === "message" ? -2 : modifier };
    // A terror psi-bomb is a Fright Check at -5, not a Will roll (p. 159).
    if (kind === "psiBomb" && options.variant === "terror") next.afflictionAttribute = "fright";
    if (entry.spec) next.notes.push({ key: "radius", data: { yards: entry.spec } });
    if (entry.primary.damage) next.followUp = { damage: entry.primary.damage, damageType: entry.primary.type, explosive: entry.primary.explosive === true, armorDivisor: 1, followUp: false, label: kind };
    return next;
  }
  if (!entry.primary.damage || (entry.spec && kind !== "flare")) {
    next = { ...next, damage: "spec.", damageType: "", armorDivisor: 1, explosive: false, incendiary: false, radiation: false, doubleKnockback: false, fragmentation: "", followUp: null };
    next.notes.push({ key: `spec.${kind}`, data: { value: entry.spec } });
    return next;
  }
  next = withBlast(next, entry.primary, perDie);
  if (kind === "flare") next.notes.push({ key: "spec.flare", data: { value: entry.spec } });
  if (entry.second) {
    next.followUp = { damage: entry.second.damage, damageType: entry.second.type, explosive: entry.second.explosive === true, armorDivisor: entry.second.divisor ?? 1, ...(entry.second.fragmentation ? { fragmentation: entry.second.fragmentation } : {}), followUp: false, ...(entry.second.radiation ? { radiation: true } : {}), ...(entry.second.surge ? { surge: true } : {}), label: kind };
    if (entry.second.radiation || entry.second.surge) next.notes.push({ key: "secondModifiers", data: { radiation: entry.second.radiation === true, surge: entry.second.surge === true } });
  }
  if (entry.primary.surge) next.notes.push({ key: "surge" });
  // "Divide the damage by 4 in trace or vacuum conditions, and by 2 in very thin atmospheres" (p. 155).
  if (kind === "thermobaric" && options.atmospheres !== undefined) {
    const atm = options.atmospheres;
    const by = atm <= 0.01 ? 4 : atm <= 0.5 ? 2 : 1;
    if (by > 1) {
      next.damage = divideDamage(next.damage, by);
      next.notes.push({ key: "thinAir", data: { by } });
    }
  }
  return next;
}

/** Warheads whose energy effect fades by +1 to resist a yard from the centre (pp. 157-159). */
export const FADING_WARHEADS: readonly string[] = ["strobe", "warbler", "psiBomb"];

/** What resisting a fading warhead gains at a distance from its centre: +1 a whole yard. */
export function fadingBonus(kind: string, distanceYards: number | null | undefined): number {
  if (!FADING_WARHEADS.includes(kind)) return 0;
  const yards = Number(distanceYards);
  return Number.isFinite(yards) && yards > 0 ? Math.floor(yards) : 0;
}

/** Nuclear and antimatter blasts: damage divided by the distance, not three times it (p. 156). */
export function blastDivisorPerYard(kind: string): number | null {
  return kind === "mininuke" || kind === "antimatter" ? 1 : null;
}

/** A psi-bomb's stun: -5 to recover from it (p. 158). */
export const PSI_STUN_RECOVERY = -5;

/** How long a warbler shrieks (p. 157). */
export const WARBLER_SECONDS = 10;

/**
 * A warbler's Hearing penalties as nested circles whose lines add up: -10
 * within its radius, -5 within twice it, -2 within five times it (p. 157).
 */
export function warblerRings(radiusYards: number): Array<{ radius: number; value: number; total: number }> {
  if (!(radiusYards > 0)) return [];
  return [
    { radius: radiusYards * 5, value: -2, total: -2 },
    { radius: radiusYards * 2, value: -3, total: -5 },
    { radius: radiusYards, value: -5, total: -10 },
  ];
}
