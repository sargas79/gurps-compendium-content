# Triage: GURPS Ultra-Tech

Done on 2026-09-16, against the PDF and the GWorld system at v1.12.0, before any
of the book was extracted for keeps. Tracking: milestone **Ultra-Tech**, issues
#225 to #259 here, and sargas79/GWorldVTT#374 to #379 in the system.

| | |
|---|---|
| Book | GURPS Ultra-Tech, Fourth Edition, 2007, nine chapters |
| PDF | one volume, 240 pages; **PDF page = book page + 1** |
| GCA file | `GURPS Ultra-Tech 4e.gdf`, 4 July 2023, marked `Incomplete=Yes` (the header says it holds weapons and armour; it also holds the cybernetics, the power items and the computers) |
| Citations | `page(UT113)`, the plain prefix; records the Basic Set also prints cite both, `page(B81, UT30)` |
| Parsers | `--prefix UT --book "Ultra-Tech"`, modifiers from pp. 29-32 |
| Requires | the Basic Set file |

The book is a catalogue before it is a rulebook: roughly 1,100 named gadgets, 27
robot and machine templates, 45 lenses, 27 warhead types and 14 drugs, with the
rules that work them scattered through all nine chapters. That shape is what
makes this book's data phase two to three times any earlier book's, and why the
catalogue is split between the data file and the PDF below.

## The book, chapter by chapter

