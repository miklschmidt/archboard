// Keeping lines off frame walls (frame-walls.ts) is a finishing step. Moving
// lines off walls moves where labels land, so which labels are reserved and
// the placement those reservations buy: routed that way from the start, Agent
// workbench and Board rasterizer settled on other placements that read worse.
//
// So a settled drawing is finished only where a line runs along the wall of a
// frame it does not stay inside. Its placement is routed once more clear of
// those walls, and that drawing is kept when it has fewer lines along walls,
// every label still finds a box, it has no more crossings, no line has more
// bends, and every line that stayed inside a frame still does. A wall-clear
// route that takes a detour is not worth the wall, fewer bends elsewhere do
// not pay for one line made worse, and a relationship within a frame belongs
// inside it even when the only room is on its wall: its cards stand the
// frame's inset from the wall, which leaves no lane inside.
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
function crowdedWalls(drawing: ArchitectureDrawing): string[] {
	const walls = wallsOf(drawing);
	return drawing.edges.flatMap((line) => {
		const outside = walls.filter((wall) => !inside(line, wall.frame));
		return runsOf(verticesOf(line.curve)).flatMap((run) =>
			outside.filter((wall) => along(run, wall)).map(({ key }) => key),
		);
	});
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

/**
 * The settled drawing, or, when a line of it runs along the wall of a frame it
 * does not stay inside, its placement routed clear of those walls, if that has
 * fewer such lines, keeps every label and is no worse ({@link noWorse}). A
 * walled routing the router or the route checks refuse keeps the settled drawing.
 * @param settled The settled drawing.
 * @param walled Routes the same placement clear of the walls named; nothing when a label finds no box.
 * @returns The drawing kept.
 */
export async function clearOfWalls(
	settled: ArchitectureDrawing,
	walled: (walls: readonly string[]) => Promise<ArchitectureDrawing | undefined>,
): Promise<ArchitectureDrawing> {
	const crowded = crowdedWalls(settled);
	if (crowded.length === 0) return settled;
	const clear = await walled([...new Set(crowded)]).catch(() => undefined);
	return clear !== undefined &&
		crowdedWalls(clear).length < crowded.length &&
		noWorse(clear, settled)
		? clear
		: settled;
}
