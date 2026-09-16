/**
 * This module's data on the system's documents, gathered from every book and
 * registered once.
 *
 * The system takes one data extension per module for each document type, and
 * refuses a second that overlaps it; extensions on types that don't overlap
 * -- armour and equipment in one, templates in another -- stand side by side. Several books (and several rules in one
 * book) keep fields on characters and equipment, so each adds its fields here
 * during `init`, and `registerExtensionFields` registers them together once
 * every book has had its turn.
 */

import { MODULE_ID, type GWorldApi } from "./module.js";

type DocumentName = "Actor" | "Item";

/** The item types every book's Item fields are on, since the system takes one extension per document. */
export const ITEM_EXTENSION_TYPES = ["armor", "equipment"] as const;

interface PendingExtension {
  documentName: DocumentName;
  types: string[];
  schema: Record<string, unknown>;
}

const pending = new Map<string, PendingExtension>();

/**
 * Adds fields to this module's data on these document types. Additions for
 * the same set of types become one extension; a set that shares some types
 * with another but not all is refused, since the system would refuse the
 * overlap. No field name may be used twice for one set.
 */
export function addExtensionFields(documentName: DocumentName, types: readonly string[], schema: Record<string, unknown>): void {
  const sorted = [...types].sort();
  const key = `${documentName}:${sorted.join(",")}`;
  const overlapping = [...pending.entries()].find(([other, p]) => other !== key && p.documentName === documentName && p.types.some((t) => sorted.includes(t)));
  if (overlapping) {
    throw new Error(`${MODULE_ID} | ${documentName} extension fields for ${sorted.join(", ")} overlap those for ${overlapping[1].types.join(", ")}`);
  }
  const entry = pending.get(key) ?? { documentName, types: sorted, schema: {} };
  for (const [name, field] of Object.entries(schema)) {
    if (name in entry.schema) throw new Error(`${MODULE_ID} | ${documentName} extension field "${name}" is added twice`);
    entry.schema[name] = field;
  }
  pending.set(key, entry);
}

/** Registers what the books added, one extension per document. */
export function registerExtensionFields(api: GWorldApi): void {
  for (const entry of pending.values()) {
    const registered = api.data.registerDataExtension({ module: MODULE_ID, documentName: entry.documentName, types: entry.types, schema: entry.schema });
    if (!registered) console.error(`${MODULE_ID} | the ${entry.documentName} data extension was refused`);
  }
  pending.clear();
}
