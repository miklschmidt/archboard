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
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { crowdedJoins, joinRoutes } from "@/transformers/semantic-renderer/lib/svg/junctions";
import {
	CARD_ROUTE_CLEARANCE,
	ROUTE_LANE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/**
 * How close two parallel runs are drawn as one stroke: nearer than two
 * ordinary lines' widths (1.4 px), so less than a line's width of air parts
 * their ink. Board persistence's "take the new name's lease" ran 2.2 px
 * beside the trunk into Former names.
 */
const ONE_STROKE = 2.5;

/**
 * How near a corner of one line to another's stroke, or two parallel runs,
 * read as one junction or one line: half a lane, under the nudging distance
 * lines keep apart where they have room (Platform Public API's two corners
 * 5 px apart, Agent workbench's two lines 8 px apart, one turning 2 px from
 * the other's turn).
 */
const NEAR = ROUTE_LANE / 2 + 0.5;

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
	/** Whether the line travels it towards its larger coordinate. */
	readonly forward: boolean;
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
		const forward = point[along] > previous[along];
		return to - from < 0.01
			? []
			: [{ line, index, vertical, at: point[across], from, to, forward }];
	});
}

/**
 * Whether two lines share an end, so a shared lane can be their trunk: they
 * meet one card at one place, within half a lane. Two lines of one card that
 * leave or enter it apart and meet on one stroke further on read as one line
 * joining another, as unrelated lines do: Board persistence's "take the new
 * name's lease" left Place the file apart from "does another board answer to
 * it" and rode the trunk into Former names, and Read and validate's two lines
 * left its side apart and shared one stroke for 34 px.
 * @param one A line.
 * @param other Another.
 * @returns True when they have an end in common.
 */
function related(one: Line, other: Line): boolean {
	return tipsOf(one).some(([card, tip]) =>
		tipsOf(other).some(
			([theirs, point]) => theirs === card && Math.hypot(tip.x - point.x, tip.y - point.y) <= NEAR,
		),
	);
}

/**
 * A line's two ends: each end's card and the point where the line meets it.
 * @param line The line.
 * @returns Its source end, then its target end.
 */
