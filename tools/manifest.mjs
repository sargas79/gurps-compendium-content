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
 *
 * Usage: node tools/manifest.mjs
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
    system: SYSTEM_ID,
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
    packs,
    packFolders,
  };

  await mkdir(distRoot, { recursive: true });
  await writeFile(join(distRoot, "module.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Wrote dist/module.json — ${MODULE_ID} ${pkg.version}, ` +
      `${packs.length} pack(s) in ${packFolders.length} folder(s), ` +
      `built against ${SYSTEM_ID} ${system.version}.`,
  );
}

await main();
