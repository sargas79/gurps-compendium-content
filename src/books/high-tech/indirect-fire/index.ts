/**
 * Using artillery (pp. 139-141), registered with the system through the
 * add-on API under the indirectFire switch: a fire mission run from a gun's
 * row. The rules themselves are in `rules.ts`.
 *
 * One dialog sets the mission up: observed fire under a forward observer, or
 * predicted fire on an area off a map; the gun's mode; the FO, his skills and
 * what he navigates and looks with; how far away the target is and the
 * mission's trajectory. One card then runs it, a button at a time:
 *
 *   - the FO's Navigation roll (+1 compass, +3 GPS, -10 without a map);
 *   - his Forward Observer roll to find the target (-3 per 500 yards after
 *     magnification and a rangefinder, the other Vision modifiers, a
 *     fire-control computer's bonus) and 2d+5 seconds, whose margin moves the
 *     first shot's -10; a critical success takes it all off, a critical
 *     failure brings the fire down somewhere the GM picks;
 *   - the gun's attack: its skill at -10 plus the FO's adjustment and no Acc
 *     (predicted fire: the Basic Set's +4 for attacking an area instead), the
 *     time of flight, and on a miss the scatter, squared as for an Artillery
 *     shot at a target the gunner can't see (Campaigns p. 414);
 *   - each correction after a shot: another Forward Observer roll and 2d+5
 *     seconds, its margin added on.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  INDIRECT_FIRE_PENALTY,
  NAVIGATION_AID_BONUS,
  SPOTTING_TIME,
  adjustmentAfter,
  firesIndirectly,
  navigationModifiers,
  observationRangePenalty,
  observationYards,
  shotPenalty,
  timeOfFlight,
  usualTrajectory,
  type Mission,
  type NavigationAid,
  type Trajectory,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.IndirectFire.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.IndirectFire.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const fromUuid = (uuid: unknown) => (globalThis as any).fromUuidSync?.(String(uuid ?? "")) ?? null;
const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

const CARD = "ht-indirect-fire";
const FORWARD_OBSERVER = "Forward Observer";

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];

/** The character's attack rows for a weapon. */
function rowsFor(api: GWorldApi, actor: any, item: any): any[] {
  const rows: any[] = (api.actors.derived(actor) as any)?.ranged ?? [];
  return rows.filter((r) => r?.itemId === item?.id);
}

/** Yards between two tokens, or null where the map can't say. */
function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  if (!a?.center || !b?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([a.center, b.center])?.distance);
  return Number.isFinite(distance) ? Math.round(distance) : null;
}

const tokenOf = (actor: any) => actor?.getActiveTokens?.()?.[0] ?? null;

/**
 * A skill's level, or its default from IQ (Characters pp. 196 and 211:
 * Forward Observer and Navigation both default to IQ-5). For Navigation, the
 * best specialty the character knows.
 */
export function observerSkill(api: GWorldApi, actor: any, skill: "Forward Observer" | "Navigation"): number {
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  const names = skill === "Navigation"
    ? [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^navigation\b/i.test(String(i.name ?? ""))).map((i: any) => String(i.name))
    : [skill];
  const levels = names.map((name) => api.actors.skillLevel(actor, name)).filter((l): l is number => typeof l === "number");
  return levels.length ? Math.max(...levels) : iq - 5;
}

/**
 * What the FO navigates with (p. 139), read off his carried gear. Gear listed
 * as a tool of Navigation (`forSkills`) is already in his skill, so it adds
 * nothing here; otherwise a compass or a GPS receiver by its name.
 */
