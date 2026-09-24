/**
 * Every High-Tech switch, turned on alone over the book's own records (#397).
 *
 * The book's rules are registered once, as the module registers them, with
 * High-Tech's book alone (decision D1: no Ultra-Tech, no Martial Arts). Then
 * each record of the book's packs is carried by a character, and each probe
 * the system would make of it is made: the sheet sections and row actions
 * shown for it, its price, its attack options and derived attacks, and the
 * hooks the system fires, handed the record. What those give back with every
 * switch off is the baseline; a switch passes when turning it on alone
 * changes what one record gets, or which GM tools and skills are offered.
 *
 * The probes are generic: a hook is handed one context carrying the fields
 * the system's hooks carry, and the answers are compared as a whole. A rule
 * that needs more than a record in a character's hands (a trait, the Aim
 * maneuver, a crippling or bleeding wound, a TL penalty on the roll) has a
 * scenario that sets that up around one record; the comparison is the same.
 * A rule of the GM's (the black market, a firefight's aftermath) or of a
 * skill (Zen Marksmanship) shows as the GM tool or skill it offers.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as systemRules from "../../../system/src/rules/index.js";
import { initBooks, readyBooks } from "../../shared/book.js";
import { MODULE_ID } from "../../shared/module.js";
import { book } from "./index.js";

const PACKS = join(import.meta.dirname, "../../../books/high-tech/packs-src");

type Doc = { _id: string; name: string; type: string; system: any };

/** Every record of the book's packs. */
function records(): Doc[] {
  const docs: Doc[] = [];
  for (const kind of readdirSync(PACKS)) {
    for (const file of readdirSync(join(PACKS, kind)).filter((f) => f.endsWith(".json"))) {
      docs.push(...(JSON.parse(readFileSync(join(PACKS, kind, file), "utf8")) as Doc[]));
    }
  }
  return docs;
}

/** The book's switches, as the Rules page lists them. */
function switches(): string[] {
  const keys: string[] = [];
  book.registerRules!({ registerRuleGroup: () => "high-tech", registerRule: (r: any) => keys.push(r.key) } as never, "high-tech");
  return keys;
}

type Arrange = (actor: any, item: any, context: any) => void;

/**
 * The rules that act only in a situation a record doesn't bring by itself:
 * the record, and what is set up around it.
 */
const SCENARIOS: Record<string, { record: string; arrange: Arrange }> = {
  // A DX-based roll made with the gear, carrying a TL penalty, by someone familiar with it (p. 11).
  tlFamiliarity: {
    record: "Velocipede",
    arrange: (actor, item, context) => {
      actor.system.familiarities = [item.name];
      actor.items.push({ id: "skill", type: "skill", name: "Bicycling", system: { attribute: "DX" } });
      Object.assign(context, { kind: "skill", skill: "Bicycling", tags: ["vehicleControl", "techLevel"], modifiers: [{ key: "techLevel", label: "TL", value: -3 }] });
    },
  },
  // A rifleman six seconds into the Aim maneuver, when the first Precision Aiming roll is due (p. 84).
  precisionAiming: {
    record: "Springfield M1873, .45-70",
    arrange: (actor) => {
      actor.system.maneuver = "aim";
      actor.system.aim = { turns: 6 };
    },
  },
  // FP lost to the cold after a roll made in light clothing (p. 63).
  frostbite: {
    record: "Summer Clothes",
    arrange: (_actor, _item, context) => {
      Object.assign(context, { tags: ["exposure", "cold"], weather: { clothing: "light" }, reason: "exposure", details: { heat: false }, fp: 2 });
    },
  },
  // A blow that cripples an arm with twice what it takes (p. 162).
  realisticLimbWounds: {
    record: "Springfield M1873, .45-70",
    arrange: (_actor, _item, context) => {
      context.actor.system.hp = { max: 10, value: -2 };
      context.result = { hitLocation: "arm", crippled: true, injury: 6, uncappedInjury: 12 };
      context.damage = { ...context.damage, type: "pi+", hitLocation: "arm" };
    },
  },
  // A bullet in the neck that bleeds (p. 162).
  vitalBleeding: {
    record: "Springfield M1873, .45-70",
    arrange: (_actor, _item, context) => {
      context.result = { hitLocation: "neck", bleeds: true, injury: 5, uncappedInjury: 5 };
      context.damage = { ...context.damage, type: "pi+", hitLocation: "neck" };
    },
  },
  // A hearing aid worn by someone hard of hearing: a Mitigator (p. 225).
  prosthetics: {
    record: "Hearing Aid",
    arrange: (actor, _item, context) => {
      const trait = { id: "hoh", type: "trait", name: "Hard of Hearing", system: {} };
      actor.items.push(trait);
      context.traits = [{ item: trait, name: trait.name, inPlay: true }];
    },
  },
  // A gunslinger's default for a gun technique (p. 249).
  gunslingerExpanded: {
    record: "Fast-Firing",
    arrange: (actor, _item, context) => {
      actor.items.push({ id: "gunslinger", type: "trait", name: "Gunslinger", system: {} });
      context.defaults = [{ from: "skill", skill: "Guns (Pistol)", modifier: -6 }];
    },
  },
};

