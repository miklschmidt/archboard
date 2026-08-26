import { z } from "zod";
import {
	alignElements,
	distributeElements,
	duplicateElements,
	groupElements,
	setElementsLocked,
	ungroupElements,
} from "../../runtime/engine/element-ops.js";
import {
	CliUsageError,
	defineCommand,
	type OptionParameter,
} from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { boardWriteRefusals } from "../command-contract/common.js";
import type { FlagSpecs } from "../command-contract/route-options.js";

const AlignmentInputSchema = z.enum(["left", "center", "right", "top", "middle", "bottom"]);
const DirectionInputSchema = z.enum(["horizontal", "vertical"]);
export const ARRANGE_FLAG_SPEC = {
	ids: { takesValue: true },
	to: { takesValue: true },
	group: { takesValue: true },
	offset: { takesValue: true },
} as const satisfies FlagSpecs;
const optionParameters = (): OptionParameter[] =>
	Object.entries(ARRANGE_FLAG_SPEC).map(([name, spec]) => ({
		kind: "option",
		key: name,
		spellings: [`--${name}`],
		value: spec.takesValue ? "required" : "none",
		description: `${name} option`,
	}));
const tailParameter = {
	kind: "positional" as const,
	key: "tail",
	name: "ignored",
	repeatable: true,
	route: "pass-through" as const,
	description: "Legacy ignored positional content",
};
const ArrangeInputShape = {
	ids: z.string().optional(),
	to: z.string().optional(),
	group: z.string().optional(),
	offset: z.string().optional(),
	tail: z.array(z.string()).default([]),
};
const output = {
	cases: [
		{
			id: "json",
			when: {},
			mode: "json" as const,
			held: "object-field-and-stderr-note" as const,
			description: "Arrangement result",
			presentation: ["result", "held-note"] as const,
		},
	] as const,
	select: () => "json",
};
const relationships = [
	{
		method: "GET" as const,
		path: "/api/elements",
		cardinality: "one" as const,
		description: "Read arrangement targets",
	},
	{
		method: "POST" as const,
		path: "/api/elements/changes",
		cardinality: "one" as const,
		description: "Apply the arrangement in one write",
	},
];

function parsedIds(value: string | undefined, usage: string, context: z.RefinementCtx) {
	if (!value?.trim()) {
		context.addIssue({ code: "custom", message: usage });
		return z.NEVER;
	}
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export const ArrangeAlignStageSchema = z
	.object({ ids: z.string().optional(), to: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange align --ids a,b,c --to left|center|right|top|middle|bottom",
			context,
		);
		if (ids === z.NEVER) return z.NEVER;
		const alignment = AlignmentInputSchema.safeParse(input.to);
		if (!alignment.success) {
			context.addIssue({
				code: "custom",
				message: "arrange align requires --to left|center|right|top|middle|bottom",
			});
			return z.NEVER;
		}
		return { ids, alignment: alignment.data };
	});
export type ArrangeAlignStage = z.infer<typeof ArrangeAlignStageSchema>;

export const ArrangeDistributeStageSchema = z
	.object({ ids: z.string().optional(), to: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange distribute --ids a,b,c --to horizontal|vertical",
			context,
		);
		if (ids === z.NEVER) return z.NEVER;
		const direction = DirectionInputSchema.safeParse(input.to);
		if (!direction.success) {
			context.addIssue({
				code: "custom",
				message: "arrange distribute requires --to horizontal|vertical",
			});
			return z.NEVER;
		}
		return { ids, direction: direction.data };
	});
export type ArrangeDistributeStage = z.infer<typeof ArrangeDistributeStageSchema>;

const idsStage = (usage: string) =>
	z.object({ ids: z.string().optional() }).transform((input, context) => {
		const ids = parsedIds(input.ids, usage, context);
		return ids === z.NEVER ? z.NEVER : { ids };
	});
export const ArrangeGroupStageSchema = idsStage("Usage: arrange group --ids a,b,c");
export type ArrangeGroupStage = z.infer<typeof ArrangeGroupStageSchema>;
export const ArrangeLockStageSchema = idsStage("Usage: arrange lock --ids a,b,c");
export type ArrangeLockStage = z.infer<typeof ArrangeLockStageSchema>;
export const ArrangeUnlockStageSchema = idsStage("Usage: arrange unlock --ids a,b,c");
export type ArrangeUnlockStage = z.infer<typeof ArrangeUnlockStageSchema>;

export const ArrangeUngroupStageSchema = z.object({
	group: z.string({ error: "Usage: arrange ungroup --group <groupId>" }).min(1),
});
export type ArrangeUngroupStage = z.infer<typeof ArrangeUngroupStageSchema>;

