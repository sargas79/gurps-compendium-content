/**
 * The rate-of-fire rules as the system meets them: the rows, the attack
 * options, the roll's hook and the selector, with Foundry's globals stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyRateOfFire, switchFireSetting, triggerOf, type RateOfFireSwitches } from "./index.js";

type Listener = (context: any) => void;

let hooks: Map<string, Listener[]>;
let options: Map<string, any>;
let rowAction: any;
let chat: string[];
let conditions: any[];
let weaponState: Map<string, Record<string, unknown>>;
let on: Record<string, boolean>;
let combat: any;
let refunds: any[];

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  afterShots: "gworld.afterShots",
};

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: () => false },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (r: any) => { options.set(r.key, r); return `${r.module}.${r.key}`; },
      getWeaponState: (item: any) => weaponState.get(item.id) ?? {},
      setWeaponState: async (item: any, _module: string, patch: Record<string, unknown>) => { weaponState.set(item.id, { ...(weaponState.get(item.id) ?? {}), ...patch }); },
    },
    sheets: { registerSheetSection: vi.fn(), registerRowAction: (r: any) => { rowAction = r; } },
    actors: {
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      applyCondition: async (_actor: any, c: any) => { conditions.push(c); return "c1"; },
    },
    items: { refundShots: async (item: any, modeIndex: number, shots: number) => { refunds.push({ item: item.id, modeIndex, shots }); return shots; } },
  };
}

const switches: RateOfFireSwitches = {
  triggers: () => on.triggers === true,
  bursts: () => on.bursts === true,
  fastFiring: () => on.fastFiring === true,
  fanning: () => on.fanning === true,
};

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

function gun(name: string, mode: Record<string, unknown>, firearm: Record<string, unknown> = {}): any {
  return {
    id: name,
    uuid: `Item.${name}`,
    name,
    type: "equipment",
    isOwner: true,
    system: {
      tl: "7",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{ skill: "Guns (Pistol)", accuracy: 2, rateOfFire: 3, recoil: 2, shots: "7+1(3)", damageType: "pi+", rateOfFireMark: "", rateOfFireSecond: 0, rateOfFireSecondMark: "", ...mode }],
      extensions: { [MODULE_ID]: { firearm } },
    },
  };
}

const peacemaker = () => gun("Colt M1873 SAA", { rateOfFire: 1, recoil: 3, shots: "6(5i)" });
const colt1911 = () => gun("Colt Government", { rateOfFire: 3, recoil: 3 });
const python = () => gun("Colt Python", { rateOfFire: 3, recoil: 3, shots: "6(3i)" });
const beretta93r = () => gun("Beretta Mod 93R", { rateOfFire: 9, shots: "20+1(3)" }, { burstLimit: 3 });
const m16 = () => gun("Colt M16A1", { skill: "Guns (Rifle)", rateOfFire: 13, shots: "20+1(3)" });
const g11 = () => gun("H&K G11", { skill: "Guns (Rifle)", rateOfFire: 9, rateOfFireMark: "#", rateOfFireSecond: 7, shots: "45+1(5)" });

const shooter = (skills: Record<string, number> = { "Guns (Pistol)": 14 }, items: any[] = []) => ({ id: "a1", uuid: "Actor.a1", isOwner: true, skills, items, system: { maneuver: "attack" } });

function rows(item: any) {
  const mode = item.system.rangedModes[0];
  return fire(HOOKS.weaponAttacks, { item, rows: [{ kind: "ranged", mode, basis: { accuracy: mode.accuracy }, row: { accuracy: mode.accuracy, rateOfFire: mode.rateOfFire, recoil: mode.recoil, noSprayingFire: false, noSuppressionFire: false, notes: [] as any[] } }] }).rows[0].row;
}

const context = (item: any, actor: any = shooter(), chosen: Record<string, unknown> = {}) => ({ actor, item, ranged: true, damageType: "pi+", reach: "", effectiveSkill: 14, maneuver: "attack", targets: [], chosen });
const opt = (key: string) => options.get(key)!;
const offered = (key: string, item: any, actor?: any) => opt(key).available(context(item, actor));

function attack(item: any, chosen: Record<string, unknown>, modifiers: any[] = [], actor: any = shooter()) {
  const optionsChosen = Object.fromEntries(Object.entries(chosen).map(([k, v]) => [`${MODULE_ID}.${k}`, v]));
  return fire(HOOKS.attackModifiers, { actor, item, mode: { index: 0, ranged: true }, rollType: "attack", ranged: true, modifiers, options: optionsChosen, refusal: null });
}

beforeEach(() => {
  hooks = new Map();
  refunds = [];
  options = new Map();
  rowAction = null;
  chat = [];
  conditions = [];
  weaponState = new Map();
  on = {};
  combat = null;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: {
      localize: (key: string) => key,
      format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}`,
    },
    get combat() { return combat; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.9 } });
  readyRateOfFire(fakeApi() as never, switches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trigger mechanisms", () => {
  it("works a gun's trigger out from its statistics, or takes the gun's own", () => {
    expect(triggerOf(peacemaker())).toBe("sa");
    expect(triggerOf(python())).toBe("da");
    expect(triggerOf(colt1911())).toBe("sa");
    expect(triggerOf(gun("Glock 17", {}, { trigger: "safe" }))).toBe("safe");
  });

  it("takes -1 off an aimed double-action shot unless it was cocked, and a revolver cocked fires once", () => {
    on.triggers = true;
    const aimed = [{ key: "accuracy", label: "Acc", value: 2 }];
    expect(attack(python(), {}, [...aimed]).modifiers).toContainEqual({ label: "GCC.HT.RateOfFire.DoubleActionLine", value: -1 });
    expect(attack(python(), { "ht-cocked": true }, [...aimed]).modifiers).toHaveLength(1);
    expect(attack(python(), {}, []).modifiers).toHaveLength(0);
    expect(attack(colt1911(), {}, [...aimed]).modifiers).toHaveLength(1);
    expect(offered("ht-cocked", python())).toBe(true);
    expect(offered("ht-cocked", colt1911())).toBe(false);
    expect(opt("ht-cocked").apply(context(python()), true)).toMatchObject({ rateOfFire: 1 });
  });

  it("puts a DAO gun a point of Acc lower on its row", () => {
    on.triggers = true;
    expect(rows(gun("S&W", { accuracy: 2 }, { trigger: "dao" })).accuracy).toBe(1);
    on.triggers = false;
    expect(rows(gun("S&W", { accuracy: 2 }, { trigger: "dao" })).accuracy).toBe(2);
  });
});

describe("fire selectors and bursts", () => {
  it("offers the selector only on a gun with a setting to change to", () => {
    on.bursts = true;
    expect(rowAction.visible(m16())).toBe(true);
    expect(rowAction.visible(colt1911())).toBe(false);
    expect(rowAction.visible(gun("MG", { skill: "Gunner (Machine Gun)", rateOfFire: 8, rateOfFireMark: "!" }))).toBe(false);
  });

  it("takes a Ready to change setting in combat, none out of it or with a double trigger", async () => {
    on.bursts = true;
    const actor = shooter();
    combat = { started: true, combatants: [{ actor: { id: "a1" } }] };
    const rifle = m16();
    expect(await switchFireSetting(fakeApi() as never, rifle, actor)).toBeNull();
    actor.system.maneuver = "ready";
    expect(await switchFireSetting(fakeApi() as never, rifle, actor)).toBe("semi");
    expect(rows(rifle)).toMatchObject({ rateOfFire: 3, noSprayingFire: true, noSuppressionFire: true });
    actor.system.maneuver = "attack";
    const mg34 = gun("MG34", { skill: "Guns (Light Machine Gun)", rateOfFire: 15 }, { instantSelector: true });
    expect(await switchFireSetting(fakeApi() as never, mg34, actor)).toBe("semi");
    combat = null;
    expect(await switchFireSetting(fakeApi() as never, rifle, actor)).toBe("primary");
    expect(rows(rifle).rateOfFire).toBe(13);
  });

  it("gives a limited-burst gun only whole bursts, and no Spraying Fire", () => {
    on.bursts = true;
    const beretta = beretta93r();
    expect(rows(beretta)).toMatchObject({ rateOfFire: 9, noSprayingFire: true });
    expect(offered("ht-bursts", beretta)).toBe(true);
    expect(offered("ht-bursts", colt1911())).toBe(false);
    expect(opt("ht-bursts").input.choices.map((c: any) => c.value)).toEqual(["1", "2", "3"]);
    expect([1, 2, 3].map((n) => opt("ht-bursts").apply(context(beretta), String(n)).rateOfFire)).toEqual([3, 6, 9]);
  });

  it("holds the shots to whole bursts, so 4 shots with two bursts chosen fire one, and a gun a burst short is refused", () => {
    on.bursts = true;
    const effect = opt("ht-bursts").apply(context(beretta93r()), "2");
    expect(effect).toMatchObject({ rateOfFire: 6, minShots: 3, shotsStep: 3 });
    // The system counts the shots from these (API 1.83.0).
    expect(rules.burstShots({ asked: 4, rateOfFire: effect.rateOfFire, minShots: effect.minShots, step: effect.shotsStep })).toBe(3);
    expect(rules.burstShots({ asked: 6, rateOfFire: effect.rateOfFire, minShots: effect.minShots, step: effect.shotsStep })).toBe(6);
    expect(rules.burstShots({ asked: 3, rateOfFire: 2, minShots: effect.minShots, step: effect.shotsStep })).toBeNull();
  });

  it("counts a high-cyclic gun's controlled bursts at Rcl 1 without Suppression Fire; its second setting fires normally", async () => {
    on.bursts = true;
    const rifle = g11();
    expect(rows(rifle)).toMatchObject({ rateOfFire: 9, recoil: 1, noSprayingFire: true, noSuppressionFire: true });
    expect(opt("ht-bursts").apply(context(rifle), "2").rateOfFire).toBe(6);
    await switchFireSetting(fakeApi() as never, rifle, shooter());
    expect(rows(rifle)).toMatchObject({ rateOfFire: 7, recoil: 2, noSprayingFire: false, noSuppressionFire: false });
    expect(offered("ht-bursts", rifle)).toBe(false);
  });
});

describe("fast-firing", () => {
  it("fast-fires a semiautomatic at RoF 6: -4 and Rcl +4", () => {
    on.fastFiring = true;
    expect(offered("ht-fast-firing", colt1911())).toBe(true);
    expect(opt("ht-fast-firing").apply(context(colt1911()), "6")).toMatchObject({ rateOfFire: 6, recoilModifier: 4, modifiers: [{ value: -4 }] });
    expect(opt("ht-fast-firing").apply(context(colt1911()), "4")).toMatchObject({ rateOfFire: 4, modifiers: [{ value: -4 }] });
    expect(opt("ht-fast-firing").apply(context(colt1911()), "4").recoilModifier).toBeUndefined();
  });

  it("buys the -4 off with the Fast-Firing technique", () => {
    on.fastFiring = true;
    const technique = { type: "technique", name: "Fast-Firing (Pistol)", system: { prerequisite: "Guns (Pistol)", derived: { level: 13 } } };
    const effect = opt("ht-fast-firing").apply(context(colt1911(), shooter({ "Guns (Pistol)": 14 }, [technique])), "5");
    expect(effect).toMatchObject({ rateOfFire: 5, recoilModifier: 2, modifiers: [{ value: -1 }] });
  });

  it("is refused for a full-auto or limited-burst gun, and at a RoF the gun can't reach", () => {
    on.fastFiring = true;
    on.bursts = true;
    expect(offered("ht-fast-firing", m16())).toBe(false);
    expect(offered("ht-fast-firing", beretta93r())).toBe(false);
    expect(attack(colt1911(), { "ht-fast-firing": "3" }).refusal).toContain("FastFiringRefusal");
    expect(attack(colt1911(), { "ht-fast-firing": "6" }).refusal).toBeNull();
  });

  it("lets a single-action revolver fire two-handed at RoF 2 free and up to 4 at -2", () => {
    on.fastFiring = true;
    expect(opt("ht-fast-firing").apply(context(peacemaker()), "2")).toMatchObject({ rateOfFire: 2, modifiers: [] });
    expect(opt("ht-fast-firing").apply(context(peacemaker()), "4")).toMatchObject({ rateOfFire: 4, modifiers: [{ value: -2 }] });
    expect(opt("ht-fast-firing").apply(context(peacemaker()), "5")).toBeNull();
  });
});

describe("fanning and thumbing", () => {
  it("fans a single-action revolver at RoF 3 for -6", () => {
    on.fanning = true;
    expect(offered("ht-fanning", peacemaker())).toBe(true);
    expect(offered("ht-fanning", python())).toBe(false);
    const effect = opt("ht-fanning").apply(context(peacemaker()), "3");
    expect(effect.rateOfFire).toBe(3);
    expect(effect.modifiers.reduce((s: number, m: any) => s + m.value, 0)).toBe(-6);
    expect(effect.recoilModifier).toBeUndefined();
    expect(opt("ht-fanning").apply(context(peacemaker()), "5")).toMatchObject({ rateOfFire: 5, recoilModifier: 2 });
  });

  it("with Fanning at full skill, only the -2 a step is left", () => {
    on.fanning = true;
    const technique = { type: "technique", name: "Fanning (Guns (Pistol))", system: { prerequisite: "Guns (Pistol)", derived: { level: 14 } } };
    const effect = opt("ht-fanning").apply(context(peacemaker(), shooter({ "Guns (Pistol)": 14 }, [technique])), "4");
    expect(effect.modifiers).toEqual([{ label: expect.stringContaining("FanningRofLine"), value: -4 }]);
  });

  it("won't fan an aimed shot, and thumbs at RoF 2 for -2", () => {
    on.fanning = true;
    expect(attack(peacemaker(), { "ht-fanning": "2" }, [{ key: "accuracy", label: "Acc", value: 2 }]).refusal).toBe("GCC.HT.RateOfFire.FanningNoAim");
    expect(attack(peacemaker(), { "ht-fanning": "2" }).refusal).toBeNull();
    expect(opt("ht-thumbing").apply(context(peacemaker()), true)).toMatchObject({ rateOfFire: 2, modifiers: [{ value: -2 }] });
  });

  it("drops the gun or bruises the hand on a fanning critical failure", async () => {
    on.fanning = true;
    const actor = shooter();
    attack(peacemaker(), { "ht-fanning": "3" }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: true, margin: 4 } });
    await Promise.resolve();
    // randomUniform 0.9 is a 6: a bruised hand, four minutes of moderate pain.
    expect(chat.join()).toContain("FanningBruised");
    expect(conditions).toEqual([{ key: "moderatePain", duration: { seconds: 240 } }]);
  });

  it("gives back the rounds a fanning critical failure or a failed thumbing never fired", () => {
    on.fanning = true;
    const actor = shooter();
    const fanned = peacemaker();
    attack(fanned, { "ht-fanning": "3" }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: true, margin: 4 } });
    fire(HOOKS.afterShots, { actor, item: fanned, modeIndex: 0, shots: 3, fired: 3 });
    expect(refunds).toEqual([{ item: fanned.id, modeIndex: 0, shots: 3 }]);
    // Once only: the next attack's shots stay spent.
    fire(HOOKS.afterShots, { actor, item: fanned, modeIndex: 0, shots: 3, fired: 3 });
    expect(refunds).toHaveLength(1);

    const thumbed = peacemaker();
    attack(thumbed, { "ht-thumbing": true }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: false, margin: 1 } });
    fire(HOOKS.afterShots, { actor, item: thumbed, modeIndex: 0, shots: 2, fired: 2 });
    expect(refunds).toHaveLength(2);
    // A plain fanning failure fires, and a thumbing critical failure is the GM's call: nothing goes back.
    attack(thumbed, { "ht-fanning": "2" }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: false, margin: 2 } });
    fire(HOOKS.afterShots, { actor, item: thumbed, modeIndex: 0, shots: 2, fired: 2 });
    attack(thumbed, { "ht-thumbing": true }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: true, margin: 5 } });
    fire(HOOKS.afterShots, { actor, item: thumbed, modeIndex: 0, shots: 2, fired: 2 });
    expect(refunds).toHaveLength(2);
  });

  it("thumbs two revolvers at once, a Dual-Weapon Attack, but won't fan or two-hand one (pp. 83-84)", () => {
    on.fanning = true;
    on.fastFiring = true;
    const dual = (item: any, chosen: Record<string, unknown>, hand: "primary" | "off") => {
      const optionsChosen = Object.fromEntries(Object.entries(chosen).map(([k, v]) => [`${MODULE_ID}.${k}`, v]));
      return fire(HOOKS.attackModifiers, { actor: shooter(), item, mode: { index: 0, ranged: true }, rollType: "attack", ranged: true, modifiers: [], options: optionsChosen, refusal: null, dualWeapon: { hand, sameTarget: true } });
    };
    expect(dual(peacemaker(), { "ht-thumbing": true }, "primary").refusal).toBeNull();
    expect(dual(peacemaker(), { "ht-thumbing": true }, "off").refusal).toBeNull();
    expect(dual(peacemaker(), { "ht-fanning": "2" }, "primary").refusal).toBe("GCC.HT.RateOfFire.FanningNotDual");
    expect(dual(peacemaker(), { "ht-fast-firing": "2" }, "off").refusal).toBe("GCC.HT.RateOfFire.TwoHandedNotDual");
    // Fast-firing a semi-automatic is one-handed: either hand may.
    expect(dual(colt1911(), { "ht-fast-firing": "4" }, "off").refusal).toBeNull();
    // Without a Dual-Weapon Attack, fanning is as it was.
    expect(attack(peacemaker(), { "ht-fanning": "2" }).refusal).toBeNull();
  });

  it("gives back nothing for rounds a module spent after a failed thumbing", () => {
    on.fanning = true;
    const actor = shooter();
    const thumbed = peacemaker();
    attack(thumbed, { "ht-thumbing": true }, [], actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["attack"], outcome: { success: false, criticalFailure: false, margin: 1 } });
    fire(HOOKS.afterShots, { actor, item: thumbed, modeIndex: 0, shots: 1, fired: 1, kind: "module", reason: "x" });
    expect(refunds).toEqual([]);
    fire(HOOKS.afterShots, { actor, item: thumbed, modeIndex: 0, shots: 2, fired: 2, kind: "single" });
    expect(refunds).toEqual([{ item: thumbed.id, modeIndex: 0, shots: 2 }]);
  });

  it("refuses an ordinary shot from a revolver with its trigger tied back", () => {
    on.fanning = true;
    const tied = gun("Colt M1873 SAA", { rateOfFire: 1, shots: "6(5i)" }, { triggerTie: "tied" });
    expect(attack(tied, {}).refusal).toContain("TiedRefusal");
    expect(attack(tied, { "ht-thumbing": true }).refusal).toBeNull();
  });
});

describe("with the book's other shooting rules (pp. 84, 249)", () => {
  it("refuses fanning and thumbing where another rule says so, and takes a changed default", () => {
    hooks = new Map();
    options = new Map();
    readyRateOfFire(fakeApi() as never, switches, {
      noFanning: (item) => (item.id === "Colt M1873 SAA" ? "two-handed" : null),
      techniqueDefault: (_actor, technique, penalty) => (technique === "Fast-Firing" ? penalty / 2 : null),
    });
    on.fanning = true;
    on.fastFiring = true;
    expect(opt("ht-fanning").refuse(context(peacemaker()))).toBe("two-handed");
    expect(opt("ht-thumbing").refuse(context(peacemaker()))).toBe("two-handed");
    // Without the technique, the default the other rule gives; with it, the technique's own level.
    expect(opt("ht-fast-firing").apply(context(colt1911()), "4")).toMatchObject({ modifiers: [{ value: -2 }] });
    expect(opt("ht-fanning").apply(context(gun("Remington 1858", { rateOfFire: 1, shots: "6(5i)" })), "2")).toMatchObject({ modifiers: [{ value: -4 }] });
  });
});
