// Unrelated lines the router left on one stroke.
//
// libavoid separates parallel segments only inside each segment's channel,
// the space between the nearest obstacles along its whole length. When a
// channel cannot hold its lines a lane apart, the nudger tries smaller
// separations a tenth of a lane at a time and, when even that fails, leaves
// them where the router put them: on one coordinate. Two relationships with no
// end in common then read as one line, and the painter's join marks make that
// line look like a trunk. Cards one routing gap apart leave such a channel:
// their routing boxes reach CARD_ROUTE_CLEARANCE out, room for a line's final
// bend and arrow, which leaves 2 px between them, and two lines that turn
// into it from the cards on either side both need it. In both vaults every
// such stack has a line that turns into it straight from its own card, so
// that line is refused the face and leaves by another. Closing the corridor
// instead sent every line round the cards (Command interface went from 15 to
// 33 crossings), and opening it by drawing the cards' routing boxes in also
// sent away every other line that ended on those faces. Which drawings are
// cured is the finishing step's choice (finishing.ts).
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Face } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	CARD_ROUTE_CLEARANCE,
	ROUTE_LANE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/** How close two parallel runs are drawn as one stroke. */
const ONE_STROKE = 2;

/** A routed line as the stack rules read it: its source, its target and its corners. */
interface Line {
	readonly id: string;
	readonly ends: readonly [string, string];
	readonly points: readonly Point[];
}

/** One straight run of a line. */
interface Run {
	readonly line: Line;
	/** Its place in the line: run i joins corners i and i + 1. */
	readonly index: number;
	readonly vertical: boolean;
	/** Where it lies across its axis. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/** Two runs of unrelated lines drawn as one stroke, and the stretch they share. */
interface Stack {
	readonly runs: readonly [Run, Run];
	readonly from: number;
	readonly to: number;
}

/** The axes of a run: the one it keeps and the one it runs along. */
const AXES = {
	vertical: ["x", "width", "y", "height"],
	horizontal: ["y", "height", "x", "width"],
} as const;

/**
 * Every straight run of a line.
 * @param line The line.
 * @returns Its runs.
 */
function runsOf(line: Line): Run[] {
	const { points } = line;
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const vertical = Math.abs(point.x - previous.x) < 0.01;
		const [across, , along] = AXES[vertical ? "vertical" : "horizontal"];
		const from = Math.min(point[along], previous[along]);
		const to = Math.max(point[along], previous[along]);
		return to - from < 0.01 ? [] : [{ line, index, vertical, at: point[across], from, to }];
	});
}

/**
 * Whether two lines share an end, so a shared lane can be their trunk.
 * @param one A line.
 * @param other Another.
 * @returns True when they have an end in common.
 */
function related(one: Line, other: Line): boolean {
	return other.ends.some((id) => one.ends.includes(id));
}

/**
 * Whether a run is the first or last of its line, which the router holds on
 * its card's pin; pin feedback parts two of those (pin-feedback.ts).
 * @param run The run.
 * @returns True for an end run.
 */
function endRun(run: Run): boolean {
	return run.index === 0 || run.index === run.line.points.length - 2;
}

/**
 * The stack two runs of unrelated lines make, if they lie on one stroke for
 * a lane or more and are not both held end runs.
 * @param one A run.
 * @param other A run of another line.
 * @returns The stack, or none.
 */
function stackOf(one: Run, other: Run): Stack[] {
	if (one.vertical !== other.vertical || Math.abs(one.at - other.at) > ONE_STROKE) return [];
	const from = Math.max(one.from, other.from);
	const to = Math.min(one.to, other.to);
	if (to - from < ROUTE_LANE || (endRun(one) && endRun(other))) return [];
	return [{ runs: [one, other], from, to }];
}

/**
 * Every pair of runs of unrelated lines that lie on one stroke for a lane or
 * more, apart from two held end runs.
 * @param lines The lines.
 * @returns The stacks.
 */
function stacksOf(lines: readonly Line[]): Stack[] {
	const runs = lines.map(runsOf);
	return lines.flatMap((line, index) =>
		lines
			.slice(index + 1)
			.flatMap((other, offset) =>
				related(line, other)
					? []
					: runs[index]!.flatMap((one) =>
							runs[index + 1 + offset]!.flatMap((two) => stackOf(one, two)),
						),
			),
	);
}

/**
 * A drawing's lines.
 * @param drawing The drawing.
 * @returns Its lines.
 */
