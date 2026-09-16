/**
 * GURPS Ultra-Tech's stealth systems, registered with the system through the
 * add-on API (pp. 95-100).
 *
 *   - **init:** the stealth fields on equipment and armour: what system a
 *     piece is where its name doesn't say, a cloak or net made of a surface,
 *     a shape-memory disguise, and a bonus the book states outright for a tool.
 *   - **ready:** a Gear tab section where a character says what they're hiding
 *     from and whether they're moving, with what their worn systems give; the
 *     Stealth, Camouflage, Tracking and Disguise bonuses on their rolls; -1 to
 *     hit a holobelt's wearer and -6 a moving invisible one; tools' stated
 *     bonuses; and the price of a cloak, a net and a shape-memory disguise.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  CAMOUFLAGE_TERRAIN,
  CHAMELEON,
  FLESH_MASK,
  FORM_COST,
  HOLOBELT,
  INVISIBILITY,
  SCENT_MASKING,
  SENSES,
  STEALTH_KINDS,
  camouflageResetSeconds,
  chameleonBonus,
  invisibilityBonus,
  jammerPenalties,
  shapeMemoryCell,
  shapeMemoryCost,
  shapeMemoryLegality,
  signaturePenalty,
  stealthKindByName,
  type Sense,
  type ShapeMemory,
  type StealthForm,
  type Terrain,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Stealth.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Stealth.${key}`, data);

const FIELD = "stealth";
const ACTOR_FLAG = "utStealth";
const FORMS: readonly StealthForm[] = ["surface", "cloak", "net"];
const SHAPE_MEMORY: readonly ShapeMemory[] = ["", "single", "multi"];
const TERRAINS = Object.keys(CAMOUFLAGE_TERRAIN) as Terrain[];

interface StealthData {
  kind: string;
  form: StealthForm | "";
  shapeMemory: ShapeMemory;
  disguiseCost: number;
  statedBonus: number;
  statedSkills: string[];
}

interface HidingState {
  sense: Sense;
  moving: boolean;
  silhouetted: boolean;
  terrain: Terrain;
}

export function initStealth(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...STEALTH_KINDS] }),
      form: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...FORMS] }),
      shapeMemory: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SHAPE_MEMORY] }),
      disguiseCost: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      statedBonus: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      statedSkills: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false }), { required: true, initial: [] }),
    }),
  });
}

function stealthData(item: any): StealthData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    kind: STEALTH_KINDS.includes(data.kind) ? data.kind : "",
    form: FORMS.includes(data.form) ? data.form : "",
    shapeMemory: SHAPE_MEMORY.includes(data.shapeMemory) ? data.shapeMemory : "",
    disguiseCost: Math.max(0, Number(data.disguiseCost) || 0),
    statedBonus: Math.floor(Number(data.statedBonus) || 0),
    statedSkills: Array.isArray(data.statedSkills) ? data.statedSkills.map(String) : [],
  };
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;

/** What a piece of gear is as a stealth system, from its fields or its name. */
function systemOf(item: any): { kind: string; form: StealthForm; namedForm: StealthForm } | null {
  const data = stealthData(item);
  const named = stealthKindByName(String(item?.name ?? ""));
  const kind = data.kind || named?.kind;
  if (!kind) return null;
  const namedForm = named?.form ?? "surface";
  return { kind, form: data.form || namedForm, namedForm };
}

/** The stealth systems a character has on: equipped, or carried for the belts and chips. */
function wornSystems(actor: any): Array<{ item: any; kind: string; form: StealthForm; tl: number }> {
  return [...(actor?.items ?? [])]
    .filter((item: any) => isGear(item) && (item.system?.equipped === true || (item.system?.carried !== false && /belt|chip/i.test(String(item.name)))))
    .map((item: any) => ({ item, system: systemOf(item) }))
    .filter((row): row is { item: any; system: NonNullable<ReturnType<typeof systemOf>> } => row.system !== null)
    .map((row) => ({ item: row.item, kind: row.system.kind, form: row.system.form, tl: tlOf(row.item) }));
}

function hidingState(actor: any): HidingState {
  const stored = actor?.getFlag?.(MODULE_ID, ACTOR_FLAG) ?? {};
  return {
    sense: SENSES.includes(stored.sense) ? stored.sense : "vision",
    moving: Boolean(stored.moving),
    silhouetted: Boolean(stored.silhouetted),
    terrain: TERRAINS.includes(stored.terrain) ? stored.terrain : "matching",
  };
}

