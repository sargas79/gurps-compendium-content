import { describe, expect, it } from "vitest";

import { afterFiring, heatFrom, isOverheated, shotsCounted, type HeatTable } from "./rules.js";

// Two books' timings: a beam's 10-second pause and minute's cooling, a gun's minute and quarter-hour.
const BEAM: HeatTable = { pauseSeconds: 10, coolSeconds: 60 };
const GUN: HeatTable = { pauseSeconds: 60, coolSeconds: 900 };

describe("the shared heat engine", () => {
  it("adds shots up, and starts again after a pause while within the limit", () => {
    expect(afterFiring({ shots: 50, lastShot: 0 }, 10, 100, 5, GUN)).toEqual({ shots: 60, lastShot: 5 });
    expect(afterFiring({ shots: 50, lastShot: 0 }, 10, 100, 60, GUN).shots).toBe(10);
    // The same pause under the beam table's shorter one.
    expect(afterFiring({ shots: 50, lastShot: 0 }, 10, 100, 10, BEAM).shots).toBe(10);
  });

  it("keeps an overheated weapon hot until its table's rest", () => {
    expect(afterFiring({ shots: 150, lastShot: 0 }, 10, 100, 120, GUN).shots).toBe(160);
    expect(isOverheated({ shots: 150, lastShot: 0 }, 100, 899, GUN)).toBe(true);
    expect(isOverheated({ shots: 150, lastShot: 0 }, 100, 900, GUN)).toBe(false);
    expect(shotsCounted({ shots: 150, lastShot: 0 }, 900, GUN)).toBe(0);
    expect(afterFiring({ shots: 150, lastShot: 0 }, 10, 100, 900, GUN).shots).toBe(10);
  });

  it("reads a stored record, with nothing missing", () => {
    expect(heatFrom(undefined)).toEqual({ shots: 0, lastShot: null });
    expect(heatFrom({ shots: "12", lastShot: 30 })).toEqual({ shots: 12, lastShot: 30 });
  });
});
