/**
 * The supplement's electric light as the system meets it: the darkness each
 * lamp on the canvas leaves, the light read at a token, a beam aimed, and
 * glare -- with only High-Tech's switches on (decision D1). The lamps are
 * fixtures named as the supplement's records (#478) name them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { LAMP_FLAG, aimBeam, carriedLamp, lampConfigFields, lampLevel, lightAt, postGlare, readLight, readyLighting, resistGlare, type GlareData } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let cards: Map<string, any>;
let levels: any[];
let successes: any[];
let conditions: any[];
let posted: any[];
let updated: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResult: any;
let targets: any[];
let controlled: any[];
/** The lights the stand-in canvas has reach the spot, with their distance. */
let lightsHere: Array<{ light: any; distance: number }>;
let daylight: boolean;
let ambient: number;
let actorConditions: any[];
let fromUuids: Map<string, any>;
let dialogAnswer: any;
let contests: any[];
let contestOutcome: string;

/** The system's reading: the least darkness any registered level gives, else the light's 3; never darker than the scene. */
function darknessAt(_scene: any, _at: any, options: any = {}): any {
  let darkness = daylight ? 0 : ambient;
  for (const { light, distance } of lightsHere) {
    let least: number | null = null;
    for (const l of levels) {
      const given = l.level(options.observer ?? null, light, { x: 0, y: 0, elevation: 0, distance });
      if (given === null || given === undefined) continue;
      least = least === null ? Math.abs(given) : Math.min(least, Math.abs(given));
    }
    darkness = Math.min(darkness, least ?? 3);
  }
  return { darkness, total: darkness >= 10, penalty: -darkness, lighting: { daylight }, lightAreas: [] };
}

function fakeApi() {
  return {
    registry: { isRuleOn: () => false },
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers" } },
    areas: { registerLightLevel: (r: any) => { levels.push(r); return `${r.module}.${r.key}`; }, darknessAt },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, opts }); },
      update: async (_message: any, data: any) => { updated.push(data); return true; },
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: (actor: any) => actor?.derived ?? {},
      conditions: () => actorConditions,
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor, ...c }); return `${c.module}.${c.key}`; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: contestOutcome }; },
    },
  };
}

function lamp(name: string, more: Record<string, any> = {}, flags: Record<string, unknown> = {}): any {
  const item: any = {
    id: name.replace(/\W/g, ""),
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech", ...flags } },
    system: { tl: "6", carried: true, ...more },
  };
  item.update = async () => {};
  return item;
}

const person = (name: string, items: any[] = [], more: Record<string, any> = {}) => {
  const actor: any = { name, uuid: `Actor.${name}`, isOwner: true, items, attributes: { DX: 12, HT: 11 }, derived: { traitEffects: {} }, ...more };
  fromUuids.set(actor.uuid, actor);
  return actor;
};

const tokenAt = (id: string, x: number, actor: any) => {
  const token: any = { id, name: actor.name, document: { id, documentName: "Token", actor }, center: { x, y: 0 }, actor };
  actor.getActiveTokens = () => [token];
  return token;
};

const ambientLight = (data?: Record<string, unknown>) => ({ documentName: "AmbientLight", flags: data ? { [MODULE_ID]: { [LAMP_FLAG]: data } } : {} });

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

const switches = { illumination: () => on.illumination === true, dazzle: () => on.lightDazzle === true };

