/**
 * High-Tech's firearm accessories (pp. 155-160), registered with the system
 * through the add-on API under five switches. The rules are in `rules.ts`;
 * the catalogue is registered with the shared accessory engine, so a record
 * from this book's pack is known by its name.
 *
 * An accessory is an item of its own, carried beside the gun and fitted to
 * it from the accessory's sheet (its price and weight are its own). A
 * magazine isn't: it is worked out on the gun, which it reprices.
 *
 *   - **Magazines (gunMagazines):** an extended, high-density or drum
 *     magazine on the gun: its capacity through `gworld.shotsEntry`, its
 *     weight and cost from the calibre's WPS, -1 Bulk past 1.5 (extended) or
 *     3 (drum) times the normal capacity, -1 Malf. for a drum or where the GM
 *     says it's unreliable, and -1 Malf. for magazines clamped or taped
 *     together where the GM finds the conditions harsh; a gun with a
 *     high-capacity magazine where the law restricts one counts as LC1-2
 *     rather than LC3-4 (`gworld.legalityClass`).
 *   - **Sights (gunSights):** the best magnifying sight -- a scope by the +1
 *     Acc, a night or thermal sight's +2, a computer sight's magnification --
 *     goes on the gun's rows as their scope (`scopeBonus`, and `scopeFixed`
 *     for a fixed-power one), which the system counts after the seconds of
 *     Aim and shows as "Acc 5+2"; a computer sight's targeting program and
 *     rangefinder; a reflex or collimating sight's +1 to 300 yards; all of it
 *     held to the gun's base Acc. The darkness line (keyed `darkness`) loses
 *     what the sights negate: a TL7+ scope a point on an aimed shot, an
 *     illuminated reticle two, improved-visibility sights one, a reflex sight
 *     three; a tactical light, switched on for the shot, leaves no worse
 *     than -3 within its beam. A targeting laser reaches as far as its
 *     colour does in daylight or low light (the `laser` line and the target's
 *     Dodge bonus follow it), an infrared dot only for a shooter who can see
 *     it, and a reflex sight gives nothing while the laser is on. A
 *     high-powered scope's -1 Bulk unaimed, and the sights' own Bulk.
 *     Looking through a night, thermal or computer sight (toggled from the
 *     gun's row) gives its Night Vision or Infravision and leaves the shooter
 *     colorblind with tunnel vision, through `gworld.traitEffects`. A
 *     targeting laser's colour reprices it. A bow takes these sights
 *     as a gun does, and a crossbow its scopes, collimating sights and
 *     targeting lasers (p. 201).
 *   - **Suppressors (suppressors):** fitted only to a gun that takes one
 *     (never an ordinary revolver: the weapon families' `gunTakesSuppressor`);
 *     their Bulk; a wiper design's damage and range, for its 40 shots; a
 *     home-built one's grade, lifetime and penalties; and a Hearing roll for
 *     whoever might hear the shot, from the Hearing Distance Table.
 *   - **Cinematic silencers (cinematicSilencers):** that roll's suppressor
 *     penalty doubled, or tripled.
 *   - **Stocks and mounts (stocksAndMounts):** a pistol stock (Guns (Rifle),
 *     +1 Acc, -1 Bulk, ST x0.8); a folding stock folded or unfolded from the
 *     gun's row (Bulk +1, Acc -1, Recoil +1, ST x1.2), and a bipod deployed
 *     or folded (braced and ST x2/3 when prone); shooting sticks bracing a
 *     sitting shooter. A gun whose record keeps "Folded Stock" or "w/ Bipod"
 *     modes (43 of them, as the GCA file prints them) keeps them: the state
 *     picks the mode, and a shot from the other one is refused.
 *
 * Gear made for a sidearm fits only a pistol, and for a shoulder arm no
 * pistol; an add-on night sight works only in front of a scope or
 * collimating sight on the same gun; a high-density magazine goes in a grip
 * only where the gun was designed for one; an open bipod braces a shooter
 * who isn't prone where the GM lets it rest on something (an attack
 * option); and a home-built suppressor is designed and built from its sheet,
 * a botched one rolling the Malfunction Table on its first shot.
 *
 * The Bulk the accessories leave -- magazine, suppressor, sights, stocks --
 * is the rows' own `bulk`, so the Combat tab shows it and the system takes
 * it on a Move and Attack, in close combat and when driving.
 */

import { ACCESSORY_TABLES, accessoryOf, minStPenaltyAfter, minStPenaltyAt, multiplyDamage, scaledMinSt, type AccessoryFigures, type AccessoryKind } from "../../../shared/accessories/index.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { calibreRowOf } from "../ammunition/calibres.js";
import { shineTacticalLight, shinesInfrared } from "../expedition/index.js";
import { isFirearm } from "../firearms/index.js";
import { modernMalfunction } from "../firearms/rules.js";
import { loadingOf } from "../reloading/index.js";
import { familyData, gunTakesSuppressor } from "../weapon-families/index.js";
import {
  ADD_ON_HOSTS,
  BIPOD,
  FOLDED_STOCK,
  accessoryFits,
  bowSightKinds,
  HEARD_AT,
  HOME_BUILT,
  LASER_COLOUR,
  LASER_COLOURS,
  MAGAZINE_KINDS,
  MAGAZINE_MATERIALS,
  OUTSIDE_CONE,
  PISTOL_STOCK,
  REPORTS,
  SEALED_BREECH,
  SUPPRESSOR_BUILD,
  SUPPRESSOR_GRADES,
  UNFAMILIAR_LISTENER,
  suppressorBuildRolls,
  catalogueFigures,
  cinematicHearing,
  foldedBulk,
  foldedRecoil,
  hearingDistanceModifier,
  highDensityFits,
  levelWithin,
  magazineCapacity,
  magazineFigures,
  magazinePriceChange,
  modeMatches,
  modeSetup,
  JOINED_MAGAZINES_MALFUNCTION,
  restrictedMagazineClass,
  overSightCap,
  rangefinderBonus,
  reflexBonus,
  reportOf,
  DARKNESS_OFFSET,
  darknessAfter,
  laserReach,
  scopeDarkness,
  seesLaserDot,
  suppressorHearing,
  suppressorSeconds,
  unaimedScopeBulk,
  type LaserColour,
  type MagazineKind,
  type MagazineMaterial,
  type Report,
  type SuppressorGrade,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Accessories.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Accessories.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "gunAccessory";
const GUN_FIELD = "firearm";
/** The attack option that switches a fitted tactical light on for the shot (p. 156). */
const LIGHT_OPTION = "ht-tactical-light";
/** The attack option that sets an open bipod on something stable for a shooter who isn't prone (p. 160). */
const BIPOD_REST_OPTION = "ht-bipod-rest";

export interface AccessorySwitches {
  magazines: () => boolean;
  sights: () => boolean;
  suppressors: () => boolean;
  cinematic: () => boolean;
  stocks: () => boolean;
  /** Gun care, whose TL6-8 swap of misfires and stoppages a botched suppressor's malfunction takes too (p. 81). */
  gunCare?: () => boolean;
}

/** Which switch each kind of accessory is under. */
const SWITCH_OF: Record<AccessoryKind, keyof AccessorySwitches> = {
  scope: "sights",
  reflexSight: "sights",
  visibilitySights: "sights",
  nightSight: "sights",
  thermalSight: "sights",
  computerSight: "sights",
  targetingLaser: "sights",
  tacticalLight: "sights",
  suppressor: "suppressors",
  pistolStock: "stocks",
  foldingStock: "stocks",
  bipod: "stocks",
  shootingSticks: "stocks",
};

// ── data ──

/** What this module keeps on an accessory item. */
export interface AccessoryData {
  /** The id of the gun it is fitted to, on the same character; blank when it isn't. */
  gun: string;
  /** A scope's +1 Acc or a suppressor's -1 Hearing, bought by the level. */
  level: number;
  colour: LaserColour;
  /** A home-built suppressor's grade; blank for a production model. */
  grade: SuppressorGrade | "";
  /** The shots a suppressor lasts where it doesn't last indefinitely, and those fired through it. */
  lifetime: number;
  fired: number;
  /** A computer sight bought with Night Vision rather than Infravision. */
  nightVision: boolean;
  /** A scope with an illuminated reticle (p. 155). */
  illuminated: boolean;
  /** A home-built suppressor whose build roll failed: the first shot through it rolls the Malfunction Table (p. 159). */
  buildFailed: boolean;
}

/** What this module keeps on a gun for its magazine and its report, beside the other rules' fields. */
export function accessoryGunFields(f: any): Record<string, unknown> {
  const whole = (max: number) => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max });
  return {
    magazine: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...MAGAZINE_KINDS] }),
    magazineMaterial: new f.StringField({ required: true, nullable: false, blank: false, initial: "alloy", choices: [...MAGAZINE_MATERIALS] }),
    magazineRounds: whole(1000),
    magazineUnreliable: new f.BooleanField({ initial: false }),
    magazineInGrip: new f.BooleanField({ initial: false }),
    magazinesJoined: new f.BooleanField({ initial: false }),
    magazineRestricted: new f.BooleanField({ initial: false }),
    report: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...REPORTS] }),
    sealedBreech: new f.BooleanField({ initial: false }),
  };
}

