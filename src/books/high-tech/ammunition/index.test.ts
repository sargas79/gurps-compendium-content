/**
 * High-Tech's ammunition as the system meets it, with only High-Tech's
 * switches on (decision D1): the rows `gworld.weaponAttacks` hands the sheet,
 * a box's price, the paper-cartridge aid on the Reload button, and the
 * Misloading Table on `gworld.attackModifiers`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyReloading } from "../reloading/index.js";
import { ammunitionHearing, firesMinieBalls, firesPaperCartridges, gunCalibre, loadBatch, readyAmmunition, type AmmunitionSwitches } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  shotsEntry: "gworld.shotsEntry",
};

let hooks: Map<string, Listener[]>;
let prices: any[];
let malfunctions: any[];
let chat: string[];
let on: Record<string, boolean>;
let dice: number[];

function fakeApi() {
  return {
    rules: { ...rules, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS, registerAttackOption: () => undefined },
    sheets: { registerSheetSection: () => undefined },
    data: { registerPriceModifier: (m: any) => prices.push(m), registerPoison: () => undefined },
    items: { setMalfunction: async (item: any, malfunction: any) => { malfunctions.push({ item: item.name, ...malfunction }); } },
    actors: { skillLevel: () => null, attribute: () => 10, vehicleAboard: () => null },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

const switches: AmmunitionSwitches = {
  upgrades: () => on.ammunitionUpgrades === true,
  handloading: () => on.handloading === true,
  misloading: () => on.misloading === true,
  projectiles: () => on.projectileOptions === true,
  exotic: () => on.exoticBullets === true,
  multiple: () => on.multipleProjectileLoads === true,
  projectileUpgrades: () => on.projectileUpgrades === true,
};

/** A gun as the pack has it, with its loads, held by a character carrying `items`. */
function gun(patch: { name?: string; tl?: string; skill?: string; accuracy?: number; damage?: string; range?: [number, number]; malfunction?: number; rof?: number; shots?: string; minSt?: number; loads?: any[]; loadedFrom?: string; items?: any[]; projectiles?: number; ammunition?: string; explosive?: boolean } = {}): any {
  const items = patch.items ?? [];
  const actor = { name: "Shooter", system: { posture: "standing" }, items: Object.assign([...items], { get: (id: string) => items.find((i) => i.id === id) }) };
  const item: any = {
    id: "g1",
    name: patch.name ?? "Accuracy International AWM, .338 Lapua Magnum",
    type: "equipment",
    isOwner: true,
    actor,
    flags: {},
    system: {
      tl: patch.tl ?? "8",
      cost: 1000,
      quality: "good",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{
        skill: patch.skill ?? "Guns (Rifle)", accuracy: patch.accuracy ?? 6, damageFormula: patch.damage ?? "9d+1", malfunction: patch.malfunction ?? 17,
        rateOfFire: patch.rof ?? 1, shots: patch.shots ?? "5(3)", loaded: 5, loadedFrom: patch.loadedFrom ?? "", minSt: patch.minSt ?? 11, ammunition: patch.ammunition ?? "",
        projectiles: patch.projectiles ?? 1, explosive: patch.explosive === true,
      }],
      extensions: { [MODULE_ID]: { htLoads: patch.loads ?? [], firearm: {} } },
    },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  item.setFlag = async (_scope: string, key: string, value: unknown) => { item.flags[key] = value; };
  item.getFlag = (_scope: string, key: string) => item.flags[key];
  item.unsetFlag = async (_scope: string, key: string) => { delete item.flags[key]; };
  return item;
}

/** A box of rounds on the character. */
const box = (patch: { fits?: string; quantity?: number; loads?: any[] } = {}): any => ({
  id: "b1",
  name: "Box of rounds",
  type: "equipment",
  system: { category: "ammunition", quantity: patch.quantity ?? 50, cost: 9, weight: 1, tl: "", ammunition: { kind: "", fits: patch.fits ?? "9x19mm" }, extensions: { [MODULE_ID]: { htLoads: patch.loads ?? [] } } },
});

