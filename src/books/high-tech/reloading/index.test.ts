/**
 * Reloading as the system meets it: the Shots entry `gworld.shotsEntry` hands
 * the Reload button, timed as the system times it (`rules.reloadTimeWith`);
 * a careful load and its +1 Acc; fouling counted from `gworld.afterShots` --
 * with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { carefullyLoaded, foulingShots, readyReloading } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  shotsEntry: "gworld.shotsEntry",
  afterShots: "gworld.afterShots",
};

let hooks: Map<string, Listener[]>;
let sections: any[];
let chat: string[];
let on: Record<string, boolean>;
let fastDrawAmmo: number | null;
let skills: Record<string, number>;
let vehicles: any[];

function fakeApi() {
  return {
    rules: { ...rules, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS },
    sheets: { registerSheetSection: (s: any) => sections.push(s) },
    actors: { skillLevel: (_a: any, skill: string) => (skill === "Fast-Draw (Ammo)" ? fastDrawAmmo : skills[skill] ?? null) },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function getPath(target: any, path: string): unknown {
  return path.split(".").reduce((node, key) => node?.[key], target);
}

/** A gun as the pack has it, held by a character with these items and posture. */
function gun(patch: { name?: string; skill?: string; shots?: string; rof?: number; tl?: string; loaded?: number; firearm?: Record<string, unknown>; items?: any[]; posture?: string; mounted?: boolean } = {}): any {
  const actor = { name: "Shooter", uuid: "Actor.shooter", system: { posture: patch.posture ?? "standing", mounted: patch.mounted === true }, items: patch.items ?? [] };
  const item: any = {
    id: "g1",
    name: patch.name ?? "S&W Model 10 M&P, .38 Special",
    type: "equipment",
    isOwner: true,
    actor,
    flags: {},
    system: {
      tl: patch.tl ?? "6",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{ skill: patch.skill ?? "Guns (Pistol)", accuracy: 2, malfunction: 16, rateOfFire: patch.rof ?? 3, shots: patch.shots ?? "6(3i)", loaded: patch.loaded ?? 0 }],
      extensions: { [MODULE_ID]: { firearm: { ...patch.firearm } } },
    },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

/** The Shots entry the Reload button reads. */
function entryOf(item: any): any {
  const mode = item.system.rangedModes[0];
  return fire(HOOKS.shotsEntry, { actor: item.actor, item, modeIndex: 0, mode, entry: { ...rules.parseShots(mode.shots) } }).entry;
}

/** A reload timed as the system times it, with these aids ticked, for the rounds missing (or `asked` of them). */
function reload(item: any, aids: string[] = [], fastDraw = false, asked?: number): number | null {
  const entry = entryOf(item);
  const mode = item.system.rangedModes[0];
  const full = rules.fullLoad(entry);
  const rounds = asked ?? full - (Number(mode.loaded) || 0);
  const seconds = rules.reloadTime(entry, rounds);
  const ticked = entry.aids.filter((a: any) => aids.some((id) => a.id === `${MODULE_ID}.${id}`));
  return rules.reloadTimeWith({ entry, seconds, rounds, aids: ticked, fastDraw }).seconds;
}

function row(item: any): any {
  const mode = item.system.rangedModes[0];
  const context = fire(HOOKS.weaponAttacks, { item, rows: [{ kind: "ranged", mode, basis: { accuracy: 2, malfunction: 16 }, row: { accuracy: 2, malfunction: 16, notes: [] } }] });
  return context.rows[0].row;
}

const flush = async () => { for (let i = 0; i < 3; i += 1) await Promise.resolve(); };

async function shoot(item: any, fired: number): Promise<void> {
  fire(HOOKS.afterShots, { actor: item.actor, item, modeIndex: 0, shots: fired, fired, extra: 0, wasted: 0, kind: fired > 1 ? "rapidFire" : "single" });
  await flush();
}

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyReloading(fakeApi() as never, { loading: rule("firearmLoading"), careful: rule("carefulLoading"), fouling: rule("blackPowderFouling") });
}

