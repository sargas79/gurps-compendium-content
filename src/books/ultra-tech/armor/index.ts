/**
 * GURPS Ultra-Tech's body armour and protective gear, registered with the
 * system through the add-on API (pp. 170-181, 187-190).
 *
 *   - **init:** the choices an armour piece is made with, on armour: tailoring,
 *     transparent bioplas, a reflective helmet, electromagnetic armour, beam
 *     adaptation, reactive paste and living metal.
 *   - **Threat protection:** what worn suits, helmets and masks are in trait
 *     terms, through `gworld.traitEffects` -- a suit's only once the helmet or
 *     mask that seals it is on; an air tank as air for a mask or helmet; don
 *     times and tank hours on the item's sheet; a row action to patch a suit.
 *   - **Laser-resistant armour:** ablative, reflec and retro-reflective armour
 *     at full DR against the beams each resists, through `gworld.armorDr`;
 *     ablative DR worn away by lasers and retro-reflective armour's damage
 *     bounced back, through `gworld.afterDamage`; transparent bioplas no use
 *     against lasers; a reflective helmet; reflec found more easily on radar.
 *   - **Tailored armour:** the builder's coverage, style and cut, pricing the
 *     outfit and refusing it where it doesn't cover the spot struck.
 *   - **Armour systems:** EMA doubling or tripling DR against shaped charges
 *     and plasma, with its uses; beam-adaptive armour tripling it and adapting;
 *     reactive paste and ablative foam as layers of their own; nasal filter
 *     plugs against gas; biomedical sensors for Diagnosis.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { beamFamily, type BeamFamily } from "../beams/rules.js";
import { loadsOf } from "../warheads/index.js";
import {
  ABLATIVE_FOAM,
  BIOMEDICAL,
  BODY_ARMOR_SECONDS,
  COVERAGES,
  COVERAGE_PART_KEYS,
  CUTS,
  REFLECTIVE_HELMET,
  SELF_REPAIR,
  SHAPED_CHARGES,
  STYLES,
  SUIT_PATCH,
  TANK_SECONDS,
  adaptTo,
  adaptivePrice,
  afterDivisor,
  airTankHours,
  airTankSize,
  baseName,
  bouncedDamage,
  bouncesBack,
  canBeTransparent,
  climateTolerance,
  coverageActivation,
  coverageMultiplier,
  coversArc,
  emaMultiplier,
  emaUseSpent,
  foamLeft,
  fullDrAgainst,
  hasBiomedicalSensors,
  isLaser,
  laserArmorKind,
  mindShieldBonus,
  nasalPlugBonus,
  partAt,
  pasteCovers,
  pressureSupportLevel,
  protectionWorn,
  protectiveGear,
  reactivePasteDr,
  reflecDetectionBonus,
  reflectedByHelmet,
  semiAblativeLoss,
  suitPatchPenalty,
  tailoredDr,
  tailoredLc,
  tailoredPrice,
  type Coverage,
  type CoveragePart,
  type Ema,
  type Protection,
  type TailoredCut,
  type TailoredStyle,
  type Tailoring,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Armor.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Armor.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "utArmor";
/** Item flag: what combat has spent on a piece. */
const WEAR_FLAG = "armorWear";
/** Actor flags: ablative foam on the skin, and a suit breach being patched. */
const FOAM_FLAG = "ablativeFoam";
const PATCH_FLAG = "suitPatch";

export interface ArmorSwitches {
  threat: () => boolean;
  laser: () => boolean;
  tailored: () => boolean;
  systems: () => boolean;
}

/** The choices a piece is made with. */
export interface ArmorBuild {
  tailored: boolean;
  coverage: Partial<Record<CoveragePart, Coverage>>;
  style: TailoredStyle;
  cut: TailoredCut;
  transparent: boolean;
  reflective: boolean;
  ema: Ema;
  emaUses: number;
  adaptive: number;
  adaptedTo: string[];
  reactivePaste: boolean;
  pasteTl: number;
  livingMetal: boolean;
}

/** What combat has spent on a piece. */
interface ArmorWear {
  /** Laser DR ablated, by location. */
  laserLost?: Record<string, number>;
  emaUsed?: number;
  /** Reactive paste, by location: detonations so far and the 1d rolled for the next blow. */
  paste?: Record<string, { detonations: number; nextRoll: number }>;
}