export const ArrangeDuplicateStageSchema = z
	.object({ ids: z.string().optional(), offset: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange duplicate --ids a,b,c [--offset 20,20]",
			context,
		);
		if (ids === z.NEVER) return z.NEVER;
		if (input.offset === undefined) return { ids, offsetX: 20, offsetY: 20 };
		const parts = input.offset.split(",").map((part) => Number(part.trim()));
		if (parts.length !== 2 || parts.some(Number.isNaN)) {
			context.addIssue({ code: "custom", message: '--offset expects "x,y"' });
			return z.NEVER;
		}
		return { ids, offsetX: parts[0]!, offsetY: parts[1]! };
	});
export type ArrangeDuplicateStage = z.infer<typeof ArrangeDuplicateStageSchema>;

const arrangementStage = (name: string, schema: z.ZodType) => ({
	name,
	when: "after-server" as const,
	description: "Validated arrangement arguments",
	rules: ["Parse comma-separated element ids and validate action-specific options"],
	schema,
});

export const ArrangeNamespaceInputSchema = z.object({
	...ArrangeInputShape,
	action: z.string().optional(),
});
export type ArrangeNamespaceInput = z.infer<typeof ArrangeNamespaceInputSchema>;
export const ArrangeNamespaceResultSchema = z.never();
export type ArrangeNamespaceResult = z.infer<typeof ArrangeNamespaceResultSchema>;
export const arrangeContract = defineCommand({
	path: ["arrange"],
	summary: "Align, distribute, group, lock, duplicate elements",
	usage: "arrange align|distribute|group|ungroup|lock|unlock|duplicate ...",
	description: "Routes element arrangement commands.",
	examples: ["archboard arrange align --ids a,b --to left"],
	parameters: [
		...optionParameters(),
		{
			kind: "positional",
			key: "action",
			name: "subcommand",
			description: "Arrangement subcommand",
		},
		tailParameter,
	],
	input: { ingress: ArrangeNamespaceInputSchema },
	result: ArrangeNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler() {
		throw new CliUsageError(
			"Usage: arrange align|distribute|group|ungroup|lock|unlock|duplicate ...",
		);
	},
});

