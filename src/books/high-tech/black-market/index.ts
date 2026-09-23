/**
 * The black market (pp. 7-9), registered with the system through the add-on
 * API under the blackMarket switch: a GM tool for the buyer the GM has
 * selected. It asks who searches -- a Contact at his effective Streetwise, or
 * the buyer's own -- where, in which niche, and for what; rolls the search in
 * secret at the Control Rating the campaign keeps (API 1.77.0), with the
 * place's modifiers, and whispers the GM what came of it: the niche's
 * trouble on a failure, and the price, black-market, used or old stock
 * (p. 10). Outlawed goods it leaves to an adventure. The rules are in
 * `rules.ts`.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  MARKETS,
  blackMarketModifiers,
  blackMarketPrice,
  conditionPrice,
  findingOf,
  isOutlawed,
  type BlackMarketSearch,
  type Condition,
  type Market,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.BlackMarket.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.BlackMarket.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Streetwise defaults to IQ-5 (Characters p. 223). */
const STREETWISE_DEFAULT = -5;

/** What the GM asked for. */
export interface BlackMarketRequest extends BlackMarketSearch {
  /** A Contact's effective Streetwise, or null for the buyer's own. */
  contactSkill: number | null;
  unfamiliarCulture: boolean;
  market: Market;
  sought: string;
  listPrice: number;
  lc: number | null;
  copied: boolean;
  hardToGetLegally: boolean;
  condition: Condition;
}

/** The buyer: the one selected token's actor. */
function buyer(): any {
  const selected = ((globalThis as any).canvas?.tokens?.controlled ?? []).map((t: any) => t.actor).filter(Boolean);
  return selected.length === 1 ? selected[0] : null;
}

/** The Streetwise the search is rolled against: the Contact's, else the buyer's, at default where unlearned. */
export function searchSkill(api: GWorldApi, actor: any, contactSkill: number | null): number {
  if (typeof contactSkill === "number" && Number.isFinite(contactSkill)) return contactSkill;
  const own = api.actors.skillLevel(actor, "Streetwise");
  if (typeof own === "number") return own;
  return (Number(api.actors.attribute(actor, "IQ")) || 10) + STREETWISE_DEFAULT;
}

/** The lines the roll takes, labelled, with Cultural Familiarity read off the buyer's traits. */
export function searchLines(api: GWorldApi, actor: any, request: BlackMarketRequest): Array<{ label: string; value: number }> {
  const traits = [...(actor?.items ?? [])].filter((i: any) => i?.type === "trait").map((i: any) => ({ name: String(i.name ?? "") }));
  const culture = api.rules.culturePenalty(request.unfamiliarCulture, traits);
  return blackMarketModifiers({ ...request, culture }).map((line) => ({
    label: line.key === "controlRating" ? F("Line.controlRating", { rating: -line.value }) : L(`Line.${line.key}`),
    value: line.value,
  }));
}

/** The price lines of the card, where a legal price was given. */
export function priceLines(request: BlackMarketRequest): string[] {
  const price = Math.max(0, Number(request.listPrice) || 0);
  if (!price) return [];
  const lines: string[] = [];
  const black = blackMarketPrice(price, { copied: request.copied, hardToGetLegally: request.hardToGetLegally });
  lines.push(black === null ? L("PriceGm") : F("Price", { price: black, list: price, share: request.copied ? 5 : 60 }));
  if (request.condition !== "new") {
    // Used and old stock go by the new price, whatever the market (p. 10).
    const range = conditionPrice(price, request.condition);
    lines.push(F(`Condition.${request.condition}`, range));
  }
  return lines;
}

