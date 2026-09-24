/**
 * The module's translations as Foundry loads them. Foundry expands dotted
 * keys into nested objects, so a key that is both a string ("Task") and the
 * parent of dotted keys ("Task.detect", written flat or nested) can't be
 * expanded, and then none of the module's translations load (#487). A key
 * written twice in one object is kept only in its last copy, so the first
 * string is lost, and a script that loads and rewrites the file drops it for
 * good (#538); `JSON.parse` hides that, so the raw text is scanned.
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

/**
 * The keys written more than once in the same object of the raw JSON text,
 * each as its dotted path. Assumes the text is valid JSON.
 */
function duplicateKeys(text: string): string[] {
  const duplicates: string[] = [];
  let i = 0;
  const skipSpace = () => {
    while (/\s/.test(text[i] ?? "")) i += 1;
  };
  const readString = (): string => {
    const start = i;
    i += 1;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i += 1;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const readValue = (path: string): void => {
    skipSpace();
    const open = text[i];
    if (open === '"') {
      readString();
    } else if (open === "{" || open === "[") {
      const close = open === "{" ? "}" : "]";
      const seen = new Set<string>();
      i += 1;
      skipSpace();
      for (let index = 0; text[i] !== close; index += 1) {
        let childPath = `${path}${path ? "." : ""}${index}`;
        if (open === "{") {
          skipSpace();
          const key = readString();
          childPath = path ? `${path}.${key}` : key;
          if (seen.has(key)) duplicates.push(childPath);
          seen.add(key);
          skipSpace();
          i += 1; // the colon
        }
        readValue(childPath);
        skipSpace();
        if (text[i] === ",") i += 1;
        skipSpace();
      }
      i += 1;
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i += 1;
    }
  };
  readValue("");
  return duplicates;
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

  it("finds a key written twice in the same object, however deep", () => {
    expect(duplicateKeys('{"A": {"B": "one", "C": "x", "B": "two"}}')).toEqual(["A.B"]);
    expect(duplicateKeys('{"A": {"B": {"C": 1}}, "A": [{"D": true, "D": null}]}')).toEqual(["A", "A.0.D"]);
    expect(duplicateKeys('{"A": {"B": "one"}, "C": {"B": "two", "E": "say \\"B\\": {}"}}')).toEqual([]);
  });

  it("has no key written twice in the same object", () => {
    expect(duplicateKeys(readFileSync(join(import.meta.dirname, "../lang/en.json"), "utf8"))).toEqual([]);
  });
});