function linesOf(drawing: ArchitectureDrawing): Line[] {
	return drawing.edges.map(({ edge, curve }) => ({
		id: edge.id,
		ends: [edge.from, edge.to],
		points: verticesOf(curve),
	}));
}

/**
 * Which side of its track a run's line takes at one end of a stretch.
 * @param run The run.
 * @param end Where the stretch ends along the run.
 * @returns -1 or 1 for the side the line turns to there, 0 when it runs on along the track or ends.
 */
function sideAt(run: Run, end: number): number {
	const [across, , along] = AXES[run.vertical ? "vertical" : "horizontal"];
	const { points } = run.line;
	const corner = [run.index, run.index + 1].find(
		(index) => Math.abs(points[index]![along] - end) < 0.5,
	);
	if (corner === undefined) return 0;
	const beyond = points[corner === run.index ? corner - 1 : corner + 1];
	return beyond === undefined ? 0 : Math.sign(beyond[across] - run.at);
}

/**
 * How many crossings a drawing hides in its stacks: two lines that share a
 * stroke and leave it each on the side the other came from cross inside it,
 * where no reader can see them, so parting them shows a crossing that was
 * always there.
 * @param drawing The drawing.
 * @returns The hidden crossings.
 */
export function stackCrossings(drawing: ArchitectureDrawing): number {
	return stacksOf(linesOf(drawing)).filter(({ runs: [one, other], from, to }) => {
		const low = sideAt(one, from) - sideAt(other, from);
		const high = sideAt(one, to) - sideAt(other, to);
		return low * high < 0;
	}).length;
}

/**
 * The face a line leaves a card by, from its first two corners.
 * @param tip The corner on the card.
 * @param next The next corner.
 * @returns The face.
 */
function faceOf(tip: Point, next: Point): Face {
	if (Math.abs(tip.x - next.x) > Math.abs(tip.y - next.y)) return next.x > tip.x ? "EAST" : "WEST";
	return next.y > tip.y ? "SOUTH" : "NORTH";
}

/** One end of a line: its card, the index of its end run, the face it ends on, and whether that run is short. */
interface End {
	readonly card: string;
	readonly run: number;
	readonly face: Face;
	readonly short: boolean;
}

/**
 * One end of a line.
 * @param card The end's card.
 * @param run The index of its end run.
 * @param tip Its corner on the card.
 * @param next The corner after it.
 * @returns The end; an end run no longer than a card's own corridor turns straight into the next run.
 */
function endAt(card: string, run: number, tip: Point, next: Point): End {
	const short = Math.hypot(tip.x - next.x, tip.y - next.y) <= CARD_ROUTE_CLEARANCE + ROUTE_LANE;
	return { card, run, face: faceOf(tip, next), short };
}

/**
 * Both ends of a line.
 * @param line The line.
 * @returns The source end, then the target end.
 */
function endsOf(line: Line): End[] {
	const { points } = line;
	return [
		endAt(line.ends[0], 0, points[0]!, points[1]!),
		endAt(line.ends[1], points.length - 2, points.at(-1)!, points.at(-2)!),
	];
}

/**
 * The line ends that turn straight into a stack from their own card: the
 * stacked run is the end run, or follows a short one.
 * @param stack The stack.
 * @param cards The ordinary cards' ids.
 * @returns One line:card:FACE key for every such end.
 */
function turningEnds(stack: Stack, cards: ReadonlySet<string>): string[] {
	return stack.runs.flatMap(({ line, index }) =>
		endsOf(line).flatMap(({ card, run, face, short }) =>
			cards.has(card) && (index === run || (short && Math.abs(index - run) === 1))
				? [`${line.id}:${card}:${face}`]
				: [],
		),
	);
}

/**
 * What would part the unrelated lines a drawing draws as one stroke: every
 * line that turns into a stack straight from its own card is refused that
 * face, and leaves by another.
 * @param drawing The drawing.
 * @returns One line:card:FACE key for every refused end.
 */
export function stackedEnds(drawing: ArchitectureDrawing): string[] {
	const cards = new Set(drawing.cards.map(({ measured }) => measured.node.id));
	return stacksOf(linesOf(drawing)).flatMap((stack) => turningEnds(stack, cards));
}

/**
 * The lines a stack's cure sends another way.
 * @param found The keys {@link stackedEnds} gave.
 * @returns The lines refused a face they ended on.
 */
export function refusedLines(found: readonly string[]): ReadonlySet<string> {
	return new Set(found.map((key) => key.split(":")[0]!));
}
