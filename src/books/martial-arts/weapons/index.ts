/**
 * Building weapons at the table (GURPS Martial Arts pp. 214, 216-218, 221).
 *
 * Balance, custom quality, accessories and concealment are this module's data
 * on the equipment item, never items attached to it. The price modifier
 * reprices the weapon in the book's order; the weapon's rows change through
 * `gworld.weaponAttacks`; each accessory's attack is a derived mode; and the
 * weapon's rows get Holdout and trick-weapon buttons.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  ACCESSORIES,
  BALANCES,
  DISGUISES,
  POP_OUT_DEFENSE,
  SILVERS,
  TRICK_MELEE_PENALTY,
  accessoryAdds,
  balanceModifier,
  concealmentPrice,
  customQualityCost,
  holdoutBonus,
  holdoutPenalty,
  hooks,
  lowerGrade,
  makesTwoHanded,
  materialsPercent,
  parryAfterSkill,
  type Accessory,
  type Balance,
  type Concealment,
  type Materials,
  type Silver,
  type WeaponKind,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Weapons.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Weapons.${key}`, data);

export const POP_OUT = "ma-pop-out";

interface Build {
  balance: Balance | "";
  presentation: number;
  silver: Silver | "";
  accessories: Accessory[];
  concealment: Concealment;
}

/** Adds the weapon's build before the world's items are read. */
export function initWeapons(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    weaponBuild: new f.SchemaField({
      balance: new f.StringField({ required: true, blank: true, initial: "" }),
      presentation: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
      silver: new f.StringField({ required: true, blank: true, initial: "" }),
      accessories: new f.ArrayField(new f.StringField({ required: true, blank: false })),
      rig: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0, max: 2, integer: true }),
      trick: new f.BooleanField({ required: true, initial: false }),
      clothing: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0, max: 2, integer: true }),
      disguise: new f.StringField({ required: true, blank: true, initial: "" }),
    }),
  });
}

const modes = (item: any, kind: "meleeModes" | "rangedModes"): any[] => (Array.isArray(item?.system?.[kind]) ? item.system[kind] : []);
const isWeapon = (item: any) => item?.type === "equipment" && (modes(item, "meleeModes").length > 0 || modes(item, "rangedModes").length > 0);

/** A weapon's build, kept to the values the rules know. */
export function buildOf(item: any): Build {
  const raw = item?.system?.extensions?.[MODULE_ID]?.weaponBuild ?? {};
  return {
    balance: BALANCES.includes(raw.balance) ? raw.balance : "",
    presentation: Math.max(0, Number(raw.presentation) || 0),
    silver: SILVERS.includes(raw.silver) ? raw.silver : "",
    accessories: (Array.isArray(raw.accessories) ? raw.accessories : []).filter((a: string) => ACCESSORIES.includes(a as Accessory)),
    concealment: {
      rig: Math.min(2, Math.max(0, Number(raw.rig) || 0)),
      trick: raw.trick === true,
      clothing: Math.min(2, Math.max(0, Number(raw.clothing) || 0)),
      disguise: DISGUISES.includes(raw.disguise) ? raw.disguise : "",
    },
  };
}

const customQuality = (build: Build) => Boolean(build.balance || build.presentation || build.silver);
const anything = (build: Build) => customQuality(build) || build.accessories.length > 0 || build.concealment.rig > 0 || build.concealment.trick || build.concealment.disguise !== "";

/** How the book prices a weapon's materials: the most expensive kind its modes and accessories give it (p. 221). */
function kindOf(api: GWorldApi, item: any, accessories: readonly Accessory[]): WeaponKind {
  const all = [...modes(item, "meleeModes"), ...modes(item, "rangedModes")];
  const cls = String(item?.system?.weaponClass ?? "") || api.rules.weaponClassOf({
    skills: all.map((m) => String(m?.skill ?? "")),
    damageTypes: all.map((m) => String(m?.damageType ?? "")) as any,
    hasMalfunction: modes(item, "rangedModes").some((m) => m?.malfunction),
    isFencing: modes(item, "meleeModes").some((m) => m?.isFencing),
  });
  const own: WeaponKind = cls === "firearm" ? "firearm" : cls === "bow" ? "bow" : cls === "fencing" || cls === "sword" ? "sword" : cls === "cutting" ? "cutting" : "crushing";
  if (own === "bow" || own === "firearm") return own;
  if (accessories.some((a) => a === "hook" || a === "sickle")) return "cutting";
  return own;
}

