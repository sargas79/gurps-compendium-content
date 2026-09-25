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
 *     improvised equipment; a row action that rolls an appliance's burn at a
 *     touch (an early resistance wire heater's 1d-3 a second, the induction
 *     furnace's molten metal 3d at first contact); a GM tool that rolls Forensics to reconstruct
 *     shredded documents, -5 for a cross-cut shredder's; a shopvac's row
 *     action that marks the scene cleaned, -2 to Forensics rolls there after;
 *     an electromagnet's ST, the most it holds and the reach of its pull, from
 *     its core and size; remote control priced at +10%; and an emergency stop
 *     whose row action shuts the machine down with an equipment failure roll
 *     (`items.equipmentFailure`); row actions that print a picture on Artist
 *     with the printer's resolution (dot matrix -5, laser +1), scan an
 *     artistic image on a flatbed scanner at -2 to Electronics Operation
 *     (Media), and make a part on a 3D printer with Machinist or Artist
 *     (Sculpting), -2 until familiar with it (HT:EE pp. 23-24, 33).
 *   - **Power tools (powerTools):** a derived work row for the supplement's
 *     power drills, circular saws (with a diamond blade's divisor against
 *     concrete and brick), arc welder, hot plate, soldering irons and wire
 *     cutters (a cut each use), with
 *     Forced Entry as High-Tech's forced-entry tools have (High-Tech pp.
 *     25-30); an early drill's -2. The weapon-table rows the supplement gives
 *     some of them (HT:EE pp. 50-51) are the records' own attacks; a circular
 *     saw's blow that cripples an arm or leg amputates it, a permanent
 *     crippling on the victim's sheet (`actors.cripple`, note [5]).
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
  amputatesAt,
  MAGNET_CORES,
  REMOTE_CONTROL_PRICE,
  SHREDDED,
  SUPERCONDUCTING_TL,
  VACUUMED_SCENE,
  WEATHER_APPLIANCES,
  applianceHazardOf,
  hazardApplies,
  FLATBED_SCANNER,
  PRINT_3D_SKILLS,
  UNFAMILIAR,
  is3dPrinter,
  isFlatbedScanner,
  isShopvac,
  isShredder,
  printerModifier,
  kitchenGearOf,
  kitchenModifier,
  kitchenSkillOf,
  magnetFigures,
  powerToolOf,
  powerToolWork,
  printedMagnet,
  weatherApplianceOf,
  type ApplianceHazard,
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
  const pace = game.i18n.localize(work.every === 0 ? "GCC.HT.Tools.PerUse" : "GCC.HT.Tools.PerSecond");
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
    const hazard = applianceHazardOf(item.name);
    if (hazardApplies(hazard, data.earlyModel)) lines.push(F(hazard.perSecond ? "HazardLinePerSecond" : "HazardLine", { damage: hazard.damage }));
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
    early: tool?.earlyPenalty
      ? { checked: data.earlyModel, hint: L("EarlyHint") }
      : appliances && applianceHazardOf(item?.name)?.earlyOnly ? { checked: data.earlyModel, hint: L("EarlyHeaterHint") } : null,
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

// ── hazards (HT:EE p. 21) ──

/** The hazard an appliance is, where it applies: an early heater's screening, a furnace's molten metal. */
export function hazardOf(item: any): ApplianceHazard | null {
  if (!isDevice(item)) return null;
  const hazard = applianceHazardOf(item?.name);
  return hazardApplies(hazard, deviceData(item).earlyModel) ? hazard : null;
}

