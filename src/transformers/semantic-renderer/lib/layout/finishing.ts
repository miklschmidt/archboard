// Finishing passes: routing options that would move label reservations, and
// so placements, if every routing pass used them. Routed that way from the
// start, keeping lines off frame walls (frame-walls.ts) took Agent workbench
// from 15 to 18 crossings and Board rasterizer from 2777 to 3495 wide, and
// corner pins (pin-feedback.ts) took Board rasterizer from 7 to 11 crossings
// and Browser application's "Working with an agent" from 0 to 4.
//
// So each pass finishes a settled drawing only where it has what the pass
// cures: a line along the wall of a frame it does not stay inside, or a line
// that hooks into a card's side past the card's corner. The same placement,
// with the same reservations, is routed once more with the pass's option, and
// that drawing is kept when it has fewer of them, every label still finds a
// box, it has no more crossings, no line has more bends, and every line that
// stayed inside a frame still does. A route that takes a detour is not worth
// what it cures, fewer bends elsewhere do not pay for one line made worse, and
// a relationship within a frame belongs inside it even when the only room is
// on its wall: its cards stand the frame's inset from the wall, which leaves
// no lane inside.
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { untidiness } from "@/transformers/semantic-renderer/lib/layout/even-pins";
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
 * The walls of a drawing that a line runs along without staying inside their frame.
 * @param drawing The drawing.
 * @returns One wall key for every such run.
 */
export function crowdedWalls(drawing: ArchitectureDrawing): string[] {
	const walls = wallsOf(drawing);
	return drawing.edges.flatMap((line) => {
		const outside = walls.filter((wall) => !inside(line, wall.frame));
		return runsOf(verticesOf(line.curve)).flatMap((run) =>
			outside.filter((wall) => along(run, wall)).map(({ key }) => key),
		);
	});
}

/**
 * The line ends of a drawing that hook into a card's side: the end's run
 * leaves the side and turns along it to beyond the card's top or bottom.
 * @param drawing The drawing.
 * @returns One key for every such end.
 */
export function sideHooks(drawing: ArchitectureDrawing): string[] {
	const cards = new Map(drawing.cards.map(({ measured, box }) => [measured.node.id, box]));
	return drawing.edges.flatMap(({ edge, curve }) => {
		const points = verticesOf(curve);
		const ends = [
			[edge.from, points],
			[edge.to, points.toReversed()],
		] as const;
		return ends.flatMap(([card, route]) => {
			const box = cards.get(card);
			return box !== undefined && hooks(box, route) ? [`${edge.id}:${card}`] : [];
		});
	});
}

/**
 * Whether a route leaves a card's side and turns along it to beyond the card's top or bottom.
 * @param box The card.
 * @param route The route ordered away from the card.
 * @returns True when its side stub turns past the card's corner.
 */
function hooks(box: Box, route: readonly Point[]): boolean {
	const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
	if (after === undefined || Math.abs(tip.y - bend.y) >= 0.01) return false;
	if (Math.abs(bend.x - after.x) >= 0.01) return false;
	return after.y < box.y || after.y > box.y + box.height;
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
 * Whether a routing clear of walls is no worse than the settled drawing: no
 * more crossings, no line with more bends, and no line out of a frame it stayed inside.
 * @param clear The walled routing.
 * @param settled The settled drawing.
 * @returns True when it may replace the settled drawing.
 */
function noWorse(clear: ArchitectureDrawing, settled: ArchitectureDrawing): boolean {
	const before = bendsOf(settled);
	return (
		untidiness(clear)[0]! <= untidiness(settled)[0]! &&
		[...bendsOf(clear)].every(([id, bends]) => bends <= (before.get(id) ?? Infinity)) &&
		keepsInside(clear, settled)
	);
}

/** A drawing and the reading that routed it. */
interface Finish<Reading> {
	readonly reading: Reading;
	readonly drawing: ArchitectureDrawing;
}

/**
 * One finishing pass: the settled drawing, or, when it has what the pass
 * cures, its placement routed once more with the pass's option, if that has
 * fewer of them, keeps every label and is no worse ({@link noWorse}). A
 * routing the router or the route checks refuse keeps the settled drawing.
 * @param settled The settled drawing and its reading.
 * @param cured What the pass cures in a drawing, one key for each.
 * @param reroute Routes the same placement with the pass's option, given what it cures; nothing when a label finds no box.
 * @returns The drawing kept and its reading.
 */
export async function finished<Reading>(
	settled: Finish<Reading>,
	cured: (drawing: ArchitectureDrawing) => readonly string[],
	reroute: (found: readonly string[]) => Promise<Finish<Reading> | undefined>,
): Promise<Finish<Reading>> {
	const found = cured(settled.drawing);
	if (found.length === 0) return settled;
	const finish = await reroute([...new Set(found)]).catch(() => undefined);
	return finish !== undefined &&
		cured(finish.drawing).length < found.length &&
		noWorse(finish.drawing, settled.drawing)
		? finish
		: settled;
}
