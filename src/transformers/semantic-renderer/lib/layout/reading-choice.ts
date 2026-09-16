// Which reading a board is drawn in (ADR 0028).
//
// A proposal keeps its predecessor's reading, so a comparison and the
// transition between two pictures of one board keep the reader's bearings. A
// first render is settled in every candidate reading and the one that fits
// the reference pane best is kept: down the page, left to right, and, for a
// board with no frame, each of those folded toward the pane's shape the way a
// long line of text wraps (docs/design/layout-rules.md section 17). A folded
// reading must keep its bends within the wide-board bound, since a fold turns
// every link across it into a route back to the start of the next line. Ties
// go to the earlier candidate: down before right, unfolded before folded.

import { REFERENCE_PANE, fitIn } from "@/shared/shell-geometry/index";
import type {
	ArchitectureDrawing,
	MeasuredArchitecture,
	ReadingDirection,
} from "@/transformers/semantic-renderer/lib/drawing";
import { routesThroughCards } from "@/transformers/semantic-renderer/lib/layout/scorecard";

/** One way to draw a board: its direction, and whether its layers fold. */
interface Reading {
	readonly direction: ReadingDirection;
	readonly wrapped: boolean;
}

/** Settle a board in one reading. */
type SettleReading = (reading: Reading) => Promise<ArchitectureDrawing>;

/** The bends per route a folded reading may spend: the wide-board bound. */
const FOLDED_BENDS = 3;

/**
 * How many routes a fold may carry to the next line. One reads as the thread
 * of a pipeline continuing; the Semantic renderer board folded with four,
 * each looping round the whole page (docs/design/layout-rules.md section 17).
 */
const FOLDED_THREADS = 1;

/**
 * The candidate readings of a first render, in order of preference.
 * @param measured The board's measured sizes, which say whether it has a frame.
 * @returns The readings to settle.
 */
function candidatesOf(measured: MeasuredArchitecture): Reading[] {
	const unfolded: Reading[] = [
		{ direction: "down", wrapped: false },
		{ direction: "right", wrapped: false },
	];
	// A frame is never folded. The 2026-09-16 analysis saw the engine's
	// wrapping throw on every framed board (`nodeOrder[l][0].layer`); this
	// transposed solve does not reproduce that, and folds no framed vault board
	// anyway, so the rule stays until a framed board is measured folding well.
	const framed = [...measured.nodes.values()].some((node) => node.headerHeight > 0);
	return framed
		? unfolded
		: [...unfolded, ...unfolded.map((reading) => ({ ...reading, wrapped: true }))];
}

/**
 * The shape a folded reading folds toward, in the solving frame: the pane's
 * width over its height, turned when the page reads left to right.
 * @param direction The way the page reads.
 * @returns The engine's aspect ratio.
 */
function foldAspect(direction: ReadingDirection): number {
	const aspect = REFERENCE_PANE.width / REFERENCE_PANE.height;
	return direction === "down" ? aspect : 1 / aspect;
}

/**
 * How many turns a drawing's routes take on average.
 * @param drawing The drawing.
 * @returns Bends per route.
 */
function bendsPerRoute(drawing: ArchitectureDrawing): number {
	if (drawing.edges.length === 0) return 0;
	const bends = drawing.edges.reduce(
		(total, { curve }) =>
			total + curve.segments.filter((segment) => segment.kind === "cubic").length,
		0,
	);
	return bends / drawing.edges.length;
}

/**
 * How many routes a fold carries back to the start of the next line: routes
 * that leave the band the cards occupy along the reading, over the head or
 * under the foot of the page.
 * @param drawing The drawing.
 * @param direction The way the page reads.
 * @returns The routes carried across a fold.
 */
function foldCrossings(drawing: ArchitectureDrawing, direction: ReadingDirection): number {
	const [axis, extent] =
		direction === "down" ? (["y", "height"] as const) : (["x", "width"] as const);
	const boxes = [...drawing.cards, ...drawing.containers].map(({ box }) => box);
	const head = Math.min(...boxes.map((box) => box[axis]));
	const foot = Math.max(...boxes.map((box) => box[axis] + box[extent]));
	return drawing.edges.filter(({ curve }) =>
		[curve.from, ...curve.segments.map((segment) => segment.to)].some(
			(point) => point[axis] < head - 1 || point[axis] > foot + 1,
		),
	).length;
}

/**
 * Settle one candidate reading, or nothing when a folded one fails the
 * engine, spends more bends than the bound, or carries more than one route
 * across its folds, since each such route loops round the whole page.
 * @param reading The candidate.
 * @param settle Settles a board in a reading.
 * @returns The drawing, or undefined.
 */
async function candidate(
	reading: Reading,
	settle: SettleReading,
): Promise<ArchitectureDrawing | undefined> {
	if (!reading.wrapped) return settle(reading);
	try {
		const drawing = await settle(reading);
		// A fold that routes a line through a card is not a reading; elkjs threw
		// on the one fold that did (Command dispatch read left to right), and an
		// engine that does not throw must not make it a candidate.
		const readable =
			bendsPerRoute(drawing) <= FOLDED_BENDS &&
			foldCrossings(drawing, reading.direction) <= FOLDED_THREADS &&
			routesThroughCards(drawing) === 0;
		return readable ? drawing : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The drawing of a board in the reading a reader gets.
 * @param measured The board's measured sizes.
 * @param predecessor The preceding drawing of this view, when there is one.
 * @param settle Settles the board in a reading.
 * @param screen Solves the board once in a reading, labels unreserved, to bound what settling it can fit.
 * @returns The settled drawing, with its reading on it.
 */
async function chooseReading(
	measured: MeasuredArchitecture,
	predecessor: ArchitectureDrawing | undefined,
	settle: SettleReading,
	screen?: SettleReading,
): Promise<ArchitectureDrawing> {
	if (predecessor !== undefined) {
		return settle({ direction: predecessor.direction, wrapped: predecessor.wrapped });
	}
	const [first, ...others] = candidatesOf(measured);
	const [settled, ...screens] = await Promise.all([
		settle(first!),
		...others.map((reading) =>
			screen === undefined ? undefined : screen(reading).catch(() => undefined),
		),
	]);
	// A reading whose one plain solve already fits no better than the first
	// reading settled cannot win: settling only adds rows for labels, so it
	// fits no better than its plain solve (docs/design/layout-rules.md
	// section 22).
	const promising = others.filter((_, index) => {
		const plain = screens[index];
		return screen === undefined || (plain !== undefined && fitIn(plain) > fitIn(settled));
	});
	const drawings = await Promise.all(promising.map((reading) => candidate(reading, settle)));
	let best = settled;
	for (const drawing of drawings) {
		if (drawing !== undefined && fitIn(drawing) > fitIn(best)) best = drawing;
	}
	return best;
}

export { chooseReading, foldAspect, type Reading };
