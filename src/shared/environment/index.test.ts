import { afterEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../module.js";
import { ENVIRONMENT_FLAG, STANDARD_SCENE_ENVIRONMENT, environmentFrom, isVacuum, sceneEnvironment, updateSceneEnvironment } from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the scene's environment, which every book's weapons read", () => {
  it("reads missing or wrong facts as standard air", () => {
    expect(environmentFrom({})).toEqual(STANDARD_SCENE_ENVIRONMENT);
    expect(environmentFrom({ atmospheres: -1, underwater: "yes", waterClarity: "mud", humidity: "fog" })).toEqual(STANDARD_SCENE_ENVIRONMENT);
    expect(environmentFrom({ atmospheres: 0, underwater: true, waterClarity: "murky", humidity: "rain" })).toEqual({ atmospheres: 0, underwater: true, waterClarity: "murky", humidity: "rain" });
  });

  it("counts trace air as vacuum, and water as never vacuum", () => {
    expect(isVacuum(environmentFrom({ atmospheres: 0.01 }))).toBe(true);
    expect(isVacuum(environmentFrom({ atmospheres: 0, underwater: true }))).toBe(false);
  });

  it("keeps a change in the flag Ultra-Tech's beams read, leaving the rest as it was", async () => {
    let stored: any = { atmospheres: 1, underwater: false, waterClarity: "murky", humidity: "rain" };
    const scene = {
      getFlag: (module: string, key: string) => (module === MODULE_ID && key === ENVIRONMENT_FLAG ? stored : undefined),
      setFlag: async (_module: string, key: string, value: any) => { if (key === ENVIRONMENT_FLAG) stored = value; },
    };
    const actor = { prepareData: vi.fn(), sheet: { rendered: false } };
    vi.stubGlobal("game", { scenes: { viewed: scene }, user: { isGM: true }, actors: [actor] });
    expect(await updateSceneEnvironment({ underwater: true })).toBe(true);
    expect(sceneEnvironment()).toEqual({ atmospheres: 1, underwater: true, waterClarity: "murky", humidity: "rain" });
    expect(ENVIRONMENT_FLAG).toBe("beamEnvironment");
    expect(actor.prepareData).toHaveBeenCalled();
  });
});
