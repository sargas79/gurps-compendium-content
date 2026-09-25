/**
 * The Electricity and Electronics supplement's device conventions (HT:EE
 * pp. 8-9, 15), registered with the system through the add-on API under
 * three of High-Tech's switches. The rules are in `rules.ts`; what a record
 * says about a device is its `device` data, which the catalogue writes and
 * the item sheet edits.
 *
 *   - **Cutting-edge gear (cuttingEdgeGear):** a device marked cutting edge
 *     -- just past the prototype stage, or a new high-end version -- priced
 *     one grade up: x5 at basic quality, x20 at good, and fine not sold
 *     (HT:EE p. 8). A prototype's complexity and the year it was first built
 *     (in brackets), and the year it came on the market, on the item sheet,
 *     with what inventing it takes under the Basic Set's rules (Campaigns
 *     pp. 473-474), a grade easier for a carrier of a later TL. A device
 *     bought used, at the percentage of the new price the GM sets (50-80%
 *     for a recent model, 10% or less for an old one, p. 8).
 *   - **Breakable parts (breakableComponents):** a device's HP, HT and DR
 *     where its record states none -- HP from its weight as an Unliving
 *     object, 1 at negligible weight, HT 10, DR 2 or 0 for a fragile one --
 *     as the object the system breaks (`gworld.objectStats`), hurt as a
 *     machine (Unliving) is; and a row action for a device with fragile
 *     parts (tubes, bulbs) that is dropped or thrown: the collision damage
 *     at its speed, rolled once, taken whole
 *     by each part with no DR, the parts at -1xHP rolling HT or breaking, and
 *     the device's own injury past its DR (HT:EE pp. 8-9), put on the item
 *     through `items.applyDamage` (#549). A broken part stops the device:
 *     a roll made with it is refused until the parts are replaced. Parts
 *     left at 0 HP or less work, but roll HT for each second of use
 *     (Campaigns p. 484) -- after each roll made with the device, or from a
 *     row action for a use no roll covers -- and each that fails stops.
 *   - **Kits (kitBuilding):** a device bought as a kit at a quarter of its
 *     price (20% for the parts, 5% for the instructions), and a row action
 *     that builds it as a single copy, rolled against IQ or a Hobby Skill as
 *     the One-Task Wonder the instructions amount to, with Time Spent against
 *     half the grade's prototype time (HT:EE p. 15; Campaigns pp. 346, 474).
 *     The finished device is no longer a kit.
 *
 * These apply to High-Tech's records (the supplement's are High-Tech's,
 * decision E1) and to gear that names no book; another book's records keep
 * their own rules.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import {
  COMPLEXITIES,
  DEVICE_HT,
  complexityOf,
  copyTime,
  cuttingEdgeFactor,
  deviceInjury,
  deviceStatistics,
  inventionFigures,
  kitBuilder,
  kitGrade,
  kitPrice,
  USED_OLD,
  USED_RECENT,
  partOutcome,
  partsBroken,
  partsFailing,
  partsStopping,
  rollsOnTheDevice,
  unavailableWhileNew,
  usedPercent,
  usedPrice,
  yearOf,
  type Complexity,
  type GradeRow,
  type PartState,
  type Surface,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Devices.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Devices.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The key the device's data sits under, in this module's own extension. */
const FIELD = "device";

export interface DeviceSwitches {
  cuttingEdge: () => boolean;
  breakable: () => boolean;
  kits: () => boolean;
  /** Combined devices (HT:EE p. 9; #487): marks a device built from separate parts. */
  combined?: () => boolean;
}

