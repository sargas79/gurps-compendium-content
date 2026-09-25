/**
 * GURPS High-Tech's power (pp. 13-16): its batteries, as its table for the
 * shared cell engine, and its generators, energy collectors and fuels, behind
 * the book's switch `batteries`.
 *
 * The book prints a gadget's batteries as a size and an endurance -- "2×S/5
 * hrs." -- in sizes of its own, T to VL (p. 13), and the captured records
 * carry them in the module's power data. With the switch on, the shared
 * engine does the rest in the book's words: the Gear tab tracks each gadget's
 * endurance, rechargeable batteries cost five times as much and are recharged
 * rather than bought again, a gadget may take batteries of another size with
 * its endurance in proportion to their weight, and a power adapter or an
 * inverter lets it run on external power or on batteries (pp. 13-14). Changing
 * throwaway batteries uses up the spares the character carries.
 *
 * This file adds what only High-Tech prints: a Gear tab section for the
 * generators and collectors a character carries -- a tank's fuel, refilled
 * from the fuel carried; cranking a muscle-powered generator at 1 FP an hour
 * to recharge batteries; a solar recharger that gives nothing in the dark,
 * read from the scene's lighting where the character's token stands --
 * and the price and weight adapters, inverters and swapped batteries come to.
 *
 * The Electricity and Electronics supplement's power (HT:EE pp. 9, 16-18)
 * builds on this table: battery chemistries, energy storage and the grades
 * of external power, in `electricity.ts`, under their own switches; its
 * generators join the table in `generators.ts`, shown here under its
 * energyStorage switch.
 */

import { CELL_TABLES, initPower, powerPriceChange, readyPower, recharge, rechargeableGear, type CellTable } from "../../../shared/power/index.js";
import { powerData, storePower } from "../../../shared/power/data.js";
import type { Cell, CellFigures } from "../../../shared/power/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { bookOf, isRuleOn } from "../../../shared/book-tables.js";
import { PRINTED_CHEMISTRY, isChemistry } from "./chemistry.js";
import { crankFatigue, crankedShare, fuelOf, generatorOf, palmCrankMinutes, rechargeHours, rechargedShare, solarPowered, tankLeft, type GeneratorFigures, type WindSpeed } from "./generators.js";
import { readyElectricity, registerChemistryVariant, registerSupercapacitorVariant, type ElectricSwitches } from "./electricity.js";
import { advanceGenerators, generatorState, registerHighTechSources, runs, storeGeneratorState, type Availability } from "./sources.js";
import { SUPERCAPACITOR, flywheelFigures } from "./storage.js";

/** The battery sizes the book lists, smallest first (p. 13). */
export const BATTERY_SIZES = ["T", "XS", "S", "M", "L", "VL"] as const;

/** Each size's price, weight and Legality Class, for non-rechargeable batteries (p. 13). */
export const BATTERIES: Readonly<Record<(typeof BATTERY_SIZES)[number], Cell>> = Object.freeze({
  T: { cost: 0.25, weight: 0.02, lc: 4 },
  XS: { cost: 0.5, weight: 0.1, lc: 4 },
  S: { cost: 1, weight: 0.33, lc: 4 },
  M: { cost: 5, weight: 2, lc: 4 },
  L: { cost: 10, weight: 10, lc: 4 },
  VL: { cost: 20, weight: 50, lc: 4 },
});

/** Rechargeables cost "at least" five times as much; the prices are for throwaway ones (p. 13). */
export const RECHARGEABLE_COST = 5;

/**
 * High-Tech's figures as the engine takes them. The book gives no time to
 * change a battery, no flexible, cosmic or superscience cells, no rigging to
 * smaller ones and no REF for an exploding battery (Ultra-Tech's), so those
 * stay empty. What it has instead: rechargeables, any size swapped in by
 * weight (pp. 10, 13), and adapters and inverters, an inverter taking at
 * least an M battery (p. 14).
 */
