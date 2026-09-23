/**
 * High-Tech's ammunition (pp. 161-165, 174-178), registered with the system
 * through the add-on API under three switches. The rules are in `rules.ts`;
 * the rows each load fires go through the load engine (`src/shared/loads`)
 * that Ultra-Tech's warheads use too, with High-Tech's own catalogue, field
 * and switch (decision D5, #335: the calibre table is data, joined to a gun by
 * its calibre, and loads are computed on the mode).
 *
 *   - **Ammunition upgrades (ammunitionUpgrades):** each ranged mode of a gun
 *     holds a load (`htLoads`), as Monster Hunters 1's special ammunition
 *     holds its slots: the ammunition upgrades now, with room beside them for
 *     the projectile options and upgrades (#374). A box of rounds (equipment
 *     filed as ammunition) holds one load for the rounds in it, and a mode
 *     loaded from such a box fires the box's. The load changes the row
 *     (Acc, Dmg by the book's Adjusting Damage, Range, ST, Malf.), says how
 *     the shot is heard, and prices the rounds: a box's cost and weight per
 *     round are the calibre's CPS and WPS times the upgrades, less 5% or 15%
 *     for 500 or 5,000 rounds and what an Area Knowledge roll found. Paper
 *     cartridges tick the reloading aid (#369). A caplock can be converted
 *     to fire cartridges, on an Armoury (Small Arms)-4 roll.
 *   - **Handloading (handloading):** rounds handloaded or reloaded cost
 *     their materials; a batch is timed by its tools and rolled for, a
 *     critical failure costing the batch a point of Malf.; a load developed
 *     for the gun on Armoury and IQ-based Guns rolls makes its match-grade
 *     rounds a perfect match.
 *   - **Misloading (misloading):** a round that isn't the gun's, nor one down
 *     its chain of interchangeable calibres, rolls the Misloading Table when
 *     it is fired.
 *   - **Projectiles (projectileOptions, exoticBullets, multipleProjectileLoads,
 *     projectileUpgrades; pp. 109, 166-175):** the load's projectile, what the
 *     bullet is made of, and its upgrades, in `projectiles.ts`. A projectile
 *     takes the place of the Basic Set round chosen on the mode (its figures
 *     are taken back off the row first); it never stacks with it.
 *   - **Explosive and cargo rounds (explosiveProjectiles, cargoProjectiles;
 *     pp. 169-172):** the same slot names an explosive round (whose blast is
 *     the record's, decision D5) or a cargo round, with the cargo's own
 *     choices (the kind of smoke or flare, a vomiting agent, a liquid or
 *     poison filler, the cloud's radius and time, the round's printed hit).
 *     `explosive.ts` has the rules around the blast; `cargo.ts` what the
 *     cargo does once fired.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { tlOf } from "../../../shared/loads/launcher.js";
import { formatDice, parseDice } from "../../../shared/loads/dice.js";
import { registerLoadRows, type LoadPlace, type LoadRow } from "../../../shared/loads/rows.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isAutomatic } from "../environments/index.js";
import { isAirGun } from "../weapon-families/index.js";
import { isFirearm } from "../firearms/index.js";
import { firearmBuild } from "../records.js";
import { CALIBRES, calibreRowOf, gunCalibreRows, type CalibreRow } from "./calibres.js";
import {
  AMMUNITION_UPGRADES,
  CONVERSION,
  CRITICAL_TIME_SAVED,
  HANDLOADING_TOOLS,
  MISLOAD_REPAIR,
  RELOADING_BONUS,
  SOURCES,
  TOOLS,
  adjustDamage,
  ammunitionClass,
  areaKnowledgeDiscount,
  allowedUpgrades,
  batchTime,
  bulkDiscount,
  canHandload,
  chambering,
  conversionsFor,
  discounted,
  misloadResult,
  nearRounds,
  perShot,
  upgradeMultiples,
  upgradeRefusal,
  upgradedRow,
  type AmmunitionSource,
  type AmmunitionUpgrade,
  type GunFacts,
  type HandloadingTool,
  type MisloadResult,
  boreMm,
} from "./rules.js";
import {
  MATERIALS,
  PROJECTILES,
  isCargo,
  isExplosiveProjectile,
  PROJECTILE_UPGRADES,
  SHOT_SIZES,
  SILVER_ARMOURY,
  isKinetic,
  isMultiple,
  multipleLoad,
  projectileMultiples,
  projectileRefusal,
  projectileRow,
  projectileUpgradeRefusal,
  type BulletMaterial,
  type Projectile,
  type ProjectileGun,
  type ProjectileLoad,
  type ProjectileUpgrade,
} from "./projectiles.js";
import {
  HT_SMOKES,
  HT_SMOKE_TABLE,
  ILLUMINATIONS,
  LIQUIDS,
  airburstFragments,
  cargoRow,
  explosiveRow,
  type HighTechSmoke,
  type Illumination,
  type Liquid,
} from "./explosive.js";
import { readyCargo, type CargoLoad } from "./cargo.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Ammunition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ammunition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "htLoads";
/** A misloaded round that fired and jammed the gun after it (p. 178), until the shot is spent. */
const JAM_FLAG = "htMisloadJam";

export interface AmmunitionSwitches {
  upgrades: () => boolean;
  handloading: () => boolean;
  misloading: () => boolean;
  /** The projectile options (pp. 109, 166-169). */
  projectiles?: () => boolean;
  /** Exotic bullets (p. 168). */
  exotic?: () => boolean;
  /** Multiple-projectile loads (pp. 172-174). */
  multiple?: () => boolean;
  /** Projectile upgrades (pp. 174-175). */
  projectileUpgrades?: () => boolean;
  /** Explosive-energy projectiles (pp. 169-170, 175). */
  explosive?: () => boolean;
  /** Ejecting- and bursting-cargo projectiles (pp. 171-172). */
  cargo?: () => boolean;
}

/** Whether any of the projectile switches is on. */
const anyProjectiles = (on: AmmunitionSwitches): boolean => Boolean(on.projectiles?.() || on.exotic?.() || on.multiple?.() || on.projectileUpgrades?.() || on.explosive?.() || on.cargo?.());

/**
 * A mode's load, or a box's: the round (blank for the gun's own, or what the
 * box fits), its ammunition upgrades, who made it, and what handloading and
 * shopping did to it.
 */
export interface HighTechLoad {
  mode: number;
  calibre: string;
  upgrades: AmmunitionUpgrade[];
  source: AmmunitionSource;
  /** A handloaded match developed for this gun (p. 174). */
  matched: boolean;
  /** Malf. a critically failed batch of reloads lost (p. 174); 0 or less. */
  batchMalfunction: number;
  /** Percent off found with an Area Knowledge roll (p. 175). */
  discount: number;
  /** The projectile, what it is made of, a multiple load's size and count, its upgrades (pp. 166-175). */
  projectile: Projectile;
  material: BulletMaterial;
  shotMm: number;
  shotCount: number;
  projectileUpgrades: ProjectileUpgrade[];
  poisonCost: number;
  /** A cargo round's choices (pp. 171-172): the kind of smoke or flare, a vomiting agent, a liquid, a poison gas's filler. */
  smoke: HighTechSmoke;
  illumination: Illumination;
  vomiting: boolean;
  liquid: Liquid;
  poisonFiller: string;
  /** The cloud's or light's radius in yards and how long it lasts, as the gun's description prints them; 0 to be asked. */
  radius: number;
  seconds: number;
  /** A cargo round's own dice where the description prints them; blank for the mode's. */
  hitDamage: string;
}

