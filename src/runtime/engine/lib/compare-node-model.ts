import type { ServerElement } from "@/runtime/engine/types";
import { readElementMetadata } from "@/runtime/engine/metadata";
import type { LogicalAddress } from "@/runtime/engine/metadata";
import { architectureLabel } from "@/runtime/board-inspection/architecture";
import type { ArchitectureFacts } from "@/runtime/board-inspection/architecture";
import type { Box } from "@/runtime/engine/layout";
import type { EdgeFacts, UnresolvedConnector } from "@/runtime/engine/lib/compare-contract";

/**
 *
 */
function formatBinding(binding: LogicalAddress | string | undefined): string | undefined {
	if (binding === undefined) {
		return undefined;
	}
	if (typeof binding === "string") {
		return binding.trim() || undefined;
	}
	const repo = binding.repo ? `${binding.repo}:` : "";
	const branch = binding.branch ? `@${binding.branch}` : "";
	const commit = binding.commit ? ` (${binding.commit.slice(0, 7)})` : "";
	return `${repo}${binding.path ?? "?"}${branch}${commit}`;
}

// What makes two bindings the same binding. Repo, path and branch: the address
// of the code. `commit` and `confirmedAt` are when it was last *confirmed*, and
// re-promoting an unchanged node moves both — treating that as a change would
// fill the diff with reconfirmation noise. Both are still carried in the facts.
/**
 *
 */
function bindingIdentity(binding: LogicalAddress | string | undefined): string | undefined {
	if (binding === undefined) {
		return undefined;
	}
	if (typeof binding === "string") {
		return binding.trim() || undefined;
	}
	const repo = binding.repo ? `${binding.repo}:` : "";
	const branch = binding.branch ? `@${binding.branch}` : "";
	return `${repo}${binding.path ?? "?"}${branch}`;
}

const ARCHBOARD_KNOWN = new Set(["node", "kind", "name", "binding", "variant", "level"]);

interface NodeModel {
	node: string;
	elements: ServerElement[];
	primary: ServerElement;
	label?: string;
	declaredName?: string;
	name: string;
	kind?: string;
	level?: string;
	variant?: string;
	binding?: LogicalAddress | string;
	link?: string;
	extra: Record<string, unknown>;
	box: Box;
	clusterId: string | null;
	container: string | null;
	group: string | null;
	region: string;
	prominence: "smaller" | "typical" | "larger";
	out: string[];
	in: string[];
}

type EdgeModel = EdgeFacts;

/**
 *
 */
function labelOfAll(el: ServerElement, all: ServerElement[]): string | undefined {
	return architectureLabel(el, all);
}

interface NodeBuildResult {
	nodeOfElement: Map<string, string>;
	models: NodeModel[];
	nodes: Map<string, NodeModel>;
}

/**
 *
 */
function buildNodes(facts: ArchitectureFacts): NodeBuildResult {
	const all = facts.elements as ServerElement[];
	const models: NodeModel[] = [];
	for (const [id, fact] of facts.nodes) {
		const elements = fact.elements as ServerElement[];
		const { primary } = fact;
		const block = fact.metadata;
		const extra: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(block)) {
			if (!ARCHBOARD_KNOWN.has(key)) {
				extra[key] = value;
			}
		}
		const label =
			labelOfAll(primary, all) ?? elements.map((el) => labelOfAll(el, all)).find(Boolean);
		const declaredName = typeof block.name === "string" && block.name ? block.name : undefined;
		const link = elements
			.map((el) => el.link)
			.find((value) => typeof value === "string" && value) as string | undefined;
		models.push({
			node: id,
			elements,
			primary,
			...(label ? { label } : {}),
			...(declaredName ? { declaredName } : {}),
			name: label ?? declaredName ?? id,
			...(typeof block.kind === "string" ? { kind: block.kind } : {}),
			...(typeof block.level === "string" ? { level: block.level } : {}),
			...(typeof block.variant === "string" ? { variant: block.variant } : {}),
			...(block.binding !== undefined ? { binding: block.binding } : {}),
			...(link ? { link } : {}),
			extra,
			box: fact.aggregateNodeFootprint,
			clusterId: null,
			container: null,
			group: null,
			region: "centre",
			prominence: "typical",
			out: [],
			in: [],
		});
	}
	const nodes = new Map(models.map((model) => [model.node, model]));
	return { nodeOfElement: new Map(facts.nodeOfElement), models, nodes };
}

