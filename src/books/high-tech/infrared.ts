/**
 * Infrared light (High-Tech pp. 47, 52, 171): an IR illuminator, a flashlight
 * with an IR filter, an IR chemlight or an infrared flare lights only for eyes
 * that see it -- Night Vision, Infravision or Hyperspectral Vision, whether a
 * trait or worn optics. One kind of light the system's `darknessAt` tests per
 * observer (`areas.registerLitFor`, API 1.100.0), shared by the lights and the
 * flares.
 */

import { MODULE_ID, type GWorldApi } from "../../shared/module.js";

/** The key of the infrared kind of light, registered once. */
const INFRARED_KEY = "ht-infrared";
const registered = new WeakMap<object, string | null>();

/** Whether a character sees by infrared: a trait of their own, or the eyes worn gear gives them. */
export function seesInfrared(api: GWorldApi | null, actor: any): boolean {
  if ([...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && /^(infravision|night vision|hyperspectral vision)\b/i.test(String(i.name ?? "")))) return true;
  const vision = actor ? (api?.actors?.derived?.(actor) as any)?.vision : null;
  return Number(vision?.nightVision) > 0 || vision?.infravision === true;
}

/** Registers the infrared kind of light, once per API instance; its id, or null where it was refused. */
export function infraredLight(api: GWorldApi): string | null {
  if (registered.has(api)) return registered.get(api) ?? null;
  const areas = api?.areas as any;
  const id: string | null = typeof areas?.registerLitFor === "function"
    ? areas.registerLitFor({ module: MODULE_ID, key: INFRARED_KEY, test: (observer: any) => seesInfrared(api, observer) })
    : null;
  registered.set(api, id);
  return id;
}
