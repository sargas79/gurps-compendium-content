/**
 * GURPS Ultra-Tech's robots, registered with the system through the add-on
 * API (pp. 26-35).
 *
 *   - **Robots:** a Traits tab section for a character built from the book's
 *     robot templates -- the body's price with its lenses, the AI software's
 *     price and the Complexity it needs against the computer the body carries
 *     (one size smaller for a total cyborg), the robot's Legality Class, and
 *     its digital backup; a GM tool to reprogram an AI with physical access or
 *     without the codes; and a critical hit from a surge attack knocking out
 *     anything Electrical.
 *   - **Cinematic robots:** a robot knocked back rolls IQ at -2 a yard or is
 *     stunned; Automatons don't dodge; GM tools for painting over a robot's
 *     sensors and for confronting it with a paradox.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { aiLegality, computerFigures, highestAiIq } from "../computers/rules.js";
import {
  BACKUP_SECONDS,
  BIOMORPHIC_COST,
  INTELLIGENCE_LENSES,
  INVOLUNTARY,
  MOLTEN_METAL,
  PAINT_PENALTY,
  PANIC_DICE,
  PARADOX_SKILLS,
  PHYSICAL_ACCESS,
  SAPIENT_IQ,
  accessoryComputer,
  aiSoftwarePrice,
  backupGigabytes,
  bodyPrice,
  cyborgComputer,
  intelligenceComplexity,
  isAutomaton,
  knockbackStunPenalty,
  lensName,
  parseCostModifier,
  reprogrammingBonus,
  type Intelligence,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Robot.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Robot.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The flag holding what the sheet can't work out: mental points bought on top of the templates. */
const EXTRA_POINTS = "utRobotExtraPoints";

export interface RobotSwitches {
  robots: () => boolean;
  cinematic: () => boolean;
}

const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
const appliedTemplates = (actor: any): Array<{ name: string; kind: string; uuid: string }> => (actor?.system?.templates ?? []) as any[];

/** The intelligence lenses applied to a character. */
function intelligencesOf(actor: any): Intelligence[] {
  return appliedTemplates(actor)
    .map((t) => lensName(t.name))
    .filter((l) => l.prefix === "Intelligence" && l.lens in INTELLIGENCE_LENSES)
    .map((l) => INTELLIGENCE_LENSES[l.lens]!);
}

/** Whether an actor is a robot or total cyborg: built from the book's robot lenses, or a Machine. */
export function isRobot(actor: any): boolean {
  if (appliedTemplates(actor).some((t) => /^(Intelligence|Biomorphic): /.test(t.name))) return true;
  const traits = traitNames(actor);
  return traits.some((name) => /^machine\b/i.test(name)) || (traits.some((n) => /^electrical\b/i.test(n)) && traits.some((n) => /^(automaton|digital mind|ai)\b/i.test(n)));
}

const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};

/** Gigabytes as the book writes them: megabytes, gigabytes or terabytes. */
function sizeText(gigabytes: number): string {
  if (gigabytes >= 1000) return `${(gigabytes / 1000).toLocaleString()} TB`;
  if (gigabytes >= 1) return `${gigabytes.toLocaleString()} GB`;
  return `${Math.round(gigabytes * 1000)} MB`;
}

