/**
 * Packages the built module for release.
 *
 * Two things here are not obvious.
 *
 * The zip is written by `tools/zip.py`, because an archive whose entry names
 * carry backslashes installs in Foundry and then behaves as though it were empty.
 * Windows' own archiver writes them; Python's zipfile does not.
 *
 * The manifest's `manifest` and `download` URLs come from `release-config.json`,
 * which is gitignored. Foundry fetches both without credentials, so they cannot
 * point at a private GitHub release; they have to point somewhere the owner
 * controls that serves two files to an anonymous request. Keeping them out of the
 * repository means the location is not published along with everything else.
 * Without that file the release is still made, and installs by hand.
 *
 * Usage: node tools/release.mjs
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { MODULE_ID, distRoot, projectRoot, readJson } from "./lib/books.mjs";

const ARCHIVE = join(projectRoot, `${MODULE_ID}.zip`);

/**
 * The URLs a release is published to, if this machine knows them.
 *
 * {
 *   "manifest": "https://example.invalid/gcc/module.json",
 *   "download": "https://example.invalid/gcc/{version}/gurps-compendium-content.zip"
 * }
 *
 * `{version}` is replaced, so a per-version path does not need editing each time.
 */
async function releaseConfig(version) {
  const path = join(projectRoot, "release-config.json");
  if (!existsSync(path)) return null;
  const raw = JSON.parse(await readFile(path, "utf8"));
  const fill = (value) => (value ? String(value).replaceAll("{version}", version) : null);
  return { manifest: fill(raw.manifest), download: fill(raw.download) };
}

async function main() {
  const manifestPath = join(distRoot, "module.json");
  if (!existsSync(manifestPath)) {
    console.error('No dist/module.json. Run "npm run build" first.');
    process.exit(1);
  }

  const manifest = readJson(manifestPath);
  const urls = await releaseConfig(manifest.version);

  if (urls?.manifest && urls?.download) {
    manifest.manifest = urls.manifest;
    manifest.download = urls.download;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`Manifest URL: ${urls.manifest}`);
    console.log(`Download URL: ${urls.download}`);
  } else {
    console.log(
      "No release-config.json: the manifest carries no manifest/download URL, so this\n" +
        "  build installs by hand only. See the README, and the repository's issue about\n" +
        "  where the manifest is served.",
    );
  }

  const python = process.platform === "win32" ? "python" : "python3";
  const zip = spawnSync(python, [join(projectRoot, "tools", "zip.py"), distRoot, ARCHIVE], {
    stdio: "inherit",
  });
  if (zip.status !== 0) {
    console.error(
      `Zipping failed. ${python} is needed for this step; the alternative writes entry ` +
        `names Foundry cannot read.`,
    );
    process.exit(zip.status ?? 1);
  }

  const system = manifest.relationships?.systems?.[0];
  console.log(
    `\n${MODULE_ID} ${manifest.version}, for ${system?.id} ${system?.compatibility?.verified}.\n` +
      `Next:\n` +
      `  git tag v${manifest.version} && git push origin v${manifest.version}\n` +
      `  gh release create v${manifest.version} ${MODULE_ID}.zip dist/module.json \\\n` +
      `    --repo sargas79/gurps-compendium-content --title "v${manifest.version}"\n` +
      (urls ? `  then upload both files to the release location above.\n` : ""),
  );
}

await main();