const doubleLoading = (level: number) => ({ type: "technique", name: "Double-Loading (Fast-Draw (Ammo))", system: { prerequisite: "Fast-Draw (Ammo)", derived: { level } } });

beforeEach(() => {
  hooks = new Map();
  sections = [];
  chat = [];
  on = { firearmLoading: true };
  fastDrawAmmo = 14;
  skills = {};
  vehicles = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { actors: { get contents() { return vehicles; } }, i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, getProperty: getPath, setProperty: setPath } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reloading by how the gun loads (High-Tech pp. 86-88)", () => {
  it("leaves the table alone with the switch off", () => {
    on = {};
    ready();
    expect(entryOf(gun())).toMatchObject({ reloadSeconds: 3, perShot: true, aids: [] });
  });

  it("reloads a swing-out revolver in 15 seconds, 9 with Fast-Draw, and 6 or 4 with a speedloader", () => {
    ready();
    const model10 = gun();
    // A round at a time: 3 seconds and 2 a round, Fast-Draw saving 1 a round.
    expect(entryOf(model10)).toMatchObject({ reloadSeconds: 3, perRoundSeconds: 2, perShot: false, fastDrawSeconds: 1, fastDrawPer: "round" });
    expect(rules.loadsByTheRound(entryOf(model10))).toBe(true);
    expect(reload(model10)).toBe(15);
    expect(reload(model10, [], true)).toBe(9);
    const loaded = gun({ items: [{ name: "Speedloader" }] });
    expect(reload(loaded, ["speedloader"])).toBe(6);
    expect(reload(loaded, ["speedloader"], true)).toBe(4);
  });

  it("times the rounds that are missing, or as many as the Reload button is asked to load", () => {
    ready();
    // Three fired: swing out, eject, three rounds in, close.
    expect(reload(gun({ loaded: 3 }))).toBe(9);
    // Two of them put back: 7 seconds, 5 with Fast-Draw.
    expect(reload(gun({ loaded: 3 }), [], false, 2)).toBe(7);
    expect(reload(gun({ loaded: 3 }), [], true, 2)).toBe(5);
  });

  it("offers the speedloader only to a character who carries one", () => {
    ready();
    expect(entryOf(gun()).aids).toEqual([]);
  });

  it("ticks the speedloader for a character who carries one", () => {
    ready();
    const aid = entryOf(gun({ items: [{ name: "Speedloader" }] })).aids.find((a: any) => a.id.endsWith("speedloader"));
    expect(aid).toMatchObject({ checked: true, seconds: -9, fastDrawSeconds: 2 });
  });

  it("rolls Double-Loading at its own level in place of Fast-Draw (Ammo): 6 seconds, and not with a speedloader", () => {
    ready();
    // Below Fast-Draw (Ammo)'s level too: the roll is the technique's.
    expect(entryOf(gun({ items: [doubleLoading(12)] })).fastDrawRoll).toEqual({ level: 12, label: "Double-Loading (Fast-Draw (Ammo))" });
    const model10 = gun({ items: [doubleLoading(14)] });
    expect(entryOf(model10)).toMatchObject({ reloadSeconds: 15, fastDrawSeconds: 9, fastDrawPer: "reload" });
    expect(reload(model10, [], true)).toBe(6);
    // Without the success, nothing.
    expect(reload(model10)).toBe(15);
    const loader = gun({ items: [doubleLoading(14), { name: "Speedloader" }] });
    expect(reload(loader, ["speedloader"], true)).toBe(4);
    // A gun it can't help rolls Fast-Draw (Ammo) as usual.
    expect(entryOf(gun({ name: "Glock 17, 9x19mm", shots: "17+1(3)", tl: "8", items: [doubleLoading(14)] })).fastDrawRoll).toBeNull();
  });

  it("reloads a gate-loading six-shooter as its record says: 20 seconds, 14 with Fast-Draw, 8 Double-Loading", () => {
    ready();
    const colt = (items: any[] = []) => gun({ name: "Colt M1873 SAA, .45 Long Colt", shots: "6(5i)", rof: 1, tl: "5", firearm: { loadingType: "gate" }, items });
    expect(reload(colt())).toBe(20);
    expect(reload(colt(), [], true)).toBe(14);
    expect(reload(colt([doubleLoading(14)]), [], true)).toBe(8);
    expect(entryOf(colt([{ name: "Speedloader" }])).aids.some((a: any) => a.id.endsWith("speedloader"))).toBe(false);
  });

  it("loads a pump shotgun's tube in 10 seconds, 8 with Fast-Draw", () => {
    ready();
    const remington = gun({ name: "Remington Model 870, 12G 2.75''", skill: "Guns (Shotgun)", shots: "5+1(2i)", rof: 2, tl: "7" });
    expect(reload(remington)).toBe(10);
    expect(reload(remington, [], true)).toBe(8);
  });

  it("offers clamped magazines for a magazine and an assistant gunner for a machine gun's belt", () => {
    ready();
    const glock = gun({ name: "Glock 17, 9x19mm", shots: "17+1(3)", tl: "8", items: [{ name: "Magazine Clamp" }] });
    expect(entryOf(glock).aids.map((a: any) => a.id)).toEqual([`${MODULE_ID}.clamped`]);
    expect(reload(glock, ["clamped"])).toBe(2);
    // Not with Fast-Draw as well: both are ways to the same two seconds.
    expect(reload(glock, ["clamped"], true)).toBe(2);
    const m60 = gun({ name: "Saco M60, 7.62x51mm", skill: "Guns (Light Machine Gun)", shots: "100(5)", rof: 9, tl: "7" });
    expect(reload(m60)).toBe(5);
    expect(reload(m60, ["assistant"])).toBe(3);
    expect(reload(m60, [], true)).toBe(3);
  });
});

