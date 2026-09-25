/**
 * Audio gear from the supplement Electricity and Electronics (HT:EE pp.
 * 30-32), registered with the system through the add-on API under two of
 * High-Tech's switches. The rules are in `rules.ts`; what a record is comes
 * from its name, what the GM says about it from the `device` data (#490) and
 * whether it is in use from its being worn (equipped).
 *
 *   - **Audio fidelity (audioFidelity):** a row action that listens through a
 *     chain of the character's audio gear, the Hearing roll to tell sounds
 *     apart or the Connoisseur (Music) roll at the weakest link's quality,
 *     with an aimed parabolic or shotgun microphone's Electronics Operation
 *     roll first and the parabolic's bonus after, and the distance to the
 *     sound through `roll.success`'s `distance`; the later microphones' +1 to
 *     Electronics Operation (Media); a carbon microphone's HT 12 as an object
 *     (`gworld.objectStats`); the cheaper microphone's price, a better
 *     loudspeaker's weight; headphones in use leaving the wearer Hard of
 *     Hearing (`traitEffects.hardOfHearing`), -2 turned down, earbuds half
 *     that; the tactical headset's Protected Hearing; and the supplement's
 *     basic hydrophone heard through High-Tech's hydrophone roll, which fixes
 *     nothing.
 *   - **Sound amplification (soundAmplification):** a row action that
 *     addresses the targeted listeners through a public address system,
 *     guitar amplifier, bullhorn or acoustic hailing device, each rolling
 *     Hearing at its distance against the device's base Hearing range in
 *     their arc; the bullhorn's distortion and the bullhorn's and hailing
 *     device's +1 to Intimidation close in; a public address system's extra
 *     speakers priced and sharing its battery; and a worn hearing aid taking
 *     Hard of Hearing out of play as a Mitigator (`gworld.traitsInPlay`), an
 *     early aid's poor sound on its wearer's Hearing rolls. The listeners'
 *     arcs come from the speaker's facing on the map, where both have
 *     tokens: the bullhorn's side and rear, the hailing device's cone, and
 *     the +1 to Intimidation's reach to the side. A guitar amplifier's row
 *     plays through it: Musical Instrument, the TL6 amplifier's set-up roll
 *     (Electronics Operation (Media)) and its -2 to play with distortion.
 *
 * Under audioFidelity, recording and playback gear (HT:EE p. 33; High-Tech p.
 * 42) are links in a chain: a narrow cassette no better than basic, and a
 * recorder's row records through a chain, so what it plays back keeps that
 * chain's weakest link.
 *
 * These read High-Tech's records and the supplement's alike (decision E1 in
 * #471): the supplement's audio records (#479), and High-Tech's Microphone,
 * Headphones, Tactical Headset and Hearing Aid.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { registerPowerAdjuster } from "../../../shared/power/data.js";
import { ask, card, esc, itemTl, picked, row, skillBase, worn, yardsBetween } from "../../../shared/sensors/index.js";
import { deviceData, storeDevice } from "../devices/index.js";
import { applyMitigations } from "../prosthetics/index.js";
import { hydrophoneRoll } from "../sensors/index.js";
import {
  CARBON_HT,
  EARPHONE_AS_MICROPHONE,
  HARD_OF_HEARING,
  gradeCap,
  guitarDistortion,
  isRecording,
  listenerArc,
  INEXPENSIVE_PRICE,
  MICROPHONE_OPERATION,
  SHOTGUN_AIMING,
  amplifiedRange,
  amplifierOf,
  audioKind,
  baseName,
  basicHydrophoneBonus,
  chainQuality,
  intimidationBonus,
  isEarphone,
  isMicrophone,
  linkQuality,
  listeningPenalty,
  paSpeakers,
  parabolicBonus,
  printedQuality,
  speakerWeightFactor,
  type Arc,
  type AudioKind,
  type Listening,
  type Pitch,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Audio.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Audio.${key}`, data);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Whether a pair of headphones or earbuds is playing, and how loud: a flag, as it is play and not the record. */
export const LISTENING_FLAG = "htListening";
/** What a recorder took down: the weakest link of the chain it was recorded through, a flag, as it is use and not the record. */
export const RECORDING_FLAG = "htRecording";

