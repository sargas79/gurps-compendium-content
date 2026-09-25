/**
 * The Electricity and Electronics supplement's electrical hazards, shock
 * protection and power lines (HT:EE pp. 9, 14-15, 18-19, 25), registered with
 * the system through the add-on API under three High-Tech switches. The
 * figures are in `rules.ts`. The shock is always the system's
 * (`hazards.shock`, Campaigns pp. 432-433); these rules reach into it through
 * the `gworld.shockModifiers` and `gworld.afterShock` hooks (API 1.119.0),
 * `gworld.shockDamage` and a critical failure's heart (API 1.127.0).
 *
 *   - **Electrical hazards (electricalHazards):** a GM tool that puts its
 *     targets in contact with a source -- a row of the voltage table, a
 *     voltage, the electric chair, a formula, or a nonlethal discharge --
 *     rolls the damage, and runs the shock a second at a time while the
 *     victim can't let go. The kind of current sets the HT roll's step (DC
 *     the Basic Set's, AC -5 per 2 points, radio frequency none, lightning
 *     -1 per 5); a source doing 1 point is jerked away from with a DX roll;
 *     more than 1 point of injury holds the victim (the shock card's
 *     contact, a condition, and the stun or unconsciousness held while the
 *     current flows); the optional weak-shock rule; a spark or a lethal
 *     current lighting what is at hand; arc flash (3d burn, the light rules'
 *     glare roll, and lasting harm to eyes without welder's goggles);
 *     lightning. On any shock the system runs, a nonlethal one at -5 or
 *     worse stops the heart on a failure by 10 or a critical failure, a
 *     lethal one that does more than 1 point holds on, and a weak one whose
 *     damage roll came to 0 or less still calls for the HT roll, with the
 *     roll under 0 as a bonus.
 *   - **Shock protection (shockProtection):** on any shock, a worn Faraday
 *     suit's immunity to nonlethal shocks and DR 20 against lethal ones; on
 *     the GM tool's shocks, electrical gloves, an insulated tool's handle and
 *     electrical tape add their DR, and a hot stick keeps the worker clear of
 *     a line within its rating, at -2 that the Hot Stick technique buys off.
 *     A fuse, circuit breaker or ground fault interrupter on the circuit turns
 *     a critical failure on power work, or on a stolen-power device's daily
 *     roll, into an ordinary one. A lightning rod's roll for a building.
 *   - **Power lines (powerLines):** the voltage table as the tool's sources;
 *     cutting or tapping a line with Electrician, at -1 with insulated tools
 *     alone and -5 with improvised ones, a failure by 5 or a critical failure
 *     shocking the worker, and Camouflage to hide a tap; a row button for a
 *     device run on stolen power (HT-2 daily through `items.equipmentFailure`,
 *     a critical failure perhaps starting a fire); the current induced near a
 *     line over 150,000 volts; and the electric chair.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { postGlare } from "../lighting/index.js";
import { ARC_FLASH_LUX, luxStep } from "../lighting/rules.js";
import {
  ARC_FLASH_DAMAGE,
  ELECTRIC_CHAIR,
  HOLDING_INJURY,
  HOT_STICK_PENALTY,
  INJURY_STEP,
  LIGHTNING_DAMAGE,
  LIGHTNING_RODS,
  NONLETHAL_HEART_MARGIN,
  PULL_FREE_DAMAGE,
  STOLEN_POWER_MODIFIER,
  VOLTAGE_ROWS,
  WORK_TOOLS,
  WORK_TOOL_MODIFIER,
  acExtraModifier,
  inducedPenalty,
  largeBoltMultiplier,
  lightningRodDamage,
  nonlethalCanStopHeart,
  shieldDr,
  shockGear,
  sparkTarget,
  stopsHeart,
  voltageDamage,
  weakShock,
  weakShockBonus,
  workShocks,
  type Current,
  type LightningRod,
  type WorkTools,
} from "./rules.js";

const NS = "GCC.HT.Electricity";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

/** The module condition on a victim who can't let go of the source. */
const HELD = "ht-ee-cant-let-go";
/** The module condition on someone numbed by a line's field. */
const INDUCED = "ht-ee-induced-current";

export interface ElectricitySwitches {
  hazards: () => boolean;
  protection: () => boolean;
  powerLines: () => boolean;
  /** The supplement's glare rule (lightDazzle), which an arc flash's light calls on. */
  glare: () => boolean;
}

