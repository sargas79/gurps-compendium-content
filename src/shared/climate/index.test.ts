import { afterEach, describe, expect, it } from "vitest";

import { MODULE_ID } from "../module.js";
import { CLIMATE_TABLES, climateGearOf, climateTolerance, widenComfortZone } from "./index.js";

const item = (name: string, book: string | null, tl = "8") => ({ name, system: { tl }, flags: book ? { [MODULE_ID]: { book } } : {} });

afterEach(() => CLIMATE_TABLES.clear());

describe("the shared climate engine", () => {
  it("turns a comfort range into degrees added to each end", () => {
    expect(climateTolerance([-40, 120])).toEqual({ coldF: 75, heatF: 40 });
    expect(climateTolerance([50, 70])).toEqual({ coldF: 0, heatF: 0 });
  });

  it("widens a comfort zone to the best piece on each side", () => {
    const context = { effects: { temperatureTolerance: { coldF: 20, heatF: 0 } }, sources: [] as any[] };
    widenComfortZone(context, { coldF: 10, heatF: 30 }, "Vest");
    expect(context.effects.temperatureTolerance).toEqual({ coldF: 20, heatF: 30 });
    expect(context.sources).toEqual([{ effect: "temperatureTolerance.heatF", label: "Vest", value: 30 }]);
  });

  it("gives a book's item its own book's gear, only under that book's switch", () => {
    CLIMATE_TABLES.register({ book: "high-tech", tls: { min: 5, max: 8 }, rule: "ht", gear: [{ pattern: /^heated clothing$/i, zone: { coldF: 60, heatF: 0 }, powered: true }] });
    const on = (keys: string[]) => (key: string) => keys.includes(key);
    expect(climateGearOf(item("Heated Clothing (TL8)", "high-tech"), on(["ht"]))?.zone).toEqual({ coldF: 60, heatF: 0 });
    expect(climateGearOf(item("Heated Clothing", "high-tech"), on([]))).toBeNull();
    // Made by hand: a switched-on book's.
    expect(climateGearOf(item("Heated Clothing", null), on(["ht"]))?.powered).toBe(true);
  });
});
