/**
 * GURPS High-Tech's ammunition tables (pp. 175-177), one row per round: its name
 * as the book prints it, the table it is in, the weight and cost of one shot
 * (WPS, CPS) for a cased round with a solid projectile, and the footnotes that
 * say otherwise (p. 177). Decision D5 (#335): the rules that price loads and
 * weigh ammunition read this table and join it to a gun by its calibre.
 *
 * Read by position from the book's pages and checked row by row against them.
 */

/** The tables the book splits its rounds into, one per class of weapon. */
export type CalibreClass = "handgun" | "shotgun" | "rifle" | "cannon" | "grenadeLauncher" | "mortar" | "lightAntitank";

/**
 * The footnotes (p. 177): powder and shot (p. 163), an air-gun projectile
 * (pp. 88-89), light cased (p. 164), a shotshell (p. 173), caseless
 * (pp. 164-165), SAPFSDS (p. 168), an underwater dart (p. 169), consumable and
 * semi-consumable cased (p. 164), a mortar shell.
 */
export type CalibreNote =
  | "powderAndShot" | "airGun" | "lightCased" | "shotshell" | "caseless" | "sapfsds"
  | "underwaterDart" | "consumableCased" | "semiConsumableCased" | "mortarShell";

export interface CalibreRow {
  /** As the book prints it: ".45 ACP (11.43×23mm)", "12-gauge 2.75” (18.5×70mmR)". */
  name: string;
  class: CalibreClass;
  /** Weight per shot, in pounds. */
  wps: number;
  /** Cost per shot, in dollars. */
  cps: number;
  notes: CalibreNote[];
  page: number;
}

