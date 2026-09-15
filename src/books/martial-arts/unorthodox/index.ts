/**
 * Weapons used outside their makers' plans, at the table (GURPS Martial Arts
 * pp. 212, 220, 224).
 *
 * Unfamiliar weapons: a weapon may name the group it belongs to, and a
 * fighter the groups they know. Wielding a weapon from outside them is at -2;
 * facing one gives -1 to parry it and -2 in feints and disarms, unless both
 * sides are facing the unfamiliar. Unorthodox use: a two-handed weapon taken
 * in one hand swaps its skill and loses 1 damage, every melee weapon the table
 * covers can be hurled, and a GM tool makes weapons of everyday things.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { holdoutOf } from "../weapons/index.js";
import { thrownModes } from "../ranged/index.js";
import {
  IMPROVISED,
  ONE_HANDED_DAMAGE,
  THROWN_DEFAULT,
  UNFAMILIAR_PARRY,
  UNFAMILIAR_WIELD,
  contestPenalty,
  glassBreaks,
  hurlFor,
  hurlRange,
  improvisedSkillPenalty,
  isFamiliar,
  oneHandedGrip,
  oneHandedSkill,
  weaponGroups,
  type Improvised,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Unorthodox.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Unorthodox.${key}`, data);

const ACTOR_TYPES = ["character", "npc"];

/** The extension fields: a weapon's group, and the groups a fighter knows. */
export function initUnorthodox(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { weaponGroup: new f.StringField({ required: true, blank: true, initial: "" }) });
  addExtensionFields("Actor", ACTOR_TYPES, { familiarWeapons: new f.StringField({ required: true, blank: true, initial: "" }) });
}

const groupOf = (item: any) => String(item?.system?.extensions?.[MODULE_ID]?.weaponGroup ?? "");
const familiarOf = (actor: any) => weaponGroups(actor?.system?.extensions?.[MODULE_ID]?.familiarWeapons);
const unfamiliar = (actor: any, item: any) => Boolean(item) && !isFamiliar(groupOf(item), familiarOf(actor));
const melee = (item: any): any[] => (Array.isArray(item?.system?.meleeModes) ? item.system.meleeModes : []);
/** The weapon a fighter has in hand for a contest: the one their best parry is with, or else an equipped melee weapon. */
const wielded = (api: GWorldApi, actor: any) => {
  const id = api.actors.defenses(actor)?.parry?.weapon?.itemId;
  const parrying = id ? actor?.items?.get?.(id) ?? null : null;
  return parrying ?? [...(actor?.items ?? [])].find((item: any) => item.type === "equipment" && item.system?.equipped && melee(item).length > 0) ?? null;
};
const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));

