import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { structureOf } from "./book-structure.mjs";
import { openBook, readPage } from "./pdf-layout.mjs";
import {
  ADDENDA,
  REVISED,
  addendumOf,
  headingText,
  isRunningHead,
  kindOf,
  pdfPageOf,
  plainRevised,
  printedPageOf,
  stripIcons,
} from "./revised.mjs";

/** A line as pdf-layout gives it, set as the Revised edition sets `font` at `size`. */
function line(text, { x = 36, y = 100, size = 9.5, font = "NewAsterLTStd", column = 0, indent = 0, width = 200 } = {}) {
  return {
    text,
    x,
    x1: x + width,
    y,
    size,
    font,
    black: /Black/.test(font),
    bold: /Bold|Black|Semi/.test(font),
    italic: /It$/.test(font),
    runs: [{ text, x, x1: x + width, size, font, bold: /Bold|Black|Semi/.test(font), italic: /It$/.test(font), black: /Black/.test(font) }],
    column,
    indent,
    page: 164,
  };
}

const page = (lines) => ({ number: 164, width: 603, height: 783, lines, columns: { edges: [36, 293], width: 238 }, profile: REVISED });

describe("the Revised edition's pages", () => {
  it("puts printed page p on PDF page p + 10, and back", () => {
    expect(pdfPageOf(154)).toBe(164);
    expect(pdfPageOf(378)).toBe(388);
    expect(printedPageOf(388)).toBe(378);
    expect(printedPageOf(pdfPageOf(1))).toBe(1);
  });

  it("knows the four addenda's page runs", () => {
    expect(ADDENDA.map((a) => [a.first, a.last])).toEqual([
      [324, 334],
      [337, 342],
      [566, 566],
      [570, 578],
    ]);
    expect(addendumOf(324)?.id).toBe("addendum-1");
    expect(addendumOf(334)?.id).toBe("addendum-1");
    expect(addendumOf(335)).toBeNull();
    expect(addendumOf(340)?.id).toBe("addendum-2");
    expect(addendumOf(566)?.id).toBe("addendum-3");
    expect(addendumOf(578)?.id).toBe("addendum-4");
    expect(addendumOf(579)).toBeNull();
  });
});

describe("what a line is, by the Revised edition's type", () => {
  // Each case is a line of a page the profile was learned from.
  it("reads an entry's name as a level-3 heading (p. 154, Shyness)", () => {
    expect(kindOf(line("Shyness", { size: 14, font: "NewAsterLTStd-SemiBoldIt" }))).toBe("h3");
  });

  it("reads a cost line as a level-4 heading (p. 154)", () => {
    expect(kindOf(line("-5, -10, or -20 points", { size: 11, font: "NewAsterLTStd-SemiBold" }))).toBe("h4");
    expect(kindOf(line("Alcohol Tolerance", { size: 11, font: "NewAsterLTStd-SemiBoldIt" }))).toBe("h4");
  });

  it("reads small capitals by size: chapter, level 1, level 2 (p. 378, Damage Roll)", () => {
    const sc = "NewAsterLTStd-Black-SC700";
    expect(kindOf(line("disadvantages", { size: 60, font: sc }))).toBe("chapter");
    expect(kindOf(line("ChaPter three", { size: 24, font: sc }))).toBe("chapter");
    expect(kindOf(line("addendum", { size: 85, font: sc }))).toBe("chapter");
    expect(kindOf(line("modifiers", { size: 36, font: sc }))).toBe("h1");
    expect(kindOf(line("damage roll", { size: 20, font: sc }))).toBe("h2");
    // The running head at the foot is the same face at 16 points.
    expect(kindOf(line("disadvantages", { size: 16, font: sc }))).toBe("text");
  });

  it("leaves what is not a heading alone", () => {
    // A pull quote, set large in plain italic, repeats the text for show.
    expect(kindOf(line("Half-Damage Range is a simplification", { size: 14, font: "NewAsterLTStd-It" }))).toBe("quote");
    // A pointer to another book is bold italic at 13 points, not a heading.
    expect(kindOf(line("GURPS Power-Ups 4: Enhancements.", { size: 13, font: "NewAsterLTStd-BoldIt" }))).toBe("text");
    expect(kindOf(line("Some running text", { size: 9.5 }))).toBe("text");
    // The 9-point notes and 9.3-point spell text are text; tables are set smaller.
    expect(kindOf(line("Duration: Works instantly.", { size: 9.3, font: "NewAsterLTStd-It" }))).toBe("text");
    expect(kindOf(line("Accuracy", { size: 8.5 }))).toBe("table");
  });

  it("takes the heading a box opens with as the box's title", () => {
    const title = line("Example of Character Creation (cont'd)", { size: 14, font: "NewAsterLTStd-SemiBoldIt" });
    title.boxTitle = true;
    expect(kindOf(title)).toBe("sidebar-title");
  });
});

