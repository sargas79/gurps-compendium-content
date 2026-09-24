/**
 * A book printed in more than one volume of its own.
 *
 * A supplement can belong to a book rather than stand beside it: GURPS
 * High-Tech: Electricity and Electronics adds to High-Tech's catalogue and
 * rules, so its records go in High-Tech's packs under High-Tech's book flag
 * (private #471, E1). It is still its own PDF, with its own page numbers, so
 * each of its citations has to name it, or "p. 12" could be either book's.
 *
 * book.json lists such a volume under `sources`:
 *
 *     "sources": [{
 *       "id": "ee",
 *       "title": "GURPS High-Tech: Electricity and Electronics",
 *       "reference": "High-Tech: Electricity and Electronics",
 *       "pdf": "GURPS_4th_Edition_High-Tech_Electricity_and_Electronics.pdf",
 *       "transcription": { "pdfOffset": 0, "pageLabel": "HT:EE" },
 *       "capture": { ... },
 *       "overlap": "overlap-ee.txt"
 *     }]
 *
 * and a citation says which volume it is in the way every citation already
 * does: a record's `reference` ("High-Tech: Electricity and Electronics p.
 * 12", beside High-Tech's own "High-Tech p. 12"), a text record's or journal
 * page's `pages` ("HT:EE12", beside "HT12"). The book's own volume is the
 * source with no id.
 *
 * `withSource` gives the tools a book read as one of its volumes -- that
 * volume's reference, page label, PDF offset and capture settings -- so a tool
 * that reads one PDF needs only to be told which, and to leave the other
 * volumes' entries alone.
 *
 * Everything here is pure, so it can be tested without a book on disk.
 */

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A book's other volumes, read from its book.json. */
export function readSources(raw) {
  const out = [];
  for (const source of raw.sources ?? []) {
    const id = String(source.id ?? "");
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`A source's id must be a short lower-case word; got "${source.id}".`);
    if (out.some((other) => other.id === id)) throw new Error(`Two sources share the id "${id}".`);
    if (!source.reference || !source.transcription?.pageLabel) {
      throw new Error(`Source "${id}" needs a reference and a transcription.pageLabel, or its citations can't name it.`);
    }
    out.push({
      id,
      title: String(source.title ?? source.reference),
      reference: String(source.reference),
      pdf: source.pdf ? String(source.pdf) : null,
      transcription: source.transcription,
      capture: source.capture ?? {},
      overlap: source.overlap ? String(source.overlap) : null,
    });
  }
  return out;
}

/** Every volume of a book, its own first, each with what tells its citations apart. */
export function volumesOf(bk) {
  // A book read as another volume keeps its own citations in `ownVolume`.
  const own = bk.ownVolume ?? { title: bk.title, reference: bk.reference, pageLabel: bk.transcription.pageLabel };
  return [
    { id: null, ...own },
    ...(bk.sources ?? []).map((s) => ({ id: s.id, title: s.title, reference: s.reference, pageLabel: s.transcription.pageLabel })),
  ];
}

/**
 * Which volume a citation is in, or undefined when it names none of them.
 * The longest match wins, so a label or reference that starts another's is
 * never mistaken for it.
 */
function match(volumes, test) {
  return volumes.filter(test).sort((a, b) => b.reference.length - a.reference.length)[0];
}

/** The volume a record's `reference` ("High-Tech p. 12") cites. */
export function volumeOfReference(bk, reference) {
  const text = String(reference ?? "");
  return match(volumesOf(bk), (v) => new RegExp(`^${escape(v.reference)} pp?\\.\\s*\\d`).test(text));
}

/** The volume a text record's or journal page's `pages` ("HT12", "HT:EE12") cites. */
export function volumeOfPages(bk, pages) {
  const text = String(pages ?? "");
  return match(volumesOf(bk), (v) => v.pageLabel !== "" && new RegExp(`^${escape(v.pageLabel)}\\d`).test(text));
}

