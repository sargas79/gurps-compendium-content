/**
 * Postures, hit locations and techniques (GURPS Martial Arts pp. 98-99): the
 * six posture tables as data, and dropping to the ground as part of an attack.
 *
 * The tables assume fighters within one Size Modifier of each other; beyond
 * that, the system's Combat at Different Levels applies. Everything here is
 * on top of the usual modifiers for posture, hit location and technique.
 */

/** The postures the tables are written for. The system's "lying" is face-up or prone. */
export type TablePosture = "standing" | "kneeling" | "sitting" | "crawling" | "faceUp" | "prone";

/** An attack as the tables tell attacks apart. */
export type AttackKind =
  | "kick" | "aerialKick" | "backKick" | "downwardKick"
  | "punch" | "twoHandedPunch" | "closeWeapon" | "reachWeapon"
  | "elbowStrike" | "elbowDrop" | "kneeStrike" | "kneeDrop" | "headButt"
  | "backbreaker" | "piledriver" | "scissorsHold" | "legSweep" | "usingLegs" | "slam"
  | "other";

/** A posture as the tables read it: the system's posture, and whether a lying fighter is face-up. */
export function tablePosture(posture: string, faceUp: boolean): TablePosture {
  if (posture === "lying") return faceUp ? "faceUp" : "prone";
  if (posture === "kneeling" || posture === "sitting" || posture === "crawling") return posture;
  return "standing";
}

/** What kind of attack this is, from its name, whether it is a weapon, and its reach. */
export function attackKind(name: string, weapon: { reach: string } | null): AttackKind {
  const n = name.toLowerCase();
  if (/(drop|flying jump|jump|pole-vault) kick/.test(n)) return "aerialKick";
  if (/back kick/.test(n)) return "backKick";
  if (/(axe|stamp) kick/.test(n)) return "downwardKick";
  if (/kick/.test(n)) return "kick";
  if (/elbow drop/.test(n)) return "elbowDrop";
  if (/elbow/.test(n)) return "elbowStrike";
  if (/knee drop/.test(n)) return "kneeDrop";
  if (/knee/.test(n)) return "kneeStrike";
  if (/head ?butt/.test(n)) return "headButt";
  if (/backbreaker/.test(n)) return "backbreaker";
  if (/piledriver/.test(n)) return "piledriver";
  if (/scissors/.test(n)) return "scissorsHold";
  if (/sweep/.test(n)) return "legSweep";
  if (/leg (grapple|lock)|using your legs/.test(n)) return "usingLegs";
  if (/slam|tackle/.test(n)) return "slam";
  if (/two-handed punch/.test(n)) return "twoHandedPunch";
  if (weapon) return /\bc\b/i.test(weapon.reach) && !/[1-9]/.test(weapon.reach) ? "closeWeapon" : "reachWeapon";
  if (/punch|jab|fist|strike/.test(n)) return "punch";
  return "other";
}

const KICKS: readonly AttackKind[] = ["kick", "aerialKick", "backKick", "downwardKick"];
const HEAD_LOCATIONS = ["neck", "face", "eye", "skull"];
const lyingDown = (p: TablePosture) => p === "faceUp" || p === "prone";

/** The attacks each posture rules out entirely (pp. 98-99). */
const PROHIBITED: Record<TablePosture, readonly AttackKind[]> = {
  standing: [],
  kneeling: [...KICKS, "backbreaker", "kneeDrop", "kneeStrike", "piledriver", "scissorsHold", "legSweep"],
  sitting: ["aerialKick", "backKick", "backbreaker", "kneeDrop", "piledriver", "slam"],
  crawling: ["backbreaker", "elbowDrop", "kneeDrop", "piledriver", "scissorsHold", "twoHandedPunch", "legSweep", "kick", "aerialKick", "downwardKick", "reachWeapon"],
  faceUp: ["aerialKick", "backKick", "backbreaker", "elbowDrop", "kneeDrop", "piledriver"],
  prone: ["backbreaker", "elbowDrop", "kneeDrop", "piledriver", "kick", "aerialKick", "downwardKick"],
};

export interface PostureEffect {
  /** Why the attack can't be made, as a key: "prohibited" or "outOfReach". Null when it can. */
  refusal: "prohibited" | "outOfReach" | null;
  /** Added to hit, by what for. */
  hit: Array<{ key: string; value: number }>;
  /** Added to damage. */
  damage: number;
}

/**
 * What the tables do to one attack: the attacker's posture, the target's, and
 * where the blow is aimed (a hit location key; "torso" when unaimed).
 */
