import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLEEDING_TABLES, readySevereBleeding, recordSevereWound, resetSevereBleeding, severeBleedingOf, type BleedingTable } from "./index.js";

type Listener = (...args: any[]) => unknown;

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let tools: any[];

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));

function patient(): any {
  const flags: Record<string, unknown> = {};
  return {
    statuses: new Set(["bleeding"]),
    system: { hp: { max: 12, value: 2 } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
  };
}

const api = () => ({
  combat: { hooks: { bleedingSchedule: "bs", successRollModifiers: "srm", firstAid: "fa" } },
  sheets: { registerGmTool: (tool: any) => tools.push(tool) },
});

const table = (book: string, extra: Partial<BleedingTable> = {}): BleedingTable => ({ book, on: () => on[book] === true, flag: `${book}Wounds`, i18n: `T.${book}`, ...extra });

beforeEach(() => {
  hooks = new Map();
  on = {};
  tools = [];
  resetSevereBleeding();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the shared severe-bleeding engine (Martial Arts p. 138, High-Tech p. 162)", () => {
  it("registers once, however many books ask", () => {
    BLEEDING_TABLES.register(table("a"));
    BLEEDING_TABLES.register(table("b"));
    readySevereBleeding(api() as never);
    readySevereBleeding(api() as never);
    expect(hooks.get("bs")).toHaveLength(1);
    expect(tools).toHaveLength(1);
  });

  it("reads only switched-on books' wounds, and two books' vitals wounds bleed as one", async () => {
    const a = table("a");
    const b = table("b", { woundSize: () => -2 });
    BLEEDING_TABLES.register(a);
    BLEEDING_TABLES.register(b);
    readySevereBleeding(api() as never);
    const p = patient();
    await recordSevereWound(p, a, { intervalSeconds: 30, modifier: -4, surgery: true });
    await recordSevereWound(p, b, { intervalSeconds: 30, modifier: -4, surgery: true });

    // Neither book on: nothing.
    expect(severeBleedingOf(p)).toBeNull();
    on = { a: true };
    const schedule = { actor: p, intervalSeconds: 60, modifier: -2 };
    fire("bs", schedule);
    expect(schedule).toMatchObject({ intervalSeconds: 30, modifier: -6 });

    // Both on: still one -4; the wound's size only from the book that puts it on treatment.
    on = { a: true, b: true };
    const again = { actor: p, intervalSeconds: 60, modifier: -2 };
    fire("bs", again);
    expect(again.modifier).toBe(-6);
    const roll = { tags: ["firstAid"], opponent: p, modifiers: [] as any[] };
    fire("srm", roll);
    expect(roll.modifiers).toEqual([{ label: "T.a.SevereWound", value: -4 }, { label: "T.b.WoundSize", value: -2 }]);

    // Nothing once the bleeding has stopped.
    p.statuses.delete("bleeding");
    expect(severeBleedingOf(p)).toBeNull();
  });
});
