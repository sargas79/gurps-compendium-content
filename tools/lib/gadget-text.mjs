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
 * A price and weight with no legality class after them, as High-Tech:
 * Electricity and Electronics prints them (HT:EE p. 8): "$20, 0.5 lb.",
 * "$4,000; 25 lbs.", "$3,700, stationary.", a price ending its sentence
 * ("$100."), the weight first ("0.5 lb., $100."), a price per unit
 * ("$5/dozen"), two models' prices ("$35 (TL6)/$135 (TL8); 1.2 lbs."), or a
 * prototype's weight alone.
 */
const PLAIN_PRICE = String.raw`\+?\$[\d,]+(?:\.\d+)?(?:\s+million)?(?:\/[a-z]+)?(?:\s*\([^)$]{1,20}\))?`;
const PLAIN_WEIGHT = String.raw`(?:neg\.?|negligible|stationary|[\d,]*\.?\d+\s*(?:lbs?|tons?)\.?)`;
const PLAIN_PRICE_WEIGHT = new RegExp(
  String.raw`\s*(?:${PLAIN_PRICE}(?:\s*\/\s*${PLAIN_PRICE})*(?:\s*[,;]\s*${PLAIN_WEIGHT})?|${PLAIN_WEIGHT}\s*[,;]\s*${PLAIN_PRICE}|[\d,]*\.?\d+\s*lbs?)\.?\s*$`,
  "i",
);

/** The years a closing line ends on: "1787.", "[1826] 1858.", a prototype's "[1745]." */
const PLAIN_YEARS = /\s*(?:[[(]\d{4}[\])]\s*)?\d{4}\.?\s*$|\s*\[\d{4}\]\.?\s*$/;

/**
 * The sentence before the price that says what powers the item, or a
 * prototype's complexity: "2×XS/120 hours or rechargeable/120 hours.",
 * "Household power or S/6 hours.", "Major appliance power.", "Average
 * complexity." (HT:EE pp. 8-9), and a prototype's "Stationary." with no
 * price. The record holds them all.
 */
const PLAIN_POWER = new RegExp(
  String.raw`(?:^|(?<=[.!?)]\s))(?:(?:\d+\s*×\s*)?(?:T|XS|S|M|L|VL)(?:\/[\d,.]+\s*[a-z]+)?|rechargeable\/[\d,.]+\s*[a-z]+|(?:peripheral|automotive|household|major appliance|industrial|external)[a-z ]{0,30}?(?:power|current))(?:\s+or\s+[^.$]{1,40})?[.,]?\s*$|(?:^|(?<=[.!?)]\s))(?:(?:simple|average|complex|amazing) complexity|stationary)\.\s*$`,
  "i",
);

/**
 * Where one item's closing line ends and more of the entry follows: after its
 * years, or after a price and weight that a new sentence follows. "...$280,
 * 7.5 lbs. 1980. A second model..." prices one model and goes on to the next
 * under the same entry; "...$1.50, neg. Miniature bulbs..." does the same with
 * no year, and the weight may come first: "0.5 lb., $100. [1909] 1929."
 */
const PLAIN_SEAM = new RegExp(
  String.raw`(?<=(?:\$[\d,]+(?:\.\d+)?(?:\/[a-z]+)?(?:\s*\([^)$]{1,20}\))?[,;]\s*(?:neg\.|stationary\.|[\d,]*\.?\d+\s*lbs?\.)|[\d,]*\.?\d+\s*lbs?\.,\s*\$[\d,]+(?:\.\d+)?\.)(?:\s*(?:\[\d{4}\]\s*)?\d{4}\.)?)\s+(?=["A-Z])`,
);

/** A sentence that is only a year or two, which a closing line ends on: "1923.", "[1826] 1858." */
const YEAR_ALONE = /(?:^|(?<=[.!?)]\s))(?:[[(]\d{4}[\])]\s*)?\d{4}\.\s*$/;

/**
 * The closing line inside an entry's last sentence, from its price on: "...a
 * sturdier version costs $40, 2 lbs., with DR 3." What led up to the price
 * goes too, as withoutPriceStub takes it.
 */