function ready(): void {
  readyLighting(fakeApi() as never, switches);
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  tools = new Map();
  cards = new Map();
  levels = [];
  successes = [];
  conditions = [];
  posted = [];
  updated = [];
  chat = [];
  on = {};
  successResult = { success: true, margin: 3 };
  targets = [];
  controlled = [];
  lightsHere = [];
  daylight = false;
  ambient = 10;
  actorConditions = [];
  fromUuids = new Map();
  dialogAnswer = null;
  contests = [];
  contestOutcome = "first";
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, d: Record<string, unknown>) => `${k} ${JSON.stringify(d)}` },
    user: { isGM: true, get targets() { return new Set(targets); } },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.2 } });
  vi.stubGlobal("fromUuid", async (uuid: string) => fromUuids.get(uuid) ?? null);
  vi.stubGlobal("canvas", {
    grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(b.x - a.x) }) },
    get tokens() { return { controlled, placeables: controlled }; },
  });
  ready();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the darkness a lamp leaves (HT:EE p. 20)", () => {
  it("registers one reading with the system", () => {
    expect(levels.map((l) => l.key)).toEqual(["ee-lamps"]);
  });

  it("reads nothing with the switch off, or for a light that isn't a lamp", () => {
    const light = ambientLight({ lamp: "Table Lamp", watts: 100 });
    expect(lampLevel(switches, light, { distance: 1 })).toBeNull();
    on.illumination = true;
    expect(lampLevel(switches, ambientLight(), { distance: 1 })).toBeNull();
    expect(lampLevel(switches, { id: "area", light: { radius: 3 } }, { distance: 1 })).toBeNull();
  });

  it("falls off from a lamp the GM marked on the map", () => {
    on.illumination = true;
    const light = ambientLight({ lamp: "Table Lamp", watts: 100 });
    expect([1, 2, 4, 8, 50].map((distance) => lampLevel(switches, light, { distance }))).toEqual([0, 1, 2, 3, 6]);
  });

  it("marks a light as a lamp in its own configuration sheet, saved as the light's flag", () => {
    const html = lampConfigFields(ambientLight({ lamp: "Spotlight", watts: 250, brighter: true }));
    expect(html).toContain(`name="flags.${MODULE_ID}.${LAMP_FLAG}.lamp"`);
    expect(html).toContain('<option value="Spotlight" selected>');
    expect(html).toContain('value="250"');
    expect(html).toContain("checked");
    const form: any = { inserted: "", querySelector: (q: string) => (q.startsWith("[data-gcc") ? null : q.startsWith(".tab") ? form : null), insertAdjacentHTML: (_w: string, h: string) => { form.inserted += h; } };
    fire("renderAmbientLightConfig", { document: ambientLight() }, form);
    expect(form.inserted).toBe("");
    on.illumination = true;
    fire("renderAmbientLightConfig", { document: ambientLight() }, form);
    expect(form.inserted).toContain("data-gcc-ee-lamp-config");
    // Marked as none, it is an ordinary light again.
    expect(lampLevel(switches, ambientLight({ lamp: "", watts: 100 }), { distance: 1 })).toBeNull();
  });

  it("reads a token's own light as the lamp its character carries, the lit one first", () => {
    on.illumination = true;
    const flashlight = lamp("Flashlight");
    const spotlight = lamp("Spotlight");
    const actor = person("Ann", [flashlight, lamp("Kerosene Lantern")]);
    const token = tokenAt("t1", 0, actor);
    // A 1.5-watt conical beam: 9 lux, -2, out to its 10 yards.
    expect(lampLevel(switches, token.document, { distance: 5 })).toBe(2);
    actor.items.push(spotlight);
    expect(carriedLamp(actor)?.item).toBe(spotlight);
    flashlight.flags[MODULE_ID].expedition = { lit: true };
    expect(carriedLamp(actor)?.item).toBe(flashlight);
  });

  it("takes the wattage and element set on the item", () => {
    on.illumination = true;
    const actor = person("Ann", [lamp("Flashlight", {}, { [LAMP_FLAG]: { element: "led", brighter: true } })]);
    const token = tokenAt("t1", 0, actor);
    // An LED fitted for light: 54 lux, -1.
    expect(lampLevel(switches, token.document, { distance: 5 })).toBe(1);
  });

  it("lights only the cone a beam is pointed along, and leaves -9 beside it (HT:EE pp. 20, 22)", () => {
    on.illumination = true;
    const actor = person("Ann", [lamp("Flashlight")]);
    const token = tokenAt("t1", 0, actor);
    // Rotation 0 points down the map (+y). 100 pixels a yard here.
    token.document.rotation = 0;
    token.document.object = token;
    const at = (x: number, y: number) => lampLevel(switches, token.document, { x, y, distance: Math.hypot(x, y) / 100 });
    expect(at(0, 500)).toBe(2);
    // The 10-yard beam is 2 yards wide at its range: a yard either side at 10 yards, half that at 5.
    expect(at(80, 990)).toBe(2);
    expect(at(90, 500)).toBe(9);
    expect(at(0, -500)).toBe(9);
    expect(at(500, 0)).toBe(9);
    // Turned to face right (+x).
    token.document.rotation = 270;
    expect(at(500, 0)).toBe(2);
    // A lamp lighting all round has no cone.
    const floor = ambientLight({ lamp: "Floor Lamp", watts: 100 });
    expect(lampLevel(switches, { ...floor, x: 0, y: 0, rotation: 0 }, { x: 0, y: -100, distance: 1 })).toBe(0);
  });

  it("reads a light set down on an area as its item's lamp, or by its label (API 1.102.0)", () => {
    on.illumination = true;
    const lantern = lamp("Floor Lamp", {}, { [LAMP_FLAG]: { watts: 100 } });
    const actor = person("Ann", [lantern]);
    (actor.items as any).get = (id: string) => actor.items.find((i: any) => i.id === id);
    controlled = [tokenAt("t1", 0, actor)];
    const area = { id: `${MODULE_ID}-ht-light-${lantern.id}-abcd1234`, label: "Something", light: { radius: 5 } };
    // 100 rated watts exposed: 150 lux, 0 at a yard, -1 at 2.
    expect(lampLevel(switches, area, { distance: 2 })).toBe(1);
    expect(lampLevel(switches, { id: "other-area", label: "Table Lamp", light: { radius: 5 } }, { distance: 2 })).toBe(2);
    expect(lampLevel(switches, { id: "other-area", label: "Campfire", light: { radius: 5 } }, { distance: 2 })).toBeNull();
  });

  it("leaves another book's lamp alone", () => {
    on.illumination = true;
    const other = lamp("Flashlight");
    other.flags[MODULE_ID].book = "ultra-tech";
    const token = tokenAt("t1", 0, person("Ann", [other]));
    expect(lampLevel(switches, token.document, { distance: 1 })).toBeNull();
  });
});