/** Registers the loads and the conversion field before the world's data is read. */
export function initAmmunition(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.ArrayField(
      new f.SchemaField({
        mode: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        calibre: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
        upgrades: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false, choices: [...AMMUNITION_UPGRADES] }), { required: true, initial: [] }),
        source: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SOURCES] }),
        matched: new f.BooleanField({ initial: false }),
        batchMalfunction: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
        discount: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 15 }),
        projectile: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...PROJECTILES] }),
        material: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...MATERIALS] }),
        shotMm: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        shotCount: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        projectileUpgrades: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false, choices: [...PROJECTILE_UPGRADES] }), { required: true, initial: [] }),
        poisonCost: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        smoke: new f.StringField({ required: true, nullable: false, blank: false, initial: "screening", choices: [...HT_SMOKES] }),
        illumination: new f.StringField({ required: true, nullable: false, blank: false, initial: "parachute", choices: [...ILLUMINATIONS] }),
        vomiting: new f.BooleanField({ initial: false }),
        liquid: new f.StringField({ required: true, nullable: false, blank: false, initial: "paint", choices: [...LIQUIDS] }),
        poisonFiller: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
        radius: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        seconds: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        hitDamage: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      }),
      { required: true, initial: [] },
    ),
  });
}

/** The fields this rule keeps on a gun's `firearm` object: the cartridge a caplock was converted to fire (p. 164). */
export function ammunitionGunFields(f: any): Record<string, unknown> {
  return { convertedTo: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }) };
}

// ── reading the loads ──

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];

function cleanLoad(raw: any, mode: number): HighTechLoad {
  const upgrades = (Array.isArray(raw?.upgrades) ? raw.upgrades : []).filter((u: any) => AMMUNITION_UPGRADES.includes(u));
  return {
    mode,
    calibre: String(raw?.calibre ?? ""),
    upgrades: AMMUNITION_UPGRADES.filter((u) => upgrades.includes(u)),
    source: SOURCES.includes(raw?.source) ? raw.source : "",
    matched: raw?.matched === true,
    batchMalfunction: Math.min(0, Math.trunc(Number(raw?.batchMalfunction) || 0)),
    discount: [0, 5, 15].includes(Number(raw?.discount)) ? Number(raw.discount) : 0,
    projectile: (PROJECTILES as readonly string[]).includes(raw?.projectile) ? raw.projectile : "",
    material: (MATERIALS as readonly string[]).includes(raw?.material) ? raw.material : "",
    shotMm: Math.max(0, Number(raw?.shotMm) || 0),
    shotCount: Math.max(0, Math.floor(Number(raw?.shotCount) || 0)),
    projectileUpgrades: PROJECTILE_UPGRADES.filter((u) => Array.isArray(raw?.projectileUpgrades) && raw.projectileUpgrades.includes(u)),
    poisonCost: Math.max(0, Number(raw?.poisonCost) || 0),
    smoke: (HT_SMOKES as readonly string[]).includes(raw?.smoke) ? raw.smoke : "screening",
    illumination: (ILLUMINATIONS as readonly string[]).includes(raw?.illumination) ? raw.illumination : "parachute",
    vomiting: raw?.vomiting === true,
    liquid: (LIQUIDS as readonly string[]).includes(raw?.liquid) ? raw.liquid : "paint",
    poisonFiller: String(raw?.poisonFiller ?? ""),
    radius: Math.max(0, Number(raw?.radius) || 0),
    seconds: Math.max(0, Math.floor(Number(raw?.seconds) || 0)),
    hitDamage: String(raw?.hitDamage ?? "").trim(),
  };
}

/** The loads stored on an item: one a mode on a gun, one (mode 0) on a box. */
export function storedLoads(item: any): HighTechLoad[] {
  const stored: any[] = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? [];
  return stored.map((l) => cleanLoad(l, Math.max(0, Math.floor(Number(l?.mode) || 0))));
}

/** The load an item holds for a mode, or an empty one. */
export function ownLoad(item: any, mode: number): HighTechLoad {
  return storedLoads(item).find((l) => l.mode === mode) ?? cleanLoad({}, mode);
}

