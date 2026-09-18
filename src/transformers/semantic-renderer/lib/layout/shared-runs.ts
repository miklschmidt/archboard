// Telling apart two routes the engine drew as one line.
//
// A frame the engine will not have crossed twice on one face is crossed once,
// and the relationships sharing that crossing share a boundary port
// (`frame-crossings.ts`). The engine then draws them through the one point,
// and wherever they approach or leave it along the same line a reader sees a
// single line: not a corridor to count across, but one piece of ink standing
// for two relationships.
//
// They are fanned apart here, after the routes are placed and before they are
// rounded, so nothing about the graph the engine solved changes. A route keeps
// the side it already came in on, so fanning a run cannot make two routes
// cross that did not.

import { roundCoord, type Point } from "@/transformers/semantic-renderer/lib/geometry";

/**
 * How far apart a fanned pair is drawn: the engine's own spacing between two
 * parallel routes (`elk.spacing.edgeEdge`), so a fanned corridor is the width
 * of every other corridor on the page and a reader counts across it the same
 * way.
 */
const LANE = 20;

/** Two runs at lane coordinates closer than this are the same line. */
const COINCIDENT = 1;

/**
 * How many lanes a fanned run may step over before it gives up and takes
 * the one it reached. A run that has passed four occupied lanes is in a
 * bundle a reader is counting across anyway.
 */
const LANES_TRIED = 4;

/** One straight piece of one route, as fanning reads it. */
interface SharedRun {
	/** The route it belongs to. */
	readonly id: string;
	/** Which of the route's points it starts at. */
	readonly start: number;
	/** The axis it runs along. */
	readonly along: "x" | "y";
	/** Where it sits on the axis across it, which fanning changes. */
	lane: number;
	/** Its extent along its own axis, lower first. */
	readonly span: readonly [number, number];
	/** Where the route sits across the lane on either side of it. */
	readonly approach: number;
	/** Whether fanning may move it: a run touching an end of the route may not, since that end is on a card's face. */
	readonly movable: boolean;
}

/**
 * The axis across one.
 * @param along The axis a run runs along.
 * @returns The other axis.
 */
function acrossOf(along: "x" | "y"): "x" | "y" {
	return along === "x" ? "y" : "x";
}

/**
 * Where a route sits across a run's lane on either side of it, which is the
 * side it is coming from and going to.
 * @param points The route's corners.
 * @param start Which point the run starts at.
 * @param across The axis across the run.
 * @returns The mean of whichever neighbours the run has.
 */
function approachOf(points: readonly Point[], start: number, across: "x" | "y"): number {
	const neighbours = [points[start - 1], points[start + 2]].filter((point) => point !== undefined);
	if (neighbours.length === 0) return points[start]![across];
	return neighbours.reduce((sum, point) => sum + point[across], 0) / neighbours.length;
}

/**
 * Every straight run of one route. A run touching either end of the route
 * cannot be moved: that end sits on a card's face and is where the reading
 * seated it.
 * @param id The route.
 * @param points Its corners.
 * @returns Its runs.
 */
function runsOf(id: string, points: readonly Point[]): SharedRun[] {
	const runs: SharedRun[] = [];
	for (let start = 0; start + 1 < points.length; start += 1) {
		const one = points[start]!,
			other = points[start + 1]!;
		const along = Math.abs(one.x - other.x) > Math.abs(one.y - other.y) ? "x" : "y";
		const across = acrossOf(along);
		if (Math.abs(one[across] - other[across]) > COINCIDENT) continue;
		runs.push({
			id,
			start,
			along,
			lane: one[across],
			span: [Math.min(one[along], other[along]), Math.max(one[along], other[along])],
			approach: approachOf(points, start, across),
			movable: start > 0 && start + 1 < points.length - 1,
		});
	}
	return runs;
}

/**
 * Whether a run would be drawn as one line with another: along the same
 * axis, on the same lane, and overlapping along that axis.
 * @param one A run.
 * @param other Another run.
 * @param lane The lane to ask about, which need not be the one `one` is on.
 * @returns True when a reader would see one line there.
 */
function overdrawnAt(one: SharedRun, other: SharedRun, lane: number): boolean {
	return (
		one.along === other.along &&
		Math.abs(lane - other.lane) <= COINCIDENT &&
		Math.min(one.span[1], other.span[1]) - Math.max(one.span[0], other.span[0]) > COINCIDENT
	);
}

/**
 * Whether two runs are drawn as one line where they are.
 * @param one A run.
 * @param other Another run.
 * @returns True when a reader sees one line there.
 */
function overdrawn(one: SharedRun, other: SharedRun): boolean {
	return overdrawnAt(one, other, one.lane);
}

/**
 * The runs drawn as one line, grouped: each group holds every run a reader
 * cannot tell from the others in it.
 * @param runs Every run of every route.
 * @returns The groups drawn by two or more routes, in the order their first run was read.
 */