/** What the sheet section shows about a robot. */
async function robotContext(api: GWorldApi, actor: any): Promise<Record<string, unknown>> {
  const templates = appliedTemplates(actor);
  const docs = await Promise.all(templates.map(async (t) => ({ applied: t, doc: t.uuid ? await fromUuid(t.uuid).catch(() => null) : null })));
  const lensMods: Array<{ percent: number; dollars: number }> = [];
  let body: { cost: number; weight: string; power: string; lc: number | null; name: string } | null = null;
  let bodyTl: number | null = null;
  const entries: string[] = [...traitNames(actor)];
  for (const { applied, doc } of docs) {
    const { prefix, lens } = lensName(applied.name);
    for (const entry of (doc as any)?.system?.entries ?? []) entries.push(String(entry?.name ?? ""));
    const robotBody = (doc as any)?.system?.extensions?.[MODULE_ID]?.robotBody;
    if (robotBody && Number(robotBody.cost) > 0) {
      body = { cost: Number(robotBody.cost), weight: String(robotBody.weight ?? ""), power: String(robotBody.power ?? ""), lc: typeof robotBody.lc === "number" ? robotBody.lc : null, name: applied.name };
      bodyTl = tlOf(/TL\s?(\d+)/.exec(lens)?.[1]);
    } else if (robotBody?.costModifier) {
      lensMods.push(parseCostModifier(String(robotBody.costModifier)));
    } else if (prefix === "Biomorphic" && lens in BIOMORPHIC_COST) {
      lensMods.push({ percent: BIOMORPHIC_COST[lens]!, dollars: 0 });
    }
  }
  const kinds = intelligencesOf(actor);
  const kind: Intelligence | null = kinds[0] ?? null;
  const lensSet = new Set(templates.map((t) => lensName(t.name).lens));
  const lenses = { fast: lensSet.has("Fast"), lowRes: lensSet.has("Low-Res Upload") };
  const iq = api.actors.attribute(actor, "IQ") ?? 10;
  const tl = bodyTl ?? tlOf(actor?.system?.tl) ?? 10;
  const campaignTl = Math.max(tl, tlOf(actor?.system?.tl) ?? 0);
  const stored = actor?.getFlag?.(MODULE_ID, EXTRA_POINTS);
  const extraPoints = typeof stored === "number" ? stored : 0;

  const baseModel = accessoryComputer(entries);
  const model = baseModel && kind === "cyborgBrain" ? cyborgComputer(baseModel) : baseModel;
  const computer = model ? computerFigures({ model, tl, options: {} }) : null;
  const needed = kind ? intelligenceComplexity(kind, iq, lenses) : null;
  const software = kind ? aiSoftwarePrice({ kind, iq, tl: campaignTl, extraPoints, lenses }) : null;
  const price = body ? bodyPrice(body.cost, lensMods) : null;
  const aiLc = kind && kind !== "drone" && kind !== "cyborgBrain" ? aiLegality(kind, iq) : null;
  const lcs = [body?.lc, aiLc].filter((lc): lc is number => typeof lc === "number");

  const lines: string[] = [];
  if (body && price !== null) lines.push(F("Body", { name: body.name, cost: price.toLocaleString(), base: body.cost.toLocaleString(), weight: body.weight, power: body.power.replace(/\.$/, "") || L("NoPower") }));
  else lines.push(L("NoBody"));
  if (kind) lines.push(F("Intelligence", { kind: L(`Kind.${kind}`) }));
  else lines.push(L("NoIntelligence"));
  if (model && computer) {
    lines.push(F(kind === "cyborgBrain" ? "ComputerCyborg" : "Computer", { model: L(`Model.${model}`), complexity: computer.complexity, tl }));
    if (needed !== null) {
      const fits = computer.complexity >= needed;
      lines.push(F(fits ? "Fits" : "TooComplex", { needed, iq, complexity: computer.complexity }));
      if (!fits && kind && kind !== "drone") {
        const best = highestAiIq(kind as any, computer.complexity, lenses);
        if (best !== null) lines.push(F("HighestIq", { iq: best }));
      }
    }
  } else if (needed !== null) lines.push(F("Needs", { needed }));
  if (software) lines.push(F("Software", { price: software.price.toLocaleString(), base: software.base.toLocaleString(), complexity: software.complexity, tl: campaignTl, points: extraPoints }));
  else if (kind === "mindEmulation") lines.push(L("MindEmulationPrice"));
  else if (kind === "cyborgBrain") lines.push(L("CyborgBrainPrice"));
  if (price !== null) lines.push(F("Total", { total: (price + (software?.price ?? 0)).toLocaleString() }));
  if (lcs.length) lines.push(F("Legality", { lc: Math.min(...lcs) }));
  if (needed !== null && kind !== "cyborgBrain") lines.push(F("Backup", { size: sizeText(backupGigabytes(needed)), seconds: BACKUP_SECONDS }));
  return { lines, extraPoints, showsSoftware: Boolean(kind && kind !== "cyborgBrain" && kind !== "mindEmulation") };
}

