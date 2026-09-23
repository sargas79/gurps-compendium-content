/**
 * Keeping one book's record ids clear of every other book's.
 *
 * The system's parser makes an id from a record's kind and name, and steps
 * aside only for the Basic Set's own ids. Two supplements that print the same
 * perk or the same boots (Quick-Swap in Martial Arts and High-Tech; Shoes,
 * Climbing in Monster Hunters 1 and High-Tech) come out with the same id, and
 * the module's packs are validated as one set, where an id may be used once.
 *
 * The book whose parser ran last moves: its colliding record gets an id seeded
 * with its own prefix and the old id, the same every time. On the next run the
 * parser reads that id back from its own file by name, so it stays put.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A 16-character id seeded with the book's prefix and the id it replaces. */
export function bookScopedId(prefix, id) {
  return createHash("sha1").update(`${prefix}:${id}`).digest("hex").slice(0, 16);
}

/**
 * Gives every record whose id is taken a book-scoped one, in place, and
 * returns what moved as [name, old id, new id].
 */
export function clearOfTaken(docs, taken, prefix) {
  const moved = [];
  for (const doc of docs) {
    if (!doc?._id || !taken.has(doc._id)) continue;
    const next = bookScopedId(prefix, doc._id);
    moved.push([String(doc.name ?? ""), doc._id, next]);
    doc._id = next;
  }
  return moved;
}

/** Every top-level record id in the statistics of the books other than `slug`. */
export function otherBooksIds(booksRoot, slug) {
  const taken = new Set();
  if (!existsSync(booksRoot)) return taken;
  for (const entry of readdirSync(booksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === slug) continue;
    const packs = join(booksRoot, entry.name, "packs-src");
    if (!existsSync(packs)) continue;
    for (const pack of readdirSync(packs, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const file of readdirSync(join(packs, pack.name)).filter((f) => f.endsWith(".json"))) {
        const docs = JSON.parse(readFileSync(join(packs, pack.name, file), "utf8"));
        if (Array.isArray(docs)) for (const doc of docs) if (doc?._id) taken.add(doc._id);
      }
    }
  }
  return taken;
}
