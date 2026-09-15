/**
 * Readying weapons at the table (GURPS Martial Arts pp. 101-104).
 *
 * A section on the Combat tab makes the rolls: Fast-Draw with its multiple
 * draw and position modifiers, a Ready that changes grip, a rapid grip change,
 * and quick-readying a weapon nearby. A weapon's grip is kept as this module's
 * weapon state, and where it is carried as its item data.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  CARRIES,
  GRIPS,
  QUICK_SOURCES,
  afterDraw,
  carryModifier,
  multipleDrawPenalty,
  rapidGripPenalty,
  situationModifiers,
  specialtyOf,
  type Carry,
  type DrawCounts,
  type Grip,
  type Hand,
  type QuickSource,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Readying.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Readying.${key}`, data);

/** Draws this turn, by hand. */
const DRAWS = "ma-draws";

/** Adds where a weapon is carried before the world's items are read. */
export function initReadying(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { carry: new f.StringField({ required: true, blank: true, initial: "" }) });
}

/** A weapon's grip, as this module keeps it. */
export function gripOf(api: GWorldApi, item: any): Grip {
  const grip = api.combat.getWeaponState(item, MODULE_ID)?.grip;
  return GRIPS.includes(grip as Grip) ? (grip as Grip) : "regular";
}

function carryOf(item: any): Carry | null {
  const value = item?.system?.extensions?.[MODULE_ID]?.carry;
  return CARRIES.includes(value as Carry) ? (value as Carry) : null;
}

const weaponsOf = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "equipment" && ((i.system?.meleeModes ?? []).length || (i.system?.rangedModes ?? []).length));

/** How many of Heroic Archer and Weapon Master the fighter has: each halves the multiple-draw penalty. */
function halvings(actor: any): number {
  const names = [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? "").toLowerCase());
  return (names.some((n) => n.startsWith("heroic archer")) ? 1 : 0) + (names.some((n) => n.startsWith("weapon master")) ? 1 : 0);
}