describe("small-capitals headings", () => {
  it("are typed in lower case and read in title case", () => {
    expect(headingText("damage resistanCe")).toBe("Damage Resistance");
    expect(headingText("knoCkbaCk")).toBe("Knockback");
    expect(headingText("neW advantages")).toBe("New Advantages");
    expect(headingText("hit points and fatigue")).toBe("Hit Points and Fatigue");
  });

  it("read together when set over two lines", () => {
    const sc = "NewAsterLTStd-Black-SC700";
    const lines = [
      line("damage resistanCe", { size: 20, font: sc, y: 244, x: 293 }),
      line("and Penetration", { size: 20, font: sc, y: 264, x: 293 }),
      ...["Damage Resistance (DR) rates the degree of protec-", "tion that natural or worn armor affords."].map((t, i) =>
        line(t, { y: 277 + i * 11, x: 305 - i * 12, column: 1, indent: 12 - i * 12 }),
      ),
    ];
    const { blocks } = structureOf(page(lines));
    expect(blocks[0]).toMatchObject({ kind: "h2", text: "Damage Resistance and Penetration" });
    expect(blocks[1].kind).toBe("p");
  });
});

describe("reading a page of the Revised edition", () => {
  it("reads a heading, its cost and its paragraphs down the columns (p. 154)", () => {
    const name = { size: 14, font: "NewAsterLTStd-SemiBoldIt" };
    const lines = [
      line("Shyness", { ...name, y: 258 }),
      line("-5, -10, or -20 points", { size: 11, font: "NewAsterLTStd-SemiBold", y: 273 }),
      line("You are uncomfortable around strangers. Roleplay it!", { y: 285, x: 48, indent: 12 }),
      line("This disadvantage comes in three levels; you can buy it off", { y: 296 }),
      line("one level at a time.", { y: 307, width: 74 }),
      line("Mild: You are uneasy with strangers.", { y: 324, x: 48, indent: 12, font: "NewAsterLTStd-It" }),
      line("Skinny", { ...name, y: 583 }),
      line("see p. 18", { size: 11, font: "NewAsterLTStd-SemiBold", y: 598 }),
      line("Sleepy", { ...name, y: 282, x: 293, column: 1 }),
      line("Variable", { size: 11, font: "NewAsterLTStd-SemiBold", y: 297, x: 492, column: 1, width: 39 }),
    ];
    const { blocks } = structureOf(page(lines));
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ["h3", "Shyness"],
      ["h4", "-5, -10, or -20 points"],
      // A paragraph carries on until a line starts indented.
      ["p", "You are uncomfortable around strangers. Roleplay it! This disadvantage comes in three levels; you can buy it off one level at a time."],
      ["p", "Mild: You are uneasy with strangers."],
      ["h3", "Skinny"],
      ["h4", "see p. 18"],
      ["h3", "Sleepy"],
      ["h4", "Variable"],
    ]);
  });

  it("starts the top of the page at 25 points, where the Revised edition sets its first line", () => {
    const lines = [line("Short Lifespan Table", { size: 14, font: "NewAsterLTStd-SemiBoldIt", y: 39, x: 36 })];
    expect(structureOf(page(lines)).blocks).toHaveLength(1);
    // The 2004 layout keeps its 45.
    expect(structureOf({ ...page(lines), profile: undefined }).blocks).toHaveLength(0);
  });

  it("does not let a profile outlive the page it read", () => {
    structureOf(page([line("Shyness", { size: 14, font: "NewAsterLTStd-SemiBoldIt" })]));
    // The 2004 rules: 14-point semibold italic in a 3-column book is level 3 too, but
    // black small capitals of 20 points are level 2 only when they are upper case.
    const old = { ...page([line("Damage Roll", { size: 20, font: "NewAsterLTStd-Black-SC700", y: 100 })]), profile: undefined };
    old.columns = { edges: [78, 242, 406], width: 146 };
    expect(structureOf(old).blocks[0].kind).not.toBe("chapter");
  });
});

