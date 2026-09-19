import { ROUTE_NUDGE_DISTANCE } from "@/transformers/semantic-renderer/config";
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { curveClearanceIssue } from "@/transformers/semantic-renderer/lib/layout/curves";
import { isNativeRouteUnavailable } from "@/transformers/semantic-renderer/lib/layout/avoid-routes";
import type { LabelAttempt } from "@/transformers/semantic-renderer/lib/layout/label-reservations";

/**
 * Whether a vertical channel has room on the ordinary card's horizontal span.
 * @param x Channel coordinate.
 * @param box Endpoint bounds.
 * @returns Whether the channel fits the usable span.
 */
function onCard(x: number, box: Box): boolean {
	return x >= box.x + ROUTE_NUDGE_DISTANCE && x <= box.x + box.width - ROUTE_NUDGE_DISTANCE;
}

/**
 * Try existing rails and the adjacent native channel when a waypoint adds bends.
 * The adjacent positions let a label and both endpoints move together around a
 * different-direction pin at their shared center. Native routing decides which
 * proposed pins actually fit; these positions are never painted directly.
 * @param drawing Current placed subjects.
 * @param edge Relationship to simplify.
 * @param label Existing native waypoint.
 * @returns Finite candidates in preference order.
 */
export function projectionCoordinates(
	drawing: ArchitectureDrawing,
	edge: DrawingEdge,
	label: Box,
): readonly number[] {
	const from = drawing.cards.find(({ measured }) => measured.node.id === edge.edge.from)?.box;
	const to = drawing.cards.find(({ measured }) => measured.node.id === edge.edge.to)?.box;
	if (from === undefined || to === undefined) return [];
	const center = label.x + label.width / 2;
	// Keep an exact native spacing boundary on its clear side after floating-point division.
	const adjacent = ROUTE_NUDGE_DISTANCE + 0.000001;
	const rails = [center - adjacent, center + adjacent, ...verticalRails(edge)];
	/**
	 * Count the endpoint spans a proposed channel can align.
	 * @param x Proposed rail.
	 * @returns Number of aligned ends.
	 */
	const alignment = (x: number): number => Number(onCard(x, from)) + Number(onCard(x, to));
	return [...new Set(rails)]
		.filter((x) => Math.abs(x - center) > 0.000001 && alignment(x) > 0)
		.toSorted(
			(a, b) => alignment(b) - alignment(a) || Math.abs(a - center) - Math.abs(b - center) || a - b,
		);
}

/**
 * Read the vertical rails already chosen by native routing.
 * @param edge Current relationship.
 * @returns Its vertical run coordinates.
 */
function verticalRails(edge: DrawingEdge): number[] {
	const rails: number[] = [];
	let previous = edge.curve.from;
	for (const segment of edge.curve.segments) {
		if (segment.kind === "line" && previous.x === segment.to.x) rails.push(previous.x);
		previous = segment.to;
	}
	return rails;
}

/**
 * Count ordinary turns and the Manhattan extent of their native rounded route.
 * @param drawing Candidate route set.
 * @returns Bend count and route length.
 */
function routeCost(drawing: ArchitectureDrawing): readonly [number, number] {
	let bends = 0;
	let length = 0;
	for (const { curve } of drawing.edges) {
		let previous = curve.from;
		for (const segment of curve.segments) {
			if (segment.kind === "cubic") bends++;
			length += Math.abs(segment.to.x - previous.x) + Math.abs(segment.to.y - previous.y);
			previous = segment.to;
		}
	}
	return [bends, length];
}

/**
 * A complete candidate must retain physical clearance and materially improve its routes.
 * @param candidate Proposed complete drawing.
 * @param current Accepted drawing.
 * @returns Whether the candidate is a strict valid improvement.
 */
function improvesRoutes(candidate: ArchitectureDrawing, current: ArchitectureDrawing): boolean {
	if (candidate.width !== current.width || candidate.height !== current.height) return false;
	if (!sameSubjects(candidate, current)) return false;
	if (
		candidate.edges.some(({ curve, label }) => curveClearanceIssue(curve, label?.box) !== undefined)
	)
		return false;
	const [bends, length] = routeCost(candidate);
	const [beforeBends, beforeLength] = routeCost(current);
	return bends === beforeBends ? length < beforeLength - 0.01 : bends < beforeBends;
}

/**
 * A route improvement must not move or resize any subject to obtain its benefit.
 * @param candidate Proposed geometry.
 * @param current Accepted geometry.
 * @returns Whether every subject has its original bounds.
 */
function sameSubjects(candidate: ArchitectureDrawing, current: ArchitectureDrawing): boolean {
	const before = new Map(
		[...current.cards, ...current.containers].map(({ measured, box }) => [measured.node.id, box]),
	);
	const after = [...candidate.cards, ...candidate.containers];
	return (
		after.length === before.size &&
		after.every(({ measured, box }) => {
			const prior = before.get(measured.node.id);
			return (
				prior !== undefined &&
				box.x === prior.x &&
				box.y === prior.y &&
				box.width === prior.width &&
				box.height === prior.height
			);
		})
	);
}

/**
 * Publish one complete improvement, retaining the valid baseline on an expected native refusal.
 * @param current Complete baseline.
 * @param solve One proposed joint waypoint solve.
 * @returns A valid strict improvement or the unchanged baseline.
 */
export async function improveProjection(
	current: LabelAttempt,
	solve: () => Promise<LabelAttempt>,
): Promise<LabelAttempt> {
	try {
		const candidate = await solve();
		return candidate.missing.length === 0 && improvesRoutes(candidate.drawing, current.drawing)
			? candidate
			: current;
	} catch (error) {
		if (isNativeRouteUnavailable(error)) return current;
		throw error;
	}
}