export function carriedNavigationAid(actor: any): { aid: NavigationAid; counted: string | null; found: string | null } {
  const gear = [...(actor?.items ?? [])].filter((i: any) => i?.type === "equipment" && i.system?.carried !== false);
  const tool = gear.find((i: any) => (i.system?.forSkills ?? []).some((s: unknown) => /^navigation\b/i.test(String(s ?? ""))));
  if (tool) return { aid: "none", counted: String(tool.name ?? ""), found: null };
  const gps = gear.find((i: any) => /\bgps\b|global positioning/i.test(String(i.name ?? "")));
  if (gps) return { aid: "gps", counted: null, found: String(gps.name ?? "") };
  const compass = gear.find((i: any) => /compass/i.test(String(i.name ?? "")));
  if (compass) return { aid: "compass", counted: null, found: String(compass.name ?? "") };
  return { aid: "none", counted: null, found: null };
}

/** One line of the card's log. */
interface LogLine { text: string; note?: string }

/** Everything the mission card carries between its buttons. */
export interface MissionData {
  mission: Mission;
  gunnerUuid: string;
  itemId: string;
  modeIndex: number;
  weapon: string;
  foUuid: string;
  foName: string;
  foSkill: number;
  navigationSkill: number;
  navigation: Array<{ label: string; value: number }>;
  observation: Array<{ label: string; value: number }>;
  gunYards: number;
  trajectory: Trajectory;
  flightSeconds: number;
  gunnerModifier: number;
  /** "navigate", "locate" or "fire". */
  stage: string;
  /** What the FO has taken off the -10 so far. */
  adjustment: number;
  /** Seconds the FO has spent locating the target and correcting. */
  spotSeconds: number;
  /** Shots fired since the last correction, which a correction needs one of. */
  shotsSinceCorrection: number;
  shots: number;
  /** The last shot hit, or missed with a round that still goes off where it lands. */
  canDamage: boolean;
  lastHit: boolean;
  log: LogLine[];
  [key: string]: unknown;
}

/** What the card shows, worked out from its data. */
export function missionView(data: MissionData): MissionData {
  const observed = data.mission === "observed";
  const penalty = observed ? shotPenalty(data.adjustment) : 0;
  return {
    ...data,
    title: F("CardTitle", { weapon: data.weapon }),
    summary: observed
      ? F("ObservedSummary", { fo: data.foName, yards: data.gunYards, trajectory: L(`Trajectory.${data.trajectory}`), seconds: data.flightSeconds })
      : F("PredictedSummary", { yards: data.gunYards, trajectory: L(`Trajectory.${data.trajectory}`), seconds: data.flightSeconds }),
    standing: observed && data.stage === "fire" ? F("Standing", { penalty: signed(penalty), seconds: data.spotSeconds }) : "",
    navigate: observed && data.stage === "navigate",
    locate: observed && data.stage === "locate",
    fire: data.stage === "fire",
    correct: observed && data.stage === "fire" && data.shotsSinceCorrection > 0,
  };
}

async function dice(formula: string): Promise<{ total: number; roll: any }> {
  const roll = new Roll(formula);
  await roll.evaluate();
  return { total: Number(roll.total) || 0, roll };
}

