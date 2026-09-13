# GURPS content module for GWorld — revised plan

Revision of `plan.md` after reading the GWorldVTT system (v0.14.0, branch `main`, plus
the four open magic PRs #88–#92). **Approved 2026-09-12** with the decisions in §10.
Nothing is implemented yet.

The short version: the original plan describes a module that would rebuild, beside the
system, most of what the system already has. The system already ships 1,764 compendium
entries built from the GCA data file, already has a picker and a "which compendia"
setting that accepts module packs, already applies templates automatically, and already
has a field on every item for the book's description. What the system cannot hold, because
its repository is public, is the books' prose. So the private module should carry exactly
that, and nothing the system already carries.

Other books work the same way with one addition: the system is the Basic Set, and every
other book is a pack set inside the private module, statistics generated from that book's
GCA data file with the system's own parsers, plus its prose. §4a covers this.

---

## 1. What the review found

| Original plan says | The system actually is | Consequence |
|---|---|---|
| System ID `REPLACE_WITH_CUSTOM_SYSTEM_ID` | `gworld` | Fill in. |
| Foundry 12 minimum, 13 verified | Foundry **14** only (min 14, verified 14.367) | Manifest compatibility must say 14. |
| Packs are `packs/*.db` files | Foundry 14 packs are **LevelDB directories**, compiled with `@foundryvtt/foundryvtt-cli` from JSON source | Same build tool the system uses; no `.db`. |
| Ten packs to create from scratch: skills, advantages, disadvantages, perks, quirks, spells, techniques, templates, equipment traits, rules reference | The system **already ships** `skills` (skills + techniques), `advantages` (incl. perks), `disadvantages` (incl. quirks), `equipment`, `templates`, and `spells` (PR #88, pending merge) | Do not duplicate. The module adds prose to these, not copies of them. |
| Item types: separate perk/quirk items, an "equipment trait" item | One `trait` type with `system.category` ∈ advantage/disadvantage/perk/quirk; `skill`, `technique`, `equipment`, `armor`, `shield`, `language`, `template`, `spell`. **No equipment-modifier type exists.** | Perks/quirks need no new pack. Equipment traits need a system feature first; defer. |
| Templates as JournalEntry, automation in phases A–C | Templates are **Items** with choice groups and automatic application; `statedCost` is verified at build time | Journal templates would be a regression. Overlay prose onto the template items instead. |
| Canonical IDs like `skill-accounting`, name-independent | `_id` is 16 hex chars = sha1(`kind:name`), **kept for a name once published**, because characters store the UUID; cross-references (template entries, technique prerequisites, skill defaults) are **by name** | Keep the system's ids; join the module's prose to them. No second id scheme. |
| Field names `controllingAttribute`, `difficulty: "Average"`, `college`, `spellClass`, `cost.cast` | `attribute`, `difficulty: "A"`, `colleges[]`, `classes[]`, `energy.cast/castMax/maintain` | Irrelevant under the overlay approach: the module never writes statistics. |
| An adapter class, services, a custom browser, item templates, migrations, `src/` | The system's `CompendiumPicker` reads any Item pack whose documents are `gworld` types; `Configure Settings → Compendium sources` lists module packs under a "module" group and lets the GM choose | **No JavaScript needed in the module for v1.** It is a data module. |
| Source of truth: normalized JSON in the module | Source of truth for **statistics** is the system's `packs-src/*.json`, generated from the GCA `.gdf` by `tools/parse-gdf.mjs` | The module's source of truth is **prose only**. |
| Prose from OCR / screenshots / copied text | Book text is extractable with `pdftotext -layout` from the Basic Set PDFs (the workflow already used to check rules). The GCA file has `description()` on only ~959 of its records and none on most traits, so it is not a prose source. | Prose pipeline = pdftotext + hand review. |
| Repository private, system repo assumed private too | The content repo is private; **GWorldVTT is public** | This is the whole reason for the split. Prose must never cross into GWorldVTT. |
| Where descriptions show | Item sheet has a ProseMirror editor for `system.description` and a `system.reference` field; the **traits tab prints `system.description` inline** beside each trait | Long prose on the traits tab will wreck that layout. Needs a system-side decision (see §5). |

---

## 2. How to separate the work between the two repositories

### Recommended: the module is a prose overlay on the system's compendia

The module ships packs with the **same names and the same `_id`s** as the system's
packs, where each document is the system's document plus the book's description. The
module's git repository holds only the prose and a build that merges it into the
system's data at build time.

```
GWorldVTT (public)                         gurps-compendium-content (private)
──────────────────                         ──────────────────────────────────
GCA .gdf ──parse-gdf──▶ packs-src/*.json   prose/<pack>/<file>.json   (by _id)
                            │              journals/<topic>.md        (rules text)
                            │                          │
                            └──── pinned copy ─────────┤  merge: entry + prose
                                  (submodule @ tag)    ▼
                                             build/packs-src/*.json
                                                       │  system's validate-packs
                                                       ▼  system's build-packs
                                             dist/packs/*  (LevelDB) + module.json
                                                       │
                                                       ▼
                                  Foundry: modules/gurps-compendium-content
                                  GM ticks the module's packs in "Compendium sources"
```

Why this split:

- **One source of truth per kind of data.** Statistics stay where they are generated and
  validated. Prose lives where it is legal to keep it. Neither repo duplicates the other's
  editable data.
- **Nothing breaks on the sheets.** A character that dragged `Compendium.gworld.skills.Item.<id>`
  keeps working. A GM who switches the picker to the module's packs gets documents with the
  same `_id`, so template entries, skill defaults and technique prerequisites (all by name)
  resolve exactly as before.
- **The system needs almost no change.** Its picker and sources page already accept module
  packs. The build tools need to take a source directory argument so the module can reuse
  them instead of copying them.
- **Versioning is explicit.** The module pins the system at a release tag and declares that
  version in `module.json` `relationships.systems`. When the system's packs change, bump the
  pin, rebuild, and the validator reports which prose entries went stale.
- **The plan's ten-pack structure collapses to what exists.** Perks live in `advantages`
  and quirks in `disadvantages` with a `category`; techniques live in `skills`. Only the
  rules-reference journal pack is genuinely new.

### Rejected alternatives

- **Move every compendium into the private repo.** Leaves the public system without data,
  and its build-time template cost check and skill catalog depend on `packs-src`. The
  statistics-only packs are fine in public; keep them there.
- **Full parallel module with its own schema and an adapter** (the original plan). Rewrites
  1,764 entries in a second vocabulary, needs a translation layer maintained against every
  system release, and puts templates back into journals.
- **Descriptions as a separate journal pack, items untouched.** Keeps the sheets clean but
  the prose is then two clicks away from the item. Worth keeping in mind only if §5 decides
  the item sheet should not carry long text.

---

## 3. What each repository owns

| GWorldVTT (public, `gworld`) | gurps-compendium-content (private) |
|---|---|
| Item types, data models, sheets, rules engine, incl. rules from other books behind "rules in play" switches | Book descriptions for every compendium entry, any book |
| `packs-src/` Basic Set statistics generated from the GCA file | Other books' statistics, generated from their GCA files with the system's parsers |
| `tools/parse-gdf*.mjs`, taking a page prefix and book name | Rules-reference journal pages (chapter/section text with page refs), any book |
| `_id` assignment and reuse | Coverage: which entries still lack prose |
| `tools/validate-packs.mjs`, `tools/build-packs.mjs` | A merge step and a thin wrapper that calls the system's two tools |
| Picker, "Compendium sources" setting, template application | `module.json` with the pinned system version |
| Page references (`system.reference`) | Any extra prose fields the system later adds (e.g. a short summary) |
| Public releases via `gh release` | Private releases (zip attached to a GitHub release on the private repo) |

Rule of thumb: **rules go in the system. The Basic Set's numbers go in the system. Every
other book's numbers, and every sentence from any book, go in the module.**

---

## 4. Private repository layout (replaces §5 of the original)

```
gurps-compendium-content/
├─ module.json
├─ README.md                 private-use notice, how to build and install
├─ package.json              scripts below; devDependency on @foundryvtt/foundryvtt-cli
├─ .gitignore                node_modules/, dist/, build/, *.zip, foundry-config.json
├─ system/                   git submodule → sargas79/GWorldVTT, pinned at a release tag
├─ books/
│  ├─ basic-set/
│  │  ├─ book.json           title, page prefix "B", stats: "system" (no GDF of its own here)
│  │  ├─ prose/<pack>.json   advantages, disadvantages, skills, spells, equipment, templates
│  │  └─ journals/           index.json + one Markdown file per journal page
│  ├─ martial-arts/
│  │  ├─ book.json           title "Martial Arts", prefix "MA", gdf: "GURPS Martial Arts 4e.gdf"
│  │  ├─ packs-src/          generated by the system's parsers, committed, ids stable
│  │  │  ├─ skills/*.json            one pack per type per book → pack "martial-arts-skills"
│  │  │  ├─ advantages/*.json        → "martial-arts-advantages"
│  │  │  └─ templates/*.json         → "martial-arts-templates" (styles)
│  │  ├─ overlap.txt         records the book re-lists from the Basic Set, skipped (§4a)
│  │  ├─ prose/<pack>.json
│  │  └─ journals/
│  ├─ magic/                 same shape; spells via parse-gdf-spells.mjs --prefix M
│  └─ …one folder per book
├─ tools/
│  ├─ extract.mjs            for each book with a gdf: run the system's parsers into books/<book>/packs-src
│  ├─ merge.mjs              (system/packs-src or books/<book>/packs-src) + prose → build/packs-src
│  ├─ coverage.mjs           entries without prose, prose without entries, name drift, per book
│  ├─ journals.mjs           journals/ → build/packs-src/<book>-rules (JournalEntry docs)
│  ├─ manifest.mjs           module.json packs list from books/*/book.json + the pinned system.json
│  └─ release.mjs            zip with POSIX separators (same fix the system needed)
└─ docs/
   ├─ prose-guidelines.md    what to transcribe, how to mark uncertainty, page refs
   └─ workflow.md            pdftotext → entry → review → build → install
```

No `src/`, no adapters, no templates, no UI, no schema directory. If a later phase
wants module JavaScript (say, hiding the system's own packs when the module's are chosen),
add it then.

### Prose file format

One array per pack, keyed by the system's `_id`; the name is carried for reviewability
and checked against the system at build time.

```json
[
  {
    "_id": "b7855b4aaa0ee284",
    "name": "Extra ST",
    "description": "<p>…book text…</p>",
    "pages": "B14",
    "status": "reviewed",
    "notes": ""
  }
]
```

- `description` is HTML, since `system.description` is an `HTMLField`.
- `pages` is optional; the system already writes `system.reference` ("Basic Set:
  Characters p. 14"). Keep it only where the prose spans pages the reference does not name.
- `status` ∈ `draft | transcribed | reviewed | needs-review`. (`normalized`, `deprecated`,
  `superseded` from the original plan have no meaning here; a stale entry is reported by
  `coverage.mjs`, not marked by hand.)
- Anything else the system's item model gains for prose later (a one-line `summary`, GM
  notes) is added as another key and mapped by `merge.mjs`.

### Merge rules

- Output document = system document with `system.description` (and any other mapped prose
  field) replaced. **Nothing else is touched.** If a prose record tries to set a
  statistic, the merge fails.
- A prose `_id` that no longer exists in the system fails the build (orphan).
- A prose `name` that differs from the system's name for that `_id` fails the build (drift;
  the fix is to re-check the text against the renamed entry).
- A system entry with no prose passes through unchanged and is listed by `coverage.mjs`.
- Then the **system's own** `validate-packs.mjs` and `build-packs.mjs` run on
  `build/packs-src`, so the module's packs are checked by the same code as the system's.

### Rules-reference journals

Native `JournalEntry` pack, no system involvement. One Markdown file per page, converted
to HTML at build. `index.json` gives each page its title, folder (chapter), and book page
range, which goes into the page's own text header and into a flag under the module's
namespace. Granularity is an open question (§9).

### 4a. Other books

The system is the Basic Set; that is what v1.0.0 means, and PR #88's README already says
other books' spells arrive "as a module" built with the system's tools. The private repo
is that module, one folder per book under `books/`, and every book goes through the same
five steps:

1. **Statistics from the book's GCA file.** You hold 37 supplement `.gdf` files in
   `E:\data files\`. `extract.mjs` runs the system's parsers from the submodule against the
   book's file with `--prefix <its page prefix> --book "<its title>" --out books/<book>/packs-src`.
   The output is committed like the system's `packs-src`, so it is reviewable and the ids
   (sha1 of kind and name, kept once published) stay put.
2. **Overlap with the Basic Set is skipped by default.** Every supplement re-lists Basic
   Set entries: Martial Arts cites 318 B-pages beside its 1,628 MA-pages, Powers 120,
   Low-Tech 143, Magic reprints every Basic Set spell with a `page(M74, B247)` double
   citation. A record whose citation includes a B-page is already in the system, so the
   extractor leaves it out and writes it to `overlap.txt`. Where the supplement genuinely
   revises the entry (Martial Arts changes some technique defaults), the revised record is
   added by hand from that list; the picker already labels which pack a row is from when
   two packs hold one name. None of the files use GCA's `#replace` directives, so there is
   no automatic override to honour.
3. **One Item pack per type per book,** named `<book>-<type>` (`basic-set-advantages`,
   `magic-spells`, `martial-arts-templates`), plus one JournalEntry pack per book,
   `<book>-rules`. Every pack entry in `module.json` carries
   `"flags": { "gworld": { "book": "martial-arts", "bookTitle": "GURPS Martial Arts" } }`,
   which is what lets the system group them. **Books are switched on per campaign** in
   the system's existing Compendium sources page (a world setting, so already per
   campaign): it gains a row per book with one switch that ticks or unticks all of that
   book's packs, with the per-pack boxes still underneath. The saved setting stays what it
   is today, a list of pack ids, so nothing migrates. The Basic Set overlay uses the same
   naming, so a GM sees `GURPS Basic Set – Advantages` from the module beside
   `GURPS Advantages` from the system and picks one.

   *Alternative not taken:* one Foundry module per book, toggled in Manage Modules. It
   would need no system change, but it means one manifest, one zip and one version per
   book; a single module with a book switch was chosen instead.
