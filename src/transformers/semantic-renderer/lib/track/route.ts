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
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	LANE,
	chainOf,
	straightenIntoContainers,
	straightenLanes,
	type Chain,
} from "@/transformers/semantic-renderer/lib/track/chains";
import {
	assignPorts,
	assignTracks,
	bundleTrunks,
	type Net,
} from "@/transformers/semantic-renderer/lib/track/channels";
import { slideLabels } from "@/transformers/semantic-renderer/lib/track/labels";
import { Scene, centreX } from "@/transformers/semantic-renderer/lib/track/scene";

/** From the band above to the first track: room for the bend off a face. */
const TRACK_TOP = 2 * BEND_RADIUS;
/** From the last track to the band below: room for the bend and a straight arrow approach. */
const TRACK_BOTTOM = APPROACH_STRAIGHT + 2 * BEND_RADIUS;
/** The least height of a channel, which straight lines alone still cross. */
const MIN_CHANNEL = 32;
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
 * How tall a channel is for the tracks it holds.
 * @param tracks Its track count.
 * @returns Its height.
 */
function channelHeight(tracks: number): number {
	return tracks === 0
		? MIN_CHANNEL
		: Math.max(MIN_CHANNEL, TRACK_TOP + (tracks - 1) * LANE + TRACK_BOTTOM);
}

/**
 * Lay out every band and channel again, from the tracks each channel needs.
 * A channel no line crosses below a band of titles alone keeps the room a
 * container keeps around its cards: no frame ends there, so a container's
 * cards stand as far below its title as in from its sides.
 * @param scene The scene, whose bands get their new tops.
 * @param nets Every net, given its track in its channel.
 * @param margin Where the first band starts.
 */
function spaceBands(scene: Scene, nets: readonly Net[], margin: number): void {
	const held = new Set([...scene.cards.values(), ...scene.labels.values()].map(({ band }) => band));
	let top = margin;
	scene.bands.forEach((band, index) => {
		band.newTop = top;
		const crossing = nets.filter((net) => net.channel === index);
		const titled = crossing.length === 0 && !held.has(index);
		top +=
			band.bottom - band.top + (titled ? CONTAINER_INSET : channelHeight(assignTracks(crossing)));
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
		const track = upper.newTop + (upper.bottom - upper.top) + TRACK_TOP + net.track * LANE;
		if (net.wall === "bottom")
			return [from, { x: from.x, y: track }, { x: net.bottomX + left, y: track }];
		const to = { x: net.bottomX + left, y: entersAt(scene, net, left) };
		if (net.wall === "top") return [{ x: from.x, y: track }, { x: to.x, y: track }, to];
		if (Math.abs(from.x - to.x) <= STRAIGHT) return [from, to];
		return [from, { x: from.x, y: track }, { x: to.x, y: track }, to];
	});
}

/** A frame's box once the scene is spaced, and how deep in frames it sits. */
interface FrameShape {
	readonly id: string;
	readonly box: Box;
	readonly depth: number;
}

/** A group region's band and caption once the scene is spaced. */
interface RegionShape {
	readonly group: string;
	readonly parent: string | undefined;
	readonly box: Box;
	readonly caption: Box;
	readonly depth: number;
}

/**
 * The boxes of the items and labels inside some members: their cards and
 * title rows, and the labels of the relationships between two of them.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param inside The members.
 * @param left How far every x moves.
 * @returns The boxes.
 */
function heldBoxes(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	inside: ReadonlySet<string>,
	left: number,
): Box[] {
	return [
		...[...inside].flatMap((member) => {
			const item = scene.cards.get(member) ?? scene.titles.get(member);
			return item === undefined ? [] : [scene.moved(item, left)];
		}),
		...[...scene.labels]
			.filter(([edge]) => {
				const placed = edges.get(edge)!;
				return inside.has(placed.sources[0]!) && inside.has(placed.targets[0]!);
			})
			.map(([, item]) => scene.moved(item, left)),
	];
}

/**
 * Every frame: Graphviz's width, from its title row down to below its lowest
 * member, the labels of the relationships it holds included.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param left How far every x moves.
 * @returns The frames' shapes.
 */
function frameShapes(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	left: number,
): FrameShape[] {
	return [...scene.frames].map(([id, { node, depth, members }]) => {
		const title = scene.moved(scene.titles.get(id)!, left);
		const boxes = heldBoxes(scene, edges, new Set(members), left);
		const bottom = Math.max(title.y + title.height, ...boxes.map((box) => box.y + box.height));
		const box = { x: node.x! + left, y: title.y, width: node.width!, height: 0 };
		return { id, box: { ...box, height: bottom + CONTAINER_INSET - title.y }, depth };
	});
}

/** Room a group region keeps below its lowest member. */
const REGION_BOTTOM = 14;
/** How far a region's caption sits in from its band's left edge. */
const REGION_CAPTION_INSET = 6;

/**
 * Every group region: Graphviz's width, from its caption row down to below its
 * lowest member, the labels of the relationships it holds included.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param left How far every x moves.
 * @returns The regions' shapes.
 */
function regionShapes(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	left: number,
): RegionShape[] {
	return scene.regions.map((region) => {
		const inside = new Set(
			region.members.flatMap((id) => [id, ...(scene.frames.get(id)?.members ?? [])]),
		);
		const centred = scene.moved(region.caption, left);
		// The caption reads from the band's top-left corner, as a frame's title does.
		const caption = { ...centred, x: region.box.x + left + REGION_CAPTION_INSET };
		const boxes = heldBoxes(scene, edges, inside, left);
		const bottom = Math.max(caption.y + caption.height, ...boxes.map((box) => box.y + box.height));
		const depth =
			region.parent === undefined ? 0 : (scene.frames.get(region.parent)?.depth ?? 0) + 1;
		const box = { x: region.box.x + left, y: caption.y, width: region.box.width, height: 0 };
		return {
			group: region.group,
			parent: region.parent,
			box: { ...box, height: bottom + REGION_BOTTOM - caption.y },
			caption,
			depth,
		};
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
	for (const route of routed.values()) settleStraights(route.nets);
	for (const line of lines.filter(({ enters }) => enters !== undefined)) {
		const first = routed.get(line.id)!.nets[0]!;
		first.wall = "top";
		first.topX = wallX(scene, line.enters!);
	}
	spaceBands(scene, nets, top);
	return new Map(
		[...routed].map(([id, route]) => {
			const points = pointsOf(scene, route.nets, margin);
			return [id, route.upward ? points.toReversed() : points];
		}),
	);
}

export {
	PAGE_MARGIN,
	TRACK_BOTTOM,
	TRACK_TOP,
	channelHeight,
	frameShapes,
	regionShapes,
	routeScene,
	trunkKind,
	type FrameShape,
	type RegionShape,
	type SceneLine,
};
