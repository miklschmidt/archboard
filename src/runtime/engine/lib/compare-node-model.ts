// The nodes and edges a comparison is about.
//
// `architecture` says which elements make up which node; this turns that into
// the flat model the diff joins on — one record per node and per connector,
// carrying the facts a change event will need to speak about.

import type { ServerElement } from "@/runtime/engine/types";
import { readElementMetadata } from "@/runtime/engine/metadata";
import type { ArchboardBlock, LogicalAddress } from "@/runtime/engine/metadata";
import { architectureLabel } from "@/runtime/board-inspection/architecture";
import type {
	ArchitectureConnector,
	ArchitectureFacts,
	ArchitectureNode,
} from "@/runtime/board-inspection/architecture";
import type { Box } from "@/runtime/engine/layout";
import type { EdgeFacts, UnresolvedConnector } from "@/runtime/engine/lib/compare-contract";

/**
 * The repo-and-branch address of a bound file.
 * @param binding The binding.
 * @returns The address.
 */
function bindingAddress(binding: LogicalAddress): string {
	const repo = binding.repo ? `${binding.repo}:` : "";
	const branch = binding.branch ? `@${binding.branch}` : "";
	return `${repo}${binding.path}${branch}`;
}

/**
 * A binding as a reader sees it, with the commit it was last confirmed at.
 * @param binding The binding, or the free-text one an older note carries.
 * @returns The text, or undefined when there is no binding.
 */
function formatBinding(binding: LogicalAddress | string | undefined): string | undefined {
	if (binding === undefined) {
		return undefined;
	}
	if (typeof binding === "string") {
		return binding.trim() || undefined;
	}
	const commit = binding.commit ? ` (${binding.commit.slice(0, 7)})` : "";
	return `${bindingAddress(binding)}${commit}`;
}

/**
 * What makes two bindings the same binding.
 *
 * Repo, path and branch: the address of the code. `commit` and `confirmedAt`
 * are when it was last *confirmed*, and re-promoting an unchanged node moves
 * both — treating that as a change would fill the diff with reconfirmation
 * noise. Both are still carried in the facts.
 * @param binding The binding, or the free-text one an older note carries.
 * @returns The identity, or undefined when there is no binding.
 */
function bindingIdentity(binding: LogicalAddress | string | undefined): string | undefined {
	if (binding === undefined) {
		return undefined;
	}
	if (typeof binding === "string") {
		return binding.trim() || undefined;
	}
	return bindingAddress(binding);
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

/** One connector that is itself a node, and the two nodes it joins. */
interface PromotedConnector {
	node: string;
	from: string;
	to: string;
}

/**
 * What one element says on the board, with its whitespace tidied.
 * @param el The element.
 * @param all Every element on the board, for a bound label.
 * @returns The words, or undefined when it shows none.
 */
function labelOfAll(el: ServerElement, all: readonly ServerElement[]): string | undefined {
	return architectureLabel(el, all);
}

/**
 * The archboard metadata this module does not already have a field for, so a
 * key somebody added by hand still reaches the diff.
 * @param block The element's archboard block.
 * @returns The remaining keys.
 */
function extraMetadata(block: ArchboardBlock): Record<string, unknown> {
	const extra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(block)) {
		if (!ARCHBOARD_KNOWN.has(key)) {
			extra[key] = value;
		}
	}
	return extra;
}

interface NodeBuildResult {
	nodeOfElement: Map<string, string>;
	models: NodeModel[];
	nodes: Map<string, NodeModel>;
}

/**
 * What a node says on the board: its primary element's label, else any of its
 * elements' labels.
 * @param fact What architecture knows about the node.
 * @param all Every element on the board.
 * @returns The label, or undefined when the node shows none.
 */
function nodeLabel(fact: ArchitectureNode, all: readonly ServerElement[]): string | undefined {
	return (
		labelOfAll(fact.primary, all) ?? fact.elements.map((el) => labelOfAll(el, all)).find(Boolean)
	);
}

/**
 * The first link any of a node's elements carries.
 * @param elements The node's elements.
 * @returns The link, or undefined when none of them has one.
 */
