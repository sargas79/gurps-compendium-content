/**
 * Reading a book's gear off its pages, for tools/capture-gear.mjs.
 *
 * Books that print gear in running text print each item the same way: a label
 * carrying its tech level, what it does, and a closing line with the price,
 * the weight, the cells and how long they last, and the legality class.
 * Ultra-Tech runs the label into its text with a colon and closes on
 * "$1,200, 1 lb., B/10 hr. LC4." (p. 16); High-Tech ends the label with a
 * period and closes on "$50, 0.04 lb., 2×S/5 hrs. LC4.", with its own battery
 * sizes (p. 13). What differs is the book's, in book.json's `capture`:
 *
 * - `labelEnd`: what ends a label run into its text, ":" unless the book says.
 * - `cellSizes`: the book's cell sizes, smallest first; Ultra-Tech's unless
 *   the book prints its own.
 * - `runInHeadings`: a heading can share its line with what comes before or
 *   after it. High-Tech's text read in order sets "Optical Disks (TL8)" at the
 *   end of the last entry's line, or runs it into its own first sentence.
 * - `repeatsByTl`: the book prints one name at several TLs, each its own item
 *   ("Magnetic Tape (TL7)." and "Magnetic Tape (TL8)."), so a name printed at
 *   more than one TL is recorded once per TL, named with it.
 * - `noLegality`: the book prints no legality class at all, so a closing line
 *   is a price and a weight -- "$20, 0.5lb." or "$4,000; 25lbs." or
 *   "$3,700, stationary." -- or a price alone ending its sentence ("$100."),
 *   and saying so on every record would be noise. High-Tech: Electricity and
 *   Electronics prints its gear this way (HT:EE p. 8).
 * - `powerBeforePrice`: the book states the power in the sentence before the
 *   price rather than after it -- "VL/10 hours. $2,500, 100lbs." -- as cells,
 *   as built-in rechargeable batteries ("rechargeable/120 hours"), or as a
 *   grade of external power ("Household power"; HT:EE p. 9).
 * - `years`: the book closes on the year the item went on sale, and where a
 *   working model came first, that year in brackets: "[1908] 1928." An item
 *   with no market price is a prototype, priced by its complexity under the
 *   invention rules (pp. B473-474) instead: "Average complexity. Household
 *   power. [1900]." (HT:EE p. 8). Both go on the record as its `invention`
 *   data.
 *
 * Everything here is pure, so a book's reading can be tested without its PDF.
 */

import { createHash } from "node:crypto";

import { CELL_SIZES, readPower, sizePattern } from "./power-cells.mjs";

