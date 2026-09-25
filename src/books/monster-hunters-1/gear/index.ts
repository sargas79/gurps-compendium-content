/**
 * Monster Hunters 1's gear (pp. 53-54, 59-61, 63), registered with the system
 * through the add-on API, ported from the system's gadget, weapon improvement
 * and special ammunition branches.
 *
 *   - **init:** this module's gear fields on equipment and armour.
 *   - **ready:** the price modifier; the attack rows, breakage odds, Holdout
 *     (the worn article's bonus as a Holdout roll's clothing line) and
 *     equipment failure through the system's hooks; an item sheet section
 *     for the options and loads; and a Gear tab section for Signature Gear and
 *     concealment. The mind disruptor's and neutralizer's Will rolls take the
 *     victim's Mind Shield and no DR (p. 58).
 */

import { dropAfflictionDr } from "../../../shared/affliction-dr.js";
import { isHoldoutRoll, wearClothingLine } from "../../../shared/concealment/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { gearData, loadFor, registerGearData, storeGear, type GearData, type StoredLoad } from "./data.js";
import {
  adjustWeaponRows,
  askedWeapon,
  bookBreakage,
  concealmentOf,
  gearPrice,
  isGadget,
  isWeapon,
  signatureGearOf,
  weaponClassOf,
  weaponProblems,
} from "./effects.js";
import { gadgetCostFactor, gadgetWeightFactor, RUGGED_BONUS } from "./gadgets.js";
import {
  HAND_LOADED,
  PAYLOAD_OPTIONS,
  POWDER_OPTIONS,
  ammunitionProblems,
  isShotgun,
  specialReloadCost,
} from "./special-ammunition.js";
import { improvedWeaponPrice, allowedWeapon } from "./weapon-improvements.js";
import { isMindWeapon, mindShieldLevels } from "./mind-weapons.js";

