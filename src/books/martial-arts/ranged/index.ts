/**
 * Ranged attack options at the table (GURPS Martial Arts pp. 97, 119-121).
 *
 * Quick-shooting is a button on a bow's row: the optional Fast-Draw and the
 * readying roll, then the bow loaded and its next shot this turn at the same
 * penalty. A handful of small thrown weapons is a derived attack mode fired as
 * rapid fire. Prediction shots are an attack option on ranged attacks, and
 * ranged rows get the Feint button, the feint taking the shot's range and the
 * target's size. Rapid Strike with thrown weapons lives with the other
 * Rapid Strike rules in `multiple-attacks`; the hand a thrower uses is an
 * option here.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  DECEPTIVE_MINIMUM,
  handfulCount,
  handfulProfile,
  heroicArcherAim,
  isSharp,
  predictionShot,
  quickDrawPenalty,
  quickShootDraw,
  quickShootManeuver,
  quickShootPenalty,
  readyInHand,
  scaledRange,
  throwingHandPenalty,
  type ThrowingHand,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Ranged.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Ranged.${key}`, data);

const PREDICTION = "ma-prediction-shot";
const HAND = "ma-throwing-hand";
/** A quick-shot readied this turn: the weapon, its mode and the penalty its shot takes. */
const QUICK = "ma-quick-shot";

interface QuickState { itemId: string; modeIndex: number; penalty: number }

const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((item: any) => item.type === "trait").map((item: any) => String(item.name ?? "").toLowerCase());
const heroicArcher = (actor: any) => traitNames(actor).some((name) => name.startsWith("heroic archer"));
/** A Weapon Master whose weapons take in this skill's. */
const weaponMasterOf = (actor: any, skill: string) => {
  const wanted = skill.toLowerCase().replace(/\s*\(.*\)$/, "");
  return traitNames(actor).some((name) => name.startsWith("weapon master") && (/\b(all|ranged|missile|muscle-powered)\b/.test(name) || name.includes(wanted)));
};

/** A weapon's thrown modes, by index. */
export function thrownModes(item: any): number[] {
  return ((item?.system?.rangedModes ?? []) as any[]).map((mode, index) => (/^t/i.test(String(mode?.shots ?? "").trim()) ? index : -1)).filter((index) => index >= 0);
}

/** The first mode that can be quick-shot, or -1. */
const quickMode = (item: any): number => ((item?.system?.rangedModes ?? []) as any[]).findIndex((mode) => quickShootDraw(mode) !== null);

/** Yards between the actor's token and the one it targets, or null where the map can't say. */
function yardsToTarget(actor: any): { yards: number; target: any } | null {
  const targets = [...((game as any).user?.targets ?? [])];
  const shooter = actor?.getActiveTokens?.()?.[0];
  const target = targets.length === 1 ? targets[0] : null;
  const stage = (globalThis as any).canvas;
  if (!target?.center || !shooter?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([shooter.center, target.center])?.distance);
  return Number.isFinite(distance) ? { yards: Math.round(distance), target } : null;
}

