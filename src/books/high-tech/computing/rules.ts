/**
 * The Electricity and Electronics supplement's computers (HT:EE pp. 36-41),
 * which extend High-Tech's (pp. 19-22).
 *
 * **Eras.** High-Tech gives every TL8 computer the same Complexity; the
 * supplement follows the integrated circuit through TL8 instead. Its seven
 * size categories keep their Complexity 7 down to 1 for a standard-VLSI
 * machine, and the basic technology a computer is built with shifts it: an
 * electromechanical computer -5, a vacuum-tube or transistor one -4, MSI -3,
 * LSI -2, early VLSI -1, late VLSI +1 and advanced VLSI +2. The customized
 * hardware is High-Tech's, with one more option: dedicated hardware, whose
 * programs are built in (HT:EE p. 37). A vacuum-tube computer rolls HT every
 * day, and a failure burns out a tube, which takes a minor repair.
 *
 * **Interfaces.** Each way of working a computer -- text, a pointer, a touch
 * screen, virtual reality, the voice, the brain -- is a familiarity of its
 * own, at -2 until learned, and a computer drives only those its Complexity
 * reaches. Touch screens, voice control and brain-computer interfaces each
 * cost or give skill, and a light pen tires the arm (HT:EE pp. 39-41).
 *
 * **Programming.** Machine code is -5 to Computer Programming, which time
 * spent can buy off and Eidetic Memory avoids; a high-level language spares
 * the programmer the penalty for a machine they don't know. Computer
 * Operation is a complementary skill to Computer Programming. A dedicated
 * machine is "programmed" by designing its circuits with Engineer
 * (Electronics), at -2 without familiarity with digital circuits, rewired
 * for a program with Electronics Repair (Computers), or set up by its jacks
 * and switches with Computer Operation (HT:EE p. 38).
 */

import type { ComputerFigures, OptionEffect } from "../../../shared/computers/rules.js";
import { COMPUTERS } from "../information/rules.js";

/** What a success roll came to, as the system's roll gives it. */
export interface RollOutcome {
  success: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
}

// ── eras (HT:EE pp. 36-37) ─────────────────────────────────────────────────

/**
 * The size categories, smallest first (HT:EE p. 37). The supplement renames
 * two of High-Tech's (p. 20): its workstation and minicomputer are the sizes
 * High-Tech calls the microframe and the mainframe, which stay as other
 * names for them so High-Tech's records keep reading.
 */
export const ERA_MODELS = ["tiny", "small", "medium", "workstation", "microframe", "minicomputer", "mainframe", "macroframe", "megacomputer"] as const;
export type EraModel = (typeof ERA_MODELS)[number];

/**
 * Each size's Complexity at standard VLSI and the TL it first appears at
 * (HT:EE p. 37). The supplement gives no storage, so each takes High-Tech's
 * for the model of its Complexity (p. 20).
 */
export const ERA_MODEL_FIGURES: Readonly<Record<EraModel, { complexity: number; storage: number; tl: number }>> = Object.freeze({
  tiny: { complexity: 1, storage: 1, tl: 8 },
  small: { complexity: 2, storage: 10, tl: 8 },
  medium: { complexity: 3, storage: 100, tl: 7 },
  workstation: { complexity: 4, storage: 1_000, tl: 7 },
  microframe: { complexity: 4, storage: 1_000, tl: 7 },
  minicomputer: { complexity: 5, storage: 10_000, tl: 7 },
  mainframe: { complexity: 5, storage: 10_000, tl: 7 },
  macroframe: { complexity: 6, storage: 100_000, tl: 7 },
  megacomputer: { complexity: 7, storage: 1_000_000, tl: 7 },
});

/** The basic technologies, oldest first (HT:EE p. 37). */
export const BASIC_TECHNOLOGIES = ["electromechanical", "vacuumTube", "transistor", "msi", "lsi", "earlyVlsi", "standardVlsi", "lateVlsi", "advancedVlsi"] as const;

/** The customized hardware (HT:EE p. 37). */
export const CUSTOM_HARDWARE = ["compact", "dedicated", "hardened", "highCapacity", "fast", "slow"] as const;

/** Every design option: the fifteen of the Computer-Design Options table. */
export const ERA_OPTIONS = [...BASIC_TECHNOLOGIES, ...CUSTOM_HARDWARE] as const;
export type EraOption = (typeof ERA_OPTIONS)[number];

/** The basic technologies below TL8, one of which a TL7 computer is built with (HT:EE p. 37). */
export const TL7_TECHNOLOGIES: readonly EraOption[] = Object.freeze(["electromechanical", "vacuumTube", "transistor", "msi", "lsi"]);