4. **Prose** in the same overlay format as the Basic Set, keyed to the ids in the book's
   own `packs-src`.
5. **Types the system does not have yet are a system feature first.** The supplements'
   sections map like this on first inspection; each book gets a short triage before it is
   started, and anything in the right-hand column becomes a GWorldVTT issue.

| Book | Maps onto existing types | Needs the system first |
|---|---|---|
| Magic | spells (parser exists), a few skills and templates | — |
| Martial Arts | techniques, skills, perks; **styles fit the `template` item** (skills, techniques, perks, choice groups, a cost) | new maneuvers and combat options as rules behind switches |
| Powers, Power-Ups 4 | advantages with `modifiers[]` | a modifier catalog (enhancements/limitations as data), if abilities are to be built rather than typed |
| Power-Ups 2 (Perks), 6 (Quirks), 3 (Talents) | traits | — |
| Low-Tech, High-Tech, Gun Fu | equipment, armor, shield, ranged modes | any new weapon statistics the parser's equipment mapping does not carry; Low-Tech's `[BODY]` hit-location tables are rules |
| Fantasy, Horror, Dragons, Fantasy Folk, Bio-Tech | racial templates, traits, equipment | — |

Cross-references keep working across books because the system resolves them by name: a
Martial Arts technique whose prerequisite is Judo finds the character's Judo whichever
pack it came from, and a style's entries name the skills they grant.