interface EdgeBuildResult {
	edges: EdgeModel[];
	unresolved: UnresolvedConnector[];
	promotedConnectors: { node: string; from: string; to: string }[];
}

/**
 *
 */
function buildEdges(
	facts: ArchitectureFacts,
	nodes: Map<string, NodeModel>,
	nodeOfElement: Map<string, string>,
): EdgeBuildResult {
	const all = facts.elements as ServerElement[];
	const { byId } = facts;
	const edges: EdgeModel[] = [];
	const unresolved: UnresolvedConnector[] = [];
	const promotedConnectors: { node: string; from: string; to: string }[] = [];
	for (const connector of facts.connectors) {
		const el = connector.element;
		const startId = connector.startTargetId;
		const endId = connector.endTargetId;
		const ownNode = connector.ownerNodeId;
		if (ownNode) {
			const from = startId ? nodeOfElement.get(startId) : undefined;
			const to = endId ? nodeOfElement.get(endId) : undefined;
			if (from && to && from !== to) {
				promotedConnectors.push({ node: ownNode, from, to });
			}
			continue;
		}
		const fromNode = startId ? nodeOfElement.get(startId) : undefined;
		const toNode = endId ? nodeOfElement.get(endId) : undefined;
		const block = readElementMetadata(el).archboard ?? {};
		const extra: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(block)) {
			if (!ARCHBOARD_KNOWN.has(key)) {
				extra[key] = value;
			}
		}
		const label = labelOfAll(el, all);
		if (fromNode && toNode) {
			const raw = el as unknown as Record<string, unknown>;
			edges.push({
				from: fromNode,
				to: toNode,
				...(label ? { label } : {}),
				...(typeof block.kind === "string" ? { kind: block.kind } : {}),
				elementId: el.id,
				type: el.type,
				...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
				...(raw["startArrowhead"] !== undefined
					? {
							startArrowhead:
								typeof raw["startArrowhead"] === "string" ? raw["startArrowhead"] : null,
						}
					: {}),
				...(raw["endArrowhead"] !== undefined
					? { endArrowhead: typeof raw["endArrowhead"] === "string" ? raw["endArrowhead"] : null }
					: {}),
				...(Object.keys(extra).length > 0 ? { extra } : {}),
				fromName: nodes.get(fromNode)?.name ?? fromNode,
				toName: nodes.get(toNode)?.name ?? toNode,
			});
			continue;
		}
		/**
		 *
		 */
		const endLabel = (id: string | undefined): string | undefined => {
			const endpoint = id === undefined ? undefined : byId.get(id);
			return endpoint === undefined ? undefined : labelOfAll(endpoint, all);
		};
		const fromLabel = endLabel(startId);
		const toLabel = endLabel(endId);
		let reason = `the ${fromNode ? "target" : "source"} end lands on an element that is not a node`;
		if (!startId && !endId) {
			reason = "drawn but bound to nothing at either end";
		} else if (!fromNode && !toNode) {
			reason = "both ends land on elements that are not nodes";
		}
		unresolved.push({
			elementId: el.id,
			type: el.type,
			...(label ? { label } : {}),
			...(fromNode ? { fromNode } : {}),
			...(toNode ? { toNode } : {}),
			...(fromLabel ? { fromLabel } : {}),
			...(toLabel ? { toLabel } : {}),
			reason,
		});
	}
	return { edges, unresolved, promotedConnectors };
}

export {
	type NodeModel,
	type EdgeModel,
	type NodeBuildResult,
	type EdgeBuildResult,
	formatBinding,
	bindingIdentity,
	buildNodes,
	buildEdges,
	labelOfAll,
};