const load = (patch: Record<string, unknown>) => ({ mode: 0, calibre: "", upgrades: [], source: "", matched: false, batchMalfunction: 0, discount: 0, projectile: "", material: "", shotMm: 0, shotCount: 0, projectileUpgrades: [], poisonCost: 0, ...patch });

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** The row the sheet shows for the gun's first mode; `patch` what the system's own rules made of it. */
function row(item: any, patch: Record<string, unknown> = {}, basisPatch: Record<string, unknown> = {}): any {
  const mode = item.system.rangedModes[0];
  const figures = { damage: mode.damageFormula, damageType: "pi", armorDivisor: 1, halfDamageRange: 1000, maxRange: 4000, accuracy: mode.accuracy, malfunction: mode.malfunction, minSt: mode.minSt, projectiles: mode.projectiles ?? 1, recoil: 2, firstHit: null, noOverpenetration: false, scatterSquared: false };
  return fire(HOOKS.weaponAttacks, { actor: item.actor, item, rows: [{ kind: "ranged", mode, basis: { ...figures, ...basisPatch }, row: { ...figures, ...basisPatch, ...patch, notes: [] } }] }).rows[0].row;
}

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  prices = [];
  malfunctions = [];
  chat = [];
  dice = [];
  on = { ammunitionUpgrades: true, handloading: true, misloading: true };
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { actors: { contents: [] }, i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, getProperty: () => undefined, setProperty: setPath } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  // Each die comes off the list: 1 to 6.
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 1) / 6 } });
  readyAmmunition(fakeApi() as never, switches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a gun's load (High-Tech pp. 163-166)", () => {
  it("gives a sniper rifle's match-grade load +1 Acc, and a perfect handloaded match +2", () => {
    const awm = gun({ loads: [load({ upgrades: ["matchGrade"] })] });
    const shown = row(awm);
    expect(shown.accuracy).toBe(7);
    expect(shown.notes.map((n: any) => n.label)).toContain("GCC.HT.Ammunition.Upgrade.matchGrade");
    const matched = gun({ loads: [load({ upgrades: ["matchGrade"], source: "handloaded", matched: true })] });
    expect(row(matched).accuracy).toBe(8);
    // Without the handloading switch the match is ordinary match-grade.
    on.handloading = false;
    expect(row(matched).accuracy).toBe(7);
  });

  it("makes a TL6 pistol's rounds extra-powerful: Dmg, Range and ST x1.1, -1 Malf.", () => {
    const luger = gun({ name: "Luger P08, 9x19mm", tl: "6", skill: "Guns (Pistol)", accuracy: 2, damage: "2d+2", minSt: 9, rof: 3, shots: "8+1(3)", loads: [load({ upgrades: ["extraPowerful"] })] });
    expect(row(luger)).toMatchObject({ damage: "3d-1", halfDamageRange: 1100, maxRange: 4400, malfunction: 16, minSt: 10, accuracy: 2 });
  });

  it("changes nothing with the switch off, or on a load the gun refuses", () => {
    on.ammunitionUpgrades = false;
    on.handloading = false;
    const awm = gun({ loads: [load({ upgrades: ["matchGrade"] })] });
    expect(row(awm)).toMatchObject({ accuracy: 6, notes: [] });
    on.ammunitionUpgrades = true;
    // Match-grade isn't for automatic weapons (p. 165).
    const auto = gun({ name: "Colt M16A2, 5.56x45mm", rof: 3, shots: "30+1(3)", loads: [load({ upgrades: ["matchGrade"] })] });
    expect(row(auto)).toMatchObject({ accuracy: 6, notes: [] });
  });

  it("fires the rounds of the box the mode was loaded from, and prices the box from the table", () => {
    const rounds = box({ quantity: 600, loads: [load({ upgrades: ["subsonic", "silent"] })] });
    const glock = gun({ name: "Glock 17, 9x19mm", skill: "Guns (Pistol)", accuracy: 2, damage: "2d+2", rof: 3, shots: "17+1(3)", loadedFrom: "b1", items: [rounds] });
    const shown = row(glock);
    const labels: string[] = shown.notes.map((n: any) => n.label);
    expect(labels).toContain("GCC.HT.Ammunition.Upgrade.subsonic");
    expect(labels.some((l) => l.startsWith("GCC.HT.Ammunition.Note.silent "))).toBe(true);
    expect(labels.some((l) => l.startsWith("GCC.HT.Ammunition.Note.hearing {\"value\":-1}"))).toBe(true);
    expect(ammunitionHearing(glock, switches)).toEqual({ silent: true, penalty: -1 });
    // $0.3 x 1.3 x 10, less 5% for 600 rounds; the table's WPS (pp. 165, 175-176).
    const price = prices[0].apply(rounds, { cost: 9, weight: 1 });
    expect(price).toMatchObject({ cost: 3.71, weight: 0.026 });
    // A box whose calibre the table doesn't know keeps its own price.
    expect(prices[0].apply(box({ fits: "arrow" }), { cost: 9, weight: 1 })).toBeNull();
  });
});