async function storeLoad(item: any, load: HighTechLoad): Promise<void> {
  const others = storedLoads(item).filter((l) => l.mode !== load.mode);
  await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}`]: [...others, load].sort((a, b) => a.mode - b.mode) });
}

/** A box of rounds: equipment filed as ammunition (GWorld API 1.67.0). */
export function isBox(item: any): boolean {
  return item?.type === "equipment" && item.system?.category === "ammunition";
}

/** The box a mode was loaded from, where it is still on the character. */
function boxOf(item: any, modeIndex: number): any | null {
  const id = String(rangedModes(item)[modeIndex]?.loadedFrom ?? "");
  if (!id) return null;
  const box = item?.actor?.items?.get?.(id) ?? null;
  return isBox(box) ? box : null;
}

/**
 * The load a mode fires: the box's it was loaded from, where the box holds
 * one, else the gun's own. A match developed for the gun stays the gun's.
 */
export function loadIn(item: any, modeIndex: number): { load: HighTechLoad; box: any | null } {
  const own = ownLoad(item, modeIndex);
  const box = boxOf(item, modeIndex);
  const boxed = box ? storedLoads(box).find((l) => l.mode === 0) : null;
  return boxed ? { load: { ...boxed, mode: modeIndex, matched: own.matched }, box } : { load: own, box };
}

/** The table's row for a round named exactly as the table names it. */
const rowNamed = (name: string): CalibreRow | null => CALIBRES.find((r) => r.name === name) ?? null;

/** A gun's calibre row: the cartridge it was converted to, or the calibre its name gives. */
export function gunCalibre(item: any): CalibreRow | null {
  const converted = String(item?.system?.extensions?.[MODULE_ID]?.firearm?.convertedTo ?? "");
  return (converted && rowNamed(converted)) || calibreRowOf(String(item?.name ?? ""));
}

/** A box's calibre row: its own where set, else what it fits, else its name. */
export function boxCalibre(box: any, load: HighTechLoad = ownLoad(box, 0)): CalibreRow | null {
  if (load.calibre) return rowNamed(load.calibre) ?? calibreRowOf(load.calibre);
  return calibreRowOf(String(box?.system?.ammunition?.fits ?? "")) ?? calibreRowOf(String(box?.name ?? ""));
}

/** What the upgrade rules need of a gun's mode; `projectile` the load's, as fired. */
export function gunFacts(item: any, modeIndex: number, projectile = ""): GunFacts {
  const mode = rangedModes(item)[modeIndex] ?? {};
  return {
    calibre: gunCalibre(item),
    tl: tlOf(item),
    automatic: isAutomatic(item, mode),
    cheap: item?.system?.quality === "cheap",
    skill: String(mode.skill ?? ""),
    ammunition: String(mode.ammunition ?? ""),
    projectile,
  };
}

/**
 * The system's reading of a calibre from a weapon's name (`rules.calibreOf`,
 * which knows gauges), for a gun whose round the table doesn't list; set once
 * the API is ready.
 */
let calibreOfName: (name: string) => number | null = () => null;

/** A round's bore in millimetres: the table's row, else what the name says. */
function boreOf(row: CalibreRow | null, name: string): number | null {
  return (row ? boreMm(row) : null) ?? calibreOfName(name);
}

/** What the projectile rules need of a gun's mode. */
export function projectileGun(item: any, modeIndex: number): ProjectileGun {
  const mode = rangedModes(item)[modeIndex] ?? {};
  const calibre = gunCalibre(item);
  const skill = String(mode.skill ?? "");
  const cls = String(calibre?.class ?? "");
  return {
    calibre,
    boreMm: boreOf(calibre, String(item?.name ?? "")),
    tl: tlOf(item),
    automatic: isAutomatic(item, mode),
    shotgun: calibre ? calibre.class === "shotgun" : /\(shotgun\)/i.test(skill),
    muzzleLoadingRifle: /\(rifle\)/i.test(skill) && (calibre ? calibre.notes.includes("powderAndShot") : false),
    underwater: Boolean(calibre?.notes.includes("underwaterDart")) || firearmBuild(item).underwaterFactor > 0,
    explosive: mode.explosive === true || Boolean(mode.linked?.explosive),
    burstPrimary: mode.explosive === true,
    // A cannon's round against a grenade launcher's, a shotgun's or a mortar's (p. 171).
    lowVelocity: ["shotgun", "grenadeLauncher", "mortar"].includes(cls) || /grenade launcher|shotgun/i.test(skill),
    // Only low-powered smoothbores fire liquid rounds (p. 172).
    lowPowered: cls === "grenadeLauncher" || /grenade launcher/i.test(skill) || isAirGun(item),
    projectiles: Math.max(1, Math.floor(Number(mode.projectiles) || 1)),
  };
}

/** What the projectile rules need of a box: its round, and its own TL where it states one. */
function boxProjectileGun(box: any, load: HighTechLoad): ProjectileGun {
  const calibre = boxCalibre(box, load);
  const tl = tlOf(box);
  return {
    calibre,
    boreMm: boreOf(calibre, String(box?.system?.ammunition?.fits || box?.name || "")),
    tl: tl || 12,
    automatic: false,
    shotgun: calibre?.class === "shotgun",
    muzzleLoadingRifle: false,
    underwater: Boolean(calibre?.notes.includes("underwaterDart")),
    explosive: false,
    projectiles: 1,
  };
}

/** Whether a projectile's switch is on: the options', the multiple loads', the explosive or the cargo rounds'. */
function projectileOn(projectile: string, on: AmmunitionSwitches): boolean {
  if (isKinetic(projectile)) return on.projectiles?.() === true;
  if (isExplosiveProjectile(projectile)) return on.explosive?.() === true;
  if (isCargo(projectile)) return on.cargo?.() === true;
  return isMultiple(projectile) ? on.multiple?.() === true : false;
}

/**
 * The projectile a load fires, as the switches and the gun let it: a
 * projectile whose switch is off, or which the gun can't fire, is the solid
 * bullet; a material needs exotic bullets on; an upgrade its switch and the
 * gun's leave.
 */
export function firedProjectile(load: HighTechLoad, gun: ProjectileGun, on: AmmunitionSwitches): ProjectileLoad {
  const projectile: Projectile = load.projectile && projectileOn(load.projectile, on) && !projectileRefusal(load.projectile, gun) ? load.projectile : "";
  return {
    projectile,
    shotMm: load.shotMm,
    shotCount: load.shotCount,
    material: on.exotic?.() ? load.material : "",
    projectileUpgrades: on.projectileUpgrades?.() ? load.projectileUpgrades.filter((u) => !projectileUpgradeRefusal(u, projectile, gun)) : [],
    poisonCost: load.poisonCost,
    hitDamage: load.hitDamage,
    liquid: load.liquid,
  };
}

/** Whether a fired projectile changes anything. */
const hasProjectile = (p: ProjectileLoad): boolean => Boolean(p.projectile || p.material || p.projectileUpgrades.length);

/** The factor distances underwater are multiplied by for a mode's projectile (p. 169), or 0 for the gun's own. */
export function projectileUnderwaterFactor(item: any, modeIndex: number, on: AmmunitionSwitches): number {
  if (!on.projectiles?.() || !isFirearmItem(item)) return 0;
  return firedProjectile(loadIn(item, modeIndex).load, projectileGun(item, modeIndex), on).projectile === "underwaterDart" ? 25 : 0;
}

/** Whether a mode fires Minié balls, which load a muzzle-loading rifle as a musket (pp. 86, 109). */
export function firesMinieBalls(item: any, modeIndex: number, on: AmmunitionSwitches): boolean {
  if (!on.projectiles?.() || !isFirearmItem(item)) return false;
  return firedProjectile(loadIn(item, modeIndex).load, projectileGun(item, modeIndex), on).projectile === "minie";
}

/** What the upgrade rules need of a box: its round, and its own TL where it states one. */
function boxFacts(box: any, load: HighTechLoad, projectile = ""): GunFacts {
  const tl = tlOf(box);
  return { calibre: boxCalibre(box, load), tl: tl || 12, automatic: false, cheap: false, skill: "", ammunition: String(box?.system?.ammunition?.kind ?? ""), projectile };
}

/** The upgrades a mode's load fires with: those the gun takes, with the projectile it fires. */
function firedUpgrades(item: any, modeIndex: number, load: HighTechLoad, on: AmmunitionSwitches): AmmunitionUpgrade[] {
  const projectile = firedProjectile(load, projectileGun(item, modeIndex), on).projectile;
  return allowedUpgrades(load.upgrades, gunFacts(item, modeIndex, projectile));
}

/** Whether a mode fires paper cartridges, which halve a muzzle-loader's loading time (p. 163). */
export function firesPaperCartridges(item: any, modeIndex: number, on: AmmunitionSwitches): boolean {
  if (!on.upgrades() || !isFirearmItem(item)) return false;
  return firedUpgrades(item, modeIndex, loadIn(item, modeIndex).load, on).includes("paperCartridge");
}

/**
 * How a gun's loaded ammunition is heard (p. 165), for the Hearing roll
 * against the shot: silent rounds on the 16-yard line, subsonic ones a
 * penalty. Null where the load changes nothing.
 */
export function ammunitionHearing(item: any, on: AmmunitionSwitches, modeIndex = 0): { silent: boolean; penalty: number } | null {
  if (!on.upgrades() || !isFirearmItem(item)) return null;
  const load = loadIn(item, modeIndex).load;
  const upgrades = firedUpgrades(item, modeIndex, load, on);
  if (!upgrades.length) return null;
  const mode = rangedModes(item)[modeIndex] ?? {};
  const effect = upgradedRow({ damage: "1d", halfDamageRange: 0, maxRange: 0, accuracy: 0, malfunction: null, minSt: 0 }, upgrades, gunFacts(item, modeIndex), { baseAccuracy: Number(mode.accuracy) || 0 });
  return effect.silent || effect.hearing ? { silent: effect.silent, penalty: effect.hearing } : null;
}

/** Whether an item is a gun, as the firearm rules read it, without the API at hand. */
function isFirearmItem(item: any): boolean {
  return item?.type === "equipment" && rangedModes(item).length > 0 && String(item.system?.weaponClass ?? "firearm") === "firearm";
}

// ── misloading (p. 178) ──

/** The round a mode holds where it isn't the gun's own: the load's stated calibre. */
function roundIn(item: any, modeIndex: number): CalibreRow | null {
  const { load, box } = loadIn(item, modeIndex);
  if (!load.calibre) return null;
  return box ? boxCalibre(box, load) : (rowNamed(load.calibre) ?? calibreRowOf(load.calibre));
}

/** Whether a mode holds a round the gun can't fire as its own: the Misloading Table's case. */
export function misloaded(item: any, modeIndex: number): { gun: CalibreRow; round: CalibreRow } | null {
  const gun = gunCalibre(item);
  const round = roundIn(item, modeIndex);
  if (!gun || !round) return null;
  const how = chambering(gun, round, { selfLoader: isAutomatic(item, rangedModes(item)[modeIndex]), lookup: gunCalibreRows });
  return how === "misload" ? { gun, round } : null;
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    ...(rolls.length ? { rolls } : {}),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** What a misload does to the gun: the malfunction it leaves, if any. */
const MISLOAD_MALFUNCTION: Readonly<Record<MisloadResult, string | null>> = {
  fires: null,
  firesAndJams: null,
  jams: "stoppage",
  misfire: "misfire",
  damaged: "mechanical",
  // Treated as an Explosion whatever the TL (p. 178).
  bursts: "explosion",
};

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;

/**
 * Rolls the Misloading Table for a shot (p. 178), as the attack is made: the
 * listener can't wait, so the dice are the system's own, rolled at once. The
 * shot goes off only on a 3 or 4, at Acc 0; anything else stops it and
 * leaves the gun as the table says.
 */
function rollMisload(api: GWorldApi, context: any, found: { gun: CalibreRow; round: CalibreRow }): void {
  const item = context.item;
  const modeIndex = Number(context.mode?.index) || 0;
  const total = d6() + d6() + d6();
  const result = misloadResult(total);
  const lines = [F("Misload.Rolled", { round: found.round.name, gun: found.gun.name, roll: total }), L(`Misload.${result}`)];
  if (result === "fires" || result === "firesAndJams") {
    // Acc is treated as 0: the aim's Accuracy line goes.
    const modifiers: any[] = context.modifiers ?? [];
    for (let i = modifiers.length - 1; i >= 0; i -= 1) if (modifiers[i]?.key === "accuracy") modifiers.splice(i, 1);
    lines.push(L("Misload.AccZero"));
    if (result === "firesAndJams" && item?.isOwner) void item.setFlag(MODULE_ID, JAM_FLAG, modeIndex);
  } else {
    context.refusal = F("Misload.Refusal", { result: L(`Misload.${result}`) });
    const kind = MISLOAD_MALFUNCTION[result];
    if (kind && item?.isOwner) void api.items.setMalfunction(item, { kind, label: L(`Misload.${result}`), modeIndex } as any);
    if (result === "damaged") {
      const percent = d6() * MISLOAD_REPAIR.partsPercentPerDie;
      const price = Number(item?.system?.cost) || 0;
      lines.push(F("Misload.Repair", { days: MISLOAD_REPAIR.days, percent, cost: Math.round(price * percent) / 100 }));
    }
  }
  void say(context.actor, String(item?.name ?? ""), lines);
}

// ── handloading (p. 174) ──

/** The character's level with Armoury (Small Arms), or null. */
const armoury = (api: GWorldApi, actor: any): number | null => (actor ? api.actors.skillLevel(actor, "Armoury (Small Arms)") : null);

/** An IQ-based roll against a DX-based skill: the level less DX, plus IQ. */
function iqBased(api: GWorldApi, actor: any, skill: string): number | null {
  const level = actor ? api.actors.skillLevel(actor, skill) : null;
  if (typeof level !== "number") return null;
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  return level - dx + iq;
}

/**
 * Develops a perfectly matched load for this gun (p. 174): a day's work, an
 * Armoury (Small Arms) roll and an IQ-based Guns roll. Both succeeding makes
 * its match-grade handloads a perfect match; a critical failure on either is
 * an explosion.
 */
async function developMatch(api: GWorldApi, item: any, modeIndex: number): Promise<void> {
  const actor = item?.actor ?? null;
  const skill = String(rangedModes(item)[modeIndex]?.skill ?? "");
  const levels = [
    { label: "Armoury (Small Arms)", level: armoury(api, actor) },
    { label: F("IqBased", { skill }), level: iqBased(api, actor, skill) },
  ];
  if (levels.some((l) => l.level === null)) return void ui.notifications?.warn(L("NoSkills"));
  const outcomes: any[] = [];
  for (const { label, level } of levels) {
    const outcome: any = await api.roll.success({ actor, base: level!, label: F("MatchRoll", { skill: label, gun: item.name }), skill: label, tags: ["handloading"] } as any);
    if (!outcome) return;
    outcomes.push(outcome);
  }
  const lines: string[] = [];
  if (outcomes.some((o) => o.criticalFailure)) lines.push(L("MatchExplosion"));
  if (outcomes.every((o) => o.success)) {
    await storeLoad(item, { ...ownLoad(item, modeIndex), matched: true });
    lines.push(L("MatchFound"));
  } else lines.push(L("MatchWasted"));
  await say(actor, String(item.name ?? ""), lines);
}

/**
 * Loads a batch (p. 174): the tools set the pace, and an Armoury (Small Arms)
 * roll comes every hour or half-hour (+2 for reloading fired cases). For
 * reloads a critical success takes a quarter off the time and a critical
 * failure a point off the batch's Malf. Jacketed silver bullets are at -3
 * (p. 168).
 */
async function loadBatch(api: GWorldApi, item: any, modeIndex: number, on: AmmunitionSwitches): Promise<void> {
  const actor = item?.actor ?? null;
  const load = isBox(item) ? ownLoad(item, 0) : loadIn(item, modeIndex).load;
  const row = isBox(item) ? boxCalibre(item, load) : gunCalibre(item);
  const option = (value: string, label: string, selected: boolean) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
  const asked = await (foundry.applications.api as any).DialogV2.prompt({
    window: { title: L("BatchTitle") },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <label>${esc(L("BatchTool"))} <select name="tool">${HANDLOADING_TOOLS.map((t) => option(t, F(`Tool.${t}`, TOOLS[t]), t === "press")).join("")}</select></label>
      <label>${esc(L("BatchSource"))} <select name="source">${["handloaded", "reloaded"].map((s) => option(s, L(`Source.${s}`), (load.source || "handloaded") === s)).join("")}</select></label>
      <label>${esc(L("BatchRounds"))} <input type="number" name="rounds" value="20" min="1" step="1" style="width:90px"></label>
    </div>`,
    ok: {
      label: L("BatchLoad"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const get = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
        return { tool: get("tool"), source: get("source"), rounds: Math.max(1, Math.floor(Number(get("rounds")) || 1)) };
      },
    },
    rejectClose: false,
  }) as { tool: HandloadingTool; source: AmmunitionSource; rounds: number } | null;
  if (!asked) return;
  const level = armoury(api, actor);
  if (level === null) return void ui.notifications?.warn(L("NoSkills"));
  const reloads = asked.source === "reloaded";
  const silver = on.exotic?.() === true && load.material === "silver" ? SILVER_ARMOURY : 0;
  const matched = !isBox(item) && load.upgrades.includes("matchGrade");
  const time = batchTime(asked.tool, asked.rounds, matched);
  const rolls: any[] = [];
  let criticalSuccess = false;
  let criticalFailure = false;
  let failures = 0;
  for (let i = 0; i < time.rolls; i += 1) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const outcome: any = api.rules.resolveSuccess(Number(roll.total), level + (reloads ? RELOADING_BONUS : 0) + silver);
    if (!outcome.success) failures += 1;
    if (outcome.criticalSuccess) criticalSuccess = true;
    if (outcome.criticalFailure) criticalFailure = true;
  }
  const minutes = reloads && criticalSuccess ? Math.ceil(time.minutes * (1 - CRITICAL_TIME_SAVED)) : time.minutes;
  const lines = [F("BatchLine", { rounds: asked.rounds, tool: L(`ToolName.${asked.tool}`), minutes, rolls: time.rolls, failures, level: level + (reloads ? RELOADING_BONUS : 0) + silver })];
  if (silver) lines.push(F("BatchSilver", { modifier: silver }));
  const fired = firedProjectile(load, isBox(item) ? boxProjectileGun(item, load) : projectileGun(item, modeIndex), on);
  if (row) lines.push(F("BatchMaterials", { cost: Math.round(perShot(row, [], asked.source, projectileMultiples(fired)).cps * asked.rounds * 100) / 100 }));
  if (reloads && criticalSuccess) lines.push(L("BatchFaster"));
  const next: HighTechLoad = { ...load, mode: isBox(item) ? 0 : modeIndex, source: asked.source };
  if (reloads && criticalFailure) {
    next.batchMalfunction = Math.min(0, load.batchMalfunction) - 1;
    lines.push(L("BatchWorse"));
  }
  if (failures) lines.push(L("BatchFailures"));
  await storeLoad(item, isBox(item) ? next : { ...next, matched: ownLoad(item, modeIndex).matched });
  await say(actor, String(item.name ?? ""), lines, rolls);
}

