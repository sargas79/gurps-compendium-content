/**
 * What High-Tech's projectile options and upgrades do as they are fired and
 * as they hit (pp. 166-175), registered with the system through the add-on
 * API. The rows are `index.ts`'s; these are the rolls and effects the row's
 * notes used to leave to the GM.
 *
 *   - **Hollow-points failing to expand** (p. 167, the GM's option, under
 *     its own switch): a handgun's hollow-point or poison bullet only
 *     expands on 1d <= TL-3, rolled as the blow is applied; one that doesn't
 *     hits as a solid bullet, with its own damage type and no (0.5).
 *   - **Poison bullets** (p. 167): a hit that gets through DR delivers one
 *     dose of the poison the load names, as a follow-up: a Basic Set poison
 *     carried by blood, contact or a follow-up, or High-Tech's curare, ricin
 *     or botulin.
 *   - **Airburst** (pp. 174-175): Attacking an Area at +4 with a TL7+
 *     proximity fuse, +3 with a TL5-6 time fuse, or only +1 at a flying
 *     target; an attack option on a mode firing airburst rounds or a shell
 *     that bursts in the air (shrapnel, beehive, ABF).
 *   - **Self-destruct** (p. 175): the round destroys itself at 1/2D, so a
 *     shot at a target beyond it is refused.
 *   - **Tracers** (p. 175): on the turn after a long burst -- one of the
 *     weapon's full RoF or more (p. 86) -- the shooter's next attack with the
 *     gun is at +1, not cumulative; and the tracers give the firer away.
 */

import { stepPiercing } from "../../../shared/loads/dice.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { HT_POISONS, type HtPoison } from "../drugs/rules.js";
import type { ProjectileGun, ProjectileLoad } from "./projectiles.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Ammunition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ammunition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The attack option for an airburst round's fuse. */
export const AIRBURST_OPTION = "ht-airburst";

/** The shells that burst in the air already (p. 175). */
const BURSTING_SHELLS: readonly string[] = ["shrapnel", "beehive", "abf"];

/** What a mode fires, as these rules need it. */
export interface FiredRound {
  fired: ProjectileLoad;
  gun: ProjectileGun;
  /** A poison bullet's poison: a Basic Set name, or `ht:<key>` for one of High-Tech's. */
  poison: string;
}

export interface RoundSwitches {
  projectiles: () => boolean;
  multiple: () => boolean;
  projectileUpgrades: () => boolean;
  /** Hollow-points failing to expand (p. 167). */
  expansion: () => boolean;
}

// ── the rules ──

/** Whether a load's hollow-point may fail to expand: a handgun's, the lower-velocity rounds (p. 167). */
export function mayFailToExpand(fired: ProjectileLoad, gun: ProjectileGun): boolean {
  return (fired.projectile === "hollowPoint" || fired.projectile === "poison") && gun.calibre?.class === "handgun";
}

/** Whether a hollow-point expands: 1d <= TL-3 (p. 167). */
export const expands = (tl: number, roll: number): boolean => roll <= tl - 3;

/**
 * The blow of a hollow-point that didn't expand: the damage type the gun's
 * own bullet has (a step back down, where expansion raised it) and the (0.5)
 * taken back off.
 */
export function unexpanded(damage: { type: string; armorDivisor: number }, ownType: string): { type: string; armorDivisor: number } {
  const type = ownType && ownType.startsWith("pi") ? ownType : stepPiercing(damage.type, -1);
  return { type, armorDivisor: (Number(damage.armorDivisor) || 1) * 2 };
}

/** High-Tech's own poisons a poison bullet may carry: those the book names for it, and curare (pp. 167, 227). */
export const HT_BULLET_POISONS: readonly HtPoison[] = ["curare", "ricin", "botulin"];

/** The Basic Set's poisons a poison bullet may carry: a blood or contact agent, or one carried on a follow-up (p. 167). */
export function bulletPoisons(examples: ReadonlyArray<{ name: string; delivery?: readonly string[] }>): string[] {
  return examples.filter((p) => (p.delivery ?? []).some((d) => d === "blood" || d === "contact" || d === "followUp")).map((p) => p.name);
}

