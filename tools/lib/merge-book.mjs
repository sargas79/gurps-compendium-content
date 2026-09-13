/**
 * Joins a book's statistics to its text, and proves it changed nothing else.
 *
 * This is the whole of what the module does to an item, and the reason the
 * repository can hold the books' prose without holding a second copy of the
 * rules: the document that reaches Foundry is the system's own document with
 * `system.description` filled in.
 *
 * The three failures below are the ones that would go unnoticed otherwise, and
 * each is fatal rather than a warning:
 *
 *   - an **orphan**: text keyed to an id the statistics no longer have, which
 *     means an entry was renamed or dropped upstream and its text now belongs to
 *     nothing.
 *   - **drift**: text whose `name` disagrees with the statistics' name for that
 *     id. The id is a hash of the entry's name when it was first published and
 *     is deliberately kept across renames, so this is the only signal that the
 *     entry the text was written against is not the entry it now lands on.
 *   - a **statistic**: a text record trying to set anything but text. Nothing in
 *     this repository may price a trait or set a skill's difficulty; those come
 *     from the system, and a record that reached past its remit would put two
 *     sources of truth in play.
 */

import {
  ACTOR_TYPES,
  MODULE_ID,
  packDocumentTypes,
  packId,
  packLabel,
  readProse,
  readStatistics,
} from "./books.mjs";

/** The only keys a text record may carry. */
const PROSE_KEYS = new Set(["_id", "name", "description", "pages", "status", "notes"]);

/**
 * The states a text record may be in.
 *
 * `no-entry` is terminal and means something different from the rest: the book
 * was consulted and prints nothing under that name. Most of the data file's
 * constructed names are like this -- "Extra ST" is how it writes buying the
 * attribute, "Horse Mail Face Mask" is a row of the barding table -- and there
 * are 853 of them in the Basic Set. Left as needs-review they would sit in the
 * queue forever and make the count of real work meaningless.
 */
export const STATUSES = new Set([
  "draft",
  "transcribed",
  "reviewed",
  "needs-review",
  "no-entry",
]);

/** Statuses that legitimately carry no text. */
export const WITHOUT_TEXT = new Set(["needs-review", "no-entry"]);

/** What a document with no text yet is recorded as. */
export const NO_PROSE = "none";

/**
 * Everything Foundry needs of a document that the source JSON should not repeat.
 *
 * `_key` is required and easy to miss: compilePack skips any document without
 * one, so omitting it produces an empty pack that compiles without error. The
 * system's own build tool drops `flags` here; this one keeps them, because the
 * review status of a piece of text is the module's to carry.
 */
function foundryDocument(entry, prose, bk) {
  const actor = ACTOR_TYPES.has(entry.type);
  const system = { ...(entry.system ?? {}) };

  // An item's text is system.description. A creature's goes into
  // system.details.description, a field of its own beside the notes line that
  // already carries its category and page -- so the book's words never land on
  // top of what the statistics came with.
  if (prose) {
    if (actor) {
      system.details = { ...(system.details ?? {}), description: prose.description ?? "" };
    } else {
      system.description = prose.description ?? "";
    }
  }

  return {
    _key: `!${actor ? "actors" : "items"}!${entry._id}`,
    _id: entry._id,
    name: entry.name,
    type: entry.type,
    img: entry.img ?? undefined,
    system,
    // An actor carries its traits, skills and gear with it, and every document
    // in the hierarchy has to say where it sits. Dropping these leaves a
    // creature that loads with none of what makes it one.
    ...(actor
      ? {
          items: (entry.items ?? []).map((item) => ({
            _key: `!actors.items!${entry._id}.${item._id}`,
            ...item,
          })),
          prototypeToken: entry.prototypeToken ?? undefined,
        }
      : {}),
    flags: {
      [MODULE_ID]: {
        book: bk.slug,
        status: prose ? prose.status : NO_PROSE,
        ...(prose?.pages ? { pages: prose.pages } : {}),
        ...(prose?.notes ? { notes: prose.notes } : {}),
      },
    },
  };
}

