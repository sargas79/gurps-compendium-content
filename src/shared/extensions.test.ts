import { describe, expect, it, vi } from "vitest";

/** The collector is module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("./extensions.js");
}

describe("this module's data on the system's documents", () => {
  it("registers every book's fields for a document as one extension", async () => {
    const { addExtensionFields, registerExtensionFields } = await load();
    addExtensionFields("Actor", ["npc", "character"], { points: "points field" });
    addExtensionFields("Actor", ["character", "npc"], { ritualPath: "ritual field" });
    addExtensionFields("Item", ["equipment"], { holy: "holy field" });
    const registerDataExtension = vi.fn(() => "gurps-compendium-content");
    registerExtensionFields({ data: { registerDataExtension } } as never);
    expect(registerDataExtension.mock.calls).toEqual([
      [{ module: "gurps-compendium-content", documentName: "Actor", types: ["character", "npc"], schema: { points: "points field", ritualPath: "ritual field" } }],
      [{ module: "gurps-compendium-content", documentName: "Item", types: ["equipment"], schema: { holy: "holy field" } }],
    ]);
  });

  it("refuses a field added twice, and a set of types that overlaps another", async () => {
    const { addExtensionFields } = await load();
    addExtensionFields("Item", ["equipment"], { holy: 1 });
    expect(() => addExtensionFields("Item", ["equipment"], { holy: 2 })).toThrow(/added twice/);
    expect(() => addExtensionFields("Item", ["armor", "equipment"], { plating: 1 })).toThrow(/overlap/);
  });

  it("keeps fields for types that don't overlap as extensions of their own", async () => {
    const { addExtensionFields, registerExtensionFields } = await load();
    addExtensionFields("Item", ["equipment", "armor"], { power: "power field" });
    addExtensionFields("Item", ["template"], { robotBody: "robot field" });
    const registerDataExtension = vi.fn(() => "gurps-compendium-content");
    registerExtensionFields({ data: { registerDataExtension } } as never);
    expect(registerDataExtension.mock.calls).toEqual([
      [{ module: "gurps-compendium-content", documentName: "Item", types: ["armor", "equipment"], schema: { power: "power field" } }],
      [{ module: "gurps-compendium-content", documentName: "Item", types: ["template"], schema: { robotBody: "robot field" } }],
    ]);
  });

  it("builds a field given as a function when the fields are registered", async () => {
    const { addExtensionFields, registerExtensionFields } = await load();
    const sizes: string[] = ["A"];
    addExtensionFields("Item", ["equipment"], { computer: () => `computer field: ${sizes.join(", ")}` });
    // A book registering its table after the field was added still has it in the field.
    sizes.push("B");
    const registerDataExtension = vi.fn(() => "gurps-compendium-content");
    registerExtensionFields({ data: { registerDataExtension } } as never);
    expect(registerDataExtension.mock.calls).toEqual([
      [{ module: "gurps-compendium-content", documentName: "Item", types: ["equipment"], schema: { computer: "computer field: A, B" } }],
    ]);
  });
});
