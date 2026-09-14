/**
 * The system's pure rules, read from the API when a rule needs one.
 *
 * A ported rule that builds on one of the system's (reading dice, the
 * Long-Distance Modifiers table) calls it through here rather than importing
 * the system's source, which would bundle a second copy of it. Tests put the
 * system's rules on `game.gworld.api.rules` with `useSystemRules`.
 */

import type { GWorldApi } from "./module.js";

export function systemRules(): GWorldApi["rules"] {
  const rules = (globalThis as { game?: { gworld?: { api?: GWorldApi } } }).game?.gworld?.api?.rules;
  if (!rules) throw new Error("gurps-compendium-content | the GWorld system's rules are not available");
  return rules;
}
