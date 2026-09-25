/**
 * Electrical hazards, shock protection and power lines as the system meets
 * them (HT:EE pp. 9, 14-15, 18-19, 25): the shock hooks on the system's own
 * shocks, the GM tool's shocks, power work, the induced field, the lightning
 * rod and stolen power -- with only High-Tech's switches on (decision D1).
 * The system's shock is a stand-in that fires the two hooks as the system
 * does, and takes the injury as the formula it is handed less the DR.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { postGlare } from "../lighting/index.js";
import { arcFlashOn, contactSource, gearOn, hotStickPenalty, inducedFieldOn, lightningOn, lightningRod, readyElectricity, runsOnMains, shockOn, stolenPowerCheck, toolModes, workOn, type ShockAnswer } from "./index.js";

vi.mock("../lighting/index.js", () => ({ postGlare: vi.fn(async () => {}) }));

let hooks: Map<string, Array<(...args: any[]) => void>>;
let tools: Map<string, any>;
let actions: Map<string, any>;
let on: Record<string, boolean>;
let modifiersSeen: any[];
let damageSeen: any[];
let outcomes: any[];
let calls: any[];
let successes: any[];
let successResults: any[];
let conditions: any[];
let chat: string[];
let dice: number[];
let failures: any[];
let failureResult: any;

const fire = (name: string, context: any) => { for (const fn of hooks.get(name) ?? []) fn(context); };

/** The system's shock: the hooks, the formula as the damage, less the DR the hook leaves. */
async function systemShock(o: any): Promise<any> {
  calls.push(o);
  const context: any = {
    actor: o.actor, kind: o.kind, formula: o.formula, continuous: o.continuous, contactSeconds: o.contactSeconds ?? 0,
    modifier: o.modifier, injuryStep: 2, heartAttackMargin: o.kind === "lethal" ? 5 : null, dr: o.metalArmor ? 1 : null,
    rollOnZeroInjury: false, immune: false, lines: [],
  };
  fire("gworld.shockModifiers", context);
  modifiersSeen.push(structuredClone({ ...context, actor: undefined }));
  const rolled = Number(o.formula) || 0;
  const injury = context.immune || o.kind === "nonlethal" ? 0 : Math.max(0, rolled - (typeof context.dr === "number" ? context.dr : 0));
  if (o.kind !== "nonlethal" && !context.immune && o.formula) {
    const damage: any = { actor: o.actor, kind: o.kind, formula: o.formula, damageRoll: rolled, dr: context.dr, injury, modifier: context.modifier, rollOnZeroInjury: context.rollOnZeroInjury, lines: context.lines };
    fire("gworld.shockDamage", damage);
    damageSeen.push({ injury, modifier: damage.modifier });
  }
  const given = outcomes.shift() ?? {};
  const outcome: any = {
    kind: o.kind, immune: context.immune, injury, dr: context.dr, rolled: true, target: 10, roll: 10, success: true, criticalFailure: false,
    margin: 0, injuryModifier: 0, stunned: false, stunSeconds: 0, unconscious: false, unconsciousMinutes: 0, heartAttack: false,
    contactSeconds: o.contactSeconds ?? 0, contact: null, lines: [...context.lines], ...given,
  };
  const after = { actor: o.actor, ...outcome };
  fire("gworld.afterShock", after);
  return { ...outcome, contact: after.contact, lines: after.lines };
}