/** The quality and source a recorder's recording keeps, or null where it holds none. */
export function recordingOf(item: any): { quality: number; from: string } | null {
  const value = item?.flags?.[MODULE_ID]?.[RECORDING_FLAG];
  return value && Number.isFinite(Number(value.quality)) ? { quality: Number(value.quality), from: String(value.from ?? "") } : null;
}

export interface AudioSwitches {
  fidelity: () => boolean;
  amplification: () => boolean;
}

const kindOf = (item: any): AudioKind | null => (item?.type === "equipment" ? audioKind(item.name) : null);
const isPa = (item: any) => /^public address system$/i.test(baseName(item?.name));
const isPlainMicrophone = (item: any) => kindOf(item) === "microphone" && /^microphone$/i.test(baseName(item?.name));
const HEARING_AID = /^hearing aid\b/i;

/** How loud a pair of headphones or earbuds is playing. */
export function listeningOf(item: any): Listening {
  const value = item?.flags?.[MODULE_ID]?.[LISTENING_FLAG];
  return value === "loud" || value === "low" ? value : "off";
}

/** What the equipment grade is worth to the sound (Campaigns p. 345), as a technological tool. */
function gradeOf(api: GWorldApi, item: any): number {
  const grade = String(item?.system?.equipmentQuality ?? "basic");
  return Number(api.rules.toolModifier(grade as never, item?.system?.equipmentModifier, { technological: true, tl: itemTl(item) })) || 0;
}

/** One link's sound quality (HT:EE p. 31). */
export function qualityOf(api: GWorldApi, item: any): number {
  const data = deviceData(item);
  return linkQuality({
    grade: gradeOf(api, item),
    stated: data.soundQuality,
    carbon: isMicrophone(kindOf(item)) && data.carbonMicrophone,
    printed: printedQuality(item?.name, itemTl(item)),
    cap: gradeCap(item?.name),
    recorded: kindOf(item) === "recorder" ? recordingOf(item)?.quality ?? null : null,
  });
}

/** The character's Hearing score, null where he can't hear at all (Deafness), Perception where no row is read. */
function hearingScore(api: GWorldApi, actor: any): number | null {
  const derived: any = api.actors.derived?.(actor) ?? null;
  const hearing = (derived?.senses ?? []).find((s: any) => s?.sense === "hearing");
  if (hearing && hearing.score === null) return null;
  const score = Number(hearing?.score);
  if (Number.isFinite(score)) return score;
  const per = Number(derived?.per ?? api.actors.attribute(actor, "Per"));
  return Number.isFinite(per) ? per : 10;
}

/** Whether the character owns the Hard of Hearing disadvantage. */
const ownsHardOfHearing = (actor: any) => [...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && /^hard of hearing\b/i.test(String(i.name ?? "").trim()));

/** The worn headphones or earbuds playing, and what each costs the wearer's hearing. */
function listeners(actor: any): Array<{ item: any; hardOfHearing: boolean; modifier: number }> {
  return [...(actor?.items ?? [])]
    .filter((i: any) => worn(i))
    .map((item: any) => ({ item, ...listeningPenalty(kindOf(item), listeningOf(item)) }))
    .filter((l) => l.hardOfHearing || l.modifier !== 0);
}

// ── the item sheet ──

