/**
 * GURPS Ultra-Tech's biochemical and nanotech weapons, registered with the
 * system through the add-on API (pp. 159-162), under two switches.
 *
 *   - **Biochemical agents:** riot, nerve, sleep and paralysis gas, pheromone
 *     spray, radiant prism, and nerve and sleep poisons with their contact
 *     versions, registered as poisons the system doses and cycles (API
 *     1.57.0); what a failed cycle does beyond damage, and the nerve agents'
 *     symptoms as HP is lost; who a sealed suit, a body that doesn't breathe,
 *     or no metabolism keeps them from; musk; clouds dispersing in the wind,
 *     smoke, mask, firefoam and metal embrittlement.
 *   - **Nanoweapons:** nanoburn with its paralysis and its cycles of damage,
 *     dominator nano, parasite seeds losing HT by the hour, splatter's
 *     detonation against Aegis, shrike against Aegis, and nanotracers, priced by
 *     how they're delivered.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { hasAegis } from "../medical/index.js";
import {
  AGENTS,
  AGENT_POISONS,
  MASK,
  NANOTRACER_TRACKING,
  NANO_DELIVERY,
  NERVE_AGENTS,
  PARASITE_HT_LOSS,
  RADIANT_PRISM_SENSOR,
  SMOKES,
  aegisSkill,
  agentEffects,
  cloudSeconds,
  dominatorCost,
  embrittlementDamage,
  firefoamDice,
  muskDays,
  nanotracerConcealment,
  nerveSymptoms,
  protectedFrom,
  shrikeSkill,
  smokeFormSeconds,
  splatterDetonation,
  splatterFormula,
  splatterSkill,
  type Agent,
  type NanoDelivery,
  type Smoke,
  MUSK_SECONDS,
  PHEROMONE_TRAIT,
  nerveDisorderAt,
} from "./rules.js";

import { placeArea, standsIn, type AreaLine } from "../../../shared/areas.js";
import { smokeAreaLines } from "../../../shared/smoke/rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Agents.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Agents.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "agent";
const PARASITE_FLAG = "utParasite";
const SMOKE_KINDS = Object.keys(SMOKES) as Smoke[];
const DELIVERIES = Object.keys(NANO_DELIVERY) as NanoDelivery[];

/** What an item is, as this section reads it: an agent it doses, a smoke, or another gadget of the chapter. */
const OTHERS = ["musk", "mask", "antiTangler", "firefoam", "embrittlement", "splatter", "shrike", "nanotracers", "disassemblerGlop"] as const;
type Other = (typeof OTHERS)[number];
type Kind = Agent | `smoke:${Smoke}` | Other;
const NANO: ReadonlySet<string> = new Set(["nanoburn", "dominator", "dominatorSuperscience", "parasiteSeed", "splatter", "shrike", "nanotracers"]);

export interface AgentSwitches {
  biochemical: () => boolean;
  nano: () => boolean;
}

interface AgentData {
  kind: Kind | "";
  delivery: NanoDelivery | "";
  disadvantage: string;
  disadvantagePoints: number;
  reversible: boolean;
  mindTrapping: boolean;
}

const ALL_KINDS: readonly string[] = [...AGENTS.filter((a) => a !== "nanoburnDamage"), ...SMOKE_KINDS.map((s) => `smoke:${s}`), ...OTHERS];

export function initAgents(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...ALL_KINDS] }),
      delivery: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...DELIVERIES] }),
      disadvantage: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      disadvantagePoints: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      reversible: new f.BooleanField({ initial: false }),
      mindTrapping: new f.BooleanField({ initial: false }),
    }),
  });
}