/** Registers the armour fields. */
export function initArmor(): void {
  const f = foundry.data.fields as any;
  const coverage = () => new f.StringField({ required: true, nullable: false, blank: false, initial: "full", choices: [...COVERAGES] });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      tailored: new f.BooleanField({ initial: false }),
      coverage: new f.SchemaField(Object.fromEntries(COVERAGE_PART_KEYS.map((part) => [part, coverage()]))),
      style: new f.StringField({ required: true, nullable: false, blank: false, initial: "normal", choices: Object.keys(STYLES) }),
      cut: new f.StringField({ required: true, nullable: false, blank: false, initial: "average", choices: Object.keys(CUTS) }),
      transparent: new f.BooleanField({ initial: false }),
      reflective: new f.BooleanField({ initial: false }),
      ema: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "standard", "laminate"] }),
      emaUses: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
      adaptive: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0, max: 4, integer: true }),
      adaptedTo: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false }), { required: true, initial: [] }),
      reactivePaste: new f.BooleanField({ initial: false }),
      pasteTl: new f.NumberField({ required: true, nullable: false, initial: 10, min: 10, max: 12, integer: true }),
      livingMetal: new f.BooleanField({ initial: false }),
    }),
  });
}

export function armorBuildOf(item: any): ArmorBuild {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const coverage: Partial<Record<CoveragePart, Coverage>> = {};
  for (const part of COVERAGE_PART_KEYS) coverage[part] = COVERAGES.includes(d.coverage?.[part]) ? d.coverage[part] : "full";
  return {
    tailored: d.tailored === true,
    coverage,
    style: d.style in STYLES ? d.style : "normal",
    cut: d.cut in CUTS ? d.cut : "average",
    transparent: d.transparent === true,
    reflective: d.reflective === true,
    ema: d.ema === "standard" || d.ema === "laminate" ? d.ema : "",
    emaUses: Math.max(0, Math.floor(Number(d.emaUses) || 0)),
    adaptive: Math.max(0, Math.min(4, Math.floor(Number(d.adaptive) || 0))),
    adaptedTo: Array.isArray(d.adaptedTo) ? d.adaptedTo.map(String) : [],
    reactivePaste: d.reactivePaste === true,
    pasteTl: Math.max(10, Math.min(12, Math.floor(Number(d.pasteTl) || 10))),
    livingMetal: d.livingMetal === true,
  };
}

const wearOf = (item: any): ArmorWear => item?.getFlag?.(MODULE_ID, WEAR_FLAG) ?? item?.flags?.[MODULE_ID]?.[WEAR_FLAG] ?? {};
const recordArmor = (item: any) => item?.system?.extensions?.[MODULE_ID]?.armor ?? {};
const itemTl = (item: any) => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const isArmor = (item: any) => item?.type === "armor";
const worn = (item: any) => (item?.type === "armor" || item?.type === "equipment") && item.system?.equipped === true;
const carried = (item: any) => (item?.type === "armor" || item?.type === "equipment") && item.system?.carried !== false;
const actorTl = (actor: any) => Number(/\d+/.exec(String(actor?.system?.tl ?? ""))?.[0]) || 0;

/** A rigid helmet: not flexible, and over the skull (p. 173). */
function isRigidHelmet(item: any): boolean {
  return isArmor(item) && item.system?.flexible !== true && (item.system?.locations ?? []).includes("skull");
}

/** Whether a piece covers a location at all, by its own list (an empty list is the whole body). */
function covers(item: any, location: string): boolean {
  const list: string[] = item?.system?.locations ?? [];
  return list.length === 0 || list.includes(location);
}

/** The beam family an attack belongs to. */
function familyOf(item: any): BeamFamily | null {
  return item?.type === "equipment" ? beamFamily(String(item.name ?? "")) : null;
}

/** The warhead a mode fires, where one is loaded. */
function warheadOf(item: any, mode: any): string {
  if (!item) return "";
  const index = Math.max(0, Math.floor(Number(mode?.index) || 0));
  return loadsOf(item).find((l) => l.mode === index && l.kind)?.kind ?? "";
}

