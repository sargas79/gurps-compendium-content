/**
 * Realistic injury at the table (GURPS Martial Arts pp. 136, 138-139).
 *
 * Partial injuries: wounds to an arm, leg or the torso are added up on the
 * character, and once 2×HT seconds have passed their pain becomes a condition.
 * Extreme dismemberment: a cut that severs an arm, hand, leg or foot the victim
 * is using may carry through to the other one. Severe bleeding: the worst
 * wound sets how often and how hard the character bleeds, what First Aid is at,
 * and whether it takes Surgery. Lasting injuries: a major wound to the neck,
 * skull, veins or vitals rolls on its table, and the GM is told what it left.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  LASTING_TRAITS,
  carryThroughDr,
  carryThroughInjury,
  otherPart,
  painSetsIn,
  painThreshold,
  namesTrait,
  painWill,
  partialInjury,
  severeWound,
  severs,
  woundDuration,
  woundEffect,
  woundTable,
  worstBleeding,
  type SevereWound,
  type WoundTable,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Injury.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Injury.${key}`, data);

const WOUNDS_FLAG = "partialWounds";
const LASTING_CARD = "ma-lasting";
/** What each part's long-term pain does now, for the hooks that can't be a condition's lines: kicks and Move. */
const EFFECTS_FLAG = "partialEffects";
type PartialEffects = Partial<Record<"arm" | "leg" | "torso", { dx: number; move: number }>>;
const SEVERE_FLAG = "severeWounds";

interface Wound { amount: number; round: number | null; time: number }
type Wounds = Partial<Record<"arm" | "leg" | "torso", Wound>>;

const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((i: any) => i.type === "trait" && pattern.test(String(i.name ?? "")));
const painOf = (actor: any): "high" | "low" | null => (traitNamed(actor, /^high pain threshold/i) ? "high" : traitNamed(actor, /^low pain threshold/i) ? "low" : null);
const now = () => ({ round: (game as any).combat?.started ? Number((game as any).combat.round) || 0 : null, time: Number((game as any).time?.worldTime) || 0 });
const whisperGm = (content: string, actor?: any) => ChatMessage.implementation.create({
  ...(actor ? { speaker: ChatMessage.implementation.getSpeaker({ actor }) } : {}),
  content: `<div class="gworld gworld-chat">${content}</div>`,
  whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id),
});
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);