// ── cartridge conversions (p. 164) ──

async function convert(api: GWorldApi, item: any, to: string): Promise<boolean> {
  const path = `system.extensions.${MODULE_ID}.firearm.convertedTo`;
  if (!to) {
    await item.update({ [path]: "" });
    return true;
  }
  const actor = item?.actor ?? null;
  const level = armoury(api, actor);
  if (level === null) {
    ui.notifications?.warn(L("NoSkills"));
    return false;
  }
  const outcome: any = await api.roll.success({ actor, base: level, label: F("ConvertRoll", { gun: item.name, round: to }), skill: "Armoury (Small Arms)", modifiers: [{ label: L("ConvertModifier"), value: CONVERSION.modifier }], tags: ["conversion"] } as any);
  if (!outcome) return false;
  if (outcome.success) await item.update({ [path]: to });
  await say(actor, String(item.name ?? ""), [F(outcome.success ? "Converted" : "ConvertFailed", { round: to, days: CONVERSION.days })]);
  return Boolean(outcome.success);
}

// ── the item sections ──

const money = (n: number) => `$${Math.round(n * 100) / 100}`;

/** The line naming a round's cost and weight with a load's upgrades and projectile. */
function priceLine(row: CalibreRow, load: HighTechLoad, upgrades: AmmunitionUpgrade[], on: AmmunitionSwitches, projectile: ProjectileLoad, rounds?: number): string {
  const source = on.handloading() ? load.source : "";
  const extra = projectileMultiples(projectile);
  const shot = perShot(row, upgrades, source, extra);
  const multiples = upgradeMultiples(upgrades);
  const off = [rounds === undefined ? 0 : bulkDiscount(rounds), load.discount].filter(Boolean);
  const cps = discounted(shot.cps, ...off);
  const parts = [F("PerShot", { cps: money(cps), wps: shot.wps, table: money(row.cps), multiple: Math.round(multiples.cps * extra.cps * 1000) / 1000 })];
  if (extra.add) parts.push(F("PoisonLine", { cost: money(extra.add) }));
  if (source) parts.push(L(`SourceLine.${source}`));
  if (off.length) parts.push(F("Discounts", { percents: off.map((p) => `${p}%`).join(", ") }));
  const lc = [multiples.lc, extra.lc].filter((n): n is number => n !== null);
  if (lc.length) parts.push(F("Lc", { lc: Math.min(...lc) }));
  return parts.join(" ");
}

