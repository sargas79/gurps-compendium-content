/**
 * The weapon a load goes into, as the rules that refuse or change a load read
 * it: its calibre, its TL and what kind of launcher it is.
 */

import type { GWorldApi } from "../module.js";

/** The weapon a load is loaded into. */
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

/** A grenade or mine's own round, as a book's records give it: its size where it states one. */
export type RecordedRound = (item: any) => { sizeMm: number | null } | null;

/** An item's TL as a number: "8" and "8^" alike, 0 where it states none. */
export const tlOf = (item: any): number => Number(/-?\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/**
 * The weapon a mode loads into. `record` reads a grenade's or mine's own round
 * from the book's records, which makes the item a grenade of that size.
 */
export function launcherOf(api: GWorldApi, item: any, modeIndex: number, record?: RecordedRound): Launcher {
  const name = String(item?.name ?? "");
  const mode = item?.system?.rangedModes?.[modeIndex] ?? {};
  const own = record?.(item) ?? null;
  return {
    calibreMm: own ? own.sizeMm : (api.rules.calibreOf(name) ?? null),
    tl: tlOf(item),
    grenade: Boolean(own),
    electromagnetic: /\b(gauss|railgun|emgl)\b/i.test(name),
    railgun: /\brailgun\b/i.test(name),
    shotgun: /shotgun|grenade launcher|gyroc/i.test(`${name} ${mode.skill ?? ""}`),
    homing: /\b(homing|guided|missile)\b/i.test(name),
  };
}

/** The kinds of a catalogue a weapon may load: those it doesn't refuse. */
export function loadableOf<K>(kinds: readonly K[], refusal: (kind: K) => string | null): K[] {
  return kinds.filter((kind) => refusal(kind) === null);
}