| Chapter | Pages | The GCA file gives | The system at v1.12.0 | Plan |
|---|---|---|---|---|
| 1. Ultra-Technology: ages of technology, TL progression, technology paths, gadget control, buying equipment, wear and care, integrating and modifying equipment, adjusting for SM, equipment statistics | 5-17 | the five equipment modifiers and the SM table, as GCA modifiers | TL on every item, LC and Control Rating, equipment quality, maintenance and repairs | journal (#234) for the campaign guidance; gadget options, SM and antiques as rules (#236) |
| 2. Core Technologies: power, computers, software, AI, robots and total cyborgs, machines as characters, robots in action, swarmbots, personal gear, clothing, entertainment, personal robots | 18-41 | 7 power cells, 7 generators, 2 collectors, 8 computers, 8 terminals, 15 software placeholders, Android and Petbot bodies; 35 templates the parsers do not read | complexity on equipment; the Basic Set's swarm attacks; Machine and Automaton as traits; nothing for cells | statistics (#226); templates and lenses by hand (#228); power cells (#237), computers (#238), machines as characters (#239), swarmbots (#240); clothing and entertainment captured (#229) |
| 3. Communications, Sensors, and Media: communicators, encryption, translators, neural interfaces, networks, mail, recording and playback, virtual reality, augmented reality, sensies, mass media, teaching aids, passive and active sensors, scientific equipment | 42-67 | nothing | equipment quality bonuses for a skill; the sense traits, but not from gear | captured from the PDF (#229); communicators and sensors (#241), interfaces and media (#242); journal (#234) |
| 4. Housing, Tools, and Survival Gear: housing and food, expedition gear, environmental technology, gravity control, exploration robots, tools and construction materials, worker robots, heavy equipment, demolitions, manufacturing, psi amplifiers | 68-94 | nothing | tool kits as equipment quality; explosives with a relative force | captured (#229); Housebot, Scout Robot, Techbot, Bush Robot and Robot Mule (#228); tools, fabrication, gravity and psi (#243); journal (#234) |
| 5. Covert Ops and Security: deception and intrusion, forgery, disguises and smuggling, ECM and stealth, computer intrusion, barriers, mines and traps, security scanners, surveillance, counter-surveillance, forensics, restraint and riot control, interrogation, black ops robots | 95-111 | nothing | Stealth, Search and Disguise as skills; nothing for stealth surfaces | captured (#229); Robobug and Nanomorph (#228); stealth systems (#244), security and coercion (#245); journal (#234) |
| 6. Weaponry: beam weapons, options, fluid projectors, guns and launchers, gyrocs, rockets and missiles, hand grenades, firearm accessories, warheads and ammunition, biochemical and nanotech weapons, melee and thrown weapons, combat robots, robot weapons | 112-169 | 224 weapons (212 ranged, 12 melee) and 31 rounds; the warhead types and beam options as GCA modifiers | ranged modes with Acc, RoF, shots, bulk, recoil and malfunction; afflictions on modes; explosions, fragmentation, scatter, cones and areas, homing; accessories; the Basic Set's ammunition types | statistics (#226); beam weapons (#246), beam options and heat (#247), guns and launchers (#248), accessories (#249), warheads (#250), biochemical and nano (#251), melee (#252); Combat Android, Warbot and the missiles (#228); grenades and swarm weapons by hand (#227) |
| 7. Defenses: materials, body armour and protective gear, tailoring armour, rigid body armour, environmental gear and suits, powered suits, defense systems, force fields, nuclear dampers, stasis webs | 170-195 | 101 armour pieces, exoskeletons and battlesuits among them (37 of them rejected today) | armour with split DR by damage type, locations, flexible and front-only; Lifting and Striking ST, Super Jump and Move as trait effects, but not from gear | statistics (#226); body armour and threat protection (#253), powered suits (#254), force fields (#255); helmets and hardsuits split by location kept by hand (#227); force screens captured (#229) |
| 8. Medical and Biotech: biomedical equipment, medical robots, psychiatric equipment, biotech equipment, drugs and nano, cybernetics and uploading, body modifications, brain implants, cybernetic uplift, total cyborgs, uploading, downloading | 196-221 | 67 implants as gear and 58 as traits | medical care, first aid, bleeding, mortal wounds and drugs; Electrical as a trait | statistics (#226); medical gear captured (#229); medicine and drugs (#256), cybernetics (#257), uploading (#258); Nursebot, Medical Bush Robot and the Computer Implant template (#228) |
| 9. Vehicles: planetary and space travel, ATVs, personal vehicles, flying cars, tanks, hovercraft, minisubs, diver propulsion, tilt-rotors, vertols, grav bikes, microplanes, flight packs, zero-G thrusters, drop capsules, matter transmission | 222-235 | nothing | vehicle equipment with the Basic Set's vehicle columns; a vehicle actor | the 33 vehicles by hand (#227); vehicles and transport (#259); journal (#234) |
| Bibliography, Index | 236-240 | nothing | nothing | nothing |

## Sections of the file, and where they go

| GCA section | System type | Pack | Notes |
|---|---|---|---|
| `[ADVANTAGES]` | `trait`, category advantage | `ultra-tech-advantages` | 58 cybernetic implants as advantages with their point costs (pp. 208-218). Each writes `cost(0)` with `displaycost(N)` and builds its effect from `adds()` of Basic Set traits; the parser takes the display cost, which is the book's total, and drops the parts |
| `[MODIFIERS]`, pp. 29-32 | `modifier` | `ultra-tech-modifiers` | 12: Controllable and Dynamic (Chameleon), Profiling (Discriminatory Hearing, Smell and Taste), Bio-Scan and Scanner (Para-Radar), Species-Specific (Pacifism), FTL, Secure, Sensie and Sensie Only (Telecommunication). Burst cites Powers, not this book |
| `[MODIFIERS]`, equipment | none | skip | Cheap, Expensive, Rugged, Styling, Disguised, Adjusting for SM, 19 ammunition types, the beam options, the power cell types and the android options are GCA's bookkeeping for rules. Improvements to an item are calculated fields, never modifier items: #236, #247, #250 |
| `[TEMPLATES]` | `template`, racial and lens | `ultra-tech-templates` | 35 records: meta-traits, machine intelligence lenses, biomorphic lenses, Android and Petbot with their TL lenses. **By hand** (#228), since the parsers do not read this section, and cross-checked against the book's own 13 bodies and ~63 lenses |
| `[EQUIPMENT]`, weapons | `equipment` | `ultra-tech-equipment` | 224 weapons: 212 ranged (beams, guns, launchers, grav guns, gyrocs) and 12 melee (monowire and stasis switchblades, whips, stun wands, zap gloves, neurolashes, sonic shuriken, force swords and glaives) |
| `[EQUIPMENT]`, ammunition | `equipment` | `ultra-tech-equipment` | 31 rounds with weight and cost per shot |
| `[EQUIPMENT]`, cybernetics | `equipment` | `ultra-tech-equipment` | the same 67 implants again, priced in dollars with their LC. Both records are kept and linked by name: the equipment carries price, LC and the surgical procedure, the trait carries the effect (#257) |
| `[EQUIPMENT]`, power and computers | `equipment` | `ultra-tech-equipment` | 7 cells, 7 generators, 2 collectors, 8 computers, 8 terminals, 15 software placeholders, 8 robot bodies |
| `[EQUIPMENT]`, armour | `armor` | `ultra-tech-armor` | 101 pieces: concealable ballistic armour, tactical vests, laser-resistant armour, bioplas, energy cloth, helmets, clamshells, environmental gear, exoskeletons and battlesuits |
| `[EQUIPMENT]`, build-your-own armour | none | skip | nine records whose DR, cost and weight are GCA sheet formulas over choice lists; the tailored armour builder covers them (#253) |
| `[BODY]`, `[GROUPS]`, `[LISTS]` | none | skip | GCA's expanded hit locations, the template and trait lists, and the armour coverage lists; read when writing the templates and the tailored armour builder |

## What the parsers make of it

Dry run with `npm run extract -- ultra-tech`, against the system at v1.12.0.

| | Count | Notes |
|---|---|---|
| traits | 58 | the cybernetic implants; 3 rejected for costs the file writes as "varies" and "1-5" |
| skills | 0 | the book adds none; the Beam Weapons, Gunner and Liquid Projector specialties it uses are the Basic Set's |
| techniques | 0 | none |
| armour | 101 | 37 more wait on the location fix below |
| equipment | 377 | 224 of them carrying attack modes |
| shields | 0 | none |
| spells | 0 | none |
| modifiers | 12 | pp. 29-32 |
| overlap | 6 | records citing a Basic Set page, listed in `overlap.txt` |

### Rejected: 108 records

| Count | Reason | Where it goes |
|---|---|---|
| 37 | armour location `all` (full suits, tacsuits, vacc suits, hardsuits, battlesuits, exoskeletons) | sargas79/GWorldVTT#374 maps `all` to every location, as `full suit` already maps |
| 19 | ranges given in miles (X-ray lasers, grasers, nucleonic and ghost-particle cannon), and one as a multiplier (`x0.1/x0.5`, the Military Ladar) | sargas79/GWorldVTT#374 reads miles as yards; the ladar's mode is kept by hand (#227) |
| 13 | the cosmic armour divisor, which GCA writes `!` (graviton beams, disintegrators, ghost particle beams) | sargas79/GWorldVTT#375 |
| 9 | build-your-own armour whose DR is a GCA formula | excluded in `book.json`; the builder is #253 |
| 6 | incendiary damage (`imp inc`, `cr inc`: grav guns, HEMP warheads) | sargas79/GWorldVTT#375 |
| 6 | double knockback (`cr dkb`: force beams and cannon) | sargas79/GWorldVTT#375 |
| 4 | damage `0` or `spcl.` (displacers, blinding mode) | kept by hand as special-effect modes (#227) |
| 3 | linked attacks (the vortex projectors' `linked 1d-3 cr dkb`) | sargas79/GWorldVTT#375 |
| 3 | accuracy `jet` (the sprays and the spray tank) | sargas79/GWorldVTT#374, which reads jets as the Basic Set writes them |
| 3 | a split-DR footnote disagreeing with the record's own TL | kept by hand after reading the pages (#227) |
| 2 | blade damage `sw+1d+R` (the monowire and stasis switchblades) | kept by hand (#227); the reach-dependent damage is #252 |
| 2 | accuracy `var.` (Dazzle Mode, Blinding Mode) | excluded in `book.json`: they are settings on every laser, not weapons (#246) |
| 1 | location `one arm and hand` (the Power Sleeve) | sargas79/GWorldVTT#374 maps it to arm and hand |

Once sargas79/GWorldVTT#374 and #375 ship, 84 of the 108 come through, taking
armour to about 138 and equipment to about 402.

### Read wrongly, or not read, without being rejected

- **Shots with a thousands separator.** `9,000(3)` loads as 9 (the Dazzler
  Carbine, the laser flashlights, the searchlight, the Gauss Minigun).
  sargas79/GWorldVTT#374.
- **Cone widths.** `HT-5 aff (3 yd)` comes through as an affliction with no cone,
  though the dazzlers, nauseators, microwave weapons and neural disruptors all
  project cones. sargas79/GWorldVTT#374.
- **Power.** `battery(C)`, `power(2C/20 hr.)` and `emptyweight()` are dropped,
  with the `p` that marks a cell worn separately. Rightly so: lettered power
  cells are this book's own (pp. 18-20), not a Basic Set field. The extraction
  step reads them into this module's own extension data instead (#226).
- **Complexity.** A computer's Complexity is only in the record's description,
  which the reader drops on purpose. Set by `patch` in `book.json` from p. 22.
- **Generator names.** Four generators arrive split at the commas inside their
  names ("Fusion Generators", "Semi-Portable"), and are mended by hand (#227).

## Overlap

Six records cite a Basic Set page as well as this book's:

| Record | Cites | In the Basic Set pack? |
|---|---|---|
| T-Ray Vision | B81, UT30 | no |
| Telecommunication (Cable Jack) | B91, UT31 | no |
| Telecommunication (Directional Sound) | B91, UT31 | no |
| Telecommunication (Gravity-Ripple Comm) | B91, UT31 | no |
| Telecommunication (Neutrino Comm) | B91, UT31 | no |
| Telecommunication (Sonar Comm) | B91, UT31 | no |

All six are new varieties of a Basic Set advantage that the Basic Set itself does
not print as separate records, so the parser's rule leaves them out and none of
them exists anywhere. All six are added by hand (#227), as Martial Arts' new
Fast-Draw specialties were.

## What is not in the file at all

Chapters 3, 4, 5, 8 (medical gear and drugs) and 9 hold about 600 named gadgets
the data file never had. Each prints one stat line in a fixed shape --
`$20,000, 20 lbs., D/12 hr. LC4.` -- so they are captured from the PDF for a
person to check (#229), the way `transcribe.mjs` captures entry text. The 33
vehicles of pp. 224-232 print in the columns the system's vehicle equipment
already stores and are kept by hand (#227).

## Decisions taken before filing

Recorded here because they shaped the issues, and because a later reader will
wonder:

1. **The catalogue is captured, not skipped.** #229 reads the ~600 gadgets the
   data file lacks off the PDF.
2. **All 24 rule issues are filed**, in three tiers; the third tier may stay
   journal-only if it proves not worth the code.
3. **Cybernetics keep both records**, trait and priced equipment, linked by name.
4. **Power cells are this module's data, not a system field.** Checked on the
   Basic Set PDF: pp. 270, 280 and 288 define no lettered cells, and a beam
   weapon's weight column carries only its cell's weight with a `p` for a
   backpack supply. The lettered cells, endurance and shots per cell are
   Ultra-Tech's own (pp. 18-20).
5. **The system set ships before any rule does**, so that #226 can be run once
   and for keeps.
6. **Robot bodies are racial templates with lenses**; the five machines the book
   gives as animal stat blocks become an Actor pack.
7. **Vehicles are kept by hand** as vehicle-category equipment.

The plan these came from: https://claude.ai/artifact/Gua2htvv1cQcD2TvQRwgvJ
