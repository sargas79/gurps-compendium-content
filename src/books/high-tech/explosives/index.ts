/**
 * High-Tech's explosives and incendiaries (pp. 181-188), registered with the
 * system through the add-on API under four switches. The rules are in
 * `rules.ts`, the Relative Explosive Force Table in `ref.ts`; what a record
 * holds is its `explosive` data (`../records.ts`).
 *
 *   - **Side effects of explosions (explosionSideEffects):** a blast in a
 *     sealed room or vehicle does double damage to everyone in it, 1.5 times
 *     with doors and windows to blow out -- chosen as an attack option on an
 *     explosive row and in the charge's dialog, and rolled as the scaled dice.
 *     Anyone a blast's crushing damage reaches rolls HT against concussion,
 *     and anyone its crushing or burning damage reaches and who was looking
 *     toward it rolls HT against the flash, from a card the blow leaves:
 *     failure costs Hearing or Vision equal to the margin (the whole sense by
 *     10 or more) for (20 - HT) minutes, and stuns.
 *   - **Demolition charges (demolitionCharges):** the book's REF table as
 *     explosives the system's Demolition tool and `hazards.detonate` offer; a
 *     row action on an explosive record that sets it off (its pounds, packed
 *     against a door or wall or set nearby, a shaped charge dividing the
 *     structure's DR by 10); and one that works out the charge a job takes
 *     (a crater, timbers, girders, holes in walls and plates), tamped or
 *     shaped, and rolls Explosives (Demolition) for it.
 *   - **Unstable explosives (unstableExplosives):** nitroglycerin that is
 *     jolted -- a row action, or a blow to whoever carries it -- goes off on
 *     12+ on 3d, and anything with a number set on it (impure nitro, sweating
 *     dynamite) on that number, which the item sheet asks for only on an
 *     explosive with nitro in it; skimming nitro from dynamite; home-cooked
 *     black powder, plastique, ANFO and fuel-air devices, with what a failed
 *     batch comes out as; and a fuel-air blast's slower falloff.
 *   - **Incendiaries (incendiaryAgents):** thermite set burning on a victim
 *     (3d a second against the DR where it burns, which it wears down) or on
 *     an object, and napalm that clings and burns for a minute, both through
 *     the lingering-burn engine (`../burning.ts`) the flamethrower's fuel
 *     uses.
 *
 * The grenades, bombs and nuclear weapons (`../ordnance`) add to these under
 * their own switches: the AN-M14 burns as thermite, a nuclear blast's flash
 * always calls for its roll, and the CBU-55/B falls off as fuel-air.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { registerLingeringBurn, startBurn, type LingeringBurn } from "../burning.js";
import { chargeOf } from "../records.js";
import { EXPLOSIVES, type ExplosiveRow } from "./ref.js";
import {
  ANFO_DETONATION,
  DEMOLITION_JOBS,
  ENCLOSURES,
  FLAWS,
  FUEL_AIR_DIVISOR_PER_YARD,
  JOB_INPUTS,
  NAPALM,
  RECIPES,
  SKIM_MODIFIER,
  THERMITE,
  THERMITE_SPARKS,
  UNSTABLE_PENALTY,
  WEAK_FACTOR,
  blowsUpOnCriticalFailure,
  canShape,
  canTamp,
  carriesNitro,
  chargeFor,
  concussionModifier,
  enclosureFactor,
  eyeBonus,
  failedBatch,
  flashModifier,
  formatDamage,
  hearingBonus,
  isDynamite,
  isFuelAir,
  isNapalm,
  parseDamage,
  recipeFor,
  scaleDamage,
  senseLoss,
  shapedChargeRolls,
  shapedDr,
  shockDetonates,
  shockNumber,
  skimOutcome,
  thermiteDr,
  thermiteOnObject,
  thermiteSeconds,
  type DemolitionJob,
  type Enclosure,
  type Flaw,
  type JobSize,
  type Recipe,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Explosives.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Explosives.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const ENCLOSURE_OPTION = "ht-enclosure";
const SIDE_EFFECTS_CARD = "ht-blast-effects";
const THERMITE_FLAG = "htThermite";
const THERMITE_CONDITION = "ht-thermite-burning";
const NAPALM_FLAG = "htNapalm";
const NAPALM_CONDITION = "ht-napalm-burning";
const DEMOLITION = "Explosives (Demolition)";
const DETONATION_SOURCE = "demolition";

export interface ExplosiveSwitches {
  sideEffects: () => boolean;
  demolition: () => boolean;
  unstable: () => boolean;
  incendiaries: () => boolean;
}

/** What the grenades, bombs and nuclear weapons (`../ordnance`, #379) ask of these rules, each with its own switch in. */
export interface ExplosiveExtras {
  /** A blast whose flash always applies, side effects or no: a nuclear device (p. 195). */
  alwaysFlash?: (item: any) => boolean;
  /** A grenade that burns as thermite, for this many seconds, or null: the AN-M14 (p. 192). */
  thermiteGrenade?: (item: any) => number | null;
  /** Whether a thermite grenade's rule is on, so its burn goes on ticking without the incendiaries'. */
  thermiteGrenadesOn?: () => boolean;
  /** A bomb whose blast is fuel-air, divided by 2 x the distance: the CBU-55/B (p. 194). */
  fuelAirBomb?: (item: any) => boolean;
}

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
const roll3d = (): number => d6() + d6() + d6();

