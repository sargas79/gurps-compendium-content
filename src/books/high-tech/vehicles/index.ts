/**
 * High-Tech's vehicle components, protection and crew (pp. 228-229,
 * 234-235), registered with the system through the add-on API under three
 * switches. The rules are in `rules.ts`; what each of the chapter's vehicles
 * is fitted with is in its record's own data (`htVehicleFit`, from
 * `HT_VEHICLES`), and a GM fits any other from the tool. A vehicle's state -- flat tyres, hatches, motor, the
 * GM's fittings -- is this module's flag on the vehicle actor (or on the
 * vehicle equipment, on a Gear tab).
 *
 * The GM tool, the restraint and the armour against shaped charges are the
 * shared vehicle engine's (`src/shared/vehicles`), whose tables Ultra-Tech's
 * vehicle systems and electromagnetic armour are in too; this book's need
 * only its own switches.
 *
 *   - **Vehicle components (vehicleComponents):** firing from a gun port
 *     (-1, a 30-degree arc, refused for a weapon bulkier than -5) and shooting
 *     at someone at one (-4 to -7); linked weapons fired as one at the sum of
 *     their RoF; and on the GM's tool, a turret's turn in Ready maneuvers, a
 *     searchlight's lit circle and its blinding attack, a smoke discharger's
 *     screen, and hearing a sound-baffled vehicle at -(TL-4).
 *   - **Protection (vehicleProtection):** spaced armour's DR x1.5 and
 *     laminated armour's x2 against HEAT and HEDP before the armour divisor,
 *     cockpit armour and gun shields told on an occupant hit
 *     (`gworld.afterVehicleHit`'s `occupantHit`),
 *     and HESH's spall stopped, on the vehicle's DR where a shot lands
 *     (`gworld.vehicleDr`), armour skirts added on their faces; riveted armour's
 *     flying rivets once the shot is worked out (`gworld.afterVehicleHit`); on
 *     flat run-flat tyres -1 Handling and top speed less 20% while they last
 *     (`gworld.vehicleStats`, which the control roll and Dodge read; CTIS
 *     ignoring two or three flats), in place of the system's crippled-wheel
 *     Move for the wheels it counts crippled; improved brakes' +1 on a control roll made
 *     for braking hard; and on the tool, braking hard, an extinguisher's or
 *     fire-suppression system's roll, airbags in a collision and getting out
 *     from behind one (the shared restraint).
 *   - **Crew (crewConditions):** in a tank, hearing each other at -4 with the
 *     motor running and no headsets, hearing outside at -10 (-3 with the motor
 *     off), and -2 to Vision buttoned up (`gworld.detectionModifiers`); a
 *     fight in one costs 1 FP more every 10 minutes (`gworld.fatigueCost`),
 *     and the tool charges the ride's 1 FP an hour.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  RESTRAINT_TABLES,
  SHAPED_ARMOUR_TABLES,
  ask,
  check,
  crewOf,
  freeFrom,
  isVehicle,
  num,
  operatorOf,
  picked,
  readyRestraints,
  restrain,
  row,
  say,
  select,
  val,
  vehicleAboard,
  type RestraintTable,
} from "../../../shared/vehicles/index.js";
import { drAgainstShapedCharge, shapedArmourMultiplier } from "../../../shared/vehicles/rules.js";
import { loadIn } from "../ammunition/index.js";
import {
  AIRBAG,
  BUTTONED_UP,
  FITTINGS,
  GUN_PORT,
  HT_SHAPED_ARMOUR,
  HT_VEHICLES,
  IMPROVED_BRAKES,
  RIVET_SPALL,
  RUN_FLAT,
  SEARCHLIGHT,
  SMOKESCREEN,
  SUPPRESSION_RETRY_SECONDS,
  airbagsFire,
  armourKindAt,
  chargeOf,
  combatFatigue,
  crewArmourDr,
  extinguishTarget,
  fitFromData,
  fitWith,
  fitsGunPort,
  flatTyres,
  gunPortPenalty,
  linkedRateOfFire,
  rideFatigue,
  rivetsMayFly,
  runFlatMiles,
  runFlatMove,
  searchlightRadius,
  skirtsAt,
  soundBaffling,
  tankHearing,
  turretReadies,
  type Charge,
  type CrewArmour,
  type VehicleFit,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Vehicles.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Vehicles.${key}`, data);

/** The flag a vehicle keeps its state in. */
const FLAG = "htVehicle";
const AIRBAG_FLAG = "htAirbagDr";
const SEARCHLIGHT_BLINDED = "ht-searchlight";
const GUN_PORT_OPTION = "ht-gun-port";
const AT_GUN_PORT_OPTION = "ht-at-gun-port";
const LINKED_OPTION = "ht-linked-weapons";

