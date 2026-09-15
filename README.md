# GURPS Compendium Content

A private Foundry VTT module for the [GWorld](https://github.com/sargas79/GWorldVTT)
GURPS 4e system. It adds the books' text to the system's compendia, and adds
other books' statistics and rules.

## Why it is separate

GWorld is public, so its compendia hold only names and statistics. The books'
text belongs to Steve Jackson Games and can't be published there. This module
holds that text for a table whose members own the books, and must stay private.

| GWorld (public) | This module (private) |
| --- | --- |
| Basic Set rules, sheets and item types | The books' text, for every book |
| Basic Set statistics, from its GCA data file | Other books' statistics, from their GCA data files |
| The add-on API | Other books' rules, registered through the API |
| Page references | Rules text as journal entries |

- **Nothing from another book goes into the system.** A book's rules live in
  `src/books/<book>/` and reach the system only through `game.gworld.api`. If
  the API is missing something, open a book-neutral issue on GWorldVTT instead
  of working around it here.
- **Text never changes statistics.** A text record only fills in
  `system.description`. The build fails if one tries to set a statistic.

## Installing

The manifest URL is
`https://github.com/sargas79/gurps-compendium-content/releases/latest/download/module.json`,
but it doesn't work while the repository is private: Foundry downloads
anonymously and GitHub returns 404. Install by hand instead:

1. Download `gurps-compendium-content.zip` from the GitHub release.
2. Unzip it into Foundry's **Data/modules** directory as
   `gurps-compendium-content`.
3. Enable it under **Manage Modules**.

To serve releases from another host, create `release-config.json` (it is
gitignored). `tools/release.mjs` writes these URLs into the manifest, replacing
`{version}` with the release version:

```json
{
  "manifest": "https://example.invalid/gcc/module.json",
  "download": "https://example.invalid/gcc/{version}/gurps-compendium-content.zip"
}
```

The host must serve both files without authentication but must not be public,
because the zip contains the books' text.

## Requirements

- Foundry VTT v14 (tested on 14.367) with GWorld installed
- Node.js >= 24.13.1
- Python 3, for releases only
- Your own copies of the GURPS books

## Development

```bash
git clone --recurse-submodules https://github.com/sargas79/gurps-compendium-content.git
```

If you cloned without `--recurse-submodules`:

```bash
git submodule update --init
```

```bash
npm install
```

```bash
npm run build
```

The build writes the module to `dist/`. To deploy it to a local Foundry, copy
`foundry-config.example.json` to `foundry-config.json`, set `dataPath` to your
Foundry **Data** directory, and run:

```bash
npm run deploy
```

In the world, choose which packs the sheets use under **Configure Settings →
Compendium sources**.

A running Foundry locks the packs, so rebuilding fails with `EBUSY`. Shut the
world down, or build the packs elsewhere:

```bash
node tools/pack.mjs --out /tmp/packs
```

## Layout

```
books/<book>/
  book.json          title, page prefix, GCA data file
  prose/<pack>.json  the book's text, keyed by entry id
  journals/          rules text, one Markdown file per rule
  packs-src/         statistics, generated (not for the Basic Set)
src/
  index.ts           registers every book's rules
  books/<book>/      one book's rules
  shared/            module id, API types
lang/en.json         the module's strings, under GCC.
system/              GWorld, a submodule pinned at a release
types/gworld/        the system's API declarations, generated from system/
```

`npm run build` runs these steps:

1. **check:** generate the API declarations, type-check, test and lint.
2. **bundle:** build `src/index.ts` into `dist/scripts/`.
3. **merge:** join each book's statistics and text into `build/packs-src/`.
   Fails on orphaned records, renamed entries, or text records that set
   statistics.
4. **validate:** run the system's pack validator.
5. **pack:** compile the LevelDB packs into `dist/packs/`.
6. **manifest:** write `dist/module.json`.

Packs are named `<book>-<type>` (`basic-set-advantages`, `magic-spells`). A
`gworld.book` flag groups each book's packs under one switch in the system.

### Rules code

Each book exports a `BookRules` from `src/books/<book>/index.ts`, listed in
`src/books/index.ts`. Each book gets its own rules group, "GURPS <Book>", with
every switch off by default. The system's
[docs/api.md](https://github.com/sargas79/GWorldVTT/blob/main/docs/api.md)
documents the API.

- Don't import the system's source. ESLint and the bundle both fail on it.
- Tests may import `system/src/rules`.
- Don't patch or subclass the system's classes, sheets or data models.
- Write only to the module's own Item types,
  `system.extensions.gurps-compendium-content`, its own flags and settings,
  and switches in its own groups.

### Books

[docs/books.md](docs/books.md) covers text records, review statuses,
transcription, and adding a book.

## Releasing

Versions are the module's own. The system release a build was made against is
recorded in the manifest's `relationships.systems`.

```bash
npm run release
```

This builds, writes the zip, and prints the tag and the `gh release create`
command. Attach the zip and `dist/module.json` to the release.

To include only some books, list them in `GCC_BOOKS`. For example, to rebuild
v0.1.0 (Basic Set only) from its tag:

```bash
GCC_BOOKS=basic-set npm run release
```

## License

GURPS is a trademark of Steve Jackson Games Incorporated. This repository is
not affiliated with or endorsed by Steve Jackson Games.

It contains text from GURPS books for the private use of people who own them.
**Don't make it public or redistribute it.**
