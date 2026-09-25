/**
 * High-Tech's weapon families (pp. 88-93, 127, 145-152, 159), registered
 * with the system through the add-on API under four switches. The rules are
 * in `rules.ts`; backblast is the shared engine's, with this book's table.
 *
 *   - **Air guns and stunners (airGunsAndStunners):** the shots an air gun's
 *     charge has left, counted from `gworld.afterShots`; an empty charge
 *     refuses the shot until a fresh one goes in from the gun's sheet; the
 *     Girandoni's damage and range falling as its flask empties. A ranged
 *     stunner's hold: the seconds the trigger stays down are an attack
 *     option, and a victim who fails the roll is stunned (and, for an EMD
 *     stunner, knocked down), with no recovery roll allowed for those
 *     seconds and (20 - HT) more (`holdRecovery`, GWorld API 1.89.0), then
 *     recovers at the shock's penalty.
 *   - **Revolver handling (revolverHandling):** an unsafe revolver carried on
 *     an empty chamber loads a round short; pistol whipping as a derived
 *     melee mode on every handgun; suppressors refused on revolvers, as
 *     `suppressorWorks` says for the accessory rules.
 *   - **Mechanical machine guns (mechanicalMachineGuns):** -5 unfamiliarity,
 *     -1 more to fix a malfunction when unfamiliar, and -8 off the mount. A
 *     Gatling's Broadwell drum, fitted from the gun's sheet: its rounds fed
 *     a cell at a time, a fired-out cell refusing the shot until the drum is
 *     turned from the gun's row. A canister row from the same feed for a gun
 *     whose record gives the round (the Hotchkiss 1-pdr).
 *   - **Backblast (backblast):** the dice the book prints for each launcher
 *     and missile, the cone behind the firer at full and half damage (the
 *     tokens standing in it found through the system's cone areas), and
 *     firing indoors.
 *
 * Minimum range needs nothing here: the system refuses a shot inside a row's
 * minimum range, and the book's launchers, mortars, rockets and missiles
 * carry theirs; the stunners' one yard (p. 89) is set on their records.
 */

import { BACKBLAST_TABLES, backblastFromDice, readyBackblast, type BackblastKind } from "../../../shared/backblast/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isRevolver } from "../rate-of-fire/index.js";
import {
  AXE_MACE_DEFAULT,
  BROADWELL,
  EMPTY_CHAMBER,
  MECHANICAL_MG,
  SAFETY_SETTINGS,
  airBand,
  airShotsLeft,
  cellRoundsLeft,
  firesCanister,
  heldSeconds,
  pistolWhip,
  stunAfterSeconds,
  suppressorWorks,
  unsafeRevolver,
  type AirBand,
  type CanisterRound,
  type SafetySetting,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Families.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Families.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";
const AIR_FLAG = "airCharge";
const HOLD_OPTION = "ht-stunner-hold";
const OFF_MOUNT_OPTION = "ht-off-mount";
/** Before GWorld API 1.89.0 a condition stood for the hold; it is still taken off with the shock's penalty. */
const HELD = "ht-stunner-held";
const SHOCK = "ht-stunner-shock";
const BACKBLAST_KINDS: readonly BackblastKind[] = ["burn", "cr"];

export interface FamilySwitches {
  airGuns: () => boolean;
  revolvers: () => boolean;
  mechanical: () => boolean;
  backblast: () => boolean;
}

/** What this module keeps on a gun for its family, beside #364's fields on the same `firearm` object. */
export function weaponFamilyFields(f: any): Record<string, unknown> {
  const whole = (max: number) => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max });
  return {
    airShots: whole(10000),
    airBands: new f.ArrayField(new f.SchemaField({
      from: whole(10000),
      damage: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      halfDamageRange: whole(100000),
      maxRange: whole(100000),
    })),
    stunSeconds: whole(600),
    emd: new f.BooleanField({ initial: false }),
    safety: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SAFETY_SETTINGS] }),
    carriedFull: new f.BooleanField({ initial: false }),
    suppressible: new f.BooleanField({ initial: false }),
    brainer: new f.BooleanField({ initial: false }),
    mechanicalMg: new f.BooleanField({ initial: false }),
    backblast: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
    backblastType: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...BACKBLAST_KINDS] }),
    // A Broadwell drum the gun takes: its cells and the rounds in each, and whether it is fitted (p. 127).
    drumCells: whole(100),
    drumCellRounds: whole(100),
    drumFitted: new f.BooleanField({ initial: false }),
    // A canister round the gun fires from the same feed (pp. 127-128).
    canister: new f.SchemaField({
      damage: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      accuracy: whole(20),
      halfDamageRange: whole(100000),
      maxRange: whole(100000),
      projectiles: whole(1000),
      // 0 for the gun's own.
      rateOfFire: whole(100),
    }),
  };
}

