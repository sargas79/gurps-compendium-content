/**
 * What each line on a laid-out page is, and the book's text as a sequence of
 * headings, paragraphs, tables and sidebars.
 *
 * The Basic Set sets its levels of heading in ways the type makes plain:
 *
 *   chapter    "CHAPTER ELEVEN" and a title set larger than 40 points
 *   level 1    small capitals with a 36-point first letter: "DEFENDING"
 *   level 2    small capitals with a 20-point first letter: "RUNNING"
 *   level 3    14-point semibold italic: "Sprinting", "Cannon Fodder"
 *   level 4    11-point semibold: "Control Rolls", "Misfire", "Special Enhancements"
 *   run-in     a bold phrase opening a paragraph: "Dense (1.21-1.5 atm.):"
 *
 * A sidebar's title is set in the same heavy face as a level-2 heading but in
 * mixed case -- "Dual-Weapon Attacks" -- and its text sits off the column grid,
 * spanning two columns or inset from one. A table is set smaller than the text.
 *
 * Running text is read a column at a time, top to bottom, and a paragraph
 * carries on across a column or a page break until a line starts indented.
 * That single rule is what the first journal had no way to apply.
 */

/**
 * Prefixes that keep their hyphen when a line breaks after them, for a word
 * the book never prints unbroken either way. What the book prints elsewhere
 * decides first; see `lib/lexicon.mjs`.
 */
const HYPHENATED_PREFIXES = new Set([
  "self", "non", "all", "half", "semi", "well", "multi", "anti", "ultra", "super", "cross",
]);

let lexicon = null;

/** Mend broken words the way the book spells them elsewhere. */
export function useLexicon(words) {
  lexicon = words;
}

/**
 * Whether "stem-" at a line's end and "rest" on the next make one hyphenated
 * word rather than one word broken in two.
 */
function keepsHyphen(stem, rest) {
  const s = stem.toLowerCase();
  const r = (/^[a-z]+/i.exec(rest)?.[0] ?? "").toLowerCase();
  // A suffix on its own is never a word joined by a hyphen: "lung-" and "ing".
  if (/^(?:ing|ment|ments|tion|tions|ness|ed|ly)$/.test(r)) return false;
  if (!lexicon) return HYPHENATED_PREFIXES.has(s);
  const joined = lexicon.words.get(s + r) ?? 0;
  const hyphenated = lexicon.compounds.get(`${s}-${r}`) ?? 0;
  if (hyphenated > joined) return true;
  if (joined > 0) return false;
  if (HYPHENATED_PREFIXES.has(s)) return true;
  // Neither spelling appears anywhere else. Two halves that are each words the
  // book uses often make a compound -- "fifth-story", "drug-resistant" -- where
  // a broken word leaves a fragment: "pres-" and "sure".
  // The second half has to be a word in its own right, not a tail that turns up
  // a few times on its own by accident: "slam-ming", "out-sider".
  const seen = (w, times) => w.length >= 3 && (lexicon.words.get(w) ?? 0) >= times;
  return (s.length >= 5 ? seen(s, 1) : seen(s, 3)) && seen(r, 8);
}

/** Joins a line's text onto the text before it, mending a broken word. */
export function joinText(before, after) {
  const hyphen = /([A-Za-z]+)-$/.exec(before);
  // "one- or two-wheeled": a hyphen left hanging for the word after the "or".
  if (hyphen && /^(or|and|to)\b/.test(after)) return `${before} ${after}`;
  if (hyphen && /^[a-z]/.test(after)) {
    return keepsHyphen(hyphen[1], after) ? before + after : before.slice(0, -1) + after;
  }
  if (/[–—-]$/.test(before)) return before + after;
  return `${before} ${after}`;
}

/** The kind of a line of running text, by how it is set. */
function kindOf(line) {
  const text = line.text;
  if (line.black && (line.size >= 40 || /^CHAPTER\b/.test(text))) return "chapter";
  if (line.black && line.size >= 26) return "h1";
  if (line.black && line.size >= 15) {
    // Small capitals are all upper case; a sidebar's title is not.
    return /[a-z]/.test(text) ? "sidebar-title" : "h2";
  }
  if (line.size >= 12.5 && line.size < 15.5 && line.bold && text.length < 70) return "h3";
  if (line.size >= 10.8 && line.size < 12.5 && line.bold && !line.italic && !line.black && text.length < 60) return "h4";
  // A pull quote -- "Guns are commonly available by TL4 and ubiquitous at
  // TL5+." -- is set large in plain italic. It repeats the text for show, so
  // it is neither a heading nor part of the rule.
  if (line.size >= 12.5 && line.italic && !line.bold) return "quote";
  if (line.size < 9.4) return "table";
  return "text";
}

