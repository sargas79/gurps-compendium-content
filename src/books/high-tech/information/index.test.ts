/**
 * High-Tech's computers as the system's success rolls meet them (pp. 20-21):
 * the familiarity penalties for an operating system, a computer type and a
 * program, and the terminal's, on a roll made with a High-Tech computer or
 * program (API 1.95.0), with Foundry's globals stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { COMPUTER_TABLES } from "../../../shared/computers/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechComputers } from "../../ultra-tech/computers/index.js";
import { computerRollLines, computerUseOf, highTechComputers, readyInformation } from "./index.js";
import { TERMINAL_PENALTY, UNFAMILIAR_COMPUTING, computerUseLines } from "./rules.js";

const key = (k: string) => `${MODULE_ID}.${k}`;
let familiarityRule = true;
let hooks: Map<string, Array<(context: any) => void>>;

const api = () => ({
  rules,
  registry: { isRuleOn: (k: string) => k === "familiarity" && familiarityRule },
  combat: { hooks: { successRollModifiers: "gworld.successRollModifiers" } },
  data: { hooks: { skillBonuses: "gworld.skillBonuses" }, registerPriceModifier: vi.fn() },
  sheets: { registerSheetSection: vi.fn(), registerRowAction: vi.fn() },
});

function computer(name: string, setup: Record<string, unknown> = {}, book = "high-tech"): any {
  return {
    id: name,
    name,
    type: "equipment",
    flags: { [MODULE_ID]: { book } },
    system: { tl: book === "high-tech" ? "8" : "10", extensions: { [MODULE_ID]: { computer: {}, htComputer: setup } } },
  };
}

function program(name: string, runsOn: string, owner: { items: any }): any {
  return {
    id: name,
    name,
    type: "equipment",
    actor: owner,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "8", forSkills: ["Computer Operation"], extensions: { [MODULE_ID]: { computer: { complexity: 3, program: true, runsOn } } } },
  };
}

/** A character carrying a medium computer on Windows through a datapad, with a database program on it. */
function user(familiarities: string[] | undefined) {
  const owner: any = { system: familiarities ? { familiarities } : {}, items: null };
  const pc = computer("Medium Computer", { operatingSystem: "Windows", terminal: "datapad" });
  const database = program("Database", pc.id, owner);
  owner.items = Object.assign([pc, database], { get: (id: string) => [pc, database].find((i) => i.id === id) });
  return { owner, pc, database };
}

beforeEach(() => {
  familiarityRule = true;
  hooks = new Map();
  COMPUTER_TABLES.register(ultraTechComputers(key("computers")));
  COMPUTER_TABLES.register(highTechComputers(key("computerSystems")));
  setRuleReader((k) => k === key("computerSystems") || k === key("computers"));
  vi.stubGlobal("Hooks", { on: (name: string, fn: (context: any) => void) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: Record<string, unknown>) => `${k} ${JSON.stringify(d)}` } });
});

afterEach(() => {
  COMPUTER_TABLES.clear();
  setRuleReader(() => false);
  vi.unstubAllGlobals();
});

describe("using a computer (High-Tech pp. 20-21)", () => {
  it("takes -2 for each of an unfamiliar operating system, computer type and program", () => {
    const use = { program: "Database", computerType: "Medium Computer", operatingSystem: "Windows", terminal: "" as const };
    expect(computerUseLines(use, () => false).map((l) => [l.key, l.value])).toEqual([
      ["operatingSystem", UNFAMILIAR_COMPUTING], ["computerType", UNFAMILIAR_COMPUTING], ["program", UNFAMILIAR_COMPUTING],
    ]);
    expect(computerUseLines(use, (name) => name !== "Windows").map((l) => l.key)).toEqual(["operatingSystem"]);
    // Without the familiarity rule, none of them.
    expect(computerUseLines(use, null)).toEqual([]);
  });

  it("gives a portable terminal -1 and a datapad -2", () => {
    expect(TERMINAL_PENALTY.portable).toBe(-1);
    expect(TERMINAL_PENALTY.datapad).toBe(-2);
    expect(computerUseLines({ program: null, computerType: null, operatingSystem: null, terminal: "workstation" }, null)).toEqual([]);
  });

  it("reads a program's roll through the computer it runs on", () => {
    const { database } = user([]);
    expect(computerUseOf(database)).toEqual({ program: "Database", computerType: "Medium Computer", operatingSystem: "Windows", terminal: "datapad" });
  });

  it("puts the lines on a roll the system says is made with the program, and lifts them as the names are learned", () => {
    readyInformation(api() as never, { computers: () => true, books: () => false });
    const { owner, database } = user(["Windows", "Database"]);
    const context = { actor: owner, item: database, kind: "skill", skill: "Computer Operation", tags: ["skill"], modifiers: [] as any[] };
    for (const fn of hooks.get("gworld.successRollModifiers") ?? []) fn(context);
    expect(context.modifiers.map((l) => l.value)).toEqual([-2, -2]);
    expect(context.modifiers[0].label).toContain("computerType");
  });

  it("leaves the familiarity penalties to the system's switch and a kept list, and the terminal's to the computer", () => {
    const { owner, pc } = user(undefined);
    expect(computerRollLines(api() as never, owner, pc).map((l) => l.value)).toEqual([-2]);
    familiarityRule = false;
    const kept = user([]);
    expect(computerRollLines(api() as never, kept.owner, kept.pc).map((l) => l.value)).toEqual([-2]);
  });

  it("leaves Ultra-Tech's computers and the switch off alone", () => {
    familiarityRule = true;
    const ut = computer("Personal Computer", { operatingSystem: "X", terminal: "datapad" }, "ultra-tech");
    expect(computerUseOf(ut)).toBeNull();
    const { owner, pc } = user([]);
    setRuleReader(() => false);
    expect(computerRollLines(api() as never, owner, pc)).toEqual([]);
  });
});
