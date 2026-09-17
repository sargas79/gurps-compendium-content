/**
 * GURPS Ultra-Tech's warheads and ammunition, registered with the system
 * through the add-on API (pp. 152-159), after Monster Hunters 1's special
 * ammunition: a load on each ranged mode, never an item of its own.
 *
 *   - **init:** the warhead loaded in each ranged mode, and its variant.
 *   - **ready:** the row each warhead fires, through `gworld.weaponAttacks`;
 *     an item section to choose them, with the round's cost multiple and LC;
 *     the EMP, strobe, warbler and psi-bomb effects on a failed roll; and
 *     proximity detonation as an attack option.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { beamEnvironment } from "../beams/index.js";
import { WARHEADS, WARHEAD_KINDS, sizeClass, type WarheadKind } from "./catalogue.js";
import { placeArea } from "../areas.js";
import { PSI_STUN_RECOVERY, WARBLER_SECONDS, warblerRings, blastDivisorPerYard, fadingBonus, loadable, refusal, warheadRow, type Launcher, type WarheadRow } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Warheads.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Warheads.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "utLoads";
const PROXIMITY_OPTION = "ut-proximity";
const PSI_STUN_FLAG = "utPsiStun";

/** A mode's load. */
export interface WarheadLoad {
  mode: number;
  kind: WarheadKind | "";
  variant: string;
}

export function initWarheads(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.ArrayField(
      new f.SchemaField({
        mode: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...WARHEAD_KINDS] }),
        variant: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      }),
      { required: true, initial: [] },
    ),
  });
}

/** The grenade or mine's own warhead, as the records give it. */
function recordWarhead(item: any): { sizeMm: number | null; kind: WarheadKind | "" } | null {
  const w = item?.system?.extensions?.[MODULE_ID]?.warhead;
  if (!w || !w.size) return null;
  const size = Number(String(w.size).replace(/mm$/i, ""));
  const kind = String(w.type ?? "").toLowerCase() as WarheadKind;
  return { sizeMm: Number.isFinite(size) ? size : null, kind: WARHEAD_KINDS.includes(kind) ? kind : "" };
}

