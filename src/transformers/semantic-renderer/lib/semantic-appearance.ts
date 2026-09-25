import { placingGroups, type SemanticNode } from "@/shared/semantic-board/index";
import {
	DEFAULT_SEMANTIC_POLICY,
	type PaletteColor,
	type SemanticPolicy,
} from "@/shared/semantic-policy/index";

/** The independent visual channels of a node in this reading. */
interface NodeAppearance {
	readonly container: boolean;
	/** Its body's colour: the colour of the group it is placed with (TASK-347). */
	readonly bodyColor?: PaletteColor | undefined;
	/** The group whose colour it takes, if any. */
	readonly group?: string | undefined;
	/** That group's name, as the vault configures it. */
	readonly groupName?: string | undefined;
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
 * Resolve each drawn subject's channels: its body takes the colour of the
 * group it is placed with, and its chip the colour of its type. A container
 * colours nothing inside it; that is a group's role (TASK-347).
 * @param nodes Subjects present in the drawing.
 * @param policy The current vault policy.
 * @returns Appearance keyed by existing subject identity.
 */
function nodeAppearances(
	nodes: readonly SemanticNode[],
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
): ReadonlyMap<string, NodeAppearance> {
	const parents = new Set(nodes.map((node) => node.parent));
	const placing = placingGroups(nodes, policy);
	const resolved = new Map<string, NodeAppearance>();
	for (const node of nodes) {
		const group = placing.get(node.id);
		const placed = group === undefined ? undefined : ownDefinition(policy.groups, group);
		resolved.set(node.id, {
			container: parents.has(node.id),
			bodyColor: placed?.color,
			group,
			groupName: placed?.name,
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
