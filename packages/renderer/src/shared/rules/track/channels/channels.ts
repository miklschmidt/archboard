// Ports, trunks and tracks (TASK-349). A net is one relationship's run between
// two stations on neighbouring bands: it leaves the upper station straight
// down, crosses the channel on a track, and enters the lower station straight
// down.
//
// Relationships of one kind (and one comparison standing) that leave one card
// face into the same channel share a port and a trunk: one line off the card,
// one track, and a branch down to each end. Likewise those that enter one
// card face; when they also share the card they end on, the trunk is one line
// from face to face. A trunk never joins several sources to several ends, so a
// reader can always tell who talks to whom; the painter marks every split.
//
// Cards spread their ports along a face, each as close to the other end as
// spacing allows, but for a line held to one point of its card, as an answer
// out of a flowchart's decision is (`points.ts`), which stands there and
// shares a trunk only with lines held to the same point; each channel's units — a trunk, or a lone net — get tracks
// as tracks.ts stacks them.
import type { Box } from "#shared/rules/geometry.ts";
import { LANE, reachOf, type Station } from "#shared/rules/track/routes/chains.ts";
import { cardFace, type Item } from "#shared/rules/track/scene/scene.ts";
import { stackUnits, type Unit } from "#shared/rules/track/channels/tracks.ts";

/** How far a port keeps from a card's corner. */
const PORT_MARGIN = 20;

