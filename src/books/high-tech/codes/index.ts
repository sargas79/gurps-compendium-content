/**
 * High-Tech's encryption, forgery, disguise and smuggling (pp. 210-215),
 * registered with the system through the add-on API under two switches. The
 * rules are in `rules.ts`.
 *
 *   - **Encryption (encryption):** "Break a code" from the Cryptography
 *     skill's row, a code-breaking program's row, or the GM's token controls
 *     for the selected character. An ad-libbed code is a Quick Contest of IQ-5
 *     (or Cryptography) with its maker, the targeted character or a level
 *     given; a TL5-6 system the Basic Set's Quick Contest of Cryptography. The
 *     other selected characters with Cryptography 17+ are the team, +1 each to
 *     the leader (at most +4). The encryption standards are a Cryptography
 *     roll with Time Spent against their base time and the program carried,
 *     which runs only on a carried computer of the standard's Complexity and
 *     its own; secure encryption can't be broken at TL8. The encryption
 *     gear's sheets say what code each makes, how long breaking it takes,
 *     and secure encryption's delay. With the supplement
 *     Electricity and Electronics' cipher machines (cipherMachines), a
 *     code-breaking machine joins the attempt: the bombe, +1 against a cipher
 *     machine's code, or Colossus, +2 (HT:EE p. 48).
 *   - **Disguise and smuggling (disguiseAndSmuggling):** forging with the
 *     book's forgery and counterfeiting tools through the shared forgery
 *     engine (`src/shared/forgery/`), a computer and printer needed from TL7,
 *     and money printed at TL8 taking a secret Counterfeiting roll the first
 *     time a printer is used, for whether it marks its pages;
 *     an improvised disguise from the Disguise skill's row (-5 in place of any
 *     kit); a disguise kit's row rolls Disguise with it, the advanced kit's
 *     day of preparation and hours of fitting on the card; smuggler's luggage
 *     rolls Smuggling for what its secret area holds; a mule's HT roll at -1
 *     per 50 pellets from the mule pills' row, the pills' cramps as moderate
 *     pain, a packet bursting on a critical failure as an overdose (the
 *     margin's hours unconscious, and a dose of the registered poison;
 *     Campaigns p. 441); and, from the GM's token
 *     controls, spotting a mule: a Quick Contest of Search or Observation
 *     against Acting, or an X-ray machine's Electronics Operation roll and
 *     then a Search roll.
 */

import { overdoseSeconds } from "../../../shared/drugs/rules.js";
import { FORGERY_TABLES, readyForgery, type ForgeryOutcome } from "../../../shared/forgery/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import {
  ADVANCED_DISGUISE,
  BURST_PACKET,
  CIPHER_WHEEL_MINUTES,
  CIPHER_WHEEL_SKILL,
  CODES,
  IMPROVISED_DISGUISE,
  NO_COMPUTER,
  SECURE_DELAY,
  SPOTTER_SKILLS,
  TEAM,
  XRAY_SKILLS,
  computerNeeded,
  disguiseKitByName,
  encryptionGearByName,
  forgeryNeeds,
  forgerySkills,
  forgeryToolByName,
  hiddenCapacity,
  improvisedLevel,
  isCardPrinter,
  isCodeBreakingProgram,
  isComputer,
  isContest,
  isMulePill,
  isPrinter,
  isStripEncoder,
  luggageByName,
  muleModifier,
  muleOutcome,
  programComplexity,
  standard,
  teamBonus,
  teamHelps,
  tracedPrinterTl,
  type Code,
  type ForgeryTool,
} from "./rules.js";
import { DECRYPTION_MACHINES, machineBonus, type DecryptionMachine } from "../sigint/rules.js";
import { complexityOf } from "../computing/index.js";
import { computerData } from "../../../shared/computers/data.js";

const NS = "GCC.HT.Codes";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const CRYPTOGRAPHY = "Cryptography";
const BURST = "mulePillBurst";
/** Whether a printer marks its pages, once a TL8 counterfeiter's Counterfeiting roll has found out (p. 214). */
const TRACED_PRINTER = "htTracedPrinter";
/** Pain already as bad as the cramps or worse (Campaigns p. 428). */
const PAINS = ["moderatePain", "severePain", "terriblePain", "agony"];

