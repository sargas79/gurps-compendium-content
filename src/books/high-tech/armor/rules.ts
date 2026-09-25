/**
 * High-Tech's armour, as rules the table reads (pp. 64-69): pieces that cover
 * part of a location, concealing armour under clothes, and the materials
 * low-tech armour is remade in.
 */

import { holdoutBonus } from "../../../shared/concealment/rules.js";

export { coversArc, combinedSixths, partialStands, sixths, strikeAroundPenalty } from "../../../shared/coverage/rules.js";

/** A name without the TL the records add to it: "Fragmentation Vest (TL 7)" is "Fragmentation Vest". */
export function baseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

// ── partial coverage (pp. 66-69) ────────────────────────────────────────────

/**
 * A steel toe box protects when an attack on the foot hits the toe, 2 in 6
 * (p. 68 note 4); the rest of the time the boot's own DR counts.
 */
export const TOE_BOX_SIXTHS = 2;

/** Shoulder pads worn to slam with: +1 to the slam's damage, DR 3 against what the slammer takes back (p. 66 note 4). */
export const SLAM_PADS = Object.freeze({ damage: 1, dr: 3 });

/** High boots with their tops turned up cover 3 in 6 of the legs (p. 68 note 3). */
export const TOPS_UP = { pattern: /^boots, high$/i, sixths: 3, location: "leg" } as const;

/** Whether a piece's name is one whose tops can be turned up. */
export function canTurnUpTops(name: unknown): boolean {
  return TOPS_UP.pattern.test(baseName(name));
}

/**
 * The better DR a piece gives some locations against a blow from the front
 * (the TL7 fragmentation vest's DR 8 over the vitals, p. 66 note 3; the bomb
 * disposal suit's 20 on the torso, p. 75 note 10), or null where it doesn't
 * reach this blow. An unknown arc counts as the front.
 */
export function frontDrAt(front: { dr: number; locations: readonly string[] }, location: string, arc: string | null | undefined): number | null {
  if (!(front.dr > 0) || !front.locations.includes(location)) return null;
  if (arc && arc !== "front") return null;
  return Math.floor(front.dr);
}

/**
 * Where a piece that armours one side only is worn: the front, as the
 * system's "F" has it, or the back, as a trauma plate may be (p. 67: a plate
 * protects the torso from the front or the back, and two cover both).
 */
export type WornSide = "front" | "back";

/**
 * Whether a one-sided piece meets a blow from this arc. A front piece meets a
 * blow from the front, and one whose arc nobody knows (the system's reading
 * of "F"); a back piece only a blow from behind. A blow from the side meets
 * neither.
 */
export function sideMeets(side: WornSide, arc: string | null | undefined): boolean {
  if (side === "back") return arc === "back";
  return !arc || arc === "front";
}

/**
 * A piece's DR against one kind of damage at one location, as the system
 * reads a worn piece (Characters pp. 47, 282): a place it armours differently
 * gives that figure, a split DR the second figure against the damage types it
 * names, and ablative DR what is left of it.
 */
export function pieceDrAt(system: {
  dr?: unknown;
  drSplit?: unknown;
  drSplitAppliesTo?: unknown;
  drByLocation?: unknown;
  drLost?: unknown;
}, damageType: string, location: string): number {
  const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const places = Array.isArray(system.drByLocation) ? system.drByLocation : [];
  const place = places.find((p: any) => Array.isArray(p?.locations) && p.locations.includes(location));
  const split = system.drSplit === null || system.drSplit === undefined ? null : whole(system.drSplit);
  const splitTypes = Array.isArray(system.drSplitAppliesTo) ? system.drSplitAppliesTo : [];
  const dr = place ? whole(place.dr) : split !== null && splitTypes.includes(damageType) ? split : whole(system.dr);
  return Math.max(0, dr - whole(system.drLost));
}

// ── concealing armour (pp. 64, 66) ──────────────────────────────────────────

/** The most a design made to be concealed takes off the penalty (p. 66). */
export const DESIGN_MAX = 4;

/**
 * Holdout's penalty to hide a piece from someone looking for it: its DR for
 * rigid armour, a third of it (rounded up) for flexible (p. 66).
 */
export function armorHoldoutPenalty(dr: number, flexible: boolean): number {
  const d = Math.max(0, Math.floor(Number(dr) || 0));
  return -(flexible ? Math.ceil(d / 3) : d);
}