/** What a record says about a device. */
export interface DeviceData {
  /** A prototype's complexity, as the Basic Set's invention grades name it; null for none. */
  complexity: Complexity | null;
  /** The year a working model was first built, printed in brackets; null for none. */
  prototypeYear: number | null;
  /** The year it came on the market; null for none. */
  marketYear: number | null;
  cuttingEdge: boolean;
  kit: boolean;
  /** A device more fragile than its HP say, DR 0: a bulb, a tube. */
  fragile: boolean;
  /** An early device combined from separate parts, -2 to use (HT:EE p. 9). */
  combined: boolean;
  /** HP, HT and DR where the record states them; null to take the supplement's defaults. */
  hp: number | null;
  ht: number | null;
  dr: number | null;
  /** The fragile parts inside it, their HP and HT, how many are broken, and how many work below 0 HP. */
  parts: { count: number; label: string; hp: number; ht: number; broken: number; failing: number };
  /** Bought used, at this percentage of the new price; 0 for new (HT:EE p. 8). */
  used: number;
  /** Audio gear (HT:EE pp. 30-32): the link's sound quality where the GM states one, null to read it from the grade. */
  soundQuality: number | null;
  /** A carbon microphone: improvised for high fidelity, and tougher (HT:EE p. 31). */
  carbonMicrophone: boolean;
  /** The cheaper microphone, at a fifth of the price (HT:EE p. 31). */
  inexpensive: boolean;
  /** A public address system's speakers beyond the first (HT:EE p. 32). */
  extraSpeakers: number;
  /** An early model: a power drill's clumsier grip, a diathermy set's Tesla coil (HT:EE pp. 13, 24). */
  earlyModel: boolean;
  /** A circular saw fitted with an abrasive diamond blade (HT:EE p. 24). */
  diamondBlade: boolean;
  /** Built to be run by remote control, at 10% more (HT:EE p. 25). */
  remoteControl: boolean;
  /** Fitted with an emergency stop (HT:EE p. 25). */
  emergencyStop: boolean;
  /** An electromagnet's core, and its interior diameter and coil length in inches; no core to read the record's (HT:EE pp. 22-23). */
  magnet: { core: "" | "iron" | "superconducting"; diameter: number; length: number };
  /** Military electronics, built rugged: HT 12 and DR 8 (HT:EE p. 45). */
  military: boolean;
  /** A surveillance camera with pan, tilt and zoom (HT:EE p. 45). */
  panTiltZoom: boolean;
  /** The specialty a device is designed for, blank for none: a laser scalpel's Surgery (HT:EE p. 14). */
  specialty: string;
}

/** Adds the device fields to this module's data on equipment and armour. */
export function initDevices(): void {
  const f = foundry.data.fields as any;
  const count = (initial = 0, min = 0) => new f.NumberField({ required: true, nullable: false, integer: true, initial, min });
  const stated = () => new f.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      complexity: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...COMPLEXITIES] }),
      prototypeYear: count(),
      marketYear: count(),
      cuttingEdge: new f.BooleanField({ initial: false }),
      kit: new f.BooleanField({ initial: false }),
      fragile: new f.BooleanField({ initial: false }),
      combined: new f.BooleanField({ initial: false }),
      hp: stated(),
      ht: stated(),
      dr: stated(),
      parts: new f.SchemaField({
        count: count(),
        label: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
        hp: count(1, 1),
        ht: count(10, 1),
        broken: count(),
        failing: count(),
      }),
      used: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 100 }),
      soundQuality: new f.NumberField({ required: true, nullable: true, integer: true, initial: null, min: -10, max: 10 }),
      carbonMicrophone: new f.BooleanField({ initial: false }),
      inexpensive: new f.BooleanField({ initial: false }),
      extraSpeakers: count(),
      earlyModel: new f.BooleanField({ initial: false }),
      diamondBlade: new f.BooleanField({ initial: false }),
      remoteControl: new f.BooleanField({ initial: false }),
      emergencyStop: new f.BooleanField({ initial: false }),
      magnet: new f.SchemaField({
        core: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "iron", "superconducting"] }),
        diameter: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        length: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      }),
      military: new f.BooleanField({ initial: false }),
      panTiltZoom: new f.BooleanField({ initial: false }),
      specialty: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
    }),
  });
}

