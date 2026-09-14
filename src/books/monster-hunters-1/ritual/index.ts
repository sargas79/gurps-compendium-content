/**
 * Ritual Path Magic (Monster Hunters 1 pp. 24-25, 32-39), registered with the
 * system through the add-on API.
 *
 *   - **init:** the ritual item type and its sheet; this module's data on
 *     characters and equipment; Magery off Thaumatology, and the Paths held to
 *     their ceiling, through the skill hooks.
 *   - **ready:** the rituals listed on the Magic tab, a Magic tab section for
 *     the Paths, the reserve and the rituals in effect, the casting and trigger
 *     cards, the blocking defense, and item-sheet sections for charms and
 *     grimoires.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { breakCharm, cancelRitual, describeRitualInEffect, extendRitual, registerCastingCards, startRitualCasting, triggerRitual } from "./casting-card.js";
import { holdPaths, mageryOf, ritualPathOf, ritualSkillOf } from "./caster.js";
import { RITUAL_TYPE, casterData, equipmentData, registerRitualData, storeGrimoire, storeReserve } from "./data.js";
import { registerRitualSheet } from "./ritual-sheet.js";
import { collectionWeight, grimoirePrice } from "./tricks.js";

const L = (key: string) => game.i18n.localize(`GCC.MH1.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MH1.${key}`, data);

/** Registers what must exist before the world's data is read. */
export function initRitualPath(api: GWorldApi, on: () => boolean): void {
  registerRitualData();
  registerRitualSheet(api, on);

  // Magery "does not add to spell use or Thaumatology" (p. 24): it caps the Paths instead.
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!on() || String(context?.name ?? "").trim().toLowerCase() !== "thaumatology") return;
    for (const line of context.lines ?? []) {
      if (line.key !== "magic" || !line.value) continue;
      line.value = 0;
      line.reason = L("RitualCast.MageryOffThaumatology");
    }
  });

  // A Path is held to the lower of Thaumatology and 12 + Magery, and defaults
  // to Thaumatology-6 no higher than 12 (pp. 32-33).
  Hooks.on(api.data.hooks.skillLevels, (context: any) => {
    if (!on()) return;
    holdPaths(context, mageryOf(api, context.actor), { capped: L("RitualCast.PathCapped"), defaulted: L("RitualCast.PathDefault") }, MODULE_ID);
  });
}

/** The Magic tab section: Paths, reserve, and the rituals in effect. */
function pathSectionContext(api: GWorldApi, actor: any): Record<string, unknown> {
  const state = ritualPathOf(api, actor);
  return {
    state,
    reserveLabel: `/ ${state.reserve.max}`,
    hanging: F("RitualCast.HangingCount", { count: state.conditional.hanging, limit: state.conditional.limit }),
    inEffect: casterData(actor).active.map((entry) => {
      const described = describeRitualInEffect(entry);
      return {
        ...entry,
        ...described,
        showTrigger: entry.conditional && !entry.charm,
        extendable: !entry.conditional && !described.expired && entry.originalSeconds > 0 && Boolean(actor.items.get(entry.itemId)),
        cancelLabel: L(entry.conditional ? "RitualCast.Remove" : described.expired ? "RitualCast.Clear" : "RitualCast.Cancel"),
      };
    }),
  };
}

/** A grimoire's editor on an equipment sheet (pp. 39, 56-57). */
function grimoireContext(item: any): Record<string, unknown> {
  const g = equipmentData(item).grimoire;
  const owner = item.actor ?? null;
  const owned = owner ? [...owner.items].filter((i: any) => i.type === RITUAL_TYPE) : [];
  const entries = g.rituals.map((entry, index) => {
    const ritual = owned.find((r: any) => String(r.name) === entry.ritual);
    return {
      ...entry,
      index,
      options: owned.map((r: any) => ({ name: String(r.name), selected: String(r.name) === entry.ritual })),
      missing: Boolean(owner && entry.ritual && !ritual),
      changed: Boolean(ritual && entry.identity && ritual.system?.derived?.identity !== entry.identity),
    };
  });
  const prices = entries.map((e) => grimoirePrice({ bonus: e.bonus, deadLanguage: Boolean(g.deadLanguage), encrypted: g.encrypted }));
  return {
    g,
    entries,
    onCharacter: Boolean(owner),
    translations: (["none", "broken", "accented", "native"] as const).map((t) => ({ value: t, label: L(`Ritual.Comprehension.${t}`), selected: g.translation === t })),
    price: prices.length && prices.every(Boolean)
      ? F("Grimoire.Price", { cost: prices.reduce((sum, p) => sum + p!.cost, 0), weight: collectionWeight(entries.map((e) => e.bonus)) })
      : "",
  };
}

