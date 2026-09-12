// Where the arrows meet the cards, and where they run once they are away.
//
// Forked from PR Lens's `layout/edges.ts`. Two questions live here: which point
// of a card's face a route attaches to (ports), and which line of a gap it
// travels along (tracks). Both are pure allocations over a planned route, so
// neither needs to know how a route was planned or how it will be drawn.

import {
	PORT_INSET,
	PORT_PITCH,
	TRACK_CLEARANCE,
	TRACK_PITCH_MAX,
} from "@/runtime/semantic-renderer/lib/design";
import {
	boxCentre,
	type Box,
	type Point,
	type Side,
} from "@/runtime/semantic-renderer/lib/geometry";
import {
	bandChannel,
	type LayoutGrid,
	type PlacedNode,
} from "@/runtime/semantic-renderer/lib/layout/architecture";
import type { Channel, Route } from "@/runtime/semantic-renderer/lib/layout/plan";

/** Which axis a route slides along while it hugs a face. */
const AXIS_OF: Readonly<Record<Side, "x" | "y">> = {
	top: "x",
	bottom: "x",
	left: "y",
	right: "y",
};

const OPPOSITE: Readonly<Record<Side, Side>> = {
	top: "bottom",
	bottom: "top",
	left: "right",
	right: "left",
};

/** Where one route attaches to one face. */
interface Port {
	/** How far along the face, in the face's own axis. */
	readonly along: number;
}

/** How much room a gap has, and where its middle is. */
interface ChannelSpan {
	/** The middle of the gap. */
	readonly centre: number;
	/** How much of it tracks may use, once clearance is taken off both sides. */
	readonly room: number;
}

/** One straight run through one gap, as the track allocator sees it. */
interface Run {
	/** Which way it travels: -1, 0 or 1. */
	readonly heading: number;
	/** Where it starts, along the gap. */
	readonly at: number;
	/** How far it travels, signed so that nested runs sort outward. */
	readonly nest: number;
}

/**
 * Which axis a face's ports spread along.
 * @param side The face.
 * @returns The axis.
 */
function sideAxis(side: Side): "x" | "y" {
	return AXIS_OF[side];
}

/**
 * The face directly across from one.
 * @param side The face.
 * @returns Its opposite.
 */
function opposedSide(side: Side): Side {
	return OPPOSITE[side];
}

/**
 * The extent of one face of a box, along the axis its ports spread on.
 * @param box The box.
 * @param side Which face.
 * @returns The face's two ends.
 */
function faceSpan(box: Box, side: Side): { from: number; to: number } {
	if (sideAxis(side) === "x") {
		return { from: box.x, to: box.x + box.width };
	}
	return { from: box.y, to: box.y + box.height };
}

/**
 * A point on one face of a box.
 * @param box The box.
 * @param side Which face.
 * @param along How far along that face.
 * @returns The point.
 */
function portPoint(box: Box, side: Side, along: number): Point {
	if (side === "top") {
		return { x: along, y: box.y };
	}
	if (side === "bottom") {
		return { x: along, y: box.y + box.height };
	}
	if (side === "left") {
		return { x: box.x, y: along };
	}
	return { x: box.x + box.width, y: along };
}

/**
 * How much room one gap of the grid has.
 * @param grid The gaps of the layout.
 * @param channel Which gap.
 * @returns Its middle and its usable width.
 */
function channelSpan(grid: LayoutGrid, channel: Channel): ChannelSpan {
	if (channel.kind === "corridor") {
		const corridor = grid.corridors[channel.index] ?? { left: 0, right: 0 };
		return {
			centre: (corridor.left + corridor.right) / 2,
			room: corridor.right - corridor.left - TRACK_CLEARANCE * 2,
		};
	}
	const { top, bottom } = bandChannel(grid, channel.index);
	return { centre: (top + bottom) / 2, room: bottom - top - TRACK_CLEARANCE * 2 };
}

/**
 * Positions spread around a centre. The step divides the room by the traffic
 * rather than growing with it, so a busy gap packs tighter instead of spilling;
 * a quiet one never spreads past the cap.
 * @param centre The middle to spread around.
 * @param room How much room there is.
 * @param count How many positions are wanted.
 * @param cap The widest step allowed.
 * @returns The positions, in order.
 */
function spread(centre: number, room: number, count: number, cap: number): number[] {
	const pitch = count > 1 ? Math.min(cap, room / (count - 1)) : 0;
	return Array.from({ length: count }, (_, index) => centre + (index - (count - 1) / 2) * pitch);
}

/**
 * The slot a route's departure port is allocated under. A trunked route names
 * its trunk, so every member of the stem shares one slot.
 * @param route The route.
 * @returns Its departure slot key.
 */