/** A shaped charge or a plasma bolt, which EMA is made against (p. 187). */
function shapedOrPlasma(item: any, mode: any): { shaped: boolean; plasma: boolean } {
  const kind = warheadOf(item, mode);
  return { shaped: SHAPED_CHARGES.has(kind), plasma: kind === "plasma" || familyOf(item) === "plasma" };
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

// ── threat protection ────────────────────────────────────────────────────────

/** Adds what a worn piece protects against to a character's trait effects. */
function addProtection(context: any, protection: Protection, label: string): void {
  const effects = context.effects;
  const push = (effect: string, value?: number) => context.sources.push({ effect, label, ...(value !== undefined ? { value } : {}) });
  if (protection.sealed && !effects.sealed) { effects.sealed = true; push("sealed"); }
  if (protection.vacuumSupport && !effects.vacuumSupport) { effects.vacuumSupport = true; push("vacuumSupport"); }
  const pressure = pressureSupportLevel(protection.pressureAtm ?? 0);
  if (pressure > (Number(effects.pressureSupport) || 0)) { effects.pressureSupport = pressure; push("pressureSupport", pressure); }
  if (protection.climate && effects.temperatureTolerance) {
    const zone = climateTolerance(protection.climate);
    if (zone.coldF > (Number(effects.temperatureTolerance.coldF) || 0)) { effects.temperatureTolerance.coldF = zone.coldF; push("temperatureTolerance.coldF", zone.coldF); }
    if (zone.heatF > (Number(effects.temperatureTolerance.heatF) || 0)) { effects.temperatureTolerance.heatF = zone.heatF; push("temperatureTolerance.heatF", zone.heatF); }
  }
  if (effects.protectedSense) {
    if ((protection.glare || protection.mask) && !effects.protectedSense.vision) { effects.protectedSense.vision = true; push("protectedSense.vision"); }
    if (protection.mask && !effects.protectedSense.tasteSmell) { effects.protectedSense.tasteSmell = true; push("protectedSense.tasteSmell"); }
    if (protection.hearing && !effects.protectedSense.hearing) { effects.protectedSense.hearing = true; push("protectedSense.hearing"); }
  }
  if (protection.filter && !effects.filterLungs) { effects.filterLungs = true; push("filterLungs"); }
  if (protection.air && !effects.doesntBreathe) { effects.doesntBreathe = true; push("doesntBreathe"); }
}

/** A readable list of what a piece protects against. */
function protectionText(protection: Protection | null): string {
  if (!protection) return "";
  const parts: string[] = [];
  if (protection.sealed) parts.push(L("Protection.sealed"));
  if (protection.vacuumSupport) parts.push(L("Protection.vacuumSupport"));
  if (protection.pressureAtm) parts.push(F("Protection.pressure", { atm: protection.pressureAtm }));
  if (protection.radiationPf) parts.push(F("Protection.radiationPf", { pf: protection.radiationPf }));
  if (protection.climate) parts.push(F("Protection.climate", { low: protection.climate[0], high: protection.climate[1] }));
  if (protection.glare) parts.push(L("Protection.glare"));
  if (protection.hearing) parts.push(L("Protection.hearing"));
  if (protection.mask) parts.push(L("Protection.mask"));
  if (protection.filter) parts.push(L("Protection.filter"));
  if (protection.air) parts.push(L("Protection.air"));
  return parts.join(", ");
}

/** The threat protection lines an item's sheet shows. */
function threatLines(item: any): string[] {
  const lines: string[] = [];
  const name = String(item?.name ?? "");
  const gear = protectiveGear(name);
  if (gear?.alone && Object.keys(gear.alone).length) lines.push(F("Threat.Alone", { list: protectionText(gear.alone) }));
  if (gear?.completedBy) lines.push(F("Threat.With", { with: L(`Threat.Completes.${gear.completedBy.key}`), list: protectionText(gear.completedBy.grants) }));
  if (gear?.don) lines.push(F(gear.don.skill ? "Threat.DonSkill" : "Threat.Don", { on: gear.don.on, off: gear.don.off, skill: gear.don.skill ?? "" }));
  else if (isArmor(item) && !gear) lines.push(F("Threat.DonArmor", { seconds: BODY_ARMOR_SECONDS }));
  const tank = airTankSize(name);
  if (tank) {
    const tl = Math.max(9, itemTl(item) || 9, actorTl(item?.actor));
    const hours = airTankHours(tank, tl);
    lines.push(F(hours < 1 ? "Threat.TankMinutes" : "Threat.TankHours", { tl, minutes: Math.round(hours * 60), hours, hookUp: TANK_SECONDS.hookUp, jettison: TANK_SECONDS.jettison }));
  }
  if (/^suit patches$/i.test(name)) lines.push(F("Threat.Patches", { seconds: SUIT_PATCH.seconds, minutes: SUIT_PATCH.airMinutesLost }));
  return lines;
}

/** Rolls Vacc Suit to patch a breach, each failure making the next harder (p. 188). */
async function patchSuit(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const failures = Math.max(0, Math.floor(Number(actor.getFlag(MODULE_ID, PATCH_FLAG)?.failures) || 0));
  const skill = "Vacc Suit";
  const base = api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "DX") ?? 10) - 6;
  const modifiers = failures ? [{ label: L("Patch.Failures"), value: suitPatchPenalty(failures) }] : [];
  const result: any = await api.roll.success({ actor, base, skill, label: F("Patch.Label", { item: item.name }), modifiers } as any);
  if (!result) return;
  await actor.setFlag(MODULE_ID, PATCH_FLAG, { failures: result.success ? 0 : failures + 1 });
  await say(actor, String(item.name), [F(result.success ? "Patch.Sealed" : "Patch.Failed", { minutes: SUIT_PATCH.airMinutesLost })]);
}

