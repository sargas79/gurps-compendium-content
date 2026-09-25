/**
 * High-Tech's expedition gear (pp. 51-56): lights, navigation instruments,
 * load-bearing gear and packs, and climbing gear. Pure rules; `index.ts`
 * registers them with the system.
 */

// ── lights (pp. 51-52) ──

/**
 * What kind of light a record is, for what the book says of it: a naked
 * flame (candles), a fuel lantern that breaks when dropped (the glass one
 * starting a fire, the kerosene one dousing itself), an electric light, a
 * chemlight, or a tactical light that blinds and stuns.
 */
export const LIGHT_KINDS = ["", "flame", "lantern", "glassLantern", "kerosene", "electric", "chemical", "tactical"] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

/** What a light throws: a radius round it, a beam ahead of it, or both (a carbide lamp), in yards. */
export interface Light {
  kind: LightKind;
  radius: number;
  beam: number;
}

/**
 * The darkness a light leaves where it reaches, at worst (Campaigns p. 394,
 * which pp. 51-52 send the reader to): a light in sight takes total darkness
 * down to -3, and the system reads a Foundry light the same way. A tactical
 * light's beam is held to the same -3 (p. 156).
 */
export const LIT_DARKNESS = 3;

/**
 * An attack's darkness penalty once the target stands in a light. `darkness`
 * is the darkness before the attacker's eyes (1-9) and `penalty` what their
 * eyes left of it (never above 0); the light takes the darkness down to 3,
 * and the eyes take off what they took before.
 */
export function litPenalty(darkness: number, penalty: number): number {
  const dark = Math.max(0, Math.floor(Number(darkness) || 0));
  const now = Math.min(0, Math.trunc(Number(penalty) || 0));
  if (dark <= LIT_DARKNESS) return now;
  const eyes = Math.max(0, dark + now);
  return Math.max(now, Math.min(0, -LIT_DARKNESS + eyes));
}

/** Whether a lantern is the kind that breaks when dropped on hard ground (p. 51). */
export const breaksWhenDropped = (kind: LightKind): boolean => kind === "lantern" || kind === "glassLantern" || kind === "kerosene";

/** A dropped lantern survives on a roll against HT 6 (p. 51). */
export const LANTERN_HT = 6;

/** Whether a dropped lantern survives the fall: 3d against its HT 6. */
export function lanternSurvives(roll: number): boolean {
  return Math.trunc(Number(roll) || 0) <= LANTERN_HT;
}

/** The radius of the fire a broken glass lantern starts, in yards (p. 51). */
export const GLASS_LANTERN_FIRE_YARDS = 1;

/** Relighting a lantern takes 30-60 seconds (p. 51); a flashlight is switched with a Ready maneuver (p. 52). */
export const RELIGHT_SECONDS = Object.freeze({ min: 30, max: 60 });

/** Whether a light reaches a target this far away: within its radius, or its beam where it is aimed. */
export function reaches(light: Light, yards: number, aimed: boolean): boolean {
  const d = Number(yards);
  if (!Number.isFinite(d) || d < 0) return false;
  if (light.radius > 0 && d <= light.radius) return true;
  return aimed && light.beam > 0 && d <= light.beam;
}

/**
 * A beam set down lights a cone ahead of it, its reach long. The book gives
 * no width: a fifth of the reach, and never under 2 yards, keeps a
 * flashlight's pool of light narrow and a floodlight's broad.
 */
export function beamWidth(beamYards: number): number {
  return Math.max(2, Math.round(Math.max(0, Number(beamYards) || 0) / 5));
}

/**
 * A broken glass lantern's fire (p. 51, sending the reader to the Molotov
 * cocktail, p. 191, and so Campaigns p. 411): 1d-1 burning a second in a
 * 1-yard radius, which most DR stops at only a fifth of its value, for 10d
 * seconds.
 */
export const LANTERN_FIRE = Object.freeze({ dice: 1, adds: -1, armorDivisor: 5, burnsForDice: 10 });