function fromSlot(route: Route): string {
	return `${route.from.node.id} ${route.fromSide} ${route.trunk ?? `${route.edge.id}>`}`;
}

/**
 * The slot a route's arrival port is allocated under.
 * @param route The route.
 * @returns Its arrival slot key.
 */
function toSlot(route: Route): string {
	return `${route.to.node.id} ${route.toSide} ${route.edge.id}<`;
}

/**
 * The point a slot was allocated, or the middle of the face when it was not.
 * @param ports Every allocated port.
 * @param slot Which slot.
 * @param box The box the face belongs to.
 * @param side Which face.
 * @returns The point on the face.
 */
function resolvedPort(ports: ReadonlyMap<string, Port>, slot: string, box: Box, side: Side): Point {
	const span = faceSpan(box, side);
	return portPoint(box, side, ports.get(slot)?.along ?? (span.from + span.to) / 2);
}

/**
 * Whether a channel runs along the axis a face's ports spread on.
 * @param channel The gap.
 * @param axis The face's axis.
 * @returns True when travelling that gap moves along the face.
 */
function matchesAxis(channel: Channel, axis: "x" | "y"): boolean {
	return axis === "y" ? channel.kind === "band" : channel.kind === "corridor";
}

/**
 * The centre of the first (or last) gap this route travels that moves it along
 * the face it is leaving by, which is the coordinate its port should aim at.
 * @param channels The gaps the route travels.
 * @param axis The face's axis.
 * @param grid The gaps of the layout.
 * @param fromTheEnd Whether to look from the arrival end backwards.
 * @returns The coordinate, or undefined when no gap moves along that axis.
 */
function channelCentreOn(
	channels: readonly Channel[],
	axis: "x" | "y",
	grid: LayoutGrid,
	fromTheEnd: boolean,
): number | undefined {
	const ordered = fromTheEnd ? channels.toReversed() : channels;
	for (const channel of ordered) {
		if (matchesAxis(channel, axis)) {
			return channelSpan(grid, channel).centre;
		}
	}
	return undefined;
}

/**
 * The first coordinate along the departure face this route will head for.
 * @param route The route.
 * @param grid The gaps of the layout.
 * @returns The coordinate its departure port should aim at.
 */
function departureToward(route: Route, grid: LayoutGrid): number {
	const axis = sideAxis(route.fromSide);
	const found = channelCentreOn(route.channels, axis, grid, false);
	if (found !== undefined) {
		return found;
	}
	const target = boxCentre(route.to.box);
	return axis === "x" ? target.x : target.y;
}

/**
 * The last coordinate along the arrival face this route comes from.
 * @param route The route.
 * @param grid The gaps of the layout.
 * @returns The coordinate its arrival port should aim at.
 */
function approachToward(route: Route, grid: LayoutGrid): number {
	const axis = sideAxis(route.toSide);
	const found = channelCentreOn(route.channels, axis, grid, true);
	if (found !== undefined) {
		return found;
	}
	const source = boxCentre(route.from.box);
	return axis === "x" ? source.x : source.y;
}

/**
 * The stretch of one face a route may attach to.
 *
 * Usually the whole face. A container is the exception: its box covers every
 * row it holds, and a port in the middle of a vertical edge would send the
 * route's horizontal run behind the cards inside it. Such a node names a
 * narrower stretch — the zone above its first row — and ports go there instead.
 * @param placed The node.
 * @param side Which face.
 * @returns The stretch ports may use.
 */
function attachSpan(placed: PlacedNode, side: Side): { from: number; to: number } {
	return placed.attach?.[side] ?? faceSpan(placed.box, side);
}

/** One route's claim on one face. */
interface Demand {
	/** The slot key. */
	readonly slot: string;
	/** The stretch of the face ports may use. */
	readonly span: { readonly from: number; readonly to: number };
	/** Which face. */
	readonly side: Side;
	/** Where along the face the route wants to be; ports sort by this. */
	toward: number;
	/** Document order, the tiebreak. */
	order: number;
}

/**
 * Add one route's claim on one face, merging it with an existing claim on the
 * same slot: a trunk slot is asked for once per member, and aims at their middle.
 * @param byFace Every face's claims so far.
 * @param slot The slot key.
 * @param placed The node the face belongs to.
 * @param side Which face.
 * @param toward Where along the face the route wants to be.
 * @param order Document order.
 */
