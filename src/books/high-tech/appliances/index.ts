/**
 * Appliances and power tools from the supplement Electricity and Electronics
 * (HT:EE pp. 14, 20-25), registered with the system through the add-on API
 * under two of High-Tech's switches. The rules are in `rules.ts`; what a
 * record is comes from its name, what the GM says about it from the `device`
 * data (#490), and whether it is in use from its being equipped.
 *
 *   - **Electric appliances (electricAppliances):** a heater or fan in use
 *     adds to HT against the cold or the heat, as pieces of High-Tech's
 *     climate-control table under this switch (`src/shared/climate`); kitchen
 *     gear in use is the equipment line on Cooking and Housekeeping
 *     (`gworld.skillBonuses`): a microwave oven's -2 and -1, an induction
 *     cooker's +1 (-2 more until the cook is familiar with it), a hot plate's
 *     improvised equipment; a GM tool that rolls Forensics to reconstruct
 *     shredded documents, -5 for a cross-cut shredder's; a shopvac's row
 *     action that marks the scene cleaned, -2 to Forensics rolls there after;
 *     an electromagnet's ST, the most it holds and the reach of its pull, from
 *     its core and size; remote control priced at +10%; and an emergency stop
 *     whose row action shuts the machine down with an equipment failure roll
 *     (`items.equipmentFailure`).
 *   - **Power tools (powerTools):** a derived work row for the supplement's
 *     power drills, circular saws (with a diamond blade's divisor against
 *     concrete and brick), arc welder, hot plate and soldering irons, with
 *     Forced Entry as High-Tech's forced-entry tools have (High-Tech pp.
 *     25-30); an early drill's -2. The weapon-table rows the supplement gives
 *     some of them (HT:EE pp. 50-51) are the records' own attacks.
 *
 * These read the supplement's records (decision E1 in #471), and gear that
 * names no book by the same names. A High-Tech record with forced-entry work
 * of its own (High-Tech's own power drill and circular saw) keeps that row.
 */