/**
 * Each option's changes and the TL it is first built at (HT:EE p. 37). A
 * basic technology sets the TL the computer is built at; cost and weight
 * factors multiply together; Complexity adds.
 */
export const ERA_EFFECTS: Readonly<Record<EraOption, OptionEffect>> = Object.freeze({
  // Hardened at no extra cost.
  electromechanical: { complexity: -5, hardening: 3, tl: 7, buildTl: 7 },
  // Hardened at no extra cost; its tubes burn out (below).
  vacuumTube: { complexity: -4, hardening: 3, tl: 7, buildTl: 7 },
  // Compact at no extra cost: half the weight, not twice the price.
  transistor: { complexity: -4, weight: 0.5, tl: 7, buildTl: 7 },
  msi: { complexity: -3, tl: 7, buildTl: 7 },
  lsi: { complexity: -2, tl: 7, buildTl: 7 },
  earlyVlsi: { complexity: -1, tl: 8, buildTl: 8 },
  standardVlsi: { tl: 8, buildTl: 8 },
  lateVlsi: { complexity: 1, tl: 8, buildTl: 8 },
  advancedVlsi: { complexity: 2, tl: 8, buildTl: 8 },
  compact: { cost: 2, weight: 0.5, tl: 7 },
  // Its programs can't be changed (p. 38).
  dedicated: { cost: 0.5, weight: 0.2, tl: 7 },
  hardened: { cost: 2, weight: 2, hardening: 3, tl: 7 },
  highCapacity: { cost: 1.5, programs: 1.5, tl: 7 },
  fast: { complexity: 1, cost: 20, tl: 8 },
  slow: { complexity: -1, cost: 1 / 20, tl: 8 },
});

/**
 * The options that can't be taken together, the first chosen kept: one basic
 * technology; fast or slow; hardening a computer whose technology already
 * is; and making compact a transistor computer, which already is (HT:EE p. 37).
 */
export const ERA_EXCLUSIVE: ReadonlyArray<readonly EraOption[]> = Object.freeze([
  BASIC_TECHNOLOGIES,
  ["fast", "slow"],
  ["electromechanical", "hardened"],
  ["vacuumTube", "hardened"],
  ["transistor", "compact"],
]);

/**
 * The supplement's figures, as the shared computer engine takes them. The
 * sizes are standard-VLSI machines of TL8; a TL7 computer is one built with
 * a TL7 technology. Storage, software and tools are High-Tech's (pp. 20-22),
 * which the supplement refers to.
 */
export const ERA_COMPUTERS: ComputerFigures = Object.freeze({
  ...COMPUTERS,
  models: ERA_MODELS,
  modelFigures: ERA_MODEL_FIGURES,
  defaultModel: "medium",
  printedTl: 8,
  complexityForTl: () => 0,
  options: ERA_OPTIONS,
  effects: ERA_EFFECTS,
  exclusive: ERA_EXCLUSIVE,
  early: Object.freeze({ options: TL7_TECHNOLOGIES, belowTl: 8 }),
});

/**
 * A vacuum-tube computer rolls HT every day; failure burns out a tube, which
 * takes a minor repair (HT:EE p. 37, after Campaigns p. 484). A computer
 * without an HT score of its own is taken as HT 10 (Campaigns p. 485).
 */
export const BURNOUT_REPAIR_SKILL = "Electronics Repair (Computers)";

// ── interfaces (HT:EE pp. 39-41) ───────────────────────────────────────────

/** The ways of working a computer, each a familiarity of its own (HT:EE p. 39). */
export const INTERFACES = ["", "text", "graphic", "touch", "vr", "voice", "bci"] as const;
export type Interface = (typeof INTERFACES)[number];

/**
 * The least Complexity that drives each (HT:EE p. 39): text 1, a graphic
 * interface with a pointer 2, music and video 3 -- which a VR headset's
 * images and sound are -- spoken commands or gestures 4, and a
 * brain-computer interface 6. A touch screen is a graphic interface.
 */
export const INTERFACE_COMPLEXITY: Readonly<Record<Exclude<Interface, "">, number>> = Object.freeze({ text: 1, graphic: 2, touch: 2, vr: 3, voice: 4, bci: 6 });

/** The name each goes by on a familiarity list. */
export const INTERFACE_FAMILIARITY: Readonly<Record<Exclude<Interface, "">, string>> = Object.freeze({
  text: "Text interface",
  graphic: "Graphic interface",
  touch: "Touch screen",
  vr: "Virtual reality",
  voice: "Voice control",
  bci: "Brain-computer interface",
});

/** The touch-screen sizes (HT:EE p. 40). */
export const TOUCH_SIZES = ["desktop", "tablet", "phone"] as const;
export type TouchSize = (typeof TOUCH_SIZES)[number];