export interface VehicleSwitches {
  components: () => boolean;
  protection: () => boolean;
  crew: () => boolean;
}

/** What a vehicle's flag holds. */
export interface VehicleState {
  /** Tyres flat now. */
  flats: number;
  buttonedUp: boolean;
  motorRunning: boolean;
  /** Components the GM fitted, beyond what the book gives it. */
  fittings: string[];
}

export function stateOf(vehicle: any): VehicleState {
  const raw = vehicle?.flags?.[MODULE_ID]?.[FLAG] ?? {};
  return {
    flats: Math.max(0, Math.floor(Number(raw.flats) || 0)),
    buttonedUp: raw.buttonedUp === true,
    motorRunning: raw.motorRunning === true,
    fittings: (Array.isArray(raw.fittings) ? raw.fittings : []).filter((f: unknown) => (FITTINGS as readonly unknown[]).includes(f)),
  };
}
const storeState = (vehicle: any, patch: Partial<VehicleState>) => vehicle.setFlag(MODULE_ID, FLAG, { ...stateOf(vehicle), ...patch });

/** The field a vehicle record keeps the components its text gives it in. */
const FIT_FIELD = "htVehicleFit";

/**
 * The components a vehicle's record gives it: its own data, which a vehicle
 * put on the road takes with it; for a copy of a record made before the
 * records carried it, the book's table by its name.
 */
export function recordFit(vehicle: any): VehicleFit | null {
  return fitFromData(vehicle?.system?.extensions?.[MODULE_ID]?.[FIT_FIELD]) ?? HT_VEHICLES[String(vehicle?.name ?? "")] ?? null;
}

/** What a vehicle is fitted with: its record's components and the GM's. */
export function fitOf(vehicle: any): VehicleFit {
  return fitWith(recordFit(vehicle) ?? {}, stateOf(vehicle).fittings);
}

/** Adds the field a vehicle record keeps its components in, on vehicle items and actors. */
export function initVehicleFits(): void {
  const f = foundry.data.fields as any;
  const field = () => new f.ObjectField({ required: false, nullable: true, initial: null });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { [FIT_FIELD]: field() });
  addExtensionFields("Actor", ["vehicle"], { [FIT_FIELD]: field() });
}

const tlOf = (vehicle: any) => Number(/\d+/.exec(String(vehicle?.system?.tl ?? ""))?.[0]) || 0;

/** Its wheels, off the Locations column: "4W" is four (Campaigns p. 554). */
export function wheelsOf(vehicle: any): number {
  const m = /(\d*)W(?![a-z])/.exec(String(vehicle?.system?.vehicle?.locations ?? ""));
  return m ? Number(m[1]) || 1 : 0;
}

/** Whether the motor is running: set so, or the vehicle moving. */
const motorRunning = (vehicle: any) => stateOf(vehicle).motorRunning || (Number(vehicle?.system?.speed) || 0) > 0;

/** The restraint this book puts in the shared engine: the airbag (p. 229). */
export function htRestraints(protectionSwitch: string): RestraintTable {
  return Object.freeze({
    book: "high-tech",
    switch: protectionSwitch,
    restraints: Object.freeze({ airbag: { condition: "ht-airbag", escape: AIRBAG.escape, ablative: false, flag: AIRBAG_FLAG } }),
  });
}

/** Registers this book's tables with the shared vehicle engine. */
export function initVehicles(protectionSwitch: string): void {
  RESTRAINT_TABLES.register(htRestraints(protectionSwitch));
  SHAPED_ARMOUR_TABLES.register(HT_SHAPED_ARMOUR);
}

// ── what a shot is ──

/** A shot's charge, from its load, its names and its line (pp. 169-170, 229). */
export function chargeFor(context: { item?: any; mode?: any; damageType?: string | undefined; armorDivisor?: number | undefined }): Charge {
  const item = context.item ?? null;
  const index = Math.max(0, Math.floor(Number(context.mode?.index) || 0));
  const mode = item?.system?.rangedModes?.[index] ?? null;
  const projectile = item ? loadIn(item, index).load.projectile : "";
  return chargeOf({
    projectile,
    names: item ? [String(item.name ?? ""), String(mode?.name ?? "")] : [],
    damageType: context.damageType,
    armorDivisor: context.armorDivisor,
    explosive: mode ? mode.explosive === true || mode.linked?.explosive === true : undefined,
  });
}

// ── what a vehicle's sheet says ──

