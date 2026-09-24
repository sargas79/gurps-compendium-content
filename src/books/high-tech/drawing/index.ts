/**
 * Drawing a gun, holsters and slings, and Who Draws First? with guns
 * (High-Tech pp. 81-82, 153-154, 249), registered with the system through
 * the add-on API under two switches. The rules themselves are in `rules.ts`;
 * the odd positions and the standoff are the shared engines' too, with this
 * book's table, so neither needs Martial Arts' switches.
 *
 *   - **Drawing guns:** a Combat tab section draws a gun per hand with
 *     Fast-Draw -- the off hand at -4, the odd positions, where the gun is
 *     carried, and its holster -- ends the turn's drawing on a failure and
 *     drops the gun (or both) on a critical failure. A gun keeps which of the
 *     character's holsters or slings it is in, whether it hangs on a lanyard,
 *     and whether it is in hand. The holster records take their effects by
 *     name: a Fast-Draw modifier, the Ready maneuvers a draw takes, a sleeve
 *     holster's own outcomes, a retention holster's +2 to Retain Weapon.
 *     Quick-Sheathe stows a gun as fast as Fast-Draw draws it.
 *   - **Who Draws First? with guns:** a GM tool settles a standoff between
 *     two gunfighters, with a hand on the gun, the worse Bulk, Combat Reflexes
 *     for the ready one, and the odd positions.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { CARRY_TABLES, carryModifierOf, carryOf, initCarry, readyCarry, situationModifiers, specialtyOf, type Carry, type Hand } from "../../../shared/readying/index.js";
import { whoDrawsFirst, type Fighter } from "../../../shared/standoff/index.js";
import { isFirearm } from "../firearms/index.js";
import {
  GUN_CARRIES,
  HOLSTERS,
  NO_DRAWS,
  drawReadies,
  drawRefusal,
  gunCarryModifier,
  gunDrawModifiers,
  gunReadyModifiers,
  gunSpecialty,
  holsterFits,
  holsterKindOf,
  holsterModifier,
  isLanyard,
  quickSheatheSpecialties,
  readiesAfterFastDraw,
  type GunDraws,
  type GunSide,
  type GunSpecialty,
  type HolsterKind,
} from "./rules.js";

const NS = "GCC.HT.Drawing";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "holster";
/** Guns drawn this turn, by hand, and whether a draw has failed. */
const DRAWS = "ht-draws";

export interface DrawingSwitches {
  drawing: () => boolean;
  standoff: () => boolean;
}

/** What this module keeps on a gun about how it is carried. */
export interface HolsterData {
  /** The id of the character's holster or sling the gun is in; blank for none. */
  item: string;
  /** A military holster's flap tucked behind the belt: no -2, and no protection (p. 154). */
  flapTucked: boolean;
  /** An early belt holster's loop over the hammer, which a Ready frees before Fast-Draw (p. 153). */
  hammerLoop: boolean;
  /** The gun is tied to a lanyard (p. 154). */
  lanyard: boolean;
}

/** Adds the gun's holster fields and registers this book's carry locations, before the world's items are read. */
export function initDrawing(switches: readonly string[]): void {
  initCarry();
  CARRY_TABLES.register({ book: "high-tech", rules: switches, carries: GUN_CARRIES, figures: gunCarryModifier, i18n: NS });
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      item: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      flapTucked: new f.BooleanField({ initial: false }),
      hammerLoop: new f.BooleanField({ initial: false }),
      lanyard: new f.BooleanField({ initial: false }),
    }),
  });
}

export function holsterData(item: any): HolsterData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return { item: String(d.item ?? ""), flapTucked: Boolean(d.flapTucked), hammerLoop: Boolean(d.hammerLoop), lanyard: Boolean(d.lanyard) };
}