function robotListeners(element: HTMLElement, actor: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ut-robot-points]")?.addEventListener("change", (event) => {
    const value = Math.round(Number((event.target as HTMLInputElement).value) || 0);
    void actor.setFlag(MODULE_ID, EXTRA_POINTS, value);
  });
}

/** Asks the GM a choice in a dialog; null when closed. */
async function choose(title: string, fields: string, read: (form: HTMLElement) => any): Promise<any> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  });
}

const pickedActors = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  target: [...((game as any).user?.targets ?? [])][0]?.actor ?? null,
});

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Reprogramming an AI (p. 35): with physical access, or a contest without the codes. */
async function reprogram(api: GWorldApi): Promise<void> {
  const { selected: hacker, target: ai } = pickedActors();
  if (!hacker || !ai) return void ui.notifications?.warn(L("Reprogram.Pick"));
  const method = await choose(L("Reprogram.Title"),
    `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Reprogram.Method"))}</span><select name="method"><option value="physical">${esc(L("Reprogram.physical"))}</option><option value="involuntary">${esc(L("Reprogram.involuntary"))}</option></select></label>`,
    (form) => form.querySelector<HTMLSelectElement>("[name=method]")?.value ?? "physical");
  if (!method) return;
  if (method === "physical") {
    const level = api.actors.skillLevel(hacker, PHYSICAL_ACCESS.skill) ?? api.actors.skillLevel(hacker, "Electronics Repair (Computer)");
    const base = level ?? (api.actors.attribute(hacker, "IQ") ?? 10) - 5;
    const result: any = await api.roll.success({ actor: hacker, base, skill: PHYSICAL_ACCESS.skill, label: F("Reprogram.PhysicalLabel", { name: ai.name, minutes: PHYSICAL_ACCESS.minutes }) } as any);
    if (!result) return;
    await say(hacker, L("Reprogram.Title"), [F(result.criticalFailure ? "Reprogram.Damaged" : result.success ? "Reprogram.Done" : "Reprogram.Failed", { name: ai.name, minutes: PHYSICAL_ACCESS.minutes })]);
    return;
  }
  const level = api.actors.skillLevel(hacker, INVOLUNTARY.skill);
  if (level === null) return void ui.notifications?.warn(F("Reprogram.NoSkill", { name: hacker.name, skill: INVOLUNTARY.skill }));
  const bonus = reprogrammingBonus([...traitNames(ai), ...(isAutomaton(traitNames(ai), intelligencesOf(ai)) ? ["Automaton"] : [])]);
  const outcome: any = await api.roll.quickContest({
    label: F("Reprogram.ContestLabel", { name: ai.name }),
    first: { actor: hacker, base: level, modifiers: bonus ? [{ label: L("Reprogram.Automaton"), value: bonus }] : [] },
    second: { actor: ai, base: api.actors.attribute(ai, "IQ") ?? 10 },
    tags: ["ut-reprogram"],
  });
  await say(hacker, L("Reprogram.Title"), [F(outcome?.outcome === "first" ? "Reprogram.Won" : "Reprogram.Lost", { name: ai.name, hours: INVOLUNTARY.hours })]);
}

