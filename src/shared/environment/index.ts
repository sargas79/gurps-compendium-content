/**
 * The air and water of the scene, which several books' weapons are fired
 * through: Ultra-Tech's beams (pp. 113-132) and High-Tech's firearms under
 * water and in space (p. 85). It is one set of facts about the scene, kept in
 * one flag on it, so every book reads the same scene whichever of them sets
 * it; each book brings its own GM tool and its own rules for what the facts
 * do.
 */

import { MODULE_ID } from "../module.js";

export type WaterClarity = "clear" | "average" | "murky";

export interface SceneEnvironment {
  /** Air pressure in atmospheres: 1 at sea level, 0 in vacuum. */
  atmospheres: number;
  underwater: boolean;
  waterClarity: WaterClarity;
  /** Moist air, or rain, drizzle and heavy fog. */
  humidity: "dry" | "humid" | "rain";
}

export const STANDARD_SCENE_ENVIRONMENT: SceneEnvironment = Object.freeze({ atmospheres: 1, underwater: false, waterClarity: "average", humidity: "dry" });

/** The scene flag the environment is kept in: the key Ultra-Tech first kept it under, so worlds keep theirs. */
export const ENVIRONMENT_FLAG = "beamEnvironment";

/** The scene whose air the weapons are fired through: the one being viewed, or the active one. */
export function environmentScene(): any {
  const scenes = (globalThis as any).game?.scenes;
  return scenes?.viewed ?? scenes?.active ?? null;
}

/** An environment from stored data, with anything missing or wrong standard. */
export function environmentFrom(stored: any): SceneEnvironment {
  const atmospheres = Number(stored?.atmospheres);
  return {
    atmospheres: Number.isFinite(atmospheres) && atmospheres >= 0 ? atmospheres : STANDARD_SCENE_ENVIRONMENT.atmospheres,
    underwater: stored?.underwater === true,
    waterClarity: ["clear", "average", "murky"].includes(stored?.waterClarity) ? stored.waterClarity : STANDARD_SCENE_ENVIRONMENT.waterClarity,
    humidity: ["dry", "humid", "rain"].includes(stored?.humidity) ? stored.humidity : STANDARD_SCENE_ENVIRONMENT.humidity,
  };
}

/** The environment of the scene being viewed, or a standard one. */
export function sceneEnvironment(): SceneEnvironment {
  return environmentFrom(environmentScene()?.getFlag?.(MODULE_ID, ENVIRONMENT_FLAG) ?? {});
}

/** Trace air counts as vacuum (Campaigns p. 429). */
export function isVacuum(environment: SceneEnvironment): boolean {
  return !environment.underwater && environment.atmospheres <= 0.01;
}

/**
 * Keeps a change to the scene's environment, leaving the facts it doesn't
 * name as they were, and has every weapon row worked out again for it.
 * Returns false where there is no scene or the user isn't the GM.
 */
export async function updateSceneEnvironment(change: Partial<SceneEnvironment>): Promise<boolean> {
  const scene = environmentScene();
  if (!scene || !(globalThis as any).game?.user?.isGM) return false;
  await scene.setFlag(MODULE_ID, ENVIRONMENT_FLAG, { ...sceneEnvironment(), ...change });
  for (const actor of (globalThis as any).game?.actors ?? []) {
    actor.prepareData();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
  return true;
}
