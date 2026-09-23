/**
 * High-Tech's shooting options and gun techniques (pp. 84-85, 249-252),
 * registered with the system through the add-on API under five switches.
 * The rules themselves are in `rules.ts`.
 *
 *   - **Pistolero:** a pistol held in the two-handed stance, toggled from its
 *     row: minimum ST times 0.8 (rounded up), Bulk a step better, and every
 *     aimed shot braced. The stance can't be fanned or thumbed.
 *   - **Precision Aiming:** after 6, 12, 24, 45 and 90 seconds of Aim with a
 *     braced, scoped gun, an IQ-based weapon skill roll at -6 (bought off by
 *     the technique) adds +1 to the aim, up to the lower of the scope's bonus
 *     and the gun's Acc; a failure loses the aim, a critical failure gives
 *     the sniper away.
 *   - **Ranged Rapid Strike:** two attacks in one second from a gun of RoF
 *     2+, each at -6 (bought off by Quick-Shot) and half the RoF, on Attack or
 *     All-Out Attack.
 *   - **Gun techniques:** Close-Quarters Battle on Move and Attack within
 *     Per yards; Targeted Attacks with guns, "TA (Pistol/Skull)", on the
 *     shared Targeted Attack engine with this book's table; Instant Arsenal
 *     Disarm from its technique's row.
 *   - **The expanded Gunslinger** (cinematic): Bulk ignored on Move and
 *     Attack and in close combat, and the default penalties of Fanning,
 *     Fast-Firing, Quick-Shot, Thumbing and Two-Handed Thumbing halved.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { accessoryBulk, fittedScopeBonus, type AccessorySwitches } from "../accessories/index.js";
import { isFirearm, techniqueRelative } from "../firearms/index.js";
import {
  GUNSLINGER_HALVES,
  INSTANT_ARSENAL_GRAB_PENALTY,
  PRECISION_PENALTY,
  RANGED_RAPID_STRIKE_PENALTY,
  RANGED_RAPID_STRIKE_ROF_SHARE,
  aimedWhereTaAims,
  closeQuartersLine,
  gunTargetedAttackLevel,
  gunslingerIgnoresBulk,
  halvedDefault,
  instantArsenalResult,
  isPistolSkill,
  nextPrecisionSecond,
  pistoleroBulk,
  pistoleroMinSt,
  precisionCap,
  precisionOutcome,
  precisionRollsDue,
  rangedRapidStrikeRefusal,
  readGunTargetedAttack,
  withinCloseQuarters,
  type GunTargetedAttack,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Shooting.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Shooting.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const RAPID = "ht-ranged-rapid-strike";
const RAPID_STATE = "ht-ranged-rapid-strike-state";
const TA_KIND = "ht-targeted-attack";
const PRECISION_KEY = "precisionAiming";
const DISASSEMBLED = `${MODULE_ID}.disassembled`;
const option = (key: string) => `${MODULE_ID}.${key}`;

export interface ShootingSwitches {
  pistolero: () => boolean;
  precisionAiming: () => boolean;
  rangedRapidStrike: () => boolean;
  gunTechniques: () => boolean;
  gunslinger: () => boolean;
}

interface RapidState { remaining: number; penalty: number }

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const modeOf = (item: any, index = 0): any => rangedModes(item)[index] ?? rangedModes(item)[0] ?? {};
const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
const picked = (value: unknown): number => Math.floor(Number(value) || 0);
const traitNamed = (actor: any, name: RegExp) => [...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && name.test(String(i.name ?? "")));
const techniques = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i?.type === "technique");

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Whether a pistol is held in the two-handed stance: kept on the gun, toggled from its row (p. 84). */
export function inPistoleroStance(api: GWorldApi, item: any): boolean {
  return (api.combat.getWeaponState(item, MODULE_ID) as any)?.pistolero === true;
}

