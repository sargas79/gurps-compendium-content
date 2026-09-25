/**
 * The Electricity and Electronics supplement's electrical hazards, the gear
 * that guards against them, and power lines (HT:EE pp. 9, 14-15, 18-19, 25),
 * as pure rules. The shock itself is the Basic Set's (Campaigns pp. 432-433),
 * which the system runs; these are the figures its hooks are given.
 *
 * **Hazards (HT:EE p. 9).** The Basic Set's -1 per 2 points of injury on the
 * HT roll fits direct current. Alternating current is five times as harsh,
 * -5 per 2 full points; radio-frequency current's effect is disregarded,
 * with no penalty and no heart stoppage; lightning
 * is gentler, -1 per 5 points. More than 1 point of injury clamps the victim
 * to the source; a source doing only 1 point can be jerked away from with a
 * DX roll, avoiding that point. Optionally a shock rolled under 1d can do no
 * burn at all and still call for the HT roll when the current crosses the
 * torso, a roll under 0 giving its size as a bonus. A nonlethal shock at -5
 * or worse stops the heart on a failure by 10 or more, or a critical failure.
 * Lethal current is a fire source for its rolled damage; a nonlethal spark
 * lights only Super-Flammable things, on 3d against 12 less its HT modifier.
 * Arc flash, at industrial voltages and above, does 3d burn. Lightning is a
 * 6d lethal shock, a big bolt multiplied by 1d-2 (at least 1).
 *
 * **Protection (HT:EE pp. 14-15, 25).** Electricians' hand tools have handles
 * insulated to 1,000 volts, DR 18 against a lethal shock; electrical tape DR
 * 10; electrical gloves DR 25, or 75 for the high-end pair. A Faraday suit
 * makes its wearer immune to nonlethal shocks and gives DR 20 against lethal
 * ones and lightning. A hot stick puts the tool at a distance, at -2 to use,
 * which a Hard technique buys off; the early wooden sticks were used up to
 * 220,000 volts, the fiberglass ones up to 750,000. A lightning rod carries
 * the bolt to ground on 14 or less (16 or less for designs from 1888 on);
 * otherwise the structure beside it takes half the damage. A fuse, circuit
 * breaker or ground fault interrupter cuts the power before the worst
 * happens: a critical failure on the circuit counts as an ordinary one.
 *
 * **Power lines (HT:EE pp. 18-19).** A power line's damage follows its
 * voltage, from 1 point for a radio battery to 6d at 1,500 volts, and 6d
 * more for each tenfold rise beyond. Cutting a line, or tapping it to steal
 * power, is an Electrician roll: at -1 with insulated tools but no safety
 * gear, -5 with improvised tools; a failure by 5 or more, or a critical
 * failure, is a lethal shock at the line's voltage. Keeping a tap hidden
 * takes a Camouflage roll, and a device run on stolen power rolls HT-2 daily
 * for reliability, a critical failure perhaps starting a fire. Lines above
 * 150,000 volts induce a current within a yard: an HT roll, its margin of
 * failure a penalty to skill rolls, stunned on a critical failure. The
 * electric chair was AC at about 1,800 volts, 6d×2.
 */

/** The kind of current a lethal shock carries (HT:EE p. 9). */
export type Current = "dc" | "ac" | "rf" | "lightning";
export const CURRENTS: readonly Current[] = ["dc", "ac", "rf", "lightning"];

/**
 * Points of injury per step of the HT roll against heart stoppage, as the
 * system's `injuryStep` takes it (HT:EE p. 9): DC is the Basic Set's 2,
 * AC the same 2 (its steps are 5 times as big: see `AC_STEP`), lightning 5.
 * Radio-frequency current has none (0): its effect is disregarded.
 */
export const INJURY_STEP: Readonly<Record<Current, number>> = Object.freeze({ dc: 2, ac: 2, rf: 0, lightning: 5 });