/** The projectiles the sheet offers a load: the solid bullet, then each whose switch is on and the gun fires, or the one chosen. */
function projectileChoices(load: HighTechLoad, gun: ProjectileGun, on: AmmunitionSwitches): Array<Record<string, unknown>> {
  return PROJECTILES.filter((p) => !p || projectileOn(p, on))
    .map((p) => ({ p, why: p ? projectileRefusal(p, gun) : null }))
    .filter(({ p, why }) => !why || p === load.projectile)
    .map(({ p, why }) => ({ value: p, label: L(`Projectile.${p || "solid"}`) + (why ? ` (${L(`ProjectileRefusal.${why}`)})` : ""), selected: p === load.projectile }));
}

/** The Basic Set's named poisons a poison-gas round may carry: those breathed in or taking effect on the skin; set once the API is ready. */
let gasFillers: () => string[] = () => [];

/** A cargo round's own choices on the sheet (pp. 171-172), or null for any other projectile. */
function cargoContext(load: HighTechLoad, fired: ProjectileLoad, gun: ProjectileGun): Record<string, unknown> | null {
  const p = fired.projectile;
  if (!isCargo(p)) return null;
  const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
  return {
    smokes: p === "smoke"
      ? HT_SMOKES.filter((k) => HT_SMOKE_TABLE[k].tl <= gun.tl || k === load.smoke).map((k) => option(k, L(`Smoke.${k}`), k === load.smoke))
      : null,
    illuminations: p === "illumination"
      ? ILLUMINATIONS.filter((k) => k !== "infrared" || gun.tl >= 8 || k === load.illumination).map((k) => option(k, L(`Illumination.${k}`), k === load.illumination))
      : null,
    vomiting: p === "tearGas" ? { checked: load.vomiting } : null,
    liquids: p === "liquid" ? LIQUIDS.map((k) => option(k, L(`Liquid.${k}`), k === load.liquid)) : null,
    fillers: p === "poisonGas" ? [option("", L("NoFiller"), !load.poisonFiller), ...gasFillers().map((n) => option(n, n, n === load.poisonFiller))] : null,
    // Where the cloud or light goes, and for how long; white phosphorus's smoke lasts its minute.
    area: p === "liquid" ? null : { radius: load.radius || "", seconds: load.seconds || "", showSeconds: p !== "whitePhosphorus" },
    // The round's own dice, where the gun's description prints them (p. 143).
    hit: p === "poisonGas" || p === "whitePhosphorus" ? null : { value: load.hitDamage, placeholder: gun.burstPrimary ? L("HitPrinted") : L("HitOwn") },
  };
}

/** The sheet's projectile fields for a load: the projectile, a multiple load's size and count, poison, material, upgrades. */
function projectileContext(load: HighTechLoad, gun: ProjectileGun, on: AmmunitionSwitches): Record<string, unknown> {
  const fired = firedProjectile(load, gun, on);
  const sized = ["shotshell", "canister", "multiFlechette", "rubberShot", "buckAndBall"].includes(fired.projectile);
  const filled = sized ? multipleLoad(fired, gun) : null;
  return {
    projectiles: on.projectiles?.() || on.multiple?.() || on.explosive?.() || on.cargo?.() ? projectileChoices(load, gun, on) : [],
    cargo: cargoContext(load, fired, gun),
    projectileHint: L(`ProjectileHint.${fired.projectile || "solid"}`),
    shot: filled ? { mm: load.shotMm || "", count: load.shotCount || "", mmPlaceholder: filled.mm, countPlaceholder: filled.count, sizes: SHOT_SIZES } : null,
    poison: fired.projectile === "poison" ? { cost: load.poisonCost || "" } : null,
    materials: on.exotic?.() ? MATERIALS.map((m) => ({ value: m, label: L(`Material.${m || "lead"}`), selected: m === load.material })) : [],
    materialHint: L(`MaterialHint.${load.material || "lead"}`),
    projectileUpgrades: on.projectileUpgrades?.()
      ? PROJECTILE_UPGRADES.map((u) => {
        const why = projectileUpgradeRefusal(u, fired.projectile, gun);
        return { key: u, label: L(`ProjectileUpgrade.${u}`), checked: load.projectileUpgrades.includes(u) && !why, refused: why ? L(`ProjectileUpgradeRefusal.${why}`) : "", hint: L(`ProjectileUpgradeHint.${u}`) };
      })
      : [],
  };
}