function itemLines(api: GWorldApi, item: any, on: AudioSwitches): string[] {
  const lines: string[] = [];
  const kind = kindOf(item);
  const tl = itemTl(item);
  const data = deviceData(item);
  if (on.fidelity() && kind) {
    lines.push(F("QualityLine", { value: signed(qualityOf(api, item)) }));
    if (isMicrophone(kind)) lines.push(data.carbonMicrophone ? F("CarbonLine", { ht: CARBON_HT }) : F("MicrophoneLine", { bonus: signed(MICROPHONE_OPERATION) }));
    if (kind === "parabolic") lines.push(L("ParabolicLine"));
    if (kind === "shotgun") lines.push(F("ShotgunLine", { bonus: signed(SHOTGUN_AIMING) }));
    if (isEarphone(kind)) lines.push(F("AsMicrophoneLine", { value: EARPHONE_AS_MICROPHONE }));
    if (kind === "headphones") lines.push(L("HeadphonesLine"));
    if (kind === "earbuds") lines.push(L("EarbudsLine"));
    if (kind === "speaker") lines.push(L("SpeakerLine"));
    if (kind === "headset") lines.push(L("HeadsetLine"));
    if (gradeCap(item?.name) !== null) lines.push(L("CassetteLine"));
    const recording = kind === "recorder" ? recordingOf(item) : null;
    if (recording) lines.push(F("RecordingLine", { value: signed(recording.quality), from: recording.from }));
  }
  if (on.fidelity() && basicHydrophoneBonus(item?.name, tl) !== null) lines.push(F("HydrophoneLine", { bonus: signed(basicHydrophoneBonus(item?.name, tl)!) }));
  if (on.amplification()) {
    const amp = item?.type === "equipment" ? amplifierOf(item.name, tl) : null;
    if (amp) {
      lines.push(amp.cone ? F("ConeRange", { yards: amp.front, cone: amp.cone }) : amp.side ? F("ArcRange", { front: amp.front, side: amp.side, rear: amp.rear }) : F("Range", { yards: amp.front }));
      if (amp.distortion) lines.push(F("DistortionLine", { value: amp.distortion }));
      if (amp.intimidation) lines.push(amp.intimidation.side ? F("IntimidationArcs", { front: amp.intimidation.front, side: amp.intimidation.side }) : F("IntimidationLine", { yards: amp.intimidation.front }));
      if (/^guitar amplifier$/i.test(baseName(item.name))) lines.push(L(tl <= 6 ? "GuitarEarly" : "GuitarLater"));
      if (isPa(item) && data.extraSpeakers > 0) lines.push(F("SpeakersLine", { count: data.extraSpeakers + 1 }));
    }
    if (kind === "hearingAid") lines.push(L("HearingAidLine"));
  }
  return lines;
}

function itemContext(api: GWorldApi, item: any, on: AudioSwitches): Record<string, unknown> {
  const kind = kindOf(item);
  const data = deviceData(item);
  const fidelity = on.fidelity() && Boolean(kind);
  const listening = listeningOf(item);
  return {
    editable: Boolean(item?.isOwner ?? true),
    lines: itemLines(api, item, on),
    quality: fidelity || (on.amplification() && kind === "hearingAid") ? { value: data.soundQuality ?? "" } : null,
    carbon: fidelity && isMicrophone(kind) ? { checked: data.carbonMicrophone } : null,
    inexpensive: fidelity && isPlainMicrophone(item) ? { checked: data.inexpensive } : null,
    listening: fidelity && (kind === "headphones" || kind === "earbuds")
      ? (["off", "loud", "low"] as const).map((value) => ({ value, label: L(`Listening.${value}`), selected: value === listening }))
      : null,
    speakers: on.amplification() && isPa(item) ? { value: data.extraSpeakers } : null,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-audio]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.htAudio);
      if (field === "listening") return void (await item.setFlag(MODULE_ID, LISTENING_FLAG, String(input.value)));
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void (await storeDevice(item, { [field]: input.checked }));
      if (field === "soundQuality") {
        const text = String(input.value).trim();
        return void (await storeDevice(item, { soundQuality: text === "" ? null : Math.max(-10, Math.min(10, Math.trunc(Number(text) || 0))) }));
      }
      if (field === "extraSpeakers") await storeDevice(item, { extraSpeakers: Math.max(0, Math.floor(Number(input.value) || 0)) });
    });
  });
}

// ── listening through a chain of gear (HT:EE pp. 30-31) ──

interface ChainAnswer {
  links: string[];
  other: number | null;
  task: "hearing" | "music";
  pitch: Pitch | "none";
  yards: number;
  baseYards: number;
}

/** The character's audio links: every carried piece of audio gear. */
function audioGear(actor: any): any[] {
  return [...(actor?.items ?? [])].filter((i: any) => kindOf(i) && kindOf(i) !== "hearingAid" && i.system?.carried !== false);
}

/**
 * Listens through a chain of gear: the aiming roll where an aimed microphone
 * is in it (a shotgun microphone's +3), then Hearing or Connoisseur (Music)
 * at the weakest link's quality, a parabolic microphone's bonus for the pitch,
 * and the distance from the microphone to the sound (Campaigns p. 358).
 */
