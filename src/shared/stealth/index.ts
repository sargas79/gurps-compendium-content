/**
 * The camouflage engine, registered with the system through the add-on API,
 * for every book that prints the rule (Ultra-Tech pp. 99-100; High-Tech
 * pp. 76-77).
 *
 * Each book registers its table in `CAMOUFLAGE_TABLES` -- its figures, its
 * switch and its text -- then calls `initCamouflage` and `readyCamouflage`,
 * which register once however many books call them. What they register reads
 * the item's own book's table on every call:
 *
 *   - **init:** the camouflage fields on equipment and armour: the pattern
 *     printed on it and the one on its other side, infrared suppression, scent
 *     masking, what customising added, whether it is a net laid over gear, and
 *     whether the record's price already includes them.
 *   - **ready:** where a character is hiding and who from, on the Gear tab;
 *     the worn piece worth most in that terrain against that observer as the
 *     Camouflage skill's equipment line (`gworld.skillBonuses`), and a line of
 *     its own for a system that counts apart; in a Quick Contest, the other
 *     side's night-vision or infravision gear in place of the Gear tab's
 *     observer; scent masking on the wearer's Tracking roll and on a tracker's
 *     roll to follow them; the options' price; an item sheet section; and row
 *     buttons to turn a reversible piece inside out, customise a piece, and
 *     hide gear under a net.
 */

import { isRuleOn } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { wornSenses } from "../sensors/index.js";
import {
  CAMOUFLAGE_TABLES,
  camouflageData,
  camouflageTableOf,
  hidingState,
  registerCamouflageData,
  setHiding,
  storeCamouflage,
  type CamouflageData,
  type CamouflageGear,
  type CamouflageTable,
  type HidingState,
  type ScentMasking,
} from "./data.js";
import { OBSERVERS, TERRAINS, camouflageValue, observerOf, type Observer, type Terrain } from "./rules.js";

export { CAMOUFLAGE_TABLES, camouflageData, camouflageTableOf, hidingState, setHiding, type CamouflageTable };

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Camouflage.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Camouflage.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The tags this engine's own rolls carry, which its roll lines leave alone. */
const OWN_ROLLS = ["hiddenGear", "camouflageCustomise"];