function tipsOf(line: Line): (readonly [string, Point])[] {
	return [
		[line.ends[0], line.points[0]!],
		[line.ends[1], line.points.at(-1)!],
	];
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
 * The stack two runs of unrelated lines make, if they lie a band apart for a
 * lane or more and are not both held end runs.
 * @param one A run.
 * @param other A run of another line.
 * @param band How far apart they may lie.
 * @returns The stack, or none.
 */
function stackOf(one: Run, other: Run, band: Band): Stack[] {
	if (one.vertical !== other.vertical || !within(Math.abs(one.at - other.at), band)) return [];
	const from = Math.max(one.from, other.from);
	const to = Math.min(one.to, other.to);
	if (to - from < ROUTE_LANE || (endRun(one) && endRun(other))) return [];
	return [{ runs: [one, other], from, to }];
}

/**
 * Whether a distance lies in a band.
 * @param apart The distance.
 * @param band The band.
 * @returns True above its first bound and up to its second.
 */
function within(apart: number, band: Band): boolean {
	return apart > band[0] && apart <= band[1];
}

/** How far apart two runs lie across their axis: more than the first, up to the second. */
type Band = readonly [number, number];

/** Two runs on one stroke. */
const STROKE: Band = [-1, ONE_STROKE];

/** Two runs side by side half a lane apart or nearer: a double track a reader takes for one line. */
const TRACK: Band = [ONE_STROKE, NEAR];

/**
 * Two runs side by side nearer than a lane: a double track. Runs exactly a
 * lane apart stand at the routers' channel pitch, which a reader follows as
 * two lines, and are not one.
 */
const BESIDE: Band = [ONE_STROKE, ROUTE_LANE - 0.5];

/**
 * Every pair of runs of unrelated lines that lie a band apart for a lane or
 * more, apart from two held end runs.
 * @param lines The lines.
 * @param band How far apart the runs lie.
 * @returns The stacks.
 */
function stacksOf(lines: readonly Line[], band: Band = STROKE): Stack[] {
	const runs = lines.map(runsOf);
	return lines.flatMap((line, index) =>
		lines
			.slice(index + 1)
			.flatMap((other, offset) =>
				related(line, other)
					? []
					: runs[index]!.flatMap((one) =>
							runs[index + 1 + offset]!.flatMap((two) => stackOf(one, two, band)),
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
 * The pairs of unrelated lines a drawing draws on one stroke, where a reader
 * cannot tell which line goes where.
 * @param drawing The drawing.
 * @returns One key for every stack, naming its two lines.
 */
export function stackKeys(drawing: ArchitectureDrawing): string[] {
	return pairKeys(stacksOf(linesOf(drawing)));
}

/**
 * How many lanes' worth of line a drawing draws on one stroke with an
 * unrelated line, all its stacks together, so a longer stack is more of a
 * defect and a shorter one less.
 * @param drawing The drawing.
 * @returns The length its stacks share, in lanes.
 */
export function stackedLanes(drawing: ArchitectureDrawing): number {
	return lanesOf(stacksOf(linesOf(drawing)));
}

/**
 * How many lanes' worth of line a drawing runs beside an unrelated line
 * nearer than a lane, all such runs together, so a longer double track is
 * more of a defect and a shorter one less.
 * @param drawing The drawing.
 * @returns The length its double tracks share, in lanes.
 */
export function trackedLanes(drawing: ArchitectureDrawing): number {
	return lanesOf(stacksOf(linesOf(drawing), BESIDE));
}

/**
 * How many lanes long some stacks are together.
 * @param stacks The stacks.
 * @returns Their shared length, in lanes.
 */
function lanesOf(stacks: readonly Stack[]): number {
	return Math.round(stacks.reduce((sum, { from, to }) => sum + to - from, 0) / ROUTE_LANE);
}

/**
 * The pairs of unrelated lines a drawing runs side by side half a lane apart
 * or nearer, a double track a reader takes for one line.
 * @param drawing The drawing.
 * @returns One key for every such pair, naming its two lines.
 */
export function trackKeys(drawing: ArchitectureDrawing): string[] {
	return pairKeys(stacksOf(linesOf(drawing), TRACK));
}

/**
 * The keys of stacks, naming their two lines.
 * @param stacks The stacks.
 * @returns One key for each.
 */
function pairKeys(stacks: readonly Stack[]): string[] {
	return stacks.map(({ runs }) =>
		runs
			.map(({ line }) => line.id)
			.toSorted()
			.join("|"),
	);
}

/**
 * How many pairs of joins a drawing draws on one lane nearer together than
 * the nudging distance the router keeps lines apart where it has room: their
 * junction marks run into one blot (Skill evaluation's fan out of Author
 * run, branching 9 px apart where the plain settlement branched 16 px apart).
 * They are counted, not named: which line a join's mark carries changes with
 * every route beside it.
 * @param drawing The drawing.
 * @returns The number of such pairs.
 */
export function crowdedJoinCount(drawing: ArchitectureDrawing): number {
	return crowdedJoins(
		joinRoutes(drawing.edges, () => 1),
		ROUTE_NUDGE_DISTANCE,
	).length;
}

/**
 * Whether a corner of one line lies on, or within half a lane of, another line's stroke.
 * @param corner The corner.
 * @param run A run of another line.
 * @returns True when they meet, where they read as a junction.
 */
function meets(corner: Point, run: Run): boolean {
	const [across, , along] = AXES[run.vertical ? "vertical" : "horizontal"];
	return (
		Math.abs(corner[across] - run.at) <= NEAR &&
		corner[along] >= run.from - NEAR &&
		corner[along] <= run.to + NEAR
	);
}

/**
 * Whether two runs are one trunk: side by side within half a lane for a
 * lane or more, travelled the same way.
 * @param one A run.
 * @param other A run of another line.
 * @returns True when they read as one line carrying both.
 */
function trunk(one: Run, other: Run): boolean {
	return (
		one.vertical === other.vertical &&
		one.forward === other.forward &&
		Math.abs(one.at - other.at) <= NEAR &&
		Math.min(one.to, other.to) - Math.max(one.from, other.from) >= ROUTE_LANE
	);
}

/**
 * Whether a corner of one line turns off, or onto, a trunk it shares with
 * another line: the two share an end and a run beside the corner travels
 * with the other line's.
 * @param line The line.
 * @param corner The corner's index in it.
 * @param other The other line.
 * @param runs The other line's runs.
 * @returns True for a trunk's branch.
 */
function branches(line: Line, corner: number, other: Line, runs: readonly Run[]): boolean {
	return (
		related(line, other) &&
		runsOf(line)
			.filter(({ index }) => index === corner - 1 || index === corner)
			.some((mine) => runs.some((theirs) => trunk(mine, theirs)))
	);
}

/**
 * The pairs of lines a drawing lets touch: a corner of one on or within half
 * a lane of the other's stroke reads as a junction that joins them (Board
 * persistence's "every current binding's file" turning where "rename
 * transition" turns, Platform Public API's corners 5 px apart), unless it
 * turns off or onto a trunk the two lines share from a common end. Lines
 * that share an end but meet head to head, each turning where the other
 * turns, touch (Auditlog's "ApplyOffsets" and "filter, sort, paginate").
 * @param drawing The drawing.
 * @returns One key for every touching pair, naming its two lines.
 */
export function touchKeys(drawing: ArchitectureDrawing): string[] {
	const lines = linesOf(drawing);
	const runs = lines.map(runsOf);
	const touching = lines.flatMap((line, index) =>
		lines.flatMap((other, at) =>
			at !== index && touches(line, other, runs[at]!)
				? [[line.id, other.id].toSorted().join("|")]
				: [],
		),
	);
	return [...new Set(touching)];
}

/**
 * Whether a corner of one line meets another line's stroke other than where it branches off a trunk they share.
 * @param line The line.
 * @param other Another line.
 * @param runs The other line's runs.
 * @returns True when they touch.
 */
function touches(line: Line, other: Line, runs: readonly Run[]): boolean {
	return line.points
		.slice(1, -1)
		.some(
			(corner, offset) =>
				runs.some((run) => meets(corner, run)) && !branches(line, offset + 1, other, runs),
		);
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
