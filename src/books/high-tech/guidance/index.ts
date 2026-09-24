/**
 * Fuzes and homing weapons from the supplement Electricity and Electronics
 * (HT:EE pp. 48-49), part of High-Tech (decision E1 in #471), under two
 * switches. The figures are in `rules.ts`.
 *
 *   - **Electronic fuzes (electronicFuzes, HT:EE p. 48):** a row action fits
 *     a fuze the character carries to anything that explodes -- a grenade,
 *     a mine, a charge of explosive. An impact fuze says only how it arms. A
 *     proximity fuze is set to a distance up to the 25 yards its radar sees,
 *     and sets the charge off when a token comes that close to the token
 *     holding it. A time fuze is set to up to three minutes and goes off
 *     when they have passed, counted in combat rounds as High-Tech's grenade
 *     fuses are. Going off rolls the blast from the item's own explosive
 *     mode, or, for a charge with none, says to set it off with High-Tech's
 *     demolition action. Another row action improvises a time fuze from a
 *     clock or watch, on a roll against Explosives (Demolition).
 *   - **Homing seekers (homingSeekers, HT:EE p. 49; Campaigns pp. 412-413):**
 *     a homing row with no lock-on roll of its own gets the Basic Set's --
 *     Artillery (Guided Missile) to lock on, then the missile's own skill of
 *     10 -- and, once locked on, its Acc even where the Aim box was left
 *     empty. An attack option says what the seeker homes on (High-Tech's
 *     missiles give their own), which tags the roll with that sense; an
 *     infrared seeker on a warm hull takes -2, and an advanced acoustic
 *     torpedo may home on propulsion and steering as the vital area (-3,
 *     Campaigns p. 554). A laser-homing missile needs someone holding a
 *     laser designator on its target: a row action on the designator rolls
 *     the DX-based Forward Observer roll while its holder aims at the target
 *     (Campaigns p. 412), and the missile's attack is refused while nobody
 *     holds the spot there.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { chargeOf } from "../records.js";
import { ask, clockNow, formulaOf, hint, isActiveGm, mainMode, number, row, say, secondsSince, select, skillRoll, targetedTokens, type ClockStamp } from "../ordnance/common.js";
import {
  DESIGNATOR_SKILL,
  HOMING_AIMING_SKILL,
  HOMING_SKILL,
  IMPROVISED_TIME_FUZE,
  PROXIMITY_DETECTION_YARDS,
  SEEKER_CHOICES,
  TIME_FUZE_MAX_SECONDS,
  dxBased,
  fuzeKind,
  homes,
  isClock,
  proximitySetting,
  proximityTriggers,
  seekerChoice,
  seekerModifier,
  seekerOf,
  seekerTags,
  seekersOf,
  timeFuzeFires,
  timeSetting,
  type FuzeKind,
  type SeekerChoice,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Guidance.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Guidance.${key}`, data);
const nameOf = (item: any) => String(item?.name ?? "").trim();

export interface GuidanceSwitches {
  fuzes: () => boolean;
  seekers: () => boolean;
}

/** A fuze fitted to an explosive item, as its weapon state keeps it. */
export interface FittedFuze {
  kind: FuzeKind;
  /** Yards for a proximity fuze, seconds for a time fuze, 0 for impact. */
  setting: number;
  /** The fuze's record, or the clock it was improvised from. */
  fuze: string;
  set: ClockStamp;
}

const SEEKER_OPTION = "ee-seeker";

// ── what a record is ──────────────────────────────────────────────────────

/** Whether an item explodes: a charge of explosive, or a mode that is a blast. */
export function explodes(item: any): boolean {
  if (item?.type !== "equipment") return false;
  if (chargeOf(item)) return true;
  return mainMode(item)?.mode?.explosive === true;
}

/** Whether a weapon has a homing mode. */
export const homingWeapon = (item: any): boolean => (item?.system?.rangedModes ?? []).some(homes);

/** Whether a record is a laser designator (HT:EE p. 49). */
export const isDesignator = (item: any): boolean => /^laser designator\b/i.test(nameOf(item));

/** The fuzes a character carries: the fuze records, and clocks made into time fuzes. */
export function carriedFuzes(api: GWorldApi, actor: any): Array<{ item: any; kind: FuzeKind; improvised: boolean }> {
  const out: Array<{ item: any; kind: FuzeKind; improvised: boolean }> = [];
  for (const item of [...(actor?.items ?? [])]) {
    if (item?.type !== "equipment" || item.system?.carried === false) continue;
    const kind = fuzeKind(nameOf(item));
    if (kind) out.push({ item, kind, improvised: false });
    else if (isClock(nameOf(item)) && (api.combat.getWeaponState(item, MODULE_ID) as any)?.eeImprovisedFuze === true) out.push({ item, kind: "time", improvised: true });
  }
  return out;
}

