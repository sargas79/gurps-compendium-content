/**
 * Audio gear from the supplement Electricity and Electronics (HT:EE pp.
 * 30-32), as figures and small pure rules. What a record is comes from its
 * name, with the "(TLn)" High-Tech and the supplement add to a name printed
 * at several TLs taken off, so High-Tech's own Microphone, Headphones,
 * Tactical Headset and Hearing Aid (High-Tech pp. 39, 41, 226) are read with
 * the supplement's.
 *
 *   - **Sound quality** (HT:EE pp. 30-31): quality modifies Hearing rolls to
 *     tell sounds apart and Connoisseur (Music) rolls, but no link in the
 *     chain from the source to the ear does better than the weakest one. A
 *     carbon microphone counts as improvised gear (-5), an earphone or
 *     speaker pressed into service as a microphone -2, the earliest guitar
 *     amplifier -2 (HT:EE p. 32).
 *   - **Microphones** (HT:EE p. 31): the later microphone designs give +1 to
 *     Electronics Operation, the carbon microphone doesn't but is tougher (HT
 *     12 against 10); a cheaper microphone at a fifth of the price. A
 *     parabolic microphone, once aimed at the sound with an Electronics
 *     Operation roll, gives +2 to detect or identify a high-pitched sound, +1
 *     for speech and nothing for low sounds; a shotgun microphone gives +3 to
 *     that aiming roll.
 *   - **Earphones and speakers** (HT:EE p. 31): headphones leave the
 *     listener effectively Hard of Hearing, -2 with the sound turned down;
 *     earbuds shut out less, half the penalty; the tactical headset gives
 *     Protected Hearing; a better loudspeaker weighs twice as much for each
 *     step of quality.
 *   - **Amplification** (HT:EE p. 32): each amplifier's base Hearing range,
 *     the distance a listener hears it at no penalty; the bullhorn's arcs,
 *     its distortion (-2 to recognize a voice or follow speech) and its +1 to
 *     Intimidation close in front; the acoustic hailing device's cone and its
 *     +1 to Intimidation out to 32 yards; a public address system's extra
 *     speakers.
 *   - **The hydrophone** (HT:EE p. 31): the supplement's basic, non-tactical
 *     design, heard through Electronics Operation (Sonar) at +2 at TL7 and
 *     +4 at TL8, detecting a moving object with High-Tech's Size and
 *     Speed/Range lines (High-Tech p. 49).
 */

/** A record's name without the TL it is printed with: "Guitar Amplifier (TL7)" is a Guitar Amplifier. */
export function baseName(name: unknown): string {
  return String(name ?? "").trim().replace(/\s*\(TL\d+\)\s*$/i, "");
}

export type AudioKind = "microphone" | "parabolic" | "shotgun" | "headphones" | "earbuds" | "speaker" | "headset" | "amplifier" | "hearingAid";

/**
 * The audio records by base name (HT:EE pp. 31-32; High-Tech pp. 39, 41,
 * 50, 226). High-Tech's headphones with a throat mike are headphones; its
 * directional microphone is a microphone link (its Parabolic Hearing is the
 * passive sensors' rule).
 */
const KINDS: ReadonlyArray<[RegExp, AudioKind]> = [
  [/^parabolic microphone$/i, "parabolic"],
  [/^shotgun microphone$/i, "shotgun"],
  [/^(microphone|throat microphone|ear microphone system|directional microphone)$/i, "microphone"],
  [/^(headphones|stereo headphones|wireless headphones|headphones and throat mike)$/i, "headphones"],
  [/^earbuds?$/i, "earbuds"],
  [/^loudspeakers?$/i, "speaker"],
  [/^tactical headset$/i, "headset"],
  [/^(public address system|guitar amplifier|bullhorn|acoustic hailing device)$/i, "amplifier"],
  [/^hearing aid$/i, "hearingAid"],
];