function nodeLink(elements: readonly ServerElement[]): string | undefined {
	return elements
		.map((el) => el.link)
		.find((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * The name a node was promoted under, as opposed to the one it shows.
 * @param block The node's archboard block.
 * @returns The declared name, or undefined.
 */
function declaredNameOf(block: ArchboardBlock): string | undefined {
	return typeof block.name === "string" && block.name ? block.name : undefined;
}

/**
 * What to call a node, and the two things that might have named it.
 *
 * The shown label wins over the declared name, because the board is the truth
 * and a stored name goes stale the moment somebody retypes the label.
 * @param label What the node shows, if anything.
 * @param declaredName What it was promoted under, if anything.
 * @param id Its node id, which always names it in the end.
 * @returns The naming fields.
 */
function nameFields(
	label: string | undefined,
	declaredName: string | undefined,
	id: string,
): Pick<NodeModel, "label" | "declaredName" | "name"> {
	return {
		...(label ? { label } : {}),
		...(declaredName ? { declaredName } : {}),
		name: label ?? declaredName ?? id,
	};
}

/**
 * The fields a node only has where its block states them.
 * @param block The node's archboard block.
 * @returns The stated fields.
 */
function statedFields(
	block: ArchboardBlock,
): Pick<NodeModel, "kind" | "level" | "variant" | "binding"> {
	return {
		...(typeof block.kind === "string" ? { kind: block.kind } : {}),
		...(typeof block.level === "string" ? { level: block.level } : {}),
		...(typeof block.variant === "string" ? { variant: block.variant } : {}),
		...(block.binding !== undefined ? { binding: block.binding } : {}),
	};
}

/**
 * One node as the diff models it.
 *
 * The arrangement fields start empty: where a node sits relative to the others
 * is a fact about the whole board, filled in once every node is known.
 * @param id The node id.
 * @param fact What architecture knows about the node.
 * @param all Every element on the board.
 * @returns The model.
 */
function nodeModelOf(id: string, fact: ArchitectureNode, all: readonly ServerElement[]): NodeModel {
	const label = nodeLabel(fact, all);
	const link = nodeLink(fact.elements);
	return {
		node: id,
		elements: [...fact.elements],
		primary: fact.primary,
		...nameFields(label, declaredNameOf(fact.metadata), id),
		...statedFields(fact.metadata),
		...(link ? { link } : {}),
		extra: extraMetadata(fact.metadata),
		box: fact.aggregateNodeFootprint,
		clusterId: null,
		container: null,
		group: null,
		region: "centre",
		prominence: "typical",
		out: [],
		in: [],
	};
}

/**
 * Every node on the board, as the diff models them.
 * @param facts What architecture read off the board.
 * @returns The models, by id, and which node each element belongs to.
 */
function buildNodes(facts: ArchitectureFacts): NodeBuildResult {
	const models: NodeModel[] = [];
	for (const [id, fact] of facts.nodes) {
		models.push(nodeModelOf(id, fact, facts.elements));
	}
	const nodes = new Map(models.map((model) => [model.node, model]));
	return { nodeOfElement: new Map(facts.nodeOfElement), models, nodes };
}

interface EdgeBuildResult {
	edges: EdgeModel[];
	unresolved: UnresolvedConnector[];
	promotedConnectors: PromotedConnector[];
}

/** One connector's two ends, resolved to the nodes they land on. */
interface ConnectorEnds {
	fromNode: string | undefined;
	toNode: string | undefined;
}

/** A connector whose ends both landed on a node, so it is an edge. */
interface ResolvedEnds {
	fromNode: string;
	toNode: string;
}

/**
 * Which nodes a connector's two ends land on.
 * @param connector The connector.
 * @param nodeOfElement Which node each element belongs to.
 * @returns The two ends.
 */
function endsOf(
	connector: ArchitectureConnector,
	nodeOfElement: ReadonlyMap<string, string>,
): ConnectorEnds {
	return {
		fromNode: connector.startTargetId ? nodeOfElement.get(connector.startTargetId) : undefined,
		toNode: connector.endTargetId ? nodeOfElement.get(connector.endTargetId) : undefined,
	};
}

/**
 * A connector that is itself part of a node, and joins two other nodes.
 *
 * It is not an edge — it belongs to a node — but the relationship it draws is
 * still worth reporting, so the board's own arrows do not silently disappear
 * from the diff when somebody promotes one.
 * @param connector The connector.
 * @param ends Which nodes its ends land on.
 * @param into The list to add it to.
 */
function collectPromoted(
	connector: ArchitectureConnector,
	ends: ConnectorEnds,
	into: PromotedConnector[],
): void {
	const { ownerNodeId } = connector;
	if (!ownerNodeId || !ends.fromNode || !ends.toNode || ends.fromNode === ends.toNode) {
		return;
	}
	into.push({ node: ownerNodeId, from: ends.fromNode, to: ends.toNode });
}

/**
 * One field a connector only carries on some element types.
 * @param el The connector element.
 * @param key The field to read.
 * @returns Its value, unvalidated.
 */
function connectorField(el: ServerElement, key: string): unknown {
	return Reflect.get(el, key);
}

/**
 * The arrowheads a connector draws, present only where it states them.
 *
 * A stated non-string arrowhead reads as null, which is how Excalidraw spells
 * "this end has none" and is a different fact from never having said.
 * @param el The connector element.
 * @returns The arrowhead fields.
 */
function arrowheadFields(el: ServerElement): Pick<EdgeFacts, "startArrowhead" | "endArrowhead"> {
	const start = connectorField(el, "startArrowhead");
	const end = connectorField(el, "endArrowhead");
	return {
		...(start !== undefined ? { startArrowhead: typeof start === "string" ? start : null } : {}),
		...(end !== undefined ? { endArrowhead: typeof end === "string" ? end : null } : {}),
	};
}

/**
 * What to call one node out loud.
 * @param nodes Every node on the board.
 * @param id The node id.
 * @returns Its name, falling back to the id.
 */
function nodeName(nodes: ReadonlyMap<string, NodeModel>, id: string): string {
	return nodes.get(id)?.name ?? id;
}

/**
 * One connector as an edge between two nodes.
 * @param el The connector element.
 * @param block Its archboard block.
 * @param label What it says, if anything.
 * @param ends The nodes it joins.
 * @param nodes Every node on the board, for their names.
 * @returns The edge.
 */
function edgeOf(
	el: ServerElement,
	block: ArchboardBlock,
	label: string | undefined,
	ends: ResolvedEnds,
	nodes: ReadonlyMap<string, NodeModel>,
): EdgeModel {
	const extra = extraMetadata(block);
	return {
		from: ends.fromNode,
		to: ends.toNode,
		...(label ? { label } : {}),
		...(typeof block.kind === "string" ? { kind: block.kind } : {}),
		elementId: el.id,
		type: el.type,
		strokeStyle: el.strokeStyle,
		...arrowheadFields(el),
		...(Object.keys(extra).length > 0 ? { extra } : {}),
		fromName: nodeName(nodes, ends.fromNode),
		toName: nodeName(nodes, ends.toNode),
	};
}

/**
 * What the element at one end of a connector says, when it is not a node.
 * @param id The element the end is bound to, if any.
 * @param facts What architecture read off the board.
 * @returns The label, or undefined.
 */
function endLabel(id: string | undefined, facts: ArchitectureFacts): string | undefined {
	const endpoint = id === undefined ? undefined : facts.byId.get(id);
	return endpoint === undefined ? undefined : labelOfAll(endpoint, facts.elements);
}

/**
 * Which end of a connector is the one that did not land on a node.
 * @param ends Which nodes its ends land on.
 * @returns "target" or "source".
 */
function danglingEnd(ends: ConnectorEnds): string {
	return ends.fromNode ? "target" : "source";
}

/**
 * Why a connector could not become an edge, in words a reader can act on.
 * @param connector The connector.
 * @param ends Which nodes its ends land on.
 * @returns The reason.
 */
function unresolvedReason(connector: ArchitectureConnector, ends: ConnectorEnds): string {
	if (!connector.startTargetId && !connector.endTargetId) {
		return "drawn but bound to nothing at either end";
	}
	if (!ends.fromNode && !ends.toNode) {
		return "both ends land on elements that are not nodes";
	}
	return `the ${danglingEnd(ends)} end lands on an element that is not a node`;
}

/**
 * What each end is attached to when it is not a node, in whatever terms exist.
 * @param fromLabel What the source end's element says.
 * @param toLabel What the target end's element says.
 * @returns The label fields, each present only where there is one.
 */
function endLabelFields(
	fromLabel: string | undefined,
	toLabel: string | undefined,
): Pick<UnresolvedConnector, "fromLabel" | "toLabel"> {
	return {
		...(fromLabel ? { fromLabel } : {}),
		...(toLabel ? { toLabel } : {}),
	};
}

/**
 * One connector that could not become an edge, reported rather than dropped:
 * an arrow somebody drew is a statement, even when it does not land on nodes.
 * @param connector The connector.
 * @param ends Which nodes its ends land on.
 * @param label What it says, if anything.
 * @param facts What architecture read off the board.
 * @returns The report.
 */
function unresolvedOf(
	connector: ArchitectureConnector,
	ends: ConnectorEnds,
	label: string | undefined,
	facts: ArchitectureFacts,
): UnresolvedConnector {
	const el = connector.element;
	return {
		elementId: el.id,
		type: el.type,
		...(label ? { label } : {}),
		...(ends.fromNode ? { fromNode: ends.fromNode } : {}),
		...(ends.toNode ? { toNode: ends.toNode } : {}),
		...endLabelFields(
			endLabel(connector.startTargetId, facts),
			endLabel(connector.endTargetId, facts),
		),
		reason: unresolvedReason(connector, ends),
	};
}

/**
 * Sort one connector into an edge or a report of why it is not one.
 * @param connector The connector.
 * @param ends Which nodes its ends land on.
 * @param facts What architecture read off the board.
 * @param nodes Every node on the board.
 * @param edges The edges so far.
 * @param unresolved The reports so far.
 */
function collectEdge(
	connector: ArchitectureConnector,
	ends: ConnectorEnds,
	facts: ArchitectureFacts,
	nodes: ReadonlyMap<string, NodeModel>,
	edges: EdgeModel[],
	unresolved: UnresolvedConnector[],
): void {
	const el = connector.element;
	const block = readElementMetadata(el).archboard ?? {};
	const label = labelOfAll(el, facts.elements);
	if (ends.fromNode && ends.toNode) {
		edges.push(edgeOf(el, block, label, { fromNode: ends.fromNode, toNode: ends.toNode }, nodes));
		return;
	}
	unresolved.push(unresolvedOf(connector, ends, label, facts));
}

/**
 * Every connector on the board, sorted into the edges the diff joins on, the
 * ones that are themselves nodes, and the ones that land nowhere.
 * @param facts What architecture read off the board.
 * @param nodes Every node on the board.
 * @param nodeOfElement Which node each element belongs to.
 * @returns The three lists.
 */
function buildEdges(
	facts: ArchitectureFacts,
	nodes: Map<string, NodeModel>,
	nodeOfElement: Map<string, string>,
): EdgeBuildResult {
	const edges: EdgeModel[] = [];
	const unresolved: UnresolvedConnector[] = [];
	const promotedConnectors: PromotedConnector[] = [];
	for (const connector of facts.connectors) {
		const ends = endsOf(connector, nodeOfElement);
		if (connector.ownerNodeId) {
			collectPromoted(connector, ends, promotedConnectors);
			continue;
		}
		collectEdge(connector, ends, facts, nodes, edges, unresolved);
	}
	return { edges, unresolved, promotedConnectors };
}

export {
	type NodeModel,
	type EdgeModel,
	type NodeBuildResult,
	type EdgeBuildResult,
	type PromotedConnector,
	formatBinding,
	bindingIdentity,
	buildNodes,
	buildEdges,
	labelOfAll,
};
