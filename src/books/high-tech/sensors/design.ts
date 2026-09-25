/**
 * How a radio is built, from High-Tech: Electricity and Electronics (HT:EE
 * pp. 28-30, 32, 34), under `radioDesign`: options that reprice a High-Tech
 * radio record and change what it does, never items of their own.
 *
 *   - **Spark gap** (HT:EE pp. 28-29, TL6): the early sets, code only, each
 *     a receiver or a transmitter. A receiver detects with a coherer, a
 *     crystal or a diode; a transmitter is wideband, and may have a rotary
 *     spark gap or its ultra-high-speed version, which can carry distorted
 *     audio. Send-only is a transmitter as a unit of its own.
 *   - **Oscillators and receivers** (HT:EE p. 29, TL6): quartz-crystal
 *     tuning (cutting edge at TL6, and no drift), and the audio receivers:
 *     grid-leak, regenerative (which may oscillate and jam its neighbours)
 *     and superheterodyne (tuned by a Hearing roll), which from TL7 every
 *     audio or video receiver is.
 *   - **Audio, FM, Video and Digital Video** (HT:EE pp. 32, 34): what the
 *     set carries. The supplement prints its radios for code alone, at half
 *     High-Tech's price (HT:EE p. 27); audio doubles it back. High-Tech's
 *     own radios carry audio as printed.
 *   - **The trench radio kit** (HT:EE p. 29): its transmitter and receiver
 *     are radios printed with their options, and their price already counts
 *     them; its wire is a dipole antenna for its owner's radios (HT:EE p. 28).
 */

import type { CommMode } from "../../../shared/sensors/rules.js";
import type { RadioSize } from "./rules.js";

const MILE = 1760;

export type DesignKey =
  | "sparkGap"
  | "coherer"
  | "crystalDetector"
  | "diodeDetector"
  | "rotarySparkGap"
  | "ultraRotarySparkGap"
  | "wideband"
  | "quartzTuning"
  | "gridLeak"
  | "regenerative"
  | "superheterodyne"
  | "audio"
  | "fm"
  | "video"
  | "digitalVideo";

/** A design option: where it can be built, and what it multiplies. */
export interface DesignOption {
  /** The first TL it's built at, and the last, where it has one. */
  tl: number;
  maxTl?: number;
  /** A receiver's option or a transmitter's; either where unset. */
  end?: "receiver" | "transmitter";
  /** Only on a spark-gap set (true), or only on one that isn't (false). */
  sparkGap?: boolean;
  /** Only on an audio set: an audio receiver's design, or FM. */
  needsAudio?: boolean;
  sizes?: readonly RadioSize[];
  cost?: number;
  weight?: number;
  /** The set's own range, before Mix and Match. */
  range?: number;
  /** The endurance of its cells. */
  endurance?: number;
  /** A quality bonus to Electronics Operation (Communications) with the set. */
  quality?: number;
}

/**
 * The options (HT:EE pp. 28-29, 32, 34). The spark-gap options' cost and
 * weight factors multiply together (HT:EE p. 28). Every spark-gap
 * transmitter is large, and a receiver large or medium; they were outlawed
 * in 1920, within TL6.
 */
export const DESIGN: Readonly<Record<DesignKey, DesignOption>> = Object.freeze({
  sparkGap: { tl: 6, maxTl: 6, sizes: ["large", "medium"] },
  // Code only: the standard early detector (HT:EE p. 28).
  coherer: { tl: 6, maxTl: 6, end: "receiver", sparkGap: true },
  // Unamplified, a tenth the range; needs no power; a roll to find a sensitive spot (HT:EE p. 28).
  crystalDetector: { tl: 6, maxTl: 6, end: "receiver", sparkGap: true, cost: 2, weight: 0.75, range: 0.1 },
  // Unamplified, a tenth the range; no roll (HT:EE p. 28).
  diodeDetector: { tl: 6, maxTl: 6, end: "receiver", sparkGap: true, cost: 2, range: 0.1 },
  rotarySparkGap: { tl: 6, maxTl: 6, end: "transmitter", sparkGap: true, cost: 5, quality: 1 },
  ultraRotarySparkGap: { tl: 6, maxTl: 6, end: "transmitter", sparkGap: true, cost: 20, quality: 2 },
  // Required on a spark-gap transmitter; the cells last a fifth as long (HT:EE p. 29).
  wideband: { tl: 6, maxTl: 6, end: "transmitter", sparkGap: true, weight: 1.25, endurance: 0.2 },
  // Quartz crystals end the drift; cutting edge at TL6 (HT:EE p. 29).
  quartzTuning: { tl: 6, maxTl: 6, sparkGap: false },
  // Grid-leak divides the receiver's range by 5 (HT:EE p. 29).
  gridLeak: { tl: 6, maxTl: 6, end: "receiver", sparkGap: false, needsAudio: true, range: 0.2 },
  regenerative: { tl: 6, maxTl: 6, end: "receiver", sparkGap: false, needsAudio: true },
  superheterodyne: { tl: 6, maxTl: 6, end: "receiver", sparkGap: false, needsAudio: true },
  // Audio: twice the cost of a code set (HT:EE p. 32).
  audio: { tl: 6, sparkGap: false, cost: 2 },
  // FM: cutting edge at TL7, no dearer than AM at TL8 (HT:EE p. 32).
  fm: { tl: 7, sparkGap: false, needsAudio: true },
  // Video: x4 cost and x2 weight; tube sets large or medium, transistor sets small (HT:EE p. 34).
  video: { tl: 7, sparkGap: false, sizes: ["large", "medium", "small"], cost: 4, weight: 2 },
  // Digital video, on small or tiny sets (HT:EE p. 34).
  digitalVideo: { tl: 8, sparkGap: false, sizes: ["small", "tiny"], cost: 4, weight: 2 },
});