/** The kind a record's name is. */
function kindByName(name: string): Kind | "" {
  const text = String(name ?? "").trim();
  const table: Array<[RegExp, Kind]> = [
    [/^riot gas$/i, "riotGas"],
    [/^nerve gas/i, "nerveGas"],
    [/^sleep gas$/i, "sleepGas"],
    [/^paralysis gas$/i, "paralysisGas"],
    [/^pheromone spray$/i, "pheromoneSpray"],
    [/^radiant prism$/i, "radiantPrism"],
    [/^contact nerve poison$/i, "contactNervePoison"],
    [/^nerve poison$/i, "nervePoison"],
    [/^contact sleep poison$/i, "contactSleepPoison"],
    [/^sleep poison$/i, "sleepPoison"],
    [/^nanoburn$/i, "nanoburn"],
    [/^dominator nano \(superscience\)$/i, "dominatorSuperscience"],
    [/^dominator nano$/i, "dominator"],
    [/^parasite seed/i, "parasiteSeed"],
    [/^(screening )?smoke$/i, "smoke:screening"],
    [/^colored smoke$/i, "smoke:colored"],
    [/^hot smoke$/i, "smoke:hot"],
    [/^prism smoke$/i, "smoke:prism"],
    [/^electromagnetic smoke$/i, "smoke:electromagnetic"],
    [/^musk$/i, "musk"],
    [/^mask$/i, "mask"],
    [/^anti-tangler/i, "antiTangler"],
    [/^firefoam$/i, "firefoam"],
    [/^metal embrittlement/i, "embrittlement"],
    [/^splatter nano$/i, "splatter"],
    [/^shrike nano$/i, "shrike"],
    [/^nanotracers$/i, "nanotracers"],
    [/nanoglop$/i, "disassemblerGlop"],
  ];
  return table.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function agentData(item: any): AgentData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    kind: ALL_KINDS.includes(d.kind) ? d.kind : kindByName(item?.name),
    delivery: DELIVERIES.includes(d.delivery) ? d.delivery : "",
    disadvantage: String(d.disadvantage ?? ""),
    disadvantagePoints: Math.floor(Number(d.disadvantagePoints) || 0),
    reversible: Boolean(d.reversible),
    mindTrapping: Boolean(d.mindTrapping),
  };
}

const isAgent = (kind: string): kind is Agent => (AGENTS as readonly string[]).includes(kind);
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;
const switchFor = (on: AgentSwitches, kind: string) => (NANO.has(kind) ? on.nano() : on.biochemical());

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const numberField = (form: HTMLElement, name: string) => Number(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value) || 0;

/** The poison a registered agent is, as the system's `dosePoison` takes it. */
function poisonOf(agent: Agent): any {
  return { ...AGENT_POISONS[agent], name: L(`Agent.${agent}`), source: `${MODULE_ID}.${agent}` };
}