/**
 * The switches the probes can't show, each with the test that turns it on
 * and sees it act, and why.
 */
const SHOWN_ELSEWHERE: Record<string, string> = {
  // An option on the suppressor rule: it multiplies a fitted suppressor's
  // penalty, in the Hearing roll's dialog, so it needs the suppressors switch
  // and a suppressor on the gun.
  cinematicSilencers: "accessories/index.test.ts: doubles or triples the penalty for a cinematic silencer",
  // The supplement Electricity and Electronics' antennas and shortwave are
  // options on High-Tech's radios, priced and read in the radio range tool,
  // so they need the radios switch (HT:EE pp. 28, 30).
  radioAntennas: "sensors/index.test.ts: offers and prices the dipole and directional antenna, and multiplies the link",
  shortwaveSkip: "sensors/index.test.ts: offers shortwave, and skips between shortwave sets",
  // How a radio is built: options on High-Tech's radios and the trench radio's
  // sets, so it needs the radios switch too (HT:EE pp. 28-30, 32, 34).
  radioDesign: "sensors/index.test.ts: prices the design options, reads the trench radio's sets and wire, and rolls the receivers",
};

// ── a stand-in for the system ────────────────────────────────────────────────

/** Anything at all: every property is another, every call gives undefined. */
function anything(): any {
  const target = function () {};
  return new Proxy(target, {
    get: (_t, p) => (p === "then" ? undefined : p === Symbol.toPrimitive ? () => 0 : p === Symbol.iterator ? function* () {} : anything()),
    apply: () => undefined,
  });
}

/** An object whose missing properties are `anything()`. */
function lenient<T extends object>(known: T): T {
  return new Proxy(known, { get: (t: any, p) => (p in t ? t[p] : typeof p === "symbol" || p === "then" || p === "toJSON" ? undefined : anything()) });
}

let on = new Set<string>();
const listeners = new Map<string, ((...args: any[]) => unknown)[]>();
const registered: Record<string, any[]> = {};
let log: unknown[] = [];

/** A namespace of the API: its `register*` calls are kept, its hooks named, the rest logged. */
function namespace(name: string, known: Record<string, unknown> = {}): any {
  return new Proxy(known, {
    get: (t: any, p) => {
      if (typeof p === "symbol" || p === "then") return undefined;
      if (p in t) return t[p];
      if (p === "hooks") return new Proxy({}, { get: (_h, h) => `gworld.${String(h)}` });
      if (p.startsWith("register")) {
        return (entry: any) => {
          (registered[p] ??= []).push(entry);
          return `${entry?.module}.${entry?.key}`;
        };
      }
      // Anything that acts (a roll, a card, a condition) is logged: a rule that acts has changed something.
      return (...args: unknown[]) => {
        log.push([`${name}.${p}`, ...args]);
        return undefined;
      };
    },
  });
}

const weaponState = new Map<string, unknown>();