export const CALIBRES: readonly CalibreRow[] = [
  { name: "4.6×30mm Royal Ordnance", class: "handgun", wps: 0.013, cps: 0.4, notes: [], page: 176 },
  { name: ".22 Short (5.6×11mmR)", class: "handgun", wps: 0.0054, cps: 0.05, notes: [], page: 176 },
  { name: "5.7×28mm Fabrique Nationale", class: "handgun", wps: 0.013, cps: 0.4, notes: [], page: 176 },
  { name: ".25 ACP (6.35×16mmSR Browning)", class: "handgun", wps: 0.012, cps: 0.1, notes: [], page: 176 },
  { name: ".28 Caplock (Colt Number 1)", class: "handgun", wps: 0.006, cps: 0.1, notes: ["powderAndShot"], page: 176 },
  { name: "7.62×25mm Tokarev", class: "handgun", wps: 0.024, cps: 0.2, notes: [], page: 176 },
  { name: "7.62×39mmR Nagant", class: "handgun", wps: 0.028, cps: 0.2, notes: [], page: 176 },
  { name: "7.62×42mm", class: "handgun", wps: 0.053, cps: 0.5, notes: [], page: 176 },
  { name: "7.63×25mm Mauser", class: "handgun", wps: 0.023, cps: 0.2, notes: [], page: 176 },
  { name: ".32 ACP (7.65×17mmSR Browning)", class: "handgun", wps: 0.018, cps: 0.1, notes: [], page: 176 },
  { name: "7.65×21mm Parabellum", class: "handgun", wps: 0.023, cps: 0.2, notes: [], page: 176 },
  { name: ".31 Caplock (Allen)", class: "handgun", wps: 0.007, cps: 0.1, notes: ["powderAndShot"], page: 176 },
  { name: "8×21mm Nambu", class: "handgun", wps: 0.025, cps: 0.2, notes: [], page: 176 },
  { name: ".380 ACP (9×17mm)", class: "handgun", wps: 0.021, cps: 0.2, notes: [], page: 176 },
  { name: "9×18mm Makarov", class: "handgun", wps: 0.022, cps: 0.2, notes: [], page: 176 },
  { name: "9×19mm Parabellum", class: "handgun", wps: 0.026, cps: 0.3, notes: [], page: 176 },
  { name: ".38 S&W (9×20mmR)", class: "handgun", wps: 0.035, cps: 0.2, notes: [], page: 176 },
  { name: "9×21mm Gyurza", class: "handgun", wps: 0.024, cps: 0.4, notes: [], page: 176 },
  { name: ".357 SIG (9×22mm)", class: "handgun", wps: 0.029, cps: 0.4, notes: [], page: 176 },
  { name: "9×23mm Bergmann-Bayard", class: "handgun", wps: 0.027, cps: 0.3, notes: [], page: 176 },
  { name: ".38 ACP (9×23mmSR)", class: "handgun", wps: 0.029, cps: 0.2, notes: [], page: 176 },
  { name: ".38 Super Auto (9×23mmSR)", class: "handgun", wps: 0.029, cps: 0.3, notes: [], page: 176 },
  { name: "9×25mm Mauser", class: "handgun", wps: 0.029, cps: 0.4, notes: [], page: 176 },
  { name: ".38 Long Colt (9×26mmR)", class: "handgun", wps: 0.033, cps: 0.2, notes: [], page: 176 },
  { name: ".38 Special (9×29mmR)", class: "handgun", wps: 0.033, cps: 0.3, notes: [], page: 176 },
  { name: ".357 Magnum (9×33mmR)", class: "handgun", wps: 0.035, cps: 0.4, notes: [], page: 176 },
  { name: ".36 Caplock (Colt Number 5)", class: "handgun", wps: 0.014, cps: 0.1, notes: ["powderAndShot"], page: 176 },
  { name: ".36 Caplock (M1851 Navy)", class: "handgun", wps: 0.023, cps: 0.1, notes: ["powderAndShot"], page: 176 },
  { name: ".41 Short Remington (10×12mmR)", class: "handgun", wps: 0.025, cps: 0.2, notes: [], page: 176 },
  { name: ".40 S&W (10×21mm)", class: "handgun", wps: 0.035, cps: 0.3, notes: [], page: 176 },
  { name: "10×25mm Auto", class: "handgun", wps: 0.042, cps: 0.6, notes: [], page: 176 },
  { name: ".41 Long Colt (10×29mmR)", class: "handgun", wps: 0.04, cps: 0.2, notes: [], page: 176 },
  { name: ".42 Caplock (LeMat)", class: "handgun", wps: 0.018, cps: 0.2, notes: ["powderAndShot"], page: 176 },
  { name: ".44 Special (10.9×29mmR)", class: "handgun", wps: 0.047, cps: 0.4, notes: [], page: 176 },
  { name: ".44 Magnum (10.9×33mmR)", class: "handgun", wps: 0.054, cps: 0.7, notes: [], page: 176 },
  { name: ".44 American (11×23mmR)", class: "handgun", wps: 0.043, cps: 0.4, notes: [], page: 176 },
  { name: ".44 Russian (11×25mmR)", class: "handgun", wps: 0.049, cps: 0.4, notes: [], page: 176 },
  { name: ".44 Caplock (Deringer)", class: "handgun", wps: 0.022, cps: 0.2, notes: ["powderAndShot"], page: 176 },
  { name: ".44 Caplock (M1860 Army)", class: "handgun", wps: 0.023, cps: 0.2, notes: ["powderAndShot"], page: 176 },
  { name: ".44 Caplock (M1848 Dragoon)", class: "handgun", wps: 0.028, cps: 0.3, notes: ["powderAndShot"], page: 176 },
  { name: ".44 Caplock (M1847 Walker)", class: "handgun", wps: 0.03, cps: 0.3, notes: ["powderAndShot"], page: 176 },
  { name: ".442 Caplock (Adams)", class: "handgun", wps: 0.019, cps: 0.2, notes: ["powderAndShot"], page: 176 },
  { name: ".442 RIC (11.2×17mmR)", class: "handgun", wps: 0.043, cps: 0.4, notes: [], page: 176 },
  { name: ".44 Colt (11.25×28mmR)", class: "handgun", wps: 0.045, cps: 0.4, notes: [], page: 176 },
  { name: ".45 Flintlock (Wogdon)", class: "handgun", wps: 0.023, cps: 0.2, notes: ["powderAndShot"], page: 176 },
  { name: ".45 GAP (11.43×19mm)", class: "handgun", wps: 0.045, cps: 0.5, notes: [], page: 176 },
  { name: ".45 ACP (11.43×23mm)", class: "handgun", wps: 0.047, cps: 0.5, notes: [], page: 176 },
  { name: ".45 S&W (11.43×28mmR)", class: "handgun", wps: 0.045, cps: 0.5, notes: [], page: 176 },
  { name: ".45 Long Colt (11.43×33mmR)", class: "handgun", wps: 0.05, cps: 0.5, notes: [], page: 176 },
  { name: ".454 Casull (11.43×35mmR)", class: "handgun", wps: 0.066, cps: 1, notes: [], page: 176 },
  { name: ".455 Webley (11.5×19mmR)", class: "handgun", wps: 0.05, cps: 0.5, notes: [], page: 176 },
  { name: "12×16mm Lefaucheux", class: "handgun", wps: 0.05, cps: 0.5, notes: [], page: 176 },
  { name: ".450 Adams (12.05×17mmR)", class: "handgun", wps: 0.045, cps: 0.3, notes: [], page: 176 },
  { name: ".476 Enfield (12.05×22mmR)", class: "handgun", wps: 0.055, cps: 0.5, notes: [], page: 176 },
  { name: ".50 Flintlock (Collier)", class: "handgun", wps: 0.026, cps: 0.3, notes: ["powderAndShot"], page: 176 },
  { name: ".50 Action Express (12.7×33mm)", class: "handgun", wps: 0.067, cps: 1, notes: [], page: 176 },
  { name: "13×36mm Gyrojet", class: "handgun", wps: 0.03, cps: 7.5, notes: [], page: 176 },
  { name: ".54 Caplock (Elgin Cutlass)", class: "handgun", wps: 0.05, cps: 0.4, notes: ["powderAndShot"], page: 176 },
  { name: ".56 Flintlock (Tower Sea Service)", class: "handgun", wps: 0.05, cps: 0.4, notes: ["powderAndShot"], page: 176 },
  { name: "17.1mm Flintlock (AN IX)", class: "handgun", wps: 0.076, cps: 0.4, notes: ["powderAndShot"], page: 176 },
  { name: ".68 Paintball", class: "handgun", wps: 0.0068, cps: 0.05, notes: ["airGun"], page: 176 },
  { name: ".75 Flintlock (Rigby)", class: "handgun", wps: 0.075, cps: 0.5, notes: ["powderAndShot"], page: 176 },
  { name: ".410 2.5” (10.4×63mmR)", class: "shotgun", wps: 0.04, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: ".410 3” (10.4×76mmR)", class: "shotgun", wps: 0.05, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "32-gauge 2.75” (12.5×70mmR)", class: "shotgun", wps: 0.06, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "20-gauge Caplock", class: "shotgun", wps: 0.075, cps: 0.4, notes: ["powderAndShot", "shotshell"], page: 176 },
  { name: "20-gauge 2.5” (15.6×63mmR)", class: "shotgun", wps: 0.07, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "20-gauge 2.75” (15.6×70mmR)", class: "shotgun", wps: 0.08, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "16-gauge Flintlock", class: "shotgun", wps: 0.085, cps: 0.5, notes: ["powderAndShot", "shotshell"], page: 176 },
  { name: "16-gauge 2.75” (16.8×70mmR)", class: "shotgun", wps: 0.09, cps: 0.4, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "12-gauge 2.5” (18.5×63mmR)", class: "shotgun", wps: 0.1, cps: 0.5, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "12-gauge 2.75” (18.5×70mmR)", class: "shotgun", wps: 0.11, cps: 0.5, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "12-gauge 2.75” (18.5×70mmR)", class: "shotgun", wps: 0.13, cps: 0.7, notes: ["shotshell"], page: 176 },
  { name: "12-gauge 3” (18.5×76mmR)", class: "shotgun", wps: 0.18, cps: 0.7, notes: ["lightCased", "shotshell"], page: 176 },
  { name: "11-gauge Flintlock", class: "shotgun", wps: 0.12, cps: 0.5, notes: ["powderAndShot", "shotshell"], page: 176 },
  { name: "10-gauge 2.875” (19.7×73mmR)", class: "shotgun", wps: 0.15, cps: 1.3, notes: ["lightCased", "shotshell"], page: 176 },
  { name: ".175 BB", class: "rifle", wps: 0.0008, cps: 0.003, notes: ["airGun"], page: 176 },
  { name: "4.73×33mm Dynamit-Nobel", class: "rifle", wps: 0.011, cps: 0.5, notes: ["caseless"], page: 176 },
  { name: "5.45×39mm", class: "rifle", wps: 0.023, cps: 0.4, notes: [], page: 176 },
  { name: ".223 Remington", class: "rifle", wps: 0.026, cps: 0.5, notes: [], page: 176 },
  { name: "5.56×45mm NATO", class: "rifle", wps: 0.027, cps: 0.5, notes: [], page: 176 },
  { name: ".220 Swift (5.56×56mmR)", class: "rifle", wps: 0.033, cps: 1, notes: [], page: 176 },
  { name: "5.6×57mmB", class: "rifle", wps: 0.016, cps: 1, notes: ["sapfsds"], page: 176 },
  { name: "5.66×39mm", class: "rifle", wps: 0.062, cps: 2, notes: ["underwaterDart"], page: 176 },
  { name: ".22 Long Rifle (5.7×16mmR)", class: "rifle", wps: 0.0077, cps: 0.1, notes: [], page: 176 },
  { name: "5.7×26mm Usel", class: "rifle", wps: 0.011, cps: 0.4, notes: ["caseless"], page: 176 },
  { name: "5.8×42mm", class: "rifle", wps: 0.028, cps: 0.5, notes: [], page: 176 },
  { name: "6×60mm Lee (.236 Navy)", class: "rifle", wps: 0.044, cps: 0.8, notes: [], page: 176 },
  { name: "6.5×50mmSR Arisaka", class: "rifle", wps: 0.046, cps: 0.8, notes: [], page: 176 },
  { name: "6.5×52mm Mannlicher-Carcano", class: "rifle", wps: 0.049, cps: 0.8, notes: [], page: 176 },
  { name: "6.5×53mmR Dutch Mannlicher", class: "rifle", wps: 0.049, cps: 0.8, notes: [], page: 176 },
  { name: "6.5×55mm Mauser", class: "rifle", wps: 0.053, cps: 0.8, notes: [], page: 176 },
  { name: "7×57mm Mauser", class: "rifle", wps: 0.054, cps: 0.8, notes: [], page: 176 },
  { name: "7×64mmB Remington Magnum", class: "rifle", wps: 0.062, cps: 1.5, notes: [], page: 176 },
  { name: ".280 Remington (7×65mm Express)", class: "rifle", wps: 0.054, cps: 1, notes: [], page: 176 },
  { name: "7.5×54mm MAS", class: "rifle", wps: 0.053, cps: 0.8, notes: [], page: 176 },
  { name: ".30 M1 Carbine (7.62×33mm)", class: "rifle", wps: 0.029, cps: 0.4, notes: [], page: 176 },
  { name: "7.62×39mm", class: "rifle", wps: 0.036, cps: 0.6, notes: [], page: 176 },
  { name: ".30-30 Winchester (7.62×51mmR)", class: "rifle", wps: 0.047, cps: 0.8, notes: [], page: 176 },
  { name: "7.62×51mm NATO (.308 Winchester)", class: "rifle", wps: 0.056, cps: 0.8, notes: [], page: 176 },
  { name: ".30 Remington (7.62×52mm)", class: "rifle", wps: 0.044, cps: 0.8, notes: [], page: 176 },
  { name: "7.62×54mmR Mosin-Nagant", class: "rifle", wps: 0.05, cps: 0.8, notes: [], page: 176 },
  { name: ".30-40 Krag (7.62×59mmR)", class: "rifle", wps: 0.059, cps: 0.8, notes: [], page: 176 },
  { name: ".30-06 Springfield (7.62×63mm)", class: "rifle", wps: 0.056, cps: 0.8, notes: [], page: 176 },
  { name: ".300 Winchester Magnum (7.62×66mmB)", class: "rifle", wps: 0.068, cps: 1.5, notes: [], page: 176 },
  { name: ".300 Remington Ultra Magnum (7.62×72mmRB)", class: "rifle", wps: 0.075, cps: 2, notes: [], page: 176 },
  { name: "7.65×53mm Mauser", class: "rifle", wps: 0.053, cps: 0.8, notes: [], page: 176 },
  { name: ".303 British (7.7×56mmR)", class: "rifle", wps: 0.055, cps: 0.8, notes: [], page: 176 },
  { name: "7.7×58mm Arisaka", class: "rifle", wps: 0.049, cps: 0.8, notes: [], page: 176 },
  { name: "7.7×58mmSR Arisaka", class: "rifle", wps: 0.061, cps: 0.8, notes: [], page: 176 },
  { name: ".32 Long Rifle (7.92×24mmR)", class: "rifle", wps: 0.022, cps: 0.2, notes: [], page: 176 },
  { name: ".32-20 Winchester (7.92×33mmR)", class: "rifle", wps: 0.027, cps: 0.4, notes: [], page: 176 },
  { name: "7.92×33mm Kurz", class: "rifle", wps: 0.037, cps: 0.6, notes: [], page: 176 },
  { name: "7.92×57mm Mauser", class: "rifle", wps: 0.059, cps: 0.8, notes: [], page: 176 },
  { name: "8×50mmR Lebel", class: "rifle", wps: 0.061, cps: 0.8, notes: [], page: 176 },
  { name: "8×50mmR Mannlicher", class: "rifle", wps: 0.062, cps: 0.8, notes: [], page: 176 },
  { name: "8×58mmR Krag", class: "rifle", wps: 0.064, cps: 0.8, notes: [], page: 176 },
  { name: "8×60mm Mauser", class: "rifle", wps: 0.055, cps: 0.8, notes: [], page: 176 },
  { name: "8×63mm Bofors", class: "rifle", wps: 0.064, cps: 1, notes: [], page: 177 },
  { name: ".338 Lapua Magnum (8.6×70mm)", class: "rifle", wps: 0.096, cps: 3.5, notes: [], page: 177 },
  { name: ".35 Remington (8.9×49mm)", class: "rifle", wps: 0.052, cps: 0.8, notes: [], page: 177 },
  { name: "9×39mm", class: "rifle", wps: 0.051, cps: 0.5, notes: [], page: 177 },
  { name: "9.3×74mmR", class: "rifle", wps: 0.074, cps: 2, notes: [], page: 177 },
  { name: ".375 H&H Magnum (9.35×72mmB)", class: "rifle", wps: 0.086, cps: 2.5, notes: [], page: 177 },
  { name: ".38 Volcanic", class: "rifle", wps: 0.015, cps: 0.25, notes: [], page: 177 },
  { name: ".38-40 Winchester (10×33mmR)", class: "rifle", wps: 0.04, cps: 0.8, notes: [], page: 177 },
  { name: ".40-90 Sharps (10.2×67mmR)", class: "rifle", wps: 0.09, cps: 1.5, notes: [], page: 177 },
  { name: ".44 Henry (10.7×22mmR)", class: "rifle", wps: 0.045, cps: 0.4, notes: [], page: 177 },
  { name: "10.75×58mmR Berdan", class: "rifle", wps: 0.088, cps: 1, notes: [], page: 177 },
  { name: "10.75×68mm Mauser", class: "rifle", wps: 0.088, cps: 1.5, notes: [], page: 177 },
  { name: ".44-40 Winchester (10.8×33mmR)", class: "rifle", wps: 0.043, cps: 0.6, notes: [], page: 177 },
  { name: ".444 Marlin (10.9×57mmR)", class: "rifle", wps: 0.052, cps: 1.5, notes: [], page: 177 },
  { name: "11mm Syringe", class: "rifle", wps: 0.02, cps: 15, notes: ["airGun"], page: 177 },
  { name: "11.15×58mmR (.43 Spanish Remington)", class: "rifle", wps: 0.092, cps: 1, notes: [], page: 177 },
  { name: ".44-90 Remington Special (11.2×62mmR)", class: "rifle", wps: 0.11, cps: 2.8, notes: [], page: 177 },
  { name: ".44-90 Sharps (11.3×61mmR)", class: "rifle", wps: 0.11, cps: 2.8, notes: [], page: 177 },
  { name: "11.4×50mmR (.43 Egyptian Remington)", class: "rifle", wps: 0.094, cps: 1, notes: [], page: 177 },
  { name: ".45 Flintlock (Kentucky)", class: "rifle", wps: 0.025, cps: 0.3, notes: ["powderAndShot"], page: 177 },
  { name: ".45-75 Winchester (11.43×48mmR)", class: "rifle", wps: 0.085, cps: 1, notes: [], page: 177 },
  { name: ".45-55 Springfield (11.43×53mmR)", class: "rifle", wps: 0.08, cps: 0.9, notes: [], page: 177 },
  { name: ".45-70 Springfield (11.43×53mmR)", class: "rifle", wps: 0.086, cps: 1, notes: [], page: 177 },
  { name: ".450 Martini-Henry (11.43×59mmR)", class: "rifle", wps: 0.11, cps: 1, notes: [], page: 177 },
  { name: ".450 Gardner-Gatling (11.43×63mmR)", class: "rifle", wps: 0.12, cps: 1.2, notes: [], page: 177 },
  { name: ".45-110 Sharps (11.43×73mmR)", class: "rifle", wps: 0.12, cps: 1.8, notes: [], page: 177 },
  { name: ".458 Winchester Magnum (11.63×64mmB)", class: "rifle", wps: 0.11, cps: 4, notes: [], page: 177 },
  { name: ".460 Weatherby Magnum (11.63×74mmB)", class: "rifle", wps: 0.14, cps: 7.5, notes: [], page: 177 },
  { name: "11.75mm Girandoni", class: "rifle", wps: 0.021, cps: 0.2, notes: ["airGun"], page: 177 },
  { name: ".470 Nitro Express (12×83mmR)", class: "rifle", wps: 0.12, cps: 10, notes: [], page: 177 },
  { name: ".50 Flintlock (North West)", class: "rifle", wps: 0.035, cps: 0.4, notes: ["powderAndShot"], page: 177 },
  { name: ".50-95 Winchester Express (12.7×49mmR)", class: "rifle", wps: 0.06, cps: 1.3, notes: [], page: 177 },
  { name: "12.7×77mm", class: "rifle", wps: 0.25, cps: 1.6, notes: [], page: 177 },
  { name: ".50 Browning (12.7×99mm)", class: "rifle", wps: 0.25, cps: 4, notes: [], page: 177 },
  { name: "12.7×108mm", class: "rifle", wps: 0.31, cps: 5, notes: [], page: 177 },
  { name: ".50-90 Sharps (12.9×64mmR)", class: "rifle", wps: 0.11, cps: 1.3, notes: [], page: 177 },
  { name: ".50-140 Sharps (12.9×83mmR)", class: "rifle", wps: 0.15, cps: 1.5, notes: [], page: 177 },
  { name: ".56-50 Spencer (13×29mmR)", class: "rifle", wps: 0.062, cps: 0.6, notes: [], page: 177 },
  { name: ".50-70 Government (13×44mmR)", class: "rifle", wps: 0.086, cps: 1, notes: [], page: 177 },
  { name: "13×92mmSR Mauser", class: "rifle", wps: 0.26, cps: 4.4, notes: [], page: 177 },
  { name: ".54 Flintlock (Hall M1819)", class: "rifle", wps: 0.044, cps: 0.3, notes: ["powderAndShot"], page: 177 },
  { name: ".56-56 Spencer (14×22mmR)", class: "rifle", wps: 0.073, cps: 0.6, notes: [], page: 177 },
  { name: "14.5×114mm", class: "rifle", wps: 0.44, cps: 6.7, notes: [], page: 177 },
  { name: ".577 Caplock (Enfield)", class: "rifle", wps: 0.086, cps: 0.4, notes: ["powderAndShot"], page: 177 },
  { name: ".577 Snider (14.6×51mmR)", class: "rifle", wps: 0.1, cps: 0.8, notes: [], page: 177 },
  { name: ".58 Berdan (15×44mmR)", class: "rifle", wps: 0.12, cps: 0.7, notes: [], page: 177 },
  { name: ".600 Nitro Express (15.2×76mmR)", class: "rifle", wps: 0.2, cps: 20, notes: [], page: 177 },
  { name: "15.43×54mm Dreyse", class: "rifle", wps: 0.085, cps: 0.4, notes: ["consumableCased"], page: 177 },
  { name: ".625 Flintlock (Baker)", class: "rifle", wps: 0.062, cps: 0.4, notes: ["powderAndShot"], page: 177 },
  { name: ".68 FN", class: "rifle", wps: 0.019, cps: 1.5, notes: ["airGun"], page: 177 },
  { name: "17.5mm Flintlock (Mle 1777)", class: "rifle", wps: 0.087, cps: 0.4, notes: ["powderAndShot"], page: 177 },
  { name: ".700 Nitro Express (17.8×89mmR)", class: "rifle", wps: 0.25, cps: 75, notes: [], page: 177 },
  { name: ".75 Flintlock (Brown Bess)", class: "rifle", wps: 0.09, cps: 0.4, notes: ["powderAndShot"], page: 177 },
  { name: "8-bore (21.2×70mmR)", class: "rifle", wps: 0.26, cps: 4, notes: [], page: 177 },
  { name: "20×82mm Mauser", class: "cannon", wps: 0.45, cps: 8, notes: [], page: 177 },
  { name: "20×102mm", class: "cannon", wps: 0.57, cps: 10, notes: [], page: 177 },
  { name: "20×110mmRB Oerlikon", class: "cannon", wps: 0.54, cps: 10, notes: [], page: 177 },
  { name: "20×138mmB Solothurn", class: "cannon", wps: 0.74, cps: 10, notes: [], page: 177 },
  { name: "25×137mm Oerlikon", class: "cannon", wps: 1.1, cps: 15, notes: [], page: 177 },
  { name: "1” Gatling (25.5×97mmR)", class: "cannon", wps: 0.82, cps: 10, notes: [], page: 177 },
  { name: "37×94mmR Hotchkiss", class: "cannon", wps: 1.4, cps: 16.5, notes: [], page: 177 },
  { name: "37×249mmR", class: "cannon", wps: 2.9, cps: 20, notes: [], page: 177 },
  { name: "1.5” Caplock (Greener)", class: "cannon", wps: 5, cps: 10, notes: ["powderAndShot"], page: 177 },
  { name: "2.5” Caplock (Screw-Gun)", class: "cannon", wps: 7.4, cps: 11, notes: ["powderAndShot"], page: 177 },
  { name: "75×350mmR", class: "cannon", wps: 20, cps: 55, notes: [], page: 177 },
  { name: "75×495mmR", class: "cannon", wps: 23, cps: 60, notes: [], page: 177 },
  { name: "76.2×539mmR (3”)", class: "cannon", wps: 24, cps: 60, notes: [], page: 177 },
  { name: "105×371mmR", class: "cannon", wps: 40, cps: 75, notes: [], page: 177 },
  { name: "106×607mmR", class: "cannon", wps: 38, cps: 185, notes: [], page: 177 },
  { name: "12-pounder Cannonlock", class: "cannon", wps: 15, cps: 25, notes: ["powderAndShot"], page: 177 },
  { name: "125×408mmR", class: "cannon", wps: 73, cps: 255, notes: ["semiConsumableCased"], page: 177 },
  { name: "20×28mm", class: "grenadeLauncher", wps: 0.21, cps: 6, notes: ["lightCased"], page: 177 },
  { name: "25×59mmB", class: "grenadeLauncher", wps: 0.37, cps: 7.5, notes: ["lightCased"], page: 177 },
  { name: "1” Flare (25.4×107mmR)", class: "grenadeLauncher", wps: 0.2, cps: 1, notes: ["lightCased"], page: 177 },
  { name: "26.5×103mmR", class: "grenadeLauncher", wps: 0.22, cps: 1, notes: ["lightCased"], page: 177 },
  { name: "30×28mmB", class: "grenadeLauncher", wps: 0.77, cps: 7, notes: ["lightCased"], page: 177 },
  { name: "37×122mmR", class: "grenadeLauncher", wps: 0.37, cps: 5, notes: ["lightCased"], page: 177 },
  { name: "40mm VOG-25", class: "grenadeLauncher", wps: 0.55, cps: 5, notes: ["mortarShell"], page: 177 },
  { name: "40×46mmSR", class: "grenadeLauncher", wps: 0.5, cps: 5, notes: ["lightCased"], page: 177 },
  { name: "40×53mmSR", class: "grenadeLauncher", wps: 0.75, cps: 7.5, notes: ["lightCased"], page: 177 },
  { name: "2”", class: "mortar", wps: 2.25, cps: 15, notes: ["mortarShell"], page: 177 },
  { name: "52mm", class: "mortar", wps: 1.7, cps: 15, notes: ["mortarShell"], page: 177 },
  { name: "60mm", class: "mortar", wps: 3.2, cps: 20, notes: ["mortarShell"], page: 177 },
  { name: "3”", class: "mortar", wps: 10, cps: 35, notes: ["mortarShell"], page: 177 },
  { name: "81mm", class: "mortar", wps: 11.7, cps: 35, notes: ["mortarShell"], page: 177 },
  { name: "82mm", class: "mortar", wps: 7.4, cps: 25, notes: ["mortarShell"], page: 177 },
  { name: "120mm", class: "mortar", wps: 35.2, cps: 60, notes: ["mortarShell"], page: 177 },
  { name: "57×305mmR", class: "lightAntitank", wps: 5.5, cps: 70, notes: ["lightCased"], page: 177 },
  { name: "84×250mmR", class: "lightAntitank", wps: 5.7, cps: 75, notes: ["lightCased"], page: 177 },
];