export interface CodesSwitches {
  encryption: () => boolean;
  disguise: () => boolean;
  /** The supplement's code-breaking machines (HT:EE p. 48). */
  cipher?: () => boolean;
}

/** Whether the supplement's code-breaking machines are on, once registered. */
let machinesOn: () => boolean = () => false;

async function say(actor: any, title: string, lines: string[], gmOnly = false): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    ...(gmOnly ? { whisper: ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id) } : {}),
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
const number = (form: HTMLElement, name: string) => Number(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value) || 0;

/** The one token the user has targeted's actor, or null. */
function targetedActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

/** The actors of the tokens the user has selected. */
function selectedActors(): any[] {
  return ((globalThis as any).canvas?.tokens?.controlled ?? []).map((t: any) => t.actor).filter(Boolean);
}

const carried = (item: any) => item?.type === "equipment" && item.system?.carried !== false;
const attribute = (api: GWorldApi, actor: any, name: string) => Number(api.actors.attribute(actor, name as never)) || 10;
const sameName = (api: GWorldApi, a: unknown, b: string) => api.rules.toolSkillKey(String(a ?? "")) === api.rules.toolSkillKey(b);

/** A skill's level, or null for one the character doesn't know. */
const level = (api: GWorldApi, actor: any, skill: string): number | null => api.actors.skillLevel(actor, skill) ?? null;

// ── encryption (pp. 210-211) ──

/**
 * A targeted maker's level: the better of IQ-5 and Cryptography for an
 * ad-libbed code, Cryptography for a system (a cipher wheel's maker's is
 * typically 16-18, p. 211).
 */
function makerLevel(api: GWorldApi, maker: any, code: Code): number {
  const cryptography = level(api, maker, CRYPTOGRAPHY);
  return code === "improvised" ? improvisedLevel(attribute(api, maker, "IQ"), cryptography) : cryptography ?? CIPHER_WHEEL_SKILL;
}

/** A computer's Complexity: a High-Tech computer's as its table works it out, or the system's own `complexity` (Campaigns p. 472); 0 where neither says. */
const measured = (item: any): number => Math.max(complexityOf(item) ?? 0, Math.floor(Number(item?.system?.complexity) || 0));

/**
 * The computers a code-breaker can run the program on: those carried, and
 * the one the program is installed on (`runsOn`) wherever it is. The
 * highest Complexity among them, and the first computer whose Complexity
 * can't be measured -- an ordinary record that states none -- or null.
 */
export function computersFor(actor: any, program: any = null): { best: number; unmeasured: any } {
  const host = program ? actor?.items?.get?.(computerData(program).runsOn) ?? [...(actor?.items ?? [])].find((i: any) => i.id === computerData(program).runsOn) ?? null : null;
  let best = 0;
  let unmeasured: any = null;
  for (const item of actor?.items ?? []) {
    if (item !== host && !carried(item)) continue;
    const complexity = measured(item);
    if (complexity > 0) best = Math.max(best, complexity);
    else if (item === host || isComputer(String(item.name ?? ""))) unmeasured ??= item;
  }
  return { best, unmeasured };
}

/** Hours as the card says them. */
function duration(hours: number): string {
  if (hours >= 365 * 24) return F("Years", { count: Math.round(hours / (365 * 24)) });
  if (hours >= 7 * 24) return F("Weeks", { count: Math.round(hours / (7 * 24)) });
  return F("Days", { count: Math.round(hours / 24) });
}