/** Whether a victim is out of an agent's reach, and why. */
function protection(api: GWorldApi, actor: any, agent: Agent): string | null {
  // Aegis nanobots keep out known metabolic nanoweapons (p. 206).
  if (NANO.has(agent) && hasAegis(actor)) return "aegis";
  const effects = api.actors.derived(actor)?.traitEffects ?? {};
  const traits = [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
  return protectedFrom(agent, {
    sealed: effects.sealed === true,
    doesntBreathe: effects.doesntBreathe === true,
    filterLungs: effects.filterLungs === true,
    metabolicImmunity: traits.some((n) => /immunity to metabolic hazards|^machine\b/i.test(n)),
  });
}

/** Doses each victim with an agent, and runs the first cycle at once where it has no delay (pp. 159-162). */
async function expose(api: GWorldApi, agent: Agent, victims: any[], doublings = 0): Promise<void> {
  for (const actor of victims) {
    const why = protection(api, actor, agent);
    if (why) {
      await say(actor, L(`Agent.${agent}`), [F(`Protected.${why}`, { name: actor.name })]);
      continue;
    }
    const dose = await api.actors.dosePoison(actor, poisonOf(agent), { doublings });
    if (dose && !dose.delaySeconds) await api.actors.advancePoison(actor, dose.id);
  }
}

const TIMED_TRAITS = "utTimedTraits";
const DISORDER_FLAG = "utNerveDisorder";
interface TimedTrait { itemId: string; until: number }
const worldNow = () => Number((game as any).time?.worldTime) || 0;
const timedTraits = (actor: any): TimedTrait[] => {
  const stored = actor?.getFlag?.(MODULE_ID, TIMED_TRAITS);
  return Array.isArray(stored) ? stored.filter((t: any) => t && typeof t.itemId === "string") : [];
};

/** Gives a character a trait until a world time, when it comes off again. */
async function giveTraitFor(actor: any, name: string, points: number, seconds: number | null): Promise<string | null> {
  if (!actor?.isOwner) return null;
  const [trait] = await actor.createEmbeddedDocuments("Item", [{ name, type: "trait", system: { points } }]);
  if (trait && seconds) await actor.setFlag(MODULE_ID, TIMED_TRAITS, [...timedTraits(actor), { itemId: trait.id, until: worldNow() + seconds }]);
  return trait?.id ?? null;
}

/** Takes off the traits whose time is up. */
async function expireTraits(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const all = timedTraits(actor);
  const done = all.filter((t) => t.until <= worldNow());
  if (!done.length) return;
  await actor.setFlag(MODULE_ID, TIMED_TRAITS, all.filter((t) => t.until > worldNow()));
  const ids = done.map((t) => t.itemId).filter((id) => actor.items.get(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}

/** The Neurological Disorder a nerve agent left, kept to the HP lost (p. 160). */
async function setNerveDisorder(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const stored = actor.getFlag?.(MODULE_ID, DISORDER_FLAG) as { itemId: string; severity: string } | undefined;
  if (!stored) return;
  const max = Number(actor.system?.hp?.max) || 0;
  const lost = max - (Number(actor.system?.hp?.value) || 0);
  const severity = nerveDisorderAt(lost, max);
  if (severity === stored.severity) return;
  if (actor.items.get(stored.itemId)) await actor.deleteEmbeddedDocuments("Item", [stored.itemId]);
  if (!severity) return void actor.unsetFlag(MODULE_ID, DISORDER_FLAG);
  const [trait] = await actor.createEmbeddedDocuments("Item", [{ name: `Neurological Disorder (${severity})`, type: "trait", system: { points: 0 } }]);
  await actor.setFlag(MODULE_ID, DISORDER_FLAG, { itemId: trait.id, severity });
}

function targetedActors(): any[] {
  const targeted = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (targeted.length) return targeted;
  return (canvas?.tokens?.controlled ?? []).map((t: any) => t.actor).filter(Boolean);
}

/** Rolls 3d6 against a skill, quietly, for the nanomachine contests. */
async function quietRoll(api: GWorldApi, skill: number): Promise<any> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  return api.rules.resolveSuccess(roll.total ?? 0, skill);
}

/** Splatter's detonation after Aegis has fought it a minute at a time (p. 162). */
async function splatter(api: GWorldApi): Promise<void> {
  const victim = targetedActors()[0] ?? null;
  const answer = await ask(L("Splatter.Title"),
    row(L("Splatter.Doses"), `<input type="number" name="doses" value="1" min="1" style="width:70px" />`)
    + row(L("Splatter.Minutes"), `<input type="number" name="minutes" value="5" min="1" style="width:70px" />`)
    + row(L("Splatter.SplatterTl"), `<input type="number" name="tl" value="11" min="11" max="12" style="width:70px" />`)
    + row(L("Splatter.AegisTl"), `<input type="number" name="aegis" value="0" min="0" max="12" style="width:70px" />`),
    (form) => ({ doses: numberField(form, "doses"), minutes: numberField(form, "minutes"), tl: numberField(form, "tl"), aegis: numberField(form, "aegis") }));
  if (!answer) return;
  let wins = 0;
  const lines: string[] = [];
  if (answer.aegis >= 10) {
    for (let minute = 1; minute <= answer.minutes && wins < 6; minute++) {
      const aegis = await quietRoll(api, aegisSkill(answer.aegis));
      const bomb = await quietRoll(api, splatterSkill(answer.tl));
      if (api.rules.quickContest(aegis, bomb).outcome === "first") wins++;
    }
    lines.push(F("Splatter.Contests", { wins, minutes: answer.minutes }));
  }
  const blast = splatterDetonation({ doses: answer.doses, minutes: answer.minutes, aegisWins: wins });
  if (blast.exterminated) {
    lines.push(L("Splatter.Exterminated"));
    await say(victim, L("Splatter.Title"), lines);
    return;
  }
  await say(victim, L("Splatter.Title"), lines);
  await api.roll.damage({ actor: victim ?? (game as any).user?.character ?? null, label: F("Splatter.Label", { dice: blast.dice }), formula: splatterFormula(blast.dice, blast.perDie), damageType: "tox" } as any);
}

/** Shrike nano against Aegis, a contest a minute (p. 162). */
async function shrike(api: GWorldApi): Promise<void> {
  const victim = targetedActors()[0] ?? null;
  const answer = await ask(L("Shrike.Title"),
    row(L("Shrike.Minutes"), `<input type="number" name="minutes" value="3" min="1" style="width:70px" />`)
    + row(L("Shrike.ShrikeTl"), `<input type="number" name="tl" value="11" min="10" max="12" style="width:70px" />`)
    + row(L("Shrike.Doublings"), `<input type="number" name="doublings" value="0" min="0" style="width:70px" />`)
    + row(L("Shrike.AegisTl"), `<input type="number" name="aegis" value="11" min="10" max="12" style="width:70px" />`),
    (form) => ({ minutes: numberField(form, "minutes"), tl: numberField(form, "tl"), doublings: numberField(form, "doublings"), aegis: numberField(form, "aegis") }));
  if (!answer) return;
  const lines: string[] = [];
  let shrikeDoses = 2 ** Math.max(0, answer.doublings);
  let result = "Fighting";
  for (let minute = 1; minute <= answer.minutes; minute++) {
    const outcome = api.rules.quickContest(await quietRoll(api, shrikeSkill(answer.tl, Math.log2(shrikeDoses))), await quietRoll(api, aegisSkill(answer.aegis))).outcome;
    if (outcome === "first") {
      result = "AegisDead";
      lines.push(F("Shrike.Minute", { minute, what: L("Shrike.AegisDead") }));
      break;
    }
    if (outcome === "second") {
      shrikeDoses -= 1;
      lines.push(F("Shrike.Minute", { minute, what: L("Shrike.DoseKilled") }));
      if (shrikeDoses <= 0) {
        result = "ShrikeDead";
        break;
      }
    }
  }
  lines.push(L(`Shrike.${result}`));
  await say(victim, L("Shrike.Title"), lines);
}

/** Metal embrittlement: 3d corrosion an hour, times SM on a large object (p. 161). */
async function embrittle(): Promise<void> {
  const answer = await ask(L("Embrittlement.Title"),
    row(L("Embrittlement.Sm"), `<input type="number" name="sm" value="0" style="width:70px" />`)
    + row(L("Embrittlement.Hours"), `<input type="number" name="hours" value="1" min="1" max="12" style="width:70px" />`),
    (form) => ({ sm: numberField(form, "sm"), hours: numberField(form, "hours") }));
  if (!answer) return;
  const damage = embrittlementDamage(answer.sm);
  const hours = Math.max(1, Math.min(damage.hours, answer.hours));
  const roll = new Roll(`${damage.dice * hours}d6`);
  await roll.evaluate();
  const total = (roll.total ?? 0) * damage.multiplier;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({}),
    rolls: [roll],
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Embrittlement.Title"))}</span></div><div class="gc-result">${esc(F("Embrittlement.Result", { total, hours, multiplier: damage.multiplier }))}</div></div>`,
  });
}

