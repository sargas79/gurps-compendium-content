/**
 * High-Tech's explosives and incendiaries at the table (pp. 181-188): the REF
 * table in the Demolition list, a record set off against a door, an enclosed
 * blast's doubled dice, the concussion and flash rolls, nitro that is jolted,
 * skimming and cooking, the fuel-air falloff, and thermite and napalm burning
 * on over turns -- each under its own High-Tech switch, with no other book's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { EXPLOSIVES } from "./ref.js";
import { explosiveKey, readyExplosives } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  attackModifiers: "gworld.attackModifiers",
  damageModifiers: "gworld.damageModifiers",
  afterDamage: "gworld.afterDamage",
  turnStart: "gworld.turnStart",
  explosionFalloff: "gworld.explosionFalloff",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let chat: string[];
let dice: number[];
let options: any[];
let actions: Map<string, any>;
let cards: Map<string, any>;
let sections: any[];
let posted: any[];
let registered: any[];
let detonations: any[];
let rolledFormulas: string[];
let injuries: any[];
let worn: any[];
let conditions: Map<string, any[]>;
let weaponState: Map<any, any>;
let derived: any;
let successes: any[];
let outcomes: any[];
let dialog: Record<string, string> | null;
let targets: any[];
let traitsAdded: any[];
let worldTime: number;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function actorWith(name: string, items: any[] = []): any {
  const flags: Record<string, unknown> = {};
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    items,
    system: { tl: 7 },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    flags,
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function record(name: string, type: string, pounds = 1, more: Record<string, unknown> = {}): any {
  const item: any = {
    id: name, uuid: `Item.${name}`, name, type: "equipment", isOwner: true,
    system: { quantity: 1, carried: true, meleeModes: [], rangedModes: [], extensions: { [MODULE_ID]: { explosive: { type, pounds, ...more } } } },
  };
  item.update = async (changes: Record<string, unknown>) => { for (const [path, value] of Object.entries(changes)) setPath(item, path, value); };
  return item;
}

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (key: string) => key === "explosions" || on[key] === true },
    data: { registerExplosive: (r: any) => { registered.push(r); return `${r.module}.${r.key}`; } },
    hazards: {
      // As the system does: the damage roll, and its hook, before the first await.
      detonate: (o: any) => {
        detonations.push(o);
        const context = { actor: o.actor, item: null, mode: null, label: o.label, formula: "6dx2", modifiers: [] };
        fire(HOOKS.damageModifiers, context);
        rolledFormulas.push(context.formula);
        return Promise.resolve({ basicDamage: 20 });
      },
    },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (option: any) => { options.push(option); },
      setWeaponState: async (item: any, _module: string, patch: any) => { weaponState.set(item, { ...(weaponState.get(item) ?? {}), ...patch }); },
      getWeaponState: (item: any) => weaponState.get(item) ?? null,
    },
    sheets: {
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerSheetSection: (s: any) => sections.push(s),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, options: opts }); },
      update: async (message: any, data: any) => { message.data = data; return true; },
    },
    items: {
      // Wears the piece down, and the DR at the place with it, as the system's pipeline would show it.
      wearDr: async (item: any, amount: number, o: any) => {
        const from = Number(item.system.drLost) || 0;
        const to = Math.min(Number(item.system.dr) || 0, from + amount);
        item.system.drLost = to;
        derived.drByLocation[o.location] -= to - from;
        worn.push({ item: item.name, amount, ...o });
        return { itemId: item.id, from, to, location: o.location, reason: o.reason };
      },
    },
    actors: {
      derived: () => derived,
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 12,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      conditions: (actor: any) => conditions.get(actor.name) ?? [],
      applyCondition: async (actor: any, c: any) => {
        const id = c.module ? `${c.module}.${c.key}` : c.key;
        conditions.set(actor.name, [...(conditions.get(actor.name) ?? []).filter((x) => x.id !== id), { id, ...c }]);
        return id;
      },
      removeCondition: async (actor: any, id: string) => { conditions.set(actor.name, (conditions.get(actor.name) ?? []).filter((x) => x.id !== id)); },
      applyInjury: async (actor: any, injury: any) => { injuries.push({ actor: actor.name, ...injury }); return null; },
      changeTrait: async (actor: any, o: any) => { traitsAdded.push({ actor: actor.name, ...o }); return { itemId: "t1", from: null, to: { name: o.add }, added: true, removed: false }; },
    },
    roll: { success: async (o: any) => { successes.push(o); return outcomes.shift() ?? { success: true, criticalFailure: false, margin: 0 }; } },
  };
}

let api: ReturnType<typeof fakeApi>;

function ready(): void {
  api = fakeApi();
  const rule = (key: string) => () => on[key] === true;
  readyExplosives(api as never, { sideEffects: rule("explosionSideEffects"), demolition: rule("demolitionCharges"), unstable: rule("unstableExplosives"), incendiaries: rule("incendiaryAgents") });
}

beforeEach(() => {
  hooks = new Map();
  on = {};
  chat = [];
  dice = [];
  options = [];
  actions = new Map();
  cards = new Map();
  sections = [];
  posted = [];
  registered = [];
  detonations = [];
  rolledFormulas = [];
  injuries = [];
  worn = [];
  conditions = new Map();
  weaponState = new Map();
  derived = { drByLocation: { torso: 4 }, traitEffects: { protectedSense: {} } };
  successes = [];
  outcomes = [];
  dialog = null;
  targets = [];
  traitsAdded = [];
  worldTime = 1000;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    get time() { return { worldTime }; },
    user: { isGM: true, get targets() { return new Set(targets); } },
    users: { activeGM: { isSelf: true } },
  });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 0.5) / 6 } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialog } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  ready();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("offers nothing and does nothing", async () => {
    const tnt = record("TNT (per pound)", "TNT");
    expect(registered).toHaveLength(EXPLOSIVES.length);
    expect(registered.every((r) => r.available() === false)).toBe(true);
    for (const action of actions.values()) expect(action.visible(tnt)).toBe(false);
    expect(options[0].available({ item: { system: { rangedModes: [{ explosive: true }] } } })).toBe(false);
    fire(HOOKS.afterDamage, { actor: actorWith("Victim"), damage: { type: "cr", basicDamage: 20, blastDistance: 0 }, result: { penetrating: 10 } });
    await flush();
    expect(posted).toEqual([]);
  });
});

describe("demolition charges (pp. 182-183)", () => {
  beforeEach(() => { on.demolitionCharges = true; });

  it("offers the book's REF table to the Demolition tool", () => {
    const tnt = registered.find((r) => r.key === explosiveKey(EXPLOSIVES.find((e) => e.type === "TNT")!));
    expect(tnt).toMatchObject({ module: MODULE_ID, key: "ht-tnt", ref: 1, tl: 6 });
    expect(registered.find((r) => r.key === "ht-composition-c4")).toMatchObject({ ref: 1.4, tl: 7 });
    expect(tnt.available()).toBe(true);
  });

  it("sets a pound of TNT off against a door", async () => {
    const tnt = record("TNT (per pound)", "TNT");
    const sapper = actorWith("Sapper", [tnt]);
    expect(actions.get("ht-detonate").visible(tnt)).toBe(true);
    // Wood, 2" thick: the Structural Damage Table's DR 2, HP 29.
    const door = rules.WALLS.findIndex((w) => w.name === "Wood (2\" thick)");
    dialog = { pounds: "1", placement: "contact", distance: "1", structure: String(door), dr: "0", hp: "0", taken: "0", shaped: "" };
    actions.get("ht-detonate").run(tnt, sapper);
    await flush();
    expect(detonations[0]).toMatchObject({
      explosive: `${MODULE_ID}.ht-tnt`, weightLbs: 1, placement: "contact",
      structure: { label: "Wood (2\" thick)", dr: 2, hp: 29, damageTaken: 0 }, actor: sapper,
    });
    expect(rolledFormulas).toEqual(["6dx2"]);
  });

  it("divides the structure's DR by 10 for a shaped charge", async () => {
    const c4 = record("Plastic Explosive (per pound)", "Composition C4");
    dialog = { pounds: "1", placement: "contact", distance: "1", structure: "custom", dr: "56", hp: "60", taken: "0", shaped: "on" };
    actions.get("ht-detonate").run(c4, actorWith("Sapper"));
    await flush();
    expect(detonations[0].structure).toMatchObject({ dr: 5, hp: 60 });
  });

  it("works out the charge a job takes and rolls for it", async () => {
    const c4 = record("Plastic Explosive (per pound)", "Composition C4");
    const sapper = { ...actorWith("Sapper"), skills: { "Explosives (Demolition)": 13 } };
    dialog = { job: "brickWall", holeFeet: "2", thicknessFeet: "1", tamped: "on", shaped: "" };
    actions.get("ht-plan-charge").run(c4, sapper);
    await flush();
    // 1 lb. of TNT, 0.71 of C4, halved by tamping.
    expect(chat[0]).toContain('"pounds":0.36');
    expect(successes[0]).toMatchObject({ base: 13, skill: "Explosives (Demolition)" });
    expect(chat[0]).toContain("PlanEnough");
    expect(chat.at(-1)).toContain("PlanSuccess<");
  });

  it("rolls twice for a shaped charge at TL6", async () => {
    const tnt = record("TNT (per pound)", "TNT", 1);
    const sapper = { ...actorWith("Sapper"), skills: { "Explosives (Demolition)": 14 }, system: { tl: 6 } };
    dialog = { job: "brickWall", holeFeet: "1", thicknessFeet: "1", tamped: "", shaped: "on" };
    actions.get("ht-plan-charge").run(tnt, sapper);
    await flush();
    expect(successes.map((s) => s.modifiers.map((m: any) => m.value))).toEqual([[-4], [-5]]);
  });
});

describe("side effects of explosions (pp. 181-182)", () => {
  beforeEach(() => { on.explosionSideEffects = true; on.demolitionCharges = true; });

  it("doubles the dice of C4 set off in a sealed room", async () => {
    const c4 = record("Plastic Explosive (per pound)", "Composition C4");
    dialog = { pounds: "1", placement: "nearby", distance: "2", structure: "", enclosure: "sealed" };
    actions.get("ht-detonate").run(c4, actorWith("Sapper"));
    await flush();
    expect(detonations[0].label).toContain("EnclosedTag");
    expect(rolledFormulas).toEqual(["6dx4"]);
  });

  it("scales an explosive row's damage when the attack says it went off indoors", async () => {
    const grenade = { name: "Grenade", isOwner: true, system: { meleeModes: [], rangedModes: [{ explosive: true }] } };
    const option = options.find((o) => o.key === "ht-enclosure");
    expect(option.available({ item: grenade })).toBe(true);
    fire(HOOKS.attackModifiers, { item: grenade, options: { [`${MODULE_ID}.ht-enclosure`]: "vented" }, modifiers: [] });
    await flush();
    const context = { item: grenade, mode: { index: 0, ranged: true }, formula: "8d", modifiers: [] };
    fire(HOOKS.damageModifiers, context);
    expect(context.formula).toBe("12d");
  });

  it("leaves a card for the concussion and flash rolls, and applies what a failure does", async () => {
    const victim = { ...actorWith("Victim"), attributes: { HT: 12 } };
    fire(HOOKS.afterDamage, { actor: victim, damage: { type: "cr", basicDamage: 21, blastDistance: 2 }, result: { penetrating: 12 } });
    await flush();
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ht-blast-effects`, data: { concussion: { modifier: -2 }, flash: { modifier: -2 } } });

    outcomes = [{ success: false, criticalFailure: false, margin: 3 }];
    const message: any = {};
    await cards.get("ht-blast-effects").actions.concussion({ message, data: posted[0].data, actor: victim });
    expect(successes[0]).toMatchObject({ base: 12, kind: "attribute", modifiers: [{ value: -2 }] });
    const got = conditions.get("Victim")!;
    const tinnitus = got.find((c) => c.id === `${MODULE_ID}.ht-tinnitus`);
    // It lasts until the roll to recover, which waits (20 - HT) minutes (p. 182).
    expect(tinnitus).toMatchObject({ effects: { modifiers: [{ value: -3, rolls: ["hearing"] }] } });
    expect(tinnitus.duration).toBeUndefined();
    expect(got.some((c) => c.id === "stunned")).toBe(true);
    expect(message.data.concussion).toMatchObject({ rolled: true, recover: { at: worldTime + 480, key: "ht-tinnitus", total: false, done: false } });
  });

  it("rolls HT to recover once the time is up: success lifts it, a critical failure leaves it for good (p. 182; API 1.124.0)", async () => {
    const victim = { ...actorWith("Victim"), attributes: { HT: 12 } };
    outcomes = [{ success: false, criticalFailure: false, margin: 3 }];
    const message: any = {};
    await cards.get("ht-blast-effects").actions.concussion({ message, data: { name: "Victim", concussion: { modifier: 0 } }, actor: victim });
    const recover = (data: any) => cards.get("ht-blast-effects").actions.recoverHearing({ message, data, actor: victim });
    // Too soon: nothing rolled.
    await recover(message.data);
    expect(successes).toHaveLength(1);
    worldTime += 480;
    outcomes = [{ success: false, criticalFailure: false }];
    await recover(message.data);
    expect(message.data.concussion.recover).toMatchObject({ done: false, result: expect.stringContaining("RecoverStill") });
    outcomes = [{ success: true, criticalFailure: false }];
    await recover(message.data);
    expect(message.data.concussion.recover).toMatchObject({ done: true, result: expect.stringContaining("Recovered") });
    expect(conditions.get("Victim")!.some((c) => c.id === `${MODULE_ID}.ht-tinnitus`)).toBe(false);

    // Deafened, and a critical failure on the roll to recover: Deafness for good, added by the GM's client.
    outcomes = [{ success: false, criticalFailure: true, margin: 1 }];
    const deaf: any = {};
    await cards.get("ht-blast-effects").actions.concussion({ message: deaf, data: { name: "Victim", concussion: { modifier: 0 } }, actor: victim });
    worldTime += 480;
    outcomes = [{ success: false, criticalFailure: true }];
    await cards.get("ht-blast-effects").actions.recoverHearing({ message: deaf, data: deaf.data, actor: victim });
    expect(traitsAdded).toEqual([{ actor: "Victim", add: "Deafness" }]);
    expect(deaf.data.concussion.recover).toMatchObject({ done: true, result: expect.stringContaining("LastingAdded") });
  });

  it("imposes the system's Deafness and Blindness while deafened or blinded by a blast (API 1.120.0)", () => {
    const victim = actorWith("Victim");
    conditions.set("Victim", [{ id: `${MODULE_ID}.ht-blast-deafened` }, { id: `${MODULE_ID}.ht-flash-blinded` }]);
    const context: any = { actor: victim, effects: {}, sources: [] };
    fire("gworld.traitEffects", context);
    expect(context.effects).toEqual({ deafness: true, blindness: true });
    const clear: any = { actor: actorWith("Other"), effects: {}, sources: [] };
    fire("gworld.traitEffects", clear);
    expect(clear.effects).toEqual({});
  });

  it("counts earmuffs, and lasts two seconds with them", async () => {
    const victim = { ...actorWith("Victim", [{ name: "Earmuffs", system: { equipped: true } }]), attributes: { HT: 10 } };
    outcomes = [{ success: false, criticalFailure: false, margin: 1 }];
    await cards.get("ht-blast-effects").actions.concussion({ message: {}, data: { concussion: { modifier: -3 } }, actor: victim });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-3, 5]);
    expect(conditions.get("Victim")!.find((c) => c.id === `${MODULE_ID}.ht-tinnitus`)?.duration).toEqual({ seconds: 2 });
    // With the sense protected, recovery is automatic: no roll offered.
  });

  it("leaves the card as it was when the system refuses the roll (GWorldVTT #753)", async () => {
    const victim = actorWith("Victim");
    // A refused roll (effective HT below 3) comes back empty; `false` stands in for the system's null here.
    outcomes = [false, false];
    const data = { name: "Victim", concussion: { modifier: -12 }, flash: { modifier: -12 } };
    const message: any = { data };
    await cards.get("ht-blast-effects").actions.concussion({ message, data, actor: victim });
    await cards.get("ht-blast-effects").actions.flash({ message, data, actor: victim });
    expect(message.data).toBe(data);
    expect(conditions.get("Victim") ?? []).toEqual([]);
  });

  it("blinds on a flash failed by 10", async () => {
    const victim = actorWith("Victim");
    outcomes = [{ success: false, criticalFailure: false, margin: 10 }];
    await cards.get("ht-blast-effects").actions.flash({ message: {}, data: { flash: { modifier: 0 } }, actor: victim });
    expect(conditions.get("Victim")!.map((c) => c.id)).toEqual([`${MODULE_ID}.ht-flash-blinded`, "stunned"]);
  });

  it("asks only for the flash roll against a burning blast, and nothing for fragments", async () => {
    fire(HOOKS.afterDamage, { actor: actorWith("A"), damage: { type: "burn", basicDamage: 5, blastDistance: 0 }, result: { penetrating: 5 } });
    fire(HOOKS.afterDamage, { actor: actorWith("B"), damage: { type: "cut", basicDamage: 5, source: "fragments" }, result: { penetrating: 5 } });
    await flush();
    expect(posted).toHaveLength(1);
    expect(posted[0].data.concussion).toBeNull();
  });
});

describe("unstable explosives (pp. 184-187)", () => {
  beforeEach(() => { on.unstableExplosives = true; });

  it("sets nitro off on 12+ when it is jolted", async () => {
    const nitro = record("Nitroglycerin (per pound)", "Nitroglycerin (NG)");
    expect(actions.get("ht-explosive-shock").visible(nitro)).toBe(true);
    expect(actions.get("ht-explosive-shock").visible(record("TNT (per pound)", "TNT"))).toBe(false);
    dice = [6, 5, 1];
    actions.get("ht-explosive-shock").run(nitro, actorWith("Yegg"));
    await flush();
    expect(detonations[0]).toMatchObject({ explosive: `${MODULE_ID}.ht-nitroglycerin-ng`, weightLbs: 1, placement: "contact" });
    dice = [5, 5, 1];
    actions.get("ht-explosive-shock").run(nitro, actorWith("Yegg"));
    await flush();
    expect(detonations).toHaveLength(1);
  });

  it("asks for the jolt's number only on an explosive with nitro in it, or one already given one (pp. 184-185)", () => {
    const section = sections.find((s) => s.key === "ht-explosives-item");
    const sweats = (item: any) => (section.visible(item) ? section.context(item).sweats : null);
    expect(sweats(record("Dynamite, 80% (per pound)", "Dynamite (80%)"))).toBe(true);
    expect(sweats(record("Blasting Gelatin (per pound)", "Blasting Gelatin (60%)"))).toBe(true);
    expect(sweats(record("Nitroglycerin (per pound)", "Nitroglycerin (NG)"))).toBe(true);
    // Military dynamite has no nitro in it; TNT neither, unless the GM has set a number.
    expect(sweats(record("Military Dynamite (per pound)", "Military Dynamite"))).toBe(false);
    expect(sweats(record("TNT (per pound)", "TNT"))).toBe(false);
    expect(sweats(record("TNT (per pound)", "TNT", 1, { shockOn: 14 }))).toBe(true);
  });

  it("jolts sweating dynamite carried by someone who is hit", async () => {
    const sweating = record("Dynamite, 80% (per pound)", "Dynamite (80%)", 1, { shockOn: 9 });
    const carrier = actorWith("Carrier", [sweating]);
    dice = [3, 3, 3];
    fire(HOOKS.afterDamage, { actor: carrier, damage: { type: "pi", basicDamage: 6 }, result: { injury: 6 } });
    await flush();
    expect(detonations).toHaveLength(1);
  });

  it("skims nitro, and a failure by 2 blows half the dynamite up", async () => {
    const dynamite = record("Dynamite, 80% (per pound)", "Dynamite (80%)", 1);
    dynamite.system.quantity = 4;
    const cook = { ...actorWith("Cook"), skills: { Chemistry: 12, "Explosives (Demolition)": 10 } };
    outcomes = [{ success: false, criticalFailure: false, margin: 2 }];
    actions.get("ht-skim-nitro").run(dynamite, cook);
    await flush();
    expect(successes[0]).toMatchObject({ base: 12, skill: "Chemistry", modifiers: [{ value: -2 }] });
    expect(detonations[0]).toMatchObject({ weightLbs: 2 });
  });

  it("cooks plastique, a failed batch coming out flawed, and a weak one rolling half the dice", async () => {
    on.demolitionCharges = true;
    const c4 = record("Plastic Explosive (per pound)", "Composition C4");
    const cook = { ...actorWith("Cook"), skills: { Chemistry: 12 } };
    outcomes = [{ success: false, criticalFailure: false, margin: 1 }];
    dice = [3];
    actions.get("ht-cook-explosive").run(c4, cook);
    await flush();
    expect(c4.system.extensions[MODULE_ID].explosive.homeMade).toBe("weak");
    dialog = { pounds: "1", placement: "contact", distance: "1", structure: "" };
    actions.get("ht-detonate").run(c4, cook);
    await flush();
    expect(rolledFormulas).toEqual(["6d"]);
  });

  it("blows the batch up on a critical failure", async () => {
    const c4 = record("Plastic Explosive (per pound)", "Composition C4");
    outcomes = [{ success: false, criticalFailure: true, margin: 6 }];
    actions.get("ht-cook-explosive").run(c4, { ...actorWith("Cook"), skills: { Chemistry: 12 } });
    await flush();
    expect(detonations).toHaveLength(1);
  });

  it("won't set off an inert batch, and home-made ANFO needs a roll", async () => {
    on.demolitionCharges = true;
    const inert = record("Plastic Explosive (per pound)", "Composition C4", 1, { homeMade: "inert" });
    dialog = { pounds: "1", placement: "contact", distance: "1", structure: "" };
    actions.get("ht-detonate").run(inert, actorWith("Sapper"));
    await flush();
    expect(detonations).toHaveLength(0);
    const anfo = record("ANFO (per pound)", "ANFO", 1, { homeMade: "sound" });
    outcomes = [{ success: false, criticalFailure: false, margin: 1 }];
    actions.get("ht-detonate").run(anfo, { ...actorWith("Sapper"), skills: { "Explosives (Demolition)": 11 } });
    await flush();
    expect(successes[0].modifiers).toEqual([{ label: expect.any(String), value: 2 }]);
    expect(detonations).toHaveLength(0);
  });

  it("divides a fuel-air blast by twice the distance", () => {
    const context = { flag: { source: "demolition", label: 'GCC.HT.Explosives.TableLabel {"type":"Fuel-Air Explosive"} x 10 lb.' }, itemUuid: null, distanceYards: 5, divisorPerYard: 3 };
    fire(HOOKS.explosionFalloff, context);
    expect(context.divisorPerYard).toBe(2);
    const tnt = { flag: { source: "demolition", label: "10 lb. of TNT" }, itemUuid: null, distanceYards: 5, divisorPerYard: 3 };
    fire(HOOKS.explosionFalloff, tnt);
    expect(tnt.divisorPerYard).toBe(3);
  });
});

describe("incendiaries (p. 188)", () => {
  beforeEach(() => { on.incendiaryAgents = true; });

  const thermiteRecord = () => ({ id: "t", name: "Thermite (per pound)", type: "equipment", isOwner: true, system: { quantity: 1, extensions: {} } });

  it("burns thermite on a victim over turns, wearing the DR there down", async () => {
    const victim = actorWith("Victim");
    targets = [{ actor: victim }];
    derived.drByLocation = { torso: 6 };
    expect(actions.get("ht-thermite").visible(thermiteRecord())).toBe(true);
    dialog = { pounds: "1", on: "actor", location: "torso", structure: "custom", dr: "0", hp: "0" };
    actions.get("ht-thermite").run(thermiteRecord(), actorWith("Saboteur"));
    await flush();
    expect(victim.flags.htThermite).toEqual({ seconds: 25, damage: 0, location: "torso" });
    expect(conditions.get("Victim")?.[0]?.id).toBe(`${MODULE_ID}.ht-thermite-burning`);

    // 3d: 4+4+4 = 12 against DR 6: 6 injury; 12 damage so far takes 1 off the DR.
    dice = [4, 4, 4];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries).toEqual([{ actor: "Victim", amount: 6, label: "GCC.HT.Explosives.Thermite.Title" }]);
    expect(victim.flags.htThermite).toEqual({ seconds: 24, damage: 12, location: "torso" });
    dice = [4, 4, 4];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries[1].amount).toBe(7);
  });

  it("wears the armour it burns through for good, 1 DR in 10 points", async () => {
    const vest = { id: "v", name: "Vest", type: "armor", system: { dr: 4, drLost: 0, equipped: true, locations: ["torso"] } };
    const victim = actorWith("Victim", [vest]);
    targets = [{ actor: victim }];
    // DR 4 from the vest and 2 of the victim's own.
    derived.drByLocation = { torso: 6 };
    dialog = { pounds: "1", on: "actor", location: "torso", structure: "custom", dr: "0", hp: "0" };
    actions.get("ht-thermite").run(thermiteRecord(), actorWith("Saboteur"));
    await flush();
    dice = [4, 4, 4];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(worn).toEqual([{ item: "Vest", amount: 1, location: "torso", reason: "GCC.HT.Explosives.Thermite.Title" }]);
    expect(vest.system.drLost).toBe(1);
    expect(victim.flags.htThermite).toEqual({ seconds: 24, damage: 12, location: "torso", worn: 1 });
    // DR 5 now, the vest's lost point already out of it: 12 - 5 = 7.
    dice = [4, 4, 4];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries[1].amount).toBe(7);
    // 24 damage: the second point; the vest runs out after its 4, and the victim's own DR goes after.
    for (let i = 0; i < 4; i += 1) {
      dice = [6, 6, 6];
      fire(HOOKS.turnStart, null, { actor: victim });
      await flush();
    }
    expect(vest.system.drLost).toBe(4);
    expect(victim.flags.htThermite).toMatchObject({ damage: 96, worn: 4 });
    expect(derived.drByLocation.torso).toBe(2);
    // 96 damage has destroyed 9: the vest's 4 and the victim's own 2, so nothing stops the seventh second.
    dice = [3, 3, 3];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries.at(-1).amount).toBe(9);
  });

  it("works thermite on an object all at once", async () => {
    dialog = { pounds: "1", on: "object", location: "torso", structure: "custom", dr: "12", hp: "10" };
    dice = Array.from({ length: 75 }, () => 4);
    actions.get("ht-thermite").run(thermiteRecord(), actorWith("Saboteur"));
    await flush();
    expect(chat[0]).toContain("Thermite.Through");
  });

  it("sets napalm burning for a minute at 1d-1 against large-area DR", async () => {
    const victim = actorWith("Victim");
    const bomb = { name: "Napalm Bomb", system: {} };
    fire(HOOKS.afterDamage, { actor: victim, item: bomb, damage: { type: "burn", basicDamage: 8 }, result: { injury: 3 } });
    await flush();
    expect(victim.flags.htNapalm).toEqual({ seconds: 60 });
    derived.drByLocation = { torso: 2 };
    dice = [5];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    // 5 - 1 = 4, against large-area DR 1 (torso 2, everything else 0, averaged up).
    expect(injuries).toEqual([{ actor: "Victim", amount: 3, label: "GCC.HT.Explosives.Napalm.Title" }]);
  });
});