import type { ClimateGear } from "../../../shared/climate/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, esc, picked, row, worn } from "../../../shared/sensors/index.js";
import { deviceData, isDevice, storeDevice } from "../devices/index.js";
import { toolData } from "../tools/index.js";
import { workDamage, type Work } from "../tools/rules.js";
import {
  EMERGENCY_STOP_PER,
  MAGNET_CORES,
  REMOTE_CONTROL_PRICE,
  SHREDDED,
  SUPERCONDUCTING_TL,
  VACUUMED_SCENE,
  WEATHER_APPLIANCES,
  isShopvac,
  isShredder,
  kitchenGearOf,
  kitchenModifier,
  kitchenSkillOf,
  magnetFigures,
  powerToolOf,
  powerToolWork,
  printedMagnet,
  weatherApplianceOf,
  type KitchenSkill,
  type Magnet,
  type Shredding,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Appliances.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Appliances.${key}`, data);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** A scene cleaned with a shopvac: a flag on the scene. */
export const VACUUMED_FLAG = "eeVacuumed";

const WORK_MODE = "ee-power-tool-work";

/** Forensics is IQ/Hard: IQ-6 unlearned (Characters p. 196). */
const FORENSICS_DEFAULT = -6;

export interface ApplianceSwitches {
  appliances: () => boolean;
  powerTools: () => boolean;
}

/**
 * The supplement's heaters and fans, as pieces of High-Tech's climate-control
 * table that need this switch: no degrees on the comfort zone, a bonus to the
 * HT roll while in use and, for one on batteries, while they last.
 */
export function applianceClimateGear(rule: string): ClimateGear[] {
  return WEATHER_APPLIANCES.map((a) => ({
    pattern: a.pattern,
    zone: { coldF: 0, heatF: 0 },
    powered: true,
    rule,
    resist: { ...(a.cold ? { cold: a.cold } : {}), ...(a.heat ? { heat: a.heat } : {}) },
  }));
}

/** Whether an item runs on electricity, as its record's power says. */
export function isElectrical(item: any): boolean {
  if (!isDevice(item)) return false;
  const power = item?.system?.extensions?.[MODULE_ID]?.power ?? {};
  return Boolean(String(power.raw ?? "").trim() || power.draw || power.rechargeable);
}

/** The magnet an item is: the GM's figures where a core is set, else the record's by name. */
export function magnetOf(item: any): Magnet | null {
  if (!isDevice(item)) return null;
  const stated = deviceData(item).magnet;
  if (stated.core) return { core: stated.core, diameter: stated.diameter, length: stated.length };
  return printedMagnet(item?.name);
}

const mayBeMagnet = (item: any) => isDevice(item) && (magnetOf(item) !== null || /electromagnet/i.test(String(item?.name ?? "")));

/** The power tool an item is, where it has no forced-entry work of its own. */
export function powerToolFor(item: any): ReturnType<typeof powerToolOf> {
  if (!isDevice(item) || toolData(item).work) return null;
  return powerToolOf(item?.name);
}

/** The work a power tool does, with its blade. */
export function workOf(item: any): Work | null {
  const tool = powerToolFor(item);
  return tool ? powerToolWork(tool, deviceData(item).diamondBlade) : null;
}

const paceLabel = (work: Work) => {
  const pace = game.i18n.localize("GCC.HT.Tools.PerSecond");
  return work.against ? game.i18n.format("GCC.HT.Tools.WorkAgainst", { pace, against: game.i18n.localize(`GCC.HT.Tools.Against.${work.against}`) }) : pace;
};

// ── kitchen gear (HT:EE p. 21) ──

/**
 * The best line the kitchen gear in use gives a skill, or null: what the
 * cook uses is the equipment on the roll.
 */
export function kitchenLine(api: GWorldApi, actor: any, skill: KitchenSkill): { value: number; name: string } | null {
  let best: { value: number; name: string } | null = null;
  const improvised = Number(api.rules.toolModifier("improvised" as never, null, { technological: false })) || -2;
  for (const item of [...(actor?.items ?? [])]) {
    if (!worn(item) || !isDevice(item)) continue;
    const gear = kitchenGearOf(item.name);
    if (!gear) continue;
    const familiar = gear.unfamiliar ? api.actors.isFamiliar(actor, String(item.name)) !== false : true;
    const value = kitchenModifier(gear, skill, { familiar, improvised });
    if (!best || value > best.value) best = { value, name: String(item.name) };
  }
  return best;
}

// ── the item sheet ──

function itemLines(api: GWorldApi, item: any, on: ApplianceSwitches): string[] {
  const lines: string[] = [];
  if (!isDevice(item)) return lines;
  const data = deviceData(item);
  if (on.appliances()) {
    const weather = weatherApplianceOf(item.name);
    if (weather?.cold) lines.push(F("HeaterLine", { bonus: signed(weather.cold) }));
    if (weather?.heat) lines.push(F("FanLine", { bonus: signed(weather.heat) }));
    const kitchen = kitchenGearOf(item.name);
    if (kitchen) {
      const text = (skill: KitchenSkill) => (kitchen.skills[skill] === "improvised" ? L("Improvised") : signed(kitchen.skills[skill] as number));
      lines.push(F("KitchenLine", { cooking: text("Cooking"), housekeeping: text("Housekeeping") }));
      if (kitchen.unfamiliar) lines.push(L("UnfamiliarLine"));
    }
    if (isShredder(item.name)) lines.push(F("ShredderLine", { penalty: SHREDDED.crosscut }));
    if (isShopvac(item.name)) lines.push(F("ShopvacLine", { penalty: VACUUMED_SCENE }));
    const magnet = magnetOf(item);
    if (magnet) {
      const figures = magnetFigures(magnet, (st) => Number(api.rules.basicLift(st)) || 0);
      lines.push(F("MagnetLine", { st: figures.st, bl: figures.basicLift, load: figures.load.toLocaleString("en-US"), reach: figures.reach }));
      if (magnet.core === "superconducting") lines.push(F("SuperconductingLine", { tl: SUPERCONDUCTING_TL }));
    }
    if (data.remoteControl) lines.push(L("RemoteLine"));
    if (data.emergencyStop) lines.push(F("EmergencyStopLine", { per: signed(EMERGENCY_STOP_PER) }));
  }
  if (on.powerTools()) {
    const tool = powerToolFor(item);
    if (tool) {
      const work = powerToolWork(tool, data.diamondBlade);
      lines.push(F("WorkLine", { damage: work.damage, divisor: work.divisor !== 1 ? `(${work.divisor})` : "", type: work.type, pace: paceLabel(work) }));
      if (tool.earlyPenalty && data.earlyModel) lines.push(F("EarlyLine", { penalty: tool.earlyPenalty }));
    }
  }
  return lines;
}

function itemContext(api: GWorldApi, item: any, on: ApplianceSwitches): Record<string, unknown> {
  const data = deviceData(item);
  const appliances = on.appliances();
  const tool = on.powerTools() ? powerToolFor(item) : null;
  const magnet = appliances && mayBeMagnet(item) ? magnetOf(item) : null;
  return {
    editable: Boolean(item?.isOwner ?? true),
    lines: itemLines(api, item, on),
    remote: appliances && isElectrical(item) ? { checked: data.remoteControl } : null,
    stop: appliances && isElectrical(item) ? { checked: data.emergencyStop } : null,
    early: tool?.earlyPenalty ? { checked: data.earlyModel } : null,
    diamond: tool?.diamond ? { checked: data.diamondBlade } : null,
    magnet: appliances && mayBeMagnet(item)
      ? {
          cores: MAGNET_CORES.map((value) => ({ value, label: L(`Core.${value || "record"}`), selected: data.magnet.core === value })),
          diameter: data.magnet.core ? data.magnet.diameter : magnet?.diameter ?? 0,
          length: data.magnet.core ? data.magnet.length : magnet?.length ?? 0,
        }
      : null,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ee-appliance]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.eeAppliance);
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void (await storeDevice(item, { [field]: input.checked }));
      if (field === "magnet.core") {
        const core = String(input.value);
        // Starting from the record's figures, so choosing a core keeps its size.
        const printed = printedMagnet(item?.name);
        const patch: Record<string, unknown> = { "magnet.core": core };
        if (core && !deviceData(item).magnet.core && printed) Object.assign(patch, { "magnet.diameter": printed.diameter, "magnet.length": printed.length });
        return void (await storeDevice(item, patch));
      }
      if (field === "magnet.diameter" || field === "magnet.length") await storeDevice(item, { [field]: Math.max(0, Number(input.value) || 0) });
    });
  });
}

// ── Forensics (HT:EE p. 23) ──

/** The scene the GM is looking at, where a shopvac left its mark. */
function vacuumedScene(): { by: string } | null {
  const flag = (globalThis as any).canvas?.scene?.getFlag?.(MODULE_ID, VACUUMED_FLAG);
  return flag && typeof flag === "object" ? { by: String(flag.by ?? "") } : null;
}

/** Marks the scene cleaned with the shopvac, or clears the mark; only the GM can change a scene. */
export async function cleanScene(item: any, actor: any): Promise<void> {
  const scene = (globalThis as any).canvas?.scene;
  const title = F("CleanTitle", { name: item.name });
  if (!scene) return void ui.notifications?.warn(L("NoScene"));
  if (!(game as any).user?.isGM) return void (await card(actor, title, [F("CleanAsk", { name: actor?.name ?? "", scene: scene.name })]));
  if (vacuumedScene()) {
    await scene.unsetFlag(MODULE_ID, VACUUMED_FLAG);
    return void (await card(actor, title, [F("CleanCleared", { scene: scene.name })]));
  }
  await scene.setFlag(MODULE_ID, VACUUMED_FLAG, { by: String(item.name ?? "") });
  await card(actor, title, [F("Cleaned", { scene: scene.name, penalty: VACUUMED_SCENE })]);
}

/** The GM's tool: the selected character tries to put shredded documents back together. */
export async function reconstructShredding(api: GWorldApi): Promise<void> {
  const actor = picked().selected;
  if (!actor) return void ui.notifications?.warn(L("SelectInvestigator"));
  const answer = await ask<{ shredding: Shredding }>(L("ShreddedTitle"),
    row(L("ShreddedHow"), `<select name="shredding">${(Object.keys(SHREDDED) as Shredding[]).map((k) => `<option value="${k}">${esc(L(`Shredding.${k}`))}</option>`).join("")}</select>`),
    (form) => ({ shredding: form.querySelector<HTMLSelectElement>("[name=shredding]")?.value === "crosscut" ? "crosscut" : "strips" }));
  if (!answer) return;
  const skill = "Forensics";
  const base = api.actors.skillLevel(actor, skill) ?? (Number(api.actors.attribute(actor, "IQ")) || 10) + FORENSICS_DEFAULT;
  const penalty = SHREDDED[answer.shredding];
  await api.roll.success({ actor, base, skill, label: L("ShreddedTitle"), modifiers: penalty ? [{ label: L("Shredding.crosscut"), value: penalty }] : [], tags: ["shreddedDocuments"] } as any);
}

// ── registration ──

export function readyAppliances(api: GWorldApi, on: ApplianceSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ee-appliances-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ee-appliances-item.hbs`,
    visible: (item) => {
      if (!isDevice(item) || (!on.appliances() && !on.powerTools())) return false;
      const context = itemContext(api, item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.remote || context.magnet || context.early || context.diamond);
    },
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // Kitchen gear in use is the equipment on Cooking and Housekeeping (HT:EE p. 21).
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!on.appliances()) return;
    const skill = kitchenSkillOf(context?.name);
    const found = skill ? kitchenLine(api, context?.actor, skill) : null;
    if (!found) return;
    const reason = F("KitchenReason", { name: found.name });
    const line = (context.lines ?? []).find((l: any) => l?.key === "tools");
    if (line) {
      line.value = found.value;
      line.reason = reason;
    } else if (found.value) context.lines?.push?.({ key: "tools", label: found.name, value: found.value, source: MODULE_ID, reason });
  });

  // Forensics where a shopvac cleaned up (HT:EE p. 23).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.appliances() || !Array.isArray(context?.modifiers) || !/^forensics\b/i.test(String(context.skill ?? ""))) return;
    const scene = vacuumedScene();
    if (scene) context.modifiers.push({ label: F("VacuumedLine", { name: scene.by }), value: VACUUMED_SCENE });
  });

  // Remote control, 10% above standard (HT:EE p. 25).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ee-remote-control",
    types: ["equipment"],
    apply: (item, price) => (on.appliances() && isDevice(item) && deviceData(item).remoteControl
      ? { cost: Math.round(price.cost * REMOTE_CONTROL_PRICE * 100) / 100, weight: price.weight, label: L("RemotePrice") }
      : null),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-emergency-stop",
    itemTypes: ["equipment"],
    label: L("EmergencyStop"),
    icon: "fa-solid fa-power-off",
    visible: (item) => on.appliances() && isDevice(item) && deviceData(item).emergencyStop,
    // A machine stopped in a hurry: HT against equipment failure (HT:EE p. 25; Campaigns p. 485).
    run: (item, actor) => { void api.items.equipmentFailure({ actor, item, label: F("EmergencyStopRoll", { name: item.name }) } as any); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-clean-scene",
    itemTypes: ["equipment"],
    label: L("CleanAction"),
    icon: "fa-solid fa-broom",
    visible: (item) => on.appliances() && isDevice(item) && isShopvac(item.name),
    run: (item, actor) => { void cleanScene(item, actor); },
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ee-shredded",
    label: L("ShreddedTitle"),
    icon: "fa-solid fa-scroll",
    visible: on.appliances,
    open: () => reconstructShredding(api),
  } as any);

  // ── power tools (HT:EE pp. 14, 21, 24) ──
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: WORK_MODE,
    label: L("WorkMode"),
    kind: "melee",
    applies: (item) => on.powerTools() && workOf(item) !== null,
    mode: (item, _actor, helpers: any) => {
      const tool = powerToolFor(item)!;
      const data = deviceData(item);
      const work = powerToolWork(tool, data.diamondBlade);
      const damage = workDamage(work, (base, modifier) => String(helpers.damage?.(base, modifier) ?? ""), false);
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const known = helpers.skillLevel?.("Forced Entry") ?? null;
      const early = tool.earlyPenalty && data.earlyModel ? tool.earlyPenalty : 0;
      const notes = [{ label: paceLabel(work), hint: L("WorkHint") }];
      if (early) notes.push({ label: F("EarlyNote", { penalty: early }), hint: L("EarlyHint") });
      if (data.diamondBlade && tool.diamond) notes.push({ label: L("DiamondNote"), hint: L("DiamondHint") });
      return {
        mode: L("WorkMode"),
        skillName: "Forced Entry",
        skillLevel: (known ?? dx - 5) + early,
        damage,
        damageType: work.type,
        armorDivisor: work.divisor,
        reach: "C",
        parry: null,
        damageRollable: api.rules.parseDiceAdds(damage) !== null,
        notes,
      };
    },
  });
}