/** The materials a shock may set alight (Campaigns p. 433), or none at hand. */
const MATERIALS = ["none", "superFlammable", "highlyFlammable", "flammable", "resistant", "highlyResistant"] as const;
type Material = (typeof MATERIALS)[number];

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** A dialog of fields; the callback reads the form. */
async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const select = (name: string, options: Array<[string, string]>, selected = "") => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const checkbox = (name: string, checked = false) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;
const number = (name: string, value: number, min: number | null = 0) => `<input type="number" name="${name}" value="${value}" ${min === null ? "" : `min="${min}"`} step="1" style="width:90px" />`;
const text = (name: string, value = "") => `<input type="text" name="${name}" value="${esc(value)}" style="width:90px" />`;
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
const numberOf = (form: HTMLElement, name: string, fallback: number) => {
  const n = Number(field(form, name)?.value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};

// ── the gear on a victim (HT:EE pp. 14-15, 25) ──

/** A record of this book's, or one of no book's: the rule's to handle under High-Tech's switch (D1). */
const ours = (item: any) => {
  const book = bookOf(item);
  return book === null || book === "high-tech";
};
// The gloves are armour (DR 1, flexible), the rest equipment.
const isCarried = (item: any) => (item?.type === "equipment" || item?.type === "armor") && item.system?.carried !== false && ours(item);
const isWorn = (item: any) => isCarried(item) && item.system?.equipped === true;

/** A reference to High-Tech's own pages, not the supplement's. */
const HIGH_TECH_OWN = /^High-Tech p/i;

/** What a character wears and carries against shocks. */
export interface GearOn {
  /** The best worn electrical gloves' DR, or 0. */
  gloves: number;
  faraday: boolean;
  handTool: boolean;
  /** The highest rating of a hot stick carried, or null. */
  hotStick: number | null;
}

export function gearOn(actor: any): GearOn {
  const gear: GearOn = { gloves: 0, faraday: false, handTool: false, hotStick: null };
  for (const item of actor?.items ?? []) {
    if (!isCarried(item)) continue;
    const kind = shockGear(String(item.name ?? ""));
    if (!kind) continue;
    if (kind.kind === "gloves" && isWorn(item)) gear.gloves = Math.max(gear.gloves, kind.dr);
    else if (kind.kind === "faraday" && isWorn(item)) gear.faraday = true;
    // High-Tech's own wire cutters (p. 25) share the name, but only the supplement's tools have insulated handles.
    else if (kind.kind === "handTool" && !HIGH_TECH_OWN.test(String(item.system?.reference ?? ""))) gear.handTool = true;
    else if (kind.kind === "hotStick") gear.hotStick = Math.max(gear.hotStick ?? 0, kind.volts);
  }
  return gear;
}

// ── what the GM tool tells the shock hooks ──

/** One shock the GM tool runs, for the hooks to read: keyed by its victim while it runs. */
export interface PendingShock {
  current: Current | null;
  volts: number | null;
  /** The current comes in through the hands: worn gloves count. */
  hands: boolean;
  /** Through an insulated tool's handle. */
  handTool: boolean;
  taped: boolean;
  /** The rating of the hot stick the work is done with, or null. */
  hotStick: number | null;
  /** The optional weak-shock rule: roll on no injury, with this bonus. */
  weak: { bonus: number } | null;
  /** Jerked away from a 1-point source with a DX roll. */
  pulledFree: boolean;
  lines: string[];
}

const pending = new Map<string, PendingShock>();
/** What `gworld.shockModifiers` saw of a shock, for `gworld.afterShock`. */
const noted = new Map<string, { kind: string; modifier: number; lightning: boolean; current: Current | null }>();
const keyOf = (actor: any) => String(actor?.uuid ?? actor?.id ?? "");

/** Runs the system's shock with the tool's word on it for the hooks. */
async function shockWith(api: GWorldApi, actor: any, options: Record<string, unknown>, shock: PendingShock): Promise<any> {
  const key = keyOf(actor);
  pending.set(key, shock);
  try {
    return await (api.hazards.shock as any)({ actor, ...options });
  } finally {
    pending.delete(key);
  }
}

/** The shock's HT step and heart, and the weak-shock rule (HT:EE p. 9). */
function hazardModifiers(context: any, shock: PendingShock | null): void {
  const kind = context.kind;
  if (shock?.current && kind !== "nonlethal") {
    context.injuryStep = INJURY_STEP[shock.current];
    if (shock.current !== "dc") context.lines.push(L(`Step.${shock.current}`));
    // Radio-frequency current: the effect is disregarded, heart and all.
    if (!stopsHeart(shock.current)) {
      context.heartAttackMargin = null;
      context.heartAttackOnCritical = false;
    }
  }
  if (kind === "nonlethal" && nonlethalCanStopHeart(Number(context.modifier) || 0)) {
    context.heartAttackMargin = NONLETHAL_HEART_MARGIN;
    // The book counts a critical failure too, as the Basic Set does only for a lethal shock.
    context.heartAttackOnCritical = true;
    context.lines.push(F("StrongNonlethal", { margin: NONLETHAL_HEART_MARGIN }));
  }
  if (kind !== "lethal" || !shock?.weak) return;
  // The tool rolled the damage itself; the system's own shocks are answered once theirs is rolled (weakShockRolled).
  context.rollOnZeroInjury = true;
  if (shock.weak.bonus) context.modifier = (Number(context.modifier) || 0) + shock.weak.bonus;
  context.lines.push(F("WeakShock", { bonus: signed(shock.weak.bonus) }));
}

/**
 * The weak-shock rule on a lethal shock the system rolled (HT:EE p. 9): a
 * formula under 1d whose roll came to 0 or less still calls for the HT roll,
 * with the roll under 0 as a bonus (`gworld.shockDamage`, API 1.127.0).
 */
function weakShockRolled(api: GWorldApi, context: any): void {
  if (context.kind !== "lethal" || !weakShock(api.rules.parseDiceAdds(String(context.formula ?? "")) as any)) return;
  const rolled = Number(context.damageRoll);
  if (!Number.isFinite(rolled) || rolled > 0) return;
  const bonus = weakShockBonus(rolled);
  context.rollOnZeroInjury = true;
  if (bonus) context.modifier = (Number(context.modifier) || 0) + bonus;
  context.lines.push(F("WeakShock", { bonus: signed(bonus) }));
}

/** DR against the shock only, or immunity (HT:EE pp. 14-15). */
function protectionModifiers(context: any, actor: any, shock: PendingShock | null): void {
  const kind = context.kind;
  const gear = gearOn(actor);
  if (kind === "nonlethal" && gear.faraday) {
    context.immune = true;
    context.lines.push(L("FaradayImmune"));
    return;
  }
  if (shock?.hotStick !== null && shock?.hotStick !== undefined && shock.volts !== null && shock.volts <= shock.hotStick) {
    context.immune = true;
    context.lines.push(L("HotStickClear"));
    return;
  }
  if (kind !== "lethal" && kind !== "localized") return;
  const dr = shieldDr(
    { gloves: shock?.hands ? gear.gloves : 0, faraday: gear.faraday, handTool: Boolean(shock?.handTool), taped: Boolean(shock?.taped) },
    { kind, lightning: shock?.current === "lightning", volts: shock?.volts ?? null },
  );
  if (dr === null) return;
  context.dr = (typeof context.dr === "number" ? context.dr : 0) + dr;
  context.lines.push(F("ShockDr", { dr }));
}

// ── the GM tool (HT:EE pp. 9, 15, 18-19) ──

/** Where a shock comes from, worked out from the tool's answer. */
export interface ShockSource {
  kind: "lethal" | "nonlethal";
  formula: string;
  volts: number | null;
  current: Current;
  modifier: number;
  label: string;
}

/** How a victim meets the source. */
export interface ContactOptions {
  /** Seconds until the current is cut, if the victim can't let go. */
  seconds: number;
  hands: boolean;
  handTool: boolean;
  taped: boolean;
  metal: boolean;
  torso: boolean;
  material: Material;
  hotStick: number | null;
}

const SOURCES = [...VOLTAGE_ROWS.map((r) => r.key), "higher", "chair", "formula", "nonlethal"] as const;

export interface ShockAnswer extends ContactOptions {
  source: string;
  volts: number;
  formula: string;
  modifier: number;
  current: Current;
}

/** The source the tool's answer names, or null for one it can't roll. */
export function shockSource(api: GWorldApi, answer: Pick<ShockAnswer, "source" | "volts" | "formula" | "modifier" | "current">): ShockSource | null {
  const table = VOLTAGE_ROWS.find((r) => r.key === answer.source);
  if (table) return { kind: "lethal", formula: table.damage, volts: table.volts, current: answer.current, modifier: 0, label: F("Source.Row", { source: L(`Source.${table.key}`), volts: table.volts }) };
  if (answer.source === "higher") {
    const formula = voltageDamage(answer.volts);
    return formula ? { kind: "lethal", formula, volts: answer.volts, current: answer.current, modifier: 0, label: F("Source.Volts", { volts: answer.volts }) } : null;
  }
  if (answer.source === "chair") return { kind: "lethal", formula: voltageDamage(ELECTRIC_CHAIR.volts)!, volts: ELECTRIC_CHAIR.volts, current: ELECTRIC_CHAIR.current, modifier: 0, label: L("Source.chair") };
  if (answer.source === "nonlethal") return { kind: "nonlethal", formula: "", volts: null, current: "dc", modifier: answer.modifier, label: L("Source.nonlethal") };
  if (!api.rules.parseDiceAdds(answer.formula)) return null;
  return { kind: "lethal", formula: answer.formula, volts: null, current: answer.current, modifier: 0, label: answer.formula };
}

/** Rolls a damage formula as the book writes it ("1d-3", "6d×2"); may come to less than 0. */
async function rollFormula(api: GWorldApi, formula: string): Promise<number> {
  const parsed = api.rules.parseDiceAdds(formula);
  if (!parsed) return 0;
  const roll = new Roll(api.rules.toRollFormula(parsed));
  await roll.evaluate();
  return Number(roll.total) || 0;
}

async function threeDice(): Promise<number> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  return Number(roll.total) || 0;
}