const api: any = {
  version: "1.120.0",
  satisfies: () => true,
  registry: namespace("registry", { isRuleOn: (key: string) => on.has(key) }),
  rules: lenient({ ...systemRules }),
  roll: namespace("roll", {
    success: async (o: unknown) => { log.push(["roll.success", o]); return { success: true, margin: 2, total: 8, critical: false }; },
    damage: async (o: unknown) => { log.push(["roll.damage", o]); return { total: 5 }; },
  }),
  actors: namespace("actors", {
    attribute: () => 10,
    skillLevel: () => 12,
    derived: () => ({ traitEffects: {}, move: 5, basicMove: 5, basicSpeed: 5, basicLift: 20, drByLocation: { torso: 0 }, encumbrance: { level: 0 } }),
    conditions: () => [],
    activePoisons: () => [],
    crippled: () => [],
    encumbrance: () => ({ level: 0, move: 5 }),
    basicLift: () => 20,
    defenses: () => ({ dodge: 8, parry: 8, block: 8 }),
  }),
  items: namespace("items", { derived: () => ({}), malfunction: () => null, objectStats: () => ({ dr: 4, hp: 10 }) }),
  combat: namespace("combat", {
    getWeaponState: (item: any, key: string) => weaponState.get(`${item?.id}.${key}`),
    setWeaponState: async (item: any, key: string, value: unknown) => { weaponState.set(`${item?.id}.${key}`, value); },
    getCombatState: () => undefined,
  }),
  data: namespace("data"),
  sheets: namespace("sheets"),
  chat: namespace("chat"),
  areas: namespace("areas", { list: () => [], standsIn: () => [] }),
  hazards: namespace("hazards"),
  world: namespace("world", { controlRating: () => ({ rating: 0, inPlay: false }) }),
  points: namespace("points"),
  magic: namespace("magic"),
  party: namespace("party", { of: () => null }),
};

function stubFoundry(): void {
  const field = class {
    options: unknown[];
    constructor(...options: unknown[]) { this.options = options; }
  };
  const on = (name: string, fn: (...args: any[]) => unknown) => { listeners.set(name, [...(listeners.get(name) ?? []), fn]); return 1; };
  vi.stubGlobal("Hooks", { on, once: on, off: () => {}, callAll: () => true, call: () => true });
  vi.stubGlobal("game", lenient({
    i18n: { localize: (k: string) => k, format: (k: string, d: unknown) => `${k} ${JSON.stringify(d)}`, has: () => true, lang: "en" },
    user: { isGM: true, id: "gm", name: "Gamemaster", targets: new Set() },
    users: [],
    time: { worldTime: 0 },
    settings: { get: () => undefined, register: () => {}, set: async () => {} },
    gworld: { api },
    actors: [],
    combat: null,
    packs: [],
    modules: new Map(),
    system: { id: "gworld" },
  }));
  vi.stubGlobal("foundry", lenient({
    data: { fields: new Proxy({}, { get: () => field }) },
    utils: lenient({
      escapeHTML: (s: string) => s,
      deepClone: (o: unknown) => structuredClone(o),
      duplicate: (o: unknown) => structuredClone(o),
      getProperty: (o: any, path: string) => path.split(".").reduce((n, k) => n?.[k], o),
      setProperty: () => true,
      mergeObject: (a: any, b: any) => ({ ...a, ...b }),
      randomID: () => "random",
    }),
    applications: anything(),
  }));
  // A chat message is something a rule did.
  const chat = lenient({ getSpeaker: () => ({}), create: async (m: any) => { log.push(["ChatMessage.create", m?.content]); return {}; } });
  vi.stubGlobal("ChatMessage", lenient({ implementation: chat, getSpeaker: () => ({}), create: chat.create }));
  vi.stubGlobal("ui", anything());
  vi.stubGlobal("CONFIG", lenient({ Dice: lenient({ randomUniform: () => 0.5 }) }));
  vi.stubGlobal("canvas", anything());
}

// ── a record in a character's hands ──────────────────────────────────────────

class Items extends Array<any> {
  get(id: string) { return this.find((i) => i.id === id); }
  get contents() { return [...this]; }
  get size() { return this.length; }
}

