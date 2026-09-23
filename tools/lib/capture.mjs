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

/** A weight: "1 lb.", "0.5 lbs.", "1/8 lb.", "neg.", "negligible weight", "2 tons". */
export function weightOf(text) {
  if (/\bneg(?:\.|ligible)/i.test(text)) return { weight: 0 };
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

export function ident(slug, name) {
  return createHash("sha1").update(`${slug}:equipment:${name}`).digest("hex").slice(0, 16);
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
  if (!closings.length) {
    closings = [...entry.text.matchAll(BARE_CLOSING)];
    if (closings.length) notes.push("no LC printed");
  }
  if (!closings.length) return { skip: "no price" };
  const close = closings[0];
  const cost = priceOf(close[1]);
  const after = close[2];
  const weight = weightOf(after);
  const power = powerIn(after, settings);
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
  if (!weight) notes.push("no weight read");
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
  if (power) system.extensions = { "gurps-compendium-content": { power: { draw: power } } };
  return {
    record: { _id: ident(bk.slug, entry.name), name: entry.name, type: "equipment", system },
    closing: close[0],
    notes,
  };
}
