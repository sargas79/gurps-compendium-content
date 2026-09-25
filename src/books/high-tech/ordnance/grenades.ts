/**
 * Hand grenades at the table (pp. 190-193), under High-Tech's grenadeHandling
 * switch:
 *
 *   - **Priming:** a TL6-8 grenade comes apart from its detonator and takes
 *     ten seconds to put together; a TL5 grenade takes five Readies to fit
 *     its fuse. A row action primes the stack.
 *   - **Arming:** a Ready (two for a stick grenade) pulls the pin or the
 *     cord, or lights the fuse, and an unarmed grenade isn't thrown. A pulled
 *     cord or a lit fuse is burning at once; a pin grenade's fuse starts when
 *     its handle flies off, on the throw -- or earlier, cooking it off, and
 *     until then the pin can go back in.
 *   - **The throw:** the card says how long is left on the fuse and whether a
 *     foe has time to pick it up and throw it back (p. B410); a critical
 *     failure drops it at the thrower's feet. One held past its fuse goes off
 *     in the hand.
 *   - **Booby traps and improvised grenades** (pp. 190-191): the rolls to rig
 *     one and to make one.
 *   - **A Molotov cocktail through an engine grating** (p. 191): an attack
 *     option aims it there, a vital area at -3; a hit runs the vehicle's HT
 *     rolls while the fire burns, and what they cost its engine (the row
 *     action runs them for a hit the table settled otherwise).
 *   - **Smoke, white phosphorus, thermite and flashbangs** (pp. 192-193): the
 *     cloud a smoke or WP grenade leaves, and the M7's tear gas, rolled for
 *     everyone in it as a tear-gas round's is; the canister's burn to bare
 *     flesh on the card; WP's fragments burn and go on
 *     burning; the AN-M14 burns as thermite (through the incendiaries'
 *     engine); a flashbang is resisted at +5 for each of Protected Hearing and
 *     Protected Vision, and its stun recovered at HT-5.
 */

import { dropAfflictionDr } from "../../../shared/affliction-dr.js";
import { placeArea } from "../../../shared/areas.js";
import { smokeAreaLines } from "../../../shared/smoke/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { releaseTearGas } from "../ammunition/cargo.js";
import { HT_SMOKE_TABLE } from "../ammunition/explosive.js";
import { eyeBonus, hearingBonus } from "../explosives/rules.js";
import {
  BOOBY_TRAP,
  FLASHBANG,
  IMPROVISED_GRENADE,
  MOLOTOV_ENGINE,
  WP_FRAGMENTS,
  afterThrow,
  engineChecks,
  engineFire,
  fuseStartsOnArming,
  goesOffInHand,
  grenadeFacts,
  primingSeconds,
  type GrenadeFacts,
} from "./rules.js";
import { F, L, ask, checkbox, clockNow, d6, formulaOf, hint, isActiveGm, mainMode, number, roll3d, row, say, secondsSince, skillRoll, targetedTokens, type ClockStamp } from "./common.js";

const RPG43_OPTION = "ht-rpg43-technique";
const MOLOTOV_OPTION = "ht-molotov-grating";
const isMolotov = (item: any): boolean => /\bmolotov\b/i.test(String(item?.name ?? ""));
const FLASHBANG_FLAG = "htFlashbangStun";

/** What a grenade stack keeps: primed, armed, and when its fuse started. */
interface GrenadeState {
  htPrimed?: boolean;
  htArmed?: boolean;
  htLit?: ClockStamp | null;
}

/** Whether an item has a thrown mode that explodes or afflicts: a grenade the tables don't name may still be one. */
const thrownBlast = (item: any): boolean => ((item?.system?.rangedModes ?? []) as any[]).some((m) => m?.thrown === true && (m?.explosive === true || m?.affliction === true));

/** A hand grenade's facts, or null for anything else. */
export function grenadeOf(item: any): GrenadeFacts | null {
  if (item?.type !== "equipment") return null;
  return grenadeFacts(String(item.name ?? ""), thrownBlast(item));
}

const tlOf = (item: any): number => Number(String(item?.system?.tl ?? "").match(/\d+/)?.[0]) || 7;

