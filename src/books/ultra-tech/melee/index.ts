/**
 * GURPS Ultra-Tech's melee weapons, registered with the system through the
 * add-on API (pp. 162-166), under three switches.
 *
 *   - **Blade tech:** a weapon's edge (superfine, monowire, hyperdense,
 *     nanothorn) and vibro field as calculated fields that reprice it and
 *     change its rows, refused where the book forbids them; vibro switched on
 *     and off; a rocket striker as an attack option that boosts the blow's
 *     Striking ST and the ST it needs; monowire whips and switchblades with
 *     their length, a switchblade's blade and whip, and a whip's snare; and
 *     pulling off a limpet mine.
 *   - **Energy melee:** stun wands, zap gloves, neurolashes and neurogloves
 *     spending their cell's strikes; nonmetallic armour against a stunner, and
 *     its paralysis with the second-by-second recovery; a neurolash's setting,
 *     with the neural disruptor's outcomes; a neurolash added to any weapon;
 *     a sonic shuriken's sprayer.
 *   - **Force swords:** unbreakable blades, a variable force sword's reach,
 *     and a force blade cutting the weapon it meets.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { STUNNER_TABLES, readyStunners, wearsMetallicArmor } from "../../../shared/stunners/index.js";
import { NEURAL_SETTINGS, immunity, neuralOutcome, type BeamSetting } from "../beams/neural.js";
import {
  BLADES,
  CHARGES,
  FORCE_FORM_SECONDS,
  LIMPET,
  NEUROGLOVE,
  NEUROLASH,
  ROCKET_STRIKER,
  SHURIKEN_SPRAYER,
  SNARE,
  STUNNER,
  VARIABLE_FORCE_SWORD,
  ZAP_GLOVE,
  ZAP_KILL,
  bladeBlow,
  bladeMinSt,
  bladePrice,
  bladeProblems,
  chargedByName,
  chargesPerStrike,
  clampReach,
  damageDelta,
  forceWeaponByName,
  limpetRemovalPenalty,
  neurolashFactor,
  neurolashSettingAllowed,
  reachText,
  rocketStrikerFits,
  rocketStrikerUses,
  vibroSeconds,
  type Blade,
  type Charged,
  ADDED_NEUROLASH,
  neurogloveWrecked,
  vibroDrained,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Melee.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Melee.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "melee";
const ROCKET_OPTION = "ut-rocket-striker";
const ROCKET_THROWN_OPTION = "ut-rocket-striker-thrown";
const worldNow = () => Number((game as any).time?.worldTime) || 0;

/** Seconds a vibroblade has run on its cell, counting the stretch it's on now. */
function vibroSecondsUsed(state: MeleeState): number {
  const running = state.vibroOn && typeof state.vibroSince === "number" ? Math.max(0, worldNow() - state.vibroSince) : 0;
  return (state.vibroUsed ?? 0) + running;
}

export interface MeleeSwitches {
  blades: () => boolean;
  energy: () => boolean;
  force: () => boolean;
}

interface MeleeData {
  blade: Blade | "";
  vibro: boolean;
  rocketStriker: boolean;
  neurolash: boolean;
  highPower: boolean;
  settings: BeamSetting[];
  setting: BeamSetting | "";
  variableLength: boolean;
  /** The length a whip, switchblade or variable force sword is set to; null for its longest. */
  reach: number | null;
  sprayer: boolean;
}

interface MeleeState {
  vibroOn?: boolean;
  /** World time the vibroblade was last switched on, and seconds it ran before that (p. 164). */
  vibroSince?: number;
  vibroUsed?: number;
  /** A neuroglove wrecked by damage to the hand (p. 165). */
  wrecked?: boolean;
  switchMode?: "blade" | "whip";
  spent?: number;
  rocketUsed?: number;
  rocketArmed?: boolean;
}

export function initMelee(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      blade: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...BLADES] }),
      vibro: flag(),
      rocketStriker: flag(),
      neurolash: flag(),
      highPower: flag(),
      settings: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false, choices: [...NEURAL_SETTINGS] }), { required: true, initial: [] }),
      setting: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      variableLength: flag(),
      reach: new f.NumberField({ required: false, nullable: true, integer: true, initial: null, min: 0 }),
      sprayer: flag(),
    }),
  });
}