/** Breaks a code: the selected character leads, the other selected characters are the team (pp. 210-211). */
export async function breakCode(api: GWorldApi, breaker: any, program: any = null): Promise<void> {
  if (!breaker) return void ui.notifications?.warn(L("PickBreaker"));
  const maker = targetedActor();
  const helpers = selectedActors().filter((a) => a !== breaker && a?.id !== breaker.id).map((a) => level(api, a, CRYPTOGRAPHY) ?? 0);
  const title = L("BreakTitle");
  const answer = await ask(title,
    row(L("CodeField"), `<select name="code">${CODES.map((c) => `<option value="${c}">${esc(L(`Code.${c}`))}</option>`).join("")}</select>`)
    + (maker ? `<p class="ihint">${esc(F("MakerTargeted", { name: maker.name }))}</p>` : row(L("MakerLevel"), `<input type="number" name="maker" value="5" style="width:70px" />`))
    + row(F("Helpers", { skill: TEAM.skill }), `<input type="number" name="helpers" value="${teamBonus(helpers)}" min="0" max="${TEAM.most}" style="width:70px" />`)
    + row(L("Apparatus"), `<select name="apparatus"><option value="1">1</option><option value="2">2</option></select>`)
    + row(L("TimeSpent"), `<input type="number" name="spent" value="1" min="0.1" step="0.1" style="width:70px" />`)
    + (machinesOn() ? row(L("MachineField"), `<select name="machine"><option value="">${esc(L("Machine.none"))}</option>${(Object.keys(DECRYPTION_MACHINES) as DecryptionMachine[]).map((m) => `<option value="${m}">${esc(F(`Machine.${m}`, { bonus: DECRYPTION_MACHINES[m].bonus }))}</option>`).join("")}</select>`) : ""),
    (form) => ({
      code: (form.querySelector<HTMLSelectElement>("[name=code]")?.value ?? "improvised") as Code,
      maker: number(form, "maker"),
      helpers: Math.max(0, Math.floor(number(form, "helpers"))),
      apparatus: number(form, "apparatus") || 1,
      spent: number(form, "spent") || 1,
      machine: (form.querySelector<HTMLSelectElement>("[name=machine]")?.value ?? "") as DecryptionMachine | "",
    }));
  if (!answer) return;
  const cryptography = level(api, breaker, CRYPTOGRAPHY);
  const label = F("BreakLabel", { name: breaker.name, code: L(`Code.${answer.code}`) });
  // Only an ad-libbed code yields to IQ-5; every system needs Cryptography (p. 210).
  if (answer.code !== "improvised" && cryptography === null) return void say(breaker, title, [L("NeedsCryptography")]);
  const modifiers: Array<{ label: string; value: number }> = [];
  const team = teamHelps(answer.code) ? Math.min(TEAM.most, answer.helpers) : 0;
  if (team) modifiers.push({ label: F("TeamLine", { count: team }), value: team });
  // A code-breaking machine: the bombe against a cipher machine's code, Colossus against any (HT:EE p. 48).
  const machine = machinesOn() ? machineBonus(answer.machine, answer.code) : 0;
  if (machine) modifiers.push({ label: L(`MachineLine.${answer.machine}`), value: machine });

  if (isContest(answer.code)) {
    const base = answer.code === "improvised" ? improvisedLevel(attribute(api, breaker, "IQ"), cryptography) : cryptography!;
    const note = answer.code === "improvised" && base !== cryptography ? L("IqMinus5") : CRYPTOGRAPHY;
    // The targeted maker's own level, or the one given for a maker who isn't on the scene.
    const result: any = await api.roll.quickContest({
      label,
      first: { actor: breaker, base, modifiers, note },
      second: { actor: maker ?? null, base: maker ? makerLevel(api, maker, answer.code) : answer.maker, note: maker ? String(maker.name) : L("Maker") },
      tags: ["codeBreaking"],
    } as any);
    if (!result) return;
    await say(breaker, title, [L(result.outcome === "first" ? "Broken" : "Holds"), L("AttemptDay")]);
    return;
  }

  const figures = standard(answer.code, answer.apparatus);
  if (!figures || figures.hours === null) return void say(breaker, title, [L("SecureImpossible")]);
  // From TL7 a program on a computer does the work: basic equipment at its TL, a bonus by its grade (p. 211).
  const software = program ?? [...(breaker.items ?? [])].find((i: any) => carried(i) && isCodeBreakingProgram(String(i.name)));
  if (answer.code !== "basic6" && !software) return void say(breaker, title, [F("NeedsProgram", { complexity: figures.complexity })]);
  // The program runs on a computer of the standard's Complexity, and of its own (p. 211).
  const notes: string[] = [];
  if (answer.code !== "basic6") {
    const needs = computerNeeded(figures.complexity ?? 0, programComplexity(String(software.name ?? "")));
    const { best, unmeasured } = computersFor(breaker, software);
    // A computer whose Complexity can't be measured is let through, with the question left to the GM.
    if (best < needs && unmeasured) notes.push(F("ComplexityUnknown", { name: unmeasured.name, complexity: needs }));
    else if (best < needs) return void say(breaker, title, [best > 0 ? F("ComputerTooSmall", { complexity: needs, best }) : F("NeedsComputer", { complexity: needs })]);
  }
  const time = timeSpentModifier(answer.spent * figures.hours, figures.hours);
  if (time) modifiers.push({ label: F("TimeLine", { times: answer.spent }), value: time });
  await api.roll.success({ actor: breaker, base: cryptography!, skill: CRYPTOGRAPHY, label, modifiers, tags: ["codeBreaking"], ...(software ? { item: software } : {}) } as any);
  await say(breaker, title, [F("StandardLine", { time: duration(figures.hours * answer.spent), base: duration(figures.hours), complexity: figures.complexity }), ...notes]);
}

