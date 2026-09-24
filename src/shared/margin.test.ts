import { describe, expect, it } from "vitest";

import { marginOfFailure } from "./margin.js";

describe("a failed roll's margin, by its size (#539)", () => {
  it("reads a signed and an unsigned margin the same", () => {
    expect(marginOfFailure(-3)).toBe(3);
    expect(marginOfFailure(3)).toBe(3);
    expect(marginOfFailure(-12)).toBe(12);
  });

  it("gives nothing for no margin, or none that can be read", () => {
    expect(marginOfFailure(0)).toBe(0);
    expect(marginOfFailure(undefined)).toBe(0);
    expect(marginOfFailure("x")).toBe(0);
  });

  it("counts whole points", () => {
    expect(marginOfFailure(-2.7)).toBe(2);
    expect(marginOfFailure("4")).toBe(4);
  });
});
