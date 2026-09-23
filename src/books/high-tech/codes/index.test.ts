import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FORGERY_TABLES, forgeryToolOf, resetForgery } from "../../../shared/forgery/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyHighTechCodes } from "./index.js";

let answer: any = null;
let switches = { encryption: true, disguise: true };
const rowActions: any[] = [];
const gmTools: any[] = [];
const poisons: any[] = [];
const contests: any[] = [];
const rolls: any[] = [];
const doses: any[] = [];
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
  },
  roll: {
    success: async (options: any) => { rolls.push(options); return nextRoll; },
    quickContest: async (options: any) => { contests.push(options); return nextContest; },
  },
  data: { registerPoison: (p: any) => poisons.push(p) },
  sheets: { registerRowAction: (a: any) => rowActions.push(a), registerGmTool: (t: any) => gmTools.push(t) },
};

const action = (key: string) => rowActions.find((a) => a.key === key);
const tool = (key: string) => gmTools.find((t) => t.key === key);

function character(name: string, options: { skills?: Record<string, number>; attributes?: Record<string, number>; items?: any[] } = {}): any {
  return { id: name, name, skills: options.skills ?? {}, attributes: options.attributes ?? {}, items: options.items ?? [] };
}
const gear = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: "equipment", system: { carried: true, tl: "8", quantity: 1, ...extra }, flags: { [MODULE_ID]: { book: "high-tech" } } });

beforeAll(() => {
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: any) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: targets.map((actor) => ({ actor })) }; },
  });
  vi.stubGlobal("canvas", { get tokens() { return { controlled: controlled.map((actor) => ({ actor })) }; } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => answer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: vi.fn(async () => ({})), getSpeaker: () => ({}) } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  FORGERY_TABLES.clear();
  resetForgery();
  readyHighTechCodes(api, { encryption: () => switches.encryption, disguise: () => switches.disguise });
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
    const expert = character("Expert", { skills: { Cryptography: 15 }, items: [program] });
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
    nextRoll = { success: false, criticalFailure: true };
    await action("ht-mule-run").run(pills, mule);
    expect(rolls[0]).toMatchObject({ base: 12, kind: "attribute" });
    expect(rolls[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
    expect(doses).toEqual([expect.objectContaining({ actor: "Mule", source: `${MODULE_ID}.mulePillBurst`, resistanceModifier: -4, cycles: 24 })]);
    expect(poisons).toEqual([expect.objectContaining({ module: MODULE_ID, key: "mulePillBurst" })]);

    doses.length = 0;
    nextRoll = { success: false, criticalFailure: false };
    await action("ht-mule-run").run(pills, mule);
    expect(doses).toEqual([]);
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
  });
});
