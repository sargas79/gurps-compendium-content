import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { applyAftermath, readyAftermath } from "./index.js";
import { aftermathFor, hearingPenalty, impairmentMinutes, recoverySeconds } from "./rules.js";

describe("after the firefight (High-Tech p. 87)", () => {
  it("is -4 to Hearing outdoors, -5 indoors, for (20 - HT) minutes, at least one", () => {
    expect(hearingPenalty(false)).toBe(-4);
    expect(hearingPenalty(true)).toBe(-5);
    expect(impairmentMinutes(12)).toBe(8);
    expect(impairmentMinutes(20)).toBe(1);
    expect(impairmentMinutes(25)).toBe(1);
  });

  it("then takes an HT roll every second to shake off", () => {
    const rolls = [15, 13, 11];
    expect(recoverySeconds(11, () => rolls.shift()!)).toBe(3);
    // 3 and 4 always succeed, 17 and 18 never do.
    expect(recoverySeconds(2, () => 4)).toBe(1);
    expect(recoverySeconds(20, () => 17, 5)).toBe(5);
  });

  it("adds -2 to Vision at night, and lets Protected Hearing and Protected Vision keep each off", () => {
    const roll = () => 3;
    expect(aftermathFor({ ht: 10, indoors: false, night: true, protectedHearing: false, protectedVision: false }, roll)).toEqual({ hearing: -4, vision: -2, seconds: 601 });
    expect(aftermathFor({ ht: 10, indoors: true, night: false, protectedHearing: false, protectedVision: false }, roll)).toMatchObject({ hearing: -5, vision: 0 });
    expect(aftermathFor({ ht: 10, indoors: false, night: true, protectedHearing: true, protectedVision: false }, roll)).toMatchObject({ hearing: 0, vision: -2 });
    expect(aftermathFor({ ht: 10, indoors: false, night: false, protectedHearing: true, protectedVision: false }, roll)).toBeNull();
  });
});

describe("the timed condition", () => {
  let applied: any[];

  beforeEach(() => {
    applied = [];
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string) => key } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function api(senses: Record<string, boolean> = {}) {
    return {
      actors: {
        attribute: () => 12,
        derived: () => ({ traitEffects: { protectedSense: senses } }),
        applyCondition: async (actor: any, condition: any) => { applied.push({ actor, condition }); return "c1"; },
      },
      sheets: { registerGmTool: vi.fn() },
    };
  }

  it("puts Hearing and Vision lines on the person for the time worked out", async () => {
    await applyAftermath(api() as never, { name: "Lou" }, { indoors: true, night: true }, () => 10);
    expect(applied[0].condition).toEqual({
      module: MODULE_ID,
      key: "ht-firefight-aftermath",
      label: "GCC.HT.Aftermath.Condition",
      effects: { modifiers: [
        { label: "GCC.HT.Aftermath.HearingLine", value: -5, rolls: ["hearing"] },
        { label: "GCC.HT.Aftermath.VisionLine", value: -2, rolls: ["vision"] },
      ] },
      duration: { seconds: 8 * 60 + 1 },
    });
  });

  it("spares someone with ear and eye protection", async () => {
    expect(await applyAftermath(api({ hearing: true, vision: true }) as never, { name: "Lou" }, { indoors: false, night: true }, () => 10)).toBeNull();
    expect(applied).toEqual([]);
  });

  it("registers the GM tool under its switch", () => {
    const a = api();
    let on = false;
    readyAftermath(a as never, () => on);
    const tool = (a.sheets.registerGmTool as any).mock.calls[0][0];
    expect(tool.key).toBe("ht-firefight-aftermath");
    expect(tool.visible()).toBe(false);
    on = true;
    expect(tool.visible()).toBe(true);
  });
});