export function normalise(text) {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** A tech level as the book prints it in a label: "TL9", "TL10^", "TL9-12". */
const TECH_LEVEL = String.raw`TL\s?\d+\^?(?:[-/]\d+\^?)?`;

/** A tech level alone on a line, the rest of a heading the column broke. */
const TECH_LEVEL_ALONE = new RegExp(String.raw`^\(${TECH_LEVEL}\)$`);

/** A size label that names nothing without its family: "Large", "Very Large". */
const SIZE = /^(Very Large|Large|Medium|Small|Tiny|Micro|Mini)$/;

/** A running head or folio. */
const FURNITURE = /^([A-Z][A-Z ,'&-]{3,}|\d{1,3})$/;

/** A price, or a range of them: "$1,200", "$0.50", "$10 million", "$50-$200". */
const PRICE = String.raw`\+?\$[\d,]+(?:\.\d+)?(?:\s?-\s?\$[\d,]+(?:\.\d+)?)?(?:\s+million)?`;

/**
 * The closing line: a price, what follows it, and the legality class.
 * "$1,200, 1 lb., B/10 hr. LC4." The last price before the class is the one.
 */
const CLOSING = new RegExp(String.raw`(${PRICE})([^$]{0,160}?)\bLC\s?(\d)\.?`, "g");

/**
 * A closing line with no legality class, which some gadgets print: "$20, 2 lbs."
 * or "$150 per dose". Only a price followed by a weight or a unit counts, so a
 * price mentioned in passing is not taken for the gadget's.
 */
const BARE_CLOSING = new RegExp(
  String.raw`(${PRICE})((?:,\s*(?:neg\.|negligible|[\d,./]+\s*lbs?\.?)[^$.]{0,60}|\s+per\s+(?:dose|square foot|yard))[^$]{0,20}?)(?:\.|$)`,
  "g",
);

/**
 * A closing line with no legality class, for a book that prints none: a price,
 * then a weight after a comma or semicolon -- "0.5lb.", "25lbs.", "20 tons",
 * "neg.", "stationary" -- or nothing, where the price ends its sentence. A price
 * followed by anything else is one mentioned in passing. "$5/dozen" is a price
 * per unit.
 */
// Thousands are grouped by commas, so a comma after the figure is the closing line's.
const PLAIN_PRICE = /\+?\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s+million)?/g;
const PLAIN_WEIGHT = /^\s*[,;]\s*(?:weighs?\s+)?(neg\.|negligible|stationary|[\d,]*\.?\d+\s*(?:lbs?|tons?)\b\.?)/i;
const PLAIN_UNIT = /^\/([a-z]+)/i;

/** The years after a closing line: "1787.", "[1820] 1836.", "(1939) 1970.", "[1800]." */
const YEARS = /^\s*(?:[[(](\d{4})[\])])?\s*(\d{4})?(?!\d)/;

/** A prototype's closing: its complexity in place of a price (HT:EE p. 8). */
const PROTOTYPE = /\b(Simple|Average|Complex|Amazing) complexity\.\s*([^$]{0,80}?)(?:\[(\d{4})\]\.?|$)/;

/** The grades of external power, and High-Tech's own "external power" (HT:EE p. 9; High-Tech p. 14). */
const POWER_GRADE = /\b(?:(?:peripheral|automotive|household|major appliance|industrial)(?:\s+or\s+[a-z]+)?|external)\s+(?:power|current)\b/i;

/** Built-in rechargeable batteries and how long they last: "rechargeable/120 hours" (HT:EE p. 9). */
const RECHARGEABLE = /\brechargeable\s*\/\s*([\d,.]+\s*(?:hrs?|hours?|min(?:utes?)?|days?|weeks?|months?|years?)\.?)/i;

/**
 * Every closing line in an entry's text for a book that prints no legality
 * class, each shaped as CLOSING's matches are: the price, what follows it, and
 * no class. The years after it come too, where the book prints them.
 */
export function plainClosings(text) {
  const out = [];
  for (const m of text.matchAll(PLAIN_PRICE)) {
    let rest = text.slice(m.index + m[0].length);
    let at = m[0].length;
    const unit = PLAIN_UNIT.exec(rest);
    if (unit) {
      rest = rest.slice(unit[0].length);
      at += unit[0].length;
    }
    const weight = PLAIN_WEIGHT.exec(rest);
    if (weight) {
      rest = rest.slice(weight[0].length);
      at += weight[0].length;
    } else if (!/^\.(?:\s|$)/.test(rest)) {
      continue;
    }
    // What the weight is followed by before the sentence ends -- ", with HT 12
    // and DR 4", " (tower cost and weight excluded)" -- stays in the closing.
    const extra = /^(?:\.?\s*,[^.$[]{0,60}|\.?\s*\([^)$]{0,60}\))?\.?/.exec(rest)[0];
    rest = rest.slice(extra.length);
    at += extra.length;
    const years = YEARS.exec(rest);
    out.push({
      index: m.index,
      price: m[0],
      unit: unit?.[1] ?? null,
      after: text.slice(m.index + m[0].length, m.index + at),
      weight: weight?.[1] ?? null,
      prototypeYear: years?.[1] ? Number(years[1]) : null,
      marketYear: years?.[2] ? Number(years[2]) : null,
      text: text.slice(m.index, m.index + at + (years?.[0].length ?? 0)).trim(),
    });
  }
  return out;
}

/**
 * The power a book states before its price, read off the text that comes
 * before it: the last cells, built-in rechargeable batteries or grade of
 * external power in the two sentences before the price. The cells win where
 * the book offers both ("2×XS/120 hours or rechargeable/120 hours"); the
 * whole statement is kept as printed.
 */
export function powerBefore(text, settings) {
  const sentences = text.replace(/(\d)\s*\ufffd\s*/g, "$1×").split(/(?<=\.)\s+(?=[A-Z\d])/).slice(-2);
  for (const sentence of sentences.reverse()) {
    const cells = powerIn(sentence, settings);
    const recharge = RECHARGEABLE.exec(sentence);
    const grade = POWER_GRADE.exec(sentence);
    const raw = sentence.trim().replace(/\.$/, "");
    // The whole statement is kept only where it says more than the draw: "or rechargeable/120 hours".
    const more = (drawn) => (raw !== drawn.replace(/\.$/, "") ? { raw } : {});
    if (cells && cells.cell) return { draw: cells, ...more(cells.raw) };
    if (recharge) {
      return { draw: { cell: "", cells: 0, endurance: recharge[1].trim(), raw: recharge[0] }, rechargeable: true, ...more(recharge[0]) };
    }
    if (grade) return { raw: grade[0].charAt(0).toUpperCase() + grade[0].slice(1) };
  }
  return null;
}

/** How a book prints its gear, from book.json's `capture`. */
export function captureSettings(capture = {}) {
  const labelEnd = capture.labelEnd ?? ":";
  const end = labelEnd.replace(/[\]\\^-]/g, "\\$&");
  const cellSizes = capture.cellSizes ?? CELL_SIZES;
  const runIn = capture.runInHeadings === true;
  // What may follow a label's tech level: the label end, the end of the line
  // (a heading), or with run-in headings the heading's own first word.
  const after = runIn ? String.raw`[${end}]\s*|$|\s(?=[A-Z"])` : String.raw`[${end}]\s*|$`;
  const afterInside = runIn ? String.raw`(?:[${end}]\s|\s(?=[A-Z"])|$)` : String.raw`[${end}]\s`;
  return {
    cellSizes,
    repeatsByTl: capture.repeatsByTl === true,
    noLegality: capture.noLegality === true,
    powerBeforePrice: capture.powerBeforePrice === true,
    years: capture.years === true,
    /**
     * A gadget's label: a capitalised name, any parentheticals, and its tech
     * level in parentheses. Followed by the book's label end it runs into its
     * text; alone on a line it is a heading.
     */
    label: new RegExp(String.raw`^((?:LC\d\.\s+)?[A-Z0-9"][^:()${end}]{1,60}?(?:\s\([^)]*\))*?)\s\((${TECH_LEVEL})\)(${after})`),
    /** Where a line starts another gadget partway through: after a sentence ends. */
    labelInside: new RegExp(String.raw`(?<=[.!?)]\s)(?=[A-Z][^:()${end}]{1,60}?(?:\s\([^)]*\))*?\s\(${TECH_LEVEL}\)${afterInside})`, "g"),
    /** Cells and endurance: "B/10 hr.", "2C/20 hr", "D/1 week"; High-Tech's "3×S/5 hrs.". */
    power: new RegExp(
      String.raw`((?:\d+\s*×?\s*)?(?:${sizePattern(cellSizes)}))\s*\/\s*([\d,.]+\s*(?:hrs?|hours?|min(?:utes?)?|days?|weeks?|wks?|months?|mon|years?|yrs?|seconds?|uses|s)\.?)`,
      "i",
    ),
  };
}

/** A price: "$1,200", "$0.50", "$10 million"; the lower of a range. */
export function priceOf(text) {
  const million = /million/.test(text) ? 1_000_000 : 1;
  return Number(text.replace(/million|\s?-\s?\$.*$|[+$,\s]/g, "")) * million;
}

/** A weight: "1 lb.", "0.5 lbs.", "1/8 lb.", "neg.", "negligible weight", "2 tons"; "stationary", too heavy to carry, as none. */
export function weightOf(text) {
  if (/\bneg(?:\.|ligible)/i.test(text)) return { weight: 0 };
  if (/^[\s,;]*stationary\b/i.test(text)) return { weight: 0, stationary: true };
  const fraction = /\b(\d+)\/(\d+)\s*lbs?\b/i.exec(text);
  if (fraction) return { weight: Number(fraction[1]) / Number(fraction[2]) };
  const m = /([\d,]*\.?\d+)\s*lbs?\b/i.exec(text);
  if (m) return { weight: Number(m[1].replace(/,/g, "")) };
  const tons = /([\d,]*\.?\d+)\s*tons?\b/i.exec(text);
  return tons ? { weight: Number(tons[1].replace(/,/g, "")) * 2000 } : null;
}

/** Cells and endurance, in the book's sizes. */
export function powerIn(text, settings) {
  // The PDF's text loses the multiplication sign: "3×S" reads "3\ufffdS".
  const m = settings.power.exec(text.replace(/(\d)\s*\ufffd\s*/g, "$1×"));
  if (!m) return null;
  return readPower(`${m[1].replace(/\s+/g, "")}/${m[2]}`, settings.cellSizes);
}

/** The grade a printed quality bonus is (Basic Set p. 345), and whether it maps exactly. */
export function gradeOf(bonus) {
  if (/TL\/2/i.test(bonus)) return { grade: "best", exact: true };
  const n = Number(bonus);
  if (n === 1) return { grade: "good", exact: true };
  if (n === 2) return { grade: "fine", exact: true };
  // The grades stop at +2 below "best" (+TL/2, at least +2), so a +3 is never
  // written up to best: it is fine, and marked for a person to see.
  if (n === 3) return { grade: "fine", exact: false };
  if (n >= 4) return { grade: "best", exact: false };
  return null;
}

/**
 * A record's id, from its book and name. A record from one of the book's other
 * volumes (tools/lib/sources.mjs) hashes the volume in as well, so it can share
 * a name with the book's own record without sharing its id (private #471, E2).
 */
export function ident(slug, name, source = null) {
  return createHash("sha1").update(`${slug}:${source ? `${source}:` : ""}equipment:${name}`).digest("hex").slice(0, 16);
}

export function key(name) {
  return normalise(name).replace(/\s*\(TL\s?\d+\)$/i, "").toLowerCase();
}

/**
 * Names a book prints at more than one TL named with their TL -- "Magnetic
 * Tape (TL7)", "Magnetic Tape (TL8)" -- where the book's `repeatsByTl` says
 * each is its own item. A heading counts too: "Cord (TL7) Synthetic." is an
 * item whose label reads as a heading.
 */
export function nameRepeats(entries, settings) {
  if (!settings.repeatsByTl) return entries;
  const tls = new Map();
  for (const entry of entries) {
    const k = key(entry.name);
    tls.set(k, new Set([...(tls.get(k) ?? []), entry.tl]));
  }
  return entries.map((entry) => ((tls.get(key(entry.name))?.size ?? 0) > 1 ? { ...entry, name: `${entry.name} (TL${entry.tl})` } : entry));
}

/** What a record is known by, to tell one from another: its name, or its name and TL where the book repeats names by TL. */
export function recordKey(entry, settings) {
  return settings.repeatsByTl ? normalise(entry.name).toLowerCase() : key(entry.name);
}

/** The gadget entries on a run of pages, each with its label's page. */
export function entriesOn(pages, from, to, offset, settings) {
  const entries = [];
  let current = null;
  let family = null;
  for (let page = from; page <= to; page++) {
    const lines = (pages[page + offset - 1] ?? "")
      .split("\n")
      .map(normalise)
      .filter((line) => line && !FURNITURE.test(line))
      .flatMap((line) => line.split(settings.labelInside))
      // A heading too long for its column puts its tech level on a line of its
      // own: "Gravity-Ripple Communicators" / "(TL10^/11^)".
      .reduce((out, line) => {
        const previous = out[out.length - 1];
        if (previous && TECH_LEVEL_ALONE.test(line) && previous.length < 60 && !/[.!?:;,]$/.test(previous)) {
          out[out.length - 1] = `${previous} ${line}`;
        } else {
          out.push(line);
        }
        return out;
      }, []);
    for (const line of lines) {
      const m = settings.label.exec(line);
      if (m && !/points\)/.test(m[1])) {
        if (current) entries.push(current);
        let name = normalise(m[1].replace(/^LC\d\.\s+/, ""));
        // Sizes listed under a family heading -- "Radio Communicators" then
        // "Large (TL9): ..." -- are named for the family.
        if (SIZE.test(name) && family) name = `${family.replace(/(?<!s)s$/, "")} (${name})`;
        current = {
          name,
          tl: m[2].replace(/^TL\s?/, ""),
          page,
          heading: m[3].trim() === "",
          text: line.slice(m[0].length),
        };
        if (current.heading && !SIZE.test(name)) family = name;
        continue;
      }
      // Stored order breaks lines where the page does: "sepa-" / "rating".
      if (current) current.text = /[a-z]-$/.test(current.text) && /^[a-z]/.test(line) ? current.text.slice(0, -1) + line : `${current.text} ${line}`;
    }
  }
  if (current) entries.push(current);
  return entries;
}

