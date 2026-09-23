/**
 * The load engine: a book's catalogue applied to a weapon's ranged rows
 * through `gworld.weaponAttacks`, under the book's own switch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerLoadRows, type LoadCatalogue } from "./rows.js";

type Listener = (...args: any[]) => void;
let hooks: Map<string, Listener[]>;
const api = { combat: { hooks: { weaponAttacks: "gworld.weaponAttacks" } } } as never;

const gun = (ammunition = "") => {
  const mode = { ammunition, accuracy: 4 };
  return { type: "equipment", system: { rangedModes: [mode] }, mode };
};

function rowOf(item: ReturnType<typeof gun>, row: Record<string, unknown> = {}): any {
  const context = { actor: null, item, rows: [{ kind: "ranged", mode: item.mode, basis: { accuracy: 4 }, row: { damage: "2d", damageType: "pi", accuracy: 4, malfunction: 17, minSt: 9, skillLevel: 12, notes: [], ...row } }] };
  for (const listener of hooks.get("gworld.weaponAttacks") ?? []) listener(context);
  return context.rows[0]!.row;
}

/** A catalogue whose one load adds 1 Acc and a point of skill, and halves nothing else. */
const catalogue = (on: () => boolean, basicAmmunition: LoadCatalogue<string>["basicAmmunition"]): LoadCatalogue<string> => ({
  on,
  loadFor: () => "sharp",
  basicAmmunition,
  apply: (_load, row) => ({ ...row, accuracy: (row.accuracy ?? 0) + 1, skillBonus: 1, notes: [{ key: "sharp" }] }),
  tags: (load, after) => [{ label: load, hint: "" }, ...after.notes.map((n) => ({ label: n.key, hint: "" }))],
});

beforeEach(() => {
  hooks = new Map();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the load engine", () => {
  it("applies a book's load to the row, only while its switch is on", () => {
    let on = true;
    registerLoadRows(api, catalogue(() => on, null));
    expect(rowOf(gun())).toMatchObject({ accuracy: 5, skillLevel: 13, malfunction: 17, minSt: 9, notes: [{ label: "sharp" }, { label: "sharp" }] });
    on = false;
    expect(rowOf(gun())).toMatchObject({ accuracy: 4, skillLevel: 12, notes: [] });
  });

  it("steps aside for a Basic Set round where the book says the two don't stack, and goes over it where they do", () => {
    registerLoadRows(api, catalogue(() => true, { label: "Basic round", hint: "" }));
    expect(rowOf(gun("hp"))).toMatchObject({ accuracy: 4, notes: [{ label: "Basic round" }] });
    hooks = new Map();
    registerLoadRows(api, catalogue(() => true, null));
    expect(rowOf(gun("hp")).accuracy).toBe(5);
  });

  it("leaves Acc, Malf. and ST as they were where the load doesn't change them", () => {
    registerLoadRows(api, { ...catalogue(() => true, null), apply: (_load, row) => ({ ...row, damage: "3d" }) });
    const row = rowOf(gun(), { accuracy: undefined, malfunction: undefined, minSt: undefined });
    expect(row.damage).toBe("3d");
    expect("accuracy" in row && row.accuracy !== undefined).toBe(false);
    expect(row.malfunction).toBeUndefined();
  });

  it("writes a blast's fragment type, divisor and lingering only where the load changed them", () => {
    registerLoadRows(api, { ...catalogue(() => true, null), apply: (_load, row) => ({ ...row, fragmentationType: "burn", fragmentationDivisor: 0.2, fragmentationLingerEvery: 10, fragmentationLingerFor: 60 }) });
    expect(rowOf(gun(), { fragmentation: "1d" })).toMatchObject({ fragmentationType: "burn", fragmentationDivisor: 0.2, fragmentationLingerEvery: 10, fragmentationLingerFor: 60 });
    hooks = new Map();
    registerLoadRows(api, { ...catalogue(() => true, null), apply: (_load, row) => ({ ...row, damage: "3d" }) });
    const untouched = rowOf(gun());
    expect("fragmentationType" in untouched || "blastPlacement" in untouched).toBe(false);
  });
});
