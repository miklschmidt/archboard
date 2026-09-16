import type { SemanticNode } from "@/shared/semantic-board/index";
import {
	DEFAULT_SEMANTIC_POLICY,
	type PaletteColor,
	type SemanticPolicy,
} from "@/shared/semantic-policy/index";

/** The independent visual channels of a node in this reading. */
interface NodeAppearance {
	readonly container: boolean;
	readonly bodyColor?: PaletteColor | undefined;
	readonly scope?: string | undefined;
	readonly typeColor?: PaletteColor | undefined;
	readonly icon: string;
	readonly typeName: string;
	readonly typeKind: string;
}

/**
 * Read a configured definition without inheriting JavaScript prototype members.
 * @param definitions Consumer vocabulary table.
 * @param kind Authored vocabulary key.
 * @returns Its own definition, or no definition after removal.
 */
function ownDefinition<Definition>(
	definitions: Readonly<Record<string, Definition>>,
	kind: string,
): Definition | undefined {
	return Object.hasOwn(definitions, kind) ? definitions[kind] : undefined;
}

/**
 * Resolve containment from the final visible subjects, including comparison removals.
 * @param nodes Subjects present in the drawing.
 * @param policy The current vault policy.
 * @returns Appearance keyed by existing subject identity.
 */
function nodeAppearances(
	nodes: readonly SemanticNode[],
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
): ReadonlyMap<string, NodeAppearance> {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const parents = new Set(nodes.map((node) => node.parent));
	const resolved = new Map<string, NodeAppearance>();
	for (const node of nodes) {
		const container = parents.has(node.id);
		const { bodyColor, scope } = inheritedScope(
			container ? node : byId.get(node.parent ?? ""),
			byId,
			policy,
		);
		resolved.set(node.id, {
			container,
			bodyColor,
			scope,
			...typeAppearance(node.kind, policy),
		});
	}
	return resolved;
}

/**
 * Read a type independently of its current depiction and enclosing scope.
 * @param kind Authored node kind.
 * @param policy Current vault policy.
 * @returns Icon chip and type name, neutral for historical unknown kinds.
 */
function typeAppearance(
	kind: string,
	policy: SemanticPolicy,
): Pick<NodeAppearance, "typeColor" | "icon" | "typeName" | "typeKind"> {
	const type = ownDefinition(policy.nodeKinds, kind);
	return {
		typeColor: type?.color,
		icon: type?.icon ?? "RiQuestionLine",
		typeName: type?.name ?? kind,
		typeKind: kind,
	};
}

/**
 * Walk outward to the nearest colored visible container.
 * @param node First enclosing container, or the container itself.
 * @param nodes Visible node lookup.
 * @param policy Current vault policy.
 * @returns Named body color and the subject establishing it.
 */
function inheritedScope(
	node: SemanticNode | undefined,
	nodes: ReadonlyMap<string, SemanticNode>,
	policy: SemanticPolicy,
): Pick<NodeAppearance, "bodyColor" | "scope"> {
	let at = node;
	while (at !== undefined) {
		const bodyColor = ownDefinition(policy.nodeKinds, at.kind)?.color;
		if (bodyColor !== undefined) return { bodyColor, scope: at.id };
		at = nodes.get(at.parent ?? "");
	}
	return {};
}

/**
 * Resolve a relationship's semantic line grammar, independently of emphasis and standing.
 * @param kind Authored relationship kind.
 * @param policy Current vault policy.
 * @returns Configured appearance or an explicit neutral fallback.
 */
function relationshipAppearance(kind: string, policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY) {
	return (
		ownDefinition(policy.relationshipKinds, kind) ?? {
			name: kind,
			dash: "solid" as const,
			arrowhead: "filled" as const,
		}
	);
}

export { type NodeAppearance, nodeAppearances, relationshipAppearance };
