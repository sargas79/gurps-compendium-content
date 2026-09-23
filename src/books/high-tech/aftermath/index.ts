/**
 * After the firefight (p. 87), registered with the system through the add-on
 * API under the firefightAftermath switch: a GM tool that, once the shooting
 * stops, puts everyone who was there -- the selected tokens, or the
 * combatants of the fight -- under a timed condition: -4 to Hearing (-5 if
 * the shooting was indoors) and at night -2 to Vision, for (20 - HT) minutes
 * and the seconds their HT rolls take to shake it off. Protected Hearing and
 * Protected Vision, the trait or the gear that grants it, keep each off.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { aftermathFor, type Aftermath } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Aftermath.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Aftermath.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const CONDITION = "ht-firefight-aftermath";

/** The people the GM means: the selected tokens' actors, else the combatants of the fight being viewed. */
function present(): any[] {
  const selected = ((globalThis as any).canvas?.tokens?.controlled ?? []).map((t: any) => t.actor).filter(Boolean);
  const actors = selected.length ? selected : [...((game as any).combat?.combatants ?? [])].map((c: any) => c.actor).filter(Boolean);
  return [...new Set(actors)];
}

const roll3d6 = (): number => [0, 0, 0].reduce((sum) => sum + Math.floor(CONFIG.Dice.randomUniform() * 6) + 1, 0);

/** Applies one person's impairment, returning what was applied or null for none. */
export async function applyAftermath(api: GWorldApi, actor: any, where: { indoors: boolean; night: boolean }, roll3d: () => number = roll3d6): Promise<Aftermath | null> {
  const senses = api.actors.derived(actor)?.traitEffects?.protectedSense ?? {};
  const result = aftermathFor({
    ht: Number(api.actors.attribute(actor, "HT")) || 10,
    indoors: where.indoors,
    night: where.night,
    protectedHearing: senses.hearing === true,
    protectedVision: senses.vision === true,
  }, roll3d);
  if (!result) return null;
  const modifiers = [
    ...(result.hearing ? [{ label: L("HearingLine"), value: result.hearing, rolls: ["hearing"] }] : []),
    ...(result.vision ? [{ label: L("VisionLine"), value: result.vision, rolls: ["vision"] }] : []),
  ];
  await api.actors.applyCondition(actor, {
    module: MODULE_ID,
    key: CONDITION,
    label: L("Condition"),
    effects: { modifiers },
    duration: { seconds: result.seconds },
  } as any);
  return result;
}

async function afterTheFirefight(api: GWorldApi): Promise<void> {
  if (!game.user?.isGM) return;
  const actors = present();
  if (!actors.length) return void ui.notifications?.warn(L("NoOne"));
  const where: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld"><p class="ihint">${esc(F("Hint", { names: actors.map((a) => a.name).join(", ") }))}</p>
      <div class="ichecks">
        <label class="icheck"><input type="checkbox" name="indoors"> ${esc(L("Indoors"))}</label>
        <label class="icheck"><input type="checkbox" name="night"> ${esc(L("Night"))}</label>
      </div></div>`,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const checked = (name: string) => Boolean(form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked);
        return { indoors: checked("indoors"), night: checked("night") };
      },
    },
    rejectClose: false,
  });
  if (!where) return;
  const lines: string[] = [];
  for (const actor of actors) {
    const result = await applyAftermath(api, actor, where);
    lines.push(result
      ? F("Line", { name: actor.name, hearing: result.hearing, vision: result.vision, minutes: Math.floor(result.seconds / 60), seconds: result.seconds % 60 })
      : F("Spared", { name: actor.name }));
  }
  await ChatMessage.implementation.create({
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Title"))}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

export function readyAftermath(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-firefight-aftermath",
    label: L("Title"),
    icon: "fa-solid fa-ear-deaf",
    visible: on,
    open: () => afterTheFirefight(api),
  } as any);
}