export function initAccessories(): void {
  const f = foundry.data.fields as any;
  const whole = (max: number) => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      gun: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      level: whole(10),
      colour: new f.StringField({ required: true, nullable: false, blank: false, initial: "red", choices: [...LASER_COLOURS] }),
      grade: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...SUPPRESSOR_GRADES] }),
      lifetime: whole(1000),
      fired: whole(100000),
      nightVision: new f.BooleanField({ initial: false }),
      illuminated: new f.BooleanField({ initial: false }),
      buildFailed: new f.BooleanField({ initial: false }),
    }),
  });
}

export function accessoryData(item: any): AccessoryData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    gun: String(d.gun ?? ""),
    level: count(d.level),
    colour: LASER_COLOURS.includes(d.colour) ? d.colour : "red",
    grade: SUPPRESSOR_GRADES.includes(d.grade) ? d.grade : "",
    lifetime: count(d.lifetime),
    fired: count(d.fired),
    nightVision: d.nightVision === true,
    illuminated: d.illuminated === true,
    buildFailed: d.buildFailed === true,
  };
}

interface GunData {
  magazine: MagazineKind | "";
  magazineMaterial: MagazineMaterial;
  magazineRounds: number;
  magazineUnreliable: boolean;
  /** A high-density magazine in the grip, where the gun's own design has one (p. 155). */
  magazineInGrip: boolean;
  /** Its magazines clamped or taped together, in conditions the GM finds harsh enough for -1 Malf. (p. 155). */
  magazinesJoined: boolean;
  /** A high-capacity magazine where the law restricts one: an LC3-4 gun counts as LC1-2 (p. 155). */
  magazineRestricted: boolean;
  report: Report | "";
  sealedBreech: boolean;
}

function gunData(item: any): GunData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[GUN_FIELD] ?? {};
  return {
    magazine: MAGAZINE_KINDS.includes(d.magazine) ? d.magazine : "",
    magazineMaterial: MAGAZINE_MATERIALS.includes(d.magazineMaterial) ? d.magazineMaterial : "alloy",
    magazineRounds: Math.max(0, Math.floor(Number(d.magazineRounds) || 0)),
    magazineUnreliable: d.magazineUnreliable === true,
    magazineInGrip: d.magazineInGrip === true,
    magazinesJoined: d.magazinesJoined === true,
    magazineRestricted: d.magazineRestricted === true,
    report: REPORTS.includes(d.report) ? d.report : "",
    sealedBreech: d.sealedBreech === true,
  };
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
/** The weapon skill a gun's first mode is fired with. */
const gunSkill = (gun: any): string => String(rangedModes(gun)[0]?.skill ?? "");
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const isPistolSkill = (skill: string) => /^guns(?: sport)? \(pistol\)/i.test(String(skill ?? "").trim());

/** The calibre a gun's name gives after its last comma: "IMI Galil ARM, .223 Remington", in the gun's own table. */
function calibreOf(item: any) {
  const name = String(item?.name ?? "");
  if (name.lastIndexOf(",") < 0) return null;
  const skill = String(rangedModes(item).find((m) => m?.skill)?.skill ?? "");
  return calibreRowOf(name, skill);
}

/** Whether an accessory's rule is on. */
function kindOn(on: AccessorySwitches, figures: AccessoryFigures): boolean {
  return on[SWITCH_OF[figures.kind]]?.() === true;
}

interface Fitted {
  item: any;
  figures: AccessoryFigures;
  data: AccessoryData;
}

/** The accessories fitted to a gun whose rules are on. */
export function fittedTo(gun: any, on: AccessorySwitches, kinds?: readonly AccessoryKind[]): Fitted[] {
  const actor = gun?.actor ?? gun?.parent;
  if (!actor || !gun?.id) return [];
  const out: Fitted[] = [];
  for (const item of actor.items ?? []) {
    const known = accessoryOf(item);
    if (!known || !kindOn(on, known.figures)) continue;
    if (kinds && !kinds.includes(known.figures.kind)) continue;
    const data = accessoryData(item);
    if (data.gun !== gun.id) continue;
    // A suppressor on a gun it doesn't work on does nothing (p. 159), nor a sidearm's or shoulder arm's gear on the other.
    if (known.figures.kind === "suppressor" && !gunTakesSuppressor(gun)) continue;
    if (!accessoryFits(known.figures.fits, gunSkill(gun))) continue;
    // A bow or crossbow takes the sights alone (p. 201).
    const bow = bowSightKinds(gunSkill(gun));
    if (bow && !bow.includes(known.figures.kind)) continue;
    out.push({ item, figures: known.figures, data });
  }
  return out;
}

/** Whether the gun has a scope or collimating sight fitted for an add-on night sight to work in front of (p. 156). */
function addOnHasSight(fitted: readonly Fitted[]): boolean {
  return fitted.some((f) => ADD_ON_HOSTS.includes(f.figures.kind));
}

// ── the gun's state: stock, bipod, sight ──

interface GunState {
  stockFolded: boolean;
  bipodDeployed: boolean;
  sightInUse: boolean;
}

function gunState(api: GWorldApi, item: any): GunState {
  const s = (api.combat.getWeaponState(item, MODULE_ID) ?? {}) as any;
  return { stockFolded: s.stockFolded === true, bipodDeployed: s.bipodDeployed === true, sightInUse: s.sightInUse === true };
}

/** Whether the record keeps its folded-stock or bipod setups as modes of their own. */
function storedSetups(item: any): { foldPairs: boolean; bipodPairs: boolean } {
  const setups = rangedModes(item).map((m) => modeSetup(String(m?.name ?? "")));
  return { foldPairs: setups.some((s) => s.folded), bipodPairs: setups.some((s) => s.bipod !== null) };
}

const hasFoldingStock = (item: any, on: AccessorySwitches) => storedSetups(item).foldPairs || fittedTo(item, on, ["foldingStock"]).length > 0;
const hasBipod = (item: any, on: AccessorySwitches) => storedSetups(item).bipodPairs || fittedTo(item, on, ["bipod"]).length > 0;
const prone = (actor: any) => String(actor?.system?.posture ?? "standing") === "lying";

// ── magazines ──

interface GunMagazine {
  kind: MagazineKind;
  rounds: number;
  normal: number;
  wps: number;
  figures: ReturnType<typeof magazineFigures>;
  refused: string | null;
}

/** The gun's magazine, worked out, or null where it has the standard one. */
export function gunMagazine(item: any): GunMagazine | null {
  const data = gunData(item);
  if (!data.magazine) return null;
  const mode = rangedModes(item)[0] ?? {};
  const normal = magazineCapacity(String(mode.shots ?? ""));
  if (!normal) return null;
  const rounds = data.magazineRounds || normal;
  const wps = calibreOf(item)?.wps ?? 0;
  // Not in a grip, unless the gun was designed for one there (p. 155).
  const refused = data.magazine === "highDensity" && !highDensityFits(String(mode.skill ?? "")) && !data.magazineInGrip ? L("HighDensityGrip") : null;
  return { kind: data.magazine, rounds, normal, wps, figures: magazineFigures({ kind: data.magazine, material: data.magazineMaterial, rounds, normal, wps, unreliable: data.magazineUnreliable }), refused };
}

/** Whether a gun feeds from a detachable magazine, the kind that can be clamped or taped to another (p. 155). */
function feedsFromMagazine(api: GWorldApi, item: any): boolean {
  return loadingOf(api, item) === "magazine";
}

/** Whether a gun's mode is fed from its magazine: its Shots are the standard magazine's. */
function fedFromMagazine(item: any, mode: any): boolean {
  const normal = magazineCapacity(String(rangedModes(item)[0]?.shots ?? ""));
  return normal > 0 && magazineCapacity(String(mode?.shots ?? "")) === normal;
}

// ── what the gun's Bulk comes to ──

/**
 * The gun's Bulk with its accessories, for Move and Attack and close combat:
 * the stored mode's, then the magazine, suppressor, sights, a pistol stock and
 * a folding stock folded (pp. 155-160). Pistolero's stance starts from this.
 */
