/**
 * High-Tech's weapon families, as pure rules: what the book adds to air guns,
 * ranged electric stunners, revolvers and pistols, and mechanical machine
 * guns (pp. 88-93, 127, 159). Backblast is the shared engine's
 * (`src/shared/backblast/`); this book's table of it is in `index.ts`.
 *
 *   - **Air guns (p. 88):** a reservoir or gas cartridge is good for so many
 *     shots, and then must be changed before the gun fires again. The
 *     Girandoni loses power as its flask empties: its shots after the tenth
 *     and the twentieth do less damage at shorter range.
 *   - **Ranged electric stunners (p. 89):** a victim who fails the HT roll is
 *     stunned for as long as the trigger stays down, and for (20 - HT)
 *     seconds after (at least one), and then rolls each second to recover at
 *     the shock's own penalty. An EMD stunner knocks the victim down too.
 *   - **Unsafe revolvers (p. 93):** a TL5 revolver with no safety is carried
 *     with the hammer on an empty chamber, a round short; carried full, it is
 *     liable to go off (Handling, p. 80).
 *   - **Pistol whipping (p. 93):** most handguns strike with Brawling or DX
 *     at thrust-1 crushing plus the absolute value of their Bulk; a pistol
 *     made for braining swings with Axe/Mace at swing+1 crushing.
 *   - **Suppressors (p. 159):** they don't work on an ordinary revolver.
 *   - **Mechanical machine guns (p. 127):** -5 for unfamiliarity rather than
 *     -2, a further -1 to fix a malfunction for one who hasn't used the
 *     model, and -8 to fire off the mount.
 */

/** A stage of an air gun's charge: from this shot on, its damage and ranges (p. 88). */
export interface AirBand {
  /** The shot of the charge the stage starts at, counted from 1. */
  from: number;
  damage: string;
  halfDamageRange: number;
  maxRange: number;
}

/** What is left of an air gun's charge. */
export function airShotsLeft(charge: number, used: number): number {
  return Math.max(0, Math.floor(Number(charge) || 0) - Math.max(0, Math.floor(Number(used) || 0)));
}

/** The stage the next shot of the charge is fired at, or null while it is still at the table's figures. */
export function airBand(bands: readonly AirBand[], used: number): AirBand | null {
  const next = Math.max(0, Math.floor(Number(used) || 0)) + 1;
  return [...bands].filter((b) => b.from > 1 && b.from <= next).sort((a, b) => b.from - a.from)[0] ?? null;
}

/** Seconds a stunner's victim stays stunned after the current stops: (20 - HT), at least one (p. 89). */
export function stunAfterSeconds(ht: number): number {
  return Math.max(1, 20 - Math.floor(Number(ht) || 0));
}

/** The seconds the trigger stays down for, as the shooter says or the stunner's own (p. 89). */
export function heldSeconds(chosen: unknown, own: number): number {
  const asked = Math.floor(Number(chosen) || 0);
  return Math.max(1, asked > 0 ? asked : Math.floor(Number(own) || 0) || 1);
}

/** Whether a gun is carried as an unsafe revolver: a revolver of TL5 or earlier, unless it has a safety (p. 93). */
export type SafetySetting = "" | "unsafe" | "safe";
export const SAFETY_SETTINGS: readonly SafetySetting[] = ["", "unsafe", "safe"];

export function unsafeRevolver(revolver: boolean, techLevel: number, setting: SafetySetting): boolean {
  if (setting) return setting === "unsafe";
  return revolver && techLevel > 0 && techLevel <= 5;
}

/** The chamber an unsafe revolver's hammer rests on, left empty (p. 93). */
export const EMPTY_CHAMBER = 1;

/** A pistol whipping (p. 93): the skill, and the damage as thrust or swing plus a modifier. */
export interface PistolWhip {
  skill: "Brawling" | "Axe/Mace";
  attack: "thr" | "sw";
  modifier: number;
  reach: string;
}

export function pistolWhip(bulk: number, brainer: boolean): PistolWhip {
  if (brainer) return { skill: "Axe/Mace", attack: "sw", modifier: 1, reach: "1" };
  return { skill: "Brawling", attack: "thr", modifier: -1 + Math.abs(Math.trunc(Number(bulk) || 0)), reach: "C" };
}

/** Axe/Mace's default from DX, for a pistol brainer who never learned it (Characters p. 208). */
export const AXE_MACE_DEFAULT = -5;

/** Whether a suppressor works on a gun: never on an ordinary revolver (p. 159). */
export function suppressorWorks(revolver: boolean, suppressible: boolean): boolean {
  return !revolver || suppressible;
}

/** The mechanical machine gun's penalties (p. 127). */
export const MECHANICAL_MG = Object.freeze({
  /** Unfamiliarity, in place of the Basic Set's -2. */
  unfamiliar: -5,
  /** A further penalty to fix a malfunction, for one who hasn't used the model. */
  clearing: -1,
  /** Firing it off its mount. */
  offMount: -8,
});

/**
 * A Broadwell drum on a Gatling (p. 127): a ring of vertical cells feeding
 * the gun one at a time. Once a cell is fired out the gunner turns the drum
 * to the next, two Ready maneuvers (one with an assistant); a new drum takes
 * 10 seconds to fit.
 */
export const BROADWELL = Object.freeze({ rotateReadies: 2, rotateAssisted: 1, fitSeconds: 10 });

/**
 * A gun fed from two hoppers, one stacked on the other (the Nordenfelt, p.
 * 128): the upper one feeds first, so once its rounds are fired it can be
 * replaced alone. The rounds a fresh upper hopper adds: all of it once the
 * gun holds no more than the lower hopper's, and none while the upper still
 * has rounds in it.
 */
export function upperHopperRounds(loaded: number, capacity: number, upper: number): number {
  const hopper = Math.max(0, Math.floor(Number(upper) || 0));
  const full = Math.max(0, Math.floor(Number(capacity) || 0));
  if (!hopper || hopper >= full) return 0;
  return Math.max(0, Math.floor(Number(loaded) || 0)) <= full - hopper ? hopper : 0;
}

/** The rounds left in the drum's cell at the feed. */
export function cellRoundsLeft(cellRounds: number, firedFromCell: number): number {
  return Math.max(0, Math.floor(Number(cellRounds) || 0) - Math.max(0, Math.floor(Number(firedFromCell) || 0)));
}

/** A round fired as canister: its own damage, Acc, ranges and projectiles (pp. 127-128). */
export interface CanisterRound {
  damage: string;
  accuracy: number;
  halfDamageRange: number;
  maxRange: number;
  projectiles: number;
  /** 0 for the gun's own. */
  rateOfFire: number;
}

/** Whether a gun's record gives it a canister round. */
export function firesCanister(canister: CanisterRound): boolean {
  return canister.damage !== "" && canister.projectiles > 0;
}
