/**
 * What High-Tech's explosive and cargo rounds do once fired (pp. 169-172),
 * registered with the system through the add-on API. The row each fires is
 * `index.ts`'s; the rules are `explosive.ts`'s.
 *
 *   - **Explosive rounds:** early SAPLE rolls 1d as it is fired and is a dud
 *     above TL-2; a thermobaric blast is divided by twice the distance
 *     (`gworld.explosionFalloff`).
 *   - **Cargo rounds:** a shot leaves its cloud or light where it lands, as a
 *     modifier area (the shared `areas.ts`): smoke by High-Tech's smoke table
 *     through the shared smoke engine; tear gas opaque at -3 a yard, its two
 *     HT-2 rolls (and a vomiting agent's) rolled for everyone standing in it;
 *     poison gas dosing its Basic Set filler; white phosphorus's smoke for its
 *     minute; a flare's light, which lifts the darkness penalty on an attack
 *     at somebody standing under it (the keyed `darkness` line). A scent
 *     marker's hit marks its victim for an hour: -4 to reactions to him, +4 to
 *     Smell rolls to find him within four yards.
 */

import { placeArea, type AreaLine } from "../../../shared/areas.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { smokeAreaLines, smokeFormSeconds } from "../../../shared/smoke/rules.js";
import { wearsIrritantMask } from "../breathing/index.js";
import {
  BLINDED_PENALTY,
  GASES,
  GAS_POISONS,
  HT_SMOKE_TABLE,
  SCENT_MARKER,
  THERMOBARIC_DIVISOR_PER_YARD,
  WP_SMOKE_SECONDS,
  gasEffect,
  gasReaches,
  gasesOf,
  illuminatedDarkness,
  sapleExplodes,
  sapleMayDud,
  tearGasVision,
  type Gas,
  type HighTechSmoke,
  type Illumination,
  type Liquid,
} from "./explosive.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Ammunition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ammunition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** An actor marked by a scent round: the world time the mark wears off. */
const SCENT_FLAG = "htScentMarker";

/** What a mode fires, as the cargo rules need it. */
export interface CargoLoad {
  projectile: string;
  smoke: HighTechSmoke;
  illumination: Illumination;
  vomiting: boolean;
  liquid: Liquid;
  poisonFiller: string;
  radius: number;
  seconds: number;
  tl: number;
}

export interface CargoSwitches {
  explosive: () => boolean;
  cargo: () => boolean;
  /** Whether the gases' rolls are run: for cargo rounds, and for a tear-gas grenade's cloud (p. 192). */
  gas?: () => boolean;
}

/** The cargo rounds that leave something on the map. */
const AREA_CARGO: readonly string[] = ["smoke", "tearGas", "poisonGas", "whitePhosphorus", "illumination"];

const worldNow = (): number => Number((game as any).time?.worldTime) || 0;

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

/** Asks for the cloud's or light's radius and time where the load leaves them to be asked. */
async function askArea(load: CargoLoad, fixedSeconds: number | null): Promise<{ radius: number; seconds: number } | null> {
  if (load.radius > 0 && (fixedSeconds !== null || load.seconds > 0)) return { radius: load.radius, seconds: fixedSeconds ?? load.seconds };
  const field = (name: string, label: string, value: number) =>
    `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span><input type="number" name="${name}" value="${value}" min="1" style="width:80px" /></label>`;
  return (foundry.applications.api as any).DialogV2.prompt({
    window: { title: L(`Projectile.${load.projectile}`) },
    content: `<div class="gworld" style="display:grid;gap:6px"><p class="ihint">${esc(L("AreaAsk"))}</p>${field("radius", L("AreaRadius"), load.radius || 5)}${fixedSeconds === null ? field("seconds", L("AreaSeconds"), load.seconds || 60) : ""}</div>`,
    ok: {
      label: L("AreaPlace"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const get = (name: string) => Number(form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value) || 0;
        return { radius: Math.max(1, get("radius")), seconds: fixedSeconds ?? Math.max(1, Math.floor(get("seconds"))) };
      },
    },
    rejectClose: false,
  });
}

