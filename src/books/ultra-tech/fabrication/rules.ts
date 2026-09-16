/**
 * Ultra-Tech's tools, fabrication, gravity control and psi amplifiers:
 * production lines, fabricators, robofacs, nanofacs, replicators and
 * blueprints; instructor kits; repair nanopaste; rope loads; slipspray and
 * super adhesives; construction foam; tractor-pressor beams; the antimatter
 * trap's explosion; crossing a gravity gradient and gravity plates, screens
 * and mats; psi amplifiers, attunement and psychotronic feedback (pp. 74-94).
 */

/** Small gadgets take longer: x5 under 0.1 lb., x20 under 0.01, x100 under 0.001, and so on (pp. 89-90). */
export function microtechMultiplier(weight: number): number {
  if (!(weight > 0) || weight >= 0.1) return 1;
  let multiplier = 5;
  let limit = 0.01;
  while (weight < limit && multiplier < 1e9) {
    multiplier = multiplier === 5 ? 20 : multiplier * 5;
    limit /= 10;
  }
  return multiplier;
}

/** A factory production line (p. 89): hours per item, cost per item, and the line's own price and weight. */
export function productionLine(options: { cost: number; weight: number; robotic?: boolean; delivery?: boolean }): { hours: number; perItem: number; lineCost: number; lineWeight: number } {
  const small = microtechMultiplier(options.weight);
  const hours = (options.cost / 100) * small;
  let lineCost = 20 * options.cost * small;
  let lineWeight = Math.max(lineCost / 100, 20 * options.weight);
  let perItem = options.cost * 0.5;
  if (options.robotic) {
    lineCost *= 10;
    lineWeight *= 2;
    perItem = options.cost * (options.delivery ? 0.3 : 0.2);
  }
  return { hours, perItem, lineCost, lineWeight };
}

/** The facilities rated by what they make an hour, at their own TL (pp. 90-93). */
export const FACILITIES: Readonly<Record<string, { tl: number; dollars: number; pounds: number; skill?: number; nanofac?: boolean }>> = Object.freeze({
  industrialFabricator: { tl: 9, dollars: 500, pounds: 5 },
  minifac: { tl: 9, dollars: 50, pounds: 1 },
  suitcaseMinifac: { tl: 10, dollars: 10, pounds: 0.1 },
  industrialRobofac: { tl: 10, dollars: 1000, pounds: 10, skill: 14 },
  roboticMinifac: { tl: 10, dollars: 100, pounds: 1, skill: 13 },
  portableRobofac: { tl: 11, dollars: 10, pounds: 0.1, skill: 12 },
  industrialNanofac: { tl: 11, dollars: 10000, pounds: 20, nanofac: true },
  nanofacWorkbench: { tl: 11, dollars: 500, pounds: 1, nanofac: true },
  suitcaseNanofac: { tl: 11, dollars: 50, pounds: 0.1, nanofac: true },
});

/**
 * Hours a facility takes to make an item (pp. 90-92): whichever is longer of
 * cost and weight at its rate, doubled per TL after its own (for nanofacs,
 * only the dollar rate doubles, at TL12), times the microtech multiplier for
 * fabricators and robofacs. `units` are industrial units bought in parallel.
 */
export function facilityHours(kind: string, item: { cost: number; weight: number }, tl: number, units = 1): number | null {
  const facility = FACILITIES[kind];
  if (!facility) return null;
  const later = Math.max(0, tl - facility.tl);
  const dollars = facility.dollars * Math.max(1, units) * (facility.nanofac ? (tl >= 12 ? 2 : 1) : 2 ** later);
  const pounds = facility.pounds * Math.max(1, units) * (facility.nanofac ? 1 : 2 ** later);
  const hours = Math.max(item.cost / dollars, item.weight / pounds);
  return facility.nanofac ? hours : hours * microtechMultiplier(item.weight);
}

/** A robofac's own Machinist skill, by its size (p. 90). */
export function facilitySkill(kind: string): number | null {
  return FACILITIES[kind]?.skill ?? null;
}

/**
 * A fabricator by the GM's guideline (p. 90): an hour per $50 from new parts
 * at 60% of the price, or a day per $500 from scrap at 50%. TL9 fabricators
 * can't make microtech; later ones take the microtech multiplier.
 */