Rules a supplement introduces (Martial Arts' Committed Attack, Powers' ability rules)
are system code under **GURPS rules in play**, public, with the page reference; a switch
for a book the GM does not own is simply off. The data those rules read arrives with the
book's pack.

---

## 5. System-side changes needed (small PR to GWorldVTT)

1. ~~`--src <dir>` on the two pack tools~~ — **already done in PR #88**, together with
   `parse-gdf-spells.mjs --prefix --book --out --pack`. What remains is giving
   **`tools/parse-gdf.mjs` the same options**: today it keeps only records citing a B-page
   and hard-codes "Basic Set: Characters" as the reference, and it reads existing ids from
   the system's own `packs-src`. It needs `--prefix`, `--book`, `--out`, `--pack`, id reuse
   from the `--out` location, and an option to write the skipped-overlap list (§4a step 2).
2. **Traits tab: collapsible description** (decided). `tab-traits.hbs` prints
   `system.description` inline; with book text it becomes a paragraph per row. The row
   shows the first line and expands on click. No data-model change; the module carries
   one text per entry.
3. **Compendium sources page: a switch per book** (decided, §4a step 3). Group packs by
   `pack.metadata.flags.gworld.book`, falling back to the package name for packs without
   the flag; a book-level checkbox ticks all its packs. The setting's shape is unchanged.
