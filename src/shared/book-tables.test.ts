import { describe, expect, it } from "vitest";

import { BookTables, bookOf, type BookTable } from "./book-tables.js";
import { MODULE_ID } from "./module.js";

interface Table extends BookTable {
  rule: string;
}

const a: Table = { book: "book-a", tls: { min: 9, max: 12 }, rule: "a" };
const b: Table = { book: "book-b", tls: { min: 0, max: 8 }, rule: "b" };
const item = (book: string | null, tl = "") => ({ system: { tl }, flags: book ? { [MODULE_ID]: { book } } : {} });

function tables(): BookTables<Table> {
  const t = new BookTables<Table>();
  t.register(a);
  t.register(b);
  return t;
}

describe("a shared engine's tables, one per book", () => {
  it("reads the book an item comes from off the module's flag", () => {
    expect(bookOf(item("book-b"))).toBe("book-b");
    expect(bookOf(item(null))).toBeNull();
  });

  it("keeps one table per book, a second registration replacing the first", () => {
    const t = tables();
    const again = { ...a, rule: "a2" };
    t.register(again);
    expect(t.all).toEqual([again, b]);
  });

  it("gives a book's item its own book's table, only while that book's switch is on", () => {
    const t = tables();
    expect(t.forItem(item("book-b"), (x) => x.rule === "b")).toBe(b);
    expect(t.forItem(item("book-b"), (x) => x.rule === "a")).toBeNull();
    // Its figures are still its own book's.
    expect(t.figuresFor(item("book-b"), () => false)).toBe(b);
  });

  it("gives an item from no book with a table a switched-on book's, by TL and then by order", () => {
    const t = tables();
    const both = () => true;
    expect(t.forItem(item(null, "7"), both)).toBe(b);
    expect(t.forItem(item("basic-set", "10"), both)).toBe(a);
    expect(t.forItem(item(null), both)).toBe(a);
    expect(t.forItem(item(null, "10"), (x) => x.rule === "b")).toBe(b);
    expect(t.forItem(item(null), () => false)).toBeNull();
    expect(t.figuresFor(item(null), () => false)).toBe(a);
  });
});
