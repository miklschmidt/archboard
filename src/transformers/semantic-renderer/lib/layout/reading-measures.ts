// What a drawing is weighed on from its lines as drawn: the measures of how
// easily it reads, in the order ADR 0039 compares them (`readingOrder` in
// track/score.ts), and its page. The Graphviz drawings are weighed on the same
// detectors through the settled drawing (even-pins.ts); the track and blocks
// engines weigh their layouts here, before a drawing exists.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { corneredAmong } from "@/transformers/semantic-renderer/lib/layout/cornered-crossings";
import { hookedEnds } from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import { strokesOf, type Line } from "@/transformers/semantic-renderer/lib/layout/stacked-runs";
import { crossingsOf, type Weighed } from "@/transformers/semantic-renderer/lib/track/score";

/**
 * How long some orthogonal lines are together.
 * @param lines Every line's corners.
 * @returns The length of their runs.
 */
function lengthOf(lines: readonly (readonly Point[])[]): number {
	let sum = 0;
	for (const points of lines)
		for (const [index, to] of points.slice(1).entries())
			sum += Math.abs(to.x - points[index]!.x) + Math.abs(to.y - points[index]!.y);
	return sum;
}

/**
 * What a layout's lines show a reader: their crossings; those on a line's
 * corner and the stacks of unrelated lines on one stroke; the line unrelated
 * lines draw on one stroke or side by side nearer than a lane; the ends
 * hooking into a card's side and the lines that touch; their bends; and
 * their length.
 * @param page The layout's page.
 * @param page.width Its width.
 * @param page.height Its height.
 * @param lines Every line, its points reduced to its corners.
 * @param cards Every card's box, by id.
 * @returns What the layout is weighed on.
 */
function readingOf(
	page: { width: number; height: number },
	lines: readonly Line[],
	cards: ReadonlyMap<string, Box>,
): Weighed {
	const points = lines.map((line) => line.points);
	const { stacks, lanes, touches } = strokesOf(lines);
	return {
		width: page.width,
		height: page.height,
		crossings: crossingsOf(points),
		knots: corneredAmong(points) + stacks,
		tracks: lanes,
		hooks: hookedEnds(lines, cards).length + touches,
		bends: points.reduce((sum, corners) => sum + Math.max(0, corners.length - 2), 0),
		length: lengthOf(points),
	};
}

export { readingOf };