/** The fuze fitted to an item, if any. */
export function fittedFuze(api: GWorldApi, item: any): FittedFuze | null {
  const state = (api.combat.getWeaponState(item, MODULE_ID) as any)?.eeFuze;
  return state && typeof state === "object" && state.kind ? (state as FittedFuze) : null;
}

/** The seeker an attack homes with: the option chosen, else the record's own. */
export function chosenSeeker(item: any, options: Record<string, unknown> | undefined): SeekerChoice | null {
  const picked = seekerChoice(options?.[`${MODULE_ID}.${SEEKER_OPTION}`]);
  return picked ?? (seekersOf(nameOf(item))[0] ?? null);
}

/** Yards between two token documents on the scene, by their centres. */
function yardsApart(a: any, b: any): number | null {
  const scene = a?.parent ?? (globalThis as any).canvas?.scene;
  const size = Number(scene?.grid?.size) || 100;
  const distance = Number(scene?.grid?.distance) || 1;
  const centre = (t: any) => ({ x: Number(t?.x) + (Number(t?.width) || 1) * size / 2, y: Number(t?.y) + (Number(t?.height) || 1) * size / 2 });
  const p = centre(a);
  const q = centre(b);
  if (![p.x, p.y, q.x, q.y].every(Number.isFinite)) return null;
  return Math.round((Math.hypot(p.x - q.x, p.y - q.y) / size) * distance * 10) / 10;
}

/**
 * Whether someone holds a laser designator's spot on this token: a carried
 * designator whose last Forward Observer roll put it there, in the hands of
 * someone still aiming at it (Campaigns pp. 364, 412).
 */
export function designatedBy(api: GWorldApi, targetUuid: string, people: any[]): any | null {
  if (!targetUuid) return null;
  for (const actor of people) {
    if (actor?.system?.maneuver !== "aim" || !(Number(actor.system?.aim?.turns) > 0) || String(actor.system?.aim?.target ?? "") !== targetUuid) continue;
    const designator = [...(actor.items ?? [])].find((i: any) => isDesignator(i) && i.system?.carried !== false
      && (api.combat.getWeaponState(i, MODULE_ID) as any)?.eeDesignating === targetUuid);
    if (designator) return actor;
  }
  return null;
}

/** The actors whose tokens are on the scene. */
const sceneActors = (): any[] => [...((globalThis as any).canvas?.tokens?.placeables ?? [])].map((t: any) => t?.actor).filter(Boolean);

export function readyGuidance(api: GWorldApi, on: GuidanceSwitches): void {
  readyFuzes(api, on.fuzes);
  readySeekers(api, on.seekers);
}

// ── electronic fuzes (HT:EE p. 48) ─────────────────────────────────────────

