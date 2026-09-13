/**
 * A book page as the book laid it out: lines, columns, headings and sidebars.
 *
 * The first rules journal was built from pdftotext's reading order, a stream
 * of lines with the layout thrown away, and nearly every fault a reader found
 * in it traces back to that:
 *
 *   - A paragraph's first line is indented, so it starts a dozen points to the
 *     right of the rest. Sorting lines into columns by position put those first
 *     lines in the wrong column, and rules came back spliced with their
 *     neighbours: Melee Etiquette ended with Cannon Fodder's "of HP!".
 *   - A heading could not be told from a sentence, so a rule stopped at its
 *     first subsection. Collisions came back as its introduction alone.
 *   - A sidebar was read as though it were running text, and ran into whatever
 *     rule sat beside it.
 *
 * pdf.js reports every run of text with its position, its size and the font it
 * is set in, and that is enough to recover the structure instead of guessing
 * at it. This module does the geometry; `book-structure.mjs` decides what each
 * line is.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** An open book, so a caller reading many pages opens the file once. */
export async function openBook(path) {
  const pdf = await getDocument({ url: path, verbosity: 0, isEvalSupported: false }).promise;
  return { pdf, pages: pdf.numPages };
}

/** What a font's name says about how it is set. */
function styleOf(name) {
  const bare = String(name ?? "").replace(/^[A-Z]{6}\+/, "");
  return {
    font: bare,
    black: /Black|Heavy/i.test(bare),
    bold: /Bold|Black|Heavy|Semi/i.test(bare),
    italic: /Italic|Oblique/i.test(bare),
  };
}

/**
 * Every run of text on a page, with where it sits and how it is set.
 *
 * `y` is measured down from the top of the page, which is how a reader thinks
 * of it, rather than up from the bottom as PDF does.
 */
async function runsOf(page, { fonts = true } = {}) {
  const view = page.getViewport({ scale: 1 });
  // Loading the operator list is what makes each font's real name available.
  // It is most of the time a page takes, so a caller wanting words alone skips it.
  if (fonts) await page.getOperatorList();
  const content = await page.getTextContent();
  const names = new Map();
  const runs = [];

  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const [, , c, d, x, y] = item.transform;
    if (!names.has(item.fontName)) {
      let name = item.fontName;
      try {
        if (fonts) name = page.commonObjs.get(item.fontName).name;
      } catch {
        // A font pdf.js could not resolve keeps its internal id: set as body.
      }
      names.set(item.fontName, name);
    }
    const size = Math.round(Math.hypot(c, d) * 10) / 10;
    runs.push({
      // The book's symbol font puts its multiplication sign where Latin-1 has
      // the yen sign: "(HP ¥ velocity)/100" is "(HP × velocity)/100".
      text: item.str.replace(/¥/g, "×"),
      x,
      x1: x + item.width,
      y: view.height - y,
      size,
      ...styleOf(names.get(item.fontName)),
    });
  }
  return { runs, width: view.width, height: view.height };
}

/**
 * Runs gathered into lines.
 *
 * Two runs share a line when they sit on the same baseline and the second
 * starts close after the first ends. The gap has to stay well under a column
 * gutter, or a line in one column swallows the line beside it in the next.
 *
 * Justified text is set with its spaces as positioning rather than as space
 * characters, so a space is put back wherever two runs stand apart -- without
 * that, "is +1. Just a loincloth" arrives as "is+1.Justaloincloth".
 */
function linesOf(runs) {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];

  for (const run of sorted) {
    const line = lines.find(
      (l) =>
        Math.abs(l.y - run.y) < Math.max(2, run.size * 0.3) &&
        run.x >= l.x1 - 2 &&
        // Justified text spreads its words up to ten points apart; a column
        // gutter is eighteen. Twelve joins the one and never the other.
        run.x - l.x1 < 12,
    );
    if (!line) {
      lines.push({ x: run.x, x1: run.x1, y: run.y, runs: [run] });
      continue;
    }
    line.runs.push(run);
    line.x1 = Math.max(line.x1, run.x1);
  }

  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    let text = "";
    let end = null;
    for (const run of line.runs) {
      const gap = end === null ? 0 : run.x - end;
      if (text && gap > run.size * 0.1 && !/\s$/.test(text) && !/^\s/.test(run.text)) text += " ";
      text += run.text;
      end = run.x1;
    }
    line.text = text.replace(/\s+/g, " ").trim();
    // The line is set in whatever most of its characters are set in.
    const weight = (pick) =>
      line.runs.filter(pick).reduce((sum, r) => sum + r.text.length, 0) /
      Math.max(1, line.runs.reduce((sum, r) => sum + r.text.length, 0));
    line.size = Math.max(...line.runs.map((r) => r.size));
    line.bodySize = mostCommon(line.runs.map((r) => r.size));
    line.black = weight((r) => r.black) > 0.5;
    line.bold = weight((r) => r.bold) > 0.5;
    line.italic = weight((r) => r.italic) > 0.5;
    line.font = mostCommon(line.runs.map((r) => r.font));
  }
  return lines;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Where this page's columns start.
 *
 * Found from the page rather than assumed, because left and right pages have
 * different margins. Body lines start at a column's edge or a paragraph indent
 * to the right of it, so the edges are the left-most of the frequent starts.
 */
/**
 * The Basic Set's column grid, which is the same on every page of a side.
 *
 * Three columns 146 points wide on a 164-point pitch, starting 78 points in on
 * a right-hand (odd) page and 60 on a left-hand one. Measuring the grid from a
 * page's own lines works on a page of running text, but a page that is mostly
 * table has too few full-width lines to find more than one edge -- and then the
 * text beside the table falls off the grid and is read as a sidebar.
 */
