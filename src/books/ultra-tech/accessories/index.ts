/**
 * GURPS Ultra-Tech's firearm accessories, registered with the system through
 * the add-on API (pp. 149-152).
 *
 *   - **init:** the accessory fields on a weapon (scope, rails, harness,
 *     access control, self-destruct, D-tag, IFF, smartgrip, gravitic
 *     compensator, tripod) and on a tactical program (which one, and the
 *     Guns or Gunner specialization targeting software is for).
 *   - **ready:** what they add to a weapon's price and weight, and a
 *     program's multiple of the table price; the weapon's rows with the ST
 *     and Recoil a harness, grip, compensator or tripod leaves; on a shot,
 *     the scope, the HUD link, targeting software, active-sensor targeting,
 *     a harness against Move and Attack, and bracing; a sniper mirror as an
 *     attack option; a power holster's Fast-Draw and TacNet's Tactics; and
 *     row actions for bypassing access control, the self-destruct and a
 *     repair with the diagnostic computer.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { beamFamily } from "../beams/rules.js";
import { computerData } from "../computers/data.js";
import { hudSource } from "../interfaces/index.js";
import { ACTIVE_TARGETING, lockedSensor } from "../sensors/index.js";
import {
  ACCESS,
  ACCESS_CONTROLS,
  DIAGNOSTIC_COMPUTER,
  D_TAG,
  HARNESS_KINDS,
  IFF_COST,
  POWER_HOLSTER_SKILLS,
  PROGRAM_COST,
  RAIL,
  SCOPES,
  SCOPE_KINDS,
  SELF_DESTRUCT,
  SERVOMOUNT_NO_HUD,
  SMARTGRIP,
  SNIPER_MIRROR,
  TRIPODS,
  TRIPOD_KINDS,
  accessControlCost,
  activeSensorTargeting,
  armourySkillFor,
  articulatedFits,
  articulatedMinSt,
  circumventSelfDestruct,
  graviticCompensator,
  harnessPrice,
  hasSmartgunElectronics,
  hudLinkBonus,
  iffRange,
  minStPenaltyAfter,
  powerHolsterBonus,
  scopeAfterAiming,
  scopeBonus,
  scopeMagnification,
  scopeVision,
  tacNetBonus,
  targetingProgramBonus,
  type AccessControl,
  type HarnessKind,
  type ScopeKind,
  type TripodKind,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Accessories.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Accessories.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "accessories";
const PROGRAMS = ["silhouette", "tacNet", "targeting", "targetTracking"] as const;
type Program = (typeof PROGRAMS)[number];
const MIRROR_OPTION = "ut-sniper-mirror";

interface AccessoryData {
  scope: ScopeKind | "";
  rails: number;
  harness: HarnessKind | "";
  accessControl: AccessControl | "";
  selfDestruct: boolean;
  dTag: boolean;
  iff: boolean;
  smartgrip: boolean;
  compensator: boolean;
  tripod: TripodKind | "";
  /** The setting leaves out the smartgun electronics a TL9+ firearm has (p. 149). */
  noSmartgun: boolean;
  program: Program | "";
  programSkill: string;
}

export function initAccessories(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  const choice = (values: readonly string[]) => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...values] });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      scope: choice(SCOPE_KINDS),
      rails: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: RAIL.most }),
      harness: choice(HARNESS_KINDS),
      accessControl: choice(ACCESS_CONTROLS),
      selfDestruct: flag(),
      dTag: flag(),
      iff: flag(),
      smartgrip: flag(),
      compensator: flag(),
      tripod: choice(TRIPOD_KINDS),
      noSmartgun: flag(),
      program: choice(PROGRAMS),
      programSkill: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
    }),
  });
}