async function agentsTool(api: GWorldApi, on: AgentSwitches): Promise<void> {
  const choices = [
    ...(on.biochemical() ? ["expose", "cloud", "embrittlement"] : []),
    ...(on.nano() ? ["splatter", "shrike"] : []),
  ];
  const agents = AGENTS.filter((a) => a !== "nanoburnDamage" && switchFor(on, a));
  const answer = await ask(L("Tool.Title"),
    row(L("Tool.What"), `<select name="what">${choices.map((c) => `<option value="${c}">${esc(L(`Tool.${c}`))}</option>`).join("")}</select>`)
    + row(L("Tool.Agent"), `<select name="agent">${agents.map((a) => `<option value="${a}">${esc(L(`Agent.${a}`))}</option>`).join("")}</select>`)
    + row(L("Tool.Wind"), `<input type="number" name="wind" value="0" min="0" style="width:70px" />`),
    (form) => ({
      what: form.querySelector<HTMLSelectElement>("[name=what]")?.value ?? "",
      agent: form.querySelector<HTMLSelectElement>("[name=agent]")?.value as Agent,
      wind: numberField(form, "wind"),
    }));
  if (!answer) return;
  if (answer.what === "expose") {
    const victims = targetedActors();
    if (!victims.length) return void ui.notifications?.warn(L("Tool.PickVictims"));
    await expose(api, answer.agent, victims);
  } else if (answer.what === "cloud") {
    await say(null, L("Tool.cloud"), [F("CloudLine", { seconds: cloudSeconds(answer.wind), wind: answer.wind })]);
  } else if (answer.what === "embrittlement") await embrittle();
  else if (answer.what === "splatter") await splatter(api);
  else if (answer.what === "shrike") await shrike(api);
}

