/**
 * High-Tech's reloading, careful loading and black-powder fouling (pp. 86-88,
 * 251), as pure functions. The Foundry side is in `index.ts`.
 *
 *   - **Reloading your gun (pp. 86-88):** how long a gun takes to load by how
 *     it loads: loose powder and shot down the muzzle, a black-powder
 *     breechloader, a breechloader with or without an ejector, a gate,
 *     break-open or swing-out revolver, a tube or box magazine filled round by
 *     round or by charger clip, a detachable magazine, a drum, a belt. What a
 *     successful Fast-Draw (Ammo) roll saves on each, and what else helps: a
 *     powder flask, paper cartridges, a greased patch, a speedloader, clamped
 *     magazines, an assistant gunner. Loading a muzzle-loading long arm other
 *     than standing takes half as long again.
 *   - **Double-Loading (p. 251):** two chambers of a revolver or a
 *     multi-barrelled gun at once, which saves a second more per pair of
 *     rounds, two where each case comes out by hand.
 *   - **Loading mounted or on the move (pp. 86-87):** a roll against the
 *     lower of the weapon skill and Riding, at -3 for loose powder and ball
 *     and -1 for fixed ammunition; on a moving vehicle, the weapon skill at
 *     -2 for loose powder.
 *   - **Careful loading (p. 86):** twice the time to load a muzzle-loading
 *     musket or rifle, for +1 Acc.
 *   - **Black-powder fouling (p. 86):** every five shots since the gun was
 *     last cleaned add a tenth to its loading time and take a step off Malf.;
 *     every ten a point of Acc. Two minutes' cleaning puts it right.
 */

// ── how a gun loads (pp. 86-88) ────────────────────────────────────────────

/**
 * How a gun is loaded, which sets how long it takes (pp. 86-88). `other` is
 * a gun none of the procedures fits, which loads in the time its table
 * gives, as the Basic Set has it.
 */
export const LOADING_TYPES = [
  "muzzleloader",
  "breechBlackPowder",
  "breech",
  "breechEjector",
  "gate",
  "breakOpen",
  "swingOut",
  "tube",
  "internal",
  "clip",
  "magazine",
  "drum",
  "belt",
  "other",
] as const;
export type LoadingType = (typeof LOADING_TYPES)[number];

/** Loose powder and ball: the black-powder guns, whose table times the procedures below keep. */
export const BLACK_POWDER_LOADING: readonly LoadingType[] = ["muzzleloader", "breechBlackPowder"];

/** What a gun's statistics say of how it loads: its Shots column read, its skill and its RoF. */
export interface LoadingFacts {
  name: string;
  skill: string;
  rateOfFire: number;
  capacity: number | null;
  chambered: boolean;
  reloadSeconds: number | null;
  perShot: boolean;
}

/** A flintlock, caplock, matchlock or wheel-lock, as High-Tech names its black-powder guns. */
export function isLockName(name: string): boolean {
  return /\b(flintlock|caplock|matchlock|wheel-?lock)\b/i.test(String(name ?? ""));
}

/** Rounds a charger clip holds: the book's examples load five a clip (p. 87). */
export const CLIP_ROUNDS = 5;

/**
 * How a gun loads, worked out from its statistics where they tell it
 * reliably, and `other` (the table's time) where they don't:
 *
 *   - a gun named for its lock loads down the muzzle, unless it is a
 *     single shot loading in 10 seconds or less: a black-powder breechloader;
 *   - a pistol loading shot by shot with five chambers or more is a
 *     revolver, and the book's revolvers have swing-out cylinders unless it
 *     says otherwise (p. 92);
 *   - a double rifle or shotgun reloads in the times of a breechloader: four
 *     seconds a barrel without an ejector, three with one (p. 87);
 *   - a rifle or shotgun loading shot by shot in 2 seconds fills a tube
 *     through a gate (p. 87);
 *   - a manual repeater whose reload is one Ready and two a clip is loaded by
 *     charger clip (p. 87);
 *   - otherwise a reload of 3 seconds is a detachable magazine and one of 5 a
 *     drum or a belt -- a machine gun of 50 rounds or more is belt-fed (p. 88).
 *
 * Only Guns and Gunner (Machine Gun) weapons: cannon, rockets and sporting
 * guns keep their tables.
 */
