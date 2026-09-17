import {
	badgeShiftIntervals,
	type HintAttachment,
	type NodeHintRoutes,
} from "@/transformers/semantic-renderer/lib/layout/compound-label-space";
import type { ElkNode, ElkPort } from "@archboard/elk-rs";
import type { VariantContent } from "@/shared/semantic-board/index";
import type { DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import {
	SOLVING,
	asFace,
	isFlank,
	isNearFlank,
	pointOnFace,
} from "@/transformers/semantic-renderer/lib/layout/reading";

/**
 * Compare stable identities without depending on the host locale.
 * @param one First identity.
 * @param other Second identity.
 * @returns Their code point order.
 */
function compareIds(one: string, other: string): number {
	return one < other ? -1 : one > other ? 1 : 0;
}

/** One existing dependency reached through newly introduced subjects. */
interface Anchor {
	readonly node: DrawingNode;
	readonly distance: number;
}

/**
 * Find the closest already drawn dependency without depending on edge array order.
 * @param id Starting subject.
 * @param reverse Search its incoming rather than outgoing relationships.
 * @param content The complete current graph.
 * @param previous Existing subjects.
 * @returns The nearest stable dependency, if this component has one.
 */
function nearestAnchor(
	id: string,
	reverse: boolean,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
): Anchor | undefined {
	const visited = new Set([id]);
	let frontier = [id];
	for (let distance = 1; frontier.length > 0; distance += 1) {
		const next = content.edges
			.filter((edge) => frontier.includes(reverse ? edge.to : edge.from))
			.map((edge) => (reverse ? edge.from : edge.to))
			.filter((candidate) => !visited.has(candidate))
			.toSorted();
		for (const candidate of next) {
			const node = previous.get(candidate);
			if (node !== undefined) return { node, distance };
			visited.add(candidate);
		}
		frontier = next;
	}
	return undefined;
}

/**
 * Suggest a layer between stable neighbors, leaving final spacing to ELK.
 * @param id Newly introduced subject.
 * @param content Current architecture.
 * @param previous Stable subjects in the predecessor.
 * @param height Current card height, used only for a new terminal chain.
 * @param fallback Position relative to a newly placed neighbor when interpolation is unavailable.
 * @returns A pseudo vertical position used by interactive layer assignment.
 */
function newLayer(
	id: string,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	height: number,
	fallback?: number,
): number {
	const before = nearestAnchor(id, true, content, previous),
		after = nearestAnchor(id, false, content, previous);
	if (before !== undefined && after !== undefined)
		return (
			(before.node.box.y * after.distance + after.node.box.y * before.distance) /
			(before.distance + after.distance)
		);
	if (fallback !== undefined) return fallback;
	if (before !== undefined)
		return before.node.box.y + before.distance * (before.node.box.height + 80);
	if (after !== undefined) return after.node.box.y - after.distance * (height + 80);
	return 24;
}

/**
 * Translate the current ordered ports into preliminary global attachments.
 * @param node The measured, position-seeded engine node.
 * @param port The relationship attachment face.
 * @param origin Its global node origin.
 * @returns An evenly distributed attachment; ELK still owns final port placement.
 */
function portHint(node: ElkNode, port: ElkPort, origin: Point): Point {
	const side = asFace(port.layoutOptions!["elk.port.side"]);
	const ordered = node
		.ports!.filter((candidate) => candidate.layoutOptions!["elk.port.side"] === side)
		.toSorted((one, other) => {
			const difference =
				Number(one.layoutOptions!["elk.port.index"]) -
				Number(other.layoutOptions!["elk.port.index"]);
			// The engine orders a face's ports clockwise, so the two faces it
			// walks backwards along are reversed here.
			return side === SOLVING.forwardOut || isNearFlank(side) ? -difference : difference;
		});
	const fraction = (ordered.indexOf(port) + 1) / (ordered.length + 1);
	return pointOnFace(side, { ...origin, width: node.width!, height: node.height! }, fraction);
}

/**
 * Choose the adjacent lane of the closest stable dependency.
 * @param root New branch root.
 * @param content Current architecture.
 * @param previous Stable drawing subjects.
 * @param right Fallback for disconnected subjects.
 * @returns A lane outside the dependency's existing vertical routes.
 */
function neighborLane(
	root: ElkNode,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	right: number,
): number {
	const anchor =
		nearestAnchor(root.id, true, content, previous) ??
		nearestAnchor(root.id, false, content, previous);
	return anchor === undefined
		? right
		: anchor.node.box.x + anchor.node.box.width + Number(COMPOUND_OPTIONS["elk.spacing.nodeNode"]);
}

/**
 * Align ordered attachments of two new vertically connected cards.
 * @param edge Their semantic relationship.
 * @param fresh Measured new siblings.
 * @returns The target's horizontal offset from the source.
 */
function attachmentOffset(
	edge: VariantContent["edges"][number],
	fresh: ReadonlyMap<string, ElkNode>,
): number {
	const source = fresh.get(edge.from)!,
		target = fresh.get(edge.to)!;
	const from = source.ports!.find((port) => port.id === `${edge.id}:from`)!,
		to = target.ports!.find((port) => port.id === `${edge.id}:to`)!;
	if (
		from.layoutOptions!["elk.port.side"] !== SOLVING.forwardOut ||
		to.layoutOptions!["elk.port.side"] !== SOLVING.forwardIn
	)
		return 0;
	return portHint(source, from, { x: 0, y: 0 }).x - portHint(target, to, { x: 0, y: 0 }).x;
}

/**
 * Read new adjacent subjects in a deterministic relationship order.
 * @param id Current branch subject.
 * @param edges Current relationships sorted by identity.
 * @param fresh Measured new siblings.
 * @returns Neighbors and their attachment offsets from this subject.
 */
function newNeighbors(
	id: string,
	edges: VariantContent["edges"],
	fresh: ReadonlyMap<string, ElkNode>,
): { node: ElkNode; offset: Point }[] {
	return edges
		.filter((edge) => edge.from === id || edge.to === id)
		.flatMap((edge) => {
			const other = fresh.get(edge.from === id ? edge.to : edge.from);
			if (other === undefined) return [];
			return [
				{
					node: other,
					offset: {
						x: attachmentOffset(edge, fresh) * (edge.from === id ? 1 : -1),
						y: edge.from === id ? fresh.get(id)!.height! + 80 : -other.height! - 80,
					},
				},
			];
		});
}

/**
 * Align connected new cards through their ordered vertical attachments.
 * @param root First card of the new dependency branch.
 * @param fresh New siblings in this containment level.
 * @param content Current architecture.
 * @param previous Stable predecessor subjects.
 * @param right Fallback lane for an unconnected branch.
 * @returns Relative branch geometry before free space is reserved.
 */
function connectedPositions(
	root: ElkNode,
	fresh: ReadonlyMap<string, ElkNode>,
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	right: number,
): Map<string, Point> {
	const result = new Map([
		[
			root.id,
			{
				x: neighborLane(root, content, previous, right),
				y: newLayer(root.id, content, previous, root.height!),
			},
		],
	]);
	const frontier = [root.id];
	const edges = content.edges.toSorted((one, other) => compareIds(one.id, other.id));
	for (const id of frontier) {
		const point = result.get(id)!;
		for (const { node: other, offset } of newNeighbors(id, edges, fresh)) {
			if (result.has(other.id)) continue;
			const anchor = nearestAnchor(id, offset.y < 0, content, previous);
			// Continue the neighbor's interpolated step so an independent terminal
			// can share the stable sibling's layer instead of claiming another one.
			const step =
				anchor === undefined ? offset.y : (anchor.node.box.y - point.y) / anchor.distance;
			result.set(other.id, {
				x: point.x + offset.x,
				y: newLayer(other.id, content, previous, other.height!, point.y + step),
			});
			frontier.push(other.id);
		}
	}
	return result;
}

/**
 * Skip the union of forbidden translations without skipping any free interval.
 * @param intervals Open intervals where translated cards collide.
 * @returns The first permitted nonnegative translation.
 */
function firstFreeShift(intervals: readonly [number, number][]): number {
	let shift = 0;
	for (const [start, end] of intervals.toSorted((one, other) => one[0] - other[0])) {
		if (shift > start && shift < end) shift = end;
	}
	return shift;
}

/**
 * Find the first horizontal translation that clears every occupied interval.
 * @param component Current dependency branch positions.
 * @param fresh Measured new sibling cards.
 * @param occupied Existing siblings and already reserved new branches.
 * @param badgeIntervals Translations where an incident badge lacks corridor room.
 * @returns The smallest nonnegative shift preserving the whole branch alignment.
 */
function freeShift(
	component: ReadonlyMap<string, Point>,
	fresh: ReadonlyMap<string, ElkNode>,
	occupied: readonly Box[],
	badgeIntervals: readonly [number, number][],
): number {
	const gap = Number(COMPOUND_OPTIONS["elk.spacing.nodeNode"]);
	const intervals: [number, number][] = [...badgeIntervals];
	for (const [id, point] of component) {
		const node = fresh.get(id)!;
		for (const box of occupied) {
			if (point.y >= box.y + box.height || point.y + node.height! <= box.y) continue;
			intervals.push([box.x - node.width! - gap - point.x, box.x + box.width + gap - point.x]);
		}
	}
	return firstFreeShift(intervals);
}

/**
 * Resolve only this new component and stable sibling attachments.
 * @param component New branch positions before collision packing.
 * @param children All measured siblings in this containment level.
 * @param previous Existing subject geometry.
 * @returns Global port positions with their movement and attachment direction.
 */
function componentAttachments(
	component: ReadonlyMap<string, Point>,
	children: readonly ElkNode[],
	previous: ReadonlyMap<string, DrawingNode>,
): Map<string, HintAttachment> {
	return new Map(
		children.flatMap((node) => {
			const point = component.get(node.id) ?? previous.get(node.id)?.box;
			if (point === undefined) return [];
			return node.ports!.map((port) => {
				const side = port.layoutOptions!["elk.port.side"];
				return [
					port.id,
					{
						point: portHint(node, port, point),
						moving: component.has(node.id),
						vertical: !isFlank(side),
					},
				] as const;
			});
		}),
	);
}

/**
 * Keep label dummies from joining independent hinted layers before ELK assigns them.
 * Overlapping cards already describe one layer; only gaps between those layers grow.
 * @param children Measured sibling cards.
 * @param positions Their global layer and lane hints.
 * @param routes Current measured labels.
 * @returns Hints with enough room between layers for a centered label.
 */
function spaceLayers(
	children: readonly ElkNode[],
	positions: ReadonlyMap<string, Point>,
	routes: NodeHintRoutes,
): Map<string, Point> {
	const labelHeight = Math.max(
		0,
		...routes.current.flatMap((edge) => edge.labels?.map((label) => label.height!) ?? []),
	);
	if (labelHeight === 0) return new Map(positions);
	const clearance = labelHeight + 2 * Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	const ordered = children.toSorted(
		(one, other) => positions.get(one.id)!.y - positions.get(other.id)!.y,
	);
	const result = new Map<string, Point>();
	let bottom = -Infinity,
		shift = 0;
	for (const node of ordered) {
		const point = positions.get(node.id)!;
		if (point.y >= bottom) shift += Math.max(0, clearance - (point.y - bottom));
		result.set(node.id, { x: point.x, y: point.y + shift });
		bottom = Math.max(bottom, point.y + node.height!);
	}
	return result;
}

/**
 * Reserve nearby lanes for new branches while keeping old sibling cards fixed.
 * @param children Measured subjects of one containment level.
 * @param content Current architecture.
 * @param previous Stable geometry across the preceding drawing.
 * @param right Fallback lane for a new disconnected component.
 * @param routes Measured current badges and inherited global corridors.
 * @returns Global position hints for every child, including existing anchors.
 */
function nodePositionHints(
	children: readonly ElkNode[],
	content: VariantContent,
	previous: ReadonlyMap<string, DrawingNode>,
	right: number,
	routes: NodeHintRoutes,
): Map<string, Point> {
	const fresh = new Map(
		children.filter((node) => !previous.has(node.id)).map((node) => [node.id, node]),
	);
	const incoming = new Set(
		content.edges
			.filter((edge) => fresh.has(edge.from) && fresh.has(edge.to))
			.map((edge) => edge.to),
	);
	const roots = [...fresh.values()].toSorted(
		(one, other) =>
			Number(incoming.has(one.id)) - Number(incoming.has(other.id)) || compareIds(one.id, other.id),
	);
	const occupied = children.flatMap((node) => {
		const old = previous.get(node.id);
		return old === undefined ? [] : [old.box];
	});
	const result = new Map<string, Point>(
		children.flatMap((node) => {
			const old = previous.get(node.id);
			return old === undefined ? [] : [[node.id, old.box] as const];
		}),
	);
	for (const root of roots) {
		if (result.has(root.id)) continue;
		const component = connectedPositions(root, fresh, content, previous, right);
		const attachments = componentAttachments(component, children, previous);
		const shift = freeShift(component, fresh, occupied, badgeShiftIntervals(routes, attachments));
		for (const [id, point] of component) {
			const node = fresh.get(id)!;
			const placed = { x: point.x + shift, y: point.y };
			result.set(id, placed);
			occupied.push({ ...placed, width: node.width!, height: node.height! });
		}
	}
	return spaceLayers(children, result, routes);
}

export { nodePositionHints, portHint };