/** The id a REF row is registered under: `<module>.ht-<slug>`. */
export function explosiveKey(row: ExplosiveRow): string {
  return `ht-${row.type.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** The pounds an item holds in all: its charge times how many there are. */
export function poundsOf(item: any): number {
  const charge = chargeOf(item);
  if (!charge) return 0;
  return charge.pounds * Math.max(1, Math.floor(Number(item?.system?.quantity) || 1));
}

/** Thermite: an incendiary record, by name (p. 188). */
export const isThermite = (item: any): boolean => item?.type === "equipment" && /^thermite\b/i.test(String(item?.name ?? "")) && !chargeOf(item);

/** Every mode of an item that explodes. */
const explosiveModes = (item: any): any[] => [...(item?.system?.meleeModes ?? []), ...(item?.system?.rangedModes ?? [])].filter((m) => m?.explosive === true);

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

function field(form: HTMLElement | null | undefined, name: string): string {
  const el = form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!el) return "";
  if ((el as HTMLInputElement).type === "checkbox") return (el as HTMLInputElement).checked ? "on" : "";
  return el.value ?? "";
}

async function ask(title: string, content: string, label: string): Promise<((name: string) => string) | null> {
  const values: any = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">${content}</div>`,
    ok: {
      label,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const out: Record<string, string> = {};
        for (const el of Array.from(form?.querySelectorAll<HTMLInputElement>("[name]") ?? [])) out[el.name] = field(form, el.name);
        return out;
      },
    },
    rejectClose: false,
  });
  return values && typeof values === "object" ? (name: string) => String(values[name] ?? "") : null;
}

