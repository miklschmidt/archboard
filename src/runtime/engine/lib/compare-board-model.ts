// One side of a comparison: a whole board, read into the model the diff joins
// on.
//
// Nodes and edges come from `compare-node-model`; arrangement from
// `compare-board-layout`; everything else on the board from
// `compare-board-plain`. What is here is the order those run in, the warnings
// a board earns while they do, and the reframing that happens once both sides
// exist.

import type { ServerElement } from "@/runtime/engine/types";
import { architectureFacts } from "@/runtime/board-inspection/architecture";
import { boundingBoxOf, boxOf, regionName } from "@/runtime/engine/layout";
import type { Box, BoundingBox } from "@/runtime/engine/layout";
import type {
	ClusterFacts,
	CompareSideInput,
	PlainSide,
	UnresolvedConnector,
} from "@/runtime/engine/lib/compare-contract";
import { buildEdges, buildNodes } from "@/runtime/engine/lib/compare-node-model";
import type {
	EdgeModel,
	NodeModel,
	PromotedConnector,
} from "@/runtime/engine/lib/compare-node-model";
import {
	assignContainers,
	assignPlacement,
	clusterFactsOf,
	groupFactsOf,
	nodeExtentOf,
	regionOfBox,
	scatteredNodeWarnings,
} from "@/runtime/engine/lib/compare-board-layout";
import { plainSideOf } from "@/runtime/engine/lib/compare-board-plain";

interface BoardModel {
	key: string;
	elements: ServerElement[];
	nodes: Map<string, NodeModel>;
	edges: EdgeModel[];
	unresolved: UnresolvedConnector[];
	plain: PlainSide;
	clusters: ClusterFacts[];
	groups: ClusterFacts[];
	nodeBox: BoundingBox | null;
	// Filled in by `reframeRegions` once both sides are built and the join is
	// known — every `region` on this model is thirds of it.
	regionFrame: BoundingBox | null;
	warnings: string[];
}

/**
 * Say so when a node records a variant other than its board's.
 *
 * Not harmless: `variantAnomaly` is a semantic field, so every such node is
 * reported as changed, and a board full of them buries whatever the real
 * difference was. Branching restamps the copy (`restampVariant`, TASK-035)
 * precisely so this stays rare enough to be worth saying out loud. When it
 * does fire it is the trace of a copy, and the human is usually the only one
 * who knows whether it was deliberate.
 * @param models Every node on the board.
 * @param input Which board this is, and what variant it claims to be.
 * @returns The warning, or none.
 */
function staleVariantWarnings(models: readonly NodeModel[], input: CompareSideInput): string[] {
	const stale = models.filter((m) => m.variant && m.variant !== input.identity.variant);
	if (stale.length === 0) {
		return [];
	}
	const said = stale.map((m) => `${m.node} says "${m.variant}"`).join(", ");
	return [
		`On "${input.key}" ${stale.length} node(s) record a different variant than the board itself ("${input.identity.variant}"): ${said}. Usually the trace of a board copied from another variant without re-promoting.`,
	];
}

/**
 * Say so when a promoted connector also joins two other nodes.
 *
 * This is the one case where reading a connector as a node loses something: it
 * used to be a dependency, and now it is part of a shape. Usually the trace of
 * a selection that swept up an arrow it did not mean. Demote it to get the
 * edge back.
 * @param promoted The connectors that would otherwise have been edges.
 * @param nodes Every node on the board, for their names.
 * @param key Which board this is.
 * @returns One warning per such connector.
 */
function promotedConnectorWarnings(
	promoted: readonly PromotedConnector[],
	nodes: ReadonlyMap<string, NodeModel>,
	key: string,
): string[] {
	/**
	 * What to call one node out loud.
	 * @param id The node id.
	 * @returns Its name, falling back to the id.
	 */
	const nameOfNode = (id: string): string => nodes.get(id)?.name ?? id;
	return promoted.map(
		({ node, from, to }) =>
			`On "${key}" node "${nameOfNode(node)}" includes a connector drawn from ` +
			`"${nameOfNode(from)}" to "${nameOfNode(to)}". A promoted element is part of its node, so that ` +
			"connection is not compared as an edge. Demote the connector if it was meant to be one.",
	);
}

/**
 * Say so when a node sits inside a shape nothing names.
 * @param key Which board this is.
 * @returns The warning.
 */
function anonymousContainerWarning(key: string): string {
	return (
		`On "${key}" at least one node sits inside an unlabelled shape. An unlabelled container has ` +
		'no identity that survives to the other board, so it compares only as "unlabelled-<type>" — label ' +
		"it, or promote it, to make the boundary comparable."
	);
}

/**
 * Record each node's neighbours, so the diff can talk about a node's
 * connections without walking the edges again.
 * @param edges Every edge on the board.
 * @param nodes Every node on the board, edited in place.
 */
function recordDegrees(edges: readonly EdgeModel[], nodes: ReadonlyMap<string, NodeModel>): void {
	for (const edge of edges) {
		nodes.get(edge.from)?.out.push(edge.to);
		nodes.get(edge.to)?.in.push(edge.from);
	}
}