export function fabricatorGuideline(item: { cost: number; weight: number }, tl: number, fromScrap: boolean): { hours: number | null; cost: number } {
  if (tl < 10 && item.weight < 0.1) return { hours: null, cost: 0 };
  const hours = (fromScrap ? (item.cost / 500) * 24 : item.cost / 50) * microtechMultiplier(item.weight);
  return { hours, cost: item.cost * (fromScrap ? 0.5 : 0.6) };
}

/** Replicators make an object up to their capacity in 10 seconds (p. 93). */
export const REPLICATORS: Readonly<Record<string, number>> = Object.freeze({ industrialReplicator: 500, workbenchReplicator: 5, suitcaseReplicator: 0.25 });

/** A blueprint's Complexity (p. 91): 3D blueprints 2 up to $100 and +1 per tenfold price; molecular ones one more. */
export function blueprintComplexity(cost: number, molecular: boolean): number {
  const steps = cost <= 100 ? 0 : Math.ceil(Math.log10(cost / 100) - 1e-9);
  return (molecular ? 3 : 2) + steps;
}

/** A replicator template is Complexity 8+ and costs up to 10 times the device (p. 94). */
export const REPLICATOR_TEMPLATE = Object.freeze({ complexity: 8, cost: 10 });

/** Instructor kits: half the device's price, a man-hour per $1,000, and +5 to the roll reading the tags (p. 81). */
export function instructorKit(cost: number): { price: number; hours: number; bonus: number } {
  return { price: cost * 0.5, hours: cost / 1000, bonus: 5 };
}

/** Repair nanopaste: 1d-2 HP after an hour; a repair skill+2 roll halves the time and adds 1 HP; the wrong paste does 1d-1 (p. 84). */
export function repairPaste(rolled: number, skilled: boolean): { hp: number; hours: number } {
  return { hp: rolled + (skilled ? 1 : 0), hours: skilled ? 0.5 : 1 };
}

/** A rope's working load by diameter at TL9, doubling per TL after (p. 81). */
export const ROPE_LOADS: Readonly<Record<string, number>> = Object.freeze({ '1/8"': 400, '3/16"': 1000, '3/8"': 4000, '3/4"': 16000 });

export function ropeLoad(diameter: string, introduced: number, tl: number): number | null {
  const base = ROPE_LOADS[diameter];
  return base === undefined ? null : base * 2 ** Math.max(0, tl - introduced);
}

/** Over its working load, a rope rolls HT 12 at -1 per multiple of the load (p. 81). */
export function ropeStressModifier(load: number, workingLoad: number): number | null {
  if (!(workingLoad > 0) || load <= workingLoad) return null;
  return -Math.floor(load / workingLoad);
}

/** Slipspray: DX every second faster than Move 1, +3 crawling, -3 sprinting; vehicles' control rolls at -5 (p. 83). */
export function slipsprayModifier(gait: "walking" | "crawling" | "sprinting"): number {
  return gait === "crawling" ? 3 : gait === "sprinting" ? -3 : 0;
}
export const SLIPSPRAY_VEHICLE = -5;

/** Super adhesives: a Regular Contest of ST against ST 23; flesh torn free takes 1d-4 (p. 83). */
export const ADHESIVE = Object.freeze({ st: 23, torn: "1d-4" });

/** Construction foam: DR 2 per inch; its HP as a homogenous object of the foam's weight, 5 lbs. a gallon (p. 83). */
export function foamDr(inches: number): number {
  return 2 * Math.max(0, inches);
}
export const FOAM_POUNDS_PER_GALLON = 5;

/** Tractor-pressor beams' ST and range in yards, doubled ST and ten times the range at TL12 (p. 88). */
export const TRACTOR_BEAMS: Readonly<Record<string, { st: number; range: number }>> = Object.freeze({
  heavy: { st: 400, range: 10000 },
  light: { st: 100, range: 100 },
  utility: { st: 50, range: 10 },
});

export function tractorBeam(kind: string, tl: number): { st: number; range: number } | null {
  const beam = TRACTOR_BEAMS[kind];
  if (!beam) return null;
  return tl >= 12 ? { st: beam.st * 2, range: beam.range * 10 } : beam;
}

/**
 * Explosion damage from a weight of explosive (Campaigns p. 415): 6d times
 * the square root of pounds x 4 x REF. Antimatter has REF 10,000,000,000
 * (p. 81), so a microgram does about 6dx9.
 */
export const ANTIMATTER_REF = 1e10;
export const MICROGRAM_POUNDS = 2.2046e-9;
export function explosionMultiplier(pounds: number, ref: number): number {
  return Math.max(0, Math.round(Math.sqrt(pounds * 4 * ref)));
}