function itemContext(item: any): Record<string, unknown> {
  const data = agentData(item);
  const kind = data.kind;
  const lines: string[] = [];
  if (isAgent(kind)) {
    const p = AGENT_POISONS[kind];
    lines.push(F("PoisonLine", {
      resist: p.resistanceModifier === null ? L("NoRoll") : `HT${p.resistanceModifier >= 0 ? "+" : ""}${p.resistanceModifier}`,
      delivery: p.delivery.map((d) => L(`Delivery.${d}`)).join(", ") || "-",
    }));
    lines.push(L(`Effect.${kind}`));
  }
  if (kind.startsWith("smoke:")) {
    const smoke = SMOKES[kind.slice(6) as Smoke];
    lines.push(F("SmokeLine", { vision: smoke.vision, blocks: smoke.blocks.map((b) => L(`Blocks.${b}`)).join(", "), senses: smoke.senses.length ? L("SmokeSenses") : "" }));
    if (kind === "smoke:radiantPrism") lines.push(F("RadiantPrismLine", { penalty: RADIANT_PRISM_SENSOR }));
    lines.push(F("SmokeFormLine", { seconds: smokeFormSeconds(5) }));
  }
  if (kind === "radiantPrism") lines.push(F("RadiantPrismLine", { penalty: RADIANT_PRISM_SENSOR }));
  if (kind === "musk") lines.push(F("MuskLine", { days: muskDays(0) }));
  if (kind === "mask") lines.push(F("MaskLine", { penalty: MASK }));
  if (kind === "firefoam") lines.push(F("FirefoamLine", { dice: firefoamDice(Number((item.actor?.system?.tl ?? tlOf(item))) || tlOf(item)) }));
  if (kind === "embrittlement") lines.push(L("EmbrittlementLine"));
  if (kind === "nanotracers") lines.push(F("NanotracerLine", { bonus: NANOTRACER_TRACKING, penalty: nanotracerConcealment(tlOf(item)) }));
  if (kind === "splatter" || kind === "shrike") lines.push(L(`Effect.${kind}`));
  if (kind === "antiTangler" || kind === "disassemblerGlop") lines.push(L(`Effect.${kind}`));
  const nano = NANO.has(kind);
  return {
    data,
    editable: item.isOwner,
    nano,
    dominator: kind === "dominator" || kind === "dominatorSuperscience",
    parasite: kind === "parasiteSeed",
    kinds: [{ value: "", label: L("Kind.none"), selected: !data.kind }, ...ALL_KINDS.map((value) => ({ value, label: L(`Kind.${value.replace(":", "_")}`), selected: value === data.kind }))],
    deliveries: [{ value: "", label: L("NanoDelivery.followUp"), selected: !data.delivery }, ...DELIVERIES.filter((d) => d !== "followUp").map((value) => ({ value, label: L(`NanoDelivery.${value}`), selected: value === data.delivery }))],
    lines,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-agent]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtAgent);
      let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "disadvantagePoints") value = Math.floor(Number(input.value) || 0);
      void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
    });
  });
}

