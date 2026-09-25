/**
 * The flatscreen television's larger screens (HT:EE p. 34), under
 * `radioDesign`, with the supplement's other video options: the record is a
 * freestanding set of up to 32"; a wall-mounted one up to 64" averages 5
 * times the cost and weight, and a larger one 20 times. The size is set on
 * the item's sheet and reprices it, never an item of its own.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { deviceData, isDevice, storeDevice } from "../devices/index.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Screens.${key}`);

/** The screen sizes past the record's 32", and what each multiplies cost and weight by (HT:EE p. 34). */
export const SCREENS = Object.freeze({ wall: 5, large: 20 });
export type Screen = keyof typeof SCREENS;
export const SCREEN_KEYS = Object.keys(SCREENS) as Screen[];

/** Whether a record is the supplement's flatscreen television. */
export const isFlatscreenTv = (item: any): boolean => isDevice(item) && /^flatscreen television\b/i.test(String(item?.name ?? "").trim());

/** A set's screen: one of the larger sizes, or null for the record's own. */
export function screenOf(item: any): Screen | null {
  const size = deviceData(item).screen;
  return SCREEN_KEYS.includes(size as Screen) ? (size as Screen) : null;
}

/** What a set's screen does to its price and weight: a factor for each, or null for the record's own size. */
export function screenFactor(item: any): number | null {
  const size = screenOf(item);
  return size ? SCREENS[size] : null;
}

export function readyScreens(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ee-screen-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ee-screen-item.hbs`,
    visible: (item: any) => on() && isFlatscreenTv(item),
    context: (item: any) => {
      const size = screenOf(item) ?? "";
      return {
        editable: Boolean(item?.isOwner ?? true),
        sizes: [{ value: "", label: L("Size.standard"), selected: size === "" }, ...SCREEN_KEYS.map((k) => ({ value: k, label: L(`Size.${k}`), selected: k === size }))],
      };
    },
    listeners: (element: HTMLElement, item: any) => {
      element.querySelector<HTMLSelectElement>("[data-gcc-ee-screen]")?.addEventListener("change", (event) => {
        void storeDevice(item, { screen: (event.currentTarget as HTMLSelectElement).value });
      });
    },
  } as any);

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ee-screen-size",
    types: ["equipment"],
    apply: (item, price) => {
      const factor = on() && isFlatscreenTv(item) ? screenFactor(item) : null;
      return factor ? { cost: price.cost * factor, weight: price.weight * factor, label: L(`Size.${screenOf(item)}`) } : null;
    },
  });
}