/** The bonus an airburst gives the attack on an area (pp. 174-175): +4 at TL7+, a time fuse's +3, or +1 at a flier. */
export function airburstBonus(tl: number, flier: boolean): number {
  if (tl >= 7) return 4;
  return flier ? 1 : 3;
}

/** Whether a mode's round bursts in the air: an airburst upgrade or a bursting shell. */
export const airbursts = (fired: ProjectileLoad): boolean => fired.projectileUpgrades.includes("airburst") || BURSTING_SHELLS.includes(fired.projectile);

/** Where a self-destructing round destroys itself: its 1/2D, else its Max (p. 175). */
export const selfDestructRange = (halfDamage: number, max: number): number => (Number(halfDamage) || 0) || (Number(max) || 0);

/** Whether a burst was a long one, after which tracers help (p. 175): the weapon's full RoF, or more. */
export function longBurst(shots: { kind: string; fired: number }, rateOfFire: number): boolean {
  if (shots.kind === "suppression") return true;
  if (shots.kind !== "rapidFire" && shots.kind !== "spraying") return false;
  return shots.fired >= Math.max(2, Math.floor(Number(rateOfFire) || 0));
}

// ── in play ──

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;

/** The poison a poison bullet carries, as `actors.dosePoison` takes it, or null for none chosen. */
function poisonFor(api: GWorldApi, name: string): any | null {
  if (name.startsWith("ht:")) {
    const key = name.slice(3) as HtPoison;
    if (!HT_BULLET_POISONS.includes(key)) return null;
    return { ...HT_POISONS[key], name: game.i18n.localize(`GCC.HT.Drugs.Poison.${key}`), source: `${MODULE_ID}.${key}` };
  }
  const poison: any = name ? ((api.rules as any).poisonNamed?.(name) ?? null) : null;
  return poison ? { ...poison, source: `${MODULE_ID}.poisonBullet` } : null;
}

/** The choices a poison bullet's load offers: none, the Basic Set's, High-Tech's. */
export function bulletPoisonChoices(api: GWorldApi, chosen: string): Array<{ value: string; label: string; selected: boolean }> {
  const basic = bulletPoisons(((api.rules as any).POISON_EXAMPLES ?? []) as any[]);
  return [
    { value: "", label: L("NoPoison"), selected: !chosen },
    ...basic.map((n) => ({ value: n, label: n, selected: n === chosen })),
    ...HT_BULLET_POISONS.map((k) => ({ value: `ht:${k}`, label: game.i18n.localize(`GCC.HT.Drugs.Poison.${k}`), selected: `ht:${k}` === chosen })),
  ];
}

/** The time a bonus for the turn after this one lapses: the round after next. */
function nextTurnEnds(): number {
  const round = Number((CONFIG as any).time?.roundTime) || 1;
  return (Number((game as any).time?.worldTime) || 0) + 2 * round;
}