function character(id: string): any {
  const flags: Record<string, Record<string, unknown>> = {};
  return {
    id,
    uuid: `Actor.${id}`,
    name: id,
    type: "character",
    isOwner: true,
    statuses: new Set<string>(),
    effects: [],
    items: new Items(),
    system: { posture: "standing", hp: { max: 10, value: 10 }, fp: { max: 10, value: 10 }, tl: 8 },
    flags,
    getFlag: (scope: string, key: string) => flags[scope]?.[key],
    setFlag: async (scope: string, key: string, value: unknown) => { (flags[scope] ??= {})[key] = value; },
    unsetFlag: async (scope: string, key: string) => { delete flags[scope]?.[key]; },
    update: async () => {},
    getActiveTokens: () => [],
  };
}

function carry(doc: Doc): { actor: any; item: any } {
  const flags: Record<string, Record<string, unknown>> = { [MODULE_ID]: { book: "high-tech" } };
  const system = structuredClone(doc.system ?? {});
  system.extensions = { [MODULE_ID]: system.extensions?.[MODULE_ID] ?? {} };
  system.equipped = true;
  system.carried = true;
  const actor = character("carrier");
  const item: any = {
    ...structuredClone(doc),
    id: doc._id,
    uuid: `Actor.carrier.Item.${doc._id}`,
    system,
    flags,
    parent: actor,
    actor,
    isOwner: true,
    getFlag: (scope: string, key: string) => flags[scope]?.[key],
    setFlag: async () => {},
    unsetFlag: async () => {},
    update: async () => {},
  };
  actor.items.push(item);
  return { actor, item };
}

/** The attack rows the system would hand `gworld.weaponAttacks` for the record. */
function attackRows(item: any): any[] {
  const kinds = [["melee", item.system?.meleeModes], ["ranged", item.system?.rangedModes]] as const;
  return kinds.flatMap(([kind, modes]) => (Array.isArray(modes) ? modes : []).map((mode: any, index: number) => ({
    kind,
    modeIndex: index,
    mode,
    row: { ...mode, skillLevel: 12, damage: mode.damageFormula ?? "" },
    basis: { st: 10, damage: mode.damageFormula ?? "", damageType: mode.damageType, armorDivisor: mode.armorDivisor, halfDamageRange: mode.halfDamageRange, maxRange: mode.maxRange, minRange: mode.minRange, accuracy: mode.accuracy, malfunction: mode.malfunction },
  })));
}

/** One context with the fields the system's hooks carry, around the record: the carrier's roll, a blow to a foe. */
function context(actor: any, item: any): any {
  const rows = attackRows(item);
  const first = rows[0];
  const skill = String(first?.mode?.skill ?? item.system?.forSkills?.[0] ?? item.name ?? "");
  const foe = character("foe");
  return {
    actor, item, weapon: item, attacker: actor, target: foe, defender: foe, observer: actor, subject: foe, healer: actor, patient: foe,
    rows, attacks: rows, row: first?.row, mode: first?.mode, modeIndex: 0, ranged: first?.kind === "ranged", kind: first?.kind ?? "skill", rollType: "attack",
    damageAt: () => "", rangeAt: () => 0, addToDamage: () => "",
    tags: [], attackTags: [], modifiers: [], lines: [], notes: [], sources: [], defaults: [], refusal: null,
    skill, name: skill, difficulty: "A", attribute: "DX", level: 12, effective: 12, margin: 2, success: true, roll: 8,
    shots: 1, chosen: 1, maneuver: "attack", rangeYards: 10, distanceYards: 10,
    damage: { type: first?.mode?.damageType ?? "cr", basicDamage: 10, source: "", hitLocation: "torso" },
    // A serious wound to the torso.
    result: { hitLocation: "torso", injury: 5, penetrating: 5, uncappedInjury: 5 },
    location: "torso", hitLocation: "torso",
    move: 5, lc: item.system?.lc ?? 4, hp: 10, dr: 5,
    effects: { noShock: false, unfazeable: false, knockdown: 0, shockMultiplier: 1, attributes: { ST: 0, DX: 0, IQ: 0, HT: 0 } },
    sense: "vision", intervalSeconds: 30, modifier: 0,
  };
}

// ── what the system would see ────────────────────────────────────────────────

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

