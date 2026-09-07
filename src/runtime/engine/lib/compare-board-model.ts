import type { ServerElement } from "@/runtime/engine/types";
import {
	architectureFacts,
	isArchitectureConnectorType,
} from "@/runtime/board-inspection/architecture";
import { readElementMetadata } from "@/runtime/engine/metadata";
import { CLUSTER_GAP, boundingBoxOf, boxOf, clusterBoxes, regionName } from "@/runtime/engine/layout";
import type { Box, BoundingBox } from "@/runtime/engine/layout";
import type {
	ClusterFacts,
	CompareSideInput,
	PlainElement,
	PlainSide,
	UnresolvedConnector,
} from "@/runtime/engine/lib/compare-contract";
import { buildEdges, buildNodes, labelOfAll } from "@/runtime/engine/lib/compare-node-model";
import type { EdgeModel, NodeModel } from "@/runtime/engine/lib/compare-node-model";

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

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

// An arrow or a line is a connector until somebody promotes it. Promotion is
// an explicit act, so metadata outranks the drawn type (TASK-053).
const isConnector = isArchitectureConnectorType;

/**
 *
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
 *
 */
function buildBoard(input: CompareSideInput): BoardModel {
	const facts = architectureFacts(input.elements);
	const all = [...facts.elements];
	const warnings: string[] = [];
	const boundLabelOf = facts.confirmedBoundLabelIds;

	// --- nodes: elements grouped by node id -----------------------------------
	//
	// Every element carrying a node id, whatever it is drawn from. A stencil is
	// an arbitrary set of primitives, and the shipped PostgreSQL one is seven
	// lines, so a type test here made promoting it report success and produce a
	// node no reader could see (TASK-053).
	const nodeBuild = buildNodes(facts);
	const { nodeOfElement, models, nodes } = nodeBuild;

	// A node whose recorded variant is not the board's own was copied from
	// another variant and never re-promoted. Not harmless: `variantAnomaly` is a
	// semantic field, so every such node is reported as changed, and a board
	// full of them buries whatever the real difference was. Branching restamps
	// the copy (`restampVariant`, TASK-035) precisely so this stays rare enough
	// to be worth saying out loud. When it does fire it is the trace of a copy,
	// and the human is usually the only one who knows whether it was deliberate.
	const stale = models.filter((m) => m.variant && m.variant !== input.identity.variant);
	if (stale.length > 0) {
		warnings.push(
			`On "${input.key}" ${stale.length} node(s) record a different variant than the board itself ("${input.identity.variant}"): ${stale.map((m) => `${m.node} says "${m.variant}"`).join(", ")}. Usually the trace of a board copied from another variant without re-promoting.`,
		);
	}

	// --- edges: connectors resolved to node ids -------------------------------
	//
	// A promoted connector is skipped, because it is already a node up above and
	// the two loops have to divide the board rather than overlap it.
	// `promotedConnectors` collects the ones that would have been edges, so the
	// human hears what the promotion cost instead of watching a dependency
	// disappear.
	const edgeBuild = buildEdges(facts, nodes, nodeOfElement);
	const { edges, unresolved, promotedConnectors } = edgeBuild;

	// A connector that was promoted and also joins two other nodes is the one
	// case where reading it as a node loses something: it used to be a
	// dependency, and now it is part of a shape. Usually the trace of a
	// selection that swept up an arrow it did not mean. Demote it to get the
	// edge back.
	/**
	 *
	 */
	const nameOfNode = (id: string): string => nodes.get(id)?.name ?? id;
	for (const { node, from, to } of promotedConnectors) {
		warnings.push(
			`On "${input.key}" node "${nameOfNode(node)}" includes a connector drawn from ` +
				`"${nameOfNode(from)}" to "${nameOfNode(to)}". A promoted element is part of its node, so that ` +
				"connection is not compared as an edge. Demote the connector if it was meant to be one.",
		);
	}

	for (const edge of edges) {
		nodes.get(edge.from)?.out.push(edge.to);
		nodes.get(edge.to)?.in.push(edge.from);
	}

	// --- layout signals -------------------------------------------------------
	const nodeBox = boundingBoxOf(models.map((m) => m.box));

	// Clusters. A cluster gets a synthetic id per side; the thing that compares
	// across sides is its *membership*, never its id.
	const clusterOf = new Map<string, string>();
	const clusters: ClusterFacts[] = [];
	const clusterItems = models.map((m) => ({ ...m.box, node: m.node, name: m.name }));
	const grouped = clusterBoxes(clusterItems, CLUSTER_GAP);
	for (const [i, group] of grouped.entries()) {
		const id = `c${i + 1}`;
		const cx = group.reduce((s, g) => s + g.x + g.w / 2, 0) / group.length;
		const cy = group.reduce((s, g) => s + g.y + g.h / 2, 0) / group.length;
		for (const g of group) {
			clusterOf.set(g.node, id);
		}
		clusters.push({
			id,
			region: nodeBox ? regionName(cx, cy, nodeBox) : "centre",
			size: group.length,
			members: group.map((g) => g.node).toSorted(),
			names: group.map((g) => g.name),
		});
	}

	// Explicit Excalidraw groups, as a second partition of node ids. Group ids
	// are random per board, so again only membership compares.
	const byGroupId = new Map<string, string[]>();
	for (const m of models) {
		for (const gid of m.primary.groupIds ?? []) {
			const list = byGroupId.get(gid) ?? [];
			if (!list.includes(m.node)) {
				list.push(m.node);
			}
			byGroupId.set(gid, list);
		}
	}
	const groups: ClusterFacts[] = [];
	const groupOf = new Map<string, string>();
	let groupIndex = 0;
	for (const [, members] of [...byGroupId.entries()].toSorted(
		(a, b) => b[1].length - a[1].length,
	)) {
		if (members.length < 2) {
			// A group of one says nothing.
			continue;
		}
		const id = `g${++groupIndex}`;
		for (const node of members) {
			groupOf.set(node, id);
		}
		groups.push({
			id,
			region: "n/a",
			size: members.length,
			members: [...members].toSorted(),
			names: members.map((n) => nodes.get(n)?.name ?? n),
		});
	}

	// Containment: the smallest shape that strictly contains a node, whether that
	// shape is another node or a plain box someone drew round a subsystem.
	const containerCandidates = all.filter(
		(el) => CONTAINER_TYPES.has(el.type) && (el.width || 0) > 0 && (el.height || 0) > 0,
	);
	/**
	 *
	 */
	const containerKey = (el: ServerElement): string => {
		const node = nodeOfElement.get(el.id);
		if (node) {
			return `node:${node}`;
		}
		const label = labelOfAll(el, all);
		if (label) {
			return `label:${label}`;
		}
		return `unlabelled-${el.type}`;
	};
	let anonymousContainer = false;
	for (const m of models) {
		let best: ServerElement | undefined;
		let bestArea = Infinity;
		const b = m.box;
		for (const cand of containerCandidates) {
			if (nodeOfElement.get(cand.id) === m.node) {
				continue;
			}
			// Measured, like everything else, though CONTAINER_TYPES carries no path
			// today: the rule is the same rule wherever a box is read (TASK-038).
			const c = boxOf(cand);
			const area = c.w * c.h;
			const contains = c.x <= b.x && c.y <= b.y && c.x + c.w >= b.x + b.w && c.y + c.h >= b.y + b.h;
			if (!contains || area <= b.w * b.h * 1.2) {
				continue;
			}
			if (area < bestArea) {
				best = cand;
				bestArea = area;
			}
		}
		if (best) {
			m.container = containerKey(best);
			if (m.container.startsWith("unlabelled-")) {
				anonymousContainer = true;
			}
		}
	}
	if (anonymousContainer) {
		warnings.push(
			`On "${input.key}" at least one node sits inside an unlabelled shape. An unlabelled container has ` +
				'no identity that survives to the other board, so it compares only as "unlabelled-<type>" — label ' +
				"it, or promote it, to make the boundary comparable.",
		);
	}

	// Region and prominence.
	const areas = models
		.map((m) => m.box.w * m.box.h)
		.filter((a) => a > 0)
		.toSorted((a, b) => a - b);
	const median = areas.at(Math.floor(areas.length / 2)) ?? 0;
	for (const m of models) {
		m.clusterId = clusterOf.get(m.node) ?? null;
		m.group = groupOf.get(m.node) ?? null;
		m.region = nodeBox
			? regionName(m.box.x + m.box.w / 2, m.box.y + m.box.h / 2, nodeBox)
			: "centre";
		const area = m.box.w * m.box.h;
		m.prominence = prominenceOf(area, median);
		// A node whose elements are scattered is still one node — that is what the
		// id says — but the human should hear about it, because it is usually a
		// stray element that got promoted along with the box.
		if (m.elements.length > 1) {
			const spread = clusterBoxes(
				m.elements.map((el) => boxOf(el)),
				CLUSTER_GAP,
			);
			if (spread.length > 1) {
				warnings.push(
					`On "${input.key}" node "${m.node}" is made of ${m.elements.length} elements that sit in ` +
						`${spread.length} separate places on the board. It compares as one node; its geometry is the ` +
						"box round all of them, which will read as larger and vaguer than what anyone drew.",
				);
			}
		}
	}

	// --- plain elements -------------------------------------------------------
	//
	// Whatever belongs to no node, is no connector and labels nothing. A
	// promoted connector falls out on the first test, so the three passes still
	// divide the board between them.
	const plainElements = all.filter(
		(el) => !nodeOfElement.has(el.id) && !isConnector(el.type) && !boundLabelOf.has(el.id),
	);
	const byType: Record<string, number> = {};
	const unlabelled: Record<string, number> = {};
	const labelled: PlainElement[] = [];
	const unidentified: PlainSide["unidentified"] = [];
	for (const el of plainElements) {
		byType[el.type] = (byType[el.type] || 0) + 1;
		const label = labelOfAll(el, all);
		const metadata = readElementMetadata(el);
		const block = metadata.archboard;
		if (block) {
			unidentified.push({
				id: el.id,
				type: el.type,
				...(label ? { label } : {}),
				archboard: block,
			});
		}
		const { foreign } = metadata;
		if (label) {
			const b = boxOf(el);
			labelled.push({
				id: el.id,
				type: el.type,
				label,
				region: nodeBox ? regionName(b.x + b.w / 2, b.y + b.h / 2, nodeBox) : "centre",
				...(el.link ? { link: el.link } : {}),
				...(Object.keys(foreign).length > 0 ? { foreignCustomData: foreign } : {}),
			});
		} else {
			unlabelled[el.type] = (unlabelled[el.type] || 0) + 1;
		}
	}

	return {
		key: input.key,
		elements: all,
		nodes,
		edges,
		unresolved,
		plain: { count: plainElements.length, byType, labelled, unlabelled, unidentified },
		clusters,
		groups,
		nodeBox,
		// Provisional: thirds of this board's own nodes, which is the only frame
		// available before the other side is known. `reframeRegions` replaces it.
		regionFrame: nodeBox,
		warnings,
	};
}

