// Which way a drill-down leads, in the words and marks the chrome uses for it:
// the board's reading of the way, which the renderer draws on the card (a ring
// around an arrow), so the card, its hover tip and Go deeper say one thing. Up
// opens a coarser board, the whole this one is a part of; down a finer one, the
// part's inside; across a board at the same level. Pure.

import { drillDirection, type DrillDirection } from "@archboard/board/policy";

/** Which way the board a part opens lies from the board it is drawn on. */
type DrillWay = Exclude<DrillDirection, "elsewhere">;

/**
 * Which way a board lies from another, by their levels in the vault's order.
 * @param there The level of the board a part opens.
 * @param here The level of the board it is drawn on.
 * @param levels The vault's levels, coarsest first.
 * @returns The way, or null when either level is not one the vault lists.
 */
function drillWay(
	there: string | undefined,
	here: string | undefined,
	levels: readonly string[] | undefined,
): DrillWay | null {
	if (there === undefined || levels === undefined) return null;
	const way = drillDirection(there, here, levels);
	return way === "elsewhere" ? null : way;
}

/** How many levels apart, in words. */
const COUNTS = ["", "One", "Two", "Three", "Four"] as const;

/**
 * Which way and how far, in words: "One level down", "Same level".
 * @param there The level of the board a part opens.
 * @param here The level of the board it is drawn on.
 * @param levels The vault's levels, coarsest first.
 * @returns The words, or null when the way is not known.
 */
function drillWayWords(
	there: string | undefined,
	here: string | undefined,
	levels: readonly string[] | undefined,
): string | null {
	const way = drillWay(there, here, levels);
	if (way === null || levels === undefined) return null;
	if (way === "across") return "Same level";
	const apart = Math.abs(levels.indexOf(there!) - levels.indexOf(here!));
	const count = COUNTS[apart] ?? String(apart);
	return `${count} ${apart === 1 ? "level" : "levels"} ${way}`;
}

export { drillWay, drillWayWords, type DrillWay };
