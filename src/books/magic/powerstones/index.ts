/**
 * Powerstones at the table (GURPS Magic pp. 20, 69-70).
 *
 * A stone is priced by its capacity, marked and edited on the item sheet,
 * recharged from its row or by the GM for everyone, and offered in the casting
 * dialog as energy the wizard may spend in place of his own.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { POWERSTONE_KINDS, type PowerstoneKind } from "./rules.js";
import { initStoneFields, rechargeUpdates, stoneFields, stoneOf, stonePatch, stonePrice, stonesForSpell, type StoneData } from "./data.js";

const L = (key: string) => game.i18n.localize(`GCC.Magic.Powerstone.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.Magic.Powerstone.${key}`, data);

/** Adds the stone's fields before the world's items are read. */
export function initPowerstones(): void {
  initStoneFields();
}

/** Recharges one character's stones for the world time passed, at the mana where spells are cast. Returns the points regained, or null. */
async function rechargeActor(api: GWorldApi, actor: any): Promise<number | null> {
  if (!actor?.isOwner) return null;
  const stones = [...(actor.items ?? [])].filter((item: any) => stoneOf(item));
  if (stones.length === 0) return null;
  const now = Number(game.time?.worldTime ?? 0) || 0;
  const { updates, gained } = rechargeUpdates(
    stones.map((item: any) => ({ id: String(item.id), data: stoneOf(item)!, carried: item.system?.carried !== false })),
    api.magic.manaLevel().level,
    now,
  );
  await actor.updateEmbeddedDocuments("Item", updates);
  return gained;
}

/** Writes a change to a stone, with its charge held to its capacity. */
function storeStone(item: any, patch: Partial<StoneData>): Promise<unknown> {
  return item.update(stonePatch(stoneFields(item), patch));
}

function valueOf(input: HTMLInputElement | HTMLSelectElement): unknown {
  return input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
}

/** Registers the price, the energy source, the sheet section, the row action and the GM tool. */
export function readyPowerstones(api: GWorldApi, on: () => boolean): void {
  // A stone's capacity reprices it; nothing is attached to it (p. 20).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "magic-powerstone",
    types: ["equipment"],
    apply: (item, { weight }) => {
      if (!on()) return null;
      const cost = stonePrice(item);
      return cost === null ? null : { cost, weight, label: L("PricedLabel") };
    },
  });

  // "Any wizard touching a Powerstone may take any or all of the energy it contains" (p. 69).
  api.magic.registerEnergySource({
    module: MODULE_ID,
    key: "magic-powerstones",
    label: L("Title"),
    sources: (actor, spell, casting) => (on() ? stonesForSpell([...(actor?.items ?? [])], spell, casting?.castThrough ?? null) : []),
    pay: async ({ actor, source, points }) => {
      const item = actor?.items?.get(source.id);
      const data = stoneOf(item);
      if (!data || data.charge < points) return false;
      await storeStone(item, { charge: data.charge - points });
      return true;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "magic-powerstone-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/magic-powerstone-item.hbs`,
    visible: (item) => on() && item?.type === "equipment",
    context: (item) => {
      const data = stoneFields(item);
      return {
        data,
        kinds: POWERSTONE_KINDS.map((kind) => ({ value: kind, label: L(`Kind.${kind}`), selected: kind === data.kind })),
        oneCollege: data.kind === "oneCollege",
        setInto: data.kind === "dedicated" || data.kind === "exclusive",
        rechargeable: data.kind !== "manastone",
        isGM: Boolean(game.user?.isGM),
        onActor: Boolean(item?.actor),
        price: stonePrice(item),
      };
    },
    listeners: (element, item) => {
      element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-stone]").forEach((input) => {
        input.addEventListener("change", () => {
          const field = String(input.dataset.gccStone) as keyof StoneData;
          const value = valueOf(input);
          if (field === "isStone" || field === "pricedByCapacity") void storeStone(item, { [field]: Boolean(value) });
          else if (field === "capacity" || field === "charge") void storeStone(item, { [field]: Math.max(0, Math.floor(Number(value) || 0)) });
          else if (field === "kind" && POWERSTONE_KINDS.includes(value as PowerstoneKind)) void storeStone(item, { kind: value as PowerstoneKind });
          else if (field === "college" || field === "setInto") void storeStone(item, { [field]: String(value).trim() });
        });
      });
      element.querySelector("[data-gcc-stone-recharge]")?.addEventListener("click", () => void rechargeFromItem(api, item));
      element.querySelector("[data-gcc-stone-fill]")?.addEventListener("click", () => {
        if (!game.user?.isGM) return;
        const data = stoneFields(item);
        void item.update({
          ...stonePatch(data, { charge: data.capacity }),
          [`system.extensions.${MODULE_ID}.powerstone.lastRecharged`]: Number(game.time?.worldTime ?? 0) || 0,
        });
      });
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "magic-powerstone-recharge",
    itemTypes: ["equipment"],
    label: L("Recharge"),
    icon: "fa-solid fa-gem",
    visible: (item) => on() && Boolean(stoneOf(item)) && stoneOf(item)!.kind !== "manastone",
    run: (item) => rechargeFromItem(api, item),
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "magic-recharge-powerstones",
    label: L("RechargeAll"),
    icon: "fa-solid fa-gem",
    visible: on,
    open: async () => {
      let points = 0;
      let characters = 0;
      for (const actor of (game as any).actors?.contents ?? []) {
        const gained = await rechargeActor(api, actor);
        if (gained === null) continue;
        characters++;
        points += gained;
      }
      ui.notifications?.info(F("RechargedAll", { points, characters }));
    },
  });
}

/** Recharges the stones of the character holding this one. */
async function rechargeFromItem(api: GWorldApi, item: any): Promise<void> {
  const actor = item?.actor ?? null;
  if (!actor) {
    ui.notifications?.warn(L("NotCarried"));
    return;
  }
  const gained = await rechargeActor(api, actor);
  if (gained !== null) ui.notifications?.info(F("Recharged", { points: gained, name: String(actor.name ?? "") }));
}