/** Jerking back from a 1-point source: a DX roll (HT:EE p. 9). */
async function pullsFree(api: GWorldApi, victim: any): Promise<boolean> {
  const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: L("PullFree"), tags: ["DX"] } as any);
  return Boolean(result?.success);
}

/**
 * A victim in contact with a source (HT:EE p. 9): the damage rolled a second
 * at a time, each second a shock of the system's, until the victim lets go
 * or the current is cut. Resolves to the last shock's outcome.
 */
export async function contactSource(api: GWorldApi, victim: any, source: ShockSource, options: ContactOptions, on: ElectricitySwitches): Promise<any> {
  const hazards = on.hazards();
  const seconds = source.kind === "lethal" ? Math.max(1, Math.min(60, Math.floor(options.seconds) || 1)) : 1;
  let outcome: any = null;
  let held = false;
  for (let second = 1; second <= seconds; second += 1) {
    const left = seconds - second;
    const shock: PendingShock = {
      current: hazards ? source.current : null,
      volts: source.volts,
      hands: options.hands,
      handTool: options.handTool,
      taped: options.taped,
      hotStick: options.hotStick,
      weak: null,
      pulledFree: false,
      lines: [F("SourceLine", { source: source.label })],
    };
    let formula = "";
    if (source.kind === "lethal") {
      const rolled = await rollFormula(api, source.formula);
      formula = String(Math.max(0, rolled));
      shock.lines.push(F("Rolled", { formula: source.formula, rolled }));
      if (hazards) {
        if (second === 1 && rolled === PULL_FREE_DAMAGE && (await pullsFree(api, victim))) shock.pulledFree = true;
        if (rolled <= 0 && options.torso && weakShock(api.rules.parseDiceAdds(source.formula) as any)) shock.weak = { bonus: weakShockBonus(rolled) };
        // Lethal current is a fire source for its rolled damage (HT:EE p. 9; Campaigns p. 433).
        if (options.material !== "none" && !shock.pulledFree) {
          shock.lines.push(F(api.rules.ignites(options.material, rolled) ? "Ignites" : "NoFire", { material: L(`Material.${options.material}`) }));
        }
      }
    } else if (hazards && options.material === "superFlammable") {
      // A spark lights only Super-Flammable things: 3d against 12 less the shock's modifier (HT:EE p. 9).
      const target = sparkTarget(source.modifier);
      const rolled = await threeDice();
      shock.lines.push(F(rolled <= target ? "SparkIgnites" : "SparkFails", { rolled, target }));
    }
    outcome = await shockWith(api, victim, {
      kind: source.kind,
      modifier: source.modifier,
      continuous: source.kind === "lethal",
      formula,
      metalArmor: options.metal,
      contactSeconds: held ? left : 0,
    }, shock);
    if (!outcome) break;
    held = hazards && Boolean(outcome.contact?.held);
    if (!held || left === 0) break;
    if (second === 1) {
      // Held on until the current is cut: the stun or unconsciousness waits on it (API 1.89 holdRecovery).
      await api.actors.applyCondition(victim, { module: MODULE_ID, key: HELD, label: L("HeldCondition"), duration: { seconds: left } } as any);
      if (outcome.stunned) await api.actors.applyCondition(victim, { key: "stunned", holdRecovery: { seconds: left + (Number(outcome.stunSeconds) || 0) } } as any);
      if (outcome.unconscious) await api.actors.applyCondition(victim, { key: "unconscious", holdRecovery: { seconds: left + (Number(outcome.unconsciousMinutes) || 0) * 60 } } as any);
    }
  }
  return outcome;
}

