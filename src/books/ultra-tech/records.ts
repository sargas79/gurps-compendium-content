/**
 * What the book's records carry for the rules that read them, kept in this
 * module's own fields on the system's items.
 *
 * The system keeps a module's extension data to the schema the module
 * registers: a key the module never registered is dropped when a document is
 * read, so a record written with it arrives without it. The extraction and the
 * hand-kept records write these keys; each is registered here in the shape
 * they write, whether or not the rule that reads it exists yet.
 *
 *   - `armor`: the full DR of a piece whose split is by what the attack is
 *     (#253, #254).
 *   - `warhead`: a grenade's or mine's warhead size and type (#250).
 *   - `swarm`: a swarm's area and price (#240).
 *   - `switchblade`: a switchblade's blade mode and damage per yard of reach (#252).
 *   - `vehicle`: what the Basic Set's vehicle fields don't say (#259).
 *   - `robotBody`: a robot lens's body price, weight and power (#239).
 *
 * The cells gear runs on are `power`, registered with the power cell rules.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../shared/extensions.js";

/** The keys this registers, for anything that needs to know them. */
export const RECORD_KEYS = ["armor", "warhead", "swarm", "switchblade", "vehicle", "robotBody"] as const;

/** Adds the record fields to this module's data on equipment and armour. */
export function registerRecordData(): void {
  const f = foundry.data.fields as any;
  const text = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "" });
  const amount = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  const optional = () => new f.NumberField({ required: false, nullable: true, initial: null, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    armor: new f.SchemaField({
      fullDr: amount(),
      fullDrAgainst: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "laser", "swingFallCollision"] }),
      reference: text(),
    }),
    warhead: new f.SchemaField({ size: text(), type: text() }),
    swarm: new f.SchemaField({
      squareYards: amount(),
      pricePerSquareYard: amount(),
      perExtraModel: optional(),
      maxModels: optional(),
    }),
    switchblade: new f.SchemaField({ mode: text(), damagePerYardOfReach: amount() }),
    vehicle: new f.SchemaField({
      secondDr: optional(),
      locomotion: text(),
      accelerationG: optional(),
      skills: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false }), { required: true, initial: [] }),
    }),
    robotBody: new f.SchemaField({
      cost: amount(),
      /** A range as the book prints it: "150-250 lbs.". */
      weight: text(),
      /** The book's cell notation: "2D/8 hr.". */
      power: text(),
      lc: new f.NumberField({ required: false, nullable: true, initial: null, integer: true, min: 0, max: 4 }),
      /** The lens's change to the body's price: "+50%", "+$10,000". */
      costModifier: text(),
    }),
  });
}