/**
 * The piece's whole modifier to Holdout: its penalty, less up to +4 for a
 * design made to be concealed, which only negates the penalty and never
 * turns it into a bonus (p. 66).
 */
export function concealArmorModifier(dr: number, flexible: boolean, design: number): number {
  const penalty = armorHoldoutPenalty(dr, flexible);
  const bonus = Math.max(0, Math.min(DESIGN_MAX, Math.floor(Number(design) || 0)));
  return Math.min(0, penalty + bonus);
}

/**
 * What an article of clothing gives toward Holdout (p. 64): a long coat +4,
 * a poncho or other wet-weather gear +4 for its bulk, and undercover clothing
 * +1 or +2 (quality), which a long coat can be made as too. Null for anything
 * else.
 */
export function clothingHoldout(name: unknown): { own: number; undercover: number } | null {
  const base = baseName(name);
  const undercover = /^undercover clothing \((.+),\s*\+([12])\)$/i.exec(base);
  if (undercover) return { own: bulkyBonus(undercover[1]!), undercover: Number(undercover[2]) };
  const own = bulkyBonus(base);
  return own ? { own, undercover: 0 } : null;
}

/** A long coat's or a poncho's own +4. */
function bulkyBonus(name: string): number {
  return /^long coat\b|^wet-weather gear$|\bponcho$/i.test(name.trim()) ? 4 : 0;
}

/** An article's whole Holdout bonus, or 0. */
export function clothingHoldoutBonus(name: unknown): number {
  const given = clothingHoldout(name);
  return given ? holdoutBonus(given) : 0;
}

// ── materials (pp. 65, 67) ──────────────────────────────────────────────────

/** What low-tech armour or a shield is remade in (p. 65); "" for as it is. */
export type ArmorMaterial = "" | "steel" | "steelLight" | "smartFoam" | "titanium";
export const MATERIALS: readonly ArmorMaterial[] = ["", "steel", "steelLight", "smartFoam", "titanium"];

/**
 * Each material's effect (p. 65): TL5+ steel doubles metal armour's DR at the
 * same cost and weight, or keeps the DR at half both; smart foam is cloth
 * armour at ten times the cost; titanium keeps the DR at a third of the
 * weight and five times the cost.
 */
export const MATERIAL_EFFECTS: Readonly<Record<Exclude<ArmorMaterial, "">, { tl: number; cost: number; weight: number; drFactor: number }>> = {
  steel: { tl: 5, cost: 1, weight: 1, drFactor: 2 },
  steelLight: { tl: 5, cost: 0.5, weight: 0.5, drFactor: 1 },
  smartFoam: { tl: 8, cost: 10, weight: 1, drFactor: 1 },
  titanium: { tl: 8, cost: 5, weight: 1 / 3, drFactor: 1 },
};

/** Smart foam's DR: 4 against crushing, 1 against everything else (p. 65). */
export const SMART_FOAM = { crushing: 4, other: 1 } as const;

/** A piece's price in a material, or null where the material changes nothing. */
export function materialPrice(price: { cost: number; weight: number }, material: ArmorMaterial): { cost: number; weight: number } | null {
  if (!material) return null;
  const effect = MATERIAL_EFFECTS[material];
  if (effect.cost === 1 && effect.weight === 1) return null;
  return { cost: Math.round(price.cost * effect.cost * 100) / 100, weight: Math.round(price.weight * effect.weight * 1000) / 1000 };
}

/** A piece's DR in a material against one kind of damage. */
export function materialDr(dr: number, material: ArmorMaterial, damageType: string): number {
  if (material === "smartFoam") return damageType === "cr" ? SMART_FOAM.crushing : SMART_FOAM.other;
  if (!material) return dr;
  return dr * MATERIAL_EFFECTS[material].drFactor;
}

/**
 * Semi-ablative trauma plates, the GM's gritty option (p. 67; Characters
 * p. 47): every 10 points of basic damage rolled take a point of DR, whether
 * or not the blow got through, never more than the plate has left.
 */
export function plateLoss(basicDamage: number, remainingDr: number): number {
  return Math.max(0, Math.min(Math.floor(remainingDr), Math.floor(Math.max(0, basicDamage) / 10)));
}
