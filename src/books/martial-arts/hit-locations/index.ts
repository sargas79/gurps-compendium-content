/**
 * New hit locations at the table (GURPS Martial Arts p. 137).
 *
 * The book's locations are registered with the system under their Basic Set
 * parents, offered only while the switch is on and only on a body that has
 * them. Random hits are refined with the book's 1d sub-rolls. A wound that
 * cuts off an ear, breaks or lops off a nose, cripples the spine or a joint
 * posts a card; what it costs the character is the GM's to confirm there.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { LOCATIONS, locationAvailable, refineRandomHit, woundOutcome, type Parent, type Removal, type WoundOutcome } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.HitLocations.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.HitLocations.${key}`, data);

const OUTCOME_CARD = "ma-wound-outcome";

/** What a body's traits take away (p. 137). */
function removalsOf(actor: any): Set<Removal> {
  const names = [...(actor?.items ?? [])].filter((item: any) => item.type === "trait").map((item: any) => String(item.name ?? "").toLowerCase());
  const has = (pattern: RegExp) => names.some((name) => pattern.test(name));
  const removals = new Set<Removal>();
  if (has(/injury tolerance.*diffuse/)) removals.add("diffuse");
  if (has(/injury tolerance.*homogenous/)) removals.add("homogenous");
  if (has(/injury tolerance.*no blood/)) removals.add("noBlood");
  if (has(/injury tolerance.*no head/)) removals.add("noHead");
  if (has(/injury tolerance.*no neck/)) removals.add("noNeck");
  if (has(/invertebrate/)) removals.add("invertebrate");
  return removals;
}

/** The one targeted token's actor, whose body decides which locations it has. */
function targetActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

/** Registers the locations, the random refinements and the wound outcomes. */
export function readyHitLocations(api: GWorldApi, on: () => boolean): void {
  const registered = new Map<string, string>();
  for (const location of LOCATIONS) {
    const key = api.combat.registerHitLocation({
      module: MODULE_ID,
      key: `ma-${location.key}`,
      label: L(`Locations.${location.key}`),
      parent: location.parent,
      penalty: location.penalty,
      ...(location.damageTypes ? { damageTypes: location.damageTypes as any } : {}),
      ...(location.wounding !== undefined || location.woundingAdd !== undefined
        ? {
            wounding: (type: any) => (location.wounding !== undefined ? location.wounding : api.rules.woundingModifierAt(type, location.parent) + (location.woundingAdd ?? 0)),
          }
        : {}),
      ...(location.cripplingDivisor !== undefined ? { cripplingDivisor: location.cripplingDivisor } : {}),
      ...(location.extraDr ? { extraDr: location.extraDr } : {}),
      ...(location.missFallback !== undefined ? { missFallback: location.missFallback } : {}),
      ...(location.arcs ? { arcs: location.arcs } : {}),
      ...(location.knockdownCrushing ? { knockdownFor: (type: any) => (type === "cr" ? location.knockdownCrushing! : 0) } : {}),
      ...(location.shockKnockdown ? { shockKnockdown: true } : {}),
      ...(location.majorWoundKnockdown !== undefined ? { majorWoundKnockdown: location.majorWoundKnockdown } : {}),
      available: () => on() && locationAvailable(location, removalsOf(targetActor())),
    });
    if (key) registered.set(location.key, key);
  }

  // Random hits get the book's 1d sub-rolls (p. 137).
  Hooks.on(api.combat.hooks.randomHitLocation, (context: any) => {
    if (!on() || context?.addonLocation) return;
    // A Born Biter's nose is in the way of a face hit on 1-2 (p. 115).
    const bornBiter = [...(context.actor?.items ?? [])].some((item: any) => item.type === "trait" && /^born biter\b/i.test(String(item.name ?? "")));
    const refined = refineRandomHit(context.location as Parent, context.damageType ?? null, context.arc ?? null, Number(context.d6?.()) || 0, bornBiter ? 2 : 1);
    const removals = removalsOf(context.actor);
    if (refined.basic) context.location = refined.basic;
    else if (refined.key) {
      const definition = LOCATIONS.find((l) => l.key === refined.key);
      if (definition && locationAvailable(definition, removals)) context.addonLocation = registered.get(refined.key) ?? null;
    }
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: OUTCOME_CARD,
    template: `modules/${MODULE_ID}/templates/ma-wound-outcome.hbs`,
    actions: {
      confirm: {
        permission: "gm",
        run: async ({ data }: any) => {
          const actor = (globalThis as any).fromUuidSync?.(data.actorUuid);
          if (!actor) return;
          await api.actors.applyCondition(actor, { module: MODULE_ID, key: `ma-wound-${data.outcome}`, label: data.title });
          ui.notifications?.info(F("Applied", { name: String(actor.name ?? ""), what: String(data.title) }));
        },
      },
    },
  });

  // What the wound did beyond its injury (p. 137).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on() || !game.user?.isGM) return;
    const addon = String(context?.result?.addonLocation ?? "");
    const entry = [...registered.entries()].find(([, id]) => id === addon);
    if (!entry || !context.actor) return;
    const result = context.result;
    const outcome: WoundOutcome | null = woundOutcome(entry[0], {
      raw: (Number(result.injury) || 0) + (Number(result.excessLost) || 0),
      maxHp: Number(result.max) || Number(context.actor.system?.hp?.max) || 10,
      damageType: String(context.damage?.type ?? ""),
      crippled: Boolean(result.crippled),
    });
    if (!outcome) return;
    void api.chat.post(`${MODULE_ID}.${OUTCOME_CARD}`, {
      actorUuid: String(context.actor.uuid ?? ""),
      outcome,
      title: L(`Outcomes.${outcome}.Title`),
      text: F(`Outcomes.${outcome}.Text`, { name: String(context.actor.name ?? "") }),
    }, { actor: context.actor });
  });
}