/** Registers the options, the row button, the handful modes and the hooks. */
export function readyRangedOptions(api: GWorldApi, on: () => boolean, cinematic: () => boolean): void {
  // A realistic game's quick-shooting in combat is at an extra -4 (p. 120).
  const underFire = () => !cinematic() && Boolean((game as any).combat?.started);

  // ── quick-shooting bows (pp. 119-120) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-quick-shoot",
    itemTypes: ["equipment"],
    label: L("QuickShoot"),
    icon: "fa-solid fa-bullseye",
    visible: (item, actor) => on() && quickMode(item) >= 0
      && quickShootManeuver(String(actor?.system?.maneuver ?? ""), String(actor?.system?.allOutAttackOption ?? "determined"), heroicArcher(actor)),
    run: (item, actor) => quickShoot(api, item, actor, underFire()),
  });
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || context.rollType !== "attack") return;
    const quick = api.combat.getCombatState(context.actor, MODULE_ID, QUICK) as QuickState | undefined;
    if (quick && quick.itemId === context.item?.id && (context.mode?.index ?? quick.modeIndex) === quick.modeIndex) {
      context.modifiers.push({ label: L("QuickShoot"), value: quick.penalty });
      void api.combat.clearCombatState(context.actor, MODULE_ID, QUICK);
    }
  });

  // ── prediction shots (p. 121) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: PREDICTION,
    label: L("Prediction"),
    attack: "ranged",
    input: { type: "number", min: 0, max: 9 },
    available: () => on(),
    apply: (_context, value) => {
      const shot = predictionShot(Number(value));
      if (!shot.toHit) return null;
      return {
        modifiers: [{ label: L("Prediction"), value: shot.toHit }],
        defenseModifiers: [{ label: L("Prediction"), value: shot.dodge, defenses: ["dodge"] }],
      };
    },
  });
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || context.rollType !== "attack") return;
    if (!(Math.floor(Number(context.options?.[`${MODULE_ID}.${PREDICTION}`]) || 0) >= 1)) return;
    const effective = (Number(context.dataset?.rollTarget) || 0) + (context.modifiers ?? []).reduce((sum: number, line: any) => sum + (Number(line?.value) || 0), 0);
    if (effective < DECEPTIVE_MINIMUM) context.refusal = F("PredictionTooLow", { skill: effective, minimum: DECEPTIVE_MINIMUM });
  });

  // ── ranged feints (p. 121) ──
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    for (const entry of context?.rows ?? []) if (entry.kind === "ranged") entry.row.feint = true;
  });
  Hooks.on(api.combat.hooks.feintModifiers, (context: any) => {
    if (!on() || !context?.ranged) return;
    const measured = yardsToTarget(context.actor);
    if (!measured) return;
    const row = ((api.actors.derived(context.actor)?.ranged ?? []) as any[]).find((r) => r.itemId === context.item?.id && r.modeIndex === context.mode?.index);
    const reach = Number(row?.maxRange) || 0;
    if (reach > 0 && measured.yards > reach) {
      context.refusal = F("FeintOutOfRange", { yards: measured.yards, range: reach });
      return;
    }
    const range = api.rules.speedRangeModifier(measured.yards);
    if (range) context.modifiers.push({ label: F("FeintRange", { yards: measured.yards }), value: range });
    const size = Number(context.foe?.system?.sm) || 0;
    if (size) context.modifiers.push({ label: L("TargetSize"), value: size });
  });

  // ── a Heroic Archer's aim (p. 97) ──
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || context.rollType !== "attack" || !heroicArcher(context.actor)) return;
    if (!/^bow\b/i.test(String(context.dataset?.rollSkill ?? "")) || context.actor?.system?.maneuver !== "aim") return;
    const bonus = heroicArcherAim(Number(context.actor.system?.aim?.turns) || 0);
    if (bonus) context.modifiers.push({ label: L("HeroicArcherAim"), value: bonus });
  });

  // ── which hand throws (p. 121) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: HAND,
    label: L("Hand"),
    attack: "ranged",
    input: { type: "select", choices: (["one", "master", "off"] as ThrowingHand[]).map((value) => ({ value, label: L(`Hands.${value}`) })) },
    available: (context) => on() && thrownModes(context.item).length > 0,
    apply: (_context, value) => {
      const penalty = throwingHandPenalty((["one", "master", "off"].includes(String(value)) ? value : "one") as ThrowingHand);
      return penalty ? { modifiers: [{ label: L(`Hands.${String(value)}`), value: penalty }] } : null;
    },
  });

  // A thrown Rapid Strike of more weapons than one hand holds ready: the rest are readied as it goes (p. 121).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || context.rollType !== "attack" || context.dataset?.thrown !== "1" || context.mode?.derived) return;
    const declared = Math.floor(Number(context.options?.[`${MODULE_ID}.ma-rapid-strike`]) || 0);
    const ready = readyInHand(Number(context.item?.system?.weight) || 0);
    if (declared > ready) ui.notifications?.info(F("ReadyInHand", { ready, attacks: declared }));
  });

  // ── rapid fire with thrown weapons (p. 120) ──
  const handful = (item: any, actor: any, helpers: any, many: boolean): Record<string, unknown> | null => {
    const index = thrownModes(item)[0];
    const row = index === undefined ? null : helpers.rows?.(item)?.ranged?.find((r: any) => r.modeIndex === index);
    if (!row) return null;
    const most = handfulCount({
      basicLift: Number(helpers.basicLift) || 0,
      weight: Number(item.system?.weight) || 0,
      sharp: isSharp(String(row.damageType ?? "")),
      cinematic: cinematic(),
      quantity: Number(item.system?.quantity) || 0,
    });
    const count = many ? most : Math.min(4, most);
    if (count < 2 || (many && most <= 4)) return null;
    const profile = handfulProfile(count);
    const parsed = api.rules.parseDiceAdds(String(row.damage ?? ""));
    const damage = parsed ? api.rules.formatDiceAdds({ ...parsed, adds: parsed.adds + profile.perDie * parsed.dice }) : String(row.damage ?? "");
    const throwing = helpers.skillLevel("Throwing");
    const art = helpers.skillLevel("Throwing Art");
    const useArt = art !== null && (throwing === null || art > throwing);
    const half = scaledRange(Number(row.halfDamageRange), profile.rangeFactor);
    const max = scaledRange(Number(row.maxRange), profile.rangeFactor);
    return {
      mode: F("Handful", { count }),
      skillName: useArt ? "Throwing Art" : "Throwing",
      skillLevel: (useArt ? art : throwing) ?? 0,
      damage,
      damageType: row.damageType,
      armorDivisor: row.armorDivisor ?? 1,
      damageRollable: parsed !== null,
      accuracy: profile.accuracy,
      rateOfFire: count,
      shots: String(count),
      recoil: profile.recoil,
      bulk: profile.bulk,
      halfDamageRange: half,
      maxRange: max,
      range: half ? `${half} / ${max}` : String(max),
      thrown: true,
      weight: row.weight ?? item.system?.weight ?? 0,
      material: row.material ?? "",
      feint: false,
    };
  };
  const smallThrown = (item: any) => on() && thrownModes(item).length > 0 && (Number(item?.system?.weight) || 0) > 0 && (Number(item?.system?.weight) || 0) < 1 && (Number(item?.system?.quantity) || 0) >= 2;
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID, key: "ma-handful-few", label: L("HandfulLabel"), kind: "ranged",
    applies: smallThrown,
    mode: (item, actor, helpers) => handful(item, actor, helpers, false),
  });
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID, key: "ma-handful", label: L("HandfulLabel"), kind: "ranged",
    applies: smallThrown,
    mode: (item, actor, helpers) => handful(item, actor, helpers, true),
  });
}