function accessoryData(item: any): AccessoryData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const pick = <T extends string>(values: readonly T[], value: unknown): T | "" => (values.includes(value as T) ? (value as T) : "");
  return {
    scope: pick(SCOPE_KINDS, data.scope),
    rails: Math.max(0, Math.min(RAIL.most, Math.floor(Number(data.rails) || 0))),
    harness: pick(HARNESS_KINDS, data.harness),
    accessControl: pick(ACCESS_CONTROLS, data.accessControl),
    selfDestruct: Boolean(data.selfDestruct),
    dTag: Boolean(data.dTag),
    iff: Boolean(data.iff),
    smartgrip: Boolean(data.smartgrip),
    compensator: Boolean(data.compensator),
    tripod: pick(TRIPOD_KINDS, data.tripod),
    noSmartgun: Boolean(data.noSmartgun),
    program: pick(PROGRAMS, data.program),
    programSkill: String(data.programSkill ?? ""),
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;
const carried = (item: any) => item?.type === "equipment" && item.system?.carried !== false;
const isWeapon = (item: any) => item?.type === "equipment" && (item.system?.rangedModes ?? []).length > 0;
const isProgramItem = (item: any) => item?.type === "equipment" && computerData(item).complexity > 0 && !isWeapon(item);
const loadedWeight = (item: any) => Math.max(0, Number(item?.system?.weight) || 0);

/** Whether a weapon has the smartgun electronics: a TL9+ firearm, unless the setting leaves them out (p. 149). */
function smartgun(item: any, data = accessoryData(item)): boolean {
  return !data.noSmartgun && hasSmartgunElectronics(tlOf(item), String(item?.system?.weaponClass ?? "") === "firearm");
}

/** A program a character carries, of a kind, with its Complexity. */
function programsOf(actor: any, program: Program): Array<{ item: any; complexity: number; skill: string }> {
  return [...(actor?.items ?? [])]
    .filter((item: any) => carried(item) && isProgramItem(item) && accessoryData(item).program === program)
    .map((item: any) => ({ item, complexity: computerData(item).complexity, skill: accessoryData(item).programSkill }));
}

const sameSkill = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/\/tl\d*\^?/g, "").replace(/\s+/g, " ").trim();
  return Boolean(a.trim()) && norm(a) === norm(b);
};

/** The yards to the first target, measured on the canvas, or null. */
function yardsTo(actor: any, target: any): number | null {
  const stage = (globalThis as any).canvas;
  const a = actor?.getActiveTokens?.()?.[0];
  const b = target?.getActiveTokens?.()?.[0];
  if (!a?.center || !b?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([a.center, b.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/** What the accessories fitted to a weapon add to its price and weight. */
export function accessoryPrice(item: any, data = accessoryData(item)): { cost: number; weight: number } {
  const w = loadedWeight(item);
  let cost = 0;
  let weight = 0;
  if (data.scope) {
    cost += SCOPES[data.scope].cost;
    weight += SCOPES[data.scope].weight;
  }
  cost += data.rails * RAIL.cost;
  weight += data.rails * RAIL.weight;
  if (data.harness) {
    const harness = harnessPrice(data.harness, w);
    cost += harness.cost;
    weight += harness.weight;
  }
  cost += accessControlCost(data.accessControl, smartgun(item, data));
  if (data.selfDestruct) cost += SELF_DESTRUCT.cost;
  if (data.dTag) cost += D_TAG.cost;
  if (data.iff) cost += IFF_COST;
  if (data.smartgrip) cost += SMARTGRIP.cost;
  if (data.compensator) {
    const compensator = graviticCompensator(w);
    cost += compensator.cost;
    weight += compensator.weight;
  }
  if (data.tripod) {
    cost += TRIPODS[data.tripod].cost;
    weight += TRIPODS[data.tripod].weight;
  }
  return { cost, weight };
}

function itemContext(item: any): Record<string, unknown> {
  const data = accessoryData(item);
  const options = (values: readonly string[], chosen: string, prefix: string) =>
    ["", ...values].map((value) => ({ value, label: L(`${prefix}.${value || "none"}`), selected: value === chosen }));
  const program = isProgramItem(item);
  const weapon = isWeapon(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  if (weapon) {
    const mode = item.system.rangedModes[0] ?? {};
    if (smartgun(item, data)) lines.push(L("Smartgun"));
    if (data.scope) {
      lines.push(F("ScopeLine", { bonus: scopeBonus(data.scope, tl), magnification: scopeMagnification(data.scope, tl), vision: L(`Vision.${scopeVision(data.scope, tl)}`), power: SCOPES[data.scope].power }));
    } else if (smartgun(item, data)) lines.push(F("HudLine", { yards: 300 }));
    if (data.harness === "articulated" && !articulatedFits(Number(mode.bulk) || 0)) lines.push(L("ArticulatedBulk"));
    if (data.harness === "servomount") lines.push(L("ServomountLine"));
    if (data.accessControl || smartgun(item, data)) lines.push(F("AccessLine", { penalty: ACCESS.bypass, seconds: ACCESS.firstSeconds, minutes: ACCESS.laterMinutes }));
    if (data.selfDestruct) lines.push(F("SelfDestructLine", { seconds: SELF_DESTRUCT.seconds, damage: SELF_DESTRUCT.damage, penalty: SELF_DESTRUCT.circumvent, minutes: SELF_DESTRUCT.attemptMinutes }));
    if (data.dTag) lines.push(F("DTagLine", { penalty: D_TAG.deactivate }));
    if (data.iff) lines.push(F("IffLine", { yards: iffRange(tl).toLocaleString() }));
    if (data.compensator) lines.push(F("CompensatorLine", { cells: graviticCompensator(loadedWeight(item)).cells }));
    if (data.tripod) lines.push(F(mode.mount === "mounted" ? "TripodLine" : "TripodNotMounted", { st: TRIPODS[data.tripod].maxSt, readies: TRIPODS[data.tripod].readies }));
  }
  if (program && data.program) {
    const complexity = computerData(item).complexity;
    if (data.program === "targeting") lines.push(F("TargetingLine", { bonus: targetingProgramBonus(complexity), skill: data.programSkill || L("NoSkill") }));
    if (data.program === "tacNet") lines.push(F("TacNetLine", { bonus: tacNetBonus(complexity) }));
    lines.push(F("ProgramCost", { times: PROGRAM_COST[data.program] }));
  }
  return {
    data,
    weapon,
    program,
    editable: item.isOwner,
    scopes: options(SCOPE_KINDS, data.scope, "Scope"),
    harnesses: options(HARNESS_KINDS, data.harness, "Harness"),
    accessControls: options(ACCESS_CONTROLS, data.accessControl, "Access"),
    tripods: options(TRIPOD_KINDS, data.tripod, "Tripod"),
    programs: options(PROGRAMS, data.program, "Program"),
    targeting: data.program === "targeting",
    lines,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-accessory]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtAccessory);
      let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "rails") value = Math.max(0, Math.min(RAIL.most, Math.floor(Number(input.value) || 0)));
      void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
    });
  });
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-title">${esc(title)}</div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The better of two skills, by the character's level. */
function bestSkill(api: GWorldApi, actor: any, skills: string[]): { skill: string; base: number } {
  const levels = skills.map((skill) => ({ skill, base: api.actors.skillLevel(actor, skill) }));
  const known = levels.filter((l): l is { skill: string; base: number } => l.base !== null).sort((a, b) => b.base - a.base);
  return known[0] ?? { skill: skills[0]!, base: (api.actors.attribute(actor, "IQ") ?? 10) - 5 };
}