export const HIGH_TECH_BATTERIES: CellFigures = Object.freeze({
  sizes: BATTERY_SIZES,
  cells: BATTERIES,
  replacementSeconds: Object.freeze({}),
  flexible: Object.freeze({ cost: 1, fullPrice: [] }),
  cosmic: Object.freeze({ cost: 1, lc: Object.freeze({}), ref: 0 }),
  nonRechargeable: 1,
  superscienceShots: 1,
  substitutePerStep: 1,
  juryRig: null,
  ref: Object.freeze({}),
  kinds: ["rechargeable"] as const,
  rechargeable: RECHARGEABLE_COST,
  swapByWeight: true,
  adapters: Object.freeze({ inverterMin: "M" }),
  spareRecord: "{size} Battery",
});

/** The book's battery switch. */
export const BATTERIES_RULE = `${MODULE_ID}.batteries`;

/** The supplement's switches for chemistries and for the grades of external power (HT:EE pp. 9, 16-18). */
export const CHEMISTRY_RULE = `${MODULE_ID}.batteryChemistry`;
export const EXTERNAL_POWER_RULE = `${MODULE_ID}.externalPower`;
export const ENERGY_STORAGE_RULE = `${MODULE_ID}.energyStorage`;

/**
 * High-Tech's battery table, for the book's gear at TL5-8. Its grades of
 * external power and built-in rechargeable batteries are the supplement's
 * (HT:EE p. 9), under that switch; gear High-Tech itself prints as running
 * on "external power" (p. 14) is plugged in under the book's own switch.
 */
export function highTechBatteries(): CellTable {
  return { book: "high-tech", tls: { min: 5, max: 8 }, figures: HIGH_TECH_BATTERIES, rule: BATTERIES_RULE, i18n: "GCC.HT", externalRule: EXTERNAL_POWER_RULE, ownGrade: "external", chemistryOf: batteryChemistryOf };
}

/**
 * The chemistry a gadget's or a spare battery's cells of a size are (HT:EE
 * pp. 16-18): the one chosen, under the chemistry switch (a supercapacitor
 * under energy storage), else the one High-Tech's table prints the size as.
 */
export function batteryChemistryOf(item: any, size: string): string {
  const chosen = String(item?.system?.extensions?.[MODULE_ID]?.power?.chemistry ?? "");
  if (chosen === SUPERCAPACITOR.key && isRuleOn(ENERGY_STORAGE_RULE)) return chosen;
  if (isChemistry(chosen) && isRuleOn(CHEMISTRY_RULE)) return chosen;
  return PRINTED_CHEMISTRY[size] ?? "";
}

let variantRegistered = false;

/** Registers the table and the power fields, so the book's records keep their batteries, and the supplement's chemistries. */
export function initHighTechPower(): void {
  CELL_TABLES.register(highTechBatteries());
  initPower();
  if (!variantRegistered) {
    variantRegistered = true;
    registerChemistryVariant(HIGH_TECH_BATTERIES, CHEMISTRY_RULE);
    registerSupercapacitorVariant(HIGH_TECH_BATTERIES, ENERGY_STORAGE_RULE);
  }
}

/** The switches the power rules read: High-Tech's batteries, and the supplement's three. */
export interface PowerSwitches extends ElectricSwitches {
  batteries: () => boolean;
}

