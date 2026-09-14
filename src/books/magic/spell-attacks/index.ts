/**
 * Jets, breaths and rains at the table (GURPS Magic pp. 73-76, 187-198).
 *
 * A jet attacks as it is cast, and again each turn from its running-spell row
 * while it lasts. A rain rolls its damage as it is cast, for the creatures in
 * the area to take through the damage card, and again each second from its
 * row, halved for creatures there less than the whole second.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { JET_KEY, RAIN_KEY, moduleAttackOf, stillRunning } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.Magic.SpellAttack.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.Magic.SpellAttack.${key}`, data);

/** "This attack may be dodged or blocked, but not parried": aimed like a weapon in hand, not thrown. */
const JET_ATTACK = { ranged: false, noParry: true } as const;

/** Asks for a second of rain: its damage, starting at the spell's own, and whether it was a whole second. */
async function askForRain(spell: any): Promise<{ formula: string; partial: boolean } | null> {
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const formula = String(spell?.system?.attack?.damage ?? "");
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("RainTitle", { spell: String(spell?.name ?? "") }) },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${escape(L("RainDamage"))}</span>
        <input type="text" name="formula" value="${escape(formula)}" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px">
        <input type="checkbox" name="partial">
        <span>${escape(L("RainPartial"))}</span>
      </label>
      <p class="ihint">${escape(L("RainHint"))}</p>
    </div>`,
    ok: {
      label: L("RainApply"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return {
          formula: root?.querySelector<HTMLInputElement>('input[name="formula"]')?.value.trim() ?? formula,
          partial: root?.querySelector<HTMLInputElement>('input[name="partial"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });
  return answer && typeof answer === "object" ? (answer as { formula: string; partial: boolean }) : null;
}

/** Rolls a second of rain, refusing a formula that isn't dice. */
async function rainSecond(api: GWorldApi, spell: any, formula: string, partial: boolean, rollDamage: (options: { label?: string; formula?: string; halfDamage?: boolean }) => Promise<void>): Promise<void> {
  if (!api.rules.parseDiceAdds(formula)) {
    ui.notifications?.warn(formula ? F("BadFormula", { formula }) : F("NoDamage", { spell: String(spell?.name ?? "") }));
    return;
  }
  await rollDamage({ label: F("RainLabel", { spell: String(spell?.name ?? "") }), formula, ...(partial ? { halfDamage: true } : {}) });
}

/** Registers the two behaviors and their running-spell buttons. */
export function readySpellAttacks(api: GWorldApi, on: () => boolean): void {
  api.magic.registerSpellAttack({
    module: MODULE_ID,
    key: JET_KEY,
    label: L("Jet"),
    cast: async (context) => {
      if (!on() || moduleAttackOf(context.spell) !== "jet") return;
      await context.rollAttack(JET_ATTACK);
    },
  });

  api.magic.registerSpellAttack({
    module: MODULE_ID,
    key: RAIN_KEY,
    label: L("Rain"),
    cast: async (context) => {
      if (!on() || moduleAttackOf(context.spell) !== "rain") return;
      // The first second falls as the spell takes effect; the damage is per
      // second, not per point of energy.
      await rainSecond(api, context.spell, String(context.attack?.damage ?? ""), false, context.rollDamage);
    },
  });

  const running = (active: any) => stillRunning(active, Number(game.time?.worldTime ?? 0) || 0);

  api.magic.registerActiveSpellAction({
    module: MODULE_ID,
    key: "magic-jet-turn",
    label: L("Attack"),
    hint: L("AttackHint"),
    visible: ({ spell, active }) => on() && moduleAttackOf(spell) === "jet" && running(active),
    run: async (context) => {
      await context.rollAttack(JET_ATTACK);
    },
  });

  api.magic.registerActiveSpellAction({
    module: MODULE_ID,
    key: "magic-rain-second",
    label: L("RainApply"),
    hint: L("RainHint"),
    visible: ({ spell, active }) => on() && moduleAttackOf(spell) === "rain" && running(active),
    run: async (context) => {
      const answer = await askForRain(context.spell);
      if (answer) await rainSecond(api, context.spell, answer.formula, answer.partial, context.rollDamage);
    },
  });
}
