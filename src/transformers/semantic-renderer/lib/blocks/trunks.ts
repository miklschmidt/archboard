// The trunks of a block of blocks, routed with libavoid around the blocks it
// packs: each between two pins on its blocks' edges, or the block's own port
// or header, and how much room the routes spend running round the blocks.
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Side,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { crossingsOf, scoreOf } from "@/transformers/semantic-renderer/lib/track/score";

/** How far a trunk keeps from a block it passes. */
const TRUNK_CLEARANCE = 16;
/** How much a trunk pays for each turn, in diagram points. */
const TRUNK_TURN = 60;
/** How much a trunk pays for crossing another, in diagram points. */
const TRUNK_CROSSING = 300;
/** libavoid's pin directions: a port is left the way its edge faces. */
const DIRECTION: Readonly<Record<Side, number>> = { top: 1, bottom: 2, left: 4, right: 8 };

/** The edge a trunk leaves a block's own port by: into the block. */
const INWARD: Readonly<Record<Side, Side>> = {
	top: "bottom",
	bottom: "top",
	left: "right",
	right: "left",
};
/** A router, its ends and its connectors, as the module makes them. */
type Router = InstanceType<AvoidEngine["Router"]>;
type End = InstanceType<AvoidEngine["ConnEnd"]>;

/**
 * Whether a route runs only across and down, never on a slant.
 * @param points The route.
 * @returns True when every run is horizontal or vertical.
 */
function orthogonal(points: readonly Point[]): boolean {
	return (
		points.length >= 2 &&
		points
			.slice(1)
			.every(
				(point, index) =>
					Math.abs(point.x - points[index]!.x) < 0.5 || Math.abs(point.y - points[index]!.y) < 0.5,
			)
	);
}

/**
 * A plain dogleg between two ends: across then down for ends that face
 * sideways, down then across for ends that face up or down.
 * @param from The first end and the edge it faces.
 * @param from.point Where it stands.
 * @param from.side The edge it faces.
 * @param to The second end.
 * @param to.point Where it stands.
 * @returns The route.
 */
function dogleg(from: { point: Point; side: Side }, to: { point: Point }): Point[] {
	const a = from.point;
	const b = to.point;
	if (from.side === "left" || from.side === "right") {
		const middle = (a.x + b.x) / 2;
		return [a, { x: middle, y: a.y }, { x: middle, y: b.y }, b];
	}
	const middle = (a.y + b.y) / 2;
	return [a, { x: a.x, y: middle }, { x: b.x, y: middle }, b];
}

/**
 * How far a route runs beyond the shortest orthogonal path between its ends,
 * each turn counted as the router counts it.
 * @param points The route.
 * @returns The extra length.
 */
function detourOf(points: readonly Point[]): number {
	const first = points[0]!;
	const last = points.at(-1)!;
	const length = points
		.slice(1)
		.reduce(
			(sum, point, index) =>
				sum + Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y),
			0,
		);
	const turns = Math.max(0, points.length - 2);
	return length + turns * TRUNK_TURN - Math.abs(last.x - first.x) - Math.abs(last.y - first.y);
}

/**
 * How readable a block of blocks reads laid out, on the score every layout
 * choice is made by, with the room its trunks spend running round the
 * blocks counted as crossings at the router's own rate.
 * @param laid The block laid out.
 * @returns The score.
 */
function packedScore(laid: Laid): number {
	const lines = [...laid.lines.values()];
	const detour = lines.reduce((sum, points) => sum + detourOf(points), 0);
	const crossings = crossingsOf(lines) + detour / TRUNK_CROSSING;
	return scoreOf({ width: laid.width, height: laid.height, crossings });
}

/** The trunks of one block of blocks, routed around its packed blocks. */
class TrunkRouter {
	/**
	 * A router for one block's trunks.
	 * @param block The block.
	 * @param laid Every block laid out, its items included.
	 * @param tree The blocks.
	 * @param boxes Where the block put its items, header and own ports.
	 */
	constructor(
		readonly block: Block,
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly boxes: ReadonlyMap<string, Box>,
	) {}

	/**
	 * Add one obstacle.
	 * @param avoid The initialized libavoid module.
	 * @param router The router.
	 * @param box Its box.
	 * @returns The router's shape.
	 */
	shape(avoid: AvoidEngine, router: Router, box: Box): object {
		const from = new avoid.Point(box.x, box.y);
		const to = new avoid.Point(box.x + box.width, box.y + box.height);
		const rectangle = new avoid.Rectangle(from, to);
		try {
			return new avoid.ShapeRef(router, rectangle);
		} finally {
			rectangle.delete();
			from.delete();
			to.delete();
		}
	}

