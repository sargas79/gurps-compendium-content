# Changelog

## v0.1.0 — the Basic Set

The Basic Set is done: every entry the book describes has its text, and the
rules journal covers the rules the book gives. This release holds the Basic Set
only. It was built with `GCC_BOOKS=basic-set`, and Monster Hunters 1 follows in
v0.2.0.

- **Text for every Basic Set pack**, all reviewed: 296 advantages, 270
  disadvantages, 655 skills and techniques, 164 enhancements and limitations,
  100 spells, 25 templates, 139 pieces of equipment and 37 creatures. The other
  443 records are system entries the book has no text for, such as armor and
  weapon table rows (horse barding, for one), items the book lists only by cost
  and weight, and names the data file gives to something the book describes
  under another heading. Each of those carries a note saying why. The system's
  statistics are unchanged in all 2,129 documents.
- **The rules journal**: 212 pages in seven folders (Rolls, Combat, Injury,
  Activities, Equipment, Magic, Cinematic).
  - Every optional rule in the system's register has a page (76 of them). Each
    of those pages carries the rule's switch id in
    `flags.gurps-compendium-content.rule`.
  - Chapters 10-14 of Campaigns (success rolls, combat, tactical combat, special
    combat situations, and injuries, illness and fatigue) have one page per
    section.
  - Every page opens with its book page range.
  - Where the capture could not follow a page's layout (sidebars, tables, a
    heading it lost), the page is written by hand.
- `tools/recapture.mjs` reads an entry again from the page's layout, columns and
  sidebars included, for the records the first pass got wrong.
- `GCC_BOOKS` limits a build to the books it names.
- Built against **gworld v1.2.0**.

## v0.0.1

The first build. The pipeline exists and is proved end to end in Foundry; the
content it carries is six entries, enough to show a description reaching a sheet.

- The books' text is joined to the GWorld system's own compendium entries by id,
  and the merge refuses an orphaned record, a renamed entry, a bad status, an
  empty description, or any record trying to set a statistic.
- Eight packs for the Basic Set — advantages, disadvantages, equipment,
  modifiers, skills, spells, templates and creatures — each a complete copy of
  the system's pack with text added where it has been written. All 2,127
  documents carry the system's statistics unchanged.
- The system's own pack validator runs over the merged result.
- `npm run coverage` reports what is left, per book and per pack.
- A book's rules text compiles to a JournalEntry pack, one entry per rule, with
  the book's page range and the system's rule switch recorded on each. No rules
  are written yet.
- `npm run extract` runs the system's own GCA parsers against another book, and
  refuses to guess when the pinned system's parsers read the Basic Set only.
- The system is a submodule pinned at **gworld v1.0.0**, the release that completes the Basic Set.

Text: Acute Vision, Ambidexterity, Combat Reflexes, Acrobatics, Climbing,
Stealth.
