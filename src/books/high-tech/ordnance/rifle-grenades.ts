/**
 * Rifle grenades at the table (pp. 193-194), under High-Tech's rifleGrenades
 * switch:
 *
 *   - **Readying one:** a row action puts the grenade on one of the
 *     character's rifles -- five seconds to fit a spigot or cup launcher where
 *     one isn't on, three to load the blank, two to put the grenade on -- and
 *     a grenade that isn't on a rifle isn't fired. Once fired it is gone, and
 *     the next one is put on again.
 *   - **The rifle:** with a launcher on it, it can't fire normally; a row
 *     action takes the launcher off (five seconds). The grenade's Bulk is
 *     added to the rifle's.
 *   - **Minimum range and duds:** inside its minimum range the grenade doesn't
 *     arm, and the refusal says so; the dud row (1d+1 crushing, no blast) is
 *     what it does there, or wherever one fails to go off (note [2], p. 194;
 *     deferred here from #370).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { RIFLE_GRENADE_DUD, RIFLE_GRENADE_SECONDS, readyRifleGrenadeSeconds, rifleGrenadeBulk, rifleGrenadeFacts, type RifleGrenadeFacts } from "./rules.js";
import { F, L, ask, checkbox, hint, row, say, select } from "./common.js";

const DUD_MODE = "ht-rifle-grenade-dud";

/** A rifle grenade's facts, from an equipment record's name. */
export const rifleGrenadeOf = (item: any): RifleGrenadeFacts | null => (item?.type === "equipment" ? rifleGrenadeFacts(String(item.name ?? "")) : null);

/** A rifle a grenade can go on: a Guns (Rifle) or Guns (Musket) weapon. */
const isRifle = (item: any): boolean => ((item?.system?.rangedModes ?? []) as any[]).some((m) => /^guns \((rifle|musket)\)/i.test(String(m?.skill ?? "")));

interface RifleState {
  /** On a grenade: the rifle it is on. */
  htOnRifle?: string | null;
  /** On a rifle: a spigot or cup launcher fitted. */
  htLauncher?: string | null;
}