function withoutPriceTail(text) {
  const last = text.search(/(?:^|(?<=[.!?)]\s))[^.!?]*(?:\.(?!\s+["A-Z])[^.!?]*)*[.!?]?\s*$/);
  const at = text.indexOf("$", Math.max(last, 0));
  return at === -1 ? text : text.slice(0, at).trim();
}

/**
 * A closing line whose years say what each is for: "$30, 3 lbs. 1878 for one
 * lamp (p. 20); 1904 for the other."
 */
const PLAIN_YEARS_NOTED = /(?:^|(?<=[.!?)]\s))\$[\d,]+(?:\.\d+)?[,;]\s*(?:neg\.|stationary\.|[\d,]*\.?\d+\s*lbs?\.)\s*(?:\[\d{4}\]\s*)?\d{4}\s[^$]*$/;

/** One closing line dropped from the end of a piece of an entry. */
function withoutPlainClosing(text) {
  let out = text.trim();
  const noYears = out.replace(PLAIN_YEARS, "");
  const dated = noYears !== out;
  if (PLAIN_YEARS_NOTED.test(out)) out = out.replace(PLAIN_YEARS_NOTED, "").trim();
  else if (PLAIN_PRICE_WEIGHT.test(noYears)) out = noYears.replace(PLAIN_PRICE_WEIGHT, "").trim();
  // "$750, 15 lbs.; $375, 10 lbs. for each extra unit. [1888] 1900." and "$1,100,
  // 100 lbs. (stand not included). [1887] 1930.": the years say the sentence
  // before them holds the closing line, whatever it adds to the price.
  else if (dated && withoutPriceTail(noYears) !== noYears) out = withoutPriceTail(noYears);
  else if (dated && PLAIN_POWER.test(noYears)) out = noYears.trim();
  else if (YEAR_ALONE.test(out)) out = out.replace(YEAR_ALONE, "").trim();
  for (let previous = null; previous !== out; ) {
    previous = out;
    out = out.replace(PLAIN_POWER, "").trim();
  }
  // What only led up to the price goes with it: "A box of ten is", "The usual make is:".
  // A piece that lost nothing is left as it is, for the doubts to flag if it stops short.
  if (out === text.trim()) return out;
  const kept = withoutPriceStub(out);
  // A second model's closing can be the whole of its sentence's piece: "...$70,
  // 2.25 lbs. Spare tips are $1, neg. 1881." leaves a stub with no
  // sentence before it to fall back to.
  return /[.!?"')\]]$/.test(kept) || kept.length > 120 || /[.!?]\s/.test(kept) ? kept : "";
}

/**
 * Drops the closing lines of a book that prints no legality class: the power,
 * the price and weight, and the years, which the record holds as its power,
 * cost, weight and `invention` data (HT:EE pp. 8-9). "...a small current.
 * Household power. $52, 10 lbs. [1922] 1936." keeps "...a small current."
 *
 * An entry pricing two models ("...$280, 7.5 lbs. 1980. A second model...
 * $150, 6 lbs. 1985.") loses both closings and keeps what it says of each, so
 * the two records it prices can share its text; so does an entry whose years
 * come a sentence after its price ("$26, 4 lbs. Later models... 1923."). Nothing
 * is dropped from a piece that doesn't end on a price, a weight, a power
 * statement or complexity before them, or a year standing alone, so a
 * sentence ending on a year stays whole.
 */
export function stripPlainClosing(text) {
  return text
    .split(PLAIN_SEAM)
    .map(withoutPlainClosing)
    .filter(Boolean)
    .join(" ");
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
 * (p. 71).") runs into as well. A label may open on a unit in lower case:
 * "pH Meter (TL7)." (HT:EE p. 13).
 */
export function gadgetLines(line) {
  return line.split(/(?<=\bLC\s?\d\.)\s+(?=["A-Z0-9])|(?<=[.!?)]\s)(?=(?:[A-Z0-9]|[a-z][A-Z])[^.:()]{0,50}\*?\s\(TL[\d^/-]+\)\.\s)/);
}