/** The holster or sling a gun is in, as the character's item and its kind; null for none. */
export function holsterOf(gun: any): { item: any; kind: HolsterKind } | null {
  const id = holsterData(gun).item;
  const item = id ? gun?.actor?.items?.get?.(id) ?? gun?.parent?.items?.get?.(id) : null;
  const kind = item ? holsterKindOf(String(item.name ?? "")) : null;
  return item && kind ? { item, kind } : null;
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const bulkOf = (item: any) => Math.min(0, ...rangedModes(item).map((m: any) => Number(m.bulk) || 0));
const specialtyOfGun = (item: any): GunSpecialty => gunSpecialty(String(rangedModes(item)[0]?.skill ?? ""));
/** Where a gun is: its own place, else its holster's. */
const placeOf = (gun: any): Carry | null => carryOf(gun) ?? (holsterOf(gun) ? HOLSTERS[holsterOf(gun)!.kind].carry : null);

/** The gun's state: whether it is in hand, and whether its hammer loop is free. */
function gunState(api: GWorldApi, gun: any): { drawn: boolean; loopFree: boolean } {
  const state = api.combat.getWeaponState(gun, MODULE_ID) ?? {};
  return { drawn: state.drawn === true, loopFree: state.loopFree === true };
}

const gunsOf = (api: GWorldApi, actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.system?.carried !== false && isFirearm(api, i));

/** The character's Fast-Draw skill for a gun's specialty, by name. */
function fastDrawSkill(actor: any, specialty: GunSpecialty): string | null {
  const skill = [...(actor?.items ?? [])].find((i: any) => i.type === "skill" && /^fast-draw/i.test(String(i.name ?? "")) && specialtyOf(String(i.name)) === specialty);
  return skill ? String(skill.name) : null;
}

const traitNames = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));