/**
 * Page furniture: the running title and page number at the foot, and anything
 * else set in the margins. None of it is the book's text.
 */
function isFurniture(line, page) {
  if (line.y > page.height - 40) return true;
  if (line.y < 45) return true;
  if (/^\d{1,3}$/.test(line.text) && line.size >= 12) return true;
  return false;
}

/** "CINEMATIC COMBAT RULES" as a reader would write it: "Cinematic Combat Rules". */
export function titleCase(text) {
  // An advantage's heading carries the book's icon digits: "Affliction 3 1".
  text = String(text).replace(/(\s+\d){1,3}\s*$/, "").trim();
  if (/[a-z]/.test(text)) return text;
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
  return text
    .toLowerCase()
    .split(/(\s+|-)/)
    // "(tl)" is capitalised at its first letter, not its bracket.
    .map((word, i) => (i > 0 && small.has(word) ? word : word.replace(/[a-z]/, (c) => c.toUpperCase())))
    .join("")
    .replace(/\b(Tl|Hp|Fp|Dr|Iq|Dx|Ht|St|Gm|Pc|Npc)s?\b/g, (m) => m.toUpperCase());
}

/**
 * Lines off the column grid, gathered into the sidebars and tables they make up.
 *
 * A region grows from any off-grid line of text, takes in its vertical
 * neighbours, and then claims the on-grid lines that fall inside it: a
 * sidebar's last line is often short enough to look like running text.
 */
