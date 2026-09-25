// The track router (TASK-349): every relationship drawn on tracks it owns.
//
// A block's placement put cards, label boxes and frame title rows on ranks,
// and said where each relationship passes the ranks between its ends. Here the ranks
// become bands and the space between two bands a channel. A relationship is a
// chain of stations (`chains.ts`); between two stations it leaves the upper one
// straight down, runs across on a track of the channel, and enters the lower
// one straight down (`channels.ts`). Each channel is made as tall as its
// tracks need, so lanes keep one spacing and never squeeze, and every label
// sits on its own line by construction. One pass, no search.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import {
	APPROACH_STRAIGHT,
	BEND_RADIUS,
	CONTAINER_INSET,
} from "@/transformers/semantic-renderer/config";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	LANE,
	chainOf,
	pullToPorts,
	straightenIntoContainers,
	straightenLanes,
	type Station,
	type Chain,
} from "@/transformers/semantic-renderer/lib/track/chains";
import {
	assignPorts,
	assignTracks,
	bundleTrunks,
	type Net,
} from "@/transformers/semantic-renderer/lib/track/channels";
import { settleLabels, slideLabels } from "@/transformers/semantic-renderer/lib/track/labels";
import { Scene, centreX } from "@/transformers/semantic-renderer/lib/track/scene";
import { Containers } from "@/transformers/semantic-renderer/lib/track/containers";
import { closeJogs } from "@/transformers/semantic-renderer/lib/track/jogs";

/** From the band above to the first track: room for the bend off a face. */
const TRACK_TOP = 2 * BEND_RADIUS;
/**
 * From the band above to the first track when a line on that track rises
 * into it: room for the bend and an arrowhead's straight approach.
 */
const TRACK_TOP_RISING = BEND_RADIUS + APPROACH_STRAIGHT;
/** From the last track to the band below: room for the bend and a straight arrow approach. */
const TRACK_BOTTOM = APPROACH_STRAIGHT + 2 * BEND_RADIUS;
/** The height of a channel no line turns in: room for an arrowhead's straight approach and air. */
const EMPTY_CHANNEL = 24;
/** Room between a container's bottom edge and the band below it. */
const BELOW_CONTAINER = 12;
/** Space kept around the drawing. */
const PAGE_MARGIN = 24;

/** A relationship's nets, top to bottom, and whether it runs upward. */
interface Routed {
	readonly nets: readonly Net[];
	readonly upward: boolean;
}

/** One line a scene is routed for: a relationship, or the part of one a block draws. */
interface SceneLine {
	readonly id: string;
	readonly order: number;
	/** What must match for two lines to share a trunk: kind and standing. */
	readonly kind: string;
	/** Its placed ends, label and polyline. */
	readonly placed: ElkExtendedEdge;
	/**
	 * The wall it runs to from its source, in the channel under the source,
	 * when it leaves its block sideways; its target is then that wall.
	 */
	readonly wall?: "left" | "right";
	/**
	 * The wall it comes from, when it enters its block sideways: its source
	 * is then a stub on the band above its first station, and it runs in from
	 * the wall along the channel under that band instead.
	 */
	readonly enters?: "left" | "right";
}

/**
 * The kind two lines must share to share a trunk, read off a placed
 * relationship: its kind and its standing.
 * @param edge The placed relationship.
 * @returns The kind.
 */
function trunkKind(edge: ElkExtendedEdge): string {
	const options = edge.layoutOptions ?? {};
	const kind = options["archboard.relationship.kind"] ?? "";
	return `${kind}|${options["archboard.relationship.standing"] ?? "unchanged"}`;
}

/** How far outside the scene a line to a wall aims while its ports and tracks are settled. */
const WALL_REACH = 4 * LANE;

/**
 * A line to a wall: from its source down into the channel under it, and
 * along that channel's track to the wall.
 * @param scene The scene.
 * @param line The line.
 * @returns Its one net.
 */
function wallNet(scene: Scene, line: SceneLine): Net {
	const item = scene.endpoint(line.placed.sources[0]!);
	const x = wallX(scene, line.wall!);
	const top = { kind: "card" as const, band: item.band, item, x: centreX(item) };
	return {
		edge: line.id,
		order: line.order,
		channel: item.band,
		kind: line.kind,
		top,
		bottom: { kind: "lane", band: item.band + 1, x },
		topX: top.x,
		bottomX: x,
		track: 0,
		wall: "bottom",
	};
}

/**
 * Where a line to or from a wall aims while ports and tracks are settled:
 * a little outside the scene on that side.
 * @param scene The scene.
 * @param side The wall.
 * @returns The x.
 */
function wallX(scene: Scene, side: "left" | "right"): number {
	const boxes = [...scene.cards.values(), ...scene.labels.values()].map(({ box }) => box);
	return side === "left"
		? Math.min(...boxes.map((box) => box.x)) - WALL_REACH
		: Math.max(...boxes.map((box) => box.x + box.width)) + WALL_REACH;
}