/** The citation a journal page shows for its pages: "HT:EE12-13" reads "High-Tech: Electricity and Electronics pp. 12-13". */
export function citationOf(bk, pages) {
  const volume = volumeOfPages(bk, pages) ?? volumesOf(bk)[0];
  const run = String(pages).slice(volume.pageLabel.length);
  return `${volume.reference} p${/[-–,]/.test(run) ? "p" : ""}. ${run}`;
}

/**
 * The book read as one of its volumes: the book itself when `id` is empty,
 * else the same book with that volume's reference, reading settings and
 * capture rules in place of its own. The packs and the book flag stay the
 * book's; `source` says which volume it is.
 */
export function withSource(bk, id) {
  const ownVolume = bk.ownVolume ?? { title: bk.title, reference: bk.reference, pageLabel: bk.transcription.pageLabel };
  if (!id) return { ...bk, source: null, ownVolume };
  const source = (bk.sources ?? []).find((s) => s.id === id);
  if (!source) {
    const known = (bk.sources ?? []).map((s) => s.id);
    throw new Error(`${bk.slug} has no source "${id}".${known.length ? ` Sources: ${known.join(", ")}.` : " It has no sources."}`);
  }
  const t = source.transcription;
  return {
    ...bk,
    source,
    ownVolume,
    reference: source.reference,
    transcription: {
      pdfOffset: t.pdfOffset ?? 0,
      pageLabel: t.pageLabel,
      namePrefix: t.namePrefix ? new RegExp(t.namePrefix) : null,
      // How the PDF is read is the volume's own; unsaid, it is read as the book is.
      asidesAsText: t.asidesAsText ?? bk.transcription.asidesAsText,
      layout: t.layout ?? bk.transcription.layout,
      // Names and families are the volume's own: the book's are for its own headings.
      aliases: t.aliases ?? {},
      families: (t.families ?? []).map((rule) => ({
        pattern: new RegExp(rule.pattern),
        replace: String(rule.replace ?? ""),
        heading: rule.heading ? String(rule.heading) : null,
        headingOnly: rule.headingOnly === true,
        scoped: rule.scoped === true,
      })),
    },
    capture: {
      skip: source.capture.skip ?? [],
      set: source.capture.set ?? [],
      ...(source.capture.labelEnd ? { labelEnd: String(source.capture.labelEnd) } : {}),
      ...(source.capture.cellSizes ? { cellSizes: source.capture.cellSizes.map(String) } : {}),
      runInHeadings: source.capture.runInHeadings === true,
      repeatsByTl: source.capture.repeatsByTl === true,
      noLegality: source.capture.noLegality === true,
      powerBeforePrice: source.capture.powerBeforePrice === true,
      years: source.capture.years === true,
    },
  };
}

/** What a volume's cached reading is kept under: the book's slug, and the volume's id where it is another. */
export function volumeKey(bk) {
  return bk.source ? `${bk.slug}-${bk.source.id}` : bk.slug;
}

/**
 * Whether a record belongs to the volume a book was read as: its reference
 * cites that volume. A record citing none of them belongs to the book's own,
 * which is what every record was before a book had sources.
 */
export function inSource(bk, entry) {
  const cited = volumeOfReference(bk, entry?.system?.reference ?? entry?.system?.details?.notes ?? "");
  return (cited?.id ?? null) === (bk.source?.id ?? null);
}

/**
 * The E2 decisions for a volume's records that share a name with the book's
 * own, from its overlap file (#471): one tab-separated line each,
 *
 *     EQUIPMENT  <this volume's name>  <the book's record>  <pages>  keep|skip  <why>
 *
 * by the volume's name, lower-cased. Blank lines and lines starting "#" are
 * comments.
 */
export function readOverlap(text) {
  const out = new Map();
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [section, name, theirs, pages, decision, why] = line.split("\t");
    if (!["keep", "skip"].includes(decision)) {
      throw new Error(`Overlap line ${index + 1} (${name}): the decision is "${decision}", not keep or skip.`);
    }
    out.set(String(name).toLowerCase(), { section, name, theirs, pages, decision, why: why ?? "" });
  }
  return out;
}