/** The quick-shooting rolls: Fast-Draw if asked, then the readying roll, then the bow loaded for its shot. */
async function quickShoot(api: GWorldApi, item: any, actor: any, underFire: boolean): Promise<void> {
  const index = quickMode(item);
  const mode = item?.system?.rangedModes?.[index];
  const draw = mode ? quickShootDraw(mode) : null;
  if (!mode || !draw) return;
  const skill = String(mode.skill ?? "");
  const level = api.actors.skillLevel(actor, skill);
  if (level === null) return void ui.notifications?.warn(F("NoSkill", { skill }));

  const drawLevel = api.actors.skillLevel(actor, draw);
  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("QuickTitle", { weapon: String(item.name ?? "") }) },
    content: `<div class="gworld"><label style="display:flex;gap:8px;align-items:center">
      <input type="checkbox" name="fastDraw" ${drawLevel === null ? "disabled" : ""}>
      <span>${F("WithFastDraw", { skill: draw })}${drawLevel === null ? ` (${L("NotKnown")})` : ""}</span></label>
      ${underFire ? `<p class="hint">${L("UnderFireHint")}</p>` : ""}</div>`,
    ok: {
      label: L("QuickShoot"),
      callback: (_event: Event, button: HTMLElement) => ({ fastDraw: button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="fastDraw"]')?.checked === true }),
    },
    rejectClose: false,
  }) as { fastDraw: boolean } | null;
  if (!asked) return;

  const maneuver = String(actor.system?.maneuver ?? "");
  const shooter = { heroicArcher: heroicArcher(actor), weaponMaster: weaponMasterOf(actor, skill), realisticUnderFire: underFire };
  if (asked.fastDraw && drawLevel !== null) {
    const penalty = quickDrawPenalty(underFire);
    const drew: any = await api.roll.success({
      actor, base: drawLevel, label: draw, skill: draw,
      modifiers: penalty ? [{ label: L("UnderFire"), value: penalty }] : [],
    } as any);
    if (!drew) return;
    if (!drew.success) return void ui.notifications?.warn(L("ArrowDropped"));
  }

  const penalty = quickShootPenalty({ ...shooter, determined: maneuver === "allOutAttack" });
  const readied: any = await api.roll.success({
    actor, base: level, label: F("ReadyLabel", { weapon: String(item.name ?? "") }), skill,
    modifiers: [{ label: L("QuickShoot"), value: penalty }],
  } as any);
  if (!readied) return;
  if (readied.criticalFailure) return void ui.notifications?.warn(F("DroppedWeapon", { weapon: String(item.name ?? "") }));
  // Ready either way; only success shoots this turn (p. 119).
  await api.items.load(item, index, 1);
  if (!readied.success) return void ui.notifications?.warn(L("TooSlow"));
  // The shot takes the same penalty; All-Out Attack's +1 is already the system's on the attack.
  const shot = quickShootPenalty({ ...shooter, determined: false });
  await api.combat.setCombatState(actor, MODULE_ID, QUICK, { itemId: String(item.id), modeIndex: index, penalty: shot } satisfies QuickState, "turn");
  ui.notifications?.info(F("ShootNow", { weapon: String(item.name ?? ""), penalty: shot }));
}
