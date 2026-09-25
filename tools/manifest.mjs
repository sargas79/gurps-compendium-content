/**
 * Writes `dist/module.json`.
 *
 * The manifest is generated rather than kept by hand because everything in it
 * is already recorded somewhere else: the version in `package.json`, the packs
 * in each `book.json`, and the system it was built against in the pinned
 * submodule. A manifest maintained alongside those would drift from them.
 *
 * Two things in it are worth knowing about:
 *
 *   - every pack carries `flags.gworld.book`, which is how the system's
 *     "Compendium sources" page groups the module's packs under one switch per
 *     book (GWorldVTT #100).
 *   - `packFolders` groups the same packs in Foundry's own compendium sidebar,
 *     which needs no system change at all.
 *   - `esmodules` loads the books' rules, built by `npm run bundle`, and
 *     `flags.gworld.apiVersion` is the range of the system's add-on API the
 *     script needs, so the GM is warned when the system doesn't provide it.
 *
 * Usage: node tools/manifest.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  MODULE_ID,
  SYSTEM_ID,
  books,
  buildRoot,
  distRoot,
  readJson,
  systemManifest,
} from "./lib/books.mjs";

/** Where this module's source and releases live. */
const REPOSITORY = "sargas79/gurps-compendium-content";

/** The range of the system's add-on API the module's script is built for, read from where the script declares it. */
const API_RANGE = (() => {
  const source = readFileSync(join(import.meta.dirname, "..", "src", "shared", "module.ts"), "utf8");
  const range = /export const API_RANGE = "([^"]+)"/.exec(source)?.[1];
  if (!range) throw new Error("src/shared/module.ts declares no API_RANGE");
  return range;
})();

/** The system data the script migrates, read from where the script declares it. */
const MIGRATES = (() => {
  const source = readFileSync(join(import.meta.dirname, "..", "src", "books", "monster-hunters-1", "migration.ts"), "utf8");
  const list = /export const MIGRATES = \[([^\]]*)\]/.exec(source)?.[1];
  if (!list) throw new Error("src/books/monster-hunters-1/migration.ts declares no MIGRATES");
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
})();

/** The module's script, as `vite build` writes it. */
const SCRIPT = `scripts/${MODULE_ID}.mjs`;

/** What the system gives its own packs, so the module's behave the same way. */
const OWNERSHIP = { PLAYER: "OBSERVER", ASSISTANT: "OWNER" };

async function main() {
  const metaPath = join(buildRoot, "packs.json");
  if (!existsSync(metaPath)) {
    console.error(`No ${metaPath}. Run "npm run merge" first.`);
    process.exit(1);
  }

  const meta = readJson(metaPath);
  const pkg = readJson(join(import.meta.dirname, "..", "package.json"));
  const system = systemManifest();
  const bySlug = new Map(books().map((bk) => [bk.slug, bk]));

  const packs = meta.packs.map((pack) => ({
    name: pack.id,
    label: pack.label,
    path: `packs/${pack.id}`,
    type: pack.type,
    // Only a pack whose documents carry system data belongs to a system. A
    // JournalEntry has none, and declaring one on it fails the manifest's joint
    // validation -- which Foundry reports by quietly refusing to enable the
    // module, with the packs themselves looking perfectly fine.
    ...(pack.type === "Item" || pack.type === "Actor" ? { system: SYSTEM_ID } : {}),
    ownership: OWNERSHIP,
    flags: {
      [SYSTEM_ID]: { book: pack.book, bookTitle: pack.bookTitle },
    },
  }));

  // One folder per book, in the order the books are listed, so the sidebar
  // reads as a shelf rather than a flat list of thirty packs.
  const packFolders = [...bySlug.values()]
    .map((bk) => ({
      name: bk.label,
      sorting: "m",
      packs: meta.packs.filter((pack) => pack.book === bk.slug).map((pack) => pack.id),
    }))
    .filter((folder) => folder.packs.length > 0);

  const manifest = {
    id: MODULE_ID,
    title: "GURPS Compendium Content",
    description:
      "The GURPS books' text, overlaid onto the GWorld system's compendia, " +
      "with other books' statistics alongside. Private: for the use of one table, " +
      "whose members own the books.",
    version: pkg.version,
    authors: [{ name: "Diego Vescovini" }],
    // Written as they would be for a public repository. They do not resolve
    // while this one is private -- Foundry fetches both anonymously, and GitHub
    // answers that with a 404 -- but they are the right URLs the day it is
    // licensed and made public, and until then they document where a release
    // lives. release-config.json overrides both at release time.
    url: `https://github.com/${REPOSITORY}`,
    manifest: `https://github.com/${REPOSITORY}/releases/latest/download/module.json`,
    download: `https://github.com/${REPOSITORY}/releases/download/v${pkg.version}/${MODULE_ID}.zip`,
    compatibility: { minimum: "14", verified: "14.367" },
    relationships: {
      systems: [
        {
          id: SYSTEM_ID,
          type: "system",
          compatibility: { minimum: system.version, verified: system.version },
        },
      ],
    },
    esmodules: [SCRIPT],
    // The module's own socket, over which a player's client asks the GM's to
    // write what only the GM may: an area a round leaves, a dose on a token
    // the player doesn't own (src/shared/relay.ts).
    socket: true,
    // The module's own item types, named `gurps-compendium-content.<type>` in
    // the world: Ritual Path Magic's rituals.
    documentTypes: { Item: { ritual: {} } },
    languages: [{ lang: "en", name: "English", path: "lang/en.json" }],
    // The system's deprecated data this module takes over, so the GM isn't warned about it.
    flags: { [SYSTEM_ID]: { apiVersion: API_RANGE, migrates: MIGRATES } },
    packs,
    packFolders,
  };

  if (!existsSync(join(distRoot, SCRIPT))) {
    console.error(`No dist/${SCRIPT}. Run "npm run bundle" first.`);
    process.exit(1);
  }
  await cp(join(import.meta.dirname, "..", "lang"), join(distRoot, "lang"), { recursive: true });
  await cp(join(import.meta.dirname, "..", "templates"), join(distRoot, "templates"), { recursive: true });

  await mkdir(distRoot, { recursive: true });
  await writeFile(join(distRoot, "module.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Wrote dist/module.json — ${MODULE_ID} ${pkg.version}, ` +
      `${packs.length} pack(s) in ${packFolders.length} folder(s), ` +
      `built against ${SYSTEM_ID} ${system.version}.`,
  );
}

await main();
