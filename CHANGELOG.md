# Changelog

## v0.4.0 — Magic's rules, and the first Martial Arts rules

Built from the Basic Set, Monster Hunters 1 and Magic against **gworld
v1.6.0**, which this release requires (add-on API 1.20.0). Every new switch is
off by default.

- **GURPS Magic** now ships, with its pack and a rules group on the Rules page:
  - Powerstones: priced by capacity, recharged with the world's time at the
    local mana level, and offered as energy in the casting dialog (#168);
  - jets, breaths and rains: jets attack as cast and each turn after, and
    rains roll damage each second, halved for part of a second (#169).
- **GURPS Martial Arts**, a rules group with its first seven switches:
  - Committed and Defensive Attack as maneuvers (#170);
  - All-Out Attack (Long), slams at full Move, and Move and Attack with any
    melee attack (#171);
  - Acrobatic Stand, movement stunts, and Acrobatic and Flying Attacks (#172);
  - the posture tables, and dropping to the ground as part of an attack (#173);
  - Beats, Ruses, defensive feints, and resisting a feint with the best
    combat skill (#174);
  - readying weapons: multiple Fast-Draw, where a weapon is carried, grips,
    rapid grip changes, and quick-readying (#175).
- The Martial Arts pack stays out of the release until the rest of the book's
  rules arrive.

## v0.3.0 — Monster Hunters 1's rules, in the add-on

The GWorld system is the Basic Set and nothing else. Monster Hunters 1's rules
were built into the system in v1.1.0 and v1.2.0; they now live here, and
register with the system through its add-on API. Built from the Basic Set and
Monster Hunters 1 against **gworld v1.4.0**, which this release requires.

- **The book's rules group**, "GURPS Monster Hunters 1" on the Rules page, with
  its five switches, all off by default:
  - Talents never add to wildcard skills;
  - destiny and wildcard bonus points, with a Skills tab section and a new
    session GM tool;
  - holy attacks: holy items, holy contact, and the burn a holy weapon or a
    holy-water round adds;
  - Ritual Path Magic: rituals as this module's own item type with their own
    sheet, Paths, the mana reserve, the casting card, conditional rituals,
    charms, grimoires, working together, blocking and resistance;
  - the book's gear: improvements by cost factor, the book's weapon grades and
    options, special ammunition with hand-loading, Holdout, and Signature Gear.
- **Moving a world over.** A world that used these rules under the system's
  own group has its data moved into this module the first time the GM loads
  it with this release enabled: rituals, reserves and rituals in effect,
  point pools, holy marks, charms, grimoires, gear options and loads, and the
  switch states. The system's own switches are turned off. It runs once.
  **Load every such world once with this release before updating the system
  to 1.5.0**, which stops defining that data.
- The gear records in the book's equipment pack keep their rule fields in this
  module's data.
- Magic and Martial Arts stay out of the release until their rules arrive.

## v0.2.0 — Monster Hunters 1

GURPS Monster Hunters 1: Champions, alongside the Basic Set. The book has its
own folder in the compendium sidebar and its own switch on the system's
Compendium sources page. Built from every book in the repository against
**gworld v1.2.0**, the first system release with all of the book's rules.

- **Statistics from the book's GCA file**, plus hand-kept records for what the
  file rejects or leaves out. Coverage is 395/395 entries with text, all
  reviewed:
  - advantages, perks and power abilities: 99
  - disadvantages: 4
  - skills (wildcard, Path, Hidden Lore, Religious Ritual, Theology): 31
  - power modifiers: 6
  - gear, armor and weapons: 229
  - templates: 26 (10 character templates, 10 motivational lenses, 6 racial templates)
- **The rules journal**: 36 pages in six folders, one per chapter. 26 of them
  carry the switch id of the system rule they explain: Ritual Path Magic, holy
  attacks, the book's gear rules, and spending bonus points.
- The system rules these records work with (the "Monster Hunters" group, off by
  default) arrived in gworld v1.1.0 and v1.2.0.

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
