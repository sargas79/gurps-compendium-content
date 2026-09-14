/**
 * This module's data on the system's documents, gathered from every book and
 * registered once.
 *
 * The system takes one data extension per module for each document type, and
 * refuses a second that overlaps it. Several books (and several rules in one
 * book) keep fields on characters and equipment, so each adds its fields here
 * during `init`, and `registerExtensionFields` registers them together once
 * every book has had its turn.
 */

import { MODULE_ID, type GWorldApi } from "./module.js";

type DocumentName = "Actor" | "Item";

interface PendingExtension {
  documentName: DocumentName;
  types: string[];
  schema: Record<string, unknown>;
}

const pending = new Map<string, PendingExtension>();

/**
 * Adds fields to this module's data on these document types. Every addition
 * for the same document must name the same types, and no field name may be
 * used twice.
 */
export function addExtensionFields(documentName: DocumentName, types: readonly string[], schema: Record<string, unknown>): void {
  const sorted = [...types].sort();
  const same = [...pending.values()].find((p) => p.documentName === documentName);
  if (same && same.types.join(",") !== sorted.join(",")) {
    throw new Error(`${MODULE_ID} | ${documentName} extension fields must all be for ${same.types.join(", ")}, not ${sorted.join(", ")}`);
  }
  const entry = same ?? { documentName, types: sorted, schema: {} };
  for (const [name, field] of Object.entries(schema)) {
    if (name in entry.schema) throw new Error(`${MODULE_ID} | ${documentName} extension field "${name}" is added twice`);
    entry.schema[name] = field;
  }
  pending.set(documentName, entry);
}

/** Registers what the books added, one extension per document. */
export function registerExtensionFields(api: GWorldApi): void {
  for (const entry of pending.values()) {
    const registered = api.data.registerDataExtension({ module: MODULE_ID, documentName: entry.documentName, types: entry.types, schema: entry.schema });
    if (!registered) console.error(`${MODULE_ID} | the ${entry.documentName} data extension was refused`);
  }
  pending.clear();
}