/** Registers the four switches' hooks and the Surgery tool. */
export function readyInjury(api: GWorldApi, partial: () => boolean, dismember: () => boolean, bleeding: () => boolean, lasting: () => boolean): void {
  const hpOf = (actor: any) => Number(actor?.system?.hp?.max) || 10;
  const crippling = (location: string, actor: any): number | null => (api.rules as any).cripplingThreshold?.(location, hpOf(actor)) ?? null;
  const drAt = (actor: any, location: string) => Number(api.actors.derived(actor)?.drByLocation?.[location]) || 0;

  // A lasting injury that is a trait: the card finds it in the compendia, for the GM to drag onto the character.
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: LASTING_CARD,
    template: `modules/${MODULE_ID}/templates/ma-lasting.hbs`,
    actions: {
      findTrait: { permission: "gm", run: async ({ data }: any) => {
        const entry: any = await (globalThis as any).fromUuid?.(String(data.entryUuid ?? ""));
        const pack: any = entry?.pack ? (game as any).packs.get(entry.pack) : null;
        if (!pack) return void ui.notifications?.warn(F("NoTraitEntry", { trait: String(data.trait ?? "") }));
        // Rendered to the end before the search goes in, or the render clears it.
        const app: any = pack.apps?.[0] ?? null;
        if (app) await app.render({ force: true });
        else pack.render(true);
        const search = app?.element?.querySelector?.('input[type="search"]') as HTMLInputElement | null;
        if (!search) return;
        search.value = String(entry.name ?? data.trait ?? "");
        search.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        search.dispatchEvent(new Event("input", { bubbles: true }));
      } },
    },
  } as any);
  /** The compendium entry for a trait: the module's own packs first, as the system shows them. */
  const traitEntry = async (trait: string): Promise<any | null> => {
    const packs = [...((game as any).packs ?? [])].filter((p: any) => p.documentName === "Item")
      .sort((a: any, b: any) => Number(b.collection.startsWith(`${MODULE_ID}.`)) - Number(a.collection.startsWith(`${MODULE_ID}.`)));
    for (const pack of packs) {
      const index = await pack.getIndex();
      const found = [...index].filter((e: any) => e.type === "trait" && namesTrait(String(e.name ?? ""), trait))
        .sort((a: any, b: any) => String(a.name).length - String(b.name).length)[0];
      if (found) return found;
    }
    return null;
  };

  Hooks.on(api.combat.hooks.afterDamage, async (context: any) => {
    const victim = context?.actor;
    const result = context?.result;
    if (!victim || !result || !isActiveGm()) return;
    const location = String(result.hitLocation ?? "");
    const type = String(context.damage?.type ?? "");
    const raw = (Number(result.injury) || 0) + (Number(result.excessLost) || 0);

    // ── partial injuries (p. 136) ──
    if (partial() && ["arm", "leg", "torso"].includes(location) && !result.crippled && result.injury > 0 && victim.isOwner) {
      const wounds: Wounds = { ...(victim.getFlag(MODULE_ID, WOUNDS_FLAG) ?? {}) };
      const key = location as "arm" | "leg" | "torso";
      const at = now();
      wounds[key] = { amount: (wounds[key]?.amount ?? 0) + Number(result.injury), round: wounds[key]?.round ?? at.round, time: wounds[key]?.time ?? at.time };
      await victim.setFlag(MODULE_ID, WOUNDS_FLAG, wounds);
    }

    // ── extreme dismemberment and severe bleeding (pp. 136, 138) ──
    const threshold = crippling(location, victim);
    const severed = type === "cut" && severs(raw, threshold);
    const extremity = location === "hand" || location === "foot";
    if (bleeding() && victim.isOwner) {
      const wound = severeWound({
        hitLocation: location,
        addonLocation: result.addonLocation,
        damageType: type,
        // Destroying a part bleeds however it was destroyed.
        severed: severs(raw, threshold) ? (extremity ? "extremity" : "limb") : null,
      });
      if (wound && result.injury > 0) await victim.setFlag(MODULE_ID, SEVERE_FLAG, [...(victim.getFlag(MODULE_ID, SEVERE_FLAG) ?? []), wound]);
    }
    if (dismember() && severed && otherPart(location)) {
      const posture = String(victim.system?.posture ?? "standing");
      const usingBoth = Boolean(api.combat.grapple(victim)?.holding)
        || [...(victim.items ?? [])].some((i: any) => i.system?.equipped && (i.system?.meleeModes ?? []).some((m: any) => m?.twoHanded));
      const eligible = location === "leg" || location === "foot" ? ["standing", "lying"].includes(posture) : usingBoth;
      const attacker = context.item?.parent ?? null;
      if (eligible && attacker) await carryThrough(api, attacker, victim, context, location, !extremity);
    }

    // ── lasting injuries (pp. 138-139) ──
    if (lasting() && result.consequences?.majorWound) {
      const table = woundTable(location, result.addonLocation);
      if (table) await rollLasting(api, victim, table, Number(result.current) <= -hpOf(victim));
    }
  });

  // Carrying a severing cut through (p. 136).
  async function carryThrough(api: GWorldApi, attacker: any, victim: any, context: any, location: string, limb: boolean): Promise<void> {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("CarryTitle") },
      content: `<p>${F("CarryAsk", { attacker: foundry.utils.escapeHTML(String(attacker.name ?? "")), victim: foundry.utils.escapeHTML(String(victim.name ?? "")), part: game.i18n.localize(`GWORLD.HitLocation.${location}`) })}</p>`,
    });
    if (!confirmed) return;
    const row = ((api.actors.derived(attacker)?.melee ?? []) as any[]).find((r) => r.itemId === context.item?.id && (context.mode ? r.modeIndex === context.mode.index : true));
    const toHit = Number((api.rules as any).HIT_LOCATIONS?.[location]?.toHit) || 0;
    const outcome: any = await api.roll.success({
      actor: attacker,
      base: Number(row?.skillLevel) || 10,
      label: F("CarryLabel", { victim: String(victim.name ?? "") }),
      ...(row?.skillName ? { skill: row.skillName } : {}),
      modifiers: [...(toHit ? [{ label: game.i18n.localize(`GWORLD.HitLocation.${location}`), value: toHit }] : []), { label: L("CarryPenalty"), value: -1 }],
    } as any);
    if (!outcome?.success) return;
    const dr = carryThroughDr({ newDr: drAt(victim, location), severedDr: drAt(victim, location), hp: hpOf(victim), limb });
    const basic = Number(context.result?.basicDamage ?? context.damage?.basicDamage) || 0;
    const cap = crippling(location, victim);
    const injury = Math.min(carryThroughInjury(basic, dr), cap !== null ? Math.floor(cap) + 1 : Number.POSITIVE_INFINITY);
    if (injury > 0) await api.actors.applyInjury(victim, { amount: injury, label: L("CarryTitle") });
    await whisperGm(`<div class="gc-result">${foundry.utils.escapeHTML(F("CarryResult", { victim: String(victim.name ?? ""), part: game.i18n.localize(`GWORLD.HitLocation.${location}`), dr, injury }))}</div>`, attacker);
  }

  // ── partial injuries set in (p. 136) ──
  Hooks.on(api.combat.hooks.turnStart, async (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!actor?.isOwner || !isActiveGm()) return;
    const wounds: Wounds = actor.getFlag(MODULE_ID, WOUNDS_FLAG) ?? {};
    const clear = async (location: string) => {
      const id = `${MODULE_ID}.ma-partial-${location}`;
      if (((api.actors.conditions(actor) ?? []) as any[]).some((c) => c.id === id)) await api.actors.removeCondition(actor, id);
    };
    // Healed, switched off, or no wound on record: the pain goes.
    const healed = Number(actor.system?.hp?.value) >= hpOf(actor);
    if (!partial() || !Object.keys(wounds).length || healed) {
      if (healed && Object.keys(wounds).length) await actor.unsetFlag(MODULE_ID, WOUNDS_FLAG);
      for (const location of ["arm", "leg", "torso"]) await clear(location);
      if (actor.getFlag(MODULE_ID, EFFECTS_FLAG)) await actor.unsetFlag(MODULE_ID, EFFECTS_FLAG);
      return;
    }
    const effects: PartialEffects = {};
    const at = now();
    const ht = Number(api.actors.attribute(actor, "HT")) || 10;
    const pain = painOf(actor);
    for (const [location, wound] of Object.entries(wounds) as Array<["arm" | "leg" | "torso", Wound]>) {
      const elapsed = at.round !== null && wound.round !== null ? at.round - wound.round : at.time - wound.time;
      if (!painSetsIn(elapsed, ht)) continue;
      const effect = partialInjury(location, wound.amount, hpOf(actor));
      if (!effect) {
        await clear(location);
        continue;
      }
      const dx = painThreshold(effect.dx, pain);
      effects[location] = { dx, move: effect.move };
      // An arm's pain is on what it does; the torso's on every DX roll. A leg's
      // is on kicks, which no condition can name, so a hook adds it (below).
      const rolls = location === "torso" ? ["attack", "parry", "block", "DX"] : ["attack", "parry", "block"];
      await api.actors.applyCondition(actor, {
        module: MODULE_ID,
        key: `ma-partial-${location}`,
        label: F(`Partial.${location}${effect.willRoll ? "Will" : ""}`, { dx, will: `${painWill(pain) >= 0 ? "+" : ""}${painWill(pain)}` }),
        effects: {
          modifiers: [
            ...(dx && location !== "leg" ? [{ label: L("LongTermPain"), value: dx, rolls }] : []),
            ...(effect.dodge ? [{ label: L("LongTermPain"), value: effect.dodge, rolls: ["dodge"] }] : []),
          ],
        },
      });
    }
    await actor.setFlag(MODULE_ID, EFFECTS_FLAG, effects);
  });

  const effectsOf = (actor: any): PartialEffects => (partial() ? (actor?.getFlag?.(MODULE_ID, EFFECTS_FLAG) ?? {}) : {});
  // A wounded leg kicks at its pain's penalty (p. 136).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const leg = effectsOf(context?.actor).leg;
    if (!leg?.dx || context.ranged) return;
    const label = `${String(context.dataset?.rollLabel ?? "")} ${String(context.mode?.derived ?? "")}`;
    if (/kick/i.test(label)) context.modifiers.push({ label: L("LongTermPain"), value: leg.dx });
  });
  // Wounded legs and torsos slow a fighter down (p. 136; API 1.42.0).
  Hooks.on((api.data.hooks as any).moveModifiers ?? "gworld.moveModifiers", (context: any) => {
    const effects = effectsOf(context?.actor);
    for (const location of ["leg", "torso"] as const) {
      const move = effects[location]?.move;
      if (move !== undefined && move < 1) context.lines.push({ label: L(`MoveLabel.${location}`), multiplier: move });
    }
  });

  // ── severe bleeding (p. 138) ──
  const severeOf = (actor: any): SevereWound | null => {
    if (!bleeding() || !actor?.statuses?.has?.("bleeding")) return null;
    return worstBleeding((actor.getFlag?.(MODULE_ID, SEVERE_FLAG) ?? []) as SevereWound[]);
  };
  Hooks.on(api.combat.hooks.bleedingSchedule, (context: any) => {
    const worst = severeOf(context?.actor);
    if (!worst) return;
    context.intervalSeconds = Math.min(Number(context.intervalSeconds) || 60, worst.intervalSeconds);
    context.modifier = (Number(context.modifier) || 0) + worst.modifier;
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!(context?.tags ?? []).includes("firstAid")) return;
    const worst = severeOf(context.opponent);
    if (worst?.modifier) context.modifiers.push({ label: L("SevereWound"), value: worst.modifier });
  });
  Hooks.on(api.combat.hooks.firstAid, (context: any) => {
    const worst = severeOf(context?.patient);
    if (worst?.surgery) context.stopsBleeding = false;
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-staunch-surgery",
    label: L("Staunch"),
    icon: "fa-solid fa-kit-medical",
    visible: bleeding,
    open: () => staunch(api),
  });
  async function staunch(api: GWorldApi): Promise<void> {
    const patient = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
    if (!patient) return void ui.notifications?.warn(L("StaunchWho"));
    // The selected token's character operates, or whoever the GM picks.
    let surgeon = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
    if (!surgeon) {
      const options = [...((game as any).actors ?? [])].filter((a: any) => a.type === "character" && a.id !== patient.id).map((a: any) => `<option value="${a.id}">${foundry.utils.escapeHTML(String(a.name))}</option>`).join("");
      const id = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("Staunch") },
        content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px"><span>${L("Surgeon")}</span><select name="surgeon">${options}</select></label></div>`,
        ok: { label: L("Staunch"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="surgeon"]')?.value ?? "" },
        rejectClose: false,
      }) as string | null;
      surgeon = id ? (game as any).actors?.get(id) ?? null : null;
    }
    if (!surgeon) return;
    const level = api.actors.skillLevel(surgeon, "Surgery");
    if (level === null) return void ui.notifications?.warn(L("NoSurgery"));
    const worst = severeOf(patient);
    const outcome: any = await api.roll.success({
      actor: surgeon,
      base: level,
      label: F("StaunchLabel", { patient: String(patient.name ?? "") }),
      skill: "Surgery",
      modifiers: worst?.modifier ? [{ label: L("SevereWound"), value: worst.modifier }] : [],
    } as any);
    if (!outcome?.success) return;
    await api.actors.stopBleeding(patient);
    if (patient.isOwner) await patient.unsetFlag(MODULE_ID, SEVERE_FLAG);
  }

  // ── lasting injuries (pp. 138-139) ──
  async function rollLasting(api: GWorldApi, victim: any, first: WoundTable, grave: boolean): Promise<void> {
    let table = first;
    let effect: string | null = null;
    const rolls: number[] = [];
    for (let hops = 0; hops < 3; hops += 1) {
      const roll = new Roll("3d6");
      await roll.evaluate();
      rolls.push(Number(roll.total));
      effect = woundEffect(table, Number(roll.total));
      if (!effect?.startsWith("reroll:")) break;
      table = effect.slice("reroll:".length) as WoundTable;
    }
    if (!effect) {
      await whisperGm(`<div class="gc-result">${foundry.utils.escapeHTML(F("NoLasting", { victim: String(victim.name ?? ""), rolls: rolls.join(", ") }))}</div>`, victim);
      return;
    }
    const ht = Number(api.actors.attribute(victim, "HT")) || 10;
    const outcome: any = await api.roll.success({ actor: victim, base: ht, label: L("DurationRoll"), kind: "attribute" } as any);
    const duration = woundDuration(outcome ?? { success: true });
    const key = `${effect}${grave && game.i18n.has(`GCC.MA.Injury.Effects.${effect}Grave`) ? "Grave" : ""}`;
    const trait = LASTING_TRAITS[key] ?? null;
    const entry = trait ? await traitEntry(trait) : null;
    await api.chat.post(`${MODULE_ID}.${LASTING_CARD}`, {
      title: L("LastingTitle"),
      text: F("LastingResult", {
        victim: String(victim.name ?? ""),
        table: L(`Tables.${table}`),
        rolls: rolls.join(", "),
        effect: L(`Effects.${key}`),
        duration: L(`Durations.${duration}`),
      }),
      buttons: entry ? [{ action: "findTrait", label: F("FindTrait", { trait: String(entry.name ?? trait) }) }] : [],
      trait: trait ?? "",
      entryUuid: entry ? String(entry.uuid ?? "") : "",
    }, { actor: victim, whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id) } as any);
  }
}
