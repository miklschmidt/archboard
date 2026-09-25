// Ports, trunks and tracks (TASK-349). A net is one relationship's run between
// two stations on neighbouring bands: it leaves the upper station straight
// down, crosses the channel on a track, and enters the lower station straight
// down.
//
// Relationships of one kind (and one comparison standing) that leave one card
// face into the same channel share a port and a trunk: one line off the card,
// one track, and a branch down to each end. Likewise those that enter one
// card face. A trunk never joins several sources to several ends, so a
// reader can always tell who talks to whom; the painter marks every split.
//
// Cards spread their ports along a face, each as close to the other end as
// spacing allows; each channel's units — a trunk, or a lone net — get tracks
// in the order that crosses least, each on the highest track below the
// overlapping units above it.
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { LANE, type Station } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** How far a port keeps from a card's corner. */
const PORT_MARGIN = 20;
/** The cost of an order that runs two lines down one column: never taken when avoidable. */
const STACKED = 100;

/** Relationships that share a port and a track at one card face. */
interface Trunk {
	/** Which end they share: the upper station's bottom face, or the lower station's top face. */
	readonly side: "top" | "bottom";
	readonly nets: Net[];
}

/** One relationship's run between two stations on neighbouring bands. */
interface Net {
	readonly edge: string;
	readonly order: number;
	readonly channel: number;
	/** What must match for two nets to share a trunk: kind and standing. */
	readonly kind: string;
	readonly top: Station;
	readonly bottom: Station;
	/** Where it leaves the upper station and enters the lower one. */
	topX: number;
	bottomX: number;
	track: number;
	trunk?: Trunk;
	/**
	 * Which end is its block's wall, reached on its track with no line above
	 * or below it: the bottom for a line leaving by a wall, the top for one
	 * entering by one.
	 */
	wall?: "top" | "bottom";
}

/** One port a face must give: a trunk's, or a lone net's end. */
interface PortRequest {
	readonly nets: readonly Net[];
	readonly side: "top" | "bottom";
	readonly wanted: number;
	readonly order: number;
}

/** What a channel assigns tracks to: a trunk, or a lone net that turns. */
interface Unit {
	readonly nets: readonly Net[];
	readonly tops: readonly number[];
	readonly bottoms: readonly number[];
	readonly low: number;
	readonly high: number;
	readonly order: number;
}

/**
 * Group nets that share a card face, a channel, a kind and a standing into
 * trunks: first those leaving a face, then, among the rest, those entering one.
 * @param nets Every net.
 */
function bundleTrunks(nets: readonly Net[]): void {
	for (const side of ["top", "bottom"] as const) {
		for (const group of sharing(nets, side)) {
			if (group.length < 2) continue;
			const trunk = { side, nets: group };
			for (const net of group) net.trunk = trunk;
		}
	}
}

/**
 * The nets not yet in a trunk that end on one card face, grouped by card,
 * channel, kind and standing.
 * @param nets Every net.
 * @param side Which end: the upper station's, or the lower station's.
 * @returns The groups.
 */
function sharing(nets: readonly Net[], side: "top" | "bottom"): Net[][] {
	const groups = new Map<Item, Map<string, Net[]>>();
	for (const net of nets) {
		const station = net[side];
		if (net.trunk !== undefined || station.kind !== "card") continue;
		const byKind = groups.get(station.item!) ?? new Map<string, Net[]>();
		const key = `${net.channel}|${net.kind}`;
		byKind.set(key, [...(byKind.get(key) ?? []), net]);
		groups.set(station.item!, byKind);
	}
	return [...groups.values()].flatMap((byKind) => [...byKind.values()]);
}

/**
 * Spread the ports on one face, each as close to its other end as spacing allows.
 * @param face The face's box.
 * @param wanted Each port's preferred x, in the order the ports must keep.
 * @returns The ports' x, in the same order.
 */
function spreadPorts(face: Box, wanted: readonly number[]): number[] {
	const low = face.x + Math.min(PORT_MARGIN, face.width / 2);
	const high = face.x + face.width - Math.min(PORT_MARGIN, face.width / 2);
	const count = wanted.length;
	const gap = count > 1 ? Math.min(LANE, (high - low) / (count - 1)) : 0;
	const ports = wanted.map((x) => Math.min(high, Math.max(low, x)));
	for (let index = 1; index < count; index += 1)
		ports[index] = Math.max(ports[index]!, ports[index - 1]! + gap);
	if (count > 0 && ports[count - 1]! > high) {
		ports[count - 1] = high;
		for (let index = count - 2; index >= 0; index -= 1)
			ports[index] = Math.min(ports[index]!, ports[index + 1]! - gap);
	}
	return ports;
}

