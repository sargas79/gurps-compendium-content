/**
 * High-Tech's encryption, forgery, disguise and smuggling (pp. 210-215): the
 * figures and the arithmetic, with nothing of Foundry in them.
 */

/** Breaking an ad-libbed code: a Quick Contest of IQ-5, either side may use Cryptography instead (p. 210). */
export const IMPROVISED_CODE = -5;

/** A team breaking a code at TL5-6: +1 to the leader for each member with Cryptography 17+, at most +4 (p. 211). */
export const TEAM = Object.freeze({ skill: 17, most: 4 });

/** The leader's bonus from a team: `helpers` are the members' Cryptography levels. */
export function teamBonus(helpers: readonly number[]): number {
  return Math.min(TEAM.most, helpers.filter((level) => level >= TEAM.skill).length);
}

/** The creator's level for an improvised code: the better of IQ-5 and Cryptography (p. 210). */
export function improvisedLevel(iq: number, cryptography: number | null): number {
  return Math.max(iq + IMPROVISED_CODE, cryptography ?? -Infinity);
}

/** A cipher wheel's user enciphers at its creator's Cryptography, typically 16-18 (p. 211). */
export const CIPHER_WHEEL_SKILL = 17;

/**
 * What a code-breaker is up against (pp. 210-211):
 *
 * - `improvised`: an ad-libbed code or cipher, the Quick Contest of IQ-5.
 * - `manual`: a TL5-6 system such as a cipher wheel's, broken as the Basic
 *   Set's Quick Contest of Cryptography (p. B186), which only Cryptography may
 *   attempt.
 * - the encryption standards: basic encryption at TL6-8 and secure
 *   encryption at TL7-8, which take a base time on a computer of a Complexity
 *   and a Cryptography roll with Time Spent and software bonuses in place of
 *   the Basic Set's modifiers.
 */
export const CODES = ["improvised", "manual", "basic6", "basic7", "basic8", "secure7", "secure8"] as const;
export type Code = (typeof CODES)[number];

export interface Standard {
  /** The base time in hours; null where it can't be broken at TL8. */
  hours: number | null;
  /** The Complexity of computer (or its equivalent in apparatus) needed. */
  complexity: number | null;
}

const DAY = 24;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

/**
 * The encryption standards' base times (p. 211). TL6 basic encryption takes
 * 10 years with apparatus equal to a Complexity 1 computer, a year with a
 * Complexity 2 one; TL7 basic a week at Complexity 3; TL8 basic a day at
 * Complexity 5. Secure encryption is effectively impossible before TL9.
 */
export function standard(code: Code, apparatus = 1): Standard | null {
  if (code === "basic6") return apparatus >= 2 ? { hours: YEAR, complexity: 2 } : { hours: 10 * YEAR, complexity: 1 };
  if (code === "basic7") return { hours: WEEK, complexity: 3 };
  if (code === "basic8") return { hours: DAY, complexity: 5 };
  if (code === "secure7" || code === "secure8") return { hours: null, complexity: null };
  return null;
}

/** Whether the attempt is a Quick Contest with the code's maker (the manual codes). */
export const isContest = (code: Code) => code === "improvised" || code === "manual";

/** Whether a team helps: breaking codes by hand at TL5-6 is a group effort (p. 211). */
export const teamHelps = (code: Code) => code === "improvised" || code === "manual" || code === "basic6";

/** A code-breaking program, from its record's name (p. 211). */
export function isCodeBreakingProgram(name: string): boolean {
  return /code-breaking program/i.test(String(name ?? ""));
}

// ── forgery and counterfeiting (pp. 213-214) ──

export type ForgeryTool = "forgery" | "counterfeiting" | "cards";

/** The forger's tool a record's name is (pp. 213-214). */
export function forgeryToolByName(name: string): ForgeryTool | null {
  const text = String(name ?? "").trim();
  if (/^forgery tools$/i.test(text)) return "forgery";
  if (/^counterfeiting tools$/i.test(text)) return "counterfeiting";
  if (/^card printer$|^magnetic strip decoder\/encoder$/i.test(text)) return "cards";
  return null;
}

/** The skills a tool forges with. */
export function forgerySkills(tool: ForgeryTool): string[] {
  return tool === "forgery" ? ["Forgery"] : ["Counterfeiting"];
}

/**
 * What a forged document of a TL needs beyond the forger's tools (p. 214): at
 * TL5 stationery only; at TL6 the tools (cameras, stamps, embossers); from
 * TL7 a computer with a printer as well. Fake credit cards (TL8) need a card
 * printer, a magnetic strip decoder/encoder and a computer.
 */
export function forgeryNeeds(tool: ForgeryTool, documentTl: number): { computer: boolean; cardGear: boolean } {
  if (tool === "cards") return { computer: true, cardGear: true };
  return { computer: documentTl >= 7, cardGear: false };
}

