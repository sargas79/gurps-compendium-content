import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FORGERY_TABLES, forgeryToolOf, resetForgery } from "../../../shared/forgery/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyHighTechCodes } from "./index.js";

let answer: any = null;
let switches: { encryption: boolean; disguise: boolean; cipher?: boolean } = { encryption: true, disguise: true };
const rowActions: any[] = [];
const gmTools: any[] = [];
const sections: any[] = [];
const poisons: any[] = [];
const contests: any[] = [];
const rolls: any[] = [];
const doses: any[] = [];
const conditions: any[] = [];
let nextRoll: any = { success: true, criticalFailure: false };
let nextContest: any = { outcome: "first", marginOfVictory: 2 };
let targets: any[] = [];
let controlled: any[] = [];

const api: any = {
  rules: { toolSkillKey: (name: string) => name.replace(/\/TL\d*/i, "").trim().toLowerCase() },
  actors: {
    attribute: (actor: any, name: string) => actor.attributes?.[name] ?? 10,
    skillLevel: (actor: any, skill: string) => actor.skills?.[skill] ?? null,
    dosePoison: async (actor: any, poison: any) => { doses.push({ actor: actor.name, ...poison }); return { id: "d1" }; },
    applyCondition: async (actor: any, c: any) => { conditions.push({ actor: actor.name, ...c }); actor.statuses?.add?.(c.key); return c.key; },
  },
  roll: {
    success: async (options: any) => { rolls.push(options); return nextRoll; },
    quickContest: async (options: any) => { contests.push(options); return nextContest; },
  },
  data: { registerPoison: (p: any) => poisons.push(p) },
  sheets: { registerRowAction: (a: any) => rowActions.push(a), registerGmTool: (t: any) => gmTools.push(t), registerSheetSection: (s: any) => sections.push(s) },
};

const action = (key: string) => rowActions.find((a) => a.key === key);
const tool = (key: string) => gmTools.find((t) => t.key === key);

function character(name: string, options: { skills?: Record<string, number>; attributes?: Record<string, number>; items?: any[] } = {}): any {
  return { id: name, name, skills: options.skills ?? {}, attributes: options.attributes ?? {}, items: options.items ?? [], statuses: new Set<string>() };
}
const gear = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: "equipment", system: { carried: true, tl: "8", quantity: 1, ...extra }, flags: { [MODULE_ID]: { book: "high-tech" } } });

beforeAll(() => {
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: any) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: targets.map((actor) => ({ actor })) }; },
  });
  vi.stubGlobal("canvas", { get tokens() { return { controlled: controlled.map((actor) => ({ actor })) }; } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => answer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: vi.fn(async () => ({})), getSpeaker: () => ({}), getWhisperRecipients: () => [{ id: "gm" }] } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  FORGERY_TABLES.clear();
  resetForgery();
  readyHighTechCodes(api, { encryption: () => switches.encryption, disguise: () => switches.disguise, cipher: () => switches.cipher === true });
});

beforeEach(() => {
  switches = { encryption: true, disguise: true };
  rolls.length = 0;
  contests.length = 0;
  doses.length = 0;
  targets = [];
  controlled = [];
  nextRoll = { success: true, criticalFailure: false };
  nextContest = { outcome: "first", marginOfVictory: 2 };
});

afterAll(() => {
  FORGERY_TABLES.clear();
  resetForgery();
  vi.unstubAllGlobals();
});

describe("breaking codes (pp. 210-211)", () => {
  it("offers Break a code on Cryptography and the code-breaking programs, under the encryption switch", () => {
    const breakCode = action("ht-break-code");
    expect(breakCode.visible({ type: "skill", name: "Cryptography/TL8" })).toBe(true);
    expect(breakCode.visible(gear("Good Code-Breaking Program"))).toBe(true);
    expect(breakCode.visible({ type: "skill", name: "Forgery" })).toBe(false);
    switches.encryption = false;
    expect(breakCode.visible({ type: "skill", name: "Cryptography" })).toBe(false);
  });

  it("breaks an ad-libbed code as a Quick Contest of IQ-5 with its maker, the team adding +1 each", async () => {
    const leader = character("Leader", { attributes: { IQ: 12 } });
    const helpers = [character("A", { skills: { Cryptography: 17 } }), character("B", { skills: { Cryptography: 18 } }), character("C", { skills: { Cryptography: 15 } })];
    const maker = character("Maker", { attributes: { IQ: 11 } });
    controlled = [leader, ...helpers];
    targets = [maker];
    answer = { code: "improvised", maker: 0, helpers: 2, apparatus: 1, spent: 1 };
    await tool("ht-break-code").open();
    expect(contests).toHaveLength(1);
    const contest = contests[0];
    expect(contest.first.base).toBe(7);
    expect(contest.first.modifiers).toEqual([{ label: expect.stringContaining("TeamLine"), value: 2 }]);
    expect(contest.second).toMatchObject({ actor: maker, base: 6 });
  });

  it("needs Cryptography to beat a system, and rolls the standards with Time Spent and the program", async () => {
    const amateur = character("Amateur", { attributes: { IQ: 14 } });
    answer = { code: "manual", maker: 17, helpers: 0, apparatus: 1, spent: 1 };
    await action("ht-break-code").run({ type: "skill", name: "Cryptography" }, amateur);
    expect(contests).toHaveLength(0);

    const program = gear("Fine Code-Breaking Program");
    const expert = character("Expert", { skills: { Cryptography: 15 }, items: [program, gear("Macroframe Computer", { complexity: 7 })] });
    answer = { code: "basic8", maker: 0, helpers: 3, apparatus: 1, spent: 4 };
    await action("ht-break-code").run(program, expert);
    // No team for a computer's work; four times the base day is +2.
    expect(rolls[0]).toMatchObject({ base: 15, skill: "Cryptography", item: program });
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([2]);

    rolls.length = 0;
    answer = { code: "secure8", maker: 0, helpers: 0, apparatus: 1, spent: 1 };
    await action("ht-break-code").run(program, expert);
    expect(rolls).toHaveLength(0);
  });
});