export function readyRifleGrenades(api: GWorldApi, on: () => boolean): void {
  const stateOf = (item: any): RifleState => (api.combat.getWeaponState(item, MODULE_ID) as RifleState | null) ?? {};
  const setState = (item: any, patch: RifleState) => api.combat.setWeaponState(item, MODULE_ID, patch as any);
  const rifleOf = (item: any): any => {
    const id = stateOf(item).htOnRifle;
    return id ? item?.parent?.items?.get?.(id) ?? null : null;
  };

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-rifle-grenade-ready",
    itemTypes: ["equipment"],
    label: L("Rifle.Ready"),
    icon: "fa-solid fa-arrow-up-from-bracket",
    visible: (item: any) => on() && rifleGrenadeOf(item) !== null && !rifleOf(item),
    run: (item: any, actor: any) => {
      void (async () => {
        const facts = rifleGrenadeOf(item);
        const rifles = [...(actor?.items ?? [])].filter(isRifle);
        if (!facts) return;
        if (!rifles.length) return void ui.notifications?.warn(L("Rifle.NoRifle"));
        const name = String(item.name ?? "");
        const value = await ask(name, [
          row(L("Rifle.Which"), select("rifle", rifles.map((r: any) => ({ value: String(r.id), label: String(r.name ?? "") })))),
          ...(facts.launcher ? [checkbox("fitted", F("Rifle.Fitted", { launcher: L(`Rifle.Launcher.${facts.launcher}`) }))] : []),
          hint(F("Rifle.ReadyHint", { launcher: RIFLE_GRENADE_SECONDS.launcher, blank: RIFLE_GRENADE_SECONDS.blank, grenade: RIFLE_GRENADE_SECONDS.grenade })),
        ].join(""), L("Rifle.Ready"));
        if (!value) return;
        const rifle = rifles.find((r: any) => String(r.id) === value("rifle"));
        if (!rifle) return;
        const fitted = !facts.launcher || value("fitted") === "on" || Boolean(stateOf(rifle).htLauncher);
        const seconds = readyRifleGrenadeSeconds(facts, fitted);
        if (facts.launcher) await setState(rifle, { htLauncher: facts.launcher });
        await setState(item, { htOnRifle: String(rifle.id) });
        await say(actor, name, [
          F("Rifle.Readied", { name, rifle: String(rifle.name ?? ""), seconds }),
          ...(facts.launcher && !fitted ? [F("Rifle.LauncherOn", { launcher: L(`Rifle.Launcher.${facts.launcher}`) })] : []),
          ...(facts.blank ? [L("Rifle.Blank")] : [L("Rifle.BulletTrap")]),
        ]);
      })();
    },
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-rifle-launcher-off",
    itemTypes: ["equipment"],
    label: L("Rifle.LauncherOff"),
    icon: "fa-solid fa-link-slash",
    visible: (item: any) => on() && Boolean(stateOf(item).htLauncher),
    run: (item: any, actor: any) => {
      void (async () => {
        await setState(item, { htLauncher: null });
        for (const grenade of [...(actor?.items ?? [])]) {
          const facts = rifleGrenadeOf(grenade);
          if (facts?.launcher && stateOf(grenade).htOnRifle === String(item.id)) await setState(grenade, { htOnRifle: null });
        }
        await say(actor, String(item.name ?? ""), [F("Rifle.LauncherTakenOff", { seconds: RIFLE_GRENADE_SECONDS.launcher })]);
      })();
    },
  } as any);

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!on() || !item || !context.mode?.ranged) return;
    // A rifle with a launcher on can't fire normally (p. 193).
    if (stateOf(item).htLauncher && isRifle(item) && !rifleGrenadeOf(item)) {
      context.refusal = L("Rifle.LauncherFitted");
      return;
    }
    const facts = rifleGrenadeOf(item);
    if (!facts) return;
    if (!rifleOf(item)) {
      context.refusal = F("Rifle.NotReadied", { name: String(item.name ?? "") });
      return;
    }
    // Inside the minimum range the grenade doesn't arm: the dud row is what it does (note [2], p. 194).
    if (context.mode?.derived !== `${MODULE_ID}.${DUD_MODE}` && context.refusal && Number(context.minRange) > 0 && Number(context.rangeYards) < Number(context.minRange)) {
      context.refusal = F("Rifle.InsideMinimum", { yards: context.rangeYards, minimum: context.minRange, damage: RIFLE_GRENADE_DUD.damage });
    }
  });

  // Fired, as the grenade or its dud (which spends the same round): the grenade is gone from the rifle (p. 193).
  const fired = (item: any) => { if (item?.isOwner && rifleGrenadeOf(item) && rifleOf(item)) void setState(item, { htOnRifle: null }); };
  Hooks.on(api.combat.hooks.afterShots, (context: any) => { if (on()) fired(context?.item); });

  // The grenade's Bulk is added to the rifle's (note [1], p. 194).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !rifleGrenadeOf(context?.item)) return;
    const rifle = rifleOf(context.item);
    if (!rifle) return;
    const rifleBulk = Number(((rifle.system?.rangedModes ?? []) as any[]).find((m) => /^guns \((rifle|musket)\)/i.test(String(m?.skill ?? "")))?.bulk) || 0;
    for (const entry of context.rows ?? []) {
      if (entry?.kind === "ranged" && entry.row) entry.row.bulk = rifleGrenadeBulk(rifleBulk, Number(entry.row.bulk) || 0);
    }
  });

  // The dud: 1d+1 crushing, no blast, no fragments, and no minimum range. It
  // is the same grenade fired, so it spends the record's own round (API 1.101.0).
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: DUD_MODE,
    label: L("Rifle.Dud"),
    kind: "ranged",
    applies: (item: any) => on() && rifleGrenadeOf(item) !== null,
    mode: (item: any, _actor: unknown, helpers: any) => {
      const base = ((helpers.rows?.(item)?.ranged ?? []) as any[]).find((r) => !r.derivedMode);
      if (!base) return null;
      const rest: Record<string, any> = { ...base };
      for (const key of ["itemId", "modeIndex", "name", "mode", "followUp", "followUpAlso"]) delete rest[key];
      return {
        ...rest,
        damage: RIFLE_GRENADE_DUD.damage, damageType: RIFLE_GRENADE_DUD.type, armorDivisor: 1, damageRollable: true,
        explosive: false, fragmentation: "", fragmentationType: "", fragmentationDivisor: 1, fragmentationLingerEvery: 0, fragmentationLingerFor: 0,
        blastPlacement: "", affliction: false, afflictionAttribute: "", afflictionModifier: 0, minRange: 0,
        spendsFrom: Math.max(0, Math.floor(Number(base.modeIndex) || 0)),
        notes: [...(rest.notes ?? []), { label: L("Rifle.Dud"), hint: L("Rifle.DudHint") }],
      };
    },
  } as any);
}