export function readyGrenades(api: GWorldApi, on: () => boolean): void {
  const stateOf = (item: any): GrenadeState => (api.combat.getWeaponState(item, MODULE_ID) as GrenadeState | null) ?? {};
  const setState = (item: any, patch: GrenadeState) => api.combat.setWeaponState(item, MODULE_ID, patch as any);
  const needsPriming = (item: any, facts: GrenadeFacts) => primingSeconds(tlOf(item), facts) > 0;
  const primed = (item: any, facts: GrenadeFacts) => !needsPriming(item, facts) || stateOf(item).htPrimed === true;

  // ── priming, arming, cooking off (p. 190) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-prime",
    itemTypes: ["equipment"],
    label: L("Prime"),
    icon: "fa-solid fa-screwdriver",
    visible: (item: any) => {
      const facts = on() ? grenadeOf(item) : null;
      return Boolean(facts) && !primed(item, facts!);
    },
    run: (item: any, actor: any) => {
      void (async () => {
        const facts = grenadeOf(item);
        if (!facts) return;
        const count = Math.max(1, Math.floor(Number(item.system?.quantity) || 1));
        const seconds = primingSeconds(tlOf(item), facts, count);
        await setState(item, { htPrimed: true });
        await say(actor, String(item.name ?? ""), [F(tlOf(item) >= 6 ? "Primed" : "FuseFitted", { count, seconds })]);
      })();
    },
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-arm",
    itemTypes: ["equipment"],
    label: L("Arm"),
    icon: "fa-solid fa-ring",
    visible: (item: any) => {
      const facts = on() ? grenadeOf(item) : null;
      return Boolean(facts) && primed(item, facts!) && stateOf(item).htArmed !== true;
    },
    run: (item: any, actor: any) => {
      void (async () => {
        const facts = grenadeOf(item);
        if (!facts) return;
        const lit = fuseStartsOnArming(facts) ? clockNow(actor) : null;
        await setState(item, { htArmed: true, htLit: lit });
        const lines = [F(`Armed.${facts.igniter}`, { name: String(item.name ?? ""), readies: facts.readies })];
        if (facts.igniter === "lit") lines.push(L("NoLightingInRain"));
        if (facts.fuse && lit) lines.push(F("FuseBurning", { fuse: fuseText(facts) }));
        await say(actor, String(item.name ?? ""), lines);
      })();
    },
  } as any);

  // Cooking off: the handle flies off and the fuse burns while the grenade is held (p. 190).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-cook",
    itemTypes: ["equipment"],
    label: L("Cook"),
    icon: "fa-solid fa-hourglass-start",
    visible: (item: any) => {
      const facts = on() ? grenadeOf(item) : null;
      const state = stateOf(item);
      return facts?.igniter === "pin" && Boolean(facts.fuse) && state.htArmed === true && !state.htLit;
    },
    run: (item: any, actor: any) => {
      void (async () => {
        const facts = grenadeOf(item);
        if (!facts) return;
        await setState(item, { htLit: clockNow(actor) });
        await say(actor, String(item.name ?? ""), [F("Cooking", { fuse: fuseText(facts) })]);
      })();
    },
  } as any);

  // The pin goes back in while the handle is held (p. 190).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-safe",
    itemTypes: ["equipment"],
    label: L("Safe"),
    icon: "fa-solid fa-rotate-left",
    visible: (item: any) => {
      const facts = on() ? grenadeOf(item) : null;
      const state = stateOf(item);
      return facts?.igniter === "pin" && state.htArmed === true && !state.htLit;
    },
    run: (item: any, actor: any) => {
      void (async () => {
        await setState(item, { htArmed: false, htLit: null });
        await say(actor, String(item.name ?? ""), [L("PinBack")]);
      })();
    },
  } as any);

  // The RPG-43's throw: -5 without its special technique (p. 192).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: RPG43_OPTION,
    label: L("Rpg43Technique"),
    available: (context: any) => on() && Boolean(grenadeOf(context?.item)?.unfamiliarPenalty),
    apply: () => null,
  } as any);

  /** The throw in flight: what the card after the roll says. */
  const pending = new Map<string, { item: any; facts: GrenadeFacts; burned: number }>();

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!on() || !context?.mode?.ranged || context.mode?.derived) return;
    const facts = grenadeOf(item);
    const mode = item?.system?.rangedModes?.[Number(context.mode.index) || 0];
    if (!facts || mode?.thrown !== true) return;
    const state = stateOf(item);
    if (state.htArmed !== true) {
      context.refusal = F(primed(item, facts) ? "NotArmed" : "NotPrimed", { name: String(item.name ?? "") });
      return;
    }
    if (facts.unfamiliarPenalty && context.options?.[`${MODULE_ID}.${RPG43_OPTION}`] !== true) {
      context.modifiers.push({ label: L("Rpg43Unfamiliar"), value: facts.unfamiliarPenalty });
    }
    if (context.refusal) return;
    pending.set(String(context.actor?.uuid ?? ""), { item, facts, burned: secondsSince(state.htLit, clockNow(context.actor)) });
  });

  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    const key = String(actor?.uuid ?? "");
    if (!(context?.tags ?? []).includes("attack") || !pending.has(key)) return;
    const { item, facts, burned } = pending.get(key)!;
    pending.delete(key);
    if (!on() || !item?.isOwner) return;
    void (async () => {
      await setState(item, { htArmed: false, htLit: null });
      const name = String(item.name ?? "");
      const fuse = afterThrow(facts, burned);
      const lines: string[] = [];
      if (context.outcome?.criticalFailure) lines.push(F("Dropped", { name }));
      if (facts.impact) lines.push(L(context.outcome?.criticalFailure ? "ImpactDropped" : "Impact"));
      else if (!fuse.left) lines.push(L("FuseUnknown"));
      else {
        lines.push(F("FuseLeft", { burned, least: fuse.left[0], most: fuse.left[1] }));
        lines.push(L(context.outcome?.criticalFailure ? (fuse.throwBack ? "DroppedPickUp" : "DroppedNoTime") : fuse.throwBack ? "ThrowBack" : "NoThrowBack"));
      }
      await say(actor, name, lines);
    })();
  });

  // A grenade held past its fuse goes off in the hand.
  Hooks.on(api.combat.hooks.turnStart, async (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!on() || !actor || !isActiveGm()) return;
    for (const item of [...(actor.items ?? [])]) {
      const facts = grenadeOf(item);
      const state = facts ? stateOf(item) : null;
      if (!facts || !state?.htLit || !goesOffInHand(facts, secondsSince(state.htLit, clockNow(actor)))) continue;
      await setState(item, { htArmed: false, htLit: null });
      const name = String(item.name ?? "");
      await say(actor, name, [F("InHand", { name: String(actor.name ?? ""), grenade: name })]);
      const main = mainMode(item);
      if (main && formulaOf(main.mode)) {
        await api.roll.damage({
          actor, item, mode: { index: main.index, ranged: main.ranged }, label: F("InHandLabel", { name }),
          formula: formulaOf(main.mode), damageType: main.mode.damageType ?? "cr", armorDivisor: Number(main.mode.armorDivisor) || 1,
          explosive: main.mode.explosive === true, fragmentation: String(main.mode.fragmentation ?? ""),
          fragmentationType: main.mode.fragmentationType ?? "", fragmentationDivisor: Number(main.mode.fragmentationDivisor) || 1,
          blastPlacement: "contact",
        } as any);
      }
    }
  });

  // ── booby traps and improvised grenades (pp. 190-191) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-booby-trap",
    itemTypes: ["equipment"],
    label: L("BoobyTrap"),
    icon: "fa-solid fa-link",
    visible: (item: any) => on() && grenadeOf(item)?.igniter === "pin",
    run: (item: any, actor: any) => {
      void (async () => {
        const name = String(item.name ?? "");
        const outcome = await skillRoll(api, actor, BOOBY_TRAP.skills, F("BoobyTrapRoll", { name }), [], ["boobyTrap"]);
        if (!outcome) return;
        await say(actor, L("BoobyTrap"), [F(outcome.success ? "BoobyTrapSet" : "BoobyTrapFailed", { name, minutes: BOOBY_TRAP.minutes })]);
      })();
    },
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grenade-improvise",
    itemTypes: ["equipment"],
    label: L("Improvise"),
    icon: "fa-solid fa-hammer",
    visible: (item: any) => on() && /^jam-tin grenade\b/i.test(String(item?.name ?? "")),
    run: (item: any, actor: any) => {
      void (async () => {
        const name = String(item.name ?? "");
        const value = await ask(name, [checkbox("fuse", L("ImproviseFuse")), hint(L("ImproviseHint"))].join(""), L("Improvise"));
        if (!value) return;
        const demolition = [{ skill: IMPROVISED_GRENADE.skill, modifier: IMPROVISED_GRENADE.modifier }];
        if (value("fuse") === "on") {
          const fuse = await skillRoll(api, actor, [{ skill: IMPROVISED_GRENADE.skill, modifier: IMPROVISED_GRENADE.fuseModifier }], F("ImproviseFuseRoll", { name }), [], ["improvised"]);
          if (!fuse) return;
          if (!fuse.success) return void (await say(actor, name, [L("ImproviseFuseFailed")]));
        }
        const made = await skillRoll(api, actor, demolition, F("ImproviseRoll", { name }), [], ["improvised"]);
        if (!made) return;
        await say(actor, name, [F(made.success ? "Improvised" : "ImproviseFailed", { name, minutes: IMPROVISED_GRENADE.minutes })]);
      })();
    },
  } as any);

  // ── a Molotov cocktail through an engine grating (p. 191) ──
  /** The fire in a vehicle's engine: its HT rolled at once and every 3 seconds until it burns out. */
  const engineFireCard = async (actor: any, target: any, ht: number) => {
    let burn = 0;
    for (let i = 0; i < MOLOTOV_ENGINE.burnDice; i += 1) burn += d6();
    const seconds = burn * MOLOTOV_ENGINE.burnTimes;
    const result = engineFire(ht, seconds, Array.from({ length: engineChecks(seconds) }, roll3d));
    const vehicle = String(target?.name ?? L("Engine.TheVehicle"));
    await say(actor, L("Engine.Title"), [
      F("Engine.Burns", { vehicle, seconds }),
      ...result.checks.map((c) => F(c.success ? "Engine.CheckMade" : "Engine.CheckFailed", { second: c.second, roll: c.roll, ht })),
      F(`Engine.${result.fate}`, { vehicle }),
    ]);
  };
  const vehicleHtOf = (target: any): number | null => {
    const ht = Number(target?.system?.vehicle?.ht);
    return Number.isFinite(ht) && ht > 0 ? ht : null;
  };

  // Aimed at the grating: a vital area, -3 to hit (p. B554); a hit sets the engine burning.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: MOLOTOV_OPTION,
    label: L("Engine.Option"),
    available: (context: any) => on() && isMolotov(context?.item),
    apply: () => ({ modifiers: [{ label: L("Engine.Option"), value: MOLOTOV_ENGINE.toHit }] }),
  } as any);
  const molotovs = new Map<string, any>();
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !isMolotov(context?.item) || context.options?.[`${MODULE_ID}.${MOLOTOV_OPTION}`] !== true || context.refusal) return;
    molotovs.set(String(context.actor?.uuid ?? ""), context.targetTokens?.[0]?.actor ?? context.targets?.[0] ?? null);
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const key = String(context?.actor?.uuid ?? "");
    if (!(context?.tags ?? []).includes("attack") || !molotovs.has(key)) return;
    const target = molotovs.get(key);
    molotovs.delete(key);
    if (!on() || !context.outcome?.success || !context.actor?.isOwner) return;
    void (async () => {
      let ht = vehicleHtOf(target);
      if (ht === null) {
        const value = await ask(L("Engine.Title"), [row(L("Engine.Ht"), number("ht", 10, "1")), hint(L("Engine.HitHint"))].join(""), L("Engine.Action"));
        if (!value) return;
        ht = Math.max(1, Math.floor(Number(value("ht")) || 10));
      }
      await engineFireCard(context.actor, target, ht);
    })();
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-molotov-engine",
    itemTypes: ["equipment"],
    label: L("Engine.Action"),
    icon: "fa-solid fa-car-burst",
    visible: (item: any) => on() && isMolotov(item),
    run: (_item: any, actor: any) => {
      void (async () => {
        const target = targetedTokens()[0]?.actor ?? null;
        const value = await ask(L("Engine.Title"), [
          row(L("Engine.Ht"), number("ht", vehicleHtOf(target) ?? 10, "1")),
          hint(F("Engine.Hint", { penalty: MOLOTOV_ENGINE.toHit })),
        ].join(""), L("Engine.Action"));
        if (!value) return;
        await engineFireCard(actor, target, Math.max(1, Math.floor(Number(value("ht")) || 10)));
      })();
    },
  } as any);

  // ── smoke, white phosphorus, flashbangs (pp. 192-193) ──
  // The cloud a smoke or WP grenade leaves where it lands.
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    const facts = on() ? grenadeOf(item) : null;
    if (!facts?.cloud || !item?.isOwner) return;
    const name = String(item.name ?? "");
    const hot = facts.hotCanister ? [F("HotCanister", { dice: facts.hotCanister })] : [];
    if (facts.tearGas) {
      void (async () => {
        const lines = await releaseTearGas(api, context.actor, name, facts.cloud!.radius, facts.cloud!.seconds);
        await say(context.actor, name, lines ? [...lines, ...hot] : [L("CloudNoPlace")]);
      })();
      return;
    }
    const lines = smokeAreaLines(HT_SMOKE_TABLE[facts.whitePhosphorus ? "hot" : "screening"], { vision: (value) => F("CloudVision", { value }), sensors: L("CloudSensors") });
    void (async () => {
      const id = await placeArea(api, { key: "ht-grenade-smoke", label: name, actor: context.actor, radiusYards: facts.cloud!.radius, seconds: facts.cloud!.seconds, lines });
      await say(context.actor, name, id ? [F("CloudPlaced", { radius: facts.cloud!.radius, seconds: facts.cloud!.seconds }), ...hot] : [L("CloudNoPlace")]);
    })();
  });

  // WP's hot fragments: burning, and striking again every 10 seconds for a minute (p. 172).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    const facts = grenadeOf(context?.item);
    if (!facts?.whitePhosphorus) return;
    for (const entry of context.rows ?? []) {
      const r = entry?.row;
      if (!r?.fragmentation) continue;
      r.fragmentationType = WP_FRAGMENTS.type;
      r.fragmentationLingerEvery = WP_FRAGMENTS.every;
      r.fragmentationLingerFor = WP_FRAGMENTS.for;
    }
  });

  // A flashbang: +5 for each of Protected Hearing and Protected Vision, or
  // their gear (note [7], p. 192). Its flash and bang are sense-based, which
  // DR does nothing against, so the system's DR line goes (Characters p. 35).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on()) return;
    if ((context?.tags ?? []).includes("stunRecovery") && context.actor?.getFlag?.(MODULE_ID, FLASHBANG_FLAG)) {
      context.modifiers.push({ label: L("FlashbangRecovery"), value: FLASHBANG.recovery });
      return;
    }
    if (!(context?.tags ?? []).includes("resist") || !grenadeOf(context.attack?.item)?.flashbang) return;
    dropAfflictionDr(context);
    const effects = (api.actors.derived(context.actor) as any)?.traitEffects ?? {};
    const worn = [...(context.actor?.items ?? [])].filter((i: any) => i?.system?.equipped).map((i: any) => String(i.name ?? ""));
    if (hearingBonus(worn, effects.protectedSense?.hearing === true) > 0) context.modifiers.push({ label: L("FlashbangHearing"), value: FLASHBANG.protectedBonus });
    if (eyeBonus(worn, effects.protectedSense?.vision === true) > 0) context.modifiers.push({ label: L("FlashbangVision"), value: FLASHBANG.protectedBonus });
  });
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on() || !grenadeOf(context?.item)?.flashbang) return;
    context.effects.push({ key: "stunned" });
    if (context.actor?.isOwner) void context.actor.setFlag(MODULE_ID, FLASHBANG_FLAG, true);
    void say(context.actor, String(context.item?.name ?? ""), [F("FlashbangStunned", { name: String(context.actor?.name ?? "") })]);
  });
  Hooks.on("updateActor", (actor: any, changes: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id || changes?.system?.conditions?.stunned !== false) return;
    if (actor?.getFlag?.(MODULE_ID, FLASHBANG_FLAG)) void actor.unsetFlag(MODULE_ID, FLASHBANG_FLAG);
  });
}

/** A fuse as the table prints it: "4-5 seconds", "7 seconds". */
function fuseText(facts: GrenadeFacts): string {
  if (!facts.fuse) return L("FuseUnknownShort");
  return facts.fuse[0] === facts.fuse[1] ? F("Seconds", { n: facts.fuse[0] }) : F("SecondsRange", { least: facts.fuse[0], most: facts.fuse[1] });
}
