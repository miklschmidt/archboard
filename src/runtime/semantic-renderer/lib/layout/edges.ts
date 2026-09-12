// Turning planned journeys into drawn routes.
//
// Forked from PR Lens's `layout/edges.ts`, which is now split across `plan.ts`
// (where a route goes), `tracks.ts` (where it attaches and which line it runs
// on), `curves.ts` (its shape) and `braid.ts` (whether a stem's branches run
// along one another). What is left here is the pass itself: plan everything,
// allocate, draw, and then — if a stem braided — do it again without that stem.

import type { SemanticEdge } from "@/shared/semantic-board/index";
import type { Point } from "@/runtime/semantic-renderer/lib/geometry";
import type {
	ArchitectureLayout,
	PlacedNode,
} from "@/runtime/semantic-renderer/lib/layout/architecture";
import { braidingTrunks } from "@/runtime/semantic-renderer/lib/layout/braid";
import {
	curveThrough,
	labelAnchorOf,
	pathOf,
	selfLoop,
	simplify,
	type Curve,
} from "@/runtime/semantic-renderer/lib/layout/curves";
import { crossedGap } from "@/runtime/semantic-renderer/lib/layout/pill";
import { snapNeighbours } from "@/runtime/semantic-renderer/lib/layout/snap";
import {
	blockedFaces,
	planRoute,
	planTrunkMember,
	trunkKey,
	type Blocked,
	type Route,
} from "@/runtime/semantic-renderer/lib/layout/plan";
import {
	allocatePorts,
	allocateTracks,
	fromSlot,
	resolvedPort,
	toSlot,
	waypoints,
	type Port,
} from "@/runtime/semantic-renderer/lib/layout/tracks";

/** One relationship, drawn. */
interface RoutedEdge {
	/** What it depicts. */
	readonly edge: SemanticEdge;
	/** Its `d` attribute. */
	readonly path: string;
	/** Its shape, for the label pass and for the bounds. */
	readonly curve: Curve;
	/** Centre of the longest straight run — where this edge's label pill sits. */
	readonly labelAnchor: Point | undefined;
}

/** How many runs each gap of one layout would carry, and how many pills. */
interface ChannelTraffic {
	/** Runs per corridor, by index. */
	readonly corridors: ReadonlyMap<number, number>;
	/** Runs per band, by index. */
	readonly bands: ReadonlyMap<number, number>;
	/** Pills stacking in each corridor's width, by index. */
	readonly corridorPills: ReadonlyMap<number, number>;
	/** Pills stacking in each band's height, by index. */
	readonly bandPills: ReadonlyMap<number, number>;
}

/** An edge whose two ends were both placed. */
interface Drawable {
	/** The relationship. */
	readonly edge: SemanticEdge;
	/** Its position in document order. */
	readonly order: number;
	/** Where it starts. */
	readonly from: PlacedNode;
	/** Where it ends. */
	readonly to: PlacedNode;
}

/** Everything one routing pass produced. */
interface Pass {
	/** Every drawn route, in document order. */
	readonly routed: readonly RoutedEdge[];
	/** Every planned route, for the traffic count. */
	readonly plans: readonly Route[];
	/** Per trunk group, each member's waypoints minus the shared head segment. */
	readonly branches: ReadonlyMap<string, Point[][]>;
}

/**
 * The edges whose two ends were both placed. An edge naming a node that is not
 * on the board cannot be drawn; the board contract refuses such a document
 * before it is read, so this is a floor rather than a policy.
 * @param edges The relationships, in document order.
 * @param layout Where everything is.
 * @returns The edges that can be drawn, with their ends.
 */
function drawableEdges(edges: readonly SemanticEdge[], layout: ArchitectureLayout): Drawable[] {
	const placed = new Map(layout.nodes.map((node) => [node.node.id, node]));
	return edges.flatMap((edge, order) => {
		const from = placed.get(edge.from);
		const to = placed.get(edge.to);
		if (from === undefined || to === undefined) {
			return [];
		}
		return [{ edge, order, from, to }];
	});
}

/**
 * How many routes would leave each card through a shared stem.
 * @param drawable The edges that can be drawn.
 * @param blockedTrunks Stems a previous pass found braiding.
 * @returns The count per trunk key.
 */