/** Binds a grimoire editor: every change rewrites the grimoire, remembering each ritual as it is defined when chosen. */
function grimoireListeners(element: HTMLElement, item: any): void {
  const write = async (change: (g: ReturnType<typeof equipmentData>["grimoire"]) => void) => {
    const g = equipmentData(item).grimoire;
    change(g);
    await storeGrimoire(item, g);
  };
  const identityOf = (name: string) => {
    const ritual = item.actor ? [...item.actor.items].find((i: any) => i.type === RITUAL_TYPE && String(i.name) === name) : null;
    return String(ritual?.system?.derived?.identity ?? "");
  };
  element.querySelector("[data-gcc-grimoire-add]")?.addEventListener("click", () => void write((g) => { g.rituals.push({ ritual: "", identity: "", bonus: 2 }); }));
  element.querySelectorAll<HTMLElement>("[data-gcc-grimoire-delete]").forEach((button) => {
    button.addEventListener("click", () => void write((g) => { g.rituals.splice(Number(button.dataset.index), 1); }));
  });
  element.querySelectorAll<HTMLInputElement>("[data-gcc-grimoire-ritual]").forEach((input) => {
    input.addEventListener("change", () => void write((g) => {
      const entry = g.rituals[Number(input.dataset.index)];
      if (!entry || entry.ritual === input.value) return;
      Object.assign(entry, { ritual: input.value, identity: identityOf(input.value) });
    }));
  });
  element.querySelectorAll<HTMLInputElement>("[data-gcc-grimoire-bonus]").forEach((input) => {
    input.addEventListener("change", () => void write((g) => {
      const entry = g.rituals[Number(input.dataset.index)];
      if (entry) entry.bonus = Math.max(0, Math.min(10, Math.floor(Number(input.value) || 0)));
    }));
  });
  element.querySelector<HTMLInputElement>("[data-gcc-grimoire-language]")?.addEventListener("change", (event) => void write((g) => { g.deadLanguage = (event.currentTarget as HTMLInputElement).value.trim(); }));
  element.querySelector<HTMLSelectElement>("[data-gcc-grimoire-translation]")?.addEventListener("change", (event) => void write((g) => { g.translation = (event.currentTarget as HTMLSelectElement).value as typeof g.translation; }));
  element.querySelector<HTMLInputElement>("[data-gcc-grimoire-encrypted]")?.addEventListener("change", (event) => void write((g) => { g.encrypted = (event.currentTarget as HTMLInputElement).checked; }));
  element.querySelector<HTMLInputElement>("[data-gcc-grimoire-decoded]")?.addEventListener("change", (event) => void write((g) => { g.decoded = (event.currentTarget as HTMLInputElement).checked; }));
}

/** Registers the table-side parts. */
export function readyRitualPath(api: GWorldApi, on: () => boolean): void {
  registerCastingCards({ api, on });

  // Rituals written down (pp. 33-35, 39): what each costs, and the Path every roll for it is against.
  api.data.registerItemType({
    module: MODULE_ID,
    type: RITUAL_TYPE,
    label: L("Ritual.Title"),
    tab: "magic",
    genericSheet: false,
    available: () => on(),
    columns: (item, actor) => {
      const skill = actor ? ritualSkillOf(api, actor, item, on()) : null;
      const penalty = skill?.penalty ? ` (${skill.penalty})` : "";
      return [
        { label: L("Ritual.Effects"), value: String(item.system?.derived?.effects || "—") },
        { label: L("Ritual.Column.Energy"), value: Number(item.system?.derived?.cost?.total ?? 0) },
        { label: L("Ritual.Column.Skill"), value: skill?.name ? `${skill.name}${penalty}` : "—" },
        { label: L("Ritual.Column.Level"), value: skill?.level ?? (skill?.name && on() ? L("Ritual.Uncastable") : "—") },
      ];
    },
    actions: [{
      key: "cast",
      label: L("RitualCast.Start"),
      icon: "fa-solid fa-dice",
      visible: (item, actor) => on() && ritualSkillOf(api, actor, item, true).level !== null,
      run: (item, actor) => startRitualCasting(actor, item),
    }],
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-ritual-path",
    sheet: "character",
    tab: "magic",
    position: "start",
    template: `modules/${MODULE_ID}/templates/mh1-ritual-path.hbs`,
    visible: (actor) => on() && (actor?.type === "character" || actor?.type === "npc")
      && (ritualPathOf(api, actor).thaumatology !== null || [...(actor.items ?? [])].some((i: any) => i.type === RITUAL_TYPE) || casterData(actor).active.length > 0),
    context: (actor) => pathSectionContext(api, actor),
    listeners: (element, actor) => {
      element.querySelector<HTMLInputElement>("[data-gcc-reserve]")?.addEventListener("change", (event) => {
        const max = ritualPathOf(api, actor).reserve.max;
        void storeReserve(actor, Math.min(max, Number((event.currentTarget as HTMLInputElement).value) || 0));
      });
      element.querySelector("[data-gcc-top-off]")?.addEventListener("click", () => void storeReserve(actor, ritualPathOf(api, actor).reserve.max));
      element.querySelectorAll<HTMLElement>("[data-gcc-active]").forEach((button) => {
        const id = String(button.closest<HTMLElement>("[data-active-id]")?.dataset.activeId ?? "");
        button.addEventListener("click", () => {
          if (button.dataset.gccActive === "trigger") void triggerRitual(actor, id, L("RitualCast.ConditionMet"));
          if (button.dataset.gccActive === "extend") void extendRitual(actor, id);
          if (button.dataset.gccActive === "cancel") void cancelRitual(actor, id);
        });
      });
    },
  });

  // A charm travels with its object, and whoever holds it can break it (p. 38).
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-charm",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/mh1-charm.hbs`,
    visible: (item) => item?.type === "equipment" && Boolean(equipmentData(item).charm.ritual),
    context: (item) => ({ charm: equipmentData(item).charm, marginLabel: `${L("RitualCast.Margin")} ${equipmentData(item).charm.margin}` }),
    listeners: (element, item) => {
      element.querySelector("[data-gcc-break-charm]")?.addEventListener("click", async () => {
        const sure = await (foundry.applications.api as any).DialogV2.confirm({
          window: { title: L("RitualCast.Break") },
          content: `<p>${foundry.utils.escapeHTML(F("RitualCast.BreakConfirm", { item: String(item.name) }))}</p>`,
          rejectClose: false,
        });
        if (sure) await breakCharm(item);
      });
    },
  });

  // A grimoire's rituals and what it takes to read (pp. 39, 56-57).
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-grimoire",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/mh1-grimoire.hbs`,
    visible: (item) => on() && item?.type === "equipment",
    context: (item) => grimoireContext(item),
    listeners: (element, item) => grimoireListeners(element, item),
  });
}
