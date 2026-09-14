// Asking a board what one group is: who belongs, how they reach each other,
// and where the group's edge runs.
//
// The answer is derived from the saved board and the vault policy by the same
// pure inspection the browser runs over the same document, so a command line
// and a pane looking at one variant say the same thing about one group. It
// reads the whole variant before any view narrows it, and it needs no browser:
// the canvas holds the board and the policy, and that is all it asks for.

import { z } from "zod";
import {
	inspectGroup,
	groupsUsed,
	resolveVariant,
	RenderedVariantSchema,
	type GroupInspection,
	type SemanticBoard,
	type SemanticEdge,
	type SemanticNode,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { VaultDiagnosticSchema, type SemanticPolicy } from "@/shared/semantic-policy/index";
import {
	checkSemanticVaultOnCanvas,
	readSemanticBoardAnswerOnCanvas,
} from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { SelectorSchema } from "@/cli/commands/lib/semantic-input";

const InspectInputSchema = z.object({
	name: z.string(),
	group: SelectorSchema,
	variant: SelectorSchema.optional(),
});

/** One node as the inspection names it: enough to find it on the board. */
const InspectedNodeSchema = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.string(),
	parent: z.string().nullable(),
	groups: z.array(z.string()),
});

/** One relationship as the inspection names it. */
const InspectedEdgeSchema = z.object({
	id: z.string(),
	from: z.string(),
	to: z.string(),
	kind: z.string(),
	label: z.string().nullable(),
});

const GroupInspectionResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	variant: RenderedVariantSchema,
	group: z.object({
		id: z.string(),
		/** What the vault calls it, or null when the configuration no longer defines it. */
		name: z.string().nullable(),
		configured: z.boolean(),
	}),
	members: z.array(InspectedNodeSchema),
	internalEdges: z.array(InspectedEdgeSchema),
	boundaryEdges: z.array(
		InspectedEdgeSchema.extend({
			direction: z.enum(["incoming", "outgoing"]),
			member: z.string(),
			neighbor: z.string(),
		}),
	),
	neighbors: z.array(InspectedNodeSchema),
	warnings: z.array(VaultDiagnosticSchema),
});
type GroupInspectionResult = z.infer<typeof GroupInspectionResultSchema>;

const unknownGroupRefusal = {
	code: "UNKNOWN_GROUP",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The group is neither configured in the vault nor a membership of any node on the variant.",
};

/**
 * One node, as the answer carries it.
 * @param node The node.
 * @returns Its identity, kind, container and memberships.
 */
function inspectedNode(node: SemanticNode): z.infer<typeof InspectedNodeSchema> {
	return {
		id: node.id,
		name: node.name,
		kind: node.kind,
		parent: node.parent ?? null,
		groups: node.groups ?? [],
	};
}

/**
 * One relationship, as the answer carries it.
 * @param edge The relationship.
 * @returns Its identity, ends, kind and label.
 */
function inspectedEdge(edge: SemanticEdge): z.infer<typeof InspectedEdgeSchema> {
	return { id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label ?? null };
}

/**
 * The answer, assembled from the inspection and what the vault says the group is.
 * @param board The board as read.
 * @param variant The variant inspected, resolved.
 * @param variant.id Its id.
 * @param variant.name Its name.
 * @param variant.lifecycle Where it stands.
 * @param inspection What the group is on that variant.
 * @param policy The vault's policy, for the group's name.
 * @param warnings What the read warned about.
 * @returns The result.
 */
function answered(
	board: SemanticBoard,
	variant: { id: string; name: string; lifecycle: "current" | "draft" | "historical" },
	inspection: GroupInspection,
	policy: SemanticPolicy,
	warnings: GroupInspectionResult["warnings"],
): GroupInspectionResult {
	const defined = Object.hasOwn(policy.groups, inspection.group)
		? policy.groups[inspection.group]
		: undefined;
	return {
		success: true,
		board: board.name,
		version: board.version,
		variant,
		group: { id: inspection.group, name: defined?.name ?? null, configured: defined !== undefined },
		members: inspection.members.map(inspectedNode),
		internalEdges: inspection.internalEdges.map(inspectedEdge),
		boundaryEdges: inspection.boundaryEdges.map((boundary) => ({
			...inspectedEdge(boundary.edge),
			direction: boundary.direction,
			member: boundary.member,
			neighbor: boundary.neighbor,
		})),
		neighbors: inspection.neighbors.map(inspectedNode),
		warnings,
	};
}

