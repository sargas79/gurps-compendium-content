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
