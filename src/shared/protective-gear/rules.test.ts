import { describe, expect, it } from "vitest";

import { figureAtTl, mergeProtection, protectionWornIn, type GearTable } from "./rules.js";

describe("the shared protective gear engine", () => {
  const table: GearTable = [
    [/^suit$/i, { alone: { comfort: { coldF: 60, heatF: 60 } }, completedBy: { pieces: /^helmet$/i, key: "helmet", grants: { sealed: true } } }],
    [/^helmet$/i, { alone: { filter: true, restrictedVision: "noPeripheral" } }],
  ];

  it("reads a book's table, completing a suit with the piece that seals it", () => {
    expect(protectionWornIn(table, "Suit (TL 7)", [])).toEqual({ comfort: { coldF: 60, heatF: 60 } });
    expect(protectionWornIn(table, "Suit", ["Helmet"])).toEqual({ sealed: true, comfort: { coldF: 60, heatF: 60 } });
    expect(protectionWornIn(table, "Vest", ["Helmet"])).toBeNull();
  });

  it("keeps the worse limit on sight and the better of everything else", () => {
    expect(mergeProtection({ restrictedVision: "noPeripheral" }, { restrictedVision: "tunnel", noSmellTaste: true })).toEqual({ restrictedVision: "tunnel", noSmellTaste: true });
    expect(mergeProtection({ comfort: { coldF: 60, heatF: 0 } }, { comfort: { coldF: 10, heatF: 30 } })).toEqual({ comfort: { coldF: 60, heatF: 30 } });
  });

  it("reads a row printed by TL, holding the TL to the row", () => {
    expect(figureAtTl([12, 22, 45], 6, 7)).toBe(22);
    expect(figureAtTl([12, 22, 45], 6, 3)).toBe(12);
    expect(figureAtTl([12, 22, 45], 6, 12)).toBe(45);
  });
});