/** How long a light burns on its fuel, where the book says (pp. 51-52), and what renews it. */
export interface Burn {
  /** Seconds of light from a fill, a charge or a stick. */
  seconds: number;
  /** A pint of oil, a charge of carbide, an ounce of candle, a chemlight snapped, or 30 seconds' winding. */
  fuel: "pint" | "carbide" | "ounce" | "snap" | "wind";
}

/**
 * The lights whose burning time the book prints, by record name: the
 * lanterns a pint each, the carbide lamp 5 hours on a charge, candles by the
 * ounce, a chemlight's 12 hours, and the survival flashlight's 3 minutes for
 * 30 seconds' winding (6 at TL8).
 */
export function burnOf(name: string, tl: number): Burn | null {
  const base = String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
  const hours = (h: number) => h * 3600;
  if (/^bull's-eye lantern$/i.test(base)) return { seconds: hours(6), fuel: "pint" };
  if (/^glass lantern$/i.test(base)) return { seconds: hours(10), fuel: "pint" };
  if (/^kerosene lantern$/i.test(base)) return { seconds: hours(12), fuel: "pint" };
  if (/^carbide lamp$/i.test(base)) return { seconds: hours(5), fuel: "carbide" };
  if (/^tallow candles\b/i.test(base)) return { seconds: hours(4), fuel: "ounce" };
  if (/^wax candles\b/i.test(base)) return { seconds: hours(8), fuel: "ounce" };
  if (/^chemlight$/i.test(base)) return { seconds: hours(12), fuel: "snap" };
  if (/^survival flashlight$/i.test(base)) return { seconds: (tl >= 8 ? 6 : 3) * 60, fuel: "wind" };
  return null;
}

/** Winding or shaking a survival flashlight takes 30 seconds (p. 52). */
export const WINDING_SECONDS = 30;

/** Seconds of burning left: the fill less what has burned, and what is burning now since it was lit. */
export function burnLeft(burn: Burn, burned: number, litAt: number | null, now: number): number {
  const since = litAt === null ? 0 : Math.max(0, now - litAt);
  return Math.max(0, burn.seconds - Math.max(0, burned) - since);
}

/** A flashlight's batteries last ten times as long at TL8 (p. 52). */
export const TL8_BATTERY_FACTOR = 10;
export function tl8BatteryFactor(name: string, tl: number): number | null {
  if (tl < 8) return null;
  return /^(flashlight|micro-flashlight|mini-flashlight)$/i.test(String(name ?? "").trim()) ? TL8_BATTERY_FACTOR : null;
}

/** Looking into a tactical light: HT-4 or blinded (p. 52). */
export const TACTICAL_BLINDING_HT = -4;

/** Seconds of blindness a failed roll leaves: 10 times the margin of failure (p. 52). */
export function blindedSeconds(margin: number): number {
  return 10 * Math.max(1, Math.abs(Math.trunc(Number(margin) || 0)));
}

/** The penalty blindness gives sight and attacks (Characters p. 124), as the other blinding rules here use it. */
export const BLINDED_PENALTY = -10;

// ── navigation instruments (pp. 52-53) ──

/** What a record is to navigation: an instrument, a map, or nothing. */
export const NAVIGATION_KINDS = ["", "compass", "chronometer", "instruments", "surveying", "gps", "map"] as const;
export type NavigationKind = (typeof NAVIGATION_KINDS)[number];

/** A skill the navigation rules read, by specialty. */
export type NavSkill = "air" | "land" | "sea" | "surveying" | "forwardObserver";

/** The navigation rules' name for a skill, or null for one they don't reach. */
export function navSkillOf(name: string): NavSkill | null {
  const text = String(name ?? "").trim();
  if (/^forward observer\b/i.test(text)) return "forwardObserver";
  if (/^mathematics\b/i.test(text) && /\(surveying\)/i.test(text)) return "surveying";
  const nav = /^navigation\b.*\((air|land|sea)\)/i.exec(text);
  return nav ? (nav[1]!.toLowerCase() as NavSkill) : null;
}

/** An instrument carried, as the bonus reads it. */
export interface Instrument {
  kind: NavigationKind;
  name: string;
  tl: number;
  /** A GPS receiver out of sight of its satellites. */
  noSignal?: boolean;
}

/**
 * The best bonus the instruments carried give a skill, with the one that
 * gives it; the bonuses don't add (pp. 52-53), except that a chronometer and
 * navigating instruments together give +3 to Navigation (Sea).
 *
 *   - Compass: +1 to Navigation (Air, Land or Sea).
 *   - Marine chronometer: +1 to Navigation (Sea).
 *   - Navigating instruments: +2 to Navigation (Sea) at TL5, +3 at TL6+.
 *   - Surveying instruments: +2 to Mathematics (Surveying) or Navigation (Land).
 *   - GPS receiver: +3 to Navigation (Air, Land or Sea) while it sees its satellites.
 */
export function navigationBonus(skill: NavSkill, instruments: readonly Instrument[]): { value: number; name: string } | null {
  let best: { value: number; name: string } | null = null;
  const offer = (value: number, name: string) => {
    if (value > 0 && (!best || value > best.value)) best = { value, name };
  };
  const nav = skill === "air" || skill === "land" || skill === "sea";
  for (const i of instruments) {
    if (i.kind === "compass" && nav) offer(1, i.name);
    if (i.kind === "gps" && nav && !i.noSignal) offer(3, i.name);
    if (i.kind === "chronometer" && skill === "sea") offer(1, i.name);
    if (i.kind === "instruments" && skill === "sea") offer(i.tl >= 6 ? 3 : 2, i.name);
    if (i.kind === "surveying" && (skill === "surveying" || skill === "land")) offer(2, i.name);
  }
  if (skill === "sea") {
    const chronometer = instruments.find((i) => i.kind === "chronometer");
    const kit = instruments.find((i) => i.kind === "instruments");
    if (chronometer && kit) offer(3, `${chronometer.name} + ${kit.name}`);
  }
  return best;
}

/** Having no map at all (p. 52). */
export const NO_MAP = -10;

/**
 * The map line for a skill a map is basic equipment for (Navigation and
 * Forward Observer, p. 52): 0 with an accurate map, an inaccurate map's -1 to
 * -5, -10 with none. Navigating instruments carry their chart books (p. 53),
 * a map for Navigation (Sea). Null for a skill that needs no map.
 */
export function mapModifier(skill: NavSkill, maps: readonly number[], instruments: readonly Instrument[]): number | null {
  if (skill === "surveying") return null;
  if (skill === "sea" && instruments.some((i) => i.kind === "instruments")) return 0;
  if (!maps.length) return NO_MAP;
  return Math.max(...maps.map((m) => Math.max(-5, Math.min(0, Math.trunc(Number(m) || 0)))));
}

// ── load-bearing gear and packs (pp. 53-55) ──

/** What a record is to the load-bearing rules. */
export const CARRY_KINDS = ["", "lbe", "backpack", "bag"] as const;
export type CarryKind = (typeof CARRY_KINDS)[number];

/** The Soldier or IQ-based Hiking roll that set it up or fitted it (pp. 54): not made, made, failed. */
export const FITS = ["", "ok", "failed"] as const;
export type Fit = (typeof FITS)[number];

/** LBE set up badly counts as improvised at best (p. 54). */
export const BADLY_SET_UP = -2;

/** The quality grades' bonus (Campaigns p. 345): good +1, fine +2, the best at a TL +TL/2 (at least +2). */
export function qualityBonus(quality: string, tl = 0): number {
  if (quality === "best") return Math.max(2, Math.floor(Math.max(0, tl) / 2));
  return quality === "good" ? 1 : quality === "fine" ? 2 : 0;
}

/** What quality LBE takes off Stealth's encumbrance penalty: its quality bonus, from TL6 (p. 54). */
export function lbeStealth(quality: string, tl: number): number {
  return tl >= 6 ? qualityBonus(quality, tl) : 0;
}

/** What set-up LBE adds to reaching gear and Fast-Draw from it (p. 54): its quality, or -2 set up badly. */
export function lbeBonus(fit: Fit, quality: string, tl = 0): number | null {
  if (fit === "ok") return qualityBonus(quality, tl);
  if (fit === "failed") return BADLY_SET_UP;
  return null;
}

/** The roll that sets up LBE or fits a pack: the better of Soldier and IQ-based Hiking (p. 54). */
export function fittingRoll(options: { iq: number; ht: number; soldier: number | null; hiking: number | null }): { skill: "Soldier" | "Hiking"; level: number } {
  const soldier = options.soldier ?? options.iq - 5;
  // Hiking is HT-based; based on IQ it is the same skill against IQ. Its default is HT-5, so IQ-5.
  const hiking = options.hiking !== null ? options.hiking - options.ht + options.iq : options.iq - 5;
  return hiking > soldier ? { skill: "Hiking", level: hiking } : { skill: "Soldier", level: soldier };
}

/**
 * The Fast-Draw specialties drawn from pouches rather than a holster or
 * scabbard, which set-up LBE helps (p. 54): all but the gun and sword ones.
 */
export function drawsFromLbe(skill: string): boolean {
  const m = /^fast-draw\s*\(([^)]*)\)/i.exec(String(skill ?? "").trim());
  if (!m) return false;
  return !/^(pistol|long arm|longarm|sword|two-handed sword|force sword)$/i.test(m[1]!.trim());
}

