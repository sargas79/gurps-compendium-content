/**
 * Ultra-Tech's warheads and ammunition (pp. 152-159): each type's TL, the sizes
 * it comes in, what it costs next to a plain round, its Legality Class, and the
 * book's table of damage by warhead size.
 */

/** The book's warhead sizes, smallest first (p. 152). */
export const SIZES = [10, 15, 18.5, 25, 40, 64, 100] as const;
export type Size = (typeof SIZES)[number];

/** The warhead size a calibre fires: the largest the book lists at or below it. */
export function sizeClass(calibreMm: number | null): Size | null {
  if (calibreMm === null || !Number.isFinite(calibreMm)) return null;
  let found: Size | null = null;
  for (const size of SIZES) if (calibreMm >= size) found = size;
  return found;
}

export type WarheadKind =
  | "aphc" | "apds" | "apep" | "aphd" | "aphex" | "hp" | "baton" | "monochain" | "shotshell" | "burrow"
  | "he" | "hec" | "shaped" | "hemp" | "sefop" | "thermobaric" | "stingray" | "force" | "plasma" | "implosion"
  | "emp" | "strobe" | "warbler" | "psiBomb" | "tangler" | "flare" | "jammer" | "aerosol" | "liquid" | "swarm"
  | "mininuke" | "antimatter" | "stasis" | "vortex";

/** A table entry: the dice, their type, divisor and modifiers, and fragmentation in brackets. */
export interface Blast {
  damage: string;
  type: string;
  divisor?: number;
  explosive?: boolean;
  incendiary?: boolean;
  doubleKnockback?: boolean;
  radiation?: boolean;
  surge?: boolean;
  fragmentation?: string;
}

/** What a warhead does beside or instead of the round's own damage. */
export interface WarheadEntry {
  tl: number;
  superscience?: boolean;
  /** Smallest calibre in mm; a TL-dependent minimum for nukes and antimatter. */
  minMm: number | ((tl: number) => number | null);
  /** Largest calibre, where the book caps it (hollow-points under 15mm, burrow darts under 10mm). */
  belowMm?: number;
  /** Multiple of a plain round's cost; null where the book gives none. */
  cost: number | null;
  /** Legality Class; null where it depends on a filler. */
  lc: number | null;
  /** Whether hand grenades and mines can use it. */
  grenades: boolean;
  /** Whether guns and launchers can fire it. */
  guns: boolean;
  /** Not for Gauss guns and railguns, which already fire such rounds; or not for railguns alone. */
  notElectromagnetic?: boolean;
  notRailgun?: boolean;
  /** Only for homing projectiles (SEFOP). */
  homingOnly?: boolean;
  /** Only for shotguns, grenade launchers and gyrocs (shotshell). */
  shotgunsOnly?: boolean;
  /** How the warhead meets the round: its damage changed, kept with a follow-up or linked attack, or replaced. */
  delivery: "modify" | "followUp" | "linked" | "replace" | "halfLinked";
  /** The divisor the round's own piercing damage takes where it's kept. */
  roundDivisor?: number;
  /** The book's damage by size (or by variant, for nukes and antimatter). */
  table?: Partial<Record<string, { primary: Blast; second?: Blast; spec?: string }>>;
  /** Variants chosen before firing: yield, antimatter mass, psi-bomb message. */
  variants?: readonly string[];
  /** "+1 per die" from this TL up. */
  perDieFromTl?: number;
  /** An affliction the warhead forces: the attribute, and modifier by size. */
  affliction?: { attribute: "HT" | "Will"; modifier: Partial<Record<string, number>>; divisor?: number };
}

const cr = (damage: string, frag?: string): Blast => ({ damage, type: "cr", explosive: true, ...(frag ? { fragmentation: frag } : {}) });