/** Lightning striking its targets: 6d, a large bolt multiplied by 1d-2, at least 1 (HT:EE p. 9). */
export async function lightningOn(api: GWorldApi, victims: any[], answer: { large: boolean; metal: boolean; material: Material }, on: ElectricitySwitches): Promise<void> {
  for (const victim of victims) {
    const multiplier = answer.large ? largeBoltMultiplier(await rollFormula(api, "1d-2")) : 1;
    const formula = multiplier > 1 ? `${LIGHTNING_DAMAGE}×${multiplier}` : LIGHTNING_DAMAGE;
    const source: ShockSource = { kind: "lethal", formula, volts: null, current: "lightning", modifier: 0, label: L("Source.lightning") };
    await contactSource(api, victim, source, { seconds: 1, hands: false, handTool: false, taped: false, metal: answer.metal, torso: true, material: answer.material, hotStick: null }, on);
  }
}

/**
 * Arc flash (HT:EE p. 9): 3d burn for a second, a flash that lights fires,
 * and light as bright as 1,000,000 lux -- the glare roll of the light rules
 * where their switch is on (lightDazzle, HT:EE p. 20). Eyes not behind
 * welder's goggles roll HT as for a crippling injury (Campaigns pp.
 * 422-423): a failure leaves the sight impaired for months, a critical
 * failure for good.
 */
export async function arcFlashOn(api: GWorldApi, tokens: any[], answer: { material: Material; goggles: boolean }, on: ElectricitySwitches): Promise<void> {
  const glared: Array<{ token: any; step: number }> = [];
  for (const token of tokens) {
    const victim = token?.actor;
    if (!victim) continue;
    const rolled = await api.roll.damage({ actor: victim, label: F("ArcFlash.Label", { name: victim.name }), formula: ARC_FLASH_DAMAGE, damageType: "burn", source: "arcFlash" } as any);
    const lines = [F("ArcFlash.Burn", { formula: ARC_FLASH_DAMAGE }), L(on.glare() ? "ArcFlash.Glare" : "ArcFlash.Light")];
    if (answer.material !== "none" && typeof rolled === "number") lines.push(F(api.rules.ignites(answer.material, rolled) ? "Ignites" : "NoFire", { material: L(`Material.${answer.material}`) }));
    if (answer.goggles) lines.push(L("ArcFlash.Goggles"));
    else {
      const eyes: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "HT") ?? 10, kind: "attribute", label: L("ArcFlash.Eyes"), tags: ["HT"] } as any);
      if (eyes && !eyes.success) {
        const duration = eyes.criticalFailure ? "permanent" : "lasting";
        await (api.actors as any).cripple(victim, "eye", { duration, label: L("ArcFlash.EyeLabel") });
        lines.push(L(`ArcFlash.Eyes${duration === "permanent" ? "Permanent" : "Lasting"}`));
      } else if (eyes) lines.push(L("ArcFlash.EyesSpared"));
    }
    await say(victim, L("ArcFlash.Title"), lines);
    glared.push({ token, step: luxStep(ARC_FLASH_LUX) });
  }
  if (on.glare() && glared.length) await postGlare(api, glared, L("ArcFlash.Title"));
}