/** Registers what must exist before the world's data is read. */
export function initCamouflage(): void {
  registerCamouflageData();
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const carried = (item: any) => isGear(item) && item.system?.carried !== false;
const worn = (item: any) => carried(item) && item.system?.equipped === true;

/** A piece of camouflage with its table. */
interface Piece {
  item: any;
  table: CamouflageTable;
  gear: CamouflageGear;
  data: CamouflageData;
}

/** The camouflage an item is, with its table, where that table's switch is on. */
export function camouflageOf(item: any, on: (key: string) => boolean = isRuleOn): Piece | null {
  if (!isGear(item)) return null;
  const data = camouflageData(item);
  const table = camouflageTableOf(item, (t) => t.figures.gear(item, data) !== null, on);
  const gear = table ? table.figures.gear(item, data) : null;
  return table && gear ? { item, table, gear, data } : null;
}

/** The camouflage a character carries (or only wears), from the tables whose switches are on. */
function pieces(actor: any, wornOnly: boolean): Piece[] {
  return [...(actor?.items ?? [])]
    .filter(wornOnly ? worn : carried)
    .map((item: any) => camouflageOf(item))
    .filter((p): p is Piece => p !== null);
}

/** The scent masking a character wears, from the tables whose switches are on, with its table. */
function scentWorn(actor: any): Array<{ item: any; table: CamouflageTable; scent: ScentMasking }> {
  const found: Array<{ item: any; table: CamouflageTable; scent: ScentMasking }> = [];
  for (const item of actor?.items ?? []) {
    if (!worn(item)) continue;
    const data = camouflageData(item);
    const table = camouflageTableOf(item, (t) => t.figures.scent?.(item, data) != null);
    const scent = table?.figures.scent?.(item, data);
    if (table && scent) found.push({ item, table, scent });
  }
  return found;
}

/** A piece's worth in a terrain against an observer. */
function worth(piece: Piece, terrain: Terrain, observer: Observer): number {
  return camouflageValue(piece.gear.pattern, terrain, observer, piece.gear.observers);
}

/** Whether a skill is Camouflage, or Tracking, as the system compares tools to skills. */
const isSkill = (api: GWorldApi, name: unknown, wanted: string) => {
  const key = api.rules.toolSkillKey(String(name ?? ""));
  return Boolean(key) && key === api.rules.toolSkillKey(wanted);
};

/**
 * The Camouflage skill's equipment line, or null where no camouflage of a
 * switched-on book is carried: the worn piece worth most in the terrain
 * against the observer, or the best other tool for the skill where none is
 * worn. A pattern that hurts in the terrain hurts whatever else is carried: it
 * is what the character is wearing.
 */
export function camouflageEquipment(api: GWorldApi, actor: any, state: HidingState): { value: number; piece: Piece | null } | null {
  const carriedPieces = pieces(actor, false);
  if (!carriedPieces.some((p) => p.gear.counts === "quality")) return null;
  const known = new Set(carriedPieces.map((p) => p.item));
  let other = 0;
  for (const item of actor?.items ?? []) {
    if (!carried(item) || known.has(item) || item?.type !== "equipment") continue;
    if (!(item.system?.forSkills ?? []).some((s: unknown) => isSkill(api, s, "Camouflage"))) continue;
    other = Math.max(other, Number(api.rules.toolModifier(item.system?.equipmentQuality ?? "basic", item.system?.equipmentModifier)) || 0);
  }
  let best: Piece | null = null;
  let bestValue = 0;
  for (const piece of carriedPieces) {
    if (piece.gear.counts !== "quality" || piece.gear.deployed || !worn(piece.item)) continue;
    const value = worth(piece, state.terrain, state.observer);
    if (!best || value > bestValue) {
      best = piece;
      bestValue = value;
    }
  }
  if (!best) return { value: other, piece: null };
  return { value: bestValue < 0 ? bestValue : Math.max(bestValue, other), piece: best };
}

/** The observer the other side of a contest is, by their worn night-vision and infravision gear; null for no contest. */
function opponentObserver(actor: any, opponent: any, state: HidingState, api: GWorldApi): Observer | null {
  if (!opponent) return null;
  const senses = { nightVision: false, infravision: false };
  for (const { senses: s } of wornSenses(opponent)) {
    if (s.nightVision) senses.nightVision = true;
    if (s.infravision) senses.infravision = true;
  }
  return observerOf(senses, (observer) => camouflageEquipment(api, actor, { ...state, observer })?.value ?? 0);
}

/** The first table with sections whose switch is on: the one whose words the Gear tab speaks. */
const sectionTable = () => CAMOUFLAGE_TABLES.all.find((t) => t.sections && isRuleOn(t.switch)) ?? null;

function gearContext(api: GWorldApi, actor: any, table: CamouflageTable): Record<string, unknown> {
  const ns = table.i18n;
  const state = hidingState(actor);
  const lines = pieces(actor, false).filter((p) => p.table.sections && !p.gear.deployed).map((p) => {
    const value = worth(p, state.terrain, state.observer);
    return F(ns, worn(p.item) ? "PieceWorn" : "PieceNotWorn", { name: p.item.name, value: value >= 0 ? `+${value}` : value });
  });
  const equipment = camouflageEquipment(api, actor, state);
  if (equipment) lines.push(F(ns, "EquipmentLine", { value: equipment.value >= 0 ? `+${equipment.value}` : equipment.value }));
  return {
    title: L(ns, "GearTitle"),
    terrainLabel: L(ns, "TerrainLabel"),
    terrainHint: L(ns, "TerrainHint"),
    observerLabel: L(ns, "ObserverLabel"),
    observerHint: L(ns, "ObserverHint"),
    terrains: TERRAINS.map((value) => ({ value, label: L(ns, `Terrain.${value}`), selected: value === state.terrain })),
    observers: OBSERVERS.map((value) => ({ value, label: L(ns, `Observer.${value}`), selected: value === state.observer })),
    lines,
  };
}

function gearListeners(element: HTMLElement, actor: any): void {
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-hiding]").forEach((input) => {
    input.addEventListener("change", () => void setHiding(actor, { [String(input.dataset.gccHiding)]: input.value }));
  });
}

