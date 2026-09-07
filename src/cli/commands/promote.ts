import { z } from "zod";
import { applyElementChanges, getBoardInfo, getElements } from "@/runtime/engine/canvas-client";
import type { ServerElement } from "@/runtime/engine/types";
import {
	KINDS,
	demotionSummary,
	normalizeKind,
	planDemotion,
	planPromotion,
	promotionSummary,
	resolveBinding,
	validateNodeId,
} from "@/runtime/engine/promote";
import type {
	BindingRequest,
	ElementUpdate,
	PromotionPlan,
	ResolvedBinding,
} from "@/runtime/engine/promote";
import { defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals } from "@/cli/command-contract/common";
import { errorMessage } from "@/cli/commands/lib/thrown-message";

/**
 * Looks up the named elements on the board, refusing the whole request when
 * any id is missing so a promotion never silently covers fewer elements.
 * @param ids - The element ids named with `--ids`.
 * @param board - Every element on the board.
 * @returns The named elements in the order they were named.
 */
function targetElements(ids: string[], board: ServerElement[]): ServerElement[] {
	const byId = new Map(board.map((element) => [element.id, element]));
	const missing = ids.filter((id) => !byId.has(id));
	if (missing.length > 0) {
		throw new Error(`No element on the board with id ${missing.join(", ")}`);
	}
	return ids.map((id) => byId.get(id)!);
}
/**
 * Writes the planned element updates as one change, or nothing when the plan
 * changed no element.
 * @param updates - The planner's element updates.
 */
async function applyUpdates(updates: ElementUpdate[]): Promise<void> {
	if (updates.length > 0) {
		await applyElementChanges({ upserts: updates.map((update) => ({ ...update })) });
	}
}
/**
 * Builds the binding request from the `--path`, `--repo`, `--branch` and
 * `--commit` options, omitting the ones not given.
 * @param input - The parsed promote options.
 * @param path - The binding path, already known to be present.
 * @returns The binding request for the resolver.
 */
function bindingRequest(input: PromoteInput, path: string): BindingRequest {
	return {
		path,
		...(input.repo ? { repo: input.repo } : {}),
		...(input.branch ? { branch: input.branch } : {}),
		...(input.commit ? { commit: input.commit } : {}),
	};
}
/**
 * Collects the optional node overrides a promotion may carry.
 * @param input - The parsed promote options.
 * @returns The overrides that were given.
 */
function nodeOverrides(input: PromoteInput): {
	name?: string;
	variant?: string;
	level?: string;
	each?: true;
} {
	return {
		...(input.name ? { name: input.name } : {}),
		...(input.variant ? { variant: input.variant } : {}),
		...(input.level ? { level: input.level } : {}),
		...(input.each ? { each: true } : {}),
	};
}
/**
 * Shapes the json receipt of a promotion, adding the binding resolution facts
 * only when a binding was requested.
 * @param plan - The executed promotion plan.
 * @param summary - The human summary of the plan.
 * @param binding - The resolved binding, if one was requested.
 * @returns The validated json result.
 */
function promoteJsonResult(
	plan: PromotionPlan,
	summary: string,
	binding: ResolvedBinding | undefined,
): PromoteJsonResult {
	return PromoteJsonResultSchema.parse({
		success: true as const,
		summary,
		nodes: plan.nodes,
		elementsUpdated: plan.updates.length,
		...(binding
			? { binding: { resolvedFrom: binding.resolvedFrom, resolved: binding.resolved } }
			: {}),
		...(binding && !binding.resolved ? { bindingResolved: false } : {}),
	});
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
			held: "none" as const,
			description: "Promotion summary",
			presentation: ["result"] as const,
		},
	] as const,
	/**
	 * Chooses the text summary when `--text` was given, otherwise the json receipt.
	 * @param input - The parsed options, of which only the text flag matters.
	 * @returns The output case id.
	 */
	select: (input: { text: boolean }) => (input.text ? "text" : "json"),
};

