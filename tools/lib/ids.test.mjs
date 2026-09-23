import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bookScopedId, clearOfTaken, otherBooksIds } from "./ids.mjs";

describe("clearOfTaken", () => {
  it("moves a record whose id another book has, and leaves the rest", () => {
    const docs = [
      { _id: "aaaaaaaaaaaaaaaa", name: "Quick-Swap" },
      { _id: "bbbbbbbbbbbbbbbb", name: "Fastest Gun in the West" },
    ];
    const moved = clearOfTaken(docs, new Set(["aaaaaaaaaaaaaaaa"]), "HT");
    expect(moved).toEqual([["Quick-Swap", "aaaaaaaaaaaaaaaa", bookScopedId("HT", "aaaaaaaaaaaaaaaa")]]);
    expect(docs[0]._id).toBe(bookScopedId("HT", "aaaaaaaaaaaaaaaa"));
    expect(docs[1]._id).toBe("bbbbbbbbbbbbbbbb");
  });

  it("makes the same id every time, and one Foundry accepts", () => {
    const id = bookScopedId("HT", "aaaaaaaaaaaaaaaa");
    expect(id).toBe(bookScopedId("HT", "aaaaaaaaaaaaaaaa"));
    expect(id).not.toBe(bookScopedId("MA", "aaaaaaaaaaaaaaaa"));
    expect(id).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});

describe("otherBooksIds", () => {
  let root;
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it("reads every other book's statistics, not the book's own", () => {
    root = mkdtempSync(join(tmpdir(), "gcc-ids-"));
    const write = (slug, pack, file, docs) => {
      mkdirSync(join(root, slug, "packs-src", pack), { recursive: true });
      writeFileSync(join(root, slug, "packs-src", pack, file), JSON.stringify(docs));
    };
    write("martial-arts", "advantages", "martial-arts-advantages.json", [{ _id: "ma1", name: "Quick-Swap" }]);
    write("monster-hunters-1", "equipment", "monster-hunters-1-by-hand.json", [{ _id: "mh1", name: "Shoes, Climbing" }]);
    write("high-tech", "advantages", "high-tech-advantages.json", [{ _id: "ht1", name: "Quick-Swap" }]);
    mkdirSync(join(root, "basic-set"));

    expect([...otherBooksIds(root, "high-tech")].sort()).toEqual(["ma1", "mh1"]);
  });
});