describe("the light at a token (HT:EE p. 20)", () => {
  it("reads the lux of the brightest lamp reaching it, and the darkness", () => {
    on.illumination = true;
    const token = tokenAt("t1", 0, person("Ann"));
    lightsHere = [{ light: ambientLight({ lamp: "Desk Lamp" }), distance: 0.5 }];
    expect(lightAt(fakeApi() as never, token)).toEqual({ lux: 500, darkness: 0, penalty: 0 });
    lightsHere = [{ light: ambientLight(), distance: 1 }];
    expect(lightAt(fakeApi() as never, token)).toEqual({ lux: 1, darkness: 3, penalty: -3 });
    lightsHere = [];
    daylight = true;
    expect(lightAt(fakeApi() as never, token)?.lux).toBe(10_000);
  });

  it("says, for the GM, whether there is light enough to read or operate by", async () => {
    on.illumination = true;
    expect(tools.get("ee-read-light").visible()).toBe(true);
    controlled = [tokenAt("t1", 0, person("Ann"))];
    lightsHere = [{ light: ambientLight({ lamp: "Table Lamp", watts: 100 }), distance: 1 }];
    await readLight(fakeApi() as never);
    expect(chat[0]).toContain("GCC.HT.Lighting.ReadLine");
    expect(chat[0]).toContain('"lux":"100"');
    expect(chat[0]).toContain('GCC.HT.Lighting.TaskShort {"task":"GCC.HT.Lighting.Task.reading","lux":"500","penalty":-2}');
  });

  it("puts -2 on Surgery and Sewing rolled in less light than they need, at the roller's token", () => {
    const roll = (actor: any, skill: string) => fire("gworld.successRollModifiers", { actor, skill, modifiers: [] }).modifiers;
    const ann = person("Ann");
    tokenAt("t1", 0, ann);
    lightsHere = [{ light: ambientLight({ lamp: "Table Lamp", watts: 100 }), distance: 1 }];
    expect(roll(ann, "Surgery")).toEqual([]);
    on.illumination = true;
    expect(roll(ann, "Surgery")).toEqual([{ label: 'GCC.HT.Lighting.DimTask {"task":"GCC.HT.Lighting.Task.surgery","lux":"100"}', value: -2 }]);
    expect(roll(ann, "Sewing")).toEqual([{ label: 'GCC.HT.Lighting.DimTask {"task":"GCC.HT.Lighting.Task.reading","lux":"100"}', value: -2 }]);
    expect(roll(ann, "First Aid")).toEqual([]);
    // Daylight is enough to sew by, not to operate by.
    lightsHere = [];
    daylight = true;
    expect(roll(ann, "Sewing")).toEqual([]);
    expect(roll(ann, "Surgery")).toHaveLength(1);
    // No token on the map: nothing to read.
    expect(roll(person("Bob"), "Surgery")).toEqual([]);
  });

  it("offers the tools and sheet only with the switch on", () => {
    const flashlight = lamp("Flashlight");
    expect(tools.get("ee-read-light").visible()).toBe(false);
    expect(sections.get("ee-lamp-item").visible(flashlight)).toBe(false);
    expect(actions.get("ee-aim-beam").visible(flashlight)).toBe(false);
    on.illumination = true;
    expect(tools.get("ee-read-light").visible()).toBe(true);
    expect(sections.get("ee-lamp-item").visible(flashlight)).toBe(true);
    expect(sections.get("ee-lamp-item").context(flashlight).lines[0]).toContain("GCC.HT.Lighting.BeamLux");
    expect(actions.get("ee-aim-beam").visible(flashlight)).toBe(true);
    expect(actions.get("ee-aim-beam").visible(lamp("Floor Lamp"))).toBe(false);
  });
});