function fakeApi() {
  return {
    rules,
    combat: { hooks: { shockModifiers: "gworld.shockModifiers", shockDamage: "gworld.shockDamage", afterShock: "gworld.afterShock", equipmentFailure: "gworld.equipmentFailure" } },
    sheets: {
      registerGmTool: (t: any) => tools.set(t.key, t),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor: actor.name, ...c }); return "c1"; },
      cripple: async (actor: any, location: string, o: any) => { conditions.push({ actor: actor.name, cripple: location, ...o }); return {}; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResults.shift() ?? { success: true, margin: 0 }; },
      damage: async () => 7,
    },
    items: {
      // The system's roll: the hook, then a critical failure held to an ordinary one where a listener asks.
      equipmentFailure: async (o: any) => {
        failures.push(o);
        const context: any = { actor: o.actor, item: o.item, label: o.label, modifiers: [], downgradeCriticalFailure: false, downgradeLabel: "" };
        fire("gworld.equipmentFailure", context);
        const downgraded = failureResult?.outcome === "criticalFailure" && context.downgradeCriticalFailure;
        return downgraded ? { ...failureResult, outcome: "failure", downgraded: true, downgradeLabel: context.downgradeLabel } : { ...failureResult, downgraded: false };
      },
    },
    hazards: { shock: systemShock },
  };
}

let api: any;
const switches = () => ({ hazards: () => on.electricalHazards === true, protection: () => on.shockProtection === true, powerLines: () => on.powerLines === true, glare: () => on.lightDazzle === true });

function gear(name: string, more: Record<string, any> = {}): any {
  return { id: name.replace(/\W/g, ""), name, type: "equipment", flags: { [MODULE_ID]: { book: "high-tech" } }, system: { carried: true, ...more } };
}

const person = (name: string, items: any[] = [], more: Record<string, any> = {}) => ({
  name, uuid: `Actor.${name}`, items, attributes: { DX: 12, IQ: 11, HT: 11 }, skills: {} as Record<string, number>, ...more,
});

const answer = (more: Partial<ShockAnswer> = {}): ShockAnswer => ({
  source: "formula", volts: 0, formula: "3d", modifier: 0, current: "ac", seconds: 1,
  hands: true, handTool: false, taped: false, metal: false, torso: true, material: "none", hotStick: null, ...more,
});

beforeEach(() => {
  hooks = new Map();
  tools = new Map();
  actions = new Map();
  on = {};
  modifiersSeen = [];
  damageSeen = [];
  outcomes = [];
  calls = [];
  successes = [];
  successResults = [];
  conditions = [];
  chat = [];
  dice = [];
  failures = [];
  failureResult = { outcome: "success" };
  vi.stubGlobal("Hooks", { on: (name: string, fn: (...args: any[]) => void) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { targets: new Set() },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => null } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class {
    total = 0;
    constructor(public formula: string) {}
    async evaluate() { this.total = dice.shift() ?? 10; return this; }
  });
  api = fakeApi();
  readyElectricity(api, switches());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("offers nothing and leaves the system's shocks alone", async () => {
    expect(tools.get("ht-electricity").visible()).toBe(false);
    expect(actions.get("ht-stolen-power").visible(gear("Vacuum Cleaner", { extensions: { [MODULE_ID]: { power: { raw: "Household power", grades: ["household"] } } } }))).toBe(false);
    const suit = gear("Faraday Suit", { equipped: true });
    const outcome = await systemShock({ actor: person("Tesla", [suit]), kind: "nonlethal", modifier: -6, formula: "" });
    expect(outcome.immune).toBe(false);
    expect(modifiersSeen[0]).toMatchObject({ heartAttackMargin: null, injuryStep: 2, lines: [] });
  });
});