const PromoteInputSchema = z.object({
	ids: z.string({
		error: "--ids is required; use `browser selection --pane <spec>` to inspect a live selection",
	}),
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
type PromoteInput = z.infer<typeof PromoteInputSchema>;
const PromotionDeclarationStageSchema = PromoteInputSchema.transform((input, context) => {
	if (!input.kind) {
		context.addIssue({
			code: "custom",
			message: `--kind is required (one of: ${KINDS.join(", ")})`,
		});
		return z.NEVER;
	}
	try {
		return {
			...input,
			kind: normalizeKind(input.kind),
			nodeId: input.node ? validateNodeId(input.node) : undefined,
		};
	} catch (error) {
		context.addIssue({ code: "custom", message: errorMessage(error) });
		return z.NEVER;
	}
});
type PromotionDeclarationStage = z.infer<typeof PromotionDeclarationStageSchema>;
const PromotionIdsStageSchema = z.string().transform((value, context) => {
	const ids = value
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	if (ids.length === 0) {
		context.addIssue({ code: "custom", message: "--ids was empty" });
		return z.NEVER;
	}
	return ids;
});
type PromotionIdsStage = z.infer<typeof PromotionIdsStageSchema>;
const PromotionBindingStageSchema = z
	.object({
		path: z.string().optional(),
		repo: z.string().optional(),
		branch: z.string().optional(),
		commit: z.string().optional(),
	})
	.superRefine((input, context) => {
		if (!input.path && (input.repo || input.branch || input.commit)) {
			context.addIssue({
				code: "custom",
				message: "--repo/--branch/--commit describe a binding; give --path too.",
			});
		}
	});
type PromotionBindingStage = z.infer<typeof PromotionBindingStageSchema>;
const PromotionNodeSchema = z.object({
	node: z.string(),
	kind: z.enum(KINDS),
	name: z.string(),
	elementIds: z.array(z.string()),
	binding: z
		.looseObject({
			repo: z.string().optional(),
			path: z.string(),
			branch: z.string().optional(),
			commit: z.string().optional(),
			confirmedAt: z.string().optional(),
		})
		.optional(),
	variant: z.string(),
	level: z.string().optional(),
});
const DemotionNodeSchema = z.object({
	node: z.string().optional(),
	name: z.string().optional(),
	elementIds: z.array(z.string()),
});
const PromoteJsonResultSchema = z.looseObject({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(PromotionNodeSchema),
	elementsUpdated: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type PromoteJsonResult = z.infer<typeof PromoteJsonResultSchema>;
const PromoteResultSchema = z.union([PromoteJsonResultSchema, z.string()]);
type PromoteResult = z.infer<typeof PromoteResultSchema>;
const promoteContract = defineCommand({
	path: ["promote"],
	summary: "Declare named elements a node: kind, identity, binding",
	usage: "promote --kind <kind> --ids a,b,c [--path file] [--text]",
	description: "Promotes explicitly named elements as one architecture node write.",
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
	input: {
		ingress: PromoteInputSchema,
		stages: [
			{
				name: "node-declaration",
				when: "before-server",
				description: "Required normalized architecture kind and validated node id",
				schema: PromotionDeclarationStageSchema,
			},
			{
				name: "target-ids",
				when: "after-read",
				description: "Non-empty comma-separated target ids",
				schema: PromotionIdsStageSchema,
			},
			{
				name: "binding-options",
				when: "after-read",
				description: "Repository binding options require a path",
				schema: PromotionBindingStageSchema,
			},
		],
	},
	result: PromoteResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["local-read", "read", "write"],
	refusals: boardWriteRefusals,
	relationships: [
		{ method: "GET", path: "/api/elements", cardinality: "one", description: "Read the board" },
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
	/**
	 * Promotes the named elements to a node in one write: the declaration is
	 * validated before the server is required, the ids and binding after the
	 * board was read, and the binding is resolved against the working directory.
	 * @param input - The parsed promote options.
	 * @param context - The command context.
	 * @returns The summary as text, or the json receipt with binding facts.
	 */
	async handler(input, context) {
		const declaration = context.parse(PromotionDeclarationStageSchema, input);
		await context.require("server", "promote");
		const board = await getElements();
		const ids = context.parse(PromotionIdsStageSchema, input.ids);
		const targets = targetElements(ids, board);
		context.parse(PromotionBindingStageSchema, input);
		const binding = input.path
			? await resolveBinding(
					bindingRequest(input, input.path),
					{ kind: "cwd", dir: process.cwd() },
					{ signal: context.signal },
				)
			: undefined;
		const identity = await getBoardInfo();
		const plan = planPromotion({
			targets,
			board,
			kind: declaration.kind,
			boardVariant: identity.identity.variant,
			...(declaration.nodeId ? { nodeId: declaration.nodeId } : {}),
			...(binding ? { binding } : {}),
			...nodeOverrides(input),
		});
		await applyUpdates(plan.updates);
		const summary = promotionSummary(plan, binding?.note);
		if (input.text) {
			return { result: summary };
		}
		return { result: promoteJsonResult(plan, summary, binding) };
	},
});

const DemoteInputSchema = z.object({
	ids: z.string({
		error: "--ids is required; use `browser selection --pane <spec>` to inspect a live selection",
	}),
	text: z.boolean().default(false),
	tail,
});
type DemoteInput = z.infer<typeof DemoteInputSchema>;
const DemoteJsonResultSchema = z.looseObject({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(DemotionNodeSchema),
	elementsUpdated: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type DemoteJsonResult = z.infer<typeof DemoteJsonResultSchema>;
const DemoteResultSchema = z.union([DemoteJsonResultSchema, z.string()]);
type DemoteResult = z.infer<typeof DemoteResultSchema>;
const demoteContract = defineCommand({
	path: ["demote"],
	summary: "Turn nodes back into plain elements",
	usage: "demote --ids a,b,c [--text]",
	description: "Demotes every element belonging to explicitly named nodes in one write.",
	examples: ['archboard demote --ids api --board payments --doing "demoting API"'],
	parameters: commonParameters,
	input: {
		ingress: DemoteInputSchema,
		stages: [
			{
				name: "target-ids",
				when: "after-read",
				description: "Non-empty comma-separated target ids",
				schema: PromotionIdsStageSchema,
			},
		],
	},
	result: DemoteResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships: [
		{ method: "GET", path: "/api/elements", cardinality: "one", description: "Read the board" },
		{
			method: "POST",
			path: "/api/elements/changes",
			cardinality: "conditional",
			description: "Apply demotion",
		},
	],
	/**
	 * Turns the nodes owning the named elements back into plain elements in one write.
	 * @param input - The parsed demote options.
	 * @param context - The command context.
	 * @returns The summary as text, or the json receipt.
	 */
	async handler(input, context) {
		await context.require("server", "demote");
		const board = await getElements();
		const ids = context.parse(PromotionIdsStageSchema, input.ids);
		const targets = targetElements(ids, board);
		const plan = planDemotion(targets, board);
		await applyUpdates(plan.updates);
		const summary = demotionSummary(plan);
		return {
			result: input.text
				? summary
				: DemoteJsonResultSchema.parse({
						success: true as const,
						summary,
						nodes: plan.nodes,
						elementsUpdated: plan.updates.length,
					}),
		};
	},
});

export {
	PromoteInputSchema,
	type PromoteInput,
	PromotionDeclarationStageSchema,
	type PromotionDeclarationStage,
	PromotionIdsStageSchema,
	type PromotionIdsStage,
	PromotionBindingStageSchema,
	type PromotionBindingStage,
	PromoteJsonResultSchema,
	type PromoteJsonResult,
	PromoteResultSchema,
	type PromoteResult,
	promoteContract,
	DemoteInputSchema,
	type DemoteInput,
	DemoteJsonResultSchema,
	type DemoteJsonResult,
	DemoteResultSchema,
	type DemoteResult,
	demoteContract,
};