describe("the supplement's code-breaking machines (HT:EE p. 48)", () => {
  it("adds the bombe's +1 against a cipher machine's code and Colossus's +2, only under cipherMachines", async () => {
    const breaker = character("Breaker", { skills: { Cryptography: 14 } });
    answer = { code: "basic6", maker: 0, helpers: 0, apparatus: 2, spent: 1, machine: "bombe" };
    await action("ht-break-code").run({ type: "skill", name: "Cryptography" }, breaker);
    expect(rolls[0].modifiers).toEqual([]);
    switches.cipher = true;
    rolls.length = 0;
    await action("ht-break-code").run({ type: "skill", name: "Cryptography" }, breaker);
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([1]);
    rolls.length = 0;
    answer = { code: "manual", maker: 15, helpers: 0, apparatus: 1, spent: 1, machine: "colossus" };
    await action("ht-break-code").run({ type: "skill", name: "Cryptography" }, breaker);
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([2]);
  });
});

describe("forgery (pp. 213-214)", () => {
  it("forges with the book's tools through the shared engine, -5 without a computer and printer from TL7", async () => {
    const forge = action("forge");
    const tools = gear("Forgery Tools", { tl: "6" });
    expect(forgeryToolOf(tools)?.tool).toBe("forgery");
    expect(forge.visible(tools)).toBe(true);
    const forger = character("Forger", { skills: { Forgery: 13 }, items: [tools] });
    answer = { skill: "Forgery", tl: 8 };
    await forge.run(tools, forger);
    expect(rolls[0]).toMatchObject({ base: 13, skill: "Forgery" });
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([-5]);

    rolls.length = 0;
    forger.items.push(gear("Small Computer"), gear("Desktop Printer"));
    await forge.run(tools, forger);
    expect(rolls[0].modifiers).toEqual([]);

    switches.disguise = false;
    expect(forge.visible(tools)).toBe(false);
  });
});

describe("disguise and smuggling (pp. 214-215)", () => {
  it("rolls an improvised disguise at -5 in place of the kit the skill counts", async () => {
    const skill = { type: "skill", name: "Disguise", system: { derived: { bonusLines: [{ key: "tools", value: 2 }, { key: "bonus", value: 1 }] } } };
    await action("ht-improvised-disguise").run(skill, character("Spy", { skills: { Disguise: 14 } }));
    expect(rolls[0]).toMatchObject({ base: 14, skill: "Disguise" });
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([-2, -5]);
  });

  it("rolls Smuggling with luggage only for what its secret area holds", async () => {
    const case_ = gear("Smuggler's Attaché Case");
    const smuggler = character("Smuggler", { skills: { Smuggling: 12 }, items: [case_] });
    answer = { lbs: 3 };
    await action("ht-smuggle").run(case_, smuggler);
    expect(rolls).toHaveLength(0);
    answer = { lbs: 2 };
    await action("ht-smuggle").run(case_, smuggler);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Smuggling", item: case_ });
  });

  it("rolls a mule's HT at -1 per 50 pellets, and doses a burst packet on a critical failure", async () => {
    const pills = gear("Mule Pill", { quantity: 120 });
    const mule = character("Mule", { attributes: { HT: 12 }, items: [pills] });
    nextRoll = { success: false, criticalFailure: true, margin: 7 };
    conditions.length = 0;
    await action("ht-mule-run").run(pills, mule);
    expect(rolls[0]).toMatchObject({ base: 12, kind: "attribute" });
    // The cramps, and the overdose's hours out cold (Campaigns p. 441).
    expect(conditions).toEqual([
      expect.objectContaining({ actor: "Mule", key: "moderatePain" }),
      expect.objectContaining({ actor: "Mule", key: "unconscious", duration: { seconds: 7 * 3600 } }),
    ]);
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
    expect(doses).toEqual([expect.objectContaining({ actor: "Mule", source: `${MODULE_ID}.mulePillBurst`, resistanceModifier: -4, cycles: 24 })]);
    expect(poisons).toEqual([expect.objectContaining({ module: MODULE_ID, key: "mulePillBurst" })]);

    doses.length = 0;
    conditions.length = 0;
    nextRoll = { success: false, criticalFailure: false };
    await action("ht-mule-run").run(pills, mule);
    expect(doses).toEqual([]);
    // Already in pain: the cramps add nothing.
    expect(conditions).toEqual([]);
  });

  it("spots a mule in a Quick Contest of Search or Observation against Acting", async () => {
    const screener = character("Screener", { skills: { Search: 12, Observation: 14 } });
    const mule = character("Mule", { skills: { Acting: 13 }, items: [gear("Mule Pill", { quantity: 60 })] });
    controlled = [screener];
    targets = [mule];
    answer = { method: "watch" };
    await tool("ht-spot-mule").open();
    expect(contests[0].first).toMatchObject({ actor: screener, base: 14, note: "Observation" });
    expect(contests[0].second).toMatchObject({ actor: mule, base: 13, note: "Acting" });
    // The GM rolls it in secret, and only the GMs hear what was found.
    expect(contests[0].secret).toBe(true);
    expect((ChatMessage as any).implementation.create.mock.calls.at(-1)[0].whisper).toEqual(["gm"]);
  });
});

