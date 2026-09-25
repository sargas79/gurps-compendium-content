import { describe, expect, it } from "vitest";

import { computerFigures, conflictingOptions, modelByName } from "../../../shared/computers/rules.js";
import {
  ERA_COMPUTERS,
  INTERFACE_FAMILIARITY,
  complementaryModifier,
  interfaceLines,
  isLightPen,
  isProgramming,
  isStylus,
  lightPenStrain,
  sparesMachineCode,
  type InterfaceSetup,
} from "./rules.js";

const build = (model: string, options: Record<string, boolean> = {}, tl = 8) => computerFigures(ERA_COMPUTERS, { model, tl, options, lc: null });

describe("computer eras (HT:EE pp. 36-37)", () => {
  it("reads the size categories from the catalogue's names, and High-Tech's names for two of them", () => {
    expect(modelByName(ERA_COMPUTERS, "Workstation")).toBe("workstation");
    expect(modelByName(ERA_COMPUTERS, "Minicomputer")).toBe("minicomputer");
    expect(modelByName(ERA_COMPUTERS, "Macroframe")).toBe("macroframe");
    expect(modelByName(ERA_COMPUTERS, "Medium Computer")).toBe("medium");
    expect(modelByName(ERA_COMPUTERS, "Microframe Computer")).toBe("microframe");
    expect(modelByName(ERA_COMPUTERS, "Mainframe Computer")).toBe("mainframe");
    expect(modelByName(ERA_COMPUTERS, "Workstation Terminal")).toBeNull();
  });

  it("gives the sizes Complexity 7 down to 1 as standard-VLSI machines of TL8", () => {
    expect(["megacomputer", "macroframe", "minicomputer", "workstation", "medium", "small", "tiny"].map((m) => build(m).complexity)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(build("workstation", { standardVlsi: true })).toMatchObject({ complexity: 4, tl: 8, problems: [] });
  });

  it("works out the book's own example: a compact, slow, early-VLSI workstation", () => {
    // The first IBM PC: Complexity 2, $1,000 and 20 lbs. from the workstation's $10,000 and 40 lbs.
    const pc = build("workstation", { compact: true, slow: true, earlyVlsi: true });
    expect(pc.complexity).toBe(2);
    expect(10_000 * pc.costFactor).toBeCloseTo(1_000);
    expect(40 * pc.weightFactor).toBe(20);
  });

  it("gives the Blue Gene of the sidebar Complexity 9: a fast advanced-VLSI macroframe", () => {
    expect(build("macroframe", { fast: true, advancedVlsi: true }).complexity).toBe(9);
  });

  it("shifts Complexity by each basic technology", () => {
    const shifts = ["electromechanical", "vacuumTube", "transistor", "msi", "lsi", "earlyVlsi", "standardVlsi", "lateVlsi", "advancedVlsi"]
      .map((era) => build("megacomputer", { [era]: true }, 8).complexity - 7);
    expect(shifts).toEqual([-5, -4, -4, -3, -2, -1, 0, 1, 2]);
  });

  it("builds a TL7 computer with a TL7 technology, in kilobytes", () => {
    expect(build("minicomputer", { msi: true }, 7)).toMatchObject({ complexity: 2, tl: 7, storageUnit: "KB", problems: [] });
    // The record's TL7 and no technology: the sheet asks for one.
    expect(build("minicomputer", {}, 7).problems).toEqual(["needsEarly"]);
    // A tiny computer isn't built with LSI.
    expect(build("tiny", { lsi: true }, 7).problems).toContain("modelTooLate");
  });

  it("makes a transistor computer compact, and an electromechanical or vacuum-tube one hardened, at no extra cost", () => {
    expect(build("workstation", { transistor: true }, 7)).toMatchObject({ weightFactor: 0.5, costFactor: 1 });
    expect(conflictingOptions(ERA_COMPUTERS, { transistor: true, compact: true }, 7)).toEqual(["compact"]);
    expect(build("workstation", { vacuumTube: true, hardened: true }, 7)).toMatchObject({ hardening: 3, costFactor: 1, weightFactor: 1 });
    expect(build("workstation", { electromechanical: true }, 7)).toMatchObject({ complexity: 0, hardening: 3 });
    expect(conflictingOptions(ERA_COMPUTERS, { msi: true, lsi: true }, 7)).toEqual(["lsi"]);
  });

  it("prices dedicated hardware at half and weighs it at a fifth", () => {
    expect(build("medium", { dedicated: true })).toMatchObject({ costFactor: 0.5, weightFactor: 0.2, complexity: 3 });
  });
});

describe("digital interfaces (HT:EE pp. 39-41)", () => {
  const setup = (patch: Partial<InterfaceSetup>): InterfaceSetup => ({ interface: "touch", touch: "desktop", multitouch: true, voiceTrained: false, ...patch });
  const values = (lines: Array<{ key: string; value: number }>) => lines.map((l) => [l.key, l.value]);
  const operation = { computerOperation: true, stylus: false };

  it("makes each interface a familiarity, at -2 until learned", () => {
    expect(values(interfaceLines(setup({ interface: "text" }), 3, operation, () => false))).toEqual([["unfamiliar", -2]]);
    expect(interfaceLines(setup({ interface: "text" }), 3, operation, (n) => n === INTERFACE_FAMILIARITY.text)).toEqual([]);
    // Without the familiarity rule, no line.
    expect(interfaceLines(setup({ interface: "text" }), 3, operation, null)).toEqual([]);
  });

  it("drives only an interface the computer's Complexity reaches", () => {
    expect(interfaceLines(setup({ interface: "voice" }), 3, operation, () => false)).toEqual([]);
    expect(values(interfaceLines(setup({ interface: "voice", voiceTrained: true }), 4, operation, null))).toEqual([["voice", -2]]);
    expect(interfaceLines(setup({ interface: "bci" }), 5, operation, null)).toEqual([]);
    expect(values(interfaceLines(setup({ interface: "bci" }), 6, operation, null))).toEqual([["bci", -2]]);
  });

  it("gives a touch screen's modifier to Computer Operation by size and touch", () => {
    const touch = (size: InterfaceSetup["touch"], multitouch: boolean) => values(interfaceLines(setup({ touch: size, multitouch }), 3, operation, null));
    expect(touch("desktop", true)).toEqual([["touch", 1]]);
    expect(touch("desktop", false)).toEqual([]);
    expect(touch("tablet", true)).toEqual([]);
    expect(touch("tablet", false)).toEqual([["touch", -1]]);
    expect(touch("phone", true)).toEqual([["touch", -1]]);
    expect(touch("phone", false)).toEqual([["touch", -2]]);
    // Not on another skill.
    expect(interfaceLines(setup({ touch: "phone" }), 3, { computerOperation: false, stylus: false }, null)).toEqual([]);
  });

  it("works a stylus single-touch at +1, where that beats the bare screen", () => {
    expect(values(interfaceLines(setup({ touch: "phone", multitouch: false }), 3, { computerOperation: true, stylus: true }, null))).toEqual([["touch", -2], ["stylus", 1]]);
    // A multitouch desktop screen already gives +1: the stylus adds nothing.
    expect(values(interfaceLines(setup({ touch: "desktop", multitouch: true }), 3, { computerOperation: true, stylus: true }, null))).toEqual([["touch", 1]]);
  });

  it("puts an early touch screen, before 1988, at -2 on every roll through it (HT:EE p. 40)", () => {
    expect(values(interfaceLines(setup({ touch: "desktop", multitouch: false, earlyTouch: true }), 3, { computerOperation: true, stylus: false }, null))).toEqual([["earlyTouch", -2]]);
    expect(values(interfaceLines(setup({ touch: "tablet", multitouch: false, earlyTouch: true }), 3, { computerOperation: false, stylus: false }, null))).toEqual([["earlyTouch", -2]]);
    expect(values(interfaceLines(setup({ interface: "voice", earlyTouch: true, voiceTrained: true }), 4, { computerOperation: true, stylus: false }, null))).toEqual([["voice", -2]]);
  });

  it("puts voice control at -2, and -2 more until trained", () => {
    expect(values(interfaceLines(setup({ interface: "voice" }), 4, operation, null))).toEqual([["voice", -2], ["voiceUntrained", -2]]);
  });

  it("tires the arm holding a light pen: 1 FP on a failure, and 1 HP on a critical failure", () => {
    expect(lightPenStrain({ success: true })).toEqual({ fp: 0, hp: 0 });
    expect(lightPenStrain({ success: false })).toEqual({ fp: 1, hp: 0 });
    expect(lightPenStrain({ success: false, criticalFailure: true })).toEqual({ fp: 1, hp: 1 });
  });

  it("knows the catalogue's interface records by name", () => {
    expect(isLightPen("Light Pen")).toBe(true);
    expect(isLightPen("Pen Flare")).toBe(false);
    expect(isStylus("Stylus")).toBe(true);
    expect(isStylus("Ballpoint Pen")).toBe(false);
  });
});

describe("programs and languages (HT:EE p. 38)", () => {
  it("rolls Computer Operation as a complementary skill: +1, +2, -1, -2", () => {
    expect(complementaryModifier({ success: true })).toBe(1);
    expect(complementaryModifier({ success: true, criticalSuccess: true })).toBe(2);
    expect(complementaryModifier({ success: false })).toBe(-1);
    expect(complementaryModifier({ success: false, criticalFailure: true })).toBe(-2);
  });

  it("spares Eidetic Memory, of either level, machine code's penalty", () => {
    expect(sparesMachineCode("Eidetic Memory")).toBe(true);
    expect(sparesMachineCode("Photographic Memory")).toBe(true);
    expect(sparesMachineCode("Absent-Mindedness")).toBe(false);
  });

  it("knows Computer Programming at any TL", () => {
    expect(isProgramming("Computer Programming/TL7")).toBe(true);
    expect(isProgramming("Computer Operation/TL8")).toBe(false);
  });
});