/** Rolls what the appliance does to whoever touches it, as a damage card to apply (HT:EE p. 21). */
export async function applianceHazard(api: GWorldApi, item: any, actor: any): Promise<void> {
  const hazard = hazardOf(item);
  if (!hazard) return;
  const label = F(hazard.perSecond ? "HazardPerSecond" : "HazardLabel", { name: String(item.name ?? "") });
  await api.roll.damage({ actor, item, label, formula: hazard.damage, damageType: "burn" as never, source: "applianceHazard" } as any);
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

// ── printing and scanning (HT:EE pp. 23-24, 33) ──

/** A character's best of some skills, each at its own default where it isn't known. */
function bestOf(api: GWorldApi, actor: any, skills: ReadonlyArray<{ skill: string; attribute: "IQ" | "DX"; default: number }>): { skill: string; level: number } {
  const levels = skills.map((s) => ({ skill: s.skill, level: api.actors.skillLevel(actor, s.skill) ?? (Number(api.actors.attribute(actor, s.attribute)) || 10) + s.default }));
  return levels.sort((a, b) => b.level - a.level)[0]!;
}

/** Makes a model or a part on a 3D printer: Machinist or Artist (Sculpting), -2 until familiar (HT:EE p. 24). */
export async function print3d(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const best = bestOf(api, actor, PRINT_3D_SKILLS);
  const familiar = api.actors.isFamiliar(actor, String(item.name ?? "")) !== false;
  await api.roll.success({
    actor, base: best.level, skill: best.skill, label: F("PrintLabel", { name: item.name, skill: best.skill }), item,
    modifiers: familiar ? [] : [{ label: L("UnfamiliarMethod"), value: UNFAMILIAR }], tags: ["fabrication"],
  } as any);
}

/** The Artist skills a character knows, for printing a picture; Illustration where none. */
function artistSkills(actor: any): string[] {
  const known = [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^artist\b/i.test(String(i.name ?? ""))).map((i: any) => String(i.name));
  return known.length ? known : ["Artist (Illustration)"];
}

/** Prints a picture: the artist's roll, with the printer's resolution on it (HT:EE pp. 23-24, 33). */
export async function printPicture(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const modifier = printerModifier(item?.name) ?? 0;
  const skills = artistSkills(actor);
  const answer = skills.length === 1 ? { skill: skills[0]! } : await ask<{ skill: string }>(F("PrintPictureTitle", { name: item.name }),
    row(L("ArtistSkill"), `<select name="skill">${skills.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>`),
    (form) => ({ skill: form.querySelector<HTMLSelectElement>("[name=skill]")?.value ?? skills[0]! }));
  if (!answer) return;
  // Artist defaults to IQ-6 (p. B179).
  const base = api.actors.skillLevel(actor, answer.skill) ?? (Number(api.actors.attribute(actor, "IQ")) || 10) - 6;
  await api.roll.success({
    actor, base, skill: answer.skill, label: F("PrintPictureTitle", { name: item.name }), item,
    modifiers: modifier ? [{ label: F("Resolution", { name: item.name }), value: modifier }] : [], tags: ["printing"],
  } as any);
}

/** Scans an artistic image, or one to be enlarged: Electronics Operation (Media) at -2 (HT:EE p. 33). */
export async function scanPicture(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const skill = "Electronics Operation (Media)";
  // Electronics Operation defaults to IQ-5 (p. B189).
  const base = api.actors.skillLevel(actor, skill) ?? (Number(api.actors.attribute(actor, "IQ")) || 10) - 5;
  await api.roll.success({ actor, base, skill, label: F("ScanLabel", { name: item.name }), item, modifiers: [{ label: L("ScanArtLine"), value: FLATBED_SCANNER }], tags: ["scanning"] } as any);
}

// ── amputation (HT:EE p. 51) ──

/** Records a limb a circular saw crippled as lost for good, and says so. */
export async function amputate(api: GWorldApi, actor: any, location: string, item: any): Promise<void> {
  const part = await api.actors.cripple(actor, location, { duration: "permanent", label: F("AmputatedLabel", { name: String(item?.name ?? "") }) } as any);
  if (part) await card(actor, String(item?.name ?? ""), [F("Amputated", { name: actor?.name ?? "", location: L(`Limb.${location}`) })]);
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
    key: "ee-appliance-hazard",
    itemTypes: ["equipment"],
    label: L("HazardAction"),
    icon: "fa-solid fa-fire",
    visible: (item) => on.appliances() && hazardOf(item) !== null,
    run: (item, actor) => { void applianceHazard(api, item, actor); },
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

  const printing: Array<{ key: string; label: string; icon: string; visible: (item: any) => boolean; run: (item: any, actor: any) => Promise<void> }> = [
    { key: "ee-3d-print", label: L("PrintAction"), icon: "fa-solid fa-cube", visible: (item) => is3dPrinter(item?.name), run: (item, actor) => print3d(api, item, actor) },
    { key: "ee-print-picture", label: L("PrintPictureAction"), icon: "fa-solid fa-print", visible: (item) => printerModifier(item?.name) !== null, run: (item, actor) => printPicture(api, item, actor) },
    { key: "ee-scan-picture", label: L("ScanAction"), icon: "fa-solid fa-image", visible: (item) => isFlatbedScanner(item?.name), run: (item, actor) => scanPicture(api, item, actor) },
  ];
  for (const action of printing) {
    api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action, visible: (item: any) => on.appliances() && isDevice(item) && action.visible(item), run: (item: any, actor: any) => { void action.run(item, actor); } });
  }

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ee-shredded",
    label: L("ShreddedTitle"),
    icon: "fa-solid fa-scroll",
    visible: on.appliances,
    open: () => reconstructShredding(api),
  } as any);

  // ── power tools (HT:EE pp. 14, 21, 24) ──

  // A circular saw's blow that cripples a limb amputates it (HT:EE p. 51, note [5]): lost for good.
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const actor = context?.actor;
    const result = context?.result;
    if (!on.powerTools() || !actor?.isOwner || !result?.crippled || context.mode?.ranged === true) return;
    if (!amputatesAt(context.item?.name, result.hitLocation)) return;
    void amputate(api, actor, String(result.hitLocation), context.item);
  });
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

