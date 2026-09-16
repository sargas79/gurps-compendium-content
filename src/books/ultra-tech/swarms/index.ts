/**
 * GURPS Ultra-Tech's swarmbots, registered with the system through the add-on
 * API (pp. 35-37, 92, 164, 169).
 *
 *   - **init:** the swarm builder's fields on equipment.
 *   - **ready:** the price of a swarm from its area, bots, chassis, power
 *     supply, types and options; an item sheet section that builds it and
 *     shows its statistics, and turns it into a swarm NPC the system's swarm
 *     rules (Campaigns p. 461) fight; and a GM tool for a combat swarm's
 *     second of damage against its targets, by the book's own rules.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { BOT_SIZES, designOf, isSwarm, registerSwarmData, storeSwarm, swarmBuild, swarmRecord } from "./data.js";
import {
  CHASSIS,
  CLOTHING_SECONDS,
  CONTROLLER_COMPLEXITY,
  POWER_SUPPLIES,
  SWARM_ATTACKS,
  SWARM_TYPES,
  designProblems,
  gremlinMalfunction,
  swarmCost,
  swarmEnduranceHours,
  swarmLegality,
  swarmStatistics,
  swarmInjury,
  type SwarmAttack,
  type SwarmDesign,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Swarm.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Swarm.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The flag a deployed swarm NPC carries: its design, for the attack tool. */
const DEPLOYED = "utSwarm";

export function initSwarms(): void {
  registerSwarmData();
}

/** Whether a swarm item's fields change anything from the record as it stands. */
function isBuilt(item: any, design: SwarmDesign): boolean {
  const build = swarmBuild(item);
  return design.squareYards !== 1 || build.chassis !== "crawler" || build.power !== "cells" || Boolean(build.secondType) || build.disguised || build.selfReplicating || build.extraModels > 0;
}

/** The types an item can choose, in the table's order, with the record's own marked. */
function typeChoices(selected: string | null): Array<{ value: string; label: string; selected: boolean }> {
  return [{ value: "", label: L("None"), selected: !selected }, ...Object.keys(SWARM_TYPES).map((value) => ({ value, label: L(`Type.${value}`), selected: value === selected }))];
}

function attackText(type: string | null): string {
  const attack = type ? SWARM_ATTACKS[type] : undefined;
  return attack && type ? L(`Attack.${type}`) : "";
}

function itemContext(item: any): Record<string, unknown> {
  const build = swarmBuild(item);
  const record = swarmRecord(item);
  const design = designOf(item);
  const cost = swarmCost(design);
  const stats = swarmStatistics(design.bots, design.chassis, design.tl);
  const endurance = swarmEnduranceHours(design.power, design.tl);
  const lc = swarmLegality(design, typeof item.system?.lc === "number" ? item.system.lc : null);
  const move = [stats.move.ground ? F("MoveGround", { move: stats.move.ground }) : "", stats.move.air ? F("MoveAir", { move: stats.move.air }) : "", stats.move.water ? F("MoveWater", { move: stats.move.water }) : ""].filter(Boolean).join(", ");
  return {
    build,
    squareYards: design.squareYards,
    typeFromName: Boolean(design.type) && !build.type,
    types: typeChoices(build.type || null),
    secondTypes: typeChoices(build.secondType || null),
    bots: BOT_SIZES.map((value) => ({ value, label: L(`Bots.${value}`), selected: value === design.bots })),
    chassis: CHASSIS.map((value) => ({ value, label: L(`Chassis.${value}`), selected: value === design.chassis })),
    powers: POWER_SUPPLIES.map((value) => ({ value, label: L(`Power.${value}`), selected: value === design.power })),
    repair: design.type === "repair",
    maxModels: record.maxModels,
    price: F("Price", { total: cost.total.toLocaleString(), perSquareYard: cost.perSquareYard.toLocaleString(), squareYards: design.squareYards }),
    lc: lc === null ? "" : F("Legality", { lc }),
    problems: designProblems(design).map((key) => L(`Problem.${key}`)),
    statistics: F("Statistics", { ...stats, move: move || L("NoMove"), weight: stats.weight * design.squareYards }),
    endurance: endurance === null ? L(`Endurance.${design.power}`) : F("EnduranceHours", { hours: endurance }),
    attack: attackText(design.type) || attackText(design.secondType ?? null),
    controller: F("Controller", { complexity: CONTROLLER_COMPLEXITY }),
    canDeploy: Boolean(game.user?.isGM),
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-swarm]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtSwarm);
      if (input instanceof HTMLInputElement && input.type === "checkbox") await storeSwarm(item, { [field]: input.checked });
      else if (field === "squareYards") await storeSwarm(item, { squareYards: Math.max(0.1, Number(input.value) || 1) });
      else if (field === "extraModels") await storeSwarm(item, { extraModels: Math.max(0, Math.floor(Number(input.value) || 0)) });
      else await storeSwarm(item, { [field]: input.value });
    });
  });
  element.querySelector("[data-gcc-ut-swarm-deploy]")?.addEventListener("click", () => void deploySwarm(api, item));
}