/** A trap's capacity: 10 micrograms at TL9, ten times per TL after (p. 81). */
export function antimatterTrapCapacity(tl: number): number {
  return 10 * 10 ** Math.max(0, tl - 9);
}

/**
 * Crossing a gravity gradient (p. 79): a DX roll when gravity shifts by 10% or
 * more, -2 per doubling or halving past the first. Null where no roll is needed.
 */
export function gravityShiftModifier(from: number, to: number): number | null {
  if (from <= 0 && to <= 0) return null;
  const high = Math.max(from, to);
  const low = Math.min(from, to);
  if (low > 0 && high / low < 1.1) return null;
  // Into or out of zero gravity there is no ratio: take it as the most the
  // book's doublings reach in practice, from 1G to a hundredth.
  const ratio = low <= 0 ? high / 0.01 : high / low;
  const doublings = Math.floor(Math.log2(ratio) + 1e-9);
  return doublings ? -2 * doublings : 0;
}

/** Gravity plates: price and weight per cubic foot per +1G by TL (p. 78). */
export function gravityPlates(tl: number): { cost: number; weight: number } {
  if (tl >= 12) return { cost: 25, weight: 0.025 };
  if (tl >= 11) return { cost: 100, weight: 0.1 };
  return { cost: 400, weight: 0.4 };
}

/** A psi amplifier's greatest boost by kind and TL (p. 94). */
export const PSI_AMPS: Readonly<Record<string, number>> = Object.freeze({ throne: 5, backpack: 7, helmet: 9, headband: 10 });

export function psiAmpBoost(kind: string, tl: number): number {
  const less = PSI_AMPS[kind];
  return less === undefined ? 0 : Math.max(0, tl - less);
}

export function psiAmpByName(name: string): string | null {
  const text = String(name ?? "");
  if (/^Amplifier Throne/i.test(text)) return "throne";
  if (/^Backpack Psi Amplifier/i.test(text)) return "backpack";
  if (/^Psi-Amplifier Helmet/i.test(text)) return "helmet";
  if (/^Psi-Amplifier (Headband|Belt)/i.test(text)) return "headband";
  return null;
}

/** An unattuned amplifier turns any roll of 15+ into a critical failure (p. 94). */
export function psiAmpCriticalFailure(roll: number, criticalFailure: boolean, attuned: boolean): boolean {
  return criticalFailure || (!attuned && roll >= 15);
}

/**
 * Psychotronic feedback (p. 94): HT+3 at -boost; failure is a seizure for
 * seconds equal to the margin (and 1d FP after); failure by 5+ is a coma.
 */
export function psychotronicFeedback(result: { success: boolean; margin: number }): "none" | "seizure" | "coma" {
  if (result.success) return "none";
  return result.margin >= 5 ? "coma" : "seizure";
}

/** A vapor canteen draws a quart at 50% humidity in 4 hours, 3 at TL10, 2 at TL11, 1 at TL12 (p. 76). */
export function vaporCanteenHours(tl: number): number {
  return tl >= 12 ? 1 : tl >= 11 ? 2 : tl >= 10 ? 3 : 4;
}

/** A square inch of gecko adhesive holds 800 lbs. indefinitely (p. 83). */
export const GECKO_ADHESIVE_LOAD = 800;

/**
 * A nail gun (p. 82) won't fire at anything with the warmth of living flesh,
 * unless disabled with an Electronics Operation (Security) roll, a minute an
 * attempt; it can't tell flesh under armour of DR 3 or better.
 */
export const NAIL_GUN_SAFETY = Object.freeze({ skill: "Electronics Operation (Security)", minutes: 1, blindDr: 3 });

/** A sonic probe: Electronics Operation (Sonar), six inches, -1 per 10 DR it looks through; +2 to Lockpicking a mechanical combination lock (p. 84). */
export const SONIC_PROBE = Object.freeze({ skill: "Electronics Operation (Sonar)", inches: 6, lockpicking: 2 });
export function sonicProbePenalty(dr: number): number {
  const tens = Math.floor(Math.max(0, Number(dr) || 0) / 10);
  return tens ? -tens : 0;
}

/** A molecular bonder: a second's beam, standing still; flesh torn free on a Will roll takes 1d-4 (pp. 84-85). */
export const MOLECULAR_BONDER = Object.freeze({ torn: "1d-4" });
