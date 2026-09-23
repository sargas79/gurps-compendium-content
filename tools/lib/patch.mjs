/**
 * A book's `patch` rules (book.json), applied to one record the parsers wrote.
 *
 * A rule names the records it is for by a name pattern and, optionally, by
 * `where`: fields, by path, that must hold exactly the value given. It then
 * sets fields by path. A `*` in a path stands for every element of the array
 * at that point, so one rule can set a figure on every attack mode of a
 * weapon, however many it has; a record without that array is left alone.
 * Anything else on the path that is missing is created.
 */

/** The value at a dotted path, or undefined; no wildcards. */
function valueAt(doc, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), doc);
}

/** Sets `value` at the keys from `node` down, fanning out at each `*`. */
function setAt(node, keys, value) {
  const [key, ...rest] = keys;
  if (key === "*") {
    if (!Array.isArray(node)) return;
    for (const element of node) {
      if (rest.length === 0) continue;
      if (element !== null && typeof element === "object") setAt(element, rest, value);
    }
    return;
  }
  if (rest.length === 0) {
    node[key] = structuredClone(value);
    return;
  }
  // A wildcard next must find an array there, never make one.
  if (rest[0] === "*") {
    if (Array.isArray(node[key])) setAt(node[key], rest, value);
    return;
  }
  node[key] ??= {};
  setAt(node[key], rest, value);
}

/** Whether a rule is for this record: its name pattern and every `where`. */
export function patchApplies(rule, doc) {
  if (!rule.pattern.test(String(doc?.name ?? ""))) return false;
  return Object.entries(rule.where ?? {}).every(([path, value]) => valueAt(doc, path) === value);
}

/** Applies one rule's `set` to a record it is for. */
export function applyPatch(rule, doc) {
  for (const [path, value] of Object.entries(rule.set ?? {})) setAt(doc, path.split("."), value);
}