/**
 * Where a net's end on one side would like its port: under or over its other end.
 * @param net The net.
 * @param side The side its port is on.
 * @returns The x of its other end.
 */
function otherEnd(net: Net, side: "top" | "bottom"): number {
	return side === "top" ? net.bottomX : net.topX;
}

/**
 * Every port request, by the card it is made on: one per trunk sharing that
 * face, one per lone net ending there.
 * @param nets Every net.
 * @returns The requests, keyed by card.
 */
function portRequests(nets: readonly Net[]): Map<Item, PortRequest[]> {
	const faces = new Map<Item, PortRequest[]>();
	const asked = new Set<Trunk>();
	for (const net of nets) {
		for (const side of ["top", "bottom"] as const) {
			const request = requestOf(net, side, asked);
			if (request === undefined) continue;
			const item = net[side].item!;
			faces.set(item, [...(faces.get(item) ?? []), request]);
		}
	}
	return faces;
}

/**
 * The port one end of a net asks for: its trunk's, the first time the trunk
 * is met, or its own.
 * @param net The net.
 * @param side Which end.
 * @param asked The trunks that have asked already.
 * @returns The request, or nothing when that end is not on a card or its trunk has asked.
 */
function requestOf(net: Net, side: "top" | "bottom", asked: Set<Trunk>): PortRequest | undefined {
	if (net[side].kind !== "card") return undefined;
	const shared = net.trunk?.side === side ? net.trunk : undefined;
	if (shared === undefined) return requestFor([net], side);
	if (asked.has(shared)) return undefined;
	asked.add(shared);
	return requestFor(shared.nets, side);
}

/**
 * One port for some nets on one face, wanted under the middle of their other ends.
 * @param members The nets sharing the port.
 * @param side Which end.
 * @returns The request.
 */
function requestFor(members: readonly Net[], side: "top" | "bottom"): PortRequest {
	const wanted = members.reduce((sum, member) => sum + otherEnd(member, side), 0) / members.length;
	return { nets: members, side, wanted, order: Math.min(...members.map(({ order }) => order)) };
}

/**
 * Give the ports on one face of a card.
 * @param item The card.
 * @param requests Its requests on that face.
 */
function placePorts(item: Item, requests: readonly PortRequest[]): void {
	const ordered = requests.toSorted(
		(one, other) => one.wanted - other.wanted || one.order - other.order,
	);
	const ports = spreadPorts(
		item.box,
		ordered.map(({ wanted }) => wanted),
	);
	ordered.forEach(({ nets, side }, index) => {
		for (const net of nets) {
			if (side === "top") net.topX = ports[index]!;
			else net.bottomX = ports[index]!;
		}
	});
}

/**
 * Give every net its x at both ends: cards spread their ports, labels and lanes
 * keep their x. Twice, so a port can follow the other end's port.
 * @param nets Every net.
 */
function assignPorts(nets: readonly Net[]): void {
	for (let pass = 0; pass < 2; pass += 1) {
		for (const [item, requests] of portRequests(nets)) {
			placePorts(
				item,
				requests.filter(({ side }) => side === "top"),
			);
			placePorts(
				item,
				requests.filter(({ side }) => side === "bottom"),
			);
		}
	}
}

/**
 * The units of one channel that need a track: trunks, and lone nets that turn.
 * @param nets The channel's nets.
 * @returns The units that turn.
 */
function unitsOf(nets: readonly Net[]): Unit[] {
	const groups = new Map<Trunk | Net, readonly Net[]>();
	for (const net of nets) groups.set(net.trunk ?? net, net.trunk?.nets ?? [net]);
	return [...groups.values()].map(unitOf).filter((unit) => unit.high - unit.low > 0.5);
}

/**
 * One trunk's or lone net's pins and run.
 * @param members Its nets.
 * @returns The unit.
 */
function unitOf(members: readonly Net[]): Unit {
	const tops = [...new Set(members.filter(({ wall }) => wall !== "top").map(({ topX }) => topX))];
	const bottoms = [
		...new Set(members.filter(({ wall }) => wall !== "bottom").map(({ bottomX }) => bottomX)),
	];
	const walls = members.flatMap((net) =>
		net.wall === "top" ? [net.topX] : net.wall === "bottom" ? [net.bottomX] : [],
	);
	return {
		nets: members,
		tops,
		bottoms,
		low: Math.min(...tops, ...bottoms, ...walls),
		high: Math.max(...tops, ...bottoms, ...walls),
		order: Math.min(...members.map(({ order }) => order)),
	};
}

