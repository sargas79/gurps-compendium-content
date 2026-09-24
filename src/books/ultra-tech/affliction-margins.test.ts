/**
 * Ultra-Tech's afflictions at the table, timed by "the margin of failure"
 * (pp. 121-125, 157-161, 205): each listener reads the margin by its size,
 * so a failure by 4 handed over as -4 lasts as long as one handed over as 4
 * (#539). The system's rolls report the size; its own tests pass it signed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../shared/module.js";
import { readyAgents } from "./agents/index.js";
import { readyBeams } from "./beams/index.js";
import { readyNeuralSonic } from "./beams/neural-sonic.js";
import { readyCybernetics } from "./cyber/index.js";
import { readyMedical } from "./medical/index.js";
import { readyMelee } from "./melee/index.js";
import { readyWarheads } from "./warheads/index.js";

type Listener = (...args: any[]) => unknown;

let hooks: Map<string, Listener[]>;
let weaponState: Record<string, unknown>;
let applied: Array<{ actor: string; key: string; seconds: number | null }>;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));

/** An API that answers anything: hooks by their names, a handful of calls the listeners read, and nothing else. */
function fakeApi(): any {
  const calls: Record<string, (...args: any[]) => unknown> = {
    "actors.attribute": () => 10,
    "actors.derived": () => ({ traitEffects: {} }),
    "actors.applyCondition": (actor: any, effect: any) => {
      applied.push({ actor: String(actor?.name ?? ""), key: String(effect?.key ?? ""), seconds: effect?.duration?.seconds ?? null });
      return Promise.resolve(effect?.key ?? null);
    },
    "combat.getWeaponState": () => weaponState,
  };
  const make = (path: string): any =>
    new Proxy(function () {}, {
      get(_target, prop) {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (path === "combat.hooks") return `gworld.${prop}`;
        return make(path ? `${path}.${prop}` : prop);
      },
      apply(_target, _this, args) {
        return calls[path]?.(...args);
      },
    });
  return make("");
}

const on = () => true;
const switches: any = new Proxy({}, { get: () => on });

const person = (name: string, traits: string[] = [], extra: Record<string, unknown> = {}) => ({
  name,
  isOwner: false,
  system: { derived: { traitEffects: {} } },
  items: traits.map((t) => ({ type: "trait", name: t, system: {} })),
  ...extra,
});

/** The effects an afflictionEffect listener pushes for a failure handed over with this margin. */
function effectsFor(item: any, margin: number, actor: any = person("Victim"), mode: any = null): any[] {
  const context = { actor, attacker: null, item, mode, label: "", margin, effects: [] as any[] };
  fire("gworld.afflictionEffect", context);
  return context.effects;
}

/** The same failure by its size and signed gives the same effects, which are these. */
function bothWays(item: any, by: number, actor?: any, mode?: any): any[] {
  const signed = effectsFor(item, -by, actor, mode);
  expect(effectsFor(item, by, actor, mode)).toEqual(signed);
  return signed;
}

const equipment = (name: string, extensions: Record<string, unknown> = {}, system: Record<string, unknown> = {}) => ({
  name,
  type: "equipment",
  system: { extensions: { [MODULE_ID]: extensions }, ...system },
});

beforeEach(() => {
  hooks = new Map();
  weaponState = {};
  applied = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    user: { id: "gm", isGM: true },
    time: { worldTime: 1000 },
    actors: [],
    settings: { get: () => undefined },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async () => undefined } });
});

describe("beams (Ultra-Tech pp. 119-121)", () => {
  beforeEach(() => readyBeams(fakeApi(), on));

  it("knocks out for minutes equal to the margin of failure: an omni-blaster, and a microwave disruptor against the Electrical", () => {
    expect(bothWays(equipment("Omni-Blaster Pistol"), 4)).toEqual([{ key: "unconscious", duration: { seconds: 240 } }]);
    expect(bothWays(equipment("Tactical Disruptor"), 3, person("Robot", ["Electrical"]))).toEqual([{ key: "unconscious", duration: { seconds: 180 } }]);
  });

  it("stops a heart on an electrolaser's kill setting only on a failure by 5 or more", () => {
    weaponState = { kill: true };
    expect(bothWays(equipment("Electrolaser Pistol"), 4)).toEqual([{ key: "stunned" }]);
    expect(bothWays(equipment("Electrolaser Pistol"), 5)).toEqual([{ key: "stunned" }, { key: "heartAttack" }]);
  });
});

describe("neural and sonic beams (Ultra-Tech pp. 121-125)", () => {
  beforeEach(() => readyNeuralSonic(fakeApi(), on));

  it("afflicts for minutes equal to the margin of failure, and adds the worse outcome only by 5 or more", () => {
    const paralysis = equipment("Neural Disruptor Pistol", { beamSetting: { built: ["paralysis"], setting: "paralysis" } });
    expect(bothWays(paralysis, 3)).toEqual([{ key: "paralysis", duration: { seconds: 180 } }]);
    const agony = equipment("Neural Disruptor Pistol", { beamSetting: { built: ["agony"], setting: "agony" } });
    expect(bothWays(agony, 4)).toEqual([{ key: "agony", duration: { seconds: 240 } }]);
    expect(bothWays(agony, 5)).toEqual([{ key: "agony", duration: { seconds: 300 } }, { key: "heartAttack" }]);
    expect(bothWays(equipment("Nauseator Pistol"), 6)).toEqual([
      { key: "moderatePain", duration: { seconds: 360 } },
      { key: "retching", duration: { seconds: 360 } },
    ]);
    expect(bothWays(equipment("Sonic Stunner"), 2)).toEqual([{ key: "unconscious", duration: { seconds: 120 } }]);
  });

  it("knocks out on a hypnogogic beam only by 5 or more", () => {
    const mind = (by: number) => bothWays(equipment("Mind Disruptor Pistol", { beamSetting: { built: ["hypnogogic"], setting: "hypnogogic" } }), by);
    expect(mind(4)).toEqual([{ key: "daze", duration: { seconds: 240 } }]);
    expect(mind(5)).toEqual([{ key: "unconscious", duration: { seconds: 300 } }]);
  });
});