function meleeData(item: any): MeleeData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const settings = (Array.isArray(d.settings) ? d.settings : []).filter((s: string) => (NEURAL_SETTINGS as readonly string[]).includes(s)) as BeamSetting[];
  return {
    blade: BLADES.includes(d.blade) ? d.blade : "",
    vibro: Boolean(d.vibro),
    rocketStriker: Boolean(d.rocketStriker),
    neurolash: Boolean(d.neurolash),
    highPower: Boolean(d.highPower),
    settings,
    setting: (NEURAL_SETTINGS as readonly string[]).includes(d.setting) ? d.setting : "",
    variableLength: Boolean(d.variableLength),
    reach: d.reach === null || d.reach === undefined ? null : Math.max(0, Math.floor(Number(d.reach) || 0)),
    sprayer: Boolean(d.sprayer),
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;
const isMelee = (item: any) => item?.type === "equipment" && (item.system?.meleeModes ?? []).length > 0;
const damageTypesOf = (item: any): string[] => (item?.system?.meleeModes ?? []).map((m: any) => String(m.damageType ?? ""));
const skillsOf = (item: any): string[] => (item?.system?.meleeModes ?? []).map((m: any) => String(m.skill ?? ""));
const nameOf = (item: any) => String(item?.name ?? "");
const isMonowireWhip = (item: any) => /^monowire whip$/i.test(nameOf(item));
const isSwitchblade = (item: any) => /switchblade$/i.test(nameOf(item));
const isNeuralContact = (item: any) => /neurolash|neuroglove/i.test(nameOf(item)) || meleeData(item).neurolash;
const isStunner = (item: any) => /stun wand|shock club|stun stick|zap glove/i.test(nameOf(item));

function stateOf(api: GWorldApi, item: any): MeleeState {
  return (api.combat.getWeaponState(item, MODULE_ID) ?? {}) as MeleeState;
}

/** The charged weapon an item is, a neurolash added to it counting as one. */
function chargedOf(item: any): Charged | null {
  return chargedByName(nameOf(item)) ?? (meleeData(item).neurolash ? "neurolash" : null);
}

/** The neural setting a neurolash or neuroglove is on (Agony, the commonest, when none is chosen). */
function neuralSetting(item: any): BeamSetting {
  const data = meleeData(item);
  const built = data.settings.length ? data.settings : (["agony"] as BeamSetting[]);
  const setting = data.setting && built.includes(data.setting) ? data.setting : built[0]!;
  return neurolashSettingAllowed(setting, data.highPower) ? setting : "agony";
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** What the book forbids for a weapon's blade and vibro field. */
function problemsOf(item: any, data: MeleeData): string[] {
  return bladeProblems({ blade: data.blade, vibro: data.vibro, damageTypes: damageTypesOf(item), monowireWeapon: isMonowireWhip(item) || isSwitchblade(item) });
}

function itemContext(api: GWorldApi, item: any, on: MeleeSwitches): Record<string, unknown> {
  const data = meleeData(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  const weight = Number(item.system?.weight) || 0;
  const state = stateOf(api, item);
  if (on.blades()) {
    if (data.vibro) lines.push(F("VibroLine", { seconds: vibroSeconds(weight), state: L(state.vibroOn ? "On" : "Off") }));
    if (data.rocketStriker) lines.push(F("RocketLine", { left: Math.max(0, rocketStrikerUses(tl) - (state.rocketUsed ?? 0)), uses: rocketStrikerUses(tl), st: ROCKET_STRIKER.strikingSt, minSt: ROCKET_STRIKER.minSt }));
    if (isMonowireWhip(item) || isSwitchblade(item)) lines.push(F("SwitchLine", { mode: L(`Switch.${state.switchMode ?? "blade"}`) }));
    if (isMonowireWhip(item)) lines.push(F("SnareLine", { divisor: SNARE.armorDivisor }));
    if (/^limpet mine dispenser$/i.test(nameOf(item))) lines.push(F("LimpetLine", { delay: LIMPET.longestDelay, magazine: LIMPET.magazine }));
  }
  if (on.energy()) {
    const charged = chargedOf(item);
    if (charged) lines.push(F("ChargesLine", { left: Math.max(0, CHARGES[charged] - (state.spent ?? 0)), strikes: CHARGES[charged] }));
    if (isStunner(item)) lines.push(F("StunnerLine", { recovery: STUNNER.recovery }));
    if (/zap glove/i.test(nameOf(item))) lines.push(F("ZapGloveLine", { dr: ZAP_GLOVE.dr, cost: ZAP_GLOVE.armorCost, weight: ZAP_GLOVE.armorWeight }));
    if (/neuroglove/i.test(nameOf(item))) lines.push(F("NeurogloveLine", { dr: NEUROGLOVE.dr }));
    if (isNeuralContact(item)) lines.push(F("NeuralLine", { setting: L(`Setting.${neuralSetting(item)}`) }));
  }
  if (on.force() && forceWeaponByName(nameOf(item))) lines.push(F("ForceLine", { seconds: FORCE_FORM_SECONDS }));
  const neural = on.energy() && (isNeuralContact(item) || data.neurolash);
  return {
    data,
    editable: item.isOwner,
    blades: on.blades(),
    energy: on.energy(),
    force: on.force() && /^force sword$/i.test(nameOf(item)),
    edged: damageTypesOf(item).some((t) => t === "cut" || t === "imp"),
    rocketFits: rocketStrikerFits(skillsOf(item)),
    neurolashFits: !chargedByName(nameOf(item)) && !forceWeaponByName(nameOf(item)),
    shuriken: /sonic shuriken/i.test(nameOf(item)),
    neural,
    tunable: neural && tl >= NEUROLASH.tunableTl,
    bladeChoices: ["", ...BLADES].map((value) => ({ value, label: L(`Blade.${value || "none"}`), selected: value === data.blade })),
    settingChoices: NEURAL_SETTINGS.filter((s) => neurolashSettingAllowed(s, data.highPower)).map((value) => ({ value, label: L(`Setting.${value}`), built: data.settings.includes(value), active: value === neuralSetting(item) })),
    lines,
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-melee]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtMelee) as keyof MeleeData;
      const value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "blade" || field === "vibro") {
        const asked = { ...meleeData(item), [field]: value } as MeleeData;
        const problems = problemsOf(item, asked);
        if (problems.length) {
          ui.notifications?.warn(F("Refused", { problem: L(`Problem.${problems[0]}`) }));
          if (input instanceof HTMLInputElement) input.checked = false;
          else input.value = meleeData(item).blade;
          return;
        }
      }
      await item.update({ [`${path}.${field}`]: value });
    });
  });
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-melee-built]").forEach((input) => {
    input.addEventListener("change", async () => {
      const setting = String(input.dataset.gccUtMeleeBuilt) as BeamSetting;
      const built = meleeData(item).settings;
      await item.update({ [`${path}.settings`]: input.checked ? [...new Set([...built, setting])] : built.filter((s) => s !== setting) });
    });
  });
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-ut-melee-setting]").forEach((select) => {
    select.addEventListener("change", async () => {
      await item.update({ [`${path}.setting`]: select.value });
      if (item.actor) await say(item.actor, nameOf(item), [F("Switched", { setting: L(`Setting.${select.value}`) })]);
    });
  });
  void api;
}