const L = (key: string) => game.i18n.localize(`GCC.HT.Power.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Power.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A High-Tech generator or collector record (or one made by hand of the same name). */
export function generatorFor(item: any): GeneratorFigures | null {
  if (item?.type !== "equipment") return null;
  const book = bookOf(item);
  return book === null || book === "high-tech" ? generatorOf(item.name) : null;
}

/** Hours a generator has run on its tank since it was filled: the power data's hours used. */
function hoursRun(item: any): number {
  return Math.max(0, Number(item?.system?.extensions?.[MODULE_ID]?.power?.hoursUsed) || 0);
}

/**
 * Whether a generator's row shows: High-Tech's under its batteries switch,
 * the supplement's own under energyStorage (HT:EE pp. 17-18).
 */
export function generatorShown(figures: GeneratorFigures, on: PowerSwitches): boolean {
  return figures.volume === "ee" ? on.storage() : on.batteries();
}

/** The carried generators and collectors whose switch is on. */
function generators(actor: any, on: PowerSwitches): Array<{ item: any; figures: GeneratorFigures }> {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item.system?.carried !== false)
    .map((item: any) => ({ item, figures: generatorFor(item) }))
    .filter((row): row is { item: any; figures: GeneratorFigures } => row.figures !== null && generatorShown(row.figures, on));
}

/** The grades of external power, as the supplement names them. */
function gradeNames(grades: readonly string[]): string {
  return grades.map((grade) => game.i18n.localize(`GCC.HT.Energy.Grade.${grade}`)).join(L("Or"));
}

/** Hours to recharge a gadget's batteries at a rate the supplement prints, or null (HT:EE pp. 17-18). */
export function hoursToRecharge(rates: Readonly<Record<string, number>> | undefined, target: { size: string; cells: number }): number | null {
  return rechargeHours(rates, target, BATTERY_SIZES, (size) => BATTERIES[size as (typeof BATTERY_SIZES)[number]]?.weight ?? 0);
}

/** What the supplement says a generator does, in a line (HT:EE pp. 17-18). */
function supplementDoes(figures: GeneratorFigures): string {
  const ee = figures.ee!;
  const parts: string[] = [];
  if (ee.wind) {
    parts.push(F("WindOutput", { high: gradeNames(ee.wind.high.supplies), highHours: ee.wind.high.recharges.VL, low: gradeNames(ee.wind.low.supplies), lowHours: ee.wind.low.recharges.VL }));
    if (ee.skill) parts.push(F("WindSkill", { skill: ee.skill }));
  }
  if (ee.supplies?.length) parts.push(F("SuppliesGrades", { grades: gradeNames(ee.supplies) }));
  if (ee.standsFor) parts.push(F(ee.standsFor.cells === 1 ? "StandsForOne" : "StandsFor", { ...ee.standsFor }));
  if (ee.recharges) parts.push(F("RechargesIn", { rates: Object.entries(ee.recharges).map(([size, hours]) => F("Rate", { size, hours })).join(", ") }));
  if (ee.fpPerHour !== undefined && !ee.wind) parts.push(ee.fpPerHour ? F("FpPerHour", { fp: ee.fpPerHour }) : L("NoFatigue"));
  return parts.join("; ");
}

/**
 * What a generator does, in a line. Where the supplement's switch is on, its
 * figures stand in for High-Tech's own rate: the pedal generator is its
 * source and the supplement's rates (HT:EE p. 17).
 */
function whatItDoes(figures: GeneratorFigures, on: PowerSwitches): string {
  const supplement = figures.ee && on.storage() ? supplementDoes(figures) : "";
  if (figures.volume === "ee") return [figures.tank ? highTechDoes(figures) : "", supplement].filter(Boolean).join("; ");
  return supplement ? `${L(`Source.${figures.source}`)}; ${supplement}` : highTechDoes(figures);
}

/** What High-Tech says a generator does. */
function highTechDoes(figures: GeneratorFigures): string {
  if (figures.burns) return F(figures.burns.coal ? "BurnsOrCoal" : "Burns", { ...figures.burns, output: L(figures.mechanical ? "Mechanical" : "ExternalOutput") });
  if (figures.tank) return F(figures.tank.cylinder ? "TankCylinder" : "Tank", { amount: figures.tank.amount, fuel: L(`Fuel.${figures.tank.fuel}`), hours: figures.tank.hours });
  if (figures.cranked) return F("Cranked", { ...figures.cranked });
  if (figures.palmCrank) return F("PalmCrank", { ...figures.palmCrank });
  if (figures.recharger) return L("Recharger");
  return L(`Source.${figures.source}`);
}

const isHighTechOrNone = (item: any) => item?.type === "equipment" && (bookOf(item) === null || bookOf(item) === "high-tech");

/** The carried flywheels, under the supplement's energyStorage switch (HT:EE p. 18). */
function flywheels(actor: any, on: PowerSwitches): any[] {
  if (!on.storage()) return [];
  return [...(actor?.items ?? [])].filter((item: any) => item.system?.carried !== false && isHighTechOrNone(item) && powerData(item).storage.kind === "flywheel");
}

/** A source's status on a gadget's row, in the book's words. */
export function statusText(reading: Availability): string {
  return F(`SourceStatus.${reading.status}`, reading.data ?? {});
}

/** A flywheel's charge, as a share of a full store. */
function flywheelStatus(drawn: number): string {
  return drawn >= 1 ? L("SourceStatus.spunDown") : F("SourceStatus.flywheel", { percent: Math.round((1 - drawn) * 100) });
}

/** The wind a wind-driven source's row offers: the supplement's three speeds under its switch, High-Tech's windy or calm (p. 15; HT:EE p. 17). */
function windChoices(figures: GeneratorFigures, wind: string, on: PowerSwitches): Array<{ value: string; label: string; selected: boolean }> | null {
  if (figures.source !== "wind") return null;
  const speeds = figures.ee?.wind && on.storage();
  const chosen = !speeds && wind === "low" ? "high" : wind;
  return (speeds ? ["high", "low", "calm"] : ["high", "calm"]).map((value) => ({ value, label: L(speeds ? `Wind.${value}` : `Windmill.${value}`), selected: chosen === value }));
}

/** The Gear tab section's data. */
function generatorContext(actor: any, on: PowerSwitches): Record<string, unknown> {
  const rows: Array<Record<string, unknown>> = generators(actor, on).map(({ item, figures }) => {
    const tank = figures.tank;
    const left = tank ? tankLeft(tank, hoursRun(item)) : null;
    const state = generatorState(item);
    return {
      id: item.id,
      name: item.name,
      does: whatItDoes(figures, on),
      tank: Boolean(tank),
      left: left === null ? "" : F("TankLeft", { left: Math.round(left * 10) / 10, hours: tank!.hours }),
      run: Math.round(hoursRun(item) * 10) / 10,
      // Switched on and off, where it isn't worked by muscle; world time runs a tank or a firebox down.
      switchable: runs(figures),
      running: state.running,
      firebox: figures.burns ? F("Firebox", { wood: Math.round(state.wood), water: Math.round(state.water * 10) / 10 }) : "",
      windChoices: windChoices(figures, state.wind, on),
      crank: Boolean(figures.cranked || figures.palmCrank || (figures.source === "muscle" && figures.ee?.recharges && on.storage())),
      recharger: Boolean(figures.recharger || (figures.source === "solar" && figures.ee?.recharges && on.storage())),
      wind: Boolean(figures.ee?.wind && on.storage()),
    };
  });
  for (const item of flywheels(actor, on)) {
    const storage = powerData(item).storage;
    const f = flywheelFigures(storage.size, storage.material);
    rows.push({
      id: item.id,
      name: item.name,
      does: f ? F(f.grade ? "FlywheelDoes" : "FlywheelDoesNoGrade", { energy: Math.round(f.energy * 100) / 100, size: storage.size, grade: f.grade ? game.i18n.localize(`GCC.HT.Energy.Grade.${f.grade}`) : "", minutes: f.minutes }) : "",
      left: flywheelStatus(generatorState(item).drawn),
      flywheel: true,
    });
  }
  return { rows };
}

/**
 * The world's actors, each once: an unlinked token's copy of an actor shares
 * its id and is left out, so its base actor's generators run once a tick.
 */
function actorsOnce(): any[] {
  const seen = new Set<string>();
  const unlinked = [...((game as any).scenes ?? [])].flatMap((scene: any) => [...(scene.tokens ?? [])].filter((t: any) => !t.actorLink && t.actor).map((t: any) => t.actor));
  return [...((game as any).actors ?? []), ...unlinked].filter((actor: any) => {
    const id = String(actor?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Spins a flywheel up again on external power: a full store (HT:EE p. 18). */
async function spinUp(item: any): Promise<void> {
  await storeGeneratorState(item, { drawn: 0 });
  await say(item.actor, item.name, [L("SpunUp")]);
}

/** Fills a generator's tank, taking the fuel from what the actor carries where it has enough. */
async function refuel(item: any, figures: GeneratorFigures): Promise<void> {
  const tank = figures.tank;
  if (!tank) return;
  const actor = item.actor;
  const fuel = [...(actor?.items ?? [])].find((i: any) => fuelOf(i.name) === tank.fuel && i.system?.carried !== false && (Number(i.system?.quantity) || 0) >= tank.amount);
  if (fuel) await fuel.update({ "system.quantity": (Number(fuel.system.quantity) || 0) - tank.amount });
  await storePower(item, { hoursUsed: 0 });
  const line = fuel
    ? F(tank.cylinder ? "RefuelledFromCylinder" : "RefuelledFrom", { amount: tank.amount, fuel: L(`Fuel.${tank.fuel}`), name: fuel.name, hours: tank.hours })
    : F(tank.cylinder ? "RefuelledCylinder" : "Refuelled", { amount: tank.amount, fuel: L(`Fuel.${tank.fuel}`), hours: tank.hours });
  await say(actor, item.name, [line]);
}

/** Posts a line to the chat as the actor. */
async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** Asks which rechargeable gadget to top up, and the time, the light or the wind (a second field, `extra`). */
async function ask(title: string, targets: ReturnType<typeof rechargeableGear>, field: string): Promise<{ target: string; amount: number; extra: string } | null> {
  const options = targets.map((t) => `<option value="${esc(t.item.id)}">${esc(F("TargetOption", { name: t.item.name, left: Math.round(t.left * 10) / 10, total: Math.round(t.total * 10) / 10 }))}</option>`).join("");
  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Target"))}</span><select name="target"><option value="">${esc(L("NoTarget"))}</option>${options}</select></label>
      ${field}
    </div>`,
    ok: {
      label: L("Go"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const get = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return { target: String(get("target")?.value ?? ""), amount: Number(get("amount")?.value) || 0, extra: String(get("extra")?.value ?? "") };
      },
    },
    rejectClose: false,
  }) as { target: string; amount: number; extra: string } | null;
  return asked;
}

