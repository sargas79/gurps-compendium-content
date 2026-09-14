# Triage: GURPS Magic

Done on 2026-09-14, against the PDF and the GWorld system at v1.2.0, before any
of the book was extracted. Tracking: milestone **Magic**, issues #11 to #14
here, and sargas79/GWorldVTT#190 in the system.

| | |
|---|---|
| Book | GURPS Magic, Fourth Edition, 2004, 240 pages, 28 chapters and a spell table |
| PDF | one volume; **PDF page = book page + 2** |
| GCA file | `GURPS Magic 4e.gdf`, 1 Oct 2021 |
| Citations | `page(M23)`; spells the Basic Set also prints cite both, `page(M23, B243)` |
| Parsers | `--prefix M --book "Magic"` |
| Requires | the Basic Set file |

## The book, chapter by chapter

| Chapter | Pages | The GCA file gives | The system at v1.2.0 | Plan |
|---|---|---|---|---|
| 1. Principles of Magic | 5-15 | nothing | the Basic Set's magic system (Campaigns pp. 234-253), which this chapter reprints and extends | journal (#14). Optional rules the system lacks are text only, as candidates below |
| 2. Magic Items | 16-22 | Powerstone prices as 323 records | enchanting, item Power and the six Basic Set item enchantments | journal (#14); powerstones wait on GWorldVTT#190 |
| 3-26. The colleges | 23-198 | 891 spells, 100 of them the Basic Set's | spells with colleges, classes, prerequisites and costs | statistics (#12), text (#13); sidebars with rules go in the journal |
| 8. Enchantment spells | 56-71 | the spells; the item enchantments as GCA equipment modifiers | enchantments as a field on the item; energy and effects for the Basic Set's six | the spells as statistics; the enchantment modifiers are skipped. The extra effects are a candidate below |
| 20. Necromantic spells | 149-160 | the undead and demon templates | racial templates | templates by hand (#12); Black Magic and its critical table go in the journal |
| 21, 24, 26 | 165, 183, 198 | four meta-traits | the `metaTrait` template kind | by hand (#12) |
| 27. Variations | 199-209 | 24 Symbol Magic skills; 24 Syntactic Words written as spells | nothing | skills and Words as statistics; the systems themselves are text, as candidates below |
| 28. Alchemy | 210-222 | 136 elixir techniques (Alchemy and Herb Lore), 68 elixirs as equipment | techniques; plain equipment | statistics (#12), text (#13), journal (#14) |
| Appendix: Spell Table | 223-240 | nothing | nothing | nothing; the statistics hold it |

## Sections of the file, and where they go

| GCA section | System type | Pack | Notes |
|---|---|---|---|
| `[SPELLS]` | `spell` | `magic-spells` | 791 after the overlap filter; see below |
| `[SKILLS]`, Symbol Magic | `skill` | `magic-skills` | 24 symbols, IQ/Easy to Hard (p. 206) |
| `[SKILLS]`, Elixirs | `technique` | `magic-skills` | 68 elixirs × Alchemy and Herb Lore, Hard, defaulting to the skill at the elixir's penalty (p. 210) |
| `[EQUIPMENT]`, Magic | `equipment` | `magic-equipment` | the 68 elixirs at the common-magic price (p. 213) |
| `[EQUIPMENT]`, powerstones | `equipment` | `magic-equipment` | **waits on GWorldVTT#190**; see below |
| `[TEMPLATES]` | `template` | `magic-templates` | 12 racial templates and 4 meta-traits; **by hand**, since the parsers do not read this section |
| `[MODIFIERS]`, Extra Fatigue Points | `modifier` | `magic-modifiers` | "Usable only for spellcasting", -10% (p. 15), the book's one trait modifier |
| `[MODIFIERS]`, Magery | none | skip | One College Only is the Basic Set's (Characters p. 67) |
| `[MODIFIERS]`, spell attributes (DX-, Per-, Will-, HT-Based) | none | skip | GCA's switches for a spell's attribute |
| `[MODIFIERS]`, elixir forms (Herbal, Potion, Powder, Pastille, Ointment) | none | skip | a form is a choice made when buying or brewing, not a trait. Pastille's double cost goes in the text; a form field is a candidate below |
| `[MODIFIERS]`, equipment enchantments (Accuracy … Wish, Bane, Attune, Dancing, Speed, Skill) | none | skip | the system records enchantments on the item, and prices them rather than attaching modifiers |
| `[ADVANTAGES]` | none | skip | Syntactic Magery and Syntactic Magery 0 are GCA constructs citing Characters p. 66. The book's Words take plain Magery (p. 202) |
| `[ATTRIBUTES]` | none | skip | GCA's helpers for enchantment cost (Quick and Dirty threshold, Slow and Sure cost) |
| `[LISTS]`, `[GROUPS]` | none | skip | GCA's elixir list and 2,876 spell-by-college group entries |

## What the parsers make of it

Dry run with `npm run extract -- magic`.

| | Count | Notes |
|---|---|---|
| spells | 791 | in 24 colleges: Air 39, Animal 44, Body Control 55, Communication & Empathy 30, Earth 22, Enchantment 50, Fire 21, Food 24, Gate 28, Healing 33, Illusion & Creation 21, Knowledge 61, Light & Darkness 29, Making & Breaking 35, Meta-Spells 39, Mind Control 55, Movement 41, Necromancy 46, Plant 32, Protection & Warning 37, Sound 28, Technological 46, Water 59, Weather 28 |
| spell classes | | regular 485, area 115, information 59, enchantment 48, special 37, blocking 17 (plus 5 regular/blocking), missile 10, melee 5, and a few with two classes |
| overlap | 100 | every Basic Set spell, cited `M…, B…`, left to the system's pack and listed in `overlap.txt` |
| skills | 24 | the Symbol Magic symbols |
| techniques | 136 | 68 elixirs for each of Alchemy and Herb Lore |
| equipment | 391 | 68 elixirs and 323 powerstones |
| templates | 0 | the parsers do not read `[TEMPLATES]` |
| rejected | 35 | see below |

**Two spell parsers.** `parse-gdf.mjs` now writes spells itself, as
`magic-spells.json`, with the overlap filter. `extract.mjs` still also runs
`parse-gdf-spells.mjs`, which ignores `--prefix` for its file name and writes
`basic-set-spells.json`, 891 spells with no filter, into the book's own
folder. #12 has to stop extract from running the second parser for a book whose
spells the first already writes.

### Rejected, and what happens to each

| Record | Reason | Plan (#12) |
|---|---|---|
| Communicate … Water (Syntactic), 24 Words | "variant of a standard spell" | **kept by hand as skills**: each Word is an IQ/Very Hard skill, and a mage adds Magery to IQ when learning them (p. 202). Magery on a Word is a candidate below. The book lists 10 verbs and 14 nouns. The file follows the Word Parameters table (p. 204), which has Spirit where the list on p. 202 has Death, and the records keep the table's |
| Summon, Control, Create [type] Elemental | placeholder | nothing: the file also writes each element's three spells by name |
| Keen [Sense], Dull [Sense] | placeholder | nothing: the file writes Keen and Dull Hearing, Vision, and Taste and Smell, and the book describes them together as Keen (Sense) and Dull (Sense). #13 takes the family text for each |
| Talisman (%spellslist%), Amulet (%spellslist%) | placeholder | **kept by hand** as Talisman and Amulet, enchantment spells (p. 58) |
| Charm of %charmlist% (Alchemy), (Herb Lore) | placeholder | **dropped**: the book names no charm. Each is a technique defaulting to its elixir's technique-2 (p. 220), and that rule goes in the journal |
| Powerstone (Energy [Capacity]), One-College Powerstone (Energy [Capacity]) | placeholder | superseded by the kept records below |

### Powerstones

The file writes a Powerstone at every capacity from 1 to 100, and the same for
Dedicated and Exclusive stones, plus 23 One-College stones: 323 records that
differ only in capacity and price (p. 20). A Dedicated or Exclusive stone is
also a way of building a stone into a magic item (p. 70), not a separate thing
for sale.

**Needs the system first:** GWorldVTT#190 gives equipment a capacity, a
charge and a kind, prices a stone by capacity, and lets casting draw on it.
Until it is released and pinned, #12 leaves the 323 records out of the pack.
After that, it keeps Powerstone, One-College Powerstone and Manastone by hand,
each priced by its capacity.

## Templates, by hand (#12)

| Template | Page | Kind |
|---|---|---|
| Small Air, Earth, Fire and Water Elementals | 28, 55, 76, 191 | racial |
| Clay Golem | 59 | racial |
| Skull-Spirit | 150 | racial |
| Mummy, Skeleton, Zombie | 152 | racial |
| Demon | 155 | racial |
| Lich, Wraith | 160 | racial |
| Body of Wood, Body of Slime | 165 | meta-trait |
| Body of Plastic | 183 | meta-trait |
| Body of Lightning | 198 | meta-trait |

The file names the racial templates "(Magic)"; the book does not, so the
records drop it. Each must pass the system's stated-cost check.

## Rules the book adds that the system does not implement

This book's rules are text only in the journal (#14) unless the user decides
otherwise, as they did for Monster Hunters 1. No GWorldVTT issue is opened for
these yet. Each one would be an optional rule, off by default, in the Magic
group.

| Candidate | Pages |
|---|---|
| Magic Ingredients; Alternate Magic Rituals (optional rules) | 8-9 |
| Secret Spells; Finding a Teacher | 6, 9 |
| Multiply Enchanted Items; Enchantments Without Items or Spells; Interruptions | 18 |
| Buying and Selling Magic Items; Economics and Enchantment | 20-22 |
| The item enchantments beyond the Basic Set's six: Bane, Dancing, Defending, Ghost, Graceful, Loyal, Penetrating and Quick-Draw weapons; Flaming, Icy and Lightning weapons and missiles; Lighten; Spell Arrow and Spell Stone; Limiting Enchantments | 57-68, 75, 185, 198 |
| Devotional Enchantment | 71 |
| Black Magic and the Black Critical Table; Demonic Contracts | 156-157 |
| Clerical Magic, Ritual Magic, Alternate Prerequisites | 199-200 |
| Improvisational Magic, Wild Talents, Wildcard Magic, Spell Defaults | 201-202 |
| Syntactic Magic (Words with Magery, two rolls per spell) | 202-205 |
| Symbol Magic (casting and enchanting with symbols) | 205-209 |
| Alchemy: elixir forms and duration, brewing, the explosion table, laboratories, magic resistance | 210-213 |
| Alchemical Charms; Exotic Preparations | 220-222 |

## Rules sections for the journal (#14)

One page per section, in chapter folders: chapter 1 (pp. 5-15) and chapter 2
(pp. 16-22) section by section. Then the rules sidebars in the college chapters:
- Elemental Spirit Spells (27)
- Hybrids (29)
- Weapon and Armor Enchantments (62-68)
- Limiting Enchantments (68)
- Wizardly Tools (69)
- Devotional Enchantment (71)
- Scary Illusions (95)
- Divination (108)
- Linking Spells (130)
- Black Magic and Demonic Contracts (156-157)
- The Beaufort Scale (194)

Last, chapter 27 (pp. 199-209) and chapter 28 (pp. 210-222).
