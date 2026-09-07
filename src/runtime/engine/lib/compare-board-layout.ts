// Where the nodes of one board sit, relative to each other.
//
// None of this is stated anywhere: it is read back off the geometry, because
// arrangement is how a human says what belongs with what. Cluster and group
// ids are synthetic per side — what compares across two boards is membership,
// never an id.

import {
	CLUSTER_GAP,
	boundingBoxOf,
	boxOf,
	clusterBoxes,
	regionName,
} from "@/runtime/engine/layout";
import type { Box, BoundingBox } from "@/runtime/engine/layout";
import type { ServerElement } from "@/runtime/engine/types";
import type { ClusterFacts } from "@/runtime/engine/lib/compare-contract";
import { labelOfAll } from "@/runtime/engine/lib/compare-node-model";
import type { NodeModel } from "@/runtime/engine/lib/compare-node-model";

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

/** One node reduced to a box that still knows whose it is. */
interface ClusterItem extends Box {
	node: string;
	name: string;
}

/** A partition of the board's nodes, and which partition each node is in. */
interface Partition {
	facts: ClusterFacts[];
	of: Map<string, string>;
}

/**
 * How a node's size reads next to the others.
 *
 * Relative, not absolute: a board of small boxes has no "larger" node just
 * because every box on it is small.
 * @param area The node's area.
 * @param median The median area on the board.
 * @returns Where it sits.
 */
function prominenceOf(area: number, median: number): NodeModel["prominence"] {
	if (median <= 0) {
		return "typical";
	}
	if (area < median * 0.6) {
		return "smaller";
	}
	return area > median * 1.7 ? "larger" : "typical";
}

/**
 * Which third of the board a box sits in.
 * @param box The box.
 * @param frame The board's own extent, when it has one.
 * @returns The region's name.
 */
function regionOfBox(box: Box, frame: BoundingBox | null): string {
	return frame ? regionName(box.x + box.w / 2, box.y + box.h / 2, frame) : "centre";
}

/**
 * Which third of the board a whole cluster sits in, measured from the average
 * of its members rather than from its bounding box, so one outlier does not
 * drag the cluster somewhere none of it is.
 * @param group The cluster's members.
 * @param frame The board's own extent, when it has one.
 * @returns The region's name.
 */
function clusterRegion(group: readonly ClusterItem[], frame: BoundingBox | null): string {
	const cx = group.reduce((s, g) => s + g.x + g.w / 2, 0) / group.length;
	const cy = group.reduce((s, g) => s + g.y + g.h / 2, 0) / group.length;
	return frame ? regionName(cx, cy, frame) : "centre";
}

/**
 * The board's nodes as clusters of things drawn near each other.
 * @param models Every node on the board.
 * @param nodeBox The extent of all of them.
 * @returns The clusters, and which cluster each node is in.
 */
function clusterFactsOf(models: readonly NodeModel[], nodeBox: BoundingBox | null): Partition {
	const of = new Map<string, string>();
	const facts: ClusterFacts[] = [];
	const items: ClusterItem[] = models.map((m) => ({ ...m.box, node: m.node, name: m.name }));
	for (const [i, group] of clusterBoxes(items, CLUSTER_GAP).entries()) {
		const id = `c${i + 1}`;
		for (const g of group) {
			of.set(g.node, id);
		}
		facts.push({
			id,
			region: clusterRegion(group, nodeBox),
			size: group.length,
			members: group.map((g) => g.node).toSorted(),
			names: group.map((g) => g.name),
		});
	}
	return { facts, of };
}

/**
 * Which nodes share each explicit Excalidraw group.
 * @param models Every node on the board.
 * @returns Group id to the nodes in it, in the order they were found.
 */
function nodesByGroupId(models: readonly NodeModel[]): Map<string, string[]> {
	const byGroupId = new Map<string, string[]>();
	for (const m of models) {
		for (const gid of m.primary.groupIds) {
			const list = byGroupId.get(gid) ?? [];
			if (!list.includes(m.node)) {
				list.push(m.node);
			}
			byGroupId.set(gid, list);
		}
	}
	return byGroupId;
}

/**
 * The board's nodes as the groups somebody grouped them into.
 *
 * A second partition alongside the clusters, and a deliberate one rather than
 * an inferred one. Group ids are random per board, so again only membership
 * compares.
 * @param models Every node on the board.
 * @param nodes The same nodes by id, for their names.
 * @returns The groups, and which group each node is in.
 */
function groupFactsOf(
	models: readonly NodeModel[],
	nodes: ReadonlyMap<string, NodeModel>,
): Partition {
	const facts: ClusterFacts[] = [];
	const of = new Map<string, string>();
	let groupIndex = 0;
	const bySize = [...nodesByGroupId(models).entries()].toSorted(
		(a, b) => b[1].length - a[1].length,
	);
	for (const [, members] of bySize) {
		if (members.length < 2) {
			// A group of one says nothing.
			continue;
		}
		const id = `g${++groupIndex}`;
		for (const node of members) {
			of.set(node, id);
		}
		facts.push({
			id,
			region: "n/a",
			size: members.length,
			members: [...members].toSorted(),
			names: members.map((n) => nodes.get(n)?.name ?? n),
		});
	}
	return { facts, of };
}

/**
 * How a container is named on the other board.
 *
 * A node id survives the crossing, and so does a label. An unlabelled shape
 * has neither, so it compares only as its type, and the caller says so.
 * @param el The containing shape.
 * @param all Every element on the board, for the label.
 * @param nodeOfElement Which node each element belongs to.
 * @returns The key.
 */