function registerDemand(
	byFace: Map<string, Map<string, Demand>>,
	slot: string,
	placed: PlacedNode,
	side: Side,
	toward: number,
	order: number,
): void {
	const face = `${placed.node.id} ${side}`;
	const demands = byFace.get(face) ?? new Map<string, Demand>();
	const known = demands.get(slot);
	if (known === undefined) {
		demands.set(slot, { slot, span: attachSpan(placed, side), side, toward, order });
	} else {
		known.toward = (known.toward + toward) / 2;
		known.order = Math.min(known.order, order);
	}
	byFace.set(face, demands);
}

/**
 * Spread one face's claims along it on a fixed pitch, in the order of where
 * each route is headed.
 * @param demands The claims on this face.
 * @param ports Where the allocations are recorded.
 */
function assignFace(demands: readonly Demand[], ports: Map<string, Port>): void {
	const ordered = demands.toSorted((a, b) => a.toward - b.toward || a.order - b.order);
	const head = ordered[0];
	if (head === undefined) {
		return;
	}
	const span = head.span;
	const middle = (span.from + span.to) / 2;
	const positions = spread(
		middle,
		span.to - span.from - PORT_INSET * 2,
		ordered.length,
		PORT_PITCH,
	);
	ordered.forEach((demand, index) => {
		ports.set(demand.slot, { along: positions[index] ?? middle });
	});
}

/**
 * Where the arrows meet the cards: every face spreads its ports on a fixed
 * pitch in a fixed order, and a trunk group takes a single slot for all of its
 * members.
 * @param routes Every planned route.
 * @param grid The gaps of the layout.
 * @returns Each slot's port.
 */
function allocatePorts(routes: readonly Route[], grid: LayoutGrid): Map<string, Port> {
	const byFace = new Map<string, Map<string, Demand>>();
	for (const route of routes) {
		const { fromSide, toSide, order } = route;
		registerDemand(
			byFace,
			fromSlot(route),
			route.from,
			fromSide,
			departureToward(route, grid),
			order,
		);
		registerDemand(byFace, toSlot(route), route.to, toSide, approachToward(route, grid), order);
	}

	const ports = new Map<string, Port>();
	for (const demands of byFace.values()) {
		assignFace([...demands.values()], ports);
	}
	return ports;
}

/**
 * Whether a route is a candidate for being pulled dead straight: one hop, faces
 * directly opposed, and not sharing a stem with anything.
 * @param route The route.
 * @returns True when it may be snapped.
 */
function snappable(route: Route): boolean {
	if (route.trunk !== undefined) {
		return false;
	}
	if (opposedSide(route.fromSide) !== route.toSide) {
		return false;
	}
	return route.channels.length <= 1;
}

/**
 * Pull one route's two ports into line, when the overlap of the two faces has
 * room for it.
 * @param route The route.
 * @param ports Every allocated port, updated in place.
 */
function snapRoute(route: Route, ports: Map<string, Port>): void {
	const fromSpan = attachSpan(route.from, route.fromSide);
	const toSpan = attachSpan(route.to, route.toSide);
	const low = Math.max(fromSpan.from, toSpan.from) + PORT_INSET;
	const high = Math.min(fromSpan.to, toSpan.to) - PORT_INSET;
	const fromPort = ports.get(fromSlot(route));
	const toPort = ports.get(toSlot(route));
	if (low > high || fromPort === undefined || toPort === undefined) {
		return;
	}
	const snapped = Math.min(Math.max((fromPort.along + toPort.along) / 2, low), high);
	ports.set(fromSlot(route), { along: snapped });
	ports.set(toSlot(route), { along: snapped });
}

/**
 * Ports fan out on a fixed pitch, so two neighbouring cards almost never
 * produce ports that happen to line up — a straightness test on endpoints would
 * simply never fire. Aligned neighbours get pulled into line instead: both ends
 * move to the mean of their allocated positions, clamped into the overlap of
 * the two faces.
 * @param routes Every planned route.
 * @param ports Every allocated port, updated in place.
 */
function snapNeighbours(routes: readonly Route[], ports: Map<string, Port>): void {
	for (const route of routes) {
		if (snappable(route)) {
			snapRoute(route, ports);
		}
	}
}

/**
 * The corners a route turns, given a coordinate for each gap it travels.
 * @param route The route.
 * @param fromPort Where it leaves.
 * @param toPort Where it arrives.
 * @param trackOf The coordinate of the route's run through its n-th gap.
 * @returns The waypoints, ends included.
 */
function waypoints(
	route: Route,
	fromPort: Point,
	toPort: Point,
	trackOf: (index: number) => number,
): Point[] {
	const points: Point[] = [fromPort];
	let x = fromPort.x;
	let y = fromPort.y;
	route.channels.forEach((channel, index) => {
		if (channel.kind === "corridor") {
			x = trackOf(index);
		} else {
			y = trackOf(index);
		}
		points.push({ x, y });
	});
	points.push(sideAxis(route.toSide) === "y" ? { x, y: toPort.y } : { x: toPort.x, y });
	points.push(toPort);
	return points;
}

