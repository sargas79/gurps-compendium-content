import { describe, expect, it } from "vitest";

import { movedManeuver, movedOptions } from "./migration.js";

/** Fighters on this module's old Committed and Defensive Attack move to the system's. */
describe("the move to the system's maneuvers", () => {
  it("maps the module's two maneuvers and nothing else", () => {
    expect(movedManeuver("gurps-compendium-content.ma-committed-attack")).toBe("committedAttack");
    expect(movedManeuver("gurps-compendium-content.ma-defensive-attack")).toBe("defensiveAttack");
    expect(movedManeuver("attack")).toBeNull();
    expect(movedManeuver(undefined)).toBeNull();
  });

  it("carries the choices to the system's options, a second step as a tick", () => {
    expect(movedOptions({ "ma-committed-mode": "strong", "ma-committed-steps": 2 })).toEqual({ committedKind: "strong", committedStep: true });
    expect(movedOptions({ "ma-committed-steps": 1 })).toEqual({ committedStep: false });
    expect(movedOptions({ "ma-defensive-benefit": "parry" })).toEqual({ defensiveBenefit: "parry" });
    expect(movedOptions(null)).toEqual({});
  });
});
