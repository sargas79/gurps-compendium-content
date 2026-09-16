/**
 * GURPS Ultra-Tech's beam weapon options and heat, registered with the system
 * through the add-on API (pp. 132-133).
 *
 *   - **init:** how a beam weapon was built: field-jacketed, FTL, and its
 *     levels of gravitic focus.
 *   - **ready (beamOptions):** the price those add; a field-jacketed or FTL
 *     beam ignoring the environment the beamWeapons switch applies; gravitic
 *     focus halving damage for ten times the range, a level at a time; an FTL
 *     beam's 1/2D at its Max; and an item sheet section.
 *   - **ready (hotshots):** shots fired counted as heat on the weapon, an
 *     overheated beam's malfunction number until it cools, and a hotshot attack
 *     option that spends two shots for a point more damage per die at Malf. 14.
 */

import { HOTSHOT_RADIUS } from "./rules.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  GRAV_FOCUSABLE,
  NO_BEAM_OPTIONS,
  afterFiring,
  beamOptionFactor,
  diceIn,
  gravFocused,
  heatLimit,
  heatMalfunction,
  hotshotResistPenalty,
  ignoresEnvironment,
  isGatling,
  isOverheated,
  maxGravFocus,
  type BeamOptions,
  type Heat,
} from "./options.js";
import { beamFamily, type BeamFamily } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.BeamOptions.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.BeamOptions.${key}`, data);

const FIELD = "beamOption";
const HEAT_FLAG = "heat";
const HOTSHOT_OPTION = "ut-hotshot";

export function initBeamOptions(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      fieldJacket: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "free", "doubled"] }),
      ftl: new f.BooleanField({ initial: false }),
      gravFocus: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 3 }),
      gravFocusOn: new f.BooleanField({ initial: true }),
    }),
  });
}

function familyOf(item: any): BeamFamily | null {
  return item?.type === "equipment" ? beamFamily(String(item.name ?? "")) : null;
}

function itemTl(item: any): number | null {
  const m = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return m ? Number(m[0]) : null;
}

/** How a beam weapon was built, with nothing missing. */
export function beamOptionsOf(item: any): BeamOptions {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    fieldJacket: d.fieldJacket === "free" || d.fieldJacket === "doubled" ? d.fieldJacket : NO_BEAM_OPTIONS.fieldJacket,
    ftl: d.ftl === true,
    gravFocus: Math.max(0, Math.min(3, Math.floor(Number(d.gravFocus) || 0))),
    gravFocusOn: d.gravFocusOn !== false,
  };
}

/** A weapon's heat, as kept in this module's flag on it. */
function heatOf(item: any): Heat {
  const h = item?.flags?.[MODULE_ID]?.[HEAT_FLAG] ?? {};
  return { shots: Math.max(0, Math.floor(Number(h.shots) || 0)), lastShot: Number.isFinite(Number(h.lastShot)) && h.lastShot !== null ? Number(h.lastShot) : null };
}

function now(): number {
  return Number(game.time?.worldTime) || 0;
}

/** The weapon's first ranged mode's RoF, which sets how much heat it takes. */
function rateOfFire(item: any): number {
  return Number(item?.system?.rangedModes?.[0]?.rateOfFire) || 1;
}

function overheated(item: any): boolean {
  return isOverheated(heatOf(item), heatLimit(rateOfFire(item)), now());
}

/** Whether a weapon builds heat and fires hotshots: a beam, not a Gatling, not a cartridge plasma gun (p. 133). */
function heats(item: any): boolean {
  const family = familyOf(item);
  return Boolean(family) && family !== "plasma" && family !== "flamer" && !isGatling(String(item?.name ?? ""));
}

function itemContext(item: any): Record<string, unknown> {
  const family = familyOf(item)!;
  const options = beamOptionsOf(item);
  const heat = heatOf(item);
  const limit = heatLimit(rateOfFire(item));
  return {
    options,
    jackets: [["", "JacketNone"], ["free", "JacketFree"], ["doubled", "JacketDoubled"]].map(([value, key]) => ({ value, label: L(key!), selected: options.fieldJacket === value })),
    focusAllowed: GRAV_FOCUSABLE.has(family) && maxGravFocus(itemTl(item)) > 0,
    focusMax: maxGravFocus(itemTl(item)),
    cost: F("Cost", { factor: beamOptionFactor(options) }),
    heat: heats(item) ? F(overheated(item) ? "HeatOver" : "Heat", { shots: heat.shots, limit }) : "",
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-beam-option]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtBeamOption);
      if (field === "ftl" || field === "gravFocusOn") await item.update({ [`${path}.${field}`]: (input as HTMLInputElement).checked });
      else if (field === "gravFocus") await item.update({ [`${path}.gravFocus`]: Math.max(0, Math.min(maxGravFocus(itemTl(item)), Math.floor(Number(input.value) || 0))) });
      else if (field === "fieldJacket") await item.update({ [`${path}.fieldJacket`]: input.value });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-ut-cool]").forEach((button) => {
    button.addEventListener("click", () => item.update({ [`flags.${MODULE_ID}.${HEAT_FLAG}`]: { shots: 0, lastShot: null } }));
  });
}

/** Whether a beam ignores the environment, for the beamWeapons rows. */
export function beamIgnoresEnvironment(on: () => boolean): (item: any) => boolean {
  return (item) => on() && ignoresEnvironment(beamOptionsOf(item));
}

export function readyBeamOptions(api: GWorldApi, switches: { options: () => boolean; hotshots: () => boolean }): void {
  const { options: on, hotshots } = switches;

  // Field-jacketing at twice the cost where the GM charges for it; each level of focus doubles it (p. 133).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-beam-options",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on() || !familyOf(item)) return null;
      const factor = beamOptionFactor(beamOptionsOf(item));
      return factor === 1 ? null : { cost: Math.round(price.cost * factor * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-beam-options-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-beam-options.hbs`,
    visible: (item) => (on() || hotshots()) && Boolean(familyOf(item)),
    context: (item) => ({ ...itemContext(item), optionsOn: on(), hotshotsOn: hotshots() }),
    listeners: (element, item) => itemListeners(element, item),
  });

  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    const family = familyOf(item);
    if (!family) return;
    const options = beamOptionsOf(item);
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      if (on()) {
        // Gravitic focus: half the damage for ten times the range, a level at a time (p. 133).
        const levels = GRAV_FOCUSABLE.has(family) && options.gravFocusOn ? Math.min(options.gravFocus, maxGravFocus(itemTl(item))) : 0;
        if (levels) {
          const focused = gravFocused({ damage: String(row.damage ?? ""), halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 }, levels);
          if (!row.affliction) row.damage = focused.damage;
          row.halfDamageRange = focused.halfDamageRange;
          row.maxRange = focused.maxRange;
          row.notes.push({ label: F("Focus", { levels }), hint: L("FocusHint") });
        }
        // An FTL beam's 1/2D is its Max (p. 133).
        if (options.ftl) {
          if (row.halfDamageRange) row.halfDamageRange = row.maxRange;
          row.notes.push({ label: L("Ftl"), hint: L("FtlHint") });
        }
        if (options.fieldJacket) row.notes.push({ label: L("Jacketed"), hint: L("JacketedHint") });
      }
      // An overheated beam malfunctions on 14 until it has cooled for a minute (p. 133).
      if (hotshots() && heats(item) && overheated(item)) {
        const malf = heatMalfunction(true, false)!;
        row.malfunction = row.malfunction === null || row.malfunction === undefined ? malf : Math.min(Number(row.malfunction) || malf, malf);
        row.notes.push({ label: L("Overheated"), hint: L("OverheatedHint") });
      }
    }
  });

  // Shots fired are heat: read off the count the system keeps as it falls (p. 133).
  Hooks.on("preUpdateItem", (item: any, changes: any) => {
    if (!hotshots() || !heats(item)) return;
    const modes = foundry.utils.getProperty(changes, "system.rangedModes");
    if (!Array.isArray(modes)) return;
    const was: any[] = item.system?.rangedModes ?? [];
    const fired = Math.max(0, ...modes.map((mode: any, i: number) => (Number(was[i]?.loaded) || 0) - (Number(mode?.loaded) || 0)));
    if (!fired) return;
    const heat = afterFiring(heatOf(item), fired, heatLimit(rateOfFire(item)), now());
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${HEAT_FLAG}`, heat);
  });

  // A hotshot: two shots, a point more damage per die (or a deeper resistance penalty), Malf. 14 -- 12 overheated (p. 133).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: HOTSHOT_OPTION,
    label: L("Hotshot.Label"),
    available: (context: any) => hotshots() && Boolean(context?.ranged) && heats(context?.item),
    apply: (context: any) => {
      const mode = context.item?.system?.rangedModes?.[Number(context.mode?.index) || 0];
      const dice = mode?.affliction ? 0 : diceIn(String(mode?.damageFormula ?? ""));
      return {
        shots: 1,
        malfunction: heatMalfunction(overheated(context.item), true),
        ...(dice ? { damageModifiers: [{ label: L("Hotshot.Damage"), value: dice }] } : {}),
        notes: [L("Hotshot.Note"), ...(Number(mode?.radius) > 0 ? [F("Hotshot.Radius", { radius: Math.round(Number(mode.radius) * HOTSHOT_RADIUS * 10) / 10 })] : [])],
      };
    },
  } as any);
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!hotshots() || !heats(context?.item) || !context.item?.isOwner) return;
    const hotshot = context.options?.[`${MODULE_ID}.${HOTSHOT_OPTION}`] === true;
    void api.combat.setWeaponState(context.item, MODULE_ID, { hotshot });
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!hotshots() || !context?.tags?.includes?.("resist") || !heats(context.attack?.item)) return;
    const state = (api.combat.getWeaponState(context.attack.item, MODULE_ID) as any) ?? {};
    if (state.hotshot !== true) return;
    const mode = context.attack.item.system?.rangedModes?.[Number(context.attack.mode?.index) || 0];
    const extra = hotshotResistPenalty(Number(mode?.afflictionModifier) || 0);
    if (extra) context.modifiers.push({ label: L("Hotshot.Resist"), value: extra });
  });
}
