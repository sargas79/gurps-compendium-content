/**
 * Drawing guns and the gunfight standoff as the system meets them, with
 * Foundry's globals stubbed and only High-Tech's switches on (D1): the
 * shared engines take High-Tech's table, and Martial Arts' is never
 * registered.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CARRY_TABLES } from "../../../shared/readying/index.js";
import { GUN_CARRIES, gunCarryModifier } from "./rules.js";
import { drawLines, holsterOf, readyDrawing } from "./index.js";

type Listener = (context: any) => void;

let hooks: Map<string, Listener[]>;
let gmTools: any[];
let contests: any[];
let chat: string[];
let weaponState: Map<string, Record<string, unknown>>;
let form: Record<string, unknown>;
let targets: any[];

const key = (k: string) => `${MODULE_ID}.${k}`;

function fakeApi() {
  return {
    registry: { isRuleOn: () => false },
    rules: { weaponClassOf: () => "firearm" },
    combat: {
      hooks: { successRollModifiers: "gworld.successRollModifiers" },
      getWeaponState: (item: any) => weaponState.get(item.id) ?? {},
      setWeaponState: async (item: any, _m: string, patch: any) => { weaponState.set(item.id, { ...(weaponState.get(item.id) ?? {}), ...patch }); },
      getCombatState: () => undefined,
      setCombatState: async () => {},
      grapple: () => null,
    },
    sheets: { registerSheetSection: vi.fn(), registerGmTool: (tool: any) => gmTools.push(tool) },
    actors: {
      skillLevel: (actor: any, name: string) => actor.skills?.[name] ?? null,
      derived: (actor: any) => ({ ranged: actor.ranged }),
      attribute: () => 10,
    },
    roll: {
      success: vi.fn(async () => ({ success: true })),
      quickContest: vi.fn(async (args: any) => { contests.push(args); return { outcome: "second" }; }),
    },
  };
}

function items(list: any[]) {
  const all = [...list];
  return Object.assign(all, { get: (id: string) => all.find((i) => i.id === id) });
}

function pistol(id: string, extensions: Record<string, unknown> = {}, bulk = -2): any {
  return {
    id,
    name: id === "colt" ? "Colt M1911A1" : "S&W Model 10",
    type: "equipment",
    system: { carried: true, weaponClass: "firearm", meleeModes: [], rangedModes: [{ skill: "Guns (Pistol)", bulk }], extensions: { [MODULE_ID]: extensions } },
  };
}

const holster = (id: string, name: string) => ({ id, name, type: "equipment", system: { carried: true, meleeModes: [], rangedModes: [] } });

function gunman(name: string, gun: any, gear: any[] = [], traits: string[] = []): any {
  const actor: any = {
    uuid: `Actor.${name}`,
    name,
    isOwner: true,
    system: { posture: "standing", maneuver: "" },
    skills: { "Fast-Draw (Pistol)": 14 },
    ranged: [{ itemId: gun.id, name: gun.name, skillLevel: 15, bulk: gun.system.rangedModes[0].bulk, usable: true }],
  };
  actor.items = items([gun, ...gear, { id: "fd", name: "Fast-Draw (Pistol)", type: "skill" }, ...traits.map((t, i) => ({ id: `t${i}`, name: t, type: "trait" }))]);
  gun.actor = actor;
  for (const g of gear) g.actor = actor;
  return actor;
}

beforeEach(() => {
  hooks = new Map();
  gmTools = [];
  contests = [];
  chat = [];
  weaponState = new Map();
  form = {};
  targets = [];
  CARRY_TABLES.register({ book: "high-tech", rules: [key("gunDrawing"), key("gunfightStandoff")], carries: GUN_CARRIES, figures: gunCarryModifier, i18n: "GCC.HT.Drawing" });
  setRuleReader((k) => k === key("gunDrawing") || k === key("gunfightStandoff"));
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async () => form } }, ux: { FormDataExtended: class {} } },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  CARRY_TABLES.clear();
  setRuleReader(() => false);
});

describe("a Fast-Draw's lines", () => {
  it("draws a pistol from a shoulder holster at the place's -1, taken once", () => {
    const gun = pistol("colt", { holster: { item: "sh" } });
    const actor = gunman("Doc", gun, [holster("sh", "Shoulder Holster")]);
    expect(holsterOf(gun)?.kind).toBe("shoulder");
    expect(drawLines(actor, gun, "master", { grappled: false, upsideDown: false })).toEqual([{ label: "GCC.HT.Drawing.Line.carry", value: -1 }]);
  });

  it("adds the off hand's -4 and a military holster's -2, which a tucked flap takes away", () => {
    const gun = pistol("colt", { holster: { item: "mh" } });
    const actor = gunman("Doc", gun, [holster("mh", "Military Holster")]);
    expect(drawLines(actor, gun, "off", { grappled: false, upsideDown: false })).toEqual([
      { label: "GCC.HT.Drawing.Line.offHand", value: -4 },
      { label: "Military Holster", value: -2 },
    ]);
    gun.system.extensions[MODULE_ID].holster.flapTucked = true;
    expect(drawLines(actor, gun, "master", { grappled: false, upsideDown: false })).toEqual([]);
  });

  it("gives a pistol in a Fast-Draw rig +2", () => {
    const gun = pistol("colt", { holster: { item: "rig" } });
    const actor = gunman("Doc", gun, [holster("rig", "Fast-Draw Rig")]);
    expect(drawLines(actor, gun, "master", { grappled: false, upsideDown: false })).toEqual([{ label: "Fast-Draw Rig", value: 2 }]);
  });
});

describe("a retention holster", () => {
  it("gives +2 to Retain Weapon while the gun is in it, and nothing once it is drawn", () => {
    readyDrawing(fakeApi() as never, { drawing: () => true, standoff: () => false });
    const gun = pistol("colt", { holster: { item: "rh" } });
    const actor = gunman("Doc", gun, [holster("rh", "Retention Holster")]);
    const roll = () => {
      const context = { actor, skill: "Retain Weapon (Pistol)", modifiers: [] as any[] };
      for (const l of hooks.get("gworld.successRollModifiers") ?? []) l(context);
      return context.modifiers;
    };
    expect(roll()).toEqual([{ label: "Retention Holster", value: 2 }]);
    weaponState.set("colt", { drawn: true });
    expect(roll()).toEqual([]);
  });

  it("counts only the gun the roll names, where it names one (API 1.136.0)", () => {
    readyDrawing(fakeApi() as never, { drawing: () => true, standoff: () => false });
    const kept = pistol("colt", { holster: { item: "rh" } });
    const loose = pistol("glock");
    const actor = gunman("Doc", kept, [holster("rh", "Retention Holster"), loose]);
    const roll = (item: any) => {
      const context = { actor, skill: "Retain Weapon (Pistol)", item, modifiers: [] as any[] };
      for (const l of hooks.get("gworld.successRollModifiers") ?? []) l(context);
      return context.modifiers;
    };
    expect(roll(kept)).toEqual([{ label: "Retention Holster", value: 2 }]);
    expect(roll(loose)).toEqual([]);
  });
});

describe("who draws first with guns", () => {
  it("rolls a ready gunfighter's skill against the other's Fast-Draw at -10, with the worse Bulk and a hand on the gun", async () => {
    const api = fakeApi();
    readyDrawing(api as never, { drawing: () => false, standoff: () => true });
    const tool = gmTools.find((t) => t.key === "ht-who-draws-first");
    expect(tool.visible()).toBe(true);
    const ready = gunman("Wyatt", pistol("sw", {}, -1), [], ["Combat Reflexes"]);
    const drawer = gunman("Ike", pistol("colt", { holster: { item: "sh" } }, -2), [holster("sh", "Shoulder Holster")]);
    targets = [ready, drawer];
    form = { row0: "0", ready0: true, fastDraw0: "", row1: "0", fastDraw1: "Fast-Draw (Pistol)", hand1: true, other0: 0, other1: 0 };
    await tool.open();
    const [contest] = contests;
    expect(contest.first.modifiers).toEqual([{ label: "GCC.HT.Drawing.Standoff.Lines.combatReflexes", value: 1 }]);
    expect(contest.second.base).toBe(14);
    expect(contest.second.modifiers).toEqual([
      { label: "GCC.HT.Drawing.Standoff.Lines.handOnWeapon", value: 4 },
      { label: "GCC.HT.Drawing.Standoff.Lines.bulk", value: -1 },
      { label: "GCC.HT.Drawing.Standoff.Lines.againstReady", value: -10 },
      { label: "GCC.HT.Drawing.Line.carry", value: -1 },
    ]);
    expect(chat[0]).toContain("GCC.HT.Drawing.Standoff.Draw.First");
    expect(chat[0]).toContain("Ike");
  });
});
