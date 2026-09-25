/**
 * A fire mission as the card runs it: the FO's Navigation and Forward
 * Observer rolls, the gun's attack at -10 with no Acc plus the FO's
 * adjustment, a correction, the time of flight, and the squared scatter of a
 * miss worked out with the system's own rules (Campaigns p. 414).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { carriedNavigationAid, damage, fire, missionFrom, missionView, navigate, observe, observerOptics, observerSkill, observerVision, readyIndirectFire, type MissionData } from "./index.js";

let successes: any[];
let outcomes: any[];
let damageRolls: any[];
let dice: number[];
let actors: Map<string, any>;
let spent: any[];
let loadedCount: number | null;

const mortar = {
  itemId: "m2",
  modeIndex: 0,
  name: "Watervliet M2, 60mm",
  mode: "",
  skillName: "Artillery (Cannon)",
  modeSkill: "Artillery (Cannon)",
  skillLevel: 13,
  minRange: 100,
  accuracy: 2,
  damage: "6d",
  damageType: "cr",
  armorDivisor: 1,
  explosive: true,
  fragmentation: "3d",
  damageRollable: true,
  scatterSquared: false,
};

function item(id = "m2", modes: any[] = [{ name: "", skill: "Artillery (Cannon)" }]) {
  return { id, name: "Watervliet M2, 60mm", type: "equipment", system: { rangedModes: modes } };
}

function character(uuid: string, name: string, extra: Record<string, any> = {}) {
  const gun = item();
  return { uuid, name, items: Object.assign([gun, ...(extra.items ?? [])], { get: (id: string) => (id === gun.id ? gun : null) }), skills: extra.skills ?? {}, iq: extra.iq ?? 10 };
}

function fakeApi() {
  return {
    rules,
    actors: {
      derived: (actor: any) => (actor?.uuid === "gunner" ? { ranged: [mortar] } : { ranged: [] }),
      attribute: (actor: any, key: string) => (key === "IQ" ? actor.iq : 10),
      skillLevel: (actor: any, name: string) => actor.skills?.[name] ?? null,
    },
    roll: {
      success: async (options: any) => { successes.push(options); return outcomes.shift() ?? null; },
      damage: async (options: any) => { damageRolls.push(options); return 10; },
    },
    items: {
      spendShots: async (item: any, modeIndex: number, shots: number, options: any = {}) => {
        if (loadedCount === null) return null;
        if (shots > 0) spent.push({ item: item.id, modeIndex, shots, reason: options.reason });
        loadedCount = Math.max(0, loadedCount - shots);
        return loadedCount;
      },
    },
    sheets: { registerRowAction: vi.fn() },
    chat: { registerChatCard: vi.fn(), update: vi.fn(async () => true), post: vi.fn() },
  };
}

beforeEach(() => {
  successes = [];
  outcomes = [];
  damageRolls = [];
  dice = [];
  actors = new Map();
  spent = [];
  loadedCount = 10;
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: any) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("fromUuidSync", (uuid: string) => actors.get(uuid) ?? null);
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("Roll", class {
    total = 0;
    constructor(public formula: string) {}
    async evaluate() { this.total = dice.shift() ?? 1; return this; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mission(api: any, form: Record<string, any> = {}): MissionData {
  const gunner = character("gunner", "Gunner");
  const fo = character("fo", "Knox", { skills: { "Forward Observer": 14 } });
  actors.set("gunner", gunner);
  actors.set("fo", fo);
  return missionFrom(api, {
    gunner,
    item: gunner.items[0],
    rows: [mortar],
    form: { mission: "observed", modeIndex: "0", fo: "fo", foSkill: 14, navigationSkill: 12, aid: "compass", map: true, foYards: 1000, magnification: 1, rangefinder: 0, fireControl: 0, vision: 0, gunYards: 1000, trajectory: "high", gunnerModifier: 0, ...form },
  });
}

describe("setting up the mission (High-Tech p. 139)", () => {
  it("puts the FO's range penalty and the navigation aids on his rolls, and works out the time of flight", () => {
    const data = mission(fakeApi());
    expect(data.stage).toBe("navigate");
    expect(data.navigation).toEqual([{ label: "GCC.HT.IndirectFire.NavigationLines.compass", value: 1 }]);
    // 1,000 yards with no vision aid: -6.
    expect(data.observation).toEqual([{ label: expect.stringContaining("RangeLine"), value: -6 }]);
    // High-angle at 1,000 yards: four seconds.
    expect(data.flightSeconds).toBe(4);
  });

  it("starts predicted fire at the gun, with no observer", () => {
    const data = mission(fakeApi(), { mission: "predicted" });
    expect(data.stage).toBe("fire");
    expect(data.foUuid).toBe("");
    expect(missionView(data)).toMatchObject({ fire: true, navigate: false, correct: false });
  });

  it("reads Forward Observer and Navigation, or their IQ-5 defaults", () => {
    const api = fakeApi();
    const fo: any = { iq: 12, skills: { "Navigation (Land)": 13 }, items: [{ type: "skill", name: "Navigation (Land)" }] };
    expect(observerSkill(api as never, fo, "Navigation")).toBe(13);
    expect(observerSkill(api as never, fo, "Forward Observer")).toBe(7);
  });

  it("reads a compass or GPS off the FO's gear, and leaves a Navigation tool to the skill", () => {
    const gear = (items: any[]) => ({ items: items.map((i) => ({ type: "equipment", system: {}, ...i })) });
    expect(carriedNavigationAid(gear([{ name: "Compass" }]))).toMatchObject({ aid: "compass", found: "Compass" });
    expect(carriedNavigationAid(gear([{ name: "Compass" }, { name: "Global Positioning System Receiver" }]))).toMatchObject({ aid: "gps" });
    expect(carriedNavigationAid(gear([{ name: "Kit", system: { forSkills: ["Navigation (Land)"] } }, { name: "Compass" }]))).toMatchObject({ aid: "none", counted: "Kit" });
    expect(carriedNavigationAid(gear([{ name: "Compass", system: { carried: false } }]))).toMatchObject({ aid: "none" });
  });
});

describe("running the mission", () => {
  it("navigates, locates, fires, corrects and scatters a miss by the square of its margin", async () => {
    const api = fakeApi();
    let data = mission(api);

    // A failed Navigation roll leaves him to try again.
    outcomes.push({ success: false, margin: 2 });
    data = await navigate(api as never, data);
    expect(data.stage).toBe("navigate");
    outcomes.push({ success: true, margin: 3 });
    data = await navigate(api as never, data);
    expect(successes[1]).toMatchObject({ base: 12, modifiers: [{ value: 1 }] });
    expect(data.stage).toBe("locate");

    // Locating by 2 in 9 seconds: the first shot at -8.
    outcomes.push({ success: true, margin: 2 });
    dice.push(9);
    data = await observe(api as never, data, false);
    expect(successes[2]).toMatchObject({ base: 14, skill: "Forward Observer", modifiers: [{ value: -6 }] });
    expect(data).toMatchObject({ stage: "fire", adjustment: 2, spotSeconds: 9 });
    expect(missionView(data)).toMatchObject({ fire: true, correct: false });

    // The shot: skill 13 at -10 +2, no Acc; it misses by 3 and lands 9 yards off in direction 4.
    outcomes.push({ success: false, margin: 3 });
    dice.push(4);
    data = await fire(api as never, data);
    const shot = successes[3];
    expect(shot).toMatchObject({ base: 13, kind: "attack", skill: "Artillery (Cannon)" });
    expect(shot.modifiers.map((m: any) => m.value)).toEqual([-10, 2]);
    expect(data.log.at(-1)!.text).toContain('"yards":9');
    expect(data.log.at(-1)!.text).toContain('"direction":4');
    expect(data.log.at(-1)!.text).toContain('"bearing":180');
    expect(data.log.at(-1)!.text).toContain('Arrives');
    // The shell still goes off where it lands.
    expect(data.canDamage).toBe(true);
    expect(missionView(data)).toMatchObject({ correct: true });

    // A correction by 5 in 12 seconds: the next shot at -3.
    outcomes.push({ success: true, margin: 5 });
    dice.push(12);
    data = await observe(api as never, data, true);
    expect(data).toMatchObject({ adjustment: 7, spotSeconds: 21, shotsSinceCorrection: 0 });
    expect(missionView(data)).toMatchObject({ correct: false });

    outcomes.push({ success: true, margin: 1 });
    data = await fire(api as never, data);
    expect(successes[5].modifiers.map((m: any) => m.value)).toEqual([-10, 7]);
    expect(data).toMatchObject({ lastHit: true, shots: 2 });

    await damage(api as never, data);
    expect(damageRolls[0]).toMatchObject({ formula: "6d", damageType: "cr", explosive: true, fragmentation: "3d", mode: { index: 0, ranged: true } });
  });

  it("notes a friendly-fire incident on a critical failure, and takes the penalty off on a critical success", async () => {
    const api = fakeApi();
    let data = { ...mission(api), stage: "locate" };
    outcomes.push({ success: false, margin: 4, criticalFailure: true });
    data = await observe(api as never, data, false);
    expect(data.log.at(-1)!.note).toBe("GCC.HT.IndirectFire.FriendlyFire");
    expect(data.adjustment).toBe(-4);
    outcomes.push({ success: true, margin: 0, criticalSuccess: true });
    data = await observe(api as never, { ...data, shotsSinceCorrection: 1 }, true);
    expect(data.adjustment).toBe(10);
  });

  it("spends a round from the gun for each shot, and fires none from an empty one (API 1.155.0)", async () => {
    const api = fakeApi();
    let data = mission(api, { mission: "predicted" });
    loadedCount = 1;
    outcomes.push({ success: true, margin: 2 });
    data = await fire(api as never, data);
    expect(spent).toEqual([{ item: "m2", modeIndex: 0, shots: 1, reason: expect.stringContaining("SpendReason") }]);
    expect(data.shots).toBe(1);
    // Empty: no roll, no shot.
    outcomes.push({ success: true, margin: 2 });
    const after = await fire(api as never, data);
    expect(after).toBe(data);
    expect(successes).toHaveLength(1);
    expect((globalThis as any).ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("NoRounds"));
    // A mode that keeps no count fires on, spending nothing.
    loadedCount = null;
    outcomes.push({ success: true, margin: 2 });
    expect((await fire(api as never, data)).shots).toBe(2);
    expect(spent).toHaveLength(1);
  });

  it("gives predicted fire the Basic Set's +4 for an area and no -10", async () => {
    const api = fakeApi();
    const data = mission(api, { mission: "predicted" });
    outcomes.push({ success: true, margin: 2 });
    await fire(api as never, data);
    expect(successes[0].modifiers).toEqual([{ label: "GCC.HT.IndirectFire.AreaLine", value: 4 }]);
  });

  it("rolls the FO's DX-based Forward Observer for a round on his laser designator", async () => {
    const api = fakeApi();
    // Forward Observer-14 on IQ 10, DX 10: 14; the FO's own Vision lines go with it.
    const data = { ...mission(api, { designated: true }), stage: "fire" };
    expect(data).toMatchObject({ designated: true, designatorSkill: 14 });
    outcomes.push({ success: true, margin: 3 });
    await fire(api as never, data);
    expect(successes[0]).toMatchObject({ base: 14, skill: "Forward Observer", tags: ["indirectFire", "laserDesignation"] });
    expect(successes[0].modifiers).toEqual(data.observation);
    expect(successes[0].actor.uuid).toBe("fo");
  });
});

describe("the observer's optics and sight", () => {
  it("reads the best optic and a computer sight's rangefinder off the FO's gear", () => {
    const gear = (items: any[]) => ({ items: items.map((i) => ({ type: "equipment", system: {}, ...i })) });
    expect(observerOptics(gear([{ name: "Binoculars (TL6)" }, { name: "Military-Grade Binoculars (TL7)" }, { name: "Thermal-Imaging Sensor" }]))).toEqual({ magnification: 10, rangefinderYards: 0, optic: "Military-Grade Binoculars (TL7)" });
    expect(observerOptics(gear([{ name: "Computer Sight" }]))).toMatchObject({ magnification: 1, rangefinderYards: 4000 });
    expect(observerOptics(gear([{ name: "Spotting Scope", system: { carried: false } }]))).toMatchObject({ magnification: 1, optic: null });
  });

  it("reads the darkness at the target for the FO's eyes, and the target's SM", () => {
    const api: any = { areas: { darknessAt: (_s: unknown, token: any) => ({ darkness: 5, total: false, penalty: token.dark }) } };
    expect(observerVision(api, {}, { dark: -5, actor: { system: { sm: 2 } } })).toBe(-3);
    expect(observerVision(api, {}, null)).toBe(0);
  });
});

describe("registration", () => {
  it("puts the button on the rows of guns that fire indirectly, only with the switch on", () => {
    const api = fakeApi();
    let on = false;
    readyIndirectFire(api as never, () => on);
    const action = api.sheets.registerRowAction.mock.calls[0]![0] as any;
    expect(action).toMatchObject({ module: MODULE_ID, key: "ht-indirect-fire" });
    expect(action.visible(item())).toBe(false);
    on = true;
    expect(action.visible(item())).toBe(true);
    expect(action.visible(item("p", [{ name: "", skill: "Guns (Pistol)" }]))).toBe(false);
    expect(api.chat.registerChatCard).toHaveBeenCalledWith(expect.objectContaining({ key: "ht-indirect-fire" }));
  });
});