/**
 * Whether two units' runs overlap, so they cannot share a track.
 * @param one A unit.
 * @param other Another unit.
 * @returns True when they overlap.
 */
function overlap(one: Unit, other: Unit): boolean {
	return one.low - LANE / 2 < other.high + LANE / 2 && other.low - LANE / 2 < one.high + LANE / 2;
}

/**
 * How many of some pins fall strictly inside a unit's run.
 * @param pins The pins' x.
 * @param unit The unit.
 * @returns How many would cross its track.
 */
function inside(pins: readonly number[], unit: Unit): number {
	return pins.filter((x) => x > unit.low && x < unit.high).length;
}

/**
 * How many crossings one unit above another costs; a lower pin under an upper
 * one would run two lines down one column, which is never allowed.
 * @param above The unit on the higher track.
 * @param below The unit on the lower track.
 * @returns The cost.
 */
function costAbove(above: Unit, below: Unit): number {
	const stacked = below.tops.some((top) =>
		above.bottoms.some((bottom) => Math.abs(top - bottom) < LANE / 2),
	);
	return stacked ? STACKED : inside(below.tops, above) + inside(above.bottoms, below);
}

/**
 * How much a unit would rather be above the units it overlaps than below them.
 * @param unit The unit.
 * @param units Every turning unit in its channel.
 * @returns The balance of its preferences.
 */
function preferenceOf(unit: Unit, units: readonly Unit[]): number {
	return units.reduce(
		(sum, other) =>
			other === unit || !overlap(unit, other)
				? sum
				: sum + Math.sign(costAbove(other, unit) - costAbove(unit, other)),
		0,
	);
}

/**
 * Whether one unit must be above another: below it, the other would run a
 * line down the column of one of its own.
 * @param above The unit that would be higher.
 * @param below The unit that would be lower.
 * @returns True when the other order would stack two lines in one column.
 */
function mustBeAbove(above: Unit, below: Unit): boolean {
	return (
		overlap(above, below) && costAbove(below, above) >= STACKED && costAbove(above, below) < STACKED
	);
}

/**
 * The units in their preferred order, except that no unit is placed before
 * a unit that must be above it.
 * @param preferred The units, most wanting to be high first.
 * @returns The order to give tracks in.
 */
function keepingStacks(preferred: readonly Unit[]): Unit[] {
	const waiting = [...preferred];
	const ordered: Unit[] = [];
	while (waiting.length > 0) {
		const ready = waiting.findIndex(
			(unit) => !waiting.some((other) => other !== unit && mustBeAbove(other, unit)),
		);
		ordered.push(...waiting.splice(Math.max(ready, 0), 1));
	}
	return ordered;
}

/**
 * Stack a channel's units on tracks: the order that crosses least, each unit
 * on the highest track below every overlapping unit above it.
 * @param units The units that turn.
 * @returns Each unit's track.
 */
function stackUnits(units: readonly Unit[]): Map<Unit, number> {
	const preference = new Map(units.map((unit) => [unit, preferenceOf(unit, units)]));
	const ordered = keepingStacks(
		units.toSorted(
			(one, other) =>
				preference.get(other)! - preference.get(one)! ||
				one.low - other.low ||
				one.order - other.order,
		),
	);
	const tracks = new Map<Unit, number>();
	for (const unit of ordered) {
		const above = [...tracks].filter(([other]) => overlap(unit, other)).map(([, track]) => track);
		tracks.set(unit, above.length === 0 ? 0 : Math.max(...above) + 1);
	}
	return tracks;
}

/**
 * A unit that is no net: a run between pins that rise from its track and pins that drop from it.
 * @param tops The x of the lines that leave it upward.
 * @param bottoms The x of the lines that leave it downward.
 * @param order Its tie-break.
 * @returns The unit.
 */
function unitAcross(tops: readonly number[], bottoms: readonly number[], order: number): Unit {
	return {
		nets: [],
		tops,
		bottoms,
		low: Math.min(...tops, ...bottoms),
		high: Math.max(...tops, ...bottoms),
		order,
	};
}

/**
 * Assign the tracks of one channel: the order that crosses least, each unit on
 * the highest track below every overlapping unit above it.
 * @param nets The channel's nets.
 * @returns How many tracks the channel holds.
 */
function assignTracks(nets: readonly Net[]): number {
	const tracks = stackUnits(unitsOf(nets));
	for (const [unit, track] of tracks) for (const net of unit.nets) net.track = track;
	return tracks.size === 0 ? 0 : Math.max(...tracks.values()) + 1;
}

export {
	assignPorts,
	assignTracks,
	bundleTrunks,
	spreadPorts,
	stackUnits,
	unitAcross,
	type Net,
	type Unit,
};
