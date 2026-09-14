/**
 * GURPS Monster Hunters 1: Champions, registered with the GWorld system
 * through its add-on API.
 *
 * Its group holds the book's switches, all off by default. So far this
 * registers Talents skipping wildcard skills (p. 24), the book's points
 * (pp. 23, 28, 31), holy attacks (p. 51), Ritual Path Magic (pp. 32-39) and
 * the book's gear (pp. 53-54, 59-61, 63).
 */

import type { BookRules } from "../../shared/book.js";
import { addExtensionFields } from "../../shared/extensions.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initGear, readyGear } from "./gear/index.js";
import { initHoly, readyHoly } from "./holy-contact.js";
import { mayPay, poolsOf, refreshed, spent, type Pools } from "./points.js";
import { initRitualPath, readyRitualPath } from "./ritual/index.js";
import { skipTalentOnWildcard } from "./talents.js";

const SLUG = "monster-hunters-1";

/** The actor types the book keeps data on. */
export const ACTOR_TYPES = ["character", "npc"] as const;
const REFERENCE = "Monster Hunters 1: Champions";
const L = (key: string) => game.i18n.localize(`GCC.MH1.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MH1.${key}`, data);

/** The book's switches, as the system's own group named them before they moved here. */
const RULES = [
  { key: "talentsSkipWildcards", pages: "p. 24", implemented: true },
  { key: "holyAttacks", pages: "p. 51", implemented: true },
  { key: "ritualPathMagic", pages: "pp. 32-39", implemented: true },
  { key: "monsterHuntersGear", pages: "pp. 53-54, 59", implemented: true },
  { key: "bonusPointSpending", pages: "pp. 23, 28, 31", implemented: true },
] as const;

/** A switch's full key, as the system stores it. */
export const ruleKey = (key: (typeof RULES)[number]["key"]) => `${MODULE_ID}.${key}`;