function regionsOf(lines) {
  const off = lines.filter((l) => l.column < 0 && l.size < 10.6);
  const titles = lines.filter((l) => l.column < 0 && kindOf(l) === "sidebar-title");
  const seeds = [...titles, ...off].sort((a, b) => a.y - b.y);
  const regions = [];

  for (const line of seeds) {
    const region = regions.find(
      (r) =>
        line.x < r.x1 + 6 &&
        line.x1 > r.x0 - 6 &&
        line.y - r.y1 < Math.max(24, line.size * 2.6),
    );
    if (region) {
      region.lines.push(line);
      region.x0 = Math.min(region.x0, line.x);
      region.x1 = Math.max(region.x1, line.x1);
      region.y1 = Math.max(region.y1, line.y);
    } else {
      regions.push({ x0: line.x, x1: line.x1, y0: line.y, y1: line.y, lines: [line] });
    }
  }

  // A boxed section spaces its paragraphs further apart than its lines, so it
  // can grow as several regions. Two regions with the same margins, one just
  // under the other, are one box: Scatter's text arrived in three pieces.
  for (let merged = true; merged; ) {
    merged = false;
    for (const a of regions) {
      const b = regions.find(
        (r) =>
          r !== a &&
          Math.abs(r.x0 - a.x0) < 16 &&
          Math.abs(r.x1 - a.x1) < 16 &&
          r.y0 > a.y1 &&
          r.y0 - a.y1 < 48,
      );
      // Or side by side: a wide box set in two columns of its own grows as a
      // left region and a right one, starting level and a gutter apart. Mana's
      // levels ran down both, and only the left half was being read.
      const beside =
        b ??
        regions.find(
          (r) =>
            r !== a &&
            r.x0 > a.x1 &&
            r.x0 - a.x1 < 30 &&
            Math.abs(r.y0 - a.y0) < 24 &&
            Math.abs(r.x1 - r.x0 - (a.x1 - a.x0)) < 30,
        );
      if (!beside) continue;
      const other = beside;
      a.lines.push(...other.lines);
      a.x0 = Math.min(a.x0, other.x0);
      a.x1 = Math.max(a.x1, other.x1);
      a.y0 = Math.min(a.y0, other.y0);
      a.y1 = Math.max(a.y1, other.y1);
      regions.splice(regions.indexOf(other), 1);
      merged = true;
      break;
    }
  }

  // A region needs text. A title with nothing under it off the grid is a
  // heading set across columns -- "Attacking an Area", "Scatter" -- and belongs
  // to the running text; one or two stray lines are a caption.
  const real = regions.filter((r) => r.lines.filter((l) => kindOf(l) !== "sidebar-title").length >= 3);
  for (const region of real) {
    // A sidebar's title sits above its first line of text, so a heading just
    // over the region and within its width is the sidebar's, not the page's.
    // Left out, "Improvised Weapons" became a heading across two columns and
    // cut both of them in half.
    for (const line of lines) {
      if (region.lines.includes(line)) continue;
      const heading = ["h2", "h3", "h4", "sidebar-title"].includes(kindOf(line));
      // A boxed section's heading can sit to one side of its text: "Scatter"
      // is set over the second column while its text runs across the first two
      // in a wider measure. Overlapping the box is enough for a heading just
      // above it; anything else has to lie within it.
      const overlaps = line.x < region.x1 && line.x1 > region.x0;
      const above = heading && overlaps && line.y < region.y0 && region.y0 - line.y < 45;
      const within = line.x >= region.x0 - 12 && line.x1 <= region.x1 + 12;
      // Only a line that carries on the sidebar's own text: short, starting
      // where the sidebar's lines start, and just below one of them. Taking
      // everything inside the sidebar's bounding box swallowed a column of
      // running text beside the scatter diagram.
      const short = line.x1 - line.x < region.x1 - region.x0 - 20;
      const continues = region.lines.some(
        (r) => Math.abs(r.x - line.x) < 16 && line.y > r.y && line.y - r.y < 14,
      );
      // A subsection inside a sidebar -- "Strangulation and Smothering" under
      // "Subduing a Foe" -- is indented differently from the sidebar's lines,
      // but lies between them.
      const inside = heading && within && line.y > region.y0 && line.y < region.y1;
      if (above || inside || (within && short && continues)) {
        region.lines.push(line);
        if (above) region.y0 = line.y;
      }
    }
    region.lines.sort((a, b) => a.y - b.y || a.x - b.x);
    const title =
      region.lines.find((l) => kindOf(l) === "sidebar-title") ??
      (["h2", "h3"].includes(kindOf(region.lines[0])) ? region.lines[0] : null);
    // A title set over several lines -- "Critical Spell Failure" / "Table",
    // "VEHICLE" / "STATISTICS" -- is one title.
    region.titleLines = [];
    if (title) {
      region.titleLines.push(title);
      for (const l of region.lines) {
        const last = region.titleLines[region.titleLines.length - 1];
        if (l === title || l.y <= last.y || kindOf(l) !== kindOf(title)) continue;
        if (l.y - last.y < l.size * 1.6 && l.x < last.x1 && l.x1 > last.x) region.titleLines.push(l);
      }
    }
    // A table's cells sit too far apart to join into one line, so a row is
    // several lines on one baseline. A region most of whose rows have three or
    // more cells is a table; running text has one line to a row.
    const rows = new Map();
    for (const l of region.lines) {
      const key = Math.round(l.y / 3);
      rows.set(key, (rows.get(key) ?? 0) + Math.max(1, gapsIn(l) + 1));
    }
    const wide = [...rows.values()].filter((cells) => cells >= 3).length;
    region.kind = title ? "sidebar" : wide >= Math.max(2, rows.size / 2) ? "table" : "sidebar";
    region.title = title ? region.titleLines.map((l) => l.text).join(" ") : null;
  }
  return real;
}

/** How many wide gaps a line has: the mark of a table row. */
function gapsIn(line) {
  let gaps = 0;
  for (let i = 1; i < line.runs.length; i++) {
    if (line.runs[i].x - line.runs[i - 1].x1 > 8) gaps++;
  }
  return gaps;
}

/**
 * The book sets a dash with a space either side -- "speeds – anything" -- but
 * one at a line's end or start loses the space on its far side when lines are
 * joined: "speeds –anything", "Top Speed– use". A range is set with a hyphen,
 * so a dash against a letter is always one of these.
 */
function spaceDashes(text) {
  return text.replace(/(^|\s)–(?=[A-Za-z“"(])/g, "$1– ").replace(/([A-Za-z.,!?)”"])–(?=\s|$)/g, "$1 –");
}

/**
 * The bold phrase a paragraph opens with, if it opens with one.
 *
 * "Dense (1.21-1.5 atm.): The air is breathable" is a run-in heading. Only a
 * bold run at the very start counts; a bold word mid-sentence is emphasis.
 */
function runInOf(line) {
  const first = line.runs[0];
  if (!first || !first.bold || first.size > 10.6) return null;
  // Bold italic is emphasis in a sentence, unless it is the whole line: a label.
  if (first.italic && line.runs.some((r) => !r.bold)) return null;
  let text = "";
  for (const run of line.runs) {
    if (!run.bold) break;
    text += (text && !/\s$/.test(text) ? " " : "") + run.text.trim();
  }
  text = text.trim();
  return text.length >= 2 && text.length < 60 ? text : null;
}

