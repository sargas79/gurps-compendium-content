# Working on a book

## Text records

`npm run coverage` shows how much text each pack has, and its status:

```bash
npm run coverage -- basic-set --pack advantages --list
```

A record may have only these fields. `_id` and `name` must match the system's
entry.

```json
{
  "_id": "4f01fcff86293bec",
  "name": "Ambidexterity",
  "pages": "B39",
  "status": "reviewed",
  "notes": "",
  "description": "<p>…the book's text…</p>"
}
```

| Status | Meaning |
| --- | --- |
| `draft` | Started, not finished |
| `transcribed` | Captured and passes the automatic checks, not yet read |
| `reviewed` | Read by a person and judged complete; not compared word by word with the book |
| `needs-review` | Has a problem, described in `notes` |
| `no-entry` | The book has no entry under this name (excluded from coverage) |

Review decisions are recorded with reasons in `books/<book>/review.json`, so
re-running the transcription tool doesn't undo them.

`tools/transcribe.mjs` drafts text from a PDF read as a single stream.
`tools/recapture.mjs` reads a column at a time, keeping sidebars and tables
separate, and reports its captures next to the current text without writing
anything:

```bash
node tools/recapture.mjs skills --characters <pdf> --campaigns <pdf>
```

### The Basic Set, Fourth Edition Revised

The Revised edition is one PDF, printed page *p* on PDF page *p* + 10, set in
two columns with its own type. `--revised <pdf>` reads it with a second
heading profile (`tools/lib/revised.mjs`) in place of the two 2004 volumes; the
book's citations are unchanged, because every heading kept its page.

```bash
node tools/recapture.mjs skills --revised <pdf>        # report: build/recapture/revised-skills.*
node tools/recapture.mjs --addenda --revised <pdf>     # the four addenda as sections
node tools/transcribe.mjs basic-set skills --revised <pdf> [--pages A-B] [--write]
```

`transcribe.mjs` reads the PDF with `pdftotext -raw -enc UTF-8`, which keeps
the columns apart and the minus signs (the default output interleaves the
columns, and Latin-1 drops the minus signs). `--addenda` writes every heading
of pp. 324-334, 337-342, 566 and 570-578 with the text under it to
`build/recapture/revised-addenda.json` and `.txt`, since an addendum has no
pack entry to look for. Set `GURPS_REVISED_PDF` to run the profile's tests
against the real pages.

The rules journal (`books/basic-set/journals`) is regenerated from the Revised
text the same way:

```bash
node tools/rules.mjs --revised <pdf> [--register <optional-rules.ts>] [--write]
```

Every retained page keeps its id, so a page a hand-made link points at still
opens. The register is the pinned system's; `--register` reads another
release's `src/system/optional-rules.ts` for the switches a later release has
added (the Revised addenda's switches arrived after the pin). Beyond the
retained pages the tool builds:

- the four addenda, one page to a section (`ADDENDA_RULES` in `tools/rules.mjs`
  names the switch each defining section carries in its `rule` flag; a switch
  gets the flag on one page only, because the Rules settings page links the
  first entry it finds for a switch);
- pages for boxes the 2004 headings never had (`REVISED_NEW_PAGES`, and
  `ADDENDA_HAND` for the addenda's).

The reader cannot give every box, table or margin note in the Revised layout,
so `tools/lib/revised-fixes.mjs` corrects them by page id (a fix whose words
are not found fails the run, so a stale one is noticed), and a page it cannot
correct is written by hand in `journals-by-hand` from `pdftotext -raw`. The
run writes what the reader gives for each hand page to
`build/recapture/revised-by-hand/`, to read the hand page against.

## Adding a book

1. Create `books/<slug>/book.json` with the title, page prefix and GCA data
   file name. Set `GURPS_GDF_DIR` if your GCA files aren't in `E:/data files`.
2. Run `npm run extract -- <slug>` to preview, then again with `--write`.
3. Check `books/<slug>/overlap.txt`. Records citing a Basic Set page are
   skipped; if the book revises one, add the revision by hand.

   Fix data-file errors in `book.json`. Each rule has a pack, a name pattern
   and a reason, and is applied on every extract:

   ```json
   "exclude": [
     { "pack": "equipment", "pattern": "Powerstone", "reason": "one record per capacity" }
   ],
   "patch": [
     { "pack": "spells", "pattern": "^Flame Jet$", "set": { "system.attack": { "damage": "" } }, "reason": "…" }
   ]
   ```

   A record that must be written by hand goes in
   `packs-src/<pack>/<slug>-by-hand.json`, with an `exclude` for the parser's
   copy.
4. Add text under `books/<slug>/prose/` and rules text under
   `books/<slug>/journals/`. To draft text with `tools/transcribe.mjs`, add
   this to `book.json`:

   ```json
   "transcription": {
     "pdfOffset": 0,
     "pageLabel": "MH1:",
     "namePrefix": "^(?:BIO|MYS|ESP|PK|TEL|TPN):\\s+"
   }
   ```

   `pdfOffset` is added to a book page to get the PDF page, `pageLabel` is the
   page format in text records, and `namePrefix` matches the part of a
   data-file name the book doesn't print. Entries it can't find get `no-entry`
   records, so check the dry run's counts.

   Two more keys help a book whose names differ from its data file's:

   ```json
   "aliases": { "Sleve Display": "Sleeve Display" },
   "families": [
     { "pattern": "X-Ray ", "replace": "", "heading": "X-Ray Lasers" },
     { "pattern": "^Heavy Mind Disruptor$", "heading": "Mind Disruptors", "headingOnly": true }
   ]
   ```

   An alias names what the book prints. A family rule is for a weapon described
   once for a whole family: its text is the family heading's opening followed by
   the text of the model the pattern and replacement name ("Heavy X-Ray Laser
   Pistol" takes "Heavy Laser Pistol"'s), or the opening alone with `headingOnly`.
   A rule with no `heading` takes the model's text alone, and the model may be a
   label the book prints rather than a record ("Reflex (TL9):" for the Reflex
   Vest). Family rules are tried before the record's own name, since a
   cybernetic's own heading holds only its statistics.

   A captured record that a `capture.set` rule renamed ("^Windmills$" to
   "Windmill") is looked for under the rule's pattern, the label the book
   prints, with no alias needed.

   A book that sets its gear beside sidebars reads better from its layout than
   from pdftotext's stream, which interleaves the two. `"layout": true` reads
   each page a column at a time with `lib/book-structure.mjs` (with
   `"asidesAsText": true` for a book whose text sits in tinted boxes), and
   `--pages 5-61` drafts only the entries citing those pages, keeping every
   other entry's text as it is:

   ```bash
   node tools/transcribe.mjs high-tech equipment --pdf <pdf> --pages 5-61 --write
   ```

   `tools/capture-gear.mjs` drafts equipment records from gadget entries that no
   data file holds, reading each closing line ("$1,200, 1 lb., B/10 hr. LC4.")
   in both text orders. `capture.skip` and `capture.set` in `book.json` hold
   what reading the page settled, each with its reason. A book printing its
   gear differently from Ultra-Tech says so in `capture` too: `labelEnd` (what
   ends a label, ":" by default), `cellSizes` (its cell or battery sizes),
   `runInHeadings` and `repeatsByTl` (see `tools/lib/capture.mjs`).