describe("a gun's calibre row (#433)", () => {
  it("takes the musket row for the Brown Bess and the pistol row for the Rigby, by their skills", () => {
    expect(gunCalibre(gun({ name: "Brown Bess, .75 Flintlock", tl: "5", skill: "Guns (Musket)" }))?.name).toBe(".75 Flintlock (Brown Bess)");
    expect(gunCalibre(gun({ name: "Rigby Traveling Pistol, .75 Flintlock", tl: "5", skill: "Guns (Pistol)" }))?.name).toBe(".75 Flintlock (Rigby)");
    // A GM's own musket of that calibre, named for nobody, still finds the musket row.
    expect(gunCalibre(gun({ name: "Old Musket, .75 Flintlock", tl: "5", skill: "Guns (Musket)" }))?.name).toBe(".75 Flintlock (Brown Bess)");
  });
});

describe("paper cartridges on the Reload button (pp. 86, 163)", () => {
  it("start the aid ticked where the musket's load is paper cartridges", () => {
    const api = fakeApi();
    readyReloading(api as never, { loading: () => true, careful: () => false, fouling: () => false, paperCartridges: (item, modeIndex) => firesPaperCartridges(item, modeIndex, switches) });
    const bess = gun({ name: "Brown Bess, .75 Flintlock", tl: "5", skill: "Guns (Musket)", shots: "1(40)", loads: [load({ upgrades: ["paperCartridge"] })] });
    const mode = bess.system.rangedModes[0];
    const entry = fire(HOOKS.shotsEntry, { actor: bess.actor, item: bess, modeIndex: 0, mode, entry: { ...rules.parseShots(mode.shots) } }).entry;
    expect(entry.aids.find((a: any) => a.id.endsWith("paperCartridges"))?.checked).toBe(true);
    expect(entry.aids.find((a: any) => a.id.endsWith("flask"))?.checked).toBe(false);
    bess.system.extensions[MODULE_ID].htLoads = [];
    const plain = fire(HOOKS.shotsEntry, { actor: bess.actor, item: bess, modeIndex: 0, mode, entry: { ...rules.parseShots(mode.shots) } }).entry;
    expect(plain.aids.find((a: any) => a.id.endsWith("paperCartridges"))?.checked).toBe(false);
  });
});

describe("misloading (p. 178)", () => {
  const revolver = (own: string, round: string) => gun({ name: `S&W Model 29, ${own}`, tl: "7", skill: "Guns (Pistol)", accuracy: 2, damage: "3d", rof: 3, shots: "6(3i)", loads: [load({ calibre: round })] });
  const attack = (item: any) => fire(HOOKS.attackModifiers, { actor: item.actor, item, mode: { index: 0, ranged: true }, modifiers: [{ label: "Accuracy", value: 2, key: "accuracy" }], refusal: null });

  it("lets a .44 Magnum revolver fire .44 Special, and rolls the table for the other way round", async () => {
    dice = [6, 6, 6];
    expect(attack(revolver(".44 Magnum", ".44 Special (10.9×29mmR)")).refusal).toBeNull();
    // 10: it doesn't fire, and the gun jams.
    dice = [3, 3, 4];
    const special = revolver(".44 Special", ".44 Magnum (10.9×33mmR)");
    const context = attack(special);
    expect(context.refusal).toContain("GCC.HT.Ammunition.Misload.jams");
    await flush();
    expect(malfunctions).toEqual([{ item: special.name, kind: "stoppage", label: "GCC.HT.Ammunition.Misload.jams", modeIndex: 0 }]);
    expect(chat.join(" ")).toContain("Misload.Rolled");
  });

  it("fires on a 3 at Acc 0, and on a 4 jams the gun once the shot is spent", async () => {
    dice = [1, 1, 1];
    const special = revolver(".44 Special", ".44 Magnum (10.9×33mmR)");
    const fired = attack(special);
    expect(fired.refusal).toBeNull();
    expect(fired.modifiers.some((m: any) => m.key === "accuracy")).toBe(false);
    dice = [1, 1, 2];
    attack(special);
    await flush();
    expect(special.flags.htMisloadJam).toBe(0);
    fire(HOOKS.afterShots, { actor: special.actor, item: special, modeIndex: 0, shots: 1 });
    await flush();
    expect(malfunctions.at(-1)).toMatchObject({ kind: "stoppage" });
    expect(special.flags.htMisloadJam).toBeUndefined();
  });

  it("rolls nothing with the switch off", () => {
    on.misloading = false;
    dice = [3, 3, 4];
    expect(attack(revolver(".44 Special", ".44 Magnum (10.9×33mmR)")).refusal).toBeNull();
  });
});

