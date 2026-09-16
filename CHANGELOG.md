# Changelog

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
