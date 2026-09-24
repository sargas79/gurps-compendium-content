/**
 * The supplement's electric fences touched (HT:EE pp. 9, 42, 44), under the
 * switch `stunLethalFences`: run from High-Tech's traps and barriers GM tool,
 * each second a shock through the system's `hazards.shock`.
 *
 *   - **A low-voltage fence** shocks each second of contact as nonlethal
 *     electrical damage, on an unmodified HT roll, with Moderate Pain while
 *     touching it. A failure stuns the victim for as long as the contact
 *     lasts; the rolls to recover, one a second, start once it is broken.
 *   - **A stun-lethal fence** does that at a first touch, which arms it; at a
 *     second touch it runs high voltage, 3d burning a second as lethal
 *     electrical damage. A current that does more than 1 point of injury
 *     keeps the victim from letting go (p. 9), so the shocks go on, second
 *     by second, until the GM's cut-off: the shock's `contact` says so.
 *   - **A security fence** (a stun-lethal one always) sets off an alarm when
 *     touched, on a card the GMs alone see.
 *
 * The shock hooks (`gworld.shockModifiers`, `gworld.afterShock`) fire for
 * every shock in the world; the listeners here act only on the shock this
 * file is running, for the victim it names, and return at once for any other.
 * The electrical hazards rules (`../electricity/`) listen too: their source's
 * figures touch only their own tool's shocks, and their hold past 1 point of
 * injury touches every lethal shock, a fence's included -- where it has held
 * the victim, the fence leaves the contact as it is.
 */

import type { GWorldApi } from "../../../shared/module.js";
import { LOW_VOLTAGE, MAX_CONTACT_SECONDS, STUN_LETHAL, fenceAlarms, fenceStage, holdsOn, type FenceKind, type FenceTouch } from "./rules.js";

const NS = "GCC.HT.ElectricSecurity";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The fence shock under way: whose, which fence and which stage. Null when none is. */
interface FenceShock {
  actor: any;
  name: string;
  stage: "low" | "high";
}
let current: FenceShock | null = null;

/** The fence shock under way for this victim, or null: every other shock is left alone. */
export function fenceShockFor(actor: any): FenceShock | null {
  return current && actor && current.actor === actor ? current : null;
}

/** What the GM says of the touch. */
export interface FenceTouchAnswer {
  fence: Extract<FenceKind, "lowVoltage" | "stunLethal">;
  touch: FenceTouch;
  /** Seconds the victim means to stay in contact. */
  seconds: number;
  /** Seconds before the current is cut, for a victim who can't let go. */
  cutOff: number;
  metal: boolean;
  /** A security fence, which sets off an alarm when touched. */
  alarmed: boolean;
}

async function gmCard(title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    whisper: ChatMessage.implementation.getWhisperRecipients("GM"),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** One shock of the fence, marked as this file's while it runs. */
async function fenceShock(api: GWorldApi, shock: FenceShock, options: Record<string, unknown>): Promise<any> {
  const before = current;
  current = shock;
  try {
    return await api.hazards.shock({ actor: shock.actor, ...options } as any);
  } finally {
    current = before;
  }
}

/**
 * The low-voltage effects (HT:EE p. 42): Moderate Pain while touching, and an
 * unmodified HT roll each second; the first failure stuns, held for the rest
 * of the contact before the rolls to recover.
 */
async function lowVoltage(api: GWorldApi, victim: any, name: string, answer: FenceTouchAnswer): Promise<void> {
  const seconds = Math.max(1, Math.min(MAX_CONTACT_SECONDS, Math.floor(answer.seconds)));
  await api.actors.applyCondition(victim, { key: LOW_VOLTAGE.pain, duration: { seconds } } as any);
  for (let second = 1; second <= seconds; second += 1) {
    const left = seconds - second;
    const outcome: any = await fenceShock(api, { actor: victim, name, stage: "low" }, { kind: "nonlethal", modifier: LOW_VOLTAGE.modifier, continuous: false, formula: "", metalArmor: answer.metal, contactSeconds: left });
    if (!outcome) return;
    if (!outcome.stunned) continue;
    // Stunned for as long as the contact lasts; the rolls to recover begin once it's broken.
    if (left > 0) await api.actors.applyCondition(victim, { key: "stunned", holdRecovery: { seconds: left } } as any);
    return;
  }
}

/**
 * High voltage (HT:EE pp. 9, 42): 3d burning a second, a lethal shock each,
 * for the seconds the victim means to touch it -- and past them, while the
 * current holds the victim, until the GM's cut-off.
 */
async function highVoltage(api: GWorldApi, victim: any, name: string, answer: FenceTouchAnswer): Promise<void> {
  const cutOff = Math.max(1, Math.min(MAX_CONTACT_SECONDS, Math.floor(answer.cutOff)));
  const seconds = Math.max(1, Math.min(cutOff, Math.floor(answer.seconds)));
  for (let second = 1; second <= cutOff; second += 1) {
    const outcome: any = await fenceShock(api, { actor: victim, name, stage: "high" }, { kind: "lethal", modifier: 0, continuous: true, formula: STUN_LETHAL.formula, metalArmor: answer.metal, contactSeconds: Math.max(0, seconds - second) });
    if (!outcome) return;
    const held = outcome.contact?.held === true;
    if (second >= seconds && !held) return;
    if (held && second === cutOff) return void (await say(victim, name, [F("CutOff", { name: victim.name, seconds: cutOff })]));
  }
}

/** A victim touches an electric fence: its effects by stage, and its alarm. */
export async function touchFence(api: GWorldApi, victim: any, name: string, answer: FenceTouchAnswer): Promise<void> {
  if (fenceAlarms(answer.fence, answer.alarmed)) await gmCard(name, [F("FenceAlarm", { name: victim?.name ?? "" })]);
  const stage = fenceStage(answer.fence, answer.touch);
  if (stage === "high") return highVoltage(api, victim, name, answer);
  await lowVoltage(api, victim, name, answer);
  if (answer.fence === "stunLethal") await say(victim, name, [L("Armed")]);
}

/**
 * The shock hooks, for the fence shocks alone: the card names the fence and
 * its stage, and a high-voltage shock that does more than 1 point of injury
 * holds the victim on the wire (HT:EE p. 9).
 */
export function registerFenceHooks(api: GWorldApi, on: () => boolean): void {
  Hooks.on(api.combat.hooks.shockModifiers, (context: any) => {
    const shock = fenceShockFor(context?.actor);
    if (!shock || !on()) return;
    context.lines?.push?.(F(shock.stage === "high" ? "HighVoltage" : "LowVoltage", { fence: shock.name }));
  });
  Hooks.on(api.combat.hooks.afterShock, (context: any) => {
    const shock = fenceShockFor(context?.actor);
    if (!shock || !on()) return;
    // The electrical hazards rule (`electricalHazards`, HT:EE p. 9) already holds anyone a lethal shock injures by more
    // than 1 point, on any shock: where it has said so, its word stands and the fence adds nothing.
    if (context.contact?.held) return;
    if (shock.stage === "high" && holdsOn(context.injury)) context.contact = { held: true, label: F("Held", { name: context.actor?.name ?? "", fence: shock.name }) };
    else if (shock.stage === "low" && context.stunned && Number(context.contactSeconds) > 0) context.contact = { held: true, label: F("StunnedOn", { name: context.actor?.name ?? "", fence: shock.name }) };
  });
}
