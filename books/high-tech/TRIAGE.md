# Triage: GURPS High-Tech

Done on 2026-09-22 (#344), against the PDF and two copies of the GWorld system's
parsers: the pinned v1.25.0, and GWorldVTT main at v1.35.0-8 (f3f3e75), which carries
the parser work High-Tech asked for (sargas79/GWorldVTT#591 and #592). Nothing was
extracted for keeps: that is #345, after the submodule is pinned to a release carrying
both. Tracking: milestone **High-Tech**, plan #335, data #337.

| | |
|---|---|
| Book | GURPS High-Tech, Fourth Edition, 2007, eight chapters and the Gunmen appendix |
| PDF | one volume; **PDF page = book page + 1** |
| GCA file | `GURPS High-Tech 4e.gdf`, Eric B. Smith, October 2023, marked `Incomplete=Yes` |
| Citations | `page(HT120)`, the plain prefix; no record also cites a Basic Set page, so `overlap.txt` is empty |
| Parsers | `--prefix HT --book "High-Tech"`, modifiers from pp. 9-201 |
| Requires | the Basic Set file |

The file holds the appendix's gun perks and techniques, the armour and shields of
chapter 4 and the weapons of chapter 5, and nothing else: no general gear, accessories,
explosives, mines, melee weapons, covert-ops or medical gear, drugs or vehicles. Those
come from the PDF (#347) or by hand (#346).

## Sections of the file, and where they go

| GCA section | System type | Pack | Notes |
|---|---|---|---|
| `[PERKS]` | `trait`, perk | `high-tech-advantages` | 13 gun perks (pp. 249-250); Weapon Bond, Quick-Swap and Sure-Footed are also Martial Arts' records, and High-Tech keeps its own copies so it needs no other book (D1) |
| `[SKILLS]`, techniques | `technique` | `high-tech-skills` | 9 techniques (pp. 250-252) |
| `[SKILLS]`, placeholders | none | by hand (#346) | see [Skills and techniques](#skills-and-techniques) |
| `[EQUIPMENT]`, armour | `equipment` (armour) | `high-tech-equipment` | 95 after one exclusion; 7 rejected |
| `[EQUIPMENT]`, weapons | `equipment` | `high-tech-equipment` | 247 on the pin, 280 on main |
| `[MODIFIERS]` | none | skip | every one is a calculated field or a load; see [Modifiers](#modifiers) |

## What the parsers make of it

Dry runs with `npm run extract -- high-tech` (pinned), and with the same two parsers run
out of a detached GWorldVTT worktree at main into a scratch directory, the book's
exclude and patch rules then applied to that output as `extract.mjs --write` would, and
the result checked with each system's `validate-packs.mjs --src`.

| | v1.25.0 (pinned) | main (v1.35.0+) | Notes |
|---|---|---|---|
| perks | 13 | 13 | |
| techniques | 9 | 9 | 6 skill records rejected, below |
| armour | 95 | 95 | 7 rejected; 94 after the exclusion |
| weapons | 247 | 280 | 278 with attack modes on main; AN-M8 and AN-M14 have none |
| modifiers | 4 | 4 | all four excluded; 36 rejected |
| gear rejections | 60 | 7 | the 7 are the armour and shields below |
| validator, after the rules | 363 valid | 396 valid | 4 packs each |

### What #591 and #592 fixed

The 60 rejections on the pin, and what happens to them on main:

| Rejection on v1.25.0 | Count | Records | On main |
|---|---|---|---|
| Fragmentation written before the damage type, `[2d] cr ex`, on the only or every mode | 33 modes | 31 grenades, grenade launchers, mortars and rockets, lost whole | parse (#591) |
| The same on a Follow-up or Linked line | 16 modes | 16 guns kept without their follow-up or linked damage | parse, and attached to every sibling mode (#591); 49 modes carry one |
| A follow-up with no damage: drug effect, paint splat | 2 modes | Dan-Inject JM Standard, NSG SplatMaster | the mode is skipped with a reason; by hand (#346) |
| A placeholder attack: Smoke (7 yd.), Special | 2 modes | AN-M8, AN-M14, lost whole | kept with no attack mode; their effects are #378 and #379; by hand if they are to carry one (#346) |
| Split DR footnote and TL disagree | 4 | Silk Vest (TL6), Boots Steel-Toed, Closed-Dress Suit, Bulletproof Shield | still rejected, with the record named (#591); see below |
| No location | 3 | Riot Shield, Medium Entry Shield, Large Entry Shield | still rejected; see below |

Main also keeps the rate-of-fire marks (39 modes carry `#` or `!`, 4 a second rate) and
reads "first Range figure is minimum range" into `minRange` on 39 modes (#592).

### Still rejected on main: 7, all by hand (#346)

The four shields are shields, not armour: the file writes them as armour with no
location, and the Bulletproof Shield's `dr(10/80)` is its DR and HP, not a split. The
book's table is on p. 72 (the text is on p. 71); **the file cites p. 76 for all four**,
which is the rebreathers' page. By hand as shields with DB 2, 2, 2 and 3, DR/HP 10/80,
7/40, 12/40 and 12/60, cited p. 72.

The three armours are split DR the parser's TL check refuses, and each is a different
kind of split from the one it would have read:

| Record | Book | What it needs |
|---|---|---|
| Silk Vest (TL6) | 4/2*, the piercing-and-cutting split (p. 66 note 2) at TL6 | the ordinary split; the parser's rule that this footnote is TL7+ does not hold for this book |
| Boots, Steel-Toed | 6/2, the higher DR where the toe box protects (p. 68 note 4) | DR 2; the toe box is not modelled (#383) |
| Closed-Dress Suit | 6/2, DR 6 for the head and 2 elsewhere (p. 74 note 1) | DR 2 with `drByLocation` skull and face 6 |

The parser says "patch whichever is wrong", but `patch` runs on the records the parser
wrote, so a rejected record cannot be patched back in.

### Read wrongly without being rejected

**Names in braces, and inches as `''`. Needs a GWorldVTT parser fix before #345.** GCA
quotes a name holding a comma in braces, `{Colt M1851 Navy, .36 Caplock}`, and the
system's reader (`nameOf` in `tools/gdf.mjs`) strips double quotes but not braces: 258
of the 280 weapons on main keep them. 21 names also write the book's inch mark as two
apostrophes (`12G 2.75''` for 12G 2.75", p. 105; `Hale 9-pr Mk I, 2.5''`, p. 150). This
is book-neutral (every GCA file quotes this way) and 258 name patches is not the fix.
The patterns in book.json take a name with or without its braces, so they hold either
way. **Fixed** by sargas79/GWorldVTT#627 (braces dropped); the inch mark stays `''`,
as the system's own names spell it.

**Malfunction.** The file has no `malf()` field, so every mode comes out with
`malfunction: null`, which the system reads as a weapon that never jams.

- 44 records give their Malf. in a note ("Unreliable. Malfunctions on 16+", the Grenade à
  Main's "Malf. is 14"): **patched** in book.json, one rule per number (14: 2, 15: 2,
  16: 40). All 44 are single-mode records.
- 8 records are "Very Reliable" and will not malfunction unless neglect lowers Malf.
  (Glock 17, SIG-Sauer P226, H&K USP, H&K G11, Voere VEC91, GE M61A1, GE M134, Hughes
  M242). Null is the nearest the system has; the maintenance rule is #364's.
- **Open, for #345 and #364:** the other 207 guns, launchers and missiles (160 Guns,
  18 Gunner, 27 Artillery, 2 Guns Sport) print no Malf. at all, because the book's
  tables have no Malf. column; its reliability rules count up from 17 (p. 79). Left null
  they never jam. The fix is either a default the parser applies to firearms (a
  book-neutral GWorldVTT issue) or a generated patch in #345; not done here. Ultra-Tech's
  guns are all null too. **Decided in #345:** Malf. 17, below.

**Split DR by footnote.** The parser reads every `a/b` split as the high-tech one
(higher DR against piercing and cutting). The book has six kinds; patched:

| Records | Book | Patch |
|---|---|---|
| Hard Hat, Motorcycle Helmet, Football Helmet, Hockey Helmet; Shoulder Pads | higher DR against crushing only (p. 70 note 2; p. 66 note 4) | lower DR for everything but crushing |
| Sharp-Protective Armor (sleeves, leggings), Sharp-Protective Gloves | higher DR against impaling and cutting (p. 68 note 2, p. 69 note 2) | lower DR for everything but those |
| Advanced Body Armor | lower DR against crushing only (p. 66 note 5) | lower DR for crushing |
| Fireproof Suit, Turnout Gear | higher DR against burning only (p. 75 note 4) | lower DR for everything but burning |
| Biohazard Suit, NBC Suit, Space Suit, Space Suit EVA | the suit's DR is against burning and corrosion only (p. 75 note 2) | DR 0 for everything else |
| Boots, Jungle; Boots, Blast; Boots, Firefighter | higher DR when struck from beneath (p. 68 note 5) | the higher figure as `soleDr`; the Firefighter's toe box (note 4) is not modelled |
| Hard-Hat Suit | DR 6 for the head, 2 elsewhere (p. 74 note 1) | DR 2 with `drByLocation` skull and face 6 |

Not patched, for #383: the TL7 Fragmentation Vest's DR 8 to the vitals from the front
(p. 66 note 3), and the Bomb Disposal Suit's 20 from the front and 5 from elsewhere,
with DR 7 on the head and 5 on the limbs (p. 75 note 10). The system has no split by
direction.

**Minimum ranges.** The guided-missile table's shared note (p. 152 note 1) gives each
missile's minimum range, which the parser cannot tie to one record: **patched** into
`minRange` (MILAN 30; TOW, Dragon and Javelin 70; Stinger 220; SS.11 and 9M14M 550;
Sidewinder 1,100). The Javelin's top attack is 165, which is not a mode of its own.
`minRange` is gworld 1.35.0's, so these apply once #345 pins.

**Grenades.**

| Record | Book (p. 192) | |
|---|---|---|
| Diehl DM51 (w/ and w/o Frag Sleeve) | one grenade, 3d+2 [3d], with a removable sleeve; without it 5d, Wt. 0.3 (note 6, p. 193) | two records stay, since the sleeve changes the weight; renamed Diehl DM51 and Diehl DM51 (Without Sleeve), modes renamed "attack", Bulk -2 (the file's named modes lose the record's Bulk). **Patched** |
| M452 Stingball | Bulk -1; a linked HT-5 stun over 10 yards | Bulk and the linked stun **patched**; the area is not modelled |
| Schermuly Stun | HT-5 affliction over 10 yards (note 7) | parsed as the affliction; the area is not modelled (#379) |
| M34 WP | 2d [1d(0.2)] burn ex | the fragments' armour divisor (0.2) is lost; #345 checks it, #379 |
| 15 thrown grenades | range from the Throwing Distance table | the parser leaves range to the system's thrown-weapon rule; nothing to do |

**Trauma plates.** The file writes "Fragmentation Vest Trauma Plates (TL 7)" as well as
the improved vest's; the book prints plates for the TL7 improved vest only (p. 66).
**Excluded.**

### Name fixes, checked against the page

| The file's name | The book's | Page | |
|---|---|---|---|
| Mills Number 36M MK II | AMC MK II | table p. 192, description p. 191 (the American "pineapple", 1920-1942) | patched |
| Mills Number 36M MK III | AMC MK III | table p. 192, description p. 191 (the American concussion grenade) | patched |
| OTZ LPO-50 | TOZ LPO-50 | table p. 179, description p. 180 | patched |
| Webley-Fosbery  Mk  I, .455  Webley (doubled spaces) | Webley-Fosbery Mk I, .455 Webley | p. 94 | patched |
| Diehl DM51 (w/Frag Sleeve), (w/o Frag Sleeve) | Diehl DM51 | p. 192 | patched, above |
| Bulletproof, Riot, Medium and Large Entry Shield, cited p. 76 | the same names, p. 72 | p. 72 (text p. 71) | by hand (#346), since they are rejected |

## Folded stocks and bipods: modes, for now

43 weapons write a folded stock or a bipod as a second mode with its own Bulk, ST or
Acc: 21 with "Folded Stock", 21 with "w/o Bipod" and "w/ Bipod", and the MAC AA7.62NF1
with both (four modes). Main reports each one (#591). **They stay modes.** A mode is
how the system shows two sets of figures on one weapon today, and the choice is a Ready
maneuver away in play. Whether a stock or a bipod becomes a state of the weapon, or a
derived mode, is #372's decision (p. 160), and #372 can collapse the pairs when it does.
The Dragon's and the Javelin's "bipod" pairs are the launcher's own mount and are in the
same list.

## Skills and techniques

| Record | Parser | Where it goes |
|---|---|---|
| 9 techniques: Close-Quarters Battle, Double-Loading, Fanning, Fast-Firing, Immediate Action, Instant Arsenal Disarm, Quick-Shot, Thumbing, Two-Handed Thumbing | parsed | #345; Immediate Action is IQ-based (p. 251), which the model has no field for, so the skill and penalty are kept |
| Precision Aiming | rejected: IQ-based default formula | by hand (#346) |
| Zen Marksmanship (%Gun Skills%) | rejected: placeholder name | by hand (#346), already listed there |
| Mounted Shooting (two forms) | rejected: placeholder name | by hand (#346): a technique specialised by weapon skill and mount, one record per pair a campaign needs |
| Targeted Attack (two forms) | rejected: placeholder name | the rule is Martial Arts' too (D1); #367 decides whether it is records or a rule |

Sure-Footed is written both unspecialised and as its three specialties (p. 250), as in
Martial Arts' pack.

## Modifiers

The file's `[MODIFIERS]` for these pages are equipment options, not trait modifiers.
Improvements to items are calculated fields that reprice the item, never modifier items.

| Modifiers | Parser | Where |
|---|---|---|
| Weapon Quality: Fine and Very Fine, (Accurate) and (Reliable) | written, as enhancements | **excluded**; gun quality is a calculated field (p. 79, #364) |
| Adjusting for SM, -4 to +10 (15) | rejected: cost multipliers | equipment for SM (#357) |
| Equipment: Disguised, Styling, Rugged, Cheap, Expensive; Compound (6) | rejected: cost multipliers | equipment options and combination gadgets (#357) |
| Ammo: Rifled Slug, Hollow-Point, Armor-Piercing, Hardcore, Frangible, APDS, APFSDS, Baton (15) | rejected: no cost | loads computed on the mode (#374, D5) |

## What is not in the file at all

About 850 priced items (#347); the improvised guns and grenades, rifle grenades and
combination weapons (#346); the calibre table (pp. 175-177) and the REF table (p. 183) as
data (#346); the 37 vehicles and the personal conveyances (#346, D6); the Way of the
Pistol style and the Equipment Bond perk (#346).

## For #345

1. Pin the release carrying #591 and #592 (gworld 1.35.0 or later), and wait for the
   brace-and-inch name fix above, or extract knowing 258 names will change again.
2. `npm run extract -- high-tech --write`: 13 perks, 9 techniques, 94 armour, 280
   weapons; the rules in book.json apply as listed (every rule matched on main's output).
3. Decide the default Malf. for the 207 weapons with none.
4. Check each weapon row against its table, especially where the parser's reading
   changed (grenade launchers, mortars, cannon, rockets, missiles, shotguns).

## Extracted in #345

Against GWorldVTT main at 5603140 (gworld 1.35.0 + #591, #592, #595 and #627's braces;
API 1.79.0): 13 perks, 9 techniques, 94 armour, 280 weapons (278 with attack modes).
`overlap.txt` is empty, as expected. Every rule above matched.

**Malf.** Basic Set p. B279 gives firearms and grenades a Malf. by TL (12, 14, 16, 17 at
TL3, 4, 5, 6+), but High-Tech marks every less reliable weapon in its tables, TL5
black-powder guns included ("Unreliable. Malfunctions on 16+", p. 94 note 3), and leaves
the TL5 cartridge guns beside them unmarked. So an unmarked weapon is Malf. 17 whatever
its TL. Three rules, in order: every `firearm` gets 17 on every mode (263), every hand
grenade 17 (15), the eight Very Reliable guns back to none (p. 101 note 4, p. 121
note 6, p. 137 note 3); the note rules above then set 14, 15 and 16 on the 44 marked.
A `where` and a `*` in a patch path (`tools/lib/patch.mjs`) make this three rules rather
than 270 names. Checked against the file's own notes: all 52 agree.

**Guided and homing.** The missiles' first Range figure is speed, not 1/2D (p. 152), which
the system reads from a mode's `guidance`: guided for the SS.11, 9M14M, TOW, MILAN and
Dragon (note 3), homing for the Sidewinder, Stinger and Javelin (note 5), aimed with
Artillery (Guided Missile) and attacking at the missile's own 10 (p. B413). **Patched**
in #345; since sargas79/GWorldVTT#632 (API 1.80.0) the parser reads the guidance and the
aiming skill from the notes itself, so #346 dropped those patches and keeps only the
homing missiles' skill of 10. The Javelin prints a follow-up and a linked blast; #632 lets
a mode keep both (`linked` and `linkedAlso`), so its patch went too.

**Ids.** Quick-Swap, Sure-Footed (three) and Weapon Bond are also Martial Arts' or Monster
Hunters 1's records, and Shoes, Climbing Monster Hunters 1's; the parser only steps aside
for the Basic Set's ids, so extract.mjs gives these six an id seeded with HT
(`tools/lib/ids.mjs`).

**Every weapon row against its table** (Acc, damage, range, RoF, Shots, ST, Bulk, Rcl,
cost, LC, and the follow-up or linked line), pp. 88-152, 179 and 192. Everything agrees
except:

| What | Records | |
|---|---|---|
| A scope's Acc (`scopeacc()`) is never read | 40 modes on 27 weapons: SVD 5+2, Barrett 6+3, the cannon, recoilless rifles, AGS-17, M29, TOW 3+3 ... | read into `scopeBonus` since sargas79/GWorldVTT#632; re-extracted in #346, all 40 agree with the tables |
| Second Rcl figure (slugs) of a shotgun with no Slug mode | Condor AM-402, Tower Blunderbuss, Manton Double, Colt Model 1855, Remington Hammer Lifter | a load, #374 |
| RoF 1/8, Shots 22 read as RoF 1, Shots 22(8) | Motovilikha D-81TM | the autoloader's cycle; left |
| A single Range figure written as 1/2D = Max | Tasertron TE-76, TASER M26, MBA Gyrojet | no halving either way; left |
| Follow-ups the parser skips (drug effect, paint splat) | Dan-Inject JM Standard, NSG SplatMaster | #346 |

**Blocked in the system:** the five armours whose higher DR is against crushing only
(Hard Hat, Motorcycle, Football and Hockey Helmet, Shoulder Pads) validate as packs but
the system's armour data model refuses them, so they can't be put on a character until
sargas79/GWorldVTT#629 (which Monster Hunters 1's Cup, Athletic and Helmet, Motorcycle
share). The data is right; nothing to change here. **Unblocked** by sargas79/GWorldVTT#630,
which the pin carries since #346.

## Kept by hand in #346

The pin moved to GWorldVTT main at 8d98c6c (API 1.80.0: #630's split DR without
crushing, #632's `scopeBonus`, `linkedAlso` and guidance from notes); gworld v1.36.0
(release PR sargas79/GWorldVTT#625) is that commit plus the version bump. Re-extracted: the
same 13 perks, 9 techniques, 94 armour and 280 weapons, now with 40 scope bonuses, and the
missile patches the parser made redundant removed (each checked by extracting without it).

Records, in `packs-src/<pack>/high-tech-by-hand.json`:

| Pack | Records | Pages |
|---|---|---|
| equipment | the four shields (DB 2, 2, 2, 3; DR/HP 10/80, 7/40, 12/40, 12/60) | 72 |
| equipment | Silk Vest (4/2*, the ordinary split, at TL6), Boots, Steel-Toed (DR 2; the toe box is #383), Closed-Dress Suit (DR 2, skull and face 6) | 66, 68, 74 |
| equipment | the Zip-Gun (Malf. 12) | 92 |
| equipment | Jam-Tin Grenade, with and without fragments, and the geballte Ladung; the book prints no Bulk or price, so Bulk 0 and $0 | 191 |
| equipment | four rifle grenades, the first Range figure as `minRange` (note 2) | 194 |
| equipment | the Sedgley Glove Pistol: a punch with Brawling, Boxing or Karate, the shot linked | 199 |
| skills | Zen Marksmanship (IQ/VH, no default) for Gyroc, Musket, Pistol, Rifle, Shotgun and SMG; the grenade launcher, LAW and LMG left out, as the text allows | 250 |
| skills | Guns Sport/TL (Musket) and (Pistol), the sport skills the air guns use (DX-4, Guns-3; p. B182) | 88 |
| skills | Precision Aiming (Guns-6) and Mounted Shooting (ranged skill-4; the mount named on the sheet) | 251 |
| advantages | Equipment Bond; Style Familiarity (Way of the Pistol), so the style needs no other book | 7, 252 |
| templates | the Way of the Pistol, 4 points, every entry pointing at this book's or the Basic Set's record; Targeted Attack, Whirlwind Attack and Guns Art have none | 252 |

Patched onto the extracted weapons (book.json, marked #346): the Dan-Inject's drug and the
SplatMaster's paint as follow-up lines with no damage; the AN-M8 as a thrown smoke grenade
(Special, 7-yard radius) and the AN-M14 as a thrown Special burn; the melee modes of the
Elgin Cutlass Pistol (large knife at -1), the NRS-2 (large knife) and the Condor AM-402
(baton with Shortsword).

Not done: the AM-402T variant (p. 199), the Sedgley glove's DR 1 and its one cartridge,
the rifle grenades' 1d+1 cr dud (note 2), and Targeted Attack, which is #367's.

### Vehicles and tables (#346, second part)

**Vehicles.** The 37 vehicles of chapter 8 (pp. 232-244) and the 15 personal conveyances
(pp. 230-232) are vehicle equipment in `equipment/high-tech-by-hand.json`, every table row
read by position and checked against the page, named for the section heading (maker and
model) and given the control skill its section's text names. The system's own fields carry
everything the tables print, split DR included, so none of them needs Ultra-Tech's
`vehicle` extension data (decision D6 predates `drOther`): `drOther` is the second figure
of a split, and the text's top and underbody armour, turrets, windows and gun tubs are
`drTop`, `drUnderbody` and `drByLocation` (GWorldVTT #622, API 1.79.0). As Ultra-Tech's
vehicles do, weight is the loaded weight and LC is left empty (the tables have none);
Range "F" (muscle-powered) and "-" are 0, and "fx" is kept as "x", since the field holds
one code.

Not representable, and left out: a turret's DR by face (the Panzer IV's 175/155/55, the
M4A1's 210/140/70, the T-72A's 1,375/420/180; `mainTurret` holds the front's), armour
that protects from one direction only (the fighters' canopies and cockpit armour, p. 237
and p. 238), spaced armour and skirts (p. 229), gun shields on one of several mounts, an
amphibian's Water Move (Ford GPA, BRDM-2), the kayaks' sail. The first and the last two
are book-neutral questions for the system.

**Tables.** Ultra-Tech keeps its warhead table as a TS data module beside the rules that
read it (`src/books/ultra-tech/warheads/catalogue.ts`), so these follow it: the ammunition
tables (pp. 175-177; 207 rows, the seven tables' WPS, CPS and footnotes) are
`src/books/high-tech/ammunition/calibres.ts`, with `calibreRows` to find a gun's calibre,
and the REF table (p. 183; 36 explosives) is `src/books/high-tech/explosives/ref.ts`. The
table spans pp. 176-177 (p. 175 is its introduction). No rule reads them yet: #374 prices
loads from the first, and the explosives rules the second.


### The catalogue, chapters 2 and 3 (#348)

**Captured.** `tools/capture-gear.mjs` read pp. 13-61 into
`equipment/high-tech-captured-core-general.json`: 482 records, and 34 more kept by hand in
`equipment/high-tech-by-hand.json`. Every one was read against its page. The tool is
Ultra-Tech's, taught the book's marks through `capture` in book.json rather than forked:
a label ends in a period, a heading can share its line with the text around it, a name
printed at several TLs is one item per TL ("Magnetic Tape (TL7)", "(TL8)"), weights come
in tons, prices in ranges (the lower is recorded), and batteries in the book's own sizes,
T to VL, with the count's multiplication sign the PDF's text loses. Re-run on its three
page ranges, Ultra-Tech's captures come out byte-identical.

**What reading the page settled** (101 `capture.set` rules, 2 skips, each with its reason):
names given the unit the price is for (per gallon, per 10 yards, box of 50, a meal); the
family heading's name made the item's (Windmill, Duplicator); ten figures read off the
wrong entry where reading order ran a sidebar into the text (the wristwatch and grooming
kit took the luxury watch's and the towel's prices; the hip flask's closing line fell
under the propane heading; dehydrated food took a bottle of alcohol's weight); food made
a consumable with no LC, as the book prints none; tools given the skills their quality is
for; and batteries the notation hides ("2×XS/yr.", "T/week", "VS/4 hrs." on the pocket
laser communicator, a size the battery list doesn't have, kept as printed with no cell).

**Kept by hand**: the six battery sizes (p. 13; TL5, where the text starts them), the
four libraries (priced per skill, with no TL of their own), the tool kits and workshop for
Electrician, Machinist, Armoury and Mechanic (the closing line prices the Electronics
Repair ones), the two chainsaws (a weapon table, p. 27), a cord of wood, business cards,
digital storage per GB, the pocket watch, towels, food by the case or crate, the luxuries
sidebar (p. 34), the 5.5" record, the 5-gallon can, iron spikes and pitons, the beaver
trap, and personal basics at 1% of the monthly cost of living (p. 59).

**Attacks.** The chainsaws, nail guns, hand ram, doorbuster, hydraulic door opener and
rescue spreader/cutters carry their attacks as modes, for #360's rules: the chainsaw's
(0.5) divisor against hard materials, the nail gun's -4 to skill and damage per second of
use are the rule's, not the record's.

**Batteries.** High-Tech registers its battery table (sizes, prices, weights, LC, p. 13)
with the shared cell engine, so the power data keeps its sizes; its switch, `batteries`,
is left to #358, which reads the rest of pp. 13-16.

**Left out**: services priced by the mile, word or month (mail, rail, telegrams, phone and
cell service), software and databases (priced by Complexity, p. 22), ice (priced by TL,
p. 32), maps (p. 53), recreational drugs (a range, and LC by local law), the alcohol still
sidebar (p. 15), and options and refills priced inside another item's text (extra
cylinders, blank strips, fuel canisters, film for the watch camera, ski climbers, bolts).
Bonuses the book gives without "(quality)" -- the compass's +1 to Navigation, the
shelters' survival modifiers, the HUD's +1 to Driving -- stay in the text, as Ultra-Tech's
intrinsic bonuses do.

### The catalogue, chapters 4 and 5: defences and firearm accessories (#349, first part)

**Captured.** `tools/capture-gear.mjs`, unchanged, read pp. 62-77 into
`equipment/high-tech-captured-defenses.json` (24 records) and pp. 153-161 into
`equipment/high-tech-captured-accessories.json` (59), with 11 skips and 19 `capture.set`
rules; 43 more are kept by hand in `equipment/high-tech-by-hand.json`. Every record was read
against its page. Re-run on pp. 13-61, #348's capture comes out unchanged.

**What reading the page settled:** the long coat's LC4 (clothing is LC4 unless the chapter
says otherwise, p. 62); the gas masks' closing line is their replaceable filter's; the air
tanks' is the small tank's; scopes and suppressors are priced per +1 Acc and per -1 Hearing,
named so; the TL5 scope weighs 3-4 lbs. (read as 34); the computer sights' closing line is
the thermal version's; the .22-caliber suppressor's label is hidden by the period in ".22",
so its family heading took its entry; a sentence of the TL6 sunglasses read as a label; and
the entry shields' table figures ran into the text (the shields are #346's).

**Kept by hand:**

| What | Pages | |
|---|---|---|
| 13 outfits | 63-64 | as a share of the cost of living (`costOfLivingPercent`), weights for TL7 garments (the Clothing Technology Table adjusts them, #381); hats as cloth (1%) and leather or felt (10%); undercover clothing at +1 and +2 (quality) to Holdout, priced on ordinary clothes (x5, x20); wet-weather gear as ordinary clothes at TL5 |
| the leather long coat | 64 | armour, DR 1, x5 cost and x2 weight |
| trauma and anti-stab plates | 67 | armour on the vitals or torso, from the front |
| armour the text prints beside the tables | 67-74 | the ISAPO (DR 30), the aircrew vest with a back plate, the heavy helmet's brow plate, the leather helmet with steel plates, the M1 helmet's liner, the TL8 hard hat (half price), TL7-8 arctic boots (x2 cost, half weight), the TL8 biohazard suit (x2 cost; its PF 2.5 is #382's) |
| goggles, sunglasses (TL5, TL6), ballistic sunglasses, the cup | 71 | armour with the DR the text gives; the cup DR 2 against crushing and 1 otherwise, from the front |
| homemade armour | 71 | paper and tape, and a plastic bucket: DR 3 on the torso, no price |
| medium and large air tanks | 74 | |
| camouflage and scent masking | 76-77 | priced as a share of the clothing's own price, so each is kept on ordinary clothes (20% of cost of living): simple at no extra cost (+1 quality), basic x2 (+2), advanced x3 (+3, fine as the ghillie suit's), reversible with two basic patterns x3, scent masking x3 |
| the night-vision computer sights | 157 | the text's first price |
| accessory rails | 161 | one position, and three or four (three facings, 0.2 lb. each) |

**Left out, and why:** armour materials (steel, smart foam, titanium, p. 65) and blade
materials are calculated fields that reprice an item (#383, #380), never items of their own;
extended, drum and high-density magazines are priced from the gun's ammunition (WPS) by
formula (p. 155; #372); tripods and mounts vary by weapon; the brass catchers' half weight at
TL8, the combined targeting laser and light, and the diving rig's compressor and hose reels
are options priced inside another item's text, as #348 left them. Knee or elbow pads stay
gear: their DR 3 protects 2/6 of a joint when kneeling, falling or struck (#383, #384). The
Protected Hearing and Vision, Nictitating Membrane and Ham-Fisted that eye, ear and hand
protection grant are #384's.
