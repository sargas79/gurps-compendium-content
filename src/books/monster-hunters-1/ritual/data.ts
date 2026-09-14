/**
 * Where Ritual Path Magic keeps its data (Monster Hunters 1 pp. 33-39),
 * ported from the system's `ritual` item type and its fields on characters and
 * equipment.
 *
 *   - **Rituals** are this module's own item type, `gurps-compendium-content.ritual`.
 *   - **A caster's mana reserve and the rituals in effect** are data this
 *     module keeps on characters and NPCs.
 *   - **Charms and grimoires** are data this module keeps on equipment.
 */

import { addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import {
  RITUAL_DURATIONS,
  RITUAL_EFFECTS,
  describeEffects,
  modifiersOfRitual,
  ritualCost,
  type RitualCost,
  type RitualEffectEntry,
  type RitualRecord,
} from "./cost.js";
import { PATHS } from "./path.js";
import { ritualIdentity } from "./tricks.js";

/** The ritual item type, as the manifest declares it. */
export const RITUAL_TYPE = `${MODULE_ID}.ritual`;

/** A ritual as its data model holds it, with what it works out. */
export interface RitualSystem {
  description: string;
  reference: string;
  effects: RitualEffectEntry[];
  definition: RitualRecord["definition"] & { affliction: string; traits: string; bonusRolls: string; damageType: string };
  casting: RitualRecord["casting"];
  masteredAs: string;
  blocking: boolean;
  derived: { cost: RitualCost; effects: string; identity: string };
}

/** A ritual cast and still in effect, or hanging until its condition is met (pp. 37-39). */
export interface RitualInEffect {
  id: string;
  itemId: string;
  name: string;
  energy: number;
  margin: number;
  effects: RitualEffectEntry[];
  durationSeconds: number;
  originalSeconds: number;
  startedAt: number;
  expiresAt: number | null;
  conditional: boolean;
  condition: string;
  charm: string;
}

/** What this module keeps on a character. */
export interface CasterData {
  manaReserve: number;
  active: RitualInEffect[];
}

/** What this module keeps on equipment. */
export interface EquipmentData {
  charm: { ritual: string; margin: number; casterUuid: string; activeId: string; condition: string };
  grimoire: {
    rituals: Array<{ ritual: string; identity: string; bonus: number }>;
    deadLanguage: string;
    translation: "none" | "broken" | "accented" | "native";
    encrypted: boolean;
    decoded: boolean;
  };
}

/** Builds the ritual data model. Foundry's classes exist by the time `init` calls this. */
export function ritualDataModel(): any {
  const fields = foundry.data.fields as any;
  const count = (options: Record<string, unknown> = {}) =>
    new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true, ...options });
  return class RitualData extends (foundry.abstract as any).TypeDataModel {
    static defineSchema() {
      return {
        description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
        reference: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** "Multiple effects, whether from the same or different paths, can be combined" (p. 33). */
        effects: new fields.ArrayField(
          new fields.SchemaField({
            path: new fields.StringField({ required: true, blank: false, initial: "Magic", choices: [...PATHS] }),
            effect: new fields.StringField({ required: true, blank: false, initial: "sense", choices: Object.keys(RITUAL_EFFECTS) }),
            greater: new fields.BooleanField({ initial: false }),
          }),
          { required: true, initial: [] },
        ),
        definition: new fields.SchemaField({
          /** The affliction, in words, and its worth as an enhancement: "Nauseated", 30. */
          affliction: new fields.StringField({ required: true, blank: true, initial: "" }),
          afflictionPercent: count({ integer: false }),
          /** The traits it gives or takes; their levels may vary. */
          traits: new fields.StringField({ required: true, blank: true, initial: "" }),
          area: new fields.BooleanField({ initial: false }),
          healing: new fields.BooleanField({ initial: false }),
          metaMagic: new fields.BooleanField({ initial: false }),
          speed: new fields.BooleanField({ initial: false }),
          /** Blank for a ritual that bestows no bonus or penalty. */
          bonusScope: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "broad", "moderate", "single"] }),
          bonusRolls: new fields.StringField({ required: true, blank: true, initial: "" }),
          damage: new fields.BooleanField({ initial: false }),
          damageType: new fields.StringField({
            required: true, blank: true, initial: "",
            choices: ["", "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
          }),
          damageKind: new fields.StringField({ required: true, blank: false, initial: "standard", choices: ["standard", "small", "large", "heavy"] }),
          damageDelivery: new fields.StringField({
            required: true, blank: false, initial: "malediction", choices: ["malediction", "external", "externalExplosive"],
          }),
        }),
        casting: new fields.SchemaField({
          areaRadius: count({ integer: false }),
          excludedSubjects: count(),
          traitsAdded: count(),
          traitsRemoved: count(),
          /** Negative for a penalty. */
          bonusAmount: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          damageDice: new fields.StringField({ required: true, blank: true, initial: "" }),
          healingDice: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** The cost of the spell being dispelled or altered. */
          metaMagic: count(),
          speedYards: count({ integer: false }),
          /** A line of the Ritual Effect Table's durations, from momentary. */
          durationStep: count({ max: RITUAL_DURATIONS.length - 1 }),
          extraMonths: count(),
          years: count(),
          extraEnergy: count(),
          rangeYards: count({ integer: false }),
          rangeKind: new fields.StringField({ required: true, blank: false, initial: "yards", choices: ["yards", "information", "crossTime"] }),
          dimensions: count(),
          subjectWeight: count({ integer: false }),
          /** The GM's discount for traditional trappings, up to 25%. */
          trappingsPercent: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 25 }),
        }),
        /**
         * The definition Ritual Mastery was taken for (p. 25), as
         * `ritualIdentity` writes it. Blank until recorded; a definition
         * changed since is "a different ritual" and loses the bonus (p. 39).
         */
        masteredAs: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** The GM agrees it "makes sense as an out-of-turn response": castable as a blocking spell (p. 37). */
        blocking: new fields.BooleanField({ initial: false }),
      };
    }

    prepareDerivedData(): void {
      const self = this as unknown as RitualSystem;
      self.derived = {
        cost: ritualCost({ effects: self.effects, modifiers: modifiersOfRitual(self) }),
        effects: describeEffects(self.effects),
        identity: ritualIdentity(self),
      };
    }
  };
}

