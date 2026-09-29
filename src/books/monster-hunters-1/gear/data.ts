/**
 * Where Monster Hunters 1's gear keeps its data (pp. 53-54, 59-61, 63),
 * ported from the fields the system kept on equipment and armour.
 *
 * Improvements stay fields that reprice the item, never items of their own.
 * The list figures are the system's where it keeps them (a weapon's list
 * price), and this module's otherwise. Since the Basic Set Revised's
 * equipment modifiers (p. 342; API 1.187.0) Balanced, Cutting-Edge,
 * Disguised and Rugged are the system's calculated fields, which the item
 * sheet sets and `rules.pricingOf` prices; this book reads them from there
 * (`gearData`). The copies this module kept before are read only by the
 * migration that carries them over (`../../../shared/system-fields.ts`),
 * and the flag for Signature Gear is the system's `system.signature` too.
 * What stays this module's: Cutting-Edge and Rugged on clothing (the system
 * offers them on equipment only), Scent-Masking, Undercover, the weapon
 * options the Basic Set has no field for, and the book's own pricing.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import type { GadgetImprovements } from "./gadgets.js";
import { PAYLOAD_OPTIONS, POWDER_OPTIONS, type AmmunitionLoad, type PayloadOption, type PowderOption } from "./special-ammunition.js";
import type { WeaponImprovements } from "./weapon-improvements.js";

/** The item types this module keeps data on. */
export const ITEM_TYPES = ITEM_EXTENSION_TYPES;

/** One ranged mode's special load, by the mode's index. */
export interface StoredLoad extends AmmunitionLoad {
  mode: number;
  powderAdjust: number;
  payloadAdjust: number;
  /** An empty magazine or speedloader's price, which the load's CF does not touch (p. 63). */
  magazineCost: number;
}

/** What this module keeps on a piece of gear. */
export interface GearData {
  listCost: number;
  listWeight: number;
  gadget: Required<GadgetImprovements>;
  holdout: number;
  signature: boolean;
  weapon: Required<Omit<WeaponImprovements, "holy">>;
  improvisedPenalty: number;
  loads: StoredLoad[];
}

/** Adds the gear fields to this module's data on equipment and armour. */
export function registerGearData(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_TYPES, {
    /** The table's price and weight, before improvements; zero to read them off the item (p. 54). */
    listCost: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    listWeight: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /** A gadget's or an article of clothing's improvements (pp. 53-54, 59); Cutting-Edge, Disguised and Rugged on gadgets are the system's fields now, and these copies wait for the migration. */
    gadget: new f.SchemaField({
      cuttingEdge: flag(),
      disguised: flag(),
      rugged: flag(),
      scentMasking: flag(),
      /** Undercover's Holdout bonus, +1 or +2; zero for none. */
      undercover: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 2 }),
    }),
    /** The Holdout bonus the article gives of itself: a long coat's +4 (p. 59). */
    holdout: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    /** Bought with Signature Gear rather than cash (p. 53): the system's `signature` flag now, this copy waits for the migration. */
    signature: flag(),
    /** A weapon's cost-factor options (pp. 59-61); its grade and material, and Balanced and Disguised, are the system's fields (balanced and disguised here wait for the migration). */
    weapon: new f.SchemaField({
      balanced: flag(),
      disguised: flag(),
      titanium: flag(),
      weighted: flag(),
      compound: flag(),
    }),
    /** An improvised weapon's skill penalty: a pool cue is Broadsword-1 (p. 60). */
    improvisedPenalty: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
    /** Special ammunition (p. 63), one load per ranged mode. */
    loads: new f.ArrayField(
      new f.SchemaField({
        mode: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        powder: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...POWDER_OPTIONS] }),
        payload: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...PAYLOAD_OPTIONS] }),
        powderAdjust: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: -2, max: 2 }),
        payloadAdjust: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: -2, max: 2 }),
        magazineCost: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      }),
      { required: true, initial: [] },
    ),
  });
}

