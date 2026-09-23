import { describe, expect, it } from "vitest";

import { parseShots } from "../../../../system/src/rules/index.js";
import {
  blackPowderLoad,
  doubleLoadingSaving,
  firesBlackPowder,
  fouledSeconds,
  foulingPenalty,
  helpedSeconds,
  loadingSeconds,
  loadsLoose,
  SPEEDLOADER,
  workedOutLoading,
  type LoadingType,
} from "./rules.js";

const facts = (name: string, skill: string, shots: string, rateOfFire = 1) => ({ name, skill, rateOfFire, ...parseShots(shots) });

describe("how a gun loads, from its statistics (High-Tech pp. 86-88, 92)", () => {
  it.each<[string, string, string, number, LoadingType]>([
    ["Brown Bess, .75 Flintlock", "Guns (Musket)", "1(40)", 1, "muzzleloader"],
    ["Kentucky Rifle, .45 Flintlock", "Guns (Rifle)", "1(60)", 1, "muzzleloader"],
    ["Colt M1851 Navy, .36 Caplock", "Guns (Pistol)", "6(10i)", 1, "muzzleloader"],
    ["Hall M1819, .54 Flintlock", "Guns (Rifle)", "1(5)", 1, "breechBlackPowder"],
    ["S&W Model 10 M&P, .38 Special", "Guns (Pistol)", "6(3i)", 3, "swingOut"],
    ["Remington Hammer Lifter, 12G 2.5''", "Guns (Shotgun)", "2(4i)", 2, "breech"],
    ["LeFever Automatic Hammerless, 10G 2.875''", "Guns (Shotgun)", "2(3i)", 2, "breechEjector"],
    ["Remington Model 870, 12G 2.75''", "Guns (Shotgun)", "5+1(2i)", 2, "tube"],
    ["Mauser Gew98, 7.92x57mm", "Guns (Rifle)", "5(3)", 1, "clip"],
    ["SMLE Mk III, .303", "Guns (Rifle)", "10(5)", 1, "clip"],
    ["Barrett M82A1, .50 Browning", "Guns (Rifle)", "10+1(3)", 1, "magazine"],
    ["Glock 17, 9x19mm", "Guns (Pistol)", "17+1(3)", 3, "magazine"],
    ["FN P90, 5.7x28mm", "Guns (Submachine Gun)", "50+1(5)", 15, "drum"],
    ["Lewis Mk I, .303", "Guns (Light Machine Gun)", "47(5)", 9, "drum"],
    ["Saco M60, 7.62x51mm", "Guns (Light Machine Gun)", "100(5)", 9, "belt"],
    ["Colt M79, 40x46mmSR", "Guns (Grenade Launcher)", "1(3)", 1, "other"],
    ["Winchester Model 70, .30-06", "Guns (Rifle)", "5(3i)", 1, "other"],
    ["Daisy Number 111 Red Ryder, .175 BB", "Guns Sport (Musket)", "1,000(2i)", 1, "other"],
    ["Hale 9-pr Mk I, 2.5''", "Gunner (Rockets)", "1(5)", 1, "other"],
  ])("%s loads as %s", (name, skill, shots, rof, type) => {
    expect(workedOutLoading(facts(name, skill, shots, rof))).toBe(type);
  });
});

