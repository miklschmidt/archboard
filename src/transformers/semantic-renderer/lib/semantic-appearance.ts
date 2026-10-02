import { placingGroups, type SemanticEdge, type SemanticNode } from "@/shared/semantic-board/index";
import type { LineLook } from "@/transformers/semantic-renderer/lib/drawing";
import {
	drillDirection,
	type DrillDirection,
} from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import {
	DEFAULT_SEMANTIC_POLICY,
	type PaletteColor,
	type SemanticPolicy,
} from "@/shared/semantic-policy/index";

/** The independent visual channels of a node in this reading. */
interface NodeAppearance {
	readonly container: boolean;
	/** Its body's colour: a card's placing group's, a container's own kind's (ADR 0038). */
	readonly bodyColor?: PaletteColor | undefined;
	/** The group whose colour a card takes, if any. */
	readonly group?: string | undefined;
	readonly typeColor?: PaletteColor | undefined;
	readonly icon: string;
	readonly typeName: string;
	readonly typeKind: string;
	/** Which way the board it opens lies, or null when it opens none. */
	readonly drill: DrillDirection | null;
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
 * Resolve each drawn subject's channels: a card's body takes the colour of
 * the group it is placed with, a container's frame the colour of its own
 * kind, and every chip the colour of its type. A container colours nothing
 * inside it; that is a group's role (TASK-347, ADR 0038).
 * A part that opens another board says which way it lies (`drill`), read from
 * its kind against the board's own level (ADR 0029).
 * @param nodes Subjects present in the drawing.
 * @param policy The current vault policy.
 * @param level The level of the board drawn, when the caller said.
 * @returns Appearance keyed by existing subject identity.
 */
function nodeAppearances(
	nodes: readonly SemanticNode[],
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
	level?: string,
): ReadonlyMap<string, NodeAppearance> {
	const parents = new Set(nodes.map((node) => node.parent));
	const placing = placingGroups(nodes, policy);
	const resolved = new Map<string, NodeAppearance>();
	for (const node of nodes) {
		const type = {
			...typeAppearance(node.kind, policy),
			drill: node.drillDown === undefined ? null : drillDirection(node.kind, level, policy.levels),
		};
		resolved.set(
			node.id,
			parents.has(node.id)
				? { container: true, bodyColor: type.typeColor, ...type }
				: { container: false, ...groupColour(placing.get(node.id), policy), ...type },
		);
	}
	return resolved;
}

/**
 * A card's body colour: its placing group's.
 * @param group The group that places it, if any.
 * @param policy The current vault policy.
 * @returns The group and its colour, or nothing for a card no group places.
 */
function groupColour(
	group: string | undefined,
	policy: SemanticPolicy,
): Pick<NodeAppearance, "bodyColor" | "group"> {
	const placed = group === undefined ? undefined : ownDefinition(policy.groups, group);
	return { bodyColor: placed?.color, group };
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
 * How a flow step reads on the board: dashed with an open head, in the neutral
 * ink, so it is never mistaken for an authored relationship of any kind.
 */
const STEP_APPEARANCE = {
	name: "Step",
	color: undefined,
	dash: "dashed",
	arrowhead: "open",
} as const;

/**
 * Resolve a relationship's semantic line grammar, independently of emphasis and standing.
 * @param kind Authored relationship kind.
 * @param policy Current vault policy.
 * @returns Configured appearance or an explicit neutral fallback.
 */
function relationshipAppearance(
	kind: string,
	policy: Pick<SemanticPolicy, "relationshipKinds"> = DEFAULT_SEMANTIC_POLICY,
) {
	return (
		ownDefinition(policy.relationshipKinds, kind) ?? {
			name: kind,
			dash: "solid" as const,
			arrowhead: "filled" as const,
		}
	);
}

/**
 * How a drawn line reads: a flow step in its own appearance, a relationship in its kind's.
 * @param kind The line's relationship kind.
 * @param policy Current vault policy.
 * @param step Whether the line is a flow step.
 * @returns The appearance.
 */
function lineAppearance(
	kind: string,
	policy: Pick<SemanticPolicy, "relationshipKinds">,
	step: boolean,
) {
	return step ? STEP_APPEARANCE : relationshipAppearance(kind, policy);
}

/**
 * How each line is drawn, by relationship id, as the vault's policy says.
 * @param edges The lines.
 * @param policy The vault's relationship kinds.
 * @param steps The lines that are flow steps drawn on the board.
 * @returns Each line's dash and head.
 */
function lineLooks(
	edges: readonly SemanticEdge[],
	policy: Pick<SemanticPolicy, "relationshipKinds">,
	steps: ReadonlySet<string>,
): ReadonlyMap<string, LineLook> {
	return new Map(
		edges.map((edge) => {
			const { dash, arrowhead } = lineAppearance(edge.kind, policy, steps.has(edge.id));
			return [edge.id, { dash, arrowhead }];
		}),
	);
}

export { type NodeAppearance, nodeAppearances, lineAppearance, lineLooks, relationshipAppearance };