/** The options in the order a sheet offers them. */
export const DESIGN_KEYS = Object.keys(DESIGN) as DesignKey[];

/** Options of which a set has one at most: the first ticked counts. */
const EXCLUSIVE: ReadonlyArray<readonly DesignKey[]> = [
  ["crystalDetector", "diodeDetector", "coherer"],
  ["ultraRotarySparkGap", "rotarySparkGap"],
  ["superheterodyne", "regenerative", "gridLeak"],
  ["digitalVideo", "video"],
];

/** Send-only: a transmitter as a unit of its own, x0.9 cost and weight (HT:EE p. 29). */
export const SEND_ONLY = Object.freeze({ cost: 0.9, weight: 0.9 });

/** A set as the design rules read it. */
export interface DesignInput {
  tl: number;
  size: RadioSize;
  commMode: CommMode;
  /** Printed for code alone: the supplement's radios (HT:EE p. 27). High-Tech's carry audio. */
  codePrinted: boolean;
  /** High-Tech's code-only option (p. 38) is ticked. */
  codeOnly?: boolean;
  options: Readonly<Record<string, boolean>>;
}

function fits(key: DesignKey, input: DesignInput, spark: boolean, audio: boolean): boolean {
  const o = DESIGN[key];
  if (input.tl < o.tl || (o.maxTl !== undefined && input.tl > o.maxTl)) return false;
  if (o.sizes && !o.sizes.includes(input.size)) return false;
  if (o.sparkGap !== undefined && key !== "sparkGap" && o.sparkGap !== spark) return false;
  if (o.end === "receiver" && input.commMode === "transmitter") return false;
  if (o.end === "transmitter" && input.commMode === "receiver") return false;
  if (o.needsAudio && !audio) return false;
  // Audio is offered only where the record is printed for code.
  if (key === "audio" && !input.codePrinted) return false;
  return true;
}

/** Whether a set carries audio: High-Tech's unless made code-only, the supplement's with the option (HT:EE p. 32). */
function carriesAudio(input: DesignInput, spark: boolean): boolean {
  if (spark) return false;
  return input.codePrinted ? input.options.audio === true && fits("audio", input, false, false) : input.codeOnly !== true;
}

/** Whether a set is spark-gap, as built. */
export function isSparkGap(input: DesignInput): boolean {
  return input.options.sparkGap === true && fits("sparkGap", input, false, false);
}

/** The options this set may be built with. */
export function designOffered(input: DesignInput): DesignKey[] {
  const spark = isSparkGap(input);
  const audio = carriesAudio(input, spark);
  return DESIGN_KEYS.filter((key) => fits(key, input, spark, audio));
}

/** The options that count on this set: offered and ticked, one of each exclusive group. */
export function designActive(input: DesignInput): DesignKey[] {
  const offered = new Set(designOffered(input));
  const ticked = DESIGN_KEYS.filter((key) => offered.has(key) && input.options[key] === true);
  return ticked.filter((key) => {
    const group = EXCLUSIVE.find((g) => g.includes(key));
    return !group || group.find((k) => ticked.includes(k)) === key;
  });
}

/** Whether the set carries video: the video and code-only options exclude each other, and video wins (HT:EE p. 34). */
export const carriesVideo = (active: readonly DesignKey[]) => active.includes("video") || active.includes("digitalVideo");

/**
 * What the design does to the set's price, weight, own range and endurance,
 * as factors. What it carries is priced against code: audio x2, video x4
 * (HT:EE pp. 32, 34), over what the record is printed for -- so video on one
 * of High-Tech's radios, printed for audio, doubles it, and a spark gap,
 * code alone, halves it. Send-only is x0.9.
 */