async function fastDraw(api: GWorldApi, actor: any, form: HTMLElement): Promise<void> {
  const value = (selector: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";
  const checked = (selector: string) => form.querySelector<HTMLInputElement>(selector)?.checked ?? false;
  const skill = value("[data-ma-draw-skill]");
  const level = api.actors.skillLevel(actor, skill);
  if (!skill || level === null) {
    ui.notifications?.warn(L("NoFastDraw"));
    return;
  }
  const weapon = actor.items.get(value("[data-ma-draw-weapon]")) ?? null;
  const hand = (["master", "off", "both"].includes(value("[data-ma-draw-hand]")) ? value("[data-ma-draw-hand]") : "master") as Hand;
  const count = Math.max(1, Math.floor(Number(value("[data-ma-draw-count]")) || 1));
  const grip = (GRIPS.includes(value("[data-ma-draw-grip]") as Grip) ? value("[data-ma-draw-grip]") : "regular") as Grip;
  const counts = (api.combat.getCombatState(actor, MODULE_ID, DRAWS) as DrawCounts | undefined) ?? { master: 0, off: 0 };
  const maneuver = String(actor.system?.maneuver ?? "");
  const carry = carryOf(weapon);
  const lines = [
    { key: "multiple", value: multipleDrawPenalty(counts, hand, count, halvings(actor)) },
    ...situationModifiers({
      posture: String(actor.system?.posture ?? "standing"),
      grappled: checked("[data-ma-draw-grappled]"),
      upsideDown: checked("[data-ma-draw-upside]"),
      moving: maneuver === "move" || maneuver === "moveAndAttack",
      hand,
      carry,
    }),
  ];
  const located = carry ? carryModifier(specialtyOf(skill), carry, { reversedGrip: grip === "reversed", noScabbard: checked("[data-ma-draw-noscabbard]") }) : null;
  if (located) lines.push({ key: "carry", value: located });
  const outcome: any = await api.roll.success({
    actor,
    base: level,
    label: `${skill}${weapon ? ` (${weapon.name})` : ""}`,
    skill,
    modifiers: lines.filter((l) => l.value).map((l) => ({ label: L(`Line.${l.key}`), value: l.value })),
  } as any);
  if (!outcome) return;
  await api.combat.setCombatState(actor, MODULE_ID, DRAWS, afterDraw(counts, hand, count), "turn");
  if (!outcome.success) {
    ui.notifications?.warn(L(outcome.criticalFailure ? "DroppedAll" : "TurnOver"));
    return;
  }
  // Drawing into a Defensive Grip still needs its Ready (p. 102).
  if (weapon && grip === "reversed") await api.combat.setWeaponState(weapon, MODULE_ID, { grip });
  if (grip === "defensive" || grip === "halfSword") ui.notifications?.info(L("DefensiveNeedsReady"));
}

async function readyGrip(api: GWorldApi, actor: any, form: HTMLElement): Promise<void> {
  const weapon = actor.items.get(form.querySelector<HTMLSelectElement>("[data-ma-ready-weapon]")?.value ?? "");
  const grip = form.querySelector<HTMLSelectElement>("[data-ma-ready-grip]")?.value as Grip;
  if (!weapon || !GRIPS.includes(grip)) return;
  // One Ready draws, changes reach, hands and grip, and regains control (p. 102).
  await api.combat.setWeaponState(weapon, MODULE_ID, { grip });
  ui.notifications?.info(F("Readied", { weapon: String(weapon.name), grip: L(`Grips.${grip}`) }));
}

async function rapidGrip(api: GWorldApi, actor: any, form: HTMLElement): Promise<void> {
  const weapon = actor.items.get(form.querySelector<HTMLSelectElement>("[data-ma-ready-weapon]")?.value ?? "");
  const grip = form.querySelector<HTMLSelectElement>("[data-ma-ready-grip]")?.value as Grip;
  if (!weapon || !GRIPS.includes(grip)) return;
  const from = gripOf(api, weapon);
  if (grip === "defensive" || grip === "halfSword" || from === "defensive" || from === "halfSword" || grip === from) {
    ui.notifications?.warn(L("RapidOnlyReversed"));
    return;
  }
  const mode = (weapon.system?.meleeModes ?? [])[0];
  const skill = String(mode?.skill ?? "");
  const level = api.actors.skillLevel(actor, skill);
  if (level === null) return;
  const penalty = rapidGripPenalty({ twoHanded: Boolean(mode?.twoHanded), tonfa: /tonfa/i.test(skill) });
  const outcome: any = await api.roll.success({
    actor,
    base: level,
    label: F("RapidLabel", { weapon: String(weapon.name) }),
    skill,
    modifiers: penalty ? [{ label: L("Line.rapid"), value: penalty }] : [],
  } as any);
  if (!outcome) return;
  if (outcome.success) await api.combat.setWeaponState(weapon, MODULE_ID, { grip });
  else ui.notifications?.warn(L(outcome.criticalFailure ? "RapidCritical" : "RapidDropped"));
}

async function quickReady(api: GWorldApi, actor: any, form: HTMLElement): Promise<void> {
  const source = form.querySelector<HTMLSelectElement>("[data-ma-quick-source]")?.value as QuickSource;
  if (!(source in QUICK_SOURCES)) return;
  const skill = form.querySelector<HTMLSelectElement>("[data-ma-draw-skill]")?.value ?? "";
  const fastDrawLevel = skill ? api.actors.skillLevel(actor, skill) : null;
  const dx = api.actors.attribute(actor, "DX") ?? 10;
  const useSkill = fastDrawLevel !== null && fastDrawLevel > dx;
  const outcome: any = await api.roll.success({
    actor,
    base: useSkill ? fastDrawLevel : dx,
    label: L("Quick"),
    ...(useSkill ? { skill } : { kind: "attribute" }),
    modifiers: [{ label: L(`Sources.${source}`), value: QUICK_SOURCES[source] }],
  } as any);
  if (outcome && !outcome.success) ui.notifications?.warn(L(outcome.criticalFailure ? "QuickCritical" : "QuickFailed"));
}

/** Registers the sections. */
export function readyReadying(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-readying",
    sheet: "character",
    tab: "combat",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ma-readying.hbs`,
    visible: () => on(),
    context: (actor) => {
      const counts = (api.combat.getCombatState(actor, MODULE_ID, DRAWS) as DrawCounts | undefined) ?? { master: 0, off: 0 };
      return {
        skills: [...(actor?.items ?? [])].filter((i: any) => i.type === "skill" && /^fast-draw/i.test(String(i.name ?? ""))).map((i: any) => String(i.name)),
        weapons: weaponsOf(actor).map((w: any) => ({ id: w.id, name: w.name, grip: L(`Grips.${gripOf(api, w)}`) })),
        grips: GRIPS.map((g) => ({ value: g, label: L(`Grips.${g}`) })),
        sources: Object.keys(QUICK_SOURCES).map((s) => ({ value: s, label: L(`Sources.${s}`) })),
        counts,
      };
    },
    listeners: (element, actor) => {
      element.querySelector("[data-ma-draw]")?.addEventListener("click", () => void fastDraw(api, actor, element));
      element.querySelector("[data-ma-ready]")?.addEventListener("click", () => void readyGrip(api, actor, element));
      element.querySelector("[data-ma-rapid]")?.addEventListener("click", () => void rapidGrip(api, actor, element));
      element.querySelector("[data-ma-quick]")?.addEventListener("click", () => void quickReady(api, actor, element));
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-carry",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ma-carry.hbs`,
    visible: (item) => on() && item?.type === "equipment",
    context: (item) => ({ carries: CARRIES.map((c) => ({ value: c, label: L(`Carries.${c}`), selected: carryOf(item) === c })) }),
    listeners: (element, item) => {
      element.querySelector<HTMLSelectElement>("[data-ma-carry]")?.addEventListener("change", (event) => {
        void item.update({ [`system.extensions.${MODULE_ID}.carry`]: (event.currentTarget as HTMLSelectElement).value });
      });
    },
  });
}
