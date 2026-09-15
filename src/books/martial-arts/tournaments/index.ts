/**
 * Tournament combat at the table (GURPS Martial Arts pp. 134-135).
 *
 * A GM tool sets up a bout between two fighters: the competition type picks the
 * skills, and the method is a Quick Contest (once, per round or per point, with
 * deadly hits if the bout is to the death) or the detailed method. The detailed
 * method runs on a card whispered to the GM, which keeps the round's clock with
 * secret lull and flurry lengths, presses, the Tactics contest, and fatigue at
 * the end of the round.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  COMPETITIONS,
  FLURRY_DICE,
  LULL_DICE,
  artOrSport,
  bestSkill,
  deadlyHits,
  matchWinner,
  nextPhase,
  pressResult,
  secondsFought,
  type Competition,
  type Pressing,
  type SkillKind,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Tournament.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Tournament.${key}`, data);
const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ""));
const fromUuid = (uuid: unknown) => (globalThis as any).fromUuidSync?.(String(uuid ?? "")) ?? null;
const gmIds = () => [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id);

const CARD = "ma-bout";

interface BoutData {
  firstUuid: string;
  secondUuid: string;
  firstName: string;
  secondName: string;
  roundSeconds: number;
  oneFlurry: boolean;
  round: number;
  elapsed: number;
  phase: "lull" | "flurry" | "between";
  phaseLeft: number;
  flurries: number;
  /** Seconds of the current flurry fought so far, as the GM enters them. */
  fought?: number;
  log: string[];
  [key: string]: unknown;
}