function upgradeChoices(load: HighTechLoad, facts: GunFacts): Array<Record<string, unknown>> {
  return AMMUNITION_UPGRADES.map((upgrade) => {
    const others = load.upgrades.filter((u) => u !== upgrade);
    const why = upgradeRefusal(upgrade, facts, others);
    return { key: upgrade, label: L(`Upgrade.${upgrade}`), checked: load.upgrades.includes(upgrade) && !why, refused: why ? L(`Refusal.${why}`) : "", hint: L(`UpgradeHint.${upgrade}`) };
  }).filter((c) => c.checked || !c.refused || c.refused !== L("Refusal.class"));
}

function gunContext(item: any, on: AmmunitionSwitches): Record<string, unknown> {
  const calibre = gunCalibre(item);
  const modes = rangedModes(item).map((m, index) => {
    const { load, box } = loadIn(item, index);
    const gun = projectileGun(item, index);
    const fired = firedProjectile(load, gun, on);
    const facts = gunFacts(item, index, fired.projectile);
    const upgrades = allowedUpgrades(load.upgrades, facts);
    const boxed = box && storedLoads(box).some((l) => l.mode === 0);
    const round = on.misloading() && !boxed ? load.calibre : "";
    const near = calibre ? nearRounds(calibre, CALIBRES) : [];
    const misload = on.misloading() ? misloaded(item, index) : null;
    return {
      index,
      name: String(m.name || F("Mode", { index: index + 1 })),
      boxed: boxed ? F("FromBox", { box: box.name }) : "",
      upgrades: on.upgrades() && !boxed ? upgradeChoices(load, facts) : [],
      ...(boxed ? {} : projectileContext(load, gun, on)),
      // The rounds in the gun: its own calibre's, or the other round loaded.
      price: (on.upgrades() || anyProjectiles(on)) && (roundIn(item, index) ?? calibre) ? priceLine((roundIn(item, index) ?? calibre)!, load, on.upgrades() ? upgrades : [], on, fired) : "",
      handloading: on.handloading() && !boxed && canHandload(calibre),
      sources: SOURCES.map((s) => ({ value: s, label: L(`Source.${s || "factory"}`), selected: load.source === s })),
      canMatch: on.handloading() && canHandload(calibre) && load.upgrades.includes("matchGrade"),
      matched: load.matched ? L("Matched") : "",
      batchMalfunction: load.batchMalfunction ? F("BatchMalfunction", { malf: load.batchMalfunction }) : "",
      misloading: on.misloading() && !boxed && Boolean(calibre),
      rounds: [{ value: "", label: F("OwnRound", { round: calibre?.name ?? "" }), selected: !round }, ...near.map((r) => ({ value: r.name, label: r.name, selected: r.name === round }))],
      misload: misload ? F("MisloadLine", { round: misload.round.name }) : "",
    };
  });
  const conversions = on.upgrades() ? conversionsFor(gunCalibre({ ...item, system: { ...item.system, extensions: {} } }), CALIBRES) : [];
  const converted = String(item?.system?.extensions?.[MODULE_ID]?.firearm?.convertedTo ?? "");
  return {
    editable: item.isOwner,
    calibre: calibre ? F("Calibre", { name: calibre.name, cls: L(`Class.${ammunitionClass(calibre)}`) }) : L("NoCalibre"),
    modes,
    conversion: conversions.length || converted
      ? { options: [{ value: "", label: L("NotConverted"), selected: !converted }, ...conversions.map((r) => ({ value: r.name, label: r.name, selected: r.name === converted }))], hint: F("ConvertHint", { modifier: CONVERSION.modifier, days: CONVERSION.days }) }
      : null,
  };
}

function boxContext(item: any, on: AmmunitionSwitches): Record<string, unknown> {
  const load = ownLoad(item, 0);
  const row = boxCalibre(item, load);
  const gun = boxProjectileGun(item, load);
  const fired = firedProjectile(load, gun, on);
  const facts = boxFacts(item, load, fired.projectile);
  const upgrades = allowedUpgrades(load.upgrades, facts);
  const quantity = Math.max(0, Math.floor(Number(item.system?.quantity) || 0));
  const priced = on.upgrades() || anyProjectiles(on);
  return {
    editable: item.isOwner,
    box: true,
    calibreValue: load.calibre,
    calibrePlaceholder: row?.name ?? L("NoCalibre"),
    calibreList: CALIBRES.map((r) => r.name).filter((n, i, all) => all.indexOf(n) === i),
    modes: [{
      index: 0,
      name: "",
      upgrades: on.upgrades() ? upgradeChoices(load, facts) : [],
      ...projectileContext(load, gun, on),
      price: priced && row ? priceLine(row, load, on.upgrades() ? upgrades : [], on, fired, quantity) : priced ? L("NoCalibre") : "",
      handloading: on.handloading() && canHandload(row),
      sources: SOURCES.map((s) => ({ value: s, label: L(`Source.${s || "factory"}`), selected: load.source === s })),
      batchMalfunction: load.batchMalfunction ? F("BatchMalfunction", { malf: load.batchMalfunction }) : "",
      shop: on.upgrades() && Boolean(row),
      discount: load.discount ? F("Found", { percent: load.discount }) : "",
    }],
  };
}

async function shop(api: GWorldApi, box: any): Promise<void> {
  const actor = box?.actor ?? null;
  const level = actor ? api.actors.skillLevel(actor, "Area Knowledge") : null;
  if (typeof level !== "number") return void ui.notifications?.warn(L("NoAreaKnowledge"));
  const outcome: any = await api.roll.success({ actor, base: level, label: F("ShopRoll", { box: box.name }), skill: "Area Knowledge", tags: ["shopping"] } as any);
  if (!outcome) return;
  const discount = areaKnowledgeDiscount(outcome);
  await storeLoad(box, { ...ownLoad(box, 0), mode: 0, discount });
  await say(actor, String(box.name ?? ""), [discount ? F("Found", { percent: discount }) : L("FoundNone")]);
}

