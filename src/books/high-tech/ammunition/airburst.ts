/**
 * An airburst HE round's fragments (High-Tech p. 175): the round does only
 * its fragments' damage, typically in a cone in the direction of the shot.
 * Where it came down (`gworld.landed`, API 1.154.0) -- its one target on a
 * hit, the Scatter roll's point on a miss -- the cone opens from that point
 * and carries the line of fire on from the shooter (a cone's `origin`, API
 * 1.154.0), out to the fragments' reach (Campaigns p. 414: five yards a die).
 * The book gives the cone no width, so it is the system's own default for a
 * cone, a yard per yard of length. A card names whoever stands in it; the GM
 * targets them and rolls the row's fragments, as for any blast.
 */

import { parseDice } from "../../../shared/loads/dice.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Ammunition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ammunition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

type Point = { x: number; y: number };

/** How far an airburst's fragments reach, in yards: five a die (Campaigns p. 414); 0 where the dice don't parse. */
export function airburstReach(fragments: string): number {
  const d = parseDice(fragments);
  return d ? 5 * d.dice * d.multiplier : 0;
}

/** The bearing of the line of fire, in degrees clockwise from the scene's +x as Foundry measures it; null where the two are one point. */
export function lineOfFire(from: Point, to: Point): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!dx && !dy) return null;
  return ((((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360;
}

/**
 * The cone as `areas.standsIn` reads one (`areas.list`'s form: scene pixels
 * and degrees), its apex at the burst.
 */
export function airburstCone(burst: Point, direction: number, reachYards: number, pixelsPerYard: number): any {
  const length = reachYards * pixelsPerYard;
  return {
    id: `${MODULE_ID}-ht-airburst`, label: "", center: { ...burst }, radius: null, region: null, lines: [], expires: null,
    cone: { direction, length, width: length, base: pixelsPerYard, origin: { ...burst } },
  };
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** `fragmentsOf` gives an airburst HE mode's fragment dice, or null for any other mode. */
export function readyAirburst(api: GWorldApi, fragmentsOf: (item: any, modeIndex: number) => string | null): void {
  Hooks.on(api.combat.hooks.landed, (context: any) => {
    const item = context?.item;
    const point = context?.point;
    // A miss is placed by its Scatter roll, which tells the hook again.
    if (!item || !point || !context.actor?.isOwner || !context.mode) return;
    const fragments = fragmentsOf(item, Number(context.mode.index) || 0);
    if (!fragments) return;
    const scene = (globalThis as any).canvas?.scene ?? null;
    const shooter = context.actor.getActiveTokens?.()?.[0]?.center ?? null;
    const reach = airburstReach(fragments);
    const direction = shooter ? lineOfFire(shooter, point) : null;
    const name = String(item.name ?? "");
    if (!scene || direction === null || !(reach > 0)) {
      void say(context.actor, name, [F("AirburstNoCone", { fragments })]);
      return;
    }
    const perYard = (Number(scene.grid?.size) || 100) / (Number(scene.grid?.distance) || 1);
    const inCone = ((api.areas.standsIn(scene, airburstCone(point, direction, reach, perYard)) ?? []) as any[])
      .map((doc) => String(doc?.name ?? doc?.actor?.name ?? ""))
      .filter(Boolean);
    void say(context.actor, name, [
      F("AirburstCone", { fragments, reach }),
      inCone.length ? F("AirburstCaught", { names: inCone.join(", ") }) : L("AirburstNobody"),
    ]);
  });
}