/** The lines a vehicle's item sheet shows for its components. */
export function fitLines(vehicle: any, on: VehicleSwitches): string[] {
  const fit = fitOf(vehicle);
  const tl = tlOf(vehicle);
  const lines: string[] = [];
  if (on.components()) {
    if (fit.gunPorts) lines.push(F("Line.gunPorts", { count: fit.gunPorts, skill: GUN_PORT.skill, arc: GUN_PORT.arcDegrees, bulk: GUN_PORT.worstBulk, outside: gunPortPenalty(fit.gunPortPenalty) }));
    if (fit.turretReadies) lines.push(F("Line.turret", { readies: fit.turretReadies }));
    if (fit.turretSeconds) lines.push(F("Line.turretSeconds", { seconds: fit.turretSeconds }));
    if (fit.searchlightMiles) lines.push(F("Line.searchlight", { miles: fit.searchlightMiles, radius: searchlightRadius(fit.searchlightMiles), spotted: fit.searchlightMiles * SEARCHLIGHT.spottedFactor }));
    if (fit.smokeDischargers) lines.push(F("Line.smoke", SMOKESCREEN));
    if (fit.soundBaffling) lines.push(F("Line.baffling", { modifier: soundBaffling(tl) }));
    if (fit.iff) lines.push(L("Line.iff"));
  }
  if (on.protection()) {
    if (fit.extinguisher) lines.push(F("Line.extinguisher", { target: extinguishTarget(tl, false) }));
    if (fit.fireSuppression) lines.push(F("Line.suppression", { target: extinguishTarget(tl, true), seconds: SUPPRESSION_RETRY_SECONDS }));
    if (fit.runFlat) lines.push(F("Line.runFlat", { handling: RUN_FLAT.handling, miles: runFlatMiles(tl) }));
    if (fit.ctis) lines.push(F("Line.ctis", { flats: wheelsOf(vehicle) >= 8 ? 3 : 2 }));
    if (fit.airbags) lines.push(F("Line.airbags", { dr: AIRBAG.dr, move: AIRBAG.aboveMove }));
    if (fit.improvedBrakes) lines.push(F("Line.brakes", { bonus: IMPROVED_BRAKES }));
    if (fit.laminated?.length) lines.push(L("Line.laminated"));
    if (fit.spaced?.length) lines.push(F("Line.spaced", { where: fit.spaced.map((s) => L(`Part.${s.part}`) + (s.arcs?.length ? ` (${s.arcs.map((a) => L(`Arc.${a}`)).join(", ")})` : "")).join(", ") }));
    for (const skirt of fit.skirts ?? []) lines.push(F("Line.skirt", { dr: skirt.dr, part: L(`Part.${skirt.part}`) }));
    if (fit.riveted) lines.push(F("Line.riveted", { damage: RIVET_SPALL.damage }));
    for (const armour of fit.crewArmour ?? []) lines.push(F("Line.crewArmour", { post: L(`Post.${armour.post}`), faces: crewArmourFaces(armour) }));
    for (const shield of fit.gunShields ?? []) lines.push(F("Line.gunShield", { dr: shield.dr, mount: L(`Mount.${shield.mount}`) }));
  }
  if (on.crew() && fit.tank) lines.push(L(fit.intercom ? "Line.tankIntercom" : "Line.tank"));
  return lines;
}

/** A crew post's armour, face by face, as the sheet and the card say it. */
function crewArmourFaces(armour: CrewArmour): string {
  return (["front", "side", "rear"] as const)
    .map((face) => ({ face, dr: crewArmourDr(armour, face) }))
    .filter((f) => f.dr !== null)
    .map((f) => F("Face", { dr: f.dr, face: L(`Arc.${f.face}`) }))
    .join(", ");
}

/**
 * An occupant hit (Campaigns p. 555) on a vehicle whose crew posts are
 * armoured: what the cockpit armour gives the crewman behind it from the
 * face the shot came in by, and the gun shields on single mounts. Which
 * occupant was hit is the GM's pick, so the card says both.
 */
export function occupantHitLines(fit: VehicleFit, arc: string | null, dice: number): string[] {
  const lines: string[] = [];
  for (const armour of fit.crewArmour ?? []) {
    const dr = crewArmourDr(armour, arc);
    const post = L(`Post.${armour.post}`);
    lines.push(dr === null ? F("Occupant.noArmour", { post, face: L(`Arc.${arc ?? "front"}`) }) : F("Occupant.armour", { post, dr, face: L(`Arc.${arc ?? "front"}`), dice }));
  }
  for (const shield of fit.gunShields ?? []) lines.push(F("Occupant.gunShield", { dr: shield.dr, mount: L(`Mount.${shield.mount}`) }));
  return lines;
}

// ── the GM tool ──

type Kind =
  | "describe" | "fit" | "turret" | "searchlight" | "smoke" | "baffling"
  | "extinguish" | "flats" | "airbag" | "brake" | "free"
  | "ride" | "button" | "motor";

