/**
 * The optional wounding rules at the table (High-Tech p. 162), each under its
 * own switch:
 *
 *   - **Body hits** (vitalsOnTorsoHits): an impaling or piercing hit on the
 *     torso rolls 1d; a 1 moves it to the vitals. Otherwise, and on the groin,
 *     the blow is capped at the victim's HP (twice that without Bleeding,
 *     Campaigns p. 420), and what the cap took off still counts toward the
 *     bleeding roll's -1 per 5 HP.
 *   - **Limb hits** (realisticLimbWounds): a limb or extremity that takes at
 *     least twice the injury that cripples it, before the cap, is crippled
 *     for good; an impaling or piercing blow must do twice that again to
 *     sever it. The GM is told.
 *   - **Stopping the bleeding** (vitalBleeding): a wound to the skull, an eye,
 *     the neck or the vitals bleeds every 30 seconds, at -2 more for the neck
 *     and -4 for the vitals, and needs Surgery. First Aid and Surgery take
 *     the bleeding roll's whole penalty. This is the shared severe-bleeding
 *     engine (Martial Arts prints a stricter one), with this book's table.
 *   - **"You shot me, Mister!"** (woundFrightChecks): 4 HP or more to the
 *     torso or head, or a crippled limb, offers the victim a Fright Check on
 *     their next turn, at -4 for a crippling wound.
 */

import { BLEEDING_TABLES, clearSevereWounds, readySevereBleeding, recordSevereWound, type BleedingTable } from "../../../shared/bleeding/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  LIMB_LOCATIONS,
  bodyHitCap,
  capExcessPenalty,
  leastCrippling,
  limbOutcome,
  rollsForVitals,
  severeWound,
  strikesVitals,
  woundFrightCheck,
  woundSizePenalty,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Wounding.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Wounding.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The injury the body-hit cap took off, still counted for bleeding. */
const EXCESS_FLAG = "htCapExcess";
/** The severe wounds this book's table found, for the shared engine. */
const SEVERE_FLAG = "htSevereWounds";
/** A Fright Check owed at the victim's next turn: its modifier. */
const FRIGHT_FLAG = "htWoundFright";
const FRIGHT_CARD = "ht-wound-fright";

export interface WoundingSwitches {
  vitals: () => boolean;
  limbs: () => boolean;
  bleeding: () => boolean;
  fright: () => boolean;
}

/** What the injury hook did to a blow, for the afterDamage hook to report. */
const marked = new WeakMap<object, { roll: number | null; vitals: boolean; capped: boolean }>();

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
const hpLost = (actor: any) => Math.max(0, (Number(actor?.system?.hp?.max) || 0) - (Number(actor?.system?.hp?.value) || 0));
const part = (location: string) => game.i18n.localize(`GWORLD.HitLocation.${location}`);
const gmIds = () => [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id);
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);