/** The device data on an item, with nothing missing. */
export function deviceData(item: any): DeviceData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const whole = (v: unknown, min = 0) => Math.max(min, Math.floor(Number(v) || 0));
  const stated = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const p = d.parts ?? {};
  const count = whole(p.count);
  const broken = Math.min(count, whole(p.broken));
  return {
    complexity: complexityOf(d.complexity),
    prototypeYear: yearOf(d.prototypeYear),
    marketYear: yearOf(d.marketYear),
    cuttingEdge: d.cuttingEdge === true,
    kit: d.kit === true,
    fragile: d.fragile === true,
    combined: d.combined === true,
    hp: stated(d.hp),
    ht: stated(d.ht),
    dr: stated(d.dr),
    parts: { count, label: String(p.label ?? "").trim(), hp: whole(p.hp, 1), ht: Number(p.ht) >= 1 ? whole(p.ht, 1) : DEVICE_HT, broken, failing: Math.min(count - broken, whole(p.failing)) },
    used: usedPercent(d.used),
    soundQuality: typeof d.soundQuality === "number" && Number.isFinite(d.soundQuality) ? Math.max(-10, Math.min(10, Math.trunc(d.soundQuality))) : null,
    carbonMicrophone: d.carbonMicrophone === true,
    inexpensive: d.inexpensive === true,
    extraSpeakers: whole(d.extraSpeakers),
    earlyModel: d.earlyModel === true,
    diamondBlade: d.diamondBlade === true,
    remoteControl: d.remoteControl === true,
    emergencyStop: d.emergencyStop === true,
    magnet: {
      core: d.magnet?.core === "iron" || d.magnet?.core === "superconducting" ? d.magnet.core : "",
      diameter: Math.max(0, Number(d.magnet?.diameter) || 0),
      length: Math.max(0, Number(d.magnet?.length) || 0),
    },
    military: d.military === true,
    panTiltZoom: d.panTiltZoom === true,
    specialty: String(d.specialty ?? "").trim(),
  };
}

/** Writes part of the device data. */
export function storeDevice(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}

/** Whether the conventions reach an item: High-Tech's gear, or gear that names no book. */
export function isDevice(item: any): boolean {
  if (item?.type !== "equipment") return false;
  const book = bookOf(item);
  return book === null || book === "high-tech";
}

/**
 * Whether the default HP, HT and DR apply: a High-Tech record that isn't a
 * weapon (a weapon keeps the Basic Set's figures for its make). Gear of no
 * book keeps the system's figures, so switching the rule on doesn't change
 * the Basic Set's own records.
 */
export function takesDeviceStatistics(item: any): boolean {
  if (item?.type !== "equipment" || bookOf(item) !== "high-tech") return false;
  const system = item.system ?? {};
  return !(system.meleeModes?.length > 0 || system.rangedModes?.length > 0 || system.category === "weapon");
}

/** A device's weight, as the character carries it. */
function weightOf(item: any): number {
  return Math.max(0, Number(item?.effectivePrice?.weight ?? item?.system?.weight) || 0);
}

/** The item's TL, where it states one. */
function tlOf(api: GWorldApi, value: unknown): number | null {
  const tl = api.rules.parseTechLevel(String(value ?? ""));
  return typeof tl === "number" && Number.isFinite(tl) ? tl : null;
}

/** A device's HP, HT and DR under the supplement's conventions (HT:EE p. 9). */
export function statisticsOf(api: GWorldApi, item: any): { hp: number; ht: number; dr: number } {
  const data = deviceData(item);
  return deviceStatistics({
    weight: weightOf(item),
    fragile: data.fragile,
    stated: { hp: data.hp, ht: data.ht, dr: data.dr },
    hitPoints: (weight) => api.rules.objectHitPoints(weight, "unliving"),
  });
}

/** A dice-and-adds for the text: "2d days", "1d-2 days". */
function diceText(api: GWorldApi, dice: { dice: number; adds: number }): string {
  return api.rules.formatDiceAdds({ dice: dice.dice, adds: dice.adds } as never);
}

/** The line that says what the Basic Set's invention rules ask of a prototype, or of a copy of it. */
function inventionLines(api: GWorldApi, item: any, data: DeviceData): string[] {
  if (!data.complexity) return [];
  const figures = inventionFigures({
    complexity: data.complexity,
    inventorTl: tlOf(api, item?.actor?.system?.tl),
    deviceTl: tlOf(api, item?.system?.tl),
    gradeRow: (grade) => api.rules.gradeRow(grade) as GradeRow,
    reinventing: (o) => api.rules.reinventing(o) as Complexity,
  });
  const row = figures.row;
  const lines = [F("Invention", {
    grade: L(`Complexity.${figures.grade}`),
    skill: row.skill,
    concept: row.concept,
    time: diceText(api, row.prototypeTime.dice),
    unit: L(`Unit.${row.prototypeTime.unit}`),
    facilities: row.facilities.toLocaleString("en-US"),
  })];
  if (figures.easier) lines.unshift(F("Reinvented", { from: L(`Complexity.${data.complexity}`), grade: L(`Complexity.${figures.grade}`), tl: tlOf(api, item?.actor?.system?.tl) }));
  return lines;
}