/**
 * One side of a comparison, read off the board.
 *
 * Every element carrying a node id is a node, whatever it is drawn from: a
 * stencil is an arbitrary set of primitives, and the shipped PostgreSQL one is
 * seven lines, so a type test here made promoting it report success and
 * produce a node no reader could see (TASK-053).
 * @param input The board's elements, key and identity.
 * @returns The model.
 */
function buildBoard(input: CompareSideInput): BoardModel {
	const facts = architectureFacts(input.elements);
	const all = [...facts.elements];
	const { nodeOfElement, models, nodes } = buildNodes(facts);
	const { edges, unresolved, promotedConnectors } = buildEdges(facts, nodes, nodeOfElement);
	const warnings = [
		...staleVariantWarnings(models, input),
		...promotedConnectorWarnings(promotedConnectors, nodes, input.key),
	];
	recordDegrees(edges, nodes);

	const nodeBox = nodeExtentOf(models);
	const clusters = clusterFactsOf(models, nodeBox);
	const groups = groupFactsOf(models, nodes);
	if (assignContainers(models, all, nodeOfElement)) {
		warnings.push(anonymousContainerWarning(input.key));
	}
	assignPlacement(models, clusters.of, groups.of, nodeBox);
	warnings.push(...scatteredNodeWarnings(models, input.key));

	return {
		key: input.key,
		elements: all,
		nodes,
		edges,
		unresolved,
		plain: plainSideOf(all, nodeOfElement, facts.confirmedBoundLabelIds, nodeBox),
		clusters: clusters.facts,
		groups: groups.facts,
		nodeBox,
		// Provisional: thirds of this board's own nodes, which is the only frame
		// available before the other side is known. `reframeRegions` replaces it.
		regionFrame: nodeBox,
		warnings,
	};
}

/**
 * Re-place every cluster in the reframed board.
 * @param model The board, edited in place.
 * @param frame The frame the region names are thirds of.
 */
function reframeClusters(model: BoardModel, frame: BoundingBox | null): void {
	for (const cluster of model.clusters) {
		const boxes = cluster.members
			.map((n) => model.nodes.get(n)?.box)
			.filter((box): box is Box => box !== undefined);
		if (boxes.length === 0) {
			continue;
		}
		const cx = boxes.reduce((s, b) => s + b.x + b.w / 2, 0) / boxes.length;
		const cy = boxes.reduce((s, b) => s + b.y + b.h / 2, 0) / boxes.length;
		cluster.region = frame ? regionName(cx, cy, frame) : "centre";
	}
}

/**
 * Re-place every labelled plain element in the reframed board.
 * @param model The board, edited in place.
 * @param frame The frame the region names are thirds of.
 */
function reframePlain(model: BoardModel, frame: BoundingBox | null): void {
	const byId = new Map(model.elements.map((el) => [el.id, el]));
	for (const plain of model.plain.labelled) {
		const el = byId.get(plain.id);
		if (!el) {
			continue;
		}
		plain.region = regionOfBox(boxOf(el), frame);
	}
}

/**
 * Re-draw the frame the region names are thirds of, now that both sides exist.
 *
 * Region is the one layout signal whose *name* depends on something other than
 * the node it describes. The frame is the box round the nodes, so a node that
 * arrives at the edge of the board — or leaves it — stretches or shrinks the
 * frame and hands every other node a new region name. The diff then reports
 * nodes nobody touched as having moved, and the change feed states that in
 * prose: "Payment Events moved". It is noise in `compare` and a false claim
 * about a human in the feed.
 *
 * So the frame is drawn round the nodes the join actually joined, exactly as
 * the cluster signal already restricts itself to shared membership. Arriving
 * and departing nodes are still *placed* in that frame — a node added off to
 * the right is reported at the right — they just no longer redraw it.
 *
 * Below two shared nodes there is nothing to anchor to (one node's box, or
 * none, gives a frame that names everything "centre"), so the board's own node
 * box stands and the pre-existing caveat applies unchanged.
 * @param model The board, edited in place.
 * @param shared The nodes the join matched on both sides.
 */
function reframeRegions(model: BoardModel, shared: Set<string>): void {
	const anchors = [...model.nodes.values()].filter((m) => shared.has(m.node)).map((m) => m.box);
	const frame = anchors.length >= 2 ? boundingBoxOf(anchors) : model.nodeBox;
	model.regionFrame = frame;
	for (const m of model.nodes.values()) {
		m.region = regionOfBox(m.box, frame);
	}
	reframeClusters(model, frame);
	reframePlain(model, frame);
}

/**
 * How wide a board is relative to how tall.
 * @param box The board's extent.
 * @returns The ratio, or null when the board is too flat to have one.
 */
const aspect = (box: BoundingBox | null): number | null =>
	box && box.maxY - box.minY > 1 ? (box.maxX - box.minX) / (box.maxY - box.minY) : null;

/**
 * Whether two boards are shaped differently enough that comparing their
 * regions would be comparing different things.
 * @param a One board's extent.
 * @param b The other's.
 * @returns True when one is half again as wide, proportionally, as the other.
 */
function hasDivergentAspect(a: BoundingBox | null, b: BoundingBox | null): boolean {
	const aspectA = aspect(a);
	const aspectB = aspect(b);
	return (
		aspectA !== null && aspectB !== null && (aspectA / aspectB > 1.5 || aspectB / aspectA > 1.5)
	);
}

export { type BoardModel, buildBoard, hasDivergentAspect, reframeRegions };
