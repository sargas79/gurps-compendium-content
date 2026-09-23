/**
 * Nuclear weapons at the table (pp. 195-196), under High-Tech's
 * nuclearEffects switch. A nuclear device is a record whose explosion is
 * linked to burning explosion with radiation, as the book writes one.
 *
 *   - **The burning falls off more slowly:** divided by twice the distance
 *     rather than three times (the crushing falls off as any blast's).
 *   - **The flash always applies:** everyone its crushing or burning reaches
 *     gets the HT roll against the flash (p. 182), whether or not the side
 *     effects of explosions are in play (`../explosives`).
 *   - **EMP:** a row action works an HT-8(2) affliction on the targeted
 *     characters with the Electrical disadvantage, and on the electronics
 *     they carry (powered gear, ticked by default; the GM picks). What fails
 *     is out of action until repaired; a row action repairs it with
 *     Electronics Repair at -10 for solid-state gear, -4 for older devices.
 *   - **Fallout:** a row action gives the footprint for the yield (800 by 200
 *     yards at 0.1 kiloton, doubled each way for each tenfold) and doses the
 *     targeted characters with the rads for their time in it, at 100 an hour
 *     at first, 10 from about two days, 1 from about two weeks, through the
 *     system's radiation.
 */

import { powerData, isPowered } from "../../../shared/power/data.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { EMP, NUCLEAR_BURN_DIVISOR_PER_YARD, empRepairPenalty, empResistance, falloutFootprint, falloutRads, falloutRate, isNuclearMode, yieldKilotons } from "./rules.js";
import { F, L, ask, checkbox, esc, hint, itemFlag, number, roll3d, row, say, skillRoll, targetedTokens } from "./common.js";

const EMP_FLAG = "htEmp";
const EMP_KIND = `${MODULE_ID}.emp`;

/** Whether a record is a nuclear device: one of its modes explodes into radioactive burning. */
export const isNuclear = (item: any): boolean => [...(item?.system?.rangedModes ?? []), ...(item?.system?.meleeModes ?? [])].some(isNuclearMode);

const tlOf = (item: any): number => Number(String(item?.system?.tl ?? "").match(/\d+/)?.[0]) || 0;

/** Whether a character has the Electrical disadvantage. */
const isElectrical = (actor: any): boolean => [...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && /^electrical\b/i.test(String(i.name ?? "")));

/** Gear the pulse may reach: powered gear is ticked by default. */
const electronicsOf = (actor: any): any[] => [...(actor?.items ?? [])].filter((i: any) => ["equipment", "armor"].includes(String(i?.type)) && i?.system?.carried !== false);
const poweredGear = (item: any): boolean => {
  try {
    if (isPowered(powerData(item))) return true;
  } catch {
    // no power data registered: judge by the name
  }
  return ELECTRONICS.test(String(item?.name ?? ""));
};

/** Gear that is electronic by its name, where its record gives it no power cells. */
const ELECTRONICS = /\b(radio|transceiver|walkie|telephone|phone|computer|laptop|camera|scanner|sensor|radar|sonar|gps|night.vision|thermograph|electronic|detector|transmitter|receiver|television|tv|pager)\b/i;

/** A resistance roll: 3 or 4 always holds, 17 or 18 never. */
const resists = (rolled: number, target: number): boolean => rolled <= 4 || (rolled <= 16 && rolled <= target);

