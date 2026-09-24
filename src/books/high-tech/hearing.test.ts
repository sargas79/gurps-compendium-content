/**
 * Who hears a sound the book's gear makes: the targeted listener's Hearing,
 * with the distance for the system's Hearing Distance Table line (API 1.117.0).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hearSound, hearingScore } from "./hearing.js";

let successes: any[];
let targets: any[];
let dialogAnswer: any;
let warn: ReturnType<typeof vi.fn>;

const api: any = {
  actors: { derived: (actor: any) => actor?.derived ?? null },
  roll: { success: async (o: any) => { successes.push(o); return { success: true }; } },
};

const at = (x: number) => ({ getActiveTokens: () => [{ center: { x, y: 0 } }] });

beforeEach(() => {
  successes = [];
  targets = [];
  dialogAnswer = null;
  warn = vi.fn();
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets); } },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn } });
  vi.stubGlobal("canvas", { grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(b.x - a.x) }) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hearing a sound (Campaigns p. 358)", () => {
  it("reads the listener's Hearing, and none for the deaf", () => {
    expect(hearingScore(api, { derived: { senses: [{ sense: "hearing", score: 13 }] } })).toBe(13);
    expect(hearingScore(api, { derived: { per: 11 } })).toBe(11);
    expect(hearingScore(api, { derived: { senses: [{ sense: "hearing", score: null }] } })).toBeNull();
  });

  it("rolls the targeted listener's Hearing with the distance and the gear's lines", async () => {
    const listener = { name: "Guard", derived: { senses: [{ sense: "hearing", score: 12 }] }, ...at(40) };
    const source = { name: "Archer", ...at(0) };
    targets = [{ actor: listener }];
    dialogAnswer = { yards: 40, other: -5 };
    await hearSound(api, source, { name: "Longbow", heardAt: 4, lines: [{ label: "Silencers", value: -2 }, { label: "Nothing", value: 0 }] });
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({
      actor: listener, base: 12, skill: "Hearing", subject: source, tags: ["hearing", "detection"],
      distance: { yards: 40, baseYards: 4 },
      modifiers: [{ label: "Silencers", value: -2 }, { label: "GCC.HT.Hearing.Other", value: -5 }],
    });
  });

  it("asks for a target, rolls nothing for a deaf listener, and nothing when the dialog is closed", async () => {
    await hearSound(api, {}, { name: "Whistle", heardAt: 128 });
    expect(warn).toHaveBeenCalledWith("GCC.HT.Hearing.NoListener");
    targets = [{ actor: { name: "Deaf", derived: { senses: [{ sense: "hearing", score: null }] } } }];
    await hearSound(api, {}, { name: "Whistle", heardAt: 128 });
    targets = [{ actor: { name: "Guard", derived: { per: 10 } } }];
    await hearSound(api, {}, { name: "Whistle", heardAt: 128 });
    expect(successes).toEqual([]);
  });
});