export interface FamilyData {
  /** The shots an air charge is good for; 0 for a gun that isn't an air gun (p. 88). */
  airShots: number;
  airBands: AirBand[];
  /** The seconds a stunner's trigger stays down unless the shooter says; 0 for a gun that isn't a stunner (p. 89). */
  stunSeconds: number;
  /** An electromuscular-disruption stunner, which knocks its victim down (p. 89). */
  emd: boolean;
  safety: SafetySetting;
  /** An unsafe revolver carried with every chamber loaded (p. 93). */
  carriedFull: boolean;
  /** A revolver built tight enough to take a suppressor (p. 159). */
  suppressible: boolean;
  /** A pistol made for braining foes, swung with Axe/Mace (p. 93). */
  brainer: boolean;
  mechanicalMg: boolean;
  /** The backblast's dice, and its kind (p. 147). */
  backblast: string;
  backblastType: BackblastKind | "";
  drumCells: number;
  drumCellRounds: number;
  drumFitted: boolean;
  canister: CanisterRound;
}

export function familyData(item: any): FamilyData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    airShots: count(d.airShots),
    airBands: (Array.isArray(d.airBands) ? d.airBands : []).map((b: any) => ({ from: count(b?.from), damage: String(b?.damage ?? ""), halfDamageRange: count(b?.halfDamageRange), maxRange: count(b?.maxRange) })),
    stunSeconds: count(d.stunSeconds),
    emd: d.emd === true,
    safety: SAFETY_SETTINGS.includes(d.safety) ? d.safety : "",
    carriedFull: d.carriedFull === true,
    suppressible: d.suppressible === true,
    brainer: d.brainer === true,
    mechanicalMg: d.mechanicalMg === true,
    backblast: String(d.backblast ?? "").trim(),
    backblastType: BACKBLAST_KINDS.includes(d.backblastType) ? d.backblastType : "",
    drumCells: count(d.drumCells),
    drumCellRounds: count(d.drumCellRounds),
    drumFitted: d.drumFitted === true,
    canister: {
      damage: String(d.canister?.damage ?? "").trim(),
      accuracy: count(d.canister?.accuracy),
      halfDamageRange: count(d.canister?.halfDamageRange),
      maxRange: count(d.canister?.maxRange),
      projectiles: count(d.canister?.projectiles),
      rateOfFire: count(d.canister?.rateOfFire),
    },
  };
}

/** Whether a gun has a Broadwell drum fitted (p. 127). */
export function drumFitted(item: any): boolean {
  const data = familyData(item);
  return data.drumFitted && data.drumCells > 0 && data.drumCellRounds > 0;
}

