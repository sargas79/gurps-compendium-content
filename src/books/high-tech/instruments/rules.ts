/**
 * The laboratory instruments of the supplement Electricity and Electronics
 * (HT:EE pp. 9-13): detecting and measuring electricity, each instrument's
 * own modifiers, and devices combined from separate parts, as pure functions
 * and tables.
 */

export const PHYSICS = "Physics";
export const SCIENTIFIC = "Electronics Operation (Scientific)";
export const MEDICAL = "Electronics Operation (Medical)";
export const COMMUNICATIONS = "Electronics Operation (Communications)";
export const REPAIR_SCIENTIFIC = "Electronics Repair (Scientific)";
/** Any Electronics Repair specialty: the signal gear and the multimeter name the skill alone (HT:EE pp. 10-11). */
export const REPAIR_ANY = "Electronics Repair";
export const ELECTRICIAN = "Electrician";
export const FEATS_OF_SCIENCE = "Hobby Skill (Feats of Science)";
export const APPLIED_MATHEMATICS = "Mathematics (Applied)";
export const CHEMISTRY = "Chemistry";
export const DIAGNOSIS = "Diagnosis";
export const MECHANIC = "Mechanic";
export const LINGUISTICS = "Linguistics";
export const ANALOG_ENGINEER = "Engineer (Analog Computers)";
export const ANALOG_MECHANIC = "Mechanic (Analog Computers)";

/** A name as the tables key it: trimmed, lower case, accents and curly quotes dropped ("Geiger-Müller" is "geiger-muller"). */
export const nameKey = (name: unknown): string =>
  String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();

/** A skill a roll may be made against, at a modifier. `any` takes the best of the character's specialties of it. */
export interface SkillChoice {
  skill: string;
  modifier: number;
  any?: boolean;
}

/**
 * The attribute each skill named here defaults to, and at what (Characters
 * pp. 174-228), for a character who hasn't learned it: the technological
 * skills at IQ-5, the sciences at IQ-6. Engineer and the Hobby Skill have no
 * default, and Linguistics has none.
 */
export const SKILL_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  [PHYSICS]: -6,
  [SCIENTIFIC]: -5,
  [MEDICAL]: -5,
  [COMMUNICATIONS]: -5,
  [REPAIR_SCIENTIFIC]: -5,
  [REPAIR_ANY]: -5,
  [ELECTRICIAN]: -5,
  [APPLIED_MATHEMATICS]: -6,
  [CHEMISTRY]: -5,
  [DIAGNOSIS]: -6,
  [MECHANIC]: -5,
  [ANALOG_MECHANIC]: -5,
});

/**
 * Skills with no attribute default that default to another skill (Characters
 * p. 173): Engineer (Analog Computers), which the supplement adds (HT:EE
 * p. 13), from Mechanic (Analog Computers) at -6, as the module's own skill
 * record gives it -- so a mechanic can try the build an engineer would make.
 */
export const SKILL_FROM_SKILL: Readonly<Record<string, readonly SkillChoice[]>> = Object.freeze({
  [ANALOG_ENGINEER]: [{ skill: ANALOG_MECHANIC, modifier: -6 }],
});

/** A science, as against the operation and repair skills: a complex device's penalty is doubled for one (HT:EE p. 12). */
export const isScience = (skill: string): boolean => !/^electronics (operation|repair)|^electrician|^mechanic|^hobby skill/i.test(skill.trim());

// ── detection and measurement (HT:EE p. 10) ──

/** What an instrument is asked to do. */
export const TASKS = ["operate", "detect", "measure"] as const;
export type Task = (typeof TASKS)[number];

/**
 * How strong the source is, for a detection roll (HT:EE p. 10): a voltage
 * high enough to harm (Electrical Hazards, p. 9) at +4, a weak source at -4.
 * On p. 12 the +4 covers the scientific instruments' hazards too: strong
 * acids and alkalis, radiation.
 */