/** The lines a cargo round's cloud puts on rolls in and through it. */
function areaLines(load: CargoLoad, radius: number): AreaLine[] {
  const smokeLines = (kind: HighTechSmoke): AreaLine[] => {
    const figures = HT_SMOKE_TABLE[kind];
    const lines = smokeAreaLines(figures, { vision: (value) => F("Cloud.Vision", { value }), sensors: L("Cloud.Sensors") });
    // Electromagnetic smoke also affects Radar and Imaging Radar (p. 171).
    if (figures.blocks.includes("radar")) lines.push({ label: L("Cloud.Radar"), value: figures.vision, rolls: ["radar", "imagingRadar"], applies: "both" });
    return lines;
  };
  switch (load.projectile) {
    case "smoke":
      return smokeLines(load.smoke);
    case "whitePhosphorus":
      return smokeLines("screening");
    case "tearGas": {
      // -3 a yard of gas, at worst -10: a sight across the cloud takes the radius's worth.
      const value = tearGasVision(radius);
      return [{ label: F("Cloud.TearGas", { value }), value, rolls: ["vision", "attack"], applies: "both" }];
    }
    default:
      return [];
  }
}

/** The key an area of this cargo is placed under, to be found again. */
const areaKey = (load: CargoLoad): string => (load.projectile === "illumination" ? `ht-illumination-${load.illumination}` : `ht-cloud-${load.projectile}`);

/** Who stands in an area: the actors of the tokens there (GWorld API 1.89.0). */
function actorsIn(api: GWorldApi, id: string): any[] {
  const scene = (globalThis as any).canvas?.scene;
  if (!scene) return [];
  const tokens: any[] = (api.areas as any).standsIn?.(scene, id) ?? [];
  return tokens.map((t) => t?.actor).filter(Boolean);
}

/** The seconds of cloud each actor was left in when last dosed from one, for how long the effect lasts. */
const cloudLeft = new Map<string, number>();

/** Whether a body keeps a gas out (Campaigns pp. 82, 429). */
function victimOf(api: GWorldApi, actor: any): { sealed: boolean; doesntBreathe: boolean; filterLungs: boolean; irritantImmune: boolean } {
  const effects = (api.actors.derived(actor) as any)?.traitEffects ?? {};
  return { sealed: effects.sealed === true, doesntBreathe: effects.doesntBreathe === true, filterLungs: effects.filterLungs === true, irritantImmune: wearsIrritantMask(actor) };
}

/** Rolls the gases of a cloud for everyone standing in it (p. 171). */
async function exposeToGas(api: GWorldApi, victims: any[], gases: Gas[], seconds: number): Promise<string[]> {
  const lines: string[] = [];
  for (const actor of victims) {
    for (const gas of gases) {
      if (!gasReaches(gas, victimOf(api, actor))) {
        lines.push(F("GasKeptOut", { name: actor.name, gas: L(`Gas.${gas}`) }));
        continue;
      }
      cloudLeft.set(String(actor.id), seconds);
      const dose: any = await api.actors.dosePoison(actor, { ...GAS_POISONS[gas], name: L(`Gas.${gas}`), source: `${MODULE_ID}.${gas}` } as any);
      if (dose) await api.actors.advancePoison(actor, dose.id);
      else lines.push(F("GasNoDose", { name: actor.name }));
    }
  }
  return lines;
}

/** Doses everyone in a poison-gas burst with its Basic Set filler (p. 172; Campaigns p. 439). */
async function exposeToPoison(api: GWorldApi, victims: any[], filler: string): Promise<string[]> {
  const poison: any = (api.rules as any).poisonNamed?.(filler) ?? null;
  if (!poison) return [L("NoFillerChosen")];
  const lines: string[] = [];
  for (const actor of victims) {
    const dose: any = await api.actors.dosePoison(actor, { ...poison, source: `${MODULE_ID}.poisonGas` });
    if (!dose) lines.push(F("GasNoDose", { name: actor.name }));
    else if (!dose.delaySeconds) await api.actors.advancePoison(actor, dose.id);
    else lines.push(F("PoisonDelayed", { name: actor.name, seconds: dose.delaySeconds }));
  }
  return lines;
}

/**
 * A tear-gas cloud released where the actor's attack landed -- a thrown M7
 * grenade's (p. 192) -- rolled for everyone in it as a tear-gas round's is
 * (p. 171). The card's lines, or null where there is nowhere to put it.
 */