/** Registers the tool, the bout card and the contest listener. */
export function readyTournaments(api: GWorldApi, on: () => boolean): void {
  const inFamily = (name: string, family: string) => Boolean((api.rules as any).inSkillFamily?.(name, family));
  const kindOf = (name: string): SkillKind | null => artOrSport(name) ?? (inFamily(name, "melee") || inFamily(name, "unarmed") ? "combat" : null);
  const skillsOf = (actor: any) => [...(actor?.items ?? [])]
    .filter((i: any) => i.type === "skill")
    .map((i: any) => ({ name: String(i.name ?? ""), level: api.actors.skillLevel(actor, String(i.name ?? "")), kind: kindOf(String(i.name ?? "")) }))
    .filter((s): s is { name: string; level: number; kind: SkillKind | null } => typeof s.level === "number");
  const dice = async (formula: string) => {
    const roll = new Roll(formula);
    await roll.evaluate();
    return Number(roll.total) || 0;
  };

  // The sides of the last tournament contest, which the contest's result alone doesn't carry.
  let sides: { first: any; second: any } | null = null;
  Hooks.on((api.combat.hooks as any).afterQuickContest ?? "gworld.afterQuickContest", (context: any) => {
    if ((context?.tags ?? []).includes("tournament")) sides = { first: context.first?.outcome ?? null, second: context.second?.outcome ?? null };
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-tournament-bout",
    label: L("Title"),
    icon: "fa-solid fa-medal",
    visible: on,
    open: () => bout(),
  });

  async function bout(): Promise<void> {
    const picked = [...((globalThis as any).canvas?.tokens?.controlled ?? []), ...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
    const fighters = picked.filter((a: any, i: number) => picked.findIndex((b: any) => b.uuid === a.uuid) === i);
    if (fighters.length !== 2) return void ui.notifications?.warn(L("Pick"));
    const [a, b] = fighters as [any, any];
    const competitions = Object.keys(COMPETITIONS).map((key) => `<option value="${key}">${esc(L(`Competitions.${key}`))}</option>`).join("");
    const methods = ["single", "rounds", "points", "detailed"].map((key) => `<option value="${key}">${esc(L(`Methods.${key}`))}</option>`).join("");
    const form = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("Title") },
      content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
        <p>${esc(F("Between", { first: a.name, second: b.name }))}</p>
        <label>${L("Competition")} <select name="competition">${competitions}</select></label>
        <label>${L("Method")} <select name="method">${methods}</select></label>
        <label>${L("Count")} <input type="number" name="count" value="3" min="1" max="30" step="1"></label>
        <label><input type="checkbox" name="deadly"> ${L("Deadly")}</label>
        <label>${L("RoundSeconds")} <input type="number" name="roundSeconds" value="180" min="10" step="10"></label>
        <label><input type="checkbox" name="oneFlurry"> ${L("OneFlurry")}</label>
      </div>`,
      ok: { label: L("Start"), callback: (_e: Event, button: any) => new (foundry.applications as any).ux.FormDataExtended(button.form).object },
      rejectClose: false,
    }) as Record<string, any> | null;
    if (!form) return;
    const competition = (Object.keys(COMPETITIONS).includes(String(form.competition)) ? form.competition : "lightContact") as Competition;
    if (form.method === "detailed") {
      await api.chat.post(`${MODULE_ID}.${CARD}`, view({
        firstUuid: String(a.uuid), secondUuid: String(b.uuid), firstName: String(a.name ?? ""), secondName: String(b.name ?? ""),
        roundSeconds: Math.max(10, Math.floor(Number(form.roundSeconds) || 180)), oneFlurry: Boolean(form.oneFlurry),
        round: 0, elapsed: 0, phase: "between", phaseLeft: 0, flurries: 0, log: [],
      }), { whisper: gmIds() } as any);
      return;
    }
    const skillA = bestSkill(skillsOf(a), competition);
    const skillB = bestSkill(skillsOf(b), competition);
    if (!skillA || !skillB) return void ui.notifications?.warn(F("NoSkill", { name: String((skillA ? b : a).name ?? ""), kinds: COMPETITIONS[competition].map((k) => L(`Kinds.${k}`)).join(", ") }));
    const count = form.method === "single" ? 1 : Math.max(1, Math.floor(Number(form.count) || 1));
    const wins = { first: 0, second: 0 };
    const lines: string[] = [];
    for (let contest = 1; ; contest += 1) {
      sides = null;
      const result: any = await api.roll.quickContest({
        label: F("ContestLabel", { first: a.name, second: b.name, n: contest }),
        first: { actor: a, base: skillA.level, note: skillA.name },
        second: { actor: b, base: skillB.level, note: skillB.name },
        tags: ["tournament"],
      } as any);
      const outcome = result?.outcome ?? "tie";
      if (outcome === "first") wins.first += 1;
      if (outcome === "second") wins.second += 1;
      lines.push(outcome === "tie" ? F("Tie", { n: contest }) : F("Won", { n: contest, name: String((outcome === "first" ? a : b).name ?? "") }));
      if (form.deadly) {
        const taken = sides as { first: any; second: any } | null;
        for (const [fighter, foe, won, roll] of [[a, b, outcome === "first", taken?.first], [b, a, outcome === "second", taken?.second]] as const) {
          const hits = deadlyHits({ won, success: roll?.success === true, criticalFailure: roll?.criticalFailure === true });
          for (let hit = 0; hit < hits; hit += 1) await strike(foe, fighter);
          if (hits) lines.push(F("Hits", { name: String(fighter.name ?? ""), hits }));
        }
      }
      const done = form.method === "points" ? Math.max(wins.first, wins.second) >= count : contest >= count;
      if (done || contest >= 30) break;
    }
    const winner = matchWinner(wins);
    await ChatMessage.implementation.create({
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Title"))}: ${esc(L(`Competitions.${competition}`))}</span></div>
        ${lines.map((line) => `<div class="gc-note">${esc(line)}</div>`).join("")}
        <div class="gc-result">${esc(winner ? F("Winner", { name: String((winner === "first" ? a : b).name ?? ""), first: wins.first, second: wins.second }) : F("Draw", { first: wins.first, second: wins.second }))}</div></div>`,
    });
  }

  /** A full-force hit from the attacker's best attack to a random location, with no defense (p. 134). */
  async function strike(attacker: any, victim: any): Promise<void> {
    const rows = ((api.actors.derived(attacker)?.melee ?? []) as any[]).filter((r) => r.damageRollable !== false && typeof r.skillLevel === "number" && r.damage);
    const row = rows.sort((x, y) => y.skillLevel - x.skillLevel)[0];
    if (!row) return;
    // Rolled as the system rolls a random location, with the modules' own (API 1.43.0).
    const picked: any = await (api.roll as any).hitLocation?.({ actor: victim, damageType: row.damageType ?? null });
    const location = picked?.hitLocation ?? "torso";
    await api.roll.damage({
      actor: attacker,
      item: row.itemId ? attacker.items?.get?.(row.itemId) ?? null : null,
      mode: { index: Number(row.modeIndex) || 0, ranged: false },
      label: F("HitLabel", { victim: String(victim.name ?? ""), attack: String(row.name ?? "") }),
      formula: String(row.damage),
      damageType: row.damageType,
      armorDivisor: Number(row.armorDivisor) || 1,
      calledShot: { hitLocation: location, ...(picked?.addonLocation ? { addonLocation: picked.addonLocation } : {}) },
    } as any);
  }

  // ── the detailed method (p. 134) ──
  function view(data: BoutData): BoutData {
    const left = Math.max(0, data.roundSeconds - data.elapsed);
    return {
      ...data,
      title: F("RoundTitle", { round: data.round || 1, first: data.firstName, second: data.secondName }),
      clock: data.phase === "between" ? F("BetweenRounds", { round: data.round }) : F("Clock", { phase: L(`Phases.${data.phase}`), left: data.phaseLeft, elapsed: data.elapsed, total: data.roundSeconds, remaining: left }),
      between: data.phase === "between",
      inFlurry: data.phase === "flurry",
      inRound: data.phase !== "between",
    };
  }
  /** Starts a phase of the round, never running past its end. */
  async function begin(data: BoutData, phase: "lull" | "flurry"): Promise<BoutData> {
    const remaining = Math.max(0, data.roundSeconds - data.elapsed);
    const length = Math.min(remaining, await dice(phase === "lull" ? LULL_DICE : FLURRY_DICE));
    return { ...data, phase, phaseLeft: length, fought: 0, flurries: data.flurries + (phase === "flurry" ? 1 : 0), log: [...data.log, F(phase === "lull" ? "LullStarts" : "FlurryStarts", { seconds: length })] };
  }

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ma-bout.hbs`,
    actions: {
      startRound: { permission: "gm", run: async ({ message, data }: any) => {
        const next = await begin({ ...(data as BoutData), round: data.round + 1, elapsed: 0, flurries: 0, log: [F("RoundStarts", { round: data.round + 1 })] }, "lull");
        await api.chat.update(message, view(next));
      } },
      phaseOver: { permission: "gm", run: async ({ message, data }: any) => {
        const current = data as BoutData;
        const elapsed = current.elapsed + current.phaseLeft;
        if (elapsed >= current.roundSeconds) {
          await api.chat.update(message, view({ ...current, elapsed: current.roundSeconds, phaseLeft: 0, log: [...current.log, L("RoundOver")] }));
          return;
        }
        const phase = nextPhase({ phase: current.phase === "flurry" ? "flurry" : "lull", flurries: current.flurries, oneFlurry: current.oneFlurry });
        await api.chat.update(message, view(await begin({ ...current, elapsed }, phase)));
      } },
      earlyLull: { permission: "gm", run: async ({ message, data }: any) => {
        const current = data as BoutData;
        await api.chat.update(message, view(await begin(endFlurry(current, L("Disengage")), "lull")));
      } },
      fought: { permission: "gm", run: async ({ message, data, value }: any) => {
        const current = data as BoutData;
        await api.chat.update(message, view({ ...current, fought: secondsFought(Number(value), current.phaseLeft) }));
      } },
      pressFirst: { permission: "gm", run: ({ message, data }: any) => press(message, data, "first") },
      pressSecond: { permission: "gm", run: ({ message, data }: any) => press(message, data, "second") },
      pressBoth: { permission: "gm", run: ({ message, data }: any) => press(message, data, "both") },
      endRound: { permission: "gm", run: async ({ message, data }: any) => {
        const current = data as BoutData;
        const cost = Number((api.rules as any).battleFatigueCost?.(current.roundSeconds)) || 0;
        for (const uuid of [current.firstUuid, current.secondUuid]) {
          const fighter = fromUuid(uuid);
          if (fighter && cost) await api.actors.applyInjury(fighter, { amount: cost, fatigue: true, label: L("Fatigue") });
        }
        await api.chat.update(message, view({ ...current, phase: "between", phaseLeft: 0, log: [...current.log, F("FatigueTaken", { fp: cost })] }));
      } },
    },
  } as any);

  /** A flurry cut short: the seconds fought count toward the round (p. 134). */
  function endFlurry(data: BoutData, line: string): BoutData {
    const fought = secondsFought(Number(data.fought ?? 0), data.phaseLeft);
    return { ...data, elapsed: Math.min(data.roundSeconds, data.elapsed + fought), phaseLeft: 0, log: [...data.log, F("FoughtLog", { seconds: fought }), line] };
  }

  /** A fighter presses the fight, or both do (p. 134). */
  async function press(message: any, data: BoutData, pressing: Pressing): Promise<void> {
    if (data.phase !== "flurry") return;
    const remaining = Math.max(0, data.roundSeconds - data.elapsed - data.phaseLeft);
    if (pressing === "both") {
      const seconds = Math.min(remaining, await dice(FLURRY_DICE));
      await api.chat.update(message, view({ ...data, phaseLeft: data.phaseLeft + seconds, log: [...data.log, F("BothPress", { seconds })] }));
      return;
    }
    const first = fromUuid(data.firstUuid);
    const second = fromUuid(data.secondUuid);
    if (!first || !second) return;
    const tactics = (actor: any) => api.actors.skillLevel(actor, "Tactics") ?? ((Number(api.actors.attribute(actor, "IQ")) || 10) - 6);
    const result: any = await api.roll.quickContest({
      label: F("PressLabel", { name: pressing === "first" ? data.firstName : data.secondName }),
      first: { actor: first, base: tactics(first), note: "Tactics" },
      second: { actor: second, base: tactics(second), note: "Tactics" },
      tags: ["tournamentPress"],
    } as any);
    const outcome = pressResult(pressing, result ?? undefined);
    const name = pressing === "first" ? data.firstName : data.secondName;
    if (outcome.lull) {
      // The current flurry ends where it is, and a lull begins at once.
      await api.chat.update(message, view(await begin(endFlurry(data, F("PressFailed", { name })), "lull")));
      return;
    }
    const seconds = Math.min(remaining, outcome.seconds);
    await api.chat.update(message, view({ ...data, phaseLeft: data.phaseLeft + seconds, log: [...data.log, F("Pressed", { name, seconds })] }));
  }
}