describe("code-breaking computers and encryption gear (p. 211)", () => {
  const said = () => (ChatMessage.implementation.create as any).mock.calls.at(-1)[0].content as string;

  it("runs the program only on a computer of the standard's Complexity and the program's own", async () => {
    const program = gear("Good Code-Breaking Program");
    const breaker = character("Breaker", { skills: { Cryptography: 14 }, items: [program] });
    answer = { code: "basic7", maker: 0, helpers: 0, apparatus: 1, spent: 1 };
    await action("ht-break-code").run(program, breaker);
    expect(rolls).toHaveLength(0);
    expect(said()).toContain("NeedsComputer");
    // TL7 basic encryption needs Complexity 3, the good program 5: a Complexity 4 computer won't do.
    breaker.items.push(gear("Small Computer", { complexity: 4 }));
    await action("ht-break-code").run(program, breaker);
    expect(rolls).toHaveLength(0);
    expect(said()).toContain("ComputerTooSmall");
    expect(said()).toContain('"complexity":5');
    breaker.items.push(gear("Mainframe Computer", { complexity: 5 }));
    await action("ht-break-code").run(program, breaker);
    expect(rolls).toHaveLength(1);
    // A computer left behind doesn't count.
    rolls.length = 0;
    breaker.items.forEach((i: any) => { if (/Computer/.test(i.name)) i.system.carried = false; });
    await action("ht-break-code").run(program, breaker);
    expect(rolls).toHaveLength(0);
  });

  it("says what each piece of encryption gear makes and needs, under the encryption switch", () => {
    const section = sections.find((s) => s.key === "ht-codes-item");
    const lines = (name: string) => section.context(gear(name)).lines.join(" ");
    expect(lines("Cipher Wheel")).toContain('"minutes":2');
    expect(lines("Cipher Machine")).toContain("Gear.Machine");
    expect(lines("Basic Encryption (TL7)")).toContain('"complexity":3');
    expect(lines("Basic Encryption Unit")).toContain('"complexity":5');
    expect(lines("Secure Encryption (TL7)")).toContain("Gear.Delay.minutes");
    expect(lines("Secure Encryption Unit")).toContain("Gear.Delay.seconds");
    expect(lines("Fine Code-Breaking Program")).toContain('"complexity":7');
    expect(section.visible(gear("Crowbar"))).toBe(false);
    expect(section.visible(gear("Cipher Wheel"))).toBe(true);
    switches.encryption = false;
    expect(section.visible(gear("Cipher Wheel"))).toBe(false);
  });
});

describe("counterfeiting at TL8 (p. 214)", () => {
  it("rolls Counterfeiting in secret the first time a printer is used, and keeps the answer on it", async () => {
    const forge = action("forge");
    const tools = gear("Counterfeiting Tools", { tl: "8" });
    const printer: any = { ...gear("Desktop Printer"), setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => { printer.flags[MODULE_ID][key] = value; }) };
    const counterfeiter = character("Counterfeiter", { skills: { Counterfeiting: 12 }, items: [tools, gear("Small Computer"), printer] });
    answer = { skill: "Counterfeiting", tl: 8 };
    nextRoll = { success: false, criticalFailure: false };
    await forge.run(tools, counterfeiter);
    expect(rolls).toHaveLength(2);
    expect(rolls[1]).toMatchObject({ base: 12, skill: "Counterfeiting", secret: true });
    expect(printer.flags[MODULE_ID].htTracedPrinter).toBe(true);
    expect(said()).toContain("PrinterChecked");
    rolls.length = 0;
    await forge.run(tools, counterfeiter);
    expect(rolls).toHaveLength(1);
    expect(said()).toContain("PrinterTraced");
    // A TL7 note or plain forgery rolls nothing more.
    rolls.length = 0;
    answer = { skill: "Counterfeiting", tl: 7 };
    await forge.run(tools, counterfeiter);
    expect(rolls).toHaveLength(1);
  });

  function said(): string {
    return (ChatMessage.implementation.create as any).mock.calls.at(-1)[0].content as string;
  }
});