export function readyNuclear(api: GWorldApi, on: () => boolean): void {
  // The burning falls off with twice the distance (p. 195).
  Hooks.on(api.combat.hooks.explosionFalloff, (context: any) => {
    if (!on() || String(context?.flag?.damageType ?? "") !== "burn" || !context.itemUuid) return;
    const item: any = (globalThis as any).fromUuidSync?.(String(context.itemUuid));
    if (isNuclear(item)) context.divisorPerYard = NUCLEAR_BURN_DIVISOR_PER_YARD;
  });

  // ── EMP (p. 196) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-nuclear-emp",
    itemTypes: ["equipment"],
    label: L("Nuclear.Emp"),
    icon: "fa-solid fa-bolt",
    visible: (item: any) => on() && isNuclear(item),
    run: (item: any, actor: any) => { void pulse(item, actor); },
  } as any);

  const pulse = async (item: any, actor: any) => {
    const victims = targetedTokens().map((t) => t?.actor).filter(Boolean);
    if (!victims.length) return void ui.notifications?.warn(L("Nuclear.NoTargets"));
    const controls: string[] = [hint(F("Nuclear.EmpHint", { modifier: EMP.modifier, divisor: EMP.divisor }))];
    victims.forEach((victim: any, v: number) => {
      controls.push(`<strong>${esc(victim.name)}</strong>${isElectrical(victim) ? ` <em>${esc(L("Nuclear.Electrical"))}</em>` : ""}`);
      for (const gear of electronicsOf(victim)) controls.push(checkbox(`g${v}-${gear.id}`, String(gear.name ?? ""), poweredGear(gear)));
    });
    const value = await ask(L("Nuclear.Emp"), controls.join(""), L("Nuclear.EmpGo"));
    if (!value) return;
    const lines: string[] = [];
    for (const [v, victim] of victims.entries()) {
      const name = String(victim.name ?? "");
      if (isElectrical(victim)) {
        // Rolled here rather than as a success roll: at HT-8 most characters are
        // below the 3 a skill needs to be tried at all, and a resistance roll is
        // still made (3 or 4 always resists).
        const dr = Number((api.actors.derived(victim) as any)?.drByLocation?.torso) || 0;
        const target = empResistance(Number(api.actors.attribute(victim, "HT")) || 10, dr);
        const rolled = roll3d();
        if (resists(rolled, target)) lines.push(F("Nuclear.EmpResisted", { name, roll: rolled, target }));
        else {
          if (victim.isOwner) await api.actors.applyCondition(victim, { key: "unconscious" } as any);
          lines.push(F("Nuclear.EmpDown", { name, roll: rolled, target }));
        }
      }
      for (const gear of electronicsOf(victim)) {
        if (value(`g${v}-${gear.id}`) !== "on") continue;
        const stats: any = (api.items as any).objectStats?.(gear) ?? null;
        const target = empResistance(Number(stats?.ht) || 10, Number(stats?.dr) || 0);
        const rolled = roll3d();
        const holds = resists(rolled, target);
        const gearName = String(gear.name ?? "");
        if (holds) {
          lines.push(F("Nuclear.GearHolds", { gear: gearName, name, roll: rolled, target }));
          continue;
        }
        const penalty = empRepairPenalty(tlOf(gear));
        if (gear.isOwner) {
          await gear.setFlag(MODULE_ID, EMP_FLAG, { penalty });
          if ((gear.system?.rangedModes ?? []).length || (gear.system?.meleeModes ?? []).length) await api.items.setMalfunction(gear, { kind: EMP_KIND, label: L("Nuclear.EmpMalfunction") } as any);
        }
        lines.push(F("Nuclear.GearOut", { gear: gearName, name, roll: rolled, target, penalty }));
      }
    }
    await say(actor, L("Nuclear.Emp"), lines);
  };

  // Putting knocked-out gear right: Electronics Repair at -10 for solid-state gear, -4 for older (p. 196).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-emp-repair",
    itemTypes: ["equipment", "armor"],
    label: L("Nuclear.Repair"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item: any) => on() && Boolean(itemFlag(item, EMP_FLAG)),
    run: (item: any, actor: any) => {
      void (async () => {
        const penalty = Number(itemFlag(item, EMP_FLAG)?.penalty) || EMP.otherRepair;
        const repairs = [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^electronics repair\b/i.test(String(i.name ?? ""))).map((i: any) => ({ skill: String(i.name).replace(/\/TL\d+/i, ""), modifier: 0 }));
        const outcome = await skillRoll(api, actor, repairs.length ? repairs : [{ skill: "Electronics Repair", modifier: 0 }], F("Nuclear.RepairRoll", { gear: String(item.name ?? "") }), [{ label: L("Nuclear.RepairLine"), value: penalty }], ["repair", "emp"]);
        if (!outcome) return;
        if (outcome.success) {
          await item.unsetFlag(MODULE_ID, EMP_FLAG);
          if ((api.items.malfunction(item) as any)?.kind === EMP_KIND) await api.items.setMalfunction(item, null);
        }
        await say(actor, String(item.name ?? ""), [L(outcome.success ? "Nuclear.Repaired" : "Nuclear.NotRepaired")]);
      })();
    },
  } as any);

  // The system's Clear button on a weapon the pulse knocked out: the same repair.
  Hooks.on(api.combat.hooks.clearMalfunction, (context: any) => {
    if (!on() || context?.malfunction?.kind !== EMP_KIND) return;
    context.refusal = L("Nuclear.UseRepair");
  });

  // ── fallout (p. 196) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-nuclear-fallout",
    itemTypes: ["equipment"],
    label: L("Nuclear.Fallout"),
    icon: "fa-solid fa-radiation",
    visible: (item: any) => on() && isNuclear(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const value = await ask(L("Nuclear.Fallout"), [
          row(L("Nuclear.Yield"), number("kt", yieldKilotons(String(item.name ?? "")) ?? 0.1)),
          row(L("Nuclear.HoursAfter"), number("after", 0)),
          row(L("Nuclear.HoursIn"), number("hours", 1)),
          row(L("Nuclear.Protection"), number("pf", 1)),
          hint(L("Nuclear.FalloutHint")),
        ].join(""), L("Nuclear.FalloutGo"));
        if (!value) return;
        const kt = Math.max(0.001, Number(value("kt")) || 0.1);
        const after = Math.max(0, Number(value("after")) || 0);
        const hours = Math.max(0, Number(value("hours")) || 0);
        const protectionFactor = Math.max(1, Number(value("pf")) || 1);
        const footprint = falloutFootprint(kt);
        const rads = falloutRads(after, hours);
        const lines = [F("Nuclear.Footprint", { kt, length: footprint.length, width: footprint.width }), F("Nuclear.Rate", { rate: falloutRate(after), hours: after }), F("Nuclear.Dose", { rads, hours })];
        for (const victim of targetedTokens().map((t) => t?.actor).filter(Boolean)) {
          await (api as any).hazards.irradiate({ actor: victim, rads, protectionFactor });
          lines.push(F("Nuclear.Dosed", { name: String(victim.name ?? ""), rads, pf: protectionFactor }));
        }
        await say(actor, L("Nuclear.Fallout"), lines);
      })();
    },
  } as any);
}