export function accessoryBulk(api: GWorldApi, item: any, mode: any, aimed: boolean, on: AccessorySwitches): number {
  let bulk = Number(mode?.bulk) || 0;
  if (on.magazines()) {
    const magazine = gunMagazine(item);
    if (magazine && !magazine.refused) bulk += magazine.figures.bulk;
  }
  let scope = 0;
  for (const fitted of fittedTo(item, on)) {
    const { figures, data } = fitted;
    if (figures.kind === "suppressor" && data.grade === "poor") bulk += HOME_BUILT.poor.bulk;
    else if (figures.bulk) bulk += figures.bulk;
    if (figures.kind === "scope") scope = Math.max(scope, levelWithin(data.level, figures.levels));
  }
  if (!aimed) bulk += unaimedScopeBulk(scope);
  const setups = storedSetups(item);
  if (on.stocks() && !setups.foldPairs && gunState(api, item).stockFolded && fittedTo(item, on, ["foldingStock"]).length) bulk = foldedBulk(bulk);
  return bulk;
}

// ── sights on the shot ──

/** The best magnifying bonus the gun's fitted sights give: what Precision Aiming counts as its scope. */
export function fittedScopeBonus(item: any, on: AccessorySwitches): number {
  let best = 0;
  for (const { figures, data } of fittedTo(item, on)) {
    if (figures.kind === "scope") best = Math.max(best, levelWithin(data.level, figures.levels));
    else if (figures.accuracy && figures.kind !== "pistolStock") best = Math.max(best, figures.accuracy);
    else if (figures.magnification) best = Math.max(best, figures.magnification);
  }
  return best;
}

interface SightLine {
  label: string;
  value: number;
  /** A reflex sight's, which a shooter using a targeting laser goes without (p. 156). */
  reflex?: boolean;
}

/** A fitted sight's magnifying bonus: a scope's level, a night or thermal sight's +2, a computer sight's magnification. */
function magnifierOf({ figures, data }: Fitted): number {
  if (figures.kind === "scope") return levelWithin(data.level, figures.levels);
  if (figures.kind === "pistolStock") return 0;
  return figures.accuracy ?? figures.magnification ?? 0;
}

/**
 * The best magnifying sight on the gun, as the rows' scope: its bonus, and
 * whether it is fixed-power (a computer sight's magnification is variable).
 */
export function fittedMagnifier(item: any, on: AccessorySwitches): { name: string; bonus: number; fixed: boolean } | null {
  let best: { name: string; bonus: number; fixed: boolean } | null = null;
  for (const fitted of fittedTo(item, on)) {
    const bonus = magnifierOf(fitted);
    if (bonus > (best?.bonus ?? 0)) best = { name: String(fitted.item.name), bonus, fixed: fitted.figures.fixed !== false && fitted.figures.kind !== "computerSight" };
  }
  return best;
}

/**
 * What the sights give a shot besides the scope the rows carry (pp. 155-157):
 * a computer sight's program, and its rangefinder on an aimed shot; a reflex
 * sight's +1 without a magnifying one.
 */
function sightLines(item: any, on: AccessorySwitches, aimed: boolean, yards: number | null): SightLine[] {
  const lines: SightLine[] = [];
  const fitted = fittedTo(item, on);
  const magnifying = fitted.some((f) => magnifierOf(f) > 0);
  for (const { item: sight, figures } of fitted) {
    if (figures.kind !== "computerSight") continue;
    if (figures.program) lines.push({ label: F("Program", { name: sight.name }), value: figures.program });
    if (aimed && figures.rangefinder) {
      const value = rangefinderBonus(yards, figures.yards ?? Infinity, figures.rangefinder);
      if (value) lines.push({ label: F("Rangefinder", { name: sight.name }), value });
    }
  }
  for (const { item: sight, figures } of fitted) {
    if (figures.kind !== "reflexSight") continue;
    const value = reflexBonus(yards, figures.yards ?? 300, magnifying);
    if (value) lines.push({ label: String(sight.name), value, reflex: true });
    break;
  }
  return lines;
}

/**
 * The most the gun's sights take off a darkness penalty (pp. 155-156): a TL7+
 * scope or an illuminated reticle on an aimed shot, improved-visibility sights,
 * or a reflex sight -- not with a magnifying scope, nor while the laser is on.
 */
function sightDarkness(item: any, on: AccessorySwitches, aimed: boolean, laserOn: boolean): number {
  const fitted = fittedTo(item, on);
  const magnifying = fitted.some((f) => magnifierOf(f) > 0);
  let best = 0;
  for (const { item: sight, figures, data } of fitted) {
    if (figures.kind === "scope" && aimed) best = Math.max(best, scopeDarkness(tlOf(sight), data.illuminated));
    else if (figures.kind === "visibilitySights") best = Math.max(best, DARKNESS_OFFSET.visibilitySights);
    else if (figures.kind === "reflexSight" && !magnifying && !laserOn) best = Math.max(best, DARKNESS_OFFSET.reflexSight);
  }
  return best;
}

// ── hearing the shot ──

/** The line of the Hearing Distance Table the gun's report is on: its own, or worked out (p. 158). */
export function reportOfGun(item: any): Report {
  // Silent rounds are heard on the 16-yard line, whatever the gun (p. 165).
  if (loadedHearing(item)?.silent) return "airGun";
  const own = gunData(item).report;
  if (own) return own;
  const mode = rangedModes(item)[0] ?? {};
  const calibre = calibreOf(item);
  const dice = /^(\d*)d([+-]\d+)?/i.exec(String(mode.damageFormula || mode.damage || "").replace(/\s+/g, ""));
  const average = dice ? (dice[1] ? Number(dice[1]) : 1) * 3.5 + (dice[2] ? Number(dice[2]) : 0) : 0;
  return reportOf({
    airGun: familyData(item).airShots > 0,
    calibreClass: calibre?.class ?? null,
    powderAndShot: calibre?.notes.includes("powderAndShot") ?? false,
    skill: String(mode.skill ?? ""),
    average,
  });
}

/** The suppressor on the gun and the Hearing penalty it gives now, or null. */
function suppressorOn(item: any, on: AccessorySwitches): { item: any; penalty: number } | null {
  const fitted = fittedTo(item, on, ["suppressor"])[0];
  if (!fitted) return null;
  const { figures, data } = fitted;
  const penalty = suppressorHearing({ level: data.level, levels: figures.levels ?? { min: 1, max: 4 }, grade: data.grade, fired: data.fired, lifetime: lifetimeOf(figures, data) });
  return penalty ? { item: fitted.item, penalty } : null;
}

/** How many shots a suppressor lasts: a wiper's 40, a poor or average home-built one's rolled lifetime; 0 for indefinitely. */
function lifetimeOf(figures: AccessoryFigures, data: AccessoryData): number {
  if (data.grade === "poor" || data.grade === "average") return data.lifetime;
  return figures.suppressor?.shots ?? 0;
}

