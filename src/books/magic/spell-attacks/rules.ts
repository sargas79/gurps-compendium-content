/**
 * Spells that attack without being Missile or Melee spells (GURPS Magic
 * pp. 73-76, 187-198): the pure rules.
 *
 * A Regular spell can fire a jet, a breath or a stare: the caster rolls
 * against DX-4 or an Innate Attack skill to hit each turn, and the target may
 * dodge or block but not parry. An Area spell can rain damage on everyone in
 * the area each second, halved for someone there less than the whole second.
 * An Information, Enchantment or Blocking spell has nothing to hit with.
 */

import { MODULE_ID } from "../../../shared/module.js";

/** The behaviors' keys, as a spell record names them in `system.attack.behavior`. */
export const JET_KEY = "magic-jet";
export const RAIN_KEY = "magic-rain";

export type SpellAttackKind = "jet" | "rain";

/** How a spell of these classes attacks, or null for one that can't. */
export function spellAttackKind(classes: readonly string[]): SpellAttackKind | null {
  if (classes.some((c) => c === "information" || c === "enchantment" || c === "blocking" || c === "missile" || c === "melee")) return null;
  if (classes.includes("area")) return "rain";
  if (classes.includes("regular")) return "jet";
  return null;
}

/**
 * The attack a spell item makes through this module, or null: its record names
 * one of this module's behaviors, and its classes allow that kind of attack.
 */
export function moduleAttackOf(spell: any): SpellAttackKind | null {
  const behavior = String(spell?.system?.attack?.behavior ?? "");
  const kind = spellAttackKind(Array.isArray(spell?.system?.classes) ? spell.system.classes : []);
  if (behavior === `${MODULE_ID}.${JET_KEY}` && kind === "jet") return "jet";
  if (behavior === `${MODULE_ID}.${RAIN_KEY}` && kind === "rain") return "rain";
  return null;
}

/** Whether a running spell is still going at this world time. */
export function stillRunning(active: { expiresAt?: number | null } | null | undefined, now: number): boolean {
  if (!active) return false;
  return active.expiresAt === null || active.expiresAt === undefined || now < Number(active.expiresAt);
}
