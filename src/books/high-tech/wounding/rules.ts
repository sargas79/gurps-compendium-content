/**
 * The optional wounding rules (High-Tech p. 162): what a bullet does to a
 * body, for groups that want the aftermath of a gunfight to be brutal. The
 * pure rules.
 */

import type { SevereWound } from "../../../shared/bleeding/rules.js";

/** The damage types p. 162 means by "impaling, piercing, or tight-beam burning" (tight beams: see `rollsForVitals`). */
const PENETRATING = ["imp", "pi-", "pi", "pi+", "pi++"];

// ── body hits (p. 162) ──

/**
 * Whether a blow rolls 1d for the vitals: an impaling or piercing hit on the
 * torso. A torso hit that is a module's own location (a vein, say) is aimed at
 * something else, and so isn't rolled for. Tight-beam burning also rolls, but
 * the blow doesn't say whether a burn is a tight beam, so a burn never does.
 */
export function rollsForVitals(options: { hitLocation: string; addonLocation?: string | null; damageType: string }): boolean {
  return options.hitLocation === "torso" && !options.addonLocation && PENETRATING.includes(options.damageType);
}

/** A 1 on the 1d strikes the vitals (p. B399's effects); 2-6 is the torso, capped. */
export function strikesVitals(roll: number): boolean {
  return Math.floor(roll) === 1;
}

/**
 * The cap on a torso hit that missed the vitals, or on a groin hit, from an
 * impaling or piercing attack: the victim's HP where Bleeding (Campaigns
 * p. 420) is in play, twice that where it isn't. What goes past it is lost,
 * but with Bleeding it still counts toward the bleeding roll's penalty.
 */
export function bodyHitCap(options: { hitLocation: string; addonLocation?: string | null; damageType: string; hp: number; bleeding: boolean }): number | null {
  if (options.addonLocation || !PENETRATING.includes(options.damageType)) return null;
  if (options.hitLocation !== "torso" && options.hitLocation !== "groin") return null;
  const hp = Math.max(1, Math.floor(Number(options.hp) || 0));
  return options.bleeding ? hp : 2 * hp;
}

/**
 * The bleeding roll's penalty with the injury lost to the cap counted back
 * in, less the one the Basic Set already gives for the HP lost: what the cap
 * adds. -1 per 5 HP (Campaigns p. 420), so El Chacal's 23-point wound on an
 * 11-HP bodyguard is at -4, not the -2 his 11 HP lost would give.
 */
export function capExcessPenalty(hpLost: number, excess: number): number {
  const lost = Math.max(0, Math.floor(Number(hpLost) || 0));
  const extra = Math.max(0, Math.floor(Number(excess) || 0));
  return -Math.floor((lost + extra) / 5) + Math.floor(lost / 5);
}

// ── limb hits (p. 162) ──

/** The parts that cripple as limbs and extremities do. */
export const LIMB_LOCATIONS = ["arm", "leg", "hand", "foot"];

/** The least injury that cripples a part: the first whole point over its threshold (Campaigns p. 421). */
export function leastCrippling(threshold: number): number {
  return Math.floor(Math.max(0, Number(threshold) || 0)) + 1;
}

/**
 * What a crippling blow did to a limb or extremity, from its whole injury
 * before the cap: at least twice the least injury that cripples it cripples it
 * permanently, and severs it -- except that an impaling or piercing blow must
 * do twice that again to sever it, bullets passing through rather than
 * blowing a limb off. Null for an ordinary crippling, whose duration the HT
 * roll decides (p. B422).
 */
export function limbOutcome(options: { injury: number; threshold: number; damageType: string }): "permanent" | "severed" | null {
  const least = leastCrippling(options.threshold);
  const injury = Math.max(0, Number(options.injury) || 0);
  if (injury < 2 * least) return null;
  if (!PENETRATING.includes(options.damageType)) return "severed";
  return injury >= 4 * least ? "severed" : "permanent";
}

// ── stopping the bleeding (p. 162) ──

/**
 * A wound to the skull, an eye, the neck or the vitals bleeds every 30
 * seconds, at a further -2 for the neck or -4 for the vitals on top of the
 * wound's size, and only Surgery stops it. Null for any other.
 */
export function severeWound(hitLocation: string): SevereWound | null {
  switch (hitLocation) {
    case "vitals": return { intervalSeconds: 30, modifier: -4, surgery: true };
    case "neck": return { intervalSeconds: 30, modifier: -2, surgery: true };
    case "skull":
    case "eye": return { intervalSeconds: 30, modifier: 0, surgery: true };
    default: return null;
  }
}

/** The wound-size part of the bleeding roll's penalty, which First Aid and Surgery take too: -1 per 5 HP lost. */
export function woundSizePenalty(hpLost: number): number {
  return -Math.floor(Math.max(0, Math.floor(Number(hpLost) || 0)) / 5) || 0;
}

// ── "You shot me, Mister!" (p. 162) ──

/** The torso and the head, where 4 HP of injury is a serious wound. */
const SERIOUS_LOCATIONS = ["torso", "vitals", "skull", "face", "eye"];

/**
 * The Fright Check a wound calls for on the victim's next turn, as its
 * modifier, or null for none: a serious wound -- 4 HP or more to the torso or
 * head -- or the loss of a limb or an eye. A crippling wound (a lost limb, a
 * broken bone) is at -4; the GM may make any of them worse.
 */
export function woundFrightCheck(options: { hitLocation: string; injury: number; crippled: boolean }): number | null {
  if (options.crippled && [...LIMB_LOCATIONS, "eye"].includes(options.hitLocation)) return -4;
  if (SERIOUS_LOCATIONS.includes(options.hitLocation) && Number(options.injury) >= 4) return options.crippled ? -4 : 0;
  return null;
}