/** Makes a swarm NPC for a square yard of the swarm, for the system's swarm rules to fight (p. 37; Campaigns p. 461). */
async function deploySwarm(_api: GWorldApi, item: any): Promise<void> {
  if (!game.user?.isGM) return;
  const design = designOf(item);
  const stats = swarmStatistics(design.bots, design.chassis, design.tl);
  const speed = stats.speed;
  const move = Math.max(stats.move.ground, stats.move.air, stats.move.water);
  const gastro = design.power === "gastrobot";
  const flying = stats.move.air > 0;
  const count = Math.max(1, Math.round(design.squareYards));
  const actor = await Actor.implementation.create({
    name: F("DeployedName", { name: item.name }),
    type: "npc",
    system: {
      attributes: { ST: stats.st, DX: stats.dx, IQ: stats.iq, HT: stats.ht },
      purchased: { hp: stats.hp - stats.st, fp: 0, will: stats.will - stats.iq, per: stats.per - stats.iq, basicSpeed: speed - (stats.dx + stats.ht) / 4, basicMove: move - Math.floor(speed) },
      hp: { value: stats.hp, max: stats.hp },
      groupSize: count,
      tactics: L(gastro ? "TacticsGastrobot" : "Tactics"),
      swarm: { isSwarm: true, kind: "tiny", damage: "", flatInjury: 0, damageType: "cut", flying, about: F("About", { bots: L(`Bots.${design.bots}`).toLowerCase() }) },
    },
    flags: { [MODULE_ID]: { [DEPLOYED]: { ...design, itemName: item.name } } },
  } as any);
  if (actor) ui.notifications?.info(F("Deployed", { name: actor.name, count }));
}

