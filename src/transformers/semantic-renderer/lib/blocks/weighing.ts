// What the block engine weighs a layout on when it chooses between layouts on
// how they read (ADR 0039): a block of cards laid out, or a whole drawing as
// placed, each on its lines as drawn: their crossings, their bends and their
// length, and the page.
import { corners, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { crossingsOf, type Weighed } from "@/transformers/semantic-renderer/lib/track/score";

/** A drawing as placed: its page, and every relationship's points. */
interface Page {
	readonly width: number;
	readonly height: number;
	readonly edges: readonly { readonly id: string; readonly points: readonly Point[] }[];
}

/**
 * What a layout's lines show a reader: their crossings, their bends and
 * their length.
 * @param page The layout's page.
 * @param page.width Its width.
 * @param page.height Its height.
 * @param lines Every line's points.
 * @returns What the layout is weighed on.
 */
function readingOf(
	page: { width: number; height: number },
	lines: readonly (readonly Point[])[],
): Weighed {
	const turns = lines.map((points) => corners(points));
	let length = 0;
	for (const points of turns)
		for (const [index, to] of points.slice(1).entries())
			length += Math.abs(to.x - points[index]!.x) + Math.abs(to.y - points[index]!.y);
	return {
		width: page.width,
		height: page.height,
		crossings: crossingsOf(turns),
		bends: turns.reduce((sum, points) => sum + Math.max(0, points.length - 2), 0),
		length,
	};
}

/**
 * What a block of cards laid out is weighed on, each line that laps round it
 * counted as a crossing more.
 * @param laid The block laid out.
 * @returns What it is weighed on.
 */
function weighedLaid(laid: Laid): Weighed {
	const read = readingOf(laid, [...laid.lines.values()]);
	return { ...read, crossings: read.crossings + (laid.laps ?? 0) };
}

/**
 * What a whole drawing as placed is weighed on, its lines joined end to end
 * through every block.
 * @param placed The drawing.
 * @returns What it is weighed on.
 */
function weighedPlaced(placed: Page): Weighed {
	return readingOf(
		placed,
		placed.edges.map(({ points }) => points),
	);
}

export { weighedLaid, weighedPlaced, type Page };