export function postureEffect(options: { attacker: TablePosture; target: TablePosture; kind: AttackKind; location: string }): PostureEffect {
  const { attacker, target, kind, location } = options;
  const out: PostureEffect = { refusal: null, hit: [], damage: 0 };
  if (PROHIBITED[attacker].includes(kind)) return { ...out, refusal: "prohibited" };
  const head = HEAD_LOCATIONS.includes(location);
  const low = location === "leg" || location === "foot";
  const targetStanding = target === "standing";

  // Hit location effects.
  if (attacker === "standing") {
    if (head && (target === "kneeling" || target === "sitting")) out.hit.push({ key: "location", value: 1 });
    if (targetStanding && KICKS.includes(kind) && low) out.hit.push({ key: "location", value: 1 });
  } else if (attacker === "kneeling" || attacker === "sitting") {
    if (targetStanding && (low || location === "groin")) out.hit.push({ key: "location", value: 1 });
    if (targetStanding && head) out.hit.push({ key: "location", value: -1 });
  } else if (targetStanding) {
    if (low) out.hit.push({ key: "location", value: 2 });
    if (head) out.hit.push({ key: "location", value: -2 });
  }

  const reachRefused = (): PostureEffect => ({ ...out, hit: [], damage: 0, refusal: "outOfReach" });
  switch (attacker) {
    case "standing":
      if ((kind === "punch" || kind === "closeWeapon") && lyingDown(target)) out.hit.push({ key: "stoop", value: -2 });
      if ((kind === "elbowStrike" || kind === "kneeStrike" || kind === "headButt") && lyingDown(target)) return reachRefused();
      if (kind === "headButt" && (target === "kneeling" || target === "sitting" || target === "crawling")) out.hit.push({ key: "technique", value: -2 });
      break;
    case "kneeling":
    case "sitting":
      if (kind === "elbowDrop") {
        if (!(target === "crawling" || lyingDown(target))) return reachRefused();
        out.damage -= 1;
      }
      if (kind === "headButt" && (target === "crawling" || lyingDown(target))) out.hit.push({ key: "technique", value: -2 });
      if (kind === "headButt" && targetStanding && !(low || location === "groin")) return reachRefused();
      if (attacker === "sitting") {
        if (kind === "elbowStrike" && targetStanding && head) return reachRefused();
        if (kind === "kneeStrike" || kind === "legSweep" || kind === "kick") {
          out.hit.push({ key: "awkward", value: -1 });
          out.damage -= 1;
        }
        if (kind === "downwardKick") {
          if (!(target === "crawling" || lyingDown(target) || (targetStanding && location === "foot"))) return reachRefused();
          out.damage -= 1;
        }
      }
      break;
    case "crawling":
      if (kind === "elbowStrike") {
        if (targetStanding && head) return reachRefused();
        out.hit.push({ key: "awkward", value: -1 });
      }
      if (kind === "headButt" && targetStanding && !(low || location === "groin")) return reachRefused();
      if (kind === "kneeStrike" && !(lyingDown(target) || (target === "sitting" && low) || (targetStanding && location === "foot"))) return reachRefused();
      break;
    case "faceUp":
    case "prone": {
      const reachesOnly = attacker === "faceUp" ? low : location === "foot";
      const shortStrikes: AttackKind[] = attacker === "faceUp" ? ["elbowStrike", "headButt"] : ["elbowStrike", "headButt", "kneeStrike"];
      if (shortStrikes.includes(kind)) {
        if (targetStanding && !reachesOnly) return reachRefused();
        if (head && !(target === "crawling" || lyingDown(target))) return reachRefused();
      }
      const belowGroin: AttackKind[] = attacker === "faceUp" ? ["kneeStrike", "punch", "closeWeapon"] : ["punch", "closeWeapon"];
      if (belowGroin.includes(kind) && targetStanding && !(low || location === "groin")) return reachRefused();
      if (attacker === "faceUp" && (KICKS.includes(kind) || kind === "legSweep")) {
        out.hit.push({ key: "stability", value: 2 });
        out.damage -= 1;
      }
      break;
    }
  }
  return out;
}

/** A posture dropped to as part of an attack (p. 98). */
export type Drop = "kneeling" | "crawling" | "prone" | "sitting" | "faceUp";
export const DROPS: readonly Drop[] = ["kneeling", "crawling", "prone", "sitting", "faceUp"];

/** The maneuvers a drop may ride along with. */
export type DropManeuver = "attack" | "committed" | "allOutAttack" | "moveAndAttack";

/**
 * Whether a drop may be made from this posture, and what it costs: the whole
 * step or movement ("all"), or one movement point at the end of the move
 * ("point"). Null where it can't be made.
 */
export function dropCost(from: TablePosture, to: Drop, maneuver: DropManeuver): "all" | "point" | null {
  const endOfMove = maneuver === "allOutAttack" || maneuver === "moveAndAttack";
  if (from === "standing") {
    if (to === "kneeling" || to === "crawling" || to === "prone") return endOfMove ? "point" : "all";
    return maneuver === "moveAndAttack" ? "point" : "all";
  }
  if (from === "kneeling" && (to === "crawling" || to === "prone" || to === "faceUp")) return "all";
  if (from === "sitting" && to === "faceUp") return "all";
  return null;
}

/** The system's posture for a drop, and whether a lying fighter is face-up. */
export function postureOfDrop(to: Drop): { posture: "kneeling" | "crawling" | "sitting" | "lying"; faceUp: boolean } {
  if (to === "prone") return { posture: "lying", faceUp: false };
  if (to === "faceUp") return { posture: "lying", faceUp: true };
  return { posture: to, faceUp: false };
}
