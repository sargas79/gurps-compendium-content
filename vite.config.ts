import { resolve, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

const root = import.meta.dirname;

/**
 * Fails the build if anything under `system/` ends up in the bundle.
 *
 * The module reaches the GWorld system through `game.gworld.api` and its hooks
 * alone. The pinned submodule is there for its API's type declarations, its
 * pack validator and, in tests only, its pure rules; a runtime import of its
 * source would be a second copy of the system running inside the module.
 */
export function noSystemSource(): Plugin {
  return {
    name: "gcc-no-system-source",
    apply: "build",
    load(id) {
      const path = relative(root, id.split("?")[0]!);
      if (path === "system" || path.startsWith(`system${sep}`) || path.startsWith("system/")) {
        this.error(`${path} is part of the GWorld system. Reach the system through game.gworld.api, not its source.`);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [noSystemSource()],
  esbuild: { keepNames: true },
  build: {
    outDir: "dist/scripts",
    emptyOutDir: true,
    sourcemap: true,
    // Foundry loads the module's script as one ES module.
    lib: {
      entry: resolve(root, "src/index.ts"),
      formats: ["es"],
      fileName: () => "gurps-compendium-content.mjs",
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
