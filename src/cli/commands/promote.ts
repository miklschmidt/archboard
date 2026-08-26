import { z } from "zod";
import {
	applyElementChanges,
	getBoardInfo,
	getElements,
	getSelection,
} from "../../runtime/engine/canvas-client.js";
import type { ServerElement } from "../../runtime/engine/types.js";
import {
	KINDS,
	PromotionError,
	type ElementUpdate,
	demotionSummary,
	normalizeKind,
	planDemotion,
	planPromotion,
	promotionSummary,
	resolveBinding,
	validateNodeId,
} from "../../runtime/engine/promote.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";

async function targetElements(
	idsFlag: string | undefined,
	board: ServerElement[],
	verb: string,
): Promise<ServerElement[]> {
	const byId = new Map(board.map((element) => [element.id, element]));
	if (idsFlag !== undefined) {
		const ids = idsFlag
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);
		if (!ids.length) throw new CliUsageError("--ids was empty");
		const missing = ids.filter((id) => !byId.has(id));
		if (missing.length) throw new Error(`No element on the canvas with id ${missing.join(", ")}`);
		return ids.map((id) => byId.get(id)!);
	}
	const selection = await getSelection();
	if (!selection.elementIds.length)
		throw new PromotionError(
			`Nothing is selected on the board, so there is nothing to ${verb}. Select the shapes on the canvas, or pass --ids a,b,c.`,
		);
	const found = selection.elementIds.map((id) => byId.get(id)).filter(Boolean) as ServerElement[];
	if (!found.length)
		throw new Error(
			`The selected ids are not on the canvas any more: ${selection.elementIds.join(", ")}`,
		);
	return found;
}
async function applyUpdates(updates: ElementUpdate[]): Promise<void> {
	if (updates.length)
		await applyElementChanges({ upserts: updates as (Partial<ServerElement> & { id: string })[] });
}
const tail = z.array(z.string()).default([]);
const commonParameters = [
	{
		kind: "option" as const,
		key: "ids",
		spellings: ["--ids"] as const,
		value: "required" as const,
		description: "Comma-separated element ids",
	},
	{
		kind: "option" as const,
		key: "text",
		spellings: ["--text"] as const,
		value: "none" as const,
		description: "Print a text summary",
	},
	{
		kind: "positional" as const,
		key: "tail",
		name: "ignored",
		repeatable: true,
		route: "pass-through" as const,
		description: "Legacy ignored positional content",
	},
];
const refusals = [
	{
		code: "BOARD_REQUIRED",
		exit: 2,
		stream: "stderr" as const,
		description: "No board was named.",
	},
	{
		code: "CANVAS_UNREACHABLE",
		exit: 3,
		stream: "stderr" as const,
		description: "The canvas could not be reached.",
	},
	{
		code: "BOARD_CONFLICT",
		exit: 5,
		stream: "stderr" as const,
		description: "The write was refused.",
	},
];
const output = {
	cases: [
		{
			id: "json",
			when: { key: "text", present: false },
			mode: "json" as const,
			held: "object-field-and-stderr-note" as const,
			description: "Structured promotion result",
			presentation: ["result", "held-note"] as const,
		},
		{
			id: "text",
			when: { key: "text", present: true },
			mode: "text" as const,
			held: "stderr-note" as const,
			description: "Promotion summary",
			presentation: ["result", "held-note"] as const,
		},
	] as const,
	select: (input: { text: boolean }) => (input.text ? "text" : "json"),
};