/**
 * Getting at something crammed into a pack or cargo pocket is a long action
 * of 1d or 2d seconds, with no Fast-Draw (p. 54, after Campaigns p. 383): a
 * bag or pocket 1d, a backpack 2d.
 */
export function retrieveDice(kind: CarryKind): number {
  return kind === "backpack" ? 2 : 1;
}

/** Opening a pouch's secured flap adds a Ready maneuver (p. 54). */
export const FLAP_READY = 1;

/**
 * The canteens that slosh when not full to the brim, undoing LBE's Stealth
 * benefit: all but the water pack (p. 53).
 */
export function sloshes(name: string): boolean {
  return /^(canteen|charcoal-filtered canteen|water bottle)$/i.test(String(name ?? "").trim());
}

/** At TL8 packs weigh half, and backpacks cost double (p. 54). */
export function packPrice(kind: CarryKind, tl: number): { cost: number; weight: number } | null {
  if (tl < 8 || (kind !== "backpack" && kind !== "bag")) return null;
  return { cost: kind === "backpack" ? 2 : 1, weight: 0.5 };
}

/** An hour's march: Move/2 miles an hour, before terrain and weather (p. 55). */
export function marchMph(move: number): number {
  return Math.max(0, Number(move) || 0) / 2;
}

// ── climbing gear (pp. 55-56) ──