export async function listen(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const gear = audioGear(actor);
  if (!gear.some((g) => g.id === item.id)) gear.unshift(item);
  const checks = gear.map((g) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="link" value="${esc(g.id)}" ${g.id === item.id || worn(g) ? "checked" : ""}/> ${esc(F("Link", { name: g.name, value: signed(qualityOf(api, g)) }))}</label>`).join("");
  const aimable = gear.some((g) => kindOf(g) === "parabolic" || kindOf(g) === "shotgun");
  const answer = await ask<ChainAnswer>(L("ListenTitle"),
    `<p class="ihint">${esc(L("ListenHint"))}</p>${checks}`
    + row(F("OtherLink", { value: EARPHONE_AS_MICROPHONE }), `<input type="number" name="other" value="" min="-10" max="10" step="1" style="width:70px" />`)
    + row(L("TaskLabel"), `<select name="task"><option value="hearing">${esc(L("Task.hearing"))}</option><option value="music">${esc(L("Task.music"))}</option></select>`)
    + (aimable ? row(L("Aim"), `<select name="pitch">${(["none", "high", "speech", "low"] as const).map((p) => `<option value="${p}">${esc(L(`Pitch.${p}`))}</option>`).join("")}</select>`) : "")
    + row(L("SoundYards"), `<input type="number" name="yards" value="0" min="0" step="any" style="width:70px" />`)
    + row(L("SoundBase"), `<input type="number" name="base" value="1" min="0" step="any" style="width:70px" />`),
    (form) => {
      const text = String(form.querySelector<HTMLInputElement>("[name=other]")?.value ?? "").trim();
      const pitch = String(form.querySelector<HTMLSelectElement>("[name=pitch]")?.value ?? "none");
      return {
        links: [...form.querySelectorAll<HTMLInputElement>("[name=link]")].filter((i) => i.checked).map((i) => i.value),
        other: text === "" ? null : Math.trunc(Number(text) || 0),
        task: form.querySelector<HTMLSelectElement>("[name=task]")?.value === "music" ? "music" : "hearing",
        pitch: (["high", "speech", "low"].includes(pitch) ? pitch : "none") as Pitch | "none",
        yards: Math.max(0, Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0),
        baseYards: Math.max(0, Number(form.querySelector<HTMLInputElement>("[name=base]")?.value) || 0),
      };
    });
  if (!answer) return;
  const chain = gear.filter((g) => answer.links.includes(String(g.id)));
  const distance = answer.yards > 0 && answer.baseYards > 0 ? { distance: { yards: answer.yards, baseYards: answer.baseYards } } : {};

  // Aiming the microphone at the sound first: Electronics Operation, with the Hearing modifiers (HT:EE p. 31).
  const aimed = answer.pitch !== "none" ? chain.find((g) => kindOf(g) === "parabolic" || kindOf(g) === "shotgun") : undefined;
  if (aimed) {
    const skill = operationSkill(api, actor);
    const aiming = kindOf(aimed) === "shotgun" ? [{ label: aimed.name, value: SHOTGUN_AIMING }] : [];
    const result: any = await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("AimRoll", { name: aimed.name }), modifiers: aiming, tags: ["audioAim"], item: aimed, ...distance } as any);
    if (!result?.success) return void (await card(actor, F("AimRoll", { name: aimed.name }), [F("AimMissed", { name: aimed.name })]));
  }

  const links = chain.map((g) => qualityOf(api, g));
  if (answer.other !== null) links.push(answer.other);
  const quality = chainQuality(links);
  const modifiers: Array<{ label: string; value: number }> = [];
  if (quality) modifiers.push({ label: F("ChainLine", { count: links.length }), value: quality });
  if (aimed && kindOf(aimed) === "parabolic" && answer.pitch !== "none") {
    const bonus = parabolicBonus(answer.pitch);
    if (bonus) modifiers.push({ label: F("ParabolicBonus", { name: aimed.name, pitch: L(`Pitch.${answer.pitch}`) }), value: bonus });
  }
  const label = F(answer.task === "music" ? "MusicRoll" : "HearingRoll", { name: item.name });
  if (answer.task === "music") {
    const skill = "Connoisseur (Music)";
    await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label, modifiers, tags: ["audioChain"], item } as any);
    return;
  }
  const base = hearingScore(api, actor);
  if (base === null) return void (await card(actor, label, [F("Deaf", { name: actor.name })]));
  // The wearer hears what his own headphones play: the Hard of Hearing they impose isn't on this roll.
  const playing = listeners(actor).find((l) => l.hardOfHearing && chain.includes(l.item));
  if (playing && !ownsHardOfHearing(actor)) modifiers.push({ label: F("OwnHeadphones", { name: playing.item.name }), value: -HARD_OF_HEARING });
  await api.roll.success({ actor, base, kind: "attribute", skill: "Hearing", label, modifiers, tags: ["hearing", "audioChain"], item, ...distance } as any);
}

/** Electronics Operation for audio gear: Media, or Surveillance where the character is better at it (HT:EE p. 30). */
function operationSkill(api: GWorldApi, actor: any): string {
  const media = "Electronics Operation (Media)";
  const surveillance = "Electronics Operation (Surveillance)";
  return (api.actors.skillLevel(actor, surveillance) ?? -Infinity) > (api.actors.skillLevel(actor, media) ?? -Infinity) ? surveillance : media;
}

// ── recording (HT:EE p. 33) ──

/**
 * Records through a chain of gear: the recorder keeps the chain's weakest
 * link (the recorder itself among them), so what it plays back sounds no
 * better than what it was recorded through (HT:EE pp. 31, 33).
 */
export async function record(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const gear = audioGear(actor).filter((g) => g.id !== item.id && !isRecording(kindOf(g)));
  const checks = gear.map((g) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="link" value="${esc(g.id)}" ${isMicrophone(kindOf(g)) && worn(g) ? "checked" : ""}/> ${esc(F("Link", { name: g.name, value: signed(qualityOf(api, g)) }))}</label>`).join("");
  const answer = await ask<{ links: string[]; other: number | null }>(F("RecordTitle", { name: item.name }),
    `<p class="ihint">${esc(L("RecordHint"))}</p>${checks}`
    + row(F("OtherLink", { value: EARPHONE_AS_MICROPHONE }), `<input type="number" name="other" value="" min="-10" max="10" step="1" style="width:70px" />`),
    (form) => {
      const text = String(form.querySelector<HTMLInputElement>("[name=other]")?.value ?? "").trim();
      return { links: [...form.querySelectorAll<HTMLInputElement>("[name=link]")].filter((i) => i.checked).map((i) => i.value), other: text === "" ? null : Math.trunc(Number(text) || 0) };
    });
  if (!answer) return;
  const chain = gear.filter((g) => answer.links.includes(String(g.id)));
  // The recorder's own quality, before any recording it held.
  const own = linkQuality({ grade: gradeOf(api, item), stated: deviceData(item).soundQuality, carbon: false, printed: printedQuality(item?.name, itemTl(item)), cap: gradeCap(item?.name) });
  const links = [own, ...chain.map((g) => qualityOf(api, g)), ...(answer.other !== null ? [answer.other] : [])];
  const quality = chainQuality(links);
  const from = chain.map((g) => String(g.name ?? "")).join(", ") || String(item.name ?? "");
  if (item?.isOwner) await item.setFlag(MODULE_ID, RECORDING_FLAG, { quality, from });
  await card(actor, F("RecordTitle", { name: item.name }), [F("Recorded", { name: item.name, value: signed(quality), count: links.length })]);
}

