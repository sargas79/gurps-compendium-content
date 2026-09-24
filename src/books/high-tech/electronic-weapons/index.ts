/**
 * Electronic weapons and non-nuclear EMP from the supplement Electricity and
 * Electronics (HT:EE pp. 49-51), registered with the system through the
 * add-on API under three of High-Tech's switches. The rules are in
 * `rules.ts`; what a laser does to the eyes is the shared dazzle engine's
 * (`src/shared/dazzle/`), with High-Tech's table.
 *
 *   - **Electric stunners (electricStunners):** a stunner in hand gives +6 to
 *     Interrogation (its pain counts as torture), +2 to Intimidation, and a
 *     cattle prod +2 to Animal Handling (HT:EE p. 49). The supplement's cattle
 *     prod pains rather than stuns: Moderate Pain for a minute a point the
 *     roll failed by, Severe Pain where an attack option says it was put to
 *     the face or groin (note [4]). The stun of the stun gun, stun baton and
 *     Tasertron (notes [1] and [6]) is High-Tech's own (`stunWeapons`,
 *     `airGunsAndStunners`), which the supplement repeats; its Air Taser
 *     carries High-Tech's ranged-stunner field, so the Tasertron's rule
 *     holds it.
 *   - **Directed-energy weapons (directedEnergyWeapons):** the dazzler and
 *     the laser pointer are Vision-based: DR does nothing, Protected Vision
 *     gives +5 and a Nictitating Membrane +1 a level (the shared engine's
 *     reading), and obscuring conditions +1 a point of the Vision penalty they
 *     cause, an attack option. A failure blinds -- the system's imposed
 *     Blindness (API 1.120.0), fighting at -10 as someone not used to it --
 *     for minutes equal to the margin, but only where the darkness at the
 *     victim is -2 or worse (notes [1]-[3]). The acoustic hailing device's
 *     row: Moderate Pain while the sound lasts; after a minute of it, a row
 *     action gives tinnitus (imposed Hard of Hearing) for a minute a point of
 *     failure and the HT roll that makes it 1d months, or permanent on a
 *     critical failure; Protected Hearing +5 against both and no permanent
 *     loss, Deafness immune (note [4]). The Active Denial System: Agony while
 *     in the beam, free to move away, and a row action for victims leaving
 *     it, whose Agony then lasts a second (note [5]).
 *   - **Non-nuclear EMP (nonNuclearEmp):** a row action sets off an NNEMP at
 *     the targeted characters within 220 yards. The GM picks their gear and
 *     says what each is -- plain electronics, Hardened or purely electrical
 *     -- and each rolls its HT as an object (`items.equipmentFailure`, API
 *     1.118.0), +3 if Hardened or electrical. What fails is out of action
 *     until repaired, a row action with Electronics Repair, -6 for plain
 *     electronics. The NNEMP is spent (HT:EE p. 50). This follows High-Tech's
 *     nuclear EMP (`../ordnance/nuclear.ts`), which is its own switch's.
 */

import { dropAfflictionDr } from "../../../shared/affliction-dr.js";
import { bookOf } from "../../../shared/book-tables.js";
import { DAZZLE_TABLES, blindnessFrom, eyeProtection } from "../../../shared/dazzle/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { HT_DAZZLE } from "../projectors/rules.js";
import { electronicsOf, poweredGear } from "../ordnance/nuclear.js";
import { ask, checkbox, d6, esc, hint, itemFlag, row, say, select, skillRoll, targetedTokens, yardsBetween } from "../ordnance/common.js";
import {
  ACTIVE_DENIAL,
  DAYS_PER_MONTH,
  HAILING,
  NNEMP,
  PULSE_KINDS,
  darkAdapted,
  fromSupplement,
  hearingLoss,
  isActiveDenial,
  isCattleProd,
  isElectricStunner,
  isEyeLaser,
  isHailingDevice,
  isNnemp,
  nnempModifier,
  nnempRepairPenalty,
  obscurementBonus,
  prodPain,
  stunnerSkillBonus,
  tinnitusMinutes,
  withinPulse,
  type PulseKind,
} from "./rules.js";