async function post(actor: any, title: string, text: string, whisper: boolean): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div><div class="gc-result">${esc(text)}</div></div>`,
    ...(whisper ? { whisper: gmIds() } : {}),
  });
}

export function readyWounding(api: GWorldApi, on: WoundingSwitches): void {
  const excessOf = (actor: any) => (on.vitals() ? Number(actor?.getFlag?.(MODULE_ID, EXCESS_FLAG)) || 0 : 0);

  // ── stopping the bleeding: the shared engine, with this book's table ──
  const table: BleedingTable = {
    book: "high-tech",
    on: on.bleeding,
    flag: SEVERE_FLAG,
    i18n: "GCC.HT.Wounding",
    woundSize: (actor) => woundSizePenalty(hpLost(actor) + excessOf(actor)),
  };
  BLEEDING_TABLES.register(table);
  readySevereBleeding(api);

  // ── body hits: the vitals roll and the cap ──
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const damage = context?.damage;
    if (!on.vitals() || !damage || damage.largeArea || damage.blastPlacement === "internal") return;
    const where = { hitLocation: String(damage.hitLocation ?? ""), addonLocation: damage.addonLocation ?? null, damageType: String(damage.type ?? "") };
    let roll: number | null = null;
    if (rollsForVitals(where)) {
      roll = d6();
      if (strikesVitals(roll)) {
        damage.hitLocation = "vitals";
        marked.set(damage, { roll, vitals: true, capped: false });
        return;
      }
    }
    const cap = bodyHitCap({ ...where, hp: Number(context.actor?.system?.hp?.max) || 10, bleeding: api.registry.isRuleOn("bleeding") });
    if (cap === null) return;
    // Another module's lower cap stands.
    const theirs = damage.injuryCap === null || damage.injuryCap === undefined ? null : Number(damage.injuryCap);
    if (theirs === null || cap < theirs) {
      damage.injuryCap = cap;
      damage.injuryCapReason = F("CapReason", { part: part(where.hitLocation) });
    }
    marked.set(damage, { roll, vitals: false, capped: true });
  });

  // What what the cap took off adds to the bleeding roll (-1 per 5 HP, counted with it).
  Hooks.on(api.combat.hooks.bleedingSchedule, (context: any) => {
    const excess = excessOf(context?.actor);
    if (excess > 0) context.modifier = (Number(context.modifier) || 0) + capExcessPenalty(hpLost(context.actor), excess);
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: FRIGHT_CARD,
    template: `modules/${MODULE_ID}/templates/ht-wound-fright.hbs`,
    actions: {
      roll: async ({ message, data, actor }: any) => {
        if (!actor || data.rolled) return;
        await api.roll.frightCheck(actor, Number(data.modifier) || 0);
        await api.chat.update(message, { ...data, rolled: true });
      },
    },
  } as any);
  const offerFright = async (actor: any, modifier: number) => {
    await api.chat.post(`${MODULE_ID}.${FRIGHT_CARD}`, {
      title: L("FrightTitle"),
      text: F("FrightText", { name: String(actor.name ?? ""), modifier: modifier ? `${modifier}` : "+0" }),
      button: F("FrightRoll", { modifier: modifier ? `${modifier}` : "+0" }),
      modifier,
      rolled: false,
    }, { actor } as any);
  };

  Hooks.on(api.combat.hooks.afterDamage, async (context: any) => {
    const victim = context?.actor;
    const result = context?.result;
    const damage = context?.damage;
    // The hook fires on the client that applied the blow, which owns the victim.
    if (!victim?.isOwner || !result) return;
    const location = String(result.hitLocation ?? "");
    const type = String(damage?.type ?? "");
    const uncapped = Number(result.uncappedInjury ?? (Number(result.injury) || 0) + (Number(result.excessLost) || 0)) || 0;
    // A victim who wasn't bleeding before this blow has nothing left of old wounds to bleed from.
    const wasBleeding = Boolean(victim.statuses?.has?.("bleeding"));
    if (!wasBleeding) {
      if (victim.getFlag(MODULE_ID, EXCESS_FLAG) !== undefined) await victim.unsetFlag(MODULE_ID, EXCESS_FLAG);
      await clearSevereWounds(victim, table);
    }

    // ── body hits (p. 162) ──
    const mark = damage ? marked.get(damage) : undefined;
    if (mark && on.vitals()) {
      if (mark.roll !== null) {
        await post(victim, L("VitalsTitle"), F(mark.vitals ? "VitalsHit" : "VitalsMissed", { name: String(victim.name ?? ""), roll: mark.roll }), false);
      }
      const lost = Number(result.injuryCap?.lost) || 0;
      if (mark.capped && lost > 0 && result.bleeds && api.registry.isRuleOn("bleeding")) {
        await victim.setFlag(MODULE_ID, EXCESS_FLAG, excessOf(victim) + lost);
      }
    }

    // ── limb hits (p. 162) ──
    if (on.limbs() && result.crippled && LIMB_LOCATIONS.includes(location) && !result.addonLocation) {
      const traits = api.actors.derived(victim)?.traitEffects ?? {};
      const limbs = { arms: 2 + (Number(traits.extraArms) || 0), legs: 2 + (Number(traits.extraLegs) || 0) };
      const threshold = Number((api.rules as any).cripplingThreshold?.(location, Number(victim.system?.hp?.max) || 10, limbs));
      if (Number.isFinite(threshold)) {
        const outcome = limbOutcome({ injury: uncapped, threshold, damageType: type });
        if (outcome) {
          await post(victim, L("LimbTitle"), F(outcome === "severed" ? "LimbSevered" : "LimbPermanent", {
            name: String(victim.name ?? ""), part: part(location), injury: uncapped, least: leastCrippling(threshold),
          }), true);
        }
      }
    }

    // ── stopping the bleeding (p. 162) ──
    if (on.bleeding() && result.bleeds && uncapped > 0) {
      const wound = severeWound(location);
      if (wound) await recordSevereWound(victim, table, wound);
    }

    // ── "You shot me, Mister!" (p. 162) ──
    if (on.fright()) {
      const modifier = woundFrightCheck({ hitLocation: location, injury: Number(result.injury) || 0, crippled: Boolean(result.crippled) });
      if (modifier !== null) {
        const combat = (game as any).combat;
        const inFight = Boolean(combat?.started && [...(combat.combatants ?? [])].some((c: any) => c.actor?.uuid === victim.uuid));
        if (inFight) {
          // On the victim's next turn; two wounds before then make one check, at the worse modifier.
          const owed = victim.getFlag(MODULE_ID, FRIGHT_FLAG);
          await victim.setFlag(MODULE_ID, FRIGHT_FLAG, owed === undefined ? modifier : Math.min(Number(owed) || 0, modifier));
        } else {
          await offerFright(victim, modifier);
        }
      }
    }
  });

  Hooks.on(api.combat.hooks.turnStart, async (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!actor || !isActiveGm()) return;
    const owed = actor.getFlag?.(MODULE_ID, FRIGHT_FLAG);
    if (owed === undefined) return;
    await actor.unsetFlag(MODULE_ID, FRIGHT_FLAG);
    if (on.fright()) await offerFright(actor, Number(owed) || 0);
  });
}
