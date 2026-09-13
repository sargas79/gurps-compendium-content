/**
 * Compiles `build/packs-src/` into the LevelDB packs Foundry loads.
 *
 * This mirrors the system's own `tools/build-packs.mjs` and differs from it in
 * one way that matters: it keeps each document's `flags`. The system drops them,
 * having none to keep, but the review status of a piece of text and the book it
 * came from ride in `flags.gurps-compendium-content`, and a pack built without
 * them would lose the only record of which text has been checked.
 *
 * Usage: node tools/pack.mjs [--src <dir>] [--out <dir>]
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

import { buildRoot, distRoot, readJson } from "./lib/books.mjs";

function flag(name, fallback) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : fallback;
}

const SOURCE = flag("--src", join(buildRoot, "packs-src"));
const OUT = flag("--out", join(distRoot, "packs"));

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`No ${SOURCE}. Run "npm run merge" first.`);
    process.exit(1);
  }

  const meta = readJson(join(buildRoot, "packs.json"));
  const types = new Map(meta.packs.map((pack) => [pack.id, pack.type]));

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // Two source directories: the system's validator is pointed at packs-src, so
  // journal packs are kept beside it rather than in it. Both compile the same.
  const roots = [SOURCE, join(buildRoot, "journals-src")].filter((dir) => existsSync(dir));
  const found = [];
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory()) found.push([entry.name, join(root, entry.name)]);
    }
  }
  found.sort(([a], [b]) => a.localeCompare(b));
  const names = found.map(([name]) => name);

  for (const [name, dir] of found) {
    const documents = [];
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8"));
      for (const entry of Array.isArray(raw) ? raw : [raw]) documents.push(entry);
    }

    // compilePack reads one document per file, so the arrays that make the
    // source reviewable are exploded into a staging directory first.
    const staging = join(OUT, `.staging-${name}`);
    await mkdir(staging, { recursive: true });
    for (const document of documents) {
      await writeFile(
        join(staging, `${document._id}.json`),
        JSON.stringify(document, null, 2),
        "utf8",
      );
    }

    const target = join(OUT, name);
    await compilePack(staging, target, { yaml: false, recursive: false, log: false });
    await rm(staging, { recursive: true, force: true });

    // compilePack skips a document with no _key without saying so, which makes
    // an empty pack look like a successful build. Read it back and count.
    const check = join(OUT, `.check-${name}`);
    await extractPack(target, check, { yaml: false, log: false });
    const written = (await readdir(check)).length;
    await rm(check, { recursive: true, force: true });

    if (written !== documents.length) {
      throw new Error(
        `${name}: compiled ${written} documents but expected ${documents.length}. ` +
          `Every document needs a _key: !items!<id>, !actors!<id> or !journal!<id>.`,
      );
    }

    console.log(`  ${name.padEnd(28)} ${documents.length} ${types.get(name) ?? "Item"} documents`);
  }

  console.log(`Built ${names.length} pack(s) into ${OUT}`);
}

await main();
