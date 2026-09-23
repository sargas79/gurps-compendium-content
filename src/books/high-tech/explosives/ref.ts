/**
 * GURPS High-Tech's Relative Explosive Force table (p. 183), which expands the
 * Basic Set's (p. B415): each explosive's TL, its REF against TNT, and what it
 * is used as. Explosive damage is 6d x 4 x REF per pound (p. B415), so the
 * rules that set a charge read the explosive's REF here.
 *
 * Read by position from the page and checked row by row against it.
 */

export interface ExplosiveRow {
  tl: number;
  /** The explosive as the table names it, alternative names after a slash. */
  type: string;
  /** Relative Explosive Force: TNT is 1. */
  ref: number;
  /** The table's description: propellant, detonator, warhead filler, demolition or plastic explosive. */
  use: string;
}

export const EXPLOSIVES: readonly ExplosiveRow[] = [
  { tl: 3, type: "Serpentine Powder", ref: 0.3, use: "Propellant" },
  { tl: 4, type: "Ammonium Nitrate (AN)", ref: 0.4, use: "Demolition explosive" },
  { tl: 4, type: "Corned Powder", ref: 0.4, use: "Propellant" },
  { tl: 5, type: "Improved Black Powder", ref: 0.5, use: "Propellant" },
  { tl: 5, type: "Mercury Fulminate", ref: 0.5, use: "Detonator" },
  { tl: 6, type: "Lead Azide", ref: 0.4, use: "Detonator" },
  { tl: 6, type: "Blasting Gelatin (60%)", ref: 0.8, use: "Demolition explosive (NG)" },
  { tl: 6, type: "Smokeless Powder/Cordite", ref: 0.8, use: "Propellant" },
  { tl: 6, type: "Picric Acid (PA)/Lyddite", ref: 0.9, use: "Warhead filler" },
  { tl: 6, type: "TNT", ref: 1.0, use: "Warhead filler" },
  { tl: 6, type: "Amatol 80/20", ref: 1.2, use: "Warhead filler (AN/TNT)" },
  { tl: 6, type: "Dynamite (80%)", ref: 1.2, use: "Demolition explosive (NG)" },
  { tl: 6, type: "Nitrocellulose (NC)/Guncotton", ref: 1.3, use: "Propellant" },
  { tl: 6, type: "Tetryl", ref: 1.3, use: "Detonator" },
  { tl: 6, type: "Torpex", ref: 1.3, use: "Warhead filler for underwater use (RDX/TNT)" },
  { tl: 6, type: "Nitroglycerin (NG)", ref: 1.5, use: "Demolition explosive" },
  { tl: 6, type: "RDX/Hexogen/Cyclonite", ref: 1.6, use: "Warhead filler" },
  { tl: 6, type: "PETN", ref: 1.7, use: "Detonating cord filler" },
  { tl: 7, type: "ANFO", ref: 0.5, use: "Demolition explosive (AN)" },
  { tl: 7, type: "Military Dynamite", ref: 0.9, use: "Demolition explosive (RDX/TNT)" },
  { tl: 7, type: "Pentolite", ref: 1.3, use: "Warhead filler (PETN/TNT)" },
  { tl: 7, type: "Composition A", ref: 1.4, use: "Warhead filler (RDX)" },
  { tl: 7, type: "Composition B/Cyclotol", ref: 1.4, use: "Warhead filler (RDX/TNT)" },
  { tl: 7, type: "Composition C/PE1", ref: 1.4, use: "Plastic explosive (RDX)" },
  { tl: 7, type: "Composition C4", ref: 1.4, use: "Plastic explosive (RDX/Tetryl)" },
  { tl: 7, type: "Semtex-H", ref: 1.4, use: "Plastic explosive (RDX/PETN)" },
  { tl: 7, type: "HBX", ref: 1.5, use: "Warhead filler for underwater use (RDX/TNT)" },
  { tl: 7, type: "Octol", ref: 1.5, use: "Warhead filler (HMX/TNT)" },
  { tl: 7, type: "PBXN-5", ref: 1.6, use: "Warhead filler (HMX)" },
  { tl: 7, type: "HMX/Octogen", ref: 1.7, use: "Warhead filler" },
  { tl: 7, type: "Fuel-Air Explosive", ref: 5, use: "Demolition explosive (Ethylene Oxide)" },
  { tl: 8, type: "Liquid Explosive Foam", ref: 1.1, use: "Demolition explosive (Nitromethane)" },
  { tl: 8, type: "Demex", ref: 1.4, use: "Extrudable explosive (RDX)" },
  { tl: 8, type: "LX14", ref: 1.6, use: "Warhead filler (HMX)" },
  { tl: 8, type: "Thermobaric Composite", ref: 2, use: "Demolition explosive" },
  { tl: 8, type: "CL20", ref: 2.3, use: "Warhead filler" },
];

/** An explosive by any of the names the table gives it ("Cyclonite", "RDX"), ignoring case. */
export function explosive(name: string): ExplosiveRow | null {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return EXPLOSIVES.find((row) => {
    const names = row.type.toLowerCase().split("/").flatMap((part) => [part.trim(), part.replace(/\s*\(.*\)$/, "").trim()]);
    return names.includes(wanted) || row.type.toLowerCase() === wanted;
  }) ?? null;
}
