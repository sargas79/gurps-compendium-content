/**
 * Contact stunners and armour, for every book that prints an electric
 * weapon struck home by touch (Ultra-Tech p. 165, High-Tech p. 199). Both
 * resist the shock with HT, armour helping, and both send the reader to the
 * Basic Set's electricity (Campaigns p. 432), where metallic armour "provides
 * only DR 1" against a shock.
 */

/** Armour a stunner's current runs through, by name: mail, plate, scale and the like (Campaigns p. 432). */
export function isMetallicArmor(name: string): boolean {
  return /\b(mail|plate|scale|steel|iron|bronze|metal|brigandine|lamellar|segmented)\b/i.test(name);
}

/** Metallic armour "provides only DR 1" against electricity (Campaigns p. 432). */
export const METALLIC_SHOCK_DR = 1;

/** Whether someone has metallic armour on. */
export function wearsMetallicArmor(actor: any): boolean {
  return [...(actor?.items ?? [])].some((item: any) => item?.type === "armor" && item.system?.equipped === true && isMetallicArmor(String(item.name ?? "")));
}

/**
 * What armour adds to the roll to resist a stunner's contact: its DR,
 * metallic armour's held to 1, divided by the weapon's armour divisor --
 * +2 a point at (0.5), as both books' stunners are.
 */
export function contactDrBonus(dr: number, armorDivisor: number, metallic: boolean): number {
  const armour = Math.max(0, Math.floor(Number(dr) || 0));
  const counted = metallic ? Math.min(armour, METALLIC_SHOCK_DR) : armour;
  const divisor = Number(armorDivisor) > 0 ? Number(armorDivisor) : 1;
  return Math.floor(counted / divisor);
}

/**
 * The same, from all the DR the system found at the spot (`met`: worn armour,
 * the victim's own DR, a force field) of which `worn` is his worn armour's.
 * Only worn metallic armour is held to DR 1; the rest counts in full.
 */
export function contactDrBonusAt(met: number, worn: number, armorDivisor: number, metallic: boolean): number {
  const all = Math.max(0, Math.floor(Number(met) || 0));
  const armour = Math.min(all, Math.max(0, Math.floor(Number(worn) || 0)));
  const counted = all - armour + (metallic ? Math.min(armour, METALLIC_SHOCK_DR) : armour);
  const divisor = Number(armorDivisor) > 0 ? Number(armorDivisor) : 1;
  return Math.floor(counted / divisor);
}
