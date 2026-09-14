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

Hand-kept records live in `packs-src/<pack>/monster-hunters-1-by-hand.json`. The
parser never writes those files, and a name in one takes precedence over the data file's
record: the parser reports it as a "duplicate name" and leaves it to the hand-kept
file.

| Record | Reason | Outcome (#25) |
|---|---|---|
| Higher Purpose (Hunt [monsters]) | placeholder | **kept by hand** as Higher Purpose (Hunt a Specific Type of Monster), p. 24. Acquire Knowledge and Defend the Faith, the other two forms, come from the file |
| Weapon Bond (%WeaponList%) | placeholder | kept by the parser as Weapon Bond since GWorldVTT#138 |
| Lab, Belt / Box / Field / Shop; Tool Kit, the same | placeholder `[skill]` | **kept by hand**, eight records at p. 56's prices and weights. Grade: Belt improvised (-2), Box basic, Field good (+1), Shop fine (+2); the skill is set on the item. The Electronics Repair kits come from the file |
| Grimoire (+2 to +10 to [ritual]) | placeholder | **kept by hand**, nine records at the p. 57 Grimoire Table's prices and weights, each carrying its bonus in the grimoire field (GWorldVTT#147); the ritual is bound on the character. Grimoire Collection comes from the file |
| Boots, Reinforced; Cup, Athletic; Helmet, Motorcycle; Leggings, Sharp-Proof; Sleeves, Sharp-Proof; Vest, Advanced; Vest, Concealable | split DR, and no tech level to read the footnote against | **kept by hand** with each footnote on p. 59: the boots' higher DR on the sole; the cup and helmet at their higher DR only against crushing (the cup front only); the leggings and sleeves higher only against cutting and impaling; the advanced vest lower against crushing; the concealable vest higher against cutting and piercing. The system validator's Basic Set assumption that crushing takes the lower figure was narrowed in GWorldVTT#178 |
| Clothing, Extra Outfit | location "all" | **kept by hand**, covering every hit location |
| Coat, Long; Coat, Long Leather | not rejected, but the file has no Holdout | **kept by hand** with note [2]'s +4 Holdout (GWorldVTT#148), under their published ids |
| Handheld Sprayer, Backpack Squirt Gun, Squirt Carbine | damage "spec." | **kept by hand** from the p. 62 table: Liquid Projector skills, special damage, range, shots, ST, Bulk and reservoir price |
| Flare Gun | damage "1d+1 cr dkb inc" | **kept by hand** as an improvised firearm (p. 62): 1d+1(0.5) cr, 10/330, Shots 1(3), Guns at -4. Double knockback and incendiary effects go in the text (#30) |
| MYS: Smite | priced for two levels, capped at two, with the level names 1d/2d/3d, where the book offers three | **kept by hand** (#51) at 20/30/40 points for 2d/3d/4d (p. 44), once GWorldVTT#184 let a hand-kept trait replace the file's record |
| Camera, Digital and Camera, Film (Good), (Fine); Lockpicks (Good), (Fine); First Aid Kit (Good); Disguise Kit (Good), (Fine) | quality variants | **deliberately dropped**: quality is a field on the item. The weights p. 54 gives for good and fine cameras go in the text |
| Basic Gear: Bandages, … | the longer label for Basic Gear | **deliberately dropped**: not an item |

The directives below are also kept by hand: Blessed (Heroic Feats, ST), (DX) and
(HT) at 10 points a level up to 2 (p. 23), and PK: Telekinesis at 5 points a level
(pp. 46-47), whose cap of ST + Will has no field.

Found along the way: the file caps the six power Talents (Bioenhancement,
Mysticism, ESP, Psychokinesis, Telepathy and Teleportation) at 4 levels, where
p. 40 allows six. Until GWorldVTT#184, a trait couldn't be kept by hand under a
name the file also writes. Since #51 all six are kept by hand at 6 levels, under
their published ids, and the parser reports each of them as "kept by hand".

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

## Templates, kept by hand (#26, #27)

`packs-src/templates/monster-hunters-1-by-hand.json` holds the ten 400-point
character templates (pp. 9-21), the ten 15-point motivational lenses
(pp. 6-9, `kind: "lens"`), and the six 200-point racial templates (pp. 49-51,
`kind: "racial"`). Every one passes the system's stated-cost check.

The racial templates (#27):

- **Modifiers.** Attribute and secondary modifiers are granted, and the cost
  the book prints for them is `attributeCost`. For example, the vampire's is
  ST+5, DX+2, HT+2, Per+2 and Basic Speed+1.00, which comes to 140.
- **The demon's packages.** "Three of these 25-point racial packages" is a
  75-point points group holding every package's traits, labelled with the
  nine packages. It is not a count group, because six of the packages are two
  or three traits, and a count group counts items. Package 8's DR 6 in place
  of DR 4 is an 18-point option on its own.
- **The were-form** is a count group of four 0-point records, "Were-form
  (Bear)" and so on, with the form's traits in the note. The form is paid for
  by the template's Alternate Form [140], and its traits apply only while
  transformed. The system has no alternate forms. Applying a form's traits as
  a template would move the character's own attributes for good and bill them
  a second time. A separate template per form was ruled out too: the forms'
  traits don't add up to one figure (the book suggests about 125 points of
  traits for a new form, and its own forms price differently), so any stated
  cost would be ours rather than the book's. The record keeps the choice on
  the sheet until alternate forms exist.
- **Native languages** (Demontongue, Adamic) are language items, spoken and
  written at native level, which bills the 6 points printed.
- **Taboo traits.** None are printed. The book only says that racial
  disadvantages can't be bought off, and that every template leaves out
  Unaging. The features are the "Features:" lines, plus short notes of rules
  the page states about the race.

How the book's lists become choice groups:

- **The lens slot** in every template, and the inhuman's 200-point racial
  template, are points groups with no options: the lens or race is applied as a
  template of its own. The apply dialog shows such a group as chosen apart from
  the template (GWorldVTT#180). A template applied alone therefore bills 385,
  and 400 once its lens is applied. (#26 originally said Witch plus Chosen One
  bills 415; the book's 400 already includes the lens.)
- **"Another X points chosen from among the previous traits or …"** is joined
  to the list before it: one points group for both amounts, labelled with the
  split. The dialog does not hold a player to the first list's share.
- **"One of", "two of" and so on** are count groups. A skill offered in several
  specialties, such as Guns (Pistol, Rifle, Shotgun, or SMG), is one option
  per specialty.
- **Power allotments** (75 points of Mysticism, 60 of Bioenhancement, 100 of
  psionic abilities and 20 of psionic Talents) are points groups over this
  book's abilities, each at its level-1 cost.
- **Know Thy Enemy** (p. 16) allotments are points groups over its skills at
  2 points, or 4 for the inhuman's own race. The psi's and the witch's leave out
  the skills for their own kind.
- **Packages** are each one points group holding every package's skills, with
  the packages spelled out in the label: the sleuth's wildcards, the
  experiment's unarmed skills, the warrior's ranged skills, the inhuman's
  subject-matter skills, the philanthropist's Wealth, and the avenger/atoner's
  skills.
- **Points spent raising what the sheet already has**, such as "or 12 points
  to raise Gun! by one level" or a skill "at -2", go in the group's label rather
  than being offered as options. The soldier lens's 4 points are a requirement
  of their own, so they are a group with no options.
- **A lens's unchosen options** that join the template's lists are listed as
  the lens's features. The system doesn't merge them, by decision (below).
- **[Varies]** is priced at the cheapest real level and noted "varies":
  Wealth 10 or -10, Appearance 4 or -4, Reputation 5 or -5, Sense of Duty -2,
  Resistant and Signature Gear 1, and -5 for the other disadvantages.
- **A self-control number** goes in the entry's note rather than its name, so
  Greed (12) is Greed.

An entry links its compendium document, from this book's packs first and then
the Basic Set's. With GWorldVTT#180 the item carries the template's cost and
keeps a qualifier the document lacks, as with Vow (Never kill a human).

A document priced per level can carry any cost, because `points` makes up the
difference. That is how Damage Resistance 4 (Tough Skin, -40%) bills 12. A
tabled document is different: it can only carry a cost that is one of its
steps. So an entry priced off the table, by a modifier or a partial level, is
not linked.

These names have no document, or are not linked, and apply as plain items
with the entry's name and cost:

| Entries | Why |
|---|---|
| ST, DX, IQ, HT, HP, FP, Will, Per and Basic Speed options | bought on the sheet, as in the Basic Set templates |
| Extraordinary and Ridiculous Luck, Enhanced Time Sense in place of Combat Reflexes, higher Magery, Mysticism Talent, Parapsychologist and Craftiness, worse self-control for Curious and Compulsive Gadgeteering | upgrades of a trait the template already has |
| Language (any); Demontongue and Adamic | a language is its own item. Language (any) bills 6 (native) until its levels are set on the sheet |
| Acute Senses, Armoury, Bioengineering, Current Affairs, Driving, Innate Attack, Quick Reload and Thrown Weapon, each "(any)" | no one document to link |
| Addiction (Psi-Boost), Bad Sight (Mitigator, Glasses, -60%), Compulsive Gadgeteering, Current Affairs (Regional), Disciplines of Faith, Enhanced Parry (Blade!) and (All Weapons), Gun Fu Perks, Mechanic in five specialties; Can burn HP for extra effort, Enhanced Move 0.5 (Air), Immunity to Transformation, Striker (Horns), Supernatural Features, Teeth (Sharp) | in neither pack |
| Enemies, in three forms | the Basic Set pack files Enemy only by the size of the group |
| Ally (Sidekick) [4, 6, or 8], Resistant [Varies] at 1; Appearance (Handsome; Androgynous; Universal), Regeneration (Fast; Cannot heal damage from silver), Terror (Audible; Takes Recharge), Weakness (Sunlight; Variable) | priced off the document's cost table |
| DR 6 in place of DR 4 (demon package 8) | an upgrade of the DR the template already has |
| Were-form (Bear), (Eagle), (Tiger), (Wolf) | the chosen form, recorded at 0 points (above) |

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
Also found along the way and merged: #174 and #176 (extraction), #178 (the
split-DR validator check), and #180 (applying template entries that link a
document).

Not filed, by decision: Hearing Shots (p. 61), and a lens adding its unchosen
options to the template it is applied to (p. 6).

## Decisions (2026-09-13)

- This book goes ahead of Magic and Martial Arts. Its release waits on v0.1.0 (#10).
- The system implements the book's rules, all in a "Monster Hunters" group on
  the rules page, off by default.
- A Ritual Path Magic ritual is a `ritual` item type.
- Public issues paraphrase and cite pages. The book's text lives only here.
- The module ships this book as v0.2.0.