/** The price the device's retail figure is read from: the list price where kept, the stored price otherwise. */
function retailOf(item: any): number {
  return Math.max(0, Number(item?.system?.listCost) || Number(item?.system?.cost) || 0);
}

/** A kit's building: its grade, and the half of a Prototype roll's time a copy takes. */
function kitTime(api: GWorldApi, item: any, data: DeviceData): { grade: Complexity; text: string } {
  const grade = kitGrade(data.complexity, retailOf(item), (retail) => api.rules.gradeForPrice(retail) as Complexity);
  const time = copyTime(api.rules.gradeRow(grade) as GradeRow);
  return { grade, text: F("CopyTime", { dice: diceText(api, time), unit: L(`Unit.${time.unit}`) }) };
}

/** The item sheet section's data. */
function itemContext(api: GWorldApi, item: any, on: DeviceSwitches): Record<string, unknown> {
  const data = deviceData(item);
  const quality = String(item?.system?.equipmentQuality ?? "basic");
  const cutting = on.cuttingEdge();
  const breakable = on.breakable();
  const kits = on.kits();
  const combined = on.combined?.() ?? false;
  const prototype: string[] = [];
  if (cutting) {
    if (data.prototypeYear || data.marketYear) {
      prototype.push(data.prototypeYear && data.marketYear
        ? F("Dated", { prototype: data.prototypeYear, market: data.marketYear })
        : data.prototypeYear ? F("PrototypeOnly", { prototype: data.prototypeYear }) : F("MarketOnly", { market: data.marketYear }));
    }
    prototype.push(...inventionLines(api, item, data));
  }
  const factor = cuttingEdgeFactor(quality);
  const statistics = takesDeviceStatistics(item) ? statisticsOf(api, item) : null;
  return {
    editable: Boolean(item?.isOwner ?? true),
    cutting,
    breakable,
    kits,
    combined,
    data,
    complexities: ["", ...COMPLEXITIES].map((value) => ({ value, label: L(`Complexity.${value || "none"}`), selected: (data.complexity ?? "") === value })),
    prototype,
    cuttingEdgeLine: cutting && data.cuttingEdge
      ? (unavailableWhileNew(quality) ? L("FineUnavailable") : factor ? F("CuttingEdgePrice", { quality: L(`Quality.${quality}`), factor: factor === 4 ? 20 : factor }) : "")
      : "",
    statistics: breakable && statistics ? F("Statistics", statistics) : "",
    broken: breakable && data.parts.broken > 0
      ? F("Broken", { broken: data.parts.broken, count: data.parts.count, label: data.parts.label || L("PartsDefault") })
      : "",
    failing: breakable && data.parts.failing > 0
      ? F("Failing", { failing: data.parts.failing, label: data.parts.label || L("PartsDefault"), ht: data.parts.ht })
      : "",
    usedHint: F("UsedHint", { min: USED_RECENT.min, max: USED_RECENT.max, old: USED_OLD }),
    usedLine: cutting && data.used ? F("UsedLine", { percent: data.used }) : "",
    // The kit's price as the character pays it, after cutting edge and the rest; its list figure where none is worked out.
    kitLine: kits && data.kit ? F("KitLine", { price: Number(item?.effectivePrice?.cost ?? kitPrice(retailOf(item))), time: kitTime(api, item, data).text }) : "",
  };
}

/** Writes what the sheet's fields change. */
function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-device]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.htDevice);
      const checked = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : null;
      if (checked !== null) return void (await storeDevice(item, { [field]: checked }));
      if (field === "complexity") return void (await storeDevice(item, { complexity: String(input.value) }));
      const value = Math.max(0, Math.floor(Number(input.value) || 0));
      if (field === "parts.hp" || field === "parts.ht") return void (await storeDevice(item, { [field]: Math.max(1, value) }));
      if (field === "parts.label") return void (await storeDevice(item, { "parts.label": String(input.value).trim() }));
      if (field === "used") return void (await storeDevice(item, { used: usedPercent(value) }));
      if (["prototypeYear", "marketYear", "parts.count"].includes(field)) await storeDevice(item, { [field]: value });
    });
  });
  // New parts in place of the broken ones, and of the ones left below 0 HP.
  element.querySelector<HTMLElement>("[data-ht-device-replace]")?.addEventListener("click", async () => {
    await storeDevice(item, { "parts.broken": 0, "parts.failing": 0 });
  });
}