const row = (label: string, control: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(label)}</span>${control}</label>`;
const number = (name: string, value: number, step = "any") => `<input type="number" name="${name}" value="${value}" min="0" step="${step}" style="width:90px">`;
const select = (name: string, options: Array<{ value: string; label: string }>) => `<select name="${name}" style="width:240px">${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>`;
const checkbox = (name: string, label: string) => `<label class="icheck"><input type="checkbox" name="${name}"> ${esc(label)}</label>`;

/** The best of several skills the actor has, each at its modifier, or null for none known. */
function bestOf(api: GWorldApi, actor: any, choices: ReadonlyArray<{ skill: string; modifier: number }>): { skill: string; level: number; modifier: number } | null {
  let best: { skill: string; level: number; modifier: number } | null = null;
  for (const choice of choices) {
    const level = api.actors.skillLevel(actor, choice.skill);
    if (level === null || level === undefined) continue;
    if (!best || Number(level) + choice.modifier > best.level + best.modifier) best = { skill: choice.skill, level: Number(level), modifier: choice.modifier };
  }
  return best;
}

async function skillRoll(api: GWorldApi, actor: any, choices: ReadonlyArray<{ skill: string; modifier: number }>, label: string, extra: Array<{ label: string; value: number }> = [], tags: string[] = []): Promise<any | null> {
  const use = bestOf(api, actor, choices);
  if (!use) {
    ui.notifications?.warn(F("NoSkill", { skills: choices.map((c) => c.skill).join(", ") }));
    return null;
  }
  const modifiers = [...(use.modifier ? [{ label: F("SkillModifier", { skill: use.skill }), value: use.modifier }] : []), ...extra];
  return api.roll.success({ actor, base: use.level, label, skill: use.skill, modifiers, tags: ["explosives", ...tags] } as any);
}

export function readyExplosives(api: GWorldApi, on: ExplosiveSwitches, extras: ExplosiveExtras = {}): void {
  // ── the REF table (p. 183) ──
  const ids = new Map<ExplosiveRow, string>();
  for (const each of EXPLOSIVES) {
    const id = (api.data as any).registerExplosive({
      module: MODULE_ID,
      key: explosiveKey(each),
      label: F("TableLabel", { type: each.type }),
      ref: each.ref,
      tl: each.tl,
      available: () => on.demolition(),
    });
    if (id) ids.set(each, id);
  }
  const fuelAirLabel = F("TableLabel", { type: EXPLOSIVES.find(isFuelAir)?.type ?? "" });

  /**
   * A charge this client is setting off, for the damage roll `detonate` makes
   * straight away: the dice it scales, for an enclosed space or a weak batch.
   */
  let pending: { label: string; factor: number } | null = null;

  /** Sets off a record's charge: the system's detonation, with this book's settings. */
  const setOff = async (actor: any, item: any, options: { pounds: number; placement: "contact" | "nearby"; distance: number; structure: any; shaped: boolean; enclosure: Enclosure; label?: string }) => {
    const charge = chargeOf(item);
    if (!charge || !(options.pounds > 0)) return null;
    const name = String(item.name ?? "");
    const flaw: Flaw = on.unstable() ? charge.homeMade : "";
    if (flaw === "inert") {
      await say(actor, name, [F("Inert", { name })]);
      return null;
    }
    // Home-made ANFO takes an Explosives (Demolition)+2 roll to set off (p. 186).
    if (flaw && recipeFor(charge.row) === "anfo") {
      const outcome = await skillRoll(api, actor, [ANFO_DETONATION], F("AnfoRoll", { name }), [], ["anfo"]);
      if (!outcome?.success) {
        await say(actor, name, [F("AnfoFailed", { name })]);
        return null;
      }
    }
    const enclosure = on.sideEffects() ? enclosureFactor(options.enclosure) : 1;
    const weak = flaw === "weak" ? WEAK_FACTOR : 1;
    const factor = enclosure * weak;
    const bits = [
      ...(enclosure !== 1 ? [F("EnclosedTag", { times: enclosure })] : []),
      ...(weak !== 1 ? [L("WeakTag")] : []),
      ...(options.shaped && options.structure ? [L("ShapedTag")] : []),
    ];
    const label = options.label ?? F("ChargeLabel", { pounds: options.pounds, name, extra: bits.length ? ` (${bits.join(", ")})` : "" });
    const structure = options.structure && options.shaped && on.demolition()
      ? { ...options.structure, dr: shapedDr(options.structure.dr), label: F("ShapedStructure", { label: options.structure.label ?? "" }) }
      : options.structure;
    pending = factor !== 1 ? { label, factor } : null;
    try {
      const id = ids.get(charge.row);
      const call = (api as any).hazards.detonate({
        ...(id ? { explosive: id } : { ref: charge.row.ref }),
        weightLbs: options.pounds, placement: options.placement, distanceYards: options.distance, structure: structure ?? null, actor, label,
      });
      pending = null;
      return await call;
    } finally {
      pending = null;
    }
  };

  // What the charge's dialog scales: the dice `detonate` rolls (it has no item).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (pending && !context?.item && context?.label === pending.label) {
      const dice = parseDamage(String(context.formula ?? ""));
      if (dice) context.formula = formatDamage(scaleDamage(dice, pending.factor));
      return;
    }
    // A blast in an enclosed space, chosen on the attack (p. 181).
    const item = context?.item;
    if (!on.sideEffects() || !item || context.mode?.derived) return;
    const modes = context.mode?.ranged ? item.system?.rangedModes : item.system?.meleeModes;
    if (modes?.[Number(context.mode?.index) || 0]?.explosive !== true) return;
    const times = enclosureFactor((api.combat.getWeaponState(item, MODULE_ID) as any)?.htEnclosure);
    const dice = times !== 1 ? parseDamage(String(context.formula ?? "")) : null;
    if (dice) context.formula = formatDamage(scaleDamage(dice, times));
  });

  // ── side effects of explosions (pp. 181-182) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: ENCLOSURE_OPTION,
    label: L("Enclosure"),
    input: { type: "select", choices: ENCLOSURES.map((e) => ({ value: e, label: L(`Enclosures.${e || "none"}`) })) },
    available: (context: any) => on.sideEffects() && explosiveModes(context?.item).length > 0,
    apply: (_context: any, value: unknown) => (enclosureFactor(value) !== 1 ? { notes: [F("EnclosedNote", { times: enclosureFactor(value) })] } : null),
  } as any);
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!on.sideEffects() || !item?.isOwner || explosiveModes(item).length === 0) return;
    const chosen = String(context.options?.[`${MODULE_ID}.${ENCLOSURE_OPTION}`] ?? "");
    void api.combat.setWeaponState(item, MODULE_ID, { htEnclosure: (ENCLOSURES as readonly string[]).includes(chosen) ? chosen : "" });
  });

  // The HT rolls a blast calls for, as a card on the victim.
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: SIDE_EFFECTS_CARD,
    template: `modules/${MODULE_ID}/templates/ht-explosives-card.hbs`,
    actions: {
      concussion: async ({ message, data, actor }: any) => {
        if (!actor || data.concussion?.rolled || !on.sideEffects()) return;
        const outcome = await senseRoll(api, actor, "hearing", Number(data.concussion.modifier) || 0);
        await api.chat.update(message, { ...data, concussion: { ...data.concussion, rolled: true, result: outcome } });
      },
      flash: async ({ message, data, actor }: any) => {
        if (!actor || data.flash?.rolled || !(on.sideEffects() || data.always === true)) return;
        const outcome = await senseRoll(api, actor, "vision", Number(data.flash.modifier) || 0);
        await api.chat.update(message, { ...data, flash: { ...data.flash, rolled: true, result: outcome } });
      },
    },
  } as any);

  // ── demolition charges (pp. 182-183) ──
  const structures = (): Array<{ value: string; label: string }> => [
    { value: "", label: L("NoStructure") },
    { value: "custom", label: L("CustomStructure") },
    ...(((api.rules as any).WALLS ?? []) as any[]).map((w, i) => ({ value: String(i), label: `${w.name} (DR ${w.dr}, HP ${w.hp})` })),
  ];
  const structureFrom = (value: (name: string) => string) => {
    const picked = value("structure");
    const wall = picked && picked !== "custom" ? ((api.rules as any).WALLS ?? [])[Number(picked)] : null;
    const taken = Number(value("taken")) || 0;
    if (wall) return { label: String(wall.name), dr: Number(wall.dr), hp: Number(wall.hp), damageTaken: taken };
    if (picked === "custom") return { label: L("CustomStructure"), dr: Number(value("dr")) || 0, hp: Number(value("hp")) || 0, damageTaken: taken };
    return null;
  };

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-detonate",
    itemTypes: ["equipment"],
    label: L("Detonate"),
    icon: "fa-solid fa-bomb",
    visible: (item: any) => on.demolition() && api.registry.isRuleOn("explosions") && chargeOf(item) !== null,
    run: (item: any, actor: any) => {
      void (async () => {
        const value = await ask(String(item.name ?? ""), [
          row(L("Pounds"), number("pounds", poundsOf(item))),
          row(L("Placement"), select("placement", [{ value: "contact", label: L("Contact") }, { value: "nearby", label: L("Nearby") }])),
          row(L("Distance"), number("distance", 1)),
          row(L("Target"), select("structure", structures())),
          row(L("CustomDr"), number("dr", 0, "1")),
          row(L("CustomHp"), number("hp", 0, "1")),
          row(L("DamageTaken"), number("taken", 0, "1")),
          checkbox("shaped", L("Shaped")),
          ...(on.sideEffects() ? [row(L("Enclosure"), select("enclosure", ENCLOSURES.map((e) => ({ value: e, label: L(`Enclosures.${e || "none"}`) }))))] : []),
          `<p class="ihint" style="margin:0">${esc(L("DetonateHint"))}</p>`,
        ].join(""), L("Detonate"));
        if (!value) return;
        await setOff(actor, item, {
          pounds: Number(value("pounds")) || 0,
          placement: value("placement") === "nearby" ? "nearby" : "contact",
          distance: Number(value("distance")) || 0,
          structure: structureFrom(value),
          shaped: value("shaped") === "on",
          enclosure: ((ENCLOSURES as readonly string[]).includes(value("enclosure")) ? value("enclosure") : "") as Enclosure,
        });
      })();
    },
  } as any);

  // How much a job takes, and the Explosives (Demolition) roll to do it (pp. 182-183).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-plan-charge",
    itemTypes: ["equipment"],
    label: L("Plan"),
    icon: "fa-solid fa-ruler-combined",
    visible: (item: any) => on.demolition() && chargeOf(item) !== null,
    run: (item: any, actor: any) => { void planCharge(item, actor); },
  } as any);

  const planCharge = async (item: any, actor: any) => {
    const charge = chargeOf(item);
    if (!charge) return;
    const value = await ask(String(item.name ?? ""), [
      row(L("Job"), select("job", DEMOLITION_JOBS.map((j) => ({ value: j, label: L(`Jobs.${j}`) })))),
      row(L("Sizes.depthFeet"), number("depthFeet", 0)),
      row(L("Sizes.thicknessInches"), number("thicknessInches", 0)),
      row(L("Sizes.thicknessFeet"), number("thicknessFeet", 0)),
      row(L("Sizes.areaSquareInches"), number("areaSquareInches", 0)),
      row(L("Sizes.holeFeet"), number("holeFeet", 0)),
      checkbox("tamped", L("Tamped")),
      checkbox("shaped", L("ShapedJob")),
      `<p class="ihint" style="margin:0">${esc(L("PlanHint"))}</p>`,
    ].join(""), L("Plan"));
    if (!value) return;
    const job = (DEMOLITION_JOBS as readonly string[]).includes(value("job")) ? (value("job") as DemolitionJob) : "brickWall";
    const size: JobSize = {};
    for (const key of JOB_INPUTS[job]) size[key] = Number(value(key)) || 0;
    const tamped = value("tamped") === "on" && canTamp(job);
    const shaped = value("shaped") === "on" && canShape(job);
    const needed = chargeFor({ job, size, ref: charge.row.ref, tamped, shaped });
    const have = poundsOf(item);
    const name = String(item.name ?? "");
    const lines = [
      F("PlanNeeds", { job: L(`Jobs.${job}`), pounds: Math.round(needed * 100) / 100, name, ref: charge.row.ref }),
      ...(tamped ? [L("PlanTamped")] : []),
      ...(shaped ? [L("PlanShaped")] : []),
      F(have >= needed ? "PlanEnough" : "PlanShort", { have: Math.round(have * 100) / 100 }),
    ];
    await say(actor, L("PlanTitle"), lines);
    if (!(needed > 0)) return;
    // A home-made shaped charge at TL6 takes two rolls, at -4 and -5; from TL7 one (p. 183).
    const unstable = on.unstable() && charge.homeMade === "unstable" ? [{ label: L("UnstableBatch"), value: UNSTABLE_PENALTY }] : [];
    const skillTl = Number(/\/TL(\d+)/i.exec(String((actor?.items ?? []).find?.((i: any) => i?.type === "skill" && /^explosives\b.*demolition/i.test(String(i.name ?? "")))?.name ?? ""))?.[1] ?? actor?.system?.tl) || 7;
    const steps = shaped ? shapedChargeRolls(skillTl) : [0];
    for (const [index, modifier] of steps.entries()) {
      const extra = [...(modifier ? [{ label: L(index === 0 && steps.length > 1 ? "ShapedRemember" : "ShapedMake"), value: modifier }] : []), ...unstable];
      const outcome = await skillRoll(api, actor, [{ skill: DEMOLITION, modifier: 0 }], F("PlanRoll", { job: L(`Jobs.${job}`) }), extra, ["demolition"]);
      if (!outcome) return;
      if (!outcome.success) {
        await say(actor, L("PlanTitle"), [L(outcome.criticalFailure ? "PlanCriticalFailure" : shaped && index < steps.length - 1 ? "PlanShapedForgotten" : "PlanFailed")]);
        return;
      }
    }
    await say(actor, L("PlanTitle"), [L(have >= needed ? "PlanSuccess" : "PlanSuccessShort")]);
  };

  // ── unstable and home-made explosives (pp. 184-187) ──
  const jolt = async (actor: any, item: any, number: number, fromBlow: boolean) => {
    const rolled = roll3d();
    const name = String(item.name ?? "");
    const goes = shockDetonates(rolled, number);
    await say(actor, name, [F(fromBlow ? "JoltedByBlow" : "Jolted", { name, roll: rolled, number }), L(goes ? "JoltExplodes" : "JoltHolds")]);
    if (goes) await setOff(actor, item, { pounds: poundsOf(item), placement: "contact", distance: 0, structure: null, shaped: false, enclosure: "", label: F("JoltLabel", { name, pounds: poundsOf(item) }) });
  };

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-explosives-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-explosives-item.hbs`,
    visible: (item: any) => on.unstable() && chargeOf(item) !== null,
    context: (item: any) => {
      const charge = chargeOf(item)!;
      const number = shockNumber(charge.row, charge.shockOn);
      return {
        editable: item.isOwner,
        field: `system.extensions.${MODULE_ID}.explosive`,
        shockOn: charge.shockOn,
        // Only nitro sweats or comes out impure: the number is for an explosive with nitro in it, or one already set (pp. 184-185).
        sweats: carriesNitro(charge.row) || charge.shockOn > 0,
        homeMade: charge.homeMade,
        flaws: FLAWS.map((f) => ({ value: f, label: L(`Flaws.${f || "none"}`), selected: f === charge.homeMade })),
        line: number === null ? L("Stable") : F("ShockLine", { number }),
      };
    },
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-explosive-shock",
    itemTypes: ["equipment"],
    label: L("Jolt"),
    icon: "fa-solid fa-hand-back-fist",
    visible: (item: any) => {
      const charge = on.unstable() ? chargeOf(item) : null;
      return charge !== null && shockNumber(charge.row, charge.shockOn) !== null;
    },
    run: (item: any, actor: any) => {
      const charge = chargeOf(item);
      const number = charge ? shockNumber(charge.row, charge.shockOn) : null;
      if (number !== null) void jolt(actor, item, number, false);
    },
  } as any);

  // Boiling dynamite for its nitro (p. 185).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-skim-nitro",
    itemTypes: ["equipment"],
    label: L("Skim"),
    icon: "fa-solid fa-flask",
    visible: (item: any) => on.unstable() && isDynamite(chargeOf(item)?.row ?? null),
    run: (item: any, actor: any) => {
      void (async () => {
        const name = String(item.name ?? "");
        const outcome = await skillRoll(api, actor, [{ skill: "Chemistry", modifier: SKIM_MODIFIER }, { skill: DEMOLITION, modifier: SKIM_MODIFIER }], F("SkimRoll", { name }), [], ["skimming"]);
        if (!outcome) return;
        const result = skimOutcome(Boolean(outcome.success), Number(outcome.margin) || 0);
        await say(actor, name, [F(`SkimOutcome.${result}`, { name })]);
        if (result === "half" || result === "all") {
          const pounds = poundsOf(item) * (result === "half" ? 0.5 : 1);
          await setOff(actor, item, { pounds, placement: "contact", distance: 0, structure: null, shaped: false, enclosure: "", label: F("SkimLabel", { name, pounds }) });
        }
      })();
    },
  } as any);

  // A home-cooked batch (pp. 186-187).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-cook-explosive",
    itemTypes: ["equipment"],
    label: L("Cook"),
    icon: "fa-solid fa-mortar-pestle",
    visible: (item: any) => on.unstable() && recipeFor(chargeOf(item)?.row ?? null) !== null,
    run: (item: any, actor: any) => { void cook(item, actor); },
  } as any);

  const cook = async (item: any, actor: any) => {
    const charge = chargeOf(item);
    const recipe: Recipe | null = recipeFor(charge?.row ?? null);
    if (!charge || !recipe) return;
    const name = String(item.name ?? "");
    let flaw: Flaw = "sound";
    for (const [index, step] of RECIPES[recipe].entries()) {
      const outcome = await skillRoll(api, actor, step, F("CookRoll", { name, step: index + 1 }), [], ["homeMade"]);
      if (!outcome) return;
      if (outcome.success) continue;
      if (outcome.criticalFailure && blowsUpOnCriticalFailure(recipe)) {
        await item.update({ [`system.extensions.${MODULE_ID}.explosive.homeMade`]: "sound" });
        await say(actor, name, [F("CookBlowsUp", { name })]);
        await setOff(actor, item, { pounds: poundsOf(item), placement: "contact", distance: 0, structure: null, shaped: false, enclosure: "", label: F("CookLabel", { name, pounds: poundsOf(item) }) });
        return;
      }
      flaw = failedBatch(recipe, d6());
      break;
    }
    await item.update({ [`system.extensions.${MODULE_ID}.explosive.homeMade`]: flaw });
    await say(actor, name, [F(`Cooked.${flaw}`, { name })]);
  };

  // A fuel-air blast is divided by 2 x the distance (p. 187).
  Hooks.on(api.combat.hooks.explosionFalloff, (context: any) => {
    if (!on.unstable()) return;
    const flag = context?.flag ?? {};
    let fuelAir = flag.source === DETONATION_SOURCE && String(flag.label ?? "").includes(fuelAirLabel);
    if (!fuelAir && context?.itemUuid) {
      const item = (globalThis as any).fromUuidSync?.(String(context.itemUuid));
      fuelAir = isFuelAir(chargeOf(item)?.row ?? null) || Boolean(item && extras.fuelAirBomb?.(item));
    }
    if (fuelAir) context.divisorPerYard = FUEL_AIR_DIVISOR_PER_YARD;
  });

  // ── incendiaries (p. 188) ──
  const thermite: LingeringBurn = {
    flag: THERMITE_FLAG,
    condition: THERMITE_CONDITION,
    on: () => on.incendiaries() || Boolean(extras.thermiteGrenadesOn?.()),
    title: () => L("Thermite.Title"),
    conditionLabel: (seconds) => F("Thermite.Burning", { seconds }),
    dice: { dice: THERMITE.dice, adds: THERMITE.adds },
    dr: (a, actor, state) => thermiteDr(Number((a.actors.derived(actor) as any)?.drByLocation?.[String(state.location ?? "torso")]) || 0, Number(state.damage) || 0),
    after: (state, rolled) => ({ ...state, damage: (Number(state.damage) || 0) + rolled }),
    secondLine: ({ name, roll, dr, injury, state }) => F("Thermite.Second", { name, roll, dr, injury, location: String(state.location ?? "torso") }),
    burnedOutLine: (name) => F("Thermite.BurnedOut", { name }),
  };
  registerLingeringBurn(api, thermite);

  const napalm: LingeringBurn = {
    flag: NAPALM_FLAG,
    condition: NAPALM_CONDITION,
    on: on.incendiaries,
    title: () => L("Napalm.Title"),
    conditionLabel: (seconds) => F("Napalm.Burning", { seconds }),
    dice: { dice: NAPALM.dice, adds: NAPALM.adds },
    // "Like ordinary flame": the victim's large-area DR (Campaigns pp. 400, 433).
    dr: (a, actor) => largeAreaDr(a, actor),
    secondLine: ({ name, roll, dr, injury }) => F("Napalm.Second", { name, roll, dr, injury }),
    burnedOutLine: (name) => F("Napalm.BurnedOut", { name }),
  };
  registerLingeringBurn(api, napalm);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-thermite",
    itemTypes: ["equipment"],
    label: L("Thermite.Ignite"),
    icon: "fa-solid fa-fire-flame-simple",
    visible: (item: any) => (on.incendiaries() && isThermite(item)) || (extras.thermiteGrenade?.(item) ?? null) !== null,
    run: (item: any, actor: any) => { void igniteThermite(item, actor); },
  } as any);

  const igniteThermite = async (item: any, actor: any) => {
    const target = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
    const locations = Object.keys((api.rules as any).HIT_LOCATIONS ?? { torso: {} });
    // A thermite grenade burns for its own time, not by the pound (p. 192).
    const grenadeSeconds = extras.thermiteGrenade?.(item) ?? null;
    const value = await ask(String(item.name ?? ""), [
      ...(grenadeSeconds === null ? [row(L("Pounds"), number("pounds", Math.max(1, Math.floor(Number(item.system?.quantity) || 1))))] : []),
      row(L("Thermite.On"), select("on", [...(target ? [{ value: "actor", label: F("Thermite.OnTarget", { name: String(target.name ?? "") }) }] : []), { value: "object", label: L("Thermite.OnObject") }])),
      row(L("Thermite.Location"), select("location", locations.map((l) => ({ value: l, label: l })).sort((a, b) => (a.value === "torso" ? -1 : b.value === "torso" ? 1 : 0)))),
      row(L("Target"), select("structure", structures().filter((s) => s.value !== ""))),
      row(L("CustomDr"), number("dr", 0, "1")),
      row(L("CustomHp"), number("hp", 0, "1")),
      `<p class="ihint" style="margin:0">${esc(L("Thermite.Hint"))}</p>`,
    ].join(""), L("Thermite.Ignite"));
    if (!value) return;
    const seconds = grenadeSeconds ?? thermiteSeconds(Number(value("pounds")) || 0);
    if (seconds <= 0) return;
    const sparks = F("Thermite.Sparks", { near: THERMITE_SPARKS[0].damage, far: THERMITE_SPARKS[1].damage });
    if (value("on") === "actor" && target) {
      const location = locations.includes(value("location")) ? value("location") : "torso";
      if (!target.isOwner) return void ui.notifications?.warn(L("Thermite.NotOwner"));
      const left = await startBurn(api, target, thermite, { seconds, damage: 0, location });
      await say(actor, L("Thermite.Title"), [F("Thermite.Lit", { name: String(target.name ?? ""), location, seconds: left }), sparks]);
      return;
    }
    const structure = structureFrom(value);
    if (!structure || !(structure.hp > 0)) return void ui.notifications?.warn(L("Thermite.NoObject"));
    const rolls = Array.from({ length: seconds }, roll3d);
    const burned = thermiteOnObject(rolls, structure.dr, Math.max(1, structure.hp - (structure.damageTaken ?? 0)));
    await say(actor, L("Thermite.Title"), [
      F(burned.through ? "Thermite.Through" : "Thermite.NotThrough", { label: structure.label, seconds: burned.seconds, of: seconds, injury: burned.injury, hp: structure.hp, dr: structure.dr, drLeft: burned.drLeft }),
      sparks,
    ]);
  };

  // What a blow leaves: the HT rolls a blast calls for, a jolt to nitro, napalm clinging.
  Hooks.on(api.combat.hooks.afterDamage, async (context: any) => {
    const victim = context?.actor;
    const damage = context?.damage;
    const result = context?.result;
    if (!victim?.isOwner || !damage || !result) return;

    // A blast: concussion from its crushing, the flash from its crushing or burning (p. 181-182).
    const blast = damage.blastDistance !== undefined && damage.source !== "fragments" && !damage.cinematicBlast;
    const type = String(damage.type ?? "");
    // A nuclear flash always applies (p. 195), the rest only with the side effects in play.
    const always = Boolean(context?.item && extras.alwaysFlash?.(context.item));
    if ((on.sideEffects() || always) && blast && (type === "cr" || type === "burn")) {
      const signed = (n: number) => (n < 0 ? String(n) : `+${n}`);
      const hearing = concussionModifier(Number(result.penetrating) || 0);
      const vision = flashModifier(Number(damage.basicDamage) || 0);
      const concussion = on.sideEffects() && type === "cr" ? { modifier: hearing, shown: signed(hearing), rolled: false } : null;
      const flash = { modifier: vision, shown: signed(vision), rolled: false };
      await api.chat.post(`${MODULE_ID}.${SIDE_EFFECTS_CARD}`, { name: String(victim.name ?? ""), concussion, flash, always }, { actor: victim } as any);
    }

    // A jolt to whoever carries nitro, or dynamite sweating it (pp. 184-185).
    if (on.unstable() && (Number(damage.basicDamage) || 0) > 0) {
      for (const item of [...(victim.items ?? [])]) {
        const charge = chargeOf(item);
        if (!charge || item.system?.carried === false) continue;
        const number = shockNumber(charge.row, charge.shockOn);
        if (number !== null) await jolt(victim, item, number, true);
      }
    }

    // Napalm clings and burns for a minute (p. 188).
    const item = context?.item;
    if (on.incendiaries() && item && isNapalm(String(item.name ?? "")) && type === "burn" && damage.source !== "fragments") {
      const seconds = await startBurn(api, victim, napalm, { seconds: NAPALM.minSeconds });
      if (seconds > 0) await say(victim, L("Napalm.Title"), [F("Napalm.Clings", { name: String(victim.name ?? ""), seconds })]);
    }
  });
}

