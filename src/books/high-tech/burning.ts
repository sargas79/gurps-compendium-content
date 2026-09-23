/**
 * Fires that go on burning on a victim, second by second: a flamethrower's
 * fuel (p. 178), thermite and napalm (p. 188). One engine for all three, so
 * each rule says only what burns, how hard, and what DR it meets.
 *
 * A burn is kept as a flag on the actor (`{ seconds, ... }`) and a module
 * condition naming the seconds left. On each of the victim's turns the active
 * GM rolls a second's damage against the DR the fire meets, takes what gets
 * through off the victim's HP (`actors.applyInjury`), and counts the burn
 * down; at 0 it goes out. Taking the condition off puts it out -- the GM's
 * say that it was smothered, drenched or scraped off -- and so does its rule
 * being switched off.
 */

import { MODULE_ID, type GWorldApi } from "../../shared/module.js";

/** What a burn keeps: the seconds left, and anything its rule counts as it goes. */
export interface BurnState {
  seconds: number;
  [key: string]: unknown;
}

export interface LingeringBurn {
  /** The actor flag it is kept in. */
  flag: string;
  /** The module condition that names it, `<module>.<condition>` once applied. */
  condition: string;
  /** Whether its rule is in play. */
  on: () => boolean;
  /** The card's title, and the label on the injury. */
  title: () => string;
  /** The condition's label with the seconds left. */
  conditionLabel: (seconds: number) => string;
  /** A second's damage: dice and adds, never below 0. */
  dice: { dice: number; adds: number };
  /** The DR the fire meets this second. */
  dr: (api: GWorldApi, actor: any, state: BurnState) => number;
  /** The state after a second that rolled `roll`, before the count-down. */
  after?: (state: BurnState, roll: number) => BurnState;
  /** The card's line for the second. */
  secondLine: (data: { name: string; roll: number; dr: number; injury: number; state: BurnState }) => string;
  /** The card's line when it burns out. */
  burnedOutLine: (name: string) => string;
}

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A second's damage from the dice rolled: never below 0. */
export function secondOfBurning(dice: readonly number[], adds: number): number {
  return Math.max(0, dice.reduce((sum, die) => sum + (Number(die) || 0), 0) + (Number(adds) || 0));
}

/** The burns each API instance ticks, and whether its turn hook is in. */
const registries = new WeakMap<object, LingeringBurn[]>();

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

const conditionId = (burn: LingeringBurn) => `${MODULE_ID}.${burn.condition}`;
const hasCondition = (api: GWorldApi, actor: any, id: string) => ((api.actors.conditions(actor) ?? []) as any[]).some((c) => c?.id === id);

/** One second of a burn on the victim's turn. */
async function tick(api: GWorldApi, actor: any, burn: LingeringBurn): Promise<void> {
  const state: BurnState | undefined = actor.getFlag?.(MODULE_ID, burn.flag);
  if (!state) return;
  const id = conditionId(burn);
  // Put out, or switched off: the GM took the condition off, or nobody plays the rule.
  if (!burn.on() || !hasCondition(api, actor, id)) {
    await actor.unsetFlag(MODULE_ID, burn.flag);
    if (hasCondition(api, actor, id)) await api.actors.removeCondition(actor, id);
    return;
  }
  const roll = secondOfBurning(Array.from({ length: burn.dice.dice }, d6), burn.dice.adds);
  const dr = Math.max(0, Math.floor(burn.dr(api, actor, state)));
  const injury = Math.max(0, roll - dr);
  if (injury > 0) await api.actors.applyInjury(actor, { amount: injury, label: burn.title() });
  const next = burn.after ? burn.after(state, roll) : state;
  const left = Math.max(0, (Number(state.seconds) || 0) - 1);
  const name = String(actor.name ?? "");
  const lines = [burn.secondLine({ name, roll, dr, injury, state })];
  if (left > 0) {
    await actor.setFlag(MODULE_ID, burn.flag, { ...next, seconds: left });
    await api.actors.applyCondition(actor, { module: MODULE_ID, key: burn.condition, label: burn.conditionLabel(left) });
  } else {
    await actor.unsetFlag(MODULE_ID, burn.flag);
    await api.actors.removeCondition(actor, id);
    lines.push(burn.burnedOutLine(name));
  }
  await say(actor, burn.title(), lines);
}

/** Registers a kind of burn, to be counted down on its victims' turns. */
export function registerLingeringBurn(api: GWorldApi, burn: LingeringBurn): void {
  let burns = registries.get(api);
  if (!burns) {
    burns = [];
    registries.set(api, burns);
    const listed = burns;
    Hooks.on(api.combat.hooks.turnStart, async (_combat: any, combatant: any) => {
      const actor = combatant?.actor;
      if (!actor || !isActiveGm()) return;
      for (const each of listed) await tick(api, actor, each);
    });
  }
  burns.push(burn);
}

/**
 * Sets a victim burning, or keeps the longer of the two where they already
 * are: the same fire doesn't burn twice over. Returns the seconds it now has.
 */
export async function startBurn(api: GWorldApi, actor: any, burn: LingeringBurn, state: BurnState): Promise<number> {
  const seconds = Math.max(0, Math.floor(Number(state.seconds) || 0));
  if (seconds <= 0 || !actor?.isOwner) return 0;
  const before: BurnState | undefined = actor.getFlag?.(MODULE_ID, burn.flag);
  const left = Math.max(seconds, Number(before?.seconds) || 0);
  await actor.setFlag(MODULE_ID, burn.flag, { ...(before ?? {}), ...state, seconds: left });
  await api.actors.applyCondition(actor, { module: MODULE_ID, key: burn.condition, label: burn.conditionLabel(left) });
  return left;
}
