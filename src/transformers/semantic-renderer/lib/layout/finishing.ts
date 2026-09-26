// Finishing passes: routing options that would move label reservations, and
// so placements, if every routing pass used them. Routed that way from the
// start, keeping lines off frame walls (frame-walls.ts) took Agent workbench
// from 15 to 18 crossings and Board rasterizer from 2777 to 3495 wide, and
// corner pins (pin-feedback.ts) took Board rasterizer from 7 to 11 crossings
// and Browser application's "Working with an agent" from 0 to 4.
//
// So each pass finishes a settled drawing only where it has what the pass
// cures: a line along the wall of a frame it does not stay inside, a line
// that leaves a card by its side although its other card stands straight
// below or above it, a line that hooks into a card's side past the card's
// corner, two unrelated lines on one stroke (stacked-runs.ts), or a port
// alone on a card face beside its corner (lone-pins.ts). The same placement,
// with the same reservations, is routed once more with the pass's options,
// and that drawing is kept when it cures more: it brings no defect of any
// kind the settled drawing did not have, a label another line crowds and two
// lines that touch or run as a double track counted too, and has fewer
// defects together, or the same defects with fewer bends in all. Refusing
// only fresh defects of the pass's own kind let Voice coordinator's hook
// pass cure hooks by crowding a label. It must also keep every label, have no more crossings, counting two
// unrelated lines on one stroke as one, give no line more bends unless it
// saves a crossing and takes no more bends in all (Browser application's
// "Recording a walkthrough" parted a stack and cured three hooks for one
// line's extra bend), and keep every line that stayed inside a frame inside
// it. A pass that refuses a line the face it ended on lets that line take
// more bends: parting two lines that swap sides on one stroke shows a
// crossing that was always there. A route that takes a detour is not worth
// what it cures, and a relationship within a frame belongs inside it even
// when the only room is on its wall: its cards stand the frame's inset from
// the wall, which leaves no lane inside.
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { refusedRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { crossingsSeen } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import { crowdedLabels } from "@/transformers/semantic-renderer/lib/layout/label-clearance";
import { bunchedPorts } from "@/transformers/semantic-renderer/lib/layout/lone-pins";
import { sideHooks } from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import type { RouteRequest } from "@/transformers/semantic-renderer/lib/layout/route-requests";
import {
	refusedLines,
	stackedEnds,
	stackKeys,
	touchKeys,
	trackKeys,
} from "@/transformers/semantic-renderer/lib/layout/stacked-runs";
import {
	WALL_FACES,
	wallOf,
	type WallFace,
} from "@/transformers/semantic-renderer/lib/layout/frame-walls";
import {
	ROUTE_LANE,
	WALL_CLEARANCE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/** A straight run of a line, or a frame wall: where it stands across its axis and what it spans. */
interface Run {
	readonly vertical: boolean;
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/** A frame wall and its key. */
interface Wall extends Run {
	readonly key: string;
	readonly frame: Box;
}

/**
 * The straight runs of a line.
 * @param points Its vertices.
 * @returns Its horizontal and vertical runs.
 */
function runsOf(points: readonly Point[]): Run[] {
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const vertical = Math.abs(point.x - previous.x) < 0.01;
		if (!vertical && Math.abs(point.y - previous.y) >= 0.01) return [];
		const [one, other] = vertical ? [previous.y, point.y] : [previous.x, point.x];
		const at = vertical ? point.x : point.y;
		return [{ vertical, at, from: Math.min(one, other), to: Math.max(one, other) }];
	});
}

/**
 * The west, east and south walls of every frame of a drawing.
 * @param drawing The drawing.
 * @returns Its walls.
 */
function wallsOf(drawing: ArchitectureDrawing): Wall[] {
	return drawing.containers.flatMap(({ measured, box }) =>
		WALL_FACES.map((face) => frameWall(measured.node.id, box, face)),
	);
}

/**
 * One wall of a frame.
 * @param id The frame's id.
 * @param frame Its box.
 * @param face The side.
 * @returns The wall.
 */
function frameWall(id: string, frame: Box, face: WallFace): Wall {
	const vertical = face !== "SOUTH";
	const [right, bottom] = [frame.x + frame.width, frame.y + frame.height];
	return {
		key: wallOf(id, face),
		frame,
		vertical,
		at: face === "WEST" ? frame.x : vertical ? right : bottom,
		from: vertical ? frame.y : frame.x,
		to: vertical ? bottom : right,
	};
}

/**
 * Whether a run lies along a wall: parallel, nearer than a wall clearance, for more than a lane.
 * @param run A line's run.
 * @param wall A frame wall.
 * @returns True when the two would read as one edge.
 */
function along(run: Run, wall: Run): boolean {
	return (
		run.vertical === wall.vertical &&
		Math.abs(run.at - wall.at) < WALL_CLEARANCE &&
		Math.min(run.to, wall.to) - Math.max(run.from, wall.from) > ROUTE_LANE
	);
}

/**
 * Whether a line stays inside a frame, its wall included.
 * @param line The line.
 * @param frame The frame.
 * @returns True when every vertex lies within it.
 */
function inside(line: DrawingEdge, frame: Box): boolean {
	return verticesOf(line.curve).every(
		({ x, y }) =>
			x >= frame.x - 0.5 &&
			x <= frame.x + frame.width + 0.5 &&
			y >= frame.y - 0.5 &&
			y <= frame.y + frame.height + 0.5,
	);
}

/**
 * The runs of a drawing's lines along the wall of a frame they do not stay inside.
 * @param drawing The drawing.
 * @returns Each such line's id and the wall's key.
 */
function wallRuns(drawing: ArchitectureDrawing): (readonly [string, string])[] {
	const walls = wallsOf(drawing);
	return drawing.edges.flatMap((line) => {
		const outside = walls.filter((wall) => !inside(line, wall.frame));
		return runsOf(verticesOf(line.curve)).flatMap((run) =>
			outside.filter((wall) => along(run, wall)).map(({ key }) => [line.edge.id, key] as const),
		);
	});
}

/**
 * The walls of a drawing that a line runs along without staying inside their frame.
 * @param drawing The drawing.
 * @returns One wall key for every such run.
 */
function crowdedWalls(drawing: ArchitectureDrawing): string[] {
	return wallRuns(drawing).map(([, wall]) => wall);
}

/**
 * The line ends of a drawing that leave a card by its side although the
 * card and the line's other card stand one above the other with a shared
 * span a straight line could drop through.
 * @param drawing The drawing.
 * @returns One key for every such end.
 */
function wrongFaces(drawing: ArchitectureDrawing): string[] {
	const cards = new Map(drawing.cards.map(({ measured, box }) => [measured.node.id, box]));
	return drawing.edges.flatMap(({ edge, curve }) => {
		const [from, to] = [cards.get(edge.from), cards.get(edge.to)];
		if (from === undefined || to === undefined || !stackedOver(from, to)) return [];
		const points = verticesOf(curve);
		const ends = [
			[edge.from, points],
			[edge.to, points.toReversed()],
		] as const;
		return ends.flatMap(([card, route]) =>
			Math.abs(route[0]!.y - route[1]!.y) < 0.01 ? [`${edge.id}:${card}`] : [],
		);
	});
}

/**
 * Whether two cards stand one above the other and share a span wide enough
 * for a line to keep its nudging distance from both cards' corners.
 * @param one A card.
 * @param other The other card.
 * @returns True when a straight vertical line could join them.
 */
function stackedOver(one: Box, other: Box): boolean {
	const shared = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
	const apart = one.y + one.height <= other.y || other.y + other.height <= one.y;
	return apart && shared >= 2 * ROUTE_NUDGE_DISTANCE;
}

/**
 * How many bends each line of a drawing takes.
 * @param drawing The drawing.
 * @returns Bends by relationship id.
 */
function bendsOf(drawing: ArchitectureDrawing): ReadonlyMap<string, number> {
	return new Map(drawing.edges.map(({ edge, curve }) => [edge.id, verticesOf(curve).length - 2]));
}

/**
 * Whether every line that stays inside a frame in one drawing still does in another.
 * @param clear The walled routing.
 * @param settled The settled drawing.
 * @returns True when no line left a frame it stayed inside.
 */
function keepsInside(clear: ArchitectureDrawing, settled: ArchitectureDrawing): boolean {
	const lines = new Map(clear.edges.map((line) => [line.edge.id, line]));
	return settled.edges.every((line) =>
		settled.containers.every(
			({ box }) => !inside(line, box) || inside(lines.get(line.edge.id) ?? line, box),
		),
	);
}

/**
 * Whether a finishing routing is no worse than the settled drawing: no more
 * crossings, unrelated lines on one stroke counted (even-pins.ts), no line
 * with more bends apart from the lines the pass itself sends another way, or,
 * where it saves a crossing, no more bends in all, and no line out of a frame
 * it stayed inside.
 * @param clear The finishing routing.
 * @param settled The settled drawing.
 * @param excused The lines the pass sends another way.
 * @returns True when it may replace the settled drawing.
 */
function noWorse(
	clear: ArchitectureDrawing,
	settled: ArchitectureDrawing,
	excused: ReadonlySet<string>,
): boolean {
	const [crossings, before] = [crossingsSeen(clear) - crossingsSeen(settled), bendsOf(settled)];
	return (
		crossings <= 0 &&
		(crossings < 0
			? totalBends(clear) <= totalBends(settled)
			: [...bendsOf(clear)].every(
					([id, bends]) => excused.has(id) || bends <= (before.get(id) ?? Infinity),
				)) &&
		keepsInside(clear, settled)
	);
}

/**
 * Every defect of a drawing that a finishing pass cures, and every label
 * another line crowds, every pair of lines that touch and every pair of
 * unrelated lines that run as a double track, each keyed by its kind. No pass
 * may bring any of them ({@link cures}).
 * @param drawing The drawing.
 * @returns The defects.
 */
function defectsOf(drawing: ArchitectureDrawing): ReadonlySet<string> {
	return new Set([
		...FINISHING_PASSES.flatMap(({ kind, defects }) =>
			defects(drawing).map((key) => `${kind}:${key}`),
		),
		...crowdedLabels(drawing).map((key) => `label:${key}`),
		...touchKeys(drawing).map((key) => `touch:${key}`),
		...trackKeys(drawing).map((key) => `track:${key}`),
	]);
}

/**
 * Whether a finishing routing cures more than the settled drawing: it brings
 * no defect of any kind the settled drawing did not have, and has fewer
 * defects, or the same defects with fewer bends in all. Refusing only fresh
 * defects of a pass's own kind let IIS Ingress Migration's wrong-face pass
 * move a side hook from one line to its neighbour, and Voice coordinator's
 * hook pass crowd a label.
 * @param finish The finishing routing.
 * @param settled The settled drawing.
 * @returns True when it cures more.
 */
function cures(finish: ArchitectureDrawing, settled: ArchitectureDrawing): boolean {
	const [after, before] = [defectsOf(finish), defectsOf(settled)];
	if ([...after].some((key) => !before.has(key))) return false;
	return (
		after.size < before.size ||
		(after.size === before.size && totalBends(finish) < totalBends(settled))
	);
}

/**
 * How many bends a drawing's lines take together.
 * @param drawing The drawing.
 * @returns The total.
 */
function totalBends(drawing: ArchitectureDrawing): number {
	return [...bendsOf(drawing).values()].reduce((sum, bends) => sum + bends, 0);
}

/** One finishing pass: what it cures, and what it asks of the routes to cure it. */
interface FinishingPass {
	/** The kind of defect it cures. */
	readonly kind: string;
	/** What it finds to cure in a drawing, as its routes are asked to cure them. */
	readonly found: (drawing: ArchitectureDrawing) => readonly string[];
	/** The defects of its kind a drawing has, one key for each. */
	readonly defects: (drawing: ArchitectureDrawing) => readonly string[];
	/** What its routes are asked, given what it found. */
	readonly ask: (found: readonly string[]) => RouteRequest;
	/** The lines it sends another way, given what it found, which may take more bends. */
	readonly excused: (found: readonly string[]) => ReadonlySet<string>;
}

/**
 * No line is excused.
 * @returns No lines.
 */
function noneExcused(): ReadonlySet<string> {
	return new Set();
}

/**
 * The lines of a drawing along the wall of a frame they leave.
 * @param drawing The drawing.
 * @returns One line@wall key for every such run.
 */
function wallHugs(drawing: ArchitectureDrawing): string[] {
	return wallRuns(drawing).map(([line, wall]) => `${line}@${wall}`);
}

/**
 * Routes asked to keep off walls.
 * @param clearWalls The walls.
 * @returns The request.
 */
function clearing(clearWalls: readonly string[]): RouteRequest {
	return { clearWalls };
}

/**
 * Routes asked for every lane of a shared span and reserved labels on their cards' channel.
 * @returns The request.
 */
function droppingStraight(): RouteRequest {
	return { laneChannels: true, centredLabels: true };
}

/**
 * Routes offered the face a hook passes.
 * @returns The request.
 */
function enteringCorners(): RouteRequest {
	return { cornerPins: true };
}

/**
 * Routes asked to leave line ends off the faces they stacked from.
 * @param refusedEnds The line ends.
 * @returns The request.
 */
function refusing(refusedEnds: readonly string[]): RouteRequest {
	return { refusedEnds };
}

/**
 * Routes asked to centre ports alone beside a corner.
 * @returns The request.
 */
function centringPorts(): RouteRequest {
	return { centredPorts: true };
}

/**
 * The finishing passes, in the order they run. Side exits go before hooks,
 * so a line they turn into a hook can still be cured.
 */
const FINISHING_PASSES: readonly FinishingPass[] = [
	{ kind: "wall", found: crowdedWalls, defects: wallHugs, ask: clearing, excused: noneExcused },
	{
		kind: "face",
		found: wrongFaces,
		defects: wrongFaces,
		ask: droppingStraight,
		excused: noneExcused,
	},
	{
		kind: "hook",
		found: sideHooks,
		defects: sideHooks,
		ask: enteringCorners,
		excused: noneExcused,
	},
	{ kind: "stack", found: stackedEnds, defects: stackKeys, ask: refusing, excused: refusedLines },
	{
		kind: "port",
		found: bunchedPorts,
		defects: bunchedPorts,
		ask: centringPorts,
		excused: noneExcused,
	},
];

/** A drawing and the reading that routed it. */
interface Finish<Reading> {
	readonly reading: Reading;
	readonly drawing: ArchitectureDrawing;
}

/**
 * One finishing pass: the settled drawing, or, when it has what the pass
 * cures, its placement routed once more with the pass's options, if that
 * cures more ({@link cures}), keeps every label and is no worse
 * ({@link noWorse}). A routing the router or the route checks refuse keeps
 * the settled drawing; a fault is thrown.
 * @param settled The settled drawing and its reading.
 * @param pass The pass.
 * @param reroute Routes the same placement asking for more; nothing when a label finds no box.
 * @returns The drawing kept and its reading.
 */
async function finishedBy<Reading>(
	settled: Finish<Reading>,
	pass: FinishingPass,
	reroute: (request: RouteRequest) => Promise<Finish<Reading> | undefined>,
): Promise<Finish<Reading>> {
	const found = pass.found(settled.drawing);
	if (found.length === 0) return settled;
	const finish = await reroute(pass.ask([...new Set(found)])).catch((error: unknown) => {
		if (refusedRouting(error)) return undefined;
		throw error;
	});
	return finish !== undefined &&
		cures(finish.drawing, settled.drawing) &&
		noWorse(finish.drawing, settled.drawing, pass.excused(found))
		? finish
		: settled;
}

/**
 * A settled drawing finished by every pass in turn.
 * @param settled The settled drawing and its reading.
 * @param reroute Routes a reading's placement once more asking for more; nothing when a label finds no box.
 * @returns The finished drawing and its reading.
 */
export function finished<Reading>(
	settled: Finish<Reading>,
	reroute: (reading: Reading, request: RouteRequest) => Promise<Finish<Reading> | undefined>,
): Promise<Finish<Reading>> {
	return FINISHING_PASSES.reduce(
		(earlier, pass) =>
			earlier.then((finish) =>
				finishedBy(finish, pass, (request) => reroute(finish.reading, request)),
			),
		Promise.resolve(settled),
	);
}