/** A victim's large-area DR: the torso's and the least-protected location's, averaged (Campaigns p. 400). */
function largeAreaDr(api: GWorldApi, actor: any): number {
  const byLocation = (api.actors.derived(actor) as any)?.drByLocation ?? {};
  const rules = api.rules as any;
  const locations: readonly string[] = rules.LARGE_AREA_LOCATIONS ?? ["torso"];
  const exposed = locations.map((location) => ({ location, dr: Number(byLocation[location]) || 0 }));
  return rules.largeAreaDr?.({ torsoDr: Number(byLocation.torso) || 0, exposed })?.dr ?? (Number(byLocation.torso) || 0);
}

/** Worn gear's names, for the ear and eye protection a blast is met with. */
const wornNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i?.system?.equipped).map((i: any) => String(i.name ?? ""));

/**
 * The HT roll against a blast's concussion (hearing) or flash (vision), and
 * what a failure leaves: a penalty to the sense, or the sense lost, for
 * (20 - HT) minutes (two seconds with the sense protected), and a stun
 * (p. 182).
 */
async function senseRoll(api: GWorldApi, actor: any, sense: "hearing" | "vision", modifier: number): Promise<string> {
  const effects = (api.actors.derived(actor) as any)?.traitEffects ?? {};
  const protectedSense = effects.protectedSense?.[sense] === true;
  const worn = wornNames(actor);
  const bonus = sense === "hearing" ? hearingBonus(worn, protectedSense) : eyeBonus(worn, protectedSense);
  const ht = Number(api.actors.attribute(actor, "HT")) || 10;
  const modifiers = [
    ...(modifier ? [{ label: L(sense === "hearing" ? "ConcussionDamage" : "FlashDamage"), value: modifier }] : []),
    ...(bonus ? [{ label: L(sense === "hearing" ? "HearingProtection" : "EyeProtection"), value: bonus }] : []),
  ];
  const name = String(actor.name ?? "");
  const outcome: any = await api.roll.success({ actor, base: ht, kind: "attribute", label: F(sense === "hearing" ? "ConcussionRoll" : "FlashRoll", { name }), modifiers, tags: ["HT", "resist", sense === "hearing" ? "concussion" : "flash"] } as any);
  if (!outcome) return "";
  if (outcome.success) return F("Resisted", { name });
  const loss = senseLoss({ margin: Number(outcome.margin) || 0, criticalFailure: Boolean(outcome.criticalFailure), ht, protectedSense: bonus >= 5 });
  const key = sense === "hearing" ? (loss.total ? "ht-blast-deafened" : "ht-tinnitus") : loss.total ? "ht-flash-blinded" : "ht-dazzled";
  const label = loss.total ? L(sense === "hearing" ? "Deafened" : "FlashBlinded") : F(sense === "hearing" ? "Tinnitus" : "Dazzled", { penalty: loss.penalty });
  await api.actors.applyCondition(actor, {
    module: MODULE_ID, key, label, duration: { seconds: loss.seconds },
    ...(loss.total ? {} : { effects: { modifiers: [{ label, value: -loss.penalty, rolls: [sense] }] } }),
  } as any);
  await api.actors.applyCondition(actor, { key: "stunned" } as any);
  const lasting = loss.seconds < 60 ? F("ForSeconds", { seconds: loss.seconds }) : F("ForMinutes", { minutes: loss.seconds / 60 });
  return F(loss.total ? (sense === "hearing" ? "DeafenedLine" : "BlindedLine") : sense === "hearing" ? "TinnitusLine" : "DazzledLine", { name, penalty: loss.penalty, lasting });
}
