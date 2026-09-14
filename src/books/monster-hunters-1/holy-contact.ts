/**
 * Holy attacks at the table (Monster Hunters 1 p. 51).
 *
 * Two ways in. A holy weapon's blow, applied from its damage card, touches
 * everyone it was applied to; and holy gear with no damage of its own -- a
 * splash of holy water, a brandished symbol -- touches whoever is targeted from
 * its row on the gear tab. Either way each creature is checked on its own:
 * burned for 1d ignoring DR if a Weakness makes it vulnerable, not if its last
 * burn is still fizzing, and not at all otherwise.
 */

import { MODULE_ID, type GWorldApi } from "../../shared/module.js";
import { FIZZ_FLAG, holyContact, isHoly, vulnerableToHoly, weaknessesOf } from "./holy.js";

const L = (key: string) => game.i18n.localize(`GCC.MH1.Holy.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MH1.Holy.${key}`, data);

/** The chat card a contact posts, as the system registered it. */
let cardId: string | null = null;

/**
 * One holy contact with one creature. Returns whether it did anything worth a
 * card: nothing is said about a creature holy things do not touch, since that
 * is almost everyone a holy weapon hits.
 */
export async function touchWithHoly(api: GWorldApi, actor: any, source: string, on: () => boolean): Promise<boolean> {
  if (!on() || !actor) return false;
  const now = Number(game.time?.worldTime ?? 0) || 0;
  const outcome = holyContact({
    vulnerable: vulnerableToHoly(weaknessesOf(actor, api.rules.weaknessOf)),
    fizzingUntil: Number(actor.getFlag?.(MODULE_ID, FIZZ_FLAG)) || 0,
    now,
  });
  if (!outcome.burns && !outcome.fizzing) return false;
  if (!actor.isOwner) {
    ui.notifications?.warn(F("CannotApply", { name: String(actor.name ?? "") }));
    return false;
  }

  let text: string;
  if (outcome.burns) {
    const roll = new Roll("1d6");
    await roll.evaluate();
    const taken = await api.actors.applyInjury(actor, { amount: roll.total, label: L("Title") });
    if (!taken) return false;
    await actor.setFlag(MODULE_ID, FIZZ_FLAG, outcome.fizzingUntil);
    text = F("Burns", { name: String(actor.name ?? ""), source, injury: roll.total, from: taken.from, to: taken.to });
  } else {
    const seconds = Math.max(0, Math.ceil(outcome.fizzingUntil - now));
    text = F("Fizzing", { name: String(actor.name ?? ""), source, seconds });
  }

  if (cardId) {
    await api.chat.post(cardId, { title: L("Title"), text, rule: L("Rule"), burns: outcome.burns }, { actor });
  }
  return true;
}

/** Holy contact with whoever is targeted, from a holy item's row. */
async function contactTargets(api: GWorldApi, item: any, on: () => boolean): Promise<void> {
  const targets = [...(game.user?.targets ?? [])];
  if (targets.length === 0) {
    ui.notifications?.warn(L("NoTarget"));
    return;
  }
  const seen = new Set<string>();
  let touched = 0;
  for (const token of targets) {
    const victim = (token as any)?.actor;
    const key = String(victim?.uuid ?? "");
    if (!victim || seen.has(key)) continue;
    seen.add(key);
    if (await touchWithHoly(api, victim, String(item?.name ?? ""), on)) touched++;
  }
  if (touched === 0) ui.notifications?.info(L("NoEffect"));
}

/** Where holy items are marked: a field of this module's on equipment. */
export function initHoly(api: GWorldApi): void {
  const f = foundry.data.fields as any;
  api.data.registerDataExtension({
    module: MODULE_ID,
    documentName: "Item",
    types: ["equipment"],
    schema: {
      holy: new f.BooleanField({ required: true, initial: false }),
    },
  });
}

/** The switch-dependent parts: the item sheet's mark, the row action, the blow's burn, the card. */
export function readyHoly(api: GWorldApi, on: () => boolean): void {
  cardId = api.chat.registerChatCard({
    module: MODULE_ID,
    key: "mh1-holy",
    template: `modules/${MODULE_ID}/templates/mh1-holy.hbs`,
  });

  // A holy thing is only worth marking where the rule is in play.
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-holy-item",
    sheet: "item",
    position: "end",
    template: `modules/${MODULE_ID}/templates/mh1-holy-item.hbs`,
    visible: (item) => on() && item?.type === "equipment",
    context: (item) => ({ holy: isHoly(item), label: L("Holy"), hint: L("ContactHint") }),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>("[data-gcc-holy]")?.addEventListener("change", (event) => {
        const checked = (event.currentTarget as HTMLInputElement).checked;
        void item.update({ [`system.extensions.${MODULE_ID}.holy`]: checked });
      });
    },
  });

  // Holy water and a significant symbol touch a demon without a blow (p. 57).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "mh1-holy-contact",
    itemTypes: ["equipment"],
    label: L("Contact"),
    icon: "fa-solid fa-hand-sparkles",
    visible: (item) => on() && isHoly(item),
    run: (item) => contactTargets(api, item, on),
  });

  // A holy weapon also burns what holy things hurt, once a minute. The hook is
  // called on the client that applied the blow, once for each target.
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on() || !isHoly(context?.item)) return;
    void touchWithHoly(api, context.actor, String(context.item.name ?? ""), on);
  });
}