/** The table that shows an item's sheet section: one with sections whose switch is on, the item's own book's first. */
function sheetTable(item: any): CamouflageTable | null {
  if (!isGear(item)) return null;
  // A weapon's sheet has no use for a pattern unless its record already has one.
  const weapon = (item.system?.meleeModes?.length ?? 0) + (item.system?.rangedModes?.length ?? 0) > 0;
  if (weapon && !camouflageData(item).pattern) return null;
  return camouflageTableOf(item, (t) => t.sections);
}

function itemContext(item: any, table: CamouflageTable): Record<string, unknown> {
  const ns = table.i18n;
  const data = camouflageData(item);
  const patterns = (selected: string) => [{ value: "", label: L(ns, "Pattern.none"), selected: !selected }, ...table.figures.patterns.map((value) => ({ value, label: L(ns, `Pattern.${value}`), selected: value === selected }))];
  const piece = camouflageOf(item);
  const lines: string[] = [];
  if (piece) {
    const show = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
    const p = piece.gear.pattern;
    lines.push(F(ns, "PatternLine", { matching: show(p.matching), nonMatching: show(p.nonMatching), contrasting: show(p.contrasting) }));
    for (const observer of ["nightVision", "infravision"] as const) {
      const extra = piece.gear.observers?.[observer] ?? 0;
      if (extra) lines.push(F(ns, `${observer}Line`, { value: show(extra) }));
    }
    if (piece.gear.deployed) lines.push(L(ns, "NetLine"));
  }
  const scent = table.figures.scent?.(item, data);
  if (scent?.follow) lines.push(F(ns, "ScentLine", { value: scent.follow }));
  const customise = table.figures.customise?.(item, data) ?? null;
  return {
    title: L(ns, "Title"),
    data,
    patternLabel: L(ns, "PatternLabel"),
    patternHint: L(ns, "PatternHint"),
    secondLabel: L(ns, "SecondLabel"),
    secondHint: L(ns, "SecondHint"),
    patterns: patterns(data.pattern),
    seconds: patterns(data.second),
    options: [
      { key: "infrared", label: L(ns, "InfraredLabel"), hint: L(ns, "InfraredHint"), checked: data.infrared },
      { key: "scent", label: L(ns, "ScentLabel"), hint: L(ns, "ScentHint"), checked: data.scent },
      { key: "net", label: L(ns, "NetLabel"), hint: L(ns, "NetHint"), checked: data.net },
    ],
    customise: customise ? { label: L(ns, "CustomLabel"), hint: F(ns, "CustomHint", { most: customise.most }), value: data.custom, max: Math.max(0, customise.most - customise.base) } : null,
    lines,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-camouflage]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccCamouflage) as keyof CamouflageData;
      let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "custom") value = Math.max(0, Math.trunc(Number(input.value) || 0));
      void storeCamouflage(item, field, value);
    });
  });
}

/** Posts lines to chat as a card. */
async function card(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** A character's Camouflage without what their worn camouflage adds, or its IQ-4 default (Characters p. 183). */
function bareCamouflage(api: GWorldApi, actor: any): number {
  const skill = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && isSkill(api, i.name, "Camouflage"));
  const level = skill ? api.actors.skillLevel(actor, String(skill.name)) : null;
  if (typeof level === "number") return level - (Number(skill?.system?.derived?.toolBonus) || 0);
  return (Number(api.actors.attribute(actor, "IQ")) || 10) - 4;
}

/** Asks for the terrain and the observer; null when closed. */
async function askTerrain(ns: string, title: string, state: HidingState): Promise<HidingState | null> {
  const select = (name: string, values: readonly string[], selected: string, group: string) =>
    `<select name="${name}">${values.map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${esc(L(ns, `${group}.${v}`))}</option>`).join("")}</select>`;
  const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${row(L(ns, "TerrainLabel"), select("terrain", TERRAINS, state.terrain, "Terrain"))}${row(L(ns, "ObserverLabel"), select("observer", OBSERVERS, state.observer, "Observer"))}</div>`,
    ok: {
      label: title,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const terrain = form?.querySelector<HTMLSelectElement>("[name=terrain]")?.value as Terrain;
        const observer = form?.querySelector<HTMLSelectElement>("[name=observer]")?.value as Observer;
        return { terrain: TERRAINS.includes(terrain) ? terrain : state.terrain, observer: OBSERVERS.includes(observer) ? observer : state.observer };
      },
    },
    rejectClose: false,
  }) as Promise<HidingState | null>;
}