const isPistol = (api: GWorldApi, item: any) => isFirearm(api, item) && rangedModes(item).some((m) => isPistolSkill(String(m?.skill ?? "")));

/**
 * A gun technique's penalty for a shooter who doesn't know it: halved with
 * the expanded Gunslinger (p. 249), or null to leave the book's figure.
 */
export function gunslingerDefault(on: ShootingSwitches, actor: any, name: string, penalty: number): number | null {
  if (!on.gunslinger() || !GUNSLINGER_HALVES.test(name) || !traitNamed(actor, /^gunslinger\b/i)) return null;
  return halvedDefault(penalty);
}

/** The character's attack row for a gun's mode. */
function rangedRow(api: GWorldApi, actor: any, item: any, modeIndex = 0): any {
  const rows: any[] = (api.actors.derived(actor) as any)?.ranged ?? [];
  return rows.find((r) => r?.itemId === item?.id && r?.modeIndex === modeIndex) ?? rows.find((r) => r?.itemId === item?.id) ?? null;
}

/** The weapon skill, IQ-based (p. 250; Characters p. 172): its level less its own attribute, plus IQ. */
function iqBasedSkill(api: GWorldApi, actor: any, skill: string): number | null {
  const level = api.actors.skillLevel(actor, skill);
  if (typeof level !== "number") return null;
  const own = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && lower(i.name) === lower(skill));
  const attribute = api.actors.attribute(actor, String(own?.system?.attribute ?? "DX") as never);
  const iq = api.actors.attribute(actor, "IQ" as never);
  if (typeof attribute !== "number" || typeof iq !== "number") return null;
  return api.rules.basedOnAnother(level, attribute, iq);
}

/** Asks for the GM's modifier for the conditions, or null when the dialog is closed. */
async function askModifier(title: string, label: string): Promise<number | null> {
  const value = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld"><label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(label)}</span><input type="number" name="modifier" value="0" step="1" style="width:90px"></label></div>`,
    ok: { label: game.i18n.localize("GWORLD.Chat.Roll"), callback: (_e: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="modifier"]')?.value ?? 0) },
    rejectClose: false,
  });
  return value === null || value === undefined ? null : Math.floor(Number(value) || 0);
}

/** The accessory switches, where the accessories are registered: a fitted scope counts for Precision Aiming, and the stance starts from their Bulk. */
let accessories: AccessorySwitches | null = null;

/** The scope a gun has for Precision Aiming: its own, or the best fitted one (pp. 84, 155-157). */
const scopeOf = (row: any, item: any): number => Math.max(Number(row?.scopeBonus) || 0, accessories ? fittedScopeBonus(item, accessories) : 0);

/** The +1s of precision the aim holds so far. */
const precisionClaimed = (actor: any): number => ((actor?.system?.aim?.bonuses ?? []) as any[])
  .filter((b) => b?.key === PRECISION_KEY).reduce((sum, b) => sum + (Number(b.value) || 0), 0);