/** Whether an actor is a machine, living, or a swarm, as a combat swarm tells them apart. */
function victimOf(api: GWorldApi, actor: any): { living: boolean; machine: boolean; swarm: boolean; sealed: boolean; dr: number } {
  const traits = [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
  const machine = actor?.type === "vehicle" || Boolean(actor?.getFlag?.(MODULE_ID, DEPLOYED)) || traits.some((name) => /^(machine|electrical)\b/i.test(name));
  const derived = api.actors.derived(actor) ?? {};
  return {
    living: !machine,
    machine,
    swarm: actor?.system?.swarm?.isSwarm === true,
    sealed: derived.traitEffects?.sealed === true,
    dr: Number(derived.drByLocation?.torso ?? actor?.system?.derived?.drByLocation?.torso) || 0,
  };
}

/** A second of a combat swarm against its targets (pp. 37, 164, 169). */
async function swarmSecond(api: GWorldApi): Promise<void> {
  const swarmActor = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
  const design = swarmActor?.getFlag?.(MODULE_ID, DEPLOYED) as (SwarmDesign & { itemName: string }) | undefined;
  const type = [design?.type, design?.secondType].find((t) => t && SWARM_ATTACKS[t]) ?? null;
  const attack: SwarmAttack | undefined = type ? SWARM_ATTACKS[type] : undefined;
  if (!swarmActor || !design || !attack || !type) return void ui.notifications?.warn(L("SelectSwarm"));
  const victims = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (!victims.length) return void ui.notifications?.warn(L("TargetVictims"));

  let covering: keyof typeof CLOTHING_SECONDS = "none";
  let secondsExposed = 0;
  if (attack.slowedByClothing) {
    const answer = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("AttackTitle") },
      content: `<div class="gworld" style="display:grid;gap:6px"><label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Covering"))}</span><select name="covering">${Object.keys(CLOTHING_SECONDS).map((key) => `<option value="${key}">${esc(L(`Covered.${key}`))}</option>`).join("")}</select></label>`
        + `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Seconds"))}</span><input type="number" name="seconds" value="0" min="0" step="1" style="width:70px" /></label></div>`,
      ok: {
        label: L("AttackGo"),
        callback: (_event: Event, button: HTMLElement) => {
          const form = button.closest<HTMLElement>(".application");
          return { covering: form?.querySelector<HTMLSelectElement>("[name=covering]")?.value ?? "none", seconds: Number(form?.querySelector<HTMLInputElement>("[name=seconds]")?.value) || 0 };
        },
      },
      rejectClose: false,
    }) as { covering: keyof typeof CLOTHING_SECONDS; seconds: number } | null;
    if (!answer) return;
    covering = answer.covering;
    secondsExposed = answer.seconds;
  }

  let rolled = 0;
  const rolls: any[] = [];
  if (attack.dice) {
    const roll = new Roll(attack.dice.replace(/(\d+)d(?!\d)/, "$1d6"));
    await roll.evaluate();
    rolls.push(roll);
    rolled = Math.max(0, Number(roll.total) || 0);
  }
  const lines: string[] = [];
  for (const victim of victims) {
    const who = victimOf(api, victim);
    const result = swarmInjury({ attack, rolled, squareYards: design.squareYards, victim: who, covering, secondsExposed });
    const name = String(victim.name ?? "");
    if (!result.amount) {
      lines.push(F(`Proof.${result.proof || "none"}`, { name }));
      continue;
    }
    const fatigue = attack.damageType === "fat";
    const taken = await api.actors.applyInjury(victim, { amount: result.amount, fatigue, label: L(`Type.${type}`) });
    lines.push(F(fatigue ? "Fatigued" : "Injured", { name, amount: result.amount, type: L(`DamageType.${attack.damageType}`), now: taken ? taken.to : "?" }));
    if (type === "gremlin") {
      const max = Number(victim.system?.hp?.max) || 0;
      const now = taken ? Number(taken.to) : Number(victim.system?.hp?.value) || 0;
      lines.push(F("Malfunction", { name, number: gremlinMalfunction(max - now, max) }));
    }
    if (attack.damageType === "cor" && who.sealed && who.dr > 0) lines.push(F("Corrosion", { name, dr: Math.floor(result.amount / 5) }));
  }
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: swarmActor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(F("AttackCard", { type: L(`Type.${type}`) }))}</span></div>`
      + (attack.dice ? `<div class="gc-result">${esc(F("Rolled", { dice: attack.dice, divisor: attack.divisor > 1 ? `(${attack.divisor})` : "", rolled }))}</div>` : "")
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
    rolls,
  });
}

export function readySwarms(api: GWorldApi, on: () => boolean): void {
  // The area, chassis, power supply, second type and options reprice the swarm (pp. 35-37).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-swarm",
    types: ["equipment"],
    apply: (item) => {
      if (!on() || !isSwarm(item)) return null;
      const design = designOf(item);
      if (!isBuilt(item, design)) return null;
      const cost = swarmCost(design);
      return { cost: cost.total, weight: Math.round(design.squareYards * 2 * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-swarm-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-swarm-item.hbs`,
    visible: (item) => on() && isSwarm(item),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-swarm-attack",
    label: L("AttackTitle"),
    icon: "fa-solid fa-bugs",
    visible: on,
    open: () => swarmSecond(api),
  });
}