function readyFuzes(api: GWorldApi, on: () => boolean): void {
  /** The fitted fuze goes off: the item's own blast, or the demolition action for a bare charge. */
  const goOff = async (actor: any, item: any, why: string) => {
    await api.combat.setWeaponState(item, MODULE_ID, { eeFuze: null });
    const name = nameOf(item);
    const main = mainMode(item);
    if (main?.mode?.explosive === true && formulaOf(main.mode)) {
      await say(actor, name, [why]);
      await api.roll.damage({
        actor, item, mode: { index: main.index, ranged: main.ranged }, label: F("GoesOffLabel", { name }),
        formula: formulaOf(main.mode), damageType: main.mode.damageType ?? "cr", armorDivisor: Number(main.mode.armorDivisor) || 1,
        explosive: true, fragmentation: String(main.mode.fragmentation ?? ""),
        fragmentationType: main.mode.fragmentationType ?? "", fragmentationDivisor: Number(main.mode.fragmentationDivisor) || 1,
      } as any);
      return;
    }
    await say(actor, name, [why, L("SetOffCharge")]);
  };

  // Fitting a fuze and setting it (HT:EE p. 48).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-fit-fuze",
    itemTypes: ["equipment"],
    label: L("Fit"),
    icon: "fa-solid fa-stopwatch",
    visible: (item: any) => on() && explodes(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const fuzes = carriedFuzes(api, actor);
        const fitted = fittedFuze(api, item);
        if (!fuzes.length && !fitted) return void ui.notifications?.warn(L("NoFuze"));
        const name = nameOf(item);
        const value = await ask(name, [
          row(L("Fuze"), select("fuze", [
            ...(fitted ? [{ value: "", label: L("Remove") }] : []),
            ...fuzes.map((f, i) => ({ value: String(i), label: f.improvised ? F("Improvised", { clock: nameOf(f.item) }) : nameOf(f.item), selected: i === 0 })),
          ])),
          row(L("ProximityYards"), number("yards", PROXIMITY_DETECTION_YARDS, "1")),
          row(L("TimeSeconds"), number("seconds", 10, "1")),
          hint(F("FitHint", { yards: PROXIMITY_DETECTION_YARDS, seconds: TIME_FUZE_MAX_SECONDS })),
        ].join(""), L("Fit"));
        if (!value) return;
        const picked = fuzes[Number(value("fuze"))];
        if (value("fuze") === "" || !picked) {
          await api.combat.setWeaponState(item, MODULE_ID, { eeFuze: null });
          await say(actor, name, [F("Removed", { name })]);
          return;
        }
        const setting = picked.kind === "proximity" ? proximitySetting(value("yards")) : picked.kind === "time" ? timeSetting(value("seconds")) : 0;
        const fuze: FittedFuze = { kind: picked.kind, setting, fuze: nameOf(picked.item), set: clockNow(actor) };
        await api.combat.setWeaponState(item, MODULE_ID, { eeFuze: fuze });
        await say(actor, name, [F(`Fitted.${picked.kind}`, { name, fuze: fuze.fuze, yards: setting, seconds: setting, detects: PROXIMITY_DETECTION_YARDS })]);
      })();
    },
  } as any);

  // Improvising a time fuze from a clock and a few electronic parts (HT:EE p. 48).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-improvise-fuze",
    itemTypes: ["equipment"],
    label: L("Improvise"),
    icon: "fa-solid fa-clock",
    visible: (item: any) => on() && isClock(nameOf(item)) && (api.combat.getWeaponState(item, MODULE_ID) as any)?.eeImprovisedFuze !== true,
    run: (item: any, actor: any) => {
      void (async () => {
        const name = nameOf(item);
        // Explosives defaults to IQ-5 (Characters p. 194).
        const known = api.actors.skillLevel(actor, IMPROVISED_TIME_FUZE.skill);
        const outcome: any = typeof known === "number"
          ? await skillRoll(api, actor, [IMPROVISED_TIME_FUZE], F("ImproviseRoll", { clock: name }), [], ["fuze"])
          : await api.roll.success({ actor, base: (Number(api.actors.attribute(actor, "IQ")) || 10) - 5, label: F("ImproviseRoll", { clock: name }), skill: IMPROVISED_TIME_FUZE.skill, tags: ["ordnance", "fuze"] } as any);
        if (!outcome) return;
        if (outcome.success) await api.combat.setWeaponState(item, MODULE_ID, { eeImprovisedFuze: true });
        await say(actor, name, [F(outcome.success ? "ImprovisedMade" : "ImprovisedFailed", { clock: name })]);
      })();
    },
  } as any);

  // A time fuze runs out: counted at the start of each turn, a round a second (HT:EE p. 48).
  Hooks.on(api.combat.hooks.turnStart, async (combat: any) => {
    if (!on() || !isActiveGm()) return;
    const actors = [...(combat?.combatants ?? [])].map((c: any) => c?.actor).filter((a: any, i: number, all: any[]) => a && all.indexOf(a) === i);
    for (const actor of actors) {
      for (const item of [...(actor.items ?? [])]) {
        const fuze = fittedFuze(api, item);
        if (fuze?.kind !== "time" || !timeFuzeFires(secondsSince(fuze.set, clockNow(actor)), fuze.setting)) continue;
        await goOff(actor, item, F("TimeUp", { name: nameOf(item), seconds: fuze.setting }));
      }
    }
  });

  // Something comes within a proximity fuze's set distance of the token holding it (HT:EE p. 48).
  Hooks.on("updateToken", (moved: any, changes: any) => {
    if (!on() || !isActiveGm() || !changes || (changes.x === undefined && changes.y === undefined)) return;
    const tokens: any[] = [...(moved?.parent?.tokens ?? [])];
    const fired = new Set<any>();
    for (const holder of tokens) {
      const actor = holder?.actor;
      if (!actor) continue;
      // The token moved near a fuze, or the fuze's token moved near someone.
      const others = holder.id === moved.id ? tokens.filter((t) => t.id !== holder.id && t.actor !== actor) : moved.actor === actor ? [] : [moved];
      for (const item of [...(actor.items ?? [])]) {
        const fuze = fittedFuze(api, item);
        if (fuze?.kind !== "proximity" || fired.has(item)) continue;
        const near = others.map((t) => ({ t, yards: yardsApart(t, holder) })).find(({ yards }) => proximityTriggers(yards, fuze.setting));
        if (!near) continue;
        fired.add(item);
        void goOff(actor, item, F("ProximityTriggered", { name: nameOf(item), who: String(near.t.name ?? ""), yards: near.yards }));
      }
    }
  });
}

// ── homing seekers (HT:EE p. 49; Campaigns pp. 412-413) ────────────────────

