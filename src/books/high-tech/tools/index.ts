/**
 * High-Tech's tools, forced entry and household hazards (pp. 24-33, 50),
 * registered with the system through the add-on API under four switches. The
 * rules are in `rules.ts`; what each record is (a kit, a tool that works at
 * so much a second, a chainsaw, a hazard) is its `tool` data, written on the
 * records from book.json.
 *
 *   - **Tool kits (toolKits):** a portable kit or workshop carried for
 *     another specialty of a skill, and a workshop for a close or distant
 *     craft, as the skill's equipment line where the character has no kit of
 *     its own for it (`gworld.skillBonuses`); light crafts' kits and large
 *     vehicles' repriced; a lab's set-up time and a machine shop's output
 *     shown on the item.
 *   - **Forced-entry tools (forcedEntryTools):** a derived attack row for
 *     each tool that works at so much a second (or a bite, or a blow), with
 *     Forced Entry; the Ready maneuvers the hand ram, door opener and
 *     spreader take, counted by a row action and required before the attack;
 *     the glass cutter's roll and the duct-tape restraint as row actions.
 *   - **Chainsaws (chainsaws):** Forced Entry rows for rescue work, one at
 *     the (0.5) divisor for hard material; a blow from it that fails to
 *     penetrate (or the row action, for a door or a car) rolls the stall or
 *     the snap, which refuses the saw's attacks until it is restarted or
 *     repaired; the carbide chain, which costs double and ends both; and the
 *     nail gun's -4.
 *   - **Household hazards (householdHazards):** a row action on a propane
 *     cylinder or an appliance that rolls what it does, and lead as a poison
 *     the sheet doses, whose worse symptoms are named once the victim is past
 *     half their HP.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { toolsFor } from "../equipment/index.js";
import {
  CARBIDE_CHAIN_COST,
  GLASS_CUTTER_REALISTIC,
  GLASS_CUTTER_WOUND,
  HARD_MATERIAL_DIVISOR,
  HAZARD_KINDS,
  KIT_SIZES,
  LEAD_POISON,
  NAIL_GUN_PENALTY,
  PROPANE_DR,
  PROPANE_FRAGMENTS,
  SNAPPED_CHAIN,
  VEHICLE_TONS,
  WORK_MATERIALS,
  breakFreeRoll,
  chainsawMishap,
  diceRange,
  glassCutterOutcome,
  kitPriceMultipliers,
  leadSymptomsWorsen,
  listOf,
  nailGunLevel,
  readiesNeeded,
  snapStrikesWielder,
  workDamage,
  wrongKitModifier,
  type CarriedKit,
  type HazardKind,
  type KitSize,
  type Work,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Tools.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Tools.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "tool";
const TAPE_CARD = "ht-duct-tape";
const LEAD = "leadPoisoning";
const WORK_MODE = "ht-tool-work";
const RESCUE_MODE = "ht-chainsaw-rescue";
const HARD_MODE = "ht-chainsaw-hard";

/** What a record is beyond a kit, a working tool or a hazard: the tools with a rule of their own. */
export const TOOL_USES = ["", "chainsaw", "nailGun", "glassCutter", "ductTape"] as const;
export type ToolUse = (typeof TOOL_USES)[number];

export interface ToolSwitches {
  kits: () => boolean;
  forcedEntry: () => boolean;
  chainsaws: () => boolean;
  hazards: () => boolean;
}

/** What this module keeps on a tool. */
export interface ToolData {
  kit: KitSize;
  lightCraft: boolean;
  /** The largest vehicle a mechanic's or armourer's kit or shop repairs, in tons; 0 for the usual 10. */
  vehicleTons: number;
  closeCrafts: string[];
  distantCrafts: string[];
  /** A portable lab's set-up (or packing) time (p. 50). */
  setupSeconds: number;
  /** A computer-aided workshop's output (p. 29). */
  partsPerHour: number;
  use: ToolUse;
  carbide: boolean;
  readies: number;
  readiesWaivedAtSt: number;
  work: Work | null;
  hazard: { kind: HazardKind; damage: string; upTo: string; perSecond: boolean } | null;
}