// ── tailoring and the price ─────────────────────────────────────────────────

/** A piece's price with its choices, or null where nothing changes it. */
function armorPrice(item: any, price: { cost: number; weight: number }, on: ArmorSwitches): { cost: number; weight: number } | null {
  if (!isArmor(item)) return null;
  const build = armorBuildOf(item);
  let { cost, weight } = price;
  let changed = false;
  let cut = 1;
  if (on.tailored() && build.tailored) {
    const tailoring: Tailoring = { coverage: build.coverage, style: build.style, cut: "average" };
    ({ cost, weight } = tailoredPrice({ cost, weight }, tailoring));
    cut = CUTS[build.cut];
    changed = true;
  }
  if (on.laser() && build.reflective && isRigidHelmet(item)) { cost += REFLECTIVE_HELMET.cost; changed = true; }
  if (on.systems() && build.adaptive) { cost += adaptivePrice(build.adaptive, weight); changed = true; }
  if (on.laser() && build.transparent && canBeTransparent(String(item.name))) { cost *= 2; changed = true; }
  // "Most metallic equipment can be made of living metal for double its normal cost" (p. 171).
  if (on.systems() && build.livingMetal) { cost *= 2; changed = true; }
  // The cut multiplies everything added to the outfit (p. 175).
  if (cut !== 1) cost *= cut;
  return changed ? { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 100) / 100 } : null;
}

// ── the sheet ────────────────────────────────────────────────────────────────