/** Registers the ritual type's data model, and this module's data on characters and equipment. */
export function registerRitualData(): void {
  const fields = foundry.data.fields as any;
  (CONFIG.Item as any).dataModels[RITUAL_TYPE] = ritualDataModel();

  addExtensionFields("Actor", ["character", "npc"], {
    ritualPath: new fields.SchemaField({
      /** What is in the mana reserve now; its size, Magery x 3, is worked out (p. 36). */
      manaReserve: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      /** Rituals cast and still in effect, and conditional ones hanging (pp. 37-39). */
      active: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: true, blank: false }),
          itemId: new fields.StringField({ required: true, blank: true, initial: "" }),
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** The energy it took, which decides which of two overlapping rituals remains (p. 37). */
          energy: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
          /** "using its original margin of success if it matters" when a charm goes off (p. 38). */
          margin: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          effects: new fields.ArrayField(
            new fields.SchemaField({
              path: new fields.StringField({ required: true, blank: false, initial: "Magic" }),
              effect: new fields.StringField({ required: true, blank: false, initial: "sense" }),
              greater: new fields.BooleanField({ initial: false }),
            }),
            { required: true, initial: [] },
          ),
          /** How long it lasts once in effect; zero for a momentary ritual. */
          durationSeconds: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
          originalSeconds: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
          startedAt: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
          /** World time it runs out; null while it hangs as a conditional ritual. */
          expiresAt: new fields.NumberField({ required: true, nullable: true, initial: null }),
          conditional: new fields.BooleanField({ initial: false }),
          condition: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** The charm it is bound to, by name, for the sheet to say. */
          charm: new fields.StringField({ required: true, blank: true, initial: "" }),
        }),
        { required: true, initial: [] },
      ),
    }),
  });

  addExtensionFields("Item", ["equipment"], {
    /**
     * A charm (pp. 38-39): a conditional ritual bound to this fragile object.
     * Breaking it sets the ritual off "using its original margin of
     * success". Blank ritual for an object that is not a charm.
     */
    charm: new fields.SchemaField({
      ritual: new fields.StringField({ required: true, blank: true, initial: "" }),
      margin: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      casterUuid: new fields.StringField({ required: true, blank: true, initial: "" }),
      activeId: new fields.StringField({ required: true, blank: true, initial: "" }),
      condition: new fields.StringField({ required: true, blank: true, initial: "" }),
    }),
    /**
     * A grimoire (pp. 39, 56-57): a recipe for one ritual, or a collection
     * of several, each with its own bonus. A ritual is remembered by its
     * definition, so a changed ritual is not the one the book teaches.
     */
    grimoire: new fields.SchemaField({
      rituals: new fields.ArrayField(
        new fields.SchemaField({
          ritual: new fields.StringField({ required: true, blank: true, initial: "" }),
          identity: new fields.StringField({ required: true, blank: true, initial: "" }),
          bonus: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2, min: 0, max: 10 }),
        }),
        { required: true, initial: [] },
      ),
      /** The ancient tongue it is written in; blank for a book in a living language. */
      deadLanguage: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** A translation's comprehension, for a reader who does not know the language. */
      translation: new fields.StringField({ required: true, blank: false, initial: "none", choices: ["none", "broken", "accented", "native"] }),
      encrypted: new fields.BooleanField({ initial: false }),
      decoded: new fields.BooleanField({ initial: false }),
    }),
  });
}