export const WARHEADS: Readonly<Record<WarheadKind, WarheadEntry>> = Object.freeze({
  // Armour-piercing and other rounds that change the gun's own damage (pp. 152-156).
  aphc: { tl: 9, minMm: 0, cost: 2, lc: 2, grenades: false, guns: true, notElectromagnetic: true, delivery: "modify" },
  apds: { tl: 9, minMm: 0, cost: 5, lc: 1, grenades: false, guns: true, notRailgun: true, delivery: "modify" },
  apep: { tl: 9, minMm: 0, cost: 10, lc: 1, grenades: false, guns: true, notElectromagnetic: true, delivery: "modify" },
  aphd: { tl: 11, minMm: 0, cost: 10, lc: 1, grenades: false, guns: true, delivery: "modify" },
  hp: { tl: 9, minMm: 0, belowMm: 15, cost: 1, lc: 4, grenades: false, guns: true, delivery: "modify" },
  baton: { tl: 9, minMm: 15, cost: 5, lc: 4, grenades: false, guns: true, delivery: "modify" },
  monochain: { tl: 9, superscience: true, minMm: 0, cost: 5, lc: 2, grenades: false, guns: true, delivery: "modify" },
  shotshell: { tl: 9, minMm: 0, cost: 1, lc: 4, grenades: false, guns: true, shotgunsOnly: true, delivery: "modify" },
  burrow: { tl: 10, minMm: 0, belowMm: 10, cost: 3, lc: 2, grenades: false, guns: true, delivery: "modify" },

  // APHEX: the round's piercing damage at (2), and a follow-up blast (p. 153). The book gives no cost or LC.
  aphex: {
    tl: 9, minMm: 10, cost: null, lc: null, grenades: false, guns: true, delivery: "followUp", roundDivisor: 2, perDieFromTl: 10,
    table: {
      10: { primary: cr("1d-4", "1d-2") }, 15: { primary: cr("1d-2", "1d-1") }, 18.5: { primary: cr("1d-1", "1d") }, 25: { primary: cr("1d", "1d+1") },
      40: { primary: cr("2d", "2d") }, 64: { primary: cr("4d", "3d") }, 100: { primary: cr("8d", "5d") },
    },
  },
  // High explosive: a grenade's damage, or a gun's round at (0.5) with a follow-up blast (p. 153).
  he: {
    tl: 9, minMm: 10, cost: 1, lc: 2, grenades: true, guns: true, delivery: "followUp", roundDivisor: 0.5, perDieFromTl: 10,
    table: {
      10: { primary: cr("1d", "1d-2") }, 15: { primary: cr("2d", "1d-1") }, 18.5: { primary: cr("2d+2", "1d") }, 25: { primary: cr("4d", "1d+1") },
      40: { primary: cr("8d", "2d") }, 64: { primary: cr("8dx2", "3d") }, 100: { primary: cr("6dx5", "5d") },
    },
  },
  // Concussion: as HE without fragments, linked rather than following (p. 154).
  hec: {
    tl: 9, minMm: 10, cost: 1, lc: 2, grenades: true, guns: true, delivery: "linked", roundDivisor: 0.5, perDieFromTl: 10,
    table: {
      10: { primary: cr("1d") }, 15: { primary: cr("2d") }, 18.5: { primary: cr("2d+2") }, 25: { primary: cr("4d") },
      40: { primary: cr("8d") }, 64: { primary: cr("8dx2") }, 100: { primary: cr("6dx5") },
    },
  },
  // Shaped charge: a (10) incendiary jet and a linked blast (p. 154).
  shaped: {
    tl: 9, minMm: 25, cost: 2, lc: 1, grenades: true, guns: true, delivery: "replace", perDieFromTl: 10,
    table: {
      25: { primary: { damage: "5dx3", type: "cr", divisor: 10, incendiary: true }, second: cr("2d", "1d+1") },
      40: { primary: { damage: "6dx4", type: "cr", divisor: 10, incendiary: true }, second: cr("4d", "2d") },
      64: { primary: { damage: "6dx7", type: "cr", divisor: 10, incendiary: true }, second: cr("8d", "3d") },
      100: { primary: { damage: "6dx10", type: "cr", divisor: 10, incendiary: true }, second: cr("8dx2", "5d") },
    },
  },
  // HEMP: a miniature shaped charge (p. 155).
  hemp: {
    tl: 10, minMm: 10, cost: 2, lc: 1, grenades: true, guns: true, delivery: "replace", perDieFromTl: 11,
    table: {
      10: { primary: { damage: "8d", type: "imp", divisor: 5, incendiary: true }, second: cr("1d-2", "1d-2") },
      15: { primary: { damage: "5dx2", type: "imp", divisor: 5, incendiary: true }, second: cr("1d", "1d-1") },
      18.5: { primary: { damage: "6dx2", type: "imp", divisor: 5, incendiary: true }, second: cr("1d+1", "1d") },
      25: { primary: { damage: "6dx3", type: "cr", divisor: 10, incendiary: true }, second: cr("2d", "1d+1") },
      40: { primary: { damage: "6dx5", type: "cr", divisor: 10, incendiary: true }, second: cr("4d", "2d") },
      64: { primary: { damage: "6dx8", type: "cr", divisor: 10, incendiary: true }, second: cr("8d", "3d") },
      100: { primary: { damage: "6dx12", type: "cr", divisor: 10, incendiary: true }, second: cr("8dx2", "5d") },
    },
  },
  // SEFOP: a forged slug from above, for homing rounds (p. 155).
  sefop: {
    tl: 9, minMm: 15, cost: 5, lc: 2, grenades: false, guns: true, homingOnly: true, delivery: "replace", perDieFromTl: 10,
    table: {
      15: { primary: { damage: "4d", type: "imp", divisor: 2, incendiary: true } },
      18.5: { primary: { damage: "5d", type: "imp", divisor: 2, incendiary: true } },
      25: { primary: { damage: "5dx3", type: "cr", divisor: 3, incendiary: true } },
      40: { primary: { damage: "6dx4", type: "cr", divisor: 3, incendiary: true } },
      64: { primary: { damage: "6dx7", type: "cr", divisor: 3, incendiary: true } },
      100: { primary: { damage: "6dx10", type: "cr", divisor: 3, incendiary: true } },
    },
  },
  // Thermobaric: less in thin air (p. 155).
  thermobaric: {
    tl: 9, minMm: 25, cost: 5, lc: 1, grenades: true, guns: true, delivery: "replace", perDieFromTl: 10,
    table: {
      25: { primary: { ...cr("8d"), incendiary: true } }, 40: { primary: { ...cr("8dx2"), incendiary: true } },
      64: { primary: { ...cr("6dx5"), incendiary: true } }, 100: { primary: { ...cr("6dx10"), incendiary: true } },
    },
  },
  // Stingray: half the round at (0.25), and a linked electrical discharge (p. 156).
  stingray: {
    tl: 10, minMm: 10, cost: 5, lc: 2, grenades: false, guns: true, delivery: "halfLinked", roundDivisor: 0.25,
    table: {
      10: { primary: { damage: "1d-3", type: "burn", surge: true } }, 15: { primary: { damage: "1d-1", type: "burn", surge: true } },
      18.5: { primary: { damage: "1d", type: "burn", surge: true } }, 25: { primary: { damage: "1d+1", type: "burn", surge: true } },
      40: { primary: { damage: "2d", type: "burn", surge: true } }, 64: { primary: { damage: "3d", type: "burn", surge: true } },
      100: { primary: { damage: "5d", type: "burn", surge: true } },
    },
  },
  // Force: a gravity pulse (p. 158).
  force: {
    tl: 10, superscience: true, minMm: 15, cost: 5, lc: 2, grenades: true, guns: true, delivery: "replace",
    table: {
      15: { primary: { ...cr("2d"), doubleKnockback: true } }, 18.5: { primary: { ...cr("2d+2"), doubleKnockback: true } },
      25: { primary: { ...cr("4d"), doubleKnockback: true } }, 40: { primary: { ...cr("8d"), doubleKnockback: true } },
      64: { primary: { ...cr("8dx2"), doubleKnockback: true } }, 100: { primary: { ...cr("6dx5"), doubleKnockback: true } },
    },
  },
  // Plasma: a one-shot power cartridge (p. 158).
  plasma: {
    tl: 10, superscience: true, minMm: 10, cost: 10, lc: 1, grenades: true, guns: true, delivery: "replace",
    table: {
      10: { primary: { damage: "1d+2", type: "burn", explosive: true, surge: true } }, 15: { primary: { damage: "3d", type: "burn", explosive: true, surge: true } },
      18.5: { primary: { damage: "3d+2", type: "burn", explosive: true, surge: true } }, 25: { primary: { damage: "6d", type: "burn", explosive: true, surge: true } },
      40: { primary: { damage: "6dx2", type: "burn", explosive: true, surge: true } }, 64: { primary: { damage: "6dx4", type: "burn", explosive: true, surge: true } },
      100: { primary: { damage: "6dx10", type: "burn", explosive: true, surge: true } },
    },
  },
  // Implosion: pulled inward, with a linked toxic blast (p. 158).
  implosion: {
    tl: 11, superscience: true, minMm: 40, cost: 5, lc: 0, grenades: true, guns: true, delivery: "replace",
    table: {
      40: { primary: { ...cr("6dx25"), doubleKnockback: true }, second: { damage: "6dx40", type: "tox", explosive: true, radiation: true } },
      64: { primary: { ...cr("6dx50"), doubleKnockback: true }, second: { damage: "6dx60", type: "tox", explosive: true, radiation: true } },
      100: { primary: { ...cr("6dx100"), doubleKnockback: true }, second: { damage: "6dx100", type: "tox", explosive: true, radiation: true } },
    },
  },
  // EMP: an area affliction on the Electrical, with a small linked blast (p. 157).
  emp: {
    tl: 9, minMm: 15, cost: 10, lc: 2, grenades: true, guns: true, delivery: "replace",
    affliction: { attribute: "HT", modifier: { 15: -8, 18.5: -8, 25: -8, 40: -8, 64: -8, 100: -8 }, divisor: 2 },
    table: {
      15: { primary: cr("1d-4"), spec: "1" }, 18.5: { primary: cr("1d-3"), spec: "1" }, 25: { primary: cr("1d-2"), spec: "2" },
      40: { primary: cr("1d"), spec: "4" }, 64: { primary: cr("2d"), spec: "8" }, 100: { primary: cr("4d"), spec: "16" },
    },
  },
  // Strobe and warbler: area afflictions fading with distance (pp. 157-158).
  strobe: {
    tl: 9, minMm: 25, cost: 4, lc: 3, grenades: true, guns: true, delivery: "replace",
    affliction: { attribute: "HT", modifier: { 25: -3, 40: -4, 64: -6, 100: -10 } },
    table: { 25: { primary: { damage: "", type: "" }, spec: "3" }, 40: { primary: { damage: "", type: "" }, spec: "4" }, 64: { primary: { damage: "", type: "" }, spec: "6" }, 100: { primary: { damage: "", type: "" }, spec: "10" } },
  },
  warbler: {
    tl: 9, minMm: 25, cost: 4, lc: 3, grenades: true, guns: true, delivery: "replace",
    affliction: { attribute: "HT", modifier: { 25: -3, 40: -4, 64: -6, 100: -10 } },
    table: { 25: { primary: { damage: "", type: "" }, spec: "3" }, 40: { primary: { damage: "", type: "" }, spec: "4" }, 64: { primary: { damage: "", type: "" }, spec: "6" }, 100: { primary: { damage: "", type: "" }, spec: "10" } },
  },
  // Psi-bomb: Will-5 to resist being stunned, or Will-2 for a message (pp. 158-159).
  psiBomb: {
    tl: 12, superscience: true, minMm: 25, cost: 10, lc: 2, grenades: true, guns: true, delivery: "replace", variants: ["noise", "message", "terror"],
    affliction: { attribute: "Will", modifier: { 25: -5, 40: -5, 64: -5, 100: -5 } },
    table: { 25: { primary: { damage: "", type: "" }, spec: "2" }, 40: { primary: { damage: "", type: "" }, spec: "4" }, 64: { primary: { damage: "", type: "" }, spec: "8" }, 100: { primary: { damage: "", type: "" }, spec: "16" } },
  },
  // Special effects the GM runs: their radius, strength or payload is what the table gives.
  tangler: { tl: 9, minMm: 25, cost: 2, lc: 4, grenades: true, guns: true, delivery: "replace", table: { 25: { primary: { damage: "", type: "" }, spec: "ST 15 (+1 a layer)" }, 40: { primary: { damage: "", type: "" }, spec: "ST 24 (+2 a layer)" }, 64: { primary: { damage: "", type: "" }, spec: "ST 36 (+2 a layer), 1-yard radius" }, 100: { primary: { damage: "", type: "" }, spec: "ST 60 (+3 a layer), 1-yard radius" } } },
  flare: { tl: 9, minMm: 15, cost: 2, lc: 4, grenades: true, guns: true, delivery: "replace", table: { 15: { primary: { damage: "1d", type: "burn" }, spec: "150" }, 18.5: { primary: { damage: "1d", type: "burn" }, spec: "185" }, 25: { primary: { damage: "1d", type: "burn" }, spec: "250" }, 40: { primary: { damage: "1d", type: "burn" }, spec: "400" }, 64: { primary: { damage: "1d", type: "burn" }, spec: "600" }, 100: { primary: { damage: "1d", type: "burn" }, spec: "1000" } } },
  jammer: { tl: 9, minMm: 10, cost: 5, lc: 3, grenades: true, guns: true, delivery: "replace", table: { 10: { primary: { damage: "", type: "" }, spec: "10" }, 15: { primary: { damage: "", type: "" }, spec: "15" }, 18.5: { primary: { damage: "", type: "" }, spec: "20" }, 40: { primary: { damage: "", type: "" }, spec: "40" }, 64: { primary: { damage: "", type: "" }, spec: "60" }, 100: { primary: { damage: "", type: "" }, spec: "100" } } },
  aerosol: { tl: 9, minMm: 10, cost: 1, lc: null, grenades: true, guns: true, delivery: "replace", table: { 10: { primary: { damage: "", type: "" }, spec: "face|1" }, 15: { primary: { damage: "", type: "" }, spec: "1|3" }, 18.5: { primary: { damage: "", type: "" }, spec: "1.5|5" }, 25: { primary: { damage: "", type: "" }, spec: "2|10" }, 40: { primary: { damage: "", type: "" }, spec: "4|40" }, 64: { primary: { damage: "", type: "" }, spec: "7|150" }, 100: { primary: { damage: "", type: "" }, spec: "10|300" } } },
  liquid: { tl: 9, minMm: 15, cost: 1, lc: null, grenades: true, guns: true, delivery: "replace", table: { 15: { primary: { damage: "", type: "" }, spec: "1|1" }, 18.5: { primary: { damage: "", type: "" }, spec: "1.5|2" }, 25: { primary: { damage: "", type: "" }, spec: "2|4" }, 40: { primary: { damage: "", type: "" }, spec: "4|16" }, 64: { primary: { damage: "", type: "" }, spec: "9|8" }, 100: { primary: { damage: "", type: "" }, spec: "18|16" } } },
  swarm: { tl: 10, minMm: 40, cost: 5, lc: null, grenades: true, guns: true, delivery: "replace", table: { 40: { primary: { damage: "", type: "" }, spec: "1" }, 64: { primary: { damage: "", type: "" }, spec: "4" }, 100: { primary: { damage: "", type: "" }, spec: "16" } } },
  stasis: { tl: 12, superscience: true, minMm: 40, cost: 500, lc: 0, grenades: true, guns: true, delivery: "replace", table: { 40: { primary: { damage: "", type: "" }, spec: "2" }, 64: { primary: { damage: "", type: "" }, spec: "3" }, 100: { primary: { damage: "", type: "" }, spec: "5" } } },
  vortex: { tl: 12, superscience: true, minMm: 40, cost: 1000, lc: 0, grenades: true, guns: true, delivery: "replace", table: { 40: { primary: { damage: "", type: "" }, spec: "2" }, 64: { primary: { damage: "", type: "" }, spec: "3" }, 100: { primary: { damage: "", type: "" }, spec: "5" } } },

  // Nuclear and antimatter: sizes by TL, yields as variants (pp. 156-157).
  mininuke: {
    tl: 9, minMm: (tl) => (tl >= 12 ? 25 : tl >= 11 ? 40 : tl >= 10 ? 64 : tl >= 9 ? 100 : null), cost: 1000, lc: 0, grenades: true, guns: true, delivery: "replace",
    variants: ["0.01kt", "0.1kt", "1kt"],
    table: {
      "0.01kt": { primary: cr("6dx200"), second: { damage: "4dx200", type: "burn", explosive: true, radiation: true, surge: true } },
      "0.1kt": { primary: cr("6dx600"), second: { damage: "6dx400", type: "burn", explosive: true, radiation: true, surge: true } },
      "1kt": { primary: cr("6dx2000"), second: { damage: "4dx2000", type: "burn", explosive: true, radiation: true, surge: true } },
    },
  },
  antimatter: {
    tl: 10, minMm: (tl) => (tl >= 12 ? 10 : tl >= 11 ? 40 : tl >= 10 ? 100 : null), cost: 10, lc: 0, grenades: true, guns: true, delivery: "replace",
    variants: ["0.1ug", "1ug", "10ug"],
    table: {
      "0.1ug": { primary: { damage: "6dx4", type: "burn", explosive: true, surge: true }, second: { damage: "6dx10000", type: "tox", radiation: true } },
      "1ug": { primary: { damage: "6dx12", type: "burn", explosive: true, surge: true }, second: { damage: "6dx100000", type: "tox", radiation: true } },
      "10ug": { primary: { damage: "6dx40", type: "burn", explosive: true, surge: true }, second: { damage: "6dx1000000", type: "tox", radiation: true } },
    },
  },
});

export const WARHEAD_KINDS = Object.keys(WARHEADS) as WarheadKind[];