/** The weapon's price in the book's order: accessories, quality, concealment. */
function priced(api: GWorldApi, item: any, cost: number, weight: number): { cost: number; weight: number } | null {
  const build = buildOf(item);
  if (!anything(build)) return null;
  const sys = item.system ?? {};
  const list = Number(sys.listCost) > 0 ? Number(sys.listCost) : cost;
  // What the system's own grade and material make of the list price.
  const graded = list > 0 ? cost / list : 1;
  const twoHanded = modes(item, "meleeModes").some((m) => m?.twoHanded);
  const adds = accessoryAdds(build.accessories, twoHanded);
  const base = list + adds.cost;
  let total = base * graded;
  if (customQuality(build)) {
    const materials = (build.silver === "solid" ? "good" : String(sys.quality ?? "good")) as Materials;
    const percent = materialsPercent(materials, kindOf(api, item, build.accessories), Number(sys.tl) || 3) ?? 0;
    total = customQualityCost(base * api.rules.materialCostMultiplier(sys.material ?? ""), { balance: build.balance, materials: percent, presentation: build.presentation, silver: build.silver });
  }
  return concealmentPrice(total, weight + adds.weight, build.concealment, build.presentation > 0);
}

/** What a weapon adds to a Holdout roll to hide it: its penalty, and what hides it better. */
export function holdoutOf(item: any): { penalty: number; bonus: number } {
  const build = buildOf(item);
  const ranged = modes(item, "meleeModes").length === 0;
  const flexible = modes(item, "meleeModes").some((m) => /^(kusari|whip|monowire whip|force whip)$/i.test(String(m?.skill ?? "")));
  const weight = Number(item?.effectivePrice?.weight ?? item?.system?.weight) || 0;
  const penalty = holdoutPenalty({
    ranged,
    bulk: Math.min(0, ...modes(item, "rangedModes").map((m) => Number(m?.bulk) || 0)),
    weight,
    reaches: modes(item, "meleeModes").map((m) => String(m?.reach ?? "")),
    flexible,
  });
  return { penalty, bonus: holdoutBonus(build.concealment) };
}

const rowsOf = (helpers: any, item: any): any[] => (helpers.rows?.(item).melee ?? []) as any[];
const adjust = (api: GWorldApi, formula: string, by: number) => {
  const parsed = api.rules.parseDiceAdds(String(formula ?? ""));
  return parsed && by ? api.rules.formatDiceAdds(api.rules.addModifier(parsed, by)) : formula;
};

/** An accessory's attack mode (p. 214): a row built from the weapon's own. */
function registerAccessoryMode(api: GWorldApi, on: () => boolean, key: string, accessory: Accessory | "hookable", make: (item: any, rows: any[], helpers: any) => Record<string, unknown> | null): void {
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: `ma-accessory-${key}`,
    label: L(`Modes.${key}`),
    kind: "melee",
    applies: (item) => {
      if (!on() || !isWeapon(item)) return false;
      const accessories = buildOf(item).accessories;
      return accessory === "hookable" ? hooks(accessories) : accessories.includes(accessory);
    },
    mode: (item, _actor, helpers) => {
      const rows = rowsOf(helpers, item);
      const made = rows.length > 0 ? make(item, rows, helpers) : null;
      // Named for the accessory, not for the row it was built from.
      return made ? { ...made, mode: L(`Modes.${key}`) } : null;
    },
  });
}

async function rollHoldout(api: GWorldApi, item: any, actor: any): Promise<void> {
  const { penalty, bonus } = holdoutOf(item);
  const level = api.actors.skillLevel(actor, "Holdout");
  const sm = Number(actor?.system?.sm) || 0;
  await api.roll.success({
    actor,
    base: level ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5,
    label: F("HoldoutLabel", { weapon: String(item.name ?? "") }),
    skill: "Holdout",
    modifiers: [
      ...(penalty ? [{ label: L("HoldoutPenalty"), value: penalty }] : []),
      ...(bonus ? [{ label: L("HoldoutBonus"), value: bonus }] : []),
      ...(sm ? [{ label: L("SizeModifier"), value: sm }] : []),
    ],
  } as any);
}

