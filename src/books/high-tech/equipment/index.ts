/**
 * High-Tech's rules for the gear itself (pp. 7-11), registered with the
 * system through the add-on API. The rules are in `rules.ts`.
 *
 *   - **Equipment options, adjusting for SM and legality with age** (the
 *     equipmentOptions, gearForSm and antiqueLegality switches): the book's
 *     table for the shared gadget engine, which reprices the item, shows its
 *     HP, HT and DR, its Legality Class once obsolete and whether it is worth
 *     maintaining, adds rugged's (and fragile's, and quality's) HT to
 *     equipment failure, styling's bonus to reactions while it is shown, and
 *     sizes the battery count with the rest.
 *   - **Combination gadgets** (combinationGadgets): a row action that builds
 *     one gadget from several of the character's.
 *   - **Equipment bonuses** (equipmentBonuses): a tool's intrinsic bonus and
 *     the Equipment Bond perk's +1, as lines on the skill beside quality's.
 *   - **TL and familiarity** (tlFamiliarity): a DX-based skill's TL penalty,
 *     on an attack or a tool, lifted once the character is familiar with the
 *     gear. A success roll's context doesn't say what gear it is made with,
 *     so another roll carrying the TL line keeps it.
 */

import { addExtensionFields, ITEM_EXTENSION_TYPES } from "../../../shared/extensions.js";
import { GADGET_TABLES, initGadgets, readyGadgets, type GadgetTable } from "../../../shared/gadgets/index.js";
import { gadgetItem } from "../../../shared/gadgets/data.js";
import { loadedCellWeight } from "../../../shared/power/data.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { HIGH_TECH_GADGETS, bondedName, combineGadgets, equipmentBonusLines, familiarityOffset, type CombinationPart } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Equipment.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Equipment.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The field a tool's intrinsic bonus is kept in. */
const INTRINSIC = "intrinsicBonus";

export interface EquipmentSwitches {
  combination: () => boolean;
  bonuses: () => boolean;
  familiarity: () => boolean;
}

/** High-Tech's gadget table, behind the book's own three switches (full keys). */
export function highTechGadgets(switches: GadgetTable["switches"]): GadgetTable {
  return { book: "high-tech", tls: { min: 0, max: 8 }, figures: HIGH_TECH_GADGETS, switches, i18n: "GCC.HT" };
}

/** Registers the table, the gadget fields and the intrinsic bonus, before the world's data is read. */
export function initHighTechEquipment(switches: GadgetTable["switches"]): void {
  GADGET_TABLES.register(highTechGadgets(switches));
  initGadgets();
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    /** A skill bonus the gear gives whatever its quality (p. 11), which adds to quality's. */
    [INTRINSIC]: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: -10, max: 10 }),
  });
}

/** A tool's intrinsic bonus. */
export function intrinsicOf(item: any): number {
  return Math.trunc(Number(item?.system?.extensions?.[MODULE_ID]?.[INTRINSIC]) || 0);
}

/** The character's carried tools for a skill, as the system matches `forSkills` to it. */
export function toolsFor(api: GWorldApi, actor: any, skill: string): any[] {
  const wanted = api.rules.toolSkillKey(skill);
  if (!wanted) return [];
  return [...(actor?.items ?? [])].filter((item: any) => item?.type === "equipment"
    && item.system?.carried !== false
    && (item.system?.forSkills ?? []).some((name: unknown) => api.rules.toolSkillKey(String(name ?? "")) === wanted));
}

/** The gear the character's Equipment Bond perks name. */
export function bondedGear(actor: any): string[] {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item?.type === "trait")
    .map((trait: any) => bondedName(trait))
    .filter((name): name is string => name !== null);
}

/** The character's skill of this name, compared as the system compares tools to skills. */
function skillNamed(api: GWorldApi, actor: any, name: string): any {
  const wanted = api.rules.toolSkillKey(name);
  return [...(actor?.items ?? [])].find((item: any) => item?.type === "skill" && api.rules.toolSkillKey(String(item.name ?? "")) === wanted) ?? null;
}

/** Whether the character is familiar with a piece of gear; null for one who keeps no list (an NPC). */
function familiarWith(api: GWorldApi, actor: any, name: string): boolean | null {
  const list = actor?.system?.familiarities;
  return Array.isArray(list) ? api.rules.isFamiliar(list.map(String), name) : null;
}

