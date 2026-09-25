/**
 * The flatscreen television's larger screens (HT:EE p. 34): the size set on
 * the sheet reprices the record, under `radioDesign` alone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { readyScreens } from "./screens.js";

let sections: Map<string, any>;
let prices: Map<string, any>;
let on: boolean;

const tv = (screen = ""): any => ({
  name: "Flatscreen Television",
  type: "equipment",
  isOwner: true,
  flags: { [MODULE_ID]: { book: "high-tech" } },
  system: { tl: "8", extensions: { [MODULE_ID]: { device: { screen } } } },
});

beforeEach(() => {
  sections = new Map();
  prices = new Map();
  on = false;
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k } });
  readyScreens({
    sheets: { registerSheetSection: (s: any) => sections.set(s.key, s) },
    data: { registerPriceModifier: (m: any) => prices.set(m.key, m) },
  } as never, () => on);
});

afterEach(() => vi.unstubAllGlobals());

describe("flatscreen screens (HT:EE p. 34)", () => {
  it("prices a wall-mounted set at 5 times and a larger one at 20 times, under the switch", () => {
    const price = prices.get("ee-screen-size");
    expect(price.apply(tv("wall"), { cost: 130, weight: 7 })).toBeNull();
    on = true;
    expect(price.apply(tv(), { cost: 130, weight: 7 })).toBeNull();
    expect(price.apply(tv("wall"), { cost: 130, weight: 7 })).toMatchObject({ cost: 650, weight: 35 });
    expect(price.apply(tv("large"), { cost: 130, weight: 7 })).toMatchObject({ cost: 2600, weight: 140 });
    expect(price.apply({ ...tv("large"), name: "Portable Television" }, { cost: 180, weight: 13 })).toBeNull();
  });

  it("offers the size on the set's sheet only", () => {
    const section = sections.get("ee-screen-item");
    expect(section.visible(tv())).toBe(false);
    on = true;
    expect(section.visible(tv())).toBe(true);
    expect(section.visible({ ...tv(), name: "Console Television" })).toBe(false);
    expect(section.context(tv("wall")).sizes.find((s: any) => s.selected).value).toBe("wall");
  });
});
