import { describe, expect, it } from "vitest";

import { textUuids } from "./picker-text.js";

describe("book text in the compendium picker", () => {
  it("links only the entries the build marked as having text", () => {
    const index = [
      { _id: "a", flags: { "gurps-compendium-content": { hasText: true } } },
      { _id: "b", flags: { "gurps-compendium-content": { status: "no-entry" } } },
      { _id: "c" },
    ];
    expect(textUuids("gurps-compendium-content.basic-set-skills", index)).toEqual(["Compendium.gurps-compendium-content.basic-set-skills.Item.a"]);
  });
});
