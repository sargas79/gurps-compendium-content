/**
 * The supplement's electronic weapons and NNEMP as the system meets them
 * (HT:EE pp. 49-51): the roll modifiers, the affliction effects, the imposed
 * traits and the row actions, with only High-Tech's switches on (decisions
 * D1, E1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { readyElectronicWeapons } from "./index.js";

type Listener = (...args: any[]) => void;

const EE = "High-Tech: Electricity and Electronics p. 49";

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let options: Map<string, any>;
let chat: string[];
let on: { stunners: boolean; directed: boolean; emp: boolean };
let state: Map<string, any>;
let conditions: Map<any, any[]>;
let applied: any[];
let failures: any[];
let failureOutcome: string;
let successResult: any;
let darkness: number | null;
let targets: any[];
let dialogAnswer: any;
let hitLocations: boolean;

function fakeApi() {
  return {
    combat: {
      hooks: {
        successRollModifiers: "gworld.successRollModifiers",
        afflictionEffect: "gworld.afflictionEffect",
        attackModifiers: "gworld.attackModifiers",
        clearMalfunction: "gworld.clearMalfunction",
      },
      registerAttackOption: (o: any) => options.set(o.key, o),
      getWeaponState: (item: any) => state.get(item.id),
      setWeaponState: async (item: any, _m: string, v: any) => { state.set(item.id, v); },
    },
    registry: { isRuleOn: (key: string) => key === "hitLocations" && hitLocations },
    sheets: { registerRowAction: (a: any) => actions.set(a.key, a) },
    actors: {
      derived: (actor: any) => actor?.derived ?? null,
      attribute: () => 10,
      conditions: (actor: any) => conditions.get(actor) ?? [],
      applyCondition: async (actor: any, c: any) => { applied.push([actor.name, c]); },
      removeCondition: async (actor: any, id: string) => { conditions.set(actor, (conditions.get(actor) ?? []).filter((c) => c.id !== id)); },
      skillLevel: () => 12,
    },
    areas: { darknessAt: () => (darkness === null ? null : { darkness, penalty: -darkness }) },
    items: {
      equipmentFailure: async (o: any) => { failures.push(o); return { outcome: failureOutcome }; },
      setMalfunction: vi.fn(async () => {}),
      malfunction: () => null,
    },
    roll: { success: async () => successResult },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

function record(name: string, system: Record<string, any> = {}): any {
  const flags: Record<string, any> = { [MODULE_ID]: { book: "high-tech" } };
  return {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags,
    system: { tl: "8", equipped: true, carried: true, quantity: 1, reference: EE, ...system },
    getFlag: (s: string, k: string) => flags[s]?.[k],
    setFlag: vi.fn(async (s: string, k: string, v: any) => { (flags[s] ??= {})[k] = v; }),
    unsetFlag: vi.fn(async (s: string, k: string) => { delete flags[s]?.[k]; }),
    update: vi.fn(async () => {}),
  };
}

function person(name: string, items: any[] = [], derived: Record<string, any> = {}): any {
  const flags: Record<string, any> = {};
  const actor: any = {
    name,
    items,
    isOwner: true,
    flags,
    derived: { traitEffects: { protectedSense: {}, ...derived } },
    getActiveTokens: () => [{ center: { x: 0, y: 0 } }],
    getFlag: (s: string, k: string) => flags[s]?.[k],
    setFlag: async (s: string, k: string, v: any) => { (flags[s] ??= {})[k] = v; },
    unsetFlag: async (s: string, k: string) => { delete flags[s]?.[k]; },
  };
  for (const item of items) item.actor = actor;
  return actor;
}

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  options = new Map();
  chat = [];
  on = { stunners: false, directed: false, emp: false };
  state = new Map();
  conditions = new Map();
  applied = [];
  failures = [];
  failureOutcome = "failure";
  successResult = { success: false, criticalFailure: false };
  darkness = 5;
  targets = [];
  dialogAnswer = null;
  hitLocations = false;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: new Set(targets) }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.5 } });
  vi.stubGlobal("canvas", { scene: { grid: { size: 100, distance: 1 } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  readyElectronicWeapons(fakeApi() as never, { stunners: () => on.stunners, directed: () => on.directed, emp: () => on.emp });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const skillLines = (actor: any, skill: string) => fire("gworld.successRollModifiers", { actor, skill, tags: ["skill"], modifiers: [] }).modifiers;
const effectsOf = (actor: any, item: any, margin = -4) => fire("gworld.afflictionEffect", { actor, item, margin, effects: [] }).effects;

describe("electric stunners (HT:EE pp. 49, 51)", () => {
  it("help Interrogation, Intimidation and, with a prod, Animal Handling, while one is in hand", () => {
    const actor = person("Cop", [record("Stun Baton", { reference: "High-Tech p. 200" })]);
    expect(skillLines(actor, "Interrogation")).toEqual([]);
    on.stunners = true;
    expect(skillLines(actor, "Interrogation")).toEqual([{ label: expect.stringContaining("interrogation"), value: 6 }]);
    expect(skillLines(actor, "Intimidation")).toEqual([{ label: expect.stringContaining("intimidation"), value: 2 }]);
    expect(skillLines(actor, "Animal Handling (Cattle)")).toEqual([]);
    const rancher = person("Rancher", [record("Cattle Prod")]);
    expect(skillLines(rancher, "Animal Handling (Cattle)")).toEqual([{ label: expect.stringContaining("animalHandling"), value: 2 }]);
    expect(skillLines(person("Idle", [record("Stun Gun", { equipped: false })]), "Interrogation")).toEqual([]);
  });

  it("the supplement's prod pains for minutes by the margin, severely to the face", () => {
    const prod = record("Cattle Prod");
    const victim = person("Victim");
    on.stunners = true;
    expect(effectsOf(victim, prod, -3)).toEqual([{ key: "moderatePain", duration: { seconds: 180 } }]);
    fire("gworld.attackModifiers", { item: prod, options: { [`${MODULE_ID}.ee-prod-face`]: true }, modifiers: [] });
    expect(effectsOf(victim, prod, -2)).toEqual([{ key: "severePain", duration: { seconds: 120 } }]);
    expect(options.get("ee-prod-face").available({ item: prod })).toBe(true);
    // High-Tech's own prod stuns under its own switch instead.
    expect(effectsOf(victim, record("Cattle Prod", { reference: "High-Tech p. 200" }))).toEqual([]);
  });

  it("reads the face or groin from where the blow struck, with hit locations in play (#549)", () => {
    const prod = record("Cattle Prod");
    const victim = person("Victim");
    on.stunners = true;
    hitLocations = true;
    // No option to tick: the blow's location says it.
    expect(options.get("ee-prod-face").available({ item: prod })).toBe(false);
    const struck = (hitLocation: string | null) => fire("gworld.afflictionEffect", { actor: victim, item: prod, margin: -2, hitLocation, effects: [] }).effects[0].key;
    expect(struck("face")).toBe("severePain");
    expect(struck("groin")).toBe("severePain");
    expect(struck("torso")).toBe("moderatePain");
    // A location read wins over an option left from before.
    fire("gworld.attackModifiers", { item: prod, options: { [`${MODULE_ID}.ee-prod-face`]: true }, modifiers: [] });
    expect(struck("arm")).toBe("moderatePain");
    // No location (hit locations off, or an area): the option's word.
    expect(struck(null)).toBe("severePain");
  });
});

describe("directed-energy weapons (HT:EE pp. 50-51)", () => {
  it("the dazzler: no DR, eye protection and fog on the roll to resist", () => {
    const dazzler = record("Dazzler");
    const victim = person("Guard", [], { protectedSense: { vision: true }, nictitatingMembrane: 2 });
    on.directed = true;
    fire("gworld.attackModifiers", { item: dazzler, options: { [`${MODULE_ID}.ee-dazzle-obscured`]: -2 }, modifiers: [] });
    const context = fire("gworld.successRollModifiers", { actor: victim, tags: ["resist", "affliction"], attack: { item: dazzler }, modifiers: [{ key: "afflictionDr", value: 3 }] });
    expect(context.modifiers).toEqual([{ label: "GCC.HT.ElectronicWeapons.EyeProtection", value: 7 }, { label: "GCC.HT.ElectronicWeapons.Obscured", value: 2 }]);
  });

  it("a laser pointer, red or green, is aimed at -1; the dazzler isn't", () => {
    const attack = (item: any) => fire("gworld.attackModifiers", { item, mode: { ranged: true }, options: {}, modifiers: [] }).modifiers;
    expect(attack(record("Laser Pointer"))).toEqual([]);
    on.directed = true;
    expect(attack(record("Laser Pointer"))).toEqual([{ label: expect.stringContaining("PointerSkill"), value: -1 }]);
    expect(attack(record("Green Laser Pointer"))).toEqual([{ label: expect.stringContaining("PointerSkill"), value: -1 }]);
    expect(attack(record("Dazzler"))).toEqual([]);
  });

  it("the dazzler blinds dark-adapted eyes for minutes, and does nothing in the light", () => {
    const pointer = record("Laser Pointer");
    const victim = person("Guard");
    on.directed = true;
    expect(effectsOf(victim, pointer, -3)).toEqual([{ module: MODULE_ID, key: "ee-dazzler-blinded", label: expect.any(String), duration: { seconds: 180 } }]);
    // A failure by 1, 5 and 12 (the system's margin is negative; #535).
    expect(effectsOf(victim, pointer, -1)[0].duration).toEqual({ seconds: 60 });
    expect(effectsOf(victim, pointer, -5)[0].duration).toEqual({ seconds: 300 });
    expect(effectsOf(victim, pointer, -12)[0].duration).toEqual({ seconds: 720 });
    darkness = 1;
    expect(effectsOf(victim, pointer, -3)).toEqual([]);
    conditions.set(victim, [{ id: `${MODULE_ID}.ee-dazzler-blinded` }]);
    const traits = fire("gworld.traitEffects", { actor: victim, effects: { blindness: false, accustomedToBlindness: false }, sources: [] });
    expect(traits.effects).toEqual({ blindness: true, accustomedToBlindness: false });
    expect(traits.sources[0].effect).toBe("blindness");
  });

  it("the hailing device: pain while it sounds, then tinnitus and the roll that keeps it", async () => {
    const lrad = record("Acoustic Hailing Device", { reference: "High-Tech: Electricity and Electronics p. 32" });
    const operator = person("Operator", [lrad]);
    const victim = person("Rioter");
    on.directed = true;
    expect(effectsOf(person("Deaf", [], { deafness: true }), lrad)).toEqual([]);
    expect(effectsOf(victim, lrad, -4)).toEqual([{ key: "moderatePain" }]);
    await flush();
    targets = [{ actor: victim }];
    actions.get("ee-hailing-minute").run(lrad, operator);
    await flush();
    expect(applied[0][1]).toMatchObject({ key: "ee-tinnitus", duration: { seconds: 4 * 30 * 86400 } });
    successResult = { success: false, criticalFailure: true };
    actions.get("ee-hailing-minute").run(lrad, operator);
    await flush();
    expect(applied[1][1].duration).toBeUndefined();
    conditions.set(victim, [{ id: `${MODULE_ID}.ee-tinnitus` }]);
    expect(fire("gworld.traitEffects", { actor: victim, effects: {}, sources: [] }).effects.hardOfHearing).toBe(true);
  });

  it("the Active Denial System: agony while in the beam, free to flee, a second after leaving", async () => {
    const ads = record("Active Denial System", { reference: "High-Tech: Electricity and Electronics p. 50" });
    const victim = person("Rioter");
    on.directed = true;
    expect(effectsOf(victim, ads).map((e: any) => e.key)).toEqual(["agony", "ee-active-denial"]);
    conditions.set(victim, [{ id: `${MODULE_ID}.ee-active-denial` }, { id: "agony" }]);
    expect(fire("gworld.maneuverAllowances", { actor: victim, movement: "none" }).movement).toBe("full");
    targets = [{ actor: victim }];
    actions.get("ee-denial-leave").run(ads, person("Operator", [ads]));
    await flush();
    expect(applied).toEqual([["Rioter", { key: "agony", duration: { seconds: 1 } }]]);
  });

  it("leaves High-Tech's own lasers to its laserDazzlers switch", () => {
    on.directed = true;
    expect(effectsOf(person("Guard"), record("Dazzler", { reference: "High-Tech p. 181" }))).toEqual([]);
  });
});

describe("non-nuclear EMP (HT:EE p. 50)", () => {
  it("rolls each chosen device's HT, +3 Hardened, shuts down the failures, and is spent", async () => {
    const radio = record("Radio", { reference: "High-Tech p. 37" });
    const armour = record("Hardened Radio", { reference: "High-Tech p. 37" });
    const victim = person("Soldier", [radio, armour]);
    const nnemp = record("NNEMP", { reference: "High-Tech: Electricity and Electronics p. 50" });
    const saboteur = person("Saboteur", [nnemp]);
    expect(actions.get("ee-nnemp").visible(nnemp)).toBe(false);
    on.emp = true;
    expect(actions.get("ee-nnemp").visible(nnemp)).toBe(true);
    targets = [{ actor: victim, center: { x: 0, y: 0 } }];
    dialogAnswer = { "g0-Radio": "electronic", "g0-Hardened Radio": "hardened", spent: "on" };
    actions.get("ee-nnemp").run(nnemp, saboteur);
    await flush();
    expect(failures.map((f) => [f.item.name, f.modifier, f.apply])).toEqual([["Radio", 0, false], ["Hardened Radio", 3, false]]);
    expect(radio.setFlag).toHaveBeenCalledWith(MODULE_ID, "eeNnemp", { penalty: -6 });
    expect(armour.setFlag).toHaveBeenCalledWith(MODULE_ID, "eeNnemp", { penalty: 0 });
    expect(nnemp.update).toHaveBeenCalledWith({ "system.quantity": 0 });
    expect(actions.get("ee-nnemp-repair").visible(radio)).toBe(true);
  });

  it("leaves out characters past 220 yards", async () => {
    const nnemp = record("NNEMP");
    const saboteur = person("Saboteur", [nnemp]);
    saboteur.getActiveTokens = () => [{ center: { x: 0, y: 0 } }];
    on.emp = true;
    targets = [{ actor: person("Far", [record("Radio")]), center: { x: 30000, y: 0 } }];
    actions.get("ee-nnemp").run(nnemp, saboteur);
    await flush();
    expect(failures).toEqual([]);
  });
});