/** A lightning rod on a building (HT:EE p. 15): the rod's roll, and what the building takes. */
export async function lightningRod(api: GWorldApi, answer: { rod: LightningRod; large: boolean }): Promise<number> {
  const multiplier = answer.large ? largeBoltMultiplier(await rollFormula(api, "1d-2")) : 1;
  const formula = multiplier > 1 ? `${LIGHTNING_DAMAGE}×${multiplier}` : LIGHTNING_DAMAGE;
  const rolled = await rollFormula(api, formula);
  const rodRoll = await threeDice();
  const damage = lightningRodDamage(rolled, rodRoll, answer.rod);
  await say(null, L("Rod.Title"), [
    F("Rod.Bolt", { formula, rolled }),
    F("Rod.Roll", { rod: L(`Rod.${answer.rod}`), roll: rodRoll }),
    damage ? F("Rod.Failed", { damage }) : L("Rod.Grounded"),
  ]);
  return damage;
}

/** The level the Hot Stick technique buys the -2 back to, for a worker who knows it (HT:EE p. 15). */
export function hotStickPenalty(api: GWorldApi, actor: any): number {
  const technique = [...(actor?.items ?? [])].find((i: any) => i?.type === "technique" && /^hot stick\b/i.test(String(i.name ?? "")));
  if (!technique) return HOT_STICK_PENALTY;
  const level = technique.system?.derived?.level;
  const base = api.actors.skillLevel(actor, "Electrician");
  const relative = typeof level === "number" && typeof base === "number" ? level - base : HOT_STICK_PENALTY + (Number(technique.system?.derived?.levels) || 0);
  return Math.min(0, Math.max(HOT_STICK_PENALTY, relative));
}

export interface WorkAnswer {
  tap: boolean;
  source: string;
  volts: number;
  current: Current;
  tools: WorkTools;
  hotStick: boolean;
  guarded: boolean;
  seconds: number;
}

/** A skill's level, or its attribute default where the worker doesn't know it. */
const skillOr = (api: GWorldApi, actor: any, skill: string, attribute: "IQ", penalty: number) =>
  api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, attribute) ?? 10) + penalty;

/**
 * Cutting or tapping a live line (HT:EE p. 19): Electrician (default IQ-5),
 * at -1 with insulated tools and no safety gear, -5 with improvised ones, -2
 * through a hot stick less the technique; a failure by 5 or more, or a
 * critical failure where no fuse, breaker or ground fault interrupter
 * guards the circuit (HT:EE p. 25), is a lethal shock at the line's voltage.
 * A successful tap is hidden with Camouflage (default IQ-4).
 */
export async function workOn(api: GWorldApi, workers: any[], answer: WorkAnswer, on: ElectricitySwitches): Promise<void> {
  const source = shockSource(api, { source: answer.source, volts: answer.volts, formula: "", modifier: 0, current: answer.current });
  if (!source) return void ui.notifications?.warn(L("Work.NoSource"));
  for (const worker of workers) {
    const gear = gearOn(worker);
    const hotStick = on.protection() && answer.hotStick && gear.hotStick !== null ? gear.hotStick : null;
    const modifiers = [];
    if (WORK_TOOL_MODIFIER[answer.tools]) modifiers.push({ label: L(`Work.Tools.${answer.tools}`), value: WORK_TOOL_MODIFIER[answer.tools] });
    if (hotStick !== null) {
      const penalty = hotStickPenalty(api, worker);
      if (penalty) modifiers.push({ label: L("Work.HotStick"), value: penalty });
    }
    const title = L(answer.tap ? "Work.Tap" : "Work.Cut");
    const result: any = await api.roll.success({ actor: worker, base: skillOr(api, worker, "Electrician", "IQ", -5), kind: "skill", skill: "Electrician", label: `${title}: ${source.label}`, modifiers, tags: ["electrician"] } as any);
    if (!result) continue;
    const guarded = on.protection() && answer.guarded;
    const lines: string[] = [];
    if (result.success) {
      lines.push(F(answer.tap ? "Work.Tapped" : "Work.CutDone", { name: worker.name }));
      if (answer.tap) {
        const hidden: any = await api.roll.success({ actor: worker, base: skillOr(api, worker, "Camouflage", "IQ", -4), kind: "skill", skill: "Camouflage", label: L("Work.Hide"), tags: ["camouflage"] } as any);
        if (hidden) lines.push(L(hidden.success ? "Work.Hidden" : "Work.Visible"));
      }
      await say(worker, title, lines);
      continue;
    }
    if (!workShocks(result, guarded)) {
      lines.push(L(result.criticalFailure && guarded ? "Work.Guarded" : "Work.Failed"));
      await say(worker, title, lines);
      continue;
    }
    await say(worker, title, [L("Work.Shocked")]);
    await contactSource(api, worker, source, {
      seconds: answer.seconds,
      hands: true,
      handTool: on.protection() && answer.tools !== "improvised" && gear.handTool,
      taped: false,
      metal: false,
      torso: true,
      material: "none",
      hotStick,
    }, on);
  }
}

