// Checks about what one variant's content says: nodes, containment, bindings,
// relationships, groups, traffic and drill-downs. Each reads the saved board
// and nothing else, and says what it found either way.

import {
	EdgeTrafficSchema,
	effectiveTraffic,
	type DrillDown,
	type SemanticNode,
	type VariantContent,
} from "@/shared/semantic-board/index";
import {
	edgesBetween,
	finding,
	isFinding,
	located,
	nodeNamed,
	type Finding,
	type Reading,
} from "@/runtime/skill-evaluation/lib/reading";
import type { OutcomeCheck } from "@/runtime/skill-evaluation/lib/suite";

type Check = (check: OutcomeCheck, content: VariantContent) => Finding;

/**
 * Runs one content check after locating the variant it names.
 * @param check The check.
 * @param reading The reading.
 * @param run What to conclude from the content.
 * @returns The finding.
 */
function onContent(check: OutcomeCheck, reading: Reading, run: Check): Finding {
	const at = located(reading, check.board, check.variant);
	return isFinding(at) ? at : run(check, at.variant.content);
}

/**
 * Whether every named node is present.
 * @param check Names to find.
 * @param content The content.
 * @returns The finding.
 */
const nodesNamed: Check = (check, content) => {
	const missing = (check.names ?? []).filter((name) => nodeNamed(content, name) === undefined);
	return finding(
		missing.length === 0,
		missing.length === 0 ? "every named node is present" : `missing nodes: ${missing.join(", ")}`,
	);
};

/**
 * Whether every named node is absent.
 * @param check Names that must be gone.
 * @param content The content.
 * @returns The finding.
 */
const nodesAbsent: Check = (check, content) => {
	const present = (check.names ?? []).filter((name) => nodeNamed(content, name) !== undefined);
	return finding(
		present.length === 0,
		present.length === 0 ? "every named node is absent" : `still present: ${present.join(", ")}`,
	);
};

/**
 * Whether the node count is within bounds.
 * @param check The bounds.
 * @param content The content.
 * @returns The finding.
 */
const nodeCount: Check = (check, content) => {
	const count = content.nodes.length;
	const low = check.min ?? 0;
	const high = check.max ?? Number.POSITIVE_INFINITY;
	return finding(
		count >= low && count <= high,
		`${count} nodes (wanted ${low}..${Number.isFinite(high) ? high : "∞"})`,
	);
};

/**
 * Whether a named container holds enough children.
 * @param check The container and the minimum.
 * @param content The content.
 * @returns The finding.
 */
const containerHasChildren: Check = (check, content) => {
	const container = nodeNamed(content, check.container ?? "");
	if (container === undefined) return finding(false, `container "${check.container}" is missing`);
	const children = content.nodes.filter((node) => node.parent === container.id).length;
	const least = check.min ?? 1;
	return finding(
		children >= least,
		`"${check.container}" holds ${children} children (wanted ≥ ${least})`,
	);
};

/**
 * Whether enough nodes are bound under a path prefix.
 * @param check The minimum and the prefix.
 * @param content The content.
 * @returns The finding.
 */
const bindingCount: Check = (check, content) => {
	const prefix = check.pathPrefix ?? "";
	const bound = content.nodes.filter((node) => node.binding?.path.startsWith(prefix)).length;
	const least = check.min ?? 1;
	return finding(
		bound >= least,
		`${bound} nodes bound under ${prefix || "any path"} (wanted ≥ ${least})`,
	);
};

/**
 * Whether no relationship ends on a container that has children: the
 * actual-receiver rule.
 * @param _check Unused.
 * @param content The content.
 * @returns The finding.
 */
const noEdgeToContainer: Check = (_check, content) => {
	const containers = new Set(
		content.nodes.flatMap((node) => (node.parent === undefined ? [] : [node.parent])),
	);
	const offending = content.edges.filter((edge) => containers.has(edge.to));
	return finding(
		offending.length === 0,
		offending.length === 0
			? "every relationship ends on a leaf"
			: `${offending.length} relationships land on a container: ${offending.map((edge) => edge.id).join(", ")}`,
	);
};

/**
 * Whether a relationship exists between two named nodes, of a kind when asked.
 * @param check The ends and the kind.
 * @param content The content.
 * @returns The finding.
 */
const edgeBetween: Check = (check, content) => {
	const edges = edgesBetween(content, check.from ?? "", check.to ?? "");
	const matching = edges.filter((edge) => check.kind === undefined || edge.kind === check.kind);
	return finding(
		matching.length > 0,
		`${matching.length} ${check.kind ?? ""} relationships ${check.from} -> ${check.to}`,
	);
};

/**
 * Whether no relationship exists between two named nodes.
 * @param check The ends.
 * @param content The content.
 * @returns The finding.
 */
const noEdgeBetween: Check = (check, content) => {
	const edges = edgesBetween(content, check.from ?? "", check.to ?? "");
	return finding(edges.length === 0, `${edges.length} relationships ${check.from} -> ${check.to}`);
};

/**
 * A node the check names, or a failure.
 * @param check The check.
 * @param content The content.
 * @returns The node or a finding.
 */
function nodeOf(check: OutcomeCheck, content: VariantContent): SemanticNode | Finding {
	return nodeNamed(content, check.node ?? "") ?? finding(false, `node "${check.node}" is missing`);
}

/**
 * Runs a check that needs one named node.
 * @param check The check.
 * @param content The content.
 * @param judge What to conclude from the node.
 * @returns The finding.
 */
function onNode(
	check: OutcomeCheck,
	content: VariantContent,
	judge: (node: SemanticNode) => Finding,
): Finding {
	const node = nodeOf(check, content);
	return isFinding(node) ? node : judge(node);
}