// Re-draw the frame the region names are thirds of, now that both sides exist.
//
// Region is the one layout signal whose *name* depends on something other than
// the node it describes. The frame is the box round the nodes, so a node that
// arrives at the edge of the board — or leaves it — stretches or shrinks the
// frame and hands every other node a new region name. The diff then reports
// nodes nobody touched as having moved, and the change feed states that in
// prose: "Payment Events moved". It is noise in `compare` and a false claim
// about a human in the feed.
//
// So the frame is drawn round the nodes the join actually joined, exactly as
// the cluster signal already restricts itself to shared membership. Arriving
// and departing nodes are still *placed* in that frame — a node added off to
// the right is reported at the right — they just no longer redraw it.
//
// Below two shared nodes there is nothing to anchor to (one node's box, or
// none, gives a frame that names everything "centre"), so the board's own node
// box stands and the pre-existing caveat applies unchanged.
/**
 *
 */
function reframeRegions(model: BoardModel, shared: Set<string>): void {
	const anchors = [...model.nodes.values()].filter((m) => shared.has(m.node)).map((m) => m.box);
	const frame = anchors.length >= 2 ? boundingBoxOf(anchors) : model.nodeBox;
	model.regionFrame = frame;
	/**
	 *
	 */
	const at = (x: number, y: number, w: number, h: number): string =>
		frame ? regionName(x + w / 2, y + h / 2, frame) : "centre";

	for (const m of model.nodes.values()) {
		m.region = at(m.box.x, m.box.y, m.box.w, m.box.h);
	}

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

	const byId = new Map(model.elements.map((el) => [el.id, el]));
	for (const plain of model.plain.labelled) {
		const el = byId.get(plain.id);
		if (!el) {
			continue;
		}
		const b = boxOf(el);
		plain.region = at(b.x, b.y, b.w, b.h);
	}
}

/**
 *
 */
const aspect = (box: BoundingBox | null): number | null =>
	box && box.maxY - box.minY > 1 ? (box.maxX - box.minX) / (box.maxY - box.minY) : null;

/**
 *
 */
function hasDivergentAspect(a: BoundingBox | null, b: BoundingBox | null): boolean {
	const aspectA = aspect(a);
	const aspectB = aspect(b);
	return (
		aspectA !== null && aspectB !== null && (aspectA / aspectB > 1.5 || aspectB / aspectA > 1.5)
	);
}

export { type BoardModel, buildBoard, hasDivergentAspect, reframeRegions };