/**
 * What a touch screen gives Computer Operation, multitouch and single-touch
 * (HT:EE p. 40): a desktop's multitouch +1; a tablet's single touch -1; a
 * phone's -1 multitouch and -2 single-touch.
 */
export const TOUCH_MODIFIER: Readonly<Record<TouchSize, { multi: number; single: number }>> = Object.freeze({
  desktop: { multi: 1, single: 0 },
  tablet: { multi: 0, single: -1 },
  phone: { multi: -1, single: -2 },
});

/** An early touch screen, before 1988: -2 to effective skill (HT:EE p. 40). */
export const EARLY_TOUCH = -2;

/** A stylus is a +1 quality modifier, but gives no multitouch (HT:EE p. 40). */
export const STYLUS_BONUS = 1;

/** Voice control is -2 to navigate a screen, and -2 more until trained to its user's voice for 8 hours (HT:EE p. 40). */
export const VOICE_NAVIGATION = -2;
export const VOICE_UNTRAINED = -2;

/** A noninvasive brain-computer interface's weak signals are -2, which time spent can win back (HT:EE p. 41). */
export const BCI_PENALTY = -2;

/** Navigating a display with the arrow keys alone, as on a text interface: -1, which extra time can make up (HT:EE p. 40). */
export const ARROW_KEYS = -1;
/** Typing on a touch screen: -1, unless a separate keyboard is used with it (HT:EE p. 40). */
export const TOUCH_TYPING = -1;
/** A VR headset offsets up to -2 of the penalties on a Computer Operation task it helps with (HT:EE p. 41). */
export const VR_OFFSET = 2;
/** Prototype wired gloves in virtual reality: -2 to skills based on manual dexterity (HT:EE p. 41). */
export const WIRED_GLOVES = -2;

/** Whether a record is a keyboard of its own, which a touch screen can be used with (HT:EE p. 40). */
export function isKeyboard(name: string): boolean {
  return /^(wireless )?keyboard$|^portable terminal$/i.test(String(name ?? "").trim());
}

/** What a computer is worked through, as its sheet sets it. */
export interface InterfaceSetup {
  interface: Interface;
  touch: TouchSize;
  multitouch: boolean;
  voiceTrained: boolean;
  /** A touch screen from before 1988, which can't tell exactly where a finger is (HT:EE p. 40). */
  earlyTouch?: boolean;
  /** Prototype wired gloves worn with a VR interface (HT:EE p. 41). */
  wiredGloves?: boolean;
}

/** One line an interface puts on a roll. */
export interface InterfaceLine {
  key: "unfamiliar" | "touch" | "earlyTouch" | "stylus" | "voice" | "voiceUntrained" | "bci" | "arrowKeys" | "touchTyping" | "vr" | "wiredGloves";
  value: number;
}

/**
 * The lines a roll with a computer takes for the interface it is worked
 * through (HT:EE pp. 39-41): -2 where the user isn't familiar with it (under
 * the familiarity rule, `familiar` null without it); a touch screen's
 * modifier on Computer Operation, or with a stylus the single-touch figure
 * +1, and an early screen's -2 on every roll; voice control's -2, and -2 more before it is trained; a
 * brain-computer interface's -2. None where the computer's Complexity is too
 * low to drive the interface at all. And what the supplement prints for the
 * tasks themselves (HT:EE pp. 40-41): a text interface's -1 on Computer
 * Operation, its display navigated with the arrow keys alone; a touch
 * screen's -1 to typing without a keyboard of its own; a VR headset
 * offsetting up to 2 of the penalties already on a Computer Operation roll;
 * and wired gloves' -2 to a skill of manual dexterity worked in VR.
 */