/**
 * A chain's nets: one for each pair of stations on neighbouring bands. A net
 * running upward never shares a trunk with one running down, since a trunk
 * carries its lines one way.
 * @param line The line.
 * @param chain Its stations.
 * @returns Its nets, top to bottom.
 */
function netsOf(line: SceneLine, chain: Chain): Net[] {
	const kind = chain.upward ? `${line.kind}|upward` : line.kind;
	return chain.stations.slice(1).map((bottom, index) => {
		const top = chain.stations[index]!;
		return {
			edge: line.id,
			order: line.order,
			channel: top.band,
			kind,
			top,
			bottom,
			topX: top.x,
			bottomX: bottom.x,
			track: 0,
		};
	});
}

/** How far apart two ends may be and still be drawn as one straight drop. */
const STRAIGHT = 0.5;

/**
 * Make every drop that is straight to within half a unit exactly straight, so
 * no line takes a sliver of a step the curve would round into a corner. The
 * end that gives way is a lane, which carries the move into the net beside
 * it, or else a card's port; a label box never moves.
 * @param nets One relationship's nets, top to bottom.
 */
function settleStraights(nets: readonly Net[]): void {
	nets.forEach((net, index) => {
		if (Math.abs(net.topX - net.bottomX) > STRAIGHT || net.topX === net.bottomX) return;
		if (net.bottom.kind === "lane") {
			net.bottom.x = net.topX;
			net.bottomX = net.topX;
			const next = nets[index + 1];
			if (next !== undefined) next.topX = net.topX;
		} else if (net.bottom.kind === "card") net.bottomX = net.topX;
		else net.topX = net.bottomX;
	});
}

/**
 * How far below its band a channel's first track runs: below the containers
 * that end on the band, and far enough for an arrowhead's approach when a
 * line on it rises into the band.
 * @param closing How far below the band the containers ending there reach.
 * @param rising Whether a line on the first track turns and rises into the band.
 * @returns The distance.
 */
function firstTrack(closing: number, rising: boolean): number {
	return Math.max(closing + TRACK_TOP, rising ? TRACK_TOP_RISING : 0);
}

/**
 * How tall a channel is for the tracks it holds, below the containers that
 * end above it.
 * @param tracks Its track count.
 * @param closing How far below its band the containers ending there reach.
 * @param rising Whether a line on its first track turns and rises into the band above.
 * @returns Its height.
 */
function channelHeight(tracks: number, closing = 0, rising = false): number {
	return tracks === 0
		? Math.max(EMPTY_CHANNEL, closing + BELOW_CONTAINER)
		: firstTrack(closing, rising) + (tracks - 1) * LANE + TRACK_BOTTOM;
}

/**
 * Whether a line on a channel's first track turns there and rises into the
 * band above, so its arrowhead lands on that band's face.
 * @param crossing The channel's nets, their tracks assigned.
 * @param rising The first net of every upward line: the one that ends on its target.
 * @returns True when the first track needs an arrowhead's room above it.
 */
function risesOnFirstTrack(crossing: readonly Net[], rising: ReadonlySet<Net>): boolean {
	return crossing.some(
		(net) => net.track === 0 && rising.has(net) && Math.abs(net.topX - net.bottomX) > STRAIGHT,
	);
}

/**
 * Lay out every band and channel again, from the tracks each channel needs.
 * A channel no line crosses below a band of titles alone keeps the room a
 * container keeps around its cards: no frame ends there, so a container's
 * cards stand as far below its title as in from its sides. A channel below
 * containers that end on its band starts its tracks below their edges.
 * @param scene The scene, whose bands get their new tops.
 * @param nets Every net, given its track in its channel.
 * @param closings How far below each band the containers ending on it reach.
 * @param rising The first net of every upward line.
 * @param margin Where the first band starts.
 */
function spaceBands(
	scene: Scene,
	nets: readonly Net[],
	closings: readonly number[],
	rising: ReadonlySet<Net>,
	margin: number,
): void {
	const held = new Set([...scene.cards.values(), ...scene.labels.values()].map(({ band }) => band));
	let top = margin;
	scene.bands.forEach((band, index) => {
		band.newTop = top;
		const crossing = nets.filter((net) => net.channel === index);
		const tracks = assignTracks(crossing);
		const closing = closings[index]!;
		const rises = risesOnFirstTrack(crossing, rising);
		band.firstTrack = firstTrack(closing, rises);
		const titled = crossing.length === 0 && !held.has(index);
		const channel = titled ? CONTAINER_INSET : channelHeight(tracks, closing, rises);
		top += band.bottom - band.top + channel;
	});
}