/** Opens the mission's dialog from a gun's row, and posts its card. */
export async function planMission(api: GWorldApi, item: any, gunner: any): Promise<MissionData | null> {
  const rows = rowsFor(api, gunner, item).filter((r) => firesIndirectly({ name: r.mode, skill: r.skillName || r.modeSkill }));
  if (!rows.length) return void ui.notifications?.warn(L("NoMode")), null;
  const preferred = rows.find((r) => /\bindirect\b/i.test(String(r.mode ?? ""))) ?? rows[0];

  // The FO: a token the GM has selected other than the gunner's, else anyone on the scene who knows the skill.
  const sceneActors: any[] = [...((globalThis as any).canvas?.tokens?.placeables ?? [])].map((t: any) => t?.actor).filter(Boolean);
  const people = [gunner, ...sceneActors].filter((a, i, all) => all.findIndex((b) => b?.uuid === a?.uuid) === i);
  const selected = [...((globalThis as any).canvas?.tokens?.controlled ?? [])].map((t: any) => t?.actor).find((a: any) => a && a.uuid !== gunner.uuid);
  const fo = selected ?? people.find((a) => a.uuid !== gunner.uuid && typeof api.actors.skillLevel(a, FORWARD_OBSERVER) === "number") ?? gunner;

  const targets = [...((game as any).user?.targets ?? [])];
  const target = targets.length === 1 ? targets[0] : null;
  const gunYards = yardsBetween(tokenOf(gunner), target) ?? 1000;
  const foYards = (a: any) => yardsBetween(tokenOf(a), target) ?? 1000;
  const aidOf = (a: any) => carriedNavigationAid(a);
  const aidHint = (a: any) => {
    const read = aidOf(a);
    return read.counted ? F("AidCounted", { item: read.counted }) : read.found ? F("AidFound", { item: read.found }) : L("AidAsk");
  };

  const option = (value: string, label: string, chosen: boolean) => `<option value="${esc(value)}"${chosen ? " selected" : ""}>${esc(label)}</option>`;
  const row = (label: string, field: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${field}</label>`;
  const number = (name: string, value: number, extra = "") => `<input type="number" name="${name}" value="${value}" step="1" style="width:90px" ${extra}>`;
  const firstAid = aidOf(fo).aid;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    <p class="ihint">${esc(L("DialogHint"))}</p>
    ${row(L("Mission"), `<select name="mission">${option("observed", L("Missions.observed"), true)}${option("predicted", L("Missions.predicted"), false)}</select>`)}
    ${row(L("Mode"), `<select name="modeIndex">${rows.map((r) => option(String(r.modeIndex), `${r.mode || r.name} (${r.skillName} ${r.skillLevel ?? "-"})`, r === preferred)).join("")}</select>`)}
    ${row(L("GunYards"), number("gunYards", gunYards, 'min="0"'))}
    ${row(L("TrajectoryLabel"), `<select name="trajectory">${(["low", "high"] as Trajectory[]).map((t) => option(t, L(`Trajectory.${t}`), t === usualTrajectory({ minRange: Number(preferred.minRange) || 0, yards: gunYards }))).join("")}</select>`)}
    ${row(L("GunnerModifier"), number("gunnerModifier", 0))}
    <fieldset data-observed style="display:flex;flex-direction:column;gap:6px"><legend>${esc(L("ObserverLegend"))}</legend>
      ${row(L("Observer"), `<select name="fo">${people.map((a) => option(String(a.uuid), String(a.name ?? ""), a === fo)).join("")}</select>`)}
      ${row(L("FoSkill"), number("foSkill", observerSkill(api, fo, FORWARD_OBSERVER)))}
      ${row(L("NavigationSkill"), number("navigationSkill", observerSkill(api, fo, "Navigation")))}
      ${row(L("Aid"), `<select name="aid">${(["none", "compass", "gps"] as NavigationAid[]).map((a) => option(a, L(`Aids.${a}`), a === firstAid)).join("")}</select>`)}
      <p class="ihint" data-aid-hint>${esc(aidHint(fo))}</p>
      <label class="icheck"><input type="checkbox" name="map" checked> ${esc(L("Map"))}</label>
      ${row(L("FoYards"), number("foYards", foYards(fo), 'min="0"'))}
      ${row(L("Magnification"), number("magnification", 1, 'min="1"'))}
      ${row(L("Rangefinder"), number("rangefinder", 0, 'min="0"'))}
      ${row(L("FireControl"), number("fireControl", 0, 'min="0"'))}
      ${row(L("Vision"), number("vision", 0))}
    </fieldset></div>`;

  const form = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("DialogTitle", { weapon: String(item.name ?? "") }) },
    content,
    ok: { label: L("Start"), callback: (_e: Event, button: any) => new (foundry.applications as any).ux.FormDataExtended(button.form).object },
    // The FO's own figures follow whoever is picked; predicted fire has no FO.
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement | null = dialog?.element ?? null;
      const field = <T extends Element>(name: string) => root?.querySelector<T>(`[name="${name}"]`) ?? null;
      field<HTMLSelectElement>("fo")?.addEventListener("change", (event) => {
        const picked = fromUuid((event.target as HTMLSelectElement).value);
        if (!picked) return;
        const set = (name: string, value: unknown) => { const input = field<HTMLInputElement | HTMLSelectElement>(name); if (input) input.value = String(value); };
        set("foSkill", observerSkill(api, picked, FORWARD_OBSERVER));
        set("navigationSkill", observerSkill(api, picked, "Navigation"));
        set("aid", aidOf(picked).aid);
        set("foYards", foYards(picked));
        const hint = root?.querySelector<HTMLElement>("[data-aid-hint]");
        if (hint) hint.textContent = aidHint(picked);
      });
      const fieldset = root?.querySelector<HTMLElement>("[data-observed]");
      field<HTMLSelectElement>("mission")?.addEventListener("change", (event) => {
        if (fieldset) fieldset.style.display = (event.target as HTMLSelectElement).value === "predicted" ? "none" : "flex";
      });
    },
    rejectClose: false,
  } as any) as Record<string, any> | null;
  if (!form) return null;

  const data = missionFrom(api, { gunner, item, rows, form });
  await api.chat.post(`${MODULE_ID}.${CARD}`, missionView(data), { actor: gunner } as any);
  return data;
}