/** Adds dice and adds to a row's damage formula. */
function withDamage(api: GWorldApi, formula: string, dice: number, adds: number): string {
  const rules = api.rules as any;
  const parsed = rules.parseDiceAdds?.(String(formula ?? ""));
  if (!parsed) return formula;
  return rules.formatDiceAdds({ ...parsed, dice: parsed.dice + dice, adds: parsed.adds + adds });
}

/** A row's ST requirement changed: the penalty and skill follow it. */
function setMinSt(api: GWorldApi, actor: any, row: any, minSt: number | null): void {
  const had = Number(row.minStPenalty) || 0;
  const st = Number(api.actors.attribute(actor, "ST")) || 10;
  // The system's minimum ST switch decides whether a shortfall costs skill at all (Characters p. 270).
  const penalty = api.registry.isRuleOn("minimumSt") && minSt !== null && minSt > st ? st - minSt : 0;
  row.minSt = minSt;
  if (typeof row.skillLevel === "number") row.skillLevel += penalty - had;
  row.minStPenalty = penalty;
}

/** The damage six more Striking ST adds to a thrust or swing, at the wielder's ST (p. 163). */
function rocketDelta(api: GWorldApi, actor: any, base: string): { dice: number; adds: number } | null {
  const rules = api.rules as any;
  const st = Number(api.actors.attribute(actor, "ST")) || 10;
  const table = base === "sw" ? rules.swingDamage : base === "thr" ? rules.thrustDamage : null;
  if (!table) return null;
  return damageDelta(table(st), table(st + ROCKET_STRIKER.strikingSt));
}

/** Rolls a snare pulled taut: thrust+1d(10) cutting (p. 163). */
async function snare(api: GWorldApi, item: any, actor: any): Promise<void> {
  const rules = api.rules as any;
  const thrust = rules.thrustDamage(Number(api.actors.attribute(actor, "ST")) || 10);
  const formula = rules.formatDiceAdds({ ...thrust, dice: thrust.dice + SNARE.extraDice });
  await api.roll.damage({ actor, label: F("SnareLabel", { name: nameOf(item) }), formula, damageType: "cut", armorDivisor: SNARE.armorDivisor } as any);
}