const GRID = { width: 146, pitch: 164, odd: 78, even: 60 };

function columnsOf(lines, width, number) {
  const measured = measuredColumns(lines, width);
  const base = number % 2 === 1 ? GRID.odd : GRID.even;
  // Trust the measurement when it found the whole grid; otherwise the grid.
  if (measured.edges.length === 3 && Math.abs(measured.width - GRID.width) <= 3) return measured;
  // A chapter's opening page sets its text in one wider column beside the art:
  // "VEHICLES" runs 163 points wide down the right of page 462. Read against
  // the grid, all of it was off the grid, and the section became a sidebar.
  if (measured.edges.length === 1 && Math.abs(measured.width - GRID.width) > 6 && measured.lines >= 10) return measured;
  return { edges: [base, base + GRID.pitch, base + 2 * GRID.pitch], width: GRID.width, lines: measured.lines };
}

function measuredColumns(lines, width) {
  const body = lines.filter((l) => !l.black && l.size < 11 && l.x1 - l.x > 90);

  // Most body lines fill their column exactly, because the text is justified,
  // so the commonest line width is the column's width -- and a line of exactly
  // that width starts exactly on a column edge. A sidebar's lines are a
  // different width, so its margin is never mistaken for a column.
  const widths = new Map();
  for (const l of body) {
    const w = Math.round(l.x1 - l.x);
    widths.set(w, (widths.get(w) ?? 0) + 1);
  }
  const columnWidth = Number([...widths].sort((a, b) => b[1] - a[1])[0]?.[0] ?? width / 3);

  const starts = new Map();
  for (const l of body) {
    if (Math.abs(l.x1 - l.x - columnWidth) > 3) continue;
    const key = Math.round(l.x);
    starts.set(key, (starts.get(key) ?? 0) + 1);
  }
  const edges = [];
  let onEdges = 0;
  for (const [x, n] of [...starts].filter(([, n]) => n >= 3).sort((a, b) => a[0] - b[0])) {
    onEdges += n;
    if (edges.some((e) => Math.abs(x - e) < 6)) continue;
    edges.push(x);
  }
  return { edges, width: columnWidth, lines: onEdges };
}

/** Which column a line belongs to, or -1 when it sits off the grid. */
function columnOf(line, columns) {
  const { edges, width } = columns;
  for (let i = edges.length - 1; i >= 0; i--) {
    const offset = line.x - edges[i];
    // A column edge, or anywhere inside the column: a paragraph's indent, a
    // centred heading, the second half of a line split by a wide gap.
    if (offset > -4 && offset < width) {
      // A line reaching past its column spans more than one: a sidebar, a
      // table or a heading across the page, not running text.
      if (line.x1 > edges[i] + width + 6) return -1;
      return i;
    }
  }
  return -1;
}

/**
 * Puts back together a justified line whose words stood too far apart to join.
 *
 * A line of few long words, justified across a column, spreads them twenty
 * points or more apart -- "Diplomacy,  Fast-Talk,  Intimidation,  Savoir-Faire,"
 * -- and came apart into four lines. Pieces on one baseline in one column that
 * together run from the column's edge to its far side are one line of running
 * text. A table's cells in a column stand much further apart, so they stay
 * separate.
 */
function rejoinLoose(lines, columns) {
  const out = [];
  const used = new Set();
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const line of sorted) {
    if (used.has(line)) continue;
    used.add(line);
    if (line.column < 0) {
      out.push(line);
      continue;
    }
    const edge = columns.edges[line.column];
    const pieces = [line];
    for (const other of sorted) {
      if (used.has(other) || other.column !== line.column || Math.abs(other.y - line.y) > 1.5) continue;
      const last = pieces[pieces.length - 1];
      if (other.x > last.x1 && other.x - last.x1 < 30) {
        pieces.push(other);
        used.add(other);
      }
    }
    const reachesRight = pieces[pieces.length - 1].x1 >= edge + columns.width - 3;
    if (pieces.length > 1 && reachesRight && line.x - edge < 20) {
      const runs = pieces.flatMap((p) => p.runs);
      out.push({
        ...line,
        x1: pieces[pieces.length - 1].x1,
        runs,
        text: pieces.map((p) => p.text).join(" "),
      });
    } else {
      out.push(line);
      for (const piece of pieces.slice(1)) out.push(piece);
    }
  }
  return out;
}

/**
 * One page, laid out: every line with its column, its style, and whether it is
 * part of the running text or sits off the column grid.
 */
export async function readPage(book, number) {
  const page = await book.pdf.getPage(number);
  const { runs, width, height } = await runsOf(page);
  const lines = linesOf(runs);
  const columns = columnsOf(lines, width, number);
  for (const line of lines) {
    line.column = columnOf(line, columns);
    line.page = number;
    line.indent = line.column >= 0 ? line.x - columns.edges[line.column] : null;
  }
  const rejoined = rejoinLoose(lines, columns);
  for (const line of rejoined) {
    line.column = columnOf(line, columns);
    line.indent = line.column >= 0 ? line.x - columns.edges[line.column] : null;
  }
  page.cleanup();
  return { number, width, height, lines: rejoined, columns };
}

/**
 * A page's lines of text alone, without fonts or columns: enough to learn how
 * the book spells its words, and quick enough to do for every page.
 */
export async function textLines(book, number) {
  const page = await book.pdf.getPage(number);
  const { runs } = await runsOf(page, { fonts: false });
  const lines = linesOf(runs).map((l) => l.text);
  page.cleanup();
  return lines;
}
