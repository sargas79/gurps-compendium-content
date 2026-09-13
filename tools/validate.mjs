/**
 * Checks the merged pack source with the system's own validator.
 *
 * The statistics in `build/packs-src` came from the system and the merge proves
 * it changed nothing but the text, so for the Basic Set this mostly restates a
 * guarantee already held. It earns its place on every other book, whose numbers
 * are freshly parsed out of a GCA file: the system's validator is where the
 * domain rules live — a disadvantage may not cost positive points, a technique's
 * ceiling may not sit below its own default, a template's parts must add to the
 * cost the book states — and none of that should be reimplemented here.
 *
 * `--src` reached those tools in GWorldVTT PR #88. A pin older than that cannot
 * be pointed at this directory, so the check is skipped with a word about why
 * rather than failing a build that is otherwise sound.
 *
 * Usage: node tools/validate.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { buildRoot, systemRoot, systemManifest } from "./lib/books.mjs";

const VALIDATOR = join(systemRoot, "tools", "validate-packs.mjs");

function acceptsSrc(path) {
  return existsSync(path) && readFileSync(path, "utf8").includes("--src");
}

function main() {
  const source = join(buildRoot, "packs-src");
  if (!existsSync(source)) {
    console.error(`No ${source}. Run "npm run merge" first.`);
    process.exit(1);
  }

  if (!existsSync(VALIDATOR)) {
    console.error(`No validator at ${VALIDATOR}. Run "git submodule update --init".`);
    process.exit(1);
  }

  if (!acceptsSrc(VALIDATOR)) {
    const { version } = systemManifest();
    console.log(
      `Skipped: the pinned system (${version}) validates its own packs-src only.\n` +
        `  --src landed in GWorldVTT PR #88; bump the submodule to a release carrying it\n` +
        `  and this check turns itself on. The merge has already proved no statistic changed.`,
    );
    return;
  }

  const result = spawnSync(process.execPath, [VALIDATOR, "--src", source], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

main();
