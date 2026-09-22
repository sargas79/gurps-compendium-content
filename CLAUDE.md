# GURPS Compendium Content

A private Foundry VTT module for the GWorld GURPS system (sargas79/GWorldVTT). It carries other GURPS books into the system: their text and statistics in packs, and their rules in `src/`, registered through the system's add-on API.

## What goes where

- The GWorld system is the GURPS Basic Set, plus generic capabilities and the add-on API (`game.gworld.api`). Nothing from another book goes into it: its lint fails on another book's page or this module's id.
- Every other book lives here. Its prose and journals are under `books/<book>/`, and its rules under `src/books/<book>/`, with one rules group per book ("GURPS <Book>"), every switch off by default.
- A rule two books print (Ultra-Tech's gadgets and cells, which High-Tech prints at lower TLs) is one engine under `src/shared/<engine>/` with a table per book (`src/shared/book-tables.ts`). Each book registers its table and its own switches; an item takes its own book's table and needs only that book's switch. Nothing under `src/shared/` imports from `src/books/`: ESLint fails on one.
- When a book needs something the API doesn't offer, file a book-neutral GWorldVTT issue and wait for it. Never work around it here.

## Separation rules

- The script reaches the system only through `game.gworld.api` and its hooks. No runtime imports from `system/`: ESLint and the bundle both fail on one.
- Tests may import `system/src/rules`, and nothing else of the system's source.
- No patching or subclassing of the system's classes, sheets or data models.
- Write only to the module's own Item types, `system.extensions.gurps-compendium-content`, its own flags and settings, and switches in its own groups.

## Build

- `npm run build` generates the API declarations from the pinned submodule, type-checks, tests, lints, bundles the script, then merges, validates, packs and writes the manifest.
- The submodule `system/` is pinned at a system release. The manifest's system compatibility comes from that release, and `flags.gworld.apiVersion` from `src/shared/module.ts`.
