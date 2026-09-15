/**
 * GURPS Martial Arts: the book's rules, registered with the GWorld system
 * through its add-on API. The book calls every one of its rules optional
 * (p. 96), so its group's switches all start off. So far this registers
 * Committed Attack and Defensive Attack (pp. 99-100), the wider All-Out
 * Attack (pp. 97-98), Move and Attack with any melee attack (p. 107), and
 * acrobatics: Acrobatic Stand, movement stunts, Acrobatic and Flying Attacks
 * (pp. 98, 105-107), and the posture tables with drops during an attack
 * (pp. 98-99), and feints: Beats, Ruses, defensive feints and resisting them
 * (pp. 49, 100-101), readying weapons (pp. 101-104), and the melee attack
 * options: grips, Pummeling, Tip Slash and Telegraphic Attack (pp. 109-113),
 * styles and training (pp. 49, 141-148, 232-233), and building weapons
 * (pp. 214, 216-218, 221), new hit locations (p. 137), and multiple attacks
 * (pp. 126-128).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { readyCommittedDefensive } from "./committed-defensive/index.js";
import { readyAllOutAttack, readyMoveAndAttack } from "./maneuvers/index.js";
import { readyAcrobatics } from "./acrobatics/index.js";
import { initPostureAttacks, readyPostureAttacks } from "./posture-attacks.js";
import { readyFeints } from "./feints/index.js";
import { initReadying, readyReadying } from "./readying/index.js";
import { readyMeleeOptions } from "./grips/index.js";
import { initStyles, readyStyles } from "./styles/index.js";
import { initWeapons, readyWeapons } from "./weapons/index.js";
import { readyHitLocations } from "./hit-locations/index.js";
import { readyMultipleAttacks } from "./multiple-attacks/index.js";

const SLUG = "martial-arts";
const REFERENCE = "Martial Arts";

/** The book's switches. */
const RULES = [
  { key: "committedDefensiveAttack", pages: "pp. 99-100", implemented: true },
  { key: "allOutAttackOptions", pages: "pp. 97-98", implemented: true },
  { key: "moveAndAttack", pages: "p. 107", implemented: true },
  { key: "acrobatics", pages: "pp. 98, 105-107", implemented: true },
  { key: "postures", pages: "pp. 98-99", implemented: true },
  { key: "feints", pages: "pp. 49, 100-101", implemented: true },
  { key: "readying", pages: "pp. 101-104", implemented: true },
  { key: "meleeOptions", pages: "pp. 109-113", implemented: true },
  { key: "styles", pages: "pp. 49, 141-148", implemented: true },
  { key: "training", pages: "pp. 147, 232-233", implemented: true },
  { key: "weaponBuilding", pages: "pp. 214, 216-218, 221", implemented: true },
  { key: "finerHitLocations", pages: "p. 137", implemented: true },
  { key: "multipleAttacks", pages: "pp. 126-128", implemented: true },
  { key: "cinematicRapidStrike", pages: "p. 127", implemented: true },
] as const;

/** A switch's full key, as the system stores it. */
export const ruleKey = (key: (typeof RULES)[number]["key"]) => `${MODULE_ID}.${key}`;

function registerRules(registry: RuleRegistry, group: string): void {
  for (const rule of RULES) {
    registry.registerRule({
      module: MODULE_ID,
      group,
      key: rule.key,
      // Localization keys: the Rules page localizes them, and this runs before
      // the translations are loaded.
      name: `GCC.MA.Rules.${rule.key}.Name`,
      hint: `GCC.MA.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

function ready(api: GWorldApi): void {
  readyCommittedDefensive(api, () => api.registry.isRuleOn(ruleKey("committedDefensiveAttack")));
  readyAllOutAttack(api, () => api.registry.isRuleOn(ruleKey("allOutAttackOptions")));
  readyMoveAndAttack(api, () => api.registry.isRuleOn(ruleKey("moveAndAttack")));
  readyAcrobatics(api, () => api.registry.isRuleOn(ruleKey("acrobatics")));
  readyPostureAttacks(api, () => api.registry.isRuleOn(ruleKey("postures")));
  readyFeints(api, () => api.registry.isRuleOn(ruleKey("feints")));
  readyReadying(api, () => api.registry.isRuleOn(ruleKey("readying")));
  readyMeleeOptions(api, () => api.registry.isRuleOn(ruleKey("meleeOptions")));
  readyStyles(api, () => api.registry.isRuleOn(ruleKey("styles")), () => api.registry.isRuleOn(ruleKey("training")));
  readyWeapons(api, () => api.registry.isRuleOn(ruleKey("weaponBuilding")));
  readyHitLocations(api, () => api.registry.isRuleOn(ruleKey("finerHitLocations")));
  readyMultipleAttacks(api, () => api.registry.isRuleOn(ruleKey("multipleAttacks")), () => api.registry.isRuleOn(ruleKey("cinematicRapidStrike")));
}

function init(): void {
  initPostureAttacks();
  initReadying();
  initStyles();
  initWeapons();
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Martial Arts",
  registerRules,
  init,
  ready,
};