/** A table's rows, each split into cells at its wide gaps. */
function tableOf(lines) {
  const rows = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - line.y) < 2.5) {
      last.lines.push(line);
    } else {
      rows.push({ y: line.y, lines: [line] });
    }
  }
  const split = rows.map((row) => {
    const cells = [];
    for (const line of row.lines.sort((a, b) => a.x - b.x)) {
      let cell = null;
      for (const run of line.runs) {
        if (!cell || run.x - cell.x1 > 8) {
          cell = { text: run.text.trim(), x: run.x, x1: run.x1 };
          cells.push(cell);
        } else {
          cell.text += (/\s$/.test(cell.text) ? "" : " ") + run.text.trim();
          cell.x1 = run.x1;
        }
      }
    }
    return { y: row.y, cells: cells.filter((c) => c.text.trim()) };
  });
  // A column heading set over two lines -- "Modifier to" over "HT Roll" -- is
  // one heading, joined to the cell it stands over rather than to the first.
  if (split.length > 1 && split[0].cells.length < split[1].cells.length && split[1].y - split[0].y < 13) {
    for (const top of split[0].cells) {
      const under = split[1].cells
        .map((c) => ({ c, overlap: Math.min(c.x1, top.x1) - Math.max(c.x, top.x) }))
        .sort((a, b) => b.overlap - a.overlap)[0];
      if (under && under.overlap > 0) under.c.text = `${top.text} ${under.c.text}`;
    }
    split.shift();
  }
  // A cell's text wrapped onto a second line -- "Commercially available for
  // mining," / "demolition." -- arrives as a row of one or two cells under
  // fuller rows. Each piece belongs to the cell above it.
  const minFirst = Math.min(...split.flatMap((r) => r.cells.map((c) => c.x)));
  for (let i = split.length - 1; i > 0; i--) {
    const row = split[i];
    const above = split[i - 1];
    if (row.cells.length > 2 || above.cells.length < 3 || row.y - above.y > 13) continue;
    if (row.cells.some((c) => Math.abs(c.x - minFirst) < 4)) continue;
    // A figure under the first column's figure is a row of its own: "6 | $1,600".
    const first = above.cells[0];
    if (row.cells.some((c) => Math.min(first.x1, c.x1) - Math.max(first.x, c.x) > 0)) continue;
    const targets = row.cells.map((c) => above.cells.find((a) => Math.min(a.x1, c.x1) - Math.max(a.x, c.x) > 0));
    if (targets.some((t) => !t)) continue;
    row.cells.forEach((c, k) => (targets[k].text = joinText(targets[k].text, c.text)));
    split.splice(i, 1);
  }
  // And the other way about: a name wrapped in its own column -- "Diesel Fuel/"
  // over "Nitrate Fertilizer" -- leaves the row's first line short and its
  // second line without a first cell.
  for (let i = split.length - 2; i >= 0; i--) {
    const row = split[i];
    const below = split[i + 1];
    // Only a short row over a fuller one: "Shots | Bonus to Hit" over "2-4 | +0"
    // is a heading over a row, not one row.
    if (row.cells.length > 2 || below.cells.length < 3 || row.cells.length >= below.cells.length || below.y - row.y > 13) continue;
    if (!row.cells.some((c) => Math.abs(c.x - minFirst) < 4)) continue;
    if (below.cells.some((c) => Math.abs(c.x - minFirst) < 4) || below.cells.length < 2) continue;
    for (const c of row.cells) {
      const under = below.cells.find((b) => Math.min(b.x1, c.x1) - Math.max(b.x, c.x) > 0);
      if (under) under.text = joinText(c.text, under.text);
      else below.cells.push(c);
    }
    below.cells.sort((a, b) => a.x - b.x);
    split.splice(i, 1);
  }
  return split.map((row) => row.cells.map((c) => c.text.replace(/\s+/g, " ").trim()).filter(Boolean));
}

/**
 * Paragraphs and headings from lines already in reading order.
 *
 * A new paragraph starts at an indented line, after a heading, or across a
 * gap too tall to be line spacing. Otherwise a line continues the paragraph
 * before it -- including the first line of a new column or page.
 */