const L = (key: string) => game.i18n.localize(`GCC.MH1.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MH1.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Registers what must exist before the world's data is read. */
export function initGear(): void {
  registerGearData();
}

/** The item sheet section's data. */
function itemContext(api: GWorldApi, item: any): Record<string, unknown> {
  const data = gearData(item);
  const priced = gearPrice(api, item);
  const context: Record<string, unknown> = { data, priced: priced ? F("Gadget.PricedAt", { cost: priced.cost, weight: priced.weight }) : "" };
  if (isGadget(item)) {
    const quality = item.type === "equipment" && item.system?.category !== "tool" ? String(item.system?.equipmentQuality ?? "basic") : "basic";
    context.gadget = {
      clothing: item.type === "armor",
      undercover: [0, 1, 2].map((n) => ({ value: n, label: L(`Gadget.${n ? `Undercover${n}` : "UndercoverNone"}`), selected: data.gadget.undercover === n })),
      hint: F("Gadget.Priced", {
        cf: gadgetCostFactor(data.gadget, quality),
        weight: Math.round(gadgetWeightFactor(data.gadget) * 100) / 100,
        cost: data.listCost || Number(item.system?.listCost) || Number(item.system?.cost) || 0,
        listWeight: data.listWeight || Number(item.system?.weight) || 0,
      }),
    };
  }
  if (isWeapon(item)) {
    const weapon = askedWeapon(api, item, data);
    const cls = weaponClassOf(api, item);
    const list = { cost: data.listCost || Number(item.system?.listCost) || Number(item.system?.cost) || 0, weight: data.listWeight || Number(item.system?.weight) || 0 };
    context.weapon = {
      melee: cls !== "bow" && cls !== "firearm",
      bow: cls === "bow",
      twoHandedAxe: Boolean(weapon.twoHandedAxeOrMace),
      problems: weaponProblems(api, item, data).map((p) => L(`WeaponImprovement.Problem.${p}`)),
      hint: F("WeaponImprovement.Priced", { cf: improvedWeaponPrice(allowedWeapon(weapon), list).costFactor, cost: list.cost, weight: list.weight }),
    };
    if (cls === "firearm") {
      const rounds = (m: any) => (Number(m.reloadWeight) > 0 ? api.rules.ammunitionCost(Number(m.reloadWeight)) : 0);
      context.loads = ((item.system?.rangedModes ?? []) as any[]).map((m, index) => {
        const load = loadFor(data, index);
        return {
          index,
          name: String(m.name || F("SpecialAmmo.Mode", { index: index + 1 })),
          powders: POWDER_OPTIONS.map((o) => ({ value: o, label: L(`SpecialAmmo.Powder.${o || "none"}`), selected: load.powder === o })),
          payloads: PAYLOAD_OPTIONS.map((o) => ({ value: o, label: L(`SpecialAmmo.Payload.${o || "none"}`), selected: load.payload === o })),
          magazineCost: load.magazineCost,
          handLoaded: HAND_LOADED.has(load.powder) || HAND_LOADED.has(load.payload),
          adjust: [load.powderAdjust, load.payloadAdjust].filter(Boolean).map((a) => (a > 0 ? `+${a}` : String(a))).join(", "),
          reload: rounds(m) ? F("SpecialAmmo.ReloadCost", { cost: specialReloadCost({ ammunition: rounds(m), magazine: load.magazineCost, load }) }) : "",
        };
      });
    }
  }
  return context;
}

/** A section input's value, as the gear data holds it. */
function valueOf(input: HTMLInputElement | HTMLSelectElement): boolean | number {
  if (input instanceof HTMLInputElement && input.type === "checkbox") return input.checked;
  return Number(input.value) || 0;
}

/** Binds the item sheet section: each option stored as it changes, and what the book forbids refused. */
function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-gear]").forEach((input) => {
    input.addEventListener("change", async () => {
      const path = String(input.dataset.gccGear);
      const data = gearData(item);
      const value = valueOf(input);
      const [group, key] = path.split(".") as [keyof GearData, string | undefined];
      if (group === "weapon" && key) {
        const asked: GearData = { ...data, weapon: { ...data.weapon, [key]: Boolean(value) } };
        // An option the book doesn't allow on this weapon is refused: what it would leave is the weapon without it.
        const allowed = allowedWeapon(askedWeapon(api, item, asked));
        if (value && !(allowed.improvements as Record<string, unknown>)[key]) {
          const problem = weaponProblems(api, item, asked)[0];
          ui.notifications?.warn(F("WeaponImprovement.Refused", { problem: problem ? L(`WeaponImprovement.Problem.${problem}`) : key }));
          (input as HTMLInputElement).checked = false;
          return;
        }
        await storeGear(item, { weapon: asked.weapon });
        return;
      }
      if (group === "gadget" && key) {
        await storeGear(item, { gadget: { ...data.gadget, [key]: key === "undercover" ? Math.max(0, Math.min(2, Number(value))) : Boolean(value) } });
        return;
      }
      if (group === "improvisedPenalty") await storeGear(item, { improvisedPenalty: Math.min(0, Math.floor(Number(value))) });
      else if (group === "signature") await storeGear(item, { signature: Boolean(value) });
      else if (group === "holdout" || group === "listCost" || group === "listWeight") await storeGear(item, { [group]: Math.max(0, Number(value)) });
    });
  });

  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-load]").forEach((input) => {
    input.addEventListener("change", async () => {
      const mode = Number(input.dataset.mode);
      const data = gearData(item);
      const load: StoredLoad = { ...loadFor(data, mode) };
      const field = String(input.dataset.gccLoad);
      if (field === "magazineCost") load.magazineCost = Math.max(0, Number(input.value) || 0);
      else if (field === "powder" || field === "payload") {
        (load as any)[field] = input.value;
        // A changed option is bought, not hand-loaded.
        load[field === "powder" ? "powderAdjust" : "payloadAdjust"] = 0;
        const m = (item.system?.rangedModes ?? [])[mode] ?? {};
        const problems = ammunitionProblems(load, { shotgun: isShotgun({ skill: String(m.skill ?? ""), name: String(item.name ?? ""), projectiles: Number(m.projectiles ?? 1) || 1 }) });
        if (problems.length) {
          ui.notifications?.warn(F("SpecialAmmo.Refused", { problem: L(`SpecialAmmo.Problem.${problems[0]}`) }));
          (input as HTMLSelectElement).value = String(loadFor(data, mode)[field] ?? "");
          return;
        }
      }
      await storeGear(item, { loads: [...data.loads.filter((l) => l.mode !== mode), load].sort((a, b) => a.mode - b.mode) });
    });
  });

  element.querySelectorAll<HTMLElement>("[data-gcc-hand-load]").forEach((button) => {
    button.addEventListener("click", () => void handLoad(api, item, Number(button.dataset.mode)));
  });
}

/**
 * Hand-loads a batch (p. 63): an Armoury (Small Arms) roll for each
 * asterisked option in the load, each moving that option's CF down 2 on a
 * success or up 2 on a failure.
 */
async function handLoad(api: GWorldApi, item: any, mode: number): Promise<void> {
  const data = gearData(item);
  const load: StoredLoad = { ...loadFor(data, mode) };
  const actor = item.actor ?? null;
  let level: number | null = actor ? api.actors.skillLevel(actor, "Armoury (Small Arms)") : null;
  if (level === null) {
    const answer = await (foundry.applications.api as any).DialogV2.prompt({
      window: { title: L("SpecialAmmo.HandLoad") },
      content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(L("SpecialAmmo.ArmourySkill"))}</span><input type="number" name="level" value="10" step="1" style="width:64px"></label></div>`,
      ok: { label: L("SpecialAmmo.HandLoad"), callback: (_e: Event, b: HTMLElement) => Number(b.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="level"]')?.value ?? 10) },
      rejectClose: false,
    });
    if (answer === null || answer === undefined) return;
    level = Number(answer);
  }
  const lines: string[] = [];
  const rolls: any[] = [];
  for (const [option, field, group] of [[load.powder, "powderAdjust", "Powder"], [load.payload, "payloadAdjust", "Payload"]] as const) {
    if (!HAND_LOADED.has(option)) continue;
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const outcome = api.rules.resolveSuccess(roll.total, level);
    load[field] = outcome.success ? -2 : 2;
    lines.push(F(outcome.success ? "SpecialAmmo.HandLoadGood" : "SpecialAmmo.HandLoadWaste", { option: L(`SpecialAmmo.${group}.${option}`), roll: roll.total, level }));
  }
  if (!lines.length) return;
  await storeGear(item, { loads: [...data.loads.filter((l) => l.mode !== mode), load].sort((a, b) => a.mode - b.mode) });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(item.name)}</span><span class="gc-target">${esc(L("SpecialAmmo.HandLoad"))}</span></div>`
      + lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("") + `</div>`,
  });
}

/** Registers the table-side parts. */
export function readyGear(api: GWorldApi, on: () => boolean): void {
  // Improvements reprice the item; nothing is attached to it (pp. 54, 59-61).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "mh1-gear",
    types: ["equipment", "armor"],
    apply: (item) => {
      if (!on()) return null;
      const priced = gearPrice(api, item);
      return priced ? { cost: priced.cost, weight: priced.weight, label: L("Gadget.Title") } : null;
    },
  });

  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    adjustWeaponRows(api, context, (key) => ({ label: L(`SpecialAmmo.Note.${key}`), hint: L(`SpecialAmmo.NoteHint.${key}`) }), L("SpecialAmmo.FollowUp"));
  });

  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    if (on()) bookBreakage(api, context);
  });

  // Rugged: "+2 on rolls to avoid breakage, water damage, etc." (p. 54).
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    if (on() && gearData(context?.item).gadget.rugged) context.modifiers.push({ label: L("Gadget.Rugged"), value: RUGGED_BONUS });
  });

  // The mind disruptor and the neutralizer: Will "with a bonus equal to any
  // Mind Shield" (p. 58). Armour is no help, so the system's DR line goes.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !isMindWeapon(context.attack?.item)) return;
    dropAfflictionDr(context);
    const shield = mindShieldLevels(context.actor?.items ?? []);
    if (shield && Array.isArray(context.modifiers)) context.modifiers.push({ label: L("MindShield"), value: shield });
  });

  // An article's Holdout, and Undercover's, on a Holdout roll (p. 59): what the character wears,
  // the roll's `clothing` line (Characters p. 200; API 1.152.0), the better of it and one there.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !isHoldoutRoll(context) || !Array.isArray(context.modifiers)) return;
    const concealment = concealmentOf(context.actor);
    if (concealment.holdout) wearClothingLine(context.modifiers, concealment.holdout, `${L("Gadget.Holdout")} (${concealment.source})`);
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-gear-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/mh1-gear-item.hbs`,
    visible: (item) => on() && (isGadget(item) || isWeapon(item)),
    context: (item) => itemContext(api, item),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-gear-tab",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/mh1-gear-tab.hbs`,
    visible: (actor) => {
      if (!on()) return false;
      const signature = signatureGearOf(api, actor);
      const concealment = concealmentOf(actor);
      return Boolean(signature.needed || signature.points || concealment.holdout || concealment.smell);
    },
    context: (actor) => {
      const signature = signatureGearOf(api, actor);
      const concealment = concealmentOf(actor);
      return {
        signature: signature.needed || signature.points ? `${signature.needed} / ${signature.points}` : "",
        concealment: concealment.holdout ? `${L("Gadget.Holdout")} +${concealment.holdout}` : "",
        concealmentNote: [concealment.source, concealment.smell ? F("Gadget.SmellNote", { penalty: concealment.smell }) : ""].filter(Boolean).join(" "),
        showConcealment: Boolean(concealment.holdout || concealment.smell),
      };
    },
  });
}