/**
 * Where a net leaves its upper station, after spacing.
 * @param scene The spaced scene.
 * @param net The net.
 * @param left How far every x moves.
 * @returns The height it leaves at.
 */
function leavesAt(scene: Scene, net: Net, left: number): number {
	const band = scene.bands[net.top.band]!;
	if (net.top.item === undefined) return band.newTop + band.bottom - band.top;
	const box = scene.moved(net.top.item, left);
	return box.y + box.height;
}

/**
 * Where a net enters its lower station, after spacing.
 * @param scene The spaced scene.
 * @param net The net.
 * @param left How far every x moves.
 * @returns The height it enters at.
 */
function entersAt(scene: Scene, net: Net, left: number): number {
	if (net.bottom.item === undefined) return scene.bands[net.bottom.band]!.newTop;
	return scene.moved(net.bottom.item, left).y;
}

/**
 * The points of one relationship, from its upper end to its lower end.
 * @param scene The spaced scene.
 * @param nets Its nets, top to bottom.
 * @param left How far every x moves.
 * @returns Its waypoints.
 */
function pointsOf(scene: Scene, nets: readonly Net[], left: number): Point[] {
	return nets.flatMap((net) => {
		const upper = scene.bands[net.top.band]!;
		const from = { x: net.topX + left, y: leavesAt(scene, net, left) };
		const track = upper.newTop + (upper.bottom - upper.top) + upper.firstTrack + net.track * LANE;
		if (net.wall === "bottom")
			return [from, { x: from.x, y: track }, { x: net.bottomX + left, y: track }];
		const to = { x: net.bottomX + left, y: entersAt(scene, net, left) };
		if (net.wall === "top") return [{ x: from.x, y: track }, { x: to.x, y: track }, to];
		if (Math.abs(from.x - to.x) <= STRAIGHT) return [from, to];
		return [from, { x: from.x, y: track }, { x: to.x, y: track }, to];
	});
}

/**
 * Move every net's ends that stand on a lane to where the lane now stands.
 * @param nets Every net.
 */
function followLanes(nets: readonly Net[]): void {
	for (const net of nets) {
		if (net.top.kind === "lane") net.topX = net.top.x;
		if (net.bottom.kind === "lane") net.bottomX = net.bottom.x;
	}
}

/**
 * The port each lane beside a card wants: where the net between them meets the card.
 * @param nets Every net, its ports placed.
 * @returns The port x, by lane.
 */
function portsOf(nets: readonly Net[]): Map<Station, number> {
	const ports = new Map<Station, number>();
	for (const net of nets) {
		if (net.top.kind === "card" && net.bottom.kind === "lane") ports.set(net.bottom, net.topX);
		if (net.bottom.kind === "card" && net.top.kind === "lane") ports.set(net.top, net.bottomX);
	}
	return ports;
}

/**
 * The lane that feeds the trunk a net joins, and the column its line comes
 * from: the lane above a shared lower face, or below a shared upper one.
 * @param own The line's nets, top to bottom.
 * @param index The net's place.
 * @returns The lane, the column if the line has one there, and which face is shared.
 */
function feedOf(
	own: readonly Net[],
	index: number,
): { lane: Station; x: number | undefined; below: boolean } | undefined {
	const net = own[index]!;
	if (net.trunk === undefined) return undefined;
	if (net.trunk.side === "bottom") return { lane: net.top, x: own[index - 1]?.topX, below: true };
	return { lane: net.bottom, x: own[index + 1]?.bottomX, below: false };
}

/**
 * Where a lane feeding a trunk would stand to meet its line's column there:
 * the column the line comes from, when the trunk's track covers it anyway.
 * @param own The line's nets, top to bottom.
 * @param index The place of the net that joins the trunk.
 * @returns The lane and the column, or nothing.
 */
function trunkFeed(own: readonly Net[], index: number): { lane: Station; x: number } | undefined {
	const feed = feedOf(own, index);
	if (feed?.lane.kind !== "lane" || feed.x === undefined) return undefined;
	const { lane, x, below } = feed;
	return Math.abs(x - lane.x) >= STRAIGHT && covers(own[index]!, below, x)
		? { lane, x }
		: undefined;
}

/**
 * Whether a trunk's track already spans an x: between its shared port and
 * its other members' far ends.
 * @param net A net of the trunk.
 * @param below Whether the trunk shares the lower face.
 * @param x The x.
 * @returns True when the track covers it.
 */
function covers(net: Net, below: boolean, x: number): boolean {
	const others = net.trunk!.nets.filter((other) => other !== net);
	const pins = below
		? [net.bottomX, ...others.map(({ topX }) => topX)]
		: [net.topX, ...others.map(({ bottomX }) => bottomX)];
	return x >= Math.min(...pins) && x <= Math.max(...pins);
}