function blocksOf(lines, { page, column } = {}) {
  const blocks = [];
  let current = null;
  let previous = null;

  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const [at, line] of lines.entries()) {
    const kind = kindOf(line);
    if (["chapter", "h1", "h2", "h3", "h4", "sidebar-title"].includes(kind)) {
      // A heading set over two lines arrives as two lines of the same kind.
      const last = blocks[blocks.length - 1];
      if (!current && last && last.kind === kind && previous && Math.abs(line.y - previous.y) < line.size * 1.6) {
        last.text = `${last.text} ${line.text}`;
      } else {
        close();
        blocks.push({ kind: kind === "sidebar-title" ? "h2" : kind, text: line.text, page: line.page, y: line.y, column: line.column });
      }
      previous = line;
      continue;
    }

    const indented = line.indent !== null && line.indent > 6;
    const sameColumn = previous && previous.page === line.page && previous.column === line.column;
    const gap = sameColumn ? line.y - previous.y : 0;
    // A result number set in bold in the middle of a sentence -- "as per" /
    // "10, and acquire a new quirk" -- is a cross-reference, not a label.
    const bold = runInOf(line);
    const runIn = bold && current && !/[.!?:;"”’)\]]$/.test(current.text) && /^[\d,.\s]+$/.test(bold) ? null : bold;
    const label = current && current.runIn && current.text === current.runIn;
    const ended = /[.!?:;"”’)\]]$/.test(current?.text ?? "");
    // A line opening in lower case, or with the ellipsis the book opens a
    // sentence's tail with, carries on the one before it however the line is
    // set: "knocked off balance:" / "he must Do Nothing next turn".
    const tail = /^[a-z]/.test(line.text) || /^\. \. \./.test(line.text);
    // A list item set with a hanging indent -- "Skill 20-24 – Ritual: None!"
    // with its second line set in from the first -- carries on down every line
    // indented further than its first, whatever the line before ended with:
    // "Time:" / "Doubled. Cost: As listed." is one item.
    // A new paragraph's first line is indented too, but the line after it goes
    // back to the margin without a label of its own, where a hanging item's
    // lines stay in: "Fighters that cannot fall down" is not part of item 18.
    const below = lines.slice(at + 1).find((l) => l.page === line.page && l.column === line.column);
    const reopens = below && below.indent !== null && below.indent < line.indent - 4 && !runInOf(below);
    const hanging =
      current && current.runIn && !runIn && sameColumn && line.indent !== null && current.indent !== null &&
      line.indent > current.indent + 4 && !reopens;
    // "Riding-" / "2." and "=" / "20." are a number carrying on a sentence,
    // not a numbered list starting.
    const numbered = /^(\d+\.|[•�*])\s/.test(line.text) && !(/^\d/.test(line.text) && current && !ended);
    const carriesOn =
      current &&
      !runIn &&
      !numbered &&
      // A label on a line of its own -- "Misfire" -- opens the paragraph under it.
      (label || tail || hanging ||
        // Any line after a sentence that has not ended carries it on: "ignores
        // the target's" / "DR." is one sentence however the second line begins.
        !ended);
    const startsNew =
      !current ||
      (indented && !carriesOn) ||
      (runIn && (!previous || /[.:!?]$/.test(current?.text ?? ""))) ||
      // A tall gap is a paragraph break only if the sentence before it ended:
      // a sidebar set into a column leaves a gap in the middle of a sentence,
      // "...by the neck or desired limb using" / "both hands; see Grappling".
      (gap > line.size * 1.9 && !tail && !hanging && (/[.!?:"”)]$/.test(current?.text ?? "") || /^[A-Z0-9•"“(]/.test(line.text))) ||
      numbered;

    if (startsNew) {
      close();
      current = {
        kind: "p",
        text: line.text,
        runIn,
        page: line.page,
        y: line.y,
        column: line.column,
        indent: line.indent,
        // Nothing but being first on the page started it: it is the rest of a
        // paragraph from the page before, and the flow joins the two.
        continues: !previous && !indented && !runIn && !numbered,
      };
    } else {
      current.text = joinText(current.text, line.text);
    }
    previous = line;
  }
  close();

  for (const block of blocks) {
    block.text = spaceDashes(block.text.replace(/\s+/g, " ").replace(/�/g, "•").trim());
    // A chapter's opening lines are set large and italic, and several lines of
    // them joined read as one very long "heading". A heading is a name, not a
    // sentence.
    // "Spoken vs. Written Language" is still a name: a sentence ends on a word.
    if (["h3", "h4"].includes(block.kind) && (block.text.length > 90 || /[a-z]{3}[.!?] [A-Z]/.test(block.text))) {
      block.kind = "p";
      block.runIn = null;
    }
  }
  return blocks;
}

/**
 * Tables set across the columns, whose cells each fit inside a column.
 *
 * The armour and weapon tables span the page, but each cell is short enough
 * to sit within one column's width, so every cell looked like a line of
 * running text and a table came out as dozens of one-word paragraphs. Running
 * text never puts four lines on one baseline, nor three of which two are short
 * -- a row of a table does both.
 */
function spanningTables(lines, edges) {
  const body = lines.filter((l) => l.size < 10.6 && !["chapter", "h1", "h2", "h3", "h4", "sidebar-title"].includes(kindOf(l)));
  // Running text starts at a column's edge or a paragraph's indent; a table's
  // cells start wherever the table puts them. Three paragraph-ends side by side
  // on one baseline are short, but every one of them starts at an edge -- and
  // counting them as a row lost "is called 'opportunity fire.'" into a table.
  // Running text starts on the edge to within a point or two, or on the
  // paragraph indent twelve points in; a cell ten points in is a cell -- the
  // Description column of the explosives table starts there.
  const cell = (l) => !edges.some((e) => Math.abs(l.x - e) < 2.5 || Math.abs(l.x - e - 12) < 1.5);
  // A line that starts on a column's edge and runs most of the way across it
  // is running text, even when a table's row stands level with it: Jobs' pay
  // table took the column of text beside it for its first column, and
  // Radiation's took the justified words of the paragraph next to it for cells.
  // A paragraph's short last line counts too, by the full line just above it.
  const full = (l) => !cell(l) && l.x1 - l.x > 100;
  const prose = (l) =>
    full(l) ||
    (!cell(l) && body.some((p) => full(p) && p.column === l.column && l.y - p.y > 0 && l.y - p.y < 14 && Math.abs(p.x - l.x) < 16));
  const rows = [];
  for (const line of body.filter((l) => !prose(l)).sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r.y - line.y) < 2.5);
    if (row) row.lines.push(line);
    else rows.push({ y: line.y, lines: [line] });
  }
  const tabular = rows.filter((r) => {
    const cells = r.lines.filter(cell).length;
    const sameColumn = r.lines.some((a) => r.lines.some((b) => a !== b && a.column >= 0 && a.column === b.column));
    // A row across the page has several cells; a row of a small table inside
    // a column has two pieces in that one column, which running text never has.
    return (r.lines.length >= 3 && cells >= 2) || (sameColumn && cells >= 1 && r.lines.every((l) => l.x1 - l.x < 120));
  });

  const tables = [];
  for (const row of tabular.sort((a, b) => a.y - b.y)) {
    const last = tables[tables.length - 1];
    if (last && row.y - last.y1 < 26) {
      last.rows.push(row);
      last.y1 = row.y;
    } else {
      tables.push({ y0: row.y, y1: row.y, rows: [row] });
    }
  }

  return tables
    .filter((t) => t.rows.length >= 3)
    .map((t) => {
      const x0 = Math.min(...t.rows.flatMap((r) => r.lines.map((l) => l.x)));
      const x1 = Math.max(...t.rows.flatMap((r) => r.lines.map((l) => l.x1)));
      // The rows between tabular ones -- a row with a single cell, a category
      // label -- belong to the table too, but only cells: a line of running
      // text starts on a column edge, and one that fell inside the table's
      // bounds was being taken with it.
      const inRows = new Set(t.rows.flatMap((r) => r.lines));
      const members = body.filter(
        (l) =>
          (inRows.has(l) && !prose(l)) ||
          (cell(l) && l.y >= t.y0 - 1 && l.y <= t.y1 + 1 && l.x >= x0 - 4 && l.x1 <= x1 + 4 && l.x1 - l.x < 150),
      );
      // A row whose cells stand close enough to join into one line, and a
      // heading over the first column, are single lines -- but they start
      // exactly where the table's first column starts, a few points off any
      // column edge, where no line of running text starts. Radiation's last
      // two rows, "800-4,000 rads -5 C/D/E/E", were left out.
      const offEdge = (l) => edges.every((e) => Math.abs(l.x - e) > 1.5 && Math.abs(l.x - e - 12) > 1.5);
      let y0 = t.y0;
      let y1 = t.y1;
      // So does a heading over a column the table sets flush right, which
      // ends where that column's cells end: "Modifier to" over "HT Roll".
      const aligned = (l) =>
        (Math.abs(l.x - x0) <= 1.5 && offEdge(l)) ||
        (cell(l) && l.x1 - l.x < 120 && members.some((m) => Math.abs(m.x - x0) > 1.5 && Math.abs(m.x1 - l.x1) < 1.5));
      for (let grown = true; grown; ) {
        grown = false;
        for (const l of body) {
          if (members.includes(l)) continue;
          // A cell inside the table's bounds, once the table has grown over it.
          const inside = cell(l) && l.y >= y0 - 1 && l.y <= y1 + 1 && l.x >= x0 - 4 && l.x1 <= x1 + 4 && l.x1 - l.x < 150;
          if (inside || (aligned(l) && ((l.y >= y0 && l.y <= y1) || (l.y > y1 && l.y - y1 < 13) || (l.y < y0 && y0 - l.y < 13)))) {
            members.push(l);
            y0 = Math.min(y0, l.y);
            y1 = Math.max(y1, l.y);
            grown = true;
          }
        }
      }
      return { y0, y1, x0, x1, lines: members };
    })
    // Grown, two pieces of one table can meet: the explosives table came out
    // as two, split where a two-line row left too few cells to count.
    .reduce((merged, t) => {
      const last = merged[merged.length - 1];
      if (last && t.y0 - last.y1 < 26 && t.x0 < last.x1 && t.x1 > last.x0) {
        last.lines.push(...t.lines.filter((l) => !last.lines.includes(l)));
        last.y1 = Math.max(last.y1, t.y1);
        last.x0 = Math.min(last.x0, t.x0);
        last.x1 = Math.max(last.x1, t.x1);
        // The line between the two pieces is the table's too.
        for (const l of body) {
          if (last.lines.includes(l) || !cell(l) || l.y < last.y0 - 1 || l.y > last.y1 + 1) continue;
          if (l.x >= last.x0 - 4 && l.x1 <= last.x1 + 4 && l.x1 - l.x < 150) last.lines.push(l);
        }
      } else {
        merged.push(t);
      }
      return merged;
    }, []);
}