/** Deactivating or reprogramming access control (p. 150). */
async function bypassAccess(api: GWorldApi, item: any, actor: any): Promise<void> {
  const { skill, base } = bestSkill(api, actor, ["Armoury (Small Arms)", "Electronics Operation (Security)"]);
  await api.roll.success({ actor, base, skill, label: F("BypassLabel", { name: item.name }), modifiers: [{ label: L("BypassPenalty"), value: ACCESS.bypass }] } as any);
  await say(actor, String(item.name), [F("BypassTime", { seconds: ACCESS.firstSeconds, minutes: ACCESS.laterMinutes })]);
}

/** The self-destruct: a stranger's hands start it, a try at circumventing it may too (p. 150). */
async function antiTheft(api: GWorldApi, item: any, actor: any): Promise<void> {
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AntiTheftTitle") },
    content: `<div class="gworld" style="display:grid;gap:6px"><label><input type="radio" name="what" value="circumvent" checked /> ${esc(F("Circumvent", { penalty: SELF_DESTRUCT.circumvent, minutes: SELF_DESTRUCT.attemptMinutes }))}</label><label><input type="radio" name="what" value="explode" /> ${esc(F("Explode", { seconds: SELF_DESTRUCT.seconds }))}</label></div>`,
    ok: { label: L("AntiTheftTitle"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>("[name=what]:checked")?.value ?? "circumvent" },
    rejectClose: false,
  }) as string | null;
  if (!choice) return;
  let explodes = choice === "explode";
  if (choice === "circumvent") {
    const skill = "Electronics Operation (Security)";
    const result: any = await api.roll.success({ actor, base: api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5, skill, label: F("CircumventLabel", { name: item.name }), modifiers: [{ label: L("AntiTheftTitle"), value: SELF_DESTRUCT.circumvent }] } as any);
    if (!result) return;
    const outcome = circumventSelfDestruct(Boolean(result.success), Boolean(result.critical));
    await say(actor, String(item.name), [L(`Outcome.${outcome}`)]);
    explodes = outcome === "explodes";
  }
  if (explodes) await api.roll.damage({ actor, label: F("ExplodeLabel", { name: item.name }), formula: SELF_DESTRUCT.damage, damageType: "cr", explosive: true } as any);
}