const labelled = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(label)}</span>${input}</label>`;
const hoursInput = (name: string, value = 1, step = 1) => `<input type="number" name="${name}" value="${value}" min="${step}" step="${step}" style="width:80px">`;

/**
 * Recharges a gadget at a rate the supplement prints (HT:EE pp. 17-18):
 * the share of its batteries' full charge the hours give, from the hours
 * one battery of its size takes. What it got back, in hours of use.
 */
async function rechargeAtRate(target: ReturnType<typeof rechargeableGear>[number], rates: Readonly<Record<string, number>> | undefined, hours: number): Promise<number> {
  const share = rechargedShare(hoursToRecharge(rates, target), hours);
  return recharge(target.item, share * target.total);
}

/**
 * Cranks a muscle-powered generator (p. 14): 1 FP an hour, recharging about
 * 10 lbs. of batteries an hour, or powering a device meanwhile; a miniature
 * one gives five minutes of use for two of cranking, with no fatigue. Under
 * the supplement's switch, one it prints rates for recharges at those
 * instead: the pedal generator an S battery in 1.5 hours or an M in 12, for
 * 1 FP an hour; the hand crank an XS in an hour or an S in 3, with no
 * fatigue (HT:EE p. 17).
 */
async function crank(api: GWorldApi, item: any, figures: GeneratorFigures, on: PowerSwitches): Promise<void> {
  const actor = item.actor;
  if (!actor) return;
  const targets = rechargeableGear(actor);
  const palm = figures.palmCrank;
  const supplement = on.storage() && figures.ee?.recharges ? figures.ee : null;
  const field = palm && !supplement
    ? labelled(L("Minutes"), hoursInput("amount", palm.crankMinutes))
    : labelled(L("Hours"), hoursInput("amount", 1, supplement ? 0.5 : 1));
  const asked = await ask(F("CrankTitle", { name: item.name }), targets, field);
  if (!asked || asked.amount <= 0) return;
  const target = targets.find((t) => t.item.id === asked.target) ?? null;
  const lines: string[] = [];
  if (supplement) {
    const hours = asked.amount;
    const fp = Math.floor(hours) * (supplement.fpPerHour ?? 0);
    // Cranking is exertion, through the fatigue chart (Campaigns p. 426).
    if (fp) await api.actors.spendFatigue(actor, fp, { details: { rule: "crank", item: String(item.name ?? "") } });
    if (target) {
      const back = await rechargeAtRate(target, supplement.recharges, hours);
      lines.push(F("CrankRecharged", { hours, fp, name: target.item.name, back: Math.round(back * 10) / 10 }));
    } else lines.push(F("CrankPowered", { hours, fp }));
  } else if (palm) {
    const minutes = palmCrankMinutes(palm, asked.amount);
    const back = target ? await recharge(target.item, minutes / 60) : 0;
    lines.push(target ? F("PalmRecharged", { cranked: asked.amount, name: target.item.name, minutes: Math.round(back * 600) / 10 }) : F("PalmPowered", { cranked: asked.amount, minutes }));
  } else if (figures.cranked) {
    const hours = Math.floor(asked.amount);
    const fp = crankFatigue(figures.cranked, hours);
    if (fp) await api.actors.spendFatigue(actor, fp, { details: { rule: "crank", item: String(item.name ?? "") } });
    if (target) {
      const share = crankedShare(figures.cranked, hours, target.weight);
      const back = await recharge(target.item, share * target.total);
      lines.push(F("CrankRecharged", { hours, fp, name: target.item.name, back: Math.round(back * 10) / 10 }));
    } else lines.push(F("CrankPowered", { hours, fp }));
  }
  await say(actor, item.name, lines);
}

/**
 * The darkness penalty where the character's token stands, from the scene's
 * lighting (API 1.96.0; Campaigns p. 394), or null where it has no token on
 * a scene. It is the light at the panel that counts, not anyone's eyes.
 */
export function darknessAtCarrier(api: GWorldApi, actor: any): number | null {
  const token = actor?.getActiveTokens?.()?.[0];
  if (!token) return null;
  const reading = api.areas.darknessAt(null, token);
  return reading ? Number(reading.penalty) || 0 : null;
}

/**
 * Recharges batteries with a solar recharger (p. 15): nothing at all in the
 * dark. The darkness is read at the character's token; without one on a
 * scene, the dialog asks for it. The supplement's portable solar panel
 * recharges at its own rates, an M battery in an hour or an L in a day
 * (HT:EE p. 17), in the hours asked.
 */
async function solarRecharge(api: GWorldApi, item: any, figures: GeneratorFigures, on: PowerSwitches): Promise<void> {
  const actor = item.actor;
  if (!actor) return;
  const targets = rechargeableGear(actor);
  const read = darknessAtCarrier(api, actor);
  const rates = on.storage() ? figures.ee?.recharges : undefined;
  const darkness = [0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10].map((v) => `<option value="${v}">${v === 0 ? esc(L("GoodLight")) : v}</option>`).join("");
  const light = read === null
    ? labelled(L("Darkness"), `<select name="${rates ? "extra" : "amount"}">${darkness}</select>`)
    : `<p class="ihint">${esc(read ? F("DarknessRead", { darkness: read }) : L("LightRead"))}</p>`;
  const field = rates ? labelled(L("Hours"), hoursInput("amount", 1, 0.5)) + light : light;
  const asked = await ask(F("SolarTitle", { name: item.name }), targets, field);
  if (!asked) return;
  const penalty = read ?? (rates ? Number(asked.extra) || 0 : asked.amount);
  if (!solarPowered(penalty)) {
    await say(actor, item.name, [F("SolarDark", { darkness: penalty })]);
    return;
  }
  const target = targets.find((t) => t.item.id === asked.target) ?? null;
  if (rates) {
    const back = target ? await rechargeAtRate(target, rates, asked.amount) : 0;
    await say(actor, item.name, [target ? F("RateRecharged", { hours: asked.amount, name: target.item.name, back: Math.round(back * 10) / 10 }) : F("RatePowered", { hours: asked.amount })]);
    return;
  }
  if (target) await recharge(target.item, target.total);
  await say(actor, item.name, [target ? F("SolarRecharged", { name: target.item.name }) : L("SolarPowered")]);
}

/**
 * Runs a wind generator for some hours (HT:EE p. 17): in high wind it gives
 * household power or recharges a VL battery in 2 hours, in low wind
 * automotive power or 10 hours, and in calm nothing. The TL6 model is
 * adjusted as the wind changes, by Machine Operation (Wind Generator) --
 * a failure gives no power for the spell -- and the TL8 model runs itself
 * at twice the output. The skill defaults to Electrician-5 or Mechanic
 * (Wind Generator)-5 (HT:EE p. 6).
 */
async function runWind(api: GWorldApi, item: any, figures: GeneratorFigures): Promise<void> {
  const actor = item.actor;
  const wind = figures.ee?.wind;
  if (!actor || !wind) return;
  const targets = rechargeableGear(actor);
  const speeds = ([["high", L("Wind.high")], ["low", L("Wind.low")], ["calm", L("Wind.calm")]] as Array<[string, string]>)
    .map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join("");
  const asked = await ask(F("WindTitle", { name: item.name }), targets, labelled(L("Hours"), hoursInput("amount", 1, 0.5)) + labelled(L("WindSpeed"), `<select name="extra">${speeds}</select>`));
  if (!asked || asked.amount <= 0) return;
  if (asked.extra !== "high" && asked.extra !== "low") {
    await storeGeneratorState(item, { wind: "calm" });
    await say(actor, item.name, [L("Wind.None")]);
    return;
  }
  const speed = asked.extra as WindSpeed;
  await storeGeneratorState(item, { wind: speed });
  const skill = figures.ee?.skill;
  if (skill) {
    const own = api.actors.skillLevel(actor, skill);
    const defaults = ["Electrician", "Mechanic (Wind Generator)"].map((name) => api.actors.skillLevel(actor, name)).filter((v): v is number => typeof v === "number").map((v) => v - 5);
    const level = typeof own === "number" ? own : defaults.length ? Math.max(...defaults) : null;
    if (level === null) {
      ui.notifications?.warn(F("NoWindSkill", { skill }));
      return;
    }
    const result: any = await api.roll.success({ actor, base: level, skill, item, label: F("WindRoll", { name: item.name }), modifiers: [], tags: ["machineOperation"] } as any);
    if (!result || "refused" in result) return;
    if (!result.success) {
      // Not kept up with the wind: no power for the spell, to the gadgets plugged in too.
      await storeGeneratorState(item, { wind: "calm" });
      await say(actor, item.name, [L("Wind.Failed")]);
      return;
    }
  }
  const output = wind[speed];
  const target = targets.find((t) => t.item.id === asked.target) ?? null;
  const back = target ? await rechargeAtRate(target, output.recharges, asked.amount) : 0;
  await say(actor, item.name, [target
    ? F("RateRecharged", { hours: asked.amount, name: target.item.name, back: Math.round(back * 10) / 10 })
    : F("WindPowered", { hours: asked.amount, grades: gradeNames(output.supplies) })]);
}

function generatorListeners(api: GWorldApi, element: HTMLElement, actor: any, switches: PowerSwitches): void {
  const rowOf = (el: HTMLElement) => {
    const item = actor.items.get(el.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? "");
    const figures = item ? generatorFor(item) : null;
    return item && figures ? { item, figures } : null;
  };
  element.querySelectorAll<HTMLInputElement>("[data-gcc-generator-run]").forEach((input) => {
    input.addEventListener("change", async () => {
      const row = rowOf(input);
      if (row) await storePower(row.item, { hoursUsed: Math.max(0, Number(input.value) || 0) });
    });
  });
  const on = (selector: string, run: (row: { item: any; figures: GeneratorFigures }) => Promise<void>) =>
    element.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => button.addEventListener("click", () => {
      const row = rowOf(button);
      if (row) void run(row);
    }));
  element.querySelectorAll<HTMLInputElement>("[data-gcc-generator-running]").forEach((input) => {
    input.addEventListener("change", async () => {
      const row = rowOf(input);
      if (row) await storeGeneratorState(row.item, { running: input.checked });
    });
  });
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-generator-wind-now]").forEach((select) => {
    select.addEventListener("change", async () => {
      const row = rowOf(select);
      const value = String(select.value);
      if (row && (value === "high" || value === "low" || value === "calm")) await storeGeneratorState(row.item, { wind: value });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-flywheel-spin]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = actor.items.get(button.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? "");
      if (item) void spinUp(item);
    });
  });
  on("[data-gcc-generator-refuel]", ({ item, figures }) => refuel(item, figures));
  on("[data-gcc-generator-crank]", ({ item, figures }) => crank(api, item, figures, switches));
  on("[data-gcc-generator-solar]", ({ item, figures }) => solarRecharge(api, item, figures, switches));
  on("[data-gcc-generator-wind]", ({ item, figures }) => runWind(api, item, figures));
}

/**
 * What the switch changes on an item's price and weight: adapters, inverters
 * and swapped batteries (pp. 10, 13-14), and the lighter TL8 gasoline
 * generator (p. 14).
 */
export function highTechPowerPrice(item: any, price: { cost: number; weight: number }, on: () => boolean): { cost: number; weight: number } | null {
  if (!on()) return null;
  let { cost, weight } = price;
  const change = powerPriceChange(item);
  if (change) {
    cost += change.cost;
    weight += change.weight;
  }
  const generator = generatorFor(item);
  const tl = Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]);
  if (generator?.tl8Weight && tl >= 8) weight *= generator.tl8Weight;
  return cost !== price.cost || weight !== price.weight ? { cost, weight: Math.round(weight * 1000) / 1000 } : null;
}

/**
 * Registers the engine's sheet parts, the generators section and the price
 * change, and the supplement's chemistries, storage and grades of external
 * power (HT:EE pp. 9, 16-18).
 */
export function readyHighTechPower(api: GWorldApi, switches: PowerSwitches): void {
  const on = switches.batteries;
  readyPower(api);
  readyElectricity(api, HIGH_TECH_BATTERIES, switches);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-generators",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ht-generators.hbs`,
    visible: (actor) => generators(actor, switches).length > 0 || flywheels(actor, switches).length > 0,
    context: (actor) => generatorContext(actor, switches),
    listeners: (element, actor) => generatorListeners(api, element, actor, switches),
  });

  // Generators, collectors and flywheels as what a gadget is plugged into (pp. 14-15; HT:EE pp. 17-18).
  const shown = (figures: GeneratorFigures) => generatorShown(figures, switches);
  registerHighTechSources({
    generatorFor,
    shown,
    storageOn: switches.storage,
    darkness: (actor) => darknessAtCarrier(api, actor),
    statusText,
    flywheelStatus,
  }, () => on() || switches.storage());

  // A running generator burns its fuel as world time passes: the active GM's client keeps the count (pp. 14, 16),
  // one tick after another, so two quick advances never read the same state.
  const isActiveGm = () => (game as any).user?.isGM === true && (game as any).users?.activeGM?.id === (game as any).user?.id;
  let ticks: Promise<void> = Promise.resolve();
  Hooks.on("updateWorldTime", (_time: number, delta: number) => {
    if (!(on() || switches.storage()) || !isActiveGm() || !(Number(delta) > 0)) return;
    const hours = Number(delta) / 3600;
    ticks = ticks.then(async () => {
      for (const actor of actorsOnce()) {
        await advanceGenerators(actor, hours, { generatorFor, shown }, (a, item, line) => say(a, item.name, [line]), api, {
          empty: (item) => F("RanDry", { name: item.name }),
          noWood: (item) => F("RanOutOfWood", { name: item.name }),
          woodReason: (item) => F("WoodBurned", { name: item.name }),
        });
      }
    }).catch((error) => console.error(`${MODULE_ID} | generators`, error));
  });

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-power",
    types: ["equipment", "armor"],
    apply: (item: any, price: { cost: number; weight: number }) => {
      const changed = highTechPowerPrice(item, price, on);
      return changed ? { ...changed, label: L("PriceLabel") } : null;
    },
  } as any);
}
