/**
 * The module's translations as Foundry loads them. Foundry expands dotted
 * keys into nested objects, so a key that is both a string ("Task") and the
 * parent of dotted keys ("Task.detect", written flat or nested) can't be
 * expanded, and then none of the module's translations load (#487).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every key of the file, flattened with dots, and whether it holds a string. */
function flatten(node: unknown, prefix = "", out = new Map<string, boolean>()): Map<string, boolean> {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") flatten(value, path, out);
      else out.set(path, typeof value === "string");
    }
  }
  return out;
}

/** The string keys that are also the parent of another key. */
function stringParents(translations: unknown): string[] {
  const keys = flatten(translations);
  const parents = new Set<string>();
  for (const key of keys.keys()) {
    const parts = key.split(".");
    for (let i = 1; i < parts.length; i += 1) parents.add(parts.slice(0, i).join("."));
  }
  return [...keys].filter(([key, isString]) => isString && parents.has(key)).map(([key]) => key);
}

describe("lang/en.json", () => {
  it("finds a key that is both a string and a parent, flat or nested", () => {
    expect(stringParents({ A: { Task: "Task", "Task.detect": "Detect" } })).toEqual(["A.Task"]);
    expect(stringParents({ A: { Task: "Task" }, "A.Task": { detect: "Detect" } })).toEqual(["A.Task"]);
    expect(stringParents({ A: { TaskField: "Task", Task: { detect: "Detect" } } })).toEqual([]);
  });

  it("has no key that is both a string and the parent of dotted keys", () => {
    const translations = JSON.parse(readFileSync(join(import.meta.dirname, "../lang/en.json"), "utf8"));
    expect(stringParents(translations)).toEqual([]);
  });
});
