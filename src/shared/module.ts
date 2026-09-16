/**
 * The module's identity, and the one way it reaches the system.
 *
 * Everything the add-on does in the system goes through `game.gworld.api` and
 * the hooks it names: no importing the system's source at runtime, no patching
 * or subclassing its classes. What the add-on writes is its own: its Item
 * types, `system.extensions.gurps-compendium-content`, its own flags and
 * settings, and switches in its own rule groups.
 */

import type { GWorldApi } from "../../types/gworld/src/system/api.js";

/** The module's id, which is also its namespace for rules, flags and extension data. */
export const MODULE_ID = "gurps-compendium-content";

/** The API range this build works with, as the manifest declares it. */
export const API_RANGE = "^1.61.0";

/** The hooks the system fires for add-ons. */
export const HOOKS = Object.freeze({
  /** During the system's `init`: register rule groups and switches. */
  registerRules: "gworld.registerRules",
  /** Once the world is ready, with the API: register everything else. */
  ready: "gworld.ready",
});

/** What a rule registration hook hands its listeners. */
export type RuleRegistry = Pick<GWorldApi["registry"], "registerRuleGroup" | "registerRule">;

export type { GWorldApi };
