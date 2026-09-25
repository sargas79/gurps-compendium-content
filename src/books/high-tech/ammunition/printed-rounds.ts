/**
 * What High-Tech's printed rounds do beyond the figures their row carries
 * (pp. 103, 143), registered with the system through the add-on API. The
 * figures are `printed.ts`'s, put on the row by `index.ts`.
 *
 *   - **A round fired no more than once in so many seconds:** Dragon's Breath
 *     goes on throwing sparks for about three seconds, so the gun fires it
 *     once every four (p. 103). The shot is kept on the weapon, and an attack
 *     before the four seconds are up is refused: combat rounds in combat,
 *     world time outside it.
 *   - **Rock salt:** a failed HT roll is moderate pain (Characters p. 428)
 *     for the margin's minutes (p. 103).
 *   - **The net round:** a failed roll against its deployment charge stuns
 *     the victim, as a stun grenade does (pp. 143, 193); being caught is the
 *     sheet's Entangled (Net), which the card names.
 */

import { marginOfFailure } from "../../../shared/margin.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import type { PrintedRound } from "./printed.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Ammunition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ammunition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** When a printed round that paces the gun was last fired from it: the combat, its round, and the world time. */
const FIRED_FLAG = "htPrintedFired";

interface FiredAt { mode: number; combat: string; round: number; time: number }

const worldNow = (): number => Number((game as any).time?.worldTime) || 0;

/** The combat under way, if it has started. */
function combatNow(): any | null {
  const combat = (game as any).combat;
  return combat?.started ? combat : null;
}

/**
 * The seconds since a paced round was last fired, or null where it wasn't,
 * or not in this combat: in a combat its rounds, outside one world time.
 */
export function secondsSinceFired(fired: FiredAt | null | undefined, now: { combat: string | null; round: number; time: number }): number | null {
  if (!fired) return null;
  if (now.combat !== null) return fired.combat === now.combat ? now.round - fired.round : null;
  return fired.combat ? null : now.time - fired.time;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

export function readyPrinted(api: GWorldApi, printedOf: (item: any, modeIndex: number) => PrintedRound | null): void {
  const now = () => {
    const combat = combatNow();
    return { combat: combat ? String(combat.id ?? "") : null, round: Number(combat?.round) || 0, time: worldNow() };
  };

  // Dragon's Breath: not again until four seconds after the last (p. 103).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context.refusal || !context.mode?.ranged) return;
    const modeIndex = Number(context.mode.index) || 0;
    const round = printedOf(item, modeIndex);
    if (!round?.everySeconds) return;
    const fired = item.getFlag?.(MODULE_ID, FIRED_FLAG) as FiredAt | undefined;
    const since = secondsSinceFired(fired, now());
    if (since !== null && since >= 0 && since < round.everySeconds) {
      context.refusal = F("PacedRefusal", { round: F(`Printed.${round.key}`, { tl: round.tl }), seconds: round.everySeconds - since });
    }
  });
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!item?.isOwner) return;
    const modeIndex = Number(context.modeIndex) || 0;
    if (!printedOf(item, modeIndex)?.everySeconds) return;
    const at = now();
    void item.setFlag(MODULE_ID, FIRED_FLAG, { mode: modeIndex, combat: at.combat ?? "", round: at.round, time: at.time } satisfies FiredAt);
  });

  // Rock salt's pain and the net's stun, on a failed roll against them.
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    if (!item || !actor || !Array.isArray(context.effects) || !context.mode) return;
    const round = printedOf(item, Number(context.mode.index) || 0);
    if (round?.key === "sgRockSalt") {
      const minutes = Math.max(1, marginOfFailure(Number(context.margin) || 0));
      context.effects.push({ key: "moderatePain", duration: { seconds: minutes * 60 } });
      void say(actor, L("Printed.sgRockSaltName"), [F("RockSaltPain", { name: actor.name, minutes })]);
    } else if (round?.key === "glNet") {
      context.effects.push({ key: "stunned" });
      void say(actor, L("Printed.glNetName"), [F("NetStunned", { name: actor.name })]);
    }
  });
}