/** What a record is to the climbing rules. */
export const CLIMBING_KINDS = ["", "harness", "rappelKit", "ascender", "descender", "grapnel", "crampons", "skis", "snowshoes", "suctionCup"] as const;
export type ClimbingKind = (typeof CLIMBING_KINDS)[number];

/** Gear a climber rappels on: a harness, or a kit that holds one. */
export const ROPE_GEAR: readonly ClimbingKind[] = ["harness", "rappelKit", "descender"];

/** The farthest a roped climber falls: twice the distance to the last fastener (p. 55). */
export function anchoredFall(yardsAboveFastener: number): number {
  return 2 * Math.max(0, Number(yardsAboveFastener) || 0);
}

/**
 * Shooting while rappelling face-down: bad footing and a minor distraction,
 * -4 (p. 55). Sure-Footed (p. 250) ignores the bad footing's -2.
 */
export function rappelPenalty(sureFooted: boolean): number {
  return sureFooted ? -2 : -4;
}

/** Throwing a grapnel: DX-3 or Throwing, to at most ST x 2 yards (p. 55). */
export function grapnelRoll(dx: number, throwing: number | null): { skill: "DX" | "Throwing"; level: number } {
  const fromDx = dx - 3;
  return throwing !== null && throwing > fromDx ? { skill: "Throwing", level: throwing } : { skill: "DX", level: fromDx };
}