4. **Equipment modifiers as an item type** — filed as a GWorldVTT issue (Fine, Cheap,
   Balanced and the other Basic Set quality and material modifiers are statistics that
   belong in the system; the module overlays their prose like anything else). Not needed
   for the Basic Set prose work; needed before Low-Tech or High-Tech.
5. **Spells pack must be on `main`** before the `basic-set-spells` overlay exists. The
   module pins v0.14.0 now and bumps to the first release that includes PR #88.

Items 1–3 are one system PR (M0). Nothing else in the system needs to know the module
exists.

---

## 6. Build, install, release (replaces §§11, 13, 14, 19)

`package.json` scripts in the private repo:

```json
{
  "scripts": {
    "coverage": "node tools/coverage.mjs",
    "merge": "node tools/merge.mjs",
    "validate": "npm run merge && node system/tools/validate-packs.mjs --src build/packs-src",
    "build": "npm run validate && node system/tools/build-packs.mjs --src build/packs-src --out dist/packs && node tools/journals.mjs",
    "deploy": "node tools/deploy.mjs",
    "release": "npm run build && node tools/release.mjs"
  }
}
```

- **Install locally** the way the system does: `foundry-config.json` with the Data path,
  and a junction from `Data/modules/gurps-compendium-content` to `dist/`. The system's
  `tools/deploy.mjs` is nearly reusable; the module's copy changes the target folder.