function kindsOn(on: VehicleSwitches): Kind[] {
  const kinds: Kind[] = ["describe", "fit"];
  if (on.components()) kinds.push("turret", "searchlight", "smoke", "baffling");
  if (on.protection()) kinds.push("extinguish", "flats", "airbag", "brake", "free");
  if (on.crew()) kinds.push("ride", "button", "motor");
  return kinds;
}

interface Answer { kind: Kind; degrees: number; miles: number; range: number; aimed: boolean; night: boolean; flats: number; speed: number; hours: number; headOut: boolean }

async function vehicleTool(api: GWorldApi, on: VehicleSwitches): Promise<void> {
  const { selected, targets } = picked();
  const answer = await ask<Answer>(L("Tool.Title"),
    row(L("Tool.Kind"), select("kind", kindsOn(on).map((k) => [k, L(`Tool.${k}`)])))
    + row(L("Tool.Degrees"), num("degrees", 60)) + row(L("Tool.Miles"), num("miles", 0.25)) + row(L("Tool.Range"), num("range", 0))
    + row(L("Tool.Aimed"), check("aimed")) + row(L("Tool.Night"), check("night", true)) + row(L("Tool.FlatCount"), num("flats", 1))
    + row(L("Tool.Speed"), num("speed", 10)) + row(L("Tool.Hours"), num("hours", 1)) + row(L("Tool.HeadOut"), check("headOut")),
    (form) => ({
      kind: (val(form, "kind")?.value ?? "describe") as Kind,
      degrees: Number(val(form, "degrees")?.value) || 0, miles: Number(val(form, "miles")?.value) || 0, range: Math.trunc(Number(val(form, "range")?.value) || 0),
      aimed: Boolean(val(form, "aimed")?.checked), night: Boolean(val(form, "night")?.checked), flats: Math.max(0, Math.floor(Number(val(form, "flats")?.value) || 0)),
      speed: Number(val(form, "speed")?.value) || 0, hours: Number(val(form, "hours")?.value) || 0, headOut: Boolean(val(form, "headOut")?.checked),
    }));
  if (!answer) return;
  // Getting out from behind an airbag is the occupant's own roll.
  if (answer.kind === "free") {
    if (!targets.length) return void ui.notifications?.warn(L("Tool.Target"));
    const table = RESTRAINT_TABLES.forBook("high-tech");
    for (const victim of targets) if (table) await freeFrom(api, victim, table, "airbag", { roll: L("Tool.FreeLabel"), line: L("Tool.airbag") });
    return;
  }
  const vehicle = isVehicle(selected) ? selected : null;
  if (!vehicle) return void ui.notifications?.warn(L("Tool.PickVehicle"));
  await runKind(api, vehicle, answer, targets, on);
}

