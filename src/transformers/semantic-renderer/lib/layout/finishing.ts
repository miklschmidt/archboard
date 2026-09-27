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
// corner, two unrelated lines on one stroke (stacked-runs.ts), a line that
// ends beside the standing pin a card wears (pin-feedback.ts), or a port
// alone on a card face beside its corner (lone-pins.ts). The same placement,
// with the same reservations, is routed once more with the pass's options,
// and that drawing is kept when it cures more: it brings no defect of any
// kind the settled drawing did not have, a label another line crowds, two
// lines that touch or run as a double track, crowded joins, the length
// unrelated lines share a stroke over and crossings within a lane of a bend
// counted too, and has fewer defects
// together. Refusing only fresh defects of the pass's own kind let Voice
// coordinator's hook pass cure hooks by crowding a label. It must also have
// no more crossings, counting two unrelated lines on one stroke as one and
// a crossing within a lane of a bend as two, and give no line more bends
// unless it saves a crossing and takes no more bends in all (Browser
// application's "Recording a walkthrough" parted a stack and cured three
// hooks for one line's extra bend). A route that takes a detour
// is not worth what it cures. A line the pin pass sends off a pin may take
// one bend more for each pin it leaves, and no more: "submit transition"
// into Board persistence's Write under lease turns once more to drop onto
// its top face instead of landing 6 px from the pin. The pin pass clears one
// card at a time, each kept where it cures more, asking again for every card
// kept before it but excusing only the lines of the card it tries:
// cleared together, Board persistence's three cards drew two more crossings
// for one of them. Where curing every hook at once is not kept, the hook pass
// too cures card by card, offering the face a hook passed on that card alone:
// cured together, Board persistence's seven hooks left two labels no run to
// sit on, and card by card five of them enter the face they passed. So does
// the side-exit pass, moving one card's lines' labels alone onto their
// channel: Board rasterizer's "spawn, read the port, stop the group" drops
// straight into Chromium executable's top.
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { refusedRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { corneredCrossings } from "@/transformers/semantic-renderer/lib/layout/cornered-crossings";
import { crossingsSeen } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import { crowdedLabels } from "@/transformers/semantic-renderer/lib/layout/label-clearance";
import { measuredOnceIn } from "@/transformers/semantic-renderer/lib/layout/measured-once";
import { bunchedPorts } from "@/transformers/semantic-renderer/lib/layout/lone-pins";
import { pinnedEnds, sideHooks } from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import type { RouteRequest } from "@/transformers/semantic-renderer/lib/layout/route-requests";
import {
	crowdedJoinCount,
	stackedEnds,
	stackedLanes,
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
 * Whether a run lies along a wall: parallel, nearer than a wall clearance, for
 * more than a lane. The lane is what makes a run read as following the wall
 * rather than touching it, part of the defect, not a rule of its own.
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
 * for a line to keep its nudging distance from both cards' corners. Only
 * then is a side exit between them a defect: the span is part of what the
 * defect is, not a rule of its own.
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
 * Whether a finishing routing is no worse than the settled drawing: no more
 * crossings, unrelated lines on one stroke counted and crossings within a
 * lane of a bend counted twice (even-pins.ts), and no line with more bends,
 * a line the pass sends off a pin one more at most than the drawing it would
 * replace (so one more for each pin it leaves, as the pin pass clears one
 * card at a time and excuses only that card's lines),
 * or, where it saves a crossing, no more bends in all.
 * @param clear The finishing routing.
 * @param settled The settled drawing.
 * @param excused The lines the pass sends off a pin.
 * @returns True when it may replace the settled drawing.
 */
function noWorse(
	clear: ArchitectureDrawing,
	settled: ArchitectureDrawing,
	excused: ReadonlySet<string>,
): boolean {
	const [crossings, before] = [crossingsSeen(clear) - crossingsSeen(settled), bendsOf(settled)];
	if (crossings > 0) return false;
	if (crossings < 0) return totalBends(clear) <= totalBends(settled);
	return [...bendsOf(clear)].every(
		([id, bends]) => bends <= (before.get(id) ?? Infinity) + (excused.has(id) ? 1 : 0),
	);
}

/**
 * Every defect of a drawing that a finishing pass cures, and every label
 * another line crowds, every pair of lines that touch and every pair of
 * unrelated lines that run as a double track, each keyed by its kind.
 * Crowded joins, every lane's worth of line two unrelated lines share a
 * stroke over and crossings within a lane of a bend are counted rather than
 * named, since which lines they carry and where they lie shift with every
 * route beside them. Keyed by their pair
 * of lines alone, two stacks of the same two lines were one defect, and a
 * pass that parted one of them cured nothing. No pass may bring any of them
 * ({@link cures}).
 * @param drawing The drawing.
 * @param pinned The cards that wear a standing pin.
 * @returns The defects.
 */
function countDefects(drawing: ArchitectureDrawing, pinned: Pinned): ReadonlySet<string> {
	return new Set([
		...FINISHING_PASSES.flatMap(({ kind, defects }) =>
			defects(drawing, pinned).map((key) => `${kind}:${key}`),
		),
		...crowdedLabels(drawing).map((key) => `label:${key}`),
		...touchKeys(drawing).map((key) => `touch:${key}`),
		...trackKeys(drawing).map((key) => `track:${key}`),
		...Array.from({ length: crowdedJoinCount(drawing) }, (_, index) => `join:${index}`),
		...Array.from({ length: stackedLanes(drawing) }, (_, index) => `stacked:${index}`),
		...Array.from({ length: corneredCrossings(drawing) }, (_, index) => `cornered:${index}`),
	]);
}

/** {@link countDefects}, taken once for each drawing and set of pinned cards (measured-once.ts). */
const defectsOf = measuredOnceIn(countDefects);

/**
 * Whether a finishing routing cures more than the settled drawing: it brings
 * no defect of any kind the settled drawing did not have, and has fewer
 * defects. Refusing only fresh defects of a pass's own kind let IIS Ingress
 * Migration's wrong-face pass move a side hook from one line to its
 * neighbour, and Voice coordinator's hook pass crowd a label.
 * @param finish The finishing routing.
 * @param settled The settled drawing.
 * @param pinned The cards that wear a standing pin.
 * @returns True when it cures more.
 */
function cures(finish: ArchitectureDrawing, settled: ArchitectureDrawing, pinned: Pinned): boolean {
	const [after, before] = [defectsOf(finish, pinned), defectsOf(settled, pinned)];
	return [...after].every((key) => before.has(key)) && after.size < before.size;
}

/**
 * How many bends a drawing's lines take together.
 * @param drawing The drawing.
 * @returns The total.
 */
function totalBends(drawing: ArchitectureDrawing): number {
	return [...bendsOf(drawing).values()].reduce((sum, bends) => sum + bends, 0);
}

/** The cards of a board that wear a standing pin. */
type Pinned = ReadonlySet<string>;

/** One finishing pass: what it cures, and what it asks of the routes to cure it. */
interface FinishingPass {
	/** The kind of defect it cures. */
	readonly kind: string;
	/** What it finds to cure in a drawing, as its routes are asked to cure them. */
	readonly found: (drawing: ArchitectureDrawing, pinned: Pinned) => readonly string[];
	/** The defects of its kind a drawing has, one key for each. */
	readonly defects: (drawing: ArchitectureDrawing, pinned: Pinned) => readonly string[];
	/** What its routes are asked to cure all it found at once; left out on a pass that cures only card by card. */
	readonly ask?: (found: readonly string[]) => RouteRequest;
	/** What its routes are asked to cure what it found on some cards, where curing all at once is not kept. */
	readonly askByCard?: (found: readonly string[]) => RouteRequest;
	/** Set on a pass whose lines may take a bend more to be cured. */
	readonly excused?: true;
}

/** What a pass asks of its routes, given what it found. */
type Ask = (found: readonly string[]) => RouteRequest;

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
 * Routes asked for the reserved labels of some side exits' lines alone on
 * their cards' channel.
 * @param exits The side exits, as line:card.
 * @returns The request.
 */
function droppingStraightAt(exits: readonly string[]): RouteRequest {
	return { centredLines: [...new Set(exits.map((key) => key.split(":")[0]!))] };
}

/**
 * Routes offered the face a hook passes.
 * @returns The request.
 */
function enteringCorners(): RouteRequest {
	return { cornerPins: true };
}

/**
 * Routes offered the face a hook passes on the cards of some hooks.
 * @param hooks The hooks, as line:card.
 * @returns The request.
 */
function enteringCardCorners(hooks: readonly string[]): RouteRequest {
	return { cornerCards: [...new Set(hooks.map(cardOf))] };
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
 * Routes asked to keep the cards of line ends beside a standing pin clear of it.
 * @param pinnedAt The line ends, as line:card:FACE.
 * @returns The request.
 */
function clearingPins(pinnedAt: readonly string[]): RouteRequest {
	return { clearPins: [...new Set(pinnedAt.map(cardOf))] };
}

/**
 * The card a line:card:FACE key names.
 * @param key The key.
 * @returns The card.
 */
function cardOf(key: string): string {
	return key.split(":")[1]!;
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
	{ kind: "wall", found: crowdedWalls, defects: wallHugs, ask: clearing },
	{
		kind: "face",
		found: wrongFaces,
		defects: wrongFaces,
		ask: droppingStraight,
		askByCard: droppingStraightAt,
	},
	{
		kind: "hook",
		found: sideHooks,
		defects: sideHooks,
		ask: enteringCorners,
		askByCard: enteringCardCorners,
	},
	{ kind: "stack", found: stackedEnds, defects: stackKeys, ask: refusing },
	{
		kind: "pin",
		found: pinnedEnds,
		defects: pinnedEnds,
		askByCard: clearingPins,
		excused: true,
	},
	{
		kind: "port",
		found: bunchedPorts,
		defects: bunchedPorts,
		ask: centringPorts,
	},
];

/** A drawing and the reading that routed it. */
interface Finish<Reading> {
	readonly reading: Reading;
	readonly drawing: ArchitectureDrawing;
}

/** Routes a reading's placement once more asking for more; nothing when a label finds no box. */
type Reroute<Reading> = (
	reading: Reading,
	request: RouteRequest,
) => Promise<Finish<Reading> | undefined>;

/**
 * One finishing pass: the settled drawing, or, when it has what the pass
 * cures, its placement routed once more with the pass's options, if that
 * cures more ({@link cures}), keeps every label and is no worse
 * ({@link noWorse}). Where curing all at once is not asked or not kept, a
 * pass that can cures card by card.
 * @param settled The settled drawing and its reading.
 * @param pass The pass.
 * @param reroute Routes a reading's placement asking for more.
 * @param pinned The cards that wear a standing pin.
 * @returns The drawing kept and its reading.
 */
async function finishedBy<Reading>(
	settled: Finish<Reading>,
	pass: FinishingPass,
	reroute: Reroute<Reading>,
	pinned: Pinned,
): Promise<Finish<Reading>> {
	const found = [...new Set(pass.found(settled.drawing, pinned))];
	if (found.length === 0) return settled;
	const whole =
		pass.ask === undefined ? settled : await tried(settled, pass, pass.ask, found, reroute, pinned);
	if (whole !== settled || pass.askByCard === undefined) return whole;
	return byCard(settled, pass, pass.askByCard, found, reroute, pinned);
}

/**
 * A pass tried one card at a time, asking again for every card kept so far:
 * Board persistence's three standing pins, cleared together, drew two more
 * crossings for one of them, and its seven hooks, cured together, left two
 * labels no run to sit on.
 * @param settled The settled drawing and its reading.
 * @param pass The pass.
 * @param ask What its routes are asked for the cards tried.
 * @param found What it found.
 * @param reroute Routes a reading's placement asking for more.
 * @param pinned The cards that wear a standing pin.
 * @returns The drawing kept and its reading.
 */
async function byCard<Reading>(
	settled: Finish<Reading>,
	pass: FinishingPass,
	ask: Ask,
	found: readonly string[],
	reroute: Reroute<Reading>,
	pinned: Pinned,
): Promise<Finish<Reading>> {
	const cards = [...new Set(found.map(cardOf))];
	const { kept } = await cards.reduce(
		async (earlier, card) => {
			const { kept: before, asked } = await earlier;
			const own = found.filter((key) => cardOf(key) === card);
			const next = await tried(before, pass, ask, [...asked, ...own], reroute, pinned, own);
			return next === before ? { kept: before, asked } : { kept: next, asked: [...asked, ...own] };
		},
		Promise.resolve({ kept: settled, asked: [] as readonly string[] }),
	);
	return kept;
}

/**
 * The settled drawing, or its placement routed once more asking a pass to
 * cure some of what it found, where that cures more and is no worse. A
 * routing the router or the route checks refuse keeps the settled drawing; a
 * fault is thrown.
 * @param settled The settled drawing and its reading.
 * @param pass The pass.
 * @param ask What its routes are asked.
 * @param found What it is asked to cure.
 * @param reroute Routes a reading's placement asking for more.
 * @param pinned The cards that wear a standing pin.
 * @param excusing What of it a pass that excuses a bend excuses: the card tried alone, when tried card by card.
 * @returns The drawing kept and its reading.
 */
async function tried<Reading>(
	settled: Finish<Reading>,
	pass: FinishingPass,
	ask: Ask,
	found: readonly string[],
	reroute: Reroute<Reading>,
	pinned: Pinned,
	excusing: readonly string[] = found,
): Promise<Finish<Reading>> {
	const finish = await reroute(settled.reading, ask(found)).catch((error: unknown) => {
		if (refusedRouting(error)) return undefined;
		throw error;
	});
	const excused = new Set(
		pass.excused === undefined ? [] : excusing.map((key) => key.split(":")[0]!),
	);
	return finish !== undefined &&
		cures(finish.drawing, settled.drawing, pinned) &&
		noWorse(finish.drawing, settled.drawing, excused)
		? finish
		: settled;
}

/**
 * A settled drawing finished by every pass in turn.
 * @param settled The settled drawing and its reading.
 * @param reroute Routes a reading's placement once more asking for more; nothing when a label finds no box.
 * @param pinned The cards that wear a standing pin.
 * @returns The finished drawing and its reading.
 */
export function finished<Reading>(
	settled: Finish<Reading>,
	reroute: Reroute<Reading>,
	pinned: Pinned = new Set(),
): Promise<Finish<Reading>> {
	return FINISHING_PASSES.reduce(
		(earlier, pass) => earlier.then((finish) => finishedBy(finish, pass, reroute, pinned)),
		Promise.resolve(settled),
	);
}
