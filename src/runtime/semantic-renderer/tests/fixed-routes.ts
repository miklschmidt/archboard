// Fixed orthogonal routes, rounded as they reach crossing treatment, so a
// test exercises the crossing pass independently of any placement engine.
import {
	curveThrough,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/runtime/semantic-renderer/layout";

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
 * Whether a bridge is a hop, not a cut.
 * @param bridge A bridge.
 * @param bridge.curve Its curve.
 * @returns True when it rises.
 */
function hops(bridge: { readonly curve: DrawingEdge["curve"] }): boolean {
	return bridge.curve.segments.length > 1;
}

export { across, down, drawing, hops };