/**
 * One run's direction, start and nesting key.
 *
 * The nesting key makes runs that start together — a stem's branches leaving
 * one shared port — come out nested instead of braided: the run travelling
 * farther takes the track on the far side from where its exit turns off, so a
 * short branch's turn is never crossed by a long sibling passing over it.
 * @param channel The gap the run travels.
 * @param here Where the run starts.
 * @param next Where it turns off.
 * @param after Where it goes after that.
 * @returns The run.
 */
function runOf(channel: Channel, here: Point, next: Point, after: Point): Run {
	if (channel.kind === "corridor") {
		const length = Math.abs(next.y - here.y);
		return {
			heading: Math.sign(next.y - here.y),
			at: here.y,
			nest: after.x > next.x ? -length : length,
		};
	}
	const length = Math.abs(next.x - here.x);
	return {
		heading: Math.sign(next.x - here.x),
		at: here.x,
		nest: after.y > next.y ? -length : length,
	};
}

/**
 * A dry run of the route over gap centres. Only the ordering reads these, so
 * the centre is close enough — the real track offsets shift a run by less than
 * a pitch.
 * @param route The route.
 * @param from Where it leaves.
 * @param to Where it arrives.
 * @param grid The gaps of the layout.
 * @returns One run per gap the route travels.
 */
function approximateRuns(route: Route, from: Point, to: Point, grid: LayoutGrid): Run[] {
	const points = waypoints(route, from, to, (index) => {
		const channel = route.channels[index];
		return channel === undefined ? 0 : channelSpan(grid, channel).centre;
	});
	return route.channels.map((channel, index) =>
		runOf(channel, points[index + 1] ?? from, points[index + 2] ?? to, points[index + 3] ?? to),
	);
}

/** One route's claim on one gap. */
interface TrackDemand extends Run {
	/** The key the allocated track is recorded under. */
	readonly key: string;
	/** Document order, the last tiebreak. */
	readonly order: number;
}

/**
 * Every claim on every gap, from a dry run of each route.
 * @param routes Every planned route.
 * @param ports Every allocated port.
 * @param grid The gaps of the layout.
 * @returns Each gap's claims, keyed by gap.
 */
function trackDemands(
	routes: readonly Route[],
	ports: ReadonlyMap<string, Port>,
	grid: LayoutGrid,
): Map<string, { span: ChannelSpan; demands: TrackDemand[] }> {
	const byChannel = new Map<string, { span: ChannelSpan; demands: TrackDemand[] }>();
	for (const route of routes) {
		const from = resolvedPort(ports, fromSlot(route), route.from.box, route.fromSide);
		const to = resolvedPort(ports, toSlot(route), route.to.box, route.toSide);
		const runs = approximateRuns(route, from, to, grid);
		route.channels.forEach((channel, index) => {
			const run = runs[index];
			if (run === undefined) {
				return;
			}
			const key = `${channel.kind} ${channel.index}`;
			const entry = byChannel.get(key) ?? { span: channelSpan(grid, channel), demands: [] };
			entry.demands.push({ ...run, key: `${route.edge.id}#${index}`, order: route.order });
			byChannel.set(key, entry);
		});
	}
	return byChannel;
}

/**
 * Every run through a gap gets its own track. Traffic in one gap is spread
 * around its centre, ordered by heading first — outbound before returning —
 * which is what keeps a bidirectional pair, and the labels riding each half,
 * apart.
 * @param routes Every planned route.
 * @param ports Every allocated port.
 * @param grid The gaps of the layout.
 * @returns Each run's track coordinate, keyed by edge id and channel index.
 */
function allocateTracks(
	routes: readonly Route[],
	ports: ReadonlyMap<string, Port>,
	grid: LayoutGrid,
): Map<string, number> {
	const tracks = new Map<string, number>();
	for (const { span, demands } of trackDemands(routes, ports, grid).values()) {
		const ordered = demands.toSorted(
			(a, b) => b.heading - a.heading || a.at - b.at || a.nest - b.nest || a.order - b.order,
		);
		const positions = spread(span.centre, span.room, ordered.length, TRACK_PITCH_MAX);
		ordered.forEach((demand, index) => {
			tracks.set(demand.key, positions[index] ?? span.centre);
		});
	}
	return tracks;
}

export {
	type Port,
	sideAxis,
	fromSlot,
	toSlot,
	resolvedPort,
	allocatePorts,
	snapNeighbours,
	allocateTracks,
	waypoints,
};