/**
 * Hides gear under a net (High-Tech p. 76): the deployer's own Camouflage,
 * with the net's pattern for the terrain, against whoever later looks.
 */
async function hideGear(api: GWorldApi, piece: Piece, actor: any): Promise<void> {
  if (!actor) return;
  const ns = piece.table.i18n;
  const state = await askTerrain(ns, L(ns, "HideTitle"), hidingState(actor));
  if (!state) return;
  const value = worth(piece, state.terrain, state.observer);
  await api.roll.success({
    actor,
    base: bareCamouflage(api, actor),
    skill: "Camouflage",
    label: F(ns, "HideLabel", { name: piece.item.name }),
    modifiers: [{ label: F(ns, "HideLine", { name: piece.item.name, terrain: L(ns, `Terrain.${state.terrain}`) }), value }],
    tags: ["hiddenGear"],
    item: piece.item,
  } as any);
}

/** Customises a piece (High-Tech p. 77): a Camouflage roll whose margin is added to its bonus, up to the most it may reach. */
async function customise(api: GWorldApi, piece: Piece, actor: any): Promise<void> {
  const limits = piece.table.figures.customise?.(piece.item, piece.data);
  if (!actor || !limits) return;
  const ns = piece.table.i18n;
  const outcome: any = await api.roll.success({ actor, base: bareCamouflage(api, actor), skill: "Camouflage", label: F(ns, "CustomiseLabel", { name: piece.item.name }), tags: ["camouflageCustomise"], item: piece.item } as any);
  if (!outcome) return;
  if (!outcome.success) return void card(actor, String(piece.item.name), [L(ns, "CustomiseFailed")]);
  // Another go never undoes the last: the suit keeps the better of the two.
  const custom = Math.min(Math.max(0, limits.most - limits.base), Math.max(piece.data.custom, Math.trunc(Number(outcome.margin) || 0)));
  await storeCamouflage(piece.item, "custom", custom);
  await card(actor, String(piece.item.name), [F(ns, "Customised", { value: limits.base + custom, most: limits.most })]);
}

