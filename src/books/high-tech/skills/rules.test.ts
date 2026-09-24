/**
 * The supplement's new defaults and stand-ins (HT:EE pp. 6-8), and buying a
 * skill up from a new default with the Basic Set's own cost table.
 */

import { describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { bestNewDefault, defaultedLevel, skillKey, standInsFor, type CostTable } from "./rules.js";

const table = rules as unknown as CostTable;
const known = (entries: Record<string, number | null>) => Object.entries(entries).map(([name, level]) => ({ name, level }));

describe("the new defaults onto the Basic Set's skills (HT:EE pp. 6-7)", () => {
  it("reads names as the system does, without the TL marker", () => {
    expect(skillKey("Electronics Operation/TL8 ( Medical )")).toBe("electronics operation (medical)");
  });

  it("gives Electronics Operation (Media) Photography-5, (Medical) Diagnosis-2 and (Security) Traps-2", () => {
    const skills = known({ Photography: 14, "Diagnosis/TL": 13, "Traps/TL": 12 });
    expect(bestNewDefault("Electronics Operation/TL (Media)", skills)).toEqual({ level: 9, from: "Photography", modifier: -5, scope: "imageEditing", page: 6 });
    expect(bestNewDefault("Electronics Operation/TL (Medical)", skills)).toMatchObject({ level: 11, from: "Diagnosis/TL", scope: null });
    expect(bestNewDefault("Electronics Operation/TL (Security)", skills)).toMatchObject({ level: 10, from: "Traps/TL" });
    expect(bestNewDefault("Electronics Operation/TL (Communications)", skills)).toBeNull();
  });

  it("gives (Scientific) the best natural science at -2, and (Sensors) and (Sonar) for scientific work", () => {
    const skills = known({ "Chemistry/TL": 12, "Physics/TL (Electromagnetism)": 15, Psychology: 16, Mathematics: null });
    expect(bestNewDefault("Electronics Operation (Scientific)", skills)).toMatchObject({ level: 13, from: "Physics/TL (Electromagnetism)", scope: null });
    expect(bestNewDefault("Electronics Operation (Sonar)", skills)).toMatchObject({ level: 13, scope: "scientific" });
    expect(bestNewDefault("Electronics Operation (Sensors)", known({ Psychology: 16 }))).toBeNull();
  });

  it("gives Photography Electronics Operation (Media)-5, and never a skill its own level", () => {
    expect(bestNewDefault("Photography/TL", known({ "Electronics Operation/TL (Media)": 13 }))).toMatchObject({ level: 8, page: 7 });
    expect(bestNewDefault("Photography", known({ Photography: 13 }))).toBeNull();
  });

  it("gives no new default where the book gives a stand-in", () => {
    expect(bestNewDefault("Physics/TL", known({ "Physics/TL (Electromagnetism)": 14 }))).toBeNull();
    expect(bestNewDefault("Electrician/TL", known({ "Hobby Skill (Feats of Science)": 14 }))).toBeNull();
  });
});

describe("the skills that stand in for others (HT:EE pp. 7-8)", () => {
  it("lets Physics (Electromagnetism) stand in for Physics, and for Engineer (Electrical or Electronics) to invent", () => {
    expect(standInsFor("Physics/TL (Electromagnetism)")).toEqual([
      { target: "Physics", scope: "supplementPhysics", page: 8 },
      { target: "Engineer (Electrical)", scope: "proofOfConcept", page: 8 },
      { target: "Engineer (Electronics)", scope: "proofOfConcept", page: 8 },
    ]);
    expect(standInsFor("Physics/TL")).toEqual([]);
  });

  it("lets a Hobby Skill stand in for the operation and repair skills of its own gear, for low-power systems", () => {
    expect(standInsFor("Hobby Skill (Amateur Radio)").map((s) => s.target)).toEqual(["Electronics Operation (Communications)", "Electronics Repair (Communications)"]);
    expect(standInsFor("Hobby Skill (High Fidelity)").map((s) => s.target)).toEqual(["Electronics Operation (Media)", "Electronics Repair (Media)"]);
    expect(standInsFor("Hobby Skill (Computers)").map((s) => s.target)).toEqual(["Computer Operation", "Electronics Repair (Computers)"]);
    expect(standInsFor("Hobby Skill (Feats of Science)")).toEqual([{ target: "Electrician", scope: "lowPower", page: 7 }]);
    expect(standInsFor("Hobby Skill (Stamps)")).toEqual([]);
  });
});

describe("the level a new default leaves (Characters p. 173)", () => {
  const standing = { level: null as number | null, fromDefault: true, points: 0, relativeLevel: null as number | null, defaultCredit: 0, attribute: 12, difficulty: "A" };

  it("uses an unlearned skill at the new default, and leaves a better one alone", () => {
    expect(defaultedLevel({ ...standing, level: 7 }, 11, table)).toEqual({ level: 11, fromDefault: true });
    expect(defaultedLevel({ ...standing, level: null }, 11, table)).toEqual({ level: 11, fromDefault: true });
    expect(defaultedLevel({ ...standing, level: 12 }, 11, table)).toBeNull();
  });

  it("buys points up from the new default as the system buys them from its own", () => {
    // IQ 12, Average, 1 point: IQ-1 = 11 trained. A default at 11 is worth
    // 1 point (IQ-1), so 1 + 1 = 2 points: IQ+0 = 12.
    const trained = { ...standing, level: 11, fromDefault: false, points: 1, relativeLevel: -1, defaultCredit: 0 };
    expect(rules.skillLevel(12, 1 + rules.defaultCreditPoints(11, 12, "A"), "A", 0)).toBe(12);
    expect(defaultedLevel(trained, 11, table)).toEqual({ level: 12, fromDefault: false });
    // The bonuses the level already holds stay in it: +2 from a tool.
    expect(defaultedLevel({ ...trained, level: 13 }, 11, table)).toEqual({ level: 14, fromDefault: false });
    // A default no better than what's already counted buys nothing more.
    expect(defaultedLevel({ ...trained, defaultCredit: 1 }, 11, table)).toBeNull();
  });
});