/**
 * The current a line over 150,000 volts induces within a yard (HT:EE p. 19):
 * an HT roll, its margin of failure a penalty to skill rolls while near the
 * line, stunned on a critical failure; a worn Faraday suit prevents it.
 */
export async function inducedFieldOn(api: GWorldApi, victims: any[]): Promise<void> {
  for (const victim of victims) {
    if (gearOn(victim).faraday) {
      await say(victim, L("Field.Title"), [L("Field.Faraday")]);
      continue;
    }
    const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "HT") ?? 10, kind: "attribute", label: L("Field.Title"), tags: ["resist", "HT", "shock"] } as any);
    if (!result) continue;
    if (result.success) {
      await say(victim, L("Field.Title"), [F("Field.Resisted", { name: victim.name })]);
      continue;
    }
    const penalty = inducedPenalty(result);
    const lines = [F("Field.Numb", { name: victim.name, penalty })];
    if (penalty) {
      await api.actors.applyCondition(victim, { module: MODULE_ID, key: INDUCED, label: L("Field.Condition"), effects: { modifiers: [{ label: L("Field.Condition"), value: penalty, rolls: ["skill"] }] } } as any);
    }
    if (result.criticalFailure) {
      await api.actors.applyCondition(victim, { key: "stunned" } as any);
      lines.push(F("Field.Stunned", { name: victim.name }));
    }
    await say(victim, L("Field.Title"), lines);
  }
}

// ── the dialogs ──

const MODES = ["shock", "work", "field", "lightning", "arcFlash", "rod"] as const;
type Mode = (typeof MODES)[number];

/** The tool's modes each switch offers. */
export function toolModes(on: ElectricitySwitches): Mode[] {
  return MODES.filter((mode) => {
    if (mode === "shock") return on.hazards() || on.protection() || on.powerLines();
    if (mode === "work" || mode === "field") return on.powerLines();
    if (mode === "rod") return on.protection();
    return on.hazards();
  });
}

const targetedTokens = () => [...((game as any).user?.targets ?? [])].filter((t: any) => t?.actor);
const targeted = () => targetedTokens().map((t: any) => t.actor);

const materialField = () => row(L("Material.Label"), select("material", MATERIALS.map((m): [string, string] => [m, L(`Material.${m}`)])));
const materialOf = (form: HTMLElement): Material => {
  const value = field(form, "material")?.value as Material;
  return MATERIALS.includes(value) ? value : "none";
};
const currentField = (on: ElectricitySwitches, selected: Current = "ac") => (on.hazards() ? row(L("Current.Label"), select("current", (["dc", "ac", "rf"] as Current[]).map((c): [string, string] => [c, L(`Current.${c}`)]), selected)) : "");
const currentOf = (form: HTMLElement): Current => {
  const value = field(form, "current")?.value as Current;
  return value === "dc" || value === "ac" || value === "rf" ? value : "ac";
};
const sourceOptions = (on: ElectricitySwitches, lethalOnly = false): Array<[string, string]> =>
  SOURCES.filter((s) => (on.powerLines() || s === "formula" || s === "nonlethal") && !(lethalOnly && (s === "formula" || s === "nonlethal")))
    .map((s): [string, string] => {
      const table = VOLTAGE_ROWS.find((r) => r.key === s);
      return [s, table ? F("Source.Row", { source: L(`Source.${s}`), volts: table.volts }) : L(`Source.${s}`)];
    });

async function openTool(api: GWorldApi, on: ElectricitySwitches): Promise<void> {
  const modes = toolModes(on);
  if (!modes.length) return;
  const mode = modes.length === 1
    ? modes[0]!
    : await ask(L("Tool"), row(L("Mode.Label"), select("mode", modes.map((m): [string, string] => [m, L(`Mode.${m}`)]))), (form) => (field(form, "mode")?.value ?? modes[0]) as Mode);
  if (!mode) return;
  if (mode === "rod") {
    const answer = await ask(L("Rod.Title"),
      row(L("Rod.Label"), select("rod", LIGHTNING_RODS.map((r): [string, string] => [r, L(`Rod.${r}`)])))
      + row(L("Lightning.Large"), checkbox("large")),
      (form) => ({ rod: (field(form, "rod")?.value === "tl5" ? "tl5" : "inductive") as LightningRod, large: Boolean(field(form, "large")?.checked) }));
    if (answer) await lightningRod(api, answer);
    return;
  }
  const targets = targeted();
  if (!targets.length) return void ui.notifications?.warn(L("Target"));
  if (mode === "shock") return shockDialog(api, targets, on);
  if (mode === "work") return workDialog(api, targets, on);
  if (mode === "field") return inducedFieldOn(api, targets);
  if (mode === "lightning") {
    const answer = await ask(L("Mode.lightning"),
      row(L("Lightning.Large"), checkbox("large")) + row(L("Metal"), checkbox("metal")) + materialField(),
      (form) => ({ large: Boolean(field(form, "large")?.checked), metal: Boolean(field(form, "metal")?.checked), material: materialOf(form) }));
    if (answer) await lightningOn(api, targets, answer, on);
    return;
  }
  const answer = await ask(L("Mode.arcFlash"), row(L("ArcFlash.GogglesField"), checkbox("goggles")) + materialField(),
    (form) => ({ material: materialOf(form), goggles: Boolean(field(form, "goggles")?.checked) }));
  if (answer) await arcFlashOn(api, targetedTokens(), answer, on);
}