/**
 * Without the computer and printer a TL7+ document needs, the forger's tools
 * are improvised: the Basic Set's -5 for improvised equipment with a
 * technological skill (p. B345).
 */
export const NO_COMPUTER = -5;

/** At TL8 a counterfeiter rolls Counterfeiting to avoid a printer that marks its pages (p. 214). */
export const tracedPrinterTl = 8;

export const isComputer = (name: string) => /\bcomputer$/i.test(String(name ?? "").trim());
export const isPrinter = (name: string) => /^(desktop |high-quality )?printer$/i.test(String(name ?? "").trim());
export const isCardPrinter = (name: string) => /^card printer$/i.test(String(name ?? "").trim());
export const isStripEncoder = (name: string) => /^magnetic strip decoder\/encoder$/i.test(String(name ?? "").trim());

// ── disguise and smuggling (pp. 214-215) ──

/** A disguise with a few improvised items -- a wig, a heel lift -- is at -5 (p. 214). */
export const IMPROVISED_DISGUISE = -5;

/** The disguise kit a record's name is (p. 215). */
export function disguiseKitByName(name: string): "basic" | "advanced" | null {
  const text = String(name ?? "").trim();
  if (/^basic disguise kit$/i.test(text)) return "basic";
  if (/^advanced disguise kit$/i.test(text)) return "advanced";
  return null;
}

/** An advanced disguise needs a day to prepare, and two to six hours of fitting each time it's worn (p. 215). */
export const ADVANCED_DISGUISE = Object.freeze({ prepareHours: 24, fitting: { min: 2, max: 6 } });

/**
 * Smuggler's luggage (p. 215): a secret area holding a tenth of the listed
 * capacity, and +2 (quality) to Smuggling. The listed capacities in lbs. and
 * cubic feet.
 */
export const LUGGAGE: Readonly<Record<string, { lbs: number; cf: number }>> = Object.freeze({
  steamerTrunk: { lbs: 400, cf: 5 },
  travelBag: { lbs: 100, cf: 5 },
  attacheCase: { lbs: 20, cf: 2 },
});
export const HIDDEN_SHARE = 0.1;

/** The smuggler's luggage a record's name is. */
export function luggageByName(name: string): string | null {
  const text = String(name ?? "").trim();
  if (/^smuggler's steamer trunk$/i.test(text)) return "steamerTrunk";
  if (/^smuggler's travel bag$/i.test(text)) return "travelBag";
  if (/^smuggler's attach[eé] case$/i.test(text)) return "attacheCase";
  return null;
}

/** What a piece of luggage's secret area holds. */
export function hiddenCapacity(kind: string): { lbs: number; cf: number } | null {
  const listed = LUGGAGE[kind];
  return listed ? { lbs: listed.lbs * HIDDEN_SHARE, cf: listed.cf * HIDDEN_SHARE } : null;
}

// ── mule pills (p. 214) ──

/** A mule rolls HT at -1 per 50 pellets swallowed (p. 214). */
export const PELLETS_PER_PENALTY = 50;

export function muleModifier(pellets: number): number {
  const steps = Math.floor(Math.max(0, Math.floor(Number(pellets) || 0)) / PELLETS_PER_PENALTY);
  return steps ? -steps : 0;
}

/** What a mule's HT roll comes to: the ruse works, an incident, or a packet bursts (p. 214). */
export function muleOutcome(roll: { success: boolean; criticalFailure?: boolean }): "safe" | "incident" | "burst" {
  if (roll.success) return "safe";
  return roll.criticalFailure ? "burst" : "incident";
}

export const isMulePill = (name: string) => /^mule pills?$/i.test(String(name ?? "").trim());

/**
 * A burst packet: its contents -- "often" a lethal dose of cocaine or heroin
 * (p. 214) -- act as the Basic Set's overdose (Campaigns p. 441): the drug as a
 * poison at its own resistance roll (heroin's HT-4), 1 point of toxic damage
 * every 15 minutes for 24 cycles. Swallowed, it is already in the gut.
 */
export const BURST_PACKET = Object.freeze({
  name: "Burst mule pill",
  delivery: ["digestive"],
  delaySeconds: 0,
  resistanceModifier: -4,
  damage: "toxic",
  dice: 0,
  adds: 1,
  intervalSeconds: 15 * 60,
  cycles: 24,
  reference: "High-Tech p. 214; Campaigns p. 441",
});

/** Spotting a mule: a Quick Contest of Search or Observation against the mule's Acting (p. 214). */
export const SPOTTER_SKILLS = ["Search", "Observation"] as const;
/** An X-ray machine: Electronics Operation (Medical or Security) lets a Search roll find the pellets (p. 214). */
export const XRAY_SKILLS = ["Electronics Operation (Medical)", "Electronics Operation (Security)"] as const;
