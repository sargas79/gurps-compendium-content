/**
 * High-Tech's liquid projectors and laser dazzlers (pp. 178-181), registered
 * with the system through the add-on API under three switches. The rules are
 * in `rules.ts`; what a laser does to the eyes is the shared engine's, with
 * this book's table.
 *
 *   - **Flamethrowers (flamethrowers):** the jet is a large-area injury
 *     (Campaigns p. 400) and sets clothes alight as the Basic Set's Catching
 *     Fire does (Campaigns p. 434); DR that isn't sealed counts at a fifth,
 *     the victim's own (the system's natural lines) as well as worn. The fuel then burns on the victim for 2d x 5 seconds (1d x 5 past
 *     1/2D), 1d burn a second on each of the victim's turns against the same
 *     fifth of their large-area DR, until it burns out or the GM takes the
 *     condition off (the lingering burn is `../burning.ts`'s). Played over an area up to three yards wide, as an
 *     All-Out Attack, damage and burning time are divided by the width.
 *     Unthickened fuel halves a TL7+ flamethrower's Range. A malfunction rolls
 *     the book's own table: no ignition, no fuel, or the tank exploding on
 *     everyone within two yards; each attempt to put it right is 10 seconds
 *     and an Armoury or IQ-based Liquid Projector roll, a critical failure an
 *     explosion. A shot at the weapon meets its DR 2, at no penalty, and
 *     damage that gets through blows it up on a 1 in 6, else disables it.
 *     A vehicle with an air-breathing engine (one whose HT code marks it as
 *     burning fuel) hit in a vital area rolls HT at once and every 3 seconds
 *     while the fuel burns, breaking down on a failure (`gworld.afterVehicleHit`).
 *   - **Spray guns (sprayGuns):** +2 to hit the face with the wide jet; a hit
 *     forces two rolls, one against coughing and one against blindness, each
 *     lasting minutes equal to the margin, or until washed off for pepper
 *     spray.
 *   - **Laser dazzlers (laserDazzlers):** Protected Vision, a Nictitating
 *     Membrane and anti-laser goggles against the roll to resist; a dazzler
 *     blinds for minutes equal to the margin, a blinding laser cripples both
 *     eyes (for good on a failure by 10 or more), recorded as crippled parts
 *     whose duration the HT roll settles (Campaigns p. 422; API 1.129.0).
 *     The +3 to resist past 1/2D is the system's, which gives it to any
 *     HT-resisted ranged affliction.
 */