function itemContext(item: any, on: ArmorSwitches): Record<string, unknown> {
  const build = armorBuildOf(item);
  const name = String(item?.name ?? "");
  const armor = isArmor(item);
  const record = recordArmor(item);
  const lines: string[] = on.threat() ? threatLines(item) : [];
  const laserKind = armor ? laserArmorKind(name) : null;
  if (on.laser() && laserKind && record.fullDrAgainst === "laser") {
    const lost = Object.entries(wearOf(item).laserLost ?? {}).filter(([, n]) => n > 0).map(([loc, n]) => `${loc} -${n}`).join(", ");
    lines.push(F(`Laser.${laserKind}`, { dr: Number(record.fullDr) || 0 }));
    if (lost) lines.push(F("Laser.Lost", { list: lost }));
  }
  if (on.systems()) {
    if (/^ablative foam$/i.test(name)) lines.push(F("Systems.FoamLine", { dr: ABLATIVE_FOAM.dr, radar: ABLATIVE_FOAM.radarPenalty, seconds: ABLATIVE_FOAM.applySeconds }));
    if (/^nasal filter plugs$/i.test(name)) lines.push(L("Systems.PlugsLine"));
    if (/^near miss indicator$/i.test(name)) lines.push(L("Systems.NearMissLine"));
    if (/^mind shield/i.test(name)) lines.push(F("Systems.MindShieldLine", { bonus: mindShieldBonus(Math.max(9, itemTl(item) || 9)) }));
    if (hasBiomedicalSensors(name)) lines.push(F("Systems.BiomedicalLine", { inPerson: BIOMEDICAL.inPerson, remote: BIOMEDICAL.remote }));
    if (/^bioplas\b|^space biosuit$/i.test(baseName(name))) lines.push(F("Systems.BioplasRepair", { hours: SELF_REPAIR.bioplasHoursPerHp }));
    if (armor && build.livingMetal) lines.push(L("Systems.LivingMetalRepair"));
    if (armor && build.ema && build.emaUses) lines.push(F("Systems.EmaUsesLine", { used: Math.min(build.emaUses, wearOf(item).emaUsed ?? 0), uses: build.emaUses }));
    if (armor && build.adaptive) lines.push(F("Systems.AdaptedLine", { list: build.adaptedTo.join(", ") || "—" }));
    if (armor && build.reactivePaste) lines.push(F("Systems.PasteLine", { dr: reactivePasteDr(build.pasteTl, false), shaped: reactivePasteDr(build.pasteTl, true) }));
  }
  const tailoredOn = on.tailored() && armor && item.system?.flexible === true;
  const multiplier = coverageMultiplier(build.coverage);
  const lc = tailoredLc(item.system?.lc ?? null, build.style);
  return {
    lines,
    armor,
    build,
    tailoredOn,
    parts: COVERAGE_PART_KEYS.map((part) => ({
      part,
      label: L(`Tailor.Part.${part}`),
      options: COVERAGES.map((value) => ({ value, label: L(`Tailor.Coverage.${value}`), selected: build.coverage[part] === value })),
    })),
    styles: Object.keys(STYLES).map((value) => ({ value, label: L(`Tailor.Style.${value}`), selected: build.style === value })),
    cuts: Object.keys(CUTS).map((value) => ({ value, label: L(`Tailor.Cut.${value}`), selected: build.cut === value })),
    tailorSummary: build.tailored
      ? F("Tailor.Summary", { multiplier, dr: tailoredDr(Number(item.system?.dr) || 0, build.style), lc: lc ?? "—" })
      : "",
    transparentOn: on.laser() && armor && canBeTransparent(name),
    reflectiveOn: on.laser() && isRigidHelmet(item),
    systemsOn: on.systems() && armor,
    emas: [["", "Systems.EmaNone"], ["standard", "Systems.EmaStandard"], ["laminate", "Systems.EmaLaminate"]].map(([value, key]) => ({ value, label: L(key!), selected: build.ema === value })),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-armor]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtArmor);
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void item.update({ [`${path}.${field}`]: input.checked });
      if (input instanceof HTMLInputElement && input.type === "number") return void item.update({ [`${path}.${field}`]: Math.max(0, Math.floor(Number(input.value) || 0)) });
      await item.update({ [`${path}.${field}`]: input.value });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-ut-armor-reset]").forEach((button) => {
    button.addEventListener("click", () => item.unsetFlag(MODULE_ID, WEAR_FLAG));
  });
}

// ── what reflec does to a radar sweep ───────────────────────────────────────

let laserArmorOn: () => boolean = () => false;

/**
 * The bonus reflec worn by a target gives a radar sweep to find them: +1, or
 * +2 for a full suit (p. 173), as a modifier line, or null.
 */
