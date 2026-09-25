/**
 * What a gadget on external power is plugged into: a generator, a collector
 * or a store the character carries, which a book registers (`registerPowerSource`).
 *
 * The engine knows only what a book tells it about each source it offers a
 * gadget: the grades of external power it supplies, or none named (High-Tech's
 * unsplit "external power", p. 14, which any device takes); the batteries it
 * stands in for, for a battery gadget on a power adapter; whether it gives
 * power now, and a line saying so; and, for a store that runs down, what is
 * left of it in the gadget's own hours of use and how to spend them.
 *
 * A gadget keeps the id of the source in its power data (`source`), and the
 * Gear tab offers it only the sources that fit it (`sourceFits`).
 */

import type { PowerData } from "./data.js";

/** A store a gadget draws on: hours of the gadget's use left in it, of a full store's, and a way to spend them. */
export interface PowerStore {
  left: number;
  total: number;
  spend: (hours: number) => Promise<unknown>;
}

/** One source a book offers a gadget. */
export interface PowerSource {
  item: any;
  /** The grades of external power it supplies; null for power of no named grade, which any device takes. */
  supplies: readonly string[] | null;
  /** The weight of the batteries it stands in for, in pounds; null where it doesn't stand in for batteries. */
  standsForWeight: number | null;
  /** Whether it gives power now. */
  available: boolean;
  /** What the gadget's row says about it: fuel left, no wind, dark. */
  status: string;
  /** A store the gadget runs down, where it is one. */
  store?: PowerStore;
}

/** A book's rule listing what an actor carries that could power a gadget. */
export type PowerSourceProvider = (actor: any, gadget: any) => PowerSource[];
const providers: PowerSourceProvider[] = [];

/** Registers a book's rule for the sources an actor carries. */
export function registerPowerSource(provider: PowerSourceProvider): void {
  providers.push(provider);
}

/** Every source the registered rules offer a gadget, whether or not it fits it. */
export function powerSources(actor: any, gadget: any): PowerSource[] {
  if (!actor) return [];
  return providers.flatMap((provide) => provide(actor, gadget)).filter((s) => s.item && s.item.id !== gadget?.id);
}

/**
 * Whether a source can power a gadget. A device printed with grades of
 * external power takes a source that supplies one of them, or power of no
 * named grade; High-Tech's own "external power" grade takes any. A gadget
 * built for batteries, on its adapter, takes any source but one that stands
 * in for lighter batteries than its own (`cellWeight`, its table's cells).
 */
export function sourceFits(data: Pick<PowerData, "grades">, cellWeight: number | null, source: Pick<PowerSource, "supplies" | "standsForWeight">): boolean {
  if (data.grades.length) {
    if (source.supplies === null || data.grades.includes("external")) return true;
    return source.supplies.some((grade) => data.grades.includes(grade));
  }
  if (source.standsForWeight !== null && cellWeight !== null) return cellWeight <= source.standsForWeight + 1e-9;
  return true;
}

/** The source a gadget is plugged into, among those offered, or null for none named or one no longer carried. */
export function linkedSource(actor: any, gadget: any, data: Pick<PowerData, "external" | "source">): PowerSource | null {
  if (!data.external || !data.source) return null;
  return powerSources(actor, gadget).find((s) => s.item.id === data.source) ?? null;
}