describe("aiming a beam (HT:EE p. 20)", () => {
  it("rolls DX at the darkness where it is aimed", async () => {
    on.illumination = true;
    const actor = person("Ann");
    targets = [tokenAt("t2", 5, person("Bob"))];
    ambient = 5;
    await aimBeam(fakeApi() as never, lamp("Flashlight"), actor);
    expect(successes[0]).toMatchObject({ base: 12, skill: "DX", modifiers: [{ label: "GCC.HT.Lighting.AimDarkness", value: -5 }] });
    expect(chat[0]).toContain("GCC.HT.Lighting.AimHit");
  });

  it("aims by ear at -6 in darkness worse than that, once the target is heard, the skill no higher than 9", async () => {
    on.illumination = true;
    const actor = person("Ann", [], { attributes: { DX: 16, HT: 11 }, derived: { traitEffects: {}, senses: [{ sense: "hearing", score: 13 }] } });
    targets = [tokenAt("t2", 5, person("Bob", [], { skills: { Stealth: 14 } }))];
    ambient = 8;
    // By sight: the darkness.
    dialogAnswer = "sight";
    await aimBeam(fakeApi() as never, lamp("Flashlight"), actor);
    expect(successes.at(-1).modifiers).toEqual([{ label: "GCC.HT.Lighting.AimDarkness", value: -8 }]);
    // By ear: a Hearing roll, then -6 and -1 more to hold DX 16 to 9.
    successes = [];
    dialogAnswer = "hearing";
    await aimBeam(fakeApi() as never, lamp("Flashlight"), actor);
    expect(successes[0]).toMatchObject({ base: 13, skill: "Hearing" });
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-6, -1]);
    // Against Stealth: a Quick Contest; lost, the darkness stands.
    successes = [];
    dialogAnswer = "stealth";
    contestOutcome = "second";
    await aimBeam(fakeApi() as never, lamp("Flashlight"), actor);
    expect(contests[0].first).toMatchObject({ base: 13 });
    expect(contests[0].second).toMatchObject({ base: 14 });
    expect(successes[0].modifiers).toEqual([{ label: "GCC.HT.Lighting.AimDarkness", value: -8 }]);
    // Closing the dialog aims nothing.
    successes = [];
    dialogAnswer = null;
    await aimBeam(fakeApi() as never, lamp("Flashlight"), actor);
    expect(successes).toEqual([]);
  });

  it("lands to one side by the margin on a miss", async () => {
    on.illumination = true;
    dialogAnswer = "sight";
    successResult = { success: false, margin: -3 };
    targets = [tokenAt("t2", 5, person("Bob"))];
    await aimBeam(fakeApi() as never, lamp("Flashlight"), person("Ann"), () => 4);
    expect(chat[0]).toContain('GCC.HT.Lighting.AimMiss {"name":"Bob","yards":3,"side":"GCC.HT.Lighting.Side.right"}');
  });
});