/** The card's starting data from the dialog's answers. */
export function missionFrom(api: GWorldApi, options: { gunner: any; item: any; rows: any[]; form: Record<string, any> }): MissionData {
  const { gunner, item, rows, form } = options;
  const whole = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback);
  const mission: Mission = form.mission === "predicted" ? "predicted" : "observed";
  const row = rows.find((r) => r.modeIndex === whole(form.modeIndex)) ?? rows[0];
  const fo = mission === "observed" ? fromUuid(form.fo) ?? gunner : null;
  const aid: NavigationAid = form.aid in NAVIGATION_AID_BONUS ? form.aid : "none";
  const trajectory: Trajectory = form.trajectory === "high" ? "high" : "low";
  const gunYards = Math.max(0, whole(form.gunYards));

  const observation: Array<{ label: string; value: number }> = [];
  const foYards = Math.max(0, whole(form.foYards));
  const magnification = Math.max(1, Number(form.magnification) || 1);
  const effective = observationYards({ yards: foYards, magnification, rangefinderYards: whole(form.rangefinder) });
  const range = observationRangePenalty(effective);
  if (range) observation.push({ label: F("RangeLine", { yards: foYards, effective: Math.round(effective) }), value: range });
  if (whole(form.fireControl) > 0) observation.push({ label: L("FireControlLine"), value: whole(form.fireControl) });
  if (whole(form.vision)) observation.push({ label: L("VisionLine"), value: whole(form.vision) });

  return {
    mission,
    gunnerUuid: String(gunner.uuid),
    itemId: String(item.id),
    modeIndex: Number(row?.modeIndex) || 0,
    // The mode's name only where there is a choice ("Indirect fire" beside "Direct fire"), not a lone "attack".
    weapon: [String(item.name ?? ""), rows.length > 1 && row?.mode ? `(${row.mode})` : ""].filter(Boolean).join(" "),
    foUuid: String(fo?.uuid ?? ""),
    foName: String(fo?.name ?? ""),
    foSkill: whole(form.foSkill, 5),
    navigationSkill: whole(form.navigationSkill, 5),
    navigation: navigationModifiers({ aid, map: Boolean(form.map) }).map((line) => ({ label: L(`NavigationLines.${line.key}`), value: line.value })),
    observation,
    gunYards,
    trajectory,
    flightSeconds: timeOfFlight(gunYards, trajectory),
    gunnerModifier: whole(form.gunnerModifier),
    stage: mission === "observed" ? "navigate" : "fire",
    adjustment: 0,
    spotSeconds: 0,
    shotsSinceCorrection: 0,
    shots: 0,
    canDamage: false,
    lastHit: false,
    log: [],
  };
}