export * from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.ElectronicWeapons.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.ElectronicWeapons.${key}`, data);

export interface ElectronicWeaponSwitches {
  stunners: () => boolean;
  directed: () => boolean;
  emp: () => boolean;
}

const FACE_OPTION = "ee-prod-face";
const OBSCURED_OPTION = "ee-dazzle-obscured";
const DAZZLE_BLINDED = "ee-dazzler-blinded";
const TINNITUS = "ee-tinnitus";
const DENIAL = "ee-active-denial";
/** The actor flag a hailing device's victim carries while the sound lasts: the margin the roll failed by. */
const HAILED_FLAG = "eeHailed";
/** The item flag gear the pulse knocked out carries: its repair penalty. */
const PULSE_FLAG = "eeNnemp";
const PULSE_KIND = `${MODULE_ID}.nnemp`;

/** This book's gear, or gear from no book. */
const ownBook = (item: any): boolean => item?.type === "equipment" && [null, "high-tech"].includes(bookOf(item));
const nameOf = (item: any) => String(item?.name ?? "");
const supplement = (item: any) => ownBook(item) && fromSupplement(item?.system?.reference);
const inHand = (item: any) => item?.type === "equipment" && item.system?.equipped === true;

const isSupplementProd = (item: any) => supplement(item) && isCattleProd(nameOf(item));
const isEyeLaserItem = (item: any) => supplement(item) && isEyeLaser(nameOf(item));
const isHailing = (item: any) => ownBook(item) && isHailingDevice(nameOf(item));
const isDenial = (item: any) => ownBook(item) && isActiveDenial(nameOf(item));
const isNnempItem = (item: any) => ownBook(item) && isNnemp(nameOf(item));

const conditionIds = (api: GWorldApi, actor: any): string[] => ((api.actors.conditions(actor) ?? []) as any[]).map((c) => String(c?.id ?? ""));
const hasCondition = (api: GWorldApi, actor: any, key: string): boolean => conditionIds(api, actor).includes(`${MODULE_ID}.${key}`);
const traitEffectsOf = (api: GWorldApi, actor: any): any => (api.actors.derived(actor) as any)?.traitEffects ?? {};

/** A weapon's state for the attack just made, kept by this rule. */
const stateOf = (api: GWorldApi, item: any): any => (api.combat.getWeaponState(item, MODULE_ID) as any) ?? {};

/** The darkness level where a character stands, 0-10, or null where it can't be read (HT:EE p. 51). */
function darknessAtVictim(api: GWorldApi, actor: any): number | null {
  const token = actor?.getActiveTokens?.()?.[0];
  if (!token || typeof (api.areas as any)?.darknessAt !== "function") return null;
  try {
    const reading = (api.areas as any).darknessAt(null, token, { observer: actor });
    return reading && Number.isFinite(Number(reading.darkness)) ? Number(reading.darkness) : null;
  } catch {
    return null;
  }
}

export function readyElectronicWeapons(api: GWorldApi, on: ElectronicWeaponSwitches): void {
  // ── electric stunners (HT:EE p. 49) ──
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!on.stunners() || !actor || !Array.isArray(context?.modifiers) || (context.tags ?? []).includes?.("resist")) return;
    const stunners = [...(actor.items ?? [])].filter((i: any) => ownBook(i) && inHand(i) && isElectricStunner(i.name));
    if (!stunners.length) return;
    const prod = stunners.find((i: any) => isCattleProd(i.name));
    const bonus = stunnerSkillBonus(context.skill, Boolean(prod));
    if (!bonus) return;
    const by = bonus.kind === "animalHandling" ? prod : stunners[0];
    context.modifiers.push({ label: F(`Skill.${bonus.kind}`, { name: nameOf(by) }), value: bonus.value });
  });

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: FACE_OPTION,
    label: L("FaceOption"),
    attack: "melee",
    available: (context: any) => on.stunners() && isSupplementProd(context?.item),
    apply: () => ({ notes: [L("FaceNote")] }),
  } as any);

  // ── directed-energy weapons (HT:EE pp. 50-51) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: OBSCURED_OPTION,
    label: L("ObscuredOption"),
    attack: "ranged",
    input: { type: "number", min: -10, max: 0 },
    available: (context: any) => on.directed() && isEyeLaserItem(context?.item),
    apply: (_context: any, value: unknown) => {
      const bonus = obscurementBonus(Number(value));
      return bonus ? { notes: [F("ObscuredNote", { bonus })] } : null;
    },
  } as any);

  // What the attack was set to: the prod put to the face, the dazzle through fog.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item?.isOwner || context.refusal) return;
    if (on.stunners() && isSupplementProd(item)) {
      void api.combat.setWeaponState(item, MODULE_ID, { ...stateOf(api, item), faceOrGroin: context.options?.[`${MODULE_ID}.${FACE_OPTION}`] === true });
    }
    if (on.directed() && isEyeLaserItem(item)) {
      void api.combat.setWeaponState(item, MODULE_ID, { ...stateOf(api, item), obscured: Math.min(0, Math.trunc(Number(context.options?.[`${MODULE_ID}.${OBSCURED_OPTION}`]) || 0)) });
    }
  });

  // The roll to resist: a laser or a sound, which DR does nothing against; the senses' protection.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.directed() || !context?.tags?.includes?.("resist") || !Array.isArray(context.modifiers)) return;
    const item = context.attack?.item;
    const effects = traitEffectsOf(api, context.actor);
    if (isEyeLaserItem(item)) {
      dropAfflictionDr(context);
      const protection = eyeProtection({ protectedVision: effects.protectedSense?.vision === true, nictitatingMembrane: Number(effects.nictitatingMembrane) || 0 });
      if (protection) context.modifiers.push({ label: L("EyeProtection"), value: protection });
      const obscured = obscurementBonus(Number(stateOf(api, item).obscured) || 0);
      if (obscured) context.modifiers.push({ label: L("Obscured"), value: obscured });
    } else if (isHailing(item)) {
      dropAfflictionDr(context);
      if (effects.protectedSense?.hearing === true) context.modifiers.push({ label: L("ProtectedHearing"), value: HAILING.protectedHearing });
    }
  });

  // What a failed roll leaves.
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    if (!actor || !Array.isArray(context?.effects)) return;
    const name = String(actor.name ?? "");
    const margin = Number(context.margin) || 0;
    if (on.stunners() && isSupplementProd(item)) {
      const pain = prodPain(margin, stateOf(api, item).faceOrGroin === true);
      context.effects.push({ key: pain.key, duration: { seconds: pain.minutes * 60 } });
      void say(actor, nameOf(item), [F(pain.key === "severePain" ? "ProdSevere" : "ProdModerate", { name, minutes: pain.minutes })]);
      return;
    }
    if (!on.directed()) return;
    const effects = traitEffectsOf(api, actor);
    if (isEyeLaserItem(item)) {
      if (effects.blindness === true) return void say(actor, nameOf(item), [F("AlreadyBlind", { name })]);
      const darkness = darknessAtVictim(api, actor);
      if (darkness !== null && !darkAdapted(darkness)) return void say(actor, nameOf(item), [F("NotDarkAdapted", { name })]);
      // The system hands the margin of a failure as a negative number.
      const blindness = blindnessFrom(DAZZLE_TABLES.forBook("high-tech") ?? HT_DAZZLE, "dazzle", Math.abs(margin));
      const minutes = blindness.kind === "dazzled" ? blindness.minutes : 1;
      context.effects.push({ module: MODULE_ID, key: DAZZLE_BLINDED, label: L("Blinded"), duration: { seconds: minutes * 60 } });
      void say(actor, nameOf(item), [F(darkness === null ? "BlindedUnread" : "BlindedLine", { name, minutes })]);
    } else if (isHailing(item)) {
      if (effects.deafness === true) return void say(actor, nameOf(item), [F("Deaf", { name })]);
      context.effects.push({ key: "moderatePain" });
      if (actor.isOwner) void actor.setFlag(MODULE_ID, HAILED_FLAG, { margin: Math.abs(margin) });
      void say(actor, nameOf(item), [F("HailedLine", { name })]);
    } else if (isDenial(item)) {
      context.effects.push({ key: "agony" });
      context.effects.push({ module: MODULE_ID, key: DENIAL, label: L("DenialCondition") });
      void say(actor, nameOf(item), [F("DenialLine", { name })]);
    }
  });

  // A victim of the Active Denial System can still flee (HT:EE p. 51, note [5]).
  Hooks.on("gworld.maneuverAllowances", (context: any) => {
    if (!on.directed() || !context?.actor || !hasCondition(api, context.actor, DENIAL)) return;
    context.movement = "full";
  });

  // A dazzled victim is blind; a deafened one Hard of Hearing, as imposed traits (API 1.120.0).
  Hooks.on("gworld.traitEffects", (context: any) => {
    const effects = context?.effects;
    if (!effects || !on.directed() || !context.actor) return;
    if (hasCondition(api, context.actor, DAZZLE_BLINDED)) {
      effects.blindness = true;
      if (Array.isArray(context.sources)) context.sources.push({ effect: "blindness", label: L("Blinded") });
    }
    if (hasCondition(api, context.actor, TINNITUS)) {
      effects.hardOfHearing = true;
      if (Array.isArray(context.sources)) context.sources.push({ effect: "hardOfHearing", label: L("Tinnitus") });
    }
  });

  const hailed = (): any[] => targetedTokens().map((t) => t?.actor).filter((a: any) => a && itemFlag(a, HAILED_FLAG));

  // A minute of the hailing device's sound: tinnitus, then the HT roll that keeps it (note [4]).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-hailing-minute",
    itemTypes: ["equipment"],
    label: L("HailMinute"),
    icon: "fa-solid fa-ear-deaf",
    visible: (item: any) => on.directed() && isHailing(item),
    run: (item: any, actor: any) => { void hailMinute(item, actor); },
  } as any);

  const hailMinute = async (item: any, actor: any) => {
    const victims = hailed();
    if (!victims.length) return void ui.notifications?.warn(L("NoHailed"));
    const lines: string[] = [];
    for (const victim of victims) {
      const name = String(victim.name ?? "");
      const minutes = tinnitusMinutes(Number(itemFlag(victim, HAILED_FLAG)?.margin) || 1);
      const shielded = traitEffectsOf(api, victim).protectedSense?.hearing === true;
      const outcome: any = await api.roll.success({
        actor: victim, base: Number(api.actors.attribute(victim, "HT")) || 10, label: F("TinnitusRoll", { name }), skill: "HT", kind: "attribute",
        modifiers: shielded ? [{ label: L("ProtectedHearing"), value: HAILING.protectedHearing }] : [], tags: ["hearing", "tinnitus"],
      } as any);
      if (!outcome) continue;
      const loss = hearingLoss({ success: outcome.success === true, criticalFailure: outcome.criticalFailure === true }, shielded);
      const months = loss === "months" ? d6() : 0;
      const seconds = loss === "passes" ? minutes * 60 : loss === "months" ? months * DAYS_PER_MONTH * 86400 : null;
      await api.actors.applyCondition(victim, { module: MODULE_ID, key: TINNITUS, label: L("Tinnitus"), ...(seconds === null ? {} : { duration: { seconds } }) } as any);
      lines.push(loss === "passes" ? F("TinnitusMinutes", { name, minutes }) : loss === "months" ? F("TinnitusMonths", { name, months }) : F("TinnitusPermanent", { name }));
    }
    await say(actor, nameOf(item), lines);
  };

  // The sound stops: its pain goes.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-hailing-stop",
    itemTypes: ["equipment"],
    label: L("HailStop"),
    icon: "fa-solid fa-volume-xmark",
    visible: (item: any) => on.directed() && isHailing(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const victims = hailed();
        if (!victims.length) return void ui.notifications?.warn(L("NoHailed"));
        for (const victim of victims) {
          if (conditionIds(api, victim).includes("moderatePain")) await api.actors.removeCondition(victim, "moderatePain");
          await victim.unsetFlag?.(MODULE_ID, HAILED_FLAG);
        }
        await say(actor, nameOf(item), [F("HailStopped", { names: victims.map((v) => v.name).join(", ") })]);
      })();
    },
  } as any);

  // Victims out of the Active Denial System's beam: Agony for one second more (note [5]).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-denial-leave",
    itemTypes: ["equipment"],
    label: L("DenialLeave"),
    icon: "fa-solid fa-person-running",
    visible: (item: any) => on.directed() && isDenial(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const victims = targetedTokens().map((t) => t?.actor).filter((a: any) => a && hasCondition(api, a, DENIAL));
        if (!victims.length) return void ui.notifications?.warn(L("NoDenied"));
        for (const victim of victims) {
          await api.actors.removeCondition(victim, `${MODULE_ID}.${DENIAL}`);
          if (conditionIds(api, victim).includes("agony")) await api.actors.removeCondition(victim, "agony");
          await api.actors.applyCondition(victim, { key: "agony", duration: { seconds: ACTIVE_DENIAL.afterSeconds } } as any);
        }
        await say(actor, nameOf(item), [F("DenialLeft", { names: victims.map((v) => v.name).join(", "), seconds: ACTIVE_DENIAL.afterSeconds })]);
      })();
    },
  } as any);

  // ── non-nuclear EMP (HT:EE p. 50) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-nnemp",
    itemTypes: ["equipment"],
    label: L("Pulse"),
    icon: "fa-solid fa-bolt",
    visible: (item: any) => on.emp() && isNnempItem(item),
    run: (item: any, actor: any) => { void pulse(item, actor); },
  } as any);

  const pulse = async (item: any, actor: any) => {
    const own = actor?.getActiveTokens?.()?.[0] ?? null;
    const tokens = targetedTokens();
    const inRange = tokens.filter((t) => withinPulse(own ? yardsBetween(own, t) : null));
    const victims = inRange.map((t) => t?.actor).filter(Boolean);
    if (!victims.length) return void ui.notifications?.warn(L(tokens.length ? "PulseOutOfRange" : "PulseNoTargets"));
    const kinds = (chosen: PulseKind | "") => [{ value: "", label: L("Kind.skip"), selected: chosen === "" }, ...PULSE_KINDS.map((k) => ({ value: k, label: L(`Kind.${k}`), selected: chosen === k }))];
    const controls: string[] = [hint(F("PulseHint", { yards: NNEMP.radiusYards, bonus: NNEMP.resistant, repair: NNEMP.repair }))];
    victims.forEach((victim: any, v: number) => {
      controls.push(`<strong>${esc(victim.name)}</strong>`);
      for (const gear of electronicsOf(victim)) controls.push(row(String(gear.name ?? ""), select(`g${v}-${gear.id}`, kinds(poweredGear(gear) ? "electronic" : ""))));
    });
    if (tokens.length > victims.length) controls.push(hint(F("PulseBeyond", { count: tokens.length - victims.length, yards: NNEMP.radiusYards })));
    controls.push(checkbox("spent", L("PulseSpent"), true));
    const value = await ask(L("Pulse"), controls.join(""), L("PulseGo"));
    if (!value) return;
    const lines: string[] = [];
    for (const [v, victim] of victims.entries()) {
      for (const gear of electronicsOf(victim)) {
        const kind = value(`g${v}-${gear.id}`) as PulseKind | "";
        if (!PULSE_KINDS.includes(kind as PulseKind)) continue;
        const outcome: any = await (api.items as any).equipmentFailure({ actor: victim, item: gear, modifier: nnempModifier(kind as PulseKind), label: F("PulseRoll", { gear: gear.name }), apply: false });
        if (!outcome) continue;
        const data = { gear: String(gear.name ?? ""), name: String(victim.name ?? "") };
        if (outcome.outcome === "success") {
          lines.push(F("GearHolds", data));
          continue;
        }
        const penalty = nnempRepairPenalty(kind as PulseKind);
        if (gear.isOwner) {
          await gear.setFlag(MODULE_ID, PULSE_FLAG, { penalty });
          if ((gear.system?.rangedModes ?? []).length || (gear.system?.meleeModes ?? []).length) await api.items.setMalfunction(gear, { kind: PULSE_KIND, label: L("PulseMalfunction") } as any);
        }
        lines.push(F("GearOut", { ...data, penalty }));
      }
    }
    // The device is destroyed by going off.
    if (value("spent") === "on" && item.isOwner) {
      const left = Math.max(0, (Number(item.system?.quantity) || 1) - 1);
      await item.update({ "system.quantity": left });
      lines.push(F("PulseUsed", { name: nameOf(item), left }));
    }
    await say(actor, L("Pulse"), lines);
  };

  // Repairing gear the pulse shut down: Electronics Repair, -6 for plain electronics (HT:EE p. 50).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-nnemp-repair",
    itemTypes: ["equipment", "armor"],
    label: L("Repair"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item: any) => on.emp() && Boolean(itemFlag(item, PULSE_FLAG)),
    run: (item: any, actor: any) => {
      void (async () => {
        const penalty = Math.min(0, Number(itemFlag(item, PULSE_FLAG)?.penalty) || 0);
        const repairs = [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^electronics repair\b/i.test(String(i.name ?? ""))).map((i: any) => ({ skill: String(i.name).replace(/\/TL\d+/i, ""), modifier: 0 }));
        const extra = penalty ? [{ label: L("RepairLine"), value: penalty }] : [];
        const outcome = await skillRoll(api, actor, repairs.length ? repairs : [{ skill: "Electronics Repair", modifier: 0 }], F("RepairRoll", { gear: nameOf(item) }), extra, ["repair", "nnemp"]);
        if (!outcome) return;
        if (outcome.success) {
          await item.unsetFlag(MODULE_ID, PULSE_FLAG);
          if ((api.items.malfunction(item) as any)?.kind === PULSE_KIND) await api.items.setMalfunction(item, null);
        }
        await say(actor, nameOf(item), [L(outcome.success ? "Repaired" : "NotRepaired")]);
      })();
    },
  } as any);

  // The system's Clear button on a weapon the pulse shut down: the same repair.
  Hooks.on(api.combat.hooks.clearMalfunction, (context: any) => {
    if (!on.emp() || context?.malfunction?.kind !== PULSE_KIND) return;
    context.refusal = L("UseRepair");
  });
}