describe("a neurolash (Ultra-Tech p. 165)", () => {
  beforeEach(() => readyMelee(fakeApi(), switches));

  it("afflicts for minutes equal to the margin of failure, with a heart attack by 5 or more on agony", () => {
    const lash = equipment("Neurolash", { melee: { settings: ["agony"], setting: "agony" } });
    expect(bothWays(lash, 2)).toEqual([{ key: "agony", duration: { seconds: 120 } }]);
    expect(bothWays(lash, 7)).toEqual([{ key: "agony", duration: { seconds: 420 } }, { key: "heartAttack" }]);
  });
});

describe("energy warheads (Ultra-Tech pp. 157-159)", () => {
  beforeEach(() => readyWarheads(fakeApi(), on));

  const launcher = (kind: string) => equipment("Test Launcher", { utLoads: [{ mode: 0, kind, variant: "" }] }, { rangedModes: [{}] });
  const mode = { index: 0, ranged: true };

  it("stuns for seconds equal to a strobe's margin of failure, with a seizure for as many minutes only by 5 or more", () => {
    expect(bothWays(launcher("strobe"), 3, person("Victim"), mode)).toEqual([{ key: "stunned", duration: { seconds: 3 } }]);
    expect(bothWays(launcher("strobe"), 6, person("Victim"), mode)).toEqual([
      { key: "stunned", duration: { seconds: 6 } },
      { key: "seizure", duration: { seconds: 360 } },
    ]);
  });

  it("pains for minutes equal to a warbler's margin of failure", () => {
    expect(bothWays(launcher("warbler"), 4, person("Victim"), mode)).toEqual([{ key: "moderatePain", duration: { seconds: 240 } }]);
  });

  it("knocks a robot out for seconds equal to an EMP's margin of failure", () => {
    expect(bothWays(launcher("emp"), 7, person("Robot", ["Electrical", "Machine"]), mode)).toEqual([{ key: "unconscious", duration: { seconds: 7 } }]);
  });
});

describe("electrical implants after a surge (Ultra-Tech pp. 121, 157, 208; Characters p. 134)", () => {
  beforeEach(() => readyCybernetics(fakeApi(), on));

  const cyborg = (flags: any[]) => ({
    name: "Cyborg",
    isOwner: true,
    getFlag: () => undefined,
    setFlag: (_scope: string, _key: string, value: any) => void flags.push(value),
    items: [{ type: "trait", name: "Bionic Hand", system: { modifiers: [{ name: "Temporary Disadvantage, Electrical" }] } }],
  });

  it("keeps them out of play for minutes equal to a microwave disruptor's margin of failure", () => {
    const flags: any[] = [];
    effectsFor(equipment("Tactical Disruptor"), -4, cyborg(flags));
    effectsFor(equipment("Tactical Disruptor"), 4, cyborg(flags));
    expect(flags.map((f) => f.surgeUntil)).toEqual([1000 + 240, 1000 + 240]);
  });

  it("keeps them out of play for seconds equal to an EMP warhead's margin of failure", () => {
    const flags: any[] = [];
    const launcher = equipment("Test Launcher", { utLoads: [{ mode: 0, kind: "emp", variant: "" }] }, { rangedModes: [{}] });
    effectsFor(launcher, -4, cyborg(flags), { index: 0, ranged: true });
    effectsFor(launcher, 4, cyborg(flags), { index: 0, ranged: true });
    expect(flags.map((f) => f.surgeUntil)).toEqual([1000 + 4, 1000 + 4]);
  });
});

describe("agents and drugs a HT roll resists (Ultra-Tech pp. 160, 205)", () => {
  const cycle = (source: string, margin: number) => fire("gworld.poisonCycle", {
    actor: { name: "Victim", isOwner: true, items: [] },
    source: `${MODULE_ID}.${source}`,
    resisted: false,
    margin,
    criticalFailure: false,
  });

  it("puts a sleep gas victim out for minutes equal to the margin of failure", () => {
    readyAgents(fakeApi(), switches);
    cycle("sleepGas", -3);
    cycle("sleepGas", 3);
    expect(applied).toEqual([
      { actor: "Victim", key: "unconscious", seconds: 180 },
      { actor: "Victim", key: "unconscious", seconds: 180 },
    ]);
  });

  it("puts a morphazine patient to sleep for eight hours a point of the margin of failure", () => {
    readyMedical(fakeApi(), switches);
    cycle("morphazine", -2);
    cycle("morphazine", 2);
    expect(applied).toEqual([
      { actor: "Victim", key: "unconscious", seconds: 16 * 3600 },
      { actor: "Victim", key: "unconscious", seconds: 16 * 3600 },
    ]);
  });
});