function listeners(api: GWorldApi, element: HTMLElement, item: any, on: AmmunitionSwitches): void {
  const box = isBox(item);
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-ammo]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccHtAmmo);
      const mode = Number(input.dataset.mode) || 0;
      const load = ownLoad(item, mode);
      if (field === "upgrade") {
        const upgrade = String(input.dataset.upgrade) as AmmunitionUpgrade;
        const checked = (input as HTMLInputElement).checked;
        const gun = box ? boxProjectileGun(item, load) : projectileGun(item, mode);
        const projectile = firedProjectile(load, gun, on).projectile;
        const facts = box ? boxFacts(item, load, projectile) : gunFacts(item, mode, projectile);
        const others = load.upgrades.filter((u) => u !== upgrade);
        const why = checked ? upgradeRefusal(upgrade, facts, others) : null;
        if (why) {
          ui.notifications?.warn(L(`Refusal.${why}`));
          (input as HTMLInputElement).checked = false;
          return;
        }
        await storeLoad(item, { ...load, upgrades: checked ? [...others, upgrade] : others });
      } else if (field === "source") await storeLoad(item, { ...load, source: input.value as AmmunitionSource });
      else if (field === "calibre") await storeLoad(item, { ...load, calibre: input.value.trim() });
      else if (field === "projectile") await storeLoad(item, { ...load, projectile: input.value as Projectile, shotMm: 0, shotCount: 0 });
      else if (field === "material") await storeLoad(item, { ...load, material: input.value as BulletMaterial });
      else if (field === "shotMm" || field === "shotCount" || field === "poisonCost" || field === "radius" || field === "seconds") {
        const value = Math.max(0, Number(input.value) || 0);
        await storeLoad(item, { ...load, [field]: field === "shotCount" || field === "seconds" ? Math.floor(value) : value });
      } else if (field === "smoke" || field === "illumination" || field === "liquid" || field === "poisonFiller" || field === "hitDamage") {
        await storeLoad(item, { ...load, [field]: input.value.trim() });
      } else if (field === "vomiting") {
        await storeLoad(item, { ...load, vomiting: (input as HTMLInputElement).checked });
      } else if (field === "projectileUpgrade") {
        const upgrade = String(input.dataset.upgrade) as ProjectileUpgrade;
        const checked = (input as HTMLInputElement).checked;
        const gun = box ? boxProjectileGun(item, load) : projectileGun(item, mode);
        const why = checked ? projectileUpgradeRefusal(upgrade, firedProjectile(load, gun, on).projectile, gun) : null;
        if (why) {
          ui.notifications?.warn(L(`ProjectileUpgradeRefusal.${why}`));
          (input as HTMLInputElement).checked = false;
          return;
        }
        const others = load.projectileUpgrades.filter((u) => u !== upgrade);
        await storeLoad(item, { ...load, projectileUpgrades: checked ? [...others, upgrade] : others });
      }
      else if (field === "convertedTo") {
        if (!(await convert(api, item, input.value))) (input as HTMLSelectElement).value = String(item?.system?.extensions?.[MODULE_ID]?.firearm?.convertedTo ?? "");
      }
    });
  });
  element.querySelectorAll<HTMLElement>("[data-gcc-ht-ammo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = Number(button.dataset.mode) || 0;
      const action = String(button.dataset.gccHtAmmoAction);
      if (action === "match") void developMatch(api, item, mode);
      else if (action === "batch") void loadBatch(api, item, mode, on);
      else if (action === "shop") void shop(api, item);
    });
  });
}

/** A mode's load as it is fired: the stored load with the projectile the switches and the gun let through. */
type FiredLoad = HighTechLoad & { fired: ProjectileLoad };

/** A projectile's tag: its name, a multiple load's size and count, a cargo round's kind. */
function projectileLabel(fired: ProjectileLoad, gun: ProjectileGun, load?: HighTechLoad): string {
  const name = L(`Projectile.${fired.projectile}`);
  if (load && fired.projectile === "smoke") return F("CargoKind", { name, kind: L(`Smoke.${load.smoke}`) });
  if (load && fired.projectile === "illumination") return F("CargoKind", { name, kind: L(`Illumination.${load.illumination}`) });
  if (load && fired.projectile === "liquid") return F("CargoKind", { name, kind: L(`Liquid.${load.liquid}`) });
  if (load && fired.projectile === "tearGas" && load.vomiting) return F("CargoKind", { name, kind: L("Vomiting") });
  if (load && fired.projectile === "poisonGas" && load.poisonFiller) return F("CargoKind", { name, kind: load.poisonFiller });
  if (!["shotshell", "canister", "multiFlechette", "rubberShot", "buckAndBall"].includes(fired.projectile)) return name;
  const { mm, count } = multipleLoad(fired, gun);
  return F("ProjectileSized", { name, mm, count });
}

/**
 * The row with the Basic Set round chosen on the mode taken back off it
 * (Characters pp. 276, 279), for a High-Tech projectile to take its place:
 * the damage type and divisor the mode lists, APDS's range and +1 a die
 * gone. Null where the system's switch is off or the round did nothing.
 */
function withoutBasicRound(api: GWorldApi, row: LoadRow, place: LoadPlace): LoadRow | null {
  const kind = String(place.mode?.ammunition ?? "");
  if (!kind || !api.registry.isRuleOn("ammunitionTypes")) return null;
  const basis = place.basis ?? {};
  const damageType = String(basis.damageType ?? row.damageType);
  const armorDivisor = Number(basis.armorDivisor) || 1;
  const round: any = api.rules.ammunitionEffect?.(kind as any, { damageType: damageType as any, armorDivisor, calibreMm: api.rules.calibreOf?.(String(place.item?.name ?? "")) ?? null, tl: tlOf(place.item), bow: false });
  if (!round?.available) return null;
  const stretch = Number(round.rangeMultiplier) || 1;
  const dice = parseDice(row.damage);
  const damage = round.perDieBonus && dice ? formatDice({ ...dice, adds: dice.adds - dice.dice * round.perDieBonus }) : row.damage;
  return { ...row, damage, damageType, armorDivisor, halfDamageRange: Math.round(row.halfDamageRange / stretch), maxRange: Math.round(row.maxRange / stretch) };
}

/**
 * What an explosive or cargo round makes of the row (pp. 169-172, 175), once
 * the shot itself is done: the blast linked or following, bursting inside,
 * its fragments, the cargo's lack of a blast. An airburst HE round does only
 * its fragments' damage (p. 175).
 */
function blastOf(after: LoadRow, load: FiredLoad, gun: ProjectileGun, on: AmmunitionSwitches): LoadRow {
  const p = load.fired.projectile;
  let row = after;
  const notes = [...after.notes];
  if (isExplosiveProjectile(p)) {
    const made = explosiveRow(row, p, { tl: gun.tl, burstPrimary: gun.burstPrimary === true });
    row = made.row;
    notes.push(...made.notes);
  } else if (isCargo(p)) {
    const made = cargoRow(row, p);
    row = made.row;
    notes.push(...made.notes);
  }
  // HE-AB: fragments only, in a cone along the line of fire (p. 175). The round is the
  // mode's own explosive one, or an explosive projectile that throws fragments.
  if (on.explosive?.() && load.fired.projectileUpgrades.includes("airburst") && gun.explosive && (!p || isExplosiveProjectile(p))) {
    const fragments = airburstFragments(row);
    if (fragments) {
      row = fragments;
      notes.push({ key: "airburstFragments" });
    }
  }
  return { ...row, notes };
}

/** The cargo a mode fires, as the switches let it: its round, its choices, and the gun's TL; null for none. */
function cargoLoadIn(item: any, modeIndex: number, on: AmmunitionSwitches): CargoLoad | null {
  if (!isFirearmItem(item)) return null;
  const load = loadIn(item, modeIndex).load;
  const gun = projectileGun(item, modeIndex);
  const fired = firedProjectile(load, gun, on);
  if (!fired.projectile || !(isCargo(fired.projectile) || isExplosiveProjectile(fired.projectile))) return null;
  return {
    projectile: fired.projectile,
    smoke: load.smoke,
    illumination: load.illumination,
    vomiting: load.vomiting,
    liquid: load.liquid,
    poisonFiller: load.poisonFiller,
    radius: load.radius,
    seconds: load.seconds,
    tl: gun.tl,
  };
}