describe("electrical hazards (HT:EE p. 9)", () => {
  beforeEach(() => { on = { electricalHazards: true }; });

  it("offers the tool's hazard modes", () => {
    expect(tools.get("ht-electricity").visible()).toBe(true);
    expect(toolModes(switches())).toEqual(["shock", "lightning", "arcFlash"]);
  });

  it("gives AC -5 per 2 points, RF none, DC the Basic Set's", async () => {
    dice = [6, 6, 6];
    await shockOn(api, [person("A")], answer({ current: "ac" }), switches());
    await shockOn(api, [person("B")], answer({ current: "rf" }), switches());
    await shockOn(api, [person("C")], answer({ current: "dc" }), switches());
    expect(modifiersSeen.map((m) => m.injuryStep)).toEqual([2, 0, 2]);
    expect(modifiersSeen[0].lines).toContain("GCC.HT.Electricity.Step.ac");
    // AC in whole steps: the system's -1 per 2 points and -4 more, so -5 at 2-3 points, -10 at 4-5.
    expect(damageSeen[0].injury).toBeGreaterThan(1);
    expect(damageSeen[0].modifier - (modifiersSeen[0].modifier ?? 0)).toBe(-4 * Math.floor(damageSeen[0].injury / 2));
    expect(damageSeen[2].modifier).toBe(modifiersSeen[2].modifier);
    // RF drops only the penalty: the heart can still stop, as on any lethal shock.
    expect(modifiersSeen[1]).toMatchObject({ injuryStep: 0, heartAttackMargin: 5 });
    expect(modifiersSeen[2].heartAttackMargin).toBe(5);
  });

  it("holds a victim past 1 point, a second at a time, until the current is cut", async () => {
    dice = [9, 8, 7];
    outcomes = [{ unconscious: true, unconsciousMinutes: 9 }];
    const victim = person("Lineman");
    await shockOn(api, [victim], answer({ seconds: 3 }), switches());
    expect(calls.map((c) => [c.formula, c.contactSeconds])).toEqual([["9", 0], ["8", 1], ["7", 0]]);
    expect(conditions).toContainEqual(expect.objectContaining({ module: MODULE_ID, key: "ht-ee-cant-let-go", duration: { seconds: 2 } }));
    expect(conditions).toContainEqual(expect.objectContaining({ key: "unconscious", holdRecovery: { seconds: 2 + 540 } }));
  });

  it("lets go of a source that did 1 point or less", async () => {
    dice = [1];
    successResults = [{ success: false, margin: -2 }];
    await shockOn(api, [person("Ham")], answer({ seconds: 5 }), switches());
    expect(calls).toHaveLength(1);
    expect(conditions).toEqual([]);
  });

  it("jerks free of a 1-point source with a DX roll", async () => {
    dice = [1];
    successResults = [{ success: true, margin: 3 }];
    const outcome = await contactSource(api, person("Ham"), { kind: "lethal", formula: "1", volts: 45, current: "dc", modifier: 0, label: "radio" }, answer(), switches());
    expect(successes[0]).toMatchObject({ kind: "attribute", base: 12, tags: ["DX"] });
    expect(outcome.immune).toBe(true);
    expect(outcome.lines).toContain("GCC.HT.Electricity.PulledFree");
  });

  it("rolls against a weak shock that did nothing, a roll under 0 a bonus", async () => {
    dice = [-2];
    await shockOn(api, [person("Cook")], answer({ source: "formula", formula: "1d-3", current: "ac" }), switches());
    expect(calls[0].formula).toBe("0");
    expect(modifiersSeen[0]).toMatchObject({ rollOnZeroInjury: true, modifier: 2 });
  });

  it("doesn't where the current misses the torso", async () => {
    dice = [-2];
    await shockOn(api, [person("Cook")], answer({ formula: "1d-3", torso: false }), switches());
    expect(modifiersSeen[0].rollOnZeroInjury).toBe(false);
  });

  it("lets the system's own weak lethal shocks roll once their damage comes to 0 or less, a roll under 0 a bonus", () => {
    const shock = (formula: string, damageRoll: number): any => {
      const context: any = { actor: person("X"), kind: "lethal", formula, damageRoll, modifier: -1, rollOnZeroInjury: false, lines: [] };
      fire("gworld.shockModifiers", { ...context, lines: [] });
      fire("gworld.shockDamage", context);
      return context;
    };
    expect(shock("1d-3", -2)).toMatchObject({ rollOnZeroInjury: true, modifier: 1, lines: ['GCC.HT.Electricity.WeakShock {"bonus":"+2"}'] });
    expect(shock("1d-3", 0)).toMatchObject({ rollOnZeroInjury: true, modifier: -1, lines: ['GCC.HT.Electricity.WeakShock {"bonus":"+0"}'] });
    // A weak shock that did roll damage, and a strong one, are the Basic Set's.
    expect(shock("1d-3", 2)).toMatchObject({ rollOnZeroInjury: false, modifier: -1, lines: [] });
    expect(shock("3d", 0)).toMatchObject({ rollOnZeroInjury: false, lines: [] });
  });

  it("leaves the tool's own weak shocks to the tool", async () => {
    dice = [-2];
    await shockOn(api, [person("Cook")], answer({ source: "formula", formula: "1d-3", current: "ac" }), switches());
    // The tool gave +2 before the roll; the damage hook adds nothing more.
    expect(modifiersSeen[0]).toMatchObject({ rollOnZeroInjury: true, modifier: 2 });
    expect(modifiersSeen[0].lines.filter((l: string) => l.startsWith("GCC.HT.Electricity.WeakShock"))).toHaveLength(1);
  });

  it("stops the heart on a strong nonlethal shock failed by 10, or critically", async () => {
    await shockOn(api, [person("Frank")], answer({ source: "nonlethal", modifier: -5, seconds: 4 }), switches());
    expect(calls).toEqual([expect.objectContaining({ kind: "nonlethal", formula: "", continuous: false })]);
    expect(modifiersSeen[0]).toMatchObject({ heartAttackMargin: 10, heartAttackOnCritical: true });
    const weak: any = { actor: person("Y"), kind: "nonlethal", modifier: -4, heartAttackMargin: null, heartAttackOnCritical: false, lines: [] };
    fire("gworld.shockModifiers", weak);
    expect(weak).toMatchObject({ heartAttackMargin: null, heartAttackOnCritical: false });
  });

  it("leaves the system's outcome to say a critical failure stopped the heart", () => {
    const actor = person("Frank");
    fire("gworld.shockModifiers", { actor, kind: "nonlethal", modifier: -6, lines: [] });
    const after: any = { actor, kind: "nonlethal", immune: false, criticalFailure: true, heartAttack: true, injury: 0, lines: [] };
    fire("gworld.afterShock", after);
    expect(after.lines).toEqual([]);
  });

  it("holds the system's own lethal shocks past 1 point", () => {
    const after: any = { actor: person("Z"), kind: "lethal", immune: false, injury: 2, lines: [] };
    fire("gworld.afterShock", after);
    expect(after.contact).toEqual({ held: true, label: "GCC.HT.Electricity.CantLetGo" });
    const light: any = { actor: person("Z"), kind: "lethal", immune: false, injury: 1, lines: [] };
    fire("gworld.afterShock", light);
    expect(light.contact).toBeUndefined();
  });

  it("lights what is at hand with a lethal current's rolled damage, and a spark only Super-Flammable things", async () => {
    dice = [2];
    await shockOn(api, [person("A")], answer({ material: "highlyFlammable" }), switches());
    expect(modifiersSeen[0].lines.some((l: string) => l.startsWith("GCC.HT.Electricity.Ignites"))).toBe(true);
    dice = [9];
    await shockOn(api, [person("B")], answer({ source: "nonlethal", modifier: -4, material: "superFlammable" }), switches());
    expect(modifiersSeen[1].lines).toContain('GCC.HT.Electricity.SparkIgnites {"rolled":9,"target":16}');
  });

  it("burns with an arc flash, and without welder's goggles risks the eyes", async () => {
    vi.mocked(postGlare).mockClear();
    successResults = [{ success: false, criticalFailure: false, margin: -2 }, { success: false, criticalFailure: true, margin: -6 }];
    const tokens = [{ actor: person("A") }, { actor: person("B") }, { actor: person("C") }];
    await arcFlashOn(api, tokens.slice(0, 2), { material: "none", goggles: false }, switches());
    expect(conditions).toEqual([
      expect.objectContaining({ actor: "A", cripple: "eye", duration: "lasting" }),
      expect.objectContaining({ actor: "B", cripple: "eye", duration: "permanent" }),
    ]);
    await arcFlashOn(api, tokens.slice(2), { material: "none", goggles: true }, switches());
    expect(successes).toHaveLength(2);
    expect(chat.at(-1)).toContain("GCC.HT.Electricity.ArcFlash.Goggles");
    // The glare roll is the light rules', only with their switch on.
    expect(postGlare).not.toHaveBeenCalled();
    on.lightDazzle = true;
    await arcFlashOn(api, tokens.slice(2), { material: "none", goggles: true }, switches());
    expect(postGlare).toHaveBeenCalledWith(api, [{ token: tokens[2], step: expect.any(Number) }], "GCC.HT.Electricity.ArcFlash.Title");
  });

  it("strikes with lightning at -1 per 5 points, a large bolt multiplied", async () => {
    dice = [4, 30];
    await lightningOn(api, [person("Franklin")], { large: true, metal: false, material: "none" }, switches());
    expect(modifiersSeen[0].injuryStep).toBe(5);
    expect(modifiersSeen[0].lines).toContain('GCC.HT.Electricity.Rolled {"formula":"6d×4","rolled":30}');
    expect(calls).toHaveLength(1);
    expect(conditions).toEqual([]);
  });
});

