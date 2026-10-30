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
import type { Point } from "#shared/rules/geometry.ts";
import { LANE, chainOf, type Station, type Chain } from "#shared/rules/track/routes/chains.ts";
import { straightenLanes } from "#shared/rules/track/routes/straighten.ts";
import {
	assignPorts,
	bundleTrunks,
	requiredPortWidths,
	type Net,
} from "#shared/rules/track/channels/channels.ts";
import { spaceBands, type Rim } from "#shared/rules/track/channels/spacing.ts";
import { settleLabels, slideLabels } from "#shared/rules/track/labels/labels.ts";
import { Scene, centreX, type Item } from "#shared/rules/track/scene/scene.ts";
import { Containers } from "#shared/rules/track/scene/containers.ts";
import { closeJogs, openNotches } from "#shared/rules/track/routes/jogs.ts";
import { collinearPairs, partCollinear } from "#shared/rules/track/routes/parting.ts";
import { holdToPoints } from "#shared/rules/track/routes/points.ts";
import { relayLaps } from "#shared/rules/track/routes/relay.ts";
import { fitTitleRows } from "#shared/rules/track/labels/title-rows.ts";
import { clearHeadings, straightenThroughLabels } from "#shared/rules/track/channels/columns.ts";
import {
	portsOntoLanes,
	pullToPorts,
	straightenIntoContainers,
	closeLaneSteps,
	unstrandLanes,
} from "#shared/rules/track/routes/stranded.ts";

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
	/**
	 * The wall it runs to through its label, when it leaves its block
	 * sideways carrying its label there: its target is then a stub on the
	 * band below its label, and it runs out to the wall along the channel
	 * under its label instead.
	 */
	readonly leaves?: "left" | "right";
}

/**
 * The kind two lines must share to share a trunk, read off a placed
 * relationship: its kind, its comparison standing, its emphasis and whether
 * it carries traffic. The last two are absent on Blocks, which keeps lines
 * of different emphasis or traffic on one lane (layout-rules.md section 47).
 * @param edge The placed relationship.
 * @returns The kind.
 */