export async function runKind(api: GWorldApi, vehicle: any, answer: Answer, targets: any[], on: VehicleSwitches): Promise<void> {
  const fit = fitOf(vehicle);
  const tl = tlOf(vehicle);
  const name = String(vehicle.name ?? "");
  switch (answer.kind) {
    case "describe": {
      const lines = fitLines(vehicle, on);
      return say(vehicle, name, lines.length ? lines : [L("Tool.NothingFitted")]);
    }
    case "fit":
      return fitDialog(vehicle);
    case "turret": {
      if (fit.turretSeconds) return say(vehicle, L("Tool.turret"), [F("Tool.TurretSeconds", { seconds: fit.turretSeconds * Math.ceil(Math.min(180, Math.abs(answer.degrees)) / 60), degrees: answer.degrees })]);
      if (!fit.turretReadies) return say(vehicle, L("Tool.turret"), [L("Tool.NoTurret")]);
      return say(vehicle, L("Tool.turret"), [F("Tool.TurretReadies", { readies: turretReadies(fit.turretReadies, answer.degrees), degrees: answer.degrees }), L("Tool.TurretFire")]);
    }
    case "searchlight":
      return searchlight(api, vehicle, fit, answer, targets);
    case "smoke": {
      const dice = new Roll(SMOKESCREEN.disperses);
      await dice.evaluate();
      return say(vehicle, L("Tool.smoke"), [F("Tool.Smokescreen", { ...SMOKESCREEN, minutes: Number(dice.total) || 1 })]);
    }
    case "baffling": {
      if (!fit.soundBaffling) return say(vehicle, L("Tool.baffling"), [L("Tool.NotBaffled")]);
      if (!targets.length) return void ui.notifications?.warn(L("Tool.Target"));
      for (const listener of targets) {
        const base = Number(api.actors.derived(listener)?.senses?.find?.((s: any) => s?.sense === "hearing")?.score) || Number(api.actors.derived(listener)?.per) || 10;
        await api.roll.success({ actor: listener, base, skill: "Hearing", kind: "attribute", tags: ["hearing", "detection"], label: F("Tool.HearLabel", { name }), modifiers: [{ label: L("Tool.baffling"), value: soundBaffling(tl) }] } as any);
      }
      return;
    }
    case "extinguish":
      return extinguish(api, vehicle, fit, tl);
    case "brake": {
      // Braking hard is a control roll made for that reason (Campaigns p. 466), which improved brakes help.
      const driver = operatorOf(vehicle);
      if (!driver) return void ui.notifications?.warn(L("Tool.NoOperator"));
      return api.hazards.controlVehicle({ actor: driver, vehicle, reason: HARD_BRAKING });
    }
    case "flats": {
      await storeState(vehicle, { flats: answer.flats });
      const state = flatTyres(fit, answer.flats, wheelsOf(vehicle));
      return say(vehicle, L("Tool.flats"), [F(`Tool.Flats.${state}`, { flats: answer.flats, handling: RUN_FLAT.handling, miles: runFlatMiles(tl) })]);
    }
    case "airbag": {
      if (!fit.airbags) return say(vehicle, L("Tool.airbag"), [L("Tool.NoAirbags")]);
      if (!airbagsFire(answer.speed)) return say(vehicle, L("Tool.airbag"), [F("Tool.AirbagsStay", { move: AIRBAG.aboveMove })]);
      const table = RESTRAINT_TABLES.forBook("high-tech");
      const aboard = crewOf(vehicle);
      for (const occupant of aboard) if (table) await restrain(api, occupant, table.restraints.airbag!, AIRBAG.dr, F("Tool.Airbagged", { dr: AIRBAG.dr }));
      return say(vehicle, L("Tool.airbag"), [F("Tool.AirbagsFired", { count: aboard.length, dr: AIRBAG.dr, escape: AIRBAG.escape })]);
    }
    case "ride": {
      const fp = rideFatigue(answer.hours, answer.headOut);
      const riders = targets.length ? targets : crewOf(vehicle);
      // Being thrown about isn't exertion, so Very Fit doesn't halve it; past 0 FP it still hurts (Campaigns p. 426).
      for (const rider of riders) if (fp > 0) await api.actors.spendFatigue(rider, fp, { exertion: false, details: { rule: "ride" } });
      return say(vehicle, L("Tool.ride"), [F(answer.headOut ? "Tool.RodeHeadOut" : "Tool.Rode", { hours: answer.hours, fp, count: riders.length })]);
    }
    case "button": {
      const buttonedUp = !stateOf(vehicle).buttonedUp;
      await storeState(vehicle, { buttonedUp });
      return say(vehicle, L("Tool.button"), [buttonedUp ? F("Tool.ButtonedUp", { vision: BUTTONED_UP.vision, yards: BUTTONED_UP.blindYards }) : L("Tool.HatchesOpen")]);
    }
    case "motor": {
      const running = !stateOf(vehicle).motorRunning;
      await storeState(vehicle, { motorRunning: running });
      return say(vehicle, L("Tool.motor"), [L(running ? "Tool.MotorOn" : "Tool.MotorOff")]);
    }
  }
}

/** The GM fits a vehicle with components beyond its record's. */
async function fitDialog(vehicle: any): Promise<void> {
  const state = stateOf(vehicle);
  const chosen = await ask<string[]>(F("Tool.FitTitle", { name: vehicle.name }),
    FITTINGS.map((f) => row(L(`Fitting.${f}`), check(f, state.fittings.includes(f)))).join(""),
    (form) => FITTINGS.filter((f) => Boolean(val(form, f)?.checked)));
  if (!chosen) return;
  await storeState(vehicle, { fittings: chosen });
}