/** The weapon a mode loads warheads into. */
export function launcherOf(api: GWorldApi, item: any, modeIndex: number): Launcher {
  const name = String(item?.name ?? "");
  const mode = item?.system?.rangedModes?.[modeIndex] ?? {};
  const record = recordWarhead(item);
  const tl = Number(/-?\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
  return {
    calibreMm: record ? record.sizeMm : (api.rules.calibreOf(name) ?? null),
    tl,
    grenade: Boolean(record),
    electromagnetic: /\b(gauss|railgun|emgl)\b/i.test(name),
    railgun: /\brailgun\b/i.test(name),
    shotgun: /shotgun|grenade launcher|gyroc/i.test(`${name} ${mode.skill ?? ""}`),
    homing: /\b(homing|guided|missile)\b/i.test(name),
  };
}

/** The loads on an item, with a grenade's own warhead where none is chosen. */
export function loadsOf(item: any): WarheadLoad[] {
  const stored: any[] = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? [];
  const loads: WarheadLoad[] = stored.map((l) => ({ mode: Math.max(0, Math.floor(Number(l.mode) || 0)), kind: WARHEAD_KINDS.includes(l.kind) ? l.kind : "", variant: String(l.variant ?? "") }));
  const record = recordWarhead(item);
  if (record?.kind && !loads.some((l) => l.mode === 0)) loads.push({ mode: 0, kind: record.kind, variant: "" });
  return loads;
}

function loadFor(item: any, mode: number): WarheadLoad | null {
  return loadsOf(item).find((l) => l.mode === mode && l.kind) ?? null;
}

function isRanged(item: any): boolean {
  return item?.type === "equipment" && (item.system?.rangedModes ?? []).length > 0;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

function traitNames(actor: any): string[] {
  return [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
}

function itemContext(api: GWorldApi, item: any): Record<string, unknown> {
  const modes = ((item.system?.rangedModes ?? []) as any[]).map((m, index) => {
    const launcher = launcherOf(api, item, index);
    const load = loadFor(item, index);
    const kinds = loadable(launcher);
    const w = load?.kind ? WARHEADS[load.kind] : null;
    return {
      index,
      name: String(m.name ?? ""),
      options: [{ value: "", label: L(launcher.grenade ? "Kind.none" : "Kind.plain"), selected: !load }, ...kinds.map((kind) => ({ value: kind, label: L(`Kind.${kind}`), selected: load?.kind === kind }))],
      variants: w?.variants?.map((v) => ({ value: v, label: L(`Variant.${v}`), selected: (load?.variant || w.variants![0]) === v })) ?? [],
      detail: w ? F("Detail", { cost: w.cost === null ? L("NoCost") : `×${w.cost}`, lc: w.lc === null ? L("LcFiller") : `LC${w.lc}`, tl: `${w.tl}${w.superscience ? "^" : ""}` }) : "",
      ammunition: Boolean(m.ammunition),
      calibre: launcher.calibreMm === null ? L("NoCalibre") : F("Calibre", { mm: launcher.calibreMm }),
    };
  });
  return { modes };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const store = (loads: WarheadLoad[]) => item.update({ [`system.extensions.${MODULE_ID}.${FIELD}`]: loads.filter((l) => l.kind).sort((a, b) => a.mode - b.mode) });
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-ut-warhead]").forEach((select) => {
    select.addEventListener("change", async () => {
      const mode = Number(select.dataset.mode) || 0;
      const field = String(select.dataset.gccUtWarhead);
      const current = loadFor(item, mode) ?? { mode, kind: "" as const, variant: "" };
      const next: WarheadLoad = field === "variant" ? { ...current, variant: select.value } : { mode, kind: select.value as WarheadKind | "", variant: "" };
      if (next.kind) {
        const why = refusal(next.kind, launcherOf(api, item, mode));
        if (why) {
          ui.notifications?.warn(L(`Refusal.${why}`));
          return;
        }
      }
      // Loading anything other than the record's warhead is kept; clearing it on a grenade goes back to that.
      const others = loadsOf(item).filter((l) => l.mode !== mode);
      await store(next.kind ? [...others, next] : others);
    });
  });
}