async function shockDialog(api: GWorldApi, targets: any[], on: ElectricitySwitches): Promise<void> {
  const protection = on.protection();
  const answer = await ask<ShockAnswer>(L("Mode.shock"),
    row(L("Source.Label"), select("source", sourceOptions(on), on.powerLines() ? "householdUs" : "formula"))
    + (on.powerLines() ? row(L("Source.VoltsField"), number("volts", 15000, 0)) : "")
    + row(L("Source.FormulaField"), text("formula", "1d"))
    + row(L("Source.ModifierField"), number("modifier", 0, null))
    + currentField(on)
    + row(L("Seconds"), number("seconds", 5, 1))
    + (protection ? row(L("Hands"), checkbox("hands", true)) + row(L("HandTool"), checkbox("handTool")) + row(L("Taped"), checkbox("taped")) : "")
    + row(L("Metal"), checkbox("metal"))
    + (on.hazards() ? row(L("Torso"), checkbox("torso", true)) + materialField() : ""),
    (form): ShockAnswer => ({
      source: field(form, "source")?.value ?? "formula",
      volts: Math.max(0, numberOf(form, "volts", 0)),
      formula: String(field(form, "formula")?.value ?? "").trim(),
      modifier: numberOf(form, "modifier", 0),
      current: currentOf(form),
      seconds: Math.max(1, numberOf(form, "seconds", 1)),
      hands: Boolean(field(form, "hands")?.checked),
      handTool: Boolean(field(form, "handTool")?.checked),
      taped: Boolean(field(form, "taped")?.checked),
      metal: Boolean(field(form, "metal")?.checked),
      torso: Boolean(field(form, "torso")?.checked),
      material: materialOf(form),
      hotStick: null,
    }));
  if (!answer) return;
  await shockOn(api, targets, answer, on);
}

/** Runs the tool's shock on each target. */
export async function shockOn(api: GWorldApi, victims: any[], answer: ShockAnswer, on: ElectricitySwitches): Promise<void> {
  const source = shockSource(api, answer);
  if (!source) return void ui.notifications?.warn(F("BadSource", { formula: answer.formula }));
  for (const victim of victims) {
    const handTool = answer.handTool && gearOn(victim).handTool;
    await contactSource(api, victim, source, { ...answer, handTool }, on);
  }
}

async function workDialog(api: GWorldApi, workers: any[], on: ElectricitySwitches): Promise<void> {
  const gear = gearOn(workers[0]);
  const tools: WorkTools = gear.handTool ? (gear.gloves > 0 || gear.faraday ? "safe" : "insulated") : "improvised";
  const answer = await ask<WorkAnswer>(L("Mode.work"),
    row(L("Work.Action"), select("action", [["cut", L("Work.Cut")], ["tap", L("Work.Tap")]]))
    + row(L("Source.Label"), select("source", sourceOptions(on, true), "householdUs"))
    + row(L("Source.VoltsField"), number("volts", 15000, 0))
    + currentField(on)
    + row(L("Work.ToolsLabel"), select("tools", WORK_TOOLS.map((t): [string, string] => [t, L(`Work.Tools.${t}`)]), tools))
    + (on.protection() ? row(L("Work.HotStick"), checkbox("hotStick", gear.hotStick !== null)) + row(L("Guarded"), checkbox("guarded")) : "")
    + row(L("Seconds"), number("seconds", 5, 1)),
    (form): WorkAnswer => ({
      tap: field(form, "action")?.value === "tap",
      source: field(form, "source")?.value ?? "householdUs",
      volts: Math.max(0, numberOf(form, "volts", 0)),
      current: currentOf(form),
      tools: (WORK_TOOLS.includes(field(form, "tools")?.value as WorkTools) ? field(form, "tools")!.value : "improvised") as WorkTools,
      hotStick: Boolean(field(form, "hotStick")?.checked),
      guarded: Boolean(field(form, "guarded")?.checked),
      seconds: Math.max(1, numberOf(form, "seconds", 1)),
    }));
  if (answer) await workOn(api, workers, answer, on);
}

// ── stolen power (HT:EE p. 19) ──