/** Yards between two actors' tokens on the map, or null where either has none there. */
function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const from = a?.getActiveTokens?.()?.[0];
  const to = b?.getActiveTokens?.()?.[0];
  if (!from?.center || !to?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/** A searchlight's blinding attack on each target (p. 228). */
async function searchlight(api: GWorldApi, vehicle: any, fit: VehicleFit, answer: Answer, targets: any[]): Promise<void> {
  const lines = [F("Tool.Lit", { miles: answer.miles, radius: searchlightRadius(answer.miles), spotted: answer.miles * SEARCHLIGHT.spottedFactor })];
  if (!fit.searchlightMiles) lines.unshift(L("Tool.NoSearchlight"));
  await say(vehicle, L("Tool.searchlight"), lines);
  if (!targets.length) return;
  const operator = operatorOf(vehicle);
  if (!operator) return void ui.notifications?.warn(L("Tool.NoOperator"));
  for (const target of targets) {
    // A ranged attack: the Speed/Range Table's penalty for the distance on the map, unless one was typed in.
    const yards = answer.range ? null : yardsBetween(vehicle, target);
    const range = answer.range || (yards === null ? 0 : api.rules.speedRangeModifier(yards));
    const modifiers = [
      ...(answer.aimed ? [{ label: L("Tool.SearchlightAcc"), value: SEARCHLIGHT.accuracy }] : []),
      ...(range ? [{ label: yards === null ? L("Tool.Range") : F("Tool.RangeYards", { yards: Math.round(yards) }), value: range }] : []),
    ];
    const hit: any = await api.roll.success({ actor: operator, base: api.actors.attribute(operator, "DX") ?? 10, kind: "attribute", label: F("Tool.SearchlightLabel", { name: target.name }), modifiers } as any);
    if (!hit?.success) continue;
    let seconds = 1;
    if (answer.night) {
      const resisted: any = await api.roll.success({ actor: target, base: api.actors.attribute(target, "HT") ?? 10, kind: "attribute", label: L("Tool.SearchlightHt"), tags: ["resist", "vision"] } as any);
      if (resisted && !resisted.success) {
        const dice = new Roll(SEARCHLIGHT.blindedDice);
        await dice.evaluate();
        seconds += Number(dice.total) || 1;
      }
    }
    await api.actors.applyCondition(target, {
      module: MODULE_ID, key: SEARCHLIGHT_BLINDED, label: L("Tool.Blinded"),
      effects: { modifiers: [{ label: L("Tool.Blinded"), value: -10, rolls: ["vision", "attack"] }] },
      duration: { seconds },
    } as any);
    await say(target, L("Tool.searchlight"), [F("Tool.BlindedFor", { name: target.name, seconds })]);
  }
}

/** An extinguisher's roll, or a fire-suppression system's two (p. 229). */
async function extinguish(api: GWorldApi, vehicle: any, fit: VehicleFit, tl: number): Promise<void> {
  if (!fit.extinguisher && !fit.fireSuppression) return say(vehicle, L("Tool.extinguish"), [L("Tool.NoExtinguisher")]);
  const suppression = fit.fireSuppression === true;
  const target = extinguishTarget(tl, suppression);
  const lines: string[] = [];
  let out = false;
  for (let attempt = 0; attempt < (suppression ? 2 : 1) && !out; attempt++) {
    const dice = new Roll("3d6");
    await dice.evaluate();
    out = (Number(dice.total) || 18) <= target;
    lines.push(F(attempt === 0 ? "Tool.ExtinguishRoll" : "Tool.ExtinguishRetry", { roll: dice.total, target, seconds: SUPPRESSION_RETRY_SECONDS }));
  }
  if (out && vehicle.documentName === "Actor") {
    for (const c of (api.actors.conditions(vehicle) ?? []).filter((c: any) => String(c?.id ?? "").endsWith("burning"))) await api.actors.removeCondition(vehicle, c.id);
  }
  lines.push(L(out ? "Tool.FireOut" : "Tool.StillBurning"));
  await say(vehicle, L("Tool.extinguish"), lines);
}

/** The control roll's reason for braking hard (Campaigns p. 466). */
const HARD_BRAKING = "hardBraking";

// ── riveted armour's spall (p. 235) ──

async function rivetSpall(api: GWorldApi, vehicle: any): Promise<void> {
  const first = new Roll("1d6");
  await first.evaluate();
  const lines = [F("Spall.Roll", { roll: first.total, needed: RIVET_SPALL.onOrUnder })];
  if ((Number(first.total) || 6) <= RIVET_SPALL.onOrUnder) {
    const v = vehicle.system?.vehicle ?? {};
    const aboard = vehicle.documentName === "Actor" ? (vehicle.system?.crew ?? []).length : api.rules.occupants(String(v.occupants ?? "")).crew;
    const target = api.rules.occupantHitTarget(Math.max(1, aboard), Number(v.sm) || 0);
    const occupant = new Roll("3d6");
    await occupant.evaluate();
    if ((Number(occupant.total) || 18) <= target) {
      const damage = new Roll(RIVET_SPALL.dice.replace(/d$/, "d6"));
      await damage.evaluate();
      lines.push(F("Spall.Hit", { roll: occupant.total, target, damage: damage.total }));
    } else {
      lines.push(F("Spall.Missed", { roll: occupant.total, target }));
    }
  }
  await say(vehicle, L("Spall.Title"), lines);
}

// ── registration ──

export function readyVehicles(api: GWorldApi, on: VehicleSwitches): void {
  const anyOn = () => on.components() || on.protection() || on.crew();
  readyRestraints(api);

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-vehicle-components", label: L("Tool.Title"), icon: "fa-solid fa-truck-monster", visible: anyOn, open: () => vehicleTool(api, on) });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-vehicles-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-vehicles-item.hbs`,
    visible: (item) => anyOn() && isVehicle(item) && fitLines(item, on).length > 0,
    context: (item) => ({ lines: fitLines(item, on) }),
  });

  // ── components (pp. 228-229) ──

  // Firing from a gun port (p. 228).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: GUN_PORT_OPTION,
    label: L("GunPort"),
    attack: "ranged",
    available: (context) => on.components() && Boolean(fitOf(vehicleAboard(api, context.actor)).gunPorts),
    refuse: (context) => {
      const bulks = ((context.item?.system?.rangedModes ?? []) as any[]).map((m) => Number(m?.bulk) || 0);
      return bulks.length && !bulks.some((b) => fitsGunPort(b)) ? F("GunPortBulk", { bulk: GUN_PORT.worstBulk }) : null;
    },
    apply: () => ({ modifiers: [{ label: L("GunPort"), value: GUN_PORT.skill }], notes: [F("GunPortNote", { arc: GUN_PORT.arcDegrees })] }),
  });

  // Shooting at someone at a gun port from outside: -4 to -7 (p. 228).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: AT_GUN_PORT_OPTION,
    label: L("AtGunPort"),
    attack: "ranged",
    input: { type: "select", choices: [{ value: "", label: "GCC.HT.Vehicles.AtGunPortNone" }, ...[-7, -6, -5, -4].map((v) => ({ value: String(v), label: String(v) }))] },
    available: (context) => on.components() && (context.targets ?? []).some((t: any) => Boolean(fitOf(vehicleAboard(api, t?.actor)).gunPorts)),
    apply: (_context, value) => ({ modifiers: [{ label: L("AtGunPort"), value: gunPortPenalty(Number(value)) }] }),
  });

  // Linked weapons fire as one, at the sum of their RoF (p. 229).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: LINKED_OPTION,
    label: L("Linked"),
    attack: "ranged",
    input: { type: "number", min: 0, max: 1000 },
    available: (context) => on.components() && (Boolean(vehicleAboard(api, context.actor)) || ((context.item?.system?.rangedModes ?? []) as any[]).some((m) => Boolean(m?.mount))),
    apply: (context, value) => {
      const own = Math.max(1, ...((context.item?.system?.rangedModes ?? []) as any[]).map((m) => Number(m?.rateOfFire) || 1));
      return { rateOfFire: linkedRateOfFire(own, Number(value)), notes: [F("LinkedNote", { rof: linkedRateOfFire(own, Number(value)) })] };
    },
  });

  // ── protection (pp. 229, 234-235) ──

  // A riveted vehicle's last blow's basic damage, until the hit is worked out.
  const rivetBlows = new Map<string, number>();
  const vehicleKey = (vehicle: any) => String(vehicle?.uuid ?? vehicle?.id ?? "");

  // Spaced and laminated armour against shaped charges, skirts, riveted spall (pp. 229, 235, 239).
  Hooks.on(api.combat.hooks.vehicleDr, (context: any) => {
    if (!on.protection() || !Array.isArray(context?.lines) || !context.vehicle) return;
    const fit = fitOf(context.vehicle);
    const location = String(context.location ?? "");
    const arc = context.arc ?? null;
    if (api.rules.passesThrough(location as any)) return;
    const own = context.lines[0] ?? null;
    const skirts = skirtsAt(fit, location, arc).map((s) => ({ label: L("SkirtLabel"), dr: s.dr, applies: true, hardened: 0 }));
    context.lines.push(...skirts);
    const kind = armourKindAt(fit, location, arc);
    const charge = kind ? chargeFor(context) : null;
    if (kind && charge === "shaped") {
      const multiplier = shapedArmourMultiplier(HT_SHAPED_ARMOUR, kind);
      for (const line of [own, ...skirts]) {
        if (!line || line.applies === false) continue;
        line.dr = drAgainstShapedCharge(line.dr, multiplier);
        line.reason = [line.reason, F("ShapedReason", { kind: L(`Kind.${kind}`), times: multiplier })].filter(Boolean).join("; ");
      }
    }
    if (kind && charge === "hesh" && own) own.reason = [own.reason, F("HeshReason", { kind: L(`Kind.${kind}`) })].filter(Boolean).join("; ");
    // The blow's basic damage, for the rivets once the shot is worked out.
    if (fit.riveted && !context.ignoresDr) rivetBlows.set(vehicleKey(context.vehicle), Number(context.basicDamage) || 0);
  });

  // Riveted armour: a blow of 20+ that didn't get through may send rivets
  // flying (p. 235), read from the hit as it was worked out (API 1.115.0).
  Hooks.on(api.combat.hooks.afterVehicleHit, (context: any) => {
    const key = vehicleKey(context?.vehicle);
    const basic = rivetBlows.get(key);
    rivetBlows.delete(key);
    if (!on.protection() || basic === undefined || !fitOf(context.vehicle).riveted) return;
    if (rivetsMayFly(basic, Number(context.penetrating) || 0)) void rivetSpall(api, context.vehicle);
  });

  // An occupant hit: the cockpit armour and gun shields a crewman is behind (pp. 237-238, 242).
  Hooks.on(api.combat.hooks.afterVehicleHit, (context: any) => {
    const dice = Number(context?.occupantHit?.dice) || 0;
    if (!on.protection() || !context?.vehicle || dice <= 0) return;
    const lines = occupantHitLines(fitOf(context.vehicle), context.arc ?? null, dice);
    if (lines.length) void say(context.vehicle, L("Occupant.Title"), lines);
  });

  // Running on flat run-flat tyres: -1 Handling and top speed less 20% while
  // they last (p. 229), on the figures the rules read (API 1.115.0): the
  // control roll, Dodge, and speeds follow.
  // The system's crippled wheels (API 1.134.0) count as flat tyres here: on
  // run-flats or with the CTIS keeping them up the wheel isn't lost, so its
  // crippled-wheel Move goes back and its line comes off.
  Hooks.on(api.data.hooks.vehicleStats, (context: any) => {
    const vehicle = context?.vehicle;
    if (!on.protection() || !vehicle || !Array.isArray(context.lines)) return;
    const move = context.move ?? {};
    const crippledWheels = move.locomotion === "wheels" ? Math.max(0, Math.floor(Number(context.crippled?.wheel) || 0)) : 0;
    const state = flatTyres(fitOf(vehicle), Math.max(stateOf(vehicle).flats, crippledWheels), wheelsOf(vehicle));
    if (state !== "runFlat" && state !== "ctis") return;
    if (crippledWheels) {
      const lamed = (api.rules as any).crippledMove?.({ move, crippled: context.crippled, locations: String(vehicle.system?.vehicle?.locations ?? "") });
      if (lamed?.cause === "wheel") {
        const at = context.lines.findIndex((l: any) => l?.stat === "topSpeed" && l.value === lamed.topSpeed - (Number(move.topSpeed) || 0));
        if (at >= 0) context.lines.splice(at, 1);
        // What the crippled wheels took, given back on top of whatever else changed the figures.
        context.acceleration = (Number(context.acceleration) || 0) + (Number(move.acceleration) || 0) - lamed.acceleration;
        context.topSpeed = (Number(context.topSpeed) || 0) + (Number(move.topSpeed) || 0) - lamed.topSpeed;
      }
    }
    if (state !== "runFlat") return;
    context.handling = (Number(context.handling) || 0) + RUN_FLAT.handling;
    context.topSpeed = runFlatMove(Number(context.topSpeed) || 0);
    context.lines.push({ label: L("RunningFlat"), stat: "handling", value: RUN_FLAT.handling }, { label: L("RunningFlat"), stat: "topSpeed" });
  });

  // Improved brakes: +1 on a control roll made for braking hard (p. 229).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.protection() || !(context?.tags ?? []).includes("vehicleControl") || !Array.isArray(context.modifiers)) return;
    if (context.reason !== HARD_BRAKING || !context.vehicle || !fitOf(context.vehicle).improvedBrakes) return;
    context.modifiers.push({ label: L("ImprovedBrakes"), value: IMPROVED_BRAKES });
  });

  // ── crew (pp. 234-235) ──

  // Hearing and seeing from inside a tank (p. 234).
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    if (!on.crew() || !Array.isArray(context?.modifiers)) return;
    const vehicle = vehicleAboard(api, context.observer);
    if (!vehicle) return;
    const fit = fitOf(vehicle);
    if (context.sense === "hearing" && fit.tank) {
      const outside = !context.subject || vehicleAboard(api, context.subject) !== vehicle;
      const value = tankHearing({ motorRunning: motorRunning(vehicle), intercom: fit.intercom === true, outside });
      if (value) context.modifiers.push({ label: L(outside ? "HearOutside" : "HearCrew"), value });
    }
    if (context.sense === "vision" && stateOf(vehicle).buttonedUp) context.modifiers.push({ label: F("ButtonedUp", { yards: BUTTONED_UP.blindYards }), value: BUTTONED_UP.vision });
  });

  // A fight in a tank: 1 FP more every 10 minutes (p. 234).
  Hooks.on(api.combat.hooks.fatigueCost, (context: any) => {
    if (!on.crew() || context?.reason !== "battle") return;
    const vehicle = vehicleAboard(api, context.actor);
    if (!vehicle || !fitOf(vehicle).tank) return;
    const extra = combatFatigue(Number(context.details?.seconds) || 0);
    if (extra <= 0) return;
    context.fp = Math.max(0, Math.round((Number(context.fp) || 0) + extra));
    context.sources?.push?.(L("TankFight"));
  });
}
