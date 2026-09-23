/**
 * High-Tech's hand-kept records (#346): what the GCA file lacks or gets wrong,
 * checked against the figures on the book's pages, and the Way of the Pistol
 * style's entries against the records they point to.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