function overdrawnGroups(runs: readonly SharedRun[]): SharedRun[][] {
	const groups: SharedRun[][] = [];
	for (const run of runs) {
		const group = groups.find((candidate) => candidate.some((member) => overdrawn(member, run)));
		if (group === undefined) groups.push([run]);
		else group.push(run);
	}
	return groups.filter((group) => new Set(group.map((run) => run.id)).size > 1);
}

/** One route's share of a lane: the side it approaches from, and whether it may move at all. */
interface Sharer {
	/** The route. */
	readonly id: string;
	/** Where it sits across the lane on either side of the runs it shares. */
	readonly approach: number;
	/** Whether every one of its runs on the lane may be moved. */
	readonly movable: boolean;
}

/**
 * The routes drawing one overdrawn lane, each read once however many of its
 * runs lie on that lane.
 * @param group The runs drawn as one line.
 * @returns One sharer per route.
 */
function sharersOf(group: readonly SharedRun[]): Map<string, Sharer> {
	const sharers = new Map<string, Sharer>();
	for (const run of group) {
		const seen = sharers.get(run.id);
		sharers.set(run.id, {
			id: run.id,
			approach: seen === undefined ? run.approach : Math.min(seen.approach, run.approach),
			movable: seen === undefined ? run.movable : seen.movable && run.movable,
		});
	}
	return sharers;
}

/**
 * The routes of one overdrawn group in the order they cross the lane, so
 * each keeps the side it approached from and fanning cannot make two of them
 * cross.
 * @param group The runs drawn as one line.
 * @returns The sharers, the one approaching from the lower coordinate first.
 */
function orderOf(group: readonly SharedRun[]): Sharer[] {
	return [...sharersOf(group).values()].toSorted(
		(one, other) => one.approach - other.approach || one.id.localeCompare(other.id),
	);
}

/**
 * How far each route of one overdrawn group moves across the lane. The lane
 * is anchored on a route that cannot move, so the ones that can move off it
 * rather than round it; with every route free the group is centred on the
 * lane they all ran down.
 * @param group The runs drawn as one line.
 * @returns The offset each route takes, by route id.
 */
function offsetsOf(group: readonly SharedRun[]): Map<string, number> {
	const order = orderOf(group);
	const anchored = order.findIndex(({ movable }) => !movable);
	const pivot = anchored < 0 ? (order.length - 1) / 2 : anchored;
	return new Map(order.map(({ id }, place) => [id, (place - pivot) * LANE] as const));
}

/**
 * The lane a run fans onto: the one its offset asks for, stepped on again
 * the same way while another route is already drawn along it, so fanning
 * never trades one overdrawn pair for another.
 * @param run The run being moved.
 * @param offset How far across the lane it was asked to move.
 * @param runs Every run of every route, at the lane each is on now.
 * @returns The lane to put it on.
 */
function clearLane(run: SharedRun, offset: number, runs: readonly SharedRun[]): number {
	const step = Math.sign(offset) * LANE;
	let lane = run.lane + offset;
	for (let tried = 0; tried < LANES_TRIED; tried += 1) {
		const taken = runs.some((other) => other.id !== run.id && overdrawnAt(run, other, lane));
		if (!taken) break;
		lane += step;
	}
	return lane;
}

/**
 * Move one run onto a lane of its own. Both its ends move across the lane,
 * which is the axis the runs on either side of it travel along, so the route
 * stays square.
 * @param run The run to move, whose lane is updated.
 * @param lane The lane to put it on.
 * @param points The route's corners, changed in place.
 */
function moveRun(run: SharedRun, lane: number, points: Point[]): void {
	const across = acrossOf(run.along);
	for (const index of [run.start, run.start + 1]) {
		points[index] = { ...points[index]!, [across]: roundCoord(lane) };
	}
	run.lane = lane;
}

/**
 * Fan one group of overdrawn runs apart, leaving where it cannot move.
 * @param group The runs drawn as one line.
 * @param runs Every run of every route, at the lane each is on now.
 * @param fanned Every route's corners, changed in place.
 */
function fanGroup(
	group: readonly SharedRun[],
	runs: readonly SharedRun[],
	fanned: Map<string, Point[]>,
): void {
	const offsets = offsetsOf(group);
	for (const run of group) {
		const offset = offsets.get(run.id) ?? 0;
		if (!run.movable || offset === 0) continue;
		moveRun(run, clearLane(run, offset, runs), fanned.get(run.id)!);
	}
}

/**
 * Fan apart every set of routes the engine drew as one line, so a reader has
 * one line to follow per relationship.
 * @param routes Every route's corners, by relationship id.
 * @returns The same routes, the shared runs moved onto a lane each.
 */
function fanOverdrawnRuns(routes: ReadonlyMap<string, readonly Point[]>): Map<string, Point[]> {
	const fanned = new Map(
		[...routes].map(([id, points]) => [id, points.map((point) => ({ ...point }))]),
	);
	const runs = [...fanned].flatMap(([id, points]) => runsOf(id, points));
	for (const group of overdrawnGroups(runs)) fanGroup(group, runs, fanned);
	return fanned;
}
export { LANE, fanOverdrawnRuns };