/** A JSON picture of a value, with the characters and record named rather than drawn. */
function picture(value: unknown, item: any): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "function") return "[fn]";
    if (v === item) return "[item]";
    if (v && typeof v === "object" && typeof v.uuid === "string" && v.uuid.startsWith("Actor.") && v !== value) return `[${v.uuid}]`;
    if (v instanceof Set) return [...v];
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[seen]";
      seen.add(v);
    }
    return v;
  }) ?? "";
}

async function attempt(f: () => unknown): Promise<unknown> {
  try {
    return await f();
  } catch (error) {
    return `threw ${(error as Error)?.message}`;
  }
}

/** Where a hook's context differs from the rest: an affliction's effects are a list. */
const HOOK_CONTEXT: Record<string, Record<string, unknown>> = {
  "gworld.afflictionEffect": { effects: [], margin: -3, label: "resisted" },
};

/** Foundry's own hooks, which want a document change rather than a context. */
const FOUNDRY_HOOKS = new Set(["updateActor", "preUpdateItem", "updateItem", "updateWorldTime", "renderCompendiumPicker", "init"]);

/**
 * Everything the system would get from the rules for one record, as text:
 * with `hooks` false, only what the sheet draws, which is quicker to ask.
 */
async function probe(doc: Doc, arrange?: Arrange, hooks = true): Promise<Record<string, string>> {
  log = [];
  weaponState.clear();
  const { actor, item } = carry(doc);
  const fresh = () => {
    const ctx = context(actor, item);
    arrange?.(actor, item, ctx);
    return ctx;
  };
  arrange?.(actor, item, context(actor, item));
  const out: Record<string, unknown> = {};
  for (const s of registered.registerSheetSection ?? []) {
    const target = s.sheet === "item" ? item : actor;
    const visible = await attempt(() => (s.visible ? s.visible(target) : true));
    out[`section ${s.key}`] = visible ? [visible, await attempt(() => s.context?.(target, {}))] : visible;
  }
  for (const a of registered.registerRowAction ?? []) {
    if (Array.isArray(a.itemTypes) && !a.itemTypes.includes(doc.type)) continue;
    out[`action ${a.key}`] = await attempt(() => (a.visible ? a.visible(item, actor) : true));
  }
  for (const m of registered.registerPriceModifier ?? []) {
    if (Array.isArray(m.types) && !m.types.includes(doc.type)) continue;
    out[`price ${m.key}`] = await attempt(() => m.apply(item, { cost: Number(item.system?.cost) || 0, weight: Number(item.system?.weight) || 0 }));
  }
  for (const d of registered.registerDerivedAttackMode ?? []) {
    const applies = await attempt(() => d.applies(item, actor));
    const helpers = { skillLevel: () => 12, rows: () => ({ melee: [], ranged: [] }), damage: () => "1d", basicLift: 20, attribute: () => 10 };
    out[`derived ${d.key}`] = applies === true ? await attempt(() => d.mode(item, actor, helpers)) : applies;
  }
  for (const o of registered.registerAttackOption ?? []) {
    const ctx = fresh();
    const available = await attempt(() => (o.available ? o.available(ctx) : true));
    out[`option ${o.key}`] = available === true ? [true, await attempt(() => o.apply?.(ctx, true))] : available;
  }
  const pictured = new Map<string, string>();
  const before = (hook: string) => {
    const key = HOOK_CONTEXT[hook] ? hook : "";
    if (!pictured.has(key)) pictured.set(key, picture(Object.assign(fresh(), HOOK_CONTEXT[hook]), item));
    return pictured.get(key)!;
  };
  for (const [hook, fns] of hooks ? listeners : []) {
    if (FOUNDRY_HOOKS.has(hook) || hook.startsWith("gworld.ready") || hook === "gworld.registerRules") continue;
    const ctx = Object.assign(fresh(), HOOK_CONTEXT[hook]);
    const results: unknown[] = [];
    for (const fn of fns) results.push(await attempt(() => fn(ctx)));
    await flush();
    const after = picture(ctx, item);
    out[`hook ${hook}`] = [after === before(hook) ? "same" : after, results.filter((r) => r !== undefined)];
  }
  out.log = log;
  out.carrier = [actor.system, actor.flags];
  const text: Record<string, string> = {};
  for (const [k, v] of Object.entries(out)) text[k] = picture(v, item);
  return text;
}