/**
 * Whether a lane may stand at an x: a lane clear of every card, label, title
 * row and other lane on its band, in the same frames.
 * @param scene The scene.
 * @param nets Every net.
 * @param lane The lane.
 * @param x The x.
 * @returns True when it is free.
 */
function laneFree(scene: Scene, nets: readonly Net[], lane: Station, x: number): boolean {
	const items = [...scene.cards.values(), ...scene.labels.values(), ...scene.titles.values()]
		.filter((item) => item.band === lane.band)
		.map(({ box }) => [box.x - LANE, box.x + box.width + LANE] as const);
	const lanes = nets
		.flatMap((other) => [other.top, other.bottom])
		.filter((station) => station.kind === "lane" && station.band === lane.band && station !== lane)
		.map((station) => [station.x - LANE, station.x + LANE] as const);
	const clear = [...items, ...lanes].every(([low, high]) => x <= low || x >= high);
	return clear && scene.framesAt(lane.band, x) === scene.framesAt(lane.band, lane.x);
}

/**
 * Move each lane that feeds a trunk onto the column its line comes from, when
 * the trunk's track covers that column anyway and it is free: the track then
 * carries the line across, and the line does not cross, one channel earlier,
 * the lines the trunk crosses.
 * @param scene The scene.
 * @param routes Every relationship's nets.
 * @param nets Every net.
 * @returns Whether any lane moved.
 */
function pullIntoTrunks(scene: Scene, routes: readonly Routed[], nets: readonly Net[]): boolean {
	let moved = false;
	for (const { nets: own } of routes)
		own.forEach((_, index) => {
			// One at a time, so a lane moved first is where the next one must keep clear of.
			const feed = trunkFeed(own, index);
			if (feed === undefined || !laneFree(scene, nets, feed.lane, feed.x)) return;
			feed.lane.x = feed.x;
			moved = true;
		});
	return moved;
}

/**
 * Pull lanes onto the ports and trunks their lines meet, and settle the
 * labels and ports that follow them.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param routes Every relationship's nets.
 * @param nets Every net.
 */
function pullOntoPorts(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly Routed[],
	nets: readonly Net[],
): void {
	if (pullToPorts(scene, chains, portsOf(nets))) {
		followLanes(nets);
		settleLabels(scene, nets);
		assignPorts(nets);
	}
	if (pullIntoTrunks(scene, routes, nets)) followLanes(nets);
}

/**
 * Route lines through a banded scene, each on tracks of its own, and space
 * the bands for the tracks each channel holds.
 * @param scene The scene, whose bands get their new tops.
 * @param lines The lines, each between two of its items.
 * @param margin How far every x moves.
 * @param top Where the first band starts.
 * @returns Each line's points, from its source to its target.
 */
function routeScene(
	scene: Scene,
	lines: readonly SceneLine[],
	margin: number,
	top = margin,
): Map<string, Point[]> {
	const inner = lines.filter(({ wall }) => wall === undefined);
	const chains = new Map(inner.map((line) => [line.id, chainOf(scene, line.placed)]));
	straightenLanes(scene, [...chains.values()]);
	const routed = new Map<string, Routed>([
		...inner.map((line): [string, Routed] => {
			const chain = chains.get(line.id)!;
			return [line.id, { nets: netsOf(line, chain), upward: chain.upward }];
		}),
		...lines
			.filter(({ wall }) => wall !== undefined)
			.map((line): [string, Routed] => [line.id, { nets: [wallNet(scene, line)], upward: false }]),
	]);
	const nets = [...routed.values()].flatMap((route) => route.nets);
	bundleTrunks(nets);
	assignPorts(nets);
	slideLabels(scene, nets);
	if (straightenIntoContainers(scene, [...chains.values()])) followLanes(nets);
	assignPorts(nets);
	pullOntoPorts(scene, [...chains.values()], [...routed.values()], nets);
	closeJogs(
		scene,
		[...chains.values()],
		[...routed.values()].map((route) => route.nets),
	);
	for (const route of routed.values()) settleStraights(route.nets);
	for (const line of lines.filter(({ enters }) => enters !== undefined)) {
		const first = routed.get(line.id)!.nets[0]!;
		first.wall = "top";
		first.topX = wallX(scene, line.enters!);
	}
	const edges = new Map(lines.map((line) => [line.id, line.placed]));
	const rising = new Set(
		[...routed.values()].filter(({ upward }) => upward).map(({ nets: [first] }) => first!),
	);
	spaceBands(scene, nets, new Containers(scene, edges).closings(), rising, top);
	return new Map(
		[...routed].map(([id, route]) => {
			const points = pointsOf(scene, route.nets, margin);
			return [id, route.upward ? points.toReversed() : points];
		}),
	);
}

export { EMPTY_CHANNEL, PAGE_MARGIN, TRACK_TOP, channelHeight, routeScene, trunkKind };