/** A force blade meeting a weapon: its damage, dealt to the weapon of the targeted character (p. 166). */
async function cutWeapon(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!target) return void ui.notifications?.warn(L("PickTarget"));
  const weapons = [...(target.items ?? [])].filter((i: any) => i.type === "equipment" && ((i.system?.meleeModes ?? []).length || (i.system?.rangedModes ?? []).length));
  if (!weapons.length) return void ui.notifications?.warn(F("NoWeapons", { name: target.name }));
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("CutTitle") },
    content: `<div class="gworld"><select name="weapon">${weapons.map((w: any) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("")}</select><p>${esc(L("CutHint"))}</p></div>`,
    ok: { label: L("CutTitle"), callback: (_e: Event, b: HTMLElement) => b.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>("[name=weapon]")?.value ?? "" },
    rejectClose: false,
  }) as string | null;
  const weapon = chosen ? target.items.get(chosen) : null;
  const mode = item.system?.meleeModes?.[0];
  if (!weapon || !mode) return;
  await api.roll.damage({
    actor,
    label: F("CutLabel", { name: nameOf(item), weapon: weapon.name }),
    formula: String(mode.damageFormula || "1d"),
    damageType: mode.damageType ?? "burn",
    armorDivisor: Number(mode.armorDivisor) || 1,
    weaponTarget: { actorUuid: String(target.uuid), itemId: String(weapon.id), name: String(weapon.name) },
  } as any);
}

/** Recovering from a stunner (p. 165): HT-5 each second, DR no help. */
async function recoverFromStun(api: GWorldApi): Promise<void> {
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (!actor) return void ui.notifications?.warn(L("PickToken"));
  const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "HT") ?? 10, kind: "attribute", label: F("RecoverLabel", { name: actor.name }), modifiers: [{ label: L("Stunned"), value: STUNNER.recovery }] } as any);
  if (!result?.success) return;
  for (const condition of api.actors.conditions(actor)) {
    if (/paraly/i.test(condition.label) || /paraly/i.test(condition.id)) await api.actors.removeCondition(actor, condition.id);
  }
  await say(actor, String(actor.name), [F("Recovered", { name: actor.name })]);
}

/** Pulling a limpet mine off (p. 163): a Ready and a ST roll, less a tenth of the DR it's stuck to, at most 20. */
async function pullLimpet(api: GWorldApi): Promise<void> {
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (!actor) return void ui.notifications?.warn(L("PickToken"));
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("LimpetTitle") },
    content: `<div class="gworld" style="display:grid;gap:6px"><label style="display:flex;justify-content:space-between;gap:8px">${esc(L("LimpetDr"))}<input type="number" name="dr" value="0" min="0" style="width:70px" /></label><label><input type="checkbox" name="flesh" /> ${esc(L("LimpetFlesh"))}</label></div>`,
    ok: {
      label: L("LimpetTitle"),
      callback: (_e: Event, b: HTMLElement) => {
        const form = b.closest<HTMLElement>(".application")!;
        return { dr: Number(form.querySelector<HTMLInputElement>("[name=dr]")?.value) || 0, flesh: Boolean(form.querySelector<HTMLInputElement>("[name=flesh]")?.checked) };
      },
    },
    rejectClose: false,
  }) as { dr: number; flesh: boolean } | null;
  if (!answer) return;
  const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "ST") ?? 10, kind: "attribute", label: L("LimpetTitle"), modifiers: [{ label: L("LimpetStuck"), value: limpetRemovalPenalty(answer.dr) }] } as any);
  if (result?.success && answer.flesh) await api.actors.applyInjury(actor, { amount: LIMPET.fleshDamage, label: L("LimpetTitle") } as any);
}