/**
 * The line the TL-familiarity rule puts on a roll with this skill and gear,
 * given the lines already there, or null where it changes nothing: a skill
 * that isn't DX-based, a roll with no TL penalty, a character who keeps no
 * familiarities.
 */
export function familiarityLine(api: GWorldApi, actor: any, skill: string, item: any, lines: ReadonlyArray<{ key?: string; value: number }>): { label: string; value: number } | null {
  if (!item || skillNamed(api, actor, skill)?.system?.attribute !== "DX") return null;
  const sum = (key: string) => lines.filter((l) => l.key === key).reduce((total, l) => total + (Number(l.value) || 0), 0);
  const familiar = familiarWith(api, actor, String(item.name ?? ""));
  if (familiar === null) return null;
  const value = familiarityOffset({ techLevel: sum("techLevel"), unfamiliar: sum("unfamiliar"), familiar });
  if (!value) return null;
  return { label: F(familiar ? "Familiar" : "TlAsUnfamiliar", { item: String(item.name ?? "") }), value };
}

/** The gear that goes into a combination, as the rules read it. */
function partOf(item: any): CombinationPart {
  const tl = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return {
    name: String(item?.name ?? ""),
    cost: Number(item?.effectivePrice?.cost ?? item?.system?.cost) || 0,
    weight: Number(item?.effectivePrice?.weight ?? item?.system?.weight) || 0,
    // The batteries in it as it is, which its effective weight holds, where the batteries rule knows them.
    cellWeight: loadedCellWeight(item) ?? gadgetItem(item).cellWeight,
    lc: typeof item?.system?.lc === "number" ? item.system.lc : null,
    tl: tl ? Number(tl[0]) : null,
  };
}

/** The item a combination makes: one piece of gear, with the parts' skills. */
export function combinationSource(parts: any[], name: string, allAtOnce: boolean): Record<string, unknown> {
  const made = combineGadgets(parts.map(partOf), allAtOnce);
  const skills = [...new Set(parts.flatMap((p) => (p.system?.forSkills ?? []).map(String)).filter(Boolean))];
  return {
    name,
    type: "equipment",
    system: {
      cost: made.cost,
      weight: made.weight,
      tl: made.tl === null ? "" : String(made.tl),
      lc: made.lc,
      forSkills: skills,
      category: parts.some((p) => p.system?.category === "tool") ? "tool" : "misc",
      extensions: { [MODULE_ID]: { ultraTech: { cellWeight: made.cellWeight } } },
    },
    flags: { [MODULE_ID]: { book: "high-tech", combination: { parts: parts.map((p) => String(p.name ?? "")), allAtOnce } } },
  };
}