/** Registers the fields this module keeps on a tool. */
export function initTools(): void {
  const f = foundry.data.fields as any;
  const whole = (max: number, initial = 0) => new f.NumberField({ required: true, nullable: false, integer: true, initial, min: 0, max });
  const text = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "" });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kit: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...KIT_SIZES] }),
      lightCraft: new f.BooleanField({ initial: false }),
      vehicleTons: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      closeCrafts: text(),
      distantCrafts: text(),
      setupSeconds: whole(86400),
      partsPerHour: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      use: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...TOOL_USES] }),
      carbide: new f.BooleanField({ initial: false }),
      readies: whole(20),
      readiesWaivedAtSt: whole(100),
      work: new f.SchemaField({
        damage: text(),
        type: text(),
        divisor: new f.NumberField({ required: true, nullable: false, initial: 1, min: 0 }),
        every: whole(3600, 1),
        multiplier: new f.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1, max: 100 }),
        against: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...WORK_MATERIALS] }),
        stRoll: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        carbideBonus: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),
      hazard: new f.SchemaField({
        kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...HAZARD_KINDS] }),
        damage: text(),
        upTo: text(),
        perSecond: new f.BooleanField({ initial: false }),
      }),
    }),
  });
}

/** A tool's data, with nothing missing. */
export function toolData(item: any): ToolData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const w = d.work ?? {};
  const h = d.hazard ?? {};
  const damage = String(w.damage ?? "").trim();
  const hazardKind: HazardKind = HAZARD_KINDS.includes(h.kind) ? h.kind : "";
  return {
    kit: KIT_SIZES.includes(d.kit) ? d.kit : "",
    lightCraft: d.lightCraft === true,
    vehicleTons: Math.max(0, Number(d.vehicleTons) || 0),
    closeCrafts: listOf(d.closeCrafts),
    distantCrafts: listOf(d.distantCrafts),
    setupSeconds: count(d.setupSeconds),
    partsPerHour: Math.max(0, Number(d.partsPerHour) || 0),
    use: TOOL_USES.includes(d.use) ? d.use : "",
    carbide: d.carbide === true,
    readies: count(d.readies),
    readiesWaivedAtSt: count(d.readiesWaivedAtSt),
    work: damage
      ? {
          damage,
          type: String(w.type ?? "") || "cr",
          divisor: Number(w.divisor) > 0 ? Number(w.divisor) : 1,
          every: w.every === undefined ? 1 : count(w.every),
          multiplier: Math.max(1, count(w.multiplier)),
          against: WORK_MATERIALS.includes(w.against) ? w.against : "",
          stRoll: typeof w.stRoll === "number" ? Math.trunc(w.stRoll) : null,
          carbideBonus: Math.trunc(Number(w.carbideBonus) || 0),
        }
      : null,
    hazard: hazardKind ? { kind: hazardKind, damage: String(h.damage ?? "").trim(), upTo: String(h.upTo ?? "").trim(), perSecond: h.perSecond === true } : null,
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const meleeModes = (item: any): any[] => item?.system?.meleeModes ?? [];

/** Whether an item is a chainsaw whose chain is the ordinary one: the kind with the hard-material rules (p. 27). */
export function ordinaryChainsaw(item: any): boolean {
  const data = toolData(item);
  return data.use === "chainsaw" && !data.carbide;
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    ...(rolls.length ? { rolls } : {}),
  });
}

/** The one token the user has targeted's actor, or null. */
function targetedActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

// ── tool kits (p. 24) ──

/** The kits a character carries, as the wrong-specialty rule reads them. */
function carriedKits(actor: any): CarriedKit[] {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item?.type === "equipment" && item.system?.carried !== false && toolData(item).kit)
    .map((item: any) => {
      const data = toolData(item);
      return { size: data.kit, skills: (item.system?.forSkills ?? []).map(String), close: data.closeCrafts, distant: data.distantCrafts };
    });
}

/** The skill's equipment line from a kit made for something else, or null where the rule has nothing to say. */
export function wrongKitLine(api: GWorldApi, actor: any, skill: string): number | null {
  if (!actor || !skill || toolsFor(api, actor, skill).length) return null;
  return wrongKitModifier(carriedKits(actor), skill, (name) => api.rules.toolSkillKey(name));
}

// ── the chainsaw's state (p. 27) ──

type SawState = "" | "stalled" | "snapped";