/** This module's gear data on an item, with nothing missing. */
export function gearData(item: any): GearData {
  const d = item?.system?.extensions?.[MODULE_ID] ?? {};
  const g = d.gadget ?? {};
  const w = d.weapon ?? {};
  const sys = item?.system ?? {};
  // Cutting-Edge and Rugged are the system's on equipment and this book's on clothing, which the system doesn't offer them on.
  const clothing = item?.type === "armor";
  return {
    listCost: Math.max(0, Number(d.listCost) || 0),
    listWeight: Math.max(0, Number(d.listWeight) || 0),
    gadget: {
      cuttingEdge: clothing ? Boolean(g.cuttingEdge) : Boolean(sys.cuttingEdge),
      disguised: Boolean(sys.disguised),
      rugged: clothing ? Boolean(g.rugged) : Boolean(sys.rugged),
      scentMasking: Boolean(g.scentMasking),
      undercover: Math.max(0, Math.min(2, Math.floor(Number(g.undercover) || 0))),
    },
    holdout: Math.max(0, Math.floor(Number(d.holdout) || 0)),
    signature: Boolean(sys.signature),
    weapon: {
      balanced: Boolean(sys.balanced),
      disguised: Boolean(sys.disguised),
      titanium: Boolean(w.titanium),
      weighted: Boolean(w.weighted),
      compound: Boolean(w.compound),
    },
    improvisedPenalty: Math.min(0, Math.floor(Number(d.improvisedPenalty) || 0)),
    loads: (Array.isArray(d.loads) ? d.loads : []).map((l: any) => ({
      mode: Math.max(0, Math.floor(Number(l.mode) || 0)),
      powder: (String(l.powder ?? "") as PowderOption),
      payload: (String(l.payload ?? "") as PayloadOption),
      powderAdjust: Number(l.powderAdjust) || 0,
      payloadAdjust: Number(l.payloadAdjust) || 0,
      magazineCost: Math.max(0, Number(l.magazineCost) || 0),
    })),
  };
}

/** A ranged mode's load, or an empty one. */
export function loadFor(data: GearData, mode: number): StoredLoad {
  return data.loads.find((l) => l.mode === mode) ?? { mode, powder: "", payload: "", powderAdjust: 0, payloadAdjust: 0, magazineCost: 0 };
}

/**
 * The gadget options as this module stores them: what the system owns is read
 * from its fields and never written back here, so the migration's copies of
 * them stay cleared.
 */
export function ownGadget(item: any, gadget: GearData["gadget"]): GearData["gadget"] {
  const clothing = item?.type === "armor";
  return { ...gadget, disguised: false, cuttingEdge: clothing && gadget.cuttingEdge, rugged: clothing && gadget.rugged };
}

/** The weapon options as this module stores them: Balanced and Disguised are the system's. */
export function ownWeapon(weapon: GearData["weapon"]): GearData["weapon"] {
  return { ...weapon, balanced: false, disguised: false };
}

/**
 * Writes one of the options the system owns, to the system's field: Balanced,
 * Disguised, Cutting-Edge and Rugged (Basic Set Revised p. 342), and Signature
 * Gear's flag. Cutting-Edge and Rugged on clothing, which the system doesn't
 * offer them on, are this module's. Returns whether it was written.
 */
export function storeSystemOption(item: any, key: string, value: boolean): Promise<unknown> | null {
  const own = item?.type === "armor" && (key === "cuttingEdge" || key === "rugged");
  if (own) return storeGear(item, { gadget: ownGadget(item, { ...gearData(item).gadget, [key]: value }) });
  if (["balanced", "disguised", "cuttingEdge", "rugged", "signature"].includes(key)) return item.update({ [`system.${key}`]: value });
  return null;
}

/** Writes part of this module's gear data. */
export function storeGear(item: any, patch: Partial<GearData>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${key}`, value])));
}