/**
 * AC is -5 per 2 points, read in whole steps as DC's -1 per 2 points is: 0 at
 * 1 point, -5 at 2-3, -10 at 4-5 (HT:EE p. 9). The system's step gives the
 * -1 of each; this is the -4 more.
 */
export const AC_STEP = 5;
export function acExtraModifier(injury: number): number {
  const steps = Math.floor(Math.max(0, Number(injury) || 0) / INJURY_STEP.ac);
  return steps ? -(AC_STEP - 1) * steps : 0;
}

/**
 * Whether a lethal shock of this current can stop the heart: radio-frequency
 * current disregards the effect entirely, so it never does (HT:EE p. 9).
 */
export const stopsHeart = (current: Current): boolean => current !== "rf";

/** More injury than this clamps the victim to the source (HT:EE p. 9). */
export const HOLDING_INJURY = 1;

/** A source doing exactly this much can be jerked away from with a DX roll (HT:EE p. 9). */
export const PULL_FREE_DAMAGE = 1;

/** A nonlethal shock this strong or stronger (HT modifier) can stop the heart (HT:EE p. 9). */
export const NONLETHAL_HEART_MODIFIER = -5;
/** ... on a failure by this much or more, or a critical failure (HT:EE p. 9). */
export const NONLETHAL_HEART_MARGIN = 10;

/** Whether a nonlethal shock's HT modifier is strong enough to stop the heart (HT:EE p. 9). */
export function nonlethalCanStopHeart(modifier: number): boolean {
  return Number(modifier) <= NONLETHAL_HEART_MODIFIER;
}

/** The 3d target for a nonlethal spark to light a Super-Flammable material: 12 less the shock's HT modifier (HT:EE p. 9). */
export function sparkTarget(modifier: number): number {
  return 12 - (Number(modifier) || 0);
}

/** Arc flash's burning damage, for 1 second (HT:EE p. 9). */
export const ARC_FLASH_DAMAGE = "3d";
/** Arc flash happens at industrial voltages or above (HT:EE p. 9). */
export const ARC_FLASH_VOLTS = 480;

/** A typical lightning bolt (HT:EE p. 9). */
export const LIGHTNING_DAMAGE = "6d";

/** A large bolt's multiplier from its 1d-2 roll: at least 1 (HT:EE p. 9). */
export function largeBoltMultiplier(rolled: number): number {
  return Math.max(1, Math.floor(Number(rolled) || 0));
}

/** A dice formula as the system parses it: dice, adds and a multiplier. */
export interface DiceAdds {
  dice: number;
  adds: number;
  multiplier?: number;
}

/**
 * Whether a shock's damage is under 1d, so that the optional rule lets it do
 * no burn at all and still call for the HT roll (HT:EE p. 9): the voltage
 * table's two rows under 1d, a single point (a radio battery) and one die
 * with a minus (household current).
 */
export function weakShock(parsed: DiceAdds | null): boolean {
  if (!parsed) return false;
  if ((parsed.multiplier ?? 1) > 1) return false;
  return parsed.dice === 0 ? parsed.adds <= 1 : parsed.dice === 1 && parsed.adds < 0;
}

/**
 * The optional weak-shock rule's HT modifier (HT:EE p. 9): a roll that came
 * to less than 0 gives its size as a bonus; 0 or more, none.
 */
export function weakShockBonus(rolled: number): number {
  return rolled < 0 ? -rolled : 0;
}

// ── power lines (HT:EE pp. 18-19) ──

/** A row of the voltage table (HT:EE p. 18): the lowest voltage it covers and its damage. */
export interface VoltageRow {
  key: string;
  volts: number;
  damage: string;
}

/** The voltage table (HT:EE p. 18), lowest first. */
export const VOLTAGE_ROWS: readonly VoltageRow[] = Object.freeze([
  { key: "radioBattery", volts: 45, damage: "1" },
  { key: "householdUs", volts: 110, damage: "1d-3" },
  { key: "household", volts: 220, damage: "1d+1" },
  { key: "industrial", volts: 480, damage: "3d" },
  { key: "highVoltageSupply", volts: 1000, damage: "5d" },
  { key: "thirdRail", volts: 1500, damage: "6d" },
]);

