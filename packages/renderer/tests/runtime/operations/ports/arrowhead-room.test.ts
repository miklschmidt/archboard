// Every arrowhead stands on the straight run that a layout keeps before the end
// of a line (APPROACH_STRAIGHT), so no head lies over the bend before it. The
// head's reach is read off the marker the picture draws, so this holds
// whatever size a head is.
//
// What this catches: a head made longer than that run, for any weight and
// either head form, and a line drawn with a shorter last run, in either
// engine. The boards are small ones that draw hero, default and muted heads,
// filled and open, and the two approaches that once came up short.

import { expect, test } from "bun:test";

import { LayoutEngineSchema } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { APPROACH_STRAIGHT } from "#shared/constants/spacing.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import spokenInstruction from "#tests/runtime/support/fixtures/a-spoken-instruction.json";
import reachTheWorkhorse from "#tests/runtime/support/fixtures/board-changes-reach-the-workhorse.json";
import frameApproach from "#tests/runtime/support/fixtures/frame-head-approach.json";
import oneWriteLands from "#tests/runtime/support/fixtures/one-write-lands.json";
import sideApproach from "#tests/runtime/support/fixtures/side-head-approach.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** A point of the drawing. */
interface Point {
	readonly x: number;
	readonly y: number;
}

const BOARDS: readonly VariantContent[] = [
	spokenInstruction,
	reachTheWorkhorse,
	frameApproach,
	oneWriteLands,
	sideApproach,
].map(orderedFixture);

/**
 * How far each marker's ink reaches back from the end of its line, in widths of
 * that line: from the line's end at `refX` to the first ink of its shape.
 * @param svg The drawn document.
 * @returns Each marker's reach, by its id.
 */
function markerReaches(svg: string): Map<string, number> {
	const reaches = new Map<string, number>();
	for (const [tag, id, shape] of svg.matchAll(/<marker id="([^"]+)"[^>]*>([\s\S]*?)<\/marker>/g)) {
		const refX = Number(/refX="([\d.]+)"/.exec(tag)![1]);
		const side = Number(/markerWidth="([\d.]+)"/.exec(tag)![1]);
		const box = Number(/viewBox="[^ ]+ [^ ]+ ([\d.]+)/.exec(tag)![1]);
		const xs = [...shape!.matchAll(/[ML](-?[\d.]+),/g)].map((found) => Number(found[1]));
		const stroke = Number(/stroke-width="([\d.]+)"/.exec(shape!)?.[1] ?? 0);
		reaches.set(id!, ((refX - (Math.min(...xs) - stroke / 2)) * side) / box);
	}
	return reaches;
}

/**
 * The last run of a drawn route: where it starts and ends, and whether it is
 * straight. A route is written in absolute `M`, `L` and `C` commands.
 * @param d The route's path.
 * @returns Its last run.
 */
function lastRun(d: string): { from: Point; to: Point; straight: boolean } {
	let at: Point = { x: 0, y: 0 };
	let last = { from: at, to: at, straight: false };
	for (const [, command, rest] of d.matchAll(/([MLC])([^MLC]*)/g)) {
		const numbers = rest!
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		const to = { x: numbers.at(-2)!, y: numbers.at(-1)! };
		if (command !== "M") last = { from: at, to, straight: command === "L" };
		at = to;
	}
	return last;
}

test.each(LayoutEngineSchema.options)(
	"every arrowhead fits the straight run that every line keeps before its end (%s)",
	async (layout) => {
		for (const content of BOARDS) {
			const { svg } = await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				theme: "light",
				layout,
			});
			const reaches = markerReaches(svg);
			const lines = [
				...svg.matchAll(/<path (?![^>]*ab-halo)[^>]*marker-end="url\(#([^)]+)\)"[^>]*>/g),
			];
			expect(lines.length).toBeGreaterThan(0);
			for (const [path, head] of lines) {
				const width = Number(/stroke-width="([\d.]+)"/.exec(path)![1]);
				const run = lastRun(/\sd="([^"]+)"/.exec(path)![1]!);
				const length = Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y);
				expect(run.straight).toBe(true);
				expect(length).toBeGreaterThanOrEqual(APPROACH_STRAIGHT - 0.01);
				expect(reaches.get(head!)! * width).toBeLessThanOrEqual(APPROACH_STRAIGHT);
			}
		}
	},
);