describe("shock protection (HT:EE pp. 14-15, 25)", () => {
  beforeEach(() => { on = { shockProtection: true }; });

  it("reads the gear a character wears and carries", () => {
    const actor = person("Tesla", [{ ...gear("Electrical Gloves (High-End)", { equipped: true }), type: "armor" }, gear("Faraday Suit", { equipped: false }), gear("Wire Cutters"), gear("Hot Stick (Wood)")]);
    expect(gearOn(actor)).toEqual({ gloves: 75, faraday: false, handTool: true, hotStick: 220_000 });
  });

  it("insulates only the supplement's hand tools, not High-Tech's own wire cutters", () => {
    expect(gearOn(person("A", [gear("Wire Cutters", { reference: "High-Tech p. 25" })])).handTool).toBe(false);
    expect(gearOn(person("B", [gear("Wire Cutters", { reference: "High-Tech: Electricity and Electronics p. 14" })])).handTool).toBe(true);
  });

  it("makes a Faraday suit's wearer immune to any nonlethal shock", async () => {
    const outcome = await systemShock({ actor: person("Tesla", [gear("Faraday Suit", { equipped: true })]), kind: "nonlethal", modifier: -3, formula: "" });
    expect(outcome.immune).toBe(true);
    expect(outcome.lines).toEqual(["GCC.HT.Electricity.FaradayImmune"]);
  });

  it("says only that the suit's wearer is immune, with the hazards switch on too", async () => {
    on.electricalHazards = true;
    const outcome = await systemShock({ actor: person("Tesla", [gear("Faraday Suit", { equipped: true })]), kind: "nonlethal", modifier: -6, formula: "" });
    expect(outcome.lines).toEqual(["GCC.HT.Electricity.FaradayImmune"]);
    expect(modifiersSeen[0].heartAttackMargin).toBeNull();
  });

  it("adds gloves, handle and tape as DR against the tool's lethal shock", async () => {
    dice = [30];
    const victim = person("Lineman", [gear("Electrical Gloves", { equipped: true }), gear("Lineman's Pliers")]);
    await shockOn(api, [victim], answer({ source: "formula", formula: "5d", handTool: true, taped: true, metal: true }), switches());
    expect(modifiersSeen[0].dr).toBe(1 + 25 + 18 + 10);
    expect(calls).toHaveLength(1);
  });

  it("counts the handle only when the victim carries an insulated tool", async () => {
    dice = [30];
    await shockOn(api, [person("Bare")], answer({ handTool: true, hands: false }), switches());
    expect(modifiersSeen[0].dr).toBeNull();
  });

  it("gives the Faraday suit DR 20 on the system's own lethal shocks", async () => {
    const outcome = await systemShock({ actor: person("Tesla", [gear("Faraday Suit", { equipped: true })]), kind: "lethal", modifier: 0, formula: "25" });
    expect(outcome.dr).toBe(20);
    expect(outcome.injury).toBe(5);
  });

  it("leaves the step alone without the hazards switch", async () => {
    dice = [8];
    await shockOn(api, [person("A")], answer({ current: "ac" }), switches());
    expect(modifiersSeen[0].injuryStep).toBe(2);
  });

  it("carries a bolt to ground, or leaves the building half", async () => {
    dice = [20, 12];
    expect(await lightningRod(api, { rod: "tl5", large: false })).toBe(0);
    dice = [20, 15];
    expect(await lightningRod(api, { rod: "tl5", large: false })).toBe(10);
    dice = [20, 15];
    expect(await lightningRod(api, { rod: "inductive", large: false })).toBe(0);
  });

  it("lets the Hot Stick technique buy off the -2", () => {
    const worker = person("Lineman");
    expect(hotStickPenalty(api, worker)).toBe(-2);
    worker.items.push({ type: "technique", name: "Hot Stick", system: { derived: { level: 13 } } });
    worker.skills.Electrician = 14;
    expect(hotStickPenalty(api, worker)).toBe(-1);
    worker.items[0].system.derived.level = 15;
    expect(hotStickPenalty(api, worker)).toBe(0);
  });
});

