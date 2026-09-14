/**
 * Where a Powerstone keeps its data (GURPS Magic pp. 20, 69-70), and what
 * follows from it without Foundry: its price, the stones that may pay for a
 * spell, and what a recharge writes.
 *
 * A stone is a piece of equipment marked as one. Its capacity and kind are
 * fields that reprice it, never records of their own.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import {
  POWERSTONE_KINDS,
  pointsPerEnergy,
  powerstonePrice,
  rechargeSeconds,
  rechargeStones,
  stoneCanPay,
  type ManaLevel,
  type PowerstoneKind,
} from "./rules.js";

/** What this module keeps on a piece of equipment about the stone it is. */
export interface StoneData {
  isStone: boolean;
  kind: PowerstoneKind;
  capacity: number;
  charge: number;
  /** The college a One-College stone pays for. */
  college: string;
  /** The magic item a dedicated or exclusive stone is set into, by name. */
  setInto: string;
  /** Whether an ordinary stone's price follows its capacity by the table on p. 20. */
  pricedByCapacity: boolean;
  /** World time of the last recharge, or null for a stone never recharged. */
  lastRecharged: number | null;
}

const DEFAULTS: StoneData = {
  isStone: false, kind: "normal", capacity: 0, charge: 0, college: "", setInto: "", pricedByCapacity: true, lastRecharged: null,
};

/** Adds the Powerstone fields to this module's data on equipment. */
export function initStoneFields(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    powerstone: new f.SchemaField({
      isStone: new f.BooleanField({ required: true, initial: false }),
      kind: new f.StringField({ required: true, nullable: false, initial: "normal", choices: [...POWERSTONE_KINDS] }),
      capacity: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      charge: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      college: new f.StringField({ required: true, blank: true, initial: "" }),
      setInto: new f.StringField({ required: true, blank: true, initial: "" }),
      pricedByCapacity: new f.BooleanField({ required: true, initial: true }),
      lastRecharged: new f.NumberField({ required: true, nullable: true, initial: null }),
    }),
  });
}

const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** An item's stone data, filled with defaults, whether or not it is marked as a stone. */
export function stoneFields(item: any): StoneData {
  const stored = item?.system?.extensions?.[MODULE_ID]?.powerstone ?? {};
  const kind = POWERSTONE_KINDS.includes(stored.kind) ? stored.kind : "normal";
  const last = stored.lastRecharged;
  return {
    ...DEFAULTS,
    ...stored,
    kind,
    capacity: whole(stored.capacity),
    charge: whole(stored.charge),
    college: String(stored.college ?? ""),
    setInto: String(stored.setInto ?? ""),
    pricedByCapacity: stored.pricedByCapacity !== false,
    isStone: stored.isStone === true,
    lastRecharged: last === null || last === undefined || !Number.isFinite(Number(last)) ? null : Number(last),
  };
}

/** A piece of equipment's stone data, or null when it isn't a stone. */
export function stoneOf(item: any): StoneData | null {
  if (item?.type !== "equipment") return null;
  const data = stoneFields(item);
  return data.isStone ? data : null;
}

/**
 * What a change to a stone writes: the patch, with the charge held to the
 * capacity, whichever of the two changed.
 */
export function stonePatch(current: StoneData, patch: Partial<StoneData>): Record<string, unknown> {
  const next = { ...current, ...patch };
  const capacity = whole(next.capacity);
  const out: Record<string, unknown> = { ...patch };
  if ("capacity" in patch) out.capacity = capacity;
  if ("charge" in patch || whole(next.charge) > capacity) out.charge = Math.min(capacity, whole(next.charge));
  return Object.fromEntries(Object.entries(out).map(([key, value]) => [`system.extensions.${MODULE_ID}.powerstone.${key}`, value]));
}

/** An ordinary stone's price by capacity (p. 20), or null for a stone that keeps the price it has. */
export function stonePrice(item: any): number | null {
  const data = stoneOf(item);
  if (!data || data.kind !== "normal" || !data.pricedByCapacity) return null;
  return powerstonePrice(data.capacity);
}

/** A stone as the system's energy sources offer it. */
export interface StoneSource {
  id: string;
  label: string;
  available: number;
  multiplier: number;
}

/**
 * The carried stones with charge left that may pay for this spell, cast this
 * way (p. 69). Only a stone the wizard is touching pays, so one left behind
 * isn't offered.
 */
export function stonesForSpell(
  items: readonly any[],
  spell: any,
  castThrough: { itemId: string; itemName: string } | null,
): StoneSource[] {
  const colleges: string[] = Array.isArray(spell?.system?.colleges) ? spell.system.colleges.map(String) : [];
  return items.flatMap((item) => {
    const data = stoneOf(item);
    if (!data || item.system?.carried === false || data.charge <= 0) return [];
    if (!stoneCanPay({ kind: data.kind, college: data.college, setInto: data.setInto, spellColleges: colleges, castThrough })) return [];
    return [{ id: String(item.id), label: String(item.name ?? ""), available: data.charge, multiplier: pointsPerEnergy(data.kind) }];
  });
}

/** What recharging a character's stones writes, and how many points came back. */
export function rechargeUpdates(
  stones: ReadonlyArray<{ id: string; data: StoneData; carried: boolean }>,
  mana: ManaLevel,
  now: number,
): { updates: Array<Record<string, unknown>>; gained: number } {
  const states = stones.map((s) => ({ capacity: s.data.capacity, charge: s.data.charge, kind: s.data.kind, together: s.carried }));
  let gained = 0;
  const updates = stones.map((stone, index) => {
    const key = `system.extensions.${MODULE_ID}.powerstone`;
    // A stone never recharged starts its clock now.
    if (stone.data.lastRecharged === null) return { _id: stone.id, [`${key}.lastRecharged`]: now };
    const elapsed = now - stone.data.lastRecharged;
    const charge = rechargeStones(states, mana, elapsed)[index]!;
    gained += charge - stone.data.charge;
    // The clock keeps the part of a period not yet regained, so recharging
    // often loses nothing; a full stone, or one in no mana, starts again now.
    const interval = rechargeSeconds(mana);
    const since = interval !== null && charge < stone.data.capacity
      ? stone.data.lastRecharged + Math.floor(Math.max(0, elapsed) / interval) * interval
      : now;
    return { _id: stone.id, [`${key}.charge`]: charge, [`${key}.lastRecharged`]: since };
  });
  return { updates, gained };
}