- **Versions.** The module has its own releases, starting at **v0.0.1**, independent of
  the system's. The system it was built against is declared in
  `relationships.systems[0] = { id: "gworld", type: "system", compatibility: { minimum: "<pinned>", verified: "<pinned>" } }`
  and Foundry's in `compatibility: { minimum: "14", verified: "14.367" }`. Bumping the
  submodule pin is a module release like any other.
- **Release** = a GitHub release on the private repo, `gurps-compendium-content.zip` plus
  a loose `module.json`, zipped with POSIX separators, tagged `vX.Y.Z`.
- **Install, both ways** (decided):
  - *Manual:* download the zip from the release and unpack it into `Data/modules`. On the
    development machine, `npm run deploy` junctions `dist/` in, as the system does.
  - *Manifest URL:* Foundry fetches `manifest` and `download` **without credentials**, so a
    private GitHub release cannot serve them. The manifest route therefore needs a place
    you control that serves two files by URL with no login. Open item: which one. The
    candidates, in order of preference: a private web host or home server you already
    run; an unlisted direct-download link (Dropbox or OneDrive with `dl=1`, unguessable
    path); a GitHub personal access token is *not* an option, since Foundry cannot send
    it. `tools/release.mjs` writes `manifest` and `download` in `module.json` from a
    `release-config.json` (gitignored) so the URLs never sit in the repository, and
    uploads the two files to that location after creating the GitHub release. A public
    location is ruled out: the zip contains the book text.
- **Manifest packs**: `<book>-<type>` Item packs and `<book>-rules` JournalEntry packs,
  each with `"system": "gworld"`, the system's ownership block, and the `gworld.book`
  flag. `tools/manifest.mjs` generates the list from `books/*/book.json` so the manifest
  never drifts from the folders.

---

## 7. Content workflow (replaces §10)

1. `pdftotext -layout` the relevant chapter; the Characters and Campaigns PDFs are the ones
   already used to check rules.
2. For one pack at a time, run `coverage` to get the list of entries lacking prose, in
   the system's order.
3. Fill `prose/<pack>/basic-set.json` entry by entry: description as HTML paragraphs,
   `status: transcribed`.
4. Review against the page; set `reviewed`, or `needs-review` with a note where the
   extraction is uncertain (tables, sidebars, footnotes).
5. `npm run build`, `npm run deploy`, open the world with the module's packs chosen in
   Compendium sources, spot-check on the item sheet and the traits tab.
6. Commit per pack or per chapter.

Not in scope for this pipeline: statistics corrections. Those are system bugs and go to
GWorldVTT as before, regenerating from the GCA file.

---

## 8. Milestones (replaces §21)

**M0 — System enablers (GWorldVTT PR, public).** Book options on `parse-gdf.mjs`;
collapsible descriptions on the traits tab; book switch on the Compendium sources page.
Released as v0.15.0 or folded into it with the magic PRs. Deliverable: a system release
the module can pin.

**M1 — Module skeleton (private repo, v0.0.1).** Submodule at the tag, `books/basic-set`,
`module.json` generated, `merge`, `coverage`, `build`, `deploy`, `release`. Overlay prose
for three advantages and three skills. Deliverable: the module loads in the local Foundry,
"GURPS Basic Set" appears as a book on the Compendium sources page, switching it on shows
the prose on the item sheet and collapsed on the traits tab, and a character built from
the system's packs is unaffected.

**M2 — Advantages and disadvantages prose** (perks and quirks come with them).
Deliverable: coverage at 100% for both packs, all `reviewed` or `needs-review`.

**M3 — Skills and techniques prose.**

**M4 — Spells prose** (after the magic PRs are released and the pin is bumped).

**M5 — Templates and equipment prose.** Templates are short; equipment prose is mostly
table notes.

**M6 — Rules-reference journals, one page per rule** (decided). The page list starts
from the system's own "GURPS rules in play" register, which already names every optional
rule with its page, and adds the rules that are never optional (success rolls, damage,
DR, the three active defenses, and the rest of the chapters). Each page: title, book page
range, the text, and the rule's switch id where one exists, so the settings page can link
to it later (system-side, optional).

That completes the Basic Set, which is what v0.1.0 of the module means.

**M7 — Magic.** The spell parser already takes a book; this proves the per-book folder,
the overlap skip, the generated manifest and the book switch. **M8 — Martial Arts**:
techniques, perks, styles as templates, and the first triage that sends rules to the
system. After that, one book at a time, each starting with its triage.

**M9 — Maintenance.** Pin-bump procedure, coverage report in CI (private repo Actions),
release notes.

The original plan's Milestone 2 "vertical slice across ten packs" and its Tasks 3–5
(normalization, adapter, generator) are gone: the merge step is the whole pipeline.

---

## 9. Dropped or deferred from the original plan, and why