/** A record from one entry, or the reason there is none. */
export function recordOf(entry, bk, skills, settings) {
  const notes = [];
  let closings = [...entry.text.matchAll(CLOSING)];
  let plain = null;
  let prototype = null;
  if (!closings.length && settings.noLegality) {
    // A book with no legality class: a price and a weight, and the years after.
    const found = plainClosings(entry.text);
    if (found.length) {
      plain = found[0];
      closings = found.map((c) => Object.assign([c.text, c.price, c.after], { index: c.index }));
      if (plain.unit) notes.push(`price is per ${plain.unit}`);
    } else {
      // No price at all: a prototype, priced by its complexity (HT:EE p. 8).
      const m = PROTOTYPE.exec(entry.text);
      if (m) {
        prototype = { complexity: m[1].toLowerCase(), year: m[3] ? Number(m[3]) : null, between: m[2] };
        closings = [Object.assign([m[0], "$0", ` ${m[2]}`], { index: m.index })];
        notes.push(`prototype of ${m[1]} complexity: no price`);
      }
    }
  } else if (!closings.length) {
    closings = [...entry.text.matchAll(BARE_CLOSING)];
    if (closings.length) notes.push("no LC printed");
  }
  if (!closings.length) return { skip: "no price" };
  const close = closings[0];
  const cost = prototype ? 0 : priceOf(close[1]);
  const after = close[2];
  const weight = weightOf(after);
  if (weight?.stationary) notes.push("stationary: recorded as weightless");
  // Where the book states power before the price, the sentences before it say it.
  let power = powerIn(after, settings);
  let supply = power ? { draw: power } : null;
  if (!supply && settings.powerBeforePrice) {
    supply = powerBefore(prototype ? `${entry.text.slice(0, close.index)} ${prototype.between}` : entry.text.slice(0, close.index), settings);
    power = supply?.draw ?? null;
  }
  const lc = close[3] === undefined ? null : Number(close[3]);
  const text = entry.text.slice(0, close.index + close[0].length);

  // A multi-level TL ("TL9-12") is the first level the gadget exists at.
  // "TL10/11^" is TL10, superscience from TL11: the first level stands. In a
  // range, "TL11-12^", the mark is the whole range's.
  const range = /^(\d+)\^?-\d+\^$/.exec(entry.tl);
  const tl = range ? `${range[1]}^` : entry.tl.replace(/[-/]\d+\^*$/, "").replace(/\^+/, "^");
  if (close[1].startsWith("+")) notes.push("price is an addition to something else");
  if (/\$.*-/.test(close[1])) notes.push(`price is a range, ${close[1]}: the lower is recorded`);
  if (/^\s*(?:per|\/)/i.test(after)) notes.push(`price is per unit: "${after.trim().split(/[,.]/)[0]}"`);
  if (!weight && !prototype) notes.push("no weight read");
  if (closings.length > 1) notes.push(`${closings.length} closing lines: variants or options follow`);

  let equipmentQuality = "basic";
  const forSkills = [];
  const quality = /\+(\d+|TL\/2)\s*\(quality\)/i.exec(text);
  if (quality) {
    const grade = gradeOf(quality[1]);
    if (grade) {
      equipmentQuality = grade.grade;
      if (!grade.exact) notes.push(`+${quality[1]} (quality) has no exact grade`);
    }
    // What the bonus is to: the clause around it, up to the next clause. "First
    // Aid using bandage spray receives a +2 (quality) bonus to skill" names it
    // before; "+2 (quality) bonus to First Aid skill and counts as improvised
    // equipment for Surgery" names it after, and Surgery is another clause.
    const start = Math.max(0, text.lastIndexOf(".", quality.index) + 1);
    const tail = text.slice(quality.index);
    const end = quality.index + (/[.;]|,\s|\sand\s(?!HT)|\sbut\s/.exec(tail.slice(12))?.index ?? tail.length) + 12;
    const clause = text.slice(start, end);
    for (const skill of skills) {
      if (new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(clause) && !forSkills.some((s) => s.includes(skill))) {
        forSkills.push(skill);
      }
    }
    if (!forSkills.length) notes.push("quality bonus to no skill read");
  }

  const perDose = /^\s*per\s+dose/i.test(after);
  const category = perDose ? "consumable" : quality ? "tool" : "misc";
  const system = {
    quantity: 1,
    weight: weight?.weight ?? 0,
    cost,
    carried: true,
    equipped: false,
    tl,
    lc,
    costOfLivingPercent: 0,
    description: "",
    reference: `${bk.reference} p. ${entry.page}`,
    category,
    equipmentQuality,
    forSkills,
    quality: "good",
    material: "",
    weaponClass: "",
    listCost: cost,
    hpLost: 0,
    meleeModes: [],
    rangedModes: [],
  };
  const extensions = {};
  if (supply) extensions.power = supply;
  // The years the book prints, and a prototype's complexity (HT:EE p. 8).
  if (settings.years && (prototype || plain?.prototypeYear || plain?.marketYear)) {
    extensions.invention = {
      complexity: prototype?.complexity ?? "",
      prototypeYear: prototype?.year ?? plain?.prototypeYear ?? 0,
      marketYear: plain?.marketYear ?? 0,
    };
  }
  if (Object.keys(extensions).length) system.extensions = { "gurps-compendium-content": extensions };
  return {
    record: { _id: ident(bk.slug, entry.name, bk.source?.id ?? null), name: entry.name, type: "equipment", system },
    closing: close[0],
    notes,
  };
}