/**
 * Whether a node's binding names a path.
 * @param check The node and the path fragment.
 * @param content The content.
 * @returns The finding.
 */
const nodeBinding: Check = (check, content) =>
	onNode(check, content, (node) => {
		const bound = node.binding ?? { repo: "nothing", path: "-" };
		return finding(
			bound.path.includes(check.pathIncludes ?? ""),
			`"${check.node}" is bound to ${bound.repo}:${bound.path}`,
		);
	});

/**
 * Whether a node has exactly the stated group memberships.
 * @param check The node and the groups.
 * @param content The content.
 * @returns The finding.
 */
const nodeGroups: Check = (check, content) =>
	onNode(check, content, (node) => {
		const actual = [...(node.groups ?? [])].toSorted();
		const wanted = [...(check.groups ?? [])].toSorted();
		return finding(
			JSON.stringify(actual) === JSON.stringify(wanted),
			`"${check.node}" belongs to [${actual.join(", ")}] (wanted [${wanted.join(", ")}])`,
		);
	});

/**
 * Whether a node's parent is the named node.
 * @param check The node and its parent.
 * @param content The content.
 * @returns The finding.
 */
const nodeParent: Check = (check, content) =>
	onNode(check, content, (node) => {
		const parent = content.nodes.find((candidate) => candidate.id === node.parent);
		return finding(
			parent?.name === check.parent,
			`"${check.node}" is inside ${parent?.name ?? "nothing"}`,
		);
	});

/**
 * Whether a node has the stated kind.
 * @param check The node and the kind.
 * @param content The content.
 * @returns The finding.
 */
const nodeKind: Check = (check, content) =>
	onNode(check, content, (node) =>
		finding(node.kind === check.kind, `"${check.node}" is a ${node.kind}`),
	);

/**
 * One field of a node, by name.
 * @param node The node.
 * @param field The field's name.
 * @returns Its value, or undefined.
 */
function fieldOf(node: SemanticNode, field: string | undefined): unknown {
	const fields: Record<string, unknown> = { ...node };
	return field === undefined ? undefined : fields[field];
}

/**
 * Whether a node's field holds the expected value.
 * @param check The node, field and value.
 * @param content The content.
 * @returns The finding.
 */
const nodeFieldEquals: Check = (check, content) =>
	onNode(check, content, (node) => {
		const value = fieldOf(node, check.field);
		return finding(
			JSON.stringify(value) === JSON.stringify(check.expected),
			`"${check.node}".${check.field} = ${JSON.stringify(value)}`,
		);
	});

/**
 * Whether a drill-down selector is the one the check wants.
 * @param link The node's link.
 * @param check The check.
 * @returns True when board and selector match.
 */
function drillDownMatches(link: DrillDown | undefined, check: OutcomeCheck): boolean {
	if (link === undefined || link.board !== check.target || link.variant.kind !== check.variantKind)
		return false;
	return link.variant.kind === "current" || link.variant.name === check.variantName;
}

/**
 * Whether a node links down to the named board and variant selector.
 * @param check The node, board and selector.
 * @param content The content.
 * @returns The finding.
 */
const nodeDrillDown: Check = (check, content) =>
	onNode(check, content, (node) =>
		finding(
			drillDownMatches(node.drillDown, check),
			`"${check.node}" links to ${JSON.stringify(node.drillDown ?? null)}`,
		),
	);

/**
 * The effective traffic a check wants.
 * @param spec The check's traffic: off, default, or stated values.
 * @returns The effective values, or undefined for off.
 */
function wantedTraffic(spec: OutcomeCheck["traffic"]): ReturnType<typeof effectiveTraffic> {
	if (spec === "off" || spec === undefined) return undefined;
	return effectiveTraffic(EdgeTrafficSchema.parse(spec === "default" ? {} : spec));
}

/**
 * Whether the traffic on a relationship is off, at the defaults, or at stated values.
 * @param check The ends and the expected traffic.
 * @param content The content.
 * @returns The finding.
 */
const edgeTraffic: Check = (check, content) => {
	const [edge] = edgesBetween(content, check.from ?? "", check.to ?? "");
	if (edge === undefined) return finding(false, `no relationship ${check.from} -> ${check.to}`);
	const actual = effectiveTraffic(edge.traffic);
	return finding(
		JSON.stringify(actual) === JSON.stringify(wantedTraffic(check.traffic)),
		`traffic on ${check.from} -> ${check.to} is ${JSON.stringify(actual ?? "off")}`,
	);
};

const OWNERS: Partial<Record<OutcomeCheck["check"], Check>> = {
	"nodes-named": nodesNamed,
	"nodes-absent": nodesAbsent,
	"node-count-at-least": nodeCount,
	"node-count-between": nodeCount,
	"container-has-children": containerHasChildren,
	"binding-count-at-least": bindingCount,
	"no-edge-to-container-with-children": noEdgeToContainer,
	"edge-between": edgeBetween,
	"no-edge-between": noEdgeBetween,
	"node-binding": nodeBinding,
	"node-groups": nodeGroups,
	"node-parent": nodeParent,
	"node-kind": nodeKind,
	"node-field-equals": nodeFieldEquals,
	"node-drilldown": nodeDrillDown,
	"edge-traffic": edgeTraffic,
};

/**
 * The content checks by name.
 * @param check The check.
 * @param reading The reading.
 * @returns The finding, or undefined when this file owns no such check.
 */
function boardCheck(check: OutcomeCheck, reading: Reading): Finding | undefined {
	const owner = OWNERS[check.check];
	return owner === undefined ? undefined : onContent(check, reading, owner);
}

export { boardCheck, fieldOf };