/** Asks which of the character's gear goes in with this piece, and makes the combination. */
async function combine(item: any, actor: any): Promise<void> {
  const others = [...(actor?.items ?? [])].filter((i: any) => (i?.type === "equipment" || i?.type === "armor") && i.id !== item.id);
  if (!others.length) return void ui.notifications?.warn(L("NothingToCombine"));
  const chosen: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("CombineTitle") },
    content: `<div class="gworld"><p class="ihint">${esc(F("CombineHint", { name: item.name }))}</p>
      <div class="ichecks" style="flex-direction:column;align-items:flex-start">
        ${others.map((o: any) => `<label class="icheck"><input type="checkbox" name="part" value="${esc(o.id)}"> ${esc(o.name)}</label>`).join("")}
      </div>
      <div class="ichecks">
        <label class="icheck"><input type="radio" name="use" value="all" checked> ${esc(L("AllAtOnce"))}</label>
        <label class="icheck"><input type="radio" name="use" value="one"> ${esc(L("OneAtATime"))}</label>
      </div>
      <div class="ifields"><label>${esc(L("CombinedName"))} <input type="text" name="name" value=""></label></div></div>`,
    ok: {
      label: L("Combine"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ids = [...(form?.querySelectorAll<HTMLInputElement>('input[name="part"]:checked') ?? [])].map((i) => i.value);
        return {
          ids,
          allAtOnce: form?.querySelector<HTMLInputElement>('input[name="use"]:checked')?.value !== "one",
          name: form?.querySelector<HTMLInputElement>('input[name="name"]')?.value?.trim() ?? "",
        };
      },
    },
    rejectClose: false,
  });
  if (!chosen?.ids?.length) return;
  const parts = [item, ...others.filter((o: any) => chosen.ids.includes(o.id))];
  const name = chosen.name || parts.map((p) => p.name).join(" + ");
  const source = combinationSource(parts, name, chosen.allAtOnce);
  await actor.createEmbeddedDocuments("Item", [source]);
  const system = source.system as any;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("CombineTitle"))}</span></div>
      <div class="gc-result">${esc(F("Combined", { name, parts: parts.map((p) => p.name).join(", "), cost: system.cost, weight: system.weight, lc: system.lc ?? "-" }))}</div>
      <div class="gc-result">${esc(L(chosen.allAtOnce ? "CombinedAllAtOnce" : "CombinedOneAtATime"))}</div>
      <div class="gc-result">${esc(L("PartsKept"))}</div></div>`,
  });
}

/** The item sheet section's data. */
function itemContext(item: any, on: EquipmentSwitches): Record<string, unknown> {
  const actor = item?.actor;
  const bonded = actor && bondedGear(actor).some((n) => n.trim().toLowerCase() === String(item.name ?? "").trim().toLowerCase());
  const combination = item?.flags?.[MODULE_ID]?.combination;
  return {
    bonuses: on.bonuses() && (item?.system?.forSkills?.length ?? 0) > 0,
    intrinsic: intrinsicOf(item),
    bonded: bonded ? F("BondedTo", { name: actor.name }) : "",
    combination: combination?.parts?.length
      ? F(combination.allAtOnce ? "MadeAllAtOnce" : "MadeOneAtATime", { parts: combination.parts.join(", ") })
      : "",
  };
}

/** Registers the table-side parts and the book's own. */
export function readyHighTechEquipment(api: GWorldApi, on: EquipmentSwitches): void {
  readyGadgets(api);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-combine",
    itemTypes: ["equipment", "armor"],
    label: L("CombineTitle"),
    icon: "fa-solid fa-object-group",
    visible: () => on.combination(),
    run: (item, actor) => { void combine(item, actor); },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-equipment-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-equipment-item.hbs`,
    visible: (item) => item?.type === "equipment" && (
      (on.bonuses() && (item.system?.forSkills?.length ?? 0) > 0)
      || (on.combination() && Boolean(item.flags?.[MODULE_ID]?.combination))),
    context: (item) => itemContext(item, on),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>(`[data-ht-equipment="${INTRINSIC}"]`)?.addEventListener("change", async (event) => {
        const value = Math.max(-10, Math.min(10, Math.trunc(Number((event.currentTarget as HTMLInputElement).value) || 0)));
        await item.update({ [`system.extensions.${MODULE_ID}.${INTRINSIC}`]: value });
      });
    },
  });

  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    const actor = context?.actor;
    const name = String(context?.name ?? "");
    if (!actor || !name) return;
    if (on.bonuses()) {
      const tools = toolsFor(api, actor, name);
      if (tools.length) {
        const { intrinsic, bond } = equipmentBonusLines(tools.map((t) => ({ name: String(t.name ?? ""), intrinsic: intrinsicOf(t) })), bondedGear(actor));
        if (intrinsic) context.lines.push({ label: F("IntrinsicLine", { item: intrinsic.name }), value: intrinsic.value, source: MODULE_ID });
        if (bond) context.lines.push({ label: F("BondLine", { item: bond.name }), value: bond.value, source: MODULE_ID });
      }
    }
    // A tool's TL line, lifted once the character knows the gear: of the
    // carried tools the TL line may come from, any one they are familiar with.
    if (on.familiarity() && context.item?.system?.attribute === "DX") {
      const techLevel = (context.lines as any[]).filter((l) => l.key === "techLevel").reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      if (techLevel >= 0) return;
      const tools = toolsFor(api, actor, name).filter((t) => api.rules.parseTechLevel(t.system?.tl) !== null);
      const known = tools.find((t) => familiarWith(api, actor, String(t.name ?? "")) === true);
      if (known) context.lines.push({ label: F("Familiar", { item: String(known.name ?? "") }), value: -techLevel, source: MODULE_ID });
    }
  });

  // A weapon's TL penalty on a DX-based skill, as unfamiliarity.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.familiarity() || !context?.tags?.includes("techLevel")) return;
    const line = familiarityLine(api, context.actor, String(context.dataset?.rollSkill ?? ""), context.item, context.modifiers ?? []);
    if (line) context.modifiers.push(line);
  });
}
