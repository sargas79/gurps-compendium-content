/**
 * Writes the GWorld add-on API's type declarations into `types/gworld/`.
 *
 * They are emitted from the pinned system submodule with the system's own
 * `tsconfig.api.json`, so the module type-checks against exactly the API of
 * the system it is built for. The declarations are for the type checker only;
 * nothing under `system/` reaches the module's bundle.
 *
 * Usage: node tools/api-types.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { projectRoot, systemManifest } from "./lib/books.mjs";

const config = join(projectRoot, "system", "tsconfig.api.json");
if (!existsSync(config)) {
  console.error(`No ${config}. The pinned system predates the add-on API; update the submodule to v1.3.0 or later.`);
  process.exit(1);
}

const out = join(projectRoot, "types", "gworld");
rmSync(out, { recursive: true, force: true });
const tsc = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(process.execPath, [tsc, "-p", config, "--outDir", out], { cwd: projectRoot, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Wrote types/gworld from gworld ${systemManifest().version}.`);