describe("power lines (HT:EE pp. 18-19)", () => {
  beforeEach(() => { on = { powerLines: true }; });

  it("offers power work and the field", () => {
    expect(toolModes(switches())).toEqual(["shock", "work", "field"]);
  });

  it("shocks a worker at the line's voltage on a failure by 5", async () => {
    const worker = person("Thief");
    worker.skills.Electrician = 12;
    successResults = [{ success: false, margin: -5 }];
    dice = [4];
    await workOn(api, [worker], { tap: false, source: "household", volts: 0, current: "ac", tools: "insulated", hotStick: false, guarded: false, seconds: 1 }, switches());
    expect(successes[0]).toMatchObject({ skill: "Electrician", base: 12, modifiers: [{ label: "GCC.HT.Electricity.Work.Tools.insulated", value: -1 }] });
    expect(calls[0]).toMatchObject({ kind: "lethal", formula: "4" });
    expect(modifiersSeen[0].lines).toContain('GCC.HT.Electricity.Rolled {"formula":"1d+1","rolled":4}');
  });

  it("uses IQ-5 for a worker without Electrician, -5 for improvised tools, and hides a tap with Camouflage", async () => {
    successResults = [{ success: true, margin: 1 }, { success: false, margin: -1 }];
    await workOn(api, [person("Thief")], { tap: true, source: "householdUs", volts: 0, current: "ac", tools: "improvised", hotStick: false, guarded: false, seconds: 1 }, switches());
    expect(successes[0]).toMatchObject({ base: 6, modifiers: [{ value: -5 }] });
    expect(successes[1]).toMatchObject({ skill: "Camouflage", base: 7 });
    expect(chat[0]).toContain("GCC.HT.Electricity.Work.Visible");
    expect(calls).toEqual([]);
  });

  it("shocks on a critical failure unless the shock-protection switch's guard turns it ordinary", async () => {
    successResults = [{ success: false, criticalFailure: true, margin: -1 }];
    dice = [3];
    await workOn(api, [person("A")], { tap: false, source: "household", volts: 0, current: "ac", tools: "safe", hotStick: false, guarded: true, seconds: 1 }, switches());
    expect(calls).toHaveLength(1);
    on.shockProtection = true;
    successResults = [{ success: false, criticalFailure: true, margin: -1 }];
    await workOn(api, [person("B")], { tap: false, source: "household", volts: 0, current: "ac", tools: "safe", hotStick: false, guarded: true, seconds: 1 }, switches());
    expect(calls).toHaveLength(1);
    expect(chat.at(-1)).toContain("GCC.HT.Electricity.Work.Guarded");
  });

  it("keeps a hot stick's worker clear within its rating, at -2", async () => {
    on.shockProtection = true;
    const worker = person("Lineman", [gear("Hot Stick (Wood)")]);
    successResults = [{ success: false, margin: -6 }];
    dice = [40];
    await workOn(api, [worker], { tap: false, source: "higher", volts: 110_000, current: "ac", tools: "safe", hotStick: true, guarded: false, seconds: 1 }, switches());
    expect(successes[0].modifiers).toEqual([{ label: "GCC.HT.Electricity.Work.HotStick", value: -2 }]);
    expect(modifiersSeen[0].immune).toBe(true);
    expect(modifiersSeen[0].lines).toContain("GCC.HT.Electricity.HotStickClear");
  });

  it("numbs someone near a big line by the margin of failure, stuns on a critical failure, and spares a Faraday suit", async () => {
    successResults = [{ success: false, margin: -3, criticalFailure: true }];
    await inducedFieldOn(api, [person("Walker"), person("Tesla", [gear("Faraday Suit", { equipped: true })])]);
    expect(successes).toHaveLength(1);
    expect(conditions[0]).toMatchObject({ key: "ht-ee-induced-current", effects: { modifiers: [{ value: -3, rolls: ["skill"] }] } });
    expect(conditions[1]).toMatchObject({ key: "stunned" });
    expect(chat[1]).toContain("GCC.HT.Electricity.Field.Faraday");
  });

  it("runs the electric chair at 6d×2 AC", async () => {
    on.electricalHazards = true;
    dice = [25];
    await shockOn(api, [person("Condemned")], answer({ source: "chair", current: "dc" }), switches());
    expect(modifiersSeen[0].injuryStep).toBe(2);
    expect(modifiersSeen[0].lines).toContain('GCC.HT.Electricity.Rolled {"formula":"6d×2","rolled":25}');
  });

  it("rolls a stolen-power device's daily HT-2, a critical failure a fire", async () => {
    const vacuum = gear("Vacuum Cleaner", { extensions: { [MODULE_ID]: { power: { raw: "Household power", grades: ["household"] } } } });
    expect(runsOnMains(vacuum)).toBe(true);
    expect(runsOnMains(gear("Penlight", { extensions: { [MODULE_ID]: { power: { raw: "XS/5 hours" } } } }))).toBe(false);
    // The grades, not the text: a computer's peripheral power isn't a line to tap, and the text alone isn't read.
    expect(runsOnMains(gear("Mouse", { extensions: { [MODULE_ID]: { power: { raw: "Peripheral power", grades: ["peripheral"] } } } }))).toBe(false);
    expect(runsOnMains(gear("Car Radio", { extensions: { [MODULE_ID]: { power: { raw: "2×M/6 hours or automotive power", grades: ["automotive"] } } } }))).toBe(true);
    expect(runsOnMains(gear("Old Record", { extensions: { [MODULE_ID]: { power: { raw: "Household power" } } } }))).toBe(false);
    expect(actions.get("ht-stolen-power").visible(vacuum)).toBe(true);
    failureResult = { outcome: "criticalFailure" };
    const owner = person("Thief");
    await stolenPowerCheck(api, vacuum, owner, false);
    expect(failures[0]).toMatchObject({ item: vacuum, modifier: -2 });
    expect(chat[0]).toContain("GCC.HT.Electricity.Stolen.Fire");
    // A guard on the circuit holds the critical failure to an ordinary one before the system marks the device.
    const held = await stolenPowerCheck(api, vacuum, owner, true);
    expect(held).toMatchObject({ outcome: "failure", downgraded: true, downgradeLabel: "GCC.HT.Electricity.Stolen.Guarded" });
    expect(chat).toHaveLength(1);
    // The guard is for that roll only.
    expect(await stolenPowerCheck(api, vacuum, owner, false)).toMatchObject({ outcome: "criticalFailure", downgraded: false });
  });
});