function trunkCounts(
	drawable: readonly Drawable[],
	blockedTrunks: ReadonlySet<string>,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const { edge, from, to } of drawable) {
		const key = edge.from === edge.to ? undefined : trunkKey(edge, from, to);
		if (key !== undefined && !blockedTrunks.has(key)) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

/**
 * One edge's journey, through a shared stem when it has company there.
 * @param drawable The edge and its ends.
 * @param layout Where everything is.
 * @param blocked Every card's blocked faces.
 * @param stems How many routes each stem carries.
 * @returns The planned route.
 */
function planOne(
	drawable: Drawable,
	layout: ArchitectureLayout,
	blocked: ReadonlyMap<string, Blocked>,
	stems: ReadonlyMap<string, number>,
): Route {
	const { edge, order, from, to } = drawable;
	const key = trunkKey(edge, from, to);
	const trunk = key !== undefined && (stems.get(key) ?? 0) >= 2 ? key : undefined;
	const journey =
		trunk === undefined
			? planRoute(from, to, layout.regions, layout.grid, blocked)
			: planTrunkMember(from, to, layout.regions, layout.grid, blocked);
	return { edge, order, from, to, trunk, ...journey };
}

/**
 * One drawn route, and the waypoints a stem's braid guard reads.
 * @param route The planned route.
 * @param ports Every allocated port.
 * @param tracks Every allocated track.
 * @returns The drawn route and its waypoints.
 */
function drawRoute(
	route: Route,
	ports: ReadonlyMap<string, Port>,
	tracks: ReadonlyMap<string, number>,
): { routed: RoutedEdge; points: Point[] } {
	const points = simplify(
		waypoints(
			route,
			resolvedPort(ports, fromSlot(route), route.from.box, route.fromSide),
			resolvedPort(ports, toSlot(route), route.to.box, route.toSide),
			(index) => tracks.get(`${route.edge.id}#${index}`) ?? 0,
		),
	);
	const curve = curveThrough(points);
	return { routed: routedFrom(route.edge, curve), points };
}

/**
 * One drawn route from its shape.
 * @param edge The relationship.
 * @param curve Its shape.
 * @returns The drawn route.
 */
function routedFrom(edge: SemanticEdge, curve: Curve): RoutedEdge {
	return {
		edge,
		path: pathOf(curve),
		curve,
		labelAnchor: edge.label === undefined ? undefined : labelAnchorOf(curve),
	};
}

/**
 * Plan, allocate and draw every edge once.
 * @param edges The relationships, in document order.
 * @param layout Where everything is.
 * @param blockedTrunks Stems a previous pass found braiding.
 * @returns What the pass produced.
 */
function routePass(
	edges: readonly SemanticEdge[],
	layout: ArchitectureLayout,
	blockedTrunks: ReadonlySet<string>,
): Pass {
	const drawable = drawableEdges(edges, layout);
	const blocked = blockedFaces(layout.nodes);
	const stems = trunkCounts(drawable, blockedTrunks);
	const straight = drawable.filter(({ edge }) => edge.from !== edge.to);
	const routes = straight.map((one) => planOne(one, layout, blocked, stems));

	const ports = allocatePorts(routes, layout.grid);
	snapNeighbours(routes, ports);
	const tracks = allocateTracks(routes, ports, layout.grid);

	const branches = new Map<string, Point[][]>();
	const byId = new Map<string, RoutedEdge>();
	for (const route of routes) {
		const { routed, points } = drawRoute(route, ports, tracks);
		if (route.trunk !== undefined) {
			const list = branches.get(route.trunk) ?? [];
			list.push(points.slice(1));
			branches.set(route.trunk, list);
		}
		byId.set(route.edge.id, routed);
	}

	const routed = drawable.map(
		({ edge, from }) =>
			byId.get(edge.id) ??
			routedFrom(edge, selfLoop(from.box, blocked.get(from.node.id)?.right ?? false)),
	);
	return { routed, plans: routes, branches };
}

/**
 * Route everything, then route it again without any stem whose branches ran
 * along one another.
 * @param edges The relationships, in document order.
 * @param layout Where everything is.
 * @returns What the settled pass produced.
 */
function finalPass(edges: readonly SemanticEdge[], layout: ArchitectureLayout): Pass {
	const first = routePass(edges, layout, new Set());
	const braiding = braidingTrunks(first.branches);
	return braiding.size === 0 ? first : routePass(edges, layout, braiding);
}

/**
 * Every edge of one layout, drawn.
 * @param edges The relationships, in document order.
 * @param layout Where everything is.
 * @returns The drawn routes, in document order.
 */
function routeEdges(
	edges: readonly SemanticEdge[],
	layout: ArchitectureLayout,
): readonly RoutedEdge[] {
	return finalPass(edges, layout).routed;
}

/**
 * How many runs each gap of this layout would carry, counted from the same
 * routing that would be drawn — braid guard included. This is what decides
 * whether a gap is wide enough for its traffic before anything is drawn into it.
 * @param edges The relationships, in document order.
 * @param layout Where everything is.
 * @returns The traffic per gap.
 */
function channelTraffic(
	edges: readonly SemanticEdge[],
	layout: ArchitectureLayout,
): ChannelTraffic {
	const corridors = new Map<number, number>();
	const bands = new Map<number, number>();
	const corridorPills = new Map<number, number>();
	const bandPills = new Map<number, number>();
	for (const route of finalPass(edges, layout).plans) {
		for (const channel of route.channels) {
			count(channel.kind === "corridor" ? corridors : bands, channel.index);
		}
		const crossed = crossedGap(route);
		if (crossed !== undefined) {
			count(crossed.kind === "corridor" ? corridorPills : bandPills, crossed.index);
		}
	}
	return { corridors, bands, corridorPills, bandPills };
}

/**
 * One more for one gap.
 * @param counts The tally, updated in place.
 * @param index Which gap.
 */
function count(counts: Map<number, number>, index: number): void {
	counts.set(index, (counts.get(index) ?? 0) + 1);
}

export { type RoutedEdge, type ChannelTraffic, routeEdges, channelTraffic };
