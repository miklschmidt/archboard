// Pulling a neighbour pair's two ports into line.
//
// Ports fan out on a pitch, so two neighbouring cards almost never produce
// ports that happen to line up and a straightness test on endpoints would never
// fire. An opposed single-hop pair is pulled into line instead — but never past
// the room its neighbours' words need, because a port dragged up against the
// next one puts one relationship's label across the other's wire.

import { PORT_INSET } from "@/runtime/semantic-renderer/lib/design";
import { opposedSide } from "@/runtime/semantic-renderer/lib/geometry";
import { pillReach } from "@/runtime/semantic-renderer/lib/layout/pill";
import type { Route } from "@/runtime/semantic-renderer/lib/layout/plan";
import {
	attachSpan,
	fromSlot,
	toSlot,
	type Port,
} from "@/runtime/semantic-renderer/lib/layout/tracks";

/** One port already standing on a face, and the room it asks of its neighbours. */
interface Standing {
	/** The slot it was allocated under. */
	readonly slot: string;
	/** Where along the face it stands. */
	readonly along: number;
	/** How far its neighbours must stay. */
	readonly reach: number;
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
 * Every face's ports, with the room each asks of its neighbours.
 * @param routes Every planned route.
 * @param ports Every allocated port.
 * @returns The ports standing on each face, by face.
 */
function byFace(
	routes: readonly Route[],
	ports: ReadonlyMap<string, Port>,
): Map<string, Standing[]> {
	const faces = new Map<string, Standing[]>();
	for (const route of routes) {
		const reach = pillReach(route);
		for (const [node, side, slot] of [
			[route.from.node.id, route.fromSide, fromSlot(route)] as const,
			[route.to.node.id, route.toSide, toSlot(route)] as const,
		]) {
			const along = ports.get(slot)?.along;
			if (along === undefined) {
				continue;
			}
			const face = `${node} ${side}`;
			const standing = faces.get(face) ?? [];
			standing.push({ slot, along, reach });
			faces.set(face, standing);
		}
	}
	return faces;
}

/**
 * The ports a snap has to keep clear of: everything on the two faces except the
 * route's own two slots.
 * @param faces Every face's ports.
 * @param route The route being snapped.
 * @returns The neighbours, from both faces.
 */
function neighboursOf(faces: ReadonlyMap<string, Standing[]>, route: Route): Standing[] {
	const own = new Set([fromSlot(route), toSlot(route)]);
	return [`${route.from.node.id} ${route.fromSide}`, `${route.to.node.id} ${route.toSide}`].flatMap(
		(face) => (faces.get(face) ?? []).filter((standing) => !own.has(standing.slot)),
	);
}

/**
 * Whether a position keeps every neighbour's room.
 * @param at The position.
 * @param neighbours The ports on the two faces.
 * @param reach The room this route's own label asks for.
 * @returns True when nothing stands too close.
 */
function clearOf(at: number, neighbours: readonly Standing[], reach: number): boolean {
	return neighbours.every(
		(standing) => Math.abs(at - standing.along) >= Math.max(reach, standing.reach) - 0.001,
	);
}

/**
 * Where a snapped pair may stand: as near the mean of the two ports as the
 * neighbours allow, or nowhere.
 * @param wanted The mean of the two allocated ports.
 * @param range The stretch both faces share.
 * @param range.low Its lower end.
 * @param range.high Its upper end.
 * @param neighbours The ports on the two faces.
 * @param reach The room this route's own label asks for.
 * @returns The position, or undefined when the pair cannot be pulled into line.
 */
function snapTo(
	wanted: number,
	range: { readonly low: number; readonly high: number },
	neighbours: readonly Standing[],
	reach: number,
): number | undefined {
	const candidates = [
		wanted,
		...neighbours.flatMap((standing) => {
			const room = Math.max(reach, standing.reach);
			return [standing.along - room, standing.along + room];
		}),
	];
	return candidates
		.filter((at) => at >= range.low && at <= range.high && clearOf(at, neighbours, reach))
		.toSorted((one, other) => Math.abs(one - wanted) - Math.abs(other - wanted))[0];
}

/**
 * Pull one route's two ports into line, when the overlap of the two faces has
 * room for it and no neighbour's words are in the way.
 * @param route The route.
 * @param routes Every planned route, for where its neighbours stand now.
 * @param ports Every allocated port, updated in place.
 */
function snapRoute(route: Route, routes: readonly Route[], ports: Map<string, Port>): void {
	const fromSpan = attachSpan(route.from, route.fromSide);
	const toSpan = attachSpan(route.to, route.toSide);
	const low = Math.max(fromSpan.from, toSpan.from) + PORT_INSET;
	const high = Math.min(fromSpan.to, toSpan.to) - PORT_INSET;
	const fromPort = ports.get(fromSlot(route));
	const toPort = ports.get(toSlot(route));
	if (low > high || fromPort === undefined || toPort === undefined) {
		return;
	}
	// Read the faces here rather than once for the whole pass: a snap moves two
	// ports, and the next route has to be kept clear of where they are now.
	const snapped = snapTo(
		(fromPort.along + toPort.along) / 2,
		{ low, high },
		neighboursOf(byFace(routes, ports), route),
		pillReach(route),
	);
	if (snapped === undefined) {
		return;
	}
	ports.set(fromSlot(route), { along: snapped });
	ports.set(toSlot(route), { along: snapped });
}

/**
 * Pull every snappable neighbour pair into line.
 * @param routes Every planned route.
 * @param ports Every allocated port, updated in place.
 */
function snapNeighbours(routes: readonly Route[], ports: Map<string, Port>): void {
	for (const route of routes) {
		if (snappable(route)) {
			snapRoute(route, routes, ports);
		}
	}
}

export { snapNeighbours };