/** Registers the hooks, the row button, the hurl mode and the GM tool. */
export function readyUnorthodox(api: GWorldApi, familiarity: () => boolean, unorthodox: () => boolean): void {
  // ── unfamiliar weapons (p. 212) ──
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!familiarity() || !unfamiliar(context?.actor, context?.item)) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "melee" || typeof entry.row.skillLevel !== "number") continue;
      entry.row.skillLevel += UNFAMILIAR_WIELD;
      entry.row.notes.push({ label: L("Unfamiliar"), hint: F("UnfamiliarHint", { penalty: UNFAMILIAR_WIELD }) });
    }
  });
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!familiarity() || context?.defense !== "parry") return;
    const uuid = context.attackWeapon?.itemUuid;
    const weapon = uuid ? (globalThis as any).fromUuidSync?.(uuid) : null;
    if (weapon && unfamiliar(context.defender, weapon)) context.modifiers.push({ label: L("FacingUnfamiliar"), value: UNFAMILIAR_PARRY });
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const tags: string[] = Array.isArray(context?.tags) ? context.tags : [];
    if (!familiarity() || !tags.includes("contest") || !(tags.includes("feint") || tags.includes("disarm")) || !context.opponent) return;
    const facing = unfamiliar(context.actor, wielded(api, context.opponent));
    const theirs = unfamiliar(context.opponent, wielded(api, context.actor));
    const penalty = contestPenalty(facing, theirs);
    if (penalty) context.modifiers.push({ label: L("FacingUnfamiliar"), value: penalty });
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-familiar-weapons",
    sheet: "character",
    tab: "combat",
    position: "end",
    template: `modules/${MODULE_ID}/templates/ma-familiar-weapons.hbs`,
    visible: () => familiarity(),
    context: (actor) => ({ field: `system.extensions.${MODULE_ID}.familiarWeapons`, value: actor?.system?.extensions?.[MODULE_ID]?.familiarWeapons ?? "" }),
  });
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-weapon-group",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ma-weapon-group.hbs`,
    visible: (item) => familiarity() && item?.type === "equipment" && melee(item).length > 0,
    context: (item) => ({ value: groupOf(item) }),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>("[data-ma-weapon-group]")?.addEventListener("change", (event) => {
        void item.update({ [`system.extensions.${MODULE_ID}.weaponGroup`]: (event.target as HTMLInputElement).value });
      });
    },
  });

  // ── two-handed weapons in one hand (p. 220) ──
  const oneHandable = (item: any, actor: any) => melee(item).some((mode) => mode?.twoHanded && oneHandedSkill(String(mode.skill ?? ""), String(mode.damageBase ?? ""))
    && oneHandedGrip(Number(api.actors.attribute(actor, "ST")) || 10, mode.minSt ?? null, Boolean(mode.unreadyAfterAttack)) !== null);
  const inOneHand = (item: any) => api.combat.getWeaponState(item, MODULE_ID)?.oneHanded === true;
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-one-hand",
    itemTypes: ["equipment"],
    label: L("OneHand"),
    icon: "fa-solid fa-hand-back-fist",
    visible: (item, actor) => unorthodox() && (inOneHand(item) || oneHandable(item, actor)),
    run: async (item) => {
      const next = !inOneHand(item);
      await api.combat.setWeaponState(item, MODULE_ID, { oneHanded: next });
      ui.notifications?.info(F(next ? "NowOneHand" : "NowTwoHands", { weapon: String(item.name ?? "") }));
    },
  });
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!unorthodox() || !inOneHand(context?.item)) return;
    for (const entry of context.rows ?? []) {
      const mode = entry.mode;
      if (entry.kind !== "melee" || !mode?.twoHanded) continue;
      const skill = oneHandedSkill(String(mode.skill ?? ""), String(mode.damageBase ?? ""));
      // The ST the row was worked out with, as the system judges a weapon's readiness.
      const grip = oneHandedGrip(Number(entry.basis?.st) || 10, mode.minSt ?? null, Boolean(mode.unreadyAfterAttack));
      if (!skill || !grip) continue;
      const level = context.skillLevel?.(skill) ?? null;
      Object.assign(entry.row, {
        skillName: skill,
        skillLevel: level ?? 0,
        damage: context.addToDamage(String(entry.row.damage ?? ""), ONE_HANDED_DAMAGE),
        twoHanded: false,
        readiesAfterAttack: grip === "unready",
      });
      entry.row.notes.push({ label: L("OneHand"), hint: F("OneHandHint", { skill }) });
    }
  });

  // ── hurled melee weapons (p. 220) ──
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: "ma-hurl",
    label: L("Hurl"),
    kind: "ranged",
    applies: (item) => unorthodox() && melee(item).length > 0 && thrownModes(item).length === 0,
    mode: (item, _actor, helpers: any) => {
      const modes = melee(item);
      const crushingOnly = modes.every((m) => String(m?.damageType ?? "") === "cr");
      const hurl = modes.map((m) => hurlFor(String(m?.skill ?? ""), crushingOnly)).find(Boolean);
      if (!hurl) return null;
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const st = Number(helpers.attribute?.("ST")) || 10;
      // A blade may be thrown with Thrown Weapon (Sword) at no penalty, where it's known.
      const sword = hurl.skill === "DX" ? helpers.skillLevel("Thrown Weapon (Sword)") : null;
      const known = hurl.skill === "DX" ? null : helpers.skillLevel(hurl.skill);
      const standard = sword !== null
        ? { name: "Thrown Weapon (Sword)", level: sword }
        : { name: hurl.skill, level: (hurl.skill === "DX" ? dx : known ?? dx + THROWN_DEFAULT) + hurl.penalty };
      const art = helpers.skillLevel("Throwing Art");
      const use = art !== null && art > standard.level ? { name: "Throwing Art", level: art } : standard;
      const rows: any[] = helpers.rows?.(item)?.melee ?? [];
      const row = rows.find((r) => r.damageBase === hurl.attack) ?? null;
      const damage = row ? String(row.damage) : String(helpers.damage?.(hurl.attack, 0) ?? "");
      const weight = Number(item.system?.weight) || 0;
      const range = hurlRange(st, weight);
      return {
        mode: F("HurlMode", { skill: use.name }),
        skillName: use.name,
        skillLevel: use.level,
        damage,
        damageType: row?.damageType ?? "cr",
        armorDivisor: row?.armorDivisor ?? 1,
        damageRollable: api.rules.parseDiceAdds(damage) !== null,
        accuracy: 0,
        rateOfFire: 1,
        shots: "T(1)",
        recoil: 1,
        bulk: holdoutOf(item).penalty,
        ...range,
        range: range.halfDamageRange ? `${range.halfDamageRange} / ${range.maxRange}` : String(range.maxRange),
        thrown: true,
        weight,
        material: row?.material ?? "",
        feint: false,
      };
    },
  });

  // ── improvised weapons (p. 224) ──
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-improvised-weapons",
    label: L("Improvised"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: unorthodox,
    open: () => improviseDialog(api),
  });
  // A glass weapon's strike or parry may break it (p. 224).
  const glassy = new Map<string, any>();
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (unorthodox() && !context?.ranged && api.combat.getWeaponState(context?.item, MODULE_ID)?.glass) glassy.set(String(context.actor?.uuid ?? ""), context.item);
  });
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const id = context?.defense === "parry" ? context.parryWeapon?.itemId : null;
    const item = id ? context.defender?.items?.get?.(id) : null;
    if (unorthodox() && item && api.combat.getWeaponState(item, MODULE_ID)?.glass) glassy.set(String(context.defender?.uuid ?? ""), item);
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const key = String(context?.actor?.uuid ?? "");
    const item = glassy.get(key);
    const tags: string[] = context?.tags ?? [];
    if (!item || !(tags.includes("attack") || tags.includes("parry"))) return;
    glassy.delete(key);
    if (!context.actor?.isOwner) return;
    void breakGlass(api, context.actor, item);
  });
}