/** The top row's voltage, past which each tenfold rise adds 6d (HT:EE p. 18, note 3). */
const TOP_VOLTS = 1500;

/**
 * A power line's damage for its voltage (HT:EE pp. 18-19): the table's row
 * at or below it, and past 1,500 volts 6d more per tenfold rise, rounded up,
 * written as 6d×2, 6d×3 and so on. That gives the book's own figures: 6d×2
 * for local distribution at 15,000 volts and the electric chair's 1,800,
 * 6d×2 to 6d×3 for 10,000-110,000 and 6d×4 for 220,000-765,000. Under 45
 * volts, none.
 */
export function voltageDamage(volts: number): string | null {
  const v = Number(volts);
  if (!Number.isFinite(v) || v < VOLTAGE_ROWS[0]!.volts) return null;
  if (v > TOP_VOLTS) return `6d×${1 + Math.ceil(Math.log10(v / TOP_VOLTS) - 1e-9)}`;
  let row = VOLTAGE_ROWS[0]!;
  for (const r of VOLTAGE_ROWS) if (v >= r.volts) row = r;
  return row.damage;
}

/** The electric chair: AC at about 1,800 volts (HT:EE p. 19). */
export const ELECTRIC_CHAIR = Object.freeze({ volts: 1800, current: "ac" as Current });

/** What the worker works a live line with (HT:EE p. 19). */
export type WorkTools = "safe" | "insulated" | "improvised";
export const WORK_TOOLS: readonly WorkTools[] = ["safe", "insulated", "improvised"];

/** The Electrician roll's modifier for the tools (HT:EE p. 19). */
export const WORK_TOOL_MODIFIER: Readonly<Record<WorkTools, number>> = Object.freeze({ safe: 0, insulated: -1, improvised: -5 });

/** A failure by this much or more on the Electrician roll is a lethal shock (HT:EE p. 19). */
export const WORK_SHOCK_MARGIN = 5;

/** What a roll came to. */
export interface RollOutcome {
  success: boolean;
  criticalFailure?: boolean;
  margin?: number;
}

/**
 * Whether cutting or tapping a line shocks the worker (HT:EE p. 19): a
 * failure by 5 or more, or a critical failure. On a circuit a fuse, breaker
 * or ground fault interrupter guards, a critical failure counts as an
 * ordinary one (HT:EE p. 25).
 */
export function workShocks(outcome: RollOutcome, guarded = false): boolean {
  if (outcome.success) return false;
  if (outcome.criticalFailure && !guarded) return true;
  return Math.abs(Number(outcome.margin) || 0) >= WORK_SHOCK_MARGIN;
}

/** The daily reliability roll for a device on stolen power: HT-2 (HT:EE p. 19; Campaigns p. 485). */
export const STOLEN_POWER_MODIFIER = -2;

/** Lines above this voltage induce a current within a yard (HT:EE p. 19). */
export const INDUCED_FIELD_VOLTS = 150_000;
/** ... this far off. */
export const INDUCED_FIELD_YARDS = 1;

/** An induced current's penalty to skill rolls: the HT roll's margin of failure (HT:EE p. 19). */
export function inducedPenalty(outcome: RollOutcome): number {
  return outcome.success ? 0 : -Math.abs(Number(outcome.margin) || 0);
}

// ── protection (HT:EE pp. 14-15, 25) ──

/** DR against a lethal shock from an insulated tool handle (HT:EE p. 14) ... */
export const INSULATED_HANDLE_DR = 18;
/** ... good to this voltage. */
export const INSULATED_HANDLE_VOLTS = 1000;
/** DR against electricity from electrical tape (HT:EE p. 14). */
export const ELECTRICAL_TAPE_DR = 10;
/** A Faraday suit's DR against lethal shocks and lightning (HT:EE p. 15). */
export const FARADAY_SUIT_DR = 20;
/** Tool use with a hot stick (HT:EE p. 15). */
export const HOT_STICK_PENALTY = -2;