/** The best Stealth bonus a character's worn systems give, and which gives it. */
function stealthBonus(actor: any, state: HidingState): { value: number; label: string } | null {
  let best: { value: number; label: string } | null = null;
  for (const worn of wornSystems(actor)) {
    let value = 0;
    if (worn.kind in CHAMELEON) value = chameleonBonus(worn.kind, state.sense, { moving: state.moving, form: worn.form });
    else if (worn.kind === "invisibility") value = invisibilityBonus(worn.tl, state.sense, { moving: state.moving, silhouetted: state.silhouetted, form: worn.form });
    if (value > (best?.value ?? 0)) best = { value, label: String(worn.item.name) };
  }
  return best;
}

/** The detection penalties a character's worn systems impose, as lines. */
function detectionLines(actor: any): string[] {
  const lines: string[] = [];
  for (const worn of wornSystems(actor)) {
    if (worn.kind === "infraredCloaking") lines.push(F("InfraredPenalty", { name: worn.item.name, value: signaturePenalty(worn.tl) }));
    if (worn.kind === "radarStealth") lines.push(F("RadarPenalty", { name: worn.item.name, value: signaturePenalty(worn.tl) }));
    const jammer = worn.kind === "holoDistort" ? "distortionField" : worn.kind;
    const penalties = jammerPenalties(jammer, worn.tl);
    for (const [sensor, value] of Object.entries(penalties)) lines.push(F("JammerPenalty", { name: worn.item.name, sensor: L(`Sensor.${sensor}`), value }));
    if (worn.kind === "holobelt" || worn.kind === "holoDistort") lines.push(F("HolobeltPenalty", { name: worn.item.name, value: HOLOBELT }));
    if (worn.kind === "programmableCamouflage") lines.push(F("CamouflageReset", { name: worn.item.name, seconds: camouflageResetSeconds(worn.tl) }));
  }
  return lines;
}

function gearContext(actor: any): Record<string, unknown> {
  const state = hidingState(actor);
  const bonus = stealthBonus(actor, state);
  return {
    state,
    senses: SENSES.map((value) => ({ value, label: L(`Sense.${value}`), selected: value === state.sense })),
    terrains: TERRAINS.map((value) => ({ value, label: L(`Terrain.${value}`), selected: value === state.terrain })),
    bonus: bonus ? F("StealthBonus", { value: bonus.value, name: bonus.label }) : L("NoStealthBonus"),
    lines: detectionLines(actor),
    invisible: wornSystems(actor).some((w) => w.kind === "invisibility"),
    camouflage: wornSystems(actor).some((w) => w.kind === "programmableCamouflage"),
  };
}

function gearListeners(element: HTMLElement, actor: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-hiding]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtHiding);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      void actor.setFlag(MODULE_ID, ACTOR_FLAG, { ...hidingState(actor), [field]: value });
    });
  });
}

function itemContext(item: any): Record<string, unknown> {
  const data = stealthData(item);
  const system = systemOf(item);
  const lc = typeof item.system?.lc === "number" ? item.system.lc : null;
  return {
    data,
    kinds: [{ value: "", label: L("Kind.none"), selected: !data.kind }, ...STEALTH_KINDS.map((value) => ({ value, label: L(`Kind.${value}`), selected: value === data.kind }))],
    forms: [{ value: "", label: L("Form.named"), selected: !data.form }, ...FORMS.map((value) => ({ value, label: L(`Form.${value}`), selected: value === data.form }))],
    shapeMemories: SHAPE_MEMORY.map((value) => ({ value, label: L(`ShapeMemory.${value || "none"}`), selected: value === data.shapeMemory })),
    hasForm: Boolean(system && (system.kind in CHAMELEON || system.kind === "invisibility")),
    multi: data.shapeMemory === "multi",
    statedSkills: data.statedSkills.join(", "),
    shapeLine: data.shapeMemory
      ? F("ShapeMemoryLine", { lc: shapeMemoryLegality(lc) ?? "-", cell: shapeMemoryCell(Number(item.system?.weight) || 0) })
      : "",
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-stealth]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtStealth);
      let value: unknown = input.value;
      if (field === "disguiseCost") value = Math.max(0, Number(input.value) || 0);
      if (field === "statedBonus") value = Math.floor(Number(input.value) || 0);
      if (field === "statedSkills") value = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
    });
  });
}