export async function releaseTearGas(api: GWorldApi, actor: any, title: string, radius: number, seconds: number): Promise<string[] | null> {
  const load = { projectile: "tearGas" } as CargoLoad;
  const id = await placeArea(api, { key: areaKey(load), label: title, actor, radiusYards: radius, seconds, lines: areaLines(load, radius), bare: true });
  if (!id) return null;
  return [
    F("CloudPlaced", { radius, seconds }),
    F("CloudForms", { seconds: smokeFormSeconds(radius) }),
    ...(await exposeToGas(api, actorsIn(api, id), gasesOf(false), seconds)),
  ];
}

/** Leaves a fired cargo round's cloud or light where it lands, and doses those in a gas (pp. 171-172). */
async function releaseCargo(api: GWorldApi, actor: any, load: CargoLoad): Promise<void> {
  const title = L(`Projectile.${load.projectile}`);
  const fixed = load.projectile === "whitePhosphorus" ? WP_SMOKE_SECONDS : null;
  const asked = await askArea(load, fixed);
  if (!asked) return;
  const lines = areaLines(load, asked.radius);
  const id = await placeArea(api, { key: areaKey(load), label: title, actor, radiusYards: asked.radius, seconds: asked.seconds, lines, bare: true });
  if (!id) return void ui.notifications?.warn(L("AreaNoPlace"));
  const said = [F(load.projectile === "illumination" ? "LightPlaced" : "CloudPlaced", { radius: asked.radius, seconds: asked.seconds })];
  if (load.projectile !== "illumination") said.push(F("CloudForms", { seconds: smokeFormSeconds(asked.radius) }));
  if (load.projectile === "smoke" && HT_SMOKE_TABLE[load.smoke].blocks.includes("lasers")) said.push(L("PrismLasers"));
  if (load.projectile === "tearGas") said.push(...(await exposeToGas(api, actorsIn(api, id), gasesOf(load.vomiting), asked.seconds)));
  if (load.projectile === "poisonGas") said.push(...(await exposeToPoison(api, actorsIn(api, id), load.poisonFiller)));
  await say(actor, title, said);
}

/** Whether a character sees by infrared: an infrared flare lights only for them (p. 171). */
function seesInfrared(actor: any): boolean {
  return [...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && /^(infravision|night vision|hyperspectral vision)\b/i.test(String(i.name ?? "")));
}

/** The flares whose light a token stands in: the kinds of the unexpired illumination areas round it. */
function flaresOver(api: GWorldApi, tokenId: string): Illumination[] {
  const scene = (globalThis as any).canvas?.scene;
  if (!scene || !tokenId) return [];
  const now = worldNow();
  const prefix = `${MODULE_ID}-ht-illumination-`;
  const kinds: Illumination[] = [];
  for (const area of api.areas.list(scene) as any[]) {
    const id = String(area?.id ?? "");
    if (!id.startsWith(prefix) || (typeof area.expires === "number" && now >= area.expires)) continue;
    const inside: any[] = (api.areas as any).standsIn?.(scene, area) ?? [];
    if (inside.some((t) => t?.id === tokenId)) kinds.push(id.slice(prefix.length).split("-")[0] as Illumination);
  }
  return kinds;
}

/** Whether a character still carries a scent marker's mark. */
const scented = (actor: any): boolean => Number(actor?.getFlag?.(MODULE_ID, SCENT_FLAG)) > worldNow();