/** The rounds fired from the drum's cell at the feed since it was turned. */
export function firedFromCell(api: GWorldApi, item: any): number {
  return Math.max(0, Math.floor(Number((api.combat.getWeaponState(item, MODULE_ID) as any)?.drumCellFired) || 0));
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/** The shots fired from the air charge in the gun. */
export function airUsed(item: any): number {
  return Math.max(0, Math.floor(Number(item?.flags?.[MODULE_ID]?.[AIR_FLAG]?.used) || 0));
}

/** Whether a gun is an air gun that counts its charge. */
export const isAirGun = (item: any): boolean => familyData(item).airShots > 0;

/** Whether a gun is a ranged electric stunner. */
export const isStunner = (item: any): boolean => familyData(item).stunSeconds > 0;

/** Whether a gun is an unsafe revolver (p. 93). */
export function isUnsafeRevolver(item: any): boolean {
  return unsafeRevolver(isRevolver(item), tlOf(item), familyData(item).safety);
}

/** Whether a suppressor works on the gun (p. 159): for the suppressor rules to ask. */
export function gunTakesSuppressor(item: any): boolean {
  return suppressorWorks(isRevolver(item), familyData(item).suppressible);
}

/** A handgun that can be used to pistol whip: fired with Guns (Pistol), with no melee attack of its own. */
function isHandgun(item: any): boolean {
  if (item?.type !== "equipment" || (item.system?.meleeModes ?? []).length > 0) return false;
  return rangedModes(item).some((m) => /^guns(?: sport)? \(pistol\)/i.test(String(m?.skill ?? "")));
}

/** High-Tech's backblast for an item: the dice its record carries (p. 147). */
export function highTechBackblast(item: any) {
  const data = familyData(item);
  return data.backblast ? backblastFromDice(data.backblast, data.backblastType || "burn") : null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

function itemContext(item: any, on: FamilySwitches): Record<string, unknown> {
  const data = familyData(item);
  const lines: string[] = [];
  const context: Record<string, unknown> = { editable: item.isOwner };
  if (on.airGuns() && data.airShots) {
    const used = airUsed(item);
    context.air = { line: F("AirLine", { left: airShotsLeft(data.airShots, used), shots: data.airShots }), canRecharge: used > 0 };
    const band = airBand(data.airBands, used);
    if (band) lines.push(F("AirBandLine", { damage: band.damage, half: band.halfDamageRange, max: band.maxRange }));
  }
  if (on.airGuns() && data.stunSeconds) lines.push(F(data.emd ? "StunnerEmdLine" : "StunnerLine", { seconds: data.stunSeconds }));
  if (on.revolvers() && isRevolver(item)) {
    const unsafe = isUnsafeRevolver(item);
    context.revolver = {
      safety: SAFETY_SETTINGS.map((s) => ({ value: s, label: s ? L(`Safety.${s}`) : F("Safety.auto", { answer: L(`Safety.${unsafeRevolver(true, tlOf(item), "") ? "unsafe" : "safe"}`) }), selected: data.safety === s })),
      unsafe,
      carriedFull: data.carriedFull,
    };
    if (unsafe) lines.push(L(data.carriedFull ? "CarriedFullLine" : "EmptyChamberLine"));
    if (!gunTakesSuppressor(item)) lines.push(L("NoSuppressorLine"));
  }
  if (on.revolvers() && isHandgun(item)) {
    const bulk = Number(rangedModes(item)[0]?.bulk) || 0;
    const whip = pistolWhip(bulk, data.brainer);
    lines.push(F(data.brainer ? "BrainerLine" : "WhipLine", { modifier: whip.modifier >= 0 ? `+${whip.modifier}` : String(whip.modifier) }));
  }
  if (on.mechanical() && data.mechanicalMg) lines.push(F("MechanicalLine", { unfamiliar: MECHANICAL_MG.unfamiliar, clearing: MECHANICAL_MG.clearing, offMount: MECHANICAL_MG.offMount }));
  if (on.mechanical() && data.drumCells > 0 && data.drumCellRounds > 0) {
    context.drum = { fitted: data.drumFitted };
    lines.push(F("DrumLine", { rounds: data.drumCells * data.drumCellRounds, cells: data.drumCells, cell: data.drumCellRounds, rotate: BROADWELL.rotateReadies, assisted: BROADWELL.rotateAssisted, fit: BROADWELL.fitSeconds }));
  }
  if (on.mechanical() && firesCanister(data.canister)) {
    lines.push(F("CanisterLine", { damage: data.canister.damage, projectiles: data.canister.projectiles, acc: data.canister.accuracy, half: data.canister.halfDamageRange, max: data.canister.maxRange }));
  }
  if (on.backblast()) {
    const blast = highTechBackblast(item);
    if (blast) lines.push(F(blast.kind === "cr" ? "BackblastCrLine" : "BackblastLine", { damage: blast.damage, full: blast.fullYards, half: blast.halfYards }));
  }
  context.lines = lines;
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-family]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtFamily);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      await item.update({ [`${path}.${key}`]: value });
    });
  });
  element.querySelector("[data-gcc-ht-recharge]")?.addEventListener("click", async () => {
    await item.update({ [`flags.${MODULE_ID}.${AIR_FLAG}`]: { used: 0 } });
    await say(item.actor, String(item.name ?? ""), [F("Recharged", { shots: familyData(item).airShots })]);
  });
}

