// The track router (TASK-349): every relationship drawn on tracks it owns.
//
// Placement put cards, label boxes and frame title rows on ranks, and said
// where each relationship passes the ranks between its ends. Here the ranks
// become bands and the space between two bands a channel. A relationship is a
// chain of stations (`chains.ts`); between two stations it leaves the upper one
// straight down, runs across on a track of the channel, and enters the lower
// one straight down (`channels.ts`). Each channel is made as tall as its
// tracks need, so lanes keep one spacing and never squeeze, and every label
// sits on its own line by construction. One pass, no search.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { ChangeKind, SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import {
	APPROACH_STRAIGHT,
	BEND_RADIUS,
	CONTAINER_INSET,
} from "@/transformers/semantic-renderer/config";
import type {
	ArchitectureDrawing,
	DrawingEdge,
	DrawingNode,
	DrawingRegion,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { curveThrough, pathOf, selfLoop } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	LANE,
	chainOf,
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
import { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

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

/**
 * A chain's nets: one for each pair of stations on neighbouring bands.
 * @param edge The relationship.
 * @param chain Its stations.
 * @param standing Its comparison standing; relationships that differ never share a trunk.
 * @returns Its nets, top to bottom.
 */
function netsOf(edge: SemanticEdge, chain: Chain, standing: string): Net[] {
	return chain.stations.slice(1).map((bottom, index) => {
		const top = chain.stations[index]!;
		return {
			edge: edge.id,
			order: edge.order,
			channel: top.band,
			kind: `${edge.kind}|${standing}`,
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
 * @param scene The scene, whose bands get their new tops.
 * @param tracks How many tracks each channel holds.
 */
function spaceBands(scene: Scene, tracks: readonly number[]): void {
	let top = PAGE_MARGIN;
	scene.bands.forEach((band, index) => {
		band.newTop = top;
		top += band.bottom - band.top + channelHeight(tracks[index] ?? 0);
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
		const to = { x: net.bottomX + left, y: entersAt(scene, net, left) };
		if (Math.abs(from.x - to.x) <= STRAIGHT) return [from, to];
		const track = upper.newTop + (upper.bottom - upper.top) + TRACK_TOP + net.track * LANE;
		return [from, { x: from.x, y: track }, { x: to.x, y: track }, to];
	});
}

/**
 * Every card, in its place after spacing, at its containment depth.
 * @param scene The spaced scene.
 * @param measured The measured cards.
 * @param left How far every x moves.
 * @returns The cards.
 */
function drawCards(scene: Scene, measured: MeasuredArchitecture, left: number): DrawingNode[] {
	const depths = new Map<string, number>();
	for (const { depth, members } of scene.frames.values()) {
		for (const member of members) depths.set(member, Math.max(depths.get(member) ?? 0, depth + 1));
	}
	return [...scene.cards].map(([id, item]) => ({
		measured: measured.nodes.get(id)!,
		box: scene.moved(item, left),
		depth: depths.get(id) ?? 0,
	}));
}

/**
 * Every frame: Graphviz's width, from its title row down to below its lowest
 * member, the labels of the relationships it holds included.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param measured The measured frames.
 * @param left How far every x moves.
 * @returns The frames.
 */
function drawFrames(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	measured: MeasuredArchitecture,
	left: number,
): DrawingNode[] {
	return [...scene.frames].map(([id, { node, depth, members }]) => {
		const inside = new Set(members);
		const title = scene.moved(scene.titles.get(id)!, left);
		const boxes = [
			...members.flatMap((member) => {
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
		const bottom = Math.max(title.y + title.height, ...boxes.map((box) => box.y + box.height));
		return {
			measured: measured.nodes.get(id)!,
			box: {
				x: node.x! + left,
				y: title.y,
				width: node.width!,
				height: bottom + CONTAINER_INSET - title.y,
			},
			depth,
		};
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
 * @param measured The measured captions.
 * @param left How far every x moves.
 * @returns The regions.
 */
function drawRegions(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	measured: MeasuredArchitecture,
	left: number,
): DrawingRegion[] {
	return scene.regions.flatMap((region) => {
		const caption = measured.groups?.captions.get(region.group);
		if (caption === undefined) return [];
		const inside = new Set(
			region.members.flatMap((id) => [id, ...(scene.frames.get(id)?.members ?? [])]),
		);
		const centred = scene.moved(region.caption, left);
		// The caption reads from the band's top-left corner, as a frame's title does.
		const top = { ...centred, x: region.box.x + left + REGION_CAPTION_INSET };
		const boxes = [
			...[...inside].flatMap((id) => {
				const item = scene.cards.get(id) ?? scene.titles.get(id);
				return item === undefined ? [] : [scene.moved(item, left)];
			}),
			...[...scene.labels]
				.filter(([edge]) => {
					const placed = edges.get(edge)!;
					return inside.has(placed.sources[0]!) && inside.has(placed.targets[0]!);
				})
				.map(([, item]) => scene.moved(item, left)),
		];
		const bottom = Math.max(top.y + top.height, ...boxes.map((box) => box.y + box.height));
		const depth =
			region.parent === undefined ? 0 : (scene.frames.get(region.parent)?.depth ?? 0) + 1;
		return [
			{
				group: region.group,
				parent: region.parent,
				box: {
					x: region.box.x + left,
					y: top.y,
					width: region.box.width,
					height: bottom + REGION_BOTTOM - top.y,
				},
				caption: { box: top, measured: caption },
				depth,
			},
		];
	});
}

/**
 * Every relationship's drawn line and label.
 * @param scene The spaced scene.
 * @param content The architecture, for its relationships in drawing order.
 * @param routed Every routed relationship.
 * @param measured The measured labels.
 * @returns The drawn relationships.
 */
function drawEdges(
	scene: Scene,
	content: VariantContent,
	routed: ReadonlyMap<string, Routed>,
	measured: MeasuredArchitecture,
): DrawingEdge[] {
	return content.edges
		.toSorted((one, other) => one.order - other.order)
		.map((edge) => {
			const label = measured.labels.get(edge.id);
			const item = scene.labels.get(edge.id);
			const withLabel =
				label === undefined || item === undefined
					? {}
					: { label: { measured: label, box: scene.moved(item, PAGE_MARGIN) } };
			const route = routed.get(edge.id);
			const curve =
				route === undefined
					? selfLoop(scene.moved(scene.endpoint(edge.from), PAGE_MARGIN), false)
					: curveThrough(
							route.upward
								? pointsOf(scene, route.nets, PAGE_MARGIN).toReversed()
								: pointsOf(scene, route.nets, PAGE_MARGIN),
						);
			return { edge, curve, path: pathOf(curve), ...withLabel };
		});
}

/**
 * The page around everything drawn.
 * @param boxes Every card, frame and label box.
 * @returns Its width and height.
 */
function pageAround(boxes: readonly Box[]): { width: number; height: number } {
	return {
		width: Math.max(...boxes.map((box) => box.x + box.width)) + PAGE_MARGIN,
		height: Math.max(...boxes.map((box) => box.y + box.height)) + PAGE_MARGIN,
	};
}

/**
 * Route every relationship of a placed hierarchy on its own tracks.
 * @param content The architecture, for its relationships in drawing order.
 * @param placed The track placement's answer.
 * @param measured The measured cards and labels.
 * @param standings Comparison standings, which keep marked relationships off one trunk.
 * @returns The drawing painting and the atlas read.
 */
function routeTracks(
	content: VariantContent,
	placed: ElkNode,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): ArchitectureDrawing {
	const scene = new Scene(placed);
	const edges = new Map((placed.edges ?? []).map((edge) => [edge.id, edge]));
	const between = content.edges.filter((edge) => edge.from !== edge.to);
	const chains = new Map(between.map((edge) => [edge.id, chainOf(scene, edges.get(edge.id)!)]));
	straightenLanes(scene, [...chains.values()]);
	const routed = new Map<string, Routed>(
		between.map((edge) => {
			const chain = chains.get(edge.id)!;
			const standing = standings?.[edge.id] ?? "unchanged";
			return [edge.id, { nets: netsOf(edge, chain, standing), upward: chain.upward }];
		}),
	);
	const nets = [...routed.values()].flatMap((route) => route.nets);
	bundleTrunks(nets);
	assignPorts(nets);
	slideLabels(scene, nets);
	assignPorts(nets);
	for (const route of routed.values()) settleStraights(route.nets);
	spaceBands(
		scene,
		scene.bands.map((_, channel) => assignTracks(nets.filter((net) => net.channel === channel))),
	);
	const cards = drawCards(scene, measured, PAGE_MARGIN);
	const containers = drawFrames(scene, edges, measured, PAGE_MARGIN);
	const drawn = drawEdges(scene, content, routed, measured);
	const regions = drawRegions(scene, edges, measured, PAGE_MARGIN);
	const labels = drawn.flatMap(({ label }) => (label === undefined ? [] : [label.box]));
	return {
		direction: "down",
		...pageAround([...cards, ...containers, ...regions].map(({ box }) => box).concat(labels)),
		cards,
		containers,
		edges: drawn,
		...(regions.length === 0 ? {} : { regions }),
	};
}

export { routeTracks };
