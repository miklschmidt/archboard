// What the block engine weighs a layout on when it chooses between layouts on
// how they read (ADR 0039): a block of cards laid out, or a whole drawing as
// placed, each on its lines as drawn: their crossings, their bends and their
// length, and the page. A block of cards also counts each line that laps
// round it past every card it holds as a crossing: stacked, One write lands
// (Track) turned its lines four times less, but sent 'announce the accepted
// write' down the page's right edge alongside another line. Each also counts
// its lines' runs away from their ends as crossings (`away.ts`).
import { awayPlaced } from "@/transformers/semantic-renderer/lib/blocks/away";
import { corners, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Projection } from "@/transformers/semantic-renderer/lib/blocks/tree";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	crossingsOf,
	lapsOf,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";

/** A drawing as placed: its page, its cards and containers, and every relationship's points. */
interface Page {
	readonly width: number;
	readonly height: number;
	readonly cards?: readonly { readonly id: string; readonly box: Box }[];
	readonly frames?: readonly { readonly id: string; readonly box: Box }[];
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
 * past every card it holds counted as a crossing more ({@link lapsOf}). A
 * label rides its line, so it does not hide a lap.
 * @param laid The block laid out.
 * @returns What it is weighed on.
 */
function weighedLaid(laid: Laid): Weighed {
	const lines = [...laid.lines.values()].map((points) => corners(points));
	const cards = [...laid.boxes].filter(([id]) => !id.startsWith("label:")).map(([, box]) => box);
	const read = readingOf(laid, lines);
	return { ...read, crossings: read.crossings + lapsOf(lines, cards) };
}

/**
 * What a whole drawing as placed is weighed on, its lines joined end to end
 * through every block, and their runs away from their ends.
 * @param placed The drawing.
 * @param projections Where each relationship is drawn, for its ends.
 * @returns What it is weighed on.
 */
function weighedPlaced(
	placed: Page,
	projections: readonly Pick<Projection, "edge">[],
): Weighed & { readonly away: number } {
	return {
		...readingOf(
			placed,
			placed.edges.map(({ points }) => points),
		),
		away: awayPlaced(projections, placed),
	};
}

export { weighedLaid, weighedPlaced, type Page };
