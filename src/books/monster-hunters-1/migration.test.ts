import { describe, expect, it, vi } from "vitest";

import { MIGRATES, RULE_KEYS, loadsFromModes, migrateWorld, ritualSystem } from "./migration.js";

describe("moving the book's data out of the system (#159)", () => {
  it("keeps a ritual's definition whole, and drops what the system's type stored for modules", () => {
    const source = {
      description: "<p>Wards a house.</p>", reference: "p. 37", masteredAs: "L:control:Spirit", blocking: true,
      effects: [{ path: "Spirit", effect: "control", greater: false }],
      definition: { area: true }, casting: { areaRadius: 7, durationStep: 9 },
      extensions: { "some-module": { x: 1 } },
    };
    expect(ritualSystem(source)).toEqual({
      description: "<p>Wards a house.</p>", reference: "p. 37", masteredAs: "L:control:Spirit", blocking: true,
      effects: [{ path: "Spirit", effect: "control", greater: false }],
      definition: { area: true }, casting: { areaRadius: 7, durationStep: 9 },
    });
  });

  it("turns ranged modes' loads into one entry per mode that has one", () => {
    expect(loadsFromModes([
      { powder: "", payload: "" },
      { powder: "matchGrade", payload: "thermate", payloadAdjust: -2 },
      { magazineCost: 15 },
    ])).toEqual([
      { mode: 1, powder: "matchGrade", payload: "thermate", powderAdjust: 0, payloadAdjust: -2, magazineCost: 0 },
      { mode: 2, powder: "", payload: "", powderAdjust: 0, payloadAdjust: 0, magazineCost: 15 },
    ]);
    expect(loadsFromModes(undefined)).toEqual([]);
  });

  it("runs every step through the system's helpers, as the GM, turning the system's switches off", async () => {
    const result = { skipped: false, changed: 1, failed: 0 };
    const migration = { migrateItemType: vi.fn(async () => result), moveFields: vi.fn(async () => result), moveRuleState: vi.fn(async () => result) };
    const globals = globalThis as Record<string, unknown>;
    globals.game = { user: { isGM: false } };
    expect(await migrateWorld({ migration } as never)).toEqual([]);
    globals.game = { user: { isGM: true } };
    const steps = await migrateWorld({ migration } as never);
    delete globals.game;
    expect(steps.map((s) => s.step)).toEqual([
      "mh1-ritual-items", "mh1-actor-fields", "mh1-equipment-fields", "mh1-armor-fields", ...RULE_KEYS.map((k) => `mh1-rule-${k}`),
    ]);
    expect(migration.migrateItemType).toHaveBeenCalledWith(expect.objectContaining({ fromType: "ritual", toType: "gurps-compendium-content.ritual" }));
    expect(migration.moveRuleState).toHaveBeenCalledWith(expect.objectContaining({ fromKey: "holyAttacks", toKey: "gurps-compendium-content.holyAttacks", turnOff: true }));
    expect(MIGRATES).toEqual(["ritual-items", "ritual-path", "bonus-points", "holy-items", "gear-options", "rule-switches"]);
  });
});
