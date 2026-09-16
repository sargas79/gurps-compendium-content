# Triage: GURPS Martial Arts

Done on 2026-09-14, against the PDF and the GWorld system at v1.2.0, before any
of the book was extracted for keeps. Tracking: milestone **Martial Arts**, issues
#15 to #18 here, and sargas79/GWorldVTT#193 to #196 and #199 in the system.

| | |
|---|---|
| Book | GURPS Martial Arts, Fourth Edition, 2007, seven chapters |
| PDF | one volume, 258 pages; **PDF page = book page + 1** |
| GCA file | `GURPS Martial Arts 4e.gdf`, 3 July 2022 (the header says styles are partly done and character templates not done; both are present) |
| Citations | `page(MA65)`; records the Basic Set also prints cite both, `page(MA65, B230)` |
| Parsers | `--prefix MA --book "Martial Arts"`, modifiers from p. 44 |
| Requires | the Basic Set file |

## The book, chapter by chapter

| Chapter | Pages | The GCA file gives | The system at v1.2.0 | Plan |
|---|---|---|---|---|
| Introduction | 4 | nothing | nothing needed | nothing |
| 1. History | 5-27 | nothing | nothing needed | nothing; background only |
| 2. Characters: power level, 11 character templates with Cinematic and Tough Guy lenses, advantages, perks, disadvantages, skills | 28-62 | the templates; 3 advantages, 169 perks, 2 disadvantages, 7 new skills, sports specialties of Games | character and lens templates; perks; Talents with skill lists; the Basic Set's Art and Sport versions of combat skills | statistics (#16), templates by hand; text (#17); the chapter's rules in the journal (#18) |
| 3. Techniques: learning them, realistic and cinematic techniques, creating new ones | 63-95 | 723 technique records for 133 techniques, 286 of them GCA placeholders | techniques bought off a default penalty against one named skill, with a ceiling | statistics (#16), with the gaps below; the optional rules (Targeted Attacks, Combinations) are candidates |
| 4. Combat: expanded maneuvers, additional options, cinematic combat, tournaments, injury and recovery | 96-139 | nothing | the Basic Set's maneuvers and options behind rule switches | journal (#18); new options are candidates below |
| 5. Styles: components, choosing and buying a style, historical and modern styles, five fictional ones | 140-210 | 117 style templates (styles and their variants), with the style lists in `[LISTS]` and `[GROUPS]` | character templates with required entries and choice groups | styles as character templates, by hand from the file's lists (#16) |
| 6. Weapons and Equipment | 211-234 | 83 melee and muscle-powered ranged weapons; weapon options as equipment modifiers | weapons with attack modes; quality as calculated fields | weapons as statistics (#16); weapon options are candidates |
| 7. Campaigns | 235-250 | nothing | nothing needed | journal where it gives rules (#18) |
| Glossary, Bibliography, Index | 251-256 | nothing | nothing | nothing |

## Sections of the file, and where they go

| GCA section | System type | Pack | Notes |
|---|---|---|---|
| `[ADVANTAGES]` | `trait`, category advantage | `martial-arts-advantages` | Forceful Chi and Inner Balance (Talents, 15/level, skill lists in `[GROUPS]`), Heroic Archer |
| `[PERKS]` | `trait`, category perk | `martial-arts-advantages` | 47 realistic style perks, 7 cinematic, 119 Style Familiarity perks, one per style |
| `[DISADVANTAGES]` | `trait`, category disadvantage | none | Code of Honor (Bushido) and (Xia) cite the Basic Set; see [Overlap](#overlap) |
| `[SKILLS]`, skills | `skill` | `martial-arts-skills` | Hypnotic Hands, Lizard Climb, Precognitive Parry, Sensitivity, Force Saber (and its Art and Sport) |
| `[SKILLS]`, techniques | `technique` | `martial-arts-skills` | see [Techniques](#techniques) |
| `[SKILLS]`, Combination (2 and 3 Attack) | none | skip | GCA's way of writing the optional Combinations rule (p. 80); a candidate below |
| `[SKILLS]`, Art and Sport skills | none | skip | the Art and Sport versions of combat skills (p. 55) are the Basic Set's, already in the system's pack |
| directives: `#Clone` of 143 weapons, `#Delete` of six Basic Set techniques | none | skip | the clones are the book's alternative names for weapons (Bo for a quarterstaff); the deletions make way for the any-weapon forms of Sweep and Whirlwind Attack (sargas79/GWorldVTT#194) |
| `[TEMPLATES]`, Styles | `template`, character | `martial-arts-templates` | 117; **by hand**, since the parsers do not read this section |
| `[TEMPLATES]`, character templates | `template`, character and lens | `martial-arts-templates` | 11 templates and 16 lenses: a Cinematic lens for each, the Tough Guy lens four templates share, and four realistic Warrior lenses the file lacks; **by hand** from the book |
| `[EQUIPMENT]` | `equipment` | `martial-arts-equipment` | 83 weapons, 82 with attack modes |
| `[MODIFIERS]`, Extra Attack | `modifier` | `martial-arts-modifiers` | Multi-Strike (p. 44); Single Skill is a placeholder and is written by hand |
| `[MODIFIERS]`, equipment | none | skip | weapon quality (balance), combination weapons, hilt punch and similar: improvements are calculated fields on the item, never modifier items; candidates below |
| `[MODIFIERS]`, combat table entries | none | skip | GCA's bookkeeping for punches and kicks with gloves or boots |
| `[LISTS]`, `[GROUPS]` | none | skip | the styles' skill, technique and perk lists, and the Talents' skill lists; read when writing the styles and the Talents |
| `[SKILLTYPES]`, `[FEATURES]` | none | skip | GCA's helpers for techniques and styles |

## What the parsers make of it

Dry run with `npm run extract -- martial-arts`.

| | Count | Notes |
|---|---|---|
| traits | 172 | 3 advantages, 169 perks; 4 placeholders rejected |
| skills | 7 | the book's new skills |
| techniques | 312 | of 723 records; see below |
| equipment | 83 | 14 attack modes rejected; see below |
| modifiers | 1 | Multi-Strike |
| overlap | 63 | records citing a Basic Set page, left to the system's packs and listed in `overlap.txt` |

### Techniques

| Kind | Records | Techniques | What happens |
|---|---|---|---|
| Off a named skill | 337 | 71 | parsed (312 after the overlap) |
| Off a placeholder skill: "Disarming ([Melee Combat Skill])", "Arm Lock (%Melee Weapon Skill%)" | 253 | 96 | rejected; **needs the system first** |
| Off a defense: Parry, Block or Dodge (Aggressive Parry, Dual-Weapon Defense, Eye-Poke Defense, Hand Catch, Hand-Clap Parry, Jam, Low-Line Defense, Timed Defense, Trip) | 90 | 9 | parsed since sargas79/GWorldVTT#230, and re-extracted in #219 |
| Off an attribute, as one of their defaults (Backbreaker, Beat, Halitosis Attack, Handcuffing, Head Butt, Leg Grapple, Neck Snap, Piledriver, Retain Weapon, Ruse, Snap Weapon, Wrench Arm, Wrench Leg, Wrench Spine, and their Art and Sport versions) | 43 | 15 | rejected where the attribute default comes first; **needs the system first** |

Many techniques have more than one default. The parser reads the first, so a
technique whose first default is an attribute is rejected even when its second is
a skill.

### Equipment

Fourteen attack modes are rejected. Ten of them add the wielder's punching bonus
for Brawling, Boxing or Karate to their damage (hilt punches, butt jabs and the
like), and the system applies that bonus only to natural attacks: **needs the
system first** (sargas79/GWorldVTT#196), and until then those modes are left off
their weapons (Backsword, Hook Sword, Mensurschläger and Tonfa keep their other
modes). The Weighted Scarf's Garrote, whose "spec." damage has no type, is kept
by hand.

Found while writing the statistics: seven weapons have a mode used at -2 to hit
with its skill, which the file writes into every entry of the skill list (Combat
Fan, Qian Kun Ri Yue Dao, Three-Part Staff, Trident, Large Hungamunga, Hungamunga,
Large Throwing Knife, and Chigoridani among the overlap). Attack modes have no
to-hit modifier, so these wait on sargas79/GWorldVTT#199 and are excluded.

## Overlap

Sixty-three records cite a Basic Set page. Checked against the system's packs:

- **Already in the system's packs, unchanged here:** Shtick; the Basic Set's
  Arm Lock, Back Kick, Choke Hold, Elbow Strike, Horse Archery, Jump Kick,
  Kicking, Knee Strike, Sweeping Kick and Dual-Weapon Attack techniques; Bolas and
  Shuriken. The techniques match the Basic Set's statistics (but see below); Bolas
  and Shuriken are compared with the book's weapon tables in #16.
- **New specialties of Basic Set skills and traits, to add by hand:**
  - Fast-Draw (Balisong, Flexible, Shuriken, Stone, Tonfa)
  - Thrown Weapon (Disc)
  - Hidden Lore (Hidden Styles)
  - Games for 17 sports, Riding (Equines), Philosophy (Buddhism, Dragon
    Temple, Taoism), Theology (Hinduism) and Hobby Skill (Feats of Strength) need
    nothing: the system's pack has a generic Games, Philosophy, Theology and Hobby
    Skill, and Riding (Equines) itself
  - Code of Honor (Bushido) and (Xia)
- **New techniques for skills the Basic Set's list lacks, to add by hand:**
  - Arm Lock (Tonfa)
  - Finger Lock off either Arm Lock needs nothing: the system's Finger Lock
    (Judo) and (Wrestling) are the same techniques
  - Neck Snap, once the system takes a technique off an attribute
- **New weapons the Basic Set only mentions, to add by hand:** Okusarigama,
  Rokushaku Kama, Ahlspiess, and Chigoridani once sargas79/GWorldVTT#199 ships.

**Found while checking:** the system's Basic Set techniques pack has two errors
that this book's reprints expose. Dual-Weapon Attack defaults to skill-4 (p. B230)
but ships at no penalty. Whirlwind Attack (Two-Handed Sword) ships with
Disarming's default and ceiling instead of skill-5 capped at skill (p. B232).
Filed as sargas79/GWorldVTT#193.

## Needs the system first

Opened in the system. Until each ships and the pin moves, #16 leaves out the
records it blocks, as Magic did for powerstones.

- **A technique bought against a skill chosen when it is added**, such as
  Disarming for any Melee Weapon skill (sargas79/GWorldVTT#194): 253 records
  under 96 names. In the pack since #219, each reading its own choice list
  (sargas79/GWorldVTT#368).
- **A technique that defaults to a defense or an attribute**
  (sargas79/GWorldVTT#195): 24 techniques, with their Art and Sport versions.
  Parsed since sargas79/GWorldVTT#230, and in the pack since #219. A default that
  rebases a technique on an attribute (Snap Weapon's ST-DX) keeps the skill and
  its penalty; the rebasing has no field in the model.
- **An equipment attack that adds the unarmed-skill damage bonus**
  (sargas79/GWorldVTT#196): 10 attack modes. In the pack since #219, with the
  three weapons that had nothing else (Bladed Hand, Myrmex, Sap Glove).
- **A melee attack mode used at a penalty to hit** (sargas79/GWorldVTT#199):
  13 modes on eight weapons.
- **The Basic Set technique data errors** above (sargas79/GWorldVTT#193).
  Nothing here waits on it, but the reprints should agree once it ships.

## Rules the book adds that the system does not implement

Book rules are text only in the journal (#18) unless the user decides otherwise,
as with Monster Hunters 1 and Magic. No system issue is opened for these yet.
Each would be an optional rule, off by default.

| Candidate | Pages |
|---|---|
| Buying techniques: default penalties, ceilings, and "Techniques That Aren't" | 64-66 |
| Optional rule: Targeted Attacks | 68 |
| Optional rule: Combinations | 80 |
| Cinematic techniques and their prerequisites (Trained by a Master, Weapon Master) | 82-88 |
| Expanded maneuvers: Committed Attack, Defensive Attack, Beat and Ruse, Ready options, Fast-Draw, Move and Attack, Wait and Stop Hits | 97-108 |
| Melee attack options: Telegraphic Attack, Tip Slash, Hilt Punch, Unarmed and Untrained fighters | 109-113 |
| Close-combat options: grappling in detail, pins, locks, throws, bites | 114-118 |
| Ranged attack options: rapid fire with thrown weapons | 119-120 |
| Active defense options: Cross Parry, Defensive grips, retreat options | 121-124 |
| Optional rule: Harsh Realism for Unarmed Fighters | 124 |
| Cinematic combat: multiple attacks, Chambara Fighting, Mind Games, Extra Effort in combat (Flurry of Blows, Mighty Blows, Giant Step and more) | 125-133 |
| Tournament combat | 134-135 |
| Realistic and cinematic injury | 136-139 |
| Styles: Style Familiarity, buying and combining styles, the training sequence | 141-147 |
| Weapons of Quality (balance), Combination Weapons, Hidden Weapons, Unorthodox Attacks, Improvised Weapons | 212-225 |
| Training equipment | 232-234 |