describe("projectiles (pp. 166-175)", () => {
  const labels = (shown: any): string[] => shown.notes.map((n: any) => n.label);

  it("loads a pistol with hollow-points: (0.5), a step up the piercing ladder, only with the switch on", () => {
    const glock = gun({ name: "Glock 17, 9x19mm", skill: "Guns (Pistol)", accuracy: 2, damage: "2d+2", rof: 3, shots: "17+1(3)", loads: [load({ projectile: "hollowPoint" })] });
    expect(row(glock)).toMatchObject({ damage: "2d+2", damageType: "pi", armorDivisor: 1 });
    on.projectileOptions = true;
    const shown = row(glock);
    expect(shown).toMatchObject({ damage: "2d+2", damageType: "pi+", armorDivisor: 0.5, malfunction: 17 });
    expect(labels(shown)).toContain("GCC.HT.Ammunition.Projectile.hollowPoint");
  });

  it("replaces the Basic Set round chosen on the mode, never stacking with it", () => {
    on.projectileOptions = true;
    hooks = new Map();
    const api = { ...fakeApi(), registry: { isRuleOn: (key: string) => key === "ammunitionTypes" } };
    readyAmmunition(api as never, switches);
    // The system loaded Basic Set APDS in the rifle (Characters p. 279): (2), a step down, +1 a die, Range x1.5.
    const m16 = gun({ name: "Colt M16A2, 5.56x45mm", tl: "9", damage: "5d", ammunition: "apds", loads: [load({ projectile: "hollowPoint" })] });
    const shown = row(m16, { damage: "5d+5", damageType: "pi-", armorDivisor: 2, halfDamageRange: 1500, maxRange: 6000 });
    expect(shown).toMatchObject({ damage: "5d", damageType: "pi+", armorDivisor: 0.5, halfDamageRange: 1000, maxRange: 4000 });
    expect(labels(shown).some((l) => l.startsWith("GCC.HT.Ammunition.Note.replacesBasic"))).toBe(true);
    // High-Tech's APDS from the rifle's own figures: 5d x1.3, (2), pi-, Range x1.5.
    m16.system.extensions[MODULE_ID].htLoads = [load({ projectile: "apds" })];
    expect(row(m16, { damage: "5d+5", damageType: "pi-", armorDivisor: 2, halfDamageRange: 1500, maxRange: 6000 })).toMatchObject({ damage: "6d+2", damageType: "pi-", armorDivisor: 2, halfDamageRange: 1500, maxRange: 6000 });
  });

  it("fires a 12-gauge's buckshot, birdshot and a rifled slug", () => {
    on.projectileOptions = true;
    on.multipleProjectileLoads = true;
    const shotgun = (l: any) => gun({ name: "Remington Model 870, 12G 2.75''", tl: "7", skill: "Guns (Shotgun)", accuracy: 3, damage: "1d+1", rof: 2, projectiles: 9, shots: "5+1(2i)", loads: [l] });
    const buck = row(shotgun(load({ projectile: "shotshell" })), { halfDamageRange: 40, maxRange: 800, recoil: 1 });
    expect(buck).toMatchObject({ damage: "1d+1", damageType: "pi", projectiles: 9, recoil: 1 });
    const bird = row(shotgun(load({ projectile: "shotshell", shotMm: 2.79, shotCount: 223 })), { halfDamageRange: 40, maxRange: 800, recoil: 1 });
    expect(bird).toMatchObject({ damage: "1d-5", damageType: "pi-", armorDivisor: 0.5, halfDamageRange: 14, maxRange: 279, projectiles: 223 });
    const slug = row(shotgun(load({ projectile: "rifledSlug" })), { halfDamageRange: 40, maxRange: 800, recoil: 1 });
    expect(slug).toMatchObject({ damage: "5d", damageType: "pi++", accuracy: 4, halfDamageRange: 100, maxRange: 1200, projectiles: 1 });
  });

  it("gives buck-and-ball's ball the first hit, and a tracer the incendiary modifier", () => {
    on.multipleProjectileLoads = true;
    on.projectileUpgrades = true;
    const bess = gun({ name: "Brown Bess, .75 Flintlock (Brown Bess)", tl: "5", skill: "Guns (Musket)", accuracy: 1, damage: "4d+1", shots: "1(40)", loads: [load({ projectile: "buckAndBall" })] });
    const shown = row(bess, { damageType: "pi++", halfDamageRange: 100, maxRange: 1500 });
    expect(shown).toMatchObject({ damage: "1d+1", damageType: "pi", projectiles: 4, recoil: 1 });
    expect(shown.firstHit).toEqual({ damage: "4d+1", damageType: "pi++", armorDivisor: 1, label: "GCC.HT.Ammunition.FirstHitBall" });
    const m16 = gun({ name: "Colt M16A2, 5.56x45mm", tl: "8", damage: "5d", loads: [load({ projectileUpgrades: ["tracer"] })] });
    const traced = row(m16);
    expect(traced.incendiary).toBe(true);
    expect(labels(traced)).toContain("GCC.HT.Ammunition.ProjectileUpgrade.tracer");
  });

  it("bursts a grenade launcher's airburst round, a miss scattering by the margin squared", () => {
    on.projectileUpgrades = true;
    const m79 = gun({ name: "M79, 40x46mmSR", tl: "7", skill: "Guns (Grenade Launcher)", damage: "4d", explosive: true, loads: [load({ projectileUpgrades: ["airburst"] })] });
    expect(row(m79).scatterSquared).toBe(true);
    // Not on a bullet.
    const glock = gun({ name: "Glock 17, 9x19mm", skill: "Guns (Pistol)", damage: "2d+2", loads: [load({ projectileUpgrades: ["airburst"] })] });
    expect(row(glock).scatterSquared).toBe(false);
  });

  it("prices a box of hollow-point APDS-free rounds from the projectile, and silver x50", () => {
    on.projectileOptions = true;
    on.exoticBullets = true;
    const rounds = box({ fits: ".40 S&W", quantity: 50, loads: [load({ projectile: "hollowPoint", material: "silver" })] });
    expect(prices[0].apply(rounds, { cost: 9, weight: 1 })).toMatchObject({ cost: 15, weight: 0.035 });
    // With every switch off it keeps its own price.
    on.projectileOptions = false;
    on.exoticBullets = false;
    on.ammunitionUpgrades = false;
    expect(prices[0].apply(rounds, { cost: 9, weight: 1 })).toBeNull();
  });

  it("loads a muzzle-loading rifle firing Minié balls in a musket's time", () => {
    on.projectileOptions = true;
    const api = fakeApi();
    readyReloading(api as never, { loading: () => true, careful: () => false, fouling: () => false, minieBalls: (item, modeIndex) => firesMinieBalls(item, modeIndex, switches) });
    const enfield = gun({ name: "Enfield P/1853, .577 Caplock (Enfield)", tl: "5", skill: "Guns (Rifle)", shots: "1(60)", loads: [load({ projectile: "minie" })] });
    const mode = enfield.system.rangedModes[0];
    const entry = fire(HOOKS.shotsEntry, { actor: enfield.actor, item: enfield, modeIndex: 0, mode, entry: { ...rules.parseShots(mode.shots) } }).entry;
    expect(entry.reloadSeconds).toBe(40);
    expect(entry.aids.some((a: any) => a.id.endsWith("greasedPatch"))).toBe(false);
  });
});