export function readyAmmunition(api: GWorldApi, on: AmmunitionSwitches): void {
  const any = () => on.upgrades() || on.handloading() || on.misloading() || anyProjectiles(on);
  calibreOfName = (name) => api.rules.calibreOf?.(name) ?? null;
  gasFillers = () => ((api.rules as any).POISON_EXAMPLES ?? [])
    .filter((p: any) => (p.delivery ?? []).some((d: string) => d === "respiratory" || d === "contact"))
    .map((p: any) => String(p.name));
  readyCargo(api, { explosive: () => on.explosive?.() === true, cargo: () => on.cargo?.() === true }, (item, modeIndex) => cargoLoadIn(item, modeIndex, on));
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-ammunition-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-ammunition.hbs`,
    visible: (item) => any() && (isBox(item) ? on.upgrades() || on.handloading() || anyProjectiles(on) : isFirearm(api, item)),
    context: (item) => (isBox(item) ? boxContext(item, on) : gunContext(item, on)),
    listeners: (element, item) => listeners(api, element, item, on),
  });

  // A box's cost and weight per round: the calibre's CPS and WPS times the upgrades, less what was found (pp. 175-177).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-ammunition",
    types: ["equipment"],
    apply: (item: any) => {
      if (!isBox(item)) return null;
      const load = ownLoad(item, 0);
      const row = boxCalibre(item, load);
      if (!row) return null;
      const fired = firedProjectile(load, boxProjectileGun(item, load), on);
      // Rounds are priced from the table with the upgrades on, or where the box's projectile changes them.
      if (!on.upgrades() && !hasProjectile(fired)) return null;
      const upgrades = on.upgrades() ? allowedUpgrades(load.upgrades, boxFacts(item, load, fired.projectile)) : [];
      const shot = perShot(row, upgrades, on.handloading() ? load.source : "", projectileMultiples(fired));
      const quantity = Math.max(0, Math.floor(Number(item.system?.quantity) || 0));
      return { cost: discounted(shot.cps, bulkDiscount(quantity), load.discount), weight: shot.wps, label: F("PriceLabel", { round: row.name }) };
    },
  } as any);

  // Each mode fires its load: its projectile in place of the solid bullet (pp. 166-175), then
  // Acc, Dmg, Range, ST and Malf. as the upgrades leave them (pp. 163-166, 174).
  registerLoadRows<FiredLoad>(api, {
    on: () => on.upgrades() || on.handloading() || anyProjectiles(on),
    loadFor: (item, index) => {
      if (!isFirearm(api, item)) return null;
      const load = loadIn(item, index).load;
      const fired = firedProjectile(load, projectileGun(item, index), on);
      const upgrades = on.upgrades() ? firedUpgrades(item, index, load, on) : [];
      const worse = on.handloading() ? load.batchMalfunction : 0;
      return upgrades.length || worse || hasProjectile(fired) ? { ...load, upgrades, batchMalfunction: worse, fired } : null;
    },
    // An upgrade improves the whole round, whatever projectile the Basic Set's choice put in it;
    // a High-Tech projectile takes the Basic Set round's place (`withoutBasicRound`).
    basicAmmunition: null,
    apply: (load, start, place) => {
      const gun = projectileGun(place.item, place.modeIndex);
      const facts = gunFacts(place.item, place.modeIndex, load.fired.projectile);
      const notes: Array<{ key: string; data?: Record<string, unknown> }> = [];
      let before = start;
      let factor = 1;
      let effectOf: ReturnType<typeof projectileRow> | null = null;
      if (hasProjectile(load.fired)) {
        if (load.fired.projectile) {
          const plain = withoutBasicRound(api, start, place);
          if (plain) {
            before = plain;
            notes.push({ key: "replacesBasic", data: { round: L(`BasicRound.${place.mode?.ammunition}`) } });
          }
        }
        effectOf = projectileRow(
          { damage: before.damage, damageType: before.damageType, armorDivisor: before.armorDivisor, halfDamageRange: before.halfDamageRange, maxRange: before.maxRange, accuracy: before.accuracy ?? 0, malfunction: before.malfunction ?? null, projectiles: before.projectiles, recoil: before.recoil ?? 0 },
          load.fired, gun,
        );
        factor = effectOf.damageFactor;
        before = { ...before, ...effectOf.row };
      }
      const matched = on.handloading() && load.matched && load.source === "handloaded";
      const baseAccuracy = Number(place.basis?.accuracy ?? place.mode?.accuracy) || 0;
      const effect = upgradedRow(
        { damage: before.damage, halfDamageRange: before.halfDamageRange, maxRange: before.maxRange, accuracy: before.accuracy ?? 0, malfunction: before.malfunction ?? null, minSt: before.minSt ?? 0 },
        load.upgrades, facts, { baseAccuracy, matched, batchMalfunction: load.batchMalfunction, damageFactor: factor },
      );
      notes.push(...effect.notes.map((key) => ({ key })));
      if (effect.silent) notes.push({ key: "silent" });
      if (effect.hearing) notes.push({ key: "hearing", data: { value: effect.hearing } });
      if (load.batchMalfunction) notes.push({ key: "batch", data: { malf: load.batchMalfunction } });
      if (matched && load.upgrades.includes("matchGrade")) notes.push({ key: "matched" });
      const after: LoadRow = { ...before, ...effect.row, notes };
      if (effectOf) {
        notes.push(...effectOf.notes);
        if (effectOf.noOverpenetration) after.noOverpenetration = true;
        if (effectOf.doubleKnockback) after.doubleKnockback = true;
        if (effectOf.incendiary) after.incendiary = true;
        if (effectOf.scatterSquared) after.scatterSquared = true;
        const first = effectOf.firstHit;
        if (first) after.firstHit = { damage: adjustDamage(first.damage, first.factor * effect.damageFactor), damageType: first.damageType, armorDivisor: first.armorDivisor, label: L("FirstHitBall") };
      }
      return blastOf(after, load, gun, on);
    },
    tags: (load, after, place) => [
      ...(load.fired.projectile ? [{ label: projectileLabel(load.fired, projectileGun(place.item, place.modeIndex), load), hint: L(`ProjectileHint.${load.fired.projectile}`) }] : []),
      ...(load.fired.material ? [{ label: L(`Material.${load.fired.material}`), hint: L(`MaterialHint.${load.fired.material}`) }] : []),
      ...load.fired.projectileUpgrades.map((u) => ({ label: L(`ProjectileUpgrade.${u}`), hint: L(`ProjectileUpgradeHint.${u}`) })),
      ...load.upgrades.map((u) => ({ label: L(`Upgrade.${u}`), hint: L(`UpgradeHint.${u}`) })),
      ...after.notes.map((note) => ({ label: F(`Note.${note.key}`, note.data ?? {}), hint: L(`NoteHint.${note.key}`) })),
    ],
  });

  // A misloaded round rolls the Misloading Table as it is fired (p. 178).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.misloading() || !context?.item || context.refusal || !context.mode?.ranged) return;
    if (!isFirearm(api, context.item)) return;
    const found = misloaded(context.item, Number(context.mode.index) || 0);
    if (found) rollMisload(api, context, found);
  });

  // A misloaded round that fired and jammed: the gun is out of action once the shot is spent (p. 178).
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!item?.isOwner || item.getFlag?.(MODULE_ID, JAM_FLAG) === undefined || item.getFlag?.(MODULE_ID, JAM_FLAG) === null) return;
    const modeIndex = Number(item.getFlag(MODULE_ID, JAM_FLAG)) || 0;
    void (async () => {
      await item.unsetFlag(MODULE_ID, JAM_FLAG);
      await api.items.setMalfunction(item, { kind: "stoppage", label: L("Misload.firesAndJams"), modeIndex } as any);
    })();
  });
}