/** What a piece of gear does against a shock (HT:EE pp. 14-15). */
export type ShockGear =
  | { kind: "gloves"; dr: number }
  | { kind: "faraday" }
  | { kind: "handTool" }
  | { kind: "hotStick"; volts: number };

/** The supplement's hand tools with insulated handles (HT:EE p. 14). */
const HAND_TOOLS = /^(?:lineman's pliers|needle nose pliers|screwdrivers|wire cutters|wire stripper)$/i;

/**
 * What a record is to the shock rules, by its name as the catalogue writes
 * it: electrical gloves (the high-end pair DR 75, the standard DR 25), the
 * Faraday suit, an insulated hand tool, a hot stick (a wooden one to 220,000
 * volts, a fiberglass one to 750,000). The fuse, circuit breaker and ground
 * fault interrupter (HT:EE p. 25) print no price and are no records: the GM
 * says whether one guards the circuit.
 */
export function shockGear(name: string): ShockGear | null {
  const n = String(name ?? "").trim();
  if (/^electrical gloves\b/i.test(n)) return { kind: "gloves", dr: /high[- ]end/i.test(n) ? 75 : 25 };
  if (/^faraday suit\b/i.test(n)) return { kind: "faraday" };
  if (HAND_TOOLS.test(n)) return { kind: "handTool" };
  if (/^hot stick\b/i.test(n)) return { kind: "hotStick", volts: /wood/i.test(n) ? 220_000 : 750_000 };
  return null;
}

/** What stands between a victim and one shock. */
export interface ShockShield {
  /** Worn electrical gloves' DR, where the current comes through the hands. */
  gloves: number;
  /** Wearing a Faraday suit. */
  faraday: boolean;
  /** Working through an insulated hand tool. */
  handTool: boolean;
  /** The conductor is taped. */
  taped: boolean;
}

/**
 * The DR that counts against one shock (HT:EE pp. 14-15), each layer
 * added, or null where there is none: gloves and tape against a lethal
 * shock, a tool's handle up to 1,000 volts, and the Faraday suit against a
 * lethal shock or lightning. A nonlethal shock gets none (the suit makes the
 * wearer immune instead).
 */
export function shieldDr(shield: ShockShield, options: { kind: "nonlethal" | "lethal" | "localized"; lightning?: boolean; volts?: number | null }): number | null {
  if (options.kind === "nonlethal") return null;
  let dr = 0;
  if (shield.faraday) dr += FARADAY_SUIT_DR;
  if (!options.lightning) {
    dr += Math.max(0, shield.gloves);
    if (shield.taped) dr += ELECTRICAL_TAPE_DR;
    const volts = options.volts ?? null;
    if (shield.handTool && (volts === null || volts <= INSULATED_HANDLE_VOLTS)) dr += INSULATED_HANDLE_DR;
  }
  return dr > 0 ? dr : null;
}

/** A lightning rod's design (HT:EE p. 15): TL5, or one that allows for induction (1888 on). */
export type LightningRod = "tl5" | "inductive";
export const LIGHTNING_RODS: readonly LightningRod[] = ["tl5", "inductive"];
export const LIGHTNING_ROD_TARGET: Readonly<Record<LightningRod, number>> = Object.freeze({ tl5: 14, inductive: 16 });

/** What a lightning rod leaves the structure beside it: nothing on a success, half the rolled damage otherwise (HT:EE p. 15). */
export function lightningRodDamage(rolled: number, rodRoll: number, rod: LightningRod): number {
  return rodRoll <= LIGHTNING_ROD_TARGET[rod] ? 0 : Math.floor(Math.max(0, rolled) / 2);
}
