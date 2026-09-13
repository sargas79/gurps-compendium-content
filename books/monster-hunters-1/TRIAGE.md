# Triage: GURPS Monster Hunters 1: Champions

Done on 2026-09-13, against the PDF and the GWorld system at v1.0.0, before any
of the book was extracted. Tracking: milestone **Monster Hunters 1**, issues #22
to #33 here and sargas79/GWorldVTT#138 to #152 in the system.

| | |
|---|---|
| Book | GURPS Monster Hunters 1: Champions, e23, 2011, 66 pages, six chapters |
| PDF | one volume; **PDF page = book page** (offset 0) |
| GCA file | `GURPS_Monster_Hunters_1_Champions.gdf`, 17 Aug 2011, `Incomplete=Yes` |
| Citations | `page(MH1:23)`, so the prefix is `MH1:` until the system pin carries GWorldVTT#138, then `MH1` |
| Requires | the Basic Set file; loads after GURPS Powers |

## The book, chapter by chapter

| Chapter | Pages | The GCA file gives | The system at v1.0.0 | Issues |
|---|---|---|---|---|
| Introduction | 4 | nothing | nothing needed | |
| 1. Monster Hunter Templates: campaign types, motivational lenses, ten 400-point templates | 5-21 | **nothing**; the header lists templates as still needed | character, racial and lens templates with choice groups and a stated-cost check | #26, #31 |
| 2. Champions' Cheat Sheet: suitable and heroic advantages, new Talents and perks, the disadvantage limit, wildcard skills, other uses for points | 22-31 | advantages, perks, disadvantages, skills, Talent groups | wildcard (`W`) skills priced; Talent skill lists hard-coded for the Basic Set; no wildcard or destiny points, no buying successes | GWorldVTT#139, #151; #28, #29 |
| 3. Ritual Path Magic | 32-39 | the nine Path skills (their ceiling is a GCA expression), Ritual Adept, Ritual Mastery | none of it | GWorldVTT#144-#147; #32 |
| 4. Powers: Bioenhancement, Mysticism, Psionics, Anti-Psi | 40-48 | about 70 abilities priced with the power modifier included; 6 power modifiers | psionics for the Basic Set's six powers only, by fixed names; no trait can be rolled as an attack | GWorldVTT#140, #141; #28 |
| 5. Inhuman Races: Demon, Demonspawn, Lycanthrope and four were-forms, Outcast Angel, Vampire, Dhampir; holy attacks | 49-51 | **nothing** | racial templates work; Vulnerability and Weakness do not act on injury; no holy attacks | GWorldVTT#142, #143; #27, #31 |
| 6. Gear: budgeting, gadgets, esoteric gear, protective clothing, weapons, special ammo, grenades | 52-63 | gear, armour, weapons, and improvements written as GCA modifiers | weapon quality and material as fields; five ammunition types; none of the book's cost-factor options | GWorldVTT#148-#150; #25, #30 |

## Sections of the file, and where they go