describe("the text of the Revised edition", () => {
  it("turns its non-breaking hyphen into the minus sign the prose uses", () => {
    expect(plainRevised("-5, ‑10, or ‑20 points")).toBe("-5, -10, or -20 points");
    expect(plainRevised("DR ‑2 and −3")).toBe("DR -2 and -3");
  });

  it("knows its running head and folio", () => {
    expect(isRunningHead("154 Disadvantages")).toBe(true);
    expect(isRunningHead("Advantages 155")).toBe(true);
    expect(isRunningHead("378 Combat")).toBe(true);
    expect(isRunningHead("324 Addendum 1")).toBe(true);
    expect(isRunningHead("Roll 3 dice")).toBe(false);
    expect(isRunningHead("10 Skills")).toBe(true);
    expect(isRunningHead("You gain 5 Skills")).toBe(false);
  });

  it("drops the trait-type icons after a heading, and only there", () => {
    expect(stripIcons("Shyness M")).toBe("Shyness");
    expect(stripIcons("Absolute Direction M P")).toBe("Absolute Direction");
    expect(stripIcons("360° Vision P X")).toBe("360° Vision");
    expect(stripIcons("Telecommunication M P X")).toBe("Telecommunication");
    expect(stripIcons("Animal Friend Su")).toBe("Animal Friend");
    // A sentence is left as it is.
    expect(stripIcons("Take a dose of vitamin A.")).toBe("Take a dose of vitamin A.");
  });
});

// The book itself is not in the repository. With its path in GURPS_REVISED_PDF the
// pages the profile was learned from are read for real.
const PDF = process.env.GURPS_REVISED_PDF;
describe.skipIf(!PDF || !existsSync(PDF))("the Revised PDF", () => {
  it("reads p. 154 and p. 378 as the profile says", async () => {
    const book = await openBook(PDF);
    const shy = structureOf(await readPage(book, pdfPageOf(154), { profile: REVISED }));
    const names = shy.blocks.filter((b) => b.kind === "h3").map((b) => b.text);
    expect(names).toContain("Shyness");
    expect(names).toContain("Slave Mentality");
    // Icons are dropped from the name, the minus sign survives.
    expect(names).toContain("Sleepwalker");
    expect(shy.blocks.find((b) => b.text.startsWith("Overwhelming:"))?.text).toContain("-20 points");

    const damage = structureOf(await readPage(book, pdfPageOf(378), { profile: REVISED }));
    expect(damage.blocks.filter((b) => b.kind === "h2").map((b) => b.text)).toEqual(["Damage Roll", "Damage Resistance and Penetration"]);
    expect(damage.blocks.filter((b) => b.kind === "h3").map((b) => b.text)).toContain("Half Damage (1/2D) for Ranged Weapons");
    // The knockback box is a sidebar with a title of its own.
    expect(damage.asides.find((a) => a.kind === "sidebar")?.title).toBe("Knockback");
  }, 60_000);
});