describe("loose powder and ball (High-Tech p. 86)", () => {
  const musket = (patch: Parameters<typeof gun>[0] = {}) => gun({ name: "Brown Bess, .75 Flintlock", skill: "Guns (Musket)", shots: "1(40)", rof: 1, tl: "5", ...patch });

  it("loads a musket in 40 seconds, 30 with Fast-Draw, 35 with a flask and 20 with paper cartridges", () => {
    ready();
    const bess = musket();
    expect(reload(bess)).toBe(40);
    expect(reload(bess, [], true)).toBe(30);
    expect(reload(bess, ["flask"])).toBe(35);
    expect(reload(bess, ["flask"], true)).toBe(25);
    expect(reload(bess, ["paperCartridges"])).toBe(20);
    expect(reload(bess, ["paperCartridges"], true)).toBe(15);
    // The cartridges halve the time and supersede the flask: one or the other.
    const paper = entryOf(bess).aids.find((a: any) => a.id.endsWith("paperCartridges"));
    expect(paper).toMatchObject({ multiplier: 0.5, exclusiveGroup: `${MODULE_ID}.powder` });
    expect(entryOf(bess).aids.find((a: any) => a.id.endsWith("flask")).exclusiveGroup).toBe(`${MODULE_ID}.powder`);
    expect(rules.usableAids(entryOf(bess).aids.map((a: any) => ({ ...a, checked: true }))).map((a: any) => a.id)).toEqual([`${MODULE_ID}.flask`]);
  });

  it("loads the Kentucky rifle in 60 seconds, 42 with a patch, 37 with a flask as well, and halves a rifle's time with cartridges", () => {
    ready();
    const kentucky = gun({ name: "Kentucky Rifle, .45 Flintlock", skill: "Guns (Rifle)", shots: "1(60)", rof: 1, tl: "5" });
    expect([reload(kentucky), reload(kentucky, [], true)]).toEqual([60, 50]);
    expect([reload(kentucky, ["greasedPatch"]), reload(kentucky, ["greasedPatch"], true)]).toEqual([42, 35]);
    expect([reload(kentucky, ["greasedPatch", "flask"]), reload(kentucky, ["greasedPatch", "flask"], true)]).toEqual([37, 30]);
    expect(reload(kentucky, ["paperCartridges"])).toBe(30);
  });

  it("ticks the flask for a character who carries one", () => {
    ready();
    expect(entryOf(musket({ items: [{ name: "Self-Measuring Powder Flask" }] })).aids.find((a: any) => a.id.endsWith("flask"))?.checked).toBe(true);
  });

  it("takes half as long again kneeling or prone", () => {
    ready();
    expect(reload(musket({ posture: "kneeling" }))).toBe(60);
    expect(reload(musket({ posture: "kneeling" }), [], true)).toBe(45);
  });

  it("loads a double-barrelled gun a barrel at a time, Fast-Draw saving on each", () => {
    ready();
    const manton = gun({ name: "Manton Double, 16G Flintlock", skill: "Guns (Shotgun)", shots: "2(40i)", rof: 2, tl: "5" });
    expect(entryOf(manton)).toMatchObject({ perShot: true, fastDrawPer: "round", fastDrawSeconds: 10 });
    expect(reload(manton)).toBe(80);
    expect(reload(manton, [], true)).toBe(60);
    expect(reload(manton, ["flask"])).toBe(70);
  });
});