export const ArrangeAlignInputSchema = z.object(ArrangeInputShape);
export type ArrangeAlignInput = z.infer<typeof ArrangeAlignInputSchema>;
export const ArrangeAlignResultSchema = z.looseObject({
	aligned: z.boolean(),
	elementIds: z.array(z.string()),
	alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type ArrangeAlignResult = z.infer<typeof ArrangeAlignResultSchema>;
export const arrangeAlignContract = defineCommand({
	path: ["arrange", "align"],
	summary: "Align elements",
	usage: "arrange align --ids a,b,c --to left|center|right|top|middle|bottom",
	description: "Aligns selected elements in one write.",
	examples: ["archboard arrange align --ids a,b --to left"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeAlignInputSchema,
		stages: [arrangementStage("align-request", ArrangeAlignStageSchema)],
	},
	result: ArrangeAlignResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange align");
		const request = context.parse(ArrangeAlignStageSchema, input);
		return { result: await alignElements(request.ids, request.alignment) };
	},
});

export const ArrangeDistributeInputSchema = z.object(ArrangeInputShape);
export type ArrangeDistributeInput = z.infer<typeof ArrangeDistributeInputSchema>;
export const ArrangeDistributeResultSchema = z.looseObject({
	distributed: z.boolean(),
	elementIds: z.array(z.string()),
	direction: z.enum(["horizontal", "vertical"]),
	count: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type ArrangeDistributeResult = z.infer<typeof ArrangeDistributeResultSchema>;
export const arrangeDistributeContract = defineCommand({
	path: ["arrange", "distribute"],
	summary: "Distribute elements",
	usage: "arrange distribute --ids a,b,c --to horizontal|vertical",
	description: "Distributes selected elements in one write.",
	examples: ["archboard arrange distribute --ids a,b,c --to horizontal"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeDistributeInputSchema,
		stages: [arrangementStage("distribute-request", ArrangeDistributeStageSchema)],
	},
	result: ArrangeDistributeResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange distribute");
		const request = context.parse(ArrangeDistributeStageSchema, input);
		return { result: await distributeElements(request.ids, request.direction) };
	},
});

export const ArrangeGroupInputSchema = z.object(ArrangeInputShape);
export type ArrangeGroupInput = z.infer<typeof ArrangeGroupInputSchema>;
export const ArrangeGroupResultSchema = z.looseObject({
	groupId: z.string(),
	elementIds: z.array(z.string()),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type ArrangeGroupResult = z.infer<typeof ArrangeGroupResultSchema>;
export const arrangeGroupContract = defineCommand({
	path: ["arrange", "group"],
	summary: "Group elements",
	usage: "arrange group --ids a,b,c",
	description: "Groups selected elements in one write.",
	examples: ["archboard arrange group --ids a,b"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeGroupInputSchema,
		stages: [arrangementStage("group-request", ArrangeGroupStageSchema)],
	},
	result: ArrangeGroupResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange group");
		const request = context.parse(ArrangeGroupStageSchema, input);
		return { result: await groupElements(request.ids) };
	},
});

export const ArrangeUngroupInputSchema = z.object(ArrangeInputShape);
export type ArrangeUngroupInput = z.infer<typeof ArrangeUngroupInputSchema>;
export const ArrangeUngroupResultSchema = z.looseObject({
	groupId: z.string(),
	ungrouped: z.boolean(),
	elementIds: z.array(z.string()),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type ArrangeUngroupResult = z.infer<typeof ArrangeUngroupResultSchema>;
export const arrangeUngroupContract = defineCommand({
	path: ["arrange", "ungroup"],
	summary: "Ungroup elements",
	usage: "arrange ungroup --group <groupId>",
	description: "Removes one group in one write.",
	examples: ["archboard arrange ungroup --group abc"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeUngroupInputSchema,
		stages: [arrangementStage("ungroup-request", ArrangeUngroupStageSchema)],
	},
	result: ArrangeUngroupResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange ungroup");
		const request = context.parse(ArrangeUngroupStageSchema, input);
		return { result: await ungroupElements(request.group) };
	},
});

const lockResult = (key: "locked" | "unlocked") =>
	z.looseObject({
		[key]: z.literal(true),
		elementIds: z.array(z.string()),
		successCount: z.number().int().nonnegative(),
		held: HoldReportSchema.optional(),
	});
export const ArrangeLockInputSchema = z.object(ArrangeInputShape);
export type ArrangeLockInput = z.infer<typeof ArrangeLockInputSchema>;
export const ArrangeLockResultSchema = lockResult("locked");
export type ArrangeLockResult = z.infer<typeof ArrangeLockResultSchema>;
export const arrangeLockContract = defineCommand({
	path: ["arrange", "lock"],
	summary: "Lock elements",
	usage: "arrange lock --ids a,b,c",
	description: "Locks selected elements in one write.",
	examples: ["archboard arrange lock --ids a,b"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeLockInputSchema,
		stages: [arrangementStage("lock-request", ArrangeLockStageSchema)],
	},
	result: ArrangeLockResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange lock");
		const request = context.parse(ArrangeLockStageSchema, input);
		return {
			result: {
				locked: true as const,
				...(await setElementsLocked(request.ids, true)),
			},
		};
	},
});

export const ArrangeUnlockInputSchema = z.object(ArrangeInputShape);
export type ArrangeUnlockInput = z.infer<typeof ArrangeUnlockInputSchema>;
export const ArrangeUnlockResultSchema = lockResult("unlocked");
export type ArrangeUnlockResult = z.infer<typeof ArrangeUnlockResultSchema>;
export const arrangeUnlockContract = defineCommand({
	path: ["arrange", "unlock"],
	summary: "Unlock elements",
	usage: "arrange unlock --ids a,b,c",
	description: "Unlocks selected elements in one write.",
	examples: ["archboard arrange unlock --ids a,b"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeUnlockInputSchema,
		stages: [arrangementStage("unlock-request", ArrangeUnlockStageSchema)],
	},
	result: ArrangeUnlockResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange unlock");
		const request = context.parse(ArrangeUnlockStageSchema, input);
		return {
			result: {
				unlocked: true as const,
				...(await setElementsLocked(request.ids, false)),
			},
		};
	},
});

export const ArrangeDuplicateInputSchema = z.object(ArrangeInputShape);
export type ArrangeDuplicateInput = z.infer<typeof ArrangeDuplicateInputSchema>;
export const ArrangeDuplicateResultSchema = z.looseObject({
	success: z.literal(true),
	count: z.number().int().nonnegative(),
	offsetX: z.number(),
	offsetY: z.number(),
	elements: z.array(z.looseObject({ id: z.string() })).nullable(),
	held: HoldReportSchema.optional(),
});
export type ArrangeDuplicateResult = z.infer<typeof ArrangeDuplicateResultSchema>;
export const arrangeDuplicateContract = defineCommand({
	path: ["arrange", "duplicate"],
	summary: "Duplicate elements",
	usage: "arrange duplicate --ids a,b,c [--offset 20,20]",
	description: "Duplicates selected elements in one write.",
	examples: ["archboard arrange duplicate --ids a,b --offset 40,20"],
	parameters: [...optionParameters(), tailParameter],
	input: {
		ingress: ArrangeDuplicateInputSchema,
		stages: [arrangementStage("duplicate-request", ArrangeDuplicateStageSchema)],
	},
	result: ArrangeDuplicateResultSchema,
	output,
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships,
	async handler(input, context) {
		await context.require("server", "arrange duplicate");
		const request = context.parse(ArrangeDuplicateStageSchema, input);
		const result = await duplicateElements(request.ids, request.offsetX, request.offsetY);
		return {
			result: ArrangeDuplicateResultSchema.parse({
				success: true as const,
				count: result.duplicates.length,
				offsetX: result.offsetX,
				offsetY: result.offsetY,
				elements: result.canvasElements,
			}),
		};
	},
});