// ── forgery (pp. 213-214) ──

/** High-Tech's roll for the shared forgery engine. */
function forgeryOutcome(api: GWorldApi, options: { actor: any; item: any; tool: string; skill: string; documentTl: number }): ForgeryOutcome {
  const tool = options.tool as ForgeryTool;
  const gear = [...(options.actor?.items ?? [])].filter(carried);
  const needs = forgeryNeeds(tool, options.documentTl);
  if (needs.cardGear && !(gear.some((i) => isCardPrinter(i.name)) && gear.some((i) => isStripEncoder(i.name)))) return { fails: L("NeedsCardGear") };
  const modifiers: Array<{ label: string; value: number }> = [];
  const hasComputer = gear.some((i) => isComputer(i.name)) && (needs.cardGear || gear.some((i) => isPrinter(i.name)));
  if (needs.computer && !hasComputer) modifiers.push({ label: L(needs.cardGear ? "NoComputer" : "NoComputerPrinter"), value: NO_COMPUTER });
  const base = level(api, options.actor, options.skill) ?? attribute(api, options.actor, "IQ") - 5;
  // Money printed at TL8 on a desktop printer: whether the printer marks its pages (p. 214).
  const printer = tool === "counterfeiting" && options.documentTl >= tracedPrinterTl ? gear.find((i) => isPrinter(i.name)) : null;
  if (!printer) return { base, skill: options.skill, modifiers };
  const known = printer.flags?.[MODULE_ID]?.[TRACED_PRINTER];
  // Known already: the GMs are told again, and the forger's card says only that it was settled.
  if (typeof known === "boolean") {
    return {
      base, skill: options.skill, modifiers,
      after: async () => {
        await say(options.actor, String(printer.name ?? ""), [F(known ? "PrinterTraced" : "PrinterClean", { name: printer.name })], true);
        return [F("PrinterChecked", { name: printer.name })];
      },
    };
  }
  return { base, skill: options.skill, modifiers, after: () => checkPrinter(api, options.actor, printer) };
}

/**
 * Whether a TL8 counterfeiter's printer marks each page with a serial number
 * that traces it (p. 214): the Counterfeiting roll to avoid buying one, made
 * the first time the printer is used and kept on it. The GM rolls it in
 * secret, and only the GMs are told; the forger's card says it was rolled.
 */
async function checkPrinter(api: GWorldApi, actor: any, printer: any): Promise<string[]> {
  const base = level(api, actor, "Counterfeiting") ?? attribute(api, actor, "IQ") - 5;
  const result: any = await api.roll.success({ actor, base, skill: "Counterfeiting", label: F("PrinterLabel", { name: printer.name }), modifiers: [], tags: ["counterfeiting"], secret: true } as any);
  if (!result) return [];
  const traced = !result.success;
  await printer.setFlag?.(MODULE_ID, TRACED_PRINTER, traced);
  await say(actor, String(printer.name ?? ""), [F(traced ? "PrinterTraced" : "PrinterClean", { name: printer.name })], true);
  return [F("PrinterChecked", { name: printer.name })];
}

// ── disguise (pp. 214-215) ──

