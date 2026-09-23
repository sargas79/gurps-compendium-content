/**
 * The shared security engine: a barrier crossed as each book's GM tool runs
 * it, and a safe's, door's and lock's figures from a book's table.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crossBarrier, figureLines, type SecurityTable } from "./index.js";

let successes: any[];
let damages: any[];
let conditions: any[];
let chat: string[];
let results: any[];

const api: any = {
  actors: {
    attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
    skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    applyCondition: async (_actor: any, c: any) => { conditions.push(c); return "c1"; },
  },
  roll: {
    success: async (o: any) => { successes.push(o); return results.shift() ?? { success: false, margin: 1 }; },
    damage: async (o: any) => { damages.push(o); return 4; },
  },
};

const victim = { name: "Victim", attributes: { DX: 12, HT: 11 }, skills: { Acrobatics: 13 } };

beforeEach(() => {
  successes = [];
  damages = [];
  conditions = [];
  chat = [];
  results = [];
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => vi.unstubAllGlobals());

describe("crossing a barrier", () => {
  const fence = { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, affliction: { attribute: "HT" as const, modifier: -6, effect: "stun" }, damage: { formula: "1d-3", type: "burn" as const, divisor: 1 } };

  it("gets past with the best avoiding skill, and says so", async () => {
    results = [{ success: true, margin: 2 }];
    const crossed = await crossBarrier(api, "NS", victim, fence, { name: "Fence" });
    expect(successes[0]).toMatchObject({ base: 13, modifiers: [{ label: "Fence", value: -3 }] });
    expect(crossed.avoided).toBe(true);
    expect(chat[0]).toContain('NS.Barrier.Avoided {"name":"Victim"}');
  });

  it("offers no avoiding roll where the book says so, then resists and takes the damage", async () => {
    const crossed = await crossBarrier(api, "NS", victim, fence, { name: "Fence", avoidable: false, effect: "stunned" });
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ base: 11, tags: ["resist", "affliction"] });
    expect(conditions).toEqual([{ key: "stunned" }]);
    expect(damages[0]).toMatchObject({ formula: "1d-3", damageType: "burn" });
    expect(crossed).toMatchObject({ afflicted: true, damage: 4 });
  });

  it("stops at immunity, and leaves the chat to a quiet caller", async () => {
    results = [{ success: false, margin: 1 }];
    const crossed = await crossBarrier(api, "NS", victim, fence, { name: "Fence", immune: true, quiet: true });
    expect(crossed.immune).toBe(true);
    expect(damages).toHaveLength(0);
    expect(chat).toHaveLength(0);
  });
});

describe("figures from a book's table", () => {
  const table: SecurityTable = {
    book: "test",
    ns: "NS",
    switch: "x",
    barriers: {},
    safes: { "Wall Safe": { dr: 100, hp: 25 } },
    safeDr: (dr, tl) => (tl >= 10 ? dr * 1.5 : dr),
    locks: { "Complex Lock": -4 },
    door: { pattern: /^armored door$/i, dr: (tl) => tl * 10 },
    defaultTl: 9,
  };

  it("reads a safe, a door and a lock at the owner's or the item's TL", () => {
    expect(figureLines({ name: "Wall Safe", system: { tl: "10" } }, table)).toEqual(['NS.Item.Safe {"dr":150,"hp":25,"tl":10}']);
    expect(figureLines({ name: "Armored Door", actor: { system: { tl: 11 } } }, table)).toEqual(['NS.Item.Door {"dr":110,"tl":11}']);
    expect(figureLines({ name: "Complex Lock" }, table)).toEqual(['NS.Item.Lock {"modifier":-4}']);
  });
});
