// Fixed orthogonal routes, rounded as they reach crossing treatment, so a
// test exercises the crossing pass independently of any placement engine.
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
import {
	bridgeCrossings,
	curveThrough,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/runtime/semantic-renderer/layout";

/** How a line of a kind the policy does not know is drawn. */
const DEFAULT_LOOK = { dash: "solid", arrowhead: "filled" } as const;

/** What a route's relationship says about how it is drawn, where a test sets it. */
type Look = Partial<Pick<DrawingEdge["edge"], "kind" | "emphasis">>;

/**
 * Rounded routes as they reach crossing treatment.
 * @param routes The fixed orthogonal routes.
 * @param looks Each route's kind and emphasis, where not a normal call.
 * @returns The complete geometry presented to bridge placement.
 */
function drawing(
	routes: readonly (readonly Point[])[],
	looks: readonly Look[] = [],
): ArchitectureDrawing {
	const edges: DrawingEdge[] = routes.map((points, index) => ({
		edge: {
			id: String(index),
			order: (index + 1) * 1000,
			from: `source${index}`,
			to: `target${index}`,
			kind: "call",
			emphasis: "normal",
			...looks[index],
		},
		curve: curveThrough(points),
		path: "",
	}));
	return { direction: "down", width: 120, height: 100, cards: [], containers: [], edges };
}

/**
 * A straight route across at one height.
 * @param y The height.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns Its points.
 */
function across(y: number, from = 0, to = 100): Point[] {
	return [
		{ x: from, y },
		{ x: to, y },
	];
}

/**
 * A straight route down at one place.
 * @param x The place.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns Its points.
 */
function down(x: number, from = 0, to = 100): Point[] {
	return [
		{ x, y: from },
		{ x, y: to },
	];
}

/**
 * Settle a drawing's crossings, each line drawn as the default policy draws its kind.
 * @param settled The drawing.
 * @param policy The policy whose relationship kinds say how lines are drawn.
 * @returns The bridged edges and the ink each crossing clears.
 */
function bridged(
	settled: ArchitectureDrawing,
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
): ReturnType<typeof bridgeCrossings> {
	const lines = new Map(
		settled.edges.map(({ edge }) => {
			const { dash, arrowhead } = policy.relationshipKinds[edge.kind] ?? DEFAULT_LOOK;
			return [edge.id, { dash, arrowhead }];
		}),
	);
	return bridgeCrossings(settled, lines);
}

/**
 * Whether a bridge is a hop, not a cut.
 * @param bridge A bridge.
 * @param bridge.curve Its curve.
 * @returns True when it rises.
 */
function hops(bridge: { readonly curve: DrawingEdge["curve"] }): boolean {
	return bridge.curve.segments.length > 1;
}

/**
 * How far a hop reaches from where it leaves its line, each way across it:
 * a hop over a line across bulges up (negative) or down (positive), one over
 * a line down left (negative) or right (positive).
 * @param bridge A hop.
 * @param bridge.curve Its curve.
 * @returns Its reach to either side of its line.
 */
function bulgeOf(bridge: { readonly curve: DrawingEdge["curve"] }): {
	readonly least: number;
	readonly most: number;
} {
	const { from, segments } = bridge.curve;
	// A hop ends where it began along its line: level with it on a line across.
	const axis = segments.at(-1)!.to.y === from.y ? "y" : "x";
	const offsets = segments.map((segment) => segment.to[axis] - from[axis]);
	return { least: Math.min(0, ...offsets), most: Math.max(0, ...offsets) };
}

export { across, bridged, bulgeOf, down, drawing, hops };
