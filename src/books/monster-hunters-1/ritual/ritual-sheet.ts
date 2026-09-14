/**
 * The ritual's own item sheet (Monster Hunters 1 pp. 33-35, 39), ported from
 * the ritual branches of the system's item sheet. It shows what the definition
 * costs as it is built and, on a character, the Path every roll for it is
 * against.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ritualSkillOf } from "./caster.js";
import { RITUAL_DURATIONS, RITUAL_EFFECTS } from "./cost.js";
import { RITUAL_TYPE, type RitualSystem } from "./data.js";
import { PATHS } from "./path.js";

const keyed = (prefix: string, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, `GCC.MH1.Ritual.${prefix}.${k}`]));

/** Builds and registers the sheet. Foundry's application classes exist by the time `init` calls this. */
export function registerRitualSheet(api: GWorldApi, on: () => boolean): void {
  const { HandlebarsApplicationMixin } = (foundry.applications as any).api;
  const ItemSheetV2 = (foundry.applications as any).sheets.ItemSheetV2;

  class RitualSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
      classes: ["gworld", "sheet", "item", "gcc-ritual-sheet"],
      position: { width: 560, height: "auto" },
      window: { resizable: true },
      form: { submitOnChange: true, closeOnSubmit: false },
      actions: {
        addEffect: RitualSheet.#onAddEffect,
        deleteEffect: RitualSheet.#onDeleteEffect,
        recordMastery: RitualSheet.#onRecordMastery,
        editRitualImage: RitualSheet.#onEditImage,
      },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/mh1-ritual-sheet.hbs` },
    };

    get ritual(): any {
      return (this as any).document;
    }

    async _prepareContext(options: object): Promise<Record<string, unknown>> {
      const context = await super._prepareContext(options);
      const item = this.ritual;
      const system = item.system as RitualSystem;
      const derived = system.derived;
      const actor = item.actor ?? null;
      const skill = actor ? ritualSkillOf(api, actor, item, on()) : null;
      return {
        ...context,
        item,
        system,
        editable: (this as any).isEditable,
        cost: derived.cost,
        costLine: `(${derived.cost.effects} + ${derived.cost.modifiers}) × ${derived.cost.multiplier}${system.casting.trappingsPercent > 0 ? ` − ${system.casting.trappingsPercent}%` : ""}`,
        lastDuration: Number(system.casting.durationStep) === RITUAL_DURATIONS.length - 1,
        durationStep: String(system.casting.durationStep ?? 0),
        rangeUnit: `GCC.MH1.Ritual.RangeUnit.${system.casting.rangeKind}`,
        mastery: skill
          ? { held: skill.masteryHeld, bonus: skill.mastery, changed: Boolean(system.masteredAs) && system.masteredAs !== derived.identity }
          : { held: false, bonus: 0, changed: false },
        grimoire: skill?.grimoire ? `${skill.grimoire.name} +${skill.grimoire.bonus}` : "",
        skill: skill?.path
          ? {
              label: `${skill.name}${skill.level !== null ? `-${skill.level}` : ""}`,
              penalty: skill.penalty ? String(skill.penalty) : "",
              uncastable: skill.level === null && on(),
            }
          : null,
        effects: system.effects.map((e, index) => ({ ...e, index })),
        uses: ["area", "healing", "metaMagic", "speed", "damage"].map((key) => ({
          key, label: `GCC.MH1.Ritual.Uses.${key}`, checked: Boolean((system.definition as any)[key]),
        })),
        choices: {
          paths: Object.fromEntries(PATHS.map((path) => [path, path])),
          effects: keyed("Effect", Object.keys(RITUAL_EFFECTS)),
          bonusScopes: { "": "GCC.MH1.Ritual.BonusScope.none", ...keyed("BonusScope", ["broad", "moderate", "single"]) },
          damageTypes: Object.fromEntries(["", "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"].map((t) => [t, t || "—"])),
          damageKinds: keyed("DamageKind", ["standard", "small", "large", "heavy"]),
          deliveries: keyed("Delivery", ["malediction", "external", "externalExplosive"]),
          rangeKinds: keyed("RangeKind", ["yards", "information", "crossTime"]),
          durations: Object.fromEntries(RITUAL_DURATIONS.map((d, i) => [String(i), `GCC.MH1.Ritual.Duration.${d}`])),
        },
      };
    }

    /**
     * The effects arrive keyed by index, as every indexed form field does, and
     * the sheet shows every field of each, so the list is rebuilt whole.
     */
    _processFormData(event: Event | null, form: HTMLFormElement, formData: object): object {
      const data = super._processFormData(event, form, formData) as Record<string, any>;
      const effects = data.system?.effects;
      if (effects && typeof effects === "object" && !Array.isArray(effects)) {
        data.system.effects = Object.keys(effects).sort((a, b) => Number(a) - Number(b)).map((key) => effects[key]);
      }
      return data;
    }

    static async #onAddEffect(this: RitualSheet) {
      await this.ritual.update({ "system.effects": [...this.ritual.system.effects, {}] });
    }

    static async #onDeleteEffect(this: RitualSheet, _event: Event, target: HTMLElement) {
      const index = Number(target.closest<HTMLElement>("[data-index]")?.dataset.index);
      if (!Number.isInteger(index)) return;
      const effects = [...this.ritual.system.effects];
      effects.splice(index, 1);
      await this.ritual.update({ "system.effects": effects });
    }

    /** Records the definition Ritual Mastery is for (p. 25). */
    static async #onRecordMastery(this: RitualSheet) {
      await this.ritual.update({ "system.masteredAs": String(this.ritual.system.derived?.identity ?? "") });
    }

    static async #onEditImage(this: RitualSheet) {
      if (!(this as any).isEditable) return;
      const item = this.ritual;
      const picker = new (foundry.applications as any).apps.FilePicker.implementation({
        current: String(item._source?.img ?? item.img ?? ""),
        type: "image",
        callback: (path: string) => void item.update({ img: path }),
      });
      await picker.browse();
    }
  }

  (foundry.applications as any).apps.DocumentSheetConfig.registerSheet(Item, MODULE_ID, RitualSheet, {
    types: [RITUAL_TYPE],
    makeDefault: true,
    label: "GCC.MH1.Ritual.SheetLabel",
  });
}