export function designFactors(input: DesignInput): { cost: number; weight: number; range: number; endurance: number } {
  const active = designActive(input);
  const factors = { cost: 1, weight: 1, range: 1, endurance: 1 };
  for (const key of active) {
    if (key === "audio" || key === "video" || key === "digitalVideo") continue;
    const o = DESIGN[key];
    factors.cost *= o.cost ?? 1;
    factors.weight *= o.weight ?? 1;
    factors.range *= o.range ?? 1;
    factors.endurance *= o.endurance ?? 1;
  }
  if (carriesVideo(active)) {
    const video = DESIGN[active.includes("digitalVideo") ? "digitalVideo" : "video"];
    // Against the printed content: code for the supplement's radios, audio for High-Tech's (whose code-only option video replaces).
    factors.cost *= video.cost! / (input.codePrinted ? 1 : 2);
    factors.weight *= video.weight!;
  } else if (active.includes("audio")) factors.cost *= DESIGN.audio.cost!;
  // A spark gap sends code alone: one of High-Tech's audio sets built so costs a code set's half (High-Tech p. 38), unless already made code-only.
  else if (isSparkGap(input) && !input.codePrinted && !input.codeOnly) factors.cost /= DESIGN.audio.cost!;
  if (input.commMode === "transmitter") {
    factors.cost *= SEND_ONLY.cost;
    factors.weight *= SEND_ONLY.weight;
  }
  return factors;
}

/** From TL7 (1940) a five-tube superheterodyne is standard for audio, and it is standard in video receivers (HT:EE p. 29). */
export const SUPERHET_STANDARD_TL = 7;

/**
 * Whether a set receives as a superheterodyne (HT:EE p. 29): built with the
 * option at TL6, or at TL7 and up any set that receives audio or video, whose
 * standard design it is by then. A send-only set receives nothing.
 */
export function isSuperheterodyne(input: DesignInput): boolean {
  const active = designActive(input);
  if (active.includes("superheterodyne")) return true;
  if (input.tl < SUPERHET_STANDARD_TL || input.commMode === "transmitter") return false;
  return carriesAudio(input, isSparkGap(input)) || carriesVideo(active);
}

/** Whether the set is a superheterodyne only by its TL, not by the option. */
export const superheterodyneByDefault = (input: DesignInput): boolean => isSuperheterodyne(input) && !designActive(input).includes("superheterodyne");

/** The quality bonus to Electronics Operation (Communications) a rotary spark gap gives its transmitter (HT:EE p. 28). */
export function qualityBonus(active: readonly DesignKey[]): number {
  return active.reduce((best, key) => Math.max(best, DESIGN[key].quality ?? 0), 0);
}

/** Built with something the book calls cutting edge at this TL: quartz tuning at TL6, FM at TL7 (HT:EE pp. 29, 32). */
export function cuttingEdgeDesign(input: DesignInput): boolean {
  const active = designActive(input);
  return (active.includes("quartzTuning") && input.tl <= 6) || (active.includes("fm") && input.tl <= 7);
}

// ── Rolls the receivers make (HT:EE pp. 28-29) ──

/** A crystal's sensitive spot: +2 to receive on success, -2 on failure, nothing received on a critical failure (HT:EE p. 28). */
export const CRYSTAL_SPOT = Object.freeze({ found: 2, missed: -2 });
export function crystalSpot(result: { success?: boolean; criticalFailure?: boolean } | null): { modifier: number; blocked: boolean } {
  if (!result) return { modifier: 0, blocked: false };
  if (result.criticalFailure) return { modifier: 0, blocked: true };
  return { modifier: result.success ? CRYSTAL_SPOT.found : CRYSTAL_SPOT.missed, blocked: false };
}

/** A regenerative receiver misadjusted: a fifth the range on a failure; oscillating on a critical failure (HT:EE p. 29). */
export const REGENERATIVE_MISS = 0.2;
export type Regeneration = "adjusted" | "missed" | "oscillating";
export function regenerativeAdjustment(result: { success?: boolean; criticalFailure?: boolean } | null): Regeneration {
  if (!result || result.success) return "adjusted";
  return result.criticalFailure ? "oscillating" : "missed";
}

/** An oscillating regenerative receiver jams others: -4 within 440 yards, 1 less for each doubling of the distance (HT:EE p. 29). */
export const OSCILLATION = Object.freeze({ penalty: -4, yards: 440 });

/**
 * What an oscillating regenerative receiver this many yards off costs a
 * receiver to receive (HT:EE p. 29): -4 within 440 yards, -3 within 880, -2
 * within 1,760, -1 within 3,520, and nothing further.
 */