/** Rolls for a glass weapon breaking, and for the hand it cuts (p. 224). */
async function breakGlass(api: GWorldApi, actor: any, item: any): Promise<void> {
  const roll = new Roll("1d6");
  await roll.evaluate();
  const result = glassBreaks(Number(roll.total));
  const text = F(result.breaks ? (result.cutsHand ? "GlassCuts" : "GlassBreaks") : "GlassHolds", { weapon: String(item.name ?? "") });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(text)}</span> <span>1d: ${Number(roll.total)}</span></div></div>`,
    rolls: [roll],
  });
  if (!result.breaks) return;
  await api.combat.setWeaponState(item, MODULE_ID, { glass: false, broken: true });
  if (result.cutsHand) {
    const thrust = api.actors.derived(actor)?.thrust ?? "1d-2";
    await api.roll.damage({ actor, formula: String(thrust), damageType: "cut", label: F("GlassHand", { weapon: String(item.name ?? "") }) } as any);
  }
}

/** The GM tool: pick a character and an everyday item, and they get it as a weapon. */
async function improviseDialog(api: GWorldApi): Promise<void> {
  const actors = [...((game as any).actors ?? [])].filter((a: any) => a.type === "character" || a.type === "npc");
  const selected = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor?.id ?? "";
  const options = (list: Array<{ value: string; label: string; selected?: boolean }>) => list.map((o) => `<option value="${o.value}" ${o.selected ? "selected" : ""}>${foundry.utils.escapeHTML(o.label)}</option>`).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Improvised") },
    content: `<div class="gworld">
      <label>${L("ImproviseFor")} <select name="actor">${options(actors.map((a: any) => ({ value: String(a.id), label: String(a.name), selected: a.id === selected })))}</select></label>
      <label>${L("ImproviseItem")} <select name="entry">${options(IMPROVISED.map((e) => ({ value: e.key, label: L(`Items.${e.key}`) })))}</select></label>
    </div>`,
    ok: {
      label: L("Improvise"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return { actor: form?.querySelector<HTMLSelectElement>('[name="actor"]')?.value ?? "", entry: form?.querySelector<HTMLSelectElement>('[name="entry"]')?.value ?? "" };
      },
    },
    rejectClose: false,
  }) as { actor: string; entry: string } | null;
  const actor = chosen ? (game as any).actors?.get(chosen.actor) : null;
  const entry = chosen ? IMPROVISED.find((e) => e.key === chosen.entry) : undefined;
  if (!actor || !entry) return;
  const made = await improvise(api, actor, entry);
  if (made) ui.notifications?.info(F("ImprovisedDone", { actor: String(actor.name), weapon: String(made.name) }));
}

/** Finds the weapon an improvised one stands in for, in the world's compendia. */
async function baseWeapon(name: string): Promise<any | null> {
  for (const pack of (game as any).packs ?? []) {
    if (pack.documentName !== "Item") continue;
    const index = await pack.getIndex({ fields: ["type"] });
    const hit = index.find((e: any) => e.type === "equipment" && String(e.name).toLowerCase() === name.toLowerCase());
    if (hit) return pack.getDocument(hit._id);
  }
  return null;
}

/** Builds an everyday item as a weapon on a character: the base weapon's lines for the skill, changed as the list says. */
export async function improvise(api: GWorldApi, actor: any, entry: Improvised): Promise<any | null> {
  const base = await baseWeapon(entry.base);
  if (!base) {
    ui.notifications?.warn(F("NoBase", { base: entry.base }));
    return null;
  }
  const perks = traitNames(actor).map((n) => /^improvised weapons\s*\((.+)\)$/i.exec(n)?.[1] ?? "").filter(Boolean);
  const penalty = improvisedSkillPenalty(entry, perks);
  const source = base.toObject();
  const lines = (source.system.meleeModes ?? []).filter((m: any) => String(m.skill ?? "").toLowerCase() === entry.skill.toLowerCase() && (!entry.attack || m.damageBase === entry.attack));
  if (lines.length === 0) {
    ui.notifications?.warn(F("NoBase", { base: `${entry.base} (${entry.skill})` }));
    return null;
  }
  source.name = F("ImprovisedName", { item: L(`Items.${entry.key}`), base: base.name });
  source.system.meleeModes = lines.map((m: any) => ({
    ...m,
    damageModifier: (Number(m.damageModifier) || 0) + entry.damage,
    skillModifier: (Number(m.skillModifier) || 0) + penalty,
    canParry: entry.canParry,
    ...(entry.reach ? { reach: entry.reach } : {}),
    ...(entry.armorDivisor ? { armorDivisor: entry.armorDivisor } : {}),
  }));
  source.system.rangedModes = [];
  source.system.quality = "cheap";
  source.system.cost = 0;
  const [made] = await actor.createEmbeddedDocuments("Item", [source]);
  if (made && entry.glass) await api.combat.setWeaponState(made, MODULE_ID, { glass: true });
  return made ?? null;
}