/** The FO's Navigation roll: where he and the gun are (p. 139). */
export async function navigate(api: GWorldApi, data: MissionData): Promise<MissionData> {
  const fo = fromUuid(data.foUuid);
  const outcome: any = await api.roll.success({ actor: fo, base: data.navigationSkill, label: F("NavigationRoll", { fo: data.foName }), skill: "Navigation", modifiers: data.navigation, tags: ["indirectFire"] } as any);
  if (!outcome) return data;
  // The book doesn't say what a failure costs beyond not knowing where he is; he may try again.
  return outcome.success
    ? { ...data, stage: "locate", log: [...data.log, { text: F("Navigated", { fo: data.foName }) }] }
    : { ...data, log: [...data.log, { text: F("Lost", { fo: data.foName }) }] };
}

/**
 * A Forward Observer roll, to find the target or to correct the fire after a
 * shot (p. 139): its margin added to what the FO has taken off, and 2d+5
 * seconds.
 */
export async function observe(api: GWorldApi, data: MissionData, correction: boolean): Promise<MissionData> {
  const fo = fromUuid(data.foUuid);
  const outcome: any = await api.roll.success({
    actor: fo,
    base: data.foSkill,
    label: F(correction ? "CorrectionRoll" : "LocateRoll", { fo: data.foName }),
    skill: FORWARD_OBSERVER,
    modifiers: data.observation,
    tags: ["indirectFire", "vision"],
  } as any);
  if (!outcome) return data;
  const time = await dice(SPOTTING_TIME);
  const adjustment = adjustmentAfter(data.adjustment, outcome);
  const text = F(correction ? "Corrected" : "Located", { fo: data.foName, penalty: signed(shotPenalty(adjustment)), seconds: time.total });
  const note = outcome.criticalSuccess ? L("CriticalSuccess") : outcome.criticalFailure ? L("FriendlyFire") : undefined;
  return {
    ...data,
    stage: "fire",
    adjustment,
    spotSeconds: data.spotSeconds + time.total,
    shotsSinceCorrection: 0,
    log: [...data.log, { text, ...(note ? { note } : {}) }],
  };
}

/** The gun's attack (p. 139; Campaigns p. 414), and the scatter of a miss. */
export async function fire(api: GWorldApi, data: MissionData): Promise<MissionData> {
  const gunner = fromUuid(data.gunnerUuid);
  const row = gunner ? rowsFor(api, gunner, gunner.items?.get?.(data.itemId)).find((r) => r.modeIndex === data.modeIndex) : null;
  if (!gunner || !row || typeof row.skillLevel !== "number") {
    ui.notifications?.warn(L("NoGun"));
    return data;
  }
  const modifiers: Array<{ label: string; value: number }> = [];
  if (data.mission === "observed") {
    // Blind, and no Acc; the FO's adjustment brings the -10 back toward 0.
    modifiers.push({ label: L("BlindLine"), value: INDIRECT_FIRE_PENALTY });
    if (data.adjustment) modifiers.push({ label: F("AdjustmentLine", { fo: data.foName }), value: shotPenalty(data.adjustment) - INDIRECT_FIRE_PENALTY });
  } else {
    // Predicted fire attacks an area of ground: the Basic Set's +4, and no -10.
    modifiers.push({ label: L("AreaLine"), value: Number((api.rules as any).AREA_ATTACK_BONUS) || 4 });
  }
  if (data.gunnerModifier) modifiers.push({ label: L("GunnerModifierLine"), value: data.gunnerModifier });

  const outcome: any = await api.roll.success({
    actor: gunner,
    base: row.skillLevel,
    label: F("FireRoll", { weapon: data.weapon }),
    kind: "attack",
    skill: String(row.skillName ?? ""),
    modifiers,
    tags: ["indirectFire"],
  } as any);
  if (!outcome) return data;

  const shot = data.shots + 1;
  const explosive = Boolean(row.explosive || row.followUp?.explosive);
  const arrives = F("Arrives", { seconds: data.flightSeconds });
  let text: string;
  if (outcome.success) {
    text = F("Hit", { shot, arrives });
  } else {
    // A shot at what the gunner can't see scatters by the square of the margin (Campaigns p. 414).
    const direction = await dice("1d6");
    const scatter = (api.rules as any).scatterDistance({ margin: outcome.margin, distanceYards: data.gunYards, unseen: true, squared: row.scatterSquared === true, directionRoll: direction.total });
    const bearing = Number((api.rules as any).scatterBearing?.(scatter.direction)) || 0;
    text = F("Missed", { shot, margin: outcome.margin, yards: scatter.yards, direction: scatter.direction, bearing, arrives });
  }
  return { ...data, shots: shot, shotsSinceCorrection: data.shotsSinceCorrection + 1, lastHit: outcome.success, canDamage: outcome.success || explosive, log: [...data.log, { text }] };
}