describe("glare (HT:EE pp. 9, 20-21)", () => {
  it("posts the roll only where the light is bright enough against the eyes' adaptation", async () => {
    on.lightDazzle = true;
    ambient = 0;
    const dark = tokenAt("t1", 0, person("Ann"));
    // Eyes used to a lit room (100 lux, step 5): 500 lux is a step up. In total darkness (step -5) it is eleven: -6.
    await postGlare(fakeApi() as never, [{ token: dark, step: 6 }], "Lamp");
    expect(posted).toHaveLength(0);
    expect(chat[0]).toContain("GCC.HT.Lighting.NoGlare");
    ambient = 10;
    await postGlare(fakeApi() as never, [{ token: dark, step: 6 }], "Lamp");
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ee-glare`, data: { victim: "Ann", source: "Lamp", modifier: -6 } });
  });

  it("fires a flashbulb at the targets, -5 looking straight at it", async () => {
    on.lightDazzle = true;
    ambient = 0;
    daylight = true;
    const bulb = lamp("Flashbulb");
    const actor = person("Ann", [bulb]);
    tokenAt("t1", 0, actor);
    targets = [tokenAt("t2", 1, person("Bob"))];
    expect(actions.get("ee-flashbulb").visible(bulb)).toBe(true);
    actions.get("ee-flashbulb").run(bulb, actor);
    await flush();
    // 900,000 lux at a yard: past 200,000, whatever the daylight.
    expect(posted[0].data).toMatchObject({ victim: "Bob", modifier: 0, lookingAt: -5 });
  });

  it("dazzles on a failure: -4 to Vision for minutes", async () => {
    on.lightDazzle = true;
    const victim = person("Bob", [], { derived: { traitEffects: { protectedSense: { vision: true } } } });
    successResult = { success: false, margin: -2 };
    const data: GlareData = { victimUuid: victim.uuid, victim: "Bob", source: "Flashbulb", modifier: -1, lookingAt: -5, result: "" };
    await resistGlare(fakeApi() as never, {}, data, true);
    expect(successes[0].modifiers).toEqual([
      { label: "GCC.HT.Lighting.GlareLine", value: -1 },
      { label: "GCC.HT.Lighting.LookingAt", value: -5 },
      { label: "GCC.HT.Lighting.Protection", value: 5 },
    ]);
    expect(conditions).toEqual([expect.objectContaining({ key: "ee-dazzled", duration: { seconds: 120 }, effects: { modifiers: [{ label: "GCC.HT.Lighting.Dazzled", value: -4, rolls: ["vision"] }] } })]);
    expect(updated[0].result).toContain("GCC.HT.Lighting.ResultDazzled");
  });

  it("blinds for seconds on a critical failure, then dazzles", async () => {
    on.lightDazzle = true;
    const victim = person("Bob");
    successResult = { success: false, margin: -5, criticalFailure: true };
    await resistGlare(fakeApi() as never, {}, { victimUuid: victim.uuid, victim: "Bob", source: "Arc flash", modifier: -1, lookingAt: 0, result: "" }, false);
    expect(conditions.map((c) => [c.key, c.duration])).toEqual([["ee-glare-blinded", { seconds: 5 }], ["ee-dazzled", { seconds: 305 }]]);
  });

  it("counts a roll the system won't make, below 3, as a failure by what it fell short", async () => {
    on.lightDazzle = true;
    const victim = person("Dee");
    successResult = { refused: true, effective: 1 };
    await resistGlare(fakeApi() as never, {}, { victimUuid: victim.uuid, victim: "Dee", source: "Flashbulb", modifier: -4, lookingAt: -5, result: "" }, true);
    expect(successes[0].returnRefusal).toBe(true);
    expect(conditions.map((c) => [c.key, c.duration])).toEqual([["ee-dazzled", { seconds: 120 }]]);
  });

  it("does nothing to someone already blind", async () => {
    on.lightDazzle = true;
    const victim = person("Bob", [], { derived: { traitEffects: { blindness: true } } });
    await resistGlare(fakeApi() as never, {}, { victimUuid: victim.uuid, victim: "Bob", source: "Arc flash", modifier: 0, lookingAt: 0, result: "" }, false);
    expect(successes).toHaveLength(0);
    expect(updated[0].result).toContain("GCC.HT.Lighting.AlreadyBlind");
  });

  it("imposes the system's Blindness while the glare's blindness lasts", () => {
    const actor = person("Bob");
    actorConditions = [{ id: `${MODULE_ID}.ee-glare-blinded` }];
    const context = { actor, effects: {} as any, sources: [] as any[] };
    fire("gworld.traitEffects", context);
    expect(context.effects.blindness).toBeUndefined();
    on.lightDazzle = true;
    fire("gworld.traitEffects", context);
    expect(context.effects).toEqual({ blindness: true });
    expect(context.sources).toEqual([{ effect: "blindness", label: "GCC.HT.Lighting.Blinded" }]);
    actorConditions = [];
    const clear = { actor, effects: {} as any, sources: [] };
    fire("gworld.traitEffects", clear);
    expect(clear.effects.blindness).toBeUndefined();
  });

  it("offers the GM's glare with its own switch alone", () => {
    expect(tools.get("ee-glare").visible()).toBe(false);
    on.lightDazzle = true;
    expect(tools.get("ee-glare").visible()).toBe(true);
    expect(tools.get("ee-read-light").visible()).toBe(false);
  });
});