	/**
	 * Where on its obstacle a pinned end stands, and which way it leaves: a
	 * pin on a packed block's edge leaves outward, the block's own port
	 * inward, so no trunk reaches either by running along an edge.
	 * @param at The pin, the block's own port, or the header.
	 * @returns The obstacle, the proportional x, and the edge it leaves by.
	 */
	pinOn(at: string): { owner: string; x: number; y: number; side: Side } {
		const own = this.block.ports.get(at);
		if (own !== undefined) return { owner: at, x: 0.5, y: 0.5, side: INWARD[own] };
		const pin = this.tree.pins.get(at);
		if (pin === undefined) return { owner: at, x: 0.5, y: 1, side: "bottom" };
		const inner = this.laid.get(pin.block.id)!;
		const port = inner.boxes.get(pin.port)!;
		const side = pin.block.ports.get(pin.port)!;
		const x = (port.x + port.width / 2) / inner.width;
		const y = (port.y + port.height / 2) / inner.height;
		const onWall = { top: [x, 0], bottom: [x, 1], left: [0, y], right: [1, y] }[side];
		return { owner: pin.block.id, x: onWall[0]!, y: onWall[1]!, side };
	}

	/**
	 * Where a trunk's end stands and which way it leaves: a pin on its block's
	 * edge, or the middle of the block's own port or header.
	 * @param at The line end.
	 * @returns The point and the edge it faces.
	 */
	pinPoint(at: string): { point: Point; side: Side } {
		if (!this.tree.pins.has(at) && at !== headerOf(this.block)) {
			const box = this.boxes.get(at)!;
			const side = this.block.ports.get(at) ?? "bottom";
			return { point: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, side };
		}
		const { owner, x, y, side } = this.pinOn(at);
		const box = this.boxes.get(owner)!;
		return { point: { x: box.x + x * box.width, y: box.y + y * box.height }, side };
	}

	/**
	 * One end of a trunk: a pin on a packed block's port, on the block's own
	 * port, or on the bottom of its header.
	 * @param avoid The initialized libavoid module.
	 * @param at The line end.
	 * @param shapes Every obstacle's shape.
	 * @param classes The pin class each end was given.
	 * @returns The router's end.
	 */
	end(
		avoid: AvoidEngine,
		at: string,
		shapes: ReadonlyMap<string, object>,
		classes: Map<string, number>,
	): End {
		const { owner, x, y, side } = this.pinOn(at);
		const shape = shapes.get(owner)!;
		const known = classes.get(at);
		const pinClass = known ?? classes.size + 1;
		if (known === undefined) {
			classes.set(at, pinClass);
			const made = new avoid.ShapeConnectionPin(shape, pinClass, x, y, true, 0, DIRECTION[side]);
			made.setExclusive(false);
		}
		return new avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * Route every trunk around the packed blocks.
	 * @param avoid The initialized libavoid module.
	 * @returns Each line's points, by key, from its source end.
	 */
	route(avoid: AvoidEngine): Map<string, Point[]> {
		const lines = new Map<string, Point[]>();
		const router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting.value);
		try {
			router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, TRUNK_CLEARANCE);
			router.setRoutingParameter(avoid.RoutingParameter.idealNudgingDistance, LANE);
			router.setRoutingParameter(avoid.RoutingParameter.segmentPenalty, TRUNK_TURN);
			router.setRoutingParameter(avoid.RoutingParameter.crossingPenalty, TRUNK_CROSSING);
			const header = this.block.header === undefined ? [] : [headerOf(this.block)];
			const shapes = new Map(
				[...this.block.items, ...header, ...this.block.ports.keys()].map((id) => [
					id,
					this.shape(avoid, router, this.boxes.get(id)!),
				]),
			);
			const classes = new Map<string, number>();
			const connections = [...this.block.lines.values()].map((line) => {
				const from = this.end(avoid, line.tail, shapes, classes);
				const to = this.end(avoid, line.head, shapes, classes);
				try {
					const connection = new avoid.ConnRef(router, from, to);
					connection.setRoutingType(avoid.ConnType.ConnType_Orthogonal);
					return { line, connection };
				} finally {
					from.delete();
					to.delete();
				}
			});
			router.processTransaction();
			for (const { line, connection } of connections) {
				const route = connection.displayRoute();
				const routed = Array.from({ length: route.size() }, (_, index) => {
					const { x, y } = route.at(index);
					return { x, y };
				});
				// libavoid answers a straight line between the blocks' middles when it finds
				// no route; the trunk then takes a plain dogleg between its pins.
				const points =
					connection.hasValidRoute() && orthogonal(routed)
						? routed
						: dogleg(this.pinPoint(line.tail), this.pinPoint(line.head));
				lines.set(line.key, line.from === line.tail ? points : points.toReversed());
			}
			return lines;
		} finally {
			router.delete();
		}
	}
}

export { TRUNK_CLEARANCE, TrunkRouter, packedScore };