/** The victim's stunner conditions, by id. */
const stunnerConditions = (api: GWorldApi, actor: any): string[] =>
  ((api.actors.conditions(actor) ?? []) as any[]).map((c) => String(c?.id ?? "")).filter((id) => id === `${MODULE_ID}.${HELD}` || id === `${MODULE_ID}.${SHOCK}`);

export function readyWeaponFamilies(api: GWorldApi, on: FamilySwitches): void {
  BACKBLAST_TABLES.register({
    book: "high-tech",
    tls: { min: 0, max: 8 },
    on: on.backblast,
    of: highTechBackblast,
    label: (blast) => F("BackblastLabel", { damage: blast.damage }),
    cone: true,
    i18n: "GCC.HT.Families.Backblast",
  });
  readyBackblast(api);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-families-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-families-item.hbs`,
    visible: (item) => {
      if (item?.type !== "equipment" || rangedModes(item).length === 0) return false;
      const context = itemContext(item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.air) || Boolean(context.revolver) || Boolean(context.drum);
    },
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── air guns (p. 88) ──
  // The Girandoni's shots after the tenth and the twentieth: less damage, shorter range.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!on.airGuns() || !isAirGun(item)) return;
    const data = familyData(item);
    const used = airUsed(item);
    const band = airBand(data.airBands, used);
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      if (band) {
        row.damage = band.damage;
        row.halfDamageRange = band.halfDamageRange;
        row.maxRange = band.maxRange;
      }
      row.notes?.push?.({ label: F("AirNote", { left: airShotsLeft(data.airShots, used) }), hint: band ? F("AirBandHint", { from: band.from }) : L("AirHint") });
    }
  });

  // Firing: an empty charge refuses the shot; a stunner's hold is noted; a mechanical machine gun's unfamiliarity is -5.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context?.mode?.ranged !== true) return;
    if (on.airGuns() && isAirGun(item) && !context.refusal && airShotsLeft(familyData(item).airShots, airUsed(item)) <= 0) {
      context.refusal = L("AirEmpty");
    }
    if (on.airGuns() && isStunner(item) && item.isOwner) {
      const chosen = context.options?.[`${MODULE_ID}.${HOLD_OPTION}`];
      void api.combat.setWeaponState(item, MODULE_ID, { stunnerHold: heldSeconds(chosen, familyData(item).stunSeconds) });
    }
    if (on.mechanical() && familyData(item).mechanicalMg) {
      const line = (context.modifiers ?? []).find((m: any) => m?.key === "unfamiliar");
      if (line) {
        line.value = MECHANICAL_MG.unfamiliar;
        line.label = F("MechanicalUnfamiliar", { label: line.label });
      }
    }
  });

  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!on.airGuns() || !item?.isOwner || !isAirGun(item)) return;
    const fired = Math.max(0, Math.floor(Number(context.fired ?? context.shots) || 0));
    if (!fired) return;
    const data = familyData(item);
    const used = Math.min(data.airShots, airUsed(item) + fired);
    void item.update({ [`flags.${MODULE_ID}.${AIR_FLAG}`]: { used } });
    if (used >= data.airShots) void say(context.actor, String(item.name ?? ""), [L("AirSpent")]);
  });

  // ── ranged electric stunners (p. 89) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: HOLD_OPTION,
    label: L("HoldLabel"),
    attack: "ranged",
    input: { type: "number", min: 0, max: 600 },
    available: (context: any) => on.airGuns() && isStunner(context?.item),
    apply: (context: any, value: unknown) => ({ notes: [F("HoldNote", { seconds: heldSeconds(value, familyData(context?.item).stunSeconds) })] }),
  } as any);

  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    if (!on.airGuns() || !isStunner(item)) return;
    const data = familyData(item);
    const mode = rangedModes(item)[Number(context.mode?.index) || 0] ?? rangedModes(item)[0] ?? {};
    const penalty = Math.min(0, Math.trunc(Number(mode.linked?.afflictionModifier ?? mode.afflictionModifier) || 0));
    const held = heldSeconds((api.combat.getWeaponState(item, MODULE_ID) as any)?.stunnerHold, data.stunSeconds);
    const after = stunAfterSeconds(Number(api.actors.attribute(context.actor, "HT")) || 10);
    const weapon = String(item.name ?? "");
    // No recovery roll while the trigger is held, nor for (20 - HT) seconds after (p. 89).
    context.effects.push({ key: "stunned", holdRecovery: { seconds: held + after } });
    if (data.emd) context.effects.push({ key: "prone" });
    context.effects.push({
      module: MODULE_ID,
      key: SHOCK,
      label: F("ShockLabel", { weapon, penalty }),
      effects: { modifiers: [{ label: F("ShockLine", { weapon }), value: penalty, rolls: ["stunRecovery"] }] },
    });
    void say(context.actor, weapon, [F(data.emd ? "StunnedEmd" : "Stunned", { name: String(context.actor?.name ?? ""), held, after, penalty })]);
  });

  // Recovered: the shock's penalty goes with the stun.
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    if (!(context?.tags ?? []).includes("stunRecovery") || !context?.outcome?.success || !actor) return;
    for (const id of stunnerConditions(api, actor)) void api.actors.removeCondition(actor, id);
  });

  // ── revolvers and pistols (pp. 93, 159) ──
  // An unsafe revolver carried with the hammer on an empty chamber holds a round less.
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    const item = context?.item;
    const entry = context?.entry;
    if (!on.revolvers() || !entry || typeof entry.capacity !== "number" || !isUnsafeRevolver(item) || familyData(item).carriedFull) return;
    entry.capacity = Math.max(1, entry.capacity - EMPTY_CHAMBER);
  });

  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: "ht-pistol-whip",
    label: L("WhipMode"),
    kind: "melee",
    applies: (item) => on.revolvers() && isHandgun(item),
    mode: (item, _actor, helpers: any) => {
      const data = familyData(item);
      const whip = pistolWhip(Number(rangedModes(item)[0]?.bulk) || 0, data.brainer);
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const known = helpers.skillLevel?.(whip.skill) ?? null;
      const use = whip.skill === "Axe/Mace"
        ? { name: "Axe/Mace", level: known ?? dx + AXE_MACE_DEFAULT }
        : known !== null && known > dx ? { name: "Brawling", level: known } : { name: "DX", level: dx };
      const damage = String(helpers.damage?.(whip.attack, whip.modifier) ?? "");
      return {
        mode: L(data.brainer ? "BrainMode" : "WhipMode"),
        skillName: use.name,
        skillLevel: use.level,
        damage,
        damageType: "cr",
        reach: whip.reach,
        parry: null,
        damageRollable: api.rules.parseDiceAdds(damage) !== null,
        notes: data.brainer ? [{ label: L("BrainNote"), hint: L("BrainHint") }] : [],
      };
    },
  });

  // ── mechanical machine guns (p. 127) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: OFF_MOUNT_OPTION,
    label: F("OffMount", { penalty: MECHANICAL_MG.offMount }),
    attack: "ranged",
    available: (context: any) => on.mechanical() && familyData(context?.item).mechanicalMg,
    apply: () => ({ modifiers: [{ label: L("OffMountLine"), value: MECHANICAL_MG.offMount }] }),
  } as any);

  Hooks.on(api.combat.hooks.clearMalfunction, (context: any) => {
    const item = context?.item;
    if (!on.mechanical() || !familyData(item).mechanicalMg) return;
    const mode = rangedModes(item)[Number(context.modeIndex) || 0] ?? rangedModes(item)[0] ?? {};
    const use = (api.roll as any).equipmentUse?.(context.actor, item, String(mode.skill ?? ""));
    const unfamiliar = (use?.tags ?? []).includes("unfamiliar") || (use?.lines ?? []).some((l: any) => l?.key === "unfamiliar");
    if (unfamiliar) context.modifiers.push({ label: L("MechanicalClearing"), value: MECHANICAL_MG.clearing });
  });

  // ── the Broadwell drum (p. 127) ──
  // Fitted, the gun holds the drum's rounds, and a new drum goes in in 10 seconds.
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    const item = context?.item;
    const entry = context?.entry;
    if (!on.mechanical() || !entry || !drumFitted(item)) return;
    const data = familyData(item);
    entry.capacity = data.drumCells * data.drumCellRounds;
    entry.chambered = false;
    entry.reloadSeconds = BROADWELL.fitSeconds;
    entry.fastDrawSeconds = 0;
  });

  // A cell fired out: the drum must be turned before the gun fires again, and a burst takes no more than the cell holds.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!on.mechanical() || context?.mode?.ranged !== true || context.refusal || !drumFitted(item)) return;
    const left = cellRoundsLeft(familyData(item).drumCellRounds, firedFromCell(api, item));
    const shots = Math.max(1, Math.floor(Number(context.shots) || 1) + Math.max(0, Math.floor(Number(context.extraShots) || 0)));
    if (left <= 0) context.refusal = F("DrumTurn", { readies: BROADWELL.rotateReadies, assisted: BROADWELL.rotateAssisted });
    else if (shots > left) context.refusal = F("DrumCellShort", { left });
  });

  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!on.mechanical() || !item?.isOwner || !drumFitted(item)) return;
    const fired = Math.max(0, Math.floor(Number(context.shots) || 0));
    if (fired) void api.combat.setWeaponState(item, MODULE_ID, { drumCellFired: firedFromCell(api, item) + fired });
  });

  // A fresh drum starts at a full cell.
  Hooks.on("updateItem", (item: any, changes: any) => {
    if (!on.mechanical() || !item?.isOwner || !drumFitted(item)) return;
    const modes = foundry.utils.getProperty(changes, "system.rangedModes");
    if (!Array.isArray(modes)) return;
    const full = familyData(item).drumCells * familyData(item).drumCellRounds;
    if (modes.some((m: any) => Number(m?.loaded) >= full) && firedFromCell(api, item) > 0) void api.combat.setWeaponState(item, MODULE_ID, { drumCellFired: 0 });
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-turn-drum",
    itemTypes: ["equipment"],
    label: L("DrumTurnAction"),
    icon: "fa-solid fa-dharmachakra",
    visible: (item) => on.mechanical() && drumFitted(item),
    run: (item, actor) => {
      void api.combat.setWeaponState(item, MODULE_ID, { drumCellFired: 0 })
        .then(() => say(actor, String(item?.name ?? ""), [F("DrumTurned", { readies: BROADWELL.rotateReadies, assisted: BROADWELL.rotateAssisted, cell: familyData(item).drumCellRounds })]));
    },
  });

  // ── canister (pp. 127-128) ──
  // The same round from the same feed, fired as canister: its own row, spending the gun's rounds (API 1.101.0).
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: "ht-canister",
    label: L("CanisterMode"),
    kind: "ranged",
    applies: (item: any) => on.mechanical() && firesCanister(familyData(item).canister),
    mode: (item: any, _actor: unknown, helpers: any) => {
      const base = ((helpers.rows?.(item)?.ranged ?? []) as any[]).find((r) => !r.derivedMode);
      if (!base) return null;
      const round = familyData(item).canister;
      const rest: Record<string, any> = { ...base };
      for (const key of ["itemId", "modeIndex", "name", "mode", "followUp", "followUpAlso", "linked"]) delete rest[key];
      return {
        ...rest,
        mode: L("CanisterMode"),
        damage: round.damage,
        armorDivisor: 1,
        accuracy: round.accuracy,
        halfDamageRange: round.halfDamageRange,
        maxRange: round.maxRange,
        projectiles: round.projectiles,
        ...(round.rateOfFire ? { rateOfFire: round.rateOfFire } : {}),
        recoil: 1,
        damageRollable: api.rules.parseDiceAdds(round.damage) !== null,
        spendsFrom: Math.max(0, Math.floor(Number(base.modeIndex) || 0)),
        notes: [...(rest.notes ?? []), { label: L("CanisterMode"), hint: L("CanisterHint") }],
      };
    },
  } as any);
}
