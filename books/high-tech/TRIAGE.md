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
way.

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
  guns are all null too.

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
