# GURPS Compendium Content

A Foundry VTT module for the [GWorld](https://github.com/sargas79/GWorldVTT)
GURPS 4e system. It adds the books' text to the system's compendia, and adds
other books' statistics and rules through the system's API.

## Books

- GURPS Basic Set (text only; the system holds its statistics and rules)
- GURPS Magic
- GURPS Martial Arts
- GURPS Monster Hunters 1: Champions
- GURPS Ultra-Tech
- GURPS High-Tech

Each book's rules have their own group under **Configure Settings**, with every
switch off by default. Choose which packs the sheets use under **Compendium
sources**.

## Installing

In Foundry, under **Install Module**, paste the manifest URL:

```
https://github.com/sargas79/gurps-compendium-content/releases/latest/download/module.json
```

Or install by hand:

1. Download `gurps-compendium-content.zip` from the latest release.
2. Unzip it into Foundry's **Data/modules** directory as
   `gurps-compendium-content`.
3. Enable it under **Manage Modules**.

Requires Foundry VTT v14 with GWorld installed.

## Development

Needs Node.js >= 24.13.1 (and Python 3 for releases).

```bash
git clone --recurse-submodules https://github.com/sargas79/gurps-compendium-content.git
```

```bash
npm install
```

```bash
npm run build
```

The build type-checks, tests and lints, then writes the module to `dist/`. To
deploy to a local Foundry, copy `foundry-config.example.json` to
`foundry-config.json`, set `dataPath`, and run `npm run deploy`. A running
Foundry locks the packs; shut the world down before rebuilding.

```
books/<book>/      book.json, text, journals, generated statistics
src/books/<book>/  the book's rules, registered through game.gworld.api
system/            GWorld, a submodule pinned at a release
```

- A book's rules reach the system only through `game.gworld.api`
  ([docs/api.md](https://github.com/sargas79/GWorldVTT/blob/main/docs/api.md)).
  If the API is missing something, open a book-neutral issue on GWorldVTT.
- Don't import, patch or subclass the system's source.
- Text records only fill in `system.description`; the build fails if one sets a
  statistic.

[docs/books.md](docs/books.md) covers text records and adding a book.

## Releasing

```bash
npm run release
```

This builds, writes the zip, and prints the `gh release create` command. Attach
the zip and `dist/module.json`. Set `GCC_BOOKS` (e.g. `GCC_BOOKS=basic-set`) to
include only some books.

## License

GURPS is a trademark of Steve Jackson Games Incorporated. This module is not
affiliated with or endorsed by Steve Jackson Games. It contains text from the
GURPS books for people who own them; don't redistribute it.