/** Fixing damage or a malfunction with the diagnostic computer's +1 (p. 151). */
async function diagnose(api: GWorldApi, item: any, actor: any): Promise<void> {
  const skill = armourySkillFor(String(item.system?.rangedModes?.[0]?.skill ?? ""));
  const base = api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  await api.roll.success({ actor, base, skill, label: F("RepairLabel", { name: item.name }), modifiers: [{ label: L("Diagnostic"), value: DIAGNOSTIC_COMPUTER }] } as any);
}

export function readyAccessories(api: GWorldApi, on: () => boolean): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-accessories",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on()) return null;
      const data = accessoryData(item);
      // A tactical program costs a multiple of the table's price (pp. 149-150),
      // which the computers' modifier has already set.
      if (isProgramItem(item) && data.program && !(Number(item.system?.listCost) || Number(item.system?.cost))) {
        return { cost: Math.round(price.cost * PROGRAM_COST[data.program] * 100) / 100, label: L("Title") };
      }
      if (!isWeapon(item)) return null;
      const added = accessoryPrice(item, data);
      if (!added.cost && !added.weight) return null;
      return { cost: Math.round((price.cost + added.cost) * 100) / 100, weight: Math.round((price.weight + added.weight) * 1000) / 1000, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-accessories-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-accessories-item.hbs`,
    visible: (item) => on() && (isWeapon(item) || isProgramItem(item)),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  // The rows: the ST a harness, grip, compensator or tripod leaves, and Recoil 1 (pp. 151-152).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !isWeapon(context?.item)) return;
    const data = accessoryData(context.item);
    const st = Number(api.actors.attribute(context.actor, "ST")) || 10;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      const had = Number(row.minStPenalty) || 0;
      let minSt: number | null = row.minSt ?? null;
      const notes: string[] = [];
      if (data.tripod && entry.mode?.mount === "mounted" && minSt !== null && minSt <= TRIPODS[data.tripod].maxSt) {
        minSt = null;
        notes.push("Tripod");
      } else if (data.compensator) {
        minSt = null;
        notes.push("Compensator");
      } else {
        if (data.harness === "articulated") {
          minSt = articulatedMinSt(minSt);
          notes.push("Articulated");
        }
        if (data.smartgrip && minSt !== null) {
          minSt = Math.max(0, minSt + SMARTGRIP.st);
          notes.push("Smartgrip");
        }
      }
      if (data.compensator && Number(row.recoil) > 1) row.recoil = 1;
      if (!notes.length) continue;
      const now = minStPenaltyAfter(st, minSt, had);
      row.minSt = minSt;
      if (typeof row.skillLevel === "number") row.skillLevel += now - had;
      row.minStPenalty = now;
      for (const note of notes) row.notes.push({ label: L(`Notes.${note}`), hint: L(`Hints.${note}`) });
    }
  });

  // The shot: scope, HUD link, targeting software, active sensors, harnesses (pp. 149-151).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged !== true || !isWeapon(context?.item)) return;
    const { actor, item } = context;
    const data = accessoryData(item);
    const mode = item.system.rangedModes[Number(context.mode.index) || 0] ?? {};
    const modifiers = context.modifiers as Array<{ label: string; value: number }>;
    const lineOf = (key: string) => modifiers.find((m) => m.label === game.i18n.localize(`GWORLD.Ranged.${key}`));
    const accuracy = lineOf("Accuracy");
    const aimed = Boolean(accuracy);
    const seconds = Math.max(1, Number(actor?.system?.aim?.turns) || 0);
    const targets = (context.targets ?? []) as any[];
    const yards = targets[0] ? yardsTo(actor, targets[0]) : null;
    const hud = hudSource(actor);
    const linked = smartgun(item, data) && Boolean(hud);
    const skill = String(mode.skill ?? "");

    // A mounted weapon, a targeting program and a locked tactical sensor: the weapon's Acc replaces the rest (p. 150).
    const locked = lockedSensor(api, actor, targets);
    const program = programsOf(actor, "targeting").find((p) => targetingProgramBonus(p.complexity) > 0);
    if (/^gunner\b/i.test(skill) && program && locked?.tactical) {
      context[ACTIVE_TARGETING] = true;
      modifiers.push({ label: F("ActiveTargeting", { sensor: locked.item.name }), value: activeSensorTargeting(Number(mode.accuracy) || 0) });
    } else {
      let scope = 0;
      if (aimed && data.scope) {
        scope = scopeAfterAiming(scopeBonus(data.scope, tlOf(item)), seconds);
        if (scope) modifiers.push({ label: L(`Scope.${data.scope}`), value: scope });
      }
      if (aimed && linked) {
        const link = hudLinkBonus(yards, scope);
        if (link) modifiers.push({ label: F("HudLink", { hud }), value: link });
      }
      if (linked) {
        const software = programsOf(actor, "targeting").filter((p) => sameSkill(p.skill, skill)).map((p) => targetingProgramBonus(p.complexity));
        const best = Math.max(0, ...software);
        if (best) modifiers.push({ label: L("Program.targeting"), value: best });
      }
    }

    // A gyrostabilized harness or a servomount cancels Move and Attack's Bulk (pp. 150-151).
    const bulk = lineOf("Bulk");
    if (bulk && (data.harness === "gyrostabilized" || data.harness === "servomount") && (yards === null || yards > 1)) {
      modifiers.push({ label: L(`Harness.${data.harness}`), value: -bulk.value });
    }
    // A servomount without a HUD: -2, and no Aim (p. 151).
    if (data.harness === "servomount" && !hud) {
      modifiers.push({ label: L("ServomountNoHud"), value: SERVOMOUNT_NO_HUD });
      if (accuracy) modifiers.push({ label: L("ServomountNoAim"), value: -accuracy.value });
    }
    // An articulated harness counts as braced (p. 151).
    if (aimed && data.harness === "articulated" && !lineOf("Braced")) modifiers.push({ label: L("Harness.articulated"), value: 1 });
  });

  // A sniper mirror: a visible-light laser fired at the target's image, at -4 (p. 151).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: MIRROR_OPTION,
    label: L("MirrorLabel"),
    attack: "ranged",
    available: (context: any) => on() && beamFamily(String(context?.item?.name ?? "")) === "laser" && [...(context?.actor?.items ?? [])].some((i: any) => carried(i) && /^Sniper Mirror$/i.test(String(i.name))),
    apply: () => ({ modifiers: [{ label: L("MirrorLabel"), value: SNIPER_MIRROR }], notes: [L("MirrorNote")] }),
  } as any);

  // A power holster's Fast-Draw and TacNet's Tactics (pp. 149, 151).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on() || !actor || !skill) return;
    if (POWER_HOLSTER_SKILLS.some((s) => sameSkill(s, skill))) {
      const holster = [...(actor.items ?? [])].find((i: any) => carried(i) && /^Power Holster$/i.test(String(i.name)));
      if (holster) context.modifiers.push({ label: String(holster.name), value: powerHolsterBonus(tlOf(holster)) });
    }
    if (sameSkill("Tactics", skill)) {
      const best = Math.max(0, ...programsOf(actor, "tacNet").map((p) => tacNetBonus(p.complexity)));
      if (best) context.modifiers.push({ label: L("Program.tacNet"), value: best });
    }
  });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-access-control", itemTypes: ["equipment"], label: L("BypassTitle"), icon: "fa-solid fa-fingerprint", visible: (item) => on() && isWeapon(item) && (Boolean(accessoryData(item).accessControl) || smartgun(item)), run: (item, actor) => bypassAccess(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-anti-theft", itemTypes: ["equipment"], label: L("AntiTheftTitle"), icon: "fa-solid fa-bomb", visible: (item) => on() && isWeapon(item) && accessoryData(item).selfDestruct, run: (item, actor) => antiTheft(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-diagnostic", itemTypes: ["equipment"], label: L("RepairTitle"), icon: "fa-solid fa-screwdriver-wrench", visible: (item) => on() && isWeapon(item) && smartgun(item), run: (item, actor) => diagnose(api, item, actor) });
}
