/**
 * Links (or copies) the built module into a local Foundry data directory.
 *
 * Configure it by copying `foundry-config.example.json` to `foundry-config.json`
 * and setting `dataPath` to your Foundry Data folder. That file is gitignored so
 * nobody's local path reaches the repository.
 *
 * Usage: node tools/deploy.mjs
 */

import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { MODULE_ID, distRoot, projectRoot } from "./lib/books.mjs";

async function loadConfig() {
  const path = join(projectRoot, "foundry-config.json");
  if (!existsSync(path)) {
    console.error(
      "No foundry-config.json found.\n" +
        "Copy foundry-config.example.json to foundry-config.json and set dataPath to your\n" +
        "Foundry Data directory (the folder containing systems/, worlds/, and modules/).",
    );
    process.exit(1);
  }
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const config = await loadConfig();

  if (!existsSync(distRoot)) {
    console.error('No dist/ directory. Run "npm run build" first.');
    process.exit(1);
  }

  const modules = join(config.dataPath, "modules");
  if (!existsSync(modules)) {
    console.error(`No modules/ directory under ${config.dataPath}. Is dataPath correct?`);
    process.exit(1);
  }

  const target = join(modules, MODULE_ID);

  // Whatever is there now goes, whether a real directory or a stale link.
  if (existsSync(target)) {
    const stats = await lstat(target);
    if (stats.isSymbolicLink()) await rm(target);
    else await rm(target, { recursive: true, force: true });
  }

  if (config.symlink ?? true) {
    // A junction works on Windows without elevated privileges.
    await symlink(distRoot, target, process.platform === "win32" ? "junction" : "dir");
    console.log(`Linked ${target} -> ${distRoot}`);
  } else {
    await mkdir(target, { recursive: true });
    await cp(distRoot, target, { recursive: true });
    console.log(`Copied ${distRoot} -> ${target}`);
  }

  console.log(
    `Enable it in the world under Manage Modules, then choose its packs under\n` +
      `  Configure Settings -> Compendium sources.`,
  );
}

await main();