/** What sort of audio gear a record is, or null. */
export function audioKind(name: unknown): AudioKind | null {
  const base = baseName(name);
  return KINDS.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/** Whether a kind picks up sound: every microphone (HT:EE p. 31). */
export function isMicrophone(kind: AudioKind | null): boolean {
  return kind === "microphone" || kind === "parabolic" || kind === "shotgun";
}

/** Whether a kind puts sound in the ear: earphones and speakers (HT:EE p. 31). */
export function isEarphone(kind: AudioKind | null): boolean {
  return kind === "headphones" || kind === "earbuds" || kind === "speaker" || kind === "headset";
}

// ── Sound quality (HT:EE pp. 30-32) ──

/** A carbon microphone, for high fidelity, is improvised gear: -5 to sound quality (HT:EE p. 31). */
export const CARBON_QUALITY = -5;
/** A carbon microphone stands up to damage: HT 12 against 10 (HT:EE p. 31). */
export const CARBON_HT = 12;
/** An earphone or speaker used as a microphone: -2 to quality (HT:EE p. 31). */
export const EARPHONE_AS_MICROPHONE = -2;
/** A cheaper microphone of lower signal quality, at 20% of the price (HT:EE p. 31). */
export const INEXPENSIVE_PRICE = 0.2;
/** The later microphone designs: +1 to Electronics Operation rolls over the carbon microphone (HT:EE p. 31). */
export const MICROPHONE_OPERATION = 1;

/**
 * The quality a record's make gives its sound beyond its equipment grade:
 * the TL6 guitar amplifier, a conventional guitar's sound through a
 * microphone into a PA system, is at -2 (HT:EE p. 32).
 */
export function printedQuality(name: unknown, tl: number): number {
  return /^guitar amplifier$/i.test(baseName(name)) && tl <= 6 ? -2 : 0;
}

/**
 * One link's sound quality (HT:EE p. 31): the GM's figure where one is set
 * (an early model, a cheap microphone), a carbon microphone's -5 as
 * improvised gear, or else its equipment grade's modifier and its make's.
 */
export function linkQuality(link: { grade: number; stated: number | null; carbon: boolean; printed: number }): number {
  if (link.stated !== null) return link.stated;
  if (link.carbon) return CARBON_QUALITY;
  return link.grade + link.printed;
}

/** The chain's sound quality: no better than its weakest link (HT:EE p. 31); 0 with no links. */
export function chainQuality(links: readonly number[]): number {
  return links.length ? Math.min(...links) : 0;
}

/** A loudspeaker of higher quality weighs twice as much for each step up from basic (HT:EE p. 31). */
export function speakerWeightFactor(grade: string): number {
  const steps = grade === "good" ? 1 : grade === "fine" ? 2 : 0;
  return 2 ** steps;
}

// ── Aiming a microphone (HT:EE p. 31) ──

export type Pitch = "high" | "speech" | "low";

/**
 * An aimed parabolic microphone's bonus to detect or identify a sound (HT:EE
 * p. 31): +2 for sounds of 1 kHz and up (birdsong), half that for human
 * speech, nothing for lower sounds.
 */
export function parabolicBonus(pitch: Pitch): number {
  return pitch === "high" ? 2 : pitch === "speech" ? 1 : 0;
}

/** A shotgun microphone: +3 to the Electronics Operation roll to pick out one sound (HT:EE p. 31). */
export const SHOTGUN_AIMING = 3;

// ── Headphones and earbuds (HT:EE p. 31) ──

export type Listening = "off" | "loud" | "low";

/**
 * What listening does to hearing anything else (HT:EE p. 31): headphones
 * leave the wearer effectively Hard of Hearing (-4, Characters p. 138), -2
 * with the sound turned down but on; earbuds shut out less, and cost half
 * that penalty.
 */
export function listeningPenalty(kind: AudioKind | null, listening: Listening): { hardOfHearing: boolean; modifier: number } {
  if (listening === "off" || (kind !== "headphones" && kind !== "earbuds")) return { hardOfHearing: false, modifier: 0 };
  if (kind === "headphones") return listening === "loud" ? { hardOfHearing: true, modifier: 0 } : { hardOfHearing: false, modifier: -2 };
  return { hardOfHearing: false, modifier: listening === "loud" ? -2 : -1 };
}

/** Hard of Hearing's penalty on Hearing (Characters p. 138), which the listener's own gear gives back while he listens through it. */
export const HARD_OF_HEARING = -4;

// ── Amplifiers (HT:EE p. 32) ──

export type Arc = "front" | "side" | "rear";

export interface Amplifier {
  /** Base Hearing range to the front, in yards: heard at no penalty that far. */
  front: number;
  /** To the side and rear, where they differ; the front's where not given. */
  side?: number;
  rear?: number;
  /** A cone to the front, in degrees: outside it the device isn't heard at its range. */
  cone?: number;
  /** Distorted sound: this to recognize a voice or understand speech. */
  distortion?: number;
  /** +1 to Intimidation this close: in front, and to the side. */
  intimidation?: { front: number; side?: number };
}

/**
 * The amplifiers by base name, at a TL (HT:EE p. 32). The TL8 guitar
 * amplifier prints no range; it is the TL7 amplifier made solid-state, and
 * is taken at the TL7 amplifier's 32 yards.
 */
export function amplifierOf(name: unknown, tl: number): Amplifier | null {
  switch (baseName(name).toLowerCase()) {
    case "public address system":
      return { front: 16 };
    case "guitar amplifier":
      return { front: tl <= 6 ? 16 : 32 };
    case "bullhorn":
      return { front: 16, side: 8, rear: 4, distortion: -2, intimidation: { front: 2, side: 1 } };
    case "acoustic hailing device":
      return { front: 256, cone: 60, intimidation: { front: 32 } };
    default:
      return null;
  }
}

/** The amplifier's base Hearing range toward a listener, or null outside its cone (HT:EE p. 32). */
export function amplifiedRange(amp: Amplifier, arc: Arc | "outside"): number | null {
  if (arc === "outside") return amp.cone ? null : amp.front;
  if (amp.cone) return arc === "front" ? amp.front : null;
  return arc === "side" ? (amp.side ?? amp.front) : arc === "rear" ? (amp.rear ?? amp.front) : amp.front;
}

/** The +1 to Intimidation of a subject this close (HT:EE p. 32); the side's reach where the arc is known. */
export function intimidationBonus(amp: Amplifier, yards: number, arc: Arc = "front"): number {
  const reach = amp.intimidation ? (arc === "side" ? (amp.intimidation.side ?? 0) : arc === "front" ? amp.intimidation.front : 0) : 0;
  return reach > 0 && yards >= 0 && yards <= reach ? 1 : 0;
}

/** A public address system's extra speaker: $20 and 3 lbs. each, and the battery life shared among the speakers (HT:EE p. 32). */
export const PA_SPEAKER = Object.freeze({ cost: 20, weight: 3 });

/** What extra speakers add to a public address system's price and weight, and the share of battery life left. */
export function paSpeakers(extra: number): { cost: number; weight: number; endurance: number } {
  const n = Math.max(0, Math.floor(extra) || 0);
  return { cost: PA_SPEAKER.cost * n, weight: PA_SPEAKER.weight * n, endurance: 1 / (1 + n) };
}

// ── The hydrophone (HT:EE p. 31) ──

/** The supplement's basic hydrophone: +2 at TL7, +4 at TL8 to Electronics Operation (Sonar) (HT:EE p. 31). */
export function basicHydrophoneBonus(name: unknown, tl: number): number | null {
  if (!/^hydrophone$/i.test(baseName(name))) return null;
  return 2 * Math.max(0, Math.min(8, tl) - 6);
}