export const PromoteInputSchema = z.object({
	ids: z.string().optional(),
	kind: z.string().optional(),
	name: z.string().optional(),
	node: z.string().optional(),
	path: z.string().optional(),
	repo: z.string().optional(),
	branch: z.string().optional(),
	commit: z.string().optional(),
	variant: z.string().optional(),
	level: z.string().optional(),
	each: z.boolean().default(false),
	text: z.boolean().default(false),
	tail,
});
export type PromoteInput = z.infer<typeof PromoteInputSchema>;
export const PromoteJsonResultSchema = z.looseObject({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(z.unknown()),
	elementsUpdated: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type PromoteJsonResult = z.infer<typeof PromoteJsonResultSchema>;
export const PromoteResultSchema = z.union([PromoteJsonResultSchema, z.string()]);
export type PromoteResult = z.infer<typeof PromoteResultSchema>;
export const promoteContract = defineCommand({
	path: ["promote"],
	summary: "Declare the selected elements a node: kind, identity, binding",
	usage: "promote --kind <kind> [--ids a,b,c] [--path file] [--text]",
	description: "Promotes selected or named elements as one architecture node write.",
	examples: ['archboard promote --kind service --ids api --board payments --doing "promoting API"'],
	parameters: [
		{
			kind: "option",
			key: "kind",
			spellings: ["--kind"],
			value: "required",
			description: "Architecture kind",
		},
		{
			kind: "option",
			key: "name",
			spellings: ["--name"],
			value: "required",
			description: "Display name",
		},
		{
			kind: "option",
			key: "node",
			spellings: ["--node"],
			value: "required",
			description: "Stable node id",
		},
		{
			kind: "option",
			key: "path",
			spellings: ["--path"],
			value: "required",
			description: "Binding path",
		},
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			description: "Binding repository",
		},
		{
			kind: "option",
			key: "branch",
			spellings: ["--branch"],
			value: "required",
			description: "Binding branch",
		},
		{
			kind: "option",
			key: "commit",
			spellings: ["--commit"],
			value: "required",
			description: "Binding commit",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			description: "Node variant override",
		},
		{
			kind: "option",
			key: "level",
			spellings: ["--level"],
			value: "required",
			description: "Node level override",
		},
		{
			kind: "option",
			key: "each",
			spellings: ["--each"],
			value: "none",
			description: "Promote each target separately",
		},
		...commonParameters,
	],
	input: { ingress: PromoteInputSchema },
	result: PromoteResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["local-read", "read", "write"],
	refusals,
	relationships: [
		{ method: "GET", path: "/api/elements", cardinality: "one", description: "Read the board" },
		{
			method: "GET",
			path: "/api/selection",
			cardinality: "conditional",
			description: "Resolve default targets",
		},
		{
			method: "GET",
			path: "/api/boards/info",
			cardinality: "one",
			description: "Read board variant",
		},
		{
			method: "POST",
			path: "/api/elements/changes",
			cardinality: "conditional",
			description: "Apply promotion",
		},
	],
	async handler(input, context) {
		if (!input.kind) throw new CliUsageError(`--kind is required (one of: ${KINDS.join(", ")})`);
		const kind = normalizeKind(input.kind);
		const nodeId = input.node ? validateNodeId(input.node) : undefined;
		await context.require("server", "promote");
		const board = await getElements();
		const targets = await targetElements(input.ids, board, "promote");
		const binding = input.path
			? resolveBinding(
					{
						path: input.path,
						...(input.repo ? { repo: input.repo } : {}),
						...(input.branch ? { branch: input.branch } : {}),
						...(input.commit ? { commit: input.commit } : {}),
					},
					{ kind: "cwd", dir: process.cwd() },
				)
			: undefined;
		if (!binding && (input.repo || input.branch || input.commit))
			throw new CliUsageError("--repo/--branch/--commit describe a binding; give --path too.");
		const identity = await getBoardInfo();
		const plan = planPromotion({
			targets,
			board,
			kind,
			boardVariant: identity.identity.variant,
			...(input.name ? { name: input.name } : {}),
			...(nodeId ? { nodeId } : {}),
			...(binding ? { binding } : {}),
			...(input.variant ? { variant: input.variant } : {}),
			...(input.level ? { level: input.level } : {}),
			...(input.each ? { each: true } : {}),
		});
		await applyUpdates(plan.updates);
		const summary = promotionSummary(plan, binding?.note);
		if (input.text) return { result: summary };
		return {
			result: {
				success: true as const,
				summary,
				nodes: plan.nodes,
				elementsUpdated: plan.updates.length,
				...(binding
					? { binding: { resolvedFrom: binding.resolvedFrom, resolved: binding.resolved } }
					: {}),
				...(binding && !binding.resolved ? { bindingResolved: false } : {}),
			} as PromoteJsonResult,
		};
	},
});

export const DemoteInputSchema = z.object({
	ids: z.string().optional(),
	text: z.boolean().default(false),
	tail,
});
export type DemoteInput = z.infer<typeof DemoteInputSchema>;
export const DemoteJsonResultSchema = z.looseObject({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(z.unknown()),
	elementsUpdated: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type DemoteJsonResult = z.infer<typeof DemoteJsonResultSchema>;
export const DemoteResultSchema = z.union([DemoteJsonResultSchema, z.string()]);
export type DemoteResult = z.infer<typeof DemoteResultSchema>;
export const demoteContract = defineCommand({
	path: ["demote"],
	summary: "Turn nodes back into plain elements",
	usage: "demote [--ids a,b,c] [--text]",
	description: "Demotes every element belonging to the selected nodes in one write.",
	examples: ['archboard demote --ids api --board payments --doing "demoting API"'],
	parameters: commonParameters,
	input: { ingress: DemoteInputSchema },
	result: DemoteResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals,
	relationships: [
		{ method: "GET", path: "/api/elements", cardinality: "one", description: "Read the board" },
		{
			method: "GET",
			path: "/api/selection",
			cardinality: "conditional",
			description: "Resolve default targets",
		},
		{
			method: "POST",
			path: "/api/elements/changes",
			cardinality: "conditional",
			description: "Apply demotion",
		},
	],
	async handler(input, context) {
		await context.require("server", "demote");
		const board = await getElements();
		const targets = await targetElements(input.ids, board, "demote");
		const plan = planDemotion(targets, board);
		await applyUpdates(plan.updates);
		const summary = demotionSummary(plan);
		return {
			result: input.text
				? summary
				: ({
						success: true as const,
						summary,
						nodes: plan.nodes,
						elementsUpdated: plan.updates.length,
					} as DemoteJsonResult),
		};
	},
});