/** Painting over a robot's sensors (p. 34): DX or Throwing at -10, then the robot's IQ roll against panic. */
/** Radar or other scanners: a Scanning Sense, Para-Radar or Ultrasonic trait, or an active sensor carried (p. 34). */
function hasScanners(actor: any): boolean {
  if (traitNames(actor).some((n) => /^(scanning sense|para-radar|radar|sonar|ultrasonic)/i.test(n))) return true;
  return [...(actor?.items ?? [])].some((i: any) => i.type === "equipment" && i.system?.carried !== false && /(ladar|radar|sonar|ultrascanner)$/i.test(String(i.name ?? "")));
}

async function paintSensors(api: GWorldApi): Promise<void> {
  const { selected: attacker, target: robot } = pickedActors();
  if (!attacker || !robot) return void ui.notifications?.warn(L("Paint.Pick"));
  const throwing = api.actors.skillLevel(attacker, "Throwing");
  const dx = api.actors.attribute(attacker, "DX") ?? 10;
  const base = Math.max(throwing ?? 0, dx);
  const hit: any = await api.roll.success({ actor: attacker, base, label: F("Paint.Label", { name: robot.name }), modifiers: [{ label: L("Paint.Penalty"), value: PAINT_PENALTY }] } as any);
  if (!hit?.success) return;
  // "-10 to hit (unless it has radar or other scanners)" (p. 34).
  const scanning = hasScanners(robot);
  await api.actors.applyCondition(robot, { module: MODULE_ID, key: "ut-sensors-painted", label: L("Paint.Condition"), effects: { modifiers: scanning ? [] : [{ label: L("Paint.Condition"), value: PAINT_PENALTY, rolls: ["attack"] }] } } as any);
  if (scanning) await say(robot, L("Paint.Title"), [F("Paint.Scanning", { name: robot.name })]);
  const panic: any = await api.roll.success({ actor: robot, base: api.actors.attribute(robot, "IQ") ?? 10, kind: "attribute", label: L("Paint.Panic") } as any);
  if (panic && !panic.success) {
    const roll = new Roll(PANIC_DICE);
    await roll.evaluate();
    await say(robot, L("Paint.Title"), [F("Paint.Panicked", { name: robot.name, turns: roll.total })]);
  } else if (panic) await say(robot, L("Paint.Title"), [F("Paint.Calm", { name: robot.name })]);
}

/** A logical paradox (p. 34): a sapient robot's IQ against Psychology, Fast-Talk or Computer Programming (AI). */
async function paradox(api: GWorldApi): Promise<void> {
  const { selected: talker, target: robot } = pickedActors();
  if (!talker || !robot) return void ui.notifications?.warn(L("Paradox.Pick"));
  const iq = api.actors.attribute(robot, "IQ") ?? 10;
  if (iq < SAPIENT_IQ) return void ui.notifications?.warn(F("Paradox.NotSapient", { name: robot.name }));
  const options = PARADOX_SKILLS.map((skill) => ({ skill, level: api.actors.skillLevel(talker, skill) })).filter((o) => o.level !== null);
  if (!options.length) return void ui.notifications?.warn(F("Paradox.NoSkill", { name: talker.name }));
  const skill = options.length === 1 ? options[0]!.skill : await choose(L("Paradox.Title"),
    `<label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("Paradox.Skill"))}</span><select name="skill">${options.map((o) => `<option value="${esc(o.skill)}">${esc(`${o.skill}-${o.level}`)}</option>`).join("")}</select></label>`,
    (form) => form.querySelector<HTMLSelectElement>("[name=skill]")?.value ?? null);
  const chosen = options.find((o) => o.skill === skill);
  if (!chosen) return;
  const outcome: any = await api.roll.quickContest({
    label: F("Paradox.ContestLabel", { name: robot.name }),
    first: { actor: talker, base: chosen.level! },
    second: { actor: robot, base: iq },
    tags: ["ut-paradox"],
  });
  if (outcome?.outcome === "first") {
    await api.actors.applyCondition(robot, { module: MODULE_ID, key: "ut-paradox", label: L("Paradox.Condition") } as any);
    await say(robot, L("Paradox.Title"), [F("Paradox.Won", { name: robot.name })]);
  } else await say(robot, L("Paradox.Title"), [F("Paradox.Lost", { name: robot.name })]);
}

