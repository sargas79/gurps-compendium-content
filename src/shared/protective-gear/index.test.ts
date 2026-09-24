/**
 * The shared biomedical sensors listener: each book's pieces take their own
 * book's table and need only that book's switch (decision D1), and a patient's
 * sensors are +1 to Diagnosis once, whichever books are on (#452).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../module.js";
import { BIOMEDICAL_TABLES, biomedicalTableOf, readyBiomedical, resetBiomedical, type BiomedicalTable } from "./index.js";

type Listener = (...args: any[]) => void;
const ROLL = "gworld.successRollModifiers";

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;

const table = (book: string, name: RegExp): BiomedicalTable => ({
  book,
  on: () => on[book] === true,
  applies: (item) => name.test(String(item?.name ?? "")),
  label: (item) => `${book}: ${item.name}`,
});
const piece = (name: string, book?: string, equipped = true) => ({ name, type: "equipment", flags: book ? { [MODULE_ID]: { book } } : {}, system: { equipped } });
const diagnose = (items: any[]) => {
  const context = { actor: { items: [] }, skill: "Diagnosis", tags: ["skill"], modifiers: [] as any[], opponent: { items } };
  for (const listener of hooks.get(ROLL) ?? []) listener(context);
  return context.modifiers;
};

beforeEach(() => {
  hooks = new Map();
  on = {};
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { user: { targets: new Set() } });
  BIOMEDICAL_TABLES.register(table("ultra-tech", /^(biomedical sensors|combat hardsuit)$/i));
  BIOMEDICAL_TABLES.register(table("high-tech", /^(biomedical sensors|space suit)$/i));
  // Both books ask; the listener is added once.
  readyBiomedical({ combat: { hooks: { successRollModifiers: ROLL } } } as never);
  readyBiomedical({ combat: { hooks: { successRollModifiers: ROLL } } } as never);
});

afterEach(() => {
  resetBiomedical();
  vi.unstubAllGlobals();
});

describe("biomedical sensors (Ultra-Tech p. 187, High-Tech p. 75)", () => {
  it("gives +1 once with both books on, for either book's record of the same name", () => {
    on = { "ultra-tech": true, "high-tech": true };
    expect(hooks.get(ROLL)).toHaveLength(1);
    expect(diagnose([piece("Biomedical Sensors", "high-tech")])).toEqual([{ label: "high-tech: Biomedical Sensors", value: 1 }]);
    expect(diagnose([piece("Biomedical Sensors", "ultra-tech")])).toEqual([{ label: "ultra-tech: Biomedical Sensors", value: 1 }]);
    expect(diagnose([piece("Biomedical Sensors")])).toHaveLength(1);
    // A patient wearing both books' sensors still gets +1.
    expect(diagnose([piece("Combat Hardsuit", "ultra-tech"), piece("Space Suit", "high-tech")])).toEqual([{ label: "ultra-tech: Combat Hardsuit", value: 1 }]);
  });

  it("reads each book's record only with that book's switch", () => {
    on = { "ultra-tech": true };
    expect(biomedicalTableOf(piece("Biomedical Sensors", "high-tech"))).toBeNull();
    expect(diagnose([piece("Biomedical Sensors", "high-tech")])).toEqual([]);
    expect(diagnose([piece("Biomedical Sensors", "ultra-tech")])).toHaveLength(1);
    on = { "high-tech": true };
    expect(diagnose([piece("Biomedical Sensors", "ultra-tech")])).toEqual([]);
    expect(diagnose([piece("Biomedical Sensors", "high-tech")])).toHaveLength(1);
    // A piece from no book takes the first switched-on table that claims it.
    expect(biomedicalTableOf(piece("Biomedical Sensors"))?.book).toBe("high-tech");
  });

  it("needs the sensors worn, and a Diagnosis roll", () => {
    on = { "ultra-tech": true, "high-tech": true };
    expect(diagnose([piece("Biomedical Sensors", "high-tech", false)])).toEqual([]);
    const context = { actor: { items: [] }, skill: "First Aid", tags: ["skill"], modifiers: [] as any[], opponent: { items: [piece("Biomedical Sensors")] } };
    for (const listener of hooks.get(ROLL) ?? []) listener(context);
    expect(context.modifiers).toEqual([]);
  });
});