function sawState(api: GWorldApi, item: any): SawState {
  const state = (api.combat.getWeaponState(item, MODULE_ID) as any)?.chainsaw;
  return state === "stalled" || state === "snapped" ? state : "";
}

/** Rolls what a chainsaw does on a blow that didn't get through, and puts it out of action as it says. */
export async function chainsawFails(api: GWorldApi, item: any, actor: any): Promise<void> {
  const roll = new Roll("1d6");
  await roll.evaluate();
  const mishap = chainsawMishap(Number(roll.total));
  const name = String(item?.name ?? "");
  if (mishap === "none") return void say(actor, name, [F("MishapNone", { roll: roll.total })], [roll]);
  await api.combat.setWeaponState(item, MODULE_ID, { chainsaw: mishap === "stall" ? "stalled" : "snapped" });
  if (mishap === "stall") return void say(actor, name, [F("MishapStall", { roll: roll.total })], [roll]);
  const lashes = snapStrikesWielder(tlOf(item));
  await say(actor, name, [F(lashes ? "MishapSnapLashes" : "MishapSnapBreaks", { roll: roll.total })], [roll]);
  if (lashes) {
    await api.roll.damage({ actor, item, label: F("SnappedChain", { name: String(actor?.name ?? "") }), formula: SNAPPED_CHAIN.damage, damageType: SNAPPED_CHAIN.type as never, source: "snappedChain" });
  }
}

// ── the glass cutter and duct tape (p. 26) ──

