/**
 * What tools/transcribe.mjs keeps of a gadget's text, and where one gadget's
 * text ends and the next begins.
 *
 * A gadget's closing line is its statistics -- price, weight, power, legality --
 * which the record holds as numbers, so the text stops short of it.
 */

/**
 * Drops the price and weight an inline entry ends with.
 *
 * "$50, 4 lbs." and "Per set: $50, 4 lbs." are the item's cost and weight, both
 * of which the system carries as numbers. Repeating them in the text would put
 * a second copy on the sheet, and one that never changes when the other does.
 */
export function stripPrice(text) {
  // The first shape that matches is the gadget's closing line, and nothing
  // before it is: High-Tech's travel bag "Holds 100 lbs." before "$60, 10 lbs.
  // LC4.", which a second pass would take for a weight.
  const shapes = [
    // Ultra-Tech closes a gadget on price, weight, power and legality: "$50,
    // neg. weight, A/10 hr. (uses flexible cells). LC4." High-Tech prints a
    // range and what it is priced by: "$10-$50, neg. LC4.", "Per mile: $1,500, 350 lbs. LC4."
    /\s*(?:If bought separately:\s*|Per\s+[\w\s'"-]{1,30}:\s*)?\+?\$[\d,]+(?:\.\d+)?(?:-\$[\d,]+)?[^$]{0,100}?\bLC\s*\d\.?\s*$/,
    // A force blade prints only its cells and running time: "2C/420 seconds. LC2."
    /\s*\d?[A-F]{1,2}\/[\d,]+\s*(?:seconds|minutes|hours|hrs?)\.?(?:\s*LC\s*\d\.?)?\s*$/,
    // "$50, 2 lbs.", "$40, 12 hrs.", "Per set: $50, 4 lbs.", "$200.", and a
    // weight with a decimal point in it, "$2, 0.5 lb.", "$250, 0.25 lb., 10 hrs."
    /\s*(Per\s+[\w\s]+:\s*)?\+?\$[\d,]+(\.\d+)?(\s*,\s*(?:[^.;]|\.(?=\d)|\.,){1,32})?\.?\s*$/i,
    /\s*,?\s*[\d./]+\s*lbs?\.?\s*$/i,
  ];
  for (const shape of shapes) {
    if (shape.test(text)) return withoutPriceStub(text.replace(shape, "").trim());
  }
  return text.trim();
}

/**
 * A closing sentence whose price was taken away.
 *
 * High-Tech prices a gadget inside its last sentence -- "A 60-yard roll is $5,
 * 1 lb. LC4.", "Per meal (10 crackers): $0.50, 1 lb." -- so taking the price
 * leaves "A 60-yard roll is", which says nothing without it. That stub goes
 * too, back to the end of the sentence before it. A stub is short: a longer
 * unfinished tail is left for the doubts to flag.
 */
export function withoutPriceStub(text) {
  if (/[.!?"')\]]$/.test(text)) return text;
  // Where the last whole sentence ends: after its stop and any closing mark.
  const ends = [...text.matchAll(/[.!?]["')]?(?=\s)/g)].map((m) => m.index + m[0].length);
  const end = ends.at(-1);
  if (end === undefined) return /^(?:Per\b|Each\b|[^.]{0,40}:$)/.test(text) ? "" : text;
  return text.length - end <= 120 ? text.slice(0, end).trim() : text;
}

/**
 * A line split where one gadget ends and the next begins.
 *
 * High-Tech runs one gadget on from another's legality class, and a heading on
 * from the gadget before it: "...$50, 0.5 lb. LC4. Magnetic Diskettes (TL7)".
 * The class ends a gadget, so a line breaks after it; and before a label with
 * its tech level, which a gadget of no price ("Dive Mask (TL6). See Goggles
 * (p. 71).") runs into as well.
 */
export function gadgetLines(line) {
  return line.split(/(?<=\bLC\s?\d\.)\s+(?=["A-Z0-9])|(?<=[.!?)]\s)(?=[A-Z0-9][^.:()]{0,50}\*?\s\(TL[\d^/-]+\)\.\s)/);
}