/**
 * A page's structure: its running text in reading order, and its sidebars and
 * tables kept apart from it.
 */
export function structureOf(page) {
  // A quotation set in the margin -- "I'm 37. I'm not old." / "– Dennis," /
  // "Monty Python and the Holy Grail" -- is plain italic with its source in
  // bold italic underneath. The source is the size of a heading, so it is
  // recognised by what it sits under.
  const quotes = page.lines.filter((l) => kindOf(l) === "quote");
  const attribution = (l) =>
    kindOf(l) === "h3" &&
    !/Semi/i.test(l.font ?? "") &&
    quotes.some((q) => l.y > q.y && l.y - q.y < 36 && Math.abs(l.x - q.x) < 60);
  const lines = page.lines.filter(
    (l) => !isFurniture(l, page) && l.text && kindOf(l) !== "quote" && !attribution(l),
  );
  const wideTables = spanningTables(lines, page.columns.edges);
  const tableLines = new Set(wideTables.flatMap((t) => t.lines));
  const regions = regionsOf(lines.filter((l) => !tableLines.has(l)));
  const claimed = new Set([...regions.flatMap((r) => r.lines), ...tableLines]);

  const running = lines.filter((l) => !claimed.has(l) && l.column >= 0);

  // A heading set across columns sits off the grid but belongs to the flow.
  // It divides every column it spans into what comes before it and what comes
  // after: the book reads each of those columns down to the heading, then the
  // heading, then each of them again below it. Reading a column top to bottom
  // regardless put "Damage and Injury" in the middle of Retreat, whose last
  // sentence carries on at the top of the next column above that heading.
  const edges = page.columns.edges;
  const spanning = lines
    .filter((l) => !claimed.has(l) && l.column < 0 && ["chapter", "h1", "h2", "h3", "sidebar-title"].includes(kindOf(l)))
    .map((heading) => {
      const covers = edges
        .map((edge, i) => (heading.x < edge + page.columns.width - 4 && heading.x1 > edge + 4 ? i : -1))
        .filter((i) => i >= 0);
      return { heading, covers: covers.length ? covers : [0] };
    });

  // A large heading can sit entirely inside one column's width and still head
  // several: "ARMOR", centred over the page, fits within the middle column, and
  // so does "POISON" halfway down one. What gives it away is the columns beside
  // it: running text leaves a line every eleven points, and a column the
  // heading spans has none level with it. The heading covers its own column and
  // every neighbour, left and right, that is quiet where it stands.
  const quiet = (column, heading) =>
    !running.some((l) => l !== heading && l.column === column && l.y > heading.y - 14 && l.y < heading.y + 12);
  const reach = (heading, from) => {
    const covers = [from];
    for (let i = from - 1; i >= 0 && quiet(i, heading); i--) covers.unshift(i);
    for (let i = from + 1; i < edges.length && quiet(i, heading); i++) covers.push(i);
    return covers;
  };
  for (const heading of running.filter((l) => ["chapter", "h1"].includes(kindOf(l)))) {
    const covers = reach(heading, heading.column);
    if (covers.length >= 2) {
      running.splice(running.indexOf(heading), 1);
      spanning.push({ heading, covers });
    }
  }
  // The same holds for one set a little off the grid: "VISIBILITY" stands over
  // the middle column at the head of a page whose first column opens with the
  // section's introduction.
  for (const s of spanning) {
    if (s.covers.length >= 2 || !["chapter", "h1"].includes(kindOf(s.heading))) continue;
    const covers = reach(s.heading, s.covers[0]);
    if (covers.length >= 2) s.covers = covers;
  }

  // Only a heading over two or more columns divides the page into bands. One
  // that heads a single column -- "VISIBILITY", set a little wider than the
  // column under it -- is read in that column's own flow; counting it as a band
  // put the column beside it out of step, and High-Speed Movement came out
  // interleaved with the end of Visibility.
  //
  // A band heading comes after everything in the columns it covers above it,
  // and after the whole of any column to its left that it does not cover --
  // that column flows into the first covered one. A column to its right that it
  // does not cover is read after the text below the heading.
  const multi = spanning.filter((s) => s.covers.length >= 2);
  const single = spanning.filter((s) => s.covers.length < 2);
  const bandOf = (column, y) =>
    multi.filter((s) => {
      if (s.covers.includes(column)) return s.heading.y < y - 1;
      return column > Math.max(...s.covers);
    }).length;
  for (const line of running) line.band = bandOf(line.column, line.y);
  for (const { heading, covers } of multi) {
    heading.column = covers[0];
    heading.indent = 0;
    heading.band = bandOf(covers[0], heading.y) + 1;
    heading.leads = true;
    running.push(heading);
  }
  for (const { heading, covers } of single) {
    heading.column = covers[0];
    heading.indent = 0;
    heading.band = bandOf(covers[0], heading.y);
    running.push(heading);
  }
  running.sort(
    (a, b) =>
      a.band - b.band ||
      // Within a band the heading that opens it comes first.
      (b.leads === true) - (a.leads === true) ||
      a.column - b.column ||
      a.y - b.y,
  );

  const asides = regions.map((region) => {
    const top = region.lines[0];
    if (region.kind === "table") {
      return { kind: "table", page: page.number, y: region.y0, x: region.x0, x1: region.x1, rows: tableOf(region.lines) };
    }
    let inner = region.lines.filter((l) => !region.titleLines.includes(l));
    // A wide sidebar is set in two columns of its own, and read like the page:
    // down the left, then down the right. Read by line it interleaves them --
    // "Repeated minute. If you do not bleed for three consecutive min-".
    const middle = (region.x0 + region.x1) / 2;
    const narrow = inner.filter((l) => l.x1 - l.x < (region.x1 - region.x0) * 0.6);
    const twoColumns =
      narrow.length > inner.length * 0.6 &&
      narrow.some((l) => l.x1 < middle + 8) &&
      narrow.some((l) => l.x > middle - 8);
    if (twoColumns) {
      const left = inner.filter((l) => l.x < middle - 8).sort((a, b) => a.y - b.y);
      const right = inner.filter((l) => l.x >= middle - 8).sort((a, b) => a.y - b.y);
      for (const l of left) l.innerColumn = 0;
      for (const l of right) l.innerColumn = 1;
      inner = [...left, ...right];
    }
    // Inside a sidebar the paragraph indent is measured from its own margin.
    for (const l of inner) {
      const same = inner.filter((o) => (o.innerColumn ?? 0) === (l.innerColumn ?? 0));
      l.indent = l.x - Math.min(...same.map((o) => o.x));
      l.column = l.innerColumn ?? 0;
    }
    return {
      kind: "sidebar",
      title: region.title,
      page: page.number,
      y: region.y0,
      x: region.x0,
      blocks: blocksOf(inner),
      top,
    };
  });

  for (const table of wideTables) {
    asides.push({ kind: "table", page: page.number, y: table.y0, x: table.x0, x1: table.x1, rows: tableOf(table.lines) });
  }

  return { page: page.number, columns: page.columns, blocks: blocksOf(running), asides };
}
