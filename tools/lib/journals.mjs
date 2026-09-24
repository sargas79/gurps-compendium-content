/**
 * A book's rules text as a JournalEntry pack, one entry per rule.
 *
 * A rule is a Markdown file under `books/<slug>/journals/`, listed in that
 * directory's `index.json`:
 *
 *     {
 *       "pages": [
 *         { "id": "active-defense", "title": "Active Defense",
 *           "chapter": "Combat", "pages": "B374-375", "rule": "feverishDefense",
 *           "file": "active-defense.md" }
 *       ]
 *     }
 *
 * `chapter` becomes the folder the entry sits in, `pages` the book's page range
 * shown above the text, and `rule` the id of the switch on the system's "GURPS
 * rules in play" page where the rule is an optional one — kept in a flag so that
 * page can link to the text later without this repository having to know how.
 *
 * A book with no `journals/` directory produces no pack, which is what every
 * book looks like until its text is written.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { MODULE_ID, packId, readJson } from "./books.mjs";
import { citationOf, volumeOfPages, volumeOfReference } from "./sources.mjs";

/**
 * A deterministic 16-character id from a string.
 *
 * Foundry wants 16 alphanumerics, and a journal entry's id has to survive a
 * rebuild: a page whose id changed would come back as a new document, losing
 * anything linking to it. Hashing the book and the rule's own id gives the same
 * answer every time without a file of assignments to keep.
 */
async function stableId(...parts) {
  const { createHash } = await import("node:crypto");
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 16);
}

/** Markdown to HTML, loaded only when there is something to convert. */
async function renderer() {
  const { marked } = await import("marked");
  return (markdown) => marked.parse(markdown, { async: false, gfm: true });
}

/**
 * The pack for one book's rules text, or null when it has none.
 *
 * Every page becomes a JournalEntry of its own rather than a page inside one
 * big entry: a rule is what gets searched for, linked to and opened beside the
 * sheet, and Foundry searches entry names.
 */
export async function journalPack(bk) {
  const dir = join(bk.dir, "journals");
  const indexPath = join(dir, "index.json");
  if (!existsSync(indexPath)) return null;

  const index = readJson(indexPath);
  const pages = Array.isArray(index.pages) ? index.pages : [];
  if (pages.length === 0) return null;

  const render = await renderer();
  const documents = [];
  const problems = [];
  const chapters = new Set();
  const seen = new Set();

  for (const page of pages) {
    if (!page.id || !page.title || !page.file) {
      problems.push(`${indexPath}: every page needs an id, a title and a file.`);
      continue;
    }
    if (seen.has(page.id)) {
      problems.push(`${indexPath}: two pages share the id "${page.id}".`);
      continue;
    }
    seen.add(page.id);

    const file = join(dir, page.file);
    if (!existsSync(file)) {
      problems.push(`${indexPath} — ${page.id}: no such file ${page.file}.`);
      continue;
    }

    const id = await stableId(bk.slug, page.id);
    const pageId = await stableId(bk.slug, page.id, "page");
    const folderId = page.chapter ? await stableId(bk.slug, "folder", page.chapter) : null;
    const body = render(readFileSync(file, "utf8"));
    // A page may name its own volume: the Basic Set is two books sharing one
    // run of page numbers, and the book's default reference is only right for
    // the first of them. A page of one of the book's other volumes -- "HT:EE12",
    // a supplement's (tools/lib/sources.mjs) -- cites that volume, and a
    // reference naming another volume than its pages do is refused.
    const pagesIn = page.pages ? volumeOfPages(bk, page.pages) : undefined;
    const referenceIn = page.reference ? volumeOfReference(bk, page.reference) : undefined;
    if (page.pages && page.reference && (pagesIn?.id ?? null) !== (referenceIn?.id ?? null)) {
      problems.push(
        `${indexPath} — ${page.id}: its pages "${page.pages}" and its reference "${page.reference}" cite different volumes.`,
      );
      continue;
    }
    const cite = page.reference
      ? page.reference
      : pagesIn?.id
        ? citationOf(bk, page.pages)
        : page.pages
          ? `${bk.reference} p. ${String(page.pages).replace(/^B/, "")}`
          : "";
    const citation = cite ? `<p class="gcc-source"><em>${cite}</em></p>` : "";

    if (page.chapter) chapters.add(page.chapter);

    documents.push({
      _key: `!journal!${id}`,
      _id: id,
      name: page.title,
      pages: [
        {
          // An embedded document carries its own key, built from the collection
          // path and the ids above it: compilePack walks the hierarchy and writes
          // each level under its own key, and a page without one aborts the pack.
          _key: `!journal.pages!${id}.${pageId}`,
          _id: pageId,
          name: page.title,
          type: "text",
          title: { show: false, level: 1 },
          text: { format: 1, content: citation + body },
          sort: 0,
          ownership: { default: -1 },
          flags: {},
        },
      ],
      folder: folderId,
      sort: 0,
      flags: {
        [MODULE_ID]: {
          book: bk.slug,
          rule: page.rule ?? null,
          chapter: page.chapter ?? null,
          ...(page.pages ? { pages: page.pages } : {}),
          // Carried through so a page whose extraction is doubtful says so
          // wherever it is read, not only in the file it was written from.
          status: page.status ?? (page.notes ? "needs-review" : "transcribed"),
          ...(page.notes ? { notes: page.notes } : {}),
        },
      },
    });
  }

  // One folder per chapter, which is what `chapter` promises: without the
  // Folder documents in the pack, every entry sits loose at the top of it.
  // Named and sorted as the index names them, so "1. Templates" comes first.
  const rules = documents.length;
  for (const chapter of [...chapters].sort()) {
    const folderId = await stableId(bk.slug, "folder", chapter);
    documents.push({
      _key: `!folders!${folderId}`,
      _id: folderId,
      name: chapter,
      type: "JournalEntry",
      description: "",
      folder: null,
      sorting: "a",
      sort: 0,
      color: null,
      flags: {},
    });
  }

  return {
    book: bk,
    pack: "rules",
    id: packId(bk, "rules"),
    label: `${bk.label} – Rules`,
    type: "JournalEntry",
    documents,
    problems,
    chapters: [...chapters].sort(),
    byStatus: new Map([["rule", rules]]),
  };
}

/** Whether a book has any rules text at all. */
export function hasJournals(bk) {
  const dir = join(bk.dir, "journals");
  return existsSync(join(dir, "index.json")) && readdirSync(dir).some((f) => f.endsWith(".md"));
}