export function readyWarheads(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-warheads-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-warheads.hbs`,
    visible: (item) => on() && isRanged(item) && ((item.system?.rangedModes ?? []) as any[]).some((_m: any, i: number) => loadable(launcherOf(api, item, i)).length > 0),
    context: (item) => itemContext(api, item),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  // Each mode fires the warhead it's loaded with (pp. 152-159).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !isRanged(context?.item)) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const index = (context.item.system?.rangedModes ?? []).indexOf(entry.mode);
      if (index < 0) continue;
      const load = loadFor(context.item, index);
      if (!load?.kind) continue;
      const row = entry.row;
      // A Basic Set round already loaded stands; the two don't stack.
      if (entry.mode?.ammunition) {
        row.notes.push({ label: L("Ammunition"), hint: L("AmmunitionHint") });
        continue;
      }
      const launcher = launcherOf(api, context.item, index);
      if (refusal(load.kind, launcher)) continue;
      const before: WarheadRow = {
        damage: String(row.damage ?? ""), damageType: String(row.damageType ?? ""), armorDivisor: Number(row.armorDivisor) || 1,
        halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0, projectiles: Number(row.projectiles) || 1, skillBonus: 0,
        explosive: row.explosive === true, incendiary: row.incendiary === true, doubleKnockback: row.doubleKnockback === true, radiation: row.radiation === true, surge: row.surge === true,
        fragmentation: String(row.fragmentation ?? ""), affliction: row.affliction === true, afflictionAttribute: String(row.afflictionAttribute ?? ""),
        afflictionModifier: Number(row.afflictionModifier) || 0, followUp: row.followUp ?? null, notes: [],
      };
      const after = warheadRow(load.kind, before, launcher, { variant: load.variant, atmospheres: beamEnvironment().atmospheres });
      Object.assign(row, {
        damage: after.damage, damageType: after.damageType, armorDivisor: after.armorDivisor,
        halfDamageRange: after.halfDamageRange, maxRange: after.maxRange, projectiles: after.projectiles,
        explosive: after.explosive, incendiary: after.incendiary, doubleKnockback: after.doubleKnockback, radiation: after.radiation, surge: after.surge === true,
        fragmentation: after.fragmentation, affliction: after.affliction, afflictionAttribute: after.afflictionAttribute,
        afflictionModifier: after.afflictionModifier, followUp: after.followUp ? { ...after.followUp, label: L(`Kind.${after.followUp.label}`) } : null,
      });
      if (after.skillBonus && typeof row.skillLevel === "number") row.skillLevel += after.skillBonus;
      row.notes.push({ label: L(`Kind.${load.kind}`), hint: L(`Hint.${load.kind}`) });
      for (const note of after.notes) row.notes.push({ label: F(`Note.${note.key}`, note.data ?? {}), hint: L(`Hint.${load.kind}`) });
    }
  });

  // What a failed roll against an energy warhead does (pp. 157-159).
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on() || !isRanged(context?.item) || context.mode?.derived) return;
    const load = loadFor(context.item, Number(context.mode?.index) || 0);
    if (!load?.kind) return;
    const actor = context.actor;
    const name = String(actor?.name ?? "");
    const margin = Math.max(1, Math.floor(Number(context.margin) || 0));
    const traits = traitNames(actor);
    const lines: string[] = [];
    switch (load.kind) {
      case "emp":
        // "Anything electrical ... knocked out of action for seconds equal to the margin" (p. 157).
        // Robots (the Machine meta-trait) go unconscious; a total cyborg has a seizure instead.
        if (!traits.some((n) => /^electrical\b/i.test(n))) lines.push(F("Effect.empUnaffected", { name }));
        else if (traits.some((n) => /^machine\b/i.test(n))) {
          context.effects.push({ key: "unconscious", duration: { seconds: margin } });
          lines.push(F("Effect.emp", { name, seconds: margin }));
        } else {
          context.effects.push({ key: "seizure", duration: { seconds: margin } });
          lines.push(F("Effect.empCyborg", { name, seconds: margin }));
        }
        break;
      case "strobe": {
        // Stunned and blind for seconds; a seizure for minutes by 5, or for anyone with Epilepsy (p. 157).
        const seizure = margin >= 5 || traits.some((n) => /^epilepsy\b/i.test(n));
        context.effects.push({ key: "stunned", duration: { seconds: margin } });
        if (seizure) context.effects.push({ key: "seizure", duration: { seconds: margin * 60 } });
        lines.push(F(seizure ? "Effect.strobeSeizure" : "Effect.strobe", { name, seconds: margin, minutes: margin }));
        break;
      }
      case "warbler":
        // Deafness and moderate pain for minutes; lingering hearing loss by 5 (p. 157).
        context.effects.push({ key: "moderatePain", duration: { seconds: margin * 60 } });
        lines.push(F(margin >= 5 ? "Effect.warblerWorse" : "Effect.warbler", { name, minutes: margin }));
        break;
      case "psiBomb":
        if (traits.some((n) => /^digital mind\b/i.test(n)) || api.actors.attribute(actor, "IQ") === 0) {
          lines.push(F("Effect.psiImmune", { name }));
          break;
        }
        if (load.variant === "terror") {
          // Resisted with a Fright Check: the table's result is the effect (p. 159).
          if (context.frightEffect) lines.push(F("Effect.psiTerror", { name, effect: String(context.frightEffect) }));
        } else if (load.variant === "message") {
          context.effects.push({ key: "stunned" });
          if (margin >= 5) context.effects.push({ key: "moderatePain", duration: { seconds: margin * 60 } });
          lines.push(F(margin >= 5 ? "Effect.psiMessageWorse" : "Effect.psiMessage", { name, minutes: margin }));
        } else {
          context.effects.push({ key: margin >= 5 ? "unconscious" : "stunned", ...(margin >= 5 ? { duration: { seconds: margin * 60 } } : {}) });
          // -5 to recover from this stun, until they do (p. 158).
          if (margin < 5 && actor?.isOwner) void actor.setFlag(MODULE_ID, PSI_STUN_FLAG, true);
          lines.push(F(margin >= 5 ? "Effect.psiWorse" : "Effect.psi", { name, minutes: margin }));
        }
        break;
      default:
        break;
    }
    void say(actor, context.label ?? "", lines);
  });

  // An EMP's (2): DR at half against it; Mind Shield against a psi-bomb (pp. 157-158).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !isRanged(context.attack?.item)) return;
    const load = loadFor(context.attack.item, Number(context.attack.mode?.index) || 0);
    if (load?.kind === "emp") {
      const bonus = Math.floor((Number(context.attack.dr) || 0) / (WARHEADS.emp.affliction?.divisor ?? 1));
      if (bonus) context.modifiers.push({ label: L("EmpDr"), value: bonus });
      return;
    }
    // Strobe, warbler and psi-bomb effects fade: +1 to resist a yard from the centre (pp. 157-159).
    const fade = fadingBonus(String(load?.kind ?? ""), context.attack.distance);
    if (fade) context.modifiers.push({ label: F("Fading", { yards: fade }), value: fade });
    if (load?.kind !== "psiBomb") return;
    const shield = traitNames(context.actor).map((n) => /^mind shield\b\D*(\d+)?/i.exec(n)).find(Boolean);
    if (shield) context.modifiers.push({ label: L("MindShield"), value: Math.max(1, Number(shield[1]) || 1) });
  });

  // A warbler: -10 to Hearing in its radius, -5 within twice it, -2 within five times, for 10 seconds (p. 157).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || !isRanged(context.item) || context.mode?.derived) return;
    const index = Number(context.mode?.index) || 0;
    const load = loadFor(context.item, index);
    if (load?.kind !== "warbler") return;
    const size = sizeClass(launcherOf(api, context.item, index).calibreMm);
    const radius = Number(size === null ? 0 : WARHEADS.warbler.table?.[String(size)]?.spec) || 0;
    for (const ring of warblerRings(radius)) {
      void placeArea(api, { key: "warbler", label: L("Kind.warbler"), actor: context.actor, radiusYards: ring.radius, seconds: WARBLER_SECONDS, lines: [{ label: F("WarblerHearing", { total: ring.total }), value: ring.value, rolls: ["hearing"], applies: "inside" }] });
    }
  });

  // A psi-bomb's stun is at -5 to recover from (p. 158); the mark goes when the stun does.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("stunRecovery") || !context.actor?.getFlag?.(MODULE_ID, PSI_STUN_FLAG)) return;
    context.modifiers.push({ label: L("PsiStun"), value: PSI_STUN_RECOVERY });
  });
  Hooks.on("updateActor", (actor: any, changes: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id || changes?.system?.conditions?.stunned !== false) return;
    if (actor?.getFlag?.(MODULE_ID, PSI_STUN_FLAG)) void actor.unsetFlag(MODULE_ID, PSI_STUN_FLAG);
  });

  // Nuclear and antimatter blasts fall off with the distance, not three times it (p. 156).
  Hooks.on(api.combat.hooks.explosionFalloff, (context: any) => {
    if (!on() || !context?.itemUuid) return;
    const item: any = fromUuidSync(String(context.itemUuid));
    if (!isRanged(item)) return;
    const load = loadFor(item, Number(context.flag?.mode?.index) || 0);
    const perYard = blastDivisorPerYard(String(load?.kind ?? ""));
    if (perYard !== null) context.divisorPerYard = perYard;
  });

  // Proximity detonation: Attacking an Area at +4, fragments only (pp. 153-154; Campaigns p. 414).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: PROXIMITY_OPTION,
    label: L("Proximity.Label"),
    available: (context: any) => on() && Boolean(context?.ranged) && loadFor(context?.item, Number(context?.mode?.index) || 0)?.kind === "he",
    apply: () => ({ modifiers: [{ label: L("Proximity.Label"), value: 4 }], notes: [L("Proximity.Note")] }),
  } as any);
}