/** A calibre as a gun's name writes it, and as the table does, alike: "×" and "x", "”" and "''". */
export function calibreKey(text: string): string {
  return String(text ?? "").replace(/×/g, "x").replace(/”|''|"/g, "in").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The rows a calibre names: those whose name is it, starts with it, or holds it
 * in brackets -- "9x19mm" finds "9×19mm Parabellum", "11.43x23mm" finds
 * ".45 ACP (11.43×23mm)". A gun's calibre can name more than one row (the
 * 12-gauge 2.75” shell comes light and full), so this returns them all.
 */
export function calibreRows(calibre: string): CalibreRow[] {
  const key = calibreKey(calibre);
  if (!key) return [];
  return CALIBRES.filter((row) => {
    const name = calibreKey(row.name);
    const bracketed = /\(([^)]*)\)/.exec(name)?.[1] ?? "";
    return name === key || name.startsWith(`${key} `) || bracketed === key;
  });
}

/**
 * The short forms the book's weapon names use for a calibre the table spells
 * out: "12G 2.75''" for the 12-gauge 2.75” shell, ".22 LR", ".600 NE",
 * ".450 MH", ".300 WM", ".50 AE".
 */
const SHORT_FORMS: ReadonlyArray<[RegExp, string]> = [
  [/^(\d+)G\b/i, "$1-gauge"],
  [/\bLR$/i, "Long Rifle"],
  [/\bNE$/i, "Nitro Express"],
  [/\bMH$/i, "Martini-Henry"],
  [/\bWM$/i, "Winchester Magnum"],
  [/\bAE$/i, "Action Express"],
];

