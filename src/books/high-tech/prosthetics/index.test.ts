/**
 * High-Tech's prosthetics and elective surgery as the system meets them:
 * traits out of play through `gworld.traitsInPlay`, Basic Move through
 * `gworld.traitEffects`, and the elective surgery tool's operation and card,
 * with only High-Tech's switch on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CELL_TABLES } from "../../../shared/power/index.js";
import { BATTERIES_RULE, EXTERNAL_POWER_RULE, highTechBatteries } from "../power/index.js";
import { SURGERY_FLAG, operateElectively, readyProsthetics, recordOperation, sightCured } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let cards: Map<string, any>;
let tools: any[];
let operated: any[];
let changed: any[];
let outcome: any;
let posted: any[];
let updated: any[];
let warnings: string[];
let on: boolean;

function fakeApi() {
  return {
    actors: {
      operate: async (o: any) => { operated.push(o); return outcome; },
      changeTrait: async (actor: any, o: any) => { changed.push({ actor, ...o }); return { itemId: "t", from: {}, to: {}, replaced: Boolean(o.replaceWith) }; },
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, options: any) => { posted.push({ key, data, options }); },
      update: async (message: any, data: any) => { updated.push({ message, data }); return true; },
    },
    sheets: { registerGmTool: (t: any) => tools.push(t) },
  };
}

function item(name: string, type = "equipment", system: Record<string, any> = {}): any {
  return { name, type, system: { equipped: true, ...system } };
}

function person(items: any[] = [], purchasedMove = 0): any {
  const flags: Record<string, any> = {};
  return {
    id: "p1",
    name: "Pat",
    items,
    system: { tl: 8, purchased: { basicMove: purchasedMove } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const inPlay = (actor: any) => fire("gworld.traitsInPlay", {
  actor,
  traits: [...actor.items].filter((i: any) => i.type === "trait").map((i: any) => ({ item: i, name: i.name, inPlay: true })),
}).traits;

beforeEach(() => {
  hooks = new Map();
  cards = new Map();
  tools = [];
  operated = [];
  changed = [];
  outcome = { success: true, margin: 2 };
  posted = [];
  updated = [];
  warnings = [];
  on = true;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    time: { worldTime: 100 },
    users: [{ id: "gm", isGM: true }],
    actors: { get: () => null },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ui", { notifications: { warn: (m: string) => warnings.push(m) } });
  readyProsthetics(fakeApi() as never, () => on);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prosthetics as Mitigators", () => {
  it("does nothing with the switch off", () => {
    on = false;
    const traits = inPlay(person([item("Bad Sight (Nearsighted)", "trait"), item("Eyeglasses")]));
    expect(traits[0].inPlay).toBe(true);
  });

  it("takes Bad Sight out of play while eyeglasses are worn, and not once they come off", () => {
    const glasses = item("Eyeglasses");
    const pat = person([item("Bad Sight (Nearsighted)", "trait"), glasses]);
    expect(inPlay(pat)[0]).toMatchObject({ inPlay: false, reason: expect.stringContaining("Eyeglasses") });
    glasses.system.equipped = false;
    expect(inPlay(pat)[0].inPlay).toBe(true);
    // Broken by a head hit (the protective oddments' flag), they mitigate nothing even if put back on.
    glasses.system.equipped = true;
    glasses.flags = { [MODULE_ID]: { htBroken: true } };
    expect(inPlay(pat)[0].inPlay).toBe(true);
  });

  it("puts Ham-Fisted 2 back in place of One Arm under a basic arm prosthetic", () => {
    const traits = inPlay(person([item("One Arm", "trait"), item("Basic Arm Prosthetic")]));
    expect(traits[0]).toMatchObject({ inPlay: false, restores: [{ name: "Ham-Fisted", levels: 2 }] });
  });

  it("mitigates nothing once an advanced prosthetic's hours between recharges are spent (p. 226)", () => {
    CELL_TABLES.register(highTechBatteries());
    setRuleReader((key) => key === BATTERIES_RULE || key === EXTERNAL_POWER_RULE);
    try {
      const power = { draw: { cell: "", cells: 0, endurance: "8 hours", raw: "8 hours between recharges" }, rechargeable: true, hoursUsed: 7 };
      const arm = { ...item("Advanced Arm Prosthetic", "equipment", { extensions: { [MODULE_ID]: { power } } }), flags: { [MODULE_ID]: { book: "high-tech" } } };
      const pat = person([item("One Arm", "trait"), arm]);
      expect(inPlay(pat)[0].inPlay).toBe(false);
      power.hoursUsed = 8;
      expect(inPlay(pat)[0].inPlay).toBe(true);
    } finally {
      CELL_TABLES.clear();
      setRuleReader(() => false);
    }
  });

  it("leaves alone a trait another listener already took out", () => {
    const pat = person([item("Hard of Hearing", "trait"), item("Hearing Aid")]);
    const context = { actor: pat, traits: [{ item: pat.items[0], name: "Hard of Hearing", inPlay: false, reason: "other" }] };
    fire("gworld.traitsInPlay", context);
    expect(context.traits[0]!.reason).toBe("other");
  });

  it("gives a leg amputee back reduced Basic Move while the prosthetic is worn", () => {
    const pat = person([item("Lame (Missing Legs)", "trait"), item("Basic Leg Prosthetic")], -2);
    expect(inPlay(pat)[0].inPlay).toBe(false);
    const context = fire("gworld.traitEffects", { actor: pat, effects: { secondary: { basicMove: 0 } }, sources: [] as any[] });
    expect(context.effects.secondary.basicMove).toBe(1);
    expect(context.sources).toEqual([{ effect: "secondary.basicMove", label: expect.stringContaining("Basic Leg Prosthetic"), value: 1 }]);
    pat.items[1] = item("Advanced Leg Prosthetic");
    expect(fire("gworld.traitEffects", { actor: pat, effects: { secondary: { basicMove: 0 } }, sources: [] }).effects.secondary.basicMove).toBe(2);
  });
});

describe("elective surgery", () => {
  it("registers a GM tool under the switch", () => {
    expect(tools[0]).toMatchObject({ module: MODULE_ID, key: "ht-elective-surgery" });
    on = false;
    expect(tools[0]!.visible()).toBe(false);
  });

  it("runs the operation through the system and records its outcome on the card for the GM", async () => {
    const pat = person([item("Appearance", "trait", { levels: 1 })]);
    const surgeon = { name: "Doc", system: { tl: 8 } };
    const plan = await operateElectively(fakeApi() as never, { patient: pat, surgeon, techLevel: 8, procedure: "appearance", modifier: 1 });
    expect(plan).toMatchObject({ from: "Attractive", to: "Handsome/Beautiful", cost: 8000 });
    expect(operated).toEqual([{ surgeon, patient: pat, techLevel: 8, label: expect.any(String), modifier: 1 }]);
    // Attractive to Beautiful or Handsome is the character's choice: the GM sets it.
    expect(changed).toEqual([]);
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ht-elective-surgery`, data: { patient: "p1", buttons: [] } });
    expect(posted[0].data.lines[0]).toContain("SetAppearance");
    expect(pat.getFlag(MODULE_ID, SURGERY_FLAG).operations[0]).toMatchObject({ procedure: "appearance" });
  });

  it("writes Beautiful to Very Beautiful, and Fat to Overweight, through changeTrait", async () => {
    const beauty = person([{ ...item("Appearance", "trait", { levels: 2 }), id: "app" }]);
    await operateElectively(fakeApi() as never, { patient: beauty, surgeon: { name: "Doc" }, techLevel: 8, procedure: "appearance" });
    expect(changed[0]).toMatchObject({ actor: beauty, id: "app", level: 4 });
    expect(posted[0].data.lines[0]).toContain("AppearanceChanged");
    const fat = person([item("Fat", "trait")]);
    await operateElectively(fakeApi() as never, { patient: fat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: true });
    expect(changed[1]).toMatchObject({ actor: fat, name: "Fat", replaceWith: "Overweight" });
    expect(posted[1].data.lines[0]).toContain("BuildChanged");
  });

  it("adds a trait from Average and takes one away back to it, through changeTrait (API 1.124.0)", async () => {
    const average = person([]);
    await operateElectively(fakeApi() as never, { patient: average, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: true });
    expect(changed[0]).toMatchObject({ actor: average, add: "Skinny" });
    expect(posted[0].data.lines[0]).toContain("BuildChanged");
    const heavy = person([item("Overweight", "trait")]);
    await operateElectively(fakeApi() as never, { patient: heavy, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: true });
    expect(changed[1]).toMatchObject({ actor: heavy, name: "Overweight", remove: true });
    const plain = person([]);
    await operateElectively(fakeApi() as never, { patient: plain, surgeon: { name: "Doc" }, techLevel: 8, procedure: "appearance" });
    expect(changed[2]).toMatchObject({ actor: plain, add: "Appearance", level: 1 });
    expect(posted[2].data.lines[0]).toContain("AppearanceChanged");
  });

  it("records nothing on a failed roll, and nothing at all where the system rolled nothing", async () => {
    outcome = { success: false, margin: -3 };
    const pat = person([item("Fat", "trait")]);
    await operateElectively(fakeApi() as never, { patient: pat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: true });
    expect(changed).toEqual([]);
    expect(posted[0].data.lines).toEqual(["GCC.HT.Prosthetics.FailedNote.build"]);
    expect(pat.getFlag(MODULE_ID, SURGERY_FLAG)).toBeUndefined();
    outcome = null;
    expect(await operateElectively(fakeApi() as never, { patient: pat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: true })).toBeNull();
    expect(posted).toHaveLength(1);
  });

  it("refuses an operation the book doesn't price, without rolling", async () => {
    const pat = person([item("Appearance", "trait", { levels: 5 })]);
    expect(await operateElectively(fakeApi() as never, { patient: pat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "appearance" })).toBeNull();
    expect(operated).toEqual([]);
    expect(warnings[0]).toContain("NoAppearanceStep");
  });

  it("records a success and, once every eye is done, cures Bad Sight", async () => {
    const pat = person([item("Bad Sight (Farsighted)", "trait")]);
    // The operation's success is read from the system's roll and recorded: one eye done.
    const plan = await operateElectively(fakeApi() as never, { patient: pat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "vision", eyes: 1 });
    expect(sightCured(pat)).toBe(false);
    expect(inPlay(pat)[0].inPlay).toBe(true);
    await recordOperation(pat, plan!, 1);
    expect(pat.getFlag(MODULE_ID, SURGERY_FLAG)).toMatchObject({ eyesCured: 2, operations: [{ procedure: "vision", cost: 2000, time: 100 }, { procedure: "vision" }] });
    expect(inPlay(pat)[0]).toMatchObject({ inPlay: false, reason: "GCC.HT.Prosthetics.Cured" });
  });

  it("still records an older card's answer when the GM gives it", async () => {
    const pat = person([]);
    (globalThis as any).game.actors.get = () => pat;
    const plan = await operateElectively(fakeApi() as never, { patient: pat, surgeon: { name: "Doc" }, techLevel: 8, procedure: "build", lighter: false });
    expect(plan).toMatchObject({ from: "Average", to: "Overweight" });
    await cards.get("ht-elective-surgery").actions.worked.run({ message: "m", data: { ...posted[0].data, buttons: [{ action: "worked" }, { action: "failed" }] } });
    expect(updated[0].data.buttons).toEqual([]);
    // Average to Overweight: the trait added (API 1.124.0).
    expect(updated[0].data.lines[0]).toContain("BuildChanged");
    expect(changed.at(-1)).toMatchObject({ actor: pat, add: "Overweight" });
    expect(pat.getFlag(MODULE_ID, SURGERY_FLAG).operations[0]).toMatchObject({ procedure: "build", from: "Average", to: "Overweight" });
    await cards.get("ht-elective-surgery").actions.failed.run({ message: "m", data: posted[0].data });
    expect(updated[1].data.lines[0]).toBe("GCC.HT.Prosthetics.FailedNote.build");
  });
});