| GCA section | System type | Pack | Notes |
|---|---|---|---|
| `[ADVANTAGES]` | `trait`, category advantage | `monster-hunters-1-advantages` | powers are prefixed `BIO:`, `MYS:`, `ESP:`, `PK:`, `TEL:`, `TPN:` |
| `[PERKS]` | `trait`, category perk | `monster-hunters-1-advantages` | |
| `[DISADVANTAGES]` | `trait`, category disadvantage | `monster-hunters-1-disadvantages` | |
| `[SKILLS]` | `skill` | `monster-hunters-1-skills` | wildcard skills come as `DX/WC`, read as `W` |
| `[GROUPS]` | a trait's skill list | (field on the Talents) | waits on GWorldVTT#139 |
| `[EQUIPMENT]` | `equipment`, `armor` | `monster-hunters-1-equipment` | |
| `[MODIFIERS]`, power modifiers | `modifier` | `monster-hunters-1-modifiers` | six, pp. 41-48; `extract` must also run `parse-gdf-modifiers.mjs` (#24) |
| `[MODIFIERS]`, Power Talents | none | skip | GCA's way of wiring a Talent to Innate Attack skills |
| `[MODIFIERS]`, equipment | none | skip | improvements are calculated fields on the item (GWorldVTT#148-#150), never modifier items |
| `[ATTRIBUTES]` | none | skip | GCA's helper for the Path skill ceiling, which becomes system code in GWorldVTT#144 |
| templates | `template` | `monster-hunters-1-templates` | by hand, #26 and #27 |
| rules | `JournalEntry` | `monster-hunters-1-rules` | #32 |

## What the parsers make of it

Dry run with `npm run extract -- monster-hunters-1`.

| | System v1.0.0 (`MH1:`) | After GWorldVTT#138 |
|---|---|---|
| advantages | 84 | 84 |
| perks | 9 | 10 (Weapon Bond) |
| disadvantages | 4 | 4 |
| skills | 31: 7 wildcard, 9 Path, 9 Hidden Lore, 3 Religious Ritual, 3 Theology | 31 |
| armour | 11 | 11 |
| gear | 198, 38 with attack modes | 189 (9 quality variants folded, the longer Basic Gear label dropped) |
| spells | 0 | 0 |
| rejected | 32 | 40, each with a reason |

**No Basic Set overlap.** No record the parser keeps also cites a B-page, so
`overlap.txt` will be empty. Records citing only B-pages (Resistant to Disease,
Law (Criminal), Physics (Paraphysics), Vow (Never kill a human)) are the
system's already, and the parser passes over them.

### Rejected, and what happens to each

| Record | Reason | Plan |
|---|---|---|
| Higher Purpose (Hunt [monsters]) | placeholder | by hand: the three forms p. 24 allows (#25) |
| Weapon Bond (%WeaponList%) | placeholder | kept as Weapon Bond once GWorldVTT#138 is pinned |
| Lab, Belt / Box / Field / Shop; Tool Kit, the same | placeholder `[skill]` | by hand, one per grade (#25) |
| Grimoire (+2 to +10 to [ritual]), Grimoire Collection ([name]) | placeholder | by hand (#25); bonuses wait on GWorldVTT#147. Collection kept by name after #138 |
| Boots, Reinforced; Cup, Athletic; Helmet, Motorcycle; Leggings, Sharp-Proof; Sleeves, Sharp-Proof; Vest, Advanced; Vest, Concealable | split DR, and no tech level to read the footnote against | by hand, with the damage types each footnote on p. 59 names (#25) |
| Clothing, Extra Outfit | location "all" | by hand (#25) |
| Handheld Sprayer, Backpack Squirt Gun, Squirt Carbine | damage "spec." | by hand (#25) |
| Flare Gun | damage "1d+1 cr dkb inc" | by hand (#25) |
| MYS: Smite | noted, not rejected: priced for two levels, capped at two, where the book offers three | check against p. 44 in #28 |
| Camera, Digital and Camera, Film (Good), (Fine); Lockpicks (Good), (Fine); First Aid Kit (Good); Disguise Kit (Good), (Fine) | after GWorldVTT#138: quality variants | not items; quality is a field. The weights p. 54 gives for good and fine cameras go in the text |
| Basic Gear: Bandages, … | after GWorldVTT#138: the longer label for Basic Gear | not an item |

### GCA directives the parser ignores

The file changes other files' records with `#ReplaceTags`, `#MergeTags`,
`#Clone` and `#Delete`. None of these reach the packs, and the Basic Set's
records are never changed from here. What they express:

| Directive | Meaning | Plan |
|---|---|---|
| Blessed (Heroic Feat; attribute): cost 10/20, up to 2 | the crusader's two levels per attribute (p. 23) | this book's own records, by hand (#25) |
| `#Clone` Telekinesis as PK: Telekinesis, range 20, up to ST + Will | the psionic Telekinesis (p. 46) | this book's own record, by hand (#25) |
| Patrons: a message not to use it | the book's Patron (Light or Heavy Influence) replaces it (p. 24) | nothing; the two new Patrons are in the file |
| Magery gives +1 to a Magery score | helper for the Path skill ceiling | system code (GWorldVTT#144) |
| Thaumatology gives the Path default base | the Paths default to Thaumatology-6, capped at 12 (p. 33) | system code (GWorldVTT#144) |
| `#Delete` Path of Air … Path of Water | removes other books' Path skills from GCA's lists | nothing |
| Body Control, Mental Strength, Research: `needs()` cleared | GCA prerequisite bookkeeping | nothing |
| ST:Money starts at 100% of starting wealth | GCA sheet setup | nothing |

## Text: what the PDF looks like

For `tools/transcribe.mjs` (#23). Reading-order `pdftotext`, one page per form feed.

- **Power abilities** (pp. 40-48): a heading line "Name N points" (also "N points/level", or "20, 40, or 65 points"), then the text, then a line beginning "Statistics:". Some abilities are only "see p. NN". Spirit Channeling and Spirit Communication appear under both Mysticism and ESP.
- **Talents** (p. 24) and **perks** (p. 25): inline, "Name: text". Perks print no cost.
- **Heroic advantages** (pp. 23-24): a heading, then "see p. B40", then the text. Variants such as Ghost Weapon are run-in.
- **Wildcard skills** (pp. 29-31): the heading "Blade!", then the attribute alone on its line, then the text. Page 30 carries Lore!, Medic! and Talker!. **Blunt!** has no heading: it is one sentence in the warrior's notes on p. 20 (the file's `MH1:20` is right), saying it is Blade! for impact weapons.
- **Gear** (pp. 54-63): inline, "Name. text. $cost, weight." Table rows (protective clothing, firearms) have no text.
- **Templates** (pp. 9-21, 49-51): heading, cost line, flavour text, then "Attribute(s)" or "Attribute Modifiers:".

## System issues this book needs

GWorldVTT#138 parser cleanup (**merged**), #139 Talent skill lists, #140 powers
beyond psionics, #141 attacks on traits, #142 Vulnerability and Weakness, #143
holy attacks, #144-#147 Ritual Path Magic, #148 gadget and clothing improvements,
#149 weapon improvements, #150 special ammunition, #151 bonus and destiny points.
#152 is Basic Set cleanup found along the way; this book does not wait on it.

Not filed, by decision: Hearing Shots (p. 61), and a lens adding its unchosen
options to the template it is applied to (p. 6).

## Decisions (2026-09-13)

- This book goes ahead of Magic and Martial Arts. Its release waits on v0.1.0 (#10).
- The system implements the book's rules, all in a "Monster Hunters" group on
  the rules page, off by default.
- A Ritual Path Magic ritual is a `ritual` item type.
- Public issues paraphrase and cite pages. The book's text lives only here.
- The module ships this book as v0.2.0.
