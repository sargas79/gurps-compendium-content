/**
 * High-Tech's grenades, land mines, rifle grenades, bombs and nuclear weapons
 * (pp. 189-196), registered with the system through the add-on API under
 * four switches. The rules are in `rules.ts`; each switch's wiring is in its
 * own file:
 *
 *   - **grenadeHandling** (`grenades.ts`): priming, arming and cooking off
 *     hand grenades, throwing one back, booby traps, improvised grenades,
 *     Molotovs through an engine grating, and the smoke, white-phosphorus,
 *     thermite and flashbang grenades.
 *   - **landMines** (`mines.ts`): placing, finding and disarming mines;
 *     bounding mines' fragments, which a flat target escapes; the Claymore's
 *     pellets resolved nearest first.
 *   - **rifleGrenades** (`rifle-grenades.ts`): launchers, blanks and readying
 *     a grenade on a rifle; the dud inside the minimum range.
 *   - **nuclearEffects** (`nuclear.ts`): the burning's slower falloff, the
 *     flash that always applies, EMP and fallout.
 *
 * The explosives' own rules (`../explosives`) take the thermite grenade, the
 * nuclear flash and the fuel-air bomb from here.
 */

import type { GWorldApi } from "../../../shared/module.js";
import { readyGrenades, grenadeOf } from "./grenades.js";
import { readyMines } from "./mines.js";
import { isNuclear, readyNuclear } from "./nuclear.js";
import { readyRifleGrenades } from "./rifle-grenades.js";
import { FUEL_AIR_BOMBS } from "./rules.js";

export interface OrdnanceSwitches {
  grenades: () => boolean;
  mines: () => boolean;
  rifleGrenades: () => boolean;
  nuclear: () => boolean;
}

export function readyOrdnance(api: GWorldApi, on: OrdnanceSwitches): void {
  readyGrenades(api, on.grenades);
  readyMines(api, on.mines);
  readyRifleGrenades(api, on.rifleGrenades);
  readyNuclear(api, on.nuclear);
}

/** What the explosives' rules take from these: the thermite grenade, the nuclear flash, the fuel-air bomb. */
export function ordnanceExtras(on: OrdnanceSwitches) {
  return {
    alwaysFlash: (item: any) => on.nuclear() && isNuclear(item),
    thermiteGrenade: (item: any) => (on.grenades() ? grenadeOf(item)?.thermiteSeconds ?? null : null),
    thermiteGrenadesOn: on.grenades,
    fuelAirBomb: (item: any) => FUEL_AIR_BOMBS.includes(String(item?.name ?? "").trim()),
  };
}
