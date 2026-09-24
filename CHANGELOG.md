# Changelog

## v0.20.0 — High-Tech follow-ups

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts, Ultra-Tech and
High-Tech against **gworld v1.44.0**, which this release requires (add-on API
1.142.0). It also runs on gworld v1.45.0. On an older system the add-on
registers no rules, and says so in the console.

- **High-Tech, rules that waited on the system (#555, part of #510):**
  - Tools: only the tool the system picked lifts a TL line. Armoury, Electrician, Electronics Repair, Machinist and Mechanic take the no-equipment penalty without a kit.
  - Hearing rolls: the padded grapnel, the whistle and the bowstring silencer. Signal ranges now limit the signals' Vision bonus.
  - Fatigue: frostbite after Very Fit, and armour's extra FP in a hot day's battle.
  - Shoulder pads in a slam.
  - Disarms: the Retain Weapon roll names the gun, and Instant Arsenal Disarm unreadies the foe's weapon.
  - Vehicles: Mounted Shooting names the vehicle, and loading aboard finds an unlinked vehicle token. Run-flat tyres cover crippled wheels.
  - Gear and injuries: handload batches add rounds, the flamethrower backpack's facing counts, and a blast's deafness and blindness are imposed with a recovery roll.
  - Medicine and the searchlight: physician's rounds without supplies are made at TL5, elective surgery adds and removes traits, and searchlight range comes from the map.
- **Electricity and Electronics, rules that waited on the system (#554, part of #549):**
  - Devices: a dropped device takes injury on the item, and fitting a fuze uses one up.
  - Electrical hazards: a strong nonlethal shock stops the heart on a critical failure, a guarded critical failure on stolen power becomes an ordinary failure, and a weak shock's bonus applies to damage under 0.
  - Rolls: a survey's +2 is held for the skill it helps, and a refused SIGINT task still posts its follow-up card. A pedometer shortens Hiking study.
  - Weapons: the cattle prod reads the hit location, laser seekers home semi-actively through the system, and High-Tech's blinding laser records crippled eyes.
- **Fixes (#552):**
  - Implants knocked out by an EMP warhead stay out for seconds, not minutes (#545).
  - The GPR medium row shows its label.
  - Stolen power reads the power grades.
  - Battery weight counts the chemistry.
  - The computer sheet's option labels no longer wrap.
  - Two hazards roll the object's side of a contest without the victim's conditions.
  - `capture-gear.mjs` reads the PDF as UTF-8.

What the rules don't cover yet is still listed in #510 and #549.

## v0.19.0 — GURPS High-Tech: Electricity and Electronics

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts, Ultra-Tech and
High-Tech against **gworld v1.43.0**, which this release requires (add-on API
1.120.0). On an older system the add-on registers no rules, and says so in the
console.

The supplement *GURPS High-Tech: Electricity and Electronics* (#471), added to
High-Tech rather than built as a book of its own. Its records sit in High-Tech's
packs, and its text and journal pages cite it as HT:EE. Its 47 switches are in
the "GURPS High-Tech" group, all off by default. Where the supplement revises a
High-Tech rule, the revision replaces High-Tech's version inside the same
switch: the defibrillator (`emergencyMedicine`), mismatched radios and
triangulation (`radios`), and the cell-phone jammer (`jamming`). Like
High-Tech, it works without Ultra-Tech or Martial Arts in the world.

- **Records (#478-#481):** about 350 items from the supplement's catalogue, including lab gear, power sources, lamps, appliances, radios, audio and video, computers, security and surveillance gear, fuzes, jammers, two cars and two reconnaissance drones, and the weapon tables. It also adds the supplement's skills and specialties and the Hot Stick technique. Every record has the supplement's text (#483, #484), and 76 rules pages join High-Tech's journal (#485).
- **Chapters 1-3 (#486-#491):** electrical hazards, shock protection and power lines; instruments and measurement; battery chemistry, energy storage and external power; light levels, lamps and glare; cutting-edge prices, breakable parts and kits; appliances, power tools and electromedicine.
- **Chapters 4-6 (#492-#503):** radio reception, antennas and shortwave; radio and video construction options; audio fidelity and amplification; active rangefinding; computer eras, interfaces and programming; electric fences, locks, screening and alarms; bugs and countersurveillance; battlefield sensors and drones; spread spectrum, SIGINT and cipher machines; broad-spectrum, selective and radar jammers; electronic weapons and non-nuclear EMP; fuzes and homing seekers.
- **Skills (#481):** a switch adds the supplement's new defaults to Basic Set skills, and lets its skills stand in for others on the tasks it names.
- **Fixes:** every affliction effect reads the margin of failure by its size (#535, #539); Ultra-Tech's blinding laser cripples the eyes rather than blinding for good; a gadget running on several cells shows its battery text again (#538).

What the rules don't cover yet is listed in #549.

## v0.18.0 — GURPS High-Tech: the rest of the book

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts, Ultra-Tech and
High-Tech against **gworld v1.42.0**, which this release requires (add-on API
1.115.0). On an older system the add-on registers no rules, and says so in the
console.

The last release of the High-Tech plan (#335). All 115 High-Tech switches sit in
the "GURPS High-Tech" group, are off by default, and work without Ultra-Tech or
Martial Arts in the world.

- **Covert ops, medicine and transport (#389, #391-#394):** lie detection and restraints; drugs, hygiene and poisons; prosthetics and elective surgery; vehicle components, protection and crew; personal conveyances.
- **Through the new system API (#470):**
  - **DR against afflictions** is counted once. The system now adds it itself; the add-on adjusts or removes that line where a book counts DR differently, instead of adding a second one.
  - **Boots** use the system's +1 to kick.
  - **Gear:** water Move for swim fins and surfboards; towing and the manual wheelchair; restraints that stop punches and kicks; secret polygraph and spotting rolls; the real outcome of elective surgery; botulin as a lasting crippled part that lifts when it heals; wire that binds; fatigue through the chart; First Aid at a lower TL without supplies; antiseptic against a dirty wound.
  - **Vehicles:** run-flat tyres, a GM tool for improved brakes, and rivet spall after a hit.
- **Fixes (#419, #433, #452):** a boot draws at +0 from a crouch, kneeling or sitting; a calibre printed in two tables is read from the gun's own table; biomedical sensors give +1 once with Ultra-Tech and High-Tech both on.
- **Checks (#397):** a test turns each High-Tech switch on alone over every book record. Combination gadgets show each part's endurance on a shared battery, and only explosives with nitro in them ask for a jolt number.

What the rules don't cover yet is listed in #510.

## v0.17.0 — GURPS High-Tech: firearms, ammunition, explosives, armour and gear

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts, Ultra-Tech and
High-Tech against **gworld v1.41.0**, which this release requires (add-on API
1.98.0). On an older system the add-on registers no rules, and says so in the
console.

Phase 2 of the High-Tech plan (#335), and much of phase 3. Every High-Tech rule
is a switch in the "GURPS High-Tech" group, off by default, and works without
Ultra-Tech or Martial Arts in the world: rules both books print run on shared
engines with a table per book.

- **Firearms (#364-#372, #427):** gun quality and care, Immediate Action; drawing, holsters and gunfight standoffs; triggers, bursts, fast-firing, fanning and thumbing; the two-handed stance, Precision Aiming, ranged Rapid Strike, gun techniques and Zen Marksmanship; shooting underwater and in space, sustained fire and barrel changes; reloading by action type, careful loading and black-powder fouling; air guns, stunners, revolvers, mechanical machine guns and backblast; indirect fire with forward observers; magazines, sights, suppressors, stocks, bipods and tactical lights.
- **Ammunition (#373-#375):** the calibre table and ammunition upgrades, handloading and misloading; projectile options and multiple projectiles; explosive and cargo rounds (smoke, tear gas, illumination, white phosphorus).
- **Wounding and weapons (#376-#380):** the optional wounding rules; flamethrowers, spray guns and laser dazzlers; explosives, demolition charges and incendiaries; grenades, land mines, rifle grenades and nuclear weapons; bayonets, sheaths, blade materials, stun weapons and bows.
- **Defences (#381-#385):** clothing and weather, frostbite, climate control; breathing gear and environment suits; partial coverage, concealed armour and armour materials; protective oddments and portable cover; camouflage.
- **Equipment and security (#357-#363, #386-#388, #390, #440):** equipment options, legality and the black market; batteries; computers and libraries; tools and forced entry; radios and sensors; expedition, survival and maritime gear; locks, safes, traps and barriers; security screening, surveillance and jamming; codes, disguise and smuggling; emergency medicine and medical facilities.

## v0.16.0 — GURPS High-Tech: the book's records, text and journals

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts, Ultra-Tech and
High-Tech against **gworld v1.37.0**, which this release requires. On an older
system the add-on registers no rules, and says so in the console.

This is phase 1 of the High-Tech plan (#335): everything the book holds as data.
Its rules come in the next releases; the "GURPS High-Tech" group is on the Rules
page with no switches yet.

- **Shared rule engines (#343):** gadget options, size adjustment, antique legality and power cells now live in shared code with a table per book, so High-Tech's rules will work without Ultra-Tech or Martial Arts in the world. Ultra-Tech behaves as before.
- **Statistics from the GCA file (#344, #345):** 280 weapons, 94 armour pieces, 13 perks and 9 techniques. Minimum ranges, fragmentation, follow-up and linked blasts, scope bonuses, guided and homing missiles, and malfunction numbers as the book prints them.
- **Records kept by hand (#346):** the shields and armour the file gets wrong, Zen Marksmanship, Equipment Bond, the Way of the Pistol style, improvised and rifle grenades, combination weapons, 37 vehicles and 15 personal conveyances (with DR by face and location), and the calibre and relative-explosive-force tables.
- **The catalogue from the PDF (#347-#350):** about 950 more items the file doesn't have: power, computers, tools, consumer goods, radios, media, sensors and expedition gear; clothing, defences and firearm accessories; explosives, mines, bombs, sprays, lasers, melee weapons and bows; covert-ops, security and medical gear, drugs and poisons. Every record was read against its page.
- **Book text (#351-#355):** every High-Tech record carries the book's text.
- **Rules journal (#356):** 241 pages in nine folders, one for each chapter and the Gunmen appendix.
- **Packs:** `high-tech-advantages`, `-skills`, `-equipment`, `-templates` and `-rules`, in a "GURPS High-Tech" folder.

## v0.15.0 — GURPS Ultra-Tech: zooming in, and seekers that smoke can blind

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts and Ultra-Tech
against **gworld v1.25.0**, which this release requires (add-on API 1.65.0). On
an older system the add-on registers no rules, and says so in the console.

- **Binoculars and other optics zoom in (#333):** worn optics already give Telescopic Vision. A Vision roll at the one token you target now takes the range penalty, and the optics ignore twice as much of it while your Aim is on that token.
- **Homing rounds (#333):** the attack roll carries the seeker's sense (infrared, hyperspectral or radar). Smoke and radiant prism clouds that blind that sense now penalize the shot.
- **From the system:** environment suits hold DX and DX-based skills to the suit's skill while worn.

## v0.14.0 — GURPS Ultra-Tech: the book's remaining rules

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts and Ultra-Tech
against **gworld v1.24.1**, which this release requires (add-on API 1.64.0). On
an older system the add-on registers no rules, and says so in the console.

This release finishes #299 (the rules the Ultra-Tech switches still lacked) and
#329 (the halves that waited on the system's API).

- **From #299 (#318-#328):**
  - **Records:** grav hammers, the riot shield, battlesuit EMA, tool kits, shelters and modifiers.
  - **Comms and sensors:** radio range cuts, quantum channels, homing beacons, laser microphones, sensor tasks and targeting software.
  - **Stealth and security:** exophase, stasis keys, forgery tools, gecko gear, bug sweeps and the sensory deprivation tank's hours.
  - **Interfaces and media:** more of the neural interface and media rules.
  - **Fabrication and vehicles:** nail guns, the morph axe, bonders, the sonic probe, crashwebs, cylinders and jetpack wash.
  - **Computers, robots and swarms:** compact power, hardened computers, scanning robots, swarm chameleon systems and upload housing.
  - **Beams and accessories:** following conditions, blinding shots, stabilized screens, the kill setting, the hotshot radius, sensor range and D-tags.
  - **Melee and agents:** vibro cells, the added neurolash, gloves, rocket spears, timed traits, nerve disorders, torpine and hasty contact poison.
  - **Medical:** device diagnosis, the regeneration ray as a pocket regenerator, analgine, memory-beta, critical repair and fast regeneration.
  - **Armour, suits and force fields:** gills underwater, warsuit hardening, a reactor against infrared, cloaking and opaque screens, stabilized screens against matter transmission, stasis grids by area, and shields vanishing.
  - **Cybernetics and power cells:** implant seeds, bomb implants as smart grenades, cyber-traps and endurance in uses.
- **Through the system's new API (#330):**
  - **Detection:** infrared cloaking and radar stealth penalize the observer's roll, and a masking odor gives -5 to detecting its wearer by smell.
  - **Areas:** smoke, radiant prism and mask become clouds on the scene, and a warbler leaves Hearing penalties round it.
  - **Ranged attacks:** FTL beams take half the speed/range penalty, and a velocity setting reads that penalty at the range the round reaches. Harnesses find their lines in any language.
  - **Warheads:** strobe, warbler and psi-bomb effects fade by the yard, nuclear and antimatter blasts fall off with the distance, and linked lines carry radiation and surge. A psi-bomb's stun is -5 to recover from, and a terror psi-bomb is a Fright Check.
  - **Weapons:**
    - A force beam's kinetic stun row.
    - The zap glove's kill as a lethal shock, with metallic armour at DR 1.
    - Homing rounds aimed with Artillery (Guided Missile) before they attack at their own skill.
  - **Armour and equipment:**
    - Bioplas and living metal repair their DR.
    - The force shield bracelets are Hardened with no composition.
    - The mini-toolkit's -2.
  - **Medicine:**
    - Antirad halves the next dose.
    - Life support makes mortal wound checks daily.
    - A healing bionic limb or sense brings back what it replaced.
- **Fixed:** a psi-bomb with its message chosen fired unchanged.

## v0.13.0 — GURPS Ultra-Tech: armour, powered suits, force fields, medicine and cybernetics

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts and Ultra-Tech
against **gworld v1.21.0**, which this release requires (add-on API 1.61.0). On
an older system the add-on registers no rules, and says so in the console.

The Ultra-Tech plan's last release (#235): with it every one of the book's 48
switches is in, each off by default in the "GURPS Ultra-Tech" group. What each
can't do yet is listed in #299.

- **Body armour (#253):**
  - **Threat protection:** worn suits, helmets and masks give their sealing, vacuum and pressure support, radiation protection, climate, protected senses and air, a suit's only once its helmet is on. A suit can be patched.
  - **Laser-resistant armour:** ablative, reflec and retro-reflective armour at full DR against the beams each resists, ablative DR worn away by lasers, and retro-reflective armour bouncing damage back.
  - **Tailored armour:** coverage, style and cut, priced, and a blow to an uncovered part going through.
  - **Armour systems:** electromagnetic and adaptive armour, reactive paste, living metal and ablative foam.
- **Powered suits (#254):** a worn, powered exoskeleton or battlesuit's ST, Move and jumping; the suit carrying its own weight; DX-based skills held to Battlesuit; weightless loads; losing power; suiting up and refitting.
- **Force fields (#255):**
  - **Force screens:** variants priced; what each stops; spent DR regenerating with world time; sealing and PF while powered.
  - **Force shields:** the bracelets as shields, and the reflective one returning a beam.
  - **Stasis and time:** stasis as a condition that stops damage; life-support belts; tau-shields.
- **Medical gear and drugs (#256):**
  - **Medical gear:** automeds, suitcase docs and pocket medics treat with their own skills, through the system's healing procedures (API 1.60.0). Also bandage spray, plasti-skin and smart bandages; life support's bonus to daily mortal wound checks; a medical bed's and supplies' bonus to a physician's rounds; hibernation and neural inhibitors.
  - **Drugs and nano:** morphazine, soothe and crediline dosed through the system's poison rules. The other drugs and nano are taken from their items, their forms priced, and Aegis nanobots keep out nanoweapons.
  - **Regeneration:** nanostasis, regeneration and rejuvenation tanks, the chrysalis machine reviving the dead, the pocket regenerator and the regeneration ray.
- **Cybernetics (#257):**
  - **Procedures:** every implant's procedure at its TL, a surgery tool with its injuries, times, fees and recovery, and an implant out of play until it heals (API 1.61.0).
  - **Other rules:** surges switching electrical implants off, detecting implants, second-hand and salvaged parts, chip slots, cognitive enhancement and psych implant removal.
- **Records:** ablative armour's DR is its own again, the space biosuit's split DR is kept, and the force shield bracelets are shields.

## v0.12.0 — GURPS Ultra-Tech: the gadget, weapon and armour rules

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts and Ultra-Tech
against **gworld v1.18.0**, which this release requires (add-on API 1.57.0). On
an older system the add-on registers no rules, and says so in the console.

The Ultra-Tech plan's Phase 3 release. Every new switch is in the "GURPS
Ultra-Tech" group and starts off; what each can't do yet is listed in #299.

- **The rest of the catalogue (#229, #231, #233, #255):**
  - Chapters 3-5, 7, 8 and 9's gear, captured from the book's stat lines.
  - The book's text for chapters 3-5 and 7-9.
  - Force screens as armour: a force field with semi-ablative DR.
- **Computers, robots and swarms:**
  - **Computers and software (#238):** models built with options and priced; programs priced from Complexity and TL; software tools' quality; AI Complexity and legality; breaking encryption.
  - **Robots (#239):** machine characters' lenses on the Traits tab; reprogramming, paint, paradoxes and molten metal as GM tools; surges and knockback on Electrical bodies.
  - **Swarmbots (#240):** a swarm built by area, bots, chassis, power and type, priced, with its statistics, and deployed as a character.
- **Senses, interfaces and fabrication:**
  - **Communicators and sensors (#241):** comm ranges; worn optics and detectors as senses; lock-on; a sensor sweep that meets jammers; sonar in air by the scene's pressure.
  - **Interfaces, VR and sensies (#242):** the HUD's bonuses; virtual tutors, instaskills and translators.
  - **Tools, fabrication, gravity and psi amplifiers (#243):** fabrication times, hazards, gravity shifts; repair paste and rope; psi amplifiers attuned and burning out.
  - **Vehicle systems and matter transmission (#259):** crashwebs, thrusters, flight packs and strap-on systems; minigates; telegates and interstellar jumps.
- **Stealth, security and minds:**
  - **Stealth systems (#244):** chameleon and invisibility bonuses by sense, jammers, shape-memory disguises, and tools' stated bonuses.
  - **Security, restraints and interrogation (#245):** barriers and traps, breaking free, neural programming, mind probes.
  - **Uploading and downloading (#258):** uploads, low-res copies and downloads.
- **Beam weapons:**
  - **Beam weapons (#246):** rows by the scene's air and water from a GM tool; electrolasers, omni-blasters and microwave disruptors resisted and applied; force fields against graviton beams and disintegrators.
  - **Laser options (#246):** dazzle, blinding and pulse settings; weather and glass.
  - **Neural, psionic and sonic beams (#246):** settings, and what each failure does.
  - **Beam options and heat (#247):** field-jacketed, FTL and gravitic focus; overheating and hotshots.
- **Guns and warheads:**
  - **Guns, launchers and grenades (#248):** ETC and liquid-propellant slugthrowers with boosted and low velocity; gyrocs at short range; missile backblast and reactionless missiles; smart and saucer grenades and limpet mines; homing seekers as homing attacks.
  - **Firearm accessories (#249):** scopes, harnesses, grips, compensators, tripods and access control as fields that reprice the weapon and change its rows and shots; targeting software; active-sensor targeting.
  - **Warheads and ammunition (#250):** 34 warheads loaded per ranged mode, changing the row they fire, with their effects on a failed roll.
  - **Biochemical and nano weapons (#251):** gases, poisons and metabolic nanoweapons dosed and cycled by the system's poison rules (API 1.57.0), with what each failure does; splatter and shrike against Aegis.
  - **Ultra-tech melee (#252):** superfine, monowire, hyperdense, nanothorn and vibro blades; rocket strikers; switchblades and monowire whips; stunners and neurolashes; force swords.
- **Armour (#253):** suits, helmets and masks granting their protection; ablative and reflec armour against lasers; tailored coverage and style.
- **The rules journal (#298, #300):** pages name the switch that plays their rule.
- **Fixes:** the ghost particle cannons have radiation and surge (#302); the Force Blade's statistics were under the Sonic Shuriken's name (#252).

## v0.11.0 — GURPS Ultra-Tech: the records, the robots and the rules journal

Built from the Basic Set, Monster Hunters 1, Magic, Martial Arts and Ultra-Tech
against **gworld v1.16.0**, which this release requires (add-on API 1.54.0). On
an older system the add-on registers no rules, and says so in the console.

- **Ultra-Tech's statistics (#226, #227):** six new packs.
  - 58 advantages, 6 disadvantages and 12 modifiers.
  - 615 pieces of gear and armour. Split DR is read by the book's own conventions: by location for sealed suits and helmets, and against lasers only for ablative and reflective armour.
  - Power cells on every record the data file gives one.
  - Kept by hand, because no data file has them: T-Ray Vision and the robots' five Telecommunication variants; the hand, mini, thimble and saucer grenades and the limpet mine; 24 swarm types; 36 vehicles.
- **Robots (#228):**
  - 12 robot bodies and the computer implant as racial templates, each with its TL, configuration and optional lenses.
  - The machine intelligence and biomorphic lenses, and the two meta-trait variants.
  - A creatures pack: the robot mule, the hunter, striker and floater missiles, and the smart shuriken.
  - A model lens carries the body's price, weight, power cells and LC.
- **The book's text (#230, #232):** chapters 1-2, every robot, and all of chapter 6's weapons. Each was read after drafting.
- **The rules journal (#234, #266):** 333 pages in nine chapter folders, read band by band so text no longer runs across columns.
- **The first Ultra-Tech rules**, in their own group, all off by default:
  - **Gadget options** (#236, pp. 15, 17): disguised, styling, rugged, cheap and expensive reprice the item. The item also shows the HP, HT and DR the book assumes for a gadget.
  - **Adjusting for SM** (#236, p. 16): gear marked "adjust for SM" is priced and weighed by the carrier's Size Modifier.
  - **Legality and antiques** (#236, p. 14): an obsolete gadget is carried at a higher LC, and a gadget below the maintenance threshold for its TL needs none.
  - **Power cells** (#237, pp. 18-20, 133):
    - Shots depend on the kind of cell: non-rechargeable ×2, superscience ×5, cosmic without count.
    - A Power cells section on the Gear tab tracks endurance and changes cells.
    - The item's Power section prices a cell, shows what exploding cells do, and jury-rigs smaller cells with an Electrician-2 roll.
- **Fixes (#273, #275):** the records' extension data (armour, warheads, swarms, switchblades, vehicles, and the robot lenses' body data) now survives import.

## v0.10.1 — The last Martial Arts records get their text

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.12.0**, which this release requires (add-on API 1.45.0).

- **Book text for the last twelve records (#262):** Back Strike, Spinning Strike
  and Flying Lunge, which the book prints as one entry with the kick they share
  their technique with, and the bladed hand, myrmex and sap glove, whose
  descriptions sit under another name in the weapon list. Every Martial Arts
  record carries its text now: 579 skills and techniques, 82 pieces of gear.

## v0.10.0 — The Martial Arts pack extracted again, and the last twofer

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.12.0**, which this release requires (add-on API 1.45.0).

- **The Martial Arts pack, extracted again (#220):** the system's parser reads
  the forms it used to reject, so the book's techniques come in whole.
  - 564 technique records, up from 312: those bought for any skill of a kind —
    Disarming, Wrist Lock, Dual-Weapon Defense and the rest — now carry the
    skills the book allows them, and those bought off a Parry, Block, Dodge or
    an attribute are in too.
  - Nothing already in the pack changed, ids included, so characters stay linked.
  - Three weapons whose only attacks add the unarmed damage bonus (Bladed Hand,
    Myrmex, Sap Glove) come in, and seven others gain modes of that kind.
  - Each new record carries the book's text for its technique. Nine records of
    three techniques the journal has no page for, and the three new weapons, have
    none.
- **All-Out Grapple and Strike (#222):** grabbing a second foe in the same turn
  takes the Dual-Weapon Attack's -4, and a fighter holding two foes can ram them
  together — each defends, and each takes thrust-1 crushing where he was held,
  +1 only for two skulls.

## v0.9.0 — Grappling, biting and bodies in close combat

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.11.0**, which this release requires (add-on API 1.44.0).

- **Grappling (#215):**
  - a bear hug squeezes a torso held in two arms or the legs, for crushing
    damage or for fatigue;
  - a grapple can be switched from the arms to the legs, which frees the hands;
  - one-handed locks and holds take their -2 (or -4 with the crook of an arm),
    use half ST, and roll damage and throws at -4;
  - an action after a grapple takes an Attack, All-Out Attack or Committed
    Attack maneuver, one a turn — two on All-Out Attack (Double);
  - long weapons can be used in close combat at their penalties, and a reach 2
    or 3 polearm, spear or two-handed axe has only its haft until a Ready chokes
    it up.
- **Biting and bodies (#216):**
  - worrying at a bite rolls damage each turn, notes the part's injury cap, and
    bites a nose, an ear or a finger off once the injury doubles what cripples
    it — which offers the Fright Check;
  - a Born Biter's jaw and nose are easier to hit, and a face hit finds the nose
    on 1-2;
  - shock lowers both sides of a break free attempted at once;
  - Kiss the Wall can ram the grappled foe into another fighter;
  - Horizontal, Injury Tolerance (Diffuse and Homogenous), crippled and missing
    legs, One Arm and One Hand, No Fine Manipulators and Spines change close
    combat as the book says.

With these, the Martial Arts follow-ups collected in #201 are all done.

## v0.8.0 — Martial Arts follow-ups on API 1.44, and techniques bought off a defense

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.11.0**, which this release requires (add-on API 1.44.0).

- **Techniques bought off a defense (#210):** Aggressive Parry, Jam, Dual-Weapon
  Defense, Hand Catch, Hand-Clap Parry, Low-Line Defense, Timed Defense and Trip
  are in the Martial Arts pack, with their Art and Sport versions and an open
  Dual-Weapon Defense for melee weapon skills.
- **Martial Arts (#208):**
  - parrying a charge weighs the attacker at ST/10 lbs. for a grab or grapple and
    ST lbs. otherwise, and the strike after the parry can hold him at bay;
  - a Lizard Climb makes the next defense succeed or fail without a roll;
  - chambara fighters get the retreat options, Multiple Blocks and the two-handed
    parry rules even with the defense option switches off;
  - Unarmed Etiquette offers the bare-handed parry and its techniques when it
    refuses a weapon parry;
  - Shaking It Off also follows a failed roll to stay conscious;
  - Proxy Fighting refuses an object heavier than Basic Lift, holds a fighter using
    a puppet to a step, and says who takes a blow the proxy failed to stop;
  - tournament deadly hits roll their location through the add-on's hit
    locations, and a flurry cut short counts the seconds the GM enters;
  - a lasting injury that is a trait has a button that opens it in the compendium,
    to drag onto the character.

## v0.7.0 — Book text in the picker, and Martial Arts follow-ups

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.9.0**, which this release requires (add-on API 1.42.0).

- **Book text in the compendium picker (#204):** in the sheet's Add pickers and
  the character builder, an entry with book text has its name marked as a link.
  Hovering or focusing it shows the text in a tooltip, and clicking it opens the
  entry. Nothing is loaded until a name is hovered.
- **Martial Arts:**
  - chambara fighters get the spinning version of their techniques, used with the
    system's new Wild Swing (#205);
  - a Stop Hit's unbalanced or unready weapon parries only that foe, and only
    once (#205);
  - Who Draws First applies posture, grapples, moving and where the weapon is
    carried from the readying rules (#205);
  - partial injuries apply the worst band's -5, slow wounded legs and torsos,
    put the torso's penalty on every DX roll, and penalize kicks with a wounded
    leg, which never applied before (#206).

## v0.6.0 — GURPS Martial Arts

Built from the Basic Set, Monster Hunters 1, Magic and Martial Arts against
**gworld v1.8.0**, which this release requires (add-on API 1.39.0). Every new
switch is off by default.

- **GURPS Martial Arts ships**, with its pack, and 23 more switches:
  - close combat: all-out grappling, one-handed locks, shifting grips, throws
    from locks, sprawling and long weapons in close combat
    (`grapplingOptions`, `longWeaponsInClose`, #193);
  - Grab and Smash, pain in close combat, bites and bodies in close combat
    (`grabAndSmash`, `bodiesInClose`, #194);
  - realistic injury: partial injuries, extreme dismemberment, severe bleeding
    and lasting wounds (`partialInjuries`, `extremeDismemberment`,
    `severeBleeding`, `lastingInjuries`, #195);
  - who draws first, Stop Hits, Cascading Waits, A Matter of Inches, and
    charging foes (`whoDrawsFirst`, `stopHits`, `cascadingWaits`,
    `matterOfInches`, `chargingFoes`, #196);
  - chambara fighting, for masters only, with Flying Leap, Light Walk and
    Lizard Climb feats (`chambara`, #197);
  - the Contest of Wills, concentration, fear, faking it, Unarmed Etiquette,
    Shaking It Off, Shout It Out!, Proxy Fighting and Bullet Time
    (`contestOfWills`, `concentration`, `fear`, `fakingIt`,
    `unarmedEtiquette`, `shakingItOff`, `shoutItOut`, `proxyFighting`,
    `bulletTime`, #198);
  - tournament bouts, by Quick Contest or the detailed method
    (`tournaments`, #199).
- **Journal pages:** every Martial Arts rule page links to the switch that
  applies it (#202).
- **Fix:** the chambara technique attack option no longer applies unless it is
  chosen (#198).

## v0.5.0 — Martial Arts combat rules

Built from the Basic Set, Monster Hunters 1 and Magic against **gworld
v1.7.0**, which this release requires (add-on API 1.33.0). Every new switch is
off by default.

- **GURPS Martial Arts** gets eighteen more switches:
  - Defensive and Reversed Grips, Pummeling, Tip Slash and Telegraphic Attack
    (`meleeOptions`, #179);
  - styles and the Training Sequence (`styles`, `training`, #180);
  - weapon balance, custom quality, combination and hidden weapons
    (`weaponBuilding`, #181);
  - the finer hit locations, with their wounds (`finerHitLocations`, #182);
  - longer Rapid Strikes, several targets and feints in a sequence
    (`multipleAttacks`, `cinematicRapidStrike`, #183);
  - Cross Parry, Riposte, Dive, Sideslip and Slip, multiple blocks, leg parries
    and dodge limits (`defenseOptions`, `limitedDefenses`, #184);
  - Targeted Attacks, Combinations, and Art and Sport defaults
    (`targetedAttacks`, #185);
  - Giant Step, Great Lunge, Heroic Charge and Rapid Recovery, with one offensive
    and one defensive option a turn (`extraEffort`, #186);
  - quick-shooting bows, thrown Rapid Strike and handfuls, prediction shots and
    ranged feints (`rangedOptions`, `cinematicRangedOptions`, #187);
  - unfamiliar weapons, two-handers in one hand, hurled melee weapons and
    improvised weapons (`unfamiliarWeapons`, `unorthodoxWeapons`, #188);
  - shoves and cross-checks with weapons, and striking at or grabbing shields
    (`shovesAndShields`, #190);
  - untrained fighters and Harsh Realism for Unarmed Fighters
    (`untrainedFighters`, `harshRealism`, #191).
- **Journal pages:** the Martial Arts journal links more of its pages to the
  switches that apply them.
- **Martial Arts pack:** still out of the release, until the last of the
  book's rules arrive.

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