- **Adapter, services, custom compendium browser, item/journal Handlebars templates,
  migrations** — the system already provides the browsing, dropping, pricing and template
  application; a module that reimplements them would drift from the system's rules.
- **Separate perk/quirk/technique packs** — they are categories of existing packs; the
  picker already filters by category.
- **Templates as journals** — templates are automated Items already.
- **Equipment traits pack** — no item type to hold them. If wanted, it is a *system*
  feature (equipment modifiers such as Fine, Cheap, Balanced are statistics), and the
  module would then overlay prose on it like anything else.
- **Canonical `category-name` ids, prerequisite-resolution levels 1–4, edition policy
  machinery** — the system fixes ids; prerequisites are already resolved by name or, for
  spells, by a grammar in the rules engine; there is one edition (4e) and one book set.
- **JSON Schema directory and schema-versioned flags** — the system's data models are the
  schema; the module writes one field. A `flags.gurps-compendium-content.status` on each
  document is enough to say which text has been reviewed.
- **Portuguese** — see questions.

---

## 10. Decisions (2026-09-12)

| Question | Decision |
|---|---|
| Overlay approach | **Yes.** The module carries prose joined to the system's ids, never its own copy of the Basic Set's statistics. |
| Long prose on the actor sheet | **Collapsible line on the traits tab.** |
| Packs in v1 | **The Basic Set first**, all its packs; other books follow, provided by the owner one at a time. |
| Rules-reference journals | **In scope, one page per rule.** |
| Language | **English.** |
| Versioning | **The module has its own releases from v0.0.1**; the system pin is declared in the manifest and bumped as needed (v0.14.0 now, the first release with spells next). |
| Equipment traits | **System issue filed** for an equipment modifier item type. |
| Installation | **Both**: manual zip from the private release, and a manifest URL served from a location the owner controls (see §6, one open item: which location). |
| Other books' statistics | **In the private module**, generated from each book's GCA file with the system's parsers. |
| Overlap with the Basic Set | **Skipped**, written to a review list. |
| Pack granularity | **One pack per type per book**, with a **per-campaign book switch** on the Compendium sources page. |
| Order | **Basic Set, then Magic, then Martial Arts.** |

### Still open

- Where the manifest and zip are hosted for the URL install route (§6). Not blocking:
  M1 through M6 work with the manual route and the local junction.

### First steps once told to go

1. GWorldVTT PR for M0 (public repo, no prose): parser book options, traits-tab collapse,
   book switch on the sources page.
2. Private repo: skeleton, submodule, the six-entry proof, v0.0.1.
3. Advantages prose from `pdftotext` of Characters, pack by pack from there.

---

## 11. Instructions for creating the GitHub issues

These instructions are for whoever (or whatever) turns this plan into GitHub issues. They
describe the intent behind the tracking as much as the list itself. Read §§1–10 first;
the issue bodies should point back at those sections rather than repeat them.

### 11.1 Intent

- **Two repositories, two grains of work.** Feature work in the public system repo is
  tracked one issue per feature and closed by one pull request each, which is how that
  repo already runs. Content work in the private repo is tracked **one issue per pack or
  per book, never per entry**: the Basic Set alone has 1,764 entries, and the module's
  `coverage` script is the entry-level tracker, since it always knows which entries still
  lack prose. An issue per entry would be noise.
- **Milestones group the work, not a project board.** One milestone per release in each
  repo. Cross-repo dependencies are plain issue URLs in a "Blocked by" line. A board
  spanning both repos is not wanted for one person and two repos.
- **The plan lives with the work.** The first content-repo issue commits this file as
  `docs/plan.md`. Issue bodies cite sections of it (`docs/plan.md §4a`) instead of copying
  them, so there is one place to correct.
- **Serial by dependency.** System enablers → system release → module skeleton pinned to
  it → prose pack by pack → journals → v0.1.0 → Magic → Martial Arts. Prose packs may run
  in parallel later, since they touch separate files, but nothing starts before its
  "Blocked by" is closed.
- **One issue is one working session and one PR.** Each body carries acceptance criteria
  precise enough that a session can start from the issue alone. Prose PRs are capped at
  one pack or one chapter, because review means spot-checking against the page, and a
  400-entry diff cannot be spot-checked.
- **No book text in the public repo, ever.** System issues describe mechanics and field
  names only. Anything quoting the books goes only in the private repo's issues.

### 11.2 Conventions

- Title: a plain sentence fragment saying what will be true when it is done, in the style
  of the repo's existing issues (e.g. "Trait changes cannot be saved", "Equipment
  categories"). No prefixes like `[feat]`.