describe("a batch of handloads (High-Tech p. 174)", () => {
  it("adds the batch's rounds to the box it is loaded into (API 1.123.0)", async () => {
    const changed: any[] = [];
    const api = {
      ...fakeApi(),
      actors: { skillLevel: (_a: any, name: string) => (name === "Armoury (Small Arms)" ? 12 : null), attribute: () => 10 },
      items: { changeQuantity: async (item: any, delta: number, o: any) => { changed.push({ item: item.id, delta, ...o }); return { from: item.system.quantity, to: item.system.quantity + delta, reason: o.reason }; } },
    };
    const rounds = box({ quantity: 10 });
    rounds.actor = { name: "Loader", items: [rounds] };
    rounds.update = async (changes: Record<string, unknown>) => { for (const [path, value] of Object.entries(changes)) setPath(rounds, path, value); };
    vi.stubGlobal("Roll", class { total = 10; async evaluate() { return this; } });
    (globalThis as any).foundry.applications = { api: { DialogV2: { prompt: async () => ({ tool: "press", source: "handloaded", rounds: 20 }) } } };
    await loadBatch(api as never, rounds, 0, switches);
    expect(changed).toEqual([{ item: "b1", delta: 20, reason: "GCC.HT.Ammunition.BatchTitle" }]);
    expect(chat.at(-1)).toContain("BatchAdded");
    expect(chat.at(-1)).toContain('"total":30');
  });
});
