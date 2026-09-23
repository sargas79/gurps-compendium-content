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
 */

import { CELL_TABLES, initPower, powerPriceChange, readyPower, recharge, rechargeableGear, type CellTable } from "../../../shared/power/index.js";
import { storePower } from "../../../shared/power/data.js";
import type { Cell, CellFigures } from "../../../shared/power/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { bookOf } from "../../../shared/book-tables.js";
import { crankFatigue, crankedShare, fuelOf, generatorOf, palmCrankMinutes, solarPowered, tankLeft, type GeneratorFigures } from "./generators.js";

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

/** High-Tech's battery table, for the book's gear at TL5-8. */
export function highTechBatteries(): CellTable {
  return { book: "high-tech", tls: { min: 5, max: 8 }, figures: HIGH_TECH_BATTERIES, rule: BATTERIES_RULE, i18n: "GCC.HT" };
}

/** Registers the table and the power fields, so the book's records keep their batteries. */
export function initHighTechPower(): void {
  CELL_TABLES.register(highTechBatteries());
  initPower();
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

/** The carried generators and collectors. */
function generators(actor: any): Array<{ item: any; figures: GeneratorFigures }> {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item.system?.carried !== false)
    .map((item: any) => ({ item, figures: generatorFor(item) }))
    .filter((row): row is { item: any; figures: GeneratorFigures } => row.figures !== null);
}

/** What a generator does, in a line. */
function whatItDoes(figures: GeneratorFigures): string {
  if (figures.burns) return F(figures.burns.coal ? "BurnsOrCoal" : "Burns", { ...figures.burns, output: L(figures.mechanical ? "Mechanical" : "ExternalOutput") });
  if (figures.tank) return F(figures.tank.cylinder ? "TankCylinder" : "Tank", { amount: figures.tank.amount, fuel: L(`Fuel.${figures.tank.fuel}`), hours: figures.tank.hours });
  if (figures.cranked) return F("Cranked", { ...figures.cranked });
  if (figures.palmCrank) return F("PalmCrank", { ...figures.palmCrank });
  if (figures.recharger) return L("Recharger");
  return L(`Source.${figures.source}`);
}

/** The Gear tab section's data. */
function generatorContext(actor: any): Record<string, unknown> {
  return {
    rows: generators(actor).map(({ item, figures }) => {
      const tank = figures.tank;
      const left = tank ? tankLeft(tank, hoursRun(item)) : null;
      return {
        id: item.id,
        name: item.name,
        does: whatItDoes(figures),
        tank: Boolean(tank),
        left: left === null ? "" : F("TankLeft", { left: Math.round(left * 10) / 10, hours: tank!.hours }),
        run: Math.round(hoursRun(item) * 10) / 10,
        crank: Boolean(figures.cranked || figures.palmCrank),
        recharger: Boolean(figures.recharger),
      };
    }),
  };
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

/** Asks which rechargeable gadget to top up, and the time or the light. */
async function ask(title: string, targets: ReturnType<typeof rechargeableGear>, field: string): Promise<{ target: string; amount: number } | null> {
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
        return { target: String(get("target")?.value ?? ""), amount: Number(get("amount")?.value) || 0 };
      },
    },
    rejectClose: false,
  }) as { target: string; amount: number } | null;
  return asked;
}

/**
 * Cranks a muscle-powered generator (p. 14): 1 FP an hour, recharging about
 * 10 lbs. of batteries an hour, or powering a device meanwhile; a miniature
 * one gives five minutes of use for two of cranking, with no fatigue.
 */
async function crank(api: GWorldApi, item: any, figures: GeneratorFigures): Promise<void> {
  const actor = item.actor;
  if (!actor) return;
  const targets = rechargeableGear(actor);
  const palm = figures.palmCrank;
  const field = palm
    ? `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Minutes"))}</span><input type="number" name="amount" value="${palm.crankMinutes}" min="1" step="1" style="width:80px"></label>`
    : `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Hours"))}</span><input type="number" name="amount" value="1" min="1" step="1" style="width:80px"></label>`;
  const asked = await ask(F("CrankTitle", { name: item.name }), targets, field);
  if (!asked || asked.amount <= 0) return;
  const target = targets.find((t) => t.item.id === asked.target) ?? null;
  const lines: string[] = [];
  if (palm) {
    const minutes = palmCrankMinutes(palm, asked.amount);
    const back = target ? await recharge(target.item, minutes / 60) : 0;
    lines.push(target ? F("PalmRecharged", { cranked: asked.amount, name: target.item.name, minutes: Math.round(back * 600) / 10 }) : F("PalmPowered", { cranked: asked.amount, minutes }));
  } else if (figures.cranked) {
    const hours = Math.floor(asked.amount);
    const fp = crankFatigue(figures.cranked, hours);
    if (fp) await api.actors.applyInjury(actor, { amount: fp, fatigue: true, label: F("CrankFatigue", { name: item.name }) } as any);
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
 * scene, the dialog asks for it.
 */
async function solarRecharge(api: GWorldApi, item: any): Promise<void> {
  const actor = item.actor;
  if (!actor) return;
  const targets = rechargeableGear(actor);
  const read = darknessAtCarrier(api, actor);
  const darkness = [0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10].map((v) => `<option value="${v}">${v === 0 ? esc(L("GoodLight")) : v}</option>`).join("");
  const field = read === null
    ? `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Darkness"))}</span><select name="amount">${darkness}</select></label>`
    : `<p class="ihint">${esc(read ? F("DarknessRead", { darkness: read }) : L("LightRead"))}</p>`;
  const asked = await ask(F("SolarTitle", { name: item.name }), targets, field);
  if (!asked) return;
  const penalty = read ?? asked.amount;
  if (!solarPowered(penalty)) {
    await say(actor, item.name, [F("SolarDark", { darkness: penalty })]);
    return;
  }
  const target = targets.find((t) => t.item.id === asked.target) ?? null;
  if (target) await recharge(target.item, target.total);
  await say(actor, item.name, [target ? F("SolarRecharged", { name: target.item.name }) : L("SolarPowered")]);
}

function generatorListeners(api: GWorldApi, element: HTMLElement, actor: any): void {
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
  on("[data-gcc-generator-refuel]", ({ item, figures }) => refuel(item, figures));
  on("[data-gcc-generator-crank]", ({ item, figures }) => crank(api, item, figures));
  on("[data-gcc-generator-solar]", ({ item }) => solarRecharge(api, item));
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

/** Registers the engine's sheet parts, the generators section and the price change. */
export function readyHighTechPower(api: GWorldApi, on: () => boolean): void {
  readyPower(api);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-generators",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ht-generators.hbs`,
    visible: (actor) => on() && generators(actor).length > 0,
    context: (actor) => generatorContext(actor),
    listeners: (element, actor) => generatorListeners(api, element, actor),
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
