/**
 * How a swarm was built (pp. 35-37), in this module's own fields on the
 * system's items, beside the `swarm` record data the book's records arrive
 * with (its area and price per square yard).
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CHAMELEON_SUIT } from "../stealth/rules.js";
import { CHASSIS, POWER_SUPPLIES, SWARM_TYPES, typeByName, type BotSize, type Chassis, type PowerSupply, type SwarmDesign } from "./rules.js";

const FIELD = "swarmBuild";
export const BOT_SIZES: readonly BotSize[] = ["microbot", "nanobot"];

export interface SwarmBuild {
  /** The bots; blank for what the record's type and TL imply. */
  bots: BotSize | "";
  chassis: Chassis;
  power: PowerSupply;
  /** The type, where the record's name doesn't say it. */
  type: string;
  secondType: string;
  disguised: boolean;
  selfReplicating: boolean;
  extraModels: number;
  /** A chameleon surface over the swarm, priced as a suit a square yard (pp. 98-99); blank for none. */
  chameleon: string;
}

export function registerSwarmData(): void {
  const f = foundry.data.fields as any;
  const text = (choices?: readonly string[]) => new f.StringField({ required: true, nullable: false, blank: true, initial: "", ...(choices ? { choices: ["", ...choices] } : {}) });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      bots: text(BOT_SIZES),
      chassis: new f.StringField({ required: true, nullable: false, blank: false, initial: "crawler", choices: [...CHASSIS] }),
      power: new f.StringField({ required: true, nullable: false, blank: false, initial: "cells", choices: [...POWER_SUPPLIES] }),
      type: text(Object.keys(SWARM_TYPES)),
      secondType: text(Object.keys(SWARM_TYPES)),
      disguised: new f.BooleanField({ initial: false }),
      selfReplicating: new f.BooleanField({ initial: false }),
      extraModels: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      chameleon: text(Object.keys(CHAMELEON_SUIT)),
    }),
  });
}

export function swarmBuild(item: any): SwarmBuild {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const known = (value: unknown) => (typeof value === "string" && value in SWARM_TYPES ? value : "");
  return {
    bots: BOT_SIZES.includes(data.bots) ? data.bots : "",
    chassis: CHASSIS.includes(data.chassis) ? data.chassis : "crawler",
    power: POWER_SUPPLIES.includes(data.power) ? data.power : "cells",
    type: known(data.type),
    secondType: known(data.secondType),
    disguised: Boolean(data.disguised),
    selfReplicating: Boolean(data.selfReplicating),
    extraModels: Math.max(0, Math.floor(Number(data.extraModels) || 0)),
    chameleon: typeof data.chameleon === "string" && data.chameleon in CHAMELEON_SUIT ? data.chameleon : "",
  };
}

/** The record's own swarm data: its area and price per square yard. */
export function swarmRecord(item: any): { squareYards: number; pricePerSquareYard: number; perExtraModel: number | null; maxModels: number | null } {
  const data = item?.system?.extensions?.[MODULE_ID]?.swarm ?? {};
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    squareYards: Math.max(0, Number(data.squareYards) || 0),
    pricePerSquareYard: Math.max(0, Number(data.pricePerSquareYard) || 0),
    perExtraModel: number(data.perExtraModel),
    maxModels: number(data.maxModels),
  };
}

/** A tech level as a number: "11^" is 11. */
export function tlOf(value: unknown): number | null {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
}

/** Whether an item is a swarm: a record with swarm data, a swarm type's name, or a type chosen. */
export function isSwarm(item: any): boolean {
  if (item?.type !== "equipment") return false;
  return swarmRecord(item).pricePerSquareYard > 0 || typeByName(String(item?.name ?? "")) !== null || swarmBuild(item).type !== "";
}

/** The design an item's fields describe. */
export function designOf(item: any): SwarmDesign {
  const build = swarmBuild(item);
  const record = swarmRecord(item);
  const type = build.type || typeByName(String(item?.name ?? ""));
  const tl = tlOf(item?.system?.tl) ?? (type ? SWARM_TYPES[type]?.tl ?? 10 : 10);
  const bots: BotSize = build.bots || (type === "disassembler" || build.chassis === "dust" || build.chassis === "aerostat" ? "nanobot" : "microbot");
  return {
    squareYards: record.squareYards || 1,
    bots,
    chassis: build.chassis,
    power: build.power,
    type,
    secondType: build.secondType || null,
    disguised: build.disguised,
    selfReplicating: build.selfReplicating,
    extraModels: build.extraModels,
    tl,
    // The record's price stands for its type where it has one: the book prints some
    // swarms at other prices than the table.
    typeCost: record.pricePerSquareYard || null,
  };
}

export function storeSwarm(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [key === "squareYards" ? `system.extensions.${MODULE_ID}.swarm.squareYards` : `system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}