/** The shot's damage: the round's own and its follow-up, or on a miss only what goes off where it lands. */
export async function damage(api: GWorldApi, data: MissionData): Promise<void> {
  const gunner = fromUuid(data.gunnerUuid);
  const item = gunner?.items?.get?.(data.itemId) ?? null;
  const row = gunner ? rowsFor(api, gunner, item).find((r) => r.modeIndex === data.modeIndex) : null;
  if (!gunner || !row) return;
  const mode = { index: data.modeIndex, ranged: true };
  const blast = (source: any) => ({
    explosive: Boolean(source.explosive),
    ...(source.fragmentation ? { fragmentation: String(source.fragmentation) } : {}),
    ...(source.fragmentationType ? { fragmentationType: source.fragmentationType } : {}),
    ...(Number(source.fragmentationDivisor) > 0 ? { fragmentationDivisor: Number(source.fragmentationDivisor) } : {}),
    ...(source.blastPlacement ? { blastPlacement: source.blastPlacement } : {}),
  });
  if ((data.lastHit || row.explosive) && row.damageRollable !== false && row.damage) {
    await api.roll.damage({ actor: gunner, item, mode, label: F("DamageLabel", { weapon: data.weapon }), formula: String(row.damage), damageType: row.damageType, armorDivisor: Number(row.armorDivisor) || 1, ...blast(row) } as any);
  }
  const follow = row.followUp;
  if (follow?.damage && (data.lastHit || follow.explosive)) {
    await api.roll.damage({ actor: gunner, item, mode, label: F("FollowUpLabel", { weapon: data.weapon }), formula: String(follow.damage), damageType: follow.damageType, armorDivisor: Number(follow.armorDivisor) || 1, ...blast(follow) } as any);
  }
}

export function readyIndirectFire(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: CARD,
    itemTypes: ["equipment"],
    label: L("Action"),
    icon: "fa-solid fa-satellite-dish",
    visible: (item) => on() && rangedModes(item).some((mode) => firesIndirectly(mode)),
    run: (item, actor) => { void planMission(api, item, actor); },
  });

  const step = (run: (data: MissionData) => Promise<MissionData>) => async ({ message, data }: any) => {
    if (!on()) return;
    const next = await run(data as MissionData);
    if (next !== data) await api.chat.update(message, missionView(next));
  };
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ht-indirect-fire.hbs`,
    actions: {
      navigate: step((data) => navigate(api, data)),
      locate: step((data) => observe(api, data, false)),
      correct: step((data) => observe(api, data, true)),
      fire: step((data) => fire(api, data)),
      damage: async ({ data }: any) => { if (on()) await damage(api, data as MissionData); },
    },
  } as any);
}