/** Rolls for the next +1 of Precision Aiming (p. 84). */
export async function precisionAim(api: GWorldApi, item: any, actor: any): Promise<"gained" | "lost" | "spotted" | null> {
  const aim = actor?.system?.aim ?? {};
  const seconds = Math.floor(Number(aim.turns) || 0);
  const claimed = precisionClaimed(actor);
  if (String(actor?.system?.maneuver ?? "") !== "aim" || seconds < 1) {
    ui.notifications?.warn(L("PrecisionNotAiming"));
    return null;
  }
  const row = rangedRow(api, actor, item);
  const scope = scopeOf(row, item);
  const cap = precisionCap(Number(row?.accuracy) || 0, scope);
  if (!(scope > 0)) {
    ui.notifications?.warn(L("PrecisionNoScope"));
    return null;
  }
  if (!aim.braced && !inPistoleroStance(api, item)) {
    ui.notifications?.warn(L("PrecisionNotBraced"));
    return null;
  }
  if (claimed >= cap) {
    ui.notifications?.warn(F("PrecisionAtCap", { cap }));
    return null;
  }
  if (precisionRollsDue(seconds) <= claimed) {
    ui.notifications?.warn(F("PrecisionWait", { seconds: nextPrecisionSecond(claimed), aimed: seconds }));
    return null;
  }
  const skill = String(row?.skillName || modeOf(item).skill || "");
  const base = iqBasedSkill(api, actor, skill);
  if (base === null) {
    ui.notifications?.warn(F("PrecisionNoSkill", { skill }));
    return null;
  }
  const conditions = await askModifier(F("PrecisionTitle", { gun: String(item?.name ?? "") }), L("Conditions"));
  if (conditions === null) return null;
  const relative = techniqueRelative(api, actor, skill, /^precision aiming\b/i, PRECISION_PENALTY) ?? PRECISION_PENALTY;
  const use = (api.roll as any).equipmentUse?.(actor, item, skill);
  const modifiers = [
    { label: L(relative === PRECISION_PENALTY ? "PrecisionLine" : "PrecisionTechniqueLine"), value: relative },
    ...((use?.lines ?? []) as any[]).map((l) => ({ label: String(l.label), value: Number(l.value) || 0 })),
    ...(conditions ? [{ label: L("Conditions"), value: conditions }] : []),
  ].filter((m) => m.value !== 0);
  const outcome: any = await api.roll.success({ actor, base, label: F("PrecisionRoll", { skill, gun: String(item?.name ?? "") }), skill, modifiers } as any);
  if (!outcome) return null;
  const result = precisionOutcome(Boolean(outcome.success), Boolean(outcome.criticalFailure));
  const others = ((aim.bonuses ?? []) as any[]).filter((b) => b?.key !== PRECISION_KEY);
  if (result === "gained") {
    const bonus = claimed + 1;
    await actor.update({ "system.aim.bonuses": [...others, { label: L("PrecisionBonus"), value: bonus, key: PRECISION_KEY }] });
    await say(actor, String(item?.name ?? ""), [F("PrecisionGained", { bonus, cap, next: nextPrecisionSecond(bonus) ?? "-" })]);
  } else {
    // The aim itself is the system's to end; its bonuses are all lost, and the shooter starts over.
    await actor.update({ "system.aim.bonuses": others });
    await say(actor, String(item?.name ?? ""), [L("PrecisionLost"), ...(result === "spotted" ? [L("PrecisionSpotted")] : [])]);
  }
  return result;
}

/** The RoF an attack option context may be fired at: the gun's, or what fast-firing, fanning or thumbing chose. */
function rofFor(item: any, chosen: Record<string, unknown> | undefined): number {
  const own = Number(modeOf(item).rateOfFire) || 1;
  const faster = Math.max(picked(chosen?.[option("ht-fast-firing")]), picked(chosen?.[option("ht-fanning")]), chosen?.[option("ht-thumbing")] === true ? 2 : 0);
  return Math.max(own, faster);
}

/** The Rapid Strike's penalty for a shooter: Quick-Shot's level, the Gunslinger's halved default, or -6 (pp. 85, 249, 252). */
function rapidPenalty(api: GWorldApi, on: ShootingSwitches, actor: any, item: any): number {
  const skill = String(modeOf(item).skill ?? "");
  const known = techniqueRelative(api, actor, skill, /^quick-shot\b/i, RANGED_RAPID_STRIKE_PENALTY);
  return Math.min(0, known ?? gunslingerDefault(on, actor, "Quick-Shot", RANGED_RAPID_STRIKE_PENALTY) ?? RANGED_RAPID_STRIKE_PENALTY);
}

/** A gun TA technique's parts, from its name. */
const gunTa = (technique: any): GunTargetedAttack | null => readGunTargetedAttack(technique?.name);