export const SOURCES = ["ordinary", "dangerous", "weak"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_MODIFIER: Readonly<Record<Source, number>> = Object.freeze({ ordinary: 0, dangerous: 4, weak: -4 });

/**
 * How far off a failed measurement is, per point of failure (HT:EE p. 10):
 * 5% with basic or improvised gear, 1% with good, 0.25% with fine (and with
 * the best, which is at least fine).
 */
export const ERROR_PER_POINT: Readonly<Record<string, number>> = Object.freeze({ none: 5, improvised: 5, basic: 5, good: 1, fine: 0.25, best: 0.25 });

/** The error of a failed measurement, in percent either way. */
export function measurementError(marginOfFailure: number, quality: unknown): number {
  const per = ERROR_PER_POINT[String(quality ?? "basic")] ?? ERROR_PER_POINT.basic!;
  return Math.max(0, Math.floor(Number(marginOfFailure) || 0)) * per;
}

/** What a detection or measurement roll came to (HT:EE p. 10). */
export type Reading =
  | { kind: "detected" }
  | { kind: "missed" }
  | { kind: "exact" }
  | { kind: "off"; percent: number }
  /** A critical failure: the instrument stops working, or reads something absurd. */
  | { kind: "broken" };

export function reading(task: Task, roll: { success: boolean; criticalFailure?: boolean; margin: number }, quality: unknown): Reading | null {
  if (task === "operate") return null;
  if (roll.criticalFailure) return { kind: "broken" };
  if (task === "detect") return { kind: roll.success ? "detected" : "missed" };
  return roll.success ? { kind: "exact" } : { kind: "off", percent: measurementError(roll.margin, quality) };
}

/** A spark-gap voltmeter is improvised: Physics at -5 (HT:EE p. 10). */
export const SPARK_GAP = -5;

// ── the instruments (HT:EE pp. 10-13) ──

export type InstrumentKind =
  | "electrometer"
  | "galvanometer"
  | "recorder"
  | "meter"
  | "signalGenerator"
  | "signalTracer"
  | "lockIn"
  | "oscillograph"
  | "oscilloscope"
  | "spectrumAnalyzer"
  | "staticMachine"
  | "teslaCoil"
  | "transducer"
  | "dedicated"
  | "heartMonitor"
  | "analogComputer";

export interface Instrument {
  kind: InstrumentKind;
  /** The skills it is used with (the first is the book's first). */
  skills: readonly SkillChoice[];
  /** What it can be asked to do. */
  tasks: readonly Task[];
  /** A moving-magnet movement, disturbed by magnetic fields and ferrous metal: -1 to -10 (HT:EE p. 11). */
  magnetic?: boolean;
  /** Reads a telegraph line: Electronics Operation (Communications) +4 (HT:EE p. 11). */
  telegraph?: boolean;
  /** An early model's poor stability (HT:EE p. 11). */
  earlyModel?: number;
  /** The interference penalty it disregards (HT:EE p. 11). */
  cancelsNoise?: number;
  /** A display a transducer can be read through (HT:EE p. 12). */
  display?: boolean;
  /** The science a transducer or dedicated device may be used with instead (HT:EE p. 12). */
  science?: string;
  /** Measures light at the partial-darkness penalty (HT:EE p. 12). */
  darkness?: boolean;
  /** Drifts in frequency, corrected by hand (HT:EE p. 12). */
  drift?: number;
  /** The skills that interpret what it finds (HT:EE p. 12). */
  interpret?: readonly string[];
  /** A Tesla coil's size (HT:EE p. 12). */
  coil?: "large" | "small";
  /** A Van de Graaff generator's sphere, in inches (HT:EE p. 11). */
  sphere?: number;
  /** A general-purpose analog computer, set up with Electronics Operation (Scientific); a prototype otherwise (HT:EE p. 13). */
  generalPurpose?: boolean;
  /** An analog computer's invention grade (HT:EE p. 13). */
  grade?: "average" | "complex";
}

/** The experimental apparatus is used with Physics or Electronics Operation (Scientific), except as noted (HT:EE p. 10). */
const APPARATUS: readonly SkillChoice[] = [{ skill: PHYSICS, modifier: 0 }, { skill: SCIENTIFIC, modifier: 0 }];
/** Signal generators and tracers take Electronics Repair (HT:EE p. 11). */
const SIGNAL: readonly SkillChoice[] = [{ skill: REPAIR_ANY, modifier: 0, any: true }];
/** The static machines take the Hobby Skill or Physics (HT:EE p. 11). */
const STATIC: readonly SkillChoice[] = [{ skill: FEATS_OF_SCIENCE, modifier: 0 }, { skill: PHYSICS, modifier: 0 }];
/** A Tesla coil takes Electrician, the Hobby Skill or Physics (HT:EE p. 12). */
const TESLA: readonly SkillChoice[] = [{ skill: ELECTRICIAN, modifier: 0 }, { skill: FEATS_OF_SCIENCE, modifier: 0 }, { skill: PHYSICS, modifier: 0 }];

/** A dedicated device: Electronics Operation (Scientific) +2, or its science (HT:EE p. 12). */
export const DEDICATED_BONUS = 2;
/** Reading a transducer through a display: Electronics Operation or Electronics Repair (Scientific) +2, or its science (HT:EE p. 12). */
export const CONNECT_BONUS = 2;

const dedicatedSkills = (science: string): readonly SkillChoice[] => [{ skill: SCIENTIFIC, modifier: DEDICATED_BONUS }, { skill: science, modifier: 0 }];
const transducerSkills = (science: string): readonly SkillChoice[] => [{ skill: SCIENTIFIC, modifier: 0 }, { skill: science, modifier: 0 }];

const MEASURING: readonly Task[] = ["detect", "measure", "operate"];
const OPERATING: readonly Task[] = ["operate"];

const apparatus = (kind: InstrumentKind, extra: Partial<Instrument> = {}): Instrument => ({ kind, skills: APPARATUS, tasks: MEASURING, ...extra });
const transducer = (science: string): Instrument => ({ kind: "transducer", skills: transducerSkills(science), tasks: MEASURING, science });
const dedicated = (science: string | null, extra: Partial<Instrument> = {}): Instrument => ({
  kind: "dedicated",
  skills: science ? dedicatedSkills(science) : [{ skill: SCIENTIFIC, modifier: DEDICATED_BONUS }],
  tasks: MEASURING,
  ...(science ? { science } : {}),
  ...extra,
});

/** The Moving Magnet Galvanometer and the Mirror Galvanometer, which reads a telegraph line (HT:EE p. 11). */
const MOVING_MAGNET = apparatus("galvanometer", { display: true, magnetic: true });
const MIRROR = apparatus("galvanometer", { display: true, magnetic: true, telegraph: true });
/** D'Arsonval's moving coil is unaffected by magnetic fields (HT:EE p. 11). */
const MOVING_COIL = apparatus("galvanometer", { display: true });

/**
 * The supplement's instruments by record name (HT:EE pp. 10-13), and
 * High-Tech's own of the same kinds (its Geiger counters and metal detector,
 * pp. 49-50), which the supplement prints again.
 */
export const INSTRUMENTS: Readonly<Record<string, Instrument>> = Object.freeze({
  // Electrometers (p. 10).
  "gold leaf electroscope": apparatus("electrometer"),
  "quadrant electrometer": apparatus("electrometer"),
  "vacuum-tube electrometer": apparatus("electrometer"),
  "solid-state electrometer": apparatus("electrometer"),
  // Galvanometers and related devices (pp. 10-11).
  "moving magnet galvanometer": MOVING_MAGNET,
  "mirror galvanometer": MIRROR,
  "d'arsonval moving coil galvanometer": MOVING_COIL,
  "strip chart recorder": apparatus("recorder", { display: true }),
  // The multimeter serves Electrician and Electronics Repair as well (p. 11).
  multimeter: { ...apparatus("meter", { display: true }), skills: [...APPARATUS, { skill: ELECTRICIAN, modifier: 0 }, { skill: REPAIR_ANY, modifier: 0, any: true }] },
  // Early vacuum-tube voltmeters were unstable: -2 (p. 11).
  "vacuum-tube voltmeter (vtvm)": apparatus("meter", { display: true, earlyModel: -2 }),
  "vacuum-tube voltmeter": apparatus("meter", { display: true, earlyModel: -2 }),
  "field effect transistor voltmeter (fet-vm)": apparatus("meter", { display: true }),
  "field effect transistor voltmeter": apparatus("meter", { display: true }),
  // Signal generators and tracers (p. 11).
  "audio signal generator": { kind: "signalGenerator", skills: SIGNAL, tasks: OPERATING },
  "radio signal generator": { kind: "signalGenerator", skills: SIGNAL, tasks: OPERATING },
  "signal tracer": { kind: "signalTracer", skills: SIGNAL, tasks: ["detect", "operate"] },
  // Lock-in amplifiers disregard -6 of electrical noise at TL7, -9 at TL8 (p. 11).
  "lock-in amplifier (tl7)": apparatus("lockIn", { cancelsNoise: 6 }),
  "lock-in amplifier (tl8)": apparatus("lockIn", { cancelsNoise: 9 }),
  "lock-in amplifier": apparatus("lockIn", { cancelsNoise: 6 }),
  // Waveform analysis (p. 11).
  oscillograph: apparatus("oscillograph", { display: true }),
  "high-frequency oscillograph": apparatus("oscillograph", { display: true }),
  oscilloscope: apparatus("oscilloscope", { display: true }),
  "digital oscilloscope": apparatus("oscilloscope", { display: true }),
  "compact digital oscilloscope": apparatus("oscilloscope", { display: true }),
  "spectrum analyzer": apparatus("spectrumAnalyzer", { display: true }),
  // The TL8 handheld model (HT:EE p. 48) is a spectrum analyzer too; finding transmitters with it
  // in the field, at Electronics Operation (EW) -2, is signals intelligence's (`../sigint/`).
  "spectrum analyzer (digital)": apparatus("spectrumAnalyzer", { display: true }),
  "digital spectrum analyzer": apparatus("spectrumAnalyzer", { display: true }),
  // Static electricity (pp. 11-12).
  "wimshurst generator": { kind: "staticMachine", skills: STATIC, tasks: OPERATING },
  "van de graaff generator": { kind: "staticMachine", skills: STATIC, tasks: OPERATING, sphere: 9 },
  "large tesla coil": { kind: "teslaCoil", skills: TESLA, tasks: OPERATING, coil: "large" },
  "tesla coil": { kind: "teslaCoil", skills: TESLA, tasks: OPERATING, coil: "large" },
  "small tesla coil": { kind: "teslaCoil", skills: TESLA, tasks: OPERATING, coil: "small" },
  // Transducers (pp. 12-13), read through a display: a combined device.
  "geiger-muller tube": transducer(PHYSICS),
  "glass electrode": transducer(CHEMISTRY),
  thermistor: transducer(PHYSICS),
  "accelerometer (tl7)": transducer(PHYSICS),
  "accelerometer (tl8)": transducer(PHYSICS),
  accelerometer: transducer(PHYSICS),
  // The dedicated devices built around them (pp. 12-13; High-Tech pp. 49-50).
  "geiger counter (tl6)": dedicated(PHYSICS),
  "geiger counter (tl8)": dedicated(PHYSICS),
  "geiger counter": dedicated(PHYSICS),
  "ph meter (tl6)": dedicated(CHEMISTRY),
  "ph meter (tl7)": dedicated(CHEMISTRY),
  "ph meter (tl8)": dedicated(CHEMISTRY),
  "ph meter": dedicated(CHEMISTRY),
  // The TL6 metal detector's drift is corrected by hand: -2; interpreted with a field's skill (p. 12).
  "metal detector (tl6)": dedicated(null, { drift: -2, interpret: ["Archaeology", "Geology", "Prospecting", "Scrounging"] }),
  "metal detector (tl8)": dedicated(null, { interpret: ["Archaeology", "Geology", "Prospecting", "Scrounging"] }),
  "metal detector": dedicated(null, { interpret: ["Archaeology", "Geology", "Prospecting", "Scrounging"] }),
  // The selenium cell reads light against Electronics Operation (Scientific) at the partial-darkness
  // penalty, its entry says, with no dedicated device's +2; the silicon light meter "works like" it,
  // without the penalty (pp. 12-13).
  photodetector: { ...dedicated(PHYSICS, { darkness: true }), skills: transducerSkills(PHYSICS) },
  "light meter": { ...dedicated(PHYSICS), skills: transducerSkills(PHYSICS) },
  // Bioelectrical signals (p. 12): read with Diagnosis.
  "heart monitor": { kind: "heartMonitor", skills: [{ skill: DIAGNOSIS, modifier: 0 }], tasks: OPERATING },
  // Analog computers (p. 13).
  "general-purpose analog computer": { kind: "analogComputer", skills: [{ skill: SCIENTIFIC, modifier: 0 }], tasks: OPERATING, generalPurpose: true, grade: "average" },
  "large general-purpose analog computer": { kind: "analogComputer", skills: [{ skill: SCIENTIFIC, modifier: 0 }], tasks: OPERATING, generalPurpose: true, grade: "average" },
});

/**
 * An instrument by its record's name: the table's, or by kind for a name it
 * doesn't hold -- any galvanometer (reckoned a moving-magnet one, the
 * common kind, unless it says moving coil), any other analog computer (a
 * prototype: Average, or Complex for a differential analyzer).
 */
export function instrumentOf(name: unknown): Instrument | null {
  const key = nameKey(name);
  const known = INSTRUMENTS[key];
  if (known) return known;
  if (/galvanometer/.test(key)) return /moving coil/.test(key) ? MOVING_COIL : MOVING_MAGNET;
  if (/differential analy[sz]er/.test(key)) return { kind: "analogComputer", skills: [{ skill: SCIENTIFIC, modifier: 0 }], tasks: OPERATING, grade: "complex" };
  if (/analog computer/.test(key)) return { kind: "analogComputer", skills: [{ skill: SCIENTIFIC, modifier: 0 }], tasks: OPERATING, grade: "average" };
  return null;
}

/** Whether a record is a galvanometer of any kind (HT:EE pp. 10-11). */
export const isGalvanometer = (name: unknown): boolean => /galvanometer/.test(nameKey(name));

/** Whether a transducer can be read through this record (HT:EE p. 12). */
export const isDisplay = (name: unknown): boolean => instrumentOf(name)?.display === true;

/** Whether a record is an accelerometer or a microphone, for the spectrum analyzer (HT:EE p. 11). */
export const isAccelerometer = (name: unknown): boolean => /accelerometer/.test(nameKey(name));
export const isMicrophone = (name: unknown): boolean => /microphone/.test(nameKey(name));

// ── each instrument's modifiers (HT:EE pp. 10-13) ──

/** Magnetic disturbance on a moving-magnet galvanometer: -1 to -10 (HT:EE p. 11). */
export const MAGNETIC_WORST = 10;
export const magneticPenalty = (points: number): number => -Math.min(MAGNETIC_WORST, Math.max(0, Math.floor(Number(points) || 0)));

/**
 * Electrical noise, as a penalty of 0 to 10 points, less what a lock-in
 * amplifier disregards (HT:EE p. 11: up to -6 at TL7, -9 at TL8).
 */
export function noisePenalty(points: number, cancels = 0): number {
  const noise = Math.min(10, Math.max(0, Math.floor(Number(points) || 0)));
  return -Math.max(0, noise - Math.max(0, cancels));
}

/** Reading a telegraph line with a mirror galvanometer: Electronics Operation (Communications) +4 (HT:EE p. 11). */
export const TELEGRAPH_BONUS = 4;

/**
 * An oscilloscope compares two signals -- whether two voices are the same
 * person's, say -- on an Electronics Operation (Scientific) roll, at no
 * modifier (HT:EE p. 11).
 */
export const COMPARE_SKILL = SCIENTIFIC;

/**
 * The Geiger-Müller tube's high-voltage supply (HT:EE p. 12): it can inflict
 * 5d lethal electrical damage, and is built as a Simple invention running on
 * household power.
 */
export const GEIGER_SUPPLY = Object.freeze({ damage: "5d", grade: "simple" as const, power: "household" as const });

/** Whether a record is the bare Geiger-Müller tube, which needs the supply; the counters build one in. */
export const isGeigerTube = (name: unknown): boolean => nameKey(name) === "geiger-muller tube";

/** The signal a tracer follows: audio and AM at no modifier, FM at -5; the spectrum analyzer at +2 for AM and FM (HT:EE p. 11). */
export const SIGNALS = ["audio", "am", "fm"] as const;
export type Signal = (typeof SIGNALS)[number];
export const TRACER_FM = -5;
export const ANALYZER_TRACING = 2;
export function tracingModifier(kind: InstrumentKind, signal: Signal): number {
  if (kind === "spectrumAnalyzer") return signal === "audio" ? 0 : ANALYZER_TRACING;
  return signal === "fm" ? TRACER_FM : 0;
}

/**
 * The spectrum analyzer's other uses (HT:EE p. 11): +2 to Mechanic to find a
 * machine's trouble by its vibration, with an accelerometer; +2 to
 * Linguistics on speech sounds, with a microphone; and it tells sounds apart
 * as Discriminatory Hearing does (Characters p. 49), people by their voices
 * and machines by their sound, rolled against Electronics Operation
 * (Scientific).
 */
export const ANALYZER_USES = ["vibration", "speech", "signature"] as const;
export type AnalyzerUse = (typeof ANALYZER_USES)[number];
export const ANALYZER_BONUS = 2;
export const ANALYZER_SKILL: Readonly<Record<AnalyzerUse, string>> = Object.freeze({ vibration: MECHANIC, speech: LINGUISTICS, signature: SCIENTIFIC });

/** Plotting a waveform by hand from timed readings: Mathematics (Applied) or Physics at -2 (HT:EE p. 11). */
export const HAND_PLOT = -2;

/**
 * An unusually complex scientific device: -1 to -5, doubled against a
 * science (HT:EE p. 12).
 */
export function complexityPenalty(points: number, skill: string): number {
  const penalty = Math.min(5, Math.max(0, Math.floor(Number(points) || 0)));
  return -(isScience(skill) ? 2 * penalty : penalty);
}

/** The partial-darkness penalty on the TL6 photodetector's reading, 0 to -9 (HT:EE p. 12; Characters p. 394). */
export const darknessPenalty = (points: number): number => -Math.min(9, Math.max(0, Math.floor(Number(points) || 0)));

/** A heart monitor worn briefly: -2 to Diagnosis, -4 for under half an hour (HT:EE p. 12). */
export const WEAR_TIMES = ["day", "brief", "halfHour"] as const;
export type WearTime = (typeof WEAR_TIMES)[number];
export const WEAR_MODIFIER: Readonly<Record<WearTime, number>> = Object.freeze({ day: 0, brief: -2, halfHour: -4 });

// ── transducers (HT:EE p. 12) ──

/**
 * What a critical failure connecting a transducer does (HT:EE p. 12): the
 * transducer rolls against its HT or is destroyed; one that survives needs
 * an Electronics Repair (Scientific) roll.
 */
export type TransducerFate = "destroyed" | "damaged";
export const transducerFate = (htRoll: { success: boolean }): TransducerFate => (htRoll.success ? "damaged" : "destroyed");

// ── combined devices (HT:EE p. 9) ──

/**
 * A device combined from separate parts is fussier to set up and use: -2 to
 * the skill, less than improvised gear's -5 (HT:EE p. 9; Campaigns p. 345).
 * A transducer read through a display is one (p. 12).
 */
export const COMBINED = -2;

// ── static machines and the Tesla coil (HT:EE pp. 11-12) ──

/**
 * A Van de Graaff generator's shock, as the HT modifier to resist it
 * (HT:EE p. 11): +2 from the 9" classroom model, -6 for each doubling of
 * the sphere and -3 for half as big again.
 */
export function vanDeGraaffModifier(diameter: number, base = 9): number {
  const ratio = Math.max(1, (Number(diameter) || base) / base);
  const doublings = Math.floor(Math.log2(ratio) + 1e-9);
  const rest = ratio / 2 ** doublings;
  return 2 - 6 * doublings - (rest >= 1.5 - 1e-9 ? 3 : 0);
}

/** The burn a Tesla coil's output does on a critically failed roll: 1d-3, or a point from the small hobby coil (HT:EE p. 12). */
export const COIL_BURN: Readonly<Record<"large" | "small", string>> = Object.freeze({ large: "1d-3", small: "1" });

/**
 * The power a coil draws, and the lethal current a spark to an unshielded
 * line conducts, from the supplement's voltage table (HT:EE p. 18): 1d-3 at
 * 110-120V, 1d+1 at 220-240V (household abroad, or major appliances), 3d at
 * 480V (industrial).
 */
export const LINES = ["household", "major", "industrial"] as const;
export type Line = (typeof LINES)[number];
export const LINE_DAMAGE: Readonly<Record<Line, string>> = Object.freeze({ household: "1d-3", major: "1d+1", industrial: "3d" });
export const COIL_LINE: Readonly<Record<"large" | "small", Line>> = Object.freeze({ large: "major", small: "household" });

/** What went wrong running a Tesla coil (HT:EE p. 12): a burn on a critical failure, a spark to the power line on a roll of 18. */
export function coilMishap(roll: { roll?: number; criticalFailure?: boolean }, shielded: boolean): { burn: boolean; line: boolean } {
  return { burn: roll.criticalFailure === true, line: roll.roll === 18 && !shielded };
}

// ── analog computers (HT:EE p. 13; Campaigns p. 474) ──

/**
 * Building an analog computer as a copy of an invention (HT:EE p. 13): an
 * Engineer (Analog Computers) roll, a single copy's cost -- a fifth of the
 * retail price for the parts, all of it with labour -- and half the grade's
 * prototype time (Campaigns p. 474).
 */
export const COPY_PARTS = 0.2;
export function copyCost(retail: number, labour: boolean): number {
  return Math.round(Math.max(0, Number(retail) || 0) * (labour ? 1 : COPY_PARTS) * 100) / 100;
}

// ── training aids (HT:EE pp. 12-13; Characters pp. 292-293) ──

/**
 * An electronic pedometer cuts the study time Hiking needs by 10% (HT:EE
 * p. 13): each hour of study counts as 1/0.9 of one.
 */
export const PEDOMETER = /^electronic pedometer$/i;
export const PEDOMETER_SKILL = "Hiking";
export const PEDOMETER_TIME = 0.9;
export const studyMultiplier = (timeFactor: number): number => 1 / timeFactor;

/**
 * A digital heart monitor paces training for HT or fitness, cutting its time
 * by 10% (HT:EE p. 12): study of HT, or of Fit or Very Fit (Characters p. 294).
 */
export const HEART_MONITOR = /^digital heart monitor$/i;
export const HEART_MONITOR_TIME = 0.9;
export const FITNESS_TRAIT = /^(very )?fit\b/i;
export function fitnessStudy(studied: { kind?: unknown; attribute?: unknown; item?: { name?: unknown } | null; name?: unknown } | null | undefined): boolean {
  if (!studied) return false;
  if (studied.kind === "attribute") return studied.attribute === "HT";
  if (studied.kind === "trait") return FITNESS_TRAIT.test(String(studied.item?.name ?? studied.name ?? "").trim());
  return false;
}
