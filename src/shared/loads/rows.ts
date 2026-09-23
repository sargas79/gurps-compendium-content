/**
 * The load engine: a load chosen for each ranged mode of a weapon, never an
 * item of its own, and the row that mode fires with it, through
 * `gworld.weaponAttacks`. Ultra-Tech's warheads (pp. 152-159) and High-Tech's
 * ammunition (pp. 163-178) are catalogues on it; each book keeps its loads in
 * its own field and registers its own listener, under its own switch
 * (decision D1, #335).
 */

import type { GWorldApi } from "../module.js";

/** A row's figures a load changes. */
export interface LoadRow {
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
  /** Acc, Malf. and ST, where a load changes them (High-Tech's ammunition does). */
  accuracy?: number;
  malfunction?: number | null;
  minSt?: number;
  /**
   * What a multiple-projectile load changes (GWorld API 1.70.0, 1.72.0,
   * 1.73.0): Rcl, a first hit with its own line, a projectile that never
   * overpenetrates, a miss scattered by the margin squared.
   */
  recoil?: number;
  firstHit?: null | { damage: string; damageType?: string; armorDivisor?: number; label?: string };
  noOverpenetration?: boolean;
  scatterSquared?: boolean;
}

/** The figures of a row as a load starts from them. */
export function rowIn(row: any): LoadRow {
  return {
    damage: String(row.damage ?? ""), damageType: String(row.damageType ?? ""), armorDivisor: Number(row.armorDivisor) || 1,
    halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0, projectiles: Number(row.projectiles) || 1, skillBonus: 0,
    explosive: row.explosive === true, incendiary: row.incendiary === true, doubleKnockback: row.doubleKnockback === true, radiation: row.radiation === true, surge: row.surge === true,
    fragmentation: String(row.fragmentation ?? ""), affliction: row.affliction === true, afflictionAttribute: String(row.afflictionAttribute ?? ""),
    afflictionModifier: Number(row.afflictionModifier) || 0, followUp: row.followUp ?? null, notes: [],
    accuracy: Number(row.accuracy) || 0,
    malfunction: typeof row.malfunction === "number" ? row.malfunction : null,
    minSt: Number(row.minSt) || 0,
    recoil: Number(row.recoil) || 0,
    firstHit: row.firstHit ?? null,
    noOverpenetration: row.noOverpenetration === true,
    scatterSquared: row.scatterSquared === true,
  };
}

/**
 * Writes what a load made of a row back onto it. Acc, Malf., ST, Rcl, the
 * first hit, overpenetration and scatter are only written where the load
 * changed them, so a load that never touches them leaves the row's own as
 * they were.
 */
export function rowOut(row: any, before: LoadRow, after: LoadRow, followUpLabel: (label: string) => string = (label) => label): void {
  Object.assign(row, {
    damage: after.damage, damageType: after.damageType, armorDivisor: after.armorDivisor,
    halfDamageRange: after.halfDamageRange, maxRange: after.maxRange, projectiles: after.projectiles,
    explosive: after.explosive, incendiary: after.incendiary, doubleKnockback: after.doubleKnockback, radiation: after.radiation, surge: after.surge === true,
    fragmentation: after.fragmentation, affliction: after.affliction, afflictionAttribute: after.afflictionAttribute,
    afflictionModifier: after.afflictionModifier, followUp: after.followUp ? { ...after.followUp, label: followUpLabel(after.followUp.label) } : null,
  });
  if (after.accuracy !== undefined && after.accuracy !== before.accuracy) row.accuracy = after.accuracy;
  if (after.malfunction !== undefined && after.malfunction !== before.malfunction) row.malfunction = after.malfunction;
  if (after.minSt !== undefined && after.minSt !== before.minSt) row.minSt = after.minSt;
  if (after.recoil !== undefined && after.recoil !== before.recoil) row.recoil = after.recoil;
  if (after.firstHit !== undefined && after.firstHit !== before.firstHit) row.firstHit = after.firstHit;
  if (after.noOverpenetration !== undefined && after.noOverpenetration !== before.noOverpenetration) row.noOverpenetration = after.noOverpenetration;
  if (after.scatterSquared !== undefined && after.scatterSquared !== before.scatterSquared) row.scatterSquared = after.scatterSquared;
  if (after.skillBonus && typeof row.skillLevel === "number") row.skillLevel += after.skillBonus;
}

/** Where a load is fired from, for a catalogue's rules. */
export interface LoadPlace {
  actor: any;
  item: any;
  modeIndex: number;
  /** The stored mode. */
  mode: any;
  /** What the row came from before grade, material and ammunition. */
  basis: any;
}

/** One book's loads, as the engine applies them to a weapon's rows. */
export interface LoadCatalogue<Load> {
  /** Whether the book's switch is on. */
  on: () => boolean;
  /** The load in a mode, or null for the ordinary round. */
  loadFor: (item: any, modeIndex: number) => Load | null;
  /**
   * What a Basic Set round already loaded (the mode's `ammunition`) means: the
   * catalogue steps aside and says so with this tag, or, where null, its load
   * goes on over the round.
   */
  basicAmmunition: null | { label: string; hint: string };
  /** The row a load fires, or null where the weapon can't fire it. */
  apply: (load: Load, row: LoadRow, place: LoadPlace) => LoadRow | null;
  /** The tags the row shows for the load. */
  tags: (load: Load, after: LoadRow, place: LoadPlace) => Array<{ label: string; hint: string }>;
  /** A follow-up's label as the row shows it. */
  followUpLabel?: (label: string) => string;
}

const isRanged = (item: any): boolean => item?.type === "equipment" && (item.system?.rangedModes ?? []).length > 0;

/**
 * Registers a book's loads: each ranged mode fires the load it holds. One
 * listener for each book, registered when the book's rules are.
 */
export function registerLoadRows<Load>(api: GWorldApi, catalogue: LoadCatalogue<Load>): void {
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!catalogue.on() || !isRanged(context?.item)) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const index = (context.item.system?.rangedModes ?? []).indexOf(entry.mode);
      if (index < 0) continue;
      const load = catalogue.loadFor(context.item, index);
      if (!load) continue;
      const row = entry.row;
      if (catalogue.basicAmmunition && entry.mode?.ammunition) {
        row.notes.push({ ...catalogue.basicAmmunition });
        continue;
      }
      const place: LoadPlace = { actor: context.actor ?? null, item: context.item, modeIndex: index, mode: entry.mode, basis: entry.basis ?? {} };
      const before = rowIn(row);
      const after = catalogue.apply(load, before, place);
      if (!after) continue;
      rowOut(row, before, after, catalogue.followUpLabel);
      for (const tag of catalogue.tags(load, after, place)) row.notes.push(tag);
    }
  });
}
