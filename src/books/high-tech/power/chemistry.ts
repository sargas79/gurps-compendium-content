/**
 * Battery chemistries, from the Electricity and Electronics supplement
 * (HT:EE pp. 16-18), as figures that scale High-Tech's battery table rather
 * than a second table beside it (decision E1 in #471).
 *
 * The supplement rates its sizes, and every gadget's endurance, in TL7-8
 * alkaline batteries, and gives each other chemistry as a multiple of those:
 * how long it lasts, what it weighs and what it costs, and whether it can be
 * recharged. High-Tech's own table (p. 13) prices T to M as alkaline, and L
 * and VL as lead-acid: the supplement notes that its lead-acid multipliers on
 * its L and VL land on High-Tech's weights (HT:EE p. 18). So a battery with
 * no chemistry set keeps High-Tech's printed figures, and choosing one takes
 * the printed size back to alkaline first, then applies the chosen
 * chemistry. M is the one size the two books can't reconcile (High-Tech 2
 * lbs., the supplement 1.5): High-Tech's M stays, scaled as if it were
 * alkaline.
 *
 * Also here: the lithium-ion battery's runaway and its use as a bomb, the
 * car-battery recharger's high-amperage charge and what its critical failure
 * does, and the voltaic pile's polarization.
 */

/** The chemistries a battery of a size can be made with (HT:EE pp. 16-18). */
export const CHEMISTRY_KEYS = ["wetCell", "daniellCell", "gravityCell", "carbonZinc", "alkaline", "leadAcid", "nicad", "nimh", "lithiumIon"] as const;
export type Chemistry = (typeof CHEMISTRY_KEYS)[number];

/** One chemistry against an alkaline battery of the same size. */
export interface ChemistryFigures {
  /** The TL it came on the market. */
  tl: number;
  endurance: number;
  cost: number;
  weight: number;
  rechargeable: boolean;
}

/**
 * Each chemistry's multiples of an alkaline battery (HT:EE pp. 16-18). The
 * wet cell's price and weight aren't printed (it is stationary), so they
 * stay the size's.
 */
export const CHEMISTRIES: Readonly<Record<Chemistry, ChemistryFigures>> = Object.freeze({
  // A quarter as long as an alkaline battery of its size (p. 17).
  wetCell: { tl: 5, endurance: 1 / 4, cost: 1, weight: 1, rechargeable: false },
  // The two wet cells the book names, with the same figures: the Daniell cell's barrier and the gravity cell's upkeep are rules (p. 17).
  daniellCell: { tl: 5, endurance: 1 / 4, cost: 1, weight: 1, rechargeable: false },
  gravityCell: { tl: 5, endurance: 1 / 4, cost: 1, weight: 1, rechargeable: false },
  // A quarter as long, 10% lighter and cheaper (p. 17).
  carbonZinc: { tl: 6, endurance: 1 / 4, cost: 0.9, weight: 0.9, rechargeable: false },
  // The base the sizes are rated in (pp. 16-17).
  alkaline: { tl: 7, endurance: 1, cost: 1, weight: 1, rechargeable: false },
  // A third as long, a third lighter and cheaper; rechargeable (p. 18).
  leadAcid: { tl: 6, endurance: 1 / 3, cost: 2 / 3, weight: 2 / 3, rechargeable: true },
  // A third as long, the same weight, twice the price (p. 18).
  nicad: { tl: 7, endurance: 1 / 3, cost: 2, weight: 1, rechargeable: true },
  // As long, the same weight, twice the price (p. 18).
  nimh: { tl: 8, endurance: 1, cost: 2, weight: 1, rechargeable: true },
  // 10% longer, the same weight, 20% dearer (p. 18).
  lithiumIon: { tl: 8, endurance: 1.1, cost: 1.2, weight: 1, rechargeable: true },
});

/** What High-Tech's table prints each size as: alkaline to M, lead-acid above (HT:EE pp. 16, 18). */
export const PRINTED_CHEMISTRY: Readonly<Record<string, Chemistry>> = Object.freeze({
  T: "alkaline",
  XS: "alkaline",
  S: "alkaline",
  M: "alkaline",
  L: "leadAcid",
  VL: "leadAcid",
});

export function isChemistry(value: unknown): value is Chemistry {
  return typeof value === "string" && (CHEMISTRY_KEYS as readonly string[]).includes(value);
}

/** What a size's printed battery multiplies by when made with another chemistry. */
export interface ChemistryFactors {
  endurance: number;
  cost: number;
  weight: number;
  rechargeable: boolean;
}

/**
 * A chemistry's multiples of a size as High-Tech prints it: the printed size
 * back to alkaline, then the chosen chemistry. Null for a size the table
 * doesn't print or a chemistry it doesn't know. An L battery made alkaline
 * costs and weighs half again as much and lasts three times as long -- the
 * supplement's own $15, 15 lbs. (p. 16).
 */
export function chemistryFactors(size: string, chosen: unknown): ChemistryFactors | null {
  const printed = PRINTED_CHEMISTRY[size];
  if (!printed || !isChemistry(chosen)) return null;
  const from = CHEMISTRIES[printed];
  const to = CHEMISTRIES[chosen];
  return {
    endurance: to.endurance / from.endurance,
    cost: to.cost / from.cost,
    weight: to.weight / from.weight,
    rechargeable: to.rechargeable,
  };
}