export function readyMelee(api: GWorldApi, on: MeleeSwitches): void {
  const any = () => on.blades() || on.energy() || on.force();

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-melee",
    types: ["equipment"],
    apply: (item, price) => {
      if (!any() || !isMelee(item)) return null;
      const data = meleeData(item);
      let cost = price.cost;
      let weight = price.weight;
      if (on.blades()) {
        const priced = bladePrice({ blade: data.blade, vibro: data.vibro, damageTypes: damageTypesOf(item), monowireWeapon: isMonowireWhip(item) || isSwitchblade(item) }, { cost, weight });
        cost = priced.cost;
        weight = priced.weight;
        if (data.rocketStriker) {
          cost += ROCKET_STRIKER.cost;
          weight += ROCKET_STRIKER.weight;
        }
      }
      if (on.energy()) {
        if (data.neurolash && !chargedByName(nameOf(item))) {
          cost += NEUROLASH.cost;
          weight += NEUROLASH.weight;
        }
        if (isNeuralContact(item)) cost *= neurolashFactor(data.settings.length);
        if (data.sprayer) cost += SHURIKEN_SPRAYER.cost;
      }
      if (on.force() && data.variableLength && /^force sword$/i.test(nameOf(item))) cost += VARIABLE_FORCE_SWORD.cost;
      if (cost === price.cost && weight === price.weight) return null;
      return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 1000) / 1000, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-melee-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-melee-item.hbs`,
    visible: (item) => any() && (isMelee(item) || /sonic shuriken/i.test(nameOf(item))),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  // The rows: the blade's damage, divisor and ST; a whip's or blade's length; which of a switchblade's modes is live.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!any() || !isMelee(item)) return;
    const data = meleeData(item);
    const state = stateOf(api, item);
    // A vibroblade is ultra-tech whatever the blade it was made from: the character's TL where that is later (p. 164).
    const tl = Math.max(tlOf(item), Number(/\d+/.exec(String(context.actor?.system?.tl ?? ""))?.[0]) || 0);
    const switchMode = state.switchMode ?? "blade";
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "melee") continue;
      const row = entry.row;
      const mode = entry.mode ?? {};
      if (on.blades()) {
        // A vibroblade's cell runs down by the second (p. 164).
        const drained = Boolean(data.vibro && state.vibroOn) && vibroDrained(vibroSecondsUsed(state), Number(item.system?.weight) || 0);
        if (drained && /^(cut|imp)$/.test(String(row.damageType ?? ""))) row.notes.push({ label: L("VibroDrained"), hint: L("VibroDrainedHint") });
        const blow = bladeBlow({ damageType: String(row.damageType ?? ""), armorDivisor: Number(row.armorDivisor) || 1 }, data.blade, Boolean(data.vibro && state.vibroOn) && !drained, tl);
        const changed = blow.dice || blow.adds || blow.damageType !== row.damageType || blow.armorDivisor !== (Number(row.armorDivisor) || 1);
        if (blow.dice || blow.adds) row.damage = withDamage(api, row.damage, blow.dice, blow.adds);
        if (changed) {
          row.damageType = blow.damageType;
          row.armorDivisor = blow.armorDivisor;
          row.notes.push({ label: L(`Blade.${data.blade || "vibro"}`), hint: L(`BladeHint.${data.blade || "vibro"}`) });
        }
        if (data.blade === "hyperdense") setMinSt(api, context.actor, row, bladeMinSt(row.minSt ?? null, "hyperdense"));
        // A monowire whip's or switchblade's length; the switchblade's blade adds a point per yard (pp. 163-164).
        if (isMonowireWhip(item) || isSwitchblade(item)) {
          const whip = /whip/i.test(String(mode.name ?? "")) || isMonowireWhip(item);
          const column = String(mode.reach ?? row.reach ?? "");
          const reach = clampReach(data.reach ?? Number.MAX_SAFE_INTEGER, column);
          row.reach = reachText(reach, whip);
          if (isSwitchblade(item)) {
            const perYard = Number(item.system?.extensions?.[MODULE_ID]?.switchblade?.damagePerYardOfReach) || 0;
            if (!whip && perYard) row.damage = withDamage(api, row.damage, 0, perYard * reach);
            if ((whip ? "whip" : "blade") !== switchMode) row.usable = false;
          }
        }
      }
      if (on.force() && data.variableLength && /^force sword$/i.test(nameOf(item))) {
        row.reach = reachText(clampReach(data.reach ?? 2, VARIABLE_FORCE_SWORD.reach), false);
      }
      // A neurolash added to another weapon strikes with its affliction (p. 165).
      if (on.energy() && data.neurolash && !/neurolash|neuroglove/i.test(nameOf(item)) && !row.followUp && !row.affliction) {
        row.followUp = { damage: `${ADDED_NEUROLASH.attribute}${ADDED_NEUROLASH.modifier}`, damageType: "cr", explosive: false, armorDivisor: ADDED_NEUROLASH.armorDivisor, affliction: true, afflictionAttribute: ADDED_NEUROLASH.attribute, afflictionModifier: ADDED_NEUROLASH.modifier, label: L("NeurolashAdded") };
      }
      if (on.energy() && stateOf(api, item).wrecked) row.notes.push({ label: L("Wrecked"), hint: L("WreckedHint") });
      if (on.energy() && isNeuralContact(item) && (row.affliction || row.followUp)) row.notes.push({ label: L(`Setting.${neuralSetting(item)}`), hint: L("NeuralHint") });
    }
  });

  // A rocket striker: +6 Striking ST and +3 to the ST the blow needs (p. 163).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: ROCKET_OPTION,
    label: L("RocketLabel"),
    attack: "melee",
    available: (context: any) => on.blades() && meleeData(context?.item).rocketStriker,
    refuse: (context: any) => (stateOf(api, context.item).rocketUsed ?? 0) >= rocketStrikerUses(tlOf(context.item)) ? L("RocketEmpty") : null,
    apply: (context: any) => {
      const st = Number(api.actors.attribute(context.actor, "ST")) || 10;
      const minSt = Math.max(0, ...(context.item.system?.meleeModes ?? []).map((m: any) => Number(m.minSt) || 0));
      const penalty = Math.min(0, st - (minSt + ROCKET_STRIKER.minSt)) - Math.min(0, st - minSt);
      return { ...(penalty ? { modifiers: [{ label: L("RocketSt"), value: penalty }] } : {}), notes: [F("RocketNote", { st: ROCKET_STRIKER.strikingSt })] };
    },
  } as any);

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: ROCKET_THROWN_OPTION,
    label: L("RocketLabel"),
    attack: "ranged",
    available: (context: any) => on.blades() && meleeData(context?.item).rocketStriker && context?.item?.system?.rangedModes?.[Number(context?.mode?.index) || 0]?.thrown === true,
    refuse: (context: any) => (stateOf(api, context.item).rocketUsed ?? 0) >= rocketStrikerUses(tlOf(context.item)) ? L("RocketEmpty") : null,
    // "This drawback does not apply to thrown spears."
    apply: () => ({ notes: [F("RocketNote", { st: ROCKET_STRIKER.strikingSt })] }),
  } as any);
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || !context.ranged || !item.isOwner || !on.blades()) return;
    if (context.options?.[`${MODULE_ID}.${ROCKET_THROWN_OPTION}`] !== true) return;
    const state = stateOf(api, item);
    void api.combat.setWeaponState(item, MODULE_ID, { rocketUsed: (state.rocketUsed ?? 0) + 1, rocketArmed: true });
  });

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context.ranged || !item.isOwner) return;
    const state = stateOf(api, item);
    if (on.energy() && state.wrecked) {
      context.refusal = F("WreckedRefusal", { name: nameOf(item) });
      return;
    }
    const patch: MeleeState = {};
    if (on.blades() && context.options?.[`${MODULE_ID}.${ROCKET_OPTION}`] === true) {
      patch.rocketUsed = (state.rocketUsed ?? 0) + 1;
      patch.rocketArmed = true;
    }
    // A contact weapon spends its cell's strikes (p. 165).
    const charged = on.energy() ? chargedOf(item) : null;
    if (charged) {
      const kill = /kill/i.test(String(item.system?.meleeModes?.[Number(context.mode?.index) || 0]?.name ?? ""));
      const cost = chargesPerStrike(charged, kill);
      if ((state.spent ?? 0) + cost > CHARGES[charged]) {
        context.refusal = F("Drained", { name: nameOf(item) });
        return;
      }
      patch.spent = (state.spent ?? 0) + cost;
    }
    if (Object.keys(patch).length) void api.combat.setWeaponState(item, MODULE_ID, patch as Record<string, unknown>);
  });

  // The boosted blow's damage, once (p. 163).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    const item = context?.item;
    if (!on.blades() || !item || !stateOf(api, item).rocketArmed) return;
    const modes = context.mode?.ranged ? item.system?.rangedModes : item.system?.meleeModes;
    const mode = modes?.[Number(context.mode?.index) || 0];
    const delta = mode ? rocketDelta(api, context.actor, String(mode.damageBase ?? "")) : null;
    if (delta && typeof context.formula === "string") context.formula = withDamage(api, context.formula, delta.dice, delta.adds);
    if (item.isOwner) void api.combat.setWeaponState(item, MODULE_ID, { rocketArmed: false });
  });

  // Nonmetallic armour against a stunner's contact: +2 a point of DR (p. 165); metallic armour counts as DR 1.
  // The shared contact-stunner engine puts it on the roll, with this book's table.
  STUNNER_TABLES.register({ book: "ultra-tech", tls: { min: 9, max: 12 }, on: on.energy, applies: isStunner, armorDivisor: 1 / STUNNER.drBonus, label: () => L("NonmetallicDr") });
  readyStunners(api);

  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    if (!on.energy() || !item) return;
    const actor = context.actor;
    const name = String(actor?.name ?? "");
    if (isStunner(item)) {
      // Knocked down and paralysed until a HT-5 roll, and held there while the wand stays in contact (p. 165).
      context.effects.push({ key: "paralysis" });
      void api.actors.setPosture(actor, "lying");
      void say(actor, String(context.label ?? nameOf(item)), [F("StunnedLine", { name, recovery: STUNNER.recovery })]);
      return;
    }
    if (!isNeuralContact(item)) return;
    const effects = actor?.system?.derived?.traitEffects ?? {};
    const traits = [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
    // A contact weapon reaches through a sealed suit; only a mind that isn't a brain is out of reach.
    const blocked = immunity("neural", { traits, iq: api.actors.attribute(actor, "IQ"), sealed: false, deaf: effects.deafness === true, injuryTolerance: effects.injuryTolerance ?? {} });
    if (blocked) {
      void say(actor, String(context.label ?? ""), [game.i18n.format(`GCC.UT.Neural.Immune.${blocked}`, { name })]);
      return;
    }
    const margin = Math.max(0, Math.floor(Number(context.margin) || 0));
    const outcomes = neuralOutcome(neuralSetting(item), margin);
    for (const outcome of outcomes) {
      if (outcome.condition) context.effects.push({ key: outcome.condition, ...(outcome.seconds ? { duration: { seconds: outcome.seconds } } : {}) });
    }
    void say(actor, String(context.label ?? ""), outcomes.map((o) => game.i18n.format(`GCC.UT.${o.note}`, { name, minutes: Math.max(1, margin), seconds: o.seconds ?? 0 })));
  });

  // A zap glove's DR 5 and a neuroglove's DR 2 on the hand (p. 165).
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.energy() || !context?.actor || context.hitLocation !== "hand" || !Array.isArray(context.lines)) return;
    for (const glove of [...(context.actor.items ?? [])].filter((i: any) => i.type === "equipment" && i.system?.equipped === true)) {
      const dr = /zap glove/i.test(nameOf(glove)) ? ZAP_GLOVE.dr : /neuroglove/i.test(nameOf(glove)) ? NEUROGLOVE.dr : 0;
      if (dr) context.lines.push({ label: nameOf(glove), dr, applies: true, forceField: false, flexible: true, hardened: 0 });
    }
  });

  // Damage to the hand through a neuroglove wrecks it as a weapon on a 1 in 6 (p. 165).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const actor = context?.actor;
    if (!on.energy() || !actor?.isOwner || !game.user?.isGM) return;
    if (String(context.damage?.hitLocation ?? "") !== "hand" || !(Number(context.result?.injury) > 0)) return;
    const glove = [...(actor.items ?? [])].find((i: any) => i.type === "equipment" && i.system?.equipped === true && /neuroglove/i.test(nameOf(i)) && !stateOf(api, i).wrecked);
    if (!glove) return;
    void (async () => {
      const roll = await new Roll("1d6").evaluate();
      const wrecked = neurogloveWrecked(Number(roll.total) || 0);
      if (wrecked) await api.combat.setWeaponState(glove, MODULE_ID, { wrecked: true });
      await say(actor, nameOf(glove), [F(wrecked ? "GloveWrecked" : "GloveSurvives", { roll: roll.total })]);
    })();
  });

  // A zap glove on "kill" is a lethal shock: its burning damage, and the HT roll for being shocked (p. 165).
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-zap-kill", itemTypes: ["equipment"], label: L("ZapKillTitle"), icon: "fa-solid fa-bolt", visible: (item) => on.energy() && /zap glove/i.test(nameOf(item)), run: async (item, actor) => {
    const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
    if (!targets.length) return void ui.notifications?.warn(L("ZapKillPick"));
    const charged = chargedOf(item);
    const state = stateOf(api, item);
    const cost = charged ? chargesPerStrike(charged, true) : 0;
    if (charged && (state.spent ?? 0) + cost > CHARGES[charged]) return void say(actor, nameOf(item), [F("Drained", { name: nameOf(item) })]);
    if (charged) await api.combat.setWeaponState(item, MODULE_ID, { spent: (state.spent ?? 0) + cost });
    for (const target of targets) {
      await api.hazards.shock({ actor: target, kind: "lethal", modifier: ZAP_KILL.modifier, continuous: false, formula: ZAP_KILL.formula, metalArmor: wearsMetallicArmor(target) });
    }
  } });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-stunner-hold", itemTypes: ["equipment"], label: L("HoldTitle"), icon: "fa-solid fa-hand", visible: (item) => on.energy() && isStunner(item), run: async (item, actor) => {
    // "The user may take a Concentrate maneuver to hold the baton in contact. This prevents recovery ... but drains a charge each second" (p. 165).
    const charged = chargedOf(item);
    const state = stateOf(api, item);
    if (charged && (state.spent ?? 0) + 1 > CHARGES[charged]) return void say(actor, nameOf(item), [F("Drained", { name: nameOf(item) })]);
    await api.combat.setWeaponState(item, MODULE_ID, { spent: (state.spent ?? 0) + 1 });
    await say(actor, nameOf(item), [F("HoldLine", { left: charged ? CHARGES[charged] - (state.spent ?? 0) - 1 : 0 })]);
  } });

  // Force blades and a stasis switchblade can't break (pp. 164, 166).
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    if (on.force() && forceWeaponByName(nameOf(context?.item))) context.weight = Number.MAX_SAFE_INTEGER;
  });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-vibro", itemTypes: ["equipment"], label: L("VibroToggle"), icon: "fa-solid fa-wave-square", visible: (item) => on.blades() && meleeData(item).vibro, run: async (item, actor) => {
    const state = stateOf(api, item);
    const next = !state.vibroOn;
    await api.combat.setWeaponState(item, MODULE_ID, next ? { vibroOn: true, vibroSince: worldNow() } : { vibroOn: false, vibroUsed: vibroSecondsUsed(state), vibroSince: undefined });
    await say(actor, nameOf(item), [L(next ? "VibroOn" : "VibroOff")]);
  } });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-switch-mode", itemTypes: ["equipment"], label: L("SwitchToggle"), icon: "fa-solid fa-arrows-left-right", visible: (item) => on.blades() && isSwitchblade(item), run: async (item, actor) => {
    const next = (stateOf(api, item).switchMode ?? "blade") === "blade" ? "whip" : "blade";
    await api.combat.setWeaponState(item, MODULE_ID, { switchMode: next });
    await say(actor, nameOf(item), [F("Switched", { setting: L(`Switch.${next}`) })]);
  } });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-snare", itemTypes: ["equipment"], label: L("SnareTitle"), icon: "fa-solid fa-link", visible: (item) => on.blades() && (isMonowireWhip(item) || isSwitchblade(item)), run: (item, actor) => snare(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-recharge", itemTypes: ["equipment"], label: L("Recharge"), icon: "fa-solid fa-battery-full", visible: (item) => (on.energy() && chargedOf(item) !== null) || (on.blades() && meleeData(item).vibro), run: async (item, actor) => {
    const state = stateOf(api, item);
    await api.combat.setWeaponState(item, MODULE_ID, { spent: 0, vibroUsed: 0, ...(state.vibroOn ? { vibroSince: worldNow() } : {}) });
    await say(actor, nameOf(item), [L("Recharged")]);
  } });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-rocket-refuel", itemTypes: ["equipment"], label: L("RocketRefuel"), icon: "fa-solid fa-gas-pump", visible: (item) => on.blades() && meleeData(item).rocketStriker, run: async (item, actor) => {
    await api.combat.setWeaponState(item, MODULE_ID, { rocketUsed: 0, rocketArmed: false });
    await say(actor, nameOf(item), [L("Refueled")]);
  } });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-force-cut", itemTypes: ["equipment"], label: L("CutTitle"), icon: "fa-solid fa-bolt", visible: (item) => on.force() && forceWeaponByName(nameOf(item)) !== null && forceWeaponByName(nameOf(item)) !== "stasisSwitchblade", run: (item, actor) => cutWeapon(api, item, actor) });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-melee-tools",
    label: L("ToolTitle"),
    icon: "fa-solid fa-hand-fist",
    visible: () => on.energy() || on.blades(),
    open: async () => {
      const choice = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("ToolTitle") },
        content: `<div class="gworld" style="display:grid;gap:6px">${on.energy() ? `<label><input type="radio" name="what" value="recover" checked /> ${esc(L("RecoverTitle"))}</label>` : ""}${on.blades() ? `<label><input type="radio" name="what" value="limpet" ${on.energy() ? "" : "checked"} /> ${esc(L("LimpetTitle"))}</label>` : ""}</div>`,
        ok: { label: L("ToolTitle"), callback: (_e: Event, b: HTMLElement) => b.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>("[name=what]:checked")?.value ?? "" },
        rejectClose: false,
      }) as string | null;
      if (choice === "recover") await recoverFromStun(api);
      if (choice === "limpet") await pullLimpet(api);
    },
  });
}