export function readyCargo(api: GWorldApi, on: CargoSwitches, loadOf: (item: any, modeIndex: number) => CargoLoad | null): void {
  const gasOn = () => on.cargo() || on.gas?.() === true;
  // Tear gas's two rolls and the vomiting agent's, as poisons the system doses (p. 171).
  for (const gas of GASES) {
    api.data.registerPoison({ module: MODULE_ID, key: gas, label: `GCC.HT.Ammunition.Gas.${gas}`, poison: GAS_POISONS[gas] as any, available: gasOn });
  }

  // As the round is fired: early SAPLE's dud roll (p. 169), and a cargo round's cloud or light (pp. 171-172).
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!item || !(on.explosive() || on.cargo())) return;
    const load = loadOf(item, Number(context.modeIndex) || 0);
    if (!load) return;
    if (on.explosive() && load.projectile === "saple" && sapleMayDud(load.tl) && item.isOwner) {
      void (async () => {
        const roll = new Roll("1d6");
        await roll.evaluate();
        const bursts = sapleExplodes(load.tl, Number(roll.total));
        await say(context.actor, String(item.name ?? ""), [F(bursts ? "SapleBursts" : "SapleDud", { roll: roll.total, need: load.tl - 2 })], [roll]);
      })();
    }
    if (on.cargo() && AREA_CARGO.includes(load.projectile)) void releaseCargo(api, context.actor, load);
  });

  // A gas's failed roll: coughing, blindness or retching, for the cloud's time and the margin's minutes (p. 171).
  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    const source = String(context?.source ?? "");
    if (!gasOn() || !source.startsWith(`${MODULE_ID}.`) || context.resisted !== false) return;
    const gas = source.slice(MODULE_ID.length + 1) as Gas;
    if (!(GASES as readonly string[]).includes(gas)) return;
    const actor = context.actor;
    if (!actor?.isOwner) return;
    const effect = gasEffect(gas, Number(context.margin) || 0, cloudLeft.get(String(actor.id)) ?? 0);
    if (effect.condition === "blinded") {
      void api.actors.applyCondition(actor, {
        module: MODULE_ID, key: "htTearGasBlinded", label: L("Blinded"),
        effects: { modifiers: [{ label: L("Blinded"), value: BLINDED_PENALTY, rolls: ["vision", "attack"] }] },
        duration: { seconds: effect.seconds },
      } as any);
    } else void api.actors.applyCondition(actor, { key: effect.condition, duration: { seconds: effect.seconds } });
    void say(actor, L(`Gas.${gas}`), [F("GasFailed", { name: actor.name, what: L(`GasEffect.${effect.condition}`), minutes: Math.ceil(effect.seconds / 60) })]);
  });

  // A thermobaric blast is divided by twice the distance, not three times (p. 170).
  Hooks.on(api.combat.hooks.explosionFalloff, (context: any) => {
    if (!on.explosive() || !context?.itemUuid) return;
    const item: any = fromUuidSync(String(context.itemUuid));
    const load = item ? loadOf(item, Number(context.flag?.mode?.index) || 0) : null;
    if (load?.projectile === "thermobaric") context.divisorPerYard = THERMOBARIC_DIVISOR_PER_YARD;
  });

  // Under a flare the darkness penalty is no worse than -3, or -5 under a signal flare (p. 171).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.cargo()) return;
    const line = (context?.modifiers ?? []).find((m: any) => m?.key === "darkness");
    const target = context?.targetTokens?.[0];
    if (!line || !target) return;
    const kinds = flaresOver(api, String(target.id ?? "")).filter((k) => k !== "infrared" || seesInfrared(context.actor));
    if (!kinds.length) return;
    const best = Math.max(...kinds.map((k) => illuminatedDarkness(Number(line.value) || 0, k)));
    if (best > (Number(line.value) || 0)) {
      line.value = best;
      line.label = `${line.label} (${L("UnderFlare")})`;
    }
  });

  // A scent marker's hit: the victim reeks for an hour (p. 172).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on.cargo() || !context?.item || !context.actor?.isOwner || !context.mode?.ranged) return;
    const load = loadOf(context.item, Number(context.mode.index) || 0);
    if (load?.projectile !== "liquid" || load.liquid !== "scent") return;
    void context.actor.setFlag(MODULE_ID, SCENT_FLAG, worldNow() + SCENT_MARKER.seconds);
    void say(context.actor, L("Liquid.scent"), [F("ScentMarked", { name: context.actor.name })]);
  });
  Hooks.on(api.combat.hooks.reactionModifiers, (context: any) => {
    if (on.cargo() && scented(context?.actor)) context.modifiers.push({ label: L("Liquid.scent"), value: SCENT_MARKER.reaction });
  });
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    if (!on.cargo() || context?.sense !== "tasteSmell" || !scented(context.subject)) return;
    const a = context.observer?.getActiveTokens?.()?.[0]?.center;
    const b = context.subject?.getActiveTokens?.()?.[0]?.center;
    const scene = (globalThis as any).canvas?.scene;
    if (a && b && scene) {
      const perYard = (Number(scene.grid?.size) || 100) / (Number(scene.grid?.distance) || 1);
      if (Math.hypot(a.x - b.x, a.y - b.y) / perYard > SCENT_MARKER.yards) return;
    }
    context.modifiers.push({ label: L("Liquid.scent"), value: SCENT_MARKER.smell });
  });
}
