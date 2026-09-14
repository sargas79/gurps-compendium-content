import { describe, expect, it } from "vitest";

import { holdPaths } from "./caster.js";

/** A skill as `gworld.skillLevels` hands it over. */
const skill = (name: string, level: number | null, points: number) => ({ item: { system: { points } }, name, level, fromDefault: points === 0 });

const notes = { capped: "capped", defaulted: "defaulted" };

/** Monster Hunters 1 pp. 32-33, as the system's own character tests read it. */
describe("Paths held under Thaumatology and 12 + Magery", () => {
  it("holds a trained Path to Thaumatology, and leaves other skills alone", () => {
    const skills = [skill("Path of Body", 16, 32), skill("Stealth", 14, 4)];
    holdPaths({ actor: {}, skills, levelOf: () => 13 }, 3, notes, "gcc");
    expect(skills[0]).toMatchObject({ level: 13, fromDefault: false, note: "capped", source: "gcc" });
    expect(skills[1]).toEqual(skill("Stealth", 14, 4));
  });

  it("holds a trained Path to 12 + Magery, below a higher Thaumatology", () => {
    const skills = [skill("Path of Mind", 18, 40)];
    holdPaths({ actor: {}, skills, levelOf: () => 20 }, 2, notes, "gcc");
    expect(skills[0]).toMatchObject({ level: 14, note: "capped" });
  });

  it("gives an untrained Path Thaumatology-6, no higher than 12", () => {
    const low = [skill("Path of Magic", 9, 0)];
    holdPaths({ actor: {}, skills: low, levelOf: () => 14 }, 1, notes, "gcc");
    expect(low[0]).toMatchObject({ level: 8, fromDefault: true, note: "defaulted" });
    const high = [skill("Path of Magic", 9, 0)];
    holdPaths({ actor: {}, skills: high, levelOf: () => 30 }, 5, notes, "gcc");
    expect(high[0]).toMatchObject({ level: 12, fromDefault: true });
  });

  it("gives no level to a Path without Thaumatology", () => {
    const skills = [skill("Path of Spirit", 11, 4)];
    holdPaths({ actor: {}, skills, levelOf: () => null }, 2, notes, "gcc");
    expect(skills[0]!.level).toBeNull();
  });
});
