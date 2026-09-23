/**
 * High-Tech's hand-kept records (#346): what the GCA file lacks or gets wrong,
 * checked against the figures on the book's pages, and the Way of the Pistol
 * style's entries against the records they point to.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXPLOSIVES } from "./explosives/ref.js";
import { chargeOf, firearmBuild } from "./records.js";

const ROOT = join(import.meta.dirname, "../../..");
const PACKS = join(ROOT, "books/high-tech/packs-src");

type Doc = { _id: string; name: string; type: string; system: any };

function read(path: string): Doc[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pack(dir: string): Doc[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => read(join(dir, f)));
}

const byHand = (kind: string) => read(join(PACKS, kind, "high-tech-by-hand.json"));
const named = (docs: Doc[], name: string) => {
  const doc = docs.find((d) => d.name === name);
  if (!doc) throw new Error(`no record ${name}`);
  return doc;
};

describe("High-Tech's hand-kept armour and shields", () => {
  const gear = byHand("equipment");

  it("keeps the four shields as shields, with the table's DB and DR/HP (p. 72)", () => {
    const shields = gear.filter((d) => d.type === "shield").map((d) => [d.name, d.system.db, d.system.dr, d.system.hp, d.system.reference]);
    expect(shields).toEqual([
      ["Bulletproof Shield", 2, 10, 80, "High-Tech p. 72"],
      ["Riot Shield", 2, 7, 40, "High-Tech p. 72"],
      ["Medium Entry Shield", 2, 12, 40, "High-Tech p. 72"],
      ["Large Entry Shield", 3, 12, 60, "High-Tech p. 72"],
    ]);
  });

  it("gives each split-DR armour the split the page means", () => {
    // p. 66 note 2: the higher DR against piercing and cutting, at TL6.
    expect(named(gear, "Silk Vest").system).toMatchObject({ tl: "6", dr: 4, drSplit: 2, flexible: true, concealable: true });
    expect(named(gear, "Silk Vest").system.drSplitAppliesTo).toEqual(expect.arrayContaining(["cr", "imp", "burn"]));
    // p. 68 note 4: the steel toe box is not modelled; DR 2 elsewhere.
    expect(named(gear, "Boots, Steel-Toed").system).toMatchObject({ dr: 2, drSplit: null });
    // p. 74 note 1: DR 6 for the head, 2 everywhere else.
    expect(named(gear, "Closed-Dress Suit").system).toMatchObject({ dr: 2, drByLocation: [{ locations: ["skull", "face"], dr: 6 }] });
  });
});

describe("High-Tech's hand-kept weapons", () => {
  const gear = byHand("equipment");
  const extracted = read(join(PACKS, "equipment/high-tech-gear.json"));

  it("fires rifle grenades from a minimum range (p. 194 note 2)", () => {
    const energa = named(gear, "MECAR Energa-75, 75mm").system.rangedModes[0];
    expect(energa).toMatchObject({ skill: "Guns (Grenade Launcher)", damageFormula: "7dx3", armorDivisor: 10, minRange: 10, maxRange: 300, bulk: -2 });
    expect(energa.linked).toMatchObject({ damage: "7dx2", explosive: true });
    expect(named(gear, "Rafael Simon 150, 100mm").system.rangedModes[0]).toMatchObject({ minRange: 15, maxRange: 35 });
  });

  it("links the glove pistol's shot to a punch (p. 199)", () => {
    const modes = named(gear, "Sedgley Glove Pistol MK 2, .38 S&W").system.meleeModes;
    expect(modes.map((m: any) => m.skill)).toEqual(["Brawling", "Boxing", "Karate"]);
    for (const mode of modes) expect(mode.linked).toMatchObject({ damage: "2d-1", damageType: "pi" });
  });

  it("gives the extracted weapons the modes the file couldn't carry", () => {
    expect(named(extracted, "AN-M8").system.rangedModes[0]).toMatchObject({ damageSpecial: true, radius: 7, thrown: true });
    expect(named(extracted, "AN-M14").system.rangedModes[0]).toMatchObject({ damageSpecial: true, damageType: "burn" });
    expect(named(extracted, "Dan-Inject JM Standard, 11mm").system.rangedModes[0].linked).toMatchObject({ followUp: true, label: "drug effect" });
    expect(named(extracted, "Elgin Cutlass Pistol, .54 Caplock").system.meleeModes[0]).toMatchObject({ skill: "Knife", skillModifier: -1 });
    expect(named(extracted, "Condor AM-402, 12G 2.75''").system.meleeModes[0]).toMatchObject({ skill: "Shortsword", damageBase: "sw" });
  });
});

describe("High-Tech's hand-kept traits, skills and the Way of the Pistol", () => {
  it("keeps Zen Marksmanship as IQ/Very Hard with no default, one per Guns specialty (p. 250)", () => {
    const zen = byHand("skills").filter((d) => d.name.startsWith("Zen Marksmanship"));
    expect(zen.map((d) => d.name)).toContain("Zen Marksmanship (Pistol)");
    for (const doc of zen) expect(doc.system).toMatchObject({ attribute: "IQ", difficulty: "VH", defaults: [] });
  });

  it("costs the style 4 points: its three skills and Style Familiarity (p. 252)", () => {
    const style = named(byHand("templates"), "Way of the Pistol").system;
    const required = style.entries.filter((e: any) => e.group === "");
    expect(style.statedCost).toBe(4);
    expect(required.reduce((sum: number, e: any) => sum + e.points, 0)).toBe(4);
  });

  it("points every entry with a record at one that exists, in this book or the Basic Set", () => {
    const ids = new Set<string>();
    for (const kind of ["skills", "advantages"]) {
      for (const doc of pack(join(PACKS, kind))) ids.add(`Compendium.gurps-compendium-content.high-tech-${kind}.Item.${doc._id}`);
      for (const doc of pack(join(ROOT, "system/packs-src", kind))) ids.add(`Compendium.gworld.${kind}.Item.${doc._id}`);
    }
    const entries = named(byHand("templates"), "Way of the Pistol").system.entries.filter((e: any) => e.uuid);
    expect(entries.length).toBeGreaterThan(40);
    expect(entries.filter((e: any) => !ids.has(e.uuid)).map((e: any) => e.name)).toEqual([]);
  });

  it("needs no other book: no entry points at another book's pack", () => {
    const entries = named(byHand("templates"), "Way of the Pistol").system.entries;
    expect(entries.filter((e: any) => /gurps-compendium-content\.(?!high-tech-)/.test(e.uuid))).toEqual([]);
  });
});

describe("High-Tech's vehicles and personal conveyances (pp. 230-244)", () => {
  const vehicles = byHand("equipment").filter((d) => d.system.category === "vehicle");
  const vehicle = (name: string) => named(vehicles, name).system.vehicle;

  it("keeps the 37 vehicles of the chapter and its 15 personal conveyances", () => {
    const pages = (from: number, to: number) => vehicles.filter((d) => {
      const page = Number(/(\d+)$/.exec(d.system.reference)?.[1]);
      return page >= from && page <= to;
    });
    expect(vehicles).toHaveLength(52);
    expect(pages(230, 231)).toHaveLength(9);
    expect(vehicles.filter((d) => d.system.vehicle.skill === "Piloting (Glider)" || d.name === "Rocket Belt")).toHaveLength(6);
  });

  it("reads a table row into the system's vehicle fields", () => {
    // p. 236: RR Phantom II, 63, 0/3, 12f, 2/38*, 2.5, 0.5, +3, 1+4, 8, 250, $105,000, G4W.
    expect(vehicle("Rolls-Royce Phantom II")).toMatchObject({
      stHp: 63, handling: 0, stability: 3, ht: 12, fragility: "f", acceleration: 2, topSpeed: 38, roadBound: true,
      loadedWeight: 2.5, load: 0.5, sm: 3, occupants: "1+4", dr: 8, range: 250, locations: "G4W", skill: "Driving (Automobile)",
    });
    expect(named(vehicles, "Rolls-Royce Phantom II").system.cost).toBe(105000);
    // p. 231: a kayak's draft; p. 232: a glider's stall speed.
    expect(vehicle("Folding Kayak")).toMatchObject({ locomotion: "water", draft: 2, range: 0 });
    expect(vehicle("Glider")).toMatchObject({ locomotion: "air", stall: 7, fragility: "c" });
  });

  it("splits DR by face as the table and the text give it", () => {
    // p. 244: 1,155/165, top 90, underbody 70, the turret 1,375 in front.
    expect(vehicle("Uralvagonzavod T-72A")).toMatchObject({ dr: 1155, drOther: 165, drTop: 90, drUnderbody: 70, drByLocation: { mainTurret: 1375 } });
    // p. 234: 45/20, top 20, underbody 15, turret 60.
    expect(vehicle("Renault FT17")).toMatchObject({ dr: 45, drOther: 20, drTop: 20, drUnderbody: 15, drByLocation: { mainTurret: 60 } });
    // p. 236 note 1: an unarmoured underbody and DR 10 windows.
    expect(vehicle("Cadillac V-16 Armored")).toMatchObject({ dr: 15, drUnderbody: 5, drByLocation: { largeWindow: 10 } });
    // p. 233 note 1: thinner top armour.
    expect(vehicle("Junkers J.I")).toMatchObject({ dr: 15, drTop: 5 });
    expect(vehicle("Ford V-8").drOther).toBeUndefined();
  });
});

describe("High-Tech's gear captured from chapters 2 and 3 (#348)", () => {
  const captured = read(join(PACKS, "equipment/high-tech-captured-core-general.json"));
  const gear = [...captured, ...byHand("equipment")];
  const sys = (name: string) => named(gear, name).system;
  const draw = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.power?.draw;

  it("cites a page of chapters 2 and 3 on every captured record, with no book prose", () => {
    for (const doc of captured) {
      const page = Number(/^High-Tech p\. (\d+)$/.exec(doc.system.reference)?.[1]);
      expect(page, doc.name).toBeGreaterThanOrEqual(13);
      expect(page, doc.name).toBeLessThanOrEqual(61);
      expect(doc.system.description, doc.name).toBe("");
    }
  });

  it("writes every battery in the book's own sizes (p. 13)", () => {
    const sizes = ["T", "XS", "S", "M", "L", "VL"];
    const powered = gear.filter((d) => d.system.extensions?.["gurps-compendium-content"]?.power);
    expect(powered.length).toBeGreaterThan(60);
    for (const doc of powered) {
      // Gear draws on its batteries; a weapon (#349) is loaded with them.
      const power = doc.system.extensions["gurps-compendium-content"].power;
      const cell = power.draw?.cell ?? power.cell;
      if (cell !== undefined) expect(sizes, doc.name).toContain(cell);
    }
    // p. 21: 4×S/4 hrs.; p. 38: 3×XS/10 hrs.
    expect(draw("Head-Up Display (HUD)")).toEqual({ cell: "S", cells: 4, endurance: "4 hrs.", raw: "4×S/4 hrs." });
    expect(draw("Small Radio (TL8)")).toMatchObject({ cell: "XS", cells: 3, endurance: "10 hrs." });
  });

  it("names an item printed at two TLs for each, and a unit where the price is one", () => {
    expect(sys("Magnetic Tape (TL7)")).toMatchObject({ tl: "7", cost: 100, weight: 7 });
    expect(sys("Magnetic Tape (TL8)")).toMatchObject({ tl: "8", cost: 50, weight: 0.5 });
    expect(sys("Gasoline (per gallon)")).toMatchObject({ cost: 1.5, weight: 6, lc: 4 });
    expect(sys('Rope, 1/2", Manila (10 yards)')).toMatchObject({ tl: "6", cost: 10, weight: 2.2 });
  });

  it("keeps the tool kits' quality and the skills they're for (p. 24)", () => {
    expect(sys("Mini-Tool Kit (Electronics Repair)")).toMatchObject({ cost: 400, weight: 2, equipmentModifier: -2, forSkills: ["Electronics Repair"] });
    expect(sys("Mini-Tool Kit")).toMatchObject({ cost: 200, weight: 4, equipmentModifier: -2 });
    expect(sys("Workshop (Electronics Repair)")).toMatchObject({ cost: 30000, equipmentQuality: "fine", forSkills: ["Electronics Repair"] });
    expect(sys("Workshop CNC")).toMatchObject({ equipmentQuality: "fine", forSkills: ["Machinist"] });
    expect(sys("Fishing Outfit")).toMatchObject({ equipmentQuality: "fine", forSkills: ["Fishing"] });
  });

  it("says what each tool, kit and hazard is for the tools rules (#360)", () => {
    const tool = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.tool;
    for (const [name, kit] of [["Mini-Tool Kit", "mini"], ["Portable Tool Kit (Electronics Repair)", "portable"], ["Workshop", "workshop"]]) expect(tool(name!)?.kit, name).toBe(kit);
    // p. 25: sw-3(2) cut a second to bars, chains and cables; 12d(2) on an ST+4 roll.
    expect(tool("Hacksaw").work).toMatchObject({ damage: "sw-3", type: "cut", divisor: 2, every: 1, against: "metalBars", carbideBonus: 1 });
    expect(tool("Bolt Cutters, Heavy").work).toMatchObject({ damage: "12d", every: 0, stRoll: 4 });
    // p. 27: the steam drill and the jackhammer.
    expect(tool("Steam-Powered Drill").work).toMatchObject({ damage: "6d", type: "pi++", divisor: 2 });
    expect(tool("Jackhammer").work).toMatchObject({ damage: "7d", type: "pi++", against: "concreteRock" });
    expect(tool("Lock Buster").work).toMatchObject({ damage: "sw+4", multiplier: 2 });
    expect(tool("Hand Ram")).toMatchObject({ readies: 2, readiesWaivedAtSt: 20 });
    expect(tool("Rescue Spreader/Cutter (TL8)")).toMatchObject({ readies: 4 });
    for (const name of ["Chainsaw (TL7)", "Chainsaw (TL8)"]) expect(tool(name)?.use, name).toBe("chainsaw");
    for (const name of ["Pneumatic Nail Gun", "Powder-Actuated Nail Gun", "Combustion Nail Gun"]) expect(tool(name)?.use, name).toBe("nailGun");
    // p. 31: 4d×2 and 6d×5 burn ex.
    expect(tool("Propane Cylinder, Small").hazard).toMatchObject({ kind: "explosion", damage: "4dx2" });
    expect(tool("Propane Cylinder, Large").hazard).toMatchObject({ kind: "explosion", damage: "6dx5" });
    expect(tool("Gas Range").hazard).toMatchObject({ kind: "burn", damage: "1d-1", upTo: "2d", perSecond: true });
    expect(tool("Mobile Lab")).toMatchObject({ setupSeconds: 900 });
  });

  it("gives the tools that attack their modes (pp. 27-30)", () => {
    // p. 27: sw+1d cut, Reach 1, Parry 0U, ST 11 at TL7 and 10 at TL8.
    expect(sys("Chainsaw (TL7)").meleeModes[0]).toMatchObject({ skill: "Two-Handed Axe/Mace", damageBase: "sw", damageExtraDice: 1, damageType: "cut", reach: "1", unbalanced: true, minSt: 11 });
    expect(sys("Chainsaw (TL8)")).toMatchObject({ weight: 13 });
    // p. 28: 2d-1 pi-, Acc 0, Range 5/25, RoF 1, Shots 50(3), ST 11, Bulk -4, Rcl 2.
    expect(sys("Pneumatic Nail Gun").rangedModes[0]).toMatchObject({ damageFormula: "2d-1", damageType: "pi-", accuracy: 0, halfDamageRange: 5, maxRange: 25, shots: "50(3)", bulk: -4, recoil: 2 });
    // pp. 29-30: the hand ram, the doorbuster and the spreader/cutter.
    expect(sys("Hand Ram").meleeModes[0]).toMatchObject({ skill: "Forced Entry", damageBase: "sw", damageExtraDice: 3, damageModifier: 1, minSt: 20 });
    expect(sys("Doorbuster").meleeModes[0]).toMatchObject({ damageFormula: "4d", damageType: "pi++", armorDivisor: 2 });
    expect(sys("Rescue Spreader/Cutter (TL8)").meleeModes[0]).toMatchObject({ damageFormula: "6dx5", armorDivisor: 2, minSt: 14 });
  });

  it("settles what reading order got wrong beside a sidebar (p. 31)", () => {
    expect(sys("Wristwatch")).toMatchObject({ cost: 25, weight: 0, lc: 4 });
    expect(sys("Grooming Kit")).toMatchObject({ cost: 25, weight: 0.5 });
    expect(sys("Hip Flask")).toMatchObject({ tl: "5", cost: 10, weight: 1 });
  });

  it("prices personal basics as a share of the cost of living (p. 59)", () => {
    expect(sys("Personal Basics")).toMatchObject({ cost: 0, costOfLivingPercent: 1, weight: 1 });
  });

  it("says what each piece of survival, maritime and parachuting gear is (#363)", () => {
    const survival = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.survival;
    const shelters: Array<[string, number]> = [["Blanket", -2], ["Sleeping Bag", 0], ["Tarp", 1], ["Tent, Shelter Half", 1], ["Tent, Wall", 1], ["Sleeping Bag, Heavy", 3], ["Blanket, Emergency", -1], ["Tent, Dome", 2], ["Tent, Personal", 1]];
    for (const [name, value] of shelters) expect(survival(name), name).toMatchObject({ kind: "shelter", value });
    expect(survival("Sleeping Bag").valueAtTl8).toBe(1);
    for (const name of ["Flint and Steel", "Magnifying Glass", "Matches (box of 50)", "Cigarette Lighter", "Fire-Starter Paste", "Solar Reflector"]) expect(survival(name)?.kind, name).toBe("fireStarter");
    expect(survival("Trap, Large Predator")).toMatchObject({ kind: "trap", value: 15 });
    expect(survival("Trap, Beaver")).toMatchObject({ kind: "trap", value: 8 });
    expect(sys("Pilot's Survival Vest")).toMatchObject({ forSkills: ["Survival (Jungle)"], equipmentQuality: "good" });
    expect(sys("Covert Survival Kit").forSkills).toEqual(["Survival (Woodlands)"]);
    for (const name of ["Life Jacket", "Flotation Belt", "Flotation Vest"]) expect(survival(name)?.kind, name).toBe("lifeJacket");
    expect(survival("Parachute (TL6)")).toMatchObject({ kind: "parachute", maxLbs: 150, maxLbsTl7: 200, maxLbsTl8: 250, openingYards: 80, descent: 5 });
    expect(survival("Parachute (TL5)")).toMatchObject({ nausea: -4 });
    expect(survival("Mini-Parachute")).toMatchObject({ openingYards: 40 });
    expect(survival("Ram-Air Parachute")).toMatchObject({ kind: "parachute", maxLbs: 400 });
    expect(survival("Parachute Container")).toMatchObject({ kind: "cargoChute", maxLbs: 250, descent: 6 });
    expect(survival("Snack")?.kind).toBe("snack");
    expect(survival("Sports Drink")?.kind).toBe("sportsDrink");
  });

  it("says what each piece of expedition gear is for the expedition rules (#362)", () => {
    const exp = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.expedition;
    // pp. 51-52: a radius, a beam, or both; the tactical lights also punch and club.
    expect(exp("Kerosene Lantern").light).toEqual({ kind: "kerosene", radius: 5, beam: 0 });
    expect(exp("Carbide Lamp").light).toEqual({ kind: "lantern", radius: 5, beam: 10 });
    expect(exp("Floodlight").light).toEqual({ kind: "electric", radius: 0, beam: 200 });
    expect(exp("Large Tactical Light (TL8)").light).toEqual({ kind: "tactical", radius: 0, beam: 100 });
    expect(draw("Large Tactical Light (TL8)")).toMatchObject({ cell: "XS", cells: 4 });
    expect(sys("Small Tactical Light (TL7)").meleeModes.map((m: any) => m.skill)).toEqual(["Boxing", "Brawling", "Karate"]);
    expect(sys("Large Tactical Light (TL7)").meleeModes[0]).toMatchObject({ skill: "Shortsword", damageBase: "sw", damageType: "cr" });
    // pp. 52-53: instruments and maps.
    expect(exp("Global Positioning System Receiver").navigation).toBe("gps");
    expect(exp("Ship's Chronometer").navigation).toBe("chronometer");
    expect(sys("Topographic Map")).toMatchObject({ cost: 30, weight: 0.1, reference: "High-Tech p. 53" });
    expect(exp("Road Atlas").navigation).toBe("map");
    // pp. 54-56: load-bearing gear, packs and climbing gear.
    expect(exp("Web Gear").carry).toBe("lbe");
    expect(exp("Backpack, Small").carry).toBe("backpack");
    expect(exp("Mini-Rappel Kit").climbing).toBe("rappelKit");
    expect(sys("Climbing Kit").forSkills).toEqual(["Climbing"]);
    expect(exp("Suction Cup").climbing).toBe("suctionCup");
    expect(sys("Ice Axe").meleeModes[0]).toMatchObject({ skill: "Axe/Mace", damageBase: "sw", damageModifier: 1, damageType: "imp" });
  });
});

describe("High-Tech's defences and firearm accessories (#349)", () => {
  const defences = read(join(PACKS, "equipment/high-tech-captured-defenses.json"));
  const accessories = read(join(PACKS, "equipment/high-tech-captured-accessories.json"));
  const gear = [...defences, ...accessories, ...byHand("equipment")];
  const sys = (name: string) => named(gear, name).system;
  const draw = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.power?.draw;

  it("cites a page of its own range on every captured record, with no book prose", () => {
    for (const [docs, from, to] of [[defences, 62, 77], [accessories, 153, 161]] as const) {
      for (const doc of docs) {
        const page = Number(/^High-Tech p\. (\d+)$/.exec(doc.system.reference)?.[1]);
        expect(page, doc.name).toBeGreaterThanOrEqual(from);
        expect(page, doc.name).toBeLessThanOrEqual(to);
        expect(doc.system.description, doc.name).toBe("");
      }
    }
  });

  it("prices outfits as a share of the cost of living (pp. 63-64)", () => {
    expect(sys("Ordinary Clothes")).toMatchObject({ cost: 0, costOfLivingPercent: 20, weight: 2, lc: 4 });
    expect(sys("Arctic Clothes")).toMatchObject({ costOfLivingPercent: 50, weight: 15 });
    expect(sys("High-Fashion Attire")).toMatchObject({ costOfLivingPercent: 100 });
    expect(sys("Undercover Clothing (Ordinary Clothes, +2)")).toMatchObject({ costOfLivingPercent: 400, equipmentQuality: "fine", forSkills: ["Holdout"] });
    expect(sys("Long Coat")).toMatchObject({ cost: 50, weight: 5, lc: 4 });
  });

  it("keeps the plates and the eye and groin protection as armour (pp. 67, 71)", () => {
    expect(named(gear, "Trauma Plate")).toMatchObject({ type: "armor", system: { dr: 25, frontOnly: true, cost: 500, weight: 4, lc: 3 } });
    expect(named(gear, "Anti-Stab Plate").system).toMatchObject({ dr: 4, locations: ["vitals"], frontOnly: true });
    expect(named(gear, "Ballistic Sunglasses")).toMatchObject({ type: "armor", system: { dr: 4, locations: ["eye"] } });
    // DR 2 against crushing, 1 against the rest, from the front.
    expect(named(gear, "Cup").system).toMatchObject({ dr: 2, drSplit: 1, frontOnly: true, locations: ["groin"] });
    expect(named(gear, "Cup").system.drSplitAppliesTo).not.toContain("cr");
    expect(named(gear, "Interim Small Arms Protective Overvest (ISAPO)").system).toMatchObject({ dr: 30, cost: 700, weight: 25 });
  });

  it("prices camouflage on ordinary clothes, with its quality to Camouflage (pp. 76-77)", () => {
    expect(sys("Basic Camouflage (Ordinary Clothes)")).toMatchObject({ costOfLivingPercent: 40, equipmentQuality: "fine", forSkills: ["Camouflage"] });
    expect(sys("Ghillie Suit")).toMatchObject({ cost: 500, weight: 12, forSkills: ["Camouflage"] });
    expect(sys("IR Camouflage Net")).toMatchObject({ cost: 800, weight: 100, lc: 4 });
  });

  it("keeps holsters, sights and suppressors with their batteries (pp. 153-161)", () => {
    expect(sys("Belt Holster")).toMatchObject({ tl: "5", cost: 25, weight: 0.5, lc: 4 });
    expect(sys("Sleeve Holster")).toMatchObject({ tl: "6", cost: 500, weight: 0.5 });
    // "3-4 lbs.": the lower is recorded, not the 34 the text reads.
    expect(sys("Fixed-Power Scope (TL5, per +1 Acc)")).toMatchObject({ cost: 100, weight: 3 });
    expect(draw("Night Sight")).toMatchObject({ cell: "S", cells: 4, endurance: "30 hrs." });
    expect(draw("Integral Targeting Laser (Sidearm)")).toMatchObject({ cell: "T", cells: 4, endurance: "2 hrs." });
    expect(sys("Computer Sight (Night Vision)")).toMatchObject({ cost: 22500, lc: 2 });
    expect(sys("Computer Sight (Infravision)")).toMatchObject({ cost: 30000, lc: 2 });
    expect(sys("Detachable Baffle Suppressor, .22-caliber (per -1 Hearing)")).toMatchObject({ cost: 100, weight: 0.25, lc: 3 });
  });

  it("captures nothing the data file or the hand-kept records already hold", () => {
    const others = [...read(join(PACKS, "equipment/high-tech-armor.json")), ...read(join(PACKS, "equipment/high-tech-gear.json")), ...byHand("equipment")];
    const held = new Set(others.map((d) => d.name.toLowerCase()));
    expect([...defences, ...accessories].filter((d) => held.has(d.name.toLowerCase())).map((d) => d.name)).toEqual([]);
  });

  it("says what each piece of camouflage is (#385)", () => {
    const camouflage = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.camouflage;
    expect(camouflage("Camouflage Net")).toEqual({ pattern: "simple", net: true });
    expect(camouflage("Ghillie Suit")).toEqual({ pattern: "ghillie" });
    expect(camouflage("Infrared-Suppressing Poncho")).toEqual({ pattern: "simple", infrared: true });
    expect(camouflage("IR Camouflage Net")).toEqual({ pattern: "simple", infrared: true, net: true });
    expect(camouflage("Simple Camouflage (Ordinary Clothes)")).toEqual({ pattern: "simple" });
    // The by-hand records' prices already hold the pattern's share of the clothing.
    expect(camouflage("Basic Camouflage (Ordinary Clothes)")).toEqual({ pattern: "basic", builtIn: true });
    expect(camouflage("Advanced Camouflage (Ordinary Clothes)")).toEqual({ pattern: "advanced", builtIn: true });
    expect(camouflage("Reversible Camouflage (Ordinary Clothes, Two Basic Patterns)")).toEqual({ pattern: "basic", second: "basic", builtIn: true });
    expect(camouflage("Scent Masking (Ordinary Clothes)")).toEqual({ scent: true, builtIn: true });
  });
});

describe("High-Tech's explosives, mines, bombs and melee weapons (#349)", () => {
  const captured = read(join(PACKS, "equipment/high-tech-captured-weaponry.json"));
  const gear = [...captured, ...byHand("equipment")];
  const sys = (name: string) => named(gear, name).system;
  const ranged = (name: string, i = 0) => sys(name).rangedModes[i];
  const melee = (name: string, i = 0) => sys(name).meleeModes[i];

  it("cites a page of pp. 180-201 on every captured record, with no book prose", () => {
    for (const doc of captured) {
      const page = Number(/^High-Tech p\. (\d+)$/.exec(doc.system.reference)?.[1]);
      expect(page, doc.name).toBeGreaterThanOrEqual(180);
      expect(page, doc.name).toBeLessThanOrEqual(201);
      expect(doc.system.description, doc.name).toBe("");
    }
  });

  it("links every explosive to its row of the REF table (p. 183), with the pounds it holds", () => {
    const charges = gear.filter((d) => d.system.extensions?.["gurps-compendium-content"]?.explosive);
    expect(charges.length).toBe(11);
    for (const doc of charges) expect(chargeOf(doc), doc.name).not.toBeNull();
    expect(chargeOf(named(gear, "TNT (per pound)"))).toEqual({ row: EXPLOSIVES.find((r) => r.type === "TNT"), pounds: 1, shockOn: 0, homeMade: "" });
    expect(chargeOf(named(gear, "Plastic Explosive (per pound)"))?.row.ref).toBe(1.4);
    expect(chargeOf(named(gear, "Foam Explosive (Aerosol Can)"))).toMatchObject({ row: { ref: 1.1 }, pounds: 0.9 });
    expect(sys("Improved Black Powder (per pound)")).toMatchObject({ tl: "5", cost: 5, weight: 1, lc: 3 });
    expect(chargeOf({ system: {} })).toBeNull();
  });

  it("gives land mines their explosion and fragments (p. 189)", () => {
    expect(ranged("TMi35")).toMatchObject({ damageFormula: "5dx8", explosive: true, blastPlacement: "contact", skill: "Explosives (Demolition)" });
    expect(ranged("OZM-3")).toMatchObject({ damageFormula: "5d", fragmentation: "4d", explosive: true });
    expect(sys("M18A1 Claymore")).toMatchObject({ cost: 50, weight: 3.5, lc: 1 });
    // Note 1: 700 pellets, 2d(0.5) pi-, Range 55/270, Rcl 1.
    expect(ranged("M18A1 Claymore", 1)).toMatchObject({ damageFormula: "2d", damageType: "pi-", armorDivisor: 0.5, halfDamageRange: 55, maxRange: 270, projectiles: 700, recoil: 1 });
    expect(ranged("M5 Modular Crowd Control Munition", 1)).toMatchObject({ damageFormula: "1d-2", damageType: "cr", armorDivisor: 0.2, projectiles: 600 });
  });

  it("reads the bombs table by position (p. 194)", () => {
    expect(sys("SC250, 370mm")).toMatchObject({ cost: 3500, weight: 548, lc: 1 });
    expect(ranged("SC250, 370mm")).toMatchObject({ skill: "Artillery (Bombs)", damageFormula: "6dx35", fragmentation: "6dx3" });
    expect(ranged("500-lb. CBU-55/B, 256mm")).toMatchObject({ damageFormula: "6dx65", fragmentation: "" });
    expect(ranged("Little Boy (12.5 kt)").linked).toMatchObject({ damage: "6dx6500", damageType: "burn", radiation: true, surge: true, explosive: true });
  });

  it("gives sprays and lasers their afflictions, the dazzler a cone (pp. 180-181)", () => {
    expect(melee("Pepper Spray")).toMatchObject({ reach: "1,2", affliction: true, afflictionAttribute: "HT", afflictionModifier: -4 });
    expect(ranged("NORINCO QXJ04")).toMatchObject({ afflictionModifier: -5, accuracy: 6, scopeBonus: 1, areaAttack: true, coneMaxWidth: 3, shots: "100(3)" });
    expect(ranged("NORINCO ZM87")).toMatchObject({ skill: "Gunner (Beams)", afflictionModifier: -10, minSt: 17, mount: "mounted" });
  });

  it("reads the melee weapon table's rows (p. 200)", () => {
    expect(sys("Katana")).toMatchObject({ tl: "6", cost: 550, weight: 3.75 });
    expect(melee("Katana")).toMatchObject({ skill: "Broadsword", damageBase: "sw", damageModifier: 1, damageType: "cut", reach: "1", minSt: 10 });
    expect(melee("Trench Knife", 2)).toMatchObject({ skill: "Brawling", damageBase: "thr", unarmedBonus: true });
    expect(melee("Switchblade")).toMatchObject({ canParry: false, minSt: 5 });
    expect(melee("Sword Cane")).toMatchObject({ skill: "Smallsword", parryModifier: -2, isFencing: true, reach: "C,1" });
    // HT-3(0.5) aff, linked to the prod's 1d-3 burn.
    expect(melee("Cattle Prod")).toMatchObject({ damageFormula: "1d-3", damageType: "burn", linked: { affliction: true, afflictionModifier: -3, armorDivisor: 0.5 } });
    expect(melee("Stun Gun")).toMatchObject({ affliction: true, armorDivisor: 0.5, canParry: false });
    expect(melee("Bayonet (TL4-6 Long Arm)")).toMatchObject({ skill: "Spear", damageModifier: 3, damageType: "imp", reach: "1,2*" });
    expect(melee("Spiked Tomahawk", 1)).toMatchObject({ damageModifier: -1, damageType: "imp" });
    expect(sys("Spiked Tomahawk").quality).toBe("fine");
  });

  it("builds compound bows at double cost, shooting two ST higher than they draw (p. 201)", () => {
    const longbow = sys("Compound Longbow");
    expect(longbow).toMatchObject({ tl: "7", cost: 400 });
    expect(longbow.rangedModes[0]).toMatchObject({ minSt: 11, weaponSt: 13 });
    expect(ranged("Speargun")).toMatchObject({ skill: "Crossbow (Speargun)", damageFormula: "1d", accuracy: 2, halfDamageRange: 100, maxRange: 150, bulk: -6 });
    const skills = byHand("skills").map((d) => d.name);
    expect(skills).toEqual(expect.arrayContaining(["Bow (Slingshot)", "Crossbow (Speargun)"]));
  });

  it("gives a text variant its parent's figures but for what the text changes (pp. 190-193)", () => {
    expect(sys("StiHGr24 (Fragmentation Sleeve)")).toMatchObject({ weight: 1.7, cost: 20 });
    expect(ranged("StiHGr24 (Fragmentation Sleeve)")).toMatchObject({ damageFormula: "5d", fragmentation: "2d", thrown: true });
    expect(ranged("Grenade à Main Mle 1882").malfunction).toBe(16);
    expect(ranged("HASAG GGPzgr40, 40mm")).toMatchObject({ armorDivisor: 10, minRange: 10, maxRange: 150, linked: { damage: "6d", explosive: true } });
  });
});

describe("High-Tech's covert-ops, security and medical gear (#350)", () => {
  const captured = read(join(PACKS, "equipment/high-tech-captured-covert-medical.json"));
  const gear = [...captured, ...byHand("equipment")];
  const sys = (name: string) => named(gear, name).system;
  const draw = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.power?.draw;

  it("cites a page of pp. 202-227 on every captured record, with no book prose", () => {
    for (const doc of captured) {
      const page = Number(/^High-Tech p\. (\d+)$/.exec(doc.system.reference)?.[1]);
      expect(page, doc.name).toBeGreaterThanOrEqual(202);
      expect(page, doc.name).toBeLessThanOrEqual(227);
      expect(doc.system.description, doc.name).toBe("");
    }
  });

  it("keeps burglary and disguise tools with the skills they're for (pp. 213-215)", () => {
    expect(sys("Lockpicks")).toMatchObject({ tl: "5", cost: 50, weight: 0, lc: 3, category: "tool", equipmentQuality: "basic", forSkills: ["Lockpicking/TL"] });
    expect(sys("Electronic Lockpicking Kit")).toMatchObject({ forSkills: ["Electronics Operation/TL (Security)"] });
    expect(draw("Electronic Lockpicking Kit")).toEqual({ cell: "S", cells: 3, endurance: "1 week", raw: "3×S/week" });
    expect(sys("Advanced Disguise Kit")).toMatchObject({ cost: 4000, weight: 250, equipmentQuality: "fine", forSkills: ["Disguise/TL"] });
    expect(sys("Smuggler's Attaché Case")).toMatchObject({ tl: "6", cost: 400, equipmentQuality: "fine", forSkills: ["Smuggling"] });
    expect(sys("Forgery Tools")).toMatchObject({ tl: "6", cost: 1200, weight: 20, forSkills: ["Forgery/TL"] });
    // p. 207: +4 (quality) to Search, which no grade holds.
    expect(sys("CT Scanner")).toMatchObject({ equipmentQuality: "best", equipmentModifier: 4, forSkills: ["Search"] });
  });

  it("names each tool's skills as the skill records are named, which a carried tool is matched to", () => {
    const skills = new Set([...pack(join(ROOT, "system/packs-src/skills")), ...pack(join(PACKS, "skills"))].map((d) => d.name));
    const tools = gear.filter((d) => d.system.forSkills?.length && Number(/(\d+)$/.exec(d.system.reference)?.[1]) >= 202);
    expect(tools.length).toBeGreaterThan(30);
    for (const doc of tools) for (const skill of doc.system.forSkills) expect(skills.has(skill), `${doc.name}: ${skill}`).toBe(true);
  });

  it("gives traps and barriers the harm they do (pp. 203-204)", () => {
    expect(sys("Caltrops (one hex)")).toMatchObject({ cost: 1, weight: 0.5, lc: 4 });
    expect(sys("Caltrops (one hex)").meleeModes[0]).toMatchObject({ skill: "Traps", damageBase: "thr", damageModifier: -3, damageType: "imp" });
    expect(sys("Stake Pit").meleeModes[0]).toMatchObject({ damageBase: "thr", damageModifier: 0, damageType: "imp" });
    expect(sys("Razor Wire (15-yard coil)").meleeModes[0]).toMatchObject({ damageFormula: "1d-3", damageType: "cut" });
    expect(sys("Lethal Fence (control box and 1/4 mile)")).toMatchObject({ cost: 10000, lc: 2 });
    expect(sys("Lethal Fence (control box and 1/4 mile)").meleeModes[0]).toMatchObject({ damageFormula: "3d", damageType: "burn" });
    expect(sys("Cattle Fence (control box and 1/4 mile)").meleeModes[0]).toMatchObject({ affliction: true, afflictionAttribute: "HT", afflictionModifier: 0 });
    expect(sys("Barbed Wire (15-yard coil)").meleeModes).toEqual([]);
  });

  it("keeps restraints and reads a week's or month's battery (pp. 208-217)", () => {
    expect(sys("Handcuffs")).toMatchObject({ tl: "6", cost: 50, weight: 0.5, lc: 4 });
    expect(sys("Flex Cuffs (pack of 10)")).toMatchObject({ tl: "7", cost: 5, weight: 0.25 });
    expect(sys("Leg Irons (Ball and Chain)")).toMatchObject({ cost: 120, weight: 52 });
    expect(draw("Audio Bug (TL8)")).toEqual({ cell: "T", cells: 1, endurance: "1 month", raw: "T/month" });
    expect(draw("Electronic Stethoscope")).toMatchObject({ cell: "T", cells: 4, endurance: "1 week" });
    expect(sys("Portable X-Ray Machine (TL8)")).toMatchObject({ cost: 50000, weight: 25, lc: 3 });
  });

  it("settles the kits' figures and quality against the page (pp. 220-221)", () => {
    // Reading order ran the body bag's line into the first aid kit and the kit's into the doctor's bag.
    expect(sys("First Aid Kit")).toMatchObject({ tl: "7", cost: 50, weight: 2, lc: 4, equipmentQuality: "good", forSkills: ["First Aid/TL"] });
    expect(sys("Doctor's Bag")).toMatchObject({ tl: "5", cost: 200, weight: 10, lc: 3, equipmentQuality: "good", forSkills: ["First Aid/TL"] });
    expect(sys("Crash Kit")).toMatchObject({ cost: 200, weight: 10, equipmentQuality: "fine" });
    expect(sys("Small First Aid Kit")).toMatchObject({ cost: 10, equipmentQuality: "basic", forSkills: ["First Aid/TL"] });
    expect(sys("Body Bag")).toMatchObject({ cost: 5, weight: 2.5 });
    expect(sys("Iron Lung")).toMatchObject({ cost: 5000, weight: 700, lc: 4 });
    expect(sys("Decontamination Sprayer")).toMatchObject({ cost: 500, weight: 35, lc: 3 });
  });

  it("gives surgical kits their built-in modifier and imaging +TL/2 to Diagnosis (pp. 222-224)", () => {
    expect(sys("Surgical Kit (TL5)")).toMatchObject({ equipmentQuality: "basic", equipmentModifier: -2, forSkills: ["Surgery/TL"] });
    expect(sys("Surgical Kit (TL8)")).toMatchObject({ equipmentModifier: 2 });
    expect(sys("Operating Theater")).toMatchObject({ equipmentQuality: "fine", forSkills: ["Surgery/TL"] });
    expect(sys("CT or MRI Scanner")).toMatchObject({ cost: 500000, weight: 6000, equipmentQuality: "best", forSkills: ["Diagnosis/TL"] });
    expect(sys("IV Stand").meleeModes[0]).toMatchObject({ skill: "Two-Handed Axe/Mace", damageBase: "sw", damageModifier: 1, skillModifier: -2 });
  });

  it("keeps the 14 drugs and 5 poisons as consumables under the book's names (pp. 226-227)", () => {
    const drugs = ["Ammonia Inhalants (vial)", "Castor Oil (10 doses)", "Morphine", "Quinine", "Activated Charcoal", "Analgesics (100 doses)",
      "Antibiotics", "Antibiotics (Two-Week Course)", "Antibiotic Ointment (10-dose tube)", "Antimalarial Pills (30 doses)", "Antitoxin Kit",
      "Chelating Agents", "Psychiatric Drugs", "Truth Serum", "DMSO"];
    const poisons = ["Curare", "Ricin", "Strychnine", "Botulin Toxins", "Irradiated Thallium"];
    for (const name of [...drugs, ...poisons]) expect(sys(name).category, name).toBe("consumable");
    for (const name of poisons) expect(sys(name).lc, name).toBe(1);
    expect(sys("Morphine")).toMatchObject({ tl: "5", cost: 1, weight: 0, lc: 3 });
    expect(sys("Antibiotics")).toMatchObject({ cost: 0.5, lc: 3 });
    expect(sys("Irradiated Thallium")).toMatchObject({ tl: "7", cost: 1000 });
  });

  it("captures nothing the data file or the hand-kept records already hold", () => {
    const others = [...read(join(PACKS, "equipment/high-tech-armor.json")), ...read(join(PACKS, "equipment/high-tech-gear.json")), ...byHand("equipment")];
    const held = new Set(others.map((d) => d.name.toLowerCase()));
    expect(captured.filter((d) => held.has(d.name.toLowerCase())).map((d) => d.name)).toEqual([]);
  });

  it("says what each piece of emergency and facility gear is for the medical rules (#390)", () => {
    const medical = (name: string) => sys(name).extensions?.["gurps-compendium-content"]?.medical;
    // pp. 219-221.
    expect(medical("Tracheotomy Kit")).toEqual({ kind: "airway" });
    expect(medical("Manual Defibrillator (TL7)")).toEqual({ kind: "defibrillator", value: 2 });
    expect(medical("Manual Defibrillator (TL8)")).toEqual({ kind: "defibrillator", value: 3 });
    expect(draw("Manual Defibrillator (TL8)")).toMatchObject({ cell: "L", cells: 1 });
    expect(medical("Automatic External Defibrillator (AED)")).toEqual({ kind: "aed" });
    expect(medical("IV Kit")).toEqual({ kind: "ivKit" });
    for (const name of ["Plasma (pint)", "Whole Blood (pint)", "Saline"]) expect(medical(name), name).toEqual({ kind: "ivFluid" });
    expect(medical("Dextrose")).toEqual({ kind: "ivFluid", meal: true });
    for (const name of ["Doctor's Bag", "Small First Aid Kit", "First Aid Kit"]) expect(medical(name), name).toEqual({ kind: "firstAidKit" });
    expect(medical("Crash Kit")).toEqual({ kind: "firstAidKit", fluids: true });
    expect(medical("Hemostatic Bandages")).toEqual({ kind: "hemostatic" });
    // pp. 222-225.
    expect(medical("X-Ray Machine")).toEqual({ kind: "imaging", value: 1 });
    for (const name of ["Portable X-Ray Machine (TL7)", "Compact X-Ray Machine", "CT or MRI Scanner", "Semi-Portable Ultrasound", "Portable Ultrasound"]) expect(medical(name), name).toEqual({ kind: "imaging" });
    expect(medical("Portable Surgery")).toEqual({ kind: "portableSurgery" });
    for (const tl of [5, 6, 7, 8]) expect(medical(`Surgical Kit (TL${tl})`)).toEqual({ kind: "surgicalKit" });
    expect(medical("Suturing Kit")).toEqual({ kind: "suturingKit" });
    expect(medical("Chloroform or Ether Mask")).toEqual({ kind: "anesthesia" });
    expect(medical("Portable Anesthesia Machine")).toEqual({ kind: "anesthesia", value: 2 });
    expect(medical("Antiseptic (10 uses)")).toEqual({ kind: "antiseptic" });
  });
});

describe("High-Tech's guns built for sustained fire and underwater (#368)", () => {
  const gear = read(join(PACKS, "equipment/high-tech-gear.json"));
  const build = (name: string) => firearmBuild(named(gear, name));

  it("gives the water-cooled machine guns their jackets (pp. 129-131)", () => {
    expect(build("Maxim Mk I, .450 MH").waterPints).toBe(7.5);
    expect(build("Maxim MG08, 7.92x57mm").waterPints).toBe(7);
    expect(build("Vickers Mk I, .303").waterPints).toBe(9);
    expect(build("Browning M1917, .30-06").waterPints).toBe(8);
  });

  it("marks the barrels the book says to treat as extra-heavy, and the quick barrel changes (pp. 131-136)", () => {
    for (const name of ["Hotchkiss Mle 1914, 8x50mmR", "Browning M1919A4, .30-06", "Enfield Bren Mk I, .303", "Browning M2HB, .50 Browning", "KPZ DShK-38, 12.7x108mm"]) {
      expect(build(name).barrel, name).toBe("extraHeavy");
    }
    expect(build("Rheinmetall MG34, 7.92x57mm").barrelChangeSeconds).toBe(6);
    expect(build("Rheinmetall MG42, 7.92x57mm").barrelChangeSeconds).toBe(3);
    expect(build("H&K HK21A1, 7.62x51mm").barrelChangeSeconds).toBe(3);
    expect(build("Saco M60, 7.62x51mm")).toEqual({ waterPints: 0, condenser: false, barrel: "", barrelChangeSeconds: 0, underwaterFactor: 0 });
  });

  it("counts distance underwater x25 for the two guns built for it (pp. 92, 117)", () => {
    expect(build("H&K P11, 7.62x36mm").underwaterFactor).toBe(25);
    expect(build("TsNIITochMash APS, 5.66x39mm").underwaterFactor).toBe(25);
  });
});

describe("High-Tech's weapon families (#370)", () => {
  const gear = read(join(PACKS, "equipment/high-tech-gear.json"));
  const family = (name: string) => named(gear, name).system.extensions?.["gurps-compendium-content"]?.firearm ?? {};

  it("gives the air guns their charges, and the Girandoni its weakening stages (pp. 88-89)", () => {
    expect(family("Steyr-Girandoni M.1780, 11.75mm")).toMatchObject({ airShots: 30, airBands: [{ from: 11, damage: "1d+2" }, { from: 21, damage: "1d+1" }], powder: "other" });
    expect(family("Dan-Inject JM Standard, 11mm").airShots).toBe(40);
    expect(family("FN 303, .68 FN").airShots).toBe(110);
    expect(family("NSG SplatMaster, .68 Paintball").airShots).toBe(30);
    expect(family("Daisy Number 111 Red Ryder, .175 BB").airShots).toBeUndefined();
  });

  it("makes the TASERs stunners with a one-yard minimum range (p. 89)", () => {
    for (const name of ["Tasertron TE-76", "TASER M26"]) {
      expect(family(name).stunSeconds, name).toBe(5);
      expect(named(gear, name).system.rangedModes.every((m: any) => m.minRange === 1), name).toBe(true);
    }
    expect(family("TASER M26").emd).toBe(true);
  });

  it("gives every launcher and missile with a printed backblast its dice (pp. 141, 147-153)", () => {
    expect(family("HEC M72A2, 66mm")).toMatchObject({ backblast: "1d+2", backblastType: "burn" });
    expect(family("Dynamit-Nobel PZF3, 60mm")).toMatchObject({ backblast: "2d", backblastType: "cr" });
    expect(family("Ford AIM-9L Sidewinder, 127mm").backblast).toBe("5dx2");
    const launchers = gear.filter((d) => (d.system.rangedModes ?? []).some((m: any) => /Light Anti-Armor|Guided Missile/.test(String(m.skill))));
    for (const doc of launchers) expect(family(doc.name).backblast, doc.name).toMatch(/^\d+d/);
  });

  it("marks the mechanical machine guns, the braining pistols and the safe and suppressible revolvers (pp. 90, 93, 95, 127)", () => {
    for (const name of ["Gatling M1874, .45-70", "Hotchkiss 1-pdr, 37x94mmR", "Nordenfelt Single-Barrel, .450 MH"]) expect(family(name).mechanicalMg, name).toBe(true);
    expect(family("Electric Gatling M1893, .30-40").mechanicalMg).toBeUndefined();
    expect(family("Tower Sea Service P/1796, .56 Flintlock").brainer).toBe(true);
    expect(family("MAS Pistolet AN IX, 17.1mm Flintlock").brainer).toBe(true);
    expect(family("Beaumont-Adams Mk I, .442 Caplock").safety).toBe("safe");
    expect(family("Nagant R-1895, 7.62x39mmR").suppressible).toBe(true);
  });
});
