/**
 * GURPS Ultra-Tech's vehicle systems and matter transmission, registered with
 * the system through the add-on API (pp. 104, 222-235).
 *
 *   - **Vehicle systems:** a GM tool for crashwebs, life support, slidewalks
 *     and a life pod's or drop capsule's landing; row actions for a zero-G
 *     thruster's bursts and strapping on a flight or thruster pack; item lines
 *     for the flight packs, the nuclear jetpack and the capsules.
 *   - **Matter transmission:** MT booths priced by range and projectors by
 *     platforms and send-only; a minigate's Defense Bonus 4 and the blow it
 *     passes through the gate; a GM tool for a teleport projector's roll and
 *     an MT interceptor's contest.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  BOOTH_RANGES,
  BOOTH_RANGE_MILES,
  CAPSULE_NAVIGATION,
  CRASHWEB_ESCAPE,
  MINIGATE_DB,
  NUCLEAR_JETPACK,
  STEALTH_CAPSULE,
  STRAP_ON,
  THRUSTERS,
  crashwebDr,
  interceptorOpponent,
  landingRadius,
  lifeSupportDays,
  projectorModifier,
  projectorPrice,
  slidewalkModifier,
  slidewalkSpeed,
  throughTheGate,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Transport.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Transport.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "transport";
const TIERS = Object.keys(BOOTH_RANGES);

export interface TransportSwitches {
  vehicles: () => boolean;
  matterTransmission: () => boolean;
}

export function initTransport(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      rangeTier: new f.StringField({ required: true, nullable: false, blank: false, initial: "standard", choices: TIERS }),
      platforms: new f.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
      sendOnly: new f.BooleanField({ initial: false }),
      burstsUsed: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    }),
  });
}

const data = (item: any) => {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return { rangeTier: TIERS.includes(d.rangeTier) ? String(d.rangeTier) : "standard", platforms: Math.max(1, Math.floor(Number(d.platforms) || 1)), sendOnly: Boolean(d.sendOnly), burstsUsed: Math.max(0, Math.floor(Number(d.burstsUsed) || 0)) };
};
const store = (item: any, patch: Record<string, unknown>) => item.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`system.extensions.${MODULE_ID}.${FIELD}.${k}`, v])));
const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const isBooth = (name: string) => /Matter Transmission Booths?$/i.test(name);
const isProjector = (name: string) => /^Teleport Projectors?$/i.test(name);
const isFlightPack = (name: string) => /^(Helipack|Contragravity Belt|Nuclear Jetpack|Grav Cloak)$/i.test(name);
const picked = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  targets: [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean),
});

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}
async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const select = (name: string, options: Array<[string, string]>) => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
const num = (name: string, value: number) => `<input type="number" name="${name}" value="${value}" step="any" style="width:90px" />`;
const val = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

// ── vehicle systems ──

async function vehicleTool(api: GWorldApi): Promise<void> {
  const { selected, targets } = picked();
  const answer = await ask(L("Tool.Title"),
    row(L("Tool.Kind"), select("kind", [["crashweb", L("Tool.crashweb")], ["free", L("Tool.free")], ["lifeSupport", L("Tool.lifeSupport")], ["slidewalk", L("Tool.slidewalk")], ["landing", L("Tool.landing")]]))
    + row(L("Tool.Tl"), num("tl", 10)) + row(L("Tool.ManDays"), num("manDays", 90)) + row(L("Tool.Occupants"), num("occupants", 4))
    + row(L("Tool.Belt"), num("belt", 20)) + row(L("Tool.Against"), `<input type="checkbox" name="against" />`),
    (form) => ({ kind: val(form, "kind")?.value ?? "crashweb", tl: Number(val(form, "tl")?.value) || 10, manDays: Number(val(form, "manDays")?.value) || 0, occupants: Number(val(form, "occupants")?.value) || 1, belt: Number(val(form, "belt")?.value) || 0, against: Boolean(val(form, "against")?.checked) }));
  if (!answer) return;
  if (answer.kind === "lifeSupport") return void say(null, L("Tool.lifeSupport"), [F("Tool.Days", { days: Math.round(lifeSupportDays(answer.manDays, answer.occupants) * 10) / 10, manDays: answer.manDays, occupants: answer.occupants })]);
  if (answer.kind === "landing") {
    if (!selected) return void ui.notifications?.warn(L("Tool.PickLander"));
    const own = api.actors.skillLevel(selected, "Navigation (Space)");
    const base = Math.max(CAPSULE_NAVIGATION, own ?? 0);
    const result: any = await api.roll.success({ actor: selected, base, skill: "Navigation (Space)", label: L("Tool.LandingLabel") } as any);
    if (!result) return;
    const dice = new Roll("5d6");
    await dice.evaluate();
    const landing = landingRadius(result, Number(dice.total) || 0);
    return void say(selected, L("Tool.landing"), [F(`Tool.Landed.${landing.outcome}`, { miles: landing.miles ?? 0 })]);
  }
  if (!targets.length) return void ui.notifications?.warn(L("Tool.Target"));
  for (const victim of targets) {
    if (answer.kind === "crashweb") {
      await api.actors.applyCondition(victim, { module: MODULE_ID, key: "ut-crashweb", label: F("Tool.Webbed", { dr: crashwebDr(answer.tl) }) } as any);
      await say(victim, L("Tool.crashweb"), [F("Tool.WebbedLine", { name: victim.name, dr: crashwebDr(answer.tl) })]);
    } else if (answer.kind === "free") {
      const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: L("Tool.FreeLabel"), modifiers: [{ label: L("Tool.crashweb"), value: CRASHWEB_ESCAPE }] } as any);
      if (result?.success) {
        for (const c of api.actors.conditions(victim).filter((c) => c.id.includes("ut-crashweb"))) await api.actors.removeCondition(victim, c.id);
      }
    } else if (answer.kind === "slidewalk") {
      const move = Number(api.actors.derived(victim)?.basicMove) || 5;
      await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: F("Tool.SlidewalkLabel", { mph: slidewalkSpeed(answer.belt, move, answer.against) }), modifiers: [{ label: L("Tool.slidewalk"), value: slidewalkModifier(answer.belt, answer.against) }] } as any);
    }
  }
}

async function thrusterBurst(api: GWorldApi, item: any, actor: any): Promise<void> {
  const thruster = THRUSTERS[String(item.name)];
  if (!thruster) return;
  const used = data(item).burstsUsed;
  if (used >= thruster.bursts) return void ui.notifications?.warn(L("Thruster.Empty"));
  const levels = thruster.skills.map((s) => api.actors.skillLevel(actor, s)).filter((l): l is number => l !== null);
  const base = levels.length ? Math.max(...levels) : (api.actors.attribute(actor, "DX") ?? 10) - 4;
  const result: any = await api.roll.success({ actor, base, skill: thruster.skills[0], label: F("Thruster.Label", { name: item.name }) } as any);
  if (!result) return;
  await store(item, { burstsUsed: used + 1 });
  await say(actor, String(item.name), [F(result.success ? "Thruster.Aimed" : "Thruster.Off", { left: thruster.bursts - used - 1 })]);
}

async function strapOn(api: GWorldApi, item: any, actor: any): Promise<void> {
  const name = String(item.name);
  if (/^Thruster Pack$/i.test(name)) {
    const base = api.actors.skillLevel(actor, "Vacc Suit") ?? (api.actors.attribute(actor, "DX") ?? 10) - 5;
    const result: any = await api.roll.success({ actor, base, skill: "Vacc Suit", label: F("Strap.Label", { name }) } as any);
    if (!result) return;
    if (result.success) await item.update({ "system.equipped": true });
    return void say(actor, name, [F(result.success ? "Strap.Done" : "Strap.Retry", { seconds: STRAP_ON.thrusterPack, retry: STRAP_ON.retry })]);
  }
  await item.update({ "system.equipped": !item.system?.equipped });
  await say(actor, name, [F(item.system?.equipped ? "Strap.On" : "Strap.Off", { seconds: STRAP_ON.flightPack })]);
}

// ── matter transmission ──

async function mtTool(api: GWorldApi): Promise<void> {
  const { selected, targets } = picked();
  if (!selected) return void ui.notifications?.warn(L("Mt.Pick"));
  const answer = await ask(L("Mt.Title"),
    row(L("Mt.Kind"), select("kind", [["projector", L("Mt.projector")], ["interceptor", L("Mt.interceptor")]]))
    + row(L("Mt.Miles"), num("miles", 100)) + row(L("Mt.Cooperating"), `<input type="checkbox" name="coop" />`) + row(L("Mt.SystemTl"), num("tl", 12)),
    (form) => ({ kind: val(form, "kind")?.value ?? "projector", miles: Number(val(form, "miles")?.value) || 0, coop: Boolean(val(form, "coop")?.checked), tl: Number(val(form, "tl")?.value) || 12 }));
  if (!answer) return;
  const skill = "Electronics Operation (Matter Transmitters)";
  const level = api.actors.skillLevel(selected, skill) ?? api.actors.skillLevel(selected, "Electronics Operation (Matter Transmission)") ?? (api.actors.attribute(selected, "IQ") ?? 10) - 5;
  if (answer.kind === "projector") {
    const modifier = projectorModifier(answer.miles, answer.coop);
    if (modifier === null) return void say(selected, L("Mt.projector"), [L("Mt.OutOfRange")]);
    const result: any = await api.roll.success({ actor: selected, base: level, skill, label: F("Mt.ProjectorLabel", { miles: answer.miles }), modifiers: modifier ? [{ label: L("Mt.Distance"), value: modifier }] : [] } as any);
    if (result) await say(selected, L("Mt.projector"), [L(result.success ? "Mt.Arrived" : result.criticalFailure ? "Mt.Disaster" : "Mt.NearMiss"), L("Mt.Beacons")]);
    return;
  }
  const other = targets[0] ?? null;
  const otherSkill = other ? api.actors.skillLevel(other, skill) : null;
  const outcome: any = await api.roll.quickContest({
    label: L("Mt.InterceptorLabel"),
    first: { actor: selected, base: level },
    second: { actor: other ?? selected, base: interceptorOpponent(otherSkill, answer.tl), note: other ? String(other.name) : F("Mt.SystemTlNote", { tl: answer.tl }) },
    tags: ["ut-mt-interceptor"],
  });
  await say(selected, L("Mt.interceptor"), [L(outcome?.outcome === "first" ? "Mt.Diverted" : "Mt.Escaped")]);
}

function itemLines(item: any, on: TransportSwitches): string[] {
  const name = String(item?.name ?? "");
  const lines: string[] = [];
  if (on.vehicles()) {
    if (isFlightPack(name)) lines.push(F("Item.FlightPack", { seconds: STRAP_ON.flightPack }));
    if (/^Nuclear Jetpack$/i.test(name)) lines.push(F("Item.Jetpack", { wash: NUCLEAR_JETPACK.wash, spotted: NUCLEAR_JETPACK.spotted }));
    if (THRUSTERS[name]) lines.push(F("Item.Thruster", { bursts: THRUSTERS[name]!.bursts, used: data(item).burstsUsed }));
    if (/^(Life Pod|Drop Capsule|Stealth Capsule)$/i.test(name)) lines.push(F("Item.Capsule", { skill: CAPSULE_NAVIGATION }));
    if (/^Stealth Capsule$/i.test(name)) lines.push(F("Item.StealthCapsule", { modifier: STEALTH_CAPSULE }));
  }
  if (on.matterTransmission()) {
    if (isBooth(name)) lines.push(F("Item.Booth", { miles: BOOTH_RANGE_MILES, tier: L(`Tier.${data(item).rangeTier}`) }));
    if (isProjector(name)) lines.push(L("Item.Projector"));
    if (/^Minigates?$/i.test(name)) lines.push(F("Item.Minigate", { db: MINIGATE_DB }));
  }
  return lines;
}

function itemContext(item: any, on: TransportSwitches): Record<string, unknown> {
  const name = String(item?.name ?? "");
  const d = data(item);
  return {
    lines: itemLines(item, on),
    booth: on.matterTransmission() && isBooth(name),
    projector: on.matterTransmission() && isProjector(name),
    tiers: TIERS.map((value) => ({ value, label: L(`Tier.${value}`), selected: value === d.rangeTier })),
    data: d,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-transport]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtTransport);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : field === "platforms" ? Math.max(1, Math.floor(Number(input.value) || 1)) : input.value;
      void store(item, { [field]: value });
    });
  });
}

const minigateOf = (actor: any) => [...(actor?.items ?? [])].find((i: any) => isGear(i) && i.system?.equipped === true && /^Minigates?$/i.test(String(i.name)));

export function readyTransport(api: GWorldApi, on: TransportSwitches): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-transport",
    types: ["equipment"],
    apply: (item) => {
      if (!on.matterTransmission()) return null;
      const name = String(item?.name ?? "");
      const d = data(item);
      if (isBooth(name) && d.rangeTier !== "standard") {
        const factor = BOOTH_RANGES[d.rangeTier] ?? 1;
        return { cost: (Number(item.system?.listCost) || Number(item.system?.cost) || 0) * factor, weight: (Number(item.system?.weight) || 0) * factor, label: L("Title") };
      }
      if (isProjector(name) && (d.platforms > 1 || d.sendOnly)) {
        const price = projectorPrice(d.platforms, d.sendOnly);
        return { cost: price.cost, weight: price.weight, label: L("Title") };
      }
      return null;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-transport-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-transport-item.hbs`,
    visible: (item) => isGear(item) && itemLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-vehicle-systems", label: L("Tool.Title"), icon: "fa-solid fa-shuttle-space", visible: on.vehicles, open: () => vehicleTool(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-matter-transmission", label: L("Mt.Title"), icon: "fa-solid fa-person-through-window", visible: on.matterTransmission, open: () => mtTool(api) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-thruster-burst", itemTypes: ["equipment"], label: L("Thruster.Title"), icon: "fa-solid fa-wind", visible: (item) => on.vehicles() && Boolean(THRUSTERS[String(item?.name)]), run: (item, actor) => thrusterBurst(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-strap-on", itemTypes: ["equipment"], label: L("Strap.Title"), icon: "fa-solid fa-person-rays", visible: (item) => on.vehicles() && (isFlightPack(String(item?.name)) || /^Thruster Pack$/i.test(String(item?.name))), run: (item, actor) => strapOn(api, item, actor) });

  // A minigate is a shield of DB 4 (p. 234).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!on.matterTransmission()) return;
    const gate = minigateOf(context?.defender);
    if (gate) context.modifiers.push({ label: F("MinigateLine", { name: gate.name }), value: MINIGATE_DB });
  });

  // A blow the gate's DB stopped, or one blocked with it, goes through the gate (p. 234).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on.matterTransmission()) return;
    const tags = (context?.tags ?? []) as string[];
    if (!tags.some((t) => t === "dodge" || t === "parry" || t === "block")) return;
    const gate = minigateOf(context.actor);
    if (!gate || !context.outcome) return;
    if (throughTheGate(context.outcome, tags.includes("block"))) void say(context.actor, String(gate.name), [L("ThroughTheGate")]);
  });
}