- Body sections, in this order: **Context** (one paragraph plus the plan section),
  **What to do** (bullets), **Acceptance criteria** (checkbox list), **Blocked by** (issue
  URLs, or "nothing").
- Labels: both repos currently have only GitHub's defaults. Use `enhancement` on every
  system issue. In the content repo, create and use these labels:
  `tooling`, `statistics`, `prose`, `journals`, `release`, `triage`, and one `book:<slug>`
  per book (`book:basic-set`, `book:magic`, `book:martial-arts`).
- Milestones to create:
  - GWorldVTT: **v0.15.0** (description: "Enablers for the private content module, plus
    whatever else lands").
  - gurps-compendium-content: **Basic Set (v0.1.0)**, **Magic**, **Martial Arts**.
- Do **not** recreate GWorldVTT issue #97 (equipment modifier item type); it exists. Leave
  it without a milestone and add the `enhancement` label if it lacks one.
- If you cannot act on GitHub directly, output a single shell script of `gh` commands
  (`gh label create`, `gh api .../milestones`, `gh issue create --repo … --title … --body
  … --label … --milestone …`) with each body in a quoted heredoc, in dependency order, so
  the owner can run it once.

### 11.3 Issues for `sargas79/GWorldVTT` (public) — milestone v0.15.0

**S1. The GCA parser reads any book, not only the Basic Set**
Context: `tools/parse-gdf.mjs` keeps only records citing a B-page, hard-codes
"Basic Set: Characters" as the reference, and reuses ids from the system's own
`packs-src`. `tools/parse-gdf-spells.mjs` already takes `--prefix`, `--book`, `--out`,
`--pack` (PR #88). Plan §4a, §5 item 1.
What to do: add the same options to `parse-gdf.mjs`; reuse existing ids from the `--out`
location; add `--overlap <file>` that writes the records skipped because their citation
also includes a B-page; extend the README's "other books, as a module" section beyond
spells.
Acceptance:
- [ ] With no options, output is byte-identical to the current `packs-src`.
- [ ] Run on a supplement GDF with `--prefix MA --book "Martial Arts" --out <dir>`, it writes only records citing MA pages, references read "Martial Arts p. N", and records that also cite a B-page are absent and listed in the overlap file.
- [ ] Ids for a name already present under `--out` are kept.
- [ ] Unit tests cover the reference function and the overlap filter.
Blocked by: nothing.

**S2. Long trait descriptions collapse on the traits tab**
Context: `templates/actor/tab-traits.hbs` prints `system.description` inline; the content
module will fill it with several paragraphs. Plan §5 item 2.
What to do: show the first line, expand and collapse on click; no data-model change.
Acceptance:
- [ ] A trait with a multi-paragraph description shows one line, and the full text on click.
- [ ] A blank description renders exactly as today.
- [ ] Keyboard-operable and announced as expandable (the repo has an `accessibility` label; honour it).
Blocked by: nothing.

**S3. Compendium sources can be switched on per book**
Context: the Compendium sources page (`src/system/apps/compendium-sources.ts`,
`src/system/compendium-sources.ts`) lists every Item pack with a box each. With one pack
per type per book, a GM wants one switch per book. Plan §4a step 3, §5 item 3.
What to do: read `pack.metadata.flags.gworld.book` and `bookTitle` in `summarisePack`;
group packs under a row per book (fallback: the package name); a book-level checkbox
ticks or unticks all its packs and shows indeterminate when only some are ticked. The
saved setting stays a list of pack ids.
Acceptance:
- [ ] Packs carrying the flag appear under their book title; packs without it appear as today.
- [ ] The book checkbox sets every pack of the book; partial selection shows indeterminate.
- [ ] Existing saved settings load unchanged.
- [ ] The pure grouping logic is tested in `compendium-sources.test.ts`.
Blocked by: nothing.

*(S4, later, not now: link each entry on the "GURPS rules in play" page to the module's
journal page for that rule. Open it when content issue C9 starts.)*

### 11.4 Issues for `sargas79/gurps-compendium-content` (private)

#### Milestone: Basic Set (v0.1.0)

**C1. Repository skeleton, first overlay, v0.0.1** — labels `tooling`, `book:basic-set`
Context: plan §§2, 4, 6. The module is a prose overlay on the system's packs, built with
the system's own tools from a pinned submodule.
What to do: add `system/` as a git submodule at the first GWorldVTT release containing S1–S3;
`books/basic-set/book.json`; `tools/extract.mjs`, `merge.mjs`, `coverage.mjs`,
`journals.mjs`, `manifest.mjs`, `deploy.mjs`, `release.mjs`; `package.json` scripts as in
§6; `.gitignore`; README with the private-use notice and both install routes; this plan
as `docs/plan.md`; prose for three advantages and three skills; tag `v0.0.1`.
Acceptance:
- [ ] `npm run build` produces `dist/` with `module.json` and packs named `basic-set-<type>`, each flagged `gworld.book = "basic-set"`.
- [ ] `merge` fails on: a prose `_id` absent from the system, a prose `name` differing from the system's, a prose record setting anything but the mapped prose fields.
- [ ] The module loads in Foundry 14 with `gworld`; "GURPS Basic Set" appears as a book on the Compendium sources page; switching it on shows the six descriptions on the item sheet and collapsed on the traits tab.
- [ ] A character built from the system's packs is unaffected.
Blocked by: S1, S2, S3 released.

**C2–C7. Book text for one pack each** — labels `prose`, `book:basic-set`
One issue per pack, in this order: **advantages** (perks included), **disadvantages**
(quirks included), **skills and techniques**, **spells**, **templates**, **equipment**.
Context: plan §7 workflow, §4 prose format. Source is `pdftotext -layout` of the Basic Set
PDFs the owner holds; the GCA file is not a prose source.
What to do: work down the `coverage` list for the pack; one PR per chapter or section;
every entry gets `status: reviewed`, or `needs-review` with a note.
Acceptance (each):
- [ ] `coverage` reports 100% for the pack.
- [ ] No entry left in `draft` or `transcribed`.
- [ ] No statistic changed (the merge enforces it; say so in the PR).
- [ ] Page references spot-checked against the PDF for one entry in ten.
Blocked by: C1. **Spells** additionally blocked by the GWorldVTT release that carries the
`spells` pack (PR #88) and a pin bump to it.

**C8. Rules-reference journals, one page per rule** — labels `journals`, `book:basic-set`
Context: plan §4 "Rules-reference journals", §8 M6, decision "per rule".
What to do: the page list starts from the system's rules register
(`system/src/system/optional-rules.ts`, every optional rule with its page) and adds the
rules that are never optional; one Markdown file per rule under
`books/basic-set/journals/`, `index.json` with title, chapter folder, page range and the
rule's switch id where one exists; `journals.mjs` builds pack `basic-set-rules`.
Acceptance:
- [ ] Every rule in the register has a page; the non-optional chapters are covered.
- [ ] Pages carry the book page range in their header and the switch id in a module flag.
- [ ] The pack opens in Foundry with folders per chapter.
Blocked by: C1.

**C9. Decide and set up where the manifest URL is served** — labels `release`
Context: plan §6 "Install, both ways". Foundry fetches manifest and zip without
credentials; a private GitHub release cannot serve them; a public location is ruled out.
What to do: the owner picks a location (own host, or an unlisted direct-download link);
`release.mjs` reads it from a gitignored `release-config.json` and uploads there.
Acceptance:
- [ ] Foundry installs the module from the manifest URL on a clean machine.
- [ ] No URL or credential is committed.
Blocked by: nothing (decision is the owner's; not blocking C1–C8).

**C10. Release v0.1.0 — the Basic Set** — labels `release`, `book:basic-set`
Acceptance:
- [ ] C1–C8 closed; C9 closed or the manual route documented as the only one for now.
- [ ] Tag, GitHub release with zip and loose `module.json`, changelog entry.
Blocked by: C1–C8.

#### Milestone: Magic

**C11. Triage GURPS Magic** — labels `triage`, `book:magic`
What to do: map the GDF's sections to system types (plan §4a table); count the overlap;
list anything needing the system first (expected: nothing). Open system issues for any.
**C12. Magic statistics** — labels `statistics`, `book:magic`
Extract with `parse-gdf-spells.mjs --prefix M --book "Magic"` and `parse-gdf.mjs` for its
skills and templates into `books/magic/packs-src`; commit `overlap.txt`; packs
`magic-spells`, `magic-skills`, `magic-templates` as present. Blocked by C11, and by the
system release with the spells pack.
**C13. Magic book text** — labels `prose`, `book:magic`. Same acceptance as C2–C7.
**C14. Magic rules journals** — labels `journals`, `book:magic`. Same shape as C8.

#### Milestone: Martial Arts

**C15. Triage GURPS Martial Arts** — labels `triage`, `book:martial-arts`
Expected outcome: techniques, skills and perks map directly; styles become `template`
items; new maneuvers and combat options become GWorldVTT issues behind "rules in play"
switches. Open those system issues from this one.
**C16. Martial Arts statistics**, **C17. Martial Arts book text**, **C18. Martial Arts
rules journals** — as for Magic. C16 blocked by C15 and by any system issues it raised.

#### Later books

Do not create issues for the other 34 supplements now. When the owner hands a book over,
create its four issues (triage, statistics, book text, journals) under a new milestone
named for the book, following the Magic pattern.