/** The vat of molten metal (p. 34): 10d corrosion a second to whoever is in it. */
async function moltenMetal(api: GWorldApi): Promise<void> {
  const { target } = pickedActors();
  if (!target) return void ui.notifications?.warn(L("Molten.Pick"));
  await api.roll.damage({ actor: target, label: F("Molten.Label", { name: target.name }), formula: MOLTEN_METAL.replace("d6", "d"), damageType: "cor" } as any);
}

/** Whether a mode an item was rolled from has the Surge modifier. */
function surges(item: any, mode: any): boolean {
  if (!item || !mode) return false;
  const modes = mode.ranged ? item.system?.rangedModes : item.system?.meleeModes;
  return modes?.[Number(mode.index)]?.surge === true;
}

/**
 * Knocks out anything Electrical (Characters p. 134): the short circuit a
 * surge critical causes, for any rule that shorts one out. Returns whether it
 * did -- false for an actor without Electrical, or one this user can't change.
 */
export async function knockOutElectrical(api: GWorldApi, actor: any): Promise<boolean> {
  if (!actor?.isOwner || !traitNames(actor).some((n) => /^electrical\b/i.test(n))) return false;
  const applied = await api.actors.applyCondition(actor, { key: "unconscious" } as any);
  if (!applied) return false;
  await say(actor, L("Surge.Title"), [F("Surge.ShortCircuit", { name: actor.name })]);
  return true;
}

export function readyRobots(api: GWorldApi, on: RobotSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-robot",
    sheet: "character",
    tab: "traits",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ut-robot.hbs`,
    visible: (actor) => on.robots() && isRobot(actor),
    context: (actor) => robotContext(api, actor),
    listeners: (element, actor) => robotListeners(element, actor),
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-reprogram", label: L("Reprogram.Title"), icon: "fa-solid fa-microchip", visible: on.robots, open: () => reprogram(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-paint-sensors", label: L("Paint.Title"), icon: "fa-solid fa-paint-roller", visible: on.cinematic, open: () => paintSensors(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-paradox", label: L("Paradox.Title"), icon: "fa-solid fa-infinity", visible: on.cinematic, open: () => paradox(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-molten-metal", label: L("Molten.Title"), icon: "fa-solid fa-fire-flame-simple", visible: on.cinematic, open: () => moltenMetal(api) });

  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const actor = context?.actor;
    if (!actor?.isOwner || !game.user?.isGM) return;
    // "A critical hit from an electrical attack causes you to 'short-circuit'" (Characters p. 134),
    // which is what a surge attack does to anything Electrical (p. 112).
    if (on.robots() && context.damage?.critical && surges(context.item, context.mode)) void knockOutElectrical(api, actor);
    // A robot knocked back rolls IQ at -2 a yard or is mentally stunned for a turn (p. 34).
    const yards = Number(context.result?.knockback?.yards) || 0;
    if (on.cinematic() && yards > 0 && isRobot(actor)) {
      void (async () => {
        const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "IQ") ?? 10, kind: "attribute", label: L("Knockback.Label"), modifiers: [{ label: F("Knockback.Yards", { yards }), value: knockbackStunPenalty(yards) }] } as any);
        if (result && !result.success) await api.actors.applyCondition(actor, { key: "stunned", duration: { turns: 1 } } as any);
      })();
    }
  });

  // "Automaton robots don't dodge" (p. 34).
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    const defender = context?.defender;
    if (!on.cinematic() || !defender || !isRobot(defender) || !isAutomaton(traitNames(defender), intelligencesOf(defender))) return;
    const dodge = (context.choices ?? []).find((c: any) => c.key === "dodge");
    if (dodge?.available) {
      dodge.available = false;
      dodge.refusal = L("NoDodge");
    }
  });
}
