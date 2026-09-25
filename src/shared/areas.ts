/**
 * Clouds, noise, light and fields the books' gear leaves on the map, kept as
 * the system's modifier areas (GWorld API 1.63.0). Ultra-Tech's clouds and
 * warblers and High-Tech's smoke, gas and flares place them alike.
 */

import { MODULE_ID, type GWorldApi } from "./module.js";

/** A line an area puts on rolls, as the system's `areas.add` takes it. */
export interface AreaLine {
  label: string;
  value: number;
  rolls?: string[];
  applies?: "inside" | "through" | "both";
}

/** The scene an area is placed on: the one being viewed. */
function sceneNow(): any {
  return (globalThis as any).canvas?.scene ?? null;
}

/** Where an area goes: this user's latest template, the one targeted token, or the actor's own token. */
export function areaCentre(actor: any): { x: number; y: number } | null {
  const templates: any[] = (globalThis as any).canvas?.templates?.placeables ?? [];
  const mine = templates.filter((t) => t?.document?.author?.id === game.user?.id);
  const last = mine[mine.length - 1]?.document;
  if (last && Number.isFinite(last.x) && Number.isFinite(last.y)) return { x: last.x, y: last.y };
  const targets = [...((game as any).user?.targets ?? [])];
  const token = targets.length === 1 ? targets[0] : actor?.getActiveTokens?.()?.[0];
  const c = token?.center;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: c.x, y: c.y } : null;
}

/**
 * Places an area of `radiusYards` round the centre for `seconds`; the key names
 * what it is. The centre is `center` where given (worked out on the client
 * that fired, for an area the GM's client places), else `areaCentre`'s. An area with no lines is refused unless `bare` says it is kept
 * only to be found again (a flare's light). Returns its id or null.
 */
export async function placeArea(api: GWorldApi, options: { key: string; label: string; actor: any; radiusYards: number; lines: AreaLine[]; seconds: number | null; bare?: boolean; center?: { x: number; y: number } | null }): Promise<string | null> {
  const scene = sceneNow();
  const center = options.center ?? areaCentre(options.actor);
  if (!scene || !center || !(options.radiusYards > 0) || (!options.lines.length && !options.bare)) return null;
  const now = Number((game as any).time?.worldTime) || 0;
  return api.areas.add(scene, {
    id: `${MODULE_ID}-${options.key}-${foundry.utils.randomID(8)}`,
    label: options.label,
    center,
    radius: options.radiusYards,
    lines: options.lines,
    expires: options.seconds === null ? null : now + options.seconds,
  } as any);
}

/** Whether an actor's token stands in an unexpired area whose id carries the key. */
export function standsIn(api: GWorldApi, actor: any, key: string): boolean {
  const scene = sceneNow();
  const token = actor?.getActiveTokens?.()?.[0];
  const c = token?.center;
  if (!scene || !c) return false;
  const now = Number((game as any).time?.worldTime) || 0;
  return (api.areas.list(scene) as any[]).some((area) => String(area.id).startsWith(`${MODULE_ID}-${key}-`)
    && !(typeof area.expires === "number" && now >= area.expires)
    && area.center && Number(area.radius) > 0
    && Math.hypot(c.x - area.center.x, c.y - area.center.y) <= Number(area.radius));
}
