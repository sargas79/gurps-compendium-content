/**
 * Corrections to what the layout reader gives for the Basic Set Revised.
 *
 * The Revised edition sets short notes in a margin box ("GURPS Powers, p. 118
 * adds ..."), a table beside the text, and a list in a box; the reader keeps
 * the first line of a note or a scrap of a table where the text broke off.
 * Each fix names a page by its id, the words the reader gave, and what
 * `pdftotext -raw` shows the book printing there. A fix whose words are not
 * found is an error, so one that stops applying is noticed, not left behind.
 *
 *   find   the words as the reader gave them (a string, or a regular expression)
 *   with   what replaces them (a string, or a function of the match)
 *   append text added to the end of the page, as a paragraph
 */

import { VEHICLE_TABLES } from "./revised-vehicle-tables.mjs";

/** A margin note, joined to the line the reader kept of it. */
const note = (find, text) => ({ find, with: text });

const ADD_MARGIN = "\n\n";

export const REVISED_FIXES = {
  afflictionsInInjuriesIllnessAndFatigue: [
    note("GURPS Powers, p. 118 adds", "GURPS Powers, p. 118 adds the Banishment, Petrifaction, and Temporal Stasis afflictions."),
  ],
  // The note ends the page after Dual-Weapon Attacks, and the reader put it after the last section it found.
  bulletproofNudity: [{ find: "\n\nGURPS Action 2: Exploits", with: "" }],
  dualWeaponAttack: [{ append: "GURPS Action 2: Exploits adds more cinematic combat rules for double the fun!" }],
  frightChecks: [
    note("For variant tables, see GURPS Horror,", "For variant tables, see GURPS Horror, pp. 143-144, GURPS Powers, p. 85, and GURPS Steampunk 1: Settings and Style, pp. 41-43."),
  ],
  magic: [
    note("GURPS Magic adds nuance to", "GURPS Magic adds nuance to spell duration with instantaneous, temporary, lasting, permanent, and enchantment spells."),
    note(
      "Thaumatology: Magical Styles.",
      "For “Magic Perks” that boost Missile spells, check out Mighty Spell, Missile Spell Mastery, Power Casting, Psychic Guidance, and Spell Enhancement in GURPS Thaumatology: Magical Styles.",
    ),
  ],
  maintainingSpells: [
    note("GURPS Magic adds nuance to", "GURPS Magic adds nuance to spell duration with instantaneous, temporary, lasting, permanent, and enchantment spells."),
  ],
  meleeAttacksInTacticalCombat: [
    note(
      "GURPS Martial Arts has abilities",
      "GURPS Martial Arts has abilities and rules that let melee attackers move farther, exploit reach, and strike foes behind them.",
    ),
  ],
  parrying: [
    note(
      "GURPS Martial Arts explores",
      "GURPS Martial Arts explores two-weapon, two-handed weapon, and hands-free parries, and parries that set up attacks or damage attackers.",
    ),
  ],
  poison: [
    note("GURPS Magic – not these ones.", "Noxious magic potions use the rules in Chapter 28 of GURPS Magic – not these ones."),
  ],
  specialRulesForRapidFire: [
    { find: "For speedy shooting techniques, see GURPS Gun Fu and\n\n#### GURPS Tactical Shooting.", with: "For speedy shooting techniques, see GURPS Gun Fu and GURPS Tactical Shooting." },
  ],
  study: [
    {
      find: /no matter what else you\n\nFor detailed, case-by-case rules for learning advantages, see GURPS (are doing[^\n]*)\n\n#+ Social Engineering: Back to School\./,
      with: (m) => `no matter what else you ${m[1]}\n\nFor detailed, case-by-case rules for learning advantages, see GURPS Social Engineering: Back to School.`,
    },
  ],
  vacuum: [
    note("Atmospheric Pressure (p. 429).", "For extremely thin but not trace atmospheres, see Atmospheric Pressure (p. 429)."),
  ],
  defending: [
    note("Vision Rolls in Combat (p. 574).", "When in doubt about whether someone saw an attack coming, see Vision Rolls in Combat (p. 574)."),
  ],
  // The Revised edition sets these two as boxes on the page after their section.
  defendingInTacticalCombat: [
    {
      append: [
        "#### Defending Against Attacks from the Back",
        "Against an attack that comes from your back hex, you cannot defend at all unless you have Peripheral Vision (which lets you defend at -2) or 360° Vision (which lets you defend at no penalty). Even if you have one of those advantages, you have an extra -2 to parry an attack from behind, and cannot block at all, unless your weapon or shield arm has the Extra-Flexible enhancement or you have the Double-Jointed advantage.",
        "#### Retreating",
        "A retreat takes you one step – normally one hex – directly away from the foe you are defending against. You cannot retreat into an occupied hex. You may change facing by one hex-side, if you wish, as you retreat.",
      ].join(ADD_MARGIN),
    },
  ],
  // The box runs on into the second column, where the reader stops.
  manaLevels: [
    {
      append: [
        "Normal Mana: Only mages can cast spells. These spells work normally, according to all rules given in this chapter. This is the default mana level in most fantasy settings: mages use magic, others don’t.",
        "Low Mana: Only mages can cast spells, and all spells perform at -5 to skill, for all purposes. (Magic items are similarly affected; see Power of a Magic Item, p. 481.) However, critical failures have mild effects or no effect at all.",
        "No Mana: No one can use magic at all. Magic items do not function (but regain their powers when taken to an area with mana). This mana level occurs in isolated spots in magical worlds, but entire game worlds can lack mana, making magic use impossible.",
      ].join(ADD_MARGIN),
    },
  ],
  exposure: [
    {
      find: /(modifiers below:) effective temperature (Failure costs [^\n]*)\n\n(\| Situation[^]*?\n)\n/,
      with: (m) => `${m[1]}\n\n${m[3]}\n${m[2]}\n\n`,
    },
  ],
  combatTurnSequence: [
    {
      find: "Consider a running gun-\n\n",
      with:
        "Consider a running gunfight in which the combatants leap across rooftops and chase each other up and down rickety fire escapes: the GM could resolve this through roleplaying and DX or skill rolls (against Jumping, etc.), interspersed with a few seconds of combat whenever he feels the opponents have a clear shot at each other.\n\n" +
        "#### Active Characters\n\n" +
        "An “active character” is involved in the combat and able to take action. A character who is knocked out, asleep, etc. is not active. But someone who chooses to do nothing is still active – “Do Nothing” is a valid combat maneuver (see p. 364).\n\n",
    },
  ],
  // The traits Addendum 1 adds, and the icons the reader drops from a line of text.
  addendum1ControllableDisadvantage: [
    { find: "(if the trait is physical ) or Will (if mental )", with: "(if the trait is physical (P)) or Will (if mental (M))" },
  ],
  addendum1LanguageRelatedAdvantages: [{ find: "supernatural ( ) or exotic ( ) abilities", with: "supernatural (Su) or exotic (X) abilities" }],
  addendum1InjuryTolerance: [{ find: "### see p. 60", with: "**see p. 60**" }],
  addendum1Talent: [{ find: "### see p. 89", with: "**see p. 89**" }],
  addendum1BonusesForWildcardSkills: [
    {
      find: "Power-Ups 7: Wildcard Skills.",
      with: "For wildcard skills that include or have techniques – and techniques that are wildcards – see GURPS Power-Ups 7: Wildcard Skills.",
    },
  ],
  // The Assistance Rolls Table, which the reader gave without its rank rows: it has a page of its own.
  addendum2SampleAssistance: [{ find: /\n\n\| 10 points \| 3 \|[^]*?(?=\n\nThis list is by no means exhaustive)/, with: "" }],
  // The table of malfunction numbers fell into the paragraph after it.
  malfunctions: [
    {
      find: "12 14 16 17 A fine or very fine",
      with: "| TL | Malf. |\n| --- | --- |\n| 3 | 12 |\n| 4 | 14 |\n| 5 | 16 |\n| 6 or higher | 17 |\n\nA fine or very fine",
    },
  ],
  // The box of costs the note belongs to has a page of its own (movementPointCosts).
  movementAndFacing: [
    {
      find: "\n\nFlyers and swimmers pay 1 movement point/yard for vertical movement, 1.5 movement points/yard for diagonal movement, and nothing extra for posture, footing, or obstructed ground.",
      with: "",
    },
  ],
  // The five sizes of organization are a list, and the last one's figure fell onto a line of its own.
  addendum2TheOrganization: [
    {
      find: /provides: (Fairly powerful organization.*?: 10 points\.) (Powerful organization.*?: 15 points\.) (Very powerful organization.*?: 20 points\.) (Extremely powerful organization.*?: 25 points\.) (Large polity \(historical empire or typical modern nation\)):\n\n(30 points\.)/,
      with: (m) => `provides:\n\n- ${m[1]}\n\n- ${m[2]}\n\n- ${m[3]}\n\n- ${m[4]}\n\n- ${m[5]}: ${m[6]}`,
    },
  ],
  // A run-in name is bold with its figure in the parentheses: "Ear (-7):".
  addendum3AdditionalHitLocations: [
    {
      find: /\*\*(Chest|Ear|Nose|Jaw|Spine|Pelvis|Joints|Veins\/Arteries)\*\* (\([^)]*\))( and Abdomen \(-1\))?:/g,
      with: (m) => `**${m[1]} ${m[2]}${m[3] ?? ""}:**`,
    },
  ],
  // The table of fractions beside the text, and the notes in the margin.
  addendum4StatisticallySpeaking: [
    {
      find: "Use these approximations:\n\n",
      with:
        "Use these approximations:\n\n" +
        "| Target | Fraction Who Succeed | Target | Fraction Who Fail |\n| --- | --- | --- | --- |\n" +
        "| 3 | 1/200 | 11 | 1/3 |\n| 4 | 1/50 | 12 | 1/4 |\n| 5 | 1/20 | 13 | 1/6 |\n| 6 | 1/10 | 14 | 1/10 |\n" +
        "| 7 | 1/6 | 15 | 1/20 |\n| 8 | 1/4 | 16 | 1/50 |\n| 9 | 1/3 | 17 | 1/100 |\n| 10 | 1/2 | 18 | 1/200 |\n\n",
    },
  ],
  addendum4ExtraEffortWithPowers: [{ append: "For extra effort in combat, roll your attack or defense – not against Will." }],
  addendum4TradingFatigueForResistance: [{ append: "Changing the extra-effort ceiling for skill or resistance? The two should match." }],
  // The tables lose their column headings, and two of them their rows.
  vehicles: [
    { find: "| S |  |", with: "| S | large superstructure or gondola |" },
    { find: /#### Ground Vehicle Table[^]*?(?=#### Control Rolls)/, with: () => VEHICLE_TABLES },
  ],
  specialRangedWeapons: [
    { find: "Oil Flask (TL3). $10+, 1-2 lbs.\n\nMolotov Cocktail (TL6).", with: "Oil Flask (TL3). $10+, 1-2 lbs.\n\nMolotov Cocktail (TL6). Neg. cost, 1-2 lbs." },
  ],
};