// ── playing through a guitar amplifier (HT:EE p. 32) ──

/** The Musical Instrument skills a character knows. */
const instrumentSkills = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^musical instrument\b/i.test(String(i.name ?? ""))).map((i: any) => String(i.name).replace(/\/TL\d+/i, ""));

/**
 * Plays through a guitar amplifier: the TL6 amplifier set up first on
 * Electronics Operation (Media), then the character's Musical Instrument, -2
 * to play with distortion through the TL6 amplifier (HT:EE p. 32).
 */
export async function playThrough(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const skills = instrumentSkills(actor);
  if (!skills.length) return void ui.notifications?.warn(L("NoInstrument"));
  const tl = itemTl(item);
  const penalty = guitarDistortion(item?.name, tl);
  const answer = await ask<{ skill: string; distortion: boolean; setUp: boolean }>(F("PlayTitle", { name: item.name }),
    row(L("InstrumentSkill"), `<select name="skill">${skills.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>`)
    + row(penalty ? F("DistortionPenalty", { value: penalty }) : L("DistortionFree"), `<input type="checkbox" name="distortion" />`)
    + (penalty ? row(L("SetUpFirst"), `<input type="checkbox" name="setUp" checked />`) : ""),
    (form) => ({
      skill: form.querySelector<HTMLSelectElement>("[name=skill]")?.value ?? skills[0]!,
      distortion: Boolean(form.querySelector<HTMLInputElement>("[name=distortion]")?.checked),
      setUp: Boolean(form.querySelector<HTMLInputElement>("[name=setUp]")?.checked),
    }));
  if (!answer) return;
  if (penalty && answer.setUp) {
    const media = "Electronics Operation (Media)";
    const set: any = await api.roll.success({ actor, base: skillBase(api, actor, media), skill: media, label: F("SetUpRoll", { name: item.name }), item, tags: ["audioSetUp"] } as any);
    if (!set || "refused" in set) return;
    if (!set.success) return void (await card(actor, F("PlayTitle", { name: item.name }), [F("NotSetUp", { name: item.name })]));
  }
  const modifiers = answer.distortion && penalty ? [{ label: F("DistortionPlay", { name: item.name }), value: penalty }] : [];
  // Musical Instrument has no attribute default (Characters p. 211): only a skill the character knows is offered.
  await api.roll.success({ actor, base: api.actors.skillLevel(actor, answer.skill) ?? 0, skill: answer.skill, label: F("PlayTitle", { name: item.name }), item, modifiers, tags: ["music"] } as any);
}

