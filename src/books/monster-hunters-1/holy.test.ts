import { describe, expect, it } from "vitest";

import { weaknessOf } from "../../../system/src/rules/weakness.js";
import { HOLY_FIZZ_SECONDS, holyContact, isHoly, vulnerableToHoly, weaknessesOf } from "./holy.js";

// Ported from the system's own tests for this rule (GWorldVTT
// src/rules/__tests__/holy.test.ts), with the reading of items and traits.

describe("who holy things hurt (p. 51)", () => {
  it("is whoever has a Weakness to holy things", () => {
    expect(vulnerableToHoly([{ source: "Contact with holy water and artifacts" }])).toBe(true);
    expect(vulnerableToHoly([{ source: "Sunlight" }])).toBe(false);
    expect(vulnerableToHoly([])).toBe(false);
  });

  it("reads the Weaknesses off a character's traits", () => {
    const vampire = {
      items: [
        { type: "trait", name: "Weakness (Contact with holy water and artifacts)", system: { levels: 3 } },
        { type: "trait", name: "Night Vision", system: { levels: 5 } },
        { type: "skill", name: "Holy weapon lore", system: {} },
      ],
    };
    const weaknesses = weaknessesOf(vampire, weaknessOf);
    expect(weaknesses).toHaveLength(1);
    expect(vulnerableToHoly(weaknesses)).toBe(true);
    expect(vulnerableToHoly(weaknessesOf({ items: [] }, weaknessOf))).toBe(false);
  });
});

describe("a holy contact", () => {
  it("burns a vulnerable creature and starts the minute of fizzing", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 0, now: 100 })).toEqual({
      burns: true, fizzing: false, fizzingUntil: 100 + HOLY_FIZZ_SECONDS,
    });
  });

  it("does nothing more while the wound fizzes, and does not restart the minute", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 160, now: 130 })).toEqual({
      burns: false, fizzing: true, fizzingUntil: 160,
    });
  });

  it("burns again once the minute is past: 1d a minute, submerged", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 160, now: 160 }).burns).toBe(true);
  });

  it("does nothing to a creature holy things do not hurt", () => {
    expect(holyContact({ vulnerable: false, fizzingUntil: 0, now: 100 })).toEqual({
      burns: false, fizzing: false, fizzingUntil: 0,
    });
  });
});

describe("a holy item", () => {
  it("is one this module's data marks holy", () => {
    expect(isHoly({ system: { extensions: { "gurps-compendium-content": { holy: true } } } })).toBe(true);
    expect(isHoly({ system: { extensions: { "gurps-compendium-content": { holy: false } } } })).toBe(false);
    expect(isHoly({ system: { holy: true } })).toBe(false);
    expect(isHoly(null)).toBe(false);
  });
});
