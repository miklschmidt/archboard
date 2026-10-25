// Asking a board what one group is (who belongs, how they reach each other,
// and where the group's edge runs) or what one container's interface is (which
// of its children relationships from outside reach, and who calls it).
//
// Each answer is derived from the saved board by a pure inspection in the
// shared model, so a command line and a pane that read it over one variant say
// the same thing. It reads the whole variant before any view narrows it, and it
// needs no browser: the server holds the board, and that is all it asks for. A
// group's name comes from the vault policy.

import { z } from "zod";
import { inspectGroup, groupsUsed } from "@archboard/board/content";
import { RenderedVariantSchema } from "@archboard/board/render-reply";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import {
	diagnosticLine,
	VaultDiagnosticSchema,
	type SemanticPolicy,
} from "@archboard/board/policy";
import {
	checkSemanticVaultOnServer,
	readSemanticBoardAnswerOnServer,
} from "#cli/clients/server/semantic-boards.ts";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	askedVariant,
	SelectorSchema,
	UNNAMED_VARIANT,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	InspectedEdgeSchema,
	InspectedNodeSchema,
	inspectedEdge,
	inspectedNode,
} from "#cli/rules/semantic/inspect/inspected-subjects.ts";
import {
	ContainerInspectionResultSchema,
	containerAnswer,
	describedContainer,
	inspectedContainer,
} from "#cli/rules/semantic/inspect/container-inspection.ts";

type GroupInspection = ReturnType<typeof inspectGroup>;

const InspectInputSchema = z.object({
	name: z.string(),
	group: SelectorSchema.optional(),
	container: SelectorSchema.optional(),
	variant: SelectorSchema.optional(),
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

const unknownContainerRefusal = {
	code: "UNKNOWN_CONTAINER",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The container names no node of the variant, or a name that fits more than one node. " +
		"Use the id. A node with no children is not refused: the answer says that it holds no parts.",
};

const unknownGroupRefusal = {
	code: "UNKNOWN_GROUP",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The group is neither configured in the vault nor a membership of any node on the variant.",
};

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
	variant: { id: string; name: string; lifecycle: SemanticVariant["lifecycle"] },
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
			`warning: "${result.group.id}" is not defined under groups in .archboard/config.yaml; ` +
				"define it to name it, or move its members to a configured group.",
		);
	}
	if (result.group.configured && result.members.length === 0) {
		lines.push(`No node of "${result.variant.name}" belongs to it yet.`);
	}
	return lines;
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

/**
 * Which one thing the command was asked to inspect.
 * @param input What the command was given.
 * @param input.group A group id, when one was given.
 * @param input.container A node, when one was given.
 * @returns The group or the container.
 * @throws {CliUsageError} When neither or both were given.
 */
function whatWasAsked(input: {
	readonly group?: string | undefined;
	readonly container?: string | undefined;
}): { readonly group: string } | { readonly container: string } {
	const { group, container } = input;
	if (group !== undefined && container === undefined) {
		return { group };
	}
	if (container !== undefined && group === undefined) {
		return { container };
	}
	throw new CliUsageError(
		"Give exactly one of --group <id> to inspect a group and --container <node> to inspect a container.",
	);
}

const semanticInspectContract = defineCommand({
	path: ["semantic", "inspect"],
	shared: ["url", "directory"],
	summary: "Inspect one group or one container of a semantic board",
	description: [
		"Reports one group or one container of one variant. The report is read over the whole variant before any view narrows it.",
		"",
		"A group answers with:",
		"- Its explicit members.",
		"- The relationships between them.",
		"- The relationships that cross its boundary, with their direction.",
		"- The immediate external neighbors that those reach.",
		"",
		"A group that the configuration defines but nobody has joined answers empty. UNKNOWN_GROUP: an id that is neither configured nor a membership of any node is refused.",
		"",
		"A container is a node with children. It answers with its interface and a count of each of these:",
		"- The entry points: the children that relationships from outside reach.",
		"- The hidden parts: the children that none reaches.",
		"- The callers outside.",
		"- The outgoing relationships.",
		"- The relationships that end on the container itself.",
		"- The pass-through entry points: the entry points that may only pass one call on.",
		"",
		"A node with no children answers that it holds no parts.",
	].join("\n"),
	examples: [
		"archboard semantic inspect payments --group fulfillment",
		'archboard semantic inspect payments --group billing --variant "Read cache"',
		'archboard semantic inspect payments --container "Board store"',
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
			requiredWhen: "unless --container is given instead",
			description: "The configured group id to inspect",
		},
		{
			kind: "option",
			key: "container",
			spellings: ["--container"],
			value: "required",
			placeholder: "node",
			requiredWhen: "unless --group is given instead",
			description: "The node whose interface to report, by id or by name",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: `Which variant to inspect, by id or name; ${UNNAMED_VARIANT}`,
		},
	],
	input: { ingress: InspectInputSchema },
	result: z.union([GroupInspectionResultSchema, ContainerInspectionResultSchema]),
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The group or the container as it stands on that variant",
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
	refusals: [serverRefusal, unknownGroupRefusal, unknownContainerRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "The board the group or container is read off",
		},
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "conditional",
			description: "The vault policy that names a group, read only for --group",
		},
	],
	/**
	 * Inspect the group or the container.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The group or the container as it stands.
	 * @throws {CliUsageError} When neither or both of --group and --container are given.
	 */
	async handler(input, context) {
		const asked = whatWasAsked(input);
		await context.require("server", "semantic inspect");
		const answer = await readSemanticBoardAnswerOnServer(input.name);
		const variant = askedVariant(answer.board, input.variant);
		const warnings = answer.warnings.map(diagnosticLine);
		if ("container" in asked) {
			const result = containerAnswer(
				answer.board,
				variant,
				inspectedContainer(variant, asked.container),
				answer.warnings,
			);
			return { result, diagnostics: [...warnings, ...describedContainer(result)] };
		}
		const { policy } = await checkSemanticVaultOnServer();
		const inspection = inspectGroup(variant.content, asked.group);
		refuseUnknownGroup(policy, variant, inspection);
		const result = answered(
			answer.board,
			{ id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
			inspection,
			policy,
			answer.warnings,
		);
		return { result, diagnostics: [...warnings, ...described(result)] };
	},
});

export { semanticInspectContract, GroupInspectionResultSchema, type GroupInspectionResult };
