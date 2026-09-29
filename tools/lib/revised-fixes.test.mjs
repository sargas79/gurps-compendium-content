import { describe, expect, it } from "vitest";

import { REVISED_FIXES } from "./revised-fixes.mjs";
import { VEHICLE_TABLES } from "./revised-vehicle-tables.mjs";

describe("the corrections to the Basic Set Revised's pages", () => {
  it("each names a page and gives words to find and what replaces them, or text to append", () => {
    for (const [id, fixes] of Object.entries(REVISED_FIXES)) {
      expect(id, "a fix names a page").toMatch(/^[a-z][A-Za-z0-9]+$/);
      expect(fixes.length).toBeGreaterThan(0);
      for (const fix of fixes) {
        if ("append" in fix) {
          expect(fix.append, `${id}: text to append`).toMatch(/\S/);
          continue;
        }
        expect(typeof fix.find === "string" || fix.find instanceof RegExp, `${id}: what to find`).toBe(true);
        expect(["string", "function"], `${id}: what replaces it`).toContain(typeof fix.with);
      }
    }
  });

  it("replaces a note's first line with the whole note", () => {
    const [fix] = REVISED_FIXES.parrying;
    expect(fix.with).toContain(fix.find);
    expect(fix.with.length).toBeGreaterThan(fix.find.length);
  });

  it("gives the four vehicle tables a column heading each", () => {
    for (const title of ["Ground Vehicle Table", "Watercraft Table", "Aircraft Table", "Spacecraft Table"]) {
      const at = VEHICLE_TABLES.indexOf(`#### ${title}`);
      expect(at, title).toBeGreaterThanOrEqual(0);
      expect(VEHICLE_TABLES.slice(at).split("\n")[2], title).toMatch(/^\| TL \| Vehicle \|/);
    }
  });
});