/** Registers the price, the rows, the modes, the buttons and the item section. */
export function readyWeapons(api: GWorldApi, on: () => boolean): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ma-weapon-build",
    types: ["equipment"],
    apply: (item, { cost, weight }) => {
      if (!on() || !isWeapon(item)) return null;
      const result = priced(api, item, cost, weight);
      return result ? { ...result, label: L("Title") } : null;
    },
  });

  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !isWeapon(context?.item)) return;
    const build = buildOf(context.item);
    if (!anything(build)) return;
    const balance = balanceModifier(build.balance);
    const twoHanded = modes(context.item, "meleeModes").some((m) => m?.twoHanded);
    const adds = accessoryAdds(build.accessories, twoHanded);
    const quality = String(context.item.system?.quality ?? "good") as Materials;
    for (const entry of context.rows ?? []) {
      const row = entry.row;
      const missile = entry.kind === "ranged" && !row.thrown;
      // Balance on skill, or on Accuracy for a missile weapon (p. 216); a
      // strapped-on trick weapon at -1 in melee, and Acc 0 at range (p. 218).
      const skillChange = (missile ? 0 : balance) + (entry.kind === "melee" && build.concealment.trick ? TRICK_MELEE_PENALTY : 0);
      if (skillChange && typeof row.skillLevel === "number") {
        if (typeof row.parry === "number") row.parry = parryAfterSkill(row.parry, row.skillLevel, skillChange);
        row.skillLevel += skillChange;
      }
      if (missile && balance) row.accuracy = (Number(row.accuracy) || 0) + balance;
      if (missile && build.concealment.trick) {
        row.accuracy = 0;
        row.notes.push({ label: L("TrickNoAim"), hint: L("TrickHint") });
      }
      if (entry.kind === "melee" && adds.st && typeof row.minSt === "number") row.minSt += adds.st;
      if (entry.kind === "melee" && makesTwoHanded(build.accessories)) row.twoHanded = true;
      // A blade hidden inside another item is a grade lower (p. 218).
      if (build.concealment.disguise === "sheathed" && (quality === "fine" || quality === "veryFine") && (row.damageType === "cut" || row.damageType === "imp")) {
        row.damage = context.addToDamage(String(row.damage ?? ""), -1);
      }
      if (build.balance) row.notes.push({ label: L(`Balance.${build.balance}`), hint: L("BalanceHint") });
      if (build.accessories.length > 0 && entry.kind === "melee") row.notes.push({ label: L("Combination"), hint: build.accessories.map((a) => L(`Accessories.${a}`)).join(", ") });
    }
  });

  // Solid silver breaks as if cheap (p. 216); a blade sheathed in another item a grade lower (p. 218).
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    if (!on() || !context?.item) return;
    const build = buildOf(context.item);
    if (build.silver === "solid") context.breakage = api.rules.breakageModifier("cheap");
    else if (build.concealment.disguise === "sheathed") context.breakage = api.rules.breakageModifier(lowerGrade(String(context.quality ?? "good") as Materials) as any);
  });

  // The accessories' attacks (p. 214).
  const swing = (rows: any[]) => rows.find((row) => row.damageBase === "sw") ?? null;
  const longest = (rows: any[]) => rows.map((row) => String(row.reach ?? "")).join(", ");
  registerAccessoryMode(api, on, "hammer", "hammer", (_item, rows) => {
    const row = swing(rows);
    return row ? { ...row, damageType: "cr", notes: [], followUp: null, parry: null } : null;
  });
  registerAccessoryMode(api, on, "hook", "hookable", (_item, rows, helpers) => {
    const two = rows.some((row) => row.twoHanded);
    const by = two ? -1 : -2;
    const best = rows[0];
    return { ...best, damage: helpers.damage?.("thr", by) ?? best.damage, damageType: "cut", damageBase: "thr", damageModifier: by, swung: false, notes: [], followUp: null, parry: null };
  });
  for (const [key, accessory, reach] of [["kusari2", "kusari2", "1, 2*"], ["kusari4", "kusari4", "1-4*"]] as const) {
    registerAccessoryMode(api, on, key, accessory, (_item, rows, helpers) => ({
      ...rows[0],
      skillName: "Kusari",
      skillLevel: helpers.skillLevel("Kusari") ?? rows[0].skillLevel,
      damage: helpers.damage?.("sw", 2) ?? rows[0].damage,
      damageType: "cr",
      damageBase: "sw",
      damageModifier: 2,
      reach,
      twoHanded: true,
      swung: true,
      unbalanced: true,
      notes: [],
      followUp: null,
      parry: null,
    }));
  }
  registerAccessoryMode(api, on, "pick", "pick", (_item, rows) => {
    const row = swing(rows);
    return row ? { ...row, damage: adjust(api, String(row.damage), -1), damageType: "imp", damageModifier: (Number(row.damageModifier) || 0) - 1, notes: [], followUp: null, parry: null } : null;
  });
  registerAccessoryMode(api, on, "sickleCut", "sickle", (_item, rows) => {
    const row = swing(rows);
    return row ? { ...row, damage: adjust(api, String(row.damage), -1), damageType: "cut", damageModifier: (Number(row.damageModifier) || 0) - 1, notes: [], followUp: null, parry: null } : null;
  });
  registerAccessoryMode(api, on, "sickleImp", "sickle", (_item, rows) => {
    const row = swing(rows);
    return row ? { ...row, damage: adjust(api, String(row.damage), -2), damageType: "imp", damageModifier: (Number(row.damageModifier) || 0) - 2, notes: [], followUp: null, parry: null } : null;
  });
  registerAccessoryMode(api, on, "spear", "spear", (_item, rows, helpers) => {
    const two = rows.some((row) => row.twoHanded);
    const by = two ? 3 : 2;
    const best = rows.find((row) => row.damageBase === "thr") ?? rows[0];
    return { ...best, damage: helpers.damage?.("thr", by) ?? best.damage, damageType: "imp", damageBase: "thr", damageModifier: by, swung: false, readiesAfterAttack: false, reach: longest(rows).split(",").map((r) => r.trim()).filter(Boolean).pop() ?? best.reach, notes: [], followUp: null, parry: null };
  });

  // A weapon popping out of another: -2 to the first defense against it (p. 218).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: POP_OUT,
    label: L("PopOut"),
    attack: "melee",
    available: (context) => {
      if (!on() || !context.item) return false;
      const concealment = buildOf(context.item).concealment;
      return concealment.trick || concealment.disguise === "cap" || concealment.disguise === "sheathed";
    },
    apply: () => ({ defenseModifiers: [{ label: L("PopOut"), value: POP_OUT_DEFENSE }] }),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-holdout",
    itemTypes: ["equipment"],
    label: L("Holdout"),
    icon: "fa-solid fa-user-secret",
    visible: (item) => on() && isWeapon(item) && buildOf(item).concealment.disguise === "",
    run: (item, actor) => rollHoldout(api, item, actor),
  });

  // Working a trick weapon's mechanism: a DX roll (p. 218).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-trick-deploy",
    itemTypes: ["equipment"],
    label: L("Deploy"),
    icon: "fa-solid fa-hand-sparkles",
    visible: (item) => on() && buildOf(item).concealment.trick,
    run: async (item, actor) => {
      await api.roll.success({ actor, base: api.actors.attribute(actor, "DX") ?? 10, label: F("DeployLabel", { weapon: String(item.name ?? "") }), kind: "attribute" } as any);
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-weapon-build",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ma-weapon-build.hbs`,
    visible: (item) => on() && isWeapon(item),
    context: (item) => {
      const build = buildOf(item);
      const { penalty, bonus } = holdoutOf(item);
      const select = (values: readonly (string | number)[], current: string | number, prefix: string) =>
        values.map((value) => ({ value, label: L(`${prefix}.${value === "" || value === 0 ? "none" : value}`), selected: value === current }));
      return {
        build,
        balances: select(["", ...BALANCES], build.balance, "Balance"),
        silvers: select(["", ...SILVERS], build.silver, "Silver"),
        disguises: select(["", ...DISGUISES], build.concealment.disguise, "Disguise"),
        rigs: select([0, 1, 2], build.concealment.rig, "Rig"),
        clothings: select([0, 1, 2], build.concealment.clothing, "Clothing"),
        accessories: ACCESSORIES.map((a) => ({ value: a, label: L(`Accessories.${a}`), checked: build.accessories.includes(a) })),
        holdout: build.concealment.disguise ? L("DisguisedSearch") : F("HoldoutLine", { penalty, bonus }),
      };
    },
    listeners: (element, item) => {
      const path = `system.extensions.${MODULE_ID}.weaponBuild`;
      for (const input of element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ma-build]")) {
        input.addEventListener("change", () => {
          const field = input.dataset.maBuild!;
          if (field === "accessories") {
            const chosen = [...element.querySelectorAll<HTMLInputElement>('[data-ma-build="accessories"]')].filter((box) => box.checked).map((box) => box.value);
            void item.update({ [`${path}.accessories`]: chosen });
            return;
          }
          const value = input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : ["presentation", "rig", "clothing"].includes(field) ? Number(input.value) || 0 : input.value;
          void item.update({ [`${path}.${field}`]: value });
        });
      }
    },
  });
}

