/**
 * What the comms and sensors engine keeps on a piece of gear, and each book's
 * table for it.
 *
 * A comm or sensor is its book's by its record: the table says what a record
 * is (a comm of a size and range, an active sensor, an optic worn as a sense)
 * and what it is worth with the options its sheet offers. The options are
 * fields that reprice the item or change what it does, never items of their
 * own; the field holds every book's, built once every book has registered.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import type { CommMode, CommSize } from "./rules.js";

/**
 * The key the fields sit under, inside this module's own extension: every
 * book's comms and sensors share it, since an item comes from one, and worlds
 * already hold Ultra-Tech's there.
 */
const FIELD = "sensor";

/** The parts of the rule a book may switch on apart. */
export type SensorPart = "comms" | "active" | "visual" | "passive";

/** A comm, as its book's table reads its record. */
export interface Comm {
  /** Which comms talk to each other: radio to radio, laser to laser. */
  family: string;
  size: CommSize;
  /** Its range in yards, to a comm of the same size, or null where the book gives none. */
  range: number | null;
  /** What cuts the range in the field: a radio's cities and live video, or rough water for an underwater comm. */
  cuts: "radio" | "water" | null;
}

/** An active sensor, as its book's table reads its record. */
export interface ActiveSensor {
  kind: string;
  /** Its range in yards at its TL, with the options it was built with. */
  range: number;
}

/** What a worn optic or detector does for its wearer's senses, while worn. */
export interface WornSenses {
  nightVision?: number;
  infravision?: boolean;
  hyperspectral?: boolean;
  telescopic?: number;
  acute?: { hearing?: number; tasteSmell?: number; touch?: number };
  parabolicHearing?: number;
  protectedVision?: boolean;
  /** Disadvantages imposed while in use. */
  colorblindness?: boolean;
  noDepthPerception?: boolean;
  restrictedVision?: "noPeripheral" | "tunnel";
}

/** Which of a book's switches are on right now, part by part. */
export type SensorParts = Readonly<Record<SensorPart, boolean>>;

/** Everything the engine asks the other parts, gathered for a GM tool. */
export interface SweepContext {
  api: GWorldApi;
  table: SensorTable;
  selected: any;
  target: any;
  /** The selected character's active sensors from this table. */
  sensors: Array<{ item: any; active: ActiveSensor }>;
  /** Yards between the two tokens, where the map can say. */
  measured: number | null;
}

/** The comm tool's reading of one pair of comms. */
export interface CommPair {
  a: { item: any; comm: Comm };
  b: { item: any; comm: Comm };
}

/** A book's figures and readings for its comms and sensors. */
export interface SensorFigures {
  /** Every option its sheets offer, each a boolean field. */
  options: readonly string[];
  /** The ways it builds a comm, two-way first. */
  commModes: readonly CommMode[];
  /** The comm a record is, or null. */
  comm(item: any): Comm | null;
  /** The active sensor a record is, with the item's options, or null. */
  active(item: any, data: SensorData): ActiveSensor | null;
  /** What a worn item does for the senses, or null. */
  senses(item: any, actor: any, data: SensorData, on: SensorParts): WornSenses | null;
  /** The item sheet section: its lines, whether to offer the comm modes, and which options. Null to show nothing. */
  sheet(item: any, data: SensorData, on: SensorParts): { lines: string[]; modes: boolean; options: string[] } | null;
  /** What the options do to price and weight, as factors, or null for nothing. */
  price(item: any, data: SensorData, on: SensorParts): { cost: number; weight: number } | null;
  /** The range between a pair of the book's comms of one family, and lines to say about it after the cuts. */
  pairRange(pair: CommPair): { range: number; lines: string[] };
  /** Data rates the comm tool offers, as fractions of full speed, where the book prints the rule on the comm tool. */
  dataRates?: readonly number[];
  /** Other things the comm tool checks between the two characters: each returns its lines once the distance is known. */
  commExtras?(api: GWorldApi, selected: any, target: any): Array<(yards: number) => Promise<string[]>>;
  /** The sensor sweep, once a character with this book's active sensors is picked. */
  sweep(context: SweepContext): Promise<void>;
  /** Whether a sensor can lock onto a target for the +3, where its part is on. */
  canLock(item: any, data: SensorData): boolean;
  /** Whether the lock's +3 counts for this character: Ultra-Tech's needs targeting software. */
  lockCounts(actor: any): boolean;
}

