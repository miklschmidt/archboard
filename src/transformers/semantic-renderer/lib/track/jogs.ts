// Small jogs closed (visual polish). A line whose neighbouring stations stand
// a few points apart is drawn with a sideways step too short for its two
// bends: a notch in a line that should run straight. Each such step is closed
// by moving one of its ends onto the other's column where that end can move
// without crowding anything: a card's own port along its face, a run of lanes
// onto a free column, or a label box clear of the rest of its band. A move
// that would bend a line that ran straight on the moved station's other side
// is not made.
//
// The same moves part two lines that read as one: a line that comes down onto
// its track and turns within a lane of where another line turns off a lower
// track and goes on down draws one line with a kink, however their tracks are
// ordered. One end of the pair moves a lane aside, or onto its own line's
// column, when that parts more such pairs than it makes and crosses nothing.
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import {
	LANE,
	moveRun,
	runOf,
	type Chain,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import type { Net } from "@/transformers/semantic-renderer/lib/track/channels";
import { nudgeLabel } from "@/transformers/semantic-renderer/lib/track/labels";
import { centreX, type Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** Under this, two stations stand in one column. */
const STRAIGHT = 0.5;
/** How near its card's corner a port may come to let its line run straight. */
const CORNER_ROOM = 12;
/** How many passes close jogs that one move opens elsewhere. */
const PASSES = 3;

/** Which end of a net a station stands at. */
type End = "top" | "bottom";

/**
 * How far a net steps sideways.
 * @param net The net.
 * @returns The step.
 */
function step(net: Net): number {
	return Math.abs(net.topX - net.bottomX);
}

/**
 * Whether a net steps sideways by less than its two bends need.
 * @param net The net.
 * @returns True for a step too short to turn.
 */
function notched(net: Net): boolean {
	return step(net) > STRAIGHT && step(net) < 2 * BEND_RADIUS;
}

/**
 * Where a net meets one of its stations.
 * @param net The net.
 * @param end Which end.
 * @returns The x.
 */
function xAt(net: Net, end: End): number {
	return end === "top" ? net.topX : net.bottomX;
}

/**
 * Stand a net's end at an x.
 * @param net The net.
 * @param end Which end.
 * @param x The x.
 */
function setX(net: Net, end: End, x: number): void {
	if (end === "top") net.topX = x;
	else net.bottomX = x;
}

/**
 * Whether a net's end at a card is a trunk's shared port.
 * @param net The net.
 * @param end Which end.
 * @returns True when a trunk owns it.
 */
function trunkAt(net: Net, end: End): boolean {
	const trunk = net.trunk;
	return trunk !== undefined && (trunk.side === end || trunk.whole);
}

/**
 * Whether an x stands on a card's face, clear of its corners.
 * @param station The card.
 * @param x The x.
 * @returns True when a port may stand there.
 */
function onFace(station: Station, x: number): boolean {
	const { x: left, width } = station.item!.box;
	const room = Math.min(CORNER_ROOM, width / 2);
	return x >= left + room && x <= left + width - room;
}

/**
 * Move a card's own port along its face to an x, when the port is no trunk's
 * and stays clear of the face's corners and its other ports.
 * @param nets Every net.
 * @param net The net whose port moves.
 * @param end Which of its ends is the card.
 * @param x The x.
 * @returns Whether it moved.
 */
function movePort(nets: readonly Net[], net: Net, end: End, x: number): boolean {
	if (trunkAt(net, end) || !onFace(net[end], x)) return false;
	const others = nets.filter((other) => other !== net && other[end].item === net[end].item);
	if (others.some((other) => Math.abs(xAt(other, end) - x) < LANE)) return false;
	setX(net, end, x);
	return true;
}

/**
 * The stretch of a line beyond one end of a net: that end's station, and every
 * station after it the line reaches straight, each with the net that reaches it.
 * @param route The line's nets, top to bottom.
 * @param index The net's place in it.
 * @param end Which end the stretch starts at.
 * @returns The stations, nearest first, each with the net arriving at it from the net's side.
 */
function stretchBeyond(
	route: readonly Net[],
	index: number,
	end: End,
): { station: Station; net: Net; end: End }[] {
	const stretch = [{ station: route[index]![end], net: route[index]!, end }];
	const onward = end === "bottom" ? 1 : -1;
	for (let at = index + onward; at >= 0 && at < route.length; at += onward) {
		const next = route[at]!;
		if (step(next) > STRAIGHT) break;
		stretch.push({ station: next[end], net: next, end });
	}
	return stretch;
}

/** What a stretch's move changes, to put back when part of it cannot move. */
interface Saved {
	readonly lanes: Map<Station, number>;
	readonly boxes: Map<Station, Station["item"]>;
	readonly ends: Map<Net, [number, number]>;
}

/**
 * Keep what moving some stations could change.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param stations The stations.
 * @returns The saved state.
 */
function save(chains: readonly Chain[], nets: readonly Net[], stations: readonly Station[]): Saved {
	const lanes = new Map<Station, number>();
	for (const station of stations)
		for (const lane of runOf(chains, station)?.lanes ?? []) lanes.set(lane, lane.x);
	const boxes = new Map(
		stations
			.filter(({ kind }) => kind === "label")
			.map((station) => [station, { ...station.item! }] as const),
	);
	return { lanes, boxes, ends: new Map(nets.map((net) => [net, [net.topX, net.bottomX]])) };
}

/**
 * Put back what a failed stretch moved.
 * @param saved The saved state.
 */
function restore(saved: Saved): void {
	for (const [lane, x] of saved.lanes) lane.x = x;
	for (const [station, item] of saved.boxes) station.item!.box = item!.box;
	for (const [net, [top, bottom]] of saved.ends) {
		net.topX = top;
		net.bottomX = bottom;
	}
}

/**
 * Stand every net's end at its station where the station is a lane or a label.
 * @param nets Every net.
 */
function follow(nets: readonly Net[]): void {
	for (const net of nets)
		for (const end of ["top", "bottom"] as const) {
			const station = net[end];
			if (station.kind === "lane") setX(net, end, station.x);
			if (station.kind === "label") setX(net, end, centreX(station.item!));
		}
}

/**
 * Move a stretch of stations onto one column: each run of lanes onto a free
 * column, each label box where it stays clear, and a card at its far end by
 * its own port. All of it moves, or none, and none when the move would notch
 * another line.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param stretch The stations, each with the net arriving at it.
 * @param x The column.
 * @param better Whether the drawing is better for the move, asked once it is made.
 * @returns Whether it moved.
 */
function moveStretch(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	stretch: readonly { station: Station; net: Net; end: End }[],
	x: number,
	better: () => boolean = () => true,
): boolean {
	const saved = save(
		chains,
		nets,
		stretch.map(({ station }) => station),
	);
	const before = new Set(nets.filter(notched));
	const moved = stretch.every(({ station, net, end }) => {
		if (station.kind === "lane") return station.x === x || moveRun(scene, chains, station, x);
		if (station.kind === "label") return nudgeLabel(scene, nets, station.item!, x);
		return movePort(nets, net, end, x);
	});
	if (moved) follow(nets);
	// A move that notches a line that ran clear trades one jog for another.
	const kept = moved && nets.every((net) => before.has(net) || !notched(net)) && better();
	if (!kept) restore(saved);
	return kept;
}

/**
 * Close one net's short step by moving the stretch beyond one of its ends
 * onto the other end's column.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param route The net's line, top to bottom.
 * @param index The net's place in it.
 * @returns Whether it closed.
 */
function close(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	route: readonly Net[],
	index: number,
): boolean {
	const net = route[index]!;
	return (["top", "bottom"] as const).some((end) => {
		const x = xAt(net, end === "top" ? "bottom" : "top");
		return moveStretch(scene, chains, nets, stretchBeyond(route, index, end), x);
	});
}

/**
 * Close every step too short for its two bends that a move can close.
 * @param scene The scene, its ports placed.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 */
function closeJogs(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
): void {
	const nets = routes.flat();
	for (let pass = 0; pass < PASSES; pass += 1) {
		const closed = routes.flatMap((route) =>
			route.map((net, index) =>
				notched(net) && net.wall === undefined ? close(scene, chains, nets, route, index) : false,
			),
		);
		if (!closed.some(Boolean)) return;
	}
}

/**
 * Whether two nets belong to one line or one trunk.
 * @param one A net.
 * @param other Another.
 * @returns True when they are drawn together.
 */
function related(one: Net, other: Net): boolean {
	return one.edge === other.edge || (one.trunk !== undefined && one.trunk === other.trunk);
}

/**
 * Whether a line leaving a station into a channel and another line entering
 * the station below from the same channel stand within a lane of each other:
 * one comes down onto its track and turns where the other turns off its track
 * and goes on down, and the two read as one line.
 * @param leaving The net that leaves the upper station.
 * @param entering The net that enters the lower station.
 * @returns True when they read as one.
 */
function collinear(leaving: Net, entering: Net): boolean {
	if (leaving.channel !== entering.channel || related(leaving, entering)) return false;
	if (leaving.wall === "top" || entering.wall === "bottom") return false;
	return Math.abs(leaving.topX - entering.bottomX) < LANE;
}

/**
 * How many pairs of lines read as one.
 * @param nets Every net.
 * @returns The count.
 */
function collinearPairs(nets: readonly Net[]): number {
	return nets.reduce(
		(count, leaving) => count + nets.filter((entering) => collinear(leaving, entering)).length,
		0,
	);
}

/**
 * How many pairs of lines swap sides across a channel, which no order of
 * tracks keeps from crossing.
 * @param nets Every net.
 * @returns The count.
 */
function swapped(nets: readonly Net[]): number {
	return nets.reduce(
		(count, one) =>
			count +
			nets.filter(
				(other) =>
					other.channel === one.channel &&
					(one.topX - other.topX) * (one.bottomX - other.bottomX) < 0,
			).length,
		0,
	);
}

/**
 * Part one pair of lines that read as one: move the leaving line's upper
 * stretch, or the entering line's lower stretch, a lane aside from the other
 * or onto its own line's column, the nearest move that parts more pairs than
 * it makes and makes no two lines cross.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 * @param leaving Where the leaving net is.
 * @param leaving.route Its line.
 * @param leaving.index Its place in it.
 * @param entering Where the entering net is.
 * @param entering.route Its line.
 * @param entering.index Its place in it.
 * @returns Whether they parted.
 */
function part(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
	leaving: { route: readonly Net[]; index: number },
	entering: { route: readonly Net[]; index: number },
): boolean {
	const nets = routes.flat();
	const [up, down] = [leaving.route[leaving.index]!, entering.route[entering.index]!];
	const [count, crossing] = [collinearPairs(nets), swapped(nets)];
	const moves = [
		...[down.bottomX - LANE, down.bottomX + LANE, up.bottomX].map((x) => ({
			x,
			from: up.topX,
			stretch: stretchBeyond(leaving.route, leaving.index, "top"),
		})),
		...[up.topX - LANE, up.topX + LANE, down.topX].map((x) => ({
			x,
			from: down.bottomX,
			stretch: stretchBeyond(entering.route, entering.index, "bottom"),
		})),
	].toSorted((one, other) => Math.abs(one.x - one.from) - Math.abs(other.x - other.from));
	return moves.some(
		({ x, from, stretch }) =>
			Math.abs(x - from) > STRAIGHT &&
			moveStretch(
				scene,
				chains,
				nets,
				stretch,
				x,
				() => collinearPairs(nets) < count && swapped(nets) <= crossing,
			),
	);
}

/**
 * Part every pair of lines that read as one where a move can.
 * @param scene The scene, its ports and labels placed.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 */
function partCollinear(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
): void {
	const places = routes.flatMap((route) => route.map((net, index) => ({ net, route, index })));
	for (let pass = 0; pass < PASSES; pass += 1) {
		const parted = places.flatMap((leaving) =>
			places
				.filter((entering) => collinear(leaving.net, entering.net))
				.map((entering) => part(scene, chains, routes, leaving, entering)),
		);
		if (!parted.some(Boolean)) return;
	}
}

export { closeJogs, partCollinear };