// ── addressing listeners through an amplifier (HT:EE p. 32) ──

/**
 * The listener's bearing from where the speaker's token faces, in degrees,
 * or null where either has no token on the map (Foundry's rotation 0 faces
 * down the map; a bearing of 0 is straight ahead).
 */
export function bearingFromFacing(speaker: any, listener: any): number | null {
  const own = speaker?.getActiveTokens?.()?.[0];
  const other = listener?.getActiveTokens?.()?.[0];
  const from = own?.center;
  const to = other?.center;
  if (!from || !to) return null;
  const rotation = Number(own.document?.rotation ?? own.rotation);
  if (!Number.isFinite(rotation)) return null;
  if (from.x === to.x && from.y === to.y) return 0;
  const toward = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return toward - (rotation + 90);
}

interface AddressAnswer {
  arc: Arc | "outside";
  task: "hear" | "understand";
  yards: number;
}

/**
 * Addresses the targeted listeners through an amplifier: each rolls Hearing
 * at his distance from the speaker against the device's base Hearing range
 * in his arc (`roll.success`'s `distance`, which stretches it for his
 * Parabolic Hearing), the bullhorn's distortion on following the words.
 * With nobody targeted, the card gives the modifier at a distance the GM
 * enters.
 */
export async function address(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const amp = amplifierOf(item.name, itemTl(item));
  if (!amp) return;
  const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  const arcs: Array<Arc | "outside"> = amp.cone ? ["front", "outside"] : amp.side ? ["front", "side", "rear"] : ["front"];
  const answer = await ask<AddressAnswer>(L("AddressTitle"),
    `<p class="ihint">${esc(targets.length ? F("AddressTargets", { count: targets.length }) : L("AddressNobody"))}</p>`
    + (arcs.length > 1 ? row(L("ArcLabel"), `<select name="arc">${arcs.map((a) => `<option value="${a}">${esc(L(`ArcName.${a}`))}</option>`).join("")}</select>`) : "")
    + (amp.distortion ? row(L("TaskLabel"), `<select name="task"><option value="hear">${esc(L("Task.hear"))}</option><option value="understand">${esc(L("Task.understand"))}</option></select>`) : "")
    + (targets.length ? "" : row(L("Yards"), `<input type="number" name="yards" value="${amp.front}" min="0" step="any" style="width:80px" />`)),
    (form) => {
      const arc = String(form.querySelector<HTMLSelectElement>("[name=arc]")?.value ?? "front");
      // (The arc asked is for listeners off the map: the speaker's facing reads it for those on it.)
      return {
        arc: (["front", "side", "rear", "outside"].includes(arc) ? arc : "front") as Arc | "outside",
        task: form.querySelector<HTMLSelectElement>("[name=task]")?.value === "understand" ? "understand" : "hear",
        yards: Math.max(0, Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0),
      };
    });
  if (!answer) return;
  const title = F("AddressRoll", { name: item.name });
  const range = amplifiedRange(amp, answer.arc);
  if (range === null && !targets.length) return void (await card(actor, title, [L("OutsideCone")]));
  const modifiers = answer.task === "understand" && amp.distortion ? [{ label: F("Distorted", { name: item.name }), value: amp.distortion }] : [];
  if (!targets.length) {
    const value = api.rules.hearingDistanceModifier(answer.yards, range!);
    return void (await card(actor, title, [F("AtDistance", { yards: answer.yards, range, value: signed(value) })]));
  }
  for (const listener of targets) {
    const base = hearingScore(api, listener);
    if (base === null) {
      await card(listener, title, [F("Deaf", { name: listener.name })]);
      continue;
    }
    // Where both are on the map, the speaker's facing says the listener's arc; the dialog's answer otherwise.
    const bearing = bearingFromFacing(actor, listener);
    const arc = bearing === null ? answer.arc : listenerArc(amp, bearing);
    const reach = amplifiedRange(amp, arc);
    if (reach === null) {
      await card(listener, title, [F("OutsideConeOf", { name: listener.name })]);
      continue;
    }
    // To a tenth of a yard, as the card shows it.
    const yards = Math.max(0.1, Math.round((yardsBetween(actor, listener) ?? reach) * 10) / 10);
    await api.roll.success({ actor: listener, base, kind: "attribute", skill: "Hearing", label: title, modifiers, tags: ["hearing", "amplified"], item, distance: { yards, baseYards: reach } } as any);
  }
}