function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const from = a?.getActiveTokens?.()?.[0];
  const to = b?.getActiveTokens?.()?.[0];
  if (!from?.center || !to?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/** The listener's Hearing score as the system worked it out. */
function hearingOf(api: GWorldApi, actor: any): number {
  const senses: any[] = api.actors.derived(actor)?.senses ?? [];
  return Number(senses.find((s) => s?.sense === "hearing")?.score) || Number(api.actors.derived(actor)?.per) || 10;
}

const knowsGuns = (actor: any) => [...(actor?.items ?? [])].some((i: any) => i?.type === "skill" && /^guns\b/i.test(String(i.name ?? "")));

/** The lines of a Hearing roll against a shot (p. 158). */
export function hearingLines(options: { report: Report; yards: number; suppressor: number; sealedBreech: boolean; outsideCone: boolean; unfamiliar: boolean; cinematic: number; other: number; ammunition?: number }): Array<{ label: string; value: number }> {
  const lines = [{ label: F("HearDistance", { yards: options.yards, heard: HEARD_AT[options.report] }), value: hearingDistanceModifier(HEARD_AT[options.report], options.yards) }];
  if (options.suppressor) {
    const penalty = options.suppressor + (options.sealedBreech ? SEALED_BREECH : 0);
    lines.push({ label: options.cinematic > 1 ? F("HearCinematic", { times: options.cinematic }) : L("HearSuppressor"), value: cinematicHearing(penalty, options.cinematic) });
  }
  // Subsonic rounds: -1 to hear a pistol's, -2 a PDW's or rifle's (p. 165).
  if (options.ammunition) lines.push({ label: L("HearSubsonic"), value: options.ammunition });
  if (options.outsideCone) lines.push({ label: L("HearOutsideCone"), value: OUTSIDE_CONE });
  if (options.unfamiliar) lines.push({ label: L("HearUnfamiliar"), value: UNFAMILIAR_LISTENER });
  if (options.other) lines.push({ label: L("HearOther"), value: options.other });
  return lines.filter((l) => l.value !== 0);
}

async function hearTheShot(api: GWorldApi, item: any, actor: any, on: AccessorySwitches): Promise<void> {
  const listener = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!listener) {
    ui.notifications?.warn(L("HearNoListener"));
    return;
  }
  const measured = yardsBetween(actor, listener);
  const suppressor = suppressorOn(item, on);
  const report = reportOfGun(item);
  const cinematic = on.cinematic();
  const row = (label: string, input: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(label)}</span>${input}</label>`;
  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("HearTitle", { gun: item.name }) },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <p class="ihint">${esc(F("HearReport", { report: L(`Report.${report}`), yards: HEARD_AT[report] }))}${suppressor ? ` ${esc(F("HearSuppressed", { name: suppressor.item.name, penalty: suppressor.penalty }))}` : ""}</p>
      ${row(L("HearYards"), `<input type="number" name="yards" value="${measured === null ? HEARD_AT[report] : Math.round(measured)}" min="0" step="1" style="width:90px">`)}
      <label><input type="checkbox" name="cone" /> ${esc(L("HearOutsideCone"))}</label>
      <label><input type="checkbox" name="unfamiliar" ${knowsGuns(listener) ? "" : "checked"} /> ${esc(L("HearUnfamiliar"))}</label>
      ${cinematic && suppressor ? row(L("HearCinematicLabel"), `<select name="cinematic"><option value="2">x2</option><option value="3">x3</option></select>`) : ""}
      ${row(L("HearOther"), `<input type="number" name="other" value="0" step="1" style="width:90px">`)}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const get = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return { yards: Number(get("yards")?.value) || 0, cone: Boolean(get("cone")?.checked), unfamiliar: Boolean(get("unfamiliar")?.checked), cinematic: Number(get("cinematic")?.value) || 1, other: Math.trunc(Number(get("other")?.value) || 0) };
      },
    },
    rejectClose: false,
  }) as { yards: number; cone: boolean; unfamiliar: boolean; cinematic: number; other: number } | null;
  if (!asked) return;
  const modifiers = hearingLines({
    report,
    yards: asked.yards,
    suppressor: suppressor?.penalty ?? 0,
    sealedBreech: gunData(item).sealedBreech,
    outsideCone: asked.cone,
    unfamiliar: asked.unfamiliar,
    cinematic: cinematic ? asked.cinematic : 1,
    other: asked.other,
    ammunition: loadedHearing(item)?.penalty ?? 0,
  });
  await api.roll.success({ actor: listener, base: hearingOf(api, listener), skill: "Hearing", tags: ["hearing", "detection"], label: F("HearRoll", { name: listener.name, gun: item.name }), modifiers } as any);
}

// ── chat ──

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

// ── item sheets ──

/**
 * The guns an accessory can be fitted to: the character's firearms, less the
 * revolvers a suppressor won't fit; and for a sight, bows and crossbows that
 * take it (p. 201).
 */
function gunsFor(api: GWorldApi, accessory: any, figures: AccessoryFigures): any[] {
  const actor = accessory?.actor ?? accessory?.parent;
  return [...(actor?.items ?? [])].filter((i: any) => {
    if (i.id === accessory.id || i?.type !== "equipment") return false;
    if (!isFirearm(api, i)) return bowSightKinds(gunSkill(i))?.includes(figures.kind) === true;
    return (figures.kind !== "suppressor" || gunTakesSuppressor(i)) && accessoryFits(figures.fits, gunSkill(i));
  });
}

/** A bow or crossbow that takes firearm sights (p. 201). */
const sightedBow = (item: any): boolean => item?.type === "equipment" && (bowSightKinds(gunSkill(item))?.length ?? 0) > 0;

function accessoryContext(api: GWorldApi, item: any, figures: AccessoryFigures, on: AccessorySwitches): Record<string, unknown> {
  const data = accessoryData(item);
  const guns = gunsFor(api, item, figures);
  const lines: string[] = [];
  const level = levelWithin(data.level, figures.levels);
  switch (figures.kind) {
    case "scope": {
      lines.push(F(figures.fixed ? "ScopeFixed" : "ScopeVariable", { bonus: level }));
      if (level >= 3) lines.push(L("ScopeBulk"));
      const dark = scopeDarkness(tlOf(item), data.illuminated);
      if (dark) lines.push(F("ScopeDarkness", { offset: dark }));
      break;
    }
    case "tacticalLight":
      lines.push(F("TacticalLightLine", { yards: figures.yards ?? 0, floor: -3 }));
      break;
    case "visibilitySights":
      lines.push(L("VisibilityLine"));
      break;
    case "reflexSight":
      lines.push(F("ReflexLine", { yards: figures.yards ?? 300 }));
      break;
    case "nightSight":
    case "thermalSight":
    case "computerSight": {
      const vision = figures.kind === "computerSight" && data.nightVision ? F("NightVision", { level: 7 }) : figures.infravision ? L("Infravision") : F("NightVision", { level: figures.nightVision ?? 0 });
      lines.push(F(figures.addOn ? "AddOnLine" : "SightLine", { vision }));
      const host = figures.addOn && data.gun ? (item.actor?.items?.get?.(data.gun) ?? null) : null;
      if (host && !addOnHasSight(fittedTo(host, on))) lines.push(L("AddOnNeedsSight"));
      if (figures.accuracy) lines.push(F("SightAccuracy", { bonus: figures.accuracy }));
      if (figures.kind === "computerSight") lines.push(F("ComputerLine", { program: figures.program ?? 0, rangefinder: figures.rangefinder ?? 0, yards: (figures.yards ?? 0).toLocaleString(), magnification: figures.magnification ?? 0 }));
      break;
    }
    case "targetingLaser": {
      const colour = LASER_COLOUR[data.colour];
      lines.push(F("LaserLine", { yards: figures.yards ?? 0, daylight: Math.round((figures.yards ?? 0) * colour.daylight), low: Math.round((figures.yards ?? 0) * colour.lowLight) }));
      if (data.colour === "infrared") lines.push(L("LaserInfrared"));
      if (tlOf(item) < colour.tl) lines.push(L("LaserColourTl"));
      break;
    }
    case "suppressor": {
      const fitted = data.gun ? (item.actor?.items?.get?.(data.gun) ?? null) : null;
      const lifetime = lifetimeOf(figures, data);
      const penalty = suppressorHearing({ level: data.level, levels: figures.levels ?? { min: 1, max: 4 }, grade: data.grade, fired: data.fired, lifetime });
      lines.push(F("SuppressorLine", { penalty, seconds: suppressorSeconds(tlOf(item)) }));
      if (figures.suppressor?.design === "wiper") lines.push(F("WiperLine", { damage: figures.suppressor.damage, shots: figures.suppressor.shots }));
      if (data.grade) {
        const grade = HOME_BUILT[data.grade];
        lines.push(F("GradeLine", { hours: grade.hours, roll: grade.roll === null ? L("GradeNoRoll") : F("GradeRoll", { modifier: grade.roll >= 0 ? `+${grade.roll}` : String(grade.roll) }) }));
      }
      if (lifetime) lines.push(F("LifetimeLine", { fired: data.fired, lifetime }));
      if (data.buildFailed) lines.push(L("BuildFailedLine"));
      if (fitted && !gunTakesSuppressor(fitted)) lines.push(L("SuppressorRevolver"));
      break;
    }
    case "pistolStock":
      lines.push(F("PistolStockLine", { seconds: PISTOL_STOCK.seconds }));
      break;
    case "foldingStock":
      lines.push(L("FoldingStockLine"));
      break;
    case "bipod":
      lines.push(L("BipodLine"));
      break;
    case "shootingSticks":
      lines.push(L("SticksLine"));
      break;
  }
  return {
    accessory: true,
    editable: item.isOwner,
    data,
    guns: [{ value: "", label: L("NotFitted"), selected: !data.gun }, ...guns.map((g) => ({ value: g.id, label: g.name, selected: g.id === data.gun }))],
    levels: figures.levels ? { value: level, min: figures.levels.min, max: figures.levels.max, label: L(figures.kind === "suppressor" ? "LevelHearing" : "LevelAcc") } : null,
    colours: figures.kind === "targetingLaser" ? LASER_COLOURS.map((c) => ({ value: c, label: L(`Colour.${c}`), selected: c === data.colour })) : null,
    grades: figures.kind === "suppressor" ? ["", ...SUPPRESSOR_GRADES].map((g) => ({ value: g, label: L(`Grade.${g || "commercial"}`), selected: g === data.grade })) : null,
    nightVisionChoice: figures.kind === "computerSight",
    illuminatedChoice: figures.kind === "scope",
    buildable: figures.kind === "suppressor" && Boolean(data.grade) && Boolean(item.actor ?? item.parent),
    lines,
    switchOn: kindOn(on, figures),
  };
}

function gunContext(api: GWorldApi, item: any, on: AccessorySwitches): Record<string, unknown> {
  const data = gunData(item);
  const lines: string[] = [];
  const context: Record<string, unknown> = { gun: true, editable: item.isOwner };
  if (on.magazines()) {
    const mode = rangedModes(item)[0] ?? {};
    const normal = magazineCapacity(String(mode.shots ?? ""));
    const magazine = gunMagazine(item);
    context.magazine = {
      kinds: ["", ...MAGAZINE_KINDS].map((k) => ({ value: k, label: L(`Magazine.${k || "standard"}`), selected: k === data.magazine })),
      materials: MAGAZINE_MATERIALS.map((m) => ({ value: m, label: L(`Material.${m}`), selected: m === data.magazineMaterial })),
      rounds: data.magazineRounds || normal,
      unreliable: data.magazineUnreliable,
      chosen: Boolean(data.magazine),
      grip: data.magazine === "highDensity" && !highDensityFits(String(mode.skill ?? "")),
      inGrip: data.magazineInGrip,
      joinable: feedsFromMagazine(api, item),
      joined: data.magazinesJoined,
      restricted: data.magazineRestricted,
    };
    if (data.magazinesJoined && feedsFromMagazine(api, item)) lines.push(F("JoinedLine", { malf: JOINED_MAGAZINES_MALFUNCTION }));
    if (magazine) {
      if (magazine.refused) lines.push(magazine.refused);
      else if (!magazine.wps) lines.push(L("MagazineNoCalibre"));
      else lines.push(F("MagazineLine", { rounds: magazine.rounds, normal: magazine.normal, weight: magazine.figures.weight, cost: magazine.figures.cost, bulk: magazine.figures.bulk, malf: magazine.figures.malfunction }));
    }
  }
  if (on.suppressors()) {
    const report = reportOfGun(item);
    context.report = {
      options: ["", ...REPORTS].map((r) => ({ value: r, label: r ? L(`Report.${r}`) : F("ReportAuto", { report: L(`Report.${reportOfGun({ ...item, system: { ...item.system, extensions: {} } })}`) }), selected: r === data.report })),
      sealedBreech: data.sealedBreech,
    };
    const suppressor = suppressorOn(item, on);
    lines.push(F("HeardAtLine", { yards: HEARD_AT[report] }) + (suppressor ? ` ${F("HearSuppressed", { name: suppressor.item.name, penalty: suppressor.penalty })}` : ""));
    if (!gunTakesSuppressor(item)) lines.push(L("SuppressorRevolver"));
  }
  for (const { item: fitted } of fittedTo(item, on)) lines.push(F("FittedLine", { name: fitted.name }));
  const state = gunState(api, item);
  if (on.stocks() && hasFoldingStock(item, on)) lines.push(L(state.stockFolded ? "StockFolded" : "StockUnfolded"));
  if (on.stocks() && hasBipod(item, on)) lines.push(L(state.bipodDeployed ? "BipodDeployed" : "BipodFolded"));
  if (on.sights() && state.sightInUse && fittedTo(item, on).some((f) => f.figures.imposesTunnelVision)) lines.push(L("SightInUseLine"));
  context.lines = lines;
  return context;
}

/** The best of these skills the character knows, as `{ name, level }`, or null. */
function bestSkill(api: GWorldApi, actor: any, names: readonly string[], fallback?: { name: string; modifier: number }): { name: string; level: number } | null {
  const known = names.map((name) => ({ name, level: api.actors.skillLevel(actor, name) })).filter((s): s is { name: string; level: number } => typeof s.level === "number");
  if (fallback) {
    const level = api.actors.skillLevel(actor, fallback.name);
    if (typeof level === "number") known.push({ name: `${fallback.name} ${fallback.modifier}`, level: level + fallback.modifier });
  }
  return known.sort((a, b) => b.level - a.level)[0] ?? null;
}

/**
 * Makes a home-built suppressor (p. 159): the design roll, then the build
 * roll at the grade's modifier and the GM's (blueprints, tools, extra time).
 * A failed build marks the suppressor, so its first shot rolls the
 * Malfunction Table; a critical failure damages the gun, as the GM says.
 * Returns what came of it, or null where nothing was rolled.
 */
export async function buildSuppressor(api: GWorldApi, item: any, actor: any, modifier = 0): Promise<"built" | "designFailed" | "failed" | "damaged" | null> {
  const grade = accessoryData(item).grade;
  if (!grade || !actor) return null;
  const title = F("BuildTitle", { name: String(item.name ?? "") });
  const rolls = suppressorBuildRolls(grade, tlOf(item));
  const path = `system.extensions.${MODULE_ID}.${FIELD}.buildFailed`;
  // A poor one: no roll for anyone who knows guns, an IQ roll for anyone else.
  if (rolls.buildModifier === null) {
    const handy = [...(actor.items ?? [])].some((i: any) => i?.type === "skill" && /^(guns|armou?ry)\b/i.test(String(i.name ?? "")));
    if (!handy) {
      const iq = Number(api.actors.attribute(actor, "IQ" as never)) || 10;
      const outcome: any = await api.roll.success({ actor, base: iq, kind: "attribute", label: title, modifiers: modifier ? [{ label: L("BuildModifier"), value: modifier }] : [], tags: ["suppressorBuild"] } as any);
      if (!outcome) return null;
      await item.update({ [path]: !outcome.success });
      await say(actor, title, [L(outcome.success ? "Built" : outcome.criticalFailure ? "BuildDamaged" : "BuildFailed")]);
      return outcome.success ? "built" : outcome.criticalFailure ? "damaged" : "failed";
    }
    await item.update({ [path]: false });
    await say(actor, title, [L("BuiltPoor")]);
    return "built";
  }
  const designer = bestSkill(api, actor, rolls.designSkills);
  if (!designer) {
    ui.notifications?.warn(F("BuildNoSkill", { skills: rolls.designSkills.join(", ") }));
    return null;
  }
  const design: any = await api.roll.success({ actor, base: designer.level, skill: designer.name, label: F("DesignRoll", { name: String(item.name ?? "") }), tags: ["suppressorBuild"] } as any);
  if (!design) return null;
  if (!design.success) {
    await say(actor, title, [L("DesignFailed")]);
    return "designFailed";
  }
  const builder = bestSkill(api, actor, [SUPPRESSOR_BUILD.skill], { name: SUPPRESSOR_BUILD.fallback, modifier: SUPPRESSOR_BUILD.fallbackModifier });
  if (!builder) {
    ui.notifications?.warn(F("BuildNoSkill", { skills: `${SUPPRESSOR_BUILD.skill}, ${SUPPRESSOR_BUILD.fallback}` }));
    return null;
  }
  const lines = [
    ...(rolls.buildModifier ? [{ label: L(`Grade.${grade}`), value: rolls.buildModifier }] : []),
    ...(modifier ? [{ label: L("BuildModifier"), value: modifier }] : []),
  ];
  const build: any = await api.roll.success({ actor, base: builder.level, skill: builder.name.startsWith(SUPPRESSOR_BUILD.skill) ? builder.name : "", label: F("BuildRoll", { name: String(item.name ?? ""), skill: builder.name }), modifiers: lines, tags: ["suppressorBuild"] } as any);
  if (!build) return null;
  await item.update({ [path]: !build.success });
  const result = build.success ? "built" : build.criticalFailure ? "damaged" : "failed";
  await say(actor, title, [L(result === "built" ? "Built" : result === "damaged" ? "BuildDamaged" : "BuildFailed")]);
  return result;
}

/**
 * The first shot through a botched suppressor: the Firearm Malfunction Table
 * (Campaigns p. 407), read as the system reads it -- an explosion is a
 * mechanical problem where the gun's TL can't explode -- and, with gun care
 * on, misfires and stoppages swapped at TL6-8 as this book's malfunction
 * listener swaps them (p. 81). The mode fired is put out of action.
 */
export async function botchedFirstShot(api: GWorldApi, gun: any, actor: any, suppressor: any, modeIndex = 0, gunCare: () => boolean = () => false): Promise<string> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const tl = tlOf(gun);
  let kind = String(api.rules.malfunctionFor(Number(roll.total) || 10));
  if (kind === "explosion" && !api.rules.mayExplode(tl)) kind = "mechanical";
  // A suppressor is never on an ordinary revolver (p. 159), so the swap applies as for any other gun.
  if (gunCare()) kind = modernMalfunction(kind, tl, false);
  if (gun?.isOwner) await api.items.setMalfunction(gun, { kind, modeIndex } as any);
  await say(actor, String(suppressor.name ?? ""), [F("BotchedShot", { roll: roll.total, kind: game.i18n.localize(`GWORLD.Malfunction.${kind}`), gun: String(gun?.name ?? "") })]);
  return kind;
}

function listeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelector("[data-gcc-ht-build]")?.addEventListener("click", async () => {
    const actor = item.actor ?? item.parent;
    const modifier = await foundry.applications.api.DialogV2.prompt({
      window: { title: F("BuildTitle", { name: String(item.name ?? "") }) },
      content: `<div class="gworld"><p class="ihint">${esc(L("BuildHint"))}</p><label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(L("BuildModifier"))}</span><input type="number" name="modifier" value="0" step="1" style="width:80px"></label></div>`,
      ok: { label: L("Build"), callback: (_e: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="modifier"]')?.value ?? 0) },
      rejectClose: false,
    });
    if (modifier === null || modifier === undefined) return;
    await buildSuppressor(api, item, actor, Math.trunc(Number(modifier) || 0));
  });
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-accessory]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtAccessory);
      let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (key === "level") value = Math.max(0, Math.floor(Number(value) || 0));
      const update: Record<string, unknown> = { [`system.extensions.${MODULE_ID}.${FIELD}.${key}`]: value };
      if (key === "gun" && value) {
        const gun = item.actor?.items?.get?.(value);
        const figures = accessoryOf(item)?.figures;
        // A suppressor never goes on an ordinary revolver (p. 159).
        if (figures?.kind === "suppressor" && gun && !gunTakesSuppressor(gun)) {
          ui.notifications?.warn(L("SuppressorRevolver"));
          (input as HTMLSelectElement).value = "";
          return;
        }
        if (figures && gun && !accessoryFits(figures.fits, gunSkill(gun))) {
          ui.notifications?.warn(L(`Fits.${figures.fits}`));
          (input as HTMLSelectElement).value = "";
          return;
        }
        if (figures?.kind === "suppressor") void say(item.actor, String(item.name), [F("SuppressorFitted", { gun: gun?.name ?? "", seconds: suppressorSeconds(tlOf(item)) })]);
        if (figures?.kind === "pistolStock") void say(item.actor, String(item.name), [F("PistolStockFitted", { gun: gun?.name ?? "", seconds: PISTOL_STOCK.seconds })]);
      }
      // A home-built suppressor that wears out: its lifetime is rolled when it is made (p. 159).
      if (key === "grade") {
        const lifetime = value === "poor" || value === "average" ? HOME_BUILT[value as "poor" | "average"].lifetime : "";
        update[`system.extensions.${MODULE_ID}.${FIELD}.fired`] = 0;
        update[`system.extensions.${MODULE_ID}.${FIELD}.lifetime`] = 0;
        if (lifetime) {
          const roll = new Roll(lifetime);
          await roll.evaluate();
          update[`system.extensions.${MODULE_ID}.${FIELD}.lifetime`] = Math.max(1, Number(roll.total) || 1);
        }
      }
      await item.update(update);
    });
  });
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-gun]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtGun);
      let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (key === "magazineRounds") value = Math.max(0, Math.floor(Number(value) || 0));
      await item.update({ [`system.extensions.${MODULE_ID}.${GUN_FIELD}.${key}`]: value });
    });
  });
}

// ── registration ──

/** How the ammunition a gun is loaded with is heard, where the ammunition upgrades say (pp. 158, 165). */
export interface AmmunitionHearing {
  hearing: (item: any) => { silent: boolean; penalty: number } | null;
}

let loadedHearing: AmmunitionHearing["hearing"] = () => null;

export function readyAccessories(api: GWorldApi, on: AccessorySwitches, ammunition?: AmmunitionHearing): void {
  loadedHearing = ammunition?.hearing ?? (() => null);
  ACCESSORY_TABLES.register({
    book: "high-tech",
    tls: { min: 0, max: 8 },
    on: () => on.sights() || on.suppressors() || on.stocks(),
    figures: catalogueFigures,
  });

  const firearm = (item: any) => isFirearm(api, item);
  /** A gun, or a bow or crossbow with firearm sights (p. 201): what the sights work on. */
  const sighted = (item: any) => firearm(item) || (on.sights() && sightedBow(item));

  // An accessory's own price: by the level, by the laser's colour, by a computer sight's vision, by a home-built grade (pp. 155-159).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-accessory",
    types: ["equipment"],
    apply: (item, price) => {
      const known = accessoryOf(item);
      if (!known || !kindOn(on, known.figures)) return null;
      const { figures } = known;
      const data = accessoryData(item);
      let cost = price.cost;
      let weight = price.weight;
      if (figures.levels) cost *= levelWithin(data.level, figures.levels);
      if (figures.kind === "targetingLaser") cost *= LASER_COLOUR[data.colour].cost;
      if (figures.kind === "computerSight" && data.nightVision && figures.nightVisionCost) cost = figures.nightVisionCost;
      if (figures.kind === "suppressor" && data.grade) {
        const grade = HOME_BUILT[data.grade];
        cost *= grade.price;
        if (grade.weight) weight = grade.weight;
      }
      if (cost === price.cost && weight === price.weight) return null;
      return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 1000) / 1000, label: L("Title") };
    },
  });

  // A gun's magazine reprices it (p. 155).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-magazine",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.magazines() || !firearm(item)) return null;
      const magazine = gunMagazine(item);
      if (!magazine || magazine.refused || !magazine.wps) return null;
      const change = magazinePriceChange(magazine.figures, magazine.normal, magazine.wps);
      return { cost: Math.round((price.cost + change.cost) * 100) / 100, weight: Math.round((price.weight + change.weight) * 1000) / 1000, label: L(`Magazine.${magazine.kind}`) };
    },
  });

  // A high-capacity magazine where the law restricts one: an LC3-4 gun counts as LC1-2 (p. 155).
  Hooks.on(api.data.hooks.legalityClass, (context: any) => {
    const item = context?.item;
    if (!on.magazines() || !firearm(item) || !gunData(item).magazineRestricted) return;
    const magazine = gunMagazine(item);
    if (!magazine || magazine.refused) return;
    const lc = restrictedMagazineClass(typeof context.lc === "number" ? context.lc : null);
    if (lc !== null) context.lc = lc;
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-accessories-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-accessories-item.hbs`,
    visible: (item) => {
      const known = accessoryOf(item);
      if (known) return kindOn(on, known.figures);
      return (on.magazines() || on.suppressors() || on.sights() || on.stocks()) && firearm(item);
    },
    context: (item) => {
      const known = accessoryOf(item);
      return known ? accessoryContext(api, item, known.figures, on) : gunContext(api, item, on);
    },
    listeners: (element, item) => listeners(api, element, item),
  });

  // The magazine's capacity, for the modes fed from the standard one (p. 155).
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    const entry = context?.entry;
    if (!on.magazines() || !entry || typeof entry.capacity !== "number") return;
    const magazine = gunMagazine(context.item);
    if (!magazine || magazine.refused) return;
    if (magazineCapacity(String(context.mode?.shots ?? "")) === magazine.normal) entry.capacity = magazine.rounds;
  });

  // The rows: magazine Malf., suppressors, stocks and bipods (pp. 155-160).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!sighted(item)) return;
    const actor = context.actor;
    const st = Number(api.actors.attribute(actor, "ST")) || 10;
    const minimumSt = api.registry.isRuleOn("minimumSt");
    const magazine = on.magazines() ? gunMagazine(item) : null;
    const joined = on.magazines() && gunData(item).magazinesJoined && feedsFromMagazine(api, item);
    const suppressor = on.suppressors() ? fittedTo(item, on, ["suppressor"])[0] ?? null : null;
    const suppressing = suppressor && suppressorOn(item, on) ? suppressor : null;
    const state = gunState(api, item);
    const setups = storedSetups(item);
    const pistolStock = on.stocks() ? fittedTo(item, on, ["pistolStock"])[0] ?? null : null;
    const foldingStock = on.stocks() && !setups.foldPairs && state.stockFolded && fittedTo(item, on, ["foldingStock"]).length > 0;
    const bipod = on.stocks() && !setups.bipodPairs && state.bipodDeployed && prone(actor) && fittedTo(item, on, ["bipod"]).length > 0;

    const magnifier = on.sights() ? fittedMagnifier(item, on) : null;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      const mode = entry.mode ?? {};
      // The Bulk the accessories leave, unaimed as a Move and Attack or close combat is (GWorld API 1.86.0).
      const own = Number(mode.bulk) || 0;
      const fittedBulk = accessoryBulk(api, item, mode, false, on);
      if (fittedBulk !== own) row.bulk = (typeof row.bulk === "number" ? row.bulk : own) + (fittedBulk - own);
      // The best magnifying sight is the row's scope, where it beats one built in.
      if (magnifier && magnifier.bonus > (Number(row.scopeBonus) || 0)) {
        row.scopeBonus = magnifier.bonus;
        row.scopeFixed = magnifier.fixed;
      }
      if (magazine && !magazine.refused && magazine.figures.malfunction && typeof row.malfunction === "number") {
        row.malfunction += magazine.figures.malfunction;
        row.notes.push({ label: L(`Magazine.${magazine.kind}`), hint: F("MagazineHint", { rounds: magazine.rounds }) });
      }
      // Clamped or taped magazines in harsh conditions, as the GM says (p. 155).
      if (joined && fedFromMagazine(item, mode) && typeof row.malfunction === "number") {
        row.malfunction += JOINED_MAGAZINES_MALFUNCTION;
        row.notes.push({ label: L("Joined"), hint: L("JoinedHint") });
      }

      if (suppressing) {
        const { figures, data } = suppressing;
        const wiper = figures.suppressor?.design === "wiper" ? figures.suppressor : null;
        if (wiper) {
          row.damage = multiplyDamage(String(row.damage ?? ""), wiper.damage);
          row.halfDamageRange = Math.round((Number(row.halfDamageRange) || 0) * wiper.range);
          row.maxRange = Math.round((Number(row.maxRange) || 0) * wiper.range);
        }
        if (data.grade === "poor") {
          row.accuracy = (Number(row.accuracy) || 0) + HOME_BUILT.poor.accuracy;
          if (typeof row.malfunction === "number") row.malfunction += HOME_BUILT.poor.malfunction;
        }
        row.notes.push({ label: L("SuppressedNote"), hint: F("SuppressedHint", { name: suppressing.item.name }) });
      }

      if (on.stocks()) {
        const setup = modeSetup(String(mode.name ?? ""));
        // A mode kept for a setup the gun isn't in is marked, and its shot refused on the attack.
        if (!modeMatches(setup, setups, { folded: state.stockFolded, bipod: state.bipodDeployed })) row.notes.push({ label: L("OtherSetupNote"), hint: L("OtherSetupHint") });
        // A bipod mode's ST is already the book's: the system's two-thirds for a prone shooter isn't taken again,
        // nor given to a "w/o Bipod" mode, whose bipod is folded.
        if (minimumSt && setups.bipodPairs && setup.bipod !== null && mode.mount === "bipod" && prone(actor)) {
          const had = Number(row.minStPenalty) || 0;
          const now = minStPenaltyAt(st, row.minSt ?? null);
          if (typeof row.skillLevel === "number") row.skillLevel += now - had;
          row.minStPenalty = now;
        }
      }

      // A pistol stock: Guns (Rifle), +1 Acc, ST x0.8 (p. 160).
      if (pistolStock && isPistolSkill(String(mode.skill ?? ""))) {
        const own = typeof row.skillLevel === "number" ? context.skillLevel?.(String(row.skillName || mode.skill)) : null;
        const rifle = context.skillLevel?.(PISTOL_STOCK.skill);
        if (typeof row.skillLevel === "number" && typeof own === "number" && typeof rifle === "number") row.skillLevel += rifle - own;
        row.skillName = PISTOL_STOCK.skill;
        row.accuracy = (Number(row.accuracy) || 0) + PISTOL_STOCK.accuracy;
        if (minimumSt) {
          const had = Number(row.minStPenalty) || 0;
          row.minSt = scaledMinSt(row.minSt ?? null, PISTOL_STOCK.st);
          const now = minStPenaltyAfter(st, row.minSt, had);
          if (typeof row.skillLevel === "number") row.skillLevel += now - had;
          row.minStPenalty = now;
        } else row.minSt = scaledMinSt(row.minSt ?? null, PISTOL_STOCK.st);
        row.notes.push({ label: L("PistolStockNote"), hint: L("PistolStockHint") });
      }

      // A folding stock folded: -1 Acc, +1 Recoil unless it is 1, ST x1.2 (p. 160).
      if (foldingStock) {
        row.accuracy = (Number(row.accuracy) || 0) + FOLDED_STOCK.accuracy;
        row.recoil = foldedRecoil(Number(row.recoil) || 0);
        row.minSt = scaledMinSt(row.minSt ?? null, FOLDED_STOCK.st);
        if (minimumSt) {
          const had = Number(row.minStPenalty) || 0;
          const now = minStPenaltyAt(st, row.minSt);
          if (typeof row.skillLevel === "number") row.skillLevel += now - had;
          row.minStPenalty = now;
        }
        row.notes.push({ label: L("FoldedNote"), hint: L("FoldedHint") });
      }

      // A bipod fitted to a gun that had none, open under a prone shooter: ST two-thirds (p. 160).
      if (bipod && mode.mount !== "bipod" && mode.mount !== "mounted") {
        const had = Number(row.minStPenalty) || 0;
        const minSt = scaledMinSt(row.minSt ?? null, BIPOD.st);
        if (minimumSt) {
          const now = minStPenaltyAfter(st, minSt, had);
          if (typeof row.skillLevel === "number") row.skillLevel += now - had;
          row.minStPenalty = now;
        }
        row.minSt = minSt;
        row.notes.push({ label: L("BipodNote"), hint: L("BipodHint") });
      }
    }
  });

  // The shot: the setup, Bulk, the sights and their cap, bracing (pp. 155-160).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (context?.mode?.ranged !== true || !sighted(item)) return;
    const actor = context.actor;
    const modeIndex = Number(context.mode.index) || 0;
    const mode = rangedModes(item)[modeIndex] ?? {};
    const modifiers = (context.modifiers ?? []) as Array<{ label: string; value: number; key?: string; situation?: string; scope?: number }>;
    const lineOf = (key: string) => modifiers.find((m) => m?.key === key);
    const accuracy = lineOf("accuracy");
    const aimed = Boolean(accuracy);

    if (on.stocks()) {
      const setups = storedSetups(item);
      const setup = modeSetup(String(mode.name ?? ""));
      const state = gunState(api, item);
      if (!context.refusal && !modeMatches(setup, setups, { folded: state.stockFolded, bipod: state.bipodDeployed })) {
        context.refusal = setups.foldPairs && setup.folded !== state.stockFolded ? L(state.stockFolded ? "RefuseUnfolded" : "RefuseFolded") : L(state.bipodDeployed ? "RefuseNoBipod" : "RefuseBipod");
        return;
      }
      // A bipod set on something stable -- a wall, sandbags, a window ledge -- as the GM allows a shooter who isn't prone (p. 160).
      const rested = context.options?.[`${MODULE_ID}.${BIPOD_REST_OPTION}`] === true && state.bipodDeployed;
      if (!context.refusal && setups.bipodPairs && setup.bipod === true && !prone(actor) && !rested) {
        context.refusal = L("RefuseNotProne");
        return;
      }
      // A bipod or shooting sticks brace an aimed shot: open under a prone shooter, or under a sitting one (p. 160).
      const braced = lineOf("braced");
      if (aimed && !braced) {
        const bipod = (!setups.bipodPairs && state.bipodDeployed && (prone(actor) || rested) && fittedTo(item, on, ["bipod"]).length > 0 && mode.mount !== "bipod")
          // A "w/ Bipod" mode rested on a wall: the system braces a bipod only under a prone shooter.
          || (setups.bipodPairs && setup.bipod === true && rested && !prone(actor));
        const sticks = String(actor?.system?.posture ?? "") === "sitting" && fittedTo(item, on, ["shootingSticks"]).length > 0;
        if (bipod || sticks) modifiers.push({ label: L(bipod ? "BipodBraced" : "SticksBraced"), value: api.rules.BRACED_BONUS ?? 1, key: "braced" });
      }
    }

    // The Bulk the accessories leave is on the row already, which the system's line reads.

    if (!on.sights()) return;
    const yards = typeof context.rangeYards === "number" ? context.rangeYards : null;
    const laserOn = context.laser?.on === true;
    // A reflex sight or a targeting laser, not both at once (p. 156).
    const lines = sightLines(item, on, aimed, yards).filter((l) => !(laserOn && l.reflex)).map(({ label, value }) => ({ label, value }));
    for (const line of lines) modifiers.push(line);

    // Darkness: a tactical light switched on for the shot, within its beam, then the sights (pp. 155-156).
    const dark = lineOf("darkness");
    if (dark) {
      const light = context.options?.[`${MODULE_ID}.${LIGHT_OPTION}`] === true
        && fittedTo(item, on, ["tacticalLight"]).some((f) => yards === null || yards <= (f.figures.yards ?? 0));
      const value = darknessAfter(Number(dark.value) || 0, { light, sightOffset: sightDarkness(item, on, aimed, laserOn) });
      if (value !== dark.value) {
        dark.value = value;
        dark.label = F("DarknessLine", { label: dark.label });
      }
    }

    // A targeting laser's reach by its colour, in daylight or low light; an infrared dot only for eyes that see it (p. 157).
    const laser = laserOn ? fittedTo(item, on, ["targetingLaser"])[0] : undefined;
    if (laser && context.laser) {
      const reach = laserReach(laser.figures.yards ?? 0, laser.data.colour, !dark);
      const within = yards === null || yards <= reach;
      const sees = seesLaserDot(laser.data.colour, (api.actors.derived(actor) as any)?.traitEffects ?? {});
      const line = lineOf("laser");
      if (within && sees) {
        if (line) line.label = F("LaserHit", { name: laser.item.name, yards: reach });
        else modifiers.push({ label: F("LaserHit", { name: laser.item.name, yards: reach }), value: (api.rules as any).LASER_SIGHT_TO_HIT ?? 1, key: "laser" });
      } else if (line) {
        modifiers.splice(modifiers.indexOf(line), 1);
      }
      context.laser.dodgeBonus = within && context.laser.targetSees ? Math.max(1, Number(context.laser.dodgeBonus) || 0) : 0;
    }
    // The whole of the sights held to the gun's base Acc (p. 155).
    const builtIn = Number(accuracy?.scope) || 0;
    const base = accuracy ? accuracy.value - builtIn : Number(rangedRowOf(actor, item, modeIndex)?.accuracy ?? mode.accuracy) || 0;
    const over = overSightCap(base, builtIn + lines.reduce((sum, l) => sum + l.value, 0));
    if (over > 0) modifiers.push({ label: F("SightCap", { accuracy: base }), value: -over });
  });

  // An open bipod set on something stable for a shooter who isn't prone, as the GM allows (p. 160).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: BIPOD_REST_OPTION,
    label: L("BipodRest"),
    attack: "ranged",
    available: (context: any) => on.stocks() && firearm(context?.item) && hasBipod(context.item, on) && gunState(api, context.item).bipodDeployed && !prone(context.actor),
    apply: () => ({ notes: [L("BipodRestNote")] }),
  } as any);

  // A fitted tactical light switched on for the shot (p. 156): a free declaration here, its Ready to switch on the GM's.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: LIGHT_OPTION,
    label: L("TacticalLight"),
    attack: "ranged",
    available: (context: any) => on.sights() && sighted(context?.item) && fittedTo(context.item, on, ["tacticalLight"]).length > 0,
    apply: (context: any) => {
      const light = fittedTo(context?.item, on, ["tacticalLight"])[0];
      return light ? { notes: [F("TacticalLightNote", { name: light.item.name, yards: light.figures.yards ?? 0 })] } : null;
    },
  } as any);
  // Its dazzle: whoever looks into it rolls HT-4 or is blinded (p. 52), from the gun's row.
  const dazzlingLight = (gun: any) => fittedTo(gun, on, ["tacticalLight"]).find((l) => !shinesInfrared(l.item));
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tactical-light-eyes",
    itemTypes: ["equipment"],
    label: L("TacticalLightEyes"),
    icon: "fa-solid fa-eye-slash",
    // An infrared light blinds nobody (p. 52): no dazzle from it.
    visible: (item) => on.sights() && sighted(item) && dazzlingLight(item) !== undefined,
    run: (item, actor) => {
      const light = dazzlingLight(item);
      if (light) void shineTacticalLight(api, String(light.item.name ?? ""), light.figures.yards ?? 0, actor);
    },
  });

  // Looking through a night, thermal or computer sight: its vision, and colorblind with tunnel vision (pp. 156-157).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on.sights()) return;
    const actor = context?.actor;
    for (const gun of actor?.items ?? []) {
      if (gun?.type !== "equipment" || !gunState(api, gun).sightInUse) continue;
      const fitted = fittedTo(gun, on);
      for (const { item: sight, figures, data } of fitted) {
        if (!figures.imposesTunnelVision) continue;
        // An add-on night sight works in front of a scope or collimating sight, and only there (p. 156).
        if (figures.addOn && !addOnHasSight(fitted)) continue;
        const label = String(sight.name);
        const nightVision = figures.kind === "computerSight" && data.nightVision ? 7 : figures.nightVision ?? 0;
        if (nightVision && !(figures.kind === "computerSight" && !data.nightVision)) {
          if ((Number(context.effects.nightVision) || 0) < nightVision) context.effects.nightVision = nightVision;
          context.sources.push({ effect: "nightVision", label, value: nightVision });
        } else if (figures.infravision) {
          context.effects.infravision = true;
          context.sources.push({ effect: "infravision", label });
        }
        if (context.effects.restrictedVision !== "tunnel") context.effects.restrictedVision = "tunnel";
        context.sources.push({ effect: "restrictedVision.tunnel", label });
        context.effects.colorblindness = true;
        context.sources.push({ effect: "colorblindness", label });
      }
    }
  });

  // Shots through a suppressor that wears out (p. 159).
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!on.suppressors() || !item) return;
    const fitted = fittedTo(item, on, ["suppressor"])[0];
    if (!fitted?.item?.isOwner) return;
    // A botched home build: the first shot through it rolls the Firearm Malfunction Table (p. 159).
    if (fitted.data.buildFailed) {
      void fitted.item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.buildFailed`]: false });
      void botchedFirstShot(api, item, context.actor, fitted.item, Math.max(0, Math.floor(Number(context.modeIndex) || 0)), on.gunCare);
    }
    const lifetime = lifetimeOf(fitted.figures, fitted.data);
    if (!lifetime || fitted.data.fired >= lifetime) return;
    const fired = Math.min(lifetime, fitted.data.fired + Math.max(0, Math.floor(Number(context.fired ?? context.shots) || 0)));
    void fitted.item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.fired`]: fired });
    if (fired >= lifetime) void say(context.actor, String(fitted.item.name), [L("SuppressorWornOut")]);
  });

  // ── row actions ──
  const toggle = (key: keyof GunState, item: any, actor: any, on: string, off: string) => {
    const now = !gunState(api, item)[key];
    void api.combat.setWeaponState(item, MODULE_ID, { [key]: now }).then(() => {
      item.actor?.render?.(false);
      return say(actor, String(item.name ?? ""), [L(now ? on : off)]);
    });
  };
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ht-fold-stock", itemTypes: ["equipment"], label: L("FoldStock"), icon: "fa-solid fa-arrows-left-right-to-line", visible: (item) => on.stocks() && firearm(item) && hasFoldingStock(item, on), run: (item, actor) => toggle("stockFolded", item, actor, "StockFoldedSaid", "StockUnfoldedSaid") });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ht-bipod", itemTypes: ["equipment"], label: L("Bipod"), icon: "fa-solid fa-person-rifle", visible: (item) => on.stocks() && firearm(item) && hasBipod(item, on), run: (item, actor) => toggle("bipodDeployed", item, actor, "BipodDeployedSaid", "BipodFoldedSaid") });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ht-sight", itemTypes: ["equipment"], label: L("UseSight"), icon: "fa-solid fa-binoculars", visible: (item) => on.sights() && sighted(item) && fittedTo(item, on).some((f) => f.figures.imposesTunnelVision), run: (item, actor) => toggle("sightInUse", item, actor, "SightOnSaid", "SightOffSaid") });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ht-hear-shot", itemTypes: ["equipment"], label: L("HearTitleShort"), icon: "fa-solid fa-ear-listen", visible: (item) => on.suppressors() && firearm(item), run: (item, actor) => hearTheShot(api, item, actor, on) });
}

/** The character's attack row for a gun's mode, as the system worked it out. */
function rangedRowOf(actor: any, item: any, modeIndex: number): any {
  const rows: any[] = actor?.system?.derived?.ranged ?? [];
  return rows.find((r) => r?.itemId === item?.id && r?.modeIndex === modeIndex) ?? null;
}