/** Rolls the search in secret and whispers the GM what came of it. */
export async function searchBlackMarket(api: GWorldApi, actor: any, request: BlackMarketRequest): Promise<"outlawed" | ReturnType<typeof findingOf>> {
  const gm = ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id);
  const head = `<div class="gc-head"><span class="gc-label">${esc(L("Title"))}</span><span class="gc-target">${esc(request.sought || L(`Market.${request.market}`))}</span></div>`;
  if (isOutlawed(request.lc)) {
    await ChatMessage.implementation.create({
      whisper: gm,
      content: `<div class="gworld gworld-chat">${head}<div class="gc-result">${esc(L("Outlawed"))}</div></div>`,
    });
    return "outlawed";
  }
  const skill = searchSkill(api, actor, request.contactSkill);
  const lines = searchLines(api, actor, request);
  const effective = skill + lines.reduce((sum, l) => sum + l.value, 0);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice?.[0]?.results ?? []).map((r: any) => Number(r.result));
  const finding = findingOf(api.rules.resolveSuccess(roll.total, effective, dice));
  const outcome = finding === "found"
    ? L(request.gray ? "FoundGray" : "Found")
    : L(`Outcome.${request.market}.${finding}`) + (request.gray ? ` ${L("GrayLighter")}` : "");
  const who = request.contactSkill === null ? F("Buyer", { name: actor?.name ?? "" }) : L("Contact");
  await ChatMessage.implementation.create({
    whisper: gm,
    rolls: [roll],
    content: `<div class="gworld gworld-chat">${head}
      <div class="gc-result">${esc(F("Rolled", { who, skill, effective, roll: roll.total }))}</div>
      ${lines.map((l) => `<div class="gc-result">${esc(`${l.label} ${l.value >= 0 ? "+" : ""}${l.value}`)}</div>`).join("")}
      <div class="gc-result"><strong>${esc(L(`Finding.${finding}`))}</strong>: ${esc(outcome)}</div>
      ${finding === "found" ? priceLines(request).map((p) => `<div class="gc-result">${esc(p)}</div>`).join("") : ""}</div>`,
  });
  return finding;
}

/** The GM tool's dialog. */
async function openBlackMarket(api: GWorldApi): Promise<void> {
  if (!game.user?.isGM) return;
  const actor = buyer();
  if (!actor) return void ui.notifications?.warn(L("SelectBuyer"));
  const rating = api.world.controlRating().rating;
  const checkbox = (name: string, label: string) => `<label class="icheck"><input type="checkbox" name="${name}"> ${esc(label)}</label>`;
  const request = (await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld"><p class="ihint">${esc(F("Hint", { name: actor.name }))}</p>
      <div class="ifields">
        <label>${esc(L("Sought"))} <input type="text" name="sought" value=""></label>
        <label>${esc(L("MarketLabel"))} <select name="market">${MARKETS.map((m) => `<option value="${m}">${esc(L(`Market.${m}`))}</option>`).join("")}</select></label>
        <label data-tooltip="${esc(L("ContactHint"))}">${esc(L("ContactSkill"))} <input type="number" name="contact" value="" step="1"></label>
        <label>${esc(L("ControlRating"))} <input type="number" name="rating" value="${rating ?? 0}" min="0" max="6" step="1"></label>
        <label>${esc(L("ListPrice"))} <input type="number" name="price" value="0" min="0" step="any"></label>
        <label>${esc(L("Lc"))} <select name="lc"><option value="">${esc(L("NoLc"))}</option>${[0, 1, 2, 3, 4].map((lc) => `<option value="${lc}">LC${lc}</option>`).join("")}</select></label>
        <label>${esc(L("ConditionLabel"))} <select name="condition">${(["new", "used", "old"] as const).map((c) => `<option value="${c}">${esc(L(`ConditionName.${c}`))}</option>`).join("")}</select></label>
      </div>
      <div class="ichecks" style="flex-direction:column;align-items:flex-start">
        ${checkbox("gray", L("Gray"))}
        ${checkbox("culture", L("UnfamiliarCulture"))}
        ${checkbox("favourable", L("FavourableArea"))}
        ${checkbox("unfamiliar", L("UnfamiliarArea"))}
        ${checkbox("copied", L("Copied"))}
        ${checkbox("hard", L("HardToGet"))}
      </div></div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
        const checked = (name: string) => Boolean(form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked);
        const contact = value("contact").trim();
        const lc = value("lc");
        return {
          sought: value("sought").trim(),
          market: (MARKETS as readonly string[]).includes(value("market")) ? value("market") as Market : "general",
          contactSkill: contact === "" ? null : Number(contact),
          controlRating: Number(value("rating")) || 0,
          culture: 0,
          unfamiliarCulture: checked("culture"),
          favourableArea: checked("favourable"),
          unfamiliarArea: checked("unfamiliar"),
          gray: checked("gray"),
          listPrice: Number(value("price")) || 0,
          lc: lc === "" ? null : Number(lc),
          copied: checked("copied"),
          hardToGetLegally: checked("hard"),
          condition: (["new", "used", "old"].includes(value("condition")) ? value("condition") : "new") as Condition,
        };
      },
    },
    rejectClose: false,
  })) as BlackMarketRequest | null;
  if (!request) return;
  await searchBlackMarket(api, actor, request);
}

export function readyBlackMarket(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-black-market",
    label: L("Title"),
    icon: "fa-solid fa-mask",
    visible: on,
    open: () => openBlackMarket(api),
  } as any);
}