/** The printed grades of external power a line can be tapped for; not a computer's peripheral power. */
const TAPPABLE_GRADES: ReadonlySet<string> = new Set(["household", "majorAppliance", "industrial", "automotive", "external"]);

/** Whether a device runs on mains power that could be stolen, by the grades of external power it is printed with. */
export function runsOnMains(item: any): boolean {
  if (item?.type !== "equipment" || !ours(item)) return false;
  const grades = item.system?.extensions?.[MODULE_ID]?.power?.grades;
  return Array.isArray(grades) && grades.some((g: unknown) => TAPPABLE_GRADES.has(String(g ?? "").trim()));
}

/** The items whose stolen-power roll a fuse, breaker or GFI guards, while it is rolled. */
const guardedRolls = new Set<string>();
const itemKey = (item: any) => String(item?.uuid ?? item?.id ?? "");

/**
 * A device's daily roll on stolen power: HT-2 as an equipment failure roll, a
 * critical failure perhaps a fire (HT:EE pp. 9, 19). A guard on the circuit
 * holds a critical failure to an ordinary one before the system marks the
 * device (HT:EE p. 25; `downgradeCriticalFailure`, API 1.127.0): no fire, and
 * a minor repair rather than a major one.
 */
export async function stolenPowerCheck(api: GWorldApi, item: any, actor: any, guarded: boolean): Promise<any> {
  const key = itemKey(item);
  if (guarded) guardedRolls.add(key);
  let result: any;
  try {
    result = await api.items.equipmentFailure({ actor, item, modifier: STOLEN_POWER_MODIFIER, label: L("Stolen.Label") });
  } finally {
    guardedRolls.delete(key);
  }
  if (result?.outcome === "criticalFailure") await say(actor, L("Stolen.Label"), [L("Stolen.Fire")]);
  return result;
}

// ── registration ──

export function readyElectricity(api: GWorldApi, on: ElectricitySwitches): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-electricity",
    label: L("Tool"),
    icon: "fa-solid fa-bolt",
    visible: () => toolModes(on).length > 0,
    open: () => void openTool(api, on),
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-stolen-power",
    itemTypes: ["equipment"],
    label: L("Stolen.Label"),
    icon: "fa-solid fa-plug-circle-exclamation",
    visible: (item: any) => on.powerLines() && runsOnMains(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const guarded = on.protection()
          ? await ask(L("Stolen.Label"), row(L("Guarded"), checkbox("guarded")), (form) => Boolean(field(form, "guarded")?.checked))
          : false;
        if (guarded === null) return;
        await stolenPowerCheck(api, item, actor, guarded);
      })();
    },
  } as any);

  // Before anything is rolled: the current's step, the heart, the weak shock, and the gear (HT:EE pp. 9, 14-15).
  Hooks.on(api.combat.hooks.shockModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || typeof context !== "object") return;
    const key = keyOf(actor);
    const shock = pending.get(key) ?? null;
    noted.set(key, { kind: String(context.kind ?? ""), modifier: Number(context.modifier) || 0, lightning: shock?.current === "lightning", current: shock?.current ?? null });
    if (!Array.isArray(context.lines)) context.lines = [];
    if (shock?.lines.length) context.lines.push(...shock.lines);
    // Jerked free first, then the gear (which may make the victim immune), then what the current does.
    if (on.hazards() && shock?.pulledFree) {
      context.immune = true;
      context.lines.push(L("PulledFree"));
      return;
    }
    if (on.protection()) protectionModifiers(context, actor, shock);
    if (on.hazards() && !context.immune) hazardModifiers(context, shock);
  });

  // Once the system's damage is rolled: the weak-shock rule on a roll of 0 or less (HT:EE p. 9).
  Hooks.on(api.combat.hooks.shockDamage, (context: any) => {
    if (!on.hazards() || !context || typeof context !== "object") return;
    if (!Array.isArray(context.lines)) context.lines = [];
    // AC's whole steps: the system's -1 per 2 points, and -4 more with each (HT:EE p. 9).
    if (context.kind !== "nonlethal" && noted.get(keyOf(context.actor))?.current === "ac") {
      const extra = acExtraModifier(Number(context.injury) || 0);
      if (extra) context.modifier = (Number(context.modifier) || 0) + extra;
    }
    if (pending.has(keyOf(context.actor))) return;
    weakShockRolled(api, context);
  });

  // Once it is worked out: held to the source past 1 point of injury (HT:EE p. 9).
  Hooks.on(api.combat.hooks.afterShock, (context: any) => {
    const key = keyOf(context?.actor);
    const was = noted.get(key);
    noted.delete(key);
    if (!on.hazards() || !context || context.immune || !Array.isArray(context.lines)) return;
    // A bolt of lightning is over at once: nothing to hold on to.
    if (context.kind === "lethal" && !was?.lightning && Number(context.injury) > HOLDING_INJURY) context.contact = { held: true, label: L("CantLetGo") };
  });

  // A guard on the circuit holds a stolen-power device's critical failure to an ordinary one (HT:EE p. 25).
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    if (!context || !guardedRolls.has(itemKey(context.item))) return;
    context.downgradeCriticalFailure = true;
    context.downgradeLabel = L("Stolen.Guarded");
  });
}