/**
 * What to say about the answer on standard error, for a person.
 * @param result The answer.
 * @returns The lines.
 */
function described(result: GroupInspectionResult): string[] {
	const called =
		result.group.name === null ? result.group.id : `${result.group.name} (${result.group.id})`;
	const lines = [
		`Group ${called} on "${result.board}" at "${result.variant.name}": ` +
			`${result.members.length} member(s), ${result.internalEdges.length} internal, ` +
			`${result.boundaryEdges.length} boundary relationship(s), ${result.neighbors.length} neighbor(s).`,
	];
	if (!result.group.configured) {
		lines.push(
			`Warning: "${result.group.id}" is not defined under groups in .archboard/config.yaml; ` +
				"define it to name it, or move its members to a configured group.",
		);
	}
	if (result.group.configured && result.members.length === 0) {
		lines.push(`No node of "${result.variant.name}" belongs to it yet.`);
	}
	return lines;
}

/**
 * The variant the command named, or the board's current one.
 * @param board The board as read.
 * @param asked The variant id or name typed, if any.
 * @returns The variant.
 * @throws {CliUsageError} When the board has no such variant.
 */
function askedVariant(board: SemanticBoard, asked: string | undefined): SemanticVariant {
	const variant = resolveVariant(board, asked);
	if (variant === undefined) {
		throw new CliUsageError(`"${board.name}" has no variant called "${asked ?? ""}"`);
	}
	return variant;
}

/**
 * Refuse an id that is neither a configured group nor a membership of any
 * node: there is nothing for it to be. A configured group nobody has joined
 * is not refused, and neither is an id the configuration dropped while nodes
 * still carry it — both are real things a reader has to be able to ask about.
 * @param policy The vault's policy.
 * @param variant The variant inspected.
 * @param inspection What the id turned out to be on it.
 * @throws {CliUsageError} When the id is nothing at all.
 */
function refuseUnknownGroup(
	policy: SemanticPolicy,
	variant: SemanticVariant,
	inspection: GroupInspection,
): void {
	if (Object.hasOwn(policy.groups, inspection.group) || inspection.members.length > 0) {
		return;
	}
	const configured = Object.keys(policy.groups).join(", ") || "none";
	const used = groupsUsed(variant.content).join(", ") || "none";
	throw new CliUsageError(
		`"${inspection.group}" is not a group: it is not defined under groups in .archboard/config.yaml ` +
			`and no node of "${variant.name}" belongs to it. Configured: ${configured}. ` +
			`Used on this variant: ${used}.`,
	);
}

const semanticInspectContract = defineCommand({
	path: ["semantic", "inspect"],
	shared: ["url"],
	summary: "Inspect one configured group of a semantic board",
	description:
		"Reports one group of one variant: its explicit members, the relationships between them, " +
		"the relationships crossing its boundary with their direction, and the immediate external " +
		"neighbors those reach. Read over the whole variant before any view narrows it, so a member " +
		"a view hides is still a member. A group the configuration defines but nobody has joined " +
		"answers empty; an id that is neither configured nor a membership of any node is refused.",
	examples: [
		"archboard semantic inspect payments --group fulfillment",
		'archboard semantic inspect payments --group billing --variant "Read cache"',
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
		},
		{
			kind: "option",
			key: "group",
			spellings: ["--group"],
			value: "required",
			placeholder: "id",
			required: true,
			description: "The configured group id to inspect",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: "Which variant to inspect, by id or name; the current one when absent",
		},
	],
	input: { ingress: InspectInputSchema },
	result: GroupInspectionResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The group as it stands on that variant",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the inspection.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, unknownGroupRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "The board the group is read off",
		},
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "one",
			description: "The vault policy that names the group",
		},
	],
	/**
	 * Inspect the group.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The group as it stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic inspect");
		const answer = await readSemanticBoardAnswerOnCanvas(input.name);
		const variant = askedVariant(answer.board, input.variant);
		const { policy } = await checkSemanticVaultOnCanvas();
		const inspection = inspectGroup(variant.content, input.group);
		refuseUnknownGroup(policy, variant, inspection);
		const result = answered(
			answer.board,
			{ id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
			inspection,
			policy,
			answer.warnings,
		);
		return {
			result,
			diagnostics: [
				...answer.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
				...described(result),
			],
		};
	},
});

export { semanticInspectContract, GroupInspectionResultSchema, type GroupInspectionResult };