export function interfaceLines(
  setup: InterfaceSetup,
  complexity: number,
  roll: { computerOperation: boolean; stylus: boolean; typing?: boolean; keyboard?: boolean; dexterity?: boolean; penalties?: number },
  familiar: ((name: string) => boolean) | null,
): InterfaceLine[] {
  const kind = setup.interface;
  if (!kind || complexity < INTERFACE_COMPLEXITY[kind]) return [];
  const lines: InterfaceLine[] = [];
  if (familiar && !familiar(INTERFACE_FAMILIARITY[kind])) lines.push({ key: "unfamiliar", value: -2 });
  if (kind === "touch" && roll.computerOperation) {
    const figures = TOUCH_MODIFIER[setup.touch] ?? TOUCH_MODIFIER.desktop;
    // A stylus is single-touch, +1; the better of that and the bare screen.
    const bare = setup.multitouch ? figures.multi : figures.single;
    const withStylus = figures.single + STYLUS_BONUS;
    if (roll.stylus && withStylus > bare) {
      if (figures.single) lines.push({ key: "touch", value: figures.single });
      lines.push({ key: "stylus", value: STYLUS_BONUS });
    } else if (bare) lines.push({ key: "touch", value: bare });
  }
  // Before 1988 a touch screen couldn't find the finger exactly: -2 to effective skill (HT:EE p. 40).
  if (kind === "touch" && setup.earlyTouch) lines.push({ key: "earlyTouch", value: EARLY_TOUCH });
  if (kind === "voice") {
    lines.push({ key: "voice", value: VOICE_NAVIGATION });
    if (!setup.voiceTrained) lines.push({ key: "voiceUntrained", value: VOICE_UNTRAINED });
  }
  if (kind === "bci") lines.push({ key: "bci", value: BCI_PENALTY });
  if (kind === "text" && roll.computerOperation) lines.push({ key: "arrowKeys", value: ARROW_KEYS });
  if (kind === "touch" && roll.typing && !roll.keyboard) lines.push({ key: "touchTyping", value: TOUCH_TYPING });
  if (kind === "vr" && roll.computerOperation) {
    const offset = Math.min(VR_OFFSET, Math.max(0, -(roll.penalties ?? 0)));
    if (offset) lines.push({ key: "vr", value: offset });
  }
  if (kind === "vr" && setup.wiredGloves && roll.dexterity) lines.push({ key: "wiredGloves", value: WIRED_GLOVES });
  return lines;
}

/** Whether a record is a stylus for a touch screen. */
export function isStylus(name: string): boolean {
  return /^stylus\b/i.test(String(name ?? "").trim());
}

/** Whether a record is a light pen. */
export function isLightPen(name: string): boolean {
  return /\blight pen\b/i.test(String(name ?? ""));
}

/**
 * A light pen held up to the screen tires the arm: an HT roll every 10
 * minutes, a failure costing 1 FP and a critical failure 1 HP as well
 * (HT:EE p. 40).
 */
export function lightPenStrain(outcome: RollOutcome): { fp: number; hp: number } {
  if (outcome.success) return { fp: 0, hp: 0 };
  return { fp: 1, hp: outcome.criticalFailure ? 1 : 0 };
}

export const LIGHT_PEN_MINUTES = 10;

// ── programming (HT:EE p. 38) ──────────────────────────────────────────────

/** How a computer is programmed: blank where the sheet doesn't say. */
export const LANGUAGES = ["", "highLevel", "assembly", "machineCode", "wired"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Writing or debugging machine code is -5 to Computer Programming (HT:EE p. 38). */
export const MACHINE_CODE_PENALTY = -5;

/** Whether a trait spares a programmer the machine-code penalty: Eidetic Memory, of either level (HT:EE p. 38; Characters p. 51). */
export function sparesMachineCode(traitName: string): boolean {
  return /^(eidetic|photographic) memory\b/i.test(String(traitName ?? "").trim());
}

/** Whether a skill is Computer Programming, of any TL. */
export function isProgramming(skill: string): boolean {
  return /^computer programming\b/i.test(String(skill ?? "").trim());
}

/** Whether a skill is Computer Operation, of any TL. */
export function isOperation(skill: string): boolean {
  return /^computer operation\b/i.test(String(skill ?? "").trim());
}

/**
 * Computer Operation as a complementary skill to Computer Programming
 * (HT:EE p. 38): +1 on a success, +2 on a critical success, -1 on a failure
 * and -2 on a critical failure.
 */
export function complementaryModifier(outcome: RollOutcome): number {
  if (outcome.success) return outcome.criticalSuccess ? 2 : 1;
  return outcome.criticalFailure ? -2 : -1;
}

/** Computer Operation defaults to IQ-4 (Characters p. 184). */
export const COMPUTER_OPERATION_DEFAULT = -4;

/** The ways of "programming" a hard-wired machine (HT:EE p. 38). */
export const WIRING = ["design", "rewire", "configure"] as const;
export type Wiring = (typeof WIRING)[number];

/**
 * The skill each takes: designing its circuits is Engineer (Electronics);
 * rewiring one machine for a program designed for its class, Electronics
 * Repair (Computers); setting up its jacks and switches, Computer Operation.
 */
export const WIRING_SKILL: Readonly<Record<Wiring, string>> = Object.freeze({
  design: "Engineer (Electronics)",
  rewire: "Electronics Repair (Computers)",
  configure: "Computer Operation",
});

/** Designing the circuits is at -2 for a designer unfamiliar with digital circuits (HT:EE p. 38). */
export const DIGITAL_CIRCUITS = "Digital circuits";
export const UNFAMILIAR_CIRCUITS = -2;
