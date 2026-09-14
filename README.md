# GURPS Compendium Content

A private Foundry VTT module for the [GWorld](https://github.com/sargas79/GWorldVTT)
GURPS 4e system. It carries the books' text, and the statistics of books the
system itself does not ship.

## What this is, and why it is separate

GWorld is public, and its compendia deliberately hold names and numbers only: a
skill's attribute and difficulty, a weapon's damage, a trait's point cost. The
books' descriptive text is Steve Jackson Games' to publish, so it cannot live
there.

This module is where it lives instead. It is private, for the use of one table
whose members own the books.

The split runs along one line:

| GWorld, public | This module, private |
| --- | --- |
| The rules, the sheets, the item types | The books' text, for any book |
| The Basic Set's statistics, from the GCA data file | Every other book's statistics, from its own GCA data file |
| Page references | Rules text as journal entries |

A document this module ships is the system's own document with
`system.description` filled in. **It never changes a statistic**, and the build
fails if it tries to. Nothing here is a second copy of the rules.

## Installing

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest
URL:

```
https://github.com/sargas79/gurps-compendium-content/releases/latest/download/module.json
```

The manifest is written as it would be for a public repository, and the module
publishes under exactly this URL. **While the repository is private it does not
resolve:** Foundry fetches a manifest and its download anonymously, and GitHub
answers that with a 404. It is kept here as the module's own documentation, and
so that the day the content is licensed and the repository made public, the
install works with nothing to change.

Until then, install a release by hand:

1. Download `gurps-compendium-content.zip` from the release on GitHub, where you
   are signed in and can read it.
2. Unpack it into your Foundry **Data/modules** directory, as a folder named
   `gurps-compendium-content`.
3. Enable it in the world under **Manage Modules**.

`tools/release.mjs` writes whatever manifest and download URLs
`release-config.json` names into `dist/module.json` at release time, so pointing
the module at a host is a matter of creating that file. It is gitignored, which
keeps the location out of a repository that is otherwise all book text:

```json
{
  "manifest": "https://example.invalid/gcc/module.json",
  "download": "https://example.invalid/gcc/{version}/gurps-compendium-content.zip"
}
```

`{version}` is replaced with the release's version, so a per-version path needs
no editing each time. Whatever host you choose must serve both files to an
anonymous request, and must not be public: the zip contains the books' text.

## Requirements

- Foundry VTT v14 (verified against 14.367) with the GWorld system installed
- Node.js >= 24.13.1
- Python 3, for the release step only
- Your own copies of the GURPS books

## Getting started

```bash
git clone --recurse-submodules https://github.com/sargas79/gurps-compendium-content.git
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init
```

```bash
npm install
```

```bash
npm run build
```

The build writes `dist/`, which is the module Foundry loads. To put it into a
local Foundry install, copy `foundry-config.example.json` to
`foundry-config.json`, point `dataPath` at your Foundry **Data** directory, then:

```bash
npm run deploy
```

Enable the module in the world under **Manage Modules**, then choose which of its
packs the sheets draw from under **Configure Settings → Compendium sources**,
where they appear together under the book's name.

A running Foundry holds the compiled packs open, so a rebuild under it fails with
`EBUSY`. Either shut the world down first, or build somewhere else:

```bash
node tools/pack.mjs --out /tmp/packs
```

## How it is put together

```
books/<book>/
  book.json          what the book is called, its page prefix, where its numbers come from
  prose/<pack>.json  the book's text, keyed to each entry's id
  journals/          its rules text, one Markdown file per rule
  packs-src/         its statistics, generated (absent for the Basic Set)
system/              the GWorld system, a submodule pinned at a release
```

The build is four steps, and `npm run build` runs them in order:

1. **merge** — joins each book's statistics to its text into `build/packs-src/`,
   and refuses an orphaned record, a renamed entry, or any attempt to set a
   statistic.
2. **validate** — runs the system's own pack validator over the result. The
   domain rules live there, not here.
3. **pack** — compiles the LevelDB packs into `dist/packs/`.
4. **manifest** — writes `dist/module.json` from the books and the pinned system.

Packs are named `<book>-<type>`: `basic-set-advantages`, `magic-spells`. Each
carries a `gworld.book` flag, which is how the system groups them under one
switch per book, and Foundry's own compendium sidebar shows them in a folder per
book.

### Writing text

`npm run coverage` is the worklist. It reports, per book and per pack, how many
entries have text and what state it is in.

```bash
npm run coverage -- basic-set --pack advantages --list
```

A record looks like this, and may carry nothing else. `_id` and `name` must match
the entry in the system exactly; the build checks both.

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

`status` is one of these:

| Status | Means |
| --- | --- |
| `draft` | Started, not finished |
| `transcribed` | Captured from the book and passed every automatic check, but not yet read |
| `reviewed` | Read and judged coherent and complete — see below |
| `needs-review` | Something is wrong with it, and the note says what |
| `no-entry` | The book was consulted and prints nothing under this name |

**What "reviewed" means here.** A person read the entry and judged it coherent
and complete: it starts where the entry starts, stops where it stops, and is
about its own subject. It does **not** mean the entry was collated word by word
against the printed page. That distinction matters, because a transcription can
read perfectly and still have dropped a clause, and nothing in this repository
claims otherwise.

Reading finds what no automatic check can — a tail that runs into the next
section, a variant that picked up another family's note, a description that is
only its trailing remark. Those decisions are kept in `books/<book>/review.json`
with the reason for each, so re-running the transcription tool does not quietly
undo them.

**Capturing again from the page's layout.** `tools/transcribe.mjs` reads the
Basic Set as one stream of lines, which interleaves two columns and a sidebar
wherever a page has them. `tools/recapture.mjs` takes each entry instead from the
layout the rules journal is built from (`lib/book-structure.mjs`), which reads a
column at a time and keeps sidebars and tables apart from the text. It writes
nothing to the prose files: it reports every capture beside the text already
held, least alike first, for a reader to apply after reading.

```bash
node tools/recapture.mjs skills --characters <pdf> --campaigns <pdf>
```

`no-entry` is for names the book never uses. Most come from the GCA data file,
which writes buying an attribute as "Extra ST" and a row of the barding table as
"Horse Mail Face Mask". They are left out of the coverage count, because they can
never have text.

```bash
npm run coverage -- basic-set --status needs-review
```

### Adding a book

1. `books/<slug>/book.json` with its title, its page prefix, and the name of its
   GCA data file.
2. `npm run extract -- <slug>` to see what the parsers make of it, then again
   with `--write`.
3. Read `books/<slug>/overlap.txt`. Records citing a Basic Set page are the
   system's already and were left out; where the book *revises* one rather than
   reprinting it, add the revision by hand.
4. Write its text under `books/<slug>/prose/`, and its rules under
   `books/<slug>/journals/`. `tools/transcribe.mjs` drafts the text from the
   PDF. Tell it how to read the book in `book.json`:

   ```json
   "transcription": {
     "pdfOffset": 0,
     "pageLabel": "MH1:",
     "namePrefix": "^(?:BIO|MYS|ESP|PK|TEL|TPN):\\s+"
   }
   ```

   `pdfOffset` is what to add to a book page to get the PDF page. `pageLabel`
   is how a page is recorded in a text record. `namePrefix` matches the part of
   a data-file name the book does not print. A book whose entries it cannot find
   gets `no-entry` records, so read the dry run's counts before trusting them.

Set `GURPS_GDF_DIR` if your GCA files are not in `E:/data files`.

## Releasing

Versions are this module's own and start at v0.0.1. They do not track the
system's; the system release a build was made against is recorded in the
manifest's `relationships.systems`.

**Releases stay at 0.0.x until the Basic Set is done** — v0.0.1, v0.0.2, and so
on — and **v0.1.0 is reserved for that milestone**. It means every Basic Set
pack carries its text and the rules journal is complete, not merely that the
tooling works.

```bash
npm run release
```

That builds, writes the zip, and prints the tag and `gh release create` command.
Attach both the zip and a loose `dist/module.json` to the release: the manifest
URL points at the loose one.

To build only some books, name them in `GCC_BOOKS`. v0.1.0 is the Basic Set
alone, although Monster Hunters 1 was already in the repository when it was
cut; to make it again from its tag:

```bash
GCC_BOOKS=basic-set npm run release
```

See **Installing** above for the two ways a release reaches a Foundry install,
and for the `release-config.json` that decides whether the manifest URL is one
of them.

## Licensing note

GURPS is a trademark of Steve Jackson Games Incorporated. This repository is not
affiliated with or endorsed by Steve Jackson Games.

It contains text transcribed from GURPS books for the private use of people who
own them. **It must not be made public or redistributed.** The repository is
private, and stays private.
