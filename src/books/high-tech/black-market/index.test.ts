import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { priceLines, readyBlackMarket, searchBlackMarket, searchLines, searchSkill, type BlackMarketRequest } from "./index.js";
import { blackMarketModifiers, blackMarketPrice, conditionPrice, findingOf, isOutlawed } from "./rules.js";

describe("the black market's search (High-Tech pp. 7-9)", () => {
  it("is at minus the Control Rating, with the place's and the market's modifiers", () => {
    expect(blackMarketModifiers({ controlRating: 4, culture: -3, favourableArea: true, unfamiliarArea: true, gray: true })).toEqual([
      { key: "controlRating", value: -4 },
      { key: "culture", value: -3 },
      { key: "favourableArea", value: 1 },
      { key: "unfamiliarArea", value: -3 },
      { key: "gray", value: 3 },
    ]);
    expect(blackMarketModifiers({ controlRating: 0, culture: 0, favourableArea: false, unfamiliarArea: false, gray: false })).toEqual([]);
  });

  it("finds a seller on a success, and trouble on a failure or a critical failure", () => {
    expect(findingOf({ success: true, criticalFailure: false })).toBe("found");
    expect(findingOf({ success: false, criticalFailure: false })).toBe("failure");
    expect(findingOf({ success: false, criticalFailure: true })).toBe("criticalFailure");
  });

  it("leaves outlawed goods to an adventure", () => {
    expect(isOutlawed(0)).toBe(true);
    expect(isOutlawed(1)).toBe(false);
    expect(isOutlawed(null)).toBe(false);
  });
});

describe("prices (High-Tech pp. 8, 10)", () => {
  it("sells copied media and textiles at 5% and the rest at about 60%, and leaves hard-to-get goods to the GM", () => {
    expect(blackMarketPrice(100, { copied: true, hardToGetLegally: false })).toBe(5);
    expect(blackMarketPrice(100, { copied: false, hardToGetLegally: false })).toBe(60);
    expect(blackMarketPrice(100, { copied: false, hardToGetLegally: true })).toBeNull();
  });

  it("sells recent gear used at 50-80% and old stock at 1-10%", () => {
    expect(conditionPrice(1000, "used")).toEqual({ low: 500, high: 800 });
    expect(conditionPrice(1000, "old")).toEqual({ low: 10, high: 100 });
    expect(conditionPrice(1000, "new")).toEqual({ low: 1000, high: 1000 });
  });
});

describe("the GM tool", () => {
  let chat: any[];
  let rolled: number;

  const request = (patch: Partial<BlackMarketRequest> = {}): BlackMarketRequest => ({
    contactSkill: null, unfamiliarCulture: false, market: "electronics", sought: "Cracked software",
    listPrice: 0, lc: 2, copied: false, hardToGetLegally: false, condition: "new",
    controlRating: 3, culture: 0, favourableArea: false, unfamiliarArea: false, gray: false, ...patch,
  });

  const api = (streetwise: number | null = 14) => ({
    rules,
    actors: { skillLevel: () => streetwise, attribute: () => 12 },
    sheets: { registerGmTool: vi.fn() },
  });

  beforeEach(() => {
    chat = [];
    rolled = 10;
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: Record<string, unknown>) => `${k} ${JSON.stringify(d)}` } });
    vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
    vi.stubGlobal("ChatMessage", { implementation: { getWhisperRecipients: () => [{ id: "gm1" }], create: async (m: any) => { chat.push(m); } } });
    vi.stubGlobal("Roll", class { total = rolled; dice = [{ results: [{ result: 3 }, { result: 3 }, { result: 4 }] }]; async evaluate() { return this; } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rolls the buyer's own Streetwise, or IQ-5 unlearned, unless a Contact does the looking", () => {
    expect(searchSkill(api() as never, {}, null)).toBe(14);
    expect(searchSkill(api(null) as never, {}, null)).toBe(7);
    expect(searchSkill(api() as never, {}, 16)).toBe(16);
  });

  it("reads Cultural Familiarity off the buyer, which Cultural Adaptability spares", () => {
    expect(searchLines(api() as never, { items: [] }, request({ unfamiliarCulture: true })).map((l) => l.value)).toEqual([-3, -3]);
    const adaptable = { items: [{ type: "trait", name: "Cultural Adaptability" }] };
    expect(searchLines(api() as never, adaptable, request({ unfamiliarCulture: true })).map((l) => l.value)).toEqual([-3]);
  });

  it("whispers the GM the finding, and the price on a success", async () => {
    // Streetwise 14 at CR 3 is 11; a 10 finds a seller.
    expect(await searchBlackMarket(api() as never, { name: "Vic" }, request({ listPrice: 500, condition: "used" }))).toBe("found");
    expect(chat[0].whisper).toEqual(["gm1"]);
    expect(chat[0].content).toContain("GCC.HT.BlackMarket.Found");
    expect(chat[0].content).toContain('"price":300');
    rolled = 12;
    expect(await searchBlackMarket(api() as never, { name: "Vic" }, request())).toBe("failure");
    expect(chat[1].content).toContain("GCC.HT.BlackMarket.Outcome.electronics.failure");
  });

  it("makes no roll for outlawed goods", async () => {
    expect(await searchBlackMarket(api() as never, { name: "Vic" }, request({ lc: 0 }))).toBe("outlawed");
    expect(chat[0].content).toContain("GCC.HT.BlackMarket.Outlawed");
    expect(chat[0].rolls).toBeUndefined();
  });

  it("prices used gear from the black-market price", () => {
    expect(priceLines(request({ listPrice: 1000, condition: "used" }))).toHaveLength(2);
    expect(priceLines(request({ listPrice: 0 }))).toEqual([]);
  });

  it("registers the GM tool under its switch", () => {
    const a = api();
    readyBlackMarket(a as never, () => false);
    expect(a.sheets.registerGmTool).toHaveBeenCalledWith(expect.objectContaining({ module: MODULE_ID, key: "ht-black-market" }));
  });
});