function trunkKind(edge: ElkExtendedEdge): string {
	const options = edge.layoutOptions ?? {};
	return [
		options["archboard.relationship.kind"] ?? "",
		options["archboard.relationship.standing"] ?? "unchanged",
		options["archboard.relationship.emphasis"] ?? "normal",
		options["archboard.relationship.traffic"] ?? "off",
	].join("|");
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
 * Turn a line that enters or leaves its block by a wall onto that wall: the
 * net from its stub runs in from the wall along the channel under the stub,
 * and the net into its stub runs out to the wall along the channel above it.
 * @param scene The scene.
 * @param line The line.
 * @param nets Its nets, top to bottom.
 */
function turnToWall(scene: Scene, line: SceneLine, nets: readonly Net[]): void {
	if (line.enters !== undefined) {
		const first = nets[0]!;
		first.wall = "top";
		first.topX = wallX(scene, line.enters);
	}
	if (line.leaves !== undefined) {
		const last = nets.at(-1)!;
		last.wall = "bottom";
		last.bottomX = wallX(scene, line.leaves);
	}
}

/**
 * What a line's nets must share with another's to share a trunk: its kind,
 * and its direction, since a trunk carries its lines one way.
 * @param line The line.
 * @param chain Its stations.
 * @returns The kind.
 */
function chainKind(line: SceneLine, chain: Chain): string {
	return chain.upward ? `${line.kind}|upward` : line.kind;
}

/**
 * A chain's nets: one for each pair of stations on neighbouring bands.
 * @param line The line.
 * @param chain Its stations.
 * @returns Its nets, top to bottom.
 */
function netsOf(line: SceneLine, chain: Chain): Net[] {
	const kind = chainKind(line, chain);
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
 * Whether a net's ends stand apart by a sliver: straight to within half a
 * unit, but not exactly.
 * @param net The net.
 * @returns True when they do.
 */
function sliver(net: Net): boolean {
	return Math.abs(net.topX - net.bottomX) <= STRAIGHT && net.topX !== net.bottomX;
}

/**
 * Make every drop that is straight to within half a unit exactly straight, so
 * no line takes a sliver of a step the curve would round into a corner. The
 * end that gives way is a lane, which carries the move into the net beside
 * it, or else a card's port; a label box never moves. Below a label the lower
 * end gives way; above one the upper end does, and a lane there carries the
 * move up through every sliver above it: moving only the net's end would let
 * the next step that follows the lanes put the sliver back at the label's
 * edge, where no straight run would carry the label.
 * @param nets One relationship's nets, top to bottom.
 */
function settleStraights(nets: readonly Net[]): void {
	nets.forEach((net, index) => {
		if (!sliver(net)) return;
		if (net.bottom.kind === "label") {
			settleAbove(nets, index);
			return;
		}
		if (net.bottom.kind === "lane") {
			net.bottom.x = net.topX;
			const next = nets[index + 1];
			if (next !== undefined) next.topX = net.topX;
		}
		net.bottomX = net.topX;
	});
}

/**
 * Stand a net's upper end over its lower one, and each sliver above it over
 * the one below, for as far as lanes carry the move up.
 * @param nets One relationship's nets, top to bottom.
 * @param index The net whose lower end stays.
 */
function settleAbove(nets: readonly Net[], index: number): void {
	const x = nets[index]!.bottomX;
	for (let at = index; at >= 0; at -= 1) {
		const net = nets[at]!;
		if (at < index && !sliver(net)) return;
		net.topX = x;
		if (net.top.kind !== "lane") return;
		net.top.x = x;
		const previous = nets[at - 1];
		if (previous === undefined) return;
		previous.bottomX = x;
	}
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
 * row and other lane on its band.
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
	return [...items, ...lanes].every(([low, high]) => x <= low || x >= high);
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
		if (closeLaneSteps(scene, chains)) followLanes(nets);
		assignPorts(nets);
	}
	if (pullIntoTrunks(scene, routes, nets)) followLanes(nets);
}

/**
 * Part the lines that read as one, then close the jogs that frees: parting
 * two lines stands one exactly a lane from the other, which can free the
 * column a jog was held off by a point or two. A step still too short for
 * its bends is opened to one they turn whole.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param routed Every line's nets.
 */
function partAndClose(scene: Scene, chains: readonly Chain[], routed: readonly Routed[]): void {
	const routes = routed.map((route) => route.nets);
	portsOntoLanes(scene, routes.flat());
	partCollinear(scene, chains, routes);
	// Closing a jog never stands two lines parted just now back on one column.
	closeJogs(scene, chains, routes, collinearPairs);
	openNotches(scene, chains, routes);
}

/**
 * Prepare independent ports, then route and space the scene when it fits.
 * A crowded placement can be discarded before label and track settlement.
 * @param scene The scene, whose bands get their new tops.
 * @param lines The lines, each between two of its items.
 * @param margin How far every x moves.
 * @param top Where the first band starts.
 * @param rim The room the block keeps at its edge rows where no line turns.
 * @returns Crowded faces' required widths and the remaining routing operation.
 */
function routeScene(
	scene: Scene,
	lines: readonly SceneLine[],
	margin: number,
	top = margin,
	rim?: Rim,
): { widths: ReadonlyMap<Item, number>; route: () => Map<string, Point[]> } {
	const inner = lines.filter(({ wall }) => wall === undefined);
	const chains = new Map(inner.map((line) => [line.id, chainOf(scene, line.placed)]));
	holdToPoints(inner, chains);
	// A line that enters or leaves its block by a wall comes from or goes to that wall, not its stub.
	const movable = inner.filter(
		({ enters, leaves }) => enters === undefined && leaves === undefined,
	);
	fitTitleRows(scene, [...chains.values()]);
	clearHeadings(scene, [...chains.values()]);
	straightenLanes(scene, [...chains.values()]);
	relayLaps(
		scene,
		new Map(inner.map((line) => [chains.get(line.id)!, chainKind(line, chains.get(line.id)!)])),
		movable.map(({ id }) => chains.get(id)!),
	);
	straightenThroughLabels(scene, [...chains.values()]);
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
	return {
		widths: requiredPortWidths(nets),
		/**
		 * Settle ports, labels and tracks in the accepted placement.
		 * @returns Each line's points, from source to target.
		 */
		route: () => {
			assignPorts(nets);
			slideLabels(scene, nets);
			if (straightenIntoContainers(scene, [...chains.values()])) followLanes(nets);
			if (unstrandLanes(scene, [...chains.values()])) followLanes(nets);
			assignPorts(nets);
			pullOntoPorts(scene, [...chains.values()], [...routed.values()], nets);
			closeJogs(
				scene,
				[...chains.values()],
				[...routed.values()].map((route) => route.nets),
			);
			for (const route of routed.values()) settleStraights(route.nets);
			for (const line of inner) turnToWall(scene, line, routed.get(line.id)!.nets);
			partAndClose(scene, [...chains.values()], [...routed.values()]);
			const edges = new Map(lines.map((line) => [line.id, line.placed]));
			const rising = new Set(
				[...routed.values()].filter(({ upward }) => upward).map(({ nets: [first] }) => first!),
			);
			const containers = new Containers(scene, edges);
			spaceBands(
				scene,
				nets,
				{ closings: containers.closings(), facing: containers.facing() },
				rising,
				top,
				rim,
			);
			return new Map(
				[...routed].map(([id, route]) => {
					const points = pointsOf(scene, route.nets, margin);
					return [id, route.upward ? points.toReversed() : points];
				}),
			);
		},
	};
}

export { PAGE_MARGIN, routeScene, trunkKind };