export function readyRounds(api: GWorldApi, on: RoundSwitches, firedOf: (item: any, modeIndex: number) => FiredRound | null): void {
  const firedIn = (item: any, mode: any): FiredRound | null => (item && mode?.ranged !== false ? firedOf(item, Number(mode?.index) || 0) : null);

  // A handgun's hollow-point may not expand (p. 167): rolled as the blow is applied.
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const damage = context?.damage;
    if (!on.projectiles() || !on.expansion() || !damage || !context.mode?.ranged || damage.firstHit) return;
    const round = firedIn(context.item, context.mode);
    if (!round || !mayFailToExpand(round.fired, round.gun) || !String(damage.type ?? "").startsWith("pi")) return;
    const roll = d6();
    const need = round.gun.tl - 3;
    if (expands(round.gun.tl, roll)) {
      void say(context.actor, String(context.item?.name ?? ""), [F("Expanded", { roll, need })]);
      return;
    }
    const ownType = String(context.item?.system?.rangedModes?.[Number(context.mode.index) || 0]?.damageType ?? "");
    Object.assign(damage, unexpanded(damage, ownType));
    void say(context.actor, String(context.item?.name ?? ""), [F("NotExpanded", { roll, need, type: damage.type })]);
  });

  // A poison bullet that gets through DR delivers its dose as a follow-up (p. 167).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const victim = context?.actor;
    if (!on.projectiles() || !victim?.isOwner || !context.mode?.ranged || !context.result) return;
    if (!(Number(context.result.penetrating) > 0) || context.result.touchEffectsReach === false) return;
    const round = firedIn(context.item, context.mode);
    if (round?.fired.projectile !== "poison") return;
    const poison = poisonFor(api, round.poison);
    void (async () => {
      if (!poison) return say(victim, L("Projectile.poison"), [L("NoBulletPoison")]);
      const dose: any = await api.actors.dosePoison(victim, poison);
      if (!dose) return say(victim, L("Projectile.poison"), [F("GasNoDose", { name: victim.name })]);
      if (!dose.delaySeconds) await api.actors.advancePoison(victim, dose.id);
      await say(victim, L("Projectile.poison"), [F("BulletDosed", { name: victim.name, poison: poison.name })]);
    })();
  });

  // Airburst: Attacking an Area at +4, +3 on a time fuse, +1 at a flier (pp. 174-175).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: AIRBURST_OPTION,
    label: L("Airburst.Label"),
    input: { type: "select", choices: ["", "area", "flier"].map((v) => ({ value: v, label: L(`Airburst.${v || "none"}`) })) },
    available: (context: any) => {
      if (!context?.ranged && context?.mode?.ranged !== true) return false;
      const round = firedIn(context?.item, { index: context?.mode?.index, ranged: true });
      if (!round || !airbursts(round.fired)) return false;
      return round.fired.projectileUpgrades.includes("airburst") ? on.projectileUpgrades() : on.multiple();
    },
    apply: (context: any, value: unknown) => {
      if (value !== "area" && value !== "flier") return null;
      const round = firedIn(context?.item, { index: context?.mode?.index, ranged: true });
      const bonus = airburstBonus(round?.gun.tl ?? 7, value === "flier");
      return { modifiers: [{ label: L(`Airburst.${value}`), value: bonus }], notes: [L("Airburst.Note")] };
    },
  } as any);

  // A self-destructing round never reaches a target past its 1/2D (p. 175).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.projectileUpgrades() || !context?.item || context.refusal || !context.ranged) return;
    const round = firedIn(context.item, { index: context.mode?.index, ranged: true });
    if (!round?.fired.projectileUpgrades.includes("selfDestruct")) return;
    const range = selfDestructRange(Number(context.dataset?.halfDamageRange), Number(context.dataset?.maxRange));
    const at = Number(context.rangeYards);
    if (range > 0 && Number.isFinite(at) && at > range) context.refusal = F("SelfDestructRefusal", { range, at });
  });

  // Tracers: +1 on the turn after a long burst, not cumulative; and the firer is seen (p. 175).
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    if (!on.projectileUpgrades() || !item || !actor?.isOwner) return;
    const round = firedIn(item, { index: context.modeIndex, ranged: true });
    if (!round?.fired.projectileUpgrades.includes("tracer")) return;
    const mode = item.system?.rangedModes?.[Number(context.modeIndex) || 0] ?? {};
    const lines = [L("TracerSeen")];
    const long = longBurst({ kind: String(context.kind ?? ""), fired: Number(context.fired) || 0 }, Number(mode.rateOfFire) || 1);
    void (async () => {
      if (long) {
        const label = L("TracerBonus");
        // Not cumulative: a bonus still held from the last burst gives way to this one.
        for (const held of (api.actors.pendingModifiers(actor) ?? []) as any[]) {
          if (held?.label === label) await api.actors.removePendingModifier(actor, held.id);
        }
        const skill = String(mode.skill ?? "");
        const id = await api.actors.addPendingModifier(actor, { label, value: 1, tags: ["attack"], ...(skill ? { skill } : {}), expires: nextTurnEnds() } as any);
        if (id) lines.push(L("TracerNext"));
      }
      await say(actor, String(item.name ?? ""), lines);
    })();
  });
}