import { dropAfflictionDr } from "../../../shared/affliction-dr.js";
import { bookOf } from "../../../shared/book-tables.js";
import { DAZZLE_TABLES, blindnessFrom, eyeProtection } from "../../../shared/dazzle/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { burnDrByLocation, registerLingeringBurn, startBurn, type LingeringBurn } from "../burning.js";
import {
  ANTI_LASER_GOGGLES,
  BACKPACK_FACING_PENALTY,
  BURN_PER_SECOND,
  CLEARING_SECONDS,
  EXPLOSION_YARDS,
  FLAMETHROWER_SKILL,
  HT_DAZZLE,
  SPRAYER_SKILL,
  SPRAY_TARGETS,
  SQUIRT_GUN_SKILL,
  TANK_DR,
  WIDE_JET_BONUS,
  airBreathing,
  burnDice,
  engineRollsFor,
  engineUnderFire,
  burnSeconds,
  eyeBeamOf,
  flameDr,
  flameMalfunction,
  sprayAgent,
  sprayEffectSeconds,
  sweepWidth,
  sweptDamage,
  tankStruck,
  unthickenedRange,
  type FlameMalfunction,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Projectors.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Projectors.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";
const SWEEP_OPTION = "ht-flame-sweep";
/** The fuel burning on a victim: `{ seconds }` left. */
const BURN_FLAG = "htFlameBurn";
const BURN_CONDITION = "ht-flame-burning";
/** A blow that is the tank's own explosion, which leaves no fuel burning. */
const EXPLOSION_SOURCE = "ht-flame-explosion";
const KIND_PREFIX = "ht-flame-";
/** Kinds an attempt can put right; an explosion can't be. */
const CLEARABLE: readonly string[] = [`${KIND_PREFIX}noIgnition`, `${KIND_PREFIX}noFuel`];

export interface ProjectorSwitches {
  flamethrowers: () => boolean;
  sprayGuns: () => boolean;
  laserDazzlers: () => boolean;
}

/** What this module keeps on a flamethrower, beside #364's fields on the same `firearm` object. */
export function projectorFields(f: any): Record<string, unknown> {
  return { unthickenedFuel: new f.BooleanField({ initial: false }) };
}

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const meleeModes = (item: any): any[] => item?.system?.meleeModes ?? [];
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
/** This book's gear, or gear from no book: another book's liquid projector takes its own book's rules. */
const ownBook = (item: any): boolean => item?.type === "equipment" && [null, "high-tech"].includes(bookOf(item));

/** Whether an item is a flamethrower. */
export function isFlamethrower(item: any): boolean {
  return ownBook(item) && rangedModes(item).some((m) => FLAMETHROWER_SKILL.test(String(m?.skill ?? "")));
}

/** Whether a mode sprays: a spray canister or a squirt gun. */
const sprays = (mode: any): boolean => SPRAYER_SKILL.test(String(mode?.skill ?? "")) || SQUIRT_GUN_SKILL.test(String(mode?.skill ?? ""));

/** Whether an item is a spray gun or aerosol. */
export function isSprayGun(item: any): boolean {
  return ownBook(item) && [...meleeModes(item), ...rangedModes(item)].some(sprays);
}

/** Whether an item is a spray canister that forces the two rolls, against coughing and blindness. */
const isGasSpray = (item: any): boolean => ownBook(item) && [...meleeModes(item), ...rangedModes(item)].some((m) => SPRAYER_SKILL.test(String(m?.skill ?? "")) && m?.affliction);

/**
 * The eye-beam a High-Tech laser weapon fires, or null. The supplement
 * Electricity and Electronics' dazzler and laser pointer blind only eyes used
 * to the dark (HT:EE p. 51), under its directedEnergyWeapons switch
 * (`../electronic-weapons`), not this one.
 */
export function laserBeamOf(item: any) {
  if (!ownBook(item) || !rangedModes(item).some((m) => m?.affliction)) return null;
  if (/Electricity and Electronics/i.test(String(item?.system?.reference ?? ""))) return null;
  return eyeBeamOf(String(item.name ?? ""));
}

export function unthickened(item: any): boolean {
  return item?.system?.extensions?.[MODULE_ID]?.[FIELD]?.unthickenedFuel === true;
}

/** A flamethrower mode's 1/2D, as its fuel leaves it. */
function halfDamageRange(item: any, modeIndex: number): number {
  const mode = rangedModes(item)[modeIndex] ?? rangedModes(item)[0] ?? {};
  const half = Number(mode.halfDamageRange) || 0;
  return unthickened(item) ? unthickenedRange(half, tlOf(item)) : half;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

function itemContext(item: any): Record<string, unknown> {
  const tl = tlOf(item);
  const lines = [L("Flame.SheetLine")];
  if (unthickened(item) && tl >= 7) lines.push(L("Flame.UnthickenedLine"));
  return { editable: item.isOwner, thickened: tl >= 7, unthickened: unthickened(item), lines };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ht-unthickened]")?.addEventListener("change", async (event) => {
    await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.unthickenedFuel`]: (event.currentTarget as HTMLInputElement).checked });
  });
}

/** Whether the victim keeps the flame out: Sealed, from a trait or a sealed suit (p. 178). */
function sealed(api: GWorldApi, actor: any): boolean {
  return (api.actors.derived(actor) as any)?.traitEffects?.sealed === true;
}

/** The DR the burning fuel meets each second: the large-area figure, at a fifth unless sealed. */
function burningDr(api: GWorldApi, actor: any): number {
  // Its DR against burning, where a location's DR is split (p. 178).
  const byLocation = burnDrByLocation(api, actor);
  const rules = api.rules as any;
  const locations: readonly string[] = rules.LARGE_AREA_LOCATIONS ?? ["torso"];
  const exposed = locations.map((location) => ({ location, dr: Number(byLocation[location]) || 0 }));
  const large = rules.largeAreaDr?.({ torsoDr: Number(byLocation.torso) || 0, exposed })?.dr ?? (Number(byLocation.torso) || 0);
  return flameDr(large, sealed(api, actor));
}


export function readyProjectors(api: GWorldApi, on: ProjectorSwitches): void {
  DAZZLE_TABLES.register(HT_DAZZLE);

  // The fuel burning on a victim: 1d a second against a fifth of their large-area DR (p. 178).
  const fuel: LingeringBurn = {
    flag: BURN_FLAG,
    condition: BURN_CONDITION,
    on: on.flamethrowers,
    title: () => L("Flame.Title"),
    conditionLabel: (seconds) => F("Flame.Burning", { seconds }),
    dice: BURN_PER_SECOND,
    dr: (a, actor) => burningDr(a, actor),
    secondLine: ({ name, roll, dr, injury }) => F("Flame.Second", { name, roll, dr, injury }),
    burnedOutLine: (name) => F("Flame.BurnedOut", { name }),
  };
  registerLingeringBurn(api, fuel);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-projectors-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-projectors-item.hbs`,
    visible: (item) => on.flamethrowers() && isFlamethrower(item),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── the rows ──
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!item) return;
    const flame = on.flamethrowers() && isFlamethrower(item);
    const spray = on.sprayGuns() && isSprayGun(item);
    const laser = on.laserDazzlers() ? laserBeamOf(item) : null;
    if (!flame && !spray && !laser) return;
    for (const entry of context.rows ?? []) {
      const row = entry.row;
      const mode = entry.mode ?? {};
      if (flame && entry.kind === "ranged" && FLAMETHROWER_SKILL.test(String(mode.skill ?? ""))) {
        // "Anyone hit by a flamethrower suffers large-area injury" -- and may catch fire (p. 178).
        row.largeArea = true;
        row.incendiary = true;
        if (unthickened(item)) {
          row.halfDamageRange = unthickenedRange(Number(row.halfDamageRange) || 0, tlOf(item));
          row.maxRange = unthickenedRange(Number(row.maxRange) || 0, tlOf(item));
        }
        row.notes?.push?.({ label: L("Flame.Note"), hint: L("Flame.NoteHint") });
      }
      if (spray && sprays(mode)) {
        // Two rolls, one against coughing and one against blindness (p. 180).
        if (row.affliction && SPRAYER_SKILL.test(String(mode.skill ?? "")) && !row.followUp) {
          row.followUp = {
            damage: `${row.afflictionAttribute}${row.afflictionModifier}`, damageType: "cr", explosive: false, armorDivisor: 1, followUp: true,
            affliction: true, afflictionAttribute: row.afflictionAttribute, afflictionModifier: row.afflictionModifier, label: L("Spray.Blindness"),
          };
        }
        row.notes?.push?.({ label: L("Spray.Note"), hint: F("Spray.NoteHint", { bonus: WIDE_JET_BONUS }) });
      }
      if (laser && entry.kind === "ranged" && row.affliction) {
        row.notes?.push?.({ label: L(`Laser.Note.${laser}`), hint: L(`Laser.NoteHint.${laser}`) });
      }
    }
  });

  // ── flamethrowers (pp. 178-179) ──
  // Played over an area as an All-Out Attack (p. 178).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: SWEEP_OPTION,
    label: L("Sweep.Label"),
    attack: "ranged",
    input: { type: "number", min: 1, max: 3, step: 1 },
    available: (context: any) => on.flamethrowers() && isFlamethrower(context?.item),
    refuse: (context: any) => (String(context?.actor?.system?.maneuver ?? "") === "allOutAttack" ? null : L("Sweep.NeedsAllOut")),
    apply: (_context: any, value: unknown) => (sweepWidth(value) > 1 ? { notes: [F("Sweep.Note", { width: sweepWidth(value) })] } : null),
  } as any);

  // The width this attack was swept over, for the damage it does.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (on.sprayGuns() && isSprayGun(item) && SPRAY_TARGETS.includes(String(context.calledShot?.hitLocation ?? ""))) {
      context.modifiers.push({ label: L("Spray.WideJet"), value: WIDE_JET_BONUS });
    }
    if (!on.flamethrowers() || !isFlamethrower(item) || !item.isOwner || context?.mode?.ranged !== true) return;
    void api.combat.setWeaponState(item, MODULE_ID, { htFlameSweep: sweepWidth(context.options?.[`${MODULE_ID}.${SWEEP_OPTION}`]) });
  });

  // How far the target was, for how long the fuel burns (p. 178).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    const item = context?.item;
    if (!on.flamethrowers() || !isFlamethrower(item) || !item.isOwner) return;
    const yards = context.distanceYards;
    const half = halfDamageRange(item, Number(context.mode?.index) || 0);
    const beyond = yards !== null && yards !== undefined && half > 0 && Number(yards) >= half;
    void api.combat.setWeaponState(item, MODULE_ID, { htFlameBeyondHalf: beyond });
  });

  const stateOf = (item: any): any => api.combat.getWeaponState(item, MODULE_ID) ?? {};

  // A sweep divides the damage by its width (p. 178).
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const damage = context?.damage;
    if (!on.flamethrowers() || !damage || !isFlamethrower(context?.item) || damage.source === EXPLOSION_SOURCE) return;
    const width = sweepWidth(stateOf(context.item).htFlameSweep);
    if (width > 1) damage.basicDamage = sweptDamage(Number(damage.basicDamage) || 0, width);
  });

  // "Unsealed DR protects at 1/5 value; sealed armor protects completely" (p. 178): every
  // line, natural DR (`source: "natural"`, API 1.98.0) as well as worn pieces.
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.flamethrowers() || !isFlamethrower(context?.item) || sealed(api, context.actor)) return;
    for (const line of context.lines ?? []) {
      const dr = flameDr(Number(line.dr) || 0, false);
      if (dr === line.dr) continue;
      line.dr = dr;
      line.reason = L("Flame.FifthDr");
    }
  });

  // The fuel burns on (p. 178).
  Hooks.on(api.combat.hooks.afterDamage, async (context: any) => {
    const victim = context?.actor;
    const item = context?.item;
    if (!on.flamethrowers() || !victim?.isOwner || !isFlamethrower(item) || !context.result) return;
    if (context.damage?.source === EXPLOSION_SOURCE || context.damage?.source === "fragments") return;
    const state = stateOf(item);
    const dice = Array.from({ length: burnDice(state.htFlameBeyondHalf === true) }, d6);
    const seconds = burnSeconds(dice, sweepWidth(state.htFlameSweep));
    if (seconds <= 0) return;
    await startBurn(api, victim, fuel, { seconds });
    await say(victim, L("Flame.Title"), [F("Flame.Burns", { name: String(victim.name ?? ""), seconds, dice: dice.join(", ") })]);
  });

  // A vehicle with an air-breathing engine hit in a vital area: HT or it breaks down, rolled again
  // every 3 seconds until the fuel burns out; whether it also catches fire is the GM's (p. 179).
  Hooks.on(api.combat.hooks.afterVehicleHit, async (context: any) => {
    const item = context?.item;
    const vehicle = context?.vehicle;
    if (!on.flamethrowers() || !isFlamethrower(item) || context.location !== "vitalArea" || !context.actor?.isOwner) return;
    const stats = vehicle?.system?.vehicle ?? null;
    if (!airBreathing(stats)) return;
    const ht = Math.max(1, Math.floor(Number(stats.ht) || 10));
    const state = stateOf(item);
    const dice = Array.from({ length: burnDice(state.htFlameBeyondHalf === true) }, d6);
    const seconds = burnSeconds(dice, sweepWidth(state.htFlameSweep));
    const result = engineUnderFire(ht, seconds, Array.from({ length: engineRollsFor(seconds) }, () => d6() + d6() + d6()));
    const name = String(vehicle?.name ?? "");
    await say(context.actor, L("Engine.Title"), [
      F("Engine.Burns", { vehicle: name, seconds }),
      ...result.checks.map((c) => F(c.success ? "Engine.CheckMade" : "Engine.CheckFailed", { second: c.second, roll: c.roll, ht })),
      F(result.brokenDown ? "Engine.BrokenDown" : "Engine.Runs", { vehicle: name }),
      L("Engine.MayCatchFire"),
    ]);
  });

  /** The tank goes up: one second's damage to everything within two yards of the firer (p. 179). */
  const explode = async (actor: any, item: any, modeIndex: number) => {
    const mode = rangedModes(item)[modeIndex] ?? rangedModes(item)[0] ?? {};
    const formula = String(mode.damageFormula || "3d");
    await api.roll.damage({
      actor, item, mode: { index: modeIndex, ranged: true },
      label: F("Flame.ExplosionLabel", { name: String(item.name ?? ""), yards: EXPLOSION_YARDS }),
      formula, damageType: "burn", largeArea: true, incendiary: true, source: EXPLOSION_SOURCE,
    } as any);
  };

  // The flamethrower's own Malfunction Table (p. 179).
  Hooks.on(api.combat.hooks.malfunction, (context: any) => {
    const item = context?.item;
    if (!on.flamethrowers() || !isFlamethrower(item) || context.kind === null || context.kind === undefined) return;
    const result: FlameMalfunction = flameMalfunction(Number(context.roll));
    context.kind = `${KIND_PREFIX}${result}`;
    context.label = L(`Malfunction.${result}`);
    context.repair = result === "explosion" ? L("Malfunction.explosionRepair") : F("Malfunction.Repair", { seconds: CLEARING_SECONDS });
    context.fires = false;
    context.clears = false;
    context.explodes = result === "explosion";
    context.jams = true;
    if (result === "explosion" && item.isOwner) void explode(context.actor, item, Number(context.modeIndex) || 0);
  });

  /** Items with an attempt to clear under way, whose critical failure blows the tank. */
  const clearing = new Set<string>();

  // Putting it right: 10 seconds, and Armoury (Small Arms) or an IQ-based Liquid Projector roll (p. 179).
  Hooks.on(api.combat.hooks.clearMalfunction, (context: any) => {
    const item = context?.item;
    const kind = String(context?.malfunction?.kind ?? "");
    if (!on.flamethrowers() || !isFlamethrower(item) || !kind.startsWith(KIND_PREFIX)) return;
    if (!CLEARABLE.includes(kind)) {
      if (kind === `${KIND_PREFIX}explosion`) context.refusal = L("Malfunction.Exploded");
      return;
    }
    context.readyManeuvers = CLEARING_SECONDS;
    context.hours = 0;
    context.criticalFailure = "destroyed";
    for (const roll of context.rolls ?? []) roll.modifier = 0;
    clearing.add(String(item.uuid));
  });

  // A shot at the weapon: DR 2 (p. 179).
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    if (!on.flamethrowers() || !isFlamethrower(context?.item)) return;
    context.dr = TANK_DR;
    context.notes?.push?.(L("Tank.Note"));
  });
  // "An attack on an exposed weapon is at no penalty", and one on the backpack
  // at -4 while its carrier faces the attacker (p. 179): the arc the attack
  // comes from (API 1.137.0), or a note where there is none to read.
  Hooks.on(api.combat.hooks.weaponTargets, (context: any) => {
    if (!on.flamethrowers() || !context?.foe) return;
    const arc = typeof context.arc === "string" ? context.arc : null;
    for (const item of [...(context.foe.items ?? [])].filter((i: any) => isFlamethrower(i) && i.system?.equipped)) {
      const name = String(item.name ?? "");
      const target = {
        id: String(item.id),
        name: arc ? F(arc === "front" ? "Tank.TargetFacing" : "Tank.TargetBehind", { name }) : F("Tank.Target", { name, penalty: BACKPACK_FACING_PENALTY }),
        penalty: arc === "front" ? BACKPACK_FACING_PENALTY : 0,
        canDisarm: false, noParry: true, noDefenseBonus: false, disarmPenaltyForAll: false,
      };
      context.targets = [...(context.targets ?? []).filter((t: any) => t.id !== target.id), target];
    }
  });

  // What the weapon's hit points were before a blow, for the roll damage that got through makes.
  Hooks.on("preUpdateItem", (item: any, changes: any, options: any) => {
    if (!on.flamethrowers() || !isFlamethrower(item)) return;
    if (changes?.system?.hpLost !== undefined) options[`${MODULE_ID}.hpLost`] = Number(item.system?.hpLost) || 0;
  });
  Hooks.on("updateItem", async (item: any, changes: any, options: any, userId: string) => {
    if (userId !== (game as any).user?.id || !on.flamethrowers() || !isFlamethrower(item)) return;
    const actor = item.actor;
    // A critical failure putting it right: "an explosion, as 18" (p. 179).
    const kind = changes?.flags?.gworld?.malfunction?.kind;
    if (kind !== undefined && clearing.has(String(item.uuid))) {
      clearing.delete(String(item.uuid));
      if (kind === "destroyed") {
        await api.items.setMalfunction(item, { kind: `${KIND_PREFIX}explosion`, label: L("Malfunction.explosion") });
        await explode(actor, item, 0);
      }
    }
    // Damage through the tank's DR: 1d, a 1 blows it up (p. 179).
    const before = options?.[`${MODULE_ID}.hpLost`];
    const after = changes?.system?.hpLost;
    if (before === undefined || after === undefined || Number(after) <= Number(before)) return;
    const die = d6();
    const outcome = tankStruck(die);
    await api.items.setMalfunction(item, { kind: `${KIND_PREFIX}${outcome === "explodes" ? "explosion" : "disabled"}`, label: L(`Tank.${outcome}`) });
    await say(actor, String(item.name ?? ""), [F(`Tank.${outcome}Line`, { name: String(item.name ?? ""), roll: die })]);
    if (outcome === "explodes") await explode(actor, item, 0);
  });

  // ── what DR does against a spray (p. 180) ──
  // A spray's agent is tear gas or pepper (p. 171): a gas breathed and in the
  // eyes, which armour doesn't keep out, so the system's DR line goes (see
  // Poison Examples, Campaigns p. 439; Characters p. 35).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.sprayGuns() || !context?.tags?.includes?.("resist") || !isGasSpray(context.attack?.item)) return;
    dropAfflictionDr(context);
  });

  // ── laser dazzlers (p. 181) ──
  // Protected Vision, a Nictitating Membrane and anti-laser goggles against a
  // laser at the eyes; "DR has no effect", so the system's DR line goes (p. 181).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.laserDazzlers() || !context?.tags?.includes?.("resist") || !laserBeamOf(context.attack?.item)) return;
    dropAfflictionDr(context);
    const effects = (api.actors.derived(context.actor) as any)?.traitEffects ?? {};
    const goggles = [...(context.actor?.items ?? [])].some((i: any) => i?.system?.equipped && ANTI_LASER_GOGGLES.pattern.test(String(i.name ?? "")));
    const bonus = eyeProtection({
      protectedVision: effects.protectedSense?.vision === true || goggles,
      nictitatingMembrane: Math.max(Number(effects.nictitatingMembrane) || 0, goggles ? ANTI_LASER_GOGGLES.nictitatingMembrane : 0),
    });
    if (bonus) context.modifiers.push({ label: L("Laser.Protection"), value: bonus });
  });

  // ── what a failed roll leaves: a laser's blindness (p. 181), a spray's coughing and blindness (p. 180) ──
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    const name = String(context?.actor?.name ?? "");
    const title = String(context?.label ?? "");
    const margin = Number(context?.margin);
    const beam = on.laserDazzlers() ? laserBeamOf(item) : null;
    if (beam) {
      const blindness = blindnessFrom(DAZZLE_TABLES.forBook("high-tech") ?? HT_DAZZLE, beam, margin);
      if (blindness.kind === "dazzled") {
        context.effects.push({ module: MODULE_ID, key: "ht-dazzled", label: L("Laser.Dazzled"), duration: { seconds: blindness.minutes * 60 } });
        void say(context.actor, title, [F("Laser.DazzledLine", { name, minutes: blindness.minutes })]);
      } else if (context.actor?.isOwner) {
        // Both eyes recorded crippled with no injury behind it (API 1.129.0): the system imposes the
        // Blindness, and the p. 422 roll on the sheet settles how long, unless it is for good already.
        const label = L(blindness.permanent ? "Laser.BlindedForGood" : "Laser.Blinded");
        const duration = blindness.permanent ? "permanent" : "undecided";
        void (async () => {
          for (let eye = 0; eye < 2; eye += 1) await api.actors.cripple(context.actor, "eye", { duration, injury: false, label });
        })();
        void say(context.actor, title, [F(blindness.permanent ? "Laser.BlindedForGoodLine" : "Laser.BlindedRecordedLine", { name })]);
      } else {
        context.effects.push({ module: MODULE_ID, key: "ht-laser-blinded", label: L(blindness.permanent ? "Laser.BlindedForGood" : "Laser.Blinded") });
        void say(context.actor, title, [F(blindness.permanent ? "Laser.BlindedForGoodLine" : "Laser.BlindedLine", { name })]);
      }
      return;
    }
    if (!on.sprayGuns() || !isGasSpray(item)) return;
    const agent = sprayAgent(String(item.name ?? ""));
    const seconds = sprayEffectSeconds(agent, margin);
    const duration = seconds === null ? {} : { duration: { seconds } };
    const blinding = title.endsWith(L("Spray.Blindness"));
    context.effects.push(blinding
      ? { module: MODULE_ID, key: "ht-spray-blinded", label: L("Spray.Blinded"), ...duration }
      : { key: "coughing", ...duration });
    const lasting = seconds === null ? L("Spray.UntilWashed") : F("Spray.ForMinutes", { minutes: seconds / 60 });
    void say(context.actor, title, [F(blinding ? "Spray.BlindedLine" : "Spray.CoughingLine", { name, lasting })]);
  });
}
