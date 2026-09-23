/**
 * GURPS Ultra-Tech's computers, registered with the system through the add-on
 * API (pp. 21-25, 46-47): the book's table for the shared computer engine,
 * which does the rest -- the price of a computer built with options and of a
 * program the record leaves unpriced, a compact computer's cells, a hardened
 * computer's HT, the item sheet section and the Gear tab section -- with the
 * AIs each computer could hold (pp. 25, 27-28), and this book's GM tool for
 * breaking encryption (p. 47).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { COMPUTER_TABLES, computersOf, initComputers as initComputerEngine, readyComputers as readyComputerEngine, type ComputerTable } from "../../../shared/computers/index.js";
import { computerData } from "../../../shared/computers/data.js";
import { beamFamily } from "../beams/rules.js";
import { loadsOf } from "../warheads/index.js";
import {
  AI_KINDS,
  COMPUTERS,
  aiLegality,
  decryptionHours,
  encryptionComplexity,
  highestAiIq,
  hoursText,
  timeSpentModifier,
  type EncryptionStandard,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Computer.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Computer.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A tech level as a number: "11^" is 11. */
function tlOf(value: unknown): number | null {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
}

/** What an AI of each kind could be on a computer: its highest IQ and that IQ's LC. */
function aiText(complexity: number): string {
  return AI_KINDS.filter((kind) => kind !== "mindEmulation" && kind !== "weakDedicated")
    .map((kind) => {
      const iq = highestAiIq(kind, complexity);
      return iq === null ? F("AiNone", { kind: L(`Ai.${kind}`) }) : F("AiUpTo", { kind: L(`Ai.${kind}`), iq, lc: aiLegality(kind, iq) });
    })
    .join("; ");
}

/** An EMP warhead or a microwave beam: what a hardened computer resists (p. 23). */
function electricalAttack(item: any, modeIndex: number): boolean {
  return loadsOf(item).some((l) => l.mode === modeIndex && l.kind === "emp") || beamFamily(String(item?.name ?? "")) === "microwave";
}

/** Ultra-Tech's computer table, behind the book's own switch (its full key). */
export function ultraTechComputers(rule: string): ComputerTable {
  return { book: "ultra-tech", tls: { min: 9, max: 12 }, figures: COMPUTERS, rule, i18n: "GCC.UT", notes: aiText, electricalAttack };
}

/** Registers the table, and what must exist before the world's data is read. */
export function initComputers(rule: string): void {
  COMPUTER_TABLES.register(ultraTechComputers(rule));
  initComputerEngine();
}


/** Asks for an encryption attempt and posts its time and modifier, rolling Cryptography for a selected character. */
async function breakEncryption(api: GWorldApi): Promise<void> {
  const actor = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
  const own = actor ? computersOf(actor) : [];
  const best = own.sort((a, b) => b.computer.complexity - a.computer.complexity)[0] ?? null;
  const campaign = tlOf(actor?.system?.tl) ?? 9;
  const field = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
  const content = `<div class="gworld" style="display:grid;gap:6px">`
    + field(L("Encryption.Standard"), `<select name="standard"><option value="basic">${esc(L("Encryption.basic"))}</option><option value="secure">${esc(L("Encryption.secure"))}</option></select>`)
    + field(L("Encryption.Tl"), `<input type="number" name="tl" value="${campaign}" min="9" max="12" step="1" style="width:70px" />`)
    + field(L("Encryption.Complexity"), `<input type="number" name="complexity" value="${best?.computer.complexity ?? 8}" min="0" step="1" style="width:70px" />`)
    + field(L("Encryption.Quantum"), `<input type="checkbox" name="quantum" ${best && computerData(best.item).options.quantum ? "checked" : ""} />`)
    + field(L("Encryption.Hours"), `<input type="number" name="hours" value="" min="0" step="any" placeholder="${esc(L("Encryption.BaseTime"))}" style="width:90px" />`)
    + (actor ? `<p class="ihint">${esc(F("Encryption.Roller", { name: actor.name }))}</p>` : `<p class="ihint">${esc(L("Encryption.NoRoller"))}</p>`)
    + `</div>`;
  const values = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Encryption.Title") },
    content,
    ok: {
      label: L("Encryption.Go"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return {
          standard: (value("standard")?.value ?? "basic") as EncryptionStandard,
          tl: Number(value("tl")?.value) || 9,
          complexity: Number(value("complexity")?.value) || 0,
          quantum: Boolean(value("quantum")?.checked),
          hours: value("hours")?.value === "" ? null : Number(value("hours")?.value),
        };
      },
    },
    rejectClose: false,
  }) as { standard: EncryptionStandard; tl: number; complexity: number; quantum: boolean; hours: number | null } | null;
  if (!values) return;
  const base = decryptionHours(values);
  const shown = hoursText(base);
  const time = shown.unit === "realTime" ? L("Encryption.RealTime") : F(`Encryption.${shown.unit}`, { value: shown.value });
  const modifier = values.hours === null || base <= 0 ? 0 : timeSpentModifier(values.hours, base);
  const summary = F("Encryption.Result", {
    standard: L(`Encryption.${values.standard}`),
    tl: values.tl,
    needed: encryptionComplexity(values.standard, values.tl),
    complexity: values.complexity,
    quantum: values.quantum ? L("Encryption.QuantumNote") : "",
    time,
  });
  await ChatMessage.implementation.create({
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Encryption.Title"))}</span></div><div class="gc-result">${esc(summary)}</div>`
      + (modifier ? `<div class="gc-result">${esc(F("Encryption.TimeModifier", { modifier: modifier > 0 ? `+${modifier}` : modifier }))}</div>` : "")
      + `</div>`,
    whisper: [...((game as any).users ?? [])].filter((user: any) => user.isGM).map((user: any) => user.id),
  });
  if (!actor) return;
  const level = api.actors.skillLevel(actor, "Cryptography");
  if (level === null) {
    ui.notifications?.warn(F("Encryption.NoSkill", { name: actor.name }));
    return;
  }
  await api.roll.success({
    actor,
    base: level,
    skill: "Cryptography",
    label: F("Encryption.RollLabel", { standard: L(`Encryption.${values.standard}`) }),
    modifiers: modifier ? [{ label: L("Encryption.TimeSpent"), value: modifier }] : [],
  } as any);
}

/** Registers the table-side parts: the engine's, if no other book has yet, and the encryption tool. */
export function readyComputers(api: GWorldApi, on: () => boolean): void {
  readyComputerEngine(api);

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-encryption",
    label: L("Encryption.Title"),
    icon: "fa-solid fa-key",
    visible: on,
    open: () => breakEncryption(api),
  });
}
