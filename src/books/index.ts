/** Every book whose rules this module registers, in the order the Rules page lists them. */

import type { BookRules } from "../shared/book.js";
import { book as monsterHunters1 } from "./monster-hunters-1/index.js";
import { book as magic } from "./magic/index.js";
import { book as martialArts } from "./martial-arts/index.js";
import { book as ultraTech } from "./ultra-tech/index.js";
import { book as highTech } from "./high-tech/index.js";

export const BOOKS: readonly BookRules[] = [monsterHunters1, magic, martialArts, ultraTech, highTech];
