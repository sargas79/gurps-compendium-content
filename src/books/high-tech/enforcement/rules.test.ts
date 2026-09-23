import { describe, expect, it } from "vitest";

import { CUFFED, RESTRAINTS, detectorShare, legIronsEscape, restraintKind } from "./rules.js";

describe("High-Tech's lie detectors (pp. 215-216)", () => {
  it("gives a polygraph's whole margin and a voice stress analyser's half", () => {
    expect(detectorShare("Polygraph (TL6)")).toBe(1);
    expect(detectorShare("Polygraph (TL8)")).toBe(1);
    expect(detectorShare("VSA")).toBe(0.5);
    expect(detectorShare("CVSA Software")).toBe(0.5);
    expect(detectorShare("Voiceprint Analyzer")).toBeNull();
  });
});

describe("High-Tech's restraints (p. 217)", () => {
  it("reads the captured records", () => {
    expect(restraintKind("Shackles")).toBe("shackles");
    expect(restraintKind("Handcuffs")).toBe("handcuffs");
    expect(restraintKind("Flex Cuffs (pack of 10)")).toBe("flexCuffs");
    expect(restraintKind("Leg Irons")).toBe("legIrons");
    expect(restraintKind("Leg Irons (Ball and Chain)")).toBe("legIrons");
    expect(restraintKind("Straitjacket")).toBe("straitjacket");
    expect(restraintKind("Electronic Cuffs")).toBeNull();
  });

  it("prints each one's Escape modifier, DR and HP", () => {
    expect(RESTRAINTS.shackles).toMatchObject({ escape: 0, dr: 4, hp: 10, binds: "wrists" });
    expect(RESTRAINTS.handcuffs).toMatchObject({ escape: -5, dr: 4, hp: 6, binds: "wrists" });
    expect(RESTRAINTS.flexCuffs).toMatchObject({ escape: -1, dr: 1, hp: 2, binds: "wrists" });
    expect(RESTRAINTS.straitjacket).toMatchObject({ escape: -10, binds: "body", slip: false, noHands: true });
    expect(RESTRAINTS.legIrons.binds).toBe("legs");
  });

  it("makes TL6-8 leg irons ratcheting, at Escape-5", () => {
    expect(legIronsEscape(5)).toBe(0);
    expect(legIronsEscape(null)).toBe(0);
    expect(legIronsEscape(6)).toBe(-5);
    expect(legIronsEscape(8)).toBe(-5);
  });

  it("costs -1 DX and -4 on hand tasks behind the back, -1 on hand tasks in front", () => {
    expect(CUFFED.behind).toEqual({ dx: -1, hands: -4, weapons: "none" });
    expect(CUFFED.front).toEqual({ dx: 0, hands: -1, weapons: "twoHanded" });
  });
});