/**
 * Confirms the merge touched nothing but the description.
 *
 * The construction above already makes this true, but it is the guarantee the
 * whole split rests on, so it is checked rather than assumed: a later change to
 * this file that started adjusting a cost would be caught here instead of in a
 * campaign.
 */
function assertOnlyDescriptionChanged(before, after, pack, name) {
  const strip = (system) => {
    const copy = { ...(system ?? {}) };
    delete copy.description;
    if (copy.details) {
      copy.details = { ...copy.details };
      delete copy.details.description;
    }
    return JSON.stringify(copy);
  };
  if (strip(before) !== strip(after)) {
    throw new Error(
      `${pack} — ${name}: the merge changed a statistic. Only the description may differ.`,
    );
  }
}

/**
 * One book's packs, merged.
 *
 * Returns the documents per pack and a per-pack tally of how much text is in,
 * which is what `coverage.mjs` reports and `merge.mjs` prints. Problems are
 * collected rather than thrown one at a time, so a first run after an upstream
 * change lists everything that needs attention at once.
 */
export function mergeBook(bk, packs) {
  const results = [];
  const problems = [];
  const types = packDocumentTypes(bk);

  for (const pack of packs) {
    const statistics = readStatistics(bk, pack);
    const { path: prosePath, records } = readProse(bk, pack);
    const documentType = types.get(pack) ?? "Item";
    const seen = new Set();
    const documents = [];
    const byStatus = new Map();

    // Only Item and Actor packs carry text; a journal pack is built elsewhere.
    if (documentType !== "Item" && documentType !== "Actor" && records.size > 0) {
      problems.push(`${prosePath}: ${pack} is a ${documentType} pack, which takes no text here.`);
      records.clear();
    }

    for (const { entry } of statistics) {
      const prose = records.get(entry._id);

      if (prose) {
        seen.add(entry._id);

        const stray = Object.keys(prose).filter((key) => !PROSE_KEYS.has(key));
        if (stray.length) {
          problems.push(
            `${prosePath} — ${prose.name ?? entry._id}: ${stray.join(", ")} ` +
              `${stray.length === 1 ? "is not text" : "are not text"}. ` +
              `Statistics belong to the system, not here.`,
          );
          continue;
        }
        if (prose.name !== entry.name) {
          problems.push(
            `${prosePath} — ${entry._id}: text was written for "${prose.name}" ` +
              `but that id now names "${entry.name}". Check the text against the entry, ` +
              `then update the name here.`,
          );
          continue;
        }
        if (!STATUSES.has(prose.status)) {
          problems.push(
            `${prosePath} — ${prose.name}: status "${prose.status}" is not one of ` +
              `${[...STATUSES].join(", ")}.`,
          );
          continue;
        }
        if (!WITHOUT_TEXT.has(prose.status) && !String(prose.description ?? "").trim()) {
          problems.push(
            `${prosePath} — ${prose.name}: no description. An entry the book prints no text ` +
              `for is recorded as no-entry; one that needs a person is needs-review.`,
          );
          continue;
        }
      }

      const document = foundryDocument(entry, prose, bk);
      assertOnlyDescriptionChanged(entry.system, document.system, pack, entry.name);
      documents.push(document);

      const status = document.flags[MODULE_ID].status;
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    }

    for (const [id, record] of records) {
      if (seen.has(id)) continue;
      problems.push(
        `${prosePath} — ${record.name ?? id}: no entry with id ${id} in ${pack}. ` +
          `The entry was renamed or removed upstream; check it and move the text.`,
      );
    }

    results.push({
      book: bk,
      pack,
      id: packId(bk, pack),
      label: packLabel(bk, pack),
      type: documentType,
      documents,
      byStatus,
    });
  }

  return { results, problems };
}