export function readyShooting(api: GWorldApi, on: ShootingSwitches, fitted?: AccessorySwitches): void {
  accessories = fitted ?? null;
  const state = <T>(actor: any, key: string) => api.combat.getCombatState(actor, MODULE_ID, key) as T | undefined;

  // ── Pistolero (p. 84) ──

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-pistolero",
    itemTypes: ["equipment"],
    label: L("Stance"),
    icon: "fa-solid fa-hands",
    visible: (item) => on.pistolero() && isPistol(api, item),
    run: (item, actor) => {
      const now = !inPistoleroStance(api, item);
      void api.combat.setWeaponState(item, MODULE_ID, { pistolero: now }).then(() => say(actor, String(item?.name ?? ""), [L(now ? "StanceOn" : "StanceOff")]));
    },
  });

  // The stance's minimum ST, on the rows; the skill moves with what the shortfall costs.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!on.pistolero() || !isPistol(api, item) || !inPistoleroStance(api, item)) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged" || !isPistolSkill(String(entry.mode?.skill ?? ""))) continue;
      const row = entry.row;
      const was = typeof row.minSt === "number" ? row.minSt : null;
      const now = pistoleroMinSt(was);
      row.notes?.push?.({ label: L("StanceNote"), hint: L("StanceHint") });
      if (was === null || now === was) continue;
      row.minSt = now;
      // The actor readers aren't ready while rows are worked out, so the ST is read back from the shortfall.
      const before = Number(row.minStPenalty) || 0;
      if (before < 0) {
        const after = api.rules.minStPenalty(was + before, now);
        row.skillLevel = (Number(row.skillLevel) || 0) + (after - before);
        row.minStPenalty = after;
      }
    }
  });

  // ── Ranged Rapid Strike (p. 85) ──

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: RAPID,
    label: L("RapidStrike"),
    attack: "ranged",
    available: (context) => on.rangedRapidStrike() && isFirearm(api, context.item),
    refuse: (context) => {
      const reason = rangedRapidStrikeRefusal({ rateOfFire: rofFor(context.item, context.chosen), maneuver: String(context.maneuver ?? ""), spraying: false });
      return reason ? L(`RapidRefusal.${reason}`) : null;
    },
    apply: (context) => {
      const penalty = rapidPenalty(api, on, context.actor, context.item);
      return {
        modifiers: penalty ? [{ label: L("RapidStrikeLine"), value: penalty }] : [],
        rateOfFireMultiplier: RANGED_RAPID_STRIKE_ROF_SHARE,
        notes: [L("RapidStrikeNote")],
      };
    },
  });

  // The Rapid Strike's second attack counts towards the maneuver's.
  Hooks.on(api.combat.hooks.attackSequence, (context: any) => {
    if (on.rangedRapidStrike() && Number(context?.count) > 0 && state<RapidState>(context.actor, RAPID_STATE)) context.count = Number(context.count) + 1;
  });

  // ── the attack roll ──

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    if (!actor || context.rollType !== "attack" || !context.ranged || context.mode?.derived || !isFirearm(api, item)) return;
    const index = Number.isInteger(context.mode?.index) ? Number(context.mode.index) : 0;
    const mode = modeOf(item, index);
    const skill = String(context.dataset?.rollSkill || mode.skill || "");
    const lines: any[] = context.modifiers ?? [];
    const options = context.options ?? {};

    // The Rapid Strike: declared on the first attack, taken again on the second (p. 85).
    if (on.rangedRapidStrike()) {
      const declared = options[option(RAPID)] === true;
      const running = state<RapidState>(actor, RAPID_STATE);
      if (declared && context.spraying) {
        context.refusal = L("RapidRefusal.spraying");
        return;
      }
      // A finished one starts afresh: the turn's state is cleared at its end in combat, and never outside it.
      if (declared && !(running && running.remaining > 0)) {
        void api.combat.setCombatState(actor, MODULE_ID, RAPID_STATE, { remaining: 1, penalty: rapidPenalty(api, on, actor, item) } satisfies RapidState, "turn");
      } else if (declared && running) {
        void api.combat.setCombatState(actor, MODULE_ID, RAPID_STATE, { ...running, remaining: running.remaining - 1 }, "turn");
      } else if (running && running.remaining > 0) {
        context.refusal = L("RapidSecond");
        return;
      }
    }

    const bulk = lines.find((l) => l?.key === "bulk");
    const stance = on.pistolero() && isPistolSkill(String(mode.skill ?? "")) && inPistoleroStance(api, item);
    if (stance) {
      // Bulk a step better (p. 84).
      if (bulk && (bulk.situation === "moveAndAttack" || bulk.situation === "closeCombat")) {
        const aimed = lines.some((l) => l?.key === "accuracy");
        const own = accessories ? accessoryBulk(api, item, mode, aimed, accessories) : Number(mode.bulk) || 0;
        bulk.value = api.rules.bulkPenalty(pistoleroBulk(own), bulk.situation);
        bulk.label = F("StanceBulk", { label: bulk.label });
      }
      // Every aimed shot braced.
      if (lines.some((l) => l?.key === "accuracy") && !lines.some((l) => l?.key === "braced")) {
        lines.push({ label: L("StanceBraced"), value: api.rules.BRACED_BONUS ?? 1, key: "braced" });
      }
    }

    // The expanded Gunslinger: Bulk counts for nothing on Move and Attack and in close combat (p. 249).
    const gunslinger = on.gunslinger() && traitNamed(actor, /^gunslinger\b/i);
    if (gunslinger && bulk && gunslingerIgnoresBulk(String(bulk.situation ?? "")) && bulk.value) {
      bulk.value = 0;
      bulk.label = F("GunslingerBulk", { label: bulk.label });
    }

    if (on.gunTechniques()) {
      // Close-Quarters Battle: Move and Attack at no more than Per yards (pp. 250-251), redundant with the expanded Gunslinger.
      const moving = String(context.movement?.maneuver ?? actor.system?.maneuver ?? "") === "moveAndAttack";
      if (moving && bulk?.situation === "moveAndAttack" && !(gunslinger && !bulk.value)
        && withinCloseQuarters(context.rangeYards ?? null, api.actors.attribute(actor, "Per" as never))) {
        const relative = techniqueRelative(api, actor, skill, /^close-quarters battle\b/i, 0);
        const line = relative === null ? 0 : closeQuartersLine(relative, Number(bulk.value) || 0);
        if (line) lines.push({ label: L("CloseQuartersLine"), value: line });
      }

      // A Targeted Attack with a gun: the levels bought in it, for a shot aimed where it aims (p. 252).
      const shot = context.calledShot;
      if (shot?.hitLocation) {
        const own = techniques(actor).find((t: any) => {
          const ta = gunTa(t);
          return ta && aimedWhereTaAims(ta, skill, shot.hitLocation, shot.chink === true);
        });
        const ta = own ? gunTa(own) : null;
        if (ta) {
          const result = gunTargetedAttackLevel(ta, api.actors.skillLevel(actor, ta.skill), Number(own.system?.points) || 0);
          const bought = (result.level ?? 0) - (result.default ?? 0);
          if (bought) lines.push({ label: String(own.name), value: bought });
        }
      }
    }

    // Precision Aiming: never past the lower of the scope's bonus and the gun's Acc (p. 84).
    const precise = lines.filter((l) => l?.key === PRECISION_KEY);
    if (precise.length) {
      const accuracy = lines.find((l) => l?.key === "accuracy");
      const scope = Number(accuracy?.scope) || 0;
      const cap = on.precisionAiming() && accuracy ? precisionCap((Number(accuracy.value) || 0) - scope, scope) : 0;
      let left = cap;
      for (const line of precise) {
        const value = Math.max(0, Math.min(left, Number(line.value) || 0));
        left -= value;
        line.value = value;
      }
    }
  });

  // Fanning and thumbing can't be done in the two-handed stance (p. 84); checked on the roll, as the stance is on the gun.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.pistolero() || context?.rollType !== "attack" || !context.ranged || !isPistol(api, context.item) || !inPistoleroStance(api, context.item)) return;
    const options = context.options ?? {};
    if (picked(options[option("ht-fanning")]) || options[option("ht-thumbing")] === true) context.refusal = L("StanceNoFanning");
  });

  // ── Precision Aiming (p. 84) ──

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-precision-aiming",
    itemTypes: ["equipment"],
    label: L("Precision"),
    icon: "fa-solid fa-crosshairs",
    visible: (item, actor) => on.precisionAiming() && isFirearm(api, item) && String(actor?.system?.maneuver ?? "") === "aim"
      && precisionRollsDue(Number(actor?.system?.aim?.turns) || 0) > 0,
    run: (item, actor) => { void precisionAim(api, item, actor); },
  });

  // ── The expanded Gunslinger's halved defaults (p. 249) ──

  Hooks.on(api.combat.hooks.techniqueDefaults, (context: any) => {
    const name = String(context?.item?.name ?? "");
    if (!on.gunslinger() || !GUNSLINGER_HALVES.test(name) || !traitNamed(context?.actor, /^gunslinger\b/i) || !Array.isArray(context.defaults)) return;
    for (const entry of [...context.defaults]) {
      if (entry?.from !== "skill" || !(Number(entry.modifier) < 0)) continue;
      context.defaults.push({ ...entry, modifier: halvedDefault(Number(entry.modifier)) });
    }
  });

  // ── Targeted Attacks with guns (p. 252) ──

  api.data.registerTechniqueKind({
    module: MODULE_ID,
    key: TA_KIND,
    label: L("TargetedAttack"),
    available: on.gunTechniques,
    derive: (technique, _actor, helpers) => {
      const ta = gunTa(technique);
      if (!ta) return { ...(helpers.standard() ?? { level: null, levels: 0, cappedByPrerequisite: false }), notes: [L("TaName")] };
      const result = gunTargetedAttackLevel(ta, helpers.levelOf(ta.skill), Number(technique?.system?.points) || 0);
      if (result.level === null) return { level: null, notes: [F("TaNoSkill", { skill: ta.skill })] };
      return {
        level: result.level,
        levels: result.level - (result.default ?? result.level),
        cappedByPrerequisite: result.level === result.ceiling,
        notes: [F("TaNote", { default: result.default, ceiling: result.ceiling }), ...(ta.target === "weapon" ? [L("TaWeaponNote")] : [])],
      };
    },
  });

  // ── Instant Arsenal Disarm (p. 251) ──

  const contests = new Map<string, boolean>();
  Hooks.on(api.combat.hooks.afterQuickContest, (context: any) => {
    if (!(context?.tags ?? []).includes("instantArsenalDisarm")) return;
    contests.set(String(context.first?.actor?.uuid ?? ""), Boolean(context.first?.outcome?.criticalFailure));
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instant-arsenal-disarm",
    itemTypes: ["technique"],
    label: L("Iad"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.gunTechniques() && /^instant arsenal disarm\b/i.test(String(item?.name ?? "")),
    run: (item, actor) => { void instantArsenalDisarm(api, item, actor, contests); },
  });
}