describe("the reload by procedure (High-Tech pp. 87-88)", () => {
  it("gives the book's examples", () => {
    // A double breechloader without an ejector: 8 Ready maneuvers, 6 with Fast-Draw.
    expect(loadingSeconds("breech", 2)).toEqual({ seconds: 8, fastDraw: 6 });
    // With an ejector: 6, 4.
    expect(loadingSeconds("breechEjector", 2)).toEqual({ seconds: 6, fastDraw: 4 });
    // A gate-loading six-shooter: 20 seconds, 14 with Fast-Draw.
    expect(loadingSeconds("gate", 6)).toEqual({ seconds: 20, fastDraw: 14 });
    // A swing-out six: 15, 9.
    expect(loadingSeconds("swingOut", 6)).toEqual({ seconds: 15, fastDraw: 9 });
    // A pump shotgun's five shells: 10, 8.
    expect(loadingSeconds("tube", 5)).toEqual({ seconds: 10, fastDraw: 8 });
    // A bolt action's five loose rounds: 11, 6; a charger clip of five: 3, 2.
    expect(loadingSeconds("internal", 5)).toEqual({ seconds: 11, fastDraw: 6 });
    expect(loadingSeconds("clip", 5)).toEqual({ seconds: 3, fastDraw: 2 });
    expect(loadingSeconds("clip", 10)).toEqual({ seconds: 5, fastDraw: 3 });
    expect(loadingSeconds("magazine", 30)).toEqual({ seconds: 3, fastDraw: 2 });
    expect(loadingSeconds("belt", 100)).toEqual({ seconds: 5, fastDraw: 3 });
    expect(loadingSeconds("other", 5)).toBeNull();
    expect(loadingSeconds("muzzleloader", 1)).toBeNull();
  });

  it("gives a speedloader's six Ready maneuvers, four with Fast-Draw, for a swing-out revolver", () => {
    expect(SPEEDLOADER.swingOut).toEqual({ seconds: 6, fastDraw: 4 });
    expect(SPEEDLOADER.breakOpen).toEqual({ seconds: 5, fastDraw: 3 });
    expect(SPEEDLOADER.gate).toBeUndefined();
  });

  it("lets clamped magazines or an assistant gunner reach Fast-Draw's time", () => {
    expect(helpedSeconds("magazine")).toBe(2);
    expect(helpedSeconds("drum")).toBe(3);
    expect(helpedSeconds("belt")).toBe(3);
    expect(helpedSeconds("swingOut")).toBeNull();
  });
});

describe("Double-Loading (High-Tech pp. 87, 251)", () => {
  it("takes the book's examples down to 6, 4 and 3 seconds", () => {
    // Model 10: 9 with Fast-Draw, 6 with Double-Loading -- a second a pair, the cases thrown out at once.
    expect(loadingSeconds("swingOut", 6)!.fastDraw - doubleLoadingSaving("swingOut", 6)).toBe(6);
    // Hammer Lifter: 6, then 4 -- two a pair, each case taken out by hand.
    expect(loadingSeconds("breech", 2)!.fastDraw - doubleLoadingSaving("breech", 2)).toBe(4);
    // LeFever: 4, then 3.
    expect(loadingSeconds("breechEjector", 2)!.fastDraw - doubleLoadingSaving("breechEjector", 2)).toBe(3);
  });

  it("does nothing for a magazine or a single round", () => {
    expect(doubleLoadingSaving("magazine", 30)).toBe(0);
    expect(doubleLoadingSaving("gate", 1)).toBe(0);
    expect(doubleLoadingSaving("gate", 5)).toBe(4);
  });
});

