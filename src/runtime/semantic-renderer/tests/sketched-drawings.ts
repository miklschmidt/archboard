// Settled drawings sketched from boxes and corner points, so the rules that
// choose between drawings can be held without a placement engine.
import {
	curveThrough,
	type ArchitectureDrawing,
	type Point,
} from "@/runtime/semantic-renderer/layout";

/** A box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** One sketched line: its cards, its corners and its label's box, if it has one. */
interface Line {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly points: readonly Point[];
	readonly label?: Box;
}

/**
 * A settled drawing of cards and lines.
 * @param cards Every card's box, by id.
 * @param lines The lines.
 * @param page The page's size.
 * @returns The drawing.
 */
function sketch(
	cards: Readonly<Record<string, Box>>,
	lines: readonly Line[],
	page: { readonly width: number; readonly height: number } = { width: 1000, height: 1000 },
): ArchitectureDrawing {
	return {
		direction: "down",
		...page,
		cards: Object.entries(cards).map(([id, box], index) => ({
			measured: {
				node: { id, order: (index + 1) * 1000, name: id, kind: "module" },
				width: box.width,
				height: box.height,
				headerHeight: 0,
				runs: [],
			},
			box,
			depth: 0,
		})),
		containers: [],
		edges: lines.map(({ id, from, to, points, label }, index) => ({
			edge: { id, order: (index + 1) * 1000, from, to, kind: "call", emphasis: "normal" },
			curve: curveThrough(points),
			path: "",
			...(label === undefined
				? {}
				: {
						label: { box: label, measured: { width: label.width, height: label.height, runs: [] } },
					}),
		})),
	};
}

/**
 * The corners of a line from its points written as x,y pairs.
 * @param pairs The pairs.
 * @returns The points.
 */
function at(...pairs: readonly (readonly [number, number])[]): Point[] {
	return pairs.map(([x, y]) => ({ x, y }));
}

export { at, sketch, type Box, type Line };
