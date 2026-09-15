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
 * (pp. 214, 216-218, 221), new hit locations (p. 137), multiple attacks
 * (pp. 126-128), active defense options (pp. 121-125), Targeted Attacks
 * and Combinations (pp. 64, 68, 80), extra effort in combat (p. 131), and
 * ranged attack options (pp. 97, 119-121), and unfamiliar, one-handed,
 * hurled and improvised weapons (pp. 212, 220, 224), and shoves and slams
 * with weapons and striking at or grabbing shields (pp. 112-113), and
 * untrained fighters and Harsh Realism for Unarmed Fighters (pp. 113, 124),
 * close combat: grappling options and long weapons (pp. 114-122), and Grab and
 * Smash, pain, teeth and bodies in close combat (pp. 114-119), and realistic
 * injury (pp. 136, 138-139), and who acts first: Who Draws First?, Stop Hits,
 * Cascading Waits and A Matter of Inches (pp. 103, 108, 110), and charging
 * foes (p. 106), and chambara fighting (pp. 128-130), and the other cinematic
 * rules: mind games, faking it, Unarmed Etiquette, Shaking It Off, Shout It
 * Out!, Proxy Fighting and Bullet Time (pp. 130, 132-133), and tournament
 * combat (pp. 134-135).
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
import { readyDefenseOptions } from "./defense-options/index.js";
import { readyTechniques } from "./techniques/index.js";
import { readyExtraEffort } from "./extra-effort/index.js";
import { readyRangedOptions } from "./ranged/index.js";
import { initUnorthodox, readyUnorthodox } from "./unorthodox/index.js";
import { readyShoves } from "./shields/index.js";
import { allowsAdvancedOptions, readyUntrained } from "./untrained/index.js";
import { readyCloseCombat } from "./close-combat/index.js";
import { readyGrabAndSmash } from "./grab-smash/index.js";
import { readyInjury } from "./injury/index.js";
import { initTiming, readyTiming } from "./timing/index.js";
import { readyCharging } from "./charging/index.js";
import { chambaraFighter, readyChambara } from "./chambara/index.js";
import { readyCinematic } from "./cinematic/index.js";
import { readyTournaments } from "./tournaments/index.js";

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
  { key: "defenseOptions", pages: "pp. 121-125", implemented: true },
  { key: "limitedDefenses", pages: "pp. 122-123", implemented: true },
  { key: "targetedAttacks", pages: "pp. 64, 68, 80", implemented: true },
  { key: "extraEffort", pages: "p. 131", implemented: true },
  { key: "rangedOptions", pages: "pp. 97, 119-121", implemented: true },
  { key: "cinematicRangedOptions", pages: "p. 120", implemented: true },
  { key: "unfamiliarWeapons", pages: "p. 212", implemented: true },
  { key: "unorthodoxWeapons", pages: "pp. 220, 224", implemented: true },
  { key: "shovesAndShields", pages: "pp. 112-113", implemented: true },
  { key: "untrainedFighters", pages: "p. 113", implemented: true },
  { key: "harshRealism", pages: "p. 124", implemented: true },
  { key: "grapplingOptions", pages: "pp. 114, 116-119, 121-122", implemented: true },
  { key: "longWeaponsInClose", pages: "p. 117", implemented: true },
  { key: "grabAndSmash", pages: "pp. 118-119", implemented: true },
  { key: "bodiesInClose", pages: "pp. 114-117", implemented: true },
  { key: "partialInjuries", pages: "p. 136", implemented: true },
  { key: "extremeDismemberment", pages: "p. 136", implemented: true },
  { key: "severeBleeding", pages: "p. 138", implemented: true },
  { key: "lastingInjuries", pages: "pp. 138-139", implemented: true },
  { key: "whoDrawsFirst", pages: "p. 103", implemented: true },
  { key: "chargingFoes", pages: "p. 106", implemented: true },
  { key: "stopHits", pages: "p. 108", implemented: true },
  { key: "cascadingWaits", pages: "p. 108", implemented: true },
  { key: "matterOfInches", pages: "p. 110", implemented: true },
  { key: "chambara", pages: "pp. 128-130", implemented: true },
  { key: "contestOfWills", pages: "p. 130", implemented: true },
  { key: "concentration", pages: "p. 130", implemented: true },
  { key: "fear", pages: "p. 130", implemented: true },
  { key: "fakingIt", pages: "p. 130", implemented: true },
  { key: "unarmedEtiquette", pages: "p. 132", implemented: true },
  { key: "shakingItOff", pages: "p. 132", implemented: true },
  { key: "shoutItOut", pages: "p. 132", implemented: true },
  { key: "proxyFighting", pages: "pp. 132-133", implemented: true },
  { key: "bulletTime", pages: "p. 133", implemented: true },
  { key: "tournaments", pages: "pp. 134-135", implemented: true },
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
  readyCommittedDefensive(api, () => api.registry.isRuleOn(ruleKey("committedDefensiveAttack")), allowsAdvancedOptions(() => api.registry.isRuleOn(ruleKey("untrainedFighters"))));
  readyAllOutAttack(api, () => api.registry.isRuleOn(ruleKey("allOutAttackOptions")));
  readyMoveAndAttack(api, () => api.registry.isRuleOn(ruleKey("moveAndAttack")));
  const chambara = chambaraFighter(() => api.registry.isRuleOn(ruleKey("chambara")));
  readyAcrobatics(api, () => api.registry.isRuleOn(ruleKey("acrobatics")), chambara);
  readyPostureAttacks(api, () => api.registry.isRuleOn(ruleKey("postures")));
  readyFeints(api, () => api.registry.isRuleOn(ruleKey("feints")));
  readyReadying(api, () => api.registry.isRuleOn(ruleKey("readying")));
  readyMeleeOptions(api, () => api.registry.isRuleOn(ruleKey("meleeOptions")));
  readyStyles(api, () => api.registry.isRuleOn(ruleKey("styles")), () => api.registry.isRuleOn(ruleKey("training")));
  readyWeapons(api, () => api.registry.isRuleOn(ruleKey("weaponBuilding")));
  readyHitLocations(api, () => api.registry.isRuleOn(ruleKey("finerHitLocations")));
  readyMultipleAttacks(api, () => api.registry.isRuleOn(ruleKey("multipleAttacks")), (actor) => api.registry.isRuleOn(ruleKey("cinematicRapidStrike")) || chambara(actor), () => api.registry.isRuleOn(ruleKey("rangedOptions")), (actor) => ({ ok: allowsAdvancedOptions(() => api.registry.isRuleOn(ruleKey("untrainedFighters")))(actor), reason: game.i18n.localize("GCC.MA.Untrained.Limited") }));
  readyDefenseOptions(api, () => api.registry.isRuleOn(ruleKey("defenseOptions")), () => api.registry.isRuleOn(ruleKey("limitedDefenses")), () => api.registry.isRuleOn(ruleKey("harshRealism")));
  readyTechniques(api, () => api.registry.isRuleOn(ruleKey("targetedAttacks")));
  readyRangedOptions(api, () => api.registry.isRuleOn(ruleKey("rangedOptions")), () => api.registry.isRuleOn(ruleKey("cinematicRangedOptions")));
  readyUnorthodox(api, () => api.registry.isRuleOn(ruleKey("unfamiliarWeapons")), () => api.registry.isRuleOn(ruleKey("unorthodoxWeapons")));
  readyShoves(api, () => api.registry.isRuleOn(ruleKey("shovesAndShields")));
  readyUntrained(api, () => api.registry.isRuleOn(ruleKey("untrainedFighters")), () => api.registry.isRuleOn(ruleKey("harshRealism")));
  readyCloseCombat(api, () => api.registry.isRuleOn(ruleKey("grapplingOptions")), () => api.registry.isRuleOn(ruleKey("longWeaponsInClose")));
  readyGrabAndSmash(api, () => api.registry.isRuleOn(ruleKey("grabAndSmash")), () => api.registry.isRuleOn(ruleKey("bodiesInClose")));
  readyInjury(api, () => api.registry.isRuleOn(ruleKey("partialInjuries")), () => api.registry.isRuleOn(ruleKey("extremeDismemberment")), () => api.registry.isRuleOn(ruleKey("severeBleeding")), () => api.registry.isRuleOn(ruleKey("lastingInjuries")));
  readyTiming(api, () => api.registry.isRuleOn(ruleKey("whoDrawsFirst")), () => api.registry.isRuleOn(ruleKey("stopHits")), () => api.registry.isRuleOn(ruleKey("cascadingWaits")), () => api.registry.isRuleOn(ruleKey("matterOfInches")));
  readyCharging(api, () => api.registry.isRuleOn(ruleKey("chargingFoes")));
  readyChambara(api, () => api.registry.isRuleOn(ruleKey("chambara")));
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyCinematic(api, {
    wills: rule("contestOfWills"),
    concentration: rule("concentration"),
    fear: rule("fear"),
    faking: rule("fakingIt"),
    etiquette: rule("unarmedEtiquette"),
    shaking: rule("shakingItOff"),
    shout: rule("shoutItOut"),
    proxy: rule("proxyFighting"),
    bulletTime: rule("bulletTime"),
  });
  readyTournaments(api, rule("tournaments"));
  readyExtraEffort(api, () => api.registry.isRuleOn(ruleKey("extraEffort")), () => api.registry.isRuleOn(ruleKey("cinematicRapidStrike")));
}

function init(): void {
  initPostureAttacks();
  initReadying();
  initStyles();
  initWeapons();
  initUnorthodox();
  initTiming();
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Martial Arts",
  registerRules,
  init,
  ready,
};