export function reflecAgainstRadar(actor: any): { label: string; value: number } | null {
  if (!laserArmorOn() || !actor) return null;
  const names = [...(actor.items ?? [])].filter(worn).map((i: any) => String(i.name));
  const value = reflecDetectionBonus(names);
  return value ? { label: L("Laser.RadarLine"), value } : null;
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyArmor(api: GWorldApi, on: ArmorSwitches): void {
  laserArmorOn = on.laser;
  const anyOn = () => on.threat() || on.laser() || on.tailored() || on.systems();

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-armor",
    types: ["armor"],
    apply: (item, price) => {
      const priced = armorPrice(item, price, on);
      return priced ? { ...priced, label: L("Title") } : null;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-armor-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-armor-item.hbs`,
    visible: (item) => {
      if (!anyOn()) return false;
      const context = itemContext(item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.tailoredOn || context.transparentOn || context.reflectiveOn || context.systemsOn);
    },
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── threat protection (pp. 171, 176-181) ──
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on.threat() || !context?.actor || !context.effects) return;
    const wornItems = [...(context.actor.items ?? [])].filter(worn);
    const names = wornItems.map((i: any) => String(i.name));
    let pf = 1;
    let pfLabel = "";
    let breathesThrough = false;
    for (const item of wornItems) {
      const protection = protectionWorn(String(item.name), names);
      if (!protection) continue;
      addProtection(context, protection, String(item.name));
      if ((protection.radiationPf ?? 0) > pf) { pf = protection.radiationPf!; pfLabel = String(item.name); }
      const gear = protectiveGear(String(item.name));
      if (protection.mask || gear?.don?.on === 3 && /helmet/i.test(String(item.name))) breathesThrough = true;
    }
    // Armour's PF divides the dose before the body's own tolerance does (Characters p. 79).
    if (pf > 1) {
      context.effects.radiationTolerance = Math.max(1, Number(context.effects.radiationTolerance) || 1) * pf;
      context.sources.push({ effect: "radiationTolerance", label: pfLabel, value: pf });
    }
    // An air tank feeds a mask or a sealed helmet (p. 176).
    const tank = [...(context.actor.items ?? [])].find((i: any) => carried(i) && airTankSize(String(i.name)));
    if (breathesThrough && tank && !context.effects.doesntBreathe) {
      context.effects.doesntBreathe = true;
      context.sources.push({ effect: "doesntBreathe", label: String(tank.name) });
    }
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-suit-patch",
    itemTypes: ["equipment"],
    label: L("Patch.Title"),
    icon: "fa-solid fa-bandage",
    visible: (item) => on.threat() && /^suit patches$/i.test(String(item?.name)),
    run: (item, actor) => patchSuit(api, item, actor),
  });

  // ── ablative foam on the skin (p. 187) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-ablative-foam",
    itemTypes: ["equipment"],
    label: L("Systems.FoamToggle"),
    icon: "fa-solid fa-spray-can",
    visible: (item) => on.systems() && /^ablative foam$/i.test(String(item?.name)),
    run: async (item, actor) => {
      if (!actor?.isOwner) return;
      if (actor.getFlag(MODULE_ID, FOAM_FLAG)) {
        await actor.unsetFlag(MODULE_ID, FOAM_FLAG);
        await say(actor, String(item.name), [F("Systems.FoamOff", { name: actor.name })]);
      } else {
        await actor.setFlag(MODULE_ID, FOAM_FLAG, { left: {} });
        await say(actor, String(item.name), [F("Systems.FoamOn", { name: actor.name, dr: ABLATIVE_FOAM.dr, seconds: ABLATIVE_FOAM.applySeconds })]);
      }
    },
  });

  // ── what each piece is worth against the blow ──
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!anyOn() || !context?.actor || !Array.isArray(context.lines)) return;
    const actor = context.actor;
    const location = String(context.hitLocation ?? "");
    const family = familyOf(context.item);
    const charge = shapedOrPlasma(context.item, context.mode);

    for (const line of context.lines) {
      const item = line.itemId ? actor.items?.get?.(line.itemId) : null;
      if (!isArmor(item)) continue;
      const build = armorBuildOf(item);
      const reasons: string[] = [];

      if (on.laser()) {
        const record = recordArmor(item);
        const kind = laserArmorKind(String(item.name));
        if (kind && record.fullDrAgainst === "laser" && fullDrAgainst(kind, family)) {
          const lost = kind === "ablative" ? Math.max(0, Number(wearOf(item).laserLost?.[location]) || 0) : 0;
          const full = Math.max(0, (Number(record.fullDr) || 0) - lost);
          if (full > line.dr) { line.dr = full; reasons.push(L(`Laser.Reason.${kind}`)); }
        }
        if (build.transparent && canBeTransparent(String(item.name)) && isLaser(family)) {
          line.applies = false;
          reasons.push(L("Laser.Reason.transparent"));
        }
        if (build.reflective && isRigidHelmet(item) && reflectedByHelmet(family)) {
          line.dr += REFLECTIVE_HELMET.dr;
          reasons.push(L("Laser.Reason.reflective"));
        }
      }

      if (on.systems()) {
        const multiplier = emaMultiplier(build.ema);
        const usesLeft = !build.emaUses || (wearOf(item).emaUsed ?? 0) < build.emaUses;
        if (multiplier > 1 && usesLeft && (charge.shaped || charge.plasma)) {
          line.dr *= multiplier;
          reasons.push(F("Systems.Reason.ema", { times: multiplier }));
        }
        if (build.adaptive && family && build.adaptedTo.includes(family)) {
          line.dr *= 3;
          reasons.push(L("Systems.Reason.adaptive"));
        }
      }

      if (on.tailored() && build.tailored) {
        line.dr = tailoredDr(line.dr, build.style);
        const part = partAt(location);
        const coverage = part ? build.coverage[part] ?? "full" : "full";
        if (!coversArc(coverage, context.arc)) {
          line.applies = false;
          reasons.push(L(coverage === "none" ? "Tailor.Reason.uncovered" : "Tailor.Reason.arc"));
        } else {
          const activation = coverageActivation(coverage);
          if (activation !== null) {
            const roll = [0, 0, 0].reduce((sum) => sum + Math.floor(CONFIG.Dice.randomUniform() * 6) + 1, 0);
            if (roll > activation) line.applies = false;
            reasons.push(F(roll > activation ? "Tailor.Reason.missed" : "Tailor.Reason.struck", { roll, target: activation }));
          }
        }
      }

      if (reasons.length) line.reason = [line.reason, ...reasons].filter(Boolean).join("; ");
    }

    if (!on.systems()) return;
    // Reactive paste on a piece covering the spot, against a high-velocity attack (p. 189).
    if (context.mode?.ranged) {
      for (const item of actor.items ?? []) {
        if (!isArmor(item) || item.system?.equipped !== true || !covers(item, location)) continue;
        const build = armorBuildOf(item);
        if (!build.reactivePaste) continue;
        const spent = wearOf(item).paste?.[location];
        if (spent && !pasteCovers(spent.detonations, spent.nextRoll)) continue;
        context.lines.push({ label: F("Systems.PasteLabel", { item: item.name }), dr: reactivePasteDr(build.pasteTl, charge.shaped), applies: true, forceField: false, flexible: false, hardened: 0, reason: L("Systems.PasteHint") });
      }
    }
    // Ablative foam on the skin: DR 8 against burning, Hardened against lasers (p. 187).
    const foam = actor.getFlag?.(MODULE_ID, FOAM_FLAG);
    if (foam && String(context.damageType) === "burn") {
      const left = Math.max(0, Number(foam.left?.[location] ?? ABLATIVE_FOAM.dr));
      if (left > 0) context.lines.push({ label: L("Systems.FoamLabel"), dr: left, applies: true, forceField: false, flexible: true, hardened: isLaser(family) ? ABLATIVE_FOAM.hardened : 0, reason: L("Systems.FoamHint") });
    }
  });

  // ── what the blow did to the armour ──
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const actor = context?.actor;
    const result = context?.result;
    if (!anyOn() || !actor?.isOwner || !result) return;
    // One client writes: the GM where one is present, or the owner who applied it.
    if (!game.user?.isGM && (game.users as any)?.activeGM) return;
    const location = String(result.hitLocation ?? context.damage?.hitLocation ?? "");
    const family = familyOf(context.item);
    const basic = Math.max(0, Number(result.basicDamage) || 0);
    const divisor = Number(result.armorDivisorAfterHardening) || 1;
    const charge = shapedOrPlasma(context.item, context.mode);
    const cards: string[] = [];
    const updates: Array<Record<string, unknown>> = [];

    for (const item of actor.items ?? []) {
      if (!isArmor(item) || item.system?.equipped !== true || !covers(item, location)) continue;
      const build = armorBuildOf(item);
      const wear = foundry.utils.deepClone(wearOf(item)) as ArmorWear;
      let changed = false;

      if (on.laser()) {
        const record = recordArmor(item);
        const kind = laserArmorKind(String(item.name));
        if (kind === "ablative" && record.fullDrAgainst === "laser" && fullDrAgainst(kind, family)) {
          const already = Math.max(0, Number(wear.laserLost?.[location]) || 0);
          const lost = semiAblativeLoss(basic, (Number(record.fullDr) || 0) - already);
          if (lost > 0) {
            wear.laserLost = { ...(wear.laserLost ?? {}), [location]: already + lost };
            changed = true;
          }
        }
        if (kind === "retroReflective" && record.fullDrAgainst === "laser" && bouncesBack(family)) {
          const bounced = bouncedDamage(basic, afterDivisor(Number(record.fullDr) || 0, divisor));
          const attacker = context.item?.actor;
          if (bounced > 0) cards.push(F("Laser.Bounced", { damage: bounced, attacker: attacker?.name ?? L("Laser.TheAttacker"), item: item.name }));
        }
      }

      if (on.systems()) {
        const multiplier = emaMultiplier(build.ema);
        if (multiplier > 1 && build.emaUses && (charge.shaped || charge.plasma) && (wear.emaUsed ?? 0) < build.emaUses) {
          if (emaUseSpent({ penetrating: Number(result.penetrating) || 0, basicDamage: basic, effectiveDr: Number(result.effectiveDr) || 0, pieceDr: Number(item.system?.dr) || 0, multiplier, divisor })) {
            wear.emaUsed = (wear.emaUsed ?? 0) + 1;
            changed = true;
            cards.push(F("Systems.EmaSpent", { item: item.name, used: wear.emaUsed, uses: build.emaUses }));
          }
        }
        if (build.adaptive && family) {
          const adapted = adaptTo(build.adaptedTo, family, build.adaptive, { penetrating: Number(result.penetrating) || 0, basicDamage: basic, effectiveDr: Number(result.effectiveDr) || 0 });
          if (adapted) {
            updates.push({ _id: item.id, [`system.extensions.${MODULE_ID}.${FIELD}.adaptedTo`]: adapted });
            cards.push(F("Systems.Adapted", { item: item.name, family }));
          }
        }
        if (build.reactivePaste && context.mode?.ranged && basic > 0) {
          const spent = wear.paste?.[location] ?? { detonations: 0, nextRoll: 0 };
          if (pasteCovers(spent.detonations, spent.nextRoll)) {
            const nextRoll = Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
            wear.paste = { ...(wear.paste ?? {}), [location]: { detonations: spent.detonations + 1, nextRoll } };
            changed = true;
            cards.push(F("Systems.PasteDetonated", { item: item.name, location, name: actor.name }));
          }
        }
      }

      if (changed) updates.push({ _id: item.id, [`flags.${MODULE_ID}.${WEAR_FLAG}`]: wear });
    }

    if (on.systems() && String(context.damage?.type ?? "") === "burn") {
      const foam = actor.getFlag?.(MODULE_ID, FOAM_FLAG);
      if (foam) {
        const left = Math.max(0, Number(foam.left?.[location] ?? ABLATIVE_FOAM.dr));
        if (left > 0) void actor.setFlag(MODULE_ID, FOAM_FLAG, { left: { ...(foam.left ?? {}), [location]: foamLeft(left, basic) } });
      }
    }

    if (updates.length) void actor.updateEmbeddedDocuments("Item", updates);
    if (cards.length) void say(actor, context.item?.name ?? L("Title"), cards);
  });

  // ── accessories ──
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.systems() || !context?.actor) return;
    const tags: string[] = context.tags ?? [];
    // Nasal filter plugs against a breathed gas (p. 188).
    if (tags.includes("resist") && context.attack?.item) {
      const gas = warheadOf(context.attack.item, context.attack.mode) === "aerosol" || /\bgas\b/i.test(String(context.attack.item.name ?? ""));
      const plugs = [...(context.actor.items ?? [])].find((i: any) => worn(i) && /^nasal filter plugs$/i.test(String(i.name)));
      if (gas && plugs) context.modifiers.push({ label: String(plugs.name), value: nasalPlugBonus(0) });
    }
    // Biomedical sensors on the patient: +1 to Diagnosis (p. 187).
    if (/^diagnosis\b/i.test(String(context.skill ?? ""))) {
      const patient = context.opponent ?? [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
      const sensors = patient ? [...(patient.items ?? [])].find((i: any) => worn(i) && hasBiomedicalSensors(String(i.name))) : null;
      if (sensors) context.modifiers.push({ label: F("Systems.BiomedicalModifier", { item: sensors.name }), value: BIOMEDICAL.inPerson });
    }
  });
}