describe("careful loading (High-Tech p. 86)", () => {
  const musket = () => gun({ name: "Brown Bess, .75 Flintlock", skill: "Guns (Musket)", shots: "1(40)", rof: 1, tl: "5", firearm: { loadCarefully: true } });

  it("takes twice as long and gives the shot it loads +1 Acc", async () => {
    on = { firearmLoading: true, carefulLoading: true };
    ready();
    const bess = musket();
    expect(reload(bess)).toBe(80);
    expect(reload(bess, [], true)).toBe(60);
    // The Reload button fills the gun.
    const changes: any = { system: { rangedModes: [{ ...bess.system.rangedModes[0], loaded: 1 }] } };
    fire("preUpdateItem", bess, changes);
    expect(changes.flags[MODULE_ID].carefulLoad).toBe(true);
    bess.flags = changes.flags;
    bess.system.rangedModes[0].loaded = 1;
    expect(row(bess).accuracy).toBe(3);
    await shoot(bess, 1);
    expect(carefullyLoaded(bess)).toBe(false);
    expect(row(bess).accuracy).toBe(2);
  });

  it("doubles the table's time with only its own switch on", () => {
    on = { carefulLoading: true };
    ready();
    expect(entryOf(musket()).reloadSeconds).toBe(80);
  });

  it("does nothing for a pistol", () => {
    on = { firearmLoading: true, carefulLoading: true };
    ready();
    const pistol = gun({ name: "Wogdon Dueller, .45 Flintlock", shots: "1(20)", rof: 1, tl: "5", firearm: { loadCarefully: true } });
    expect(reload(pistol)).toBe(20);
  });
});