export function workedOutLoading(gun: LoadingFacts): LoadingType {
  const skill = String(gun.skill ?? "");
  if (!/^guns \(|^gunner \(machine gun\)/i.test(skill)) return "other";
  const capacity = gun.capacity;
  const reload = gun.reloadSeconds;
  if (capacity === null || capacity <= 0 || reload === null) return "other";
  if (isLockName(gun.name)) {
    return capacity === 1 && !gun.perShot && reload <= BLACK_POWDER_CLASSES.breech.seconds ? "breechBlackPowder" : "muzzleloader";
  }
  if (gun.perShot) {
    if (/\(pistol\)/i.test(skill)) return capacity >= 5 ? "swingOut" : "other";
    if (!/\((rifle|shotgun)\)/i.test(skill)) return "other";
    if (capacity === 2) return reload === 4 ? "breech" : reload === 3 ? "breechEjector" : "other";
    if (capacity >= 3 && reload === 2) return "tube";
    return "other";
  }
  if (capacity <= 1) return "other";
  if (gun.rateOfFire < 2 && !gun.chambered && reload === clipSeconds(capacity)?.seconds) return "clip";
  if (reload === 3) return "magazine";
  if (reload === 5) return /(^|[^a-z])machine gun/i.test(skill) && capacity >= 50 ? "belt" : "drum";
  return "other";
}

const clipSeconds = (rounds: number) => loadingSeconds("clip", rounds);

/** A reload's time, and the time with a successful Fast-Draw (Ammo) roll. */
export interface LoadTime {
  seconds: number;
  fastDraw: number;
}

/**
 * The seconds to load `rounds` into a gun that loads with fixed ammunition
 * (pp. 87-88), and with Fast-Draw (Ammo):
 *
 *   - breechloader: open, take out the case, fetch a round, load it, close:
 *     5 seconds (4), and 3 (2) a barrel more;
 *   - with an ejector: 4 (3), and 2 (1) a barrel more;
 *   - gate revolver: open the gate, push each case out, fetch and load each
 *     round, close: 2 + 3 a round (2 a round with Fast-Draw);
 *   - break-open revolver: open, fetch and load each round, close: 2 + 2 a
 *     round (1 a round);
 *   - swing-out revolver: swing out, eject, fetch and load each round,
 *     close: 3 + 2 a round (1 a round);
 *   - tube through a gate: fetch and load each round, 2 a round, Fast-Draw
 *     saving a second for every three rounds or part of three;
 *   - box magazine: open and close the action, fetch and load each round: 1
 *     + 2 a round (1 a round); by charger clip, 1 + 2 a clip (1 a clip);
 *   - detachable magazine: out, fetch, in: 3 (2); a drum, a magazine that is
 *     awkward to reach, or a belt or strip: 5 (3).
 *
 * Null for a gun loaded some other way.
 */
export function loadingSeconds(type: LoadingType, rounds: number): LoadTime | null {
  const n = Math.max(1, Math.floor(Number(rounds) || 0));
  switch (type) {
    case "breech":
      return { seconds: 5 + 3 * (n - 1), fastDraw: 4 + 2 * (n - 1) };
    case "breechEjector":
      return { seconds: 4 + 2 * (n - 1), fastDraw: 3 + (n - 1) };
    case "gate":
      return { seconds: 2 + 3 * n, fastDraw: 2 + 2 * n };
    case "breakOpen":
      return { seconds: 2 + 2 * n, fastDraw: 2 + n };
    case "swingOut":
      return { seconds: 3 + 2 * n, fastDraw: 3 + n };
    case "tube":
      return { seconds: 2 * n, fastDraw: 2 * n - Math.ceil(n / 3) };
    case "internal":
      return { seconds: 1 + 2 * n, fastDraw: 1 + n };
    case "clip": {
      const clips = Math.ceil(n / CLIP_ROUNDS);
      return { seconds: 1 + 2 * clips, fastDraw: 1 + clips };
    }
    case "magazine":
      return { seconds: 3, fastDraw: 2 };
    case "drum":
    case "belt":
      return { seconds: 5, fastDraw: 3 };
    default:
      return null;
  }
}

/** The loads timed as so long to open and close the gun and so long a round (pp. 87-88). */
const BY_THE_ROUND: readonly LoadingType[] = ["breech", "breechEjector", "gate", "breakOpen", "swingOut", "internal"];

/**
 * A load `loadingSeconds` times as a fixed part and a time a round, split
 * so the Reload button can time however many rounds go in: the fixed
 * seconds, each round's, and what Fast-Draw (Ammo) saves on each round (a
 * second, on every one of these). A swing-out revolver is 3 seconds and 2 a
 * round, 1 a round with Fast-Draw. Null for a load that isn't: a tube's
 * Fast-Draw saving comes in threes, a clip's time in clips, and a magazine,
 * drum or belt goes in whole.
 */
export function loadingByTheRound(type: LoadingType): { seconds: number; perRound: number; fastDrawPerRound: number } | null {
  if (!BY_THE_ROUND.includes(type)) return null;
  const one = loadingSeconds(type, 1);
  const two = loadingSeconds(type, 2);
  if (!one || !two) return null;
  const perRound = two.seconds - one.seconds;
  return { seconds: one.seconds - perRound, perRound, fastDrawPerRound: (two.seconds - two.fastDraw) - (one.seconds - one.fastDraw) };
}

/**
 * A speedloader puts a revolver's rounds in at once (p. 87): five Ready
 * maneuvers for a break-open gun (three with Fast-Draw), six for a swing-out
 * one (four). A gate-loader can't use one (p. 155).
 */
export const SPEEDLOADER: Readonly<Partial<Record<LoadingType, LoadTime>>> = Object.freeze({
  breakOpen: { seconds: 5, fastDraw: 3 },
  swingOut: { seconds: 6, fastDraw: 4 },
});

/**
 * What clamped magazines or an assistant gunner make of a reload (p. 88): a
 * magazine from 3 seconds to 2, a drum or belt from 5 to 3 -- the time
 * Fast-Draw (Ammo) gets it to, and not with it: each is one of the ways to
 * that time.
 */
export function helpedSeconds(type: LoadingType): number | null {
  const time = loadingSeconds(type, 1);
  return time && (type === "magazine" || type === "drum" || type === "belt") ? time.fastDraw : null;
}

/**
 * The seconds Double-Loading takes off a Fast-Draw reload (p. 251): each
 * Ready spent loading or pulling out one round does two, which saves a
 * second a pair where the gun throws out its cases at once, and two a pair
 * where each comes out by hand. Only a revolver or a gun of more than one
 * barrel; not with a speedloader (p. 87).
 */
export function doubleLoadingSaving(type: LoadingType, rounds: number): number {
  const pairs = Math.floor(Math.max(0, Math.floor(Number(rounds) || 0)) / 2);
  if (type === "breakOpen" || type === "swingOut" || type === "breechEjector") return pairs;
  if (type === "gate" || type === "breech") return 2 * pairs;
  return 0;
}

/** Whether Double-Loading can help this gun: a revolver, or a breechloader with barrels to pair. */
export function doubleLoads(type: LoadingType, rounds: number): boolean {
  return doubleLoadingSaving(type, rounds) > 0;
}

// ── loose powder and ball (pp. 86-87) ──────────────────────────────────────

/**
 * The book's times for loading loose powder and ball (p. 86), and with
 * Fast-Draw (Ammo), a barrel or chamber at a time: a musket or shotgun 40
 * (30), a rifle 60 (50), a smoothbore pistol 20 (16), a rifled one 30 (24);
 * a black-powder breechloader 10 (8), whatever the shooter's posture.
 */
export const BLACK_POWDER_CLASSES = Object.freeze({
  musket: { seconds: 40, fastDraw: 30 },
  rifle: { seconds: 60, fastDraw: 50 },
  smoothPistol: { seconds: 20, fastDraw: 16 },
  rifledPistol: { seconds: 30, fastDraw: 24 },
  breech: { seconds: 10, fastDraw: 8 },
});
export type BlackPowderClass = keyof typeof BLACK_POWDER_CLASSES;

/**
 * Which of the book's times a black-powder gun is loaded at: by its skill,
 * and for a pistol or revolver by whether its own time is the rifled one's.
 */
export function blackPowderClass(type: LoadingType, skill: string, tableSeconds: number): BlackPowderClass {
  if (type === "breechBlackPowder") return "breech";
  if (/\(pistol\)/i.test(skill)) return tableSeconds >= BLACK_POWDER_CLASSES.rifledPistol.seconds ? "rifledPistol" : "smoothPistol";
  if (/\(rifle\)/i.test(skill)) return "rifle";
  return "musket";
}

/** A shoulder arm, not a pistol: what careful loading and a low posture apply to (p. 86). */
export function isLongArm(cls: BlackPowderClass): boolean {
  return cls === "musket" || cls === "rifle";
}

/**
 * Whether a gun's table time is for loose powder and ball. Paper cartridges
 * halve the time (p. 86), and many of the book's guns are listed with them
 * already: a table time no more than half its class's is taken to be one,
 * and gets no help from a flask or more cartridges.
 */
export function loadsLoose(cls: BlackPowderClass, tableSeconds: number): boolean {
  return tableSeconds > BLACK_POWDER_CLASSES[cls].seconds / 2;
}

/**
 * Loading while mounted takes a roll against the lower of the weapon skill
 * and Riding: at -3 each for loose powder and ball (p. 86), at -1 for fixed
 * ammunition (p. 87). On a moving vehicle loose powder needs a roll against
 * the weapon skill at -2 (p. 86); the book asks none for fixed ammunition.
 */
export const MOUNTED_LOADING = Object.freeze({ loose: -3, fixed: -1 });
export const MOVING_VEHICLE_LOADING = -2;

/** The rolls a load needs where the shooter is: in the saddle, or on a moving vehicle. */
export function loadingRolls(options: { type: LoadingType; mounted: boolean; movingVehicle: boolean }): Array<{ where: "mounted" | "vehicle"; modifier: number; riding: boolean }> {
  const loose = BLACK_POWDER_LOADING.includes(options.type);
  const rolls: Array<{ where: "mounted" | "vehicle"; modifier: number; riding: boolean }> = [];
  if (options.mounted) rolls.push({ where: "mounted", modifier: loose ? MOUNTED_LOADING.loose : MOUNTED_LOADING.fixed, riding: true });
  else if (options.movingVehicle && loose) rolls.push({ where: "vehicle", modifier: MOVING_VEHICLE_LOADING, riding: false });
  return rolls;
}

/** A self-measuring powder flask: 5 seconds off loose powder's time (pp. 86, 163). */
export const FLASK_SECONDS = 5;
/** Loading a muzzle-loading long arm other than standing takes half as long again (p. 86). */
export const LOW_POSTURE_FACTOR = 1.5;
/** A greased patch loads a rifle in 0.7 of the time (p. 86). */
export const GREASED_PATCH_FACTOR = 0.7;
/** Careful loading doubles the time, for +1 Acc (p. 86). */
export const CAREFUL_LOADING_FACTOR = 2;
export const CAREFUL_LOADING_ACC = 1;

/**
 * A loading aid's effect: the seconds it adds (negative to save), or the
 * multiple it takes the time to once every aid's seconds are in, and what
 * Fast-Draw saves with it. Aids sharing a group are used one at a time.
 */
export interface AidEffect {
  key: "flask" | "paperCartridges" | "greasedPatch";
  seconds: number;
  multiplier?: number;
  exclusiveGroup?: string;
  fastDrawSeconds?: number;
}

/** Paper cartridges halve the basic time, rounded up (p. 86). */
export const PAPER_CARTRIDGE_FACTOR = 0.5;
/** The flask and paper cartridges: the cartridges supersede the flask (p. 86). */
export const POWDER_GROUP = "powder";

/** What goes into loading a black-powder gun. */
export interface BlackPowderLoad {
  type: LoadingType;
  skill: string;
  /** The table's time, a barrel or chamber at a time. */
  tableSeconds: number;
  /** Not standing (p. 86). */
  lowPosture: boolean;
  /** Loading carefully (p. 86). */
  careful: boolean;
  /** Fouling's tenths added to the time (p. 86). */
  foulingSteps: number;
}

/**
 * A black-powder gun's load: its time a barrel or chamber at a time, what
 * Fast-Draw (Ammo) saves, and the aids that help (p. 86).
 *
 * The table's time stands for the gun, and Fast-Draw saves what the book's
 * times for its class save, in proportion. A long arm loaded muzzle-first
 * from anything but standing takes 1.5 times as long, and twice as long
 * again loaded carefully; fouling adds its tenths. Loose powder can then be
 * helped by a flask (5 seconds off), a greased patch in a rifle (0.7 of the
 * time), or paper cartridges (half the time, and not with the flask). The
 * book's Kentucky rifle: 60 seconds, 50 with Fast-Draw; with a patch 42 and
 * 35; with a flask as well 37 and 30.
 *
 * The patch works on the basic time before the flask's five seconds come
 * off, as that example has it, so it is the seconds it saves on this gun's
 * time rather than a multiple, which the system would take after the
 * flask's seconds (60 - 5 = 55, x0.7 = 39, not 37). The cartridges halve
 * what is left, after every other aid (GWorld API 1.88.0), and share a
 * group with the flask.
 */
export function blackPowderLoad(load: BlackPowderLoad): { seconds: number; fastDraw: number; aids: AidEffect[]; cls: BlackPowderClass } {
  const cls = blackPowderClass(load.type, load.skill, load.tableSeconds);
  const table = BLACK_POWDER_CLASSES[cls];
  const longArm = load.type === "muzzleloader" && isLongArm(cls);
  let seconds = Math.max(0, Math.floor(load.tableSeconds));
  if (longArm && load.lowPosture) seconds = Math.ceil(seconds * LOW_POSTURE_FACTOR);
  if (longArm && load.careful) seconds *= CAREFUL_LOADING_FACTOR;
  seconds = fouledSeconds(seconds, load.foulingSteps);
  const fastDraw = Math.ceil((seconds * table.fastDraw) / table.seconds);
  const aids: AidEffect[] = [];
  if (loadsLoose(cls, load.tableSeconds)) {
    aids.push({ key: "flask", seconds: -FLASK_SECONDS, exclusiveGroup: POWDER_GROUP });
    if (cls === "rifle" && load.type === "muzzleloader") {
      const patched = Math.ceil(seconds * GREASED_PATCH_FACTOR);
      aids.push({ key: "greasedPatch", seconds: patched - seconds, fastDrawSeconds: patched - Math.ceil(fastDraw * GREASED_PATCH_FACTOR) });
    }
    const halved = Math.ceil(seconds * PAPER_CARTRIDGE_FACTOR);
    aids.push({ key: "paperCartridges", seconds: 0, multiplier: PAPER_CARTRIDGE_FACTOR, exclusiveGroup: POWDER_GROUP, fastDrawSeconds: halved - Math.ceil(fastDraw * PAPER_CARTRIDGE_FACTOR) });
  }
  return { seconds, fastDraw, aids, cls };
}

// ── black-powder fouling (p. 86) ───────────────────────────────────────────

/** Every five shots since the gun was cleaned is a step of fouling; every ten, a point of Acc (p. 86). */
export const FOULING_STEP_SHOTS = 5;
export const FOULING_ACC_SHOTS = 10;
/** A thorough cleaning takes two minutes (p. 86). */
export const CLEANING_SECONDS = 120;

/** What a gun's fouling costs it: Malf. steps, Acc, and tenths added to its loading time. */
export function foulingPenalty(shots: number): { steps: number; malfunction: number; accuracy: number } {
  const count = Math.max(0, Math.floor(Number(shots) || 0));
  const steps = Math.floor(count / FOULING_STEP_SHOTS);
  return { steps, malfunction: steps, accuracy: Math.floor(count / FOULING_ACC_SHOTS) };
}

/** A loading time with fouling's 10% a step added, rounded up (p. 86). */
export function fouledSeconds(seconds: number, steps: number): number {
  const s = Math.max(0, Math.floor(Number(steps) || 0));
  if (!s) return seconds;
  return Math.ceil((seconds * (10 + s)) / 10);
}

/** A black-powder gun: loaded with loose powder, or, where the gun doesn't say, a TL5 or earlier gun. */
export function firesBlackPowder(powder: "" | "black" | "other", type: LoadingType, techLevel: number): boolean {
  if (powder) return powder === "black";
  return BLACK_POWDER_LOADING.includes(type) || (techLevel > 0 && techLevel <= 5);
}