const GRAPPLING = ["Judo", "Wrestling", "Sumo Wrestling"];

/** The best of the grappling skills, or DX. */
function bestGrapple(api: GWorldApi, actor: any): { name: string; level: number } {
  const levels = GRAPPLING.map((name) => ({ name, level: api.actors.skillLevel(actor, name) })).filter((s): s is { name: string; level: number } => typeof s.level === "number");
  const dx = api.actors.attribute(actor, "DX" as never);
  const best = levels.sort((a, b) => b.level - a.level)[0];
  return best && (typeof dx !== "number" || best.level >= dx) ? best : { name: "DX", level: typeof dx === "number" ? dx : 10 };
}

/** The foe's resistance: the better of DX and Retain Weapon for the gun. */
function retainWeapon(api: GWorldApi, foe: any, gun: any): { name: string; level: number } {
  const dx = api.actors.attribute(foe, "DX" as never);
  const skill = String(modeOf(gun).skill ?? "");
  const specialty = /\(([^)]*)\)\s*$/.exec(skill)?.[1] ?? "";
  const retain = [`Retain Weapon (${specialty})`, "Retain Weapon"].map((name) => ({ name, level: api.actors.skillLevel(foe, name) })).find((s) => typeof s.level === "number");
  if (retain && typeof retain.level === "number" && (typeof dx !== "number" || retain.level > dx)) return { name: retain.name, level: retain.level };
  return { name: "DX", level: typeof dx === "number" ? dx : 10 };
}

