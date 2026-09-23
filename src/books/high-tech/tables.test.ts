/**
 * High-Tech's ammunition table (pp. 175-177) and REF table (p. 183) as data
 * (#346, decision D5): the rows, and finding a gun's calibre in them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CALIBRES, calibreKey, calibreRows } from "./ammunition/calibres.js";
import { EXPLOSIVES, explosive } from "./explosives/ref.js";

describe("the ammunition tables (pp. 175-177)", () => {
  it("holds every row of the seven tables", () => {
    const count = (c: string) => CALIBRES.filter((row) => row.class === c).length;
    expect(CALIBRES).toHaveLength(207);
    expect([count("handgun"), count("shotgun"), count("rifle"), count("cannon"), count("grenadeLauncher"), count("mortar"), count("lightAntitank")])
      .toEqual([62, 14, 96, 17, 9, 7, 2]);
    for (const row of CALIBRES) {
      expect(row.wps).toBeGreaterThan(0);
      expect(row.cps).toBeGreaterThan(0);
    }
  });

  it("reads the figures as the pages print them", () => {
    expect(calibreRows("9x19mm")).toEqual([{ name: "9×19mm Parabellum", class: "handgun", wps: 0.026, cps: 0.3, notes: [], page: 176 }]);
    expect(calibreRows(".50 Browning")[0]).toMatchObject({ wps: 0.25, cps: 4, class: "rifle", page: 177 });
    expect(calibreRows("13x36mm")[0]).toMatchObject({ name: "13×36mm Gyrojet", cps: 7.5 });
    expect(calibreRows("125x408mmR")[0]).toMatchObject({ class: "cannon", wps: 73, cps: 255, notes: ["semiConsumableCased"] });
    expect(calibreRows("81mm")[0]).toMatchObject({ class: "mortar", wps: 11.7, cps: 35, notes: ["mortarShell"] });
  });

  it("finds a calibre the way the guns' names write it", () => {
    // The guns write "x" and '' for the book's "×" and ”.
    expect(calibreKey("12-gauge 2.75” (18.5×70mmR)")).toBe(calibreKey("12-gauge 2.75'' (18.5x70mmR)"));
    expect(calibreRows("11.43x23mm").map((row) => row.name)).toEqual([".45 ACP (11.43×23mm)"]);
    // The 12-gauge 2.75" shell comes light cased and full, two rows.
    expect(calibreRows("18.5x70mmR").map((row) => row.notes)).toEqual([["lightCased", "shotshell"], ["shotshell"]]);
    expect(calibreRows("")).toEqual([]);
  });

  it("finds a calibre for most of the book's extracted guns", () => {
    const gear = JSON.parse(readFileSync(join(import.meta.dirname, "../../../books/high-tech/packs-src/equipment/high-tech-gear.json"), "utf8"));
    const calibres = gear
      .filter((d: any) => d.system.weaponClass === "firearm" && /, /.test(d.name))
      .map((d: any) => String(d.name).split(", ").pop());
    const found = calibres.filter((c: string) => calibreRows(c).length > 0);
    // Some guns name a calibre by its common name alone ("12G 2.75''", ".44 Caplock"); the rules join those.
    expect(found.length / calibres.length).toBeGreaterThan(0.5);
  });
});

describe("the Relative Explosive Force table (p. 183)", () => {
  it("holds the table's 36 explosives, TNT at 1", () => {
    expect(EXPLOSIVES).toHaveLength(36);
    expect(explosive("TNT")).toMatchObject({ tl: 6, ref: 1, use: "Warhead filler" });
  });

  it("finds an explosive by any of its names", () => {
    expect(explosive("Cyclonite")).toMatchObject({ type: "RDX/Hexogen/Cyclonite", ref: 1.6 });
    expect(explosive("composition c4")).toMatchObject({ ref: 1.4, tl: 7 });
    expect(explosive("Nitroglycerin")).toMatchObject({ ref: 1.5 });
    expect(explosive("Fuel-Air Explosive")).toMatchObject({ ref: 5 });
    expect(explosive("Semtex")).toBeNull();
  });
});