/** What the carried kit already gives a skill's level: the system's equipment and equipment-TL lines. */
function gearLines(skill: any): number {
  const lines = (skill?.system?.derived?.bonusLines ?? []) as Array<{ key?: string; value?: number }>;
  return lines.filter((l) => l.key === "tools" || l.key === "techLevel").reduce((sum, l) => sum + (Number(l.value) || 0), 0);
}

/** An improvised disguise: -5, in place of whatever kit the skill's level counts (p. 214). */
async function improvisedDisguise(api: GWorldApi, skill: any, actor: any): Promise<void> {
  const base = level(api, actor, String(skill.name)) ?? attribute(api, actor, "IQ") - 5;
  const kit = gearLines(skill);
  const modifiers = [...(kit ? [{ label: L("KitSetAside"), value: -kit }] : []), { label: L("ImprovisedLine"), value: IMPROVISED_DISGUISE }];
  await api.roll.success({ actor, base, skill: String(skill.name), label: F("ImprovisedLabel", { name: actor.name }), modifiers, tags: ["disguise"] } as any);
}

/** A Disguise roll with a kit; the advanced kit's preparation on the card (p. 215). */
async function disguiseWith(api: GWorldApi, item: any, actor: any): Promise<void> {
  const kit = disguiseKitByName(String(item.name));
  const base = level(api, actor, "Disguise") ?? attribute(api, actor, "IQ") - 5;
  await api.roll.success({ actor, base, skill: "Disguise", label: F("DisguiseLabel", { name: item.name }), modifiers: [], tags: ["disguise"], item } as any);
  if (kit === "advanced") await say(actor, String(item.name), [F("AdvancedPrep", { hours: ADVANCED_DISGUISE.prepareHours, min: ADVANCED_DISGUISE.fitting.min, max: ADVANCED_DISGUISE.fitting.max })]);
}

// ── smuggling (p. 215) ──

/** A Smuggling roll with luggage, for what its secret area can hold. */
async function smuggle(api: GWorldApi, item: any, actor: any): Promise<void> {
  const capacity = hiddenCapacity(luggageByName(String(item.name)) ?? "");
  if (!capacity) return;
  const title = L("SmuggleTitle");
  const answer = await ask(title, row(L("HiddenWeight"), `<input type="number" name="lbs" value="0" min="0" step="0.1" style="width:70px" />`), (form) => ({ lbs: number(form, "lbs") }));
  if (!answer) return;
  const holds = F("HiddenHolds", { lbs: capacity.lbs, cf: capacity.cf });
  if (answer.lbs > capacity.lbs) return void say(actor, String(item.name), [F("TooMuch", { lbs: answer.lbs }), holds]);
  const base = level(api, actor, "Smuggling") ?? attribute(api, actor, "IQ") - 5;
  await api.roll.success({ actor, base, skill: "Smuggling", label: F("SmuggleLabel", { name: item.name }), modifiers: [], tags: ["smuggling"], item } as any);
  await say(actor, String(item.name), [holds]);
}

// ── mule pills (p. 214) ──

/** The pellets a character has swallowed: their carried mule pills. */
export function pelletsCarried(actor: any): number {
  return [...(actor?.items ?? [])].filter((i: any) => carried(i) && isMulePill(String(i.name))).reduce((sum: number, i: any) => sum + Math.max(0, Number(i.system?.quantity) || 0), 0);
}

