/**
 * The four vehicle tables of the Basic Set Revised (pp. 464-465), as Markdown tables.
 * The layout reader loses their column headings and the rows of two of them, so the
 * tables are written out from `pdftotext -raw`; see revised-fixes.mjs.
 */
export const VEHICLE_TABLES = String.raw`#### Ground Vehicle Table

| TL | Vehicle | ST/HP | Hnd/SR | HT | Move | LWt. | Load | SM | Occ. | DR | Range | Cost | Loc. | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | **Teamster** | | | | | | | | | | | | | |
| 0 | Dogsled | 27† | 0/2 | 12c | 6/6 | 0.29 | 0.14 | +1 | 1 | 2 | F | $400 | 14DER | [1] |
| 1 | Chariot | 22† | 0/2 | 11c | 4/9\* | 0.29 | 0.2 | +1 | 1+1 | 1 | F | $330 | 2DE2W | [1] |
| 3 | Wagon | 35† | -3/4 | 12c | 4/8\* | 0.84 | 0.5 | +2 | 1 | 2 | F | $680 | 2DE4W | [1] |
| 4 | Coach | 53† | -2/3 | 12c | 4/9\* | 2.4 | 1.2 | +3 | 1+9 | 2 | F | $11K | 4DO4W | [1] |
| | **Driving/TL (Locomotive)** | | | | | | | | | | | | | |
| 5 | Locomotive | 152 | -2/5 | 11 | 1/35‡ | 28 | 0.2 | +5 | 1+1 | 8 | 700 | $45K | 8W |  |
| | **Driving/TL (Automobile)** | | | | | | | | | | | | | |
| 6 | Roadster | 42 | -1/3 | 9f | 2/22\* | 0.85 | 0.25 | +2 | 1+1 | 4 | 200 | $3.6K | O4W |  |
| 6 | Sedan | 46 | 0/4 | 10f | 3/30\* | 1.3 | 0.5 | +3 | 1+3 | 5 | 360 | $8K | G4W |  |
| 6 | Jeep | 52 | 0/3 | 11f | 2/32 | 1.6 | 0.4 | +2 | 1+3 | 4 | 375 | $10K | O4W |  |
| 7 | Pickup Truck | 55 | 0/4 | 11f | 3/50 | 2.2 | 0.85 | +3 | 2 | 5 | 450 | $20K | G4W |  |
| 7 | Sedan | 53 | 0/4 | 11f | 2/55\* | 1.8 | 0.6 | +3 | 1+4 | 5 | 500 | $15K | G4W |  |
| 7 | Van | 68 | -1/4 | 11f | 2/45\* | 3.5 | 1 | +4 | 1+7 | 4 | 650 | $25K | g4W |  |
| 7 | Sports Car | 57 | +1/4 | 10f | 5/75\* | 1.8 | 0.4 | +3 | 1+3 | 4 | 500 | $85K | GW4 |  |
| 8 | Luxury Car | 57 | 0/4 | 11f | 3/57\* | 2.1 | 0.6 | +3 | 1+4 | 5 | 500 | $30K | G4W |  |
| 8 | SUV | 68 | -1/4 | 11f | 3/50 | 4 | 1.5 | +3 | 1+4 | 5 | 400 | $45K | G4W |  |
| | **Driving/TL (Heavy Wheeled)** | | | | | | | | | | | | | |
| 6 | 2 1/2-Ton Truck | 88 | -1/4 | 11f | 1/24\* | 8.5 | 3 | +4 | 1+2 | 5 | 375 | $17K | G6W |  |
| 7 | Bus | 100 | -2/4 | 11f | 1/30\* | 14.7 | 6.7 | +6 | 1+66 | 4 | 400 | $120K | G4W |  |
| 8 | Semi-Truck | 104 | -1/5 | 12f | 2/55\* | 10.3 | 0.3 | +4 | 1+2 | 5 | 1,200 | $60K | G6W | [2] |
| | **Driving/TL (Motorcycle)** | | | | | | | | | | | | | |
| 6 | Heavy Bike | 33 | +1/2 | 10f | 5/32\* | 0.4 | 0.1 | 0 | 1 | 4 | 200 | $1.5K | E2W |  |
| 7 | Scooter | 29 | +1/2 | 10f | 3/27\* | 0.3 | 0.1 | 0 | 1 | 3 | 190 | $1K | E2W |  |
| 7 | Heavy Bike | 33 | +1/2 | 11f | 8/55\* | 0.5 | 0.2 | 0 | 1+1 | 4 | 200 | $8K | E2W |  |
| 8 | Sports Bike | 30 | +2/2 | 10f | 9/78\* | 0.42 | 0.2 | 0 | 1+1 | 3 | 150 | $11K | E2W |  |
| | **Driving/TL (Tracked)** | | | | | | | | | | | | | |
| 7 | APC | 111 | -3/5 | 11f | 1/20 | 12.5 | 1.6 | +4 | 2+11S | 50/35 | 300 | $120K | 2CX | [3] |

[1] Draft animals are dogs for the dogsled, and horses for the chariot, wagon, and coach.

[2] Hauls a 48’ semi-trailer. With the trailer, Hnd/SR is -3/4 and Move is 1/30*. Trailer is HP 100†, Load 24, SM +5, and DR 3.

[3] “APC” means “armored personnel carrier.” The higher DR applies only to attacks from the front. Mounts a machine gun (7.62mm or .50) on an external mount on the roof.

#### Watercraft Table

| TL | Vehicle | ST/HP | Hnd/SR | HT | Move | LWt. | Load | SM | Occ. | DR | Range | Cost | Loc. | Draft | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | **Boating/TL (Unpowered)** | | | | | | | | | | | | | | |
| 0 | Canoe | 23† | +1/1 | 12c | 2/2 | 0.3 | 0.2 | +1 | 2 | 2 | F | $200 | O | 3 |  |
| | **Boating/TL (Motorboat)** | | | | | | | | | | | | | | |
| 7 | Inflatable Boat | 20 | +2/2 | 11 | 2/12 | 0.6 | 0.5 | +1 | 1+4 | 2 | 100 | $2K | O | 2 |  |
| 7 | Speedboat | 50 | +1/3 | 11f | 3/20 | 2 | 1 | +2 | 1+9 | 3 | 200 | $18K | O | 3 |  |
| | **Shiphandling/TL (Ship)** | | | | | | | | | | | | | | |
| 2 | Penteconter | 85† | -4/3 | 11c | 1/5 | 12.5 | 7.5 | +8 | 55 | 3 | F | $14K | MO | 6 | [1, 2] |
| 3 | Cog | 147† | -3/4 | 12c | 0.1/4 | 85 | 60 | +7 | 18 | 5 | – | $23K | M | 13 | [1, 3] |
| 6 | Tramp Steamer | 750 | -3/6 | 11f | 0.01/6 | 14,000 | 9,000 | +10 | 41+29A | 30 | 7,200 | $15M | g2S | 25 |  |

[1] A “penteconter” is a Greek war galley with a sail and a single bank of oars, favored by raiders and pirates. A “cog” (or “round-ship”) is a single-masted medieval sailing ship.

[2] Using oars, with 50 rowers. Under sail, Range is “–” and Move is 1/4 in a fair wind. Has a bronze ram, which adds +1 per die of collision damage.

[3] Wind-powered. Weight includes ballast.

#### Aircraft Table

| TL | Vehicle | ST/HP | Hnd/SR | HT | Move | LWt. | Load | SM | Occ. | DR | Range | Cost | Loc. | Stall | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | **Piloting/TL (Light Airplane)** | | | | | | | | | | | | | | |
| 6 | “Barnstormer” Biplane | 43 | +2/3 | 10f | 2/37 | 0.9 | 0.2 | +3 | 1+1 | 3 | 85 | $55K | O2W2Wi | 23 |  |
| 7 | Light Monoplane | 45 | +2/3 | 10f | 3/70 | 1.15 | 0.3 | +4 | 1+1 | 3 | 500 | $150K | G2WWi | 25 |  |
| | **Piloting/TL (Lighter-Than-Air)** | | | | | | | | | | | | | | |
| 6 | Blimp | 120 | -4/3 | 10 | 1/38 | 18 | 4 | +10 | 10A | 1 | 2,300 | $3M | S | 0 |  |
| | **Piloting/TL (Heavy Airplane)** | | | | | | | | | | | | | | |
| 6 | Twin-Prop Transport | 100 | -2/3 | 12f | 2/114 | 12.8 | 3 | +7 | 2+21 | 4 | 1,500 | $340K | g3WWi | 34 |  |
| 7 | Business Jet | 84 | 0/3 | 11f | 4/275 | 9.2 | 1.6 | +6 | 2+6P | 5 | 1,300 | $10M | G3WWi | 55 |  |
| | **Piloting/TL (Helicopter)** | | | | | | | | | | | | | | |
| 7 | Light Helicopter | 47 | +2/2 | 10f | 2/90 | 1.5 | 0.5 | +4 | 1+3 | 3 | 225 | $400K | GH3Wr | 0 |  |
| 7 | Utility Helicopter | 70 | 0/2 | 10f | 2/65 | 4.7 | 1.4 | +5 | 2+12 | 3 | 300 | $2M | gH2R | 0 |  |
| 8 | Utility Helicopter | 87 | +1/2 | 11f | 3/110 | 10 | 3.5 | +5 | 3+14 | 5/20 | 370 | $8M | gH3W | 0 | [1] |
| | **Piloting/TL (Vertol)** | | | | | | | | | | | | | | |
| 9 | Air Car | 45 | +2/3 | 11f | 4/190 | 1.2 | 0.4 | +3 | 1+3P | 4 | 900 | $500K | G4W | 0 |  |
| | **Piloting/TL (Contragravity)** | | | | | | | | | | | | | | |
| ^ | Grav Bike | 30 | +4/2 | 11 | 20/80 | 0.4 | 0.2 | 0 | 1+1 | 3 | 1,000 | $25K | E | 0 |  |
| ^ | Grav Jeep | 50 | +3/3 | 12 | 10/100 | 2 | 1 | +4 | 1+5 | 4 | 2,000 | $400K | O | 0 |  |

[1] Rotors have DR 20; all other locations have DR 5.

#### Spacecraft Table

| TL | Vehicle | ST/HP | Hnd/SR | HT | Move (G) | LWt. | Load | SM | Occ. | DR | Cost | Loc. | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | **Piloting/TL (Aerospace)** | | | | | | | | | | | | |
| 9 | Orbital Clipper | 170 | -2/3 | 10fx | 30/9,000 (3G) | 515 | 10 | +9 | 2+4SV | 4 | $350M | – | [1] |
| | **Piloting/TL (High-Performance Spacecraft)** | | | | | | | | | | | | |
| ^ | Shuttlecraft | 136 | +2/4 | 12 | 20/c (2G) | 100 | 25 | +6 | 1+10SV | 100 | $35M | 3Rr | [2] |
| ^ | Star Freighter | 500 | 0/5 | 11 | 15/c (1.5G) | 1,000 | 400 | +9 | 2+18ASV | 100 | $100M | 3Rr2t | [2, 3] |

[1] The Orbital Clipper is a Space Shuttle replacement that can boost to Earth orbit and make reentry. Uses ordinary Newtonian space flight. Cost drops to M$70 at TL10+.

[2] Uses reactionless or gravitic thrusters to accelerate to light speed (c) – or whatever fraction of c the GM sets as a limit. Star drives and force fields, if any, are up to the GM.

[3] Has hyperspectral sensors (Hyperspectral Vision, with 360° Vision and Telescopic Vision 10) and radar (Radar, 500,000 yards, Targeting). Its two independent turrets can, at extra cost ($0.5M apiece), mount laser cannon: Damage 6d×5(2) burn, Acc 18, Range 100,000/300,000, RoF 4, Rcl 1.

`;
