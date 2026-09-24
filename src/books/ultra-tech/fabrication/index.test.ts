/**
 * Ultra-Tech's fabrication hazards at the table: gecko adhesive and tractor
 * beams hold a victim in a contest against the glue's or the beam's ST
 * (pp. 83, 88). The object's side is no one's, so the victim's conditions
 * and bonuses, which the system adds to each side by its actor, count on the
 * victim's side only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readyFabrication } from "./index.js";

let tools: Map<string, any>;
let regular: any[];
let quick: any[];
let dialogAnswer: any;

function fakeApi(): any {
  return {
    actors: { attribute: (_actor: any, key: string) => (key === "ST" ? 12 : 10), applyInjury: async () => undefined, setPosture: async () => true },
    roll: {
      regularContest: async (o: any) => { regular.push(o); return { outcome: "second", exchanges: 1 }; },
      quickContest: async (o: any) => { quick.push(o); return { outcome: "second" }; },
    },
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers", afterSuccessRoll: "gworld.afterSuccessRoll" } },
    sheets: { registerGmTool: (t: any) => tools.set(t.key, t), registerRowAction: () => undefined, registerSheetSection: () => undefined },
  };
}

const victim = { name: "Victim" };

beforeEach(() => {
  tools = new Map();
  regular = [];
  quick = [];
  dialogAnswer = null;
  vi.stubGlobal("Hooks", { on: () => undefined });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string) => k },
    user: { targets: new Set([{ actor: victim }]) },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async () => undefined } });
  readyFabrication(fakeApi(), { fabrication: () => true, gravity: () => true, psi: () => true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("holding hazards (Ultra-Tech pp. 83, 88)", () => {
  it("contests the victim's ST against the adhesive's, which no one rolls for", async () => {
    dialogAnswer = { kind: "adhesive", gait: "walking", flesh: false, beam: "utility", tl: 11 };
    await tools.get("ut-hazards").open();
    expect(regular).toHaveLength(1);
    expect(regular[0].first).toMatchObject({ actor: victim, base: 12 });
    expect(regular[0].second.actor).toBeNull();
  });

  it("contests the victim's ST against the tractor beam's, which no one rolls for", async () => {
    dialogAnswer = { kind: "tractor", gait: "walking", flesh: false, beam: "light", tl: 12 };
    await tools.get("ut-hazards").open();
    expect(quick).toHaveLength(1);
    expect(quick[0].first).toMatchObject({ actor: victim, base: 12 });
    expect(quick[0].second).toMatchObject({ actor: null, base: 200 });
  });
});