/** Turns a reversible piece inside out (High-Tech p. 77). */
async function turn(piece: Piece, actor: any): Promise<void> {
  const reversed = !piece.data.reversed;
  await storeCamouflage(piece.item, "reversed", reversed);
  const ns = piece.table.i18n;
  const showing = reversed ? piece.data.second : piece.data.pattern;
  await card(actor, String(piece.item.name), [F(ns, "Turned", { pattern: L(ns, `Pattern.${showing}`) })]);
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readyCamouflage(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "camouflage",
    types: ["equipment", "armor"],
    apply: (item, price) => {
      const data = camouflageData(item);
      const table = camouflageTableOf(item, (t) => t.figures.price?.(item, data) != null);
      const change = table?.figures.price?.(item, data);
      if (!table || !change || (change.factor === 1 && change.add === 0)) return null;
      return { cost: Math.round((price.cost * change.factor + change.add) * 100) / 100, weight: price.weight, label: L(table.i18n, "Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "camouflage-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/camouflage-item.hbs`,
    visible: (item) => sheetTable(item) !== null,
    context: (item) => itemContext(item, sheetTable(item)!),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "camouflage-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/camouflage-gear.hbs`,
    visible: (actor) => sectionTable() !== null && pieces(actor, false).some((p) => p.table.sections && !p.gear.deployed),
    context: (actor) => gearContext(api, actor, sectionTable()!),
    listeners: (element, actor) => gearListeners(element, actor),
  });

  // The worn piece worth most is the Camouflage skill's equipment line.
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    const actor = context?.actor;
    if (!actor || !isSkill(api, context?.name, "Camouflage") || !api.registry.isRuleOn("equipmentModifiers")) return;
    const equipment = camouflageEquipment(api, actor, hidingState(actor));
    if (!equipment) return;
    const line = (context.lines ?? []).find((l: any) => l?.key === "tools");
    const ns = equipment.piece?.table.i18n ?? sectionTable()?.i18n ?? CAMOUFLAGE_TABLES.all[0]?.i18n ?? "GCC.HT";
    const reason = equipment.piece ? F(ns, "EquipmentReason", { name: equipment.piece.item.name }) : L(ns, "NotWornReason");
    if (line) {
      if (line.value === equipment.value) return;
      line.value = equipment.value;
      line.reason = reason;
    } else if (equipment.value) context.lines?.push?.({ key: "tools", label: reason, value: equipment.value, source: MODULE_ID });
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!actor || !skill || (context.tags ?? []).some((t: string) => OWN_ROLLS.includes(t))) return;
    if (isSkill(api, skill, "Camouflage")) {
      const state = hidingState(actor);
      // In a Quick Contest, the other side's worn gear says what they see with (High-Tech p. 77).
      const facing = opponentObserver(actor, context.opponent, state, api);
      const seen = { ...state, observer: facing ?? state.observer };
      if (facing && facing !== state.observer && api.registry.isRuleOn("equipmentModifiers")) {
        const before = camouflageEquipment(api, actor, state);
        const after = camouflageEquipment(api, actor, seen);
        const change = (after?.value ?? 0) - (before?.value ?? 0);
        const ns = after?.piece?.table.i18n ?? before?.piece?.table.i18n;
        if (change && ns) context.modifiers.push({ label: F(ns, "AgainstLine", { observer: L(ns, `Observer.${facing}`) }), value: change });
      }
      // A system that counts apart: the best one worn.
      let apart: { label: string; value: number } | null = null;
      for (const piece of pieces(actor, true)) {
        if (piece.gear.counts !== "modifier" || piece.gear.deployed) continue;
        const value = worth(piece, seen.terrain, seen.observer);
        if (!apart || value > apart.value) apart = { label: piece.table.figures.label(piece.item, seen), value };
      }
      if (apart) context.modifiers.push(apart);
    }
    // Scent masking the wearer uses to cover their own trail.
    if (isSkill(api, skill, "Tracking")) {
      let own: { label: string; value: number } | null = null;
      for (const { item, table, scent } of scentWorn(actor)) {
        if (scent.own && scent.own > (own?.value ?? 0)) own = { label: table.figures.scentLabel?.(item, "own") ?? String(item.name), value: scent.own };
      }
      if (own) context.modifiers.push(own);
    }
  });

  // Scent masking on a tracker following its wearer.
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    if (!context?.subject || !isSkill(api, context.skill, "Tracking")) return;
    let best: { label: string; value: number } | null = null;
    for (const { item, table, scent } of scentWorn(context.subject)) {
      if (scent.follow && scent.follow < (best?.value ?? 0)) best = { label: table.figures.scentLabel?.(item, "follow") ?? String(item.name), value: scent.follow };
    }
    if (best) context.modifiers.push(best);
  });

  const reversible = (item: any) => {
    const piece = camouflageOf(item);
    return piece && piece.data.pattern && piece.data.second ? piece : null;
  };
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "camouflage-turn",
    itemTypes: ["equipment", "armor"],
    label: L(CAMOUFLAGE_TABLES.all.find((t) => t.sections)?.i18n ?? "GCC.HT", "TurnTitle"),
    icon: "fa-solid fa-repeat",
    visible: (item) => reversible(item) !== null,
    run: (item, actor) => turn(reversible(item)!, actor),
  });

  const customisable = (item: any) => {
    const piece = camouflageOf(item);
    return piece && piece.table.figures.customise?.(item, piece.data) ? piece : null;
  };
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "camouflage-customise",
    itemTypes: ["equipment", "armor"],
    label: L(CAMOUFLAGE_TABLES.all.find((t) => t.sections)?.i18n ?? "GCC.HT", "CustomiseTitle"),
    icon: "fa-solid fa-leaf",
    visible: (item) => customisable(item) !== null,
    run: (item, actor) => customise(api, customisable(item)!, actor),
  });

  const net = (item: any) => {
    const piece = camouflageOf(item);
    return piece?.gear.deployed ? piece : null;
  };
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "camouflage-hide",
    itemTypes: ["equipment"],
    label: L(CAMOUFLAGE_TABLES.all.find((t) => t.sections)?.i18n ?? "GCC.HT", "HideTitle"),
    icon: "fa-solid fa-tree",
    visible: (item) => net(item) !== null,
    run: (item, actor) => hideGear(api, net(item)!, actor),
  });
}