export function oscillationPenalty(yards: number): number {
  const distance = Math.max(0, Number(yards) || 0);
  if (distance <= OSCILLATION.yards) return OSCILLATION.penalty;
  const doublings = Math.ceil(Math.log2(distance / OSCILLATION.yards) - 1e-9);
  return Math.min(0, OSCILLATION.penalty + doublings);
}

// ── What a receiver runs on (HT:EE p. 28) ──

/** A diode detector's power only heats its filament: one M cell for 14 hours (HT:EE p. 28). */
export const DIODE_FILAMENT = Object.freeze({ cell: "M", hours: 14 });

/**
 * What a spark-gap receiver's detector runs on (HT:EE p. 28): a crystal set
 * needs no power at all; a diode set's power only heats the filament, M/14
 * hours, which a set printed on M cells takes as one cell for 14 hours in
 * place of its own draw. Null where neither detector is built in, or the
 * set's printed cells aren't M (its draw then stands, and the sheet says).
 */
export function detectorPower(active: readonly DesignKey[], draw: { cell: string | null; cells: number; hours: number | null } | null): { unpowered: true } | { cells: number; endurance: number } | null {
  if (active.includes("crystalDetector")) return { unpowered: true };
  if (!active.includes("diodeDetector") || !draw || draw.cell !== DIODE_FILAMENT.cell || !(draw.hours && draw.hours > 0)) return null;
  const cells = Math.max(1, Math.floor(draw.cells) || 1);
  return { cells: 1 / cells, endurance: DIODE_FILAMENT.hours / draw.hours };
}

// ── What the set carries, end to end (HT:EE pp. 28, 32, 34) ──

/** Whether a set receives only code: a coherer, which detects code alone (HT:EE p. 28). */
export const detectsCodeOnly = (active: readonly DesignKey[]): boolean => active.includes("coherer");

/**
 * An FM listener under interference (HT:EE p. 32): static doesn't trouble it,
 * so interference that is static counts for nothing; another signal on its
 * frequency as strong as the one it wants, or stronger, prevents reception
 * outright. A weaker one is interference as for any set.
 */
export type FmInterference = "static" | "weaker" | "stronger";
export function fmConditions(conditions: number, interference: FmInterference): number | null {
  if (interference === "stronger") return null;
  if (interference === "static" && conditions < 0) return 0;
  return conditions;
}

/**
 * Whether live video goes from one set to another (HT:EE p. 34): the sender
 * must carry video and not be receive-only, the listener carry video and not
 * be send-only. A video set normally sends or receives, not both; a set
 * built both ways is the GM's to allow, as the book's "normally" leaves it.
 */
export function videoLink(sender: { video: boolean; commMode: CommMode }, listener: { video: boolean; commMode: CommMode }): "sender" | "listener" | null {
  if (!sender.video || sender.commMode === "receiver") return "sender";
  if (!listener.video || listener.commMode === "transmitter") return "listener";
  return null;
}

/** An ultra-high-speed rotary spark gap's audio is distorted: -5 to understand speech, and to Connoisseur (Music) (HT:EE pp. 28, 32). */
export const DISTORTED_AUDIO = -5;
/** An improvised ground aerial: -2 to Electronics Operation (Communications), but a Camouflage roll hides it (HT:EE p. 29). */
export const GROUND_AERIAL = -2;

// ── The trench radio kit (HT:EE p. 29) ──

/** A record printed with its options: the radio it's built on, and how. */
export interface PrintedRadio {
  size: RadioSize;
  tl: number;
  /** The range of the set it's built on, in yards, before its options. */
  range: number;
  commMode: CommMode;
  options: Readonly<Partial<Record<DesignKey, boolean>>>;
}

/**
 * The trench radio's two sets (HT:EE p. 29): a large spark-gap transmitter,
 * send-only and wideband, 50 miles; and a medium crystal receiver,
 * receive-only, 0.5 mile (a 5-mile set at a tenth). Their printed prices are
 * the supplement's radios with these options: $1,750 x0.9 and 100 lbs.
 * x0.9 x1.25; $1,250 x0.1 x2 and 30 lbs. x0.2 x0.75.
 */
export const PRINTED_RADIOS: Readonly<Record<string, PrintedRadio>> = Object.freeze({
  "Trench Radio Transmitter": { size: "large", tl: 6, range: 50 * MILE, commMode: "transmitter", options: { sparkGap: true, wideband: true } },
  "Trench Radio Receiver": { size: "medium", tl: 6, range: 5 * MILE, commMode: "receiver", options: { sparkGap: true, crystalDetector: true } },
});