function readySeekers(api: GWorldApi, on: () => boolean): void {
  // The Basic Set's lock-on and the missile's own skill on a homing row that doesn't say them.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !homingWeapon(context?.item)) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged" || !homes(entry.row ?? entry.mode)) continue;
      const row = entry.row;
      if (!String(row.aimingSkill ?? "").trim()) row.aimingSkill = HOMING_AIMING_SKILL;
      if (!(Number(row.guidedSkillLevel) > 0)) row.guidedSkillLevel = HOMING_SKILL;
      const seeker = seekersOf(nameOf(context.item))[0];
      row.notes?.push?.({ label: F("HomingNote", { skill: row.guidedSkillLevel }), hint: seeker ? F("SeekerHint", { seeker: L(`Seekers.${seeker}`) }) : L("HomingHint") });
    }
  });

  // What the seeker homes on (HT:EE p. 49).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: SEEKER_OPTION,
    label: L("Seeker"),
    attack: "ranged",
    input: {
      type: "select",
      choices: (() => {
        const all = SEEKER_CHOICES.map((c) => ({ value: c, label: L(`Seekers.${c}`) }));
        return [{ value: "", label: L("Seekers.none") }, ...all];
      })(),
    },
    available: (context: any) => on() && homingWeapon(context?.item),
    apply: (context: any, value: unknown) => {
      const choice = seekerChoice(value) ?? seekersOf(nameOf(context?.item))[0] ?? null;
      const line = choice ? seekerModifier(choice) : null;
      return line ? { modifiers: [{ label: L(`Lines.${line.key}`), value: line.value, key: line.key }] } : null;
    },
  } as any);

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!on() || !context?.ranged || context.mode?.derived || !item) return;
    const mode = item.system?.rangedModes?.[Number(context.mode?.index) || 0];
    if (!homes(mode)) return;

    // Locked on: the missile adds its Acc (Campaigns p. 413; HT:EE p. 49). The attack is only
    // rolled once the lock-on roll succeeds, so its Acc is in whether or not the Aim box was ticked.
    const modifiers: any[] = context.modifiers ?? [];
    const acc = Math.floor(Number(mode.accuracy) || 0);
    if (acc > 0 && !modifiers.some((m) => m?.key === "accuracy")) modifiers.push({ label: F("LockOn", { acc }), value: acc, key: "accuracy" });

    const choice = chosenSeeker(item, context.options);
    if (!choice) return;
    const seeker = seekerOf(choice);
    // The seeker is what looks, so what blinds its sense applies (Campaigns p. 412).
    if (Array.isArray(context.tags)) context.tags.push(...seekerTags(seeker).filter((t) => !context.tags.includes(t)));

    // A laser seeker follows the spot someone holds on the target (HT:EE p. 49; Campaigns p. 412).
    if (seeker === "laser" && !context.refusal) {
      const target = (context.targetTokens ?? [])[0];
      const uuid = String(target?.uuid ?? "");
      const people = [context.actor, ...sceneActors()].filter((a, i, all) => a && all.indexOf(a) === i);
      if (!designatedBy(api, uuid, people)) context.refusal = L("NotDesignated");
    }
  });

  // Holding a laser designator on the target: continued Aim and a DX-based Forward Observer roll (Campaigns p. 412; HT:EE p. 49).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-designate",
    itemTypes: ["equipment"],
    label: L("Designate"),
    icon: "fa-solid fa-crosshairs",
    visible: (item: any) => on() && isDesignator(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const targets = targetedTokens();
        if (targets.length !== 1) return void ui.notifications?.warn(L("OneTarget"));
        const uuid = String(targets[0]?.document?.uuid ?? targets[0]?.uuid ?? "");
        if (actor?.system?.maneuver !== "aim" || !(Number(actor.system?.aim?.turns) > 0) || String(actor.system?.aim?.target ?? "") !== uuid) {
          return void ui.notifications?.warn(L("AimFirst"));
        }
        const level = api.actors.skillLevel(actor, DESIGNATOR_SKILL);
        const base = dxBased(typeof level === "number" ? level : null, Number(api.actors.attribute(actor, "IQ")) || 10, Number(api.actors.attribute(actor, "DX")) || 10);
        const target = String(targets[0]?.name ?? "");
        const outcome: any = await api.roll.success({ actor, base, label: F("DesignateRoll", { target }), skill: DESIGNATOR_SKILL, tags: ["designation"] } as any);
        if (!outcome) return;
        await api.combat.setWeaponState(item, MODULE_ID, { eeDesignating: outcome.success ? uuid : "" });
        await say(actor, nameOf(item), [F(outcome.success ? "Designated" : "LostSpot", { name: String(actor.name ?? ""), target })]);
      })();
    },
  } as any);
}