/** One book's comms and sensors table. */
export interface SensorTable extends BookTable {
  /** The full keys of the book's switches, part by part; a book may name one switch for several. */
  switches: Readonly<Record<SensorPart, string>>;
  /** Where the book's text sits: "GCC.UT" reads "GCC.UT.Sensor.Title". */
  i18n: string;
  figures: SensorFigures;
}

/** Every book's comms and sensors table. */
export const SENSOR_TABLES = new BookTables<SensorTable>();

/** Which of a table's switches are on. */
export function partsOn(table: SensorTable, on: (key: string) => boolean = isRuleOn): SensorParts {
  return { comms: on(table.switches.comms), active: on(table.switches.active), visual: on(table.switches.visual), passive: on(table.switches.passive) };
}

const anyOn = (parts: SensorParts) => parts.comms || parts.active || parts.visual || parts.passive;

/**
 * The table whose rule applies to an item: its own book's, where any of that
 * book's switches is on; for an item of no book with a table, a switched-on
 * book's that knows it (`knows`), by TL.
 */
export function sensorTableOf(item: any, knows: (table: SensorTable) => boolean = () => true, on: (key: string) => boolean = isRuleOn): SensorTable | null {
  return SENSOR_TABLES.forItem(item, (t) => anyOn(partsOn(t, on)) && knows(t));
}

/** The comm an item is, with its table, where that table's comms switch is on. */
export function commOf(item: any, on: (key: string) => boolean = isRuleOn): { table: SensorTable; comm: Comm } | null {
  const table = sensorTableOf(item, (t) => t.figures.comm(item) !== null, on);
  const comm = table && partsOn(table, on).comms ? table.figures.comm(item) : null;
  return table && comm ? { table, comm } : null;
}

/** The active sensor an item is, with its table, where that table's active-sensor switch is on. */
export function activeOf(item: any, on: (key: string) => boolean = isRuleOn): { table: SensorTable; active: ActiveSensor } | null {
  const data = sensorData(item);
  const table = sensorTableOf(item, (t) => t.figures.active(item, data) !== null, on);
  const active = table && partsOn(table, on).active ? table.figures.active(item, data) : null;
  return table && active ? { table, active } : null;
}

/** Every option any book's table lists. */
function allOptions(): string[] {
  return [...new Set(SENSOR_TABLES.all.flatMap((t) => t.figures.options))];
}

/** Every way any book builds a comm. */
function allModes(): CommMode[] {
  return [...new Set<CommMode>(["", ...SENSOR_TABLES.all.flatMap((t) => t.figures.commModes)])];
}

let registered = false;

/** Adds the comm and sensor fields to this module's data on equipment and armour, once whichever books ask. */
export function registerSensorData(): void {
  if (registered) return;
  registered = true;
  const f = foundry.data.fields as any;
  // Built once every book has registered its table, so the field holds every book's options.
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: () => new f.SchemaField({
      commMode: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: allModes() }),
      ...Object.fromEntries(allOptions().map((option) => [option, new f.BooleanField({ initial: false })])),
    }),
  });
}

/** What the engine keeps on a comm or sensor. */
export interface SensorData {
  commMode: CommMode;
  /** Each option any book offers, on or off. */
  options: Readonly<Record<string, boolean>>;
}

/** This module's comm and sensor data on an item, with nothing missing. */
export function sensorData(item: any): SensorData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const modes = allModes();
  return {
    commMode: modes.includes(data.commMode) ? data.commMode : "",
    options: Object.fromEntries(allOptions().map((option) => [option, data[option] === true])),
  };
}

/** Writes one of the fields on an item: `commMode` or an option. */
export function storeSensor(item: any, field: string, value: unknown): Promise<unknown> {
  return item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
}