/** A run as a mule: HT at -1 per 50 pellets; a critical failure bursts a packet (p. 214). */
export async function runMule(api: GWorldApi, item: any, actor: any): Promise<void> {
  const pellets = pelletsCarried(actor);
  const modifier = muleModifier(pellets);
  const label = F("MuleLabel", { name: actor.name, count: pellets });
  const outcome: any = await api.roll.success({
    actor, base: attribute(api, actor, "HT"), skill: "HT", kind: "attribute", label,
    modifiers: modifier ? [{ label: F("PelletsLine", { count: pellets }), value: modifier }] : [],
    tags: ["mulePill", "HT"], item,
  } as any);
  if (!outcome) return;
  const result = muleOutcome(outcome);
  const lines = [L(`Mule.${result}`)];
  // The pills in the stomach bring cramps for as long as they're carried, whatever
  // the roll (p. 214): moderate pain (Campaigns p. 428), the GM's to make worse. The
  // book gives no time for passing them, so the GM takes it off; the card says so.
  if (pellets > 0 && !PAINS.some((key) => actor.statuses?.has?.(key))) {
    await api.actors.applyCondition(actor, { key: "moderatePain" } as any);
    lines.push(L("Mule.cramps"));
  }
  if (result === "burst") {
    // An overdose: the packet "often" holds cocaine or heroin (p. 214), and the book's
    // figures are heroin's, a depressant's (Campaigns p. 441): out for the margin's hours,
    // and the drug as a poison. For cocaine the card sends the GM to a stimulant's.
    const seconds = overdoseSeconds(Number(outcome.margin) || 0);
    await api.actors.applyCondition(actor, { key: "unconscious", duration: { seconds } } as any);
    await api.actors.dosePoison(actor, { ...BURST_PACKET, source: `${MODULE_ID}.${BURST}` } as any);
    lines.push(L("Mule.dosed"), F("Mule.out", { hours: seconds / 3600 }));
  }
  lines.push(L("Mule.tells"));
  await say(actor, String(item.name), lines);
}

/** The better of a character's skills, or the default given. */
function best(api: GWorldApi, actor: any, skills: readonly string[], fallback: number): { level: number; skill: string } {
  let found: { level: number; skill: string } | null = null;
  for (const skill of skills) {
    const value = level(api, actor, skill);
    if (value !== null && value > (found?.level ?? -Infinity)) found = { level: value, skill };
  }
  return found ?? { level: fallback, skill: skills[0]! };
}

/**
 * Screening the targeted character for swallowed pellets: the selected
 * character is the screener (p. 214). The GM rolls it in secret (Campaigns
 * p. 494; the system's secret rolls and contests since API 1.111.0), and
 * only the GMs are told what was found.
 */
export async function spotMule(api: GWorldApi): Promise<void> {
  const screener = selectedActors()[0] ?? null;
  const mule = targetedActor();
  if (!screener || !mule) return void ui.notifications?.warn(L("PickScreener"));
  const title = L("SpotTitle");
  const answer = await ask(title, row(L("Method"), `<select name="method"><option value="watch">${esc(L("Watch"))}</option><option value="xray">${esc(L("Xray"))}</option></select>`),
    (form) => ({ method: form.querySelector<HTMLSelectElement>("[name=method]")?.value === "xray" ? "xray" : "watch" }));
  if (!answer) return;
  const per = attribute(api, screener, "Per");
  const pellets = pelletsCarried(mule);
  const label = F("SpotLabel", { name: screener.name, mule: mule.name });
  let found = false;
  if (answer.method === "watch") {
    const spotter = best(api, screener, SPOTTER_SKILLS, per - 5);
    const acting = level(api, mule, "Acting") ?? attribute(api, mule, "IQ") - 5;
    const result: any = await api.roll.quickContest({
      label,
      first: { actor: screener, base: spotter.level, note: spotter.skill },
      second: { actor: mule, base: acting, note: "Acting" },
      tags: ["muleSpotting"],
      secret: true,
    } as any);
    if (!result) return;
    found = result.outcome === "first";
  } else {
    const operator = best(api, screener, XRAY_SKILLS, attribute(api, screener, "IQ") - 5);
    const scan: any = await api.roll.success({ actor: screener, base: operator.level, skill: operator.skill, label: F("XrayLabel", { name: screener.name }), modifiers: [], tags: ["muleSpotting", "xray"], secret: true } as any);
    if (!scan) return;
    if (!scan.success) return void say(screener, title, [L("XrayFailed")], true);
    const search = best(api, screener, ["Search"], per - 5);
    const look: any = await api.roll.success({ actor: screener, base: search.level, skill: "Search", label, modifiers: [], tags: ["muleSpotting", "xray"], secret: true } as any);
    if (!look) return;
    found = Boolean(look.success);
  }
  await say(screener, title, [found && pellets > 0 ? F("Spotted", { mule: mule.name, count: pellets }) : F("NotSpotted", { mule: mule.name })], true);
}

// ── encryption gear (p. 211) ──