export const grapnelRange = (st: number): number => 2 * Math.max(0, Number(st) || 0);

/** A grapnel holds 300 lbs., doubled at TL7 (p. 55). */
export const grapnelLoad = (tl: number): number => (tl >= 7 ? 600 : 300);

/** A grapnel ringing on stone is heard on an unmodified Hearing roll at 1 yard (p. 55). */
export const GRAPNEL_RING_YARDS = 1;

/** A padded grapnel: +1 lb., and -2 to hear it (p. 55). */
export const PADDED_GRAPNEL = Object.freeze({ weight: 1, hearing: -2 });

/**
 * Whether a piece of climbing gear cancels the penalty of the climb the roll
 * is tagged with (`climb-<kind>`, Campaigns p. 349): an ascender the -2 up a
 * rope, a descender the -1 down one, and suction cups the -3 up a modern
 * building (pp. 55-56). The Climbing Kit holds an ascender and a descender,
 * the Mini-Rappel Kit a descender.
 */
export function cancelsClimb(kind: ClimbingKind, name: string, tags: readonly string[]): boolean {
  if (tags.includes("climb-ropeUp")) return kind === "ascender" || (kind === "rappelKit" && /\bclimbing kit\b/i.test(name));
  if (tags.includes("climb-ropeDown") || tags.includes("climb-ropeDownRigged")) return kind === "descender" || kind === "rappelKit";
  if (tags.includes("climb-modernBuilding")) return kind === "suctionCup";
  return false;
}

/** Crampons' spikes add +2 to kicking damage (p. 56). */
export const CRAMPON_KICK = 2;

/** Crampons give +1 to Climbing on ice (p. 56). */
export const CRAMPON_ICE = 1;

/** A hand drill takes 30 minutes to drill a 3" bolt hole in normal rock (p. 55). */
export const HAND_DRILL_MINUTES = 30;

/**
 * The personal lifting device (p. 56): 3 yards a second up or down a rope, a
 * fuel cartridge for 200 yards of ascent, 300 lbs. at most.
 */
export const LIFTING_DEVICE = Object.freeze({ yardsPerSecond: 3, cartridgeYards: 200, lbs: 300 });

/** The seconds a climb of so many yards takes on the lifting device, and whether it lifts the load. */
export function liftingClimb(yards: number, load: number): { seconds: number; lifts: boolean } {
  return { seconds: Math.ceil(Math.max(0, yards) / LIFTING_DEVICE.yardsPerSecond), lifts: Math.max(0, load) <= LIFTING_DEVICE.lbs };
}

/** The working load of each rope and cord the book prints, in lbs. (pp. 55-56); null for another. */
export function ropeLoad(name: string): number | null {
  const base = String(name ?? "").trim();
  const loads: ReadonlyArray<[RegExp, number]> = [
    [/^cord, hemp\b/i, 50],
    [/^rope, 1\/2", hemp\b/i, 300],
    [/^rope, 2 1\/2", hemp\b/i, 2000],
    [/^rope, 1\/2", manila\b/i, 350],
    [/^rope, 1 1\/2", manila\b/i, 2000],
    [/^cord, synthetic\b/i, 55],
    [/^rope, 1\/4", synthetic\b/i, 500],
    [/^rope, 3\/8", synthetic\b/i, 650],
    [/^rope, 1\/2", synthetic\b/i, 4000],
  ];
  return loads.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/** An avalanche transceiver is a rescue beacon found at 20-50 yards under snow (p. 56). */
export const AVALANCHE_RANGE = Object.freeze({ least: 20, most: 50 });

/** Snowshoes' -1 Move, which TL8 high-performance ones don't take (p. 56). */
export function snowshoeMove(tl: number): number {
  return tl >= 8 ? 0 : -1;
}