// ── registration ──

export function readyAudio(api: GWorldApi, on: AudioSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-audio-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-audio-item.hbs`,
    visible: (item) => itemLines(api, item, on).length > 0,
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // Headphones in use as Hard of Hearing; the tactical headset's Protected Hearing (HT:EE p. 31).
  Hooks.on("gworld.traitEffects", (context: any) => {
    const effects = context?.effects;
    if (!on.fidelity() || !effects) return;
    const sources: any[] = Array.isArray(context.sources) ? context.sources : [];
    for (const item of [...(context.actor?.items ?? [])].filter((i: any) => worn(i))) {
      if (kindOf(item) === "headset") {
        effects.protectedSense = { ...(effects.protectedSense ?? {}), hearing: true };
        sources.push({ effect: "protectedSense.hearing", label: String(item.name ?? "") });
      }
    }
    const playing = listeners(context.actor).find((l) => l.hardOfHearing);
    if (playing) {
      effects.hardOfHearing = true;
      sources.push({ effect: "hardOfHearing", label: F("ListeningSource", { name: playing.item.name }) });
    }
  });

  // A hearing aid as a Mitigator for Hard of Hearing (HT:EE p. 32; Characters p. 112), as High-Tech's prosthetics do (High-Tech p. 226).
  Hooks.on("gworld.traitsInPlay", (context: any) => {
    if (!on.amplification() || !context?.actor || !Array.isArray(context.traits)) return;
    applyMitigations(context.actor, context.traits, HEARING_AID);
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || !Array.isArray(context?.modifiers)) return;
    const tags: string[] = Array.isArray(context.tags) ? context.tags : [];
    const skill = String(context.skill ?? "");
    if (on.fidelity()) {
      // Headphones turned down, or earbuds: less than Hard of Hearing on what else the wearer hears (HT:EE p. 31).
      if (tags.includes("hearing") && !tags.includes("audioChain")) {
        for (const l of listeners(actor)) if (!l.hardOfHearing) context.modifiers.push({ label: F("ListeningLine", { name: l.item.name }), value: l.modifier });
      }
      // The later microphones: +1 to Electronics Operation (Media) over a carbon one (HT:EE p. 31).
      if (/^electronics operation \(media\)/i.test(skill)) {
        const mics = [context.item, ...[...(actor.items ?? [])].filter((i: any) => worn(i))].filter((i: any) => i && isMicrophone(kindOf(i)));
        const good = mics.find((i: any) => !deviceData(i).carbonMicrophone);
        if (good) context.modifiers.push({ label: F("MicrophoneBonus", { name: good.name }), value: MICROPHONE_OPERATION });
      }
    }
    if (on.amplification()) {
      // An early hearing aid's poor sound on its wearer's Hearing rolls (HT:EE p. 32).
      if (tags.includes("hearing")) {
        const aid = [...(actor.items ?? [])].find((i: any) => worn(i) && kindOf(i) === "hearingAid" && (deviceData(i).soundQuality ?? 0) < 0);
        if (aid) context.modifiers.push({ label: F("EarlyAid", { name: aid.name }), value: deviceData(aid).soundQuality! });
      }
      // A bullhorn or hailing device in hand: +1 to Intimidation close in front (HT:EE p. 32).
      const subject = context.subject;
      if (subject && /^intimidation\b/i.test(skill)) {
        const yards = yardsBetween(actor, subject);
        // The subject's arc from the speaker's facing where both are on the map: the bullhorn reaches less far to the side (HT:EE p. 32).
        const bearing = bearingFromFacing(actor, subject);
        for (const item of [...(actor.items ?? [])].filter((i: any) => worn(i))) {
          const amp = item.type === "equipment" ? amplifierOf(item.name, itemTl(item)) : null;
          const arc = amp && bearing !== null ? listenerArc(amp, bearing) : "front";
          if (amp && yards !== null && arc !== "outside" && intimidationBonus(amp, yards, arc)) {
            context.modifiers.push({ label: F("IntimidationBonus", { name: item.name }), value: 1 });
            break;
          }
        }
      }
    }
  });

  // A carbon microphone: HT 12 as an object, where the device conventions give 10 (HT:EE p. 31).
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    const item = context?.item;
    if (!on.fidelity() || !isMicrophone(kindOf(item)) || !deviceData(item).carbonMicrophone) return;
    context.ht = CARBON_HT;
    context.notes?.push?.(F("CarbonNote", { ht: CARBON_HT }));
  });

  // The cheaper microphone, a fifth of the price (HT:EE p. 31).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-inexpensive-microphone",
    types: ["equipment"],
    apply: (item, price) => (on.fidelity() && isPlainMicrophone(item) && deviceData(item).inexpensive
      ? { cost: Math.round(price.cost * INEXPENSIVE_PRICE * 100) / 100, weight: price.weight, label: L("InexpensivePrice") }
      : null),
  });

  // A better loudspeaker: twice the weight for each step of quality (HT:EE p. 31).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-loudspeaker-quality",
    types: ["equipment"],
    apply: (item, price) => {
      const factor = on.fidelity() && kindOf(item) === "speaker" ? speakerWeightFactor(String(item?.system?.equipmentQuality ?? "basic")) : 1;
      return factor > 1 ? { cost: price.cost, weight: price.weight * factor, label: L("SpeakerWeight") } : null;
    },
  });

  // A public address system's extra speakers: $20 and 3 lbs. each (HT:EE p. 32).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-pa-speakers",
    types: ["equipment"],
    apply: (item, price) => {
      const extra = on.amplification() && isPa(item) ? deviceData(item).extraSpeakers : 0;
      if (!extra) return null;
      const more = paSpeakers(extra);
      return { cost: price.cost + more.cost, weight: price.weight + more.weight, label: F("SpeakersPrice", { count: extra }) };
    },
  });

  // ...and its battery life shared among them (HT:EE p. 32).
  registerPowerAdjuster((item) => {
    const extra = on.amplification() && isPa(item) ? deviceData(item).extraSpeakers : 0;
    return extra ? { endurance: paSpeakers(extra).endurance } : null;
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-audio-listen",
    itemTypes: ["equipment"],
    label: L("ListenTitle"),
    icon: "fa-solid fa-headphones",
    visible: (item) => on.fidelity() && Boolean(kindOf(item)) && kindOf(item) !== "hearingAid" && kindOf(item) !== "amplifier",
    run: (item, actor) => { void listen(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-audio-hydrophone",
    itemTypes: ["equipment"],
    label: L("HydrophoneTitle"),
    icon: "fa-solid fa-water",
    visible: (item) => on.fidelity() && basicHydrophoneBonus(item?.name, itemTl(item)) !== null,
    run: (item, actor) => { void hydrophoneRoll(api, item, actor, { bonus: basicHydrophoneBonus(item.name, itemTl(item)) ?? 0, fix: false }); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-audio-record",
    itemTypes: ["equipment"],
    label: L("RecordAction"),
    icon: "fa-solid fa-record-vinyl",
    visible: (item) => on.fidelity() && kindOf(item) === "recorder",
    run: (item, actor) => { void record(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-audio-play",
    itemTypes: ["equipment"],
    label: L("PlayAction"),
    icon: "fa-solid fa-guitar",
    visible: (item) => on.amplification() && item?.type === "equipment" && /^guitar amplifier$/i.test(baseName(item.name)),
    run: (item, actor) => { void playThrough(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-audio-address",
    itemTypes: ["equipment"],
    label: L("AddressTitle"),
    icon: "fa-solid fa-bullhorn",
    visible: (item) => on.amplification() && item?.type === "equipment" && amplifierOf(item.name, itemTl(item)) !== null,
    run: (item, actor) => { void address(api, item, actor ?? picked().selected); },
  });
}