// ── dialogs and cards ────────────────────────────────────────────────────────

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const numberInput = (name: string, value: number, step = 1) => `<input type="number" name="${name}" value="${value}" min="0" step="${step}" style="width:6em">`;
const select = (name: string, options: Array<[string, string]>, chosen = "") =>
  `<select name="${name}">${options.map(([value, label]) => `<option value="${esc(value)}"${value === chosen ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    ...(rolls.length ? { rolls } : {}),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

async function rollDice(formula: string): Promise<{ total: number; roll: any }> {
  const roll = new Roll(formula);
  await roll.evaluate();
  return { total: Number(roll.total) || 0, roll };
}

// ── a drop (HT:EE p. 8) ─────────────────────────────────────────────────────

interface DropAnswer {
  yards: number;
  speed: number;
  surface: Surface;
}

/**
 * The damage a device takes when dropped or thrown (HT:EE p. 8): a collision
 * at the speed it lands, from the fall's distance (Campaigns p. 431) or a
 * speed the GM estimates for a throw, against a hard or soft surface.
 */
export function dropDice(api: GWorldApi, hp: number, answer: DropAnswer): { dice: number; modifier: number } {
  if (answer.speed > 0) {
    const hit = api.rules.collisionDamage({ hitPoints: hp, velocity: answer.speed, hard: answer.surface === "hard" });
    return { dice: hit.dice, modifier: hit.modifier };
  }
  return api.rules.fallingDamage({ hitPoints: hp, yardsFallen: answer.yards, surface: answer.surface }).damage;
}

/** Drops the device: rolls the collision, its parts' HT and its own injury, and records the broken parts. */
export async function dropDevice(api: GWorldApi, item: any, actor: any): Promise<void> {
  const answer = await ask<DropAnswer>(L("Drop.Title"),
    `<p class="ihint">${esc(L("Drop.Hint"))}</p>`
    + row(L("Drop.Yards"), numberInput("yards", 1))
    + row(L("Drop.Speed"), numberInput("speed", 0))
    + row(L("Drop.Surface"), select("surface", [["hard", L("Drop.Hard")], ["soft", L("Drop.Soft")]], "hard")),
    (form) => ({
      yards: Math.max(0, Number(field(form, "yards")?.value) || 0),
      speed: Math.max(0, Number(field(form, "speed")?.value) || 0),
      surface: (field(form, "surface")?.value === "soft" ? "soft" : "hard") as Surface,
    }));
  if (!answer || (answer.yards <= 0 && answer.speed <= 0)) return;
  const stats = api.items.objectStats(item);
  const hp = Math.max(1, Number(stats?.hp) || 1);
  const dr = Math.max(0, Number(stats?.dr) || 0);
  const dice = dropDice(api, hp, answer);
  const formula = `${dice.dice}d6${dice.modifier > 0 ? `+${dice.modifier}` : dice.modifier < 0 ? String(dice.modifier) : ""}`;
  const damage = await rollDice(formula);
  const rolled = Math.max(0, damage.total);
  const rolls = [damage.roll];
  const lines = [F("Drop.Damage", { name: item.name, hp, dice: formula, damage: rolled })];

  const data = deviceData(item);
  const whole = data.parts.count - data.parts.broken;
  if (whole > 0) {
    const label = data.parts.label || L("PartsDefault");
    const outcome = partOutcome({ damage: rolled, hp: data.parts.hp, state: (current, max) => api.rules.objectState(current, max) as PartState });
    const htRolls: number[] = [];
    if (outcome.rollsHt) {
      for (let i = 0; i < whole; i += 1) {
        const ht = await rollDice("3d6");
        htRolls.push(ht.total);
        rolls.push(ht.roll);
      }
    }
    const broken = partsBroken(outcome.state, whole, htRolls, data.parts.ht);
    lines.push(F(`Drop.Parts.${outcome.state}`, { count: whole, label, hp: outcome.hpLeft, ht: data.parts.ht, rolls: htRolls.join(", "), broken }));
    // The parts left at 0 HP or less roll HT each second the device is used from now on.
    const failing = partsFailing(outcome.state, whole, broken, data.parts.failing);
    if (broken > 0 || failing !== data.parts.failing) await storeDevice(item, { "parts.broken": data.parts.broken + broken, "parts.failing": failing });
    if (broken > 0) lines.push(F("Drop.Replace", { broken: data.parts.broken + broken, label }));
    if (outcome.state === "breaking" && failing > 0) lines.push(F("Drop.Survivors", { failing, label, ht: data.parts.ht }));
  }
  const injury = deviceInjury(rolled, dr);
  // The system puts the blow on a thing that keeps hit points, rolling its HT
  // at each multiple of -HP (Campaigns pp. 483-484); anything else is marked
  // by hand.
  const recorded = injury > 0 && item?.isOwner && item?.system?.hpLost !== undefined;
  const state = api.rules.objectState(hp - injury, hp) as PartState;
  lines.push(injury <= 0 ? F("Drop.Unhurt", { dr })
    : recorded ? F("Drop.Recorded", { injury, dr })
      : F("Drop.Injured", { injury, dr, state: L(`State.${state}`) }));
  await say(actor, F("Drop.Card", { name: item.name }), lines, rolls);
  if (recorded) await api.items.applyDamage({ item, damage: rolled, type: "cr", label: F("Drop.DamageLabel", { name: item.name }) });
}

// ── parts below 0 HP in use (HT:EE p. 8; Campaigns p. 484) ─────────────────

/** Whether the device won't work: a broken part in it, until replaced. */
export function partsOut(item: any): boolean {
  return deviceData(item).parts.broken > 0;
}

/**
 * A second of use with parts below 0 HP: each rolls HT, and each that fails
 * stops working, out until replaced as a broken part is. Rolled for each
 * roll made with the device, and from the row action for a use no roll
 * covers (a lamp left on, a radio listened to).
 */
export async function runFailingParts(item: any, actor: any): Promise<number> {
  const data = deviceData(item);
  const failing = data.parts.failing;
  if (failing <= 0) return 0;
  const label = data.parts.label || L("PartsDefault");
  const htRolls: number[] = [];
  const rolls: any[] = [];
  for (let i = 0; i < failing; i += 1) {
    const ht = await rollDice("3d6");
    htRolls.push(ht.total);
    rolls.push(ht.roll);
  }
  const stopped = partsStopping(htRolls, failing, data.parts.ht);
  if (stopped > 0) await storeDevice(item, { "parts.broken": data.parts.broken + stopped, "parts.failing": failing - stopped });
  const lines = [F("Run.Rolls", { count: failing, label, ht: data.parts.ht, rolls: htRolls.join(", ") })];
  lines.push(stopped > 0 ? F("Run.Stopped", { stopped, label }) : L("Run.Kept"));
  await say(actor, F("Run.Card", { name: item.name }), lines, rolls);
  return stopped;
}

// ── building a kit (HT:EE p. 15) ────────────────────────────────────────────

/** How much longer (or shorter) than the usual the builder takes (Campaigns p. 346). */
const TIME_FACTORS = [1, 2, 4, 8, 15, 30, 0.5] as const;

/** The character's Hobby Skills and their levels. */
function hobbySkills(api: GWorldApi, actor: any): Array<{ name: string; level: number }> {
  return [...(actor?.items ?? [])]
    .filter((i: any) => i?.type === "skill" && /^hobby skill\b/i.test(String(i.name ?? "").trim()))
    .map((i: any) => ({ name: String(i.name), level: api.actors.skillLevel(actor, String(i.name)) ?? Number.NaN }))
    .filter((s) => Number.isFinite(s.level));
}

/** Builds the kit into the device: a success leaves it no longer a kit. */
export async function buildKit(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = deviceData(item);
  if (!data.kit || !actor) return;
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  const hobbies = hobbySkills(api, actor);
  const best = kitBuilder({ iq, hobbies });
  const time = kitTime(api, item, data);
  const answer = await ask(L("Kit.Title"),
    `<p class="ihint">${esc(F("Kit.Hint", { name: item.name, time: time.text }))}</p>`
    + row(L("Kit.With"), select("with", [["", F("Kit.Iq", { level: iq })], ...hobbies.map((h): [string, string] => [h.name, F("Kit.Hobby", { name: h.name, level: h.level })])], best.name ?? ""))
    + row(L("Kit.Time"), select("time", TIME_FACTORS.map((t): [string, string] => [String(t), L(`Time.${String(t).replace(".", "_")}`)]))),
    (form) => ({ with: field(form, "with")?.value ?? "", time: Number(field(form, "time")?.value) || 1 }));
  if (!answer) return;
  const hobby = hobbies.find((h) => h.name === answer.with) ?? null;
  const spent = timeSpentModifier(answer.time, 1);
  const modifiers = spent ? [{ label: L(`Time.${String(answer.time).replace(".", "_")}`), value: spent }] : [];
  const label = F("Kit.Label", { name: item.name });
  const result: any = hobby
    ? await api.roll.success({ actor, base: hobby.level, kind: "skill", skill: hobby.name, item, label, modifiers, tags: ["kitBuilding"] } as any)
    : await api.roll.success({ actor, base: iq, kind: "attribute", skill: "IQ", item, label, modifiers, tags: ["kitBuilding", "IQ"] } as any);
  if (!result) return;
  if (result.success) await storeDevice(item, { kit: false });
  await say(actor, label, [F(result.success ? "Kit.Built" : "Kit.NotBuilt", { name: item.name, builder: actor.name, time: time.text, factor: answer.time })]);
}

// ── registration ────────────────────────────────────────────────────────────

/** Registers the price modifiers, the object figures, the item sheet section and the row actions. */
export function readyDevices(api: GWorldApi, on: DeviceSwitches): void {
  // A device's HP, HT and DR where its record states none (HT:EE p. 9).
  // Registered before the book's other object listeners (locks and safes,
  // guns, projectors), so a figure one of them sets for its gear wins.
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    if (!on.breakable() || !takesDeviceStatistics(context?.item)) return;
    const stats = statisticsOf(api, context.item);
    // HP by the Unliving/Machine column, and hurt as a machine is (API 1.126.0).
    context.kind = "unliving";
    context.hp = stats.hp;
    context.ht = stats.ht;
    context.dr = stats.dr;
    context.notes?.push?.(L("StatisticsNote"));
  });

  // Newly released: priced one grade up, on top of the grade's own price (HT:EE p. 8).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-cutting-edge",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.cuttingEdge() || !isDevice(item) || !deviceData(item).cuttingEdge) return null;
      const factor = cuttingEdgeFactor(String(item?.system?.equipmentQuality ?? "basic"));
      return factor ? { cost: Math.round(price.cost * factor * 100) / 100, weight: price.weight, label: L("CuttingEdge") } : null;
    },
  });

  // Bought used: from 50-80% of new for a recent model to 10% or less for an old one (HT:EE p. 8).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-used",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.cuttingEdge() || !isDevice(item)) return null;
      const percent = deviceData(item).used;
      return percent ? { cost: usedPrice(price.cost, percent), weight: price.weight, label: F("UsedPrice", { percent }) } : null;
    },
  });

  // A broken part stops the device; parts below 0 HP roll HT for each use (HT:EE p. 8; Campaigns p. 484).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const item = context?.item;
    if (!on.breakable() || !isDevice(item) || rollsOnTheDevice(context.skill) || !partsOut(item)) return;
    const data = deviceData(item);
    context.refusal = F("BrokenRefusal", { name: item.name, broken: data.parts.broken, label: data.parts.label || L("PartsDefault") });
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const item = context?.item;
    if (!on.breakable() || !isDevice(item) || rollsOnTheDevice(context.skill) || deviceData(item).parts.failing <= 0) return;
    void runFailingParts(item, context.actor);
  });

  // A kit: the parts and the instructions, a quarter of the price (HT:EE p. 15).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-kit",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.kits() || !isDevice(item) || !deviceData(item).kit) return null;
      return { cost: kitPrice(price.cost), weight: price.weight, label: L("KitPrice") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-device-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-device-item.hbs`,
    visible: (item) => isDevice(item) && (on.cuttingEdge() || on.breakable() || on.kits() || (on.combined?.() ?? false)),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-device-drop",
    itemTypes: ["equipment"],
    label: L("Drop.Title"),
    icon: "fa-solid fa-arrow-down",
    visible: (item) => on.breakable() && isDevice(item) && deviceData(item).parts.count > deviceData(item).parts.broken,
    run: (item, actor) => { void dropDevice(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-device-run",
    itemTypes: ["equipment"],
    label: L("Run.Title"),
    icon: "fa-solid fa-plug-circle-exclamation",
    visible: (item) => on.breakable() && isDevice(item) && !partsOut(item) && deviceData(item).parts.failing > 0,
    run: (item, actor) => { void runFailingParts(item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-kit-build",
    itemTypes: ["equipment"],
    label: L("Kit.Title"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.kits() && isDevice(item) && deviceData(item).kit,
    run: (item, actor) => { void buildKit(api, item, actor); },
  });
}