export function readyAgents(api: GWorldApi, on: AgentSwitches): void {
  // Every agent the system's dose machinery runs (API 1.57.0).
  for (const agent of AGENTS) {
    api.data.registerPoison({
      module: MODULE_ID,
      key: agent,
      label: `GCC.UT.Agents.Agent.${agent}`,
      poison: AGENT_POISONS[agent],
      available: () => switchFor(on, agent),
    });
  }

  // A metabolic nanoweapon's price by how it's delivered; dominator nano by points; a mind-trapping seed (pp. 161-162).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-agents",
    types: ["equipment"],
    apply: (item, price) => {
      const data = agentData(item);
      if (!data.kind || !NANO.has(data.kind) || !on.nano()) return null;
      let cost = price.cost;
      if ((data.kind === "dominator" || data.kind === "dominatorSuperscience") && data.disadvantagePoints) cost = dominatorCost(data.disadvantagePoints, data.reversible, data.kind === "dominatorSuperscience");
      if (data.kind === "parasiteSeed" && data.mindTrapping) cost = 100000;
      if (data.delivery) cost *= NANO_DELIVERY[data.delivery];
      return cost === price.cost ? null : { cost: Math.round(cost * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-agents-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-agents-item.hbs`,
    visible: (item) => item?.type === "equipment" && Boolean(agentData(item).kind) && switchFor(on, agentData(item).kind),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  // What a cycle of one of this book's agents does beyond its damage.
  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    const source = String(context?.source ?? "");
    if (!source.startsWith(`${MODULE_ID}.`)) return;
    const agent = source.slice(MODULE_ID.length + 1) as Agent;
    if (!isAgent(agent) || !switchFor(on, agent)) return;
    const actor = context.actor;
    if (!actor?.isOwner) return;
    const name = String(actor.name ?? "");
    const lines: string[] = [];
    if (context.resisted === false) {
      for (const effect of agentEffects(agent, context.margin, context.criticalFailure === true)) {
        if (effect.condition) void api.actors.applyCondition(actor, { key: effect.condition, ...(effect.seconds ? { duration: { seconds: effect.seconds } } : {}) });
        lines.push(F(`Failed.${effect.note}`, { name, minutes: Math.max(1, Math.floor(context.margin)) }));
      }
      if (agent === "paralysisGas") void api.actors.setPosture(actor, "lying");
      // Pheromone spray: Lecherousness (9) for the margin's minutes past the cloud (p. 160).
      if (agent === "pheromoneSpray") void giveTraitFor(actor, PHEROMONE_TRAIT, -15, Math.max(1, Math.floor(context.margin)) * 60);
      if (agent === "paralysisGas" && context.criticalFailure) {
        void (async () => {
          const roll = new Roll("1d6");
          await roll.evaluate();
          await api.actors.applyInjury(actor, { amount: roll.total ?? 0, label: L("Agent.paralysisGas") });
        })();
      }
      // Nanoburn's damage follows the paralysis, every three minutes for half an hour (p. 161).
      if (agent === "nanoburn") void api.actors.dosePoison(actor, poisonOf("nanoburnDamage"));
      if (agent === "parasiteSeed") {
        const lost = (Number(actor.getFlag?.(MODULE_ID, PARASITE_FLAG)) || 0) + PARASITE_HT_LOSS;
        void actor.setFlag?.(MODULE_ID, PARASITE_FLAG, lost);
        const ht = Number(api.actors.attribute(actor, "HT")) || 10;
        lines.push(F(lost >= ht ? "Failed.parasiteSeedDone" : "Failed.parasiteSeedHt", { name, lost, left: Math.max(0, ht - lost) }));
      }
    }
    if (context.resisted === true && agent === "parasiteSeed") {
      void actor.unsetFlag?.(MODULE_ID, PARASITE_FLAG);
      lines.push(F("Resisted.parasiteSeed", { name }));
    }
    // The nerve agents' symptoms as HP is lost (pp. 160-161).
    if (NERVE_AGENTS.has(agent)) {
      for (const threshold of context.symptomsNow ?? []) {
        const symptom = nerveSymptoms(String(threshold));
        if (!symptom) continue;
        if (symptom.condition) void api.actors.applyCondition(actor, { key: symptom.condition });
        // "The victim suffers only one disorder ... increasing as he loses HP" (p. 160).
        if (!actor.getFlag?.(MODULE_ID, DISORDER_FLAG)) void actor.setFlag(MODULE_ID, DISORDER_FLAG, { itemId: "", severity: "" }).then(() => setNerveDisorder(actor));
        else void setNerveDisorder(actor);
        lines.push(F("Symptom", { name, disorder: L(`Disorder.${symptom.disorder}`) }));
      }
    }
    void say(actor, L(`Agent.${agent}`), lines);
  });

  // Smoke, radiant prism and mask released where the user points: an area that changes rolls in and through it (p. 160).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-release-cloud",
    itemTypes: ["equipment"],
    label: L("Cloud.Title"),
    icon: "fa-solid fa-smog",
    visible: (item) => on.biochemical() && cloudLines(agentData(item).kind, L, F).length > 0,
    run: async (item, actor) => {
      const kind = agentData(item).kind;
      const answer = await ask(L("Cloud.Title"),
        row(L("Cloud.Radius"), `<input type="number" name="radius" value="5" min="1" style="width:70px" />`)
        + row(L("Tool.Wind"), `<input type="number" name="wind" value="0" min="0" style="width:70px" />`),
        (form) => ({ radius: numberField(form, "radius"), wind: numberField(form, "wind") }));
      if (!answer) return;
      const longevity = kind.startsWith("smoke:") ? SMOKES[kind.slice(6) as Smoke].longevity : 1;
      const id = await placeArea(api, { key: `cloud-${kind.replace(":", "-")}`, label: String(item.name), actor, radiusYards: answer.radius, seconds: Math.round(cloudSeconds(answer.wind) * longevity), lines: cloudLines(kind, L, F) });
      if (!id) return void ui.notifications?.warn(L("Cloud.NoPlace"));
      await say(actor, String(item.name), [F("Cloud.Placed", { radius: answer.radius, seconds: Math.round(cloudSeconds(answer.wind) * longevity) })]);
    },
  });

  // Mask: -6 to Tracking and Forensics for someone working in it (p. 160).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.biochemical() || !/^(tracking|forensics)\b/i.test(String(context?.skill ?? ""))) return;
    if (standsIn(api, context.actor, "cloud-mask")) context.modifiers.push({ label: L("Kind.mask"), value: MASK });
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-agent-expose",
    itemTypes: ["equipment"],
    label: L("ExposeTitle"),
    icon: "fa-solid fa-biohazard",
    visible: (item) => {
      const kind = agentData(item).kind;
      return isAgent(kind) && switchFor(on, kind);
    },
    run: async (item, actor) => {
      const victims = targetedActors();
      if (!victims.length) return void ui.notifications?.warn(L("Tool.PickVictims"));
      await expose(api, agentData(item).kind as Agent, victims);
      void actor;
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-musk",
    itemTypes: ["equipment"],
    label: L("MuskTitle"),
    icon: "fa-solid fa-spray-can",
    visible: (item) => on.biochemical() && agentData(item).kind === "musk",
    run: async () => {
      for (const victim of targetedActors()) {
        const sealed = api.actors.derived(victim)?.traitEffects?.sealed === true;
        if (!sealed) await giveTraitFor(victim, "Bad Smell", -10, MUSK_SECONDS);
        await say(victim, L("Kind.musk"), [F(sealed ? "MuskSealed" : "MuskHit", { name: victim.name, days: muskDays(0) })]);
      }
    },
  });

  // Timed traits come off, and a nerve agent's disorder eases, as time and HP pass.
  Hooks.on("updateWorldTime", () => {
    if (!(game as any).user?.isGM) return;
    for (const actor of (game as any).actors ?? []) if (timedTraits(actor).length) void expireTraits(actor);
  });
  Hooks.on("updateActor", (actor: any, change: any) => {
    if (!(game as any).user?.isGM || change?.system?.hp === undefined) return;
    if (actor.getFlag?.(MODULE_ID, DISORDER_FLAG)) void setNerveDisorder(actor);
  });

  // Applying a contact poison in haste: DX or Poisons, or an accident (p. 161).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-contact-haste",
    itemTypes: ["equipment"],
    label: L("HasteTitle"),
    icon: "fa-solid fa-hand-dots",
    visible: (item) => on.biochemical() && /^contact(NervePoison|SleepPoison)$/.test(agentData(item).kind),
    run: async (item, actor) => {
      const base = Math.max(api.actors.skillLevel(actor, "Poisons") ?? 0, api.actors.attribute(actor, "DX") ?? 10);
      const result: any = await api.roll.success({ actor, base, label: F("HasteLabel", { name: item.name }) } as any);
      if (!result) return;
      if (result.success) return void say(actor, String(item.name), [L("HasteDone")]);
      await say(actor, String(item.name), [F("HasteAccident", { name: actor.name })]);
      await api.actors.dosePoison(actor, poisonOf(agentData(item).kind as Agent));
    },
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-agents",
    label: L("Tool.Title"),
    icon: "fa-solid fa-biohazard",
    visible: () => on.biochemical() || on.nano(),
    open: () => agentsTool(api, on),
  });
}

/** What a cloud puts on rolls in and through it: smoke's vision, radiant prism's sensors, mask's smell (p. 160). */
function cloudLines(kind: string, l: (key: string) => string, f: (key: string, data: Record<string, unknown>) => string): AreaLine[] {
  const lines: AreaLine[] = [];
  if (kind.startsWith("smoke:")) {
    const smoke = SMOKES[kind.slice(6) as Smoke];
    if (!smoke) return lines;
    lines.push(...smokeAreaLines(smoke, { vision: (value) => f("Cloud.Vision", { value }), sensors: l("Cloud.Sensors") }));
  }
  if (kind === "smoke:radiantPrism" || kind === "radiantPrism") lines.push({ label: l("Kind.radiantPrism"), value: RADIANT_PRISM_SENSOR, rolls: ["infrared", "radar", "imagingRadar"], applies: "both" });
  if (kind === "mask") lines.push({ label: l("Kind.mask"), value: MASK, rolls: ["tasteSmell"], applies: "both" });
  return lines;
}