/** The lines on a Fast-Draw of a gun: the odd positions, its place and its holster (pp. 81-82, 154). */
export function drawLines(actor: any, gun: any, hand: Hand, options: { grappled: boolean; upsideDown: boolean }): Array<{ label: string; value: number }> {
  const carry = placeOf(gun);
  const maneuver = String(actor?.system?.maneuver ?? "");
  const lines = situationModifiers({
    posture: String(actor?.system?.posture ?? "standing"),
    grappled: options.grappled,
    upsideDown: options.upsideDown,
    moving: maneuver === "move" || maneuver === "moveAndAttack",
    hand,
    carry,
  });
  const located = carry ? carryModifierOf(specialtyOfGun(gun), carry, { posture: String(actor?.system?.posture ?? "standing") }) : null;
  if (located) lines.push({ key: "carry", value: located });
  const holster = holsterOf(gun);
  const own = holster ? holsterModifier(holster.kind, holsterData(gun)) : 0;
  if (own) lines.push({ key: "holster", value: own });
  return lines.filter((l) => l.value).map((l) => ({ label: l.key === "holster" ? String(holster!.item.name) : L(`Line.${l.key}`), value: l.value }));
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Fast-Draws the guns picked: the master hand's first, then the off hand's (p. 81). */
async function drawGuns(api: GWorldApi, actor: any, form: HTMLElement): Promise<void> {
  const value = (selector: string) => form.querySelector<HTMLSelectElement>(selector)?.value ?? "";
  const checked = (selector: string) => form.querySelector<HTMLInputElement>(selector)?.checked ?? false;
  const picks = (["master", "off"] as const)
    .map((hand) => ({ hand, gun: actor.items.get(value(`[data-ht-draw-${hand}]`)) ?? null }))
    .filter((p): p is { hand: "master" | "off"; gun: any } => Boolean(p.gun));
  if (!picks.length) return void ui.notifications?.warn(L("PickGun"));
  if (picks.length === 2 && picks[0]!.gun.id === picks[1]!.gun.id) return void ui.notifications?.warn(L("SameGun"));
  let draws = (api.combat.getCombatState(actor, MODULE_ID, DRAWS) as GunDraws | undefined) ?? { ...NO_DRAWS };
  for (const { hand, gun } of picks) {
    const refusal = drawRefusal(draws, hand);
    if (refusal) return void ui.notifications?.warn(L(refusal === "failed" ? "TurnOver" : "HandUsed"));
    if (gunState(api, gun).drawn) return void ui.notifications?.warn(F("AlreadyDrawn", { gun: gun.name }));
    const holster = holsterOf(gun);
    if (holster?.kind === "belt" && holsterData(gun).hammerLoop && !gunState(api, gun).loopFree) return void ui.notifications?.warn(F("LoopFirst", { gun: gun.name }));
    if (!fastDrawSkill(actor, specialtyOfGun(gun))) return void ui.notifications?.warn(F("NoSkill", { gun: gun.name }));
  }
  const options = { grappled: checked("[data-ht-draw-grappled]"), upsideDown: checked("[data-ht-draw-upside]") };
  const drawn: any[] = [];
  for (const { hand, gun } of picks) {
    const specialty = specialtyOfGun(gun);
    const skill = fastDrawSkill(actor, specialty)!;
    const level = api.actors.skillLevel(actor, skill);
    if (level === null) return void ui.notifications?.warn(F("NoSkill", { gun: gun.name }));
    const outcome: any = await api.roll.success({ actor, base: level, label: `${skill} (${gun.name})`, skill, modifiers: drawLines(actor, gun, hand, options) } as any);
    if (!outcome) return;
    draws = { ...draws, [hand]: draws[hand] + 1 };
    const holster = holsterOf(gun);
    if (outcome.success) {
      await api.combat.setWeaponState(gun, MODULE_ID, { drawn: true });
      drawn.push(gun);
      const left = readiesAfterFastDraw(drawReadies(specialty, placeOf(gun), holster?.kind ?? null));
      await say(actor, `${skill} (${gun.name})`, [left ? F("DrawnAfter", { gun: gun.name, readies: left }) : F("DrawnFree", { gun: gun.name })]);
      continue;
    }
    // Any failure ends the turn's drawing; a critical one drops the gun, or both of them.
    draws.failed = true;
    await api.combat.setCombatState(actor, MODULE_ID, DRAWS, draws, "turn");
    const lines: string[] = [];
    if (holster?.kind === "sleeve") {
      // A sleeve holster fails to deliver the gun, or breaks (p. 154).
      lines.push(outcome.criticalFailure ? L("SleeveBroken") : L("SleeveFailed"));
    } else if (outcome.criticalFailure) {
      const dropped = picks.length > 1 ? picks.map((p) => p.gun) : [gun];
      for (const g of dropped) await api.combat.setWeaponState(g, MODULE_ID, { drawn: false });
      lines.push(F(dropped.length > 1 ? "DroppedBoth" : "Dropped", { gun: dropped.map((g) => g.name).join(", ") }));
      for (const g of dropped) if (holsterData(g).lanyard) lines.push(F("OnLanyard", { gun: g.name }));
    } else lines.push(L("TurnOver"));
    await say(actor, `${skill} (${gun.name})`, lines);
    return;
  }
  await api.combat.setCombatState(actor, MODULE_ID, DRAWS, draws, "turn");
}

/** Holsters or slings a gun: a Ready (two or three for a slung long arm), or a Quick-Sheathe roll (pp. 153, 249). */
async function stowGun(api: GWorldApi, actor: any, gun: any): Promise<void> {
  const specialty = specialtyOfGun(gun);
  const holster = holsterOf(gun);
  const readies = drawReadies(specialty, placeOf(gun), holster?.kind ?? null);
  const skill = fastDrawSkill(actor, specialty);
  const quick = quickSheatheSpecialties(traitNames(actor)).includes(specialty);
  const level = skill ? api.actors.skillLevel(actor, skill) : null;
  if (quick && skill && level !== null) {
    const outcome: any = await api.roll.success({ actor, base: level, label: F("QuickSheatheLabel", { gun: gun.name }), skill, modifiers: drawLines(actor, gun, "master", { grappled: false, upsideDown: false }) } as any);
    if (!outcome) return;
    const left = outcome.success ? readiesAfterFastDraw(readies) : readies;
    await api.combat.setWeaponState(gun, MODULE_ID, { drawn: false, loopFree: false });
    await say(actor, F("QuickSheatheLabel", { gun: gun.name }), [left ? F("StowedAfter", { gun: gun.name, readies: left }) : F("StowedFree", { gun: gun.name })]);
    return;
  }
  await api.combat.setWeaponState(gun, MODULE_ID, { drawn: false, loopFree: false });
  ui.notifications?.info(F("StowedAfter", { gun: gun.name, readies }));
}

/** Retrieves a dropped gun on its lanyard: a DX roll, one Ready per attempt (p. 154). */
async function retrieveGun(api: GWorldApi, actor: any, gun: any): Promise<void> {
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const outcome: any = await api.roll.success({ actor, base: dx, label: F("RetrieveLabel", { gun: gun.name }), kind: "attribute" } as any);
  if (outcome?.success) await api.combat.setWeaponState(gun, MODULE_ID, { drawn: true });
}

/** The Combat tab section's data. */
function sectionContext(api: GWorldApi, actor: any): Record<string, unknown> {
  const draws = (api.combat.getCombatState(actor, MODULE_ID, DRAWS) as GunDraws | undefined) ?? NO_DRAWS;
  const guns = gunsOf(api, actor).map((gun: any) => {
    const holster = holsterOf(gun);
    const data = holsterData(gun);
    const place = placeOf(gun);
    const specialty = specialtyOfGun(gun);
    const state = gunState(api, gun);
    const modifier = drawLines(actor, gun, "master", { grappled: false, upsideDown: false }).reduce((s, l) => s + l.value, 0);
    return {
      id: gun.id,
      name: gun.name,
      holster: holster ? String(holster.item.name) : "",
      place: place ? L(`Carries.${place}`) : "",
      modifier: modifier > 0 ? `+${modifier}` : String(modifier),
      readies: drawReadies(specialty, place, holster?.kind ?? null),
      drawn: state.drawn,
      loop: holster?.kind === "belt" && data.hammerLoop && !state.loopFree && !state.drawn,
      lanyard: data.lanyard,
    };
  });
  return { guns, draws, failed: draws.failed };
}

/** The item sheet section: a gun's holster, flap, loop and lanyard; a holster record's effect. */
function itemContext(api: GWorldApi, item: any): Record<string, unknown> {
  const kind = holsterKindOf(String(item?.name ?? ""));
  if (kind) {
    const h = HOLSTERS[kind];
    const lines = [F("HolsterFor", { specialty: L(`Specialty.${h.specialty}`) })];
    if (h.fastDraw) lines.push(F("HolsterFastDraw", { value: h.fastDraw > 0 ? `+${h.fastDraw}` : h.fastDraw, specialty: L(`Specialty.${h.specialty}`) }));
    if (h.carry) lines.push(F("HolsterPlace", { place: L(`Carries.${h.carry}`) }));
    lines.push(L(`Holsters.${kind}`));
    return { holsterRecord: { lines } };
  }
  if (isLanyard(String(item?.name ?? ""))) return { holsterRecord: { lines: [L("LanyardRecord")] } };
  const actor = item?.actor ?? item?.parent ?? null;
  const data = holsterData(item);
  const holster = holsterOf(item);
  const bulk = bulkOf(item);
  const holsters = [...(actor?.items ?? [])]
    .filter((i: any) => holsterKindOf(String(i.name ?? "")))
    .map((i: any) => ({ value: i.id, label: i.name, selected: i.id === data.item, disabled: !holsterFits(holsterKindOf(String(i.name))!, bulk) }));
  return {
    gun: {
      owned: Boolean(actor),
      holsters,
      data,
      military: holster?.kind === "military",
      belt: holster?.kind === "belt",
      readies: F("Readies", { readies: drawReadies(specialtyOfGun(item), placeOf(item), holster?.kind ?? null) }),
    },
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-holster]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.htHolster);
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void (await item.update({ [`${path}.${key}`]: input.checked }));
      const chosen = input.value ? (item.actor ?? item.parent)?.items?.get?.(input.value) : null;
      const kind = chosen ? holsterKindOf(String(chosen.name ?? "")) : null;
      if (kind && !holsterFits(kind, bulkOf(item))) {
        ui.notifications?.warn(F("TooBulky", { holster: chosen.name }));
        input.value = holsterData(item).item;
        return;
      }
      await item.update({ [`${path}.item`]: input.value });
    });
  });
}