function registerRules(registry: RuleRegistry, group: string): void {
  for (const rule of RULES) {
    registry.registerRule({
      module: MODULE_ID,
      group,
      key: rule.key,
      // Localization keys: the Rules page localizes them, and this runs before
      // the translations are loaded.
      name: `GCC.MH1.Rules.${rule.key}.Name`,
      hint: `GCC.MH1.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

/** A pool id as the point-pool registry carries it: "destiny", or "wildcard:<skill>". */
const poolRef = (id: string): { kind: "destiny" } | { kind: "wildcard"; skill: string } =>
  id.startsWith("wildcard:") ? { kind: "wildcard", skill: id.slice("wildcard:".length) } : { kind: "destiny" };

function init(api: GWorldApi): void {
  const f = foundry.data.fields as any;
  // Where the pools are kept: null for a pool never spent from, which starts full.
  addExtensionFields("Actor", ACTOR_TYPES, {
    points: new f.SchemaField({
      destiny: new f.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 }),
      gmDestiny: new f.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 }),
      wildcard: new f.ArrayField(
        new f.SchemaField({
          skill: new f.StringField({ required: true, blank: false }),
          value: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        }),
        { required: true, initial: [] },
      ),
    }),
  });

  initHoly();
  initGear();
  initRitualPath(api, () => api.registry.isRuleOn(ruleKey("ritualPathMagic")));

  // "Talents never add to wildcard skills" (p. 24).
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!api.registry.isRuleOn(ruleKey("talentsSkipWildcards"))) return;
    skipTalentOnWildcard(context, L("TalentSkipsWildcard"));
  });
}

/** Stores a character's pools. */
async function store(actor: any, points: object): Promise<boolean> {
  if (!actor?.isOwner) return false;
  await actor.update({ [`system.extensions.${MODULE_ID}.points`]: points });
  return true;
}

/** Starts a game session for these characters: wildcard points afresh, a destiny point back, the GM's set aside. */
export async function startSession(actors: any[]): Promise<void> {
  const lines: string[] = [];
  const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
  for (const actor of actors) {
    const pools = poolsOf(actor);
    if (pools.destiny.max === 0 && pools.gmDestiny.max === 0 && pools.wildcard.every((p) => p.max === 0)) continue;
    const next = refreshed(pools);
    await store(actor, next);
    const parts = [
      ...(pools.destiny.max ? [F("DestinyValue", { value: next.destiny, max: pools.destiny.max })] : []),
      ...next.wildcard.filter((p) => p.value > 0).map((p) => F("WildcardValue", { skill: p.skill, value: p.value, max: p.value })),
      ...(pools.gmDestiny.max ? [F("GmDestinyValue", { value: next.gmDestiny })] : []),
    ];
    if (parts.length) lines.push(`<li><strong>${esc(actor.name)}</strong>: ${esc(parts.join(", "))}</li>`);
  }
  await ChatMessage.implementation.create({
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("NewSession"))}</span></div>`
      + (lines.length ? `<ul class="gc-log" style="margin:4px 0;padding-left:18px">${lines.join("")}</ul>` : `<div class="gc-note">${esc(L("NothingToRefresh"))}</div>`)
      + `</div>`,
  });
}

/** Whether a character has any of the book's pools to show. */
function holdsPools(pools: Pools): boolean {
  return pools.destiny.max > 0 || pools.gmDestiny.max > 0 || pools.wildcard.some((p) => p.max > 0 || p.fullyTrained);
}

/** What the sheet section shows of a character's pools. */
function sectionContext(actor: any): Record<string, unknown> {
  const pools = poolsOf(actor);
  return {
    destiny: pools.destiny.max ? F("DestinyValue", { value: pools.destiny.value, max: pools.destiny.max }) : "",
    gmDestiny: pools.gmDestiny.max && game.user?.isGM ? F("GmDestinyValue", { value: pools.gmDestiny.value }) : "",
    wildcard: pools.wildcard.filter((p) => p.max > 0).map((p) => F("WildcardValue", { skill: p.skill, value: p.value, max: p.max })),
    fullyTrained: pools.wildcard.filter((p) => p.fullyTrained).map((p) => p.skill),
    isGM: game.user?.isGM === true,
    labels: {
      title: L("PointsTitle"),
      destinyHint: L("DestinyHint"),
      wildcardHint: L("WildcardHint"),
      gmDestinyHint: L("GmDestinyHint"),
      fullyTrained: L("FullyTrained"),
      fullyTrainedHint: L("FullyTrainedHint"),
      newSession: L("NewSession"),
      newSessionHint: L("NewSessionHint"),
    },
  };
}

function ready(api: GWorldApi): void {
  const pointsOn = () => api.registry.isRuleOn(ruleKey("bonusPointSpending"));

  readyHoly(api, () => api.registry.isRuleOn(ruleKey("holyAttacks")));
  readyRitualPath(api, () => api.registry.isRuleOn(ruleKey("ritualPathMagic")));
  readyGear(api, () => api.registry.isRuleOn(ruleKey("monsterHuntersGear")));

  // Destiny and wildcard bonus points, beside the system's unspent points (p. 31).
  api.points.registerPointPool({
    module: MODULE_ID,
    key: "points",
    label: L("PointsTitle"),
    available: pointsOn,
    pools: (actor, use, roll) => {
      if (actor?.type !== "character" && actor?.type !== "npc") return [];
      const pools = poolsOf(actor);
      const out: Array<{ id: string; label: string; available: number; gmCheck?: boolean }> = [];
      if (pools.destiny.max > 0) out.push({ id: "destiny", label: L("DestinyName"), available: pools.destiny.value });
      for (const p of pools.wildcard) {
        if (p.max <= 0) continue;
        const may = mayPay({ kind: "wildcard", skill: p.skill }, use, roll);
        if (may.allowed) out.push({ id: `wildcard:${p.skill}`, label: p.skill, available: p.value, gmCheck: may.gmCheck });
      }
      return out;
    },
    canPay: ({ actor, pool, use, roll, cost }) => {
      const ref = poolRef(pool.id);
      if (!mayPay(ref, use, roll).allowed) return L("WildcardOnlyItsSkill");
      return spent(poolsOf(actor), ref, cost) ? true : L("NotEnough");
    },
    pay: async ({ actor, pool, cost }) => {
      const next = spent(poolsOf(actor), poolRef(pool.id), cost);
      return next ? store(actor, next) : false;
    },
  });

  // The GM starts each session for everyone at the table, from the token controls.
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "new-session",
    label: L("NewSession"),
    icon: "fa-solid fa-hourglass-start",
    visible: pointsOn,
    open: () => startSession(((game as any).actors?.contents ?? []).filter((a: any) => a.type === "character" && a.hasPlayerOwner)),
  });

  // What each character holds, on the Skills tab.
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "mh1-points",
    sheet: "character",
    tab: "skills",
    position: "start",
    template: `modules/${MODULE_ID}/templates/mh1-points.hbs`,
    visible: (actor) => pointsOn() && holdsPools(poolsOf(actor)),
    context: (actor) => sectionContext(actor),
    listeners: (element, actor) => {
      element.querySelector("[data-gcc-new-session]")?.addEventListener("click", () => {
        if (game.user?.isGM) void startSession([actor]);
      });
    },
  });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Monster Hunters 1",
  registerRules,
  init,
  ready,
};