describe("loose powder and ball (High-Tech p. 86)", () => {
  const load = (tableSeconds: number, patch: Partial<Parameters<typeof blackPowderLoad>[0]> = {}) =>
    blackPowderLoad({ type: "muzzleloader", skill: "Guns (Rifle)", tableSeconds, lowPosture: false, careful: false, foulingSteps: 0, ...patch });
  const aid = (result: ReturnType<typeof blackPowderLoad>, key: string) => result.aids.find((a) => a.key === key);
  /** The time with these aids, and with Fast-Draw, as the system adds them up. */
  const withAids = (result: ReturnType<typeof blackPowderLoad>, keys: string[]) => {
    const used = keys.map((k) => aid(result, k)!);
    const seconds = result.seconds + used.reduce((s, a) => s + a.seconds, 0);
    const saving = used.reduce((s, a) => (a.fastDrawSeconds === undefined ? s : a.fastDrawSeconds), result.seconds - result.fastDraw);
    return [seconds, seconds - saving];
  };

  it("gives the book's Kentucky rifle: 60/50, patched 42/35, with a flask 55/45 and 37/30", () => {
    const kentucky = load(60);
    expect([kentucky.seconds, kentucky.fastDraw]).toEqual([60, 50]);
    expect(withAids(kentucky, ["greasedPatch"])).toEqual([42, 35]);
    expect(withAids(kentucky, ["flask"])).toEqual([55, 45]);
    expect(withAids(kentucky, ["greasedPatch", "flask"])).toEqual([37, 30]);
  });

  it("halves a musket's time with paper cartridges, Fast-Draw's too", () => {
    const musket = load(40, { skill: "Guns (Musket)" });
    expect([musket.seconds, musket.fastDraw]).toEqual([40, 30]);
    expect(withAids(musket, ["paperCartridges"])).toEqual([20, 15]);
    expect(aid(musket, "greasedPatch")).toBeUndefined();
  });

  it("saves a pistol a fifth of its time with Fast-Draw", () => {
    const pistol = load(20, { skill: "Guns (Pistol)" });
    expect([pistol.seconds, pistol.fastDraw, pistol.cls]).toEqual([20, 16, "smoothPistol"]);
    const rifled = load(30, { skill: "Guns (Pistol)" });
    expect([rifled.seconds, rifled.fastDraw, rifled.cls]).toEqual([30, 24, "rifledPistol"]);
  });

  it("offers no flask or cartridges to a gun whose table time already assumes cartridges", () => {
    // The Colt Navy loads a chamber in 10 seconds, half a caplock pistol's 20.
    expect(loadsLoose("smoothPistol", 10)).toBe(false);
    expect(load(10, { skill: "Guns (Pistol)" }).aids).toEqual([]);
    // The blunderbuss's 35 is loose powder still.
    expect(loadsLoose("musket", 35)).toBe(true);
  });

  it("takes half as long again from anything but standing, for a long arm only", () => {
    expect(load(40, { skill: "Guns (Musket)", lowPosture: true })).toMatchObject({ seconds: 60, fastDraw: 45 });
    expect(load(20, { skill: "Guns (Pistol)", lowPosture: true }).seconds).toBe(20);
    // A black-powder breechloader: whatever the posture.
    expect(load(10, { type: "breechBlackPowder", lowPosture: true })).toMatchObject({ seconds: 10, fastDraw: 8 });
  });

  it("doubles a careful load's time for a musket or rifle, not a pistol", () => {
    expect(load(40, { skill: "Guns (Musket)", careful: true })).toMatchObject({ seconds: 80, fastDraw: 60 });
    expect(load(20, { skill: "Guns (Pistol)", careful: true }).seconds).toBe(20);
  });
});

describe("black-powder fouling (High-Tech p. 86)", () => {
  it("takes a step of Malf. every five shots and a point of Acc every ten", () => {
    expect(foulingPenalty(4)).toEqual({ steps: 0, malfunction: 0, accuracy: 0 });
    expect(foulingPenalty(5)).toEqual({ steps: 1, malfunction: 1, accuracy: 0 });
    expect(foulingPenalty(10)).toEqual({ steps: 2, malfunction: 2, accuracy: 1 });
    expect(foulingPenalty(23)).toEqual({ steps: 4, malfunction: 4, accuracy: 2 });
  });

  it("adds 10% a step to the loading time, rounded up", () => {
    expect(fouledSeconds(40, 0)).toBe(40);
    expect(fouledSeconds(40, 1)).toBe(44);
    expect(fouledSeconds(15, 1)).toBe(17);
    expect(fouledSeconds(60, 2)).toBe(72);
  });

  it("fouls black-powder guns: loose powder, TL5 and earlier, or as the gun says", () => {
    expect(firesBlackPowder("", "muzzleloader", 5)).toBe(true);
    expect(firesBlackPowder("", "gate", 5)).toBe(true);
    expect(firesBlackPowder("", "swingOut", 6)).toBe(false);
    expect(firesBlackPowder("black", "swingOut", 6)).toBe(true);
    expect(firesBlackPowder("other", "tube", 5)).toBe(false);
  });
});