/** The lines on an encryption record's sheet, and a code-breaking program's. */
export function codeLines(item: any): string[] {
  const name = String(item?.name ?? "");
  const lines: string[] = [];
  const program = programComplexity(name);
  if (program !== null) lines.push(F("Gear.Program", { complexity: program }));
  const gear = encryptionGearByName(name);
  if (!gear) return lines;
  switch (gear.code) {
    case "manual":
      lines.push(F("Gear.Wheel", { low: CIPHER_WHEEL_SKILL - 1, high: CIPHER_WHEEL_SKILL + 1, minutes: CIPHER_WHEEL_MINUTES }));
      break;
    case "basic6":
      lines.push(F("Gear.Machine", { slow: duration(standard("basic6", 1)!.hours!), fast: duration(standard("basic6", 2)!.hours!) }));
      break;
    case "basic7":
    case "basic8": {
      const figures = standard(gear.code)!;
      lines.push(F("Gear.Basic", { time: duration(figures.hours!), complexity: figures.complexity }));
      break;
    }
    default:
      lines.push(F(gear.code === "secure7" ? "Gear.SecureTl7" : "Gear.SecureTl8", { complexity: gear.complexity ?? 0, delay: L(`Gear.Delay.${SECURE_DELAY[gear.code === "secure7" ? 7 : 8]}`) }));
  }
  return lines;
}

// ── registration ──

export function readyHighTechCodes(api: GWorldApi, on: CodesSwitches): void {
  machinesOn = on.cipher ?? (() => false);
  // Encryption gear and the code-breaking programs: what each makes or needs (p. 211).
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-codes-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-codes-item.hbs`,
    visible: (item) => on.encryption() && item?.type === "equipment" && codeLines(item).length > 0,
    context: (item) => ({ lines: codeLines(item) }),
  });
  api.data.registerPoison({ module: MODULE_ID, key: BURST, label: `${NS}.BurstPoison`, poison: BURST_PACKET as any, available: () => on.disguise() });

  FORGERY_TABLES.register({
    book: "high-tech",
    tls: { min: 5, max: 8 },
    on: on.disguise,
    i18n: "GCC.HT",
    tool: (item) => forgeryToolByName(String(item?.name ?? "")),
    skills: (tool) => forgerySkills(tool as ForgeryTool),
    roll: forgeryOutcome,
  });
  readyForgery(api);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-break-code",
    itemTypes: ["skill", "equipment"],
    label: L("BreakTitle"),
    icon: "fa-solid fa-key",
    visible: (item) => on.encryption() && (item?.type === "skill" ? sameName(api, item.name, CRYPTOGRAPHY) : isCodeBreakingProgram(String(item?.name ?? ""))),
    run: (item, actor) => breakCode(api, actor, item?.type === "equipment" ? item : null),
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-break-code",
    label: L("BreakTitle"),
    icon: "fa-solid fa-key",
    visible: on.encryption,
    open: () => breakCode(api, selectedActors()[0] ?? null),
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-improvised-disguise",
    itemTypes: ["skill"],
    label: L("ImprovisedTitle"),
    icon: "fa-solid fa-masks-theater",
    visible: (item) => on.disguise() && sameName(api, item?.name, "Disguise"),
    run: (item, actor) => improvisedDisguise(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-disguise-kit",
    itemTypes: ["equipment"],
    label: L("DisguiseTitle"),
    icon: "fa-solid fa-masks-theater",
    visible: (item) => on.disguise() && disguiseKitByName(String(item?.name ?? "")) !== null,
    run: (item, actor) => disguiseWith(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-smuggle",
    itemTypes: ["equipment"],
    label: L("SmuggleTitle"),
    icon: "fa-solid fa-suitcase",
    visible: (item) => on.disguise() && luggageByName(String(item?.name ?? "")) !== null,
    run: (item, actor) => smuggle(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-mule-run",
    itemTypes: ["equipment"],
    label: L("MuleTitle"),
    icon: "fa-solid fa-capsules",
    visible: (item) => on.disguise() && isMulePill(String(item?.name ?? "")),
    run: (item, actor) => runMule(api, item, actor),
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-spot-mule",
    label: L("SpotTitle"),
    icon: "fa-solid fa-magnifying-glass",
    visible: on.disguise,
    open: () => spotMule(api),
  } as any);
}
