/**
 * A book's text in the system's compendium picker.
 *
 * The picker lists entries by name and a line of statistics. With this module
 * in play, a row whose entry carries book text gets its name marked as a link:
 * hovering or focusing it shows the text in Foundry's tooltip, and clicking it
 * opens the entry's (read-only) sheet.
 *
 * Nothing is loaded to draw the list. Which entries have text is a flag the
 * build stamps on each document, read once per pack from its index; the text
 * itself is loaded only when a name is hovered, and kept while the picker is
 * open. The rows are found through the attributes the system gives modules for
 * that (API 1.41.0), never through its class names.
 */

import { MODULE_ID } from "./module.js";

/** The flag the build sets on a document whose book text isn't empty. */
export const HAS_TEXT_FLAG = "hasText";

/** The UUIDs in one pack's index whose entries carry book text. */
export function textUuids(collection: string, index: Iterable<{ _id: string; flags?: Record<string, any> }>): string[] {
  const out: string[] = [];
  for (const entry of index) {
    if (entry?.flags?.[MODULE_ID]?.[HAS_TEXT_FLAG] === true) out.push(`Compendium.${collection}.Item.${entry._id}`);
  }
  return out;
}

let withText: Promise<Set<string>> | null = null;

/** Every Item entry in this module's packs with book text, read from the packs' indexes once. */
function entriesWithText(): Promise<Set<string>> {
  withText ??= (async () => {
    const uuids = new Set<string>();
    for (const pack of (game as any).packs ?? []) {
      if (pack?.documentName !== "Item" || pack.metadata?.packageName !== MODULE_ID) continue;
      const index = await pack.getIndex({ fields: [`flags.${MODULE_ID}.${HAS_TEXT_FLAG}`] });
      for (const uuid of textUuids(String(pack.collection), index)) uuids.add(uuid);
    }
    return uuids;
  })();
  return withText;
}

/** Shows an entry's text beside its name, loading it the first time it is asked for. */
async function showText(name: HTMLElement, uuid: string, texts: Map<string, Promise<string>>): Promise<void> {
  if (!texts.has(uuid)) {
    texts.set(uuid, (async () => {
      const doc: any = await (globalThis as any).fromUuid(uuid);
      const text = String(doc?.system?.description ?? "").trim();
      return text ? String(await (foundry.applications as any).ux.TextEditor.implementation.enrichHTML(text)) : "";
    })());
  }
  const html = await texts.get(uuid)!;
  // The pointer may have moved on while the text loaded.
  if (!html || !(name.matches(":hover") || document.activeElement === name)) return;
  const box = document.createElement("div");
  box.style.maxWidth = "420px";
  box.style.maxHeight = "320px";
  box.style.overflowY = "auto";
  box.style.textAlign = "left";
  box.innerHTML = html;
  (game as any).tooltip?.activate(name, { html: box, direction: "RIGHT" });
}

/** Marks the picker's names that have text, each time it is drawn. */
export function readyPickerText(): void {
  // The picker's texts, kept while that picker is open.
  const cache = new WeakMap<object, Map<string, Promise<string>>>();
  Hooks.on("renderCompendiumPicker", async (app: any, element: HTMLElement) => {
    const root: HTMLElement | null = element instanceof HTMLElement ? element : ((app?.element as HTMLElement | undefined) ?? null);
    if (!root) return;
    const uuids = await entriesWithText();
    if (!cache.has(app)) cache.set(app, new Map());
    const texts = cache.get(app)!;
    for (const row of root.querySelectorAll<HTMLElement>("[data-picker-row][data-uuid]")) {
      const uuid = String(row.dataset.uuid ?? "");
      const name = row.querySelector<HTMLElement>("[data-picker-name]");
      if (!name || !uuids.has(uuid) || name.dataset.gccText) continue;
      name.dataset.gccText = "1";
      name.tabIndex = 0;
      name.setAttribute("role", "link");
      name.style.cursor = "pointer";
      name.style.textDecoration = "underline dotted";
      name.style.textUnderlineOffset = "3px";
      const show = () => void showText(name, uuid, texts);
      const hide = () => (game as any).tooltip?.deactivate();
      name.addEventListener("pointerenter", show);
      name.addEventListener("focus", show);
      name.addEventListener("pointerleave", hide);
      name.addEventListener("blur", hide);
      const open = async () => {
        hide();
        const doc: any = await (globalThis as any).fromUuid(uuid);
        doc?.sheet?.render({ force: true });
      };
      name.addEventListener("click", () => void open());
      name.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") void open();
      });
    }
  });
}
