import { describe, expect, it } from "vitest";

import { joinText, useLexicon } from "./book-structure.mjs";

describe("joining a line onto the one before", () => {
  it("mends a word broken at the line's end, the way the book spells it elsewhere", () => {
    useLexicon({ words: new Map([["signal", 4], ["fast", 9], ["moving", 9]]), compounds: new Map([["fast-moving", 2]]) });
    expect(joinText("the sig-", "nal tower")).toBe("the signal tower");
    expect(joinText("a fast-", "moving cart")).toBe("a fast-moving cart");
    useLexicon(null);
  });

  it("mends one whose hyphen a justified line set apart from the word (private #544)", () => {
    useLexicon({ words: new Map([["signal", 4], ["fast", 9], ["moving", 9]]), compounds: new Map([["fast-moving", 2]]) });
    expect(joinText("the sig -", "nal tower")).toBe("the signal tower");
    expect(joinText("a fast -", "moving cart")).toBe("a fast-moving cart");
    // A dash before a capital, or a line that doesn't carry a word on, is left alone.
    expect(joinText("the end -", "Then more")).toBe("the end -Then more");
    useLexicon(null);
  });
});