async function cutGlass(api: GWorldApi, item: any, actor: any): Promise<void> {
  const cinematic: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(L("GlassHint"))}</p>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="cinematic"> ${esc(L("GlassCinematic"))}</label></div></div>`,
    ok: {
      label: L("GlassCut"),
      callback: (_event: Event, button: HTMLElement) => ({ cinematic: Boolean(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="cinematic"]')?.checked) }),
    },
    rejectClose: false,
  });
  if (!cinematic) return;
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const forcedEntry = api.actors.skillLevel(actor, "Forced Entry");
  const use = forcedEntry !== null && forcedEntry > dx ? { skill: "Forced Entry", level: forcedEntry } : { skill: "DX", level: dx };
  const modifiers = cinematic.cinematic ? [] : [{ label: L("GlassRealistic"), value: GLASS_CUTTER_REALISTIC }];
  const outcome: any = await api.roll.success({ actor, base: use.level, label: F("GlassRoll", { skill: use.skill }), skill: use.skill, kind: use.skill === "DX" ? "attribute" : "skill", modifiers, tags: ["glassCutter"] } as any);
  if (!outcome) return;
  const result = glassCutterOutcome(Boolean(outcome.success), Boolean(outcome.criticalFailure));
  await say(actor, String(item.name ?? ""), [L(result === "cut" ? "GlassDone" : result === "noisy" ? "GlassNoisy" : "GlassCutHand")]);
  if (result === "cutHand") {
    await api.roll.damage({ actor, item, label: F("GlassWound", { name: String(actor?.name ?? "") }), formula: GLASS_CUTTER_WOUND.damage, damageType: GLASS_CUTTER_WOUND.type as never, calledShot: { hitLocation: "hand", addonLocation: null } as never });
  }
}

type TapeData = {
  captiveUuid: string;
  captive: string;
  taper: string;
  line: string;
  freed: string;
};

async function tapeUp(api: GWorldApi, item: any, actor: any): Promise<void> {
  const captive = targetedActor();
  if (!captive) return void ui.notifications?.warn(L("TapeTarget"));
  const data: TapeData = {
    captiveUuid: String(captive.uuid ?? ""),
    captive: String(captive.name ?? ""),
    taper: String(actor?.name ?? ""),
    line: F("TapeLine", { captive: captive.name, taper: actor?.name ?? "" }),
    freed: "",
  };
  await api.chat.post(`${MODULE_ID}.${TAPE_CARD}`, data, { actor: captive } as any);
}

async function breakFree(api: GWorldApi, message: any, data: TapeData): Promise<void> {
  const captive: any = data.captiveUuid ? await fromUuid(data.captiveUuid) : null;
  if (!captive || data.freed) return;
  const use = breakFreeRoll(Number(api.actors.attribute(captive, "ST")) || 10, api.actors.skillLevel(captive, "Escape"));
  const outcome: any = await api.roll.success({ actor: captive, base: use.level, label: F(use.skill === "ST" ? "BreakFreeSt" : "BreakFreeEscape", { name: captive.name }), skill: use.skill === "ST" ? "ST" : "Escape", kind: use.skill === "ST" ? "attribute" : "skill", tags: ["ductTape", "escape"] } as any);
  if (outcome?.success) await api.chat.update(message, { ...data, freed: F("TapeFreed", { captive: captive.name }) });
}

// ── household hazards (pp. 31-32) ──

async function hazardDamage(api: GWorldApi, item: any, actor: any): Promise<void> {
  const hazard = toolData(item).hazard;
  if (!hazard?.damage) return;
  const name = String(item.name ?? "");
  let formula = hazard.damage;
  const steps = diceRange(hazard.damage, hazard.upTo);
  if (steps.length > 1) {
    const chosen: any = await foundry.applications.api.DialogV2.prompt({
      window: { title: name },
      content: `<div class="gworld"><p class="ihint">${esc(F("HeatHint", { from: steps[0], to: steps.at(-1) }))}</p>
        <div class="ifields"><label>${esc(L("Heat"))} <select name="dice">${steps.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></label></div></div>`,
      ok: {
        label: L("HazardRoll"),
        callback: (_event: Event, button: HTMLElement) => ({ dice: button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="dice"]')?.value ?? "" }),
      },
      rejectClose: false,
    });
    if (!chosen?.dice) return;
    formula = String(chosen.dice);
  }
  const label = F(hazard.perSecond ? "HazardPerSecond" : "HazardLabel", { name });
  if (hazard.kind === "explosion") {
    await api.roll.damage({ actor, item, label, formula, damageType: "burn" as never, explosive: true, fragmentation: PROPANE_FRAGMENTS, source: "propane" });
    return;
  }
  // An institutional microwave does hit points, not damage (p. 32): nothing stops it and nothing is shoved.
  const injury = hazard.kind === "injury";
  await api.roll.damage({
    actor,
    item,
    label,
    formula,
    damageType: (hazard.kind === "cut" ? "cut" : "burn") as never,
    ...(injury ? { ignoresDr: true, noKnockback: true } : {}),
    source: "householdHazard",
  });
}

// ── the item sheet ──

const workLabel = (work: Work): string => {
  const pace = work.every === 0 ? L("PerUse") : work.every === 1 ? L("PerSecond") : F("EverySeconds", { seconds: work.every });
  return work.against ? F("WorkAgainst", { pace, against: L(`Against.${work.against}`) }) : pace;
};

function itemContext(api: GWorldApi, item: any, on: ToolSwitches): Record<string, unknown> {
  const data = toolData(item);
  const lines: string[] = [];
  const context: Record<string, unknown> = { editable: item.isOwner };
  // A kit, or a tool carried for a skill that could be marked as one.
  if (on.kits() && (data.kit || (item.system?.category === "tool" && (item.system?.forSkills?.length ?? 0) > 0))) {
    context.kit = {
      sizes: KIT_SIZES.map((s) => ({ value: s, label: L(`Kit.${s || "none"}`), selected: s === data.kit })),
      isKit: Boolean(data.kit),
      workshop: data.kit === "workshop",
      lightCraft: data.lightCraft,
      vehicleTons: data.vehicleTons || "",
      closeCrafts: data.closeCrafts.join(", "),
      distantCrafts: data.distantCrafts.join(", "),
    };
    if (data.kit) lines.push(L(`KitLine.${data.kit}`));
    if (data.kit && data.vehicleTons > VEHICLE_TONS) lines.push(F("VehicleLine", { tons: data.vehicleTons, multiplier: Math.round((data.vehicleTons / VEHICLE_TONS) * 100) / 100 }));
    if (data.setupSeconds) lines.push(F("SetupLine", { time: data.setupSeconds >= 60 ? F("Minutes", { minutes: Math.round(data.setupSeconds / 60) }) : F("Seconds", { seconds: data.setupSeconds }) }));
    if (data.partsPerHour) lines.push(F("PartsLine", { pounds: data.partsPerHour }));
  }
  if (on.forcedEntry()) {
    if (data.work) {
      const damage = workDamage(data.work, (base, modifier) => `${base}${modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ""}`, data.carbide);
      lines.push(F("WorkLine", { damage, divisor: data.work.divisor !== 1 ? `(${data.work.divisor})` : "", type: data.work.type, pace: workLabel(data.work) }));
      if (data.work.stRoll !== null) lines.push(F("StRollLine", { modifier: data.work.stRoll >= 0 ? `+${data.work.stRoll}` : String(data.work.stRoll) }));
    }
    if (data.work?.carbideBonus) context.carbide = { checked: data.carbide, label: L("CarbideEdge"), hint: F("CarbideEdgeHint", { bonus: data.work.carbideBonus }) };
    if (data.readies) lines.push(F(data.readiesWaivedAtSt ? "ReadiesWaivedLine" : "ReadiesLine", { readies: data.readies, st: data.readiesWaivedAtSt }));
    if (data.use === "glassCutter") lines.push(F("GlassLine", { penalty: GLASS_CUTTER_REALISTIC }));
    if (data.use === "ductTape") lines.push(L("TapeItemLine"));
  }
  if (on.chainsaws() && data.use === "chainsaw") {
    context.carbide = { checked: data.carbide, label: L("Carbide"), hint: L("CarbideHint") };
    lines.push(L(data.carbide ? "CarbideLine" : "HardLine"));
    const state = sawState(api, item);
    if (state) lines.push(L(state === "stalled" ? "StalledLine" : "SnappedLine"));
  }
  if (on.chainsaws() && data.use === "nailGun") lines.push(F("NailGunLine", { penalty: NAIL_GUN_PENALTY }));
  if (on.hazards() && data.hazard) {
    lines.push(data.hazard.kind === "explosion"
      ? F("PropaneLine", { dr: PROPANE_DR, damage: data.hazard.damage, fragments: PROPANE_FRAGMENTS })
      : F(`HazardLine.${data.hazard.kind}`, { damage: data.hazard.upTo ? `${data.hazard.damage}-${data.hazard.upTo}` : data.hazard.damage, pace: data.hazard.perSecond ? ` ${L("PerSecond")}` : "" }));
  }
  context.lines = lines;
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-tool]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtTool);
      let value: unknown = input.value;
      if (input instanceof HTMLInputElement && input.type === "checkbox") value = input.checked;
      else if (key === "vehicleTons") value = Math.max(0, Number(input.value) || 0);
      await item.update({ [`${path}.${key}`]: value });
    });
  });
}

export function readyTools(api: GWorldApi, on: ToolSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-tools-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-tools-item.hbs`,
    visible: (item) => {
      if (item?.type !== "equipment") return false;
      const context = itemContext(api, item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.kit) || Boolean(context.carbide);
    },
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── tool kits (p. 24) ──
  // A kit made for another specialty, or a workshop for another craft, where none is carried for this one.
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!on.kits() || !api.registry.isRuleOn("equipmentModifiers")) return;
    const value = wrongKitLine(api, context?.actor, String(context?.name ?? ""));
    if (value === null) return;
    const line = (context.lines ?? []).find((l: any) => l?.key === "tools");
    if (line) {
      line.value = value;
      line.reason = L("WrongKitReason");
    } else context.lines?.push?.({ key: "tools", label: L("WrongKit"), value, source: MODULE_ID });
  });

  // A kit for a light craft, or for vehicles over 10 tons; a chainsaw's carbide chain.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-tool-price",
    types: ["equipment"],
    apply: (item, price) => {
      const data = toolData(item);
      let cost = 1;
      let weight = 1;
      const labels: string[] = [];
      if (on.kits() && data.kit) {
        const m = kitPriceMultipliers(data);
        if (m.cost !== 1 || m.weight !== 1) {
          cost *= m.cost;
          weight *= m.weight;
          labels.push(L(data.lightCraft ? "LightCraftPrice" : "VehiclePrice"));
        }
      }
      if (on.chainsaws() && data.use === "chainsaw" && data.carbide) {
        cost *= CARBIDE_CHAIN_COST;
        labels.push(L("CarbidePrice"));
      }
      if (!labels.length) return null;
      return { cost: Math.round(price.cost * cost * 100) / 100, weight: Math.round(price.weight * weight * 1000) / 1000, label: labels.join(", ") };
    },
  });

  // ── forced entry (pp. 25-30) ──
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: WORK_MODE,
    label: L("WorkMode"),
    kind: "melee",
    applies: (item) => on.forcedEntry() && toolData(item).work !== null,
    mode: (item, _actor, helpers: any) => {
      const data = toolData(item);
      const work = data.work!;
      const damage = workDamage(work, (base, modifier) => String(helpers.damage?.(base, modifier) ?? ""), data.carbide);
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const known = helpers.skillLevel?.("Forced Entry") ?? null;
      const notes = [{ label: workLabel(work), hint: L("WorkHint") }];
      if (work.stRoll !== null) notes.push({ label: F("StRollNote", { modifier: work.stRoll >= 0 ? `+${work.stRoll}` : String(work.stRoll) }), hint: L("StRollHint") });
      return {
        mode: L("WorkMode"),
        skillName: "Forced Entry",
        skillLevel: known ?? dx - 5,
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

  // The Ready maneuvers before each use: counted by the row action, required by the attack.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tool-ready",
    itemTypes: ["equipment"],
    label: L("ReadyAction"),
    icon: "fa-solid fa-hand-fist",
    visible: (item) => on.forcedEntry() && toolData(item).readies > 0,
    run: (item, actor) => {
      void (async () => {
        const data = toolData(item);
        const needed = readiesNeeded(data.readies, data.readiesWaivedAtSt, Number(api.actors.attribute(actor, "ST")) || 10);
        if (!needed) return void ui.notifications?.info(F("NoReadiesNeeded", { name: item.name }));
        const done = Math.min(needed, (Number((api.combat.getWeaponState(item, MODULE_ID) as any)?.readied) || 0) + 1);
        await api.combat.setWeaponState(item, MODULE_ID, { readied: done });
        await say(actor, String(item.name ?? ""), [F(done >= needed ? "ReadyDone" : "ReadyCount", { done, needed })]);
      })();
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-glass-cutter",
    itemTypes: ["equipment"],
    label: L("GlassCut"),
    icon: "fa-regular fa-circle",
    visible: (item) => on.forcedEntry() && toolData(item).use === "glassCutter",
    run: (item, actor) => { void cutGlass(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-duct-tape",
    itemTypes: ["equipment"],
    label: L("TapeAction"),
    icon: "fa-solid fa-tape",
    visible: (item) => on.forcedEntry() && toolData(item).use === "ductTape",
    run: (item, actor) => { void tapeUp(api, item, actor); },
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: TAPE_CARD,
    template: `modules/${MODULE_ID}/templates/ht-tools-card.hbs`,
    actions: {
      breakFree: async ({ message, data }: any) => { if (on.forcedEntry()) await breakFree(api, message, data as TapeData); },
    },
  } as any);

  // ── chainsaws (pp. 27-28) ──
  const sawRow = (item: any, actor: any, helpers: any, hard: boolean) => {
    const own = helpers.rows?.(item)?.melee?.[0] ?? {};
    const damage = String(own.damage ?? "");
    const dx = Number(helpers.attribute?.("DX")) || 10;
    const known = helpers.skillLevel?.("Forced Entry") ?? null;
    return {
      mode: L(hard ? "HardMode" : "RescueMode"),
      skillName: "Forced Entry",
      skillLevel: known ?? dx - 5,
      damage,
      damageType: String(own.damageType ?? "cut"),
      armorDivisor: hard ? HARD_MATERIAL_DIVISOR : 1,
      reach: String(own.reach ?? "1"),
      parry: null,
      twoHanded: true,
      damageRollable: api.rules.parseDiceAdds(damage) !== null,
      notes: [{ label: L(hard ? "HardNote" : "RescueNote"), hint: L(hard ? "HardHint" : "RescueHint") }],
    };
  };
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: RESCUE_MODE,
    label: L("RescueMode"),
    kind: "melee",
    applies: (item) => on.chainsaws() && toolData(item).use === "chainsaw" && meleeModes(item).length > 0,
    mode: (item, actor, helpers) => sawRow(item, actor, helpers, false),
  });
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: HARD_MODE,
    label: L("HardMode"),
    kind: "melee",
    applies: (item) => on.chainsaws() && ordinaryChainsaw(item) && meleeModes(item).length > 0,
    mode: (item, actor, helpers) => sawRow(item, actor, helpers, true),
  });

  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!item || !on.chainsaws()) return;
    const data = toolData(item);
    for (const entry of context.rows ?? []) {
      const row = entry?.row;
      if (!row) continue;
      // The combat row: the divisor it takes against hard things (p. 27).
      if (data.use === "chainsaw" && !data.carbide && entry.kind === "melee") {
        row.notes?.push?.({ label: F("HardCombatNote", { divisor: HARD_MATERIAL_DIVISOR }), hint: L("HardHint") });
      }
      // The nail gun, fired with its safety held back (p. 28).
      if (data.use === "nailGun" && entry.kind === "ranged" && typeof row.skillLevel === "number") {
        row.skillLevel = nailGunLevel(row.skillLevel, Boolean(row.atDefault));
        row.notes?.push?.({ label: F("NailGunNote", { penalty: NAIL_GUN_PENALTY }), hint: L("NailGunHint") });
      }
    }
  });

  // A stalled or broken saw doesn't cut; a tool short of its Ready maneuvers isn't ready.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context.refusal) return;
    const data = toolData(item);
    if (on.chainsaws() && data.use === "chainsaw") {
      const state = sawState(api, item);
      if (state) {
        context.refusal = F(state === "stalled" ? "StalledRefusal" : "SnappedRefusal", { name: item.name });
        return;
      }
    }
    const index = Number(context.mode?.index) || 0;
    if (on.forcedEntry() && data.readies && context.mode?.ranged !== true && !context.mode?.derived && index === 0) {
      const needed = readiesNeeded(data.readies, data.readiesWaivedAtSt, Number(api.actors.attribute(context.actor, "ST")) || 10);
      const done = Number((api.combat.getWeaponState(item, MODULE_ID) as any)?.readied) || 0;
      if (done < needed) {
        context.refusal = F("ReadiesRefusal", { name: item.name, done, needed });
        return;
      }
      if (needed && item.isOwner) void api.combat.setWeaponState(item, MODULE_ID, { readied: 0 });
    }
  });

  // A blow from the hard-material row that got nowhere (p. 27).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const item = context?.item;
    if (!on.chainsaws() || !item?.isOwner || !ordinaryChainsaw(item)) return;
    if (context.mode?.derived !== `${MODULE_ID}.${HARD_MODE}`) return;
    if ((Number(context.result?.penetrating) || 0) > 0) return;
    void chainsawFails(api, item, item.actor ?? null);
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-chainsaw-bind",
    itemTypes: ["equipment"],
    label: L("FailedAction"),
    icon: "fa-solid fa-triangle-exclamation",
    visible: (item) => on.chainsaws() && ordinaryChainsaw(item) && !sawState(api, item),
    run: (item, actor) => { void chainsawFails(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-chainsaw-fix",
    itemTypes: ["equipment"],
    label: L("FixAction"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.chainsaws() && toolData(item).use === "chainsaw" && Boolean(sawState(api, item)),
    run: (item, actor) => {
      void (async () => {
        const state = sawState(api, item);
        await api.combat.setWeaponState(item, MODULE_ID, { chainsaw: "" });
        await say(actor, String(item.name ?? ""), [L(state === "stalled" ? "Restarted" : "Repaired")]);
      })();
    },
  });

  // ── household hazards (pp. 31-33) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-hazard",
    itemTypes: ["equipment"],
    label: L("HazardAction"),
    icon: "fa-solid fa-fire",
    visible: (item) => on.hazards() && toolData(item).hazard !== null,
    run: (item, actor) => { void hazardDamage(api, item, actor); },
  });

  api.data.registerPoison({ module: MODULE_ID, key: LEAD, label: "GCC.HT.Tools.Lead", poison: LEAD_POISON as any, available: () => on.hazards() });

  // Past half their HP, the victim's worse symptoms (p. 33): the GM's to pick.
  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    if (!on.hazards() || context?.source !== `${MODULE_ID}.${LEAD}` || !context.actor?.isOwner) return;
    if (!leadSymptomsWorsen(context.symptomsNow ?? [])) return;
    void say(context.actor, L("Lead"), [F("LeadWorse", { name: context.actor.name })]);
  });
}