/** This module's data on a character, with nothing missing. */
export function casterData(actor: any): CasterData {
  const data = actor?.system?.extensions?.[MODULE_ID]?.ritualPath ?? {};
  return {
    manaReserve: Math.max(0, Number(data.manaReserve ?? 0) || 0),
    active: Array.isArray(data.active) ? data.active.map((r: RitualInEffect) => ({ ...r })) : [],
  };
}

/** This module's data on equipment, with nothing missing. */
export function equipmentData(item: any): EquipmentData {
  const data = item?.system?.extensions?.[MODULE_ID] ?? {};
  const charm = data.charm ?? {};
  const grimoire = data.grimoire ?? {};
  return {
    charm: {
      ritual: String(charm.ritual ?? ""),
      margin: Number(charm.margin ?? 0) || 0,
      casterUuid: String(charm.casterUuid ?? ""),
      activeId: String(charm.activeId ?? ""),
      condition: String(charm.condition ?? ""),
    },
    grimoire: {
      rituals: Array.isArray(grimoire.rituals) ? grimoire.rituals.map((r: any) => ({ ritual: String(r.ritual ?? ""), identity: String(r.identity ?? ""), bonus: Number(r.bonus ?? 0) || 0 })) : [],
      deadLanguage: String(grimoire.deadLanguage ?? ""),
      translation: (["none", "broken", "accented", "native"].includes(grimoire.translation) ? grimoire.translation : "none"),
      encrypted: Boolean(grimoire.encrypted),
      decoded: Boolean(grimoire.decoded),
    },
  };
}

/** Writes a character's rituals in effect. */
export function storeActive(actor: any, active: RitualInEffect[]): Promise<unknown> {
  return actor.update({ [`system.extensions.${MODULE_ID}.ritualPath.active`]: active });
}

/** Writes what is in a character's mana reserve. */
export function storeReserve(actor: any, value: number): Promise<unknown> {
  return actor.update({ [`system.extensions.${MODULE_ID}.ritualPath.manaReserve`]: Math.max(0, Math.floor(value)) });
}

/** Writes a charm onto equipment. */
export function storeCharm(item: any, charm: EquipmentData["charm"]): Promise<unknown> {
  return item.update({ [`system.extensions.${MODULE_ID}.charm`]: charm });
}

/** Writes a grimoire onto equipment. */
export function storeGrimoire(item: any, grimoire: EquipmentData["grimoire"]): Promise<unknown> {
  return item.update({ [`system.extensions.${MODULE_ID}.grimoire`]: grimoire });
}

/** A charm's field emptied: an ordinary object again. */
export const NO_CHARM: EquipmentData["charm"] = { ritual: "", margin: 0, casterUuid: "", activeId: "", condition: "" };