/** A price or weight scaled, to the cent or the thousandth of a pound. */
export const roundCost = (value: number) => Math.round(value * 100) / 100;
export const roundWeight = (value: number) => Math.round(value * 1000) / 1000;

/** A battery's price and weight in a chemistry, from High-Tech's printed figures; null where nothing changes. */
export function batteryInChemistry(size: string, chosen: unknown, price: { cost: number; weight: number }): { cost: number; weight: number } | null {
  const factors = chemistryFactors(size, chosen);
  if (!factors || (factors.cost === 1 && factors.weight === 1)) return null;
  return { cost: roundCost(price.cost * factors.cost), weight: roundWeight(price.weight * factors.weight) };
}

// ── the lithium-ion battery (HT:EE p. 18) ────────────────────────────────────

/** What sets a lithium-ion battery off: a short circuit does; crushing injury or overcharging does on a failed HT roll. */
export type RunawayCause = "short" | "crushed" | "overcharged";

/** Whether the battery runs away: always from a short, otherwise on a failed HT roll. */
export function runsAway(cause: RunawayCause, htRollSucceeded: boolean | null): boolean {
  return cause === "short" || htRollSucceeded === false;
}

/**
 * A runaway's damage: 3d burning once, to a single hit location; from an M
 * battery up, a large-area injury in the hexes the batteries fill (HT:EE
 * p. 18; Campaigns p. 400). It may start a fire.
 */
export function runawayDamage(size: string, sizes: readonly string[]): { formula: string; largeArea: boolean } {
  const at = sizes.indexOf(size);
  return { formula: "3d", largeArea: at >= 0 && at >= sizes.indexOf("M") };
}

/** A confined M or larger lithium-ion battery as an improvised bomb: REF 0.25 (HT:EE p. 18; Campaigns p. 415). */
export const LITHIUM_ION_REF = 0.25;

// ── the car-battery recharger (HT:EE p. 18) ──────────────────────────────────

/** Hours to recharge a lead-acid battery at each setting. */
export const CHARGER_HOURS = Object.freeze({ medium: 5, high: 1 });

/** The skills the high-amperage setting is watched with: Electrician, or Mechanic for the engine or vehicle. */
export const CHARGER_SKILLS = ["Electrician", "Mechanic (Gasoline Engine)"] as const;

/**
 * What a critical failure on the high setting does: the battery explodes
 * (REF 0.05), 6d crushing for an L battery and 6dx3 for a larger one, with
 * strong acid (Campaigns p. 428) splashed on everyone within 1 yard or 3.
 * The book prints the larger one as "XL", a size neither book has; it is
 * read as VL, the only size above L.
 */
export function chargerExplosion(size: string): { formula: string; acidYards: number } {
  return size === "VL" ? { formula: "6dx3", acidYards: 3 } : { formula: "6d", acidYards: 1 };
}

// ── the wet cells (HT:EE pp. 16-17) ─────────────────────────────────────────

/** The chemistries that are wet cells: stationary, and priced and weighed as the size. */
export const isWetCell = (chemistry: unknown): boolean => chemistry === "wetCell" || chemistry === "daniellCell" || chemistry === "gravityCell";

/** The Daniell cell's porous barrier weakens the current: -1 to Electrician or Electronics Operation with what it powers. */
export const DANIELL_PENALTY = -1;
export const daniellSkill = (skill: unknown): boolean => /^(?:electrician|electronics operation)\b/i.test(String(skill ?? "").trim());

/**
 * The gravity cell's upkeep (HT:EE p. 17): a daily roll against Electronics
 * Operation (Communications) -- at TL5-7, the telegraph stations' -- or
 * Chemistry, or it loses its power; setting up a new cell is Electronics
 * Repair (Communications) at TL5-7 or Chemistry, and it gives power an hour
 * later.
 */
export const GRAVITY_CELL = Object.freeze({
  tend: ["Electronics Operation (Communications)", "Chemistry"] as const,
  setUp: ["Electronics Repair (Communications)", "Chemistry"] as const,
  /** The TLs at which the Communications skills serve. */
  commTl: Object.freeze({ min: 5, max: 7 }),
  setUpHours: 1,
});

/** The skills a gravity cell's task can be rolled with at a TL: Chemistry always, Communications at TL5-7 (or an unknown TL). */
export function gravityCellSkills(task: "tend" | "setUp", tl: number | null): readonly string[] {
  const [comm, chemistry] = GRAVITY_CELL[task];
  return tl === null || (tl >= GRAVITY_CELL.commTl.min && tl <= GRAVITY_CELL.commTl.max) ? [comm, chemistry] : [chemistry];
}

// ── the voltaic pile (HT:EE p. 16) ───────────────────────────────────────────

/** A voltaic pile rolls HT 10 after every half hour of use; on a failure, hydrogen blocks the current. */
export const VOLTAIC_PILE = Object.freeze({ ht: 10, minutes: 30 });