function containerKeyOf(
	el: ServerElement,
	all: readonly ServerElement[],
	nodeOfElement: ReadonlyMap<string, string>,
): string {
	const node = nodeOfElement.get(el.id);
	if (node) {
		return `node:${node}`;
	}
	const label = labelOfAll(el, all);
	return label ? `label:${label}` : `unlabelled-${el.type}`;
}

/**
 * Whether one box completely covers another.
 * @param candidate The outer box.
 * @param target The inner box.
 * @returns True when the outer contains the inner on all four sides.
 */
function containsStrictly(candidate: Box, target: Box): boolean {
	return (
		candidate.x <= target.x &&
		candidate.y <= target.y &&
		candidate.x + candidate.w >= target.x + target.w &&
		candidate.y + candidate.h >= target.y + target.h
	);
}

/**
 * The shapes a node could be sitting inside.
 * @param all Every element on the board.
 * @returns The ones with an interior worth being inside.
 */
function containerCandidatesOf(all: readonly ServerElement[]): ServerElement[] {
	return all.filter(
		(el) => CONTAINER_TYPES.has(el.type) && (el.width || 0) > 0 && (el.height || 0) > 0,
	);
}

/**
 * The smallest shape that strictly contains a node, whether that shape is
 * another node or a plain box somebody drew round a subsystem.
 *
 * A candidate has to be meaningfully bigger than the node, so that two shapes
 * of nearly the same size do not read as one containing the other.
 * @param m The node.
 * @param candidates The shapes it could be inside.
 * @param nodeOfElement Which node each element belongs to, so a node's own
 * elements are not read as its container.
 * @returns The container, or undefined when it sits inside nothing.
 */
function smallestContainer(
	m: NodeModel,
	candidates: readonly ServerElement[],
	nodeOfElement: ReadonlyMap<string, string>,
): ServerElement | undefined {
	let best: ServerElement | undefined;
	let bestArea = Infinity;
	for (const cand of candidates) {
		if (nodeOfElement.get(cand.id) === m.node) {
			continue;
		}
		// Measured, like everything else, though CONTAINER_TYPES carries no path
		// today: the rule is the same rule wherever a box is read (TASK-038).
		const c = boxOf(cand);
		const area = c.w * c.h;
		if (!containsStrictly(c, m.box) || area <= m.box.w * m.box.h * 1.2) {
			continue;
		}
		if (area < bestArea) {
			best = cand;
			bestArea = area;
		}
	}
	return best;
}

/**
 * Record what each node sits inside.
 * @param models Every node on the board, edited in place.
 * @param all Every element on the board.
 * @param nodeOfElement Which node each element belongs to.
 * @returns True when at least one container was an unlabelled shape, which the
 * caller warns about.
 */
function assignContainers(
	models: readonly NodeModel[],
	all: readonly ServerElement[],
	nodeOfElement: ReadonlyMap<string, string>,
): boolean {
	const candidates = containerCandidatesOf(all);
	let anonymous = false;
	for (const m of models) {
		const best = smallestContainer(m, candidates, nodeOfElement);
		if (!best) {
			continue;
		}
		m.container = containerKeyOf(best, all, nodeOfElement);
		if (m.container.startsWith("unlabelled-")) {
			anonymous = true;
		}
	}
	return anonymous;
}

/**
 * The middle node area on the board, which is what "typical" means here.
 * @param models Every node on the board.
 * @returns The median area, or zero when nothing has one.
 */
function medianArea(models: readonly NodeModel[]): number {
	const areas = models
		.map((m) => m.box.w * m.box.h)
		.filter((a) => a > 0)
		.toSorted((a, b) => a - b);
	return areas.at(Math.floor(areas.length / 2)) ?? 0;
}

/**
 * Record which cluster and group each node is in, where it sits, and how big
 * it reads.
 * @param models Every node on the board, edited in place.
 * @param clusters Which cluster each node is in.
 * @param groups Which group each node is in.
 * @param nodeBox The extent of all the nodes.
 */
function assignPlacement(
	models: readonly NodeModel[],
	clusters: ReadonlyMap<string, string>,
	groups: ReadonlyMap<string, string>,
	nodeBox: BoundingBox | null,
): void {
	const median = medianArea(models);
	for (const m of models) {
		m.clusterId = clusters.get(m.node) ?? null;
		m.group = groups.get(m.node) ?? null;
		m.region = regionOfBox(m.box, nodeBox);
		m.prominence = prominenceOf(m.box.w * m.box.h, median);
	}
}

/**
 * Say so when a node's elements are scattered.
 *
 * It is still one node — that is what the id says — but the human should hear
 * about it, because it is usually a stray element that got promoted along with
 * the box.
 * @param models Every node on the board.
 * @param key Which board this is.
 * @returns One warning per scattered node.
 */
function scatteredNodeWarnings(models: readonly NodeModel[], key: string): string[] {
	const warnings: string[] = [];
	for (const m of models) {
		if (m.elements.length <= 1) {
			continue;
		}
		const spread = clusterBoxes(
			m.elements.map((el) => boxOf(el)),
			CLUSTER_GAP,
		);
		if (spread.length > 1) {
			warnings.push(
				`On "${key}" node "${m.node}" is made of ${m.elements.length} elements that sit in ` +
					`${spread.length} separate places on the board. It compares as one node; its geometry is the ` +
					"box round all of them, which will read as larger and vaguer than what anyone drew.",
			);
		}
	}
	return warnings;
}

/**
 * The extent of every node on the board.
 * @param models Every node on the board.
 * @returns The box round all of them, or null when there are none.
 */
function nodeExtentOf(models: readonly NodeModel[]): BoundingBox | null {
	return boundingBoxOf(models.map((m) => m.box));
}

export {
	type Partition,
	assignContainers,
	assignPlacement,
	clusterFactsOf,
	groupFactsOf,
	nodeExtentOf,
	regionOfBox,
	scatteredNodeWarnings,
};