describe("black-powder fouling (High-Tech p. 86)", () => {
  it("costs Malf. at five shots, Acc at ten, and adds to the loading time; cleaning puts it right", async () => {
    on = { firearmLoading: true, blackPowderFouling: true };
    ready();
    const bess = gun({ name: "Brown Bess, .75 Flintlock", skill: "Guns (Musket)", shots: "1(40)", rof: 1, tl: "5", loaded: 1 });
    for (let i = 0; i < 4; i += 1) await shoot(bess, 1);
    expect(row(bess)).toMatchObject({ accuracy: 2, malfunction: 16 });
    await shoot(bess, 1);
    expect(foulingShots(bess)).toBe(5);
    expect(row(bess)).toMatchObject({ accuracy: 2, malfunction: 15 });
    expect(chat.at(-1)).toContain("GCC.HT.Reloading.Fouled");
    bess.system.rangedModes[0].loaded = 0;
    expect(reload(bess)).toBe(44);
    for (let i = 0; i < 5; i += 1) await shoot(bess, 1);
    expect(row(bess)).toMatchObject({ accuracy: 1, malfunction: 14 });
    expect(reload(bess)).toBe(48);
    // The sheet's Clean button.
    const section = sections.find((s) => s.key === "ht-reloading-item");
    const button = { addEventListener: (_: string, fn: () => Promise<void>) => fn() };
    section.listeners({ querySelectorAll: () => [], querySelector: (sel: string) => (sel === "[data-gcc-ht-clean]" ? button : null) }, bess);
    await flush();
    expect(foulingShots(bess)).toBe(0);
    expect(row(bess)).toMatchObject({ accuracy: 2, malfunction: 16 });
  });

  it("leaves a smokeless gun clean", async () => {
    on = { blackPowderFouling: true };
    ready();
    const glock = gun({ name: "Glock 17, 9x19mm", shots: "17+1(3)", tl: "8", loaded: 18 });
    await shoot(glock, 10);
    expect(foulingShots(glock)).toBe(0);
  });

  it("fouls a gun its data says fires black powder", async () => {
    on = { blackPowderFouling: true };
    ready();
    const model10 = gun({ loaded: 6, firearm: { powder: "black" } });
    await shoot(model10, 3);
    await shoot(model10, 3);
    expect(foulingShots(model10)).toBe(6);
    expect(row(model10).malfunction).toBe(15);
  });
});

describe("loading in the saddle or on the move (High-Tech pp. 86-87)", () => {
  it("rolls the lower of Guns-1 and Riding-1 to load fixed ammunition while mounted", () => {
    ready();
    skills = { "Guns (Pistol)": 13, "Riding (Horse)": 11 };
    const model10 = gun({ mounted: true, items: [{ type: "skill", name: "Riding (Horse)" }] });
    expect(entryOf(model10).requiredRolls).toEqual([{ level: 10, label: expect.stringContaining("MountedRoll") }]);
    // A rider with no Riding skill fails the roll.
    expect(entryOf(gun({ mounted: true })).requiredRolls).toEqual([{ skill: "Riding", label: expect.stringContaining("MountedRoll") }]);
    expect(entryOf(gun()).requiredRolls).toEqual([]);
  });

  it("rolls at -3 for loose powder in the saddle, and Guns-2 on a moving vehicle", () => {
    ready();
    skills = { "Guns (Musket)": 12, "Riding (Horse)": 14 };
    const bess = (patch: Parameters<typeof gun>[0] = {}) => gun({ name: "Brown Bess, .75 Flintlock", skill: "Guns (Musket)", shots: "1(40)", rof: 1, tl: "5", ...patch });
    expect(entryOf(bess({ mounted: true, items: [{ type: "skill", name: "Riding (Horse)" }] })).requiredRolls).toEqual([{ level: 9, label: expect.stringContaining("MountedRoll") }]);
    vehicles = [{ type: "vehicle", system: { speed: 10, crew: [{ uuid: "Actor.shooter" }] } }];
    expect(entryOf(bess()).requiredRolls).toEqual([{ level: 10, label: expect.stringContaining("VehicleRoll") }]);
    // Standing still, or fixed ammunition on the move: no roll.
    expect(entryOf(gun()).requiredRolls).toEqual([]);
    vehicles = [{ type: "vehicle", system: { speed: 0, crew: [{ uuid: "Actor.shooter" }] } }];
    expect(entryOf(bess()).requiredRolls).toEqual([]);
  });

  it("asks nothing with the switch off", () => {
    on = {};
    ready();
    skills = { "Guns (Pistol)": 13 };
    expect(entryOf(gun({ mounted: true })).requiredRolls).toEqual([]);
  });
});