/** What the grade of a character's carried tools already gives a skill, as the system counts it. */
function systemGrade(api: GWorldApi, actor: any, skill: string): number {
  let best = 0;
  for (const item of actor?.items ?? []) {
    if (!isGear(item) || item.system?.carried === false) continue;
    if (!(item.system?.forSkills ?? []).some((s: string) => sameSkill(s, skill))) continue;
    const quality = String(item.system?.equipmentQuality ?? "basic");
    const value = quality === "good" ? 1 : quality === "fine" ? 2 : quality === "best" ? Math.max(2, Math.floor(tlOf(item) / 2)) : 0;
    best = Math.max(best, value);
  }
  void api;
  return best;
}

const sameSkill = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/\/tl\d*/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b) || norm(b).startsWith(`${norm(a)} (`);
};

export function readyStealth(api: GWorldApi, on: () => boolean): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-stealth",
    types: ["equipment", "armor"],
    apply: (item, price) => {
      if (!on()) return null;
      const data = stealthData(item);
      const system = systemOf(item);
      let cost = price.cost;
      let weight = price.weight;
      // A cloak is half a surface, a net ten times one (p. 99).
      if (system && system.form !== system.namedForm) {
        const factor = FORM_COST[system.form] / FORM_COST[system.namedForm];
        cost *= factor;
        weight *= factor;
      }
      if (data.shapeMemory) cost = shapeMemoryCost(data.shapeMemory, cost, data.disguiseCost);
      if (cost === price.cost && weight === price.weight) return null;
      return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 1000) / 1000, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-stealth-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-stealth-item.hbs`,
    visible: (item) => on() && isGear(item),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-stealth-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ut-stealth-gear.hbs`,
    visible: (actor) => on() && wornSystems(actor).length > 0,
    context: (actor) => gearContext(actor),
    listeners: (element, actor) => gearListeners(element, actor),
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on() || !actor || !skill) return;
    const worn = wornSystems(actor);
    if (sameSkill("Stealth", skill)) {
      const bonus = stealthBonus(actor, hidingState(actor));
      if (bonus?.value) context.modifiers.push({ label: bonus.label, value: bonus.value });
    }
    if (sameSkill("Camouflage", skill)) {
      const camo = worn.find((w) => w.kind === "programmableCamouflage");
      if (camo) context.modifiers.push({ label: `${camo.item.name} (${L(`Terrain.${hidingState(actor).terrain}`)})`, value: CAMOUFLAGE_TERRAIN[hidingState(actor).terrain] });
    }
    if (sameSkill("Tracking", skill)) {
      const mask = worn.find((w) => w.kind === "scentMasking");
      if (mask) context.modifiers.push({ label: F("ScentMaskingLine", { name: mask.item.name }), value: SCENT_MASKING });
    }
    if (sameSkill("Disguise", skill)) {
      const mask = worn.find((w) => w.kind === "fleshMask");
      if (mask) context.modifiers.push({ label: mask.item.name, value: FLESH_MASK });
    }
    // A tool whose bonus the book states outright, beyond what its grade gives.
    let stated: { value: number; label: string } | null = null;
    for (const item of actor.items ?? []) {
      if (!isGear(item) || item.system?.carried === false) continue;
      const data = stealthData(item);
      if (!data.statedBonus || !data.statedSkills.some((s) => sameSkill(s, skill))) continue;
      if (data.statedBonus > (stated?.value ?? 0)) stated = { value: data.statedBonus, label: String(item.name) };
    }
    if (stated) {
      const extra = stated.value - systemGrade(api, actor, skill);
      if (extra > 0) context.modifiers.push({ label: stated.label, value: extra });
    }
  });

  // Attacks on a holobelt's wearer are at -1; a moving invisible target at -6 (pp. 98, 100).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on()) return;
    for (const target of context?.targets ?? []) {
      const worn = wornSystems(target);
      const belt = worn.find((w) => w.kind === "holobelt" || w.kind === "holoDistort");
      if (belt) context.modifiers.push({ label: belt.item.name, value: HOLOBELT });
      const invisible = worn.find((w) => w.kind === "invisibility");
      if (invisible && hidingState(target).moving) context.modifiers.push({ label: F("InvisibleMoving", { name: invisible.item.name }), value: INVISIBILITY.hitMoving });
    }
  });
}