export function readyDrawing(api: GWorldApi, on: DrawingSwitches): void {
  readyCarry(api);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-drawing-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-drawing-item.hbs`,
    visible: (item) => (on.drawing() || on.standoff()) && item?.type === "equipment"
      && (isFirearm(api, item) || holsterKindOf(String(item.name ?? "")) !== null || isLanyard(String(item.name ?? ""))),
    context: (item) => itemContext(api, item),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-drawing",
    sheet: "character",
    tab: "combat",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ht-drawing.hbs`,
    visible: (actor) => on.drawing() && gunsOf(api, actor).length > 0,
    context: (actor) => sectionContext(api, actor),
    listeners: (element, actor) => {
      element.querySelector("[data-ht-draw]")?.addEventListener("click", () => void drawGuns(api, actor, element));
      element.querySelectorAll<HTMLElement>("[data-ht-gun]").forEach((row) => {
        const gun = actor.items.get(String(row.dataset.htGun));
        if (!gun) return;
        row.querySelector("[data-ht-stow]")?.addEventListener("click", () => void stowGun(api, actor, gun));
        row.querySelector("[data-ht-retrieve]")?.addEventListener("click", () => void retrieveGun(api, actor, gun));
        row.querySelector("[data-ht-loop]")?.addEventListener("click", () => {
          void api.combat.setWeaponState(gun, MODULE_ID, { loopFree: true });
          ui.notifications?.info(F("LoopFreed", { gun: gun.name }));
        });
        row.querySelector<HTMLInputElement>("[data-ht-in-hand]")?.addEventListener("change", (event) => {
          void api.combat.setWeaponState(gun, MODULE_ID, { drawn: (event.currentTarget as HTMLInputElement).checked });
        });
      });
    },
  });

  // A retention holster: +2 to Retain Weapon while the gun is in it (p. 154):
  // the gun the roll names (a contest side's item, API 1.136.0), or else any
  // of the specialty's.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.drawing() || !/^retain weapon/i.test(String(context?.skill ?? ""))) return;
    const wanted = specialtyOf(String(context.skill));
    const inRetention = (gun: any) => {
      const holster = holsterOf(gun);
      return Boolean(holster) && HOLSTERS[holster!.kind].retain !== 0 && !gunState(api, gun).drawn;
    };
    const named = context.item && isFirearm(api, context.item) ? context.item : null;
    const kept = named
      ? (inRetention(named) ? named : null)
      : gunsOf(api, context.actor).find((gun: any) => inRetention(gun) && (!wanted || !["pistol", "longarm"].includes(wanted) || wanted === specialtyOfGun(gun)));
    if (kept) context.modifiers.push({ label: String(holsterOf(kept)!.item.name), value: HOLSTERS[holsterOf(kept)!.kind].retain });
  });

  // ── Who Draws First? with guns (p. 82) ──
  const rows = (actor: any): any[] => ((api.actors.derived(actor)?.ranged ?? []) as any[])
    .filter((r) => typeof r.skillLevel === "number" && r.usable !== false && isFirearm(api, actor?.items?.get?.(r.itemId)));
  const combatReflexes = (actor: any) => traitNames(actor).some((n) => /^combat reflexes/i.test(n));
  const oddPositions = (s: Fighter<GunSide>) => {
    const gun = s.row?.itemId ? s.actor.items?.get?.(s.row.itemId) : null;
    if (!gun) return [];
    const grapple = api.combat.grapple(s.actor);
    return drawLines(s.actor, gun, "master", { grappled: Boolean(grapple) && !grapple?.holding, upsideDown: false });
  };
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-who-draws-first",
    label: L("Standoff.Draw.Title"),
    icon: "fa-solid fa-gun",
    visible: on.standoff,
    open: () => whoDrawsFirst<GunSide>(api, {
      i18n: `${NS}.Standoff`,
      rows,
      checks: [{ name: "hand", line: "handOnWeapon" }],
      side: (_actor, row, checked) => ({ handOnWeapon: checked.hand === true, bulk: Number(row?.bulk) || 0 }),
      drawLines: (self, foe) => gunDrawModifiers(self.side, foe.side),
      readyLines: (self) => gunReadyModifiers(combatReflexes(self.actor)),
      oddPositions,
    }),
  });
}