/** The rows a calibre names as a gun's name writes it: the table's spelling, or the book's short form of it. */
export function gunCalibreRows(calibre: string): CalibreRow[] {
  const own = calibreRows(calibre);
  if (own.length) return own;
  const long = SHORT_FORMS.reduce((text, [short, full]) => text.replace(short, full), String(calibre ?? "").trim());
  return long === calibre ? [] : calibreRows(long);
}

/** The calibre after the last comma of a weapon's name ("IMI Galil ARM, .223 Remington"), or the whole text. */
export function calibreText(name: string): string {
  const text = String(name ?? "");
  const at = text.lastIndexOf(",");
  return (at < 0 ? text : text.slice(at + 1)).trim();
}

/**
 * The table a gun's rounds are in, from its weapon skill: handgun rounds for
 * a pistol, a submachine gun or a Gyroc; the rifle table (which holds the
 * muskets) for a musket, a rifle or a machine gun; the shotgun, grenade
 * launcher, light anti-armour and cannon tables for theirs. Null where the
 * skill doesn't say.
 */
export function calibreClassOf(skill: string): CalibreClass | null {
  const specialty = (/\(([^)]+)\)/.exec(String(skill ?? ""))?.[1] ?? "").trim().toLowerCase();
  if (["pistol", "submachine gun", "gyroc"].includes(specialty)) return "handgun";
  if (["musket", "rifle", "light machine gun", "machine gun"].includes(specialty)) return "rifle";
  if (specialty === "shotgun") return "shotgun";
  if (specialty === "grenade launcher") return "grenadeLauncher";
  if (specialty === "light anti-armor weapon") return "lightAntitank";
  if (specialty === "cannon") return "cannon";
  return null;
}

/**
 * The table row a gun's name, or a box's calibre, names. A calibre can be in
 * more than one table (".75 Flintlock" is the Rigby pistol's and the Brown
 * Bess musket's), so a row of the gun's own table (from its skill) comes
 * first; then one whose bracketed maker the name holds ("Brown Bess,
 * .75 Flintlock"); then the first.
 */
export function calibreRowOf(text: string, skill = ""): CalibreRow | null {
  const rows = gunCalibreRows(calibreText(text));
  const cls = calibreClassOf(skill);
  const own = rows.filter((row) => row.class === cls);
  const pool = own.length ? own : rows;
  const at = String(text ?? "").lastIndexOf(",");
  const named = at < 0 ? "" : calibreKey(String(text).slice(0, at));
  const maker = named ? pool.find((row) => {
    const bracketed = /\(([^)]*)\)/.exec(calibreKey(row.name))?.[1] ?? "";
    return bracketed !== "" && named.includes(bracketed);
  }) : undefined;
  return maker ?? pool[0] ?? null;
}