/** Relationships that share a port and a track at one card face. */
interface Trunk {
	/** Which end they share: the upper station's bottom face, or the lower station's top face. */
	readonly side: "top" | "bottom";
	readonly nets: Net[];
	/** Whether they share the other end's card too, and so run as one line from face to face. */
	readonly whole: boolean;
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
interface NetUnit extends Unit {
	readonly nets: readonly Net[];
}

/**
 * Group nets that share a card face, a channel, a kind and a standing into
 * trunks: first those leaving a face, then, among the rest, those entering
 * one. A net that can run straight between its card and its other end keeps
 * its own port, unless the trunk would cross it: two straight lines read more
 * plainly than a trunk they would have to jog to.
 * @param nets Every net.
 */
function bundleTrunks(nets: readonly Net[]): void {
	const lineEnds = endsOf(nets);
	for (const side of ["top", "bottom"] as const) {
		const groups = trunkGroups(nets, side).map((one) => withoutTwins(one, side, lineEnds));
		for (const group of groups.flatMap((one) => apart(one, nets, side))) {
			if (group.length < 2) continue;
			const other = side === "top" ? "bottom" : "top";
			const ends = new Set(
				group.map((net) => (net[other].kind === "card" ? net[other].item : net)),
			);
			const trunk = { side, nets: group, whole: ends.size === 1 };
			for (const net of group) net.trunk = trunk;
		}
	}
}

/**
 * Each line's two end items: the upper station of its first net and the lower
 * station of its last.
 * @param nets Every net.
 * @returns The two items, by relationship.
 */
function endsOf(nets: readonly Net[]): Map<string, Ends> {
	const lines = new Map<string, Net[]>();
	for (const net of nets) lines.set(net.edge, [...(lines.get(net.edge) ?? []), net]);
	return new Map(
		[...lines].map(([edge, own]) => {
			const sorted = own.toSorted((one, other) => one.channel - other.channel);
			return [edge, [sorted[0]!.top.item, sorted.at(-1)!.bottom.item] as const];
		}),
	);
}

/** A line's two end items: its first net's upper station's, and its last net's lower one's. */
type Ends = readonly [Station["item"], Station["item"]];

/**
 * Whether two end items stand for one place: the same item, or two of a
 * block's one-point ports, through which lines arrive from the same outside.
 * @param one An end item.
 * @param other Another.
 * @returns True when they are one place.
 */
function samePlace(one: Station["item"], other: Station["item"]): boolean {
	return one === other || (onePoint(one) && onePoint(other));
}

/**
 * Whether an end item is a block's one-point port.
 * @param item The item.
 * @returns True for a port.
 */
function onePoint(item: Station["item"]): boolean {
	return item !== undefined && item.box.width <= 1;
}

/**
 * Whether two nets belong to different lines between the same two places.
 * @param one A net.
 * @param other Another.
 * @param ends Each line's two end items.
 * @returns True when they are twins.
 */
function twins(one: Net, other: Net, ends: ReadonlyMap<string, Ends>): boolean {
	const [a, b] = [ends.get(one.edge)!, ends.get(other.edge)!];
	return one.edge !== other.edge && samePlace(a[0], b[0]) && samePlace(a[1], b[1]);
}

/**
 * A card face's trunk without the lines that run between the same two items
 * as another of its lines: two such lines sharing a trunk at both ends split
 * through their labels and join again, a loop. Each keeps its own port on the
 * card; a block's one-point port is shared whatever joins at it.
 * @param group The nets that would share the face's trunk.
 * @param side Which end the face is.
 * @param ends Each line's two end items.
 * @returns The group without such twins.
 */
function withoutTwins(
	group: readonly Net[],
	side: "top" | "bottom",
	ends: ReadonlyMap<string, Ends>,
): Net[] {
	if (group.length < 2 || group[0]![side].item!.box.width <= 1) return [...group];
	return group.filter((net) => !group.some((other) => twins(net, other, ends)));
}

/**
 * A face's trunk cut wherever another line from the same face comes between
 * two of its members' other ends: the trunk's track would cross that line.
 * @param group The nets that would share the face's trunk.
 * @param nets Every net.
 * @param side Which end the face is.
 * @returns The pieces, each ordered by its other ends.
 */
function apart(group: readonly Net[], nets: readonly Net[], side: "top" | "bottom"): Net[][] {
	if (group.length < 2) return [[...group]];
	const other = side === "top" ? "bottom" : "top";
	const face = group[0]![side].item;
	const foreign = nets
		.filter(
			(net) => !group.includes(net) && net[side].item === face && net.channel === group[0]!.channel,
		)
		.map((net) => net[other].x);
	const sorted = group.toSorted((one, next) => one[other].x - next[other].x);
	const pieces: Net[][] = [[sorted[0]!]];
	for (let index = 1; index < sorted.length; index += 1) {
		const [low, high] = [sorted[index - 1]![other].x, sorted[index]![other].x];
		if (foreign.some((x) => x > low && x < high)) pieces.push([]);
		pieces.at(-1)!.push(sorted[index]!);
	}
	return pieces;
}

/**
 * Whether a net can run straight down from its upper station to its lower
 * one: some x lies on both.
 * @param net The net.
 * @returns True when it can.
 */
function dropsStraight(net: Net): boolean {
	const [a, b] = reachOf(net.top);
	const [c, d] = reachOf(net.bottom);
	return Math.max(a, c) <= Math.min(b, d);
}

/**
 * The nets that share a trunk on one side of their faces.
 * @param nets Every net.
 * @param side Which end: the upper station's, or the lower station's.
 * @returns The groups.
 */
function trunkGroups(nets: readonly Net[], side: "top" | "bottom"): Net[][] {
	return sharing(nets, side).map((group) => joining(group, side));
}

/**
 * The nets not yet in a trunk that end on one card face, grouped by card,
 * channel, kind and standing, and by the point they are held to, if any:
 * lines held to different points of a decision leave it apart.
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
		const key = [net.channel, net.kind, station.at].join("|");
		byKind.set(key, [...(byKind.get(key) ?? []), net]);
		groups.set(station.item!, byKind);
	}
	return [...groups.values()].flatMap((byKind) => [...byKind.values()]);
}

/**
 * The nets on one face that join its trunk: those that cannot run straight
 * between the card and their other end, and a straight one the others reach
 * from both sides of, whose line their trunk would otherwise cross.
 * @param group The nets on one face, of one kind.
 * @param side Which end the face is.
 * @returns Those that join.
 */
function joining(group: readonly Net[], side: "top" | "bottom"): Net[] {
	const other = side === "top" ? "bottom" : "top";
	const xs = group.filter((net) => !dropsStraight(net)).map((net) => net[other].x);
	const [low, high] = [Math.min(...xs), Math.max(...xs)];
	return group.filter((net) => !dropsStraight(net) || (net[other].x > low && net[other].x < high));
}

/**
 * The stretch of a face a port may stand on, clear of its corners.
 * @param face The face's box.
 * @returns Its lowest and highest x.
 */
function portReach(face: Box): [number, number] {
	const margin = Math.min(PORT_MARGIN, face.width / 2);
	return [face.x + margin, face.x + face.width - margin];
}

/**
 * Spread the ports on one face, each as close to its other end as spacing allows.
 * @param face The face's box.
 * @param wanted Each port's preferred x, in the order the ports must keep.
 * @returns The ports' x, in the same order.
 */
function spreadPorts(face: Box, wanted: readonly number[]): number[] {
	return spreadAlong(portReach(face), wanted);
}

/**
 * Spread ports along one stretch, each as close to where it wants to stand
 * as a lane apart allows, or closer where the stretch is too short for that.
 * @param stretch The lowest and highest place a port may stand.
 * @param wanted Each port's preferred place, in the order the ports must keep.
 * @returns The ports' places, in the same order.
 */
function spreadAlong(stretch: readonly [number, number], wanted: readonly number[]): number[] {
	const [low, high] = stretch;
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
	const asked = { top: new Set<Trunk>(), bottom: new Set<Trunk>() };
	for (const net of nets) {
		for (const side of ["top", "bottom"] as const) {
			const request = requestOf(net, side, asked[side]);
			if (request === undefined) continue;
			const item = net[side].item!;
			faces.set(item, [...(faces.get(item) ?? []), request]);
		}
	}
	return faces;
}

/**
 * The trunk whose port one end of a net shares, if any: its trunk on the side
 * the trunk shares, or on both sides of a whole trunk.
 * @param net The net.
 * @param side Which end.
 * @returns The trunk, or nothing when that end has a port of its own.
 */
function sharedAt(net: Net, side: "top" | "bottom"): Trunk | undefined {
	const trunk = net.trunk;
	return trunk !== undefined && (trunk.side === side || trunk.whole) ? trunk : undefined;
}

/**
 * The port one end of a net asks for: its trunk's, the first time the trunk
 * is met, or its own.
 * @param net The net.
 * @param side Which end.
 * @param asked The trunks that have asked already on this side.
 * @returns The request, or nothing when that end is not on a card or its trunk has asked.
 */
function requestOf(net: Net, side: "top" | "bottom", asked: Set<Trunk>): PortRequest | undefined {
	if (net[side].kind !== "card") return undefined;
	const shared = sharedAt(net, side);
	if (shared === undefined) return requestFor([net], side);
	if (asked.has(shared)) return undefined;
	asked.add(shared);
	return requestFor(shared.nets, side);
}

/**
 * One port for some nets on one face, wanted over the other end nearest the
 * middle of them all: that net runs straight from the port, and every other
 * branches off the trunk at least a lane away, never close enough to hook.
 * @param members The nets sharing the port.
 * @param side Which end.
 * @returns The request.
 */
function requestFor(members: readonly Net[], side: "top" | "bottom"): PortRequest {
	const ends = members
		.toSorted((one, other) => one.order - other.order)
		.map((member) => otherEnd(member, side));
	const middle = ends.reduce((sum, x) => sum + x, 0) / ends.length;
	// Of two ends as near the middle, the one the board lists first.
	const wanted = ends.reduce((one, other) =>
		Math.abs(other - middle) < Math.abs(one - middle) - 0.01 ? other : one,
	);
	return { nets: members, side, wanted, order: Math.min(...members.map(({ order }) => order)) };
}

/**
 * Where ports that want to stand beyond one end of a face ask to stand
 * instead: two or more such lines turn onto the face anyway, and packed a
 * lane apart at its corner their arrowheads read as one line forking. They
 * spread evenly over the stretch from that end to the face's middle, or to
 * the nearest port that wants a place on the face where that is nearer the
 * end: the outermost at the end, none on the stretch's inner end.
 * @param face The face's box.
 * @param wanted Each port's preferred x, lowest first.
 * @returns The x each asks for.
 */
function fanned(face: Box, wanted: readonly number[]): number[] {
	const [low, high] = portReach(face);
	const middle = face.x + face.width / 2;
	const within = wanted.filter((x) => x >= low && x <= high);
	const asked = [...wanted];
	const above = wanted.flatMap((x, index) => (x > high ? [index] : []));
	spreadOver(asked, above, Math.max(middle, ...within), high);
	const below = wanted.flatMap((x, index) => (x < low ? [index] : []));
	spreadOver(asked, below.toReversed(), Math.min(middle, ...within), low);
	return asked;
}

/**
 * Spread two or more ports evenly over a stretch of a face, the last at its
 * end and none at its start; a lone port is left where it asked.
 * @param asked Every port's x on the face; the spread ones change in place.
 * @param ports The ports to spread, from the stretch's start to its end.
 * @param start Where the stretch starts.
 * @param end Where it ends: the face's end.
 */
function spreadOver(asked: number[], ports: readonly number[], start: number, end: number): void {
	if (ports.length < 2) return;
	ports.forEach((index, at) => {
		asked[index] = end - ((end - start) * (ports.length - 1 - at)) / ports.length;
	});
}

/**
 * Give the ports on one face of a card. On a top face, where the nets end
 * with their bottom (`side` names the nets' end), the lines that meet it
 * from beyond one end fan out along it ({@link fanned}); on a bottom face
 * they stay a lane apart, as fanning them there sent a line leaving a card
 * out along its container's wall. A line held to one point of the card
 * stands there, and the others spread round it.
 * @param item The card.
 * @param requests Its requests on that face.
 */
function placePorts(item: Item, requests: readonly PortRequest[]): void {
	const held = requests.filter(({ nets, side }) => nets[0]![side].at !== undefined);
	for (const { nets, side } of held)
		for (const net of nets) {
			const x = item.box.x + net[side].at!;
			if (side === "top") net.topX = x;
			else net.bottomX = x;
		}
	const ordered = requests
		.filter((request) => !held.includes(request))
		.toSorted((one, other) => one.wanted - other.wanted || one.order - other.order);
	const wanted = ordered.map((request) => request.wanted);
	const face = cardFace(item);
	const ports = spreadPorts(face, ordered[0]?.side === "bottom" ? fanned(face, wanted) : wanted);
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
function unitsOf(nets: readonly Net[]): NetUnit[] {
	const groups = new Map<Trunk | Net, readonly Net[]>();
	for (const net of nets) groups.set(net.trunk ?? net, net.trunk?.nets ?? [net]);
	return [...groups.values()].map(unitOf).filter((unit) => unit.high - unit.low > 0.5);
}

/**
 * One trunk's or lone net's pins and run.
 * @param members Its nets.
 * @returns The unit.
 */
function unitOf(members: readonly Net[]): NetUnit {
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
	onePoint,
	portReach,
	sharedAt,
	spreadAlong,
	spreadPorts,
	type Net,
};