/** What the table offers whatever is in anyone's hands: GM tools, and zen skills and the like. */
async function offered(): Promise<string[]> {
  const shown: string[] = [];
  for (const [kind, entries] of Object.entries(registered)) {
    if (!["registerGmTool", "registerZenSkill", "registerHitLocation", "registerPoison", "registerTechniqueKind"].includes(kind)) continue;
    for (const e of entries) {
      const check = e.visible ?? e.available;
      if (!check || (await attempt(() => check())) === true) shown.push(`${kind} ${e.key}`);
    }
  }
  return shown;
}

/** What changed between two probes, by what the system asked. */
function changes(was: Record<string, string>, now: Record<string, string>): string[] {
  return Object.keys({ ...was, ...now }).filter((k) => was[k] !== now[k]);
}

// ── the check ────────────────────────────────────────────────────────────────

describe("each High-Tech switch, on alone over the book's records (#397)", () => {
  const docs = records();
  const byName = (name: string) => {
    const doc = docs.find((d) => d.name === name);
    if (!doc) throw new Error(`no High-Tech record ${name}`);
    return doc;
  };
  const baselines = [new Map<string, Record<string, string>>(), new Map<string, Record<string, string>>()];
  let baseOffered: string[] = [];
  const found = new Map<string, string>();
  const offers = new Map<string, string>();

  /** A record's probe with every switch off, kept. */
  const base = async (doc: Doc, hooks: boolean) => {
    const kept = baselines[hooks ? 1 : 0]!;
    if (!kept.has(doc._id)) {
      on = new Set();
      kept.set(doc._id, await probe(doc, undefined, hooks));
    }
    return kept.get(doc._id)!;
  };

  beforeAll(() => {
    stubFoundry();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    initBooks([book], api);
    readyBooks([book], api);
  });

  afterAll(() => {
    if (process.env.GCC_SWITCH_REPORT) {
      for (const key of switches()) console.info(`${key}\t${found.get(key) ?? (SHOWN_ELSEWHERE[key] ? `elsewhere: ${SHOWN_ELSEWHERE[key]}` : "no record")}\t${offers.get(key) ?? ""}`);
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads the book's records and its switches, and nothing else registers", async () => {
    expect(docs.length).toBeGreaterThan(1400);
    expect(switches()).toHaveLength(139);
    on = new Set();
    baseOffered = await offered();
  });

  it.each(switches())("%s", async (key) => {
    const own = `${MODULE_ID}.${key}`;
    try {
      const scenario = SCENARIOS[key];
      if (scenario) {
        const doc = byName(scenario.record);
        on = new Set();
        const was = await probe(doc, scenario.arrange);
        on = new Set([own]);
        const changed = changes(was, await probe(doc, scenario.arrange));
        if (changed.length) found.set(key, `${doc.name} (scenario): ${changed.join(", ")}`);
      } else if (!SHOWN_ELSEWHERE[key]) {
        on = new Set([own]);
        const shown = (await offered()).filter((t) => !baseOffered.includes(t));
        if (shown.length) offers.set(key, shown.join(", "));
        // The sheet first, over every record; the hooks only where the sheet shows nothing.
        for (const hooks of [false, true]) {
          for (let i = 0; i < docs.length && !found.has(key); i += 1) {
            const doc = docs[i]!;
            const was = await base(doc, hooks);
            on = new Set([own]);
            const now = await probe(doc, undefined, hooks);
            const changed = changes(was, now);
            if (changed.length) found.set(key, `${doc.name}: ${changed.join(", ")}`);
            // A rule that throws on one of the book's own records is a fault, not a change.
            const threw = changed.filter((k) => now[k]!.includes("threw "));
            expect(threw.map((k) => `${doc.name}: ${k} ${now[k]}`)).toEqual([]);
            // Let the test runner breathe on a long search.
            if (i % 100 === 99) await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }
    } finally {
      on = new Set();
    }
    if (SHOWN_ELSEWHERE[key]) return;
    expect(found.get(key) ?? offers.get(key), `${key} changes nothing on any High-Tech record`).toBeTruthy();
  }, 120_000);
});