/** Grab a foe's gun, then take it apart (p. 251): the grab at -4 with a grappling skill, then a Quick Contest. */
export async function instantArsenalDisarm(api: GWorldApi, technique: any, actor: any, contests: Map<string, boolean>): Promise<string | null> {
  const tokens = [...((game as any).user?.targets ?? [])];
  const foe = tokens.length === 1 ? tokens[0]?.actor : null;
  if (!foe) {
    ui.notifications?.warn(L("IadTarget"));
    return null;
  }
  const guns = [...(foe.items ?? [])].filter((i: any) => isFirearm(api, i));
  if (guns.length === 0) {
    ui.notifications?.warn(F("IadNoGun", { foe: String(foe.name ?? "") }));
    return null;
  }
  let gun = guns[0];
  if (guns.length > 1) {
    const choice = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("Iad") },
      content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("IadGun"))}</span><select name="gun">${guns.map((g: any) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></label></div>`,
      ok: { label: L("Iad"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="gun"]')?.value ?? "" },
      rejectClose: false,
    }) as string | null;
    if (!choice) return null;
    gun = guns.find((g: any) => g.id === choice) ?? gun;
  }
  const grapple = bestGrapple(api, actor);
  const grab: any = await api.roll.success({
    actor,
    base: grapple.level,
    label: F("IadGrab", { gun: String(gun.name ?? ""), skill: grapple.name }),
    skill: grapple.name === "DX" ? "" : grapple.name,
    kind: grapple.name === "DX" ? "attribute" : "skill",
    modifiers: [{ label: L("IadGrabLine"), value: INSTANT_ARSENAL_GRAB_PENALTY }],
  } as any);
  if (!grab?.success) return grab ? "missed" : null;
  const level = technique?.system?.derived?.level;
  if (typeof level !== "number") {
    ui.notifications?.warn(L("IadNoLevel"));
    return null;
  }
  const resist = retainWeapon(api, foe, gun);
  const key = String(actor?.uuid ?? "");
  contests.delete(key);
  const contest: any = await api.roll.quickContest({
    label: F("IadContest", { gun: String(gun.name ?? "") }),
    first: { actor, base: level, note: String(technique.name ?? "") },
    second: { actor: foe, base: resist.level, note: resist.name },
    tags: ["instantArsenalDisarm", "disarm"],
  } as any);
  if (!contest) return null;
  const result = instantArsenalResult({ outcome: contest.outcome, marginOfVictory: Number(contest.marginOfVictory) || 0, criticalFailure: contests.get(key) === true });
  contests.delete(key);
  const title = F("IadTitle", { gun: String(gun.name ?? ""), foe: String(foe.name ?? "") });
  if (result === "disabled") {
    const set = gun.isOwner ? await (api.items as any).setMalfunction?.(gun, { kind: DISASSEMBLED, label: L("Disassembled") }) : undefined;
    await say(actor, title, [L("IadDisabled"), ...(gun.isOwner && set !== false ? [] : [L("IadGmMarks")])]);
  } else {
    await say(actor, title, [L(`IadResult.${result}`)]);
  }
  return result;
}
