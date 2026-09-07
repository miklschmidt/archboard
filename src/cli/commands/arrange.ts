import { z } from "zod";
import {
	alignElements,
	distributeElements,
	duplicateElements,
	groupElements,
	setElementsLocked,
	ungroupElements,
} from "@/runtime/engine/element-ops";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import type { OptionParameter } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals } from "@/cli/command-contract/common";
import type { FlagSpecs } from "@/cli/command-contract/route-options";
import {
	ArrangeAlignStageSchema,
	ArrangeDistributeStageSchema,
	ArrangeDuplicateStageSchema,
	ArrangeGroupStageSchema,
	ArrangeLockStageSchema,
	ArrangeUngroupStageSchema,
	ArrangeUnlockStageSchema,
	arrangementStage,
} from "@/cli/commands/lib/arrangement-stages";
import type {
	ArrangeAlignStage,
	ArrangeDistributeStage,
	ArrangeDuplicateStage,
	ArrangeGroupStage,
	ArrangeLockStage,
	ArrangeUngroupStage,
	ArrangeUnlockStage,
} from "@/cli/commands/lib/arrangement-stages";

const ARRANGE_FLAG_SPEC = {
	ids: { takesValue: true },
	to: { takesValue: true },
	group: { takesValue: true },
	offset: { takesValue: true },
} as const satisfies FlagSpecs;
/**
 * Declares every arrange flag as a contract option. Each arrange flag carries a
 * value, so the option is always value-required.
 * @returns One option parameter per flag in the arrange flag specification.
 */
const optionParameters = (): OptionParameter[] =>
	Object.keys(ARRANGE_FLAG_SPEC).map((name) => ({
		kind: "option",
		key: name,
		spellings: [`--${name}`],
		value: "required",
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
	/**
	 * Selects the only output case.
	 * @returns The json case id.
	 */
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

const ArrangeNamespaceInputSchema = z.object({
	...ArrangeInputShape,
	action: z.string().optional(),
});
type ArrangeNamespaceInput = z.infer<typeof ArrangeNamespaceInputSchema>;
const ArrangeNamespaceResultSchema = z.never();
type ArrangeNamespaceResult = z.infer<typeof ArrangeNamespaceResultSchema>;
const arrangeContract = defineCommand({
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
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with its subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError(
			"Usage: arrange align|distribute|group|ungroup|lock|unlock|duplicate ...",
		);
	},
});

const ArrangeAlignInputSchema = z.object(ArrangeInputShape);
type ArrangeAlignInput = z.infer<typeof ArrangeAlignInputSchema>;
const ArrangeAlignResultSchema = z.looseObject({
	aligned: z.boolean(),
	elementIds: z.array(z.string()),
	alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type ArrangeAlignResult = z.infer<typeof ArrangeAlignResultSchema>;
const arrangeAlignContract = defineCommand({
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
	/**
	 * Aligns the named elements along the requested edge or axis, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
	async handler(input, context) {
		await context.require("server", "arrange align");
		const request = context.parse(ArrangeAlignStageSchema, input);
		return { result: await alignElements(request.ids, request.alignment) };
	},
});

const ArrangeDistributeInputSchema = z.object(ArrangeInputShape);
type ArrangeDistributeInput = z.infer<typeof ArrangeDistributeInputSchema>;
const ArrangeDistributeResultSchema = z.looseObject({
	distributed: z.boolean(),
	elementIds: z.array(z.string()),
	direction: z.enum(["horizontal", "vertical"]),
	count: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type ArrangeDistributeResult = z.infer<typeof ArrangeDistributeResultSchema>;
const arrangeDistributeContract = defineCommand({
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
	/**
	 * Spreads the named elements evenly in the requested direction, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
	async handler(input, context) {
		await context.require("server", "arrange distribute");
		const request = context.parse(ArrangeDistributeStageSchema, input);
		return { result: await distributeElements(request.ids, request.direction) };
	},
});

const ArrangeGroupInputSchema = z.object(ArrangeInputShape);
type ArrangeGroupInput = z.infer<typeof ArrangeGroupInputSchema>;
const ArrangeGroupResultSchema = z.looseObject({
	groupId: z.string(),
	elementIds: z.array(z.string()),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type ArrangeGroupResult = z.infer<typeof ArrangeGroupResultSchema>;
const arrangeGroupContract = defineCommand({
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
	/**
	 * Groups the named elements, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
	async handler(input, context) {
		await context.require("server", "arrange group");
		const request = context.parse(ArrangeGroupStageSchema, input);
		return { result: await groupElements(request.ids) };
	},
});

const ArrangeUngroupInputSchema = z.object(ArrangeInputShape);
type ArrangeUngroupInput = z.infer<typeof ArrangeUngroupInputSchema>;
const ArrangeUngroupResultSchema = z.looseObject({
	groupId: z.string(),
	ungrouped: z.boolean(),
	elementIds: z.array(z.string()),
	successCount: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type ArrangeUngroupResult = z.infer<typeof ArrangeUngroupResultSchema>;
const arrangeUngroupContract = defineCommand({
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
	/**
	 * Dissolves the named group, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
	async handler(input, context) {
		await context.require("server", "arrange ungroup");
		const request = context.parse(ArrangeUngroupStageSchema, input);
		return { result: await ungroupElements(request.group) };
	},
});

/**
 * Builds the receipt schema of lock and unlock, which differ only in the
 * literal flag that names what happened.
 * @param key - The receipt field set to true.
 * @returns The receipt schema for that action.
 */
const lockResult = (key: "locked" | "unlocked") =>
	z.looseObject({
		[key]: z.literal(true),
		elementIds: z.array(z.string()),
		successCount: z.number().int().nonnegative(),
		held: HoldReportSchema.optional(),
	});
const ArrangeLockInputSchema = z.object(ArrangeInputShape);
type ArrangeLockInput = z.infer<typeof ArrangeLockInputSchema>;
const ArrangeLockResultSchema = lockResult("locked");
type ArrangeLockResult = z.infer<typeof ArrangeLockResultSchema>;
const arrangeLockContract = defineCommand({
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
	/**
	 * Locks the named elements against canvas edits, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
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

const ArrangeUnlockInputSchema = z.object(ArrangeInputShape);
type ArrangeUnlockInput = z.infer<typeof ArrangeUnlockInputSchema>;
const ArrangeUnlockResultSchema = lockResult("unlocked");
type ArrangeUnlockResult = z.infer<typeof ArrangeUnlockResultSchema>;
const arrangeUnlockContract = defineCommand({
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
	/**
	 * Unlocks the named elements, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
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

const ArrangeDuplicateInputSchema = z.object(ArrangeInputShape);
type ArrangeDuplicateInput = z.infer<typeof ArrangeDuplicateInputSchema>;
const ArrangeDuplicateResultSchema = z.looseObject({
	success: z.literal(true),
	count: z.number().int().nonnegative(),
	offsetX: z.number(),
	offsetY: z.number(),
	elements: z.array(z.looseObject({ id: z.string() })).nullable(),
	held: HoldReportSchema.optional(),
});
type ArrangeDuplicateResult = z.infer<typeof ArrangeDuplicateResultSchema>;
const arrangeDuplicateContract = defineCommand({
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
	/**
	 * Copies the named elements at the requested offset, in one board write after the server answered.
	 * @param input - The parsed arrange options.
	 * @param context - The command context.
	 * @returns The server's arrangement receipt.
	 */
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

export {
	ARRANGE_FLAG_SPEC,
	ArrangeAlignStageSchema,
	type ArrangeAlignStage,
	ArrangeDistributeStageSchema,
	type ArrangeDistributeStage,
	ArrangeGroupStageSchema,
	type ArrangeGroupStage,
	ArrangeLockStageSchema,
	type ArrangeLockStage,
	ArrangeUnlockStageSchema,
	type ArrangeUnlockStage,
	ArrangeUngroupStageSchema,
	type ArrangeUngroupStage,
	ArrangeDuplicateStageSchema,
	type ArrangeDuplicateStage,
	ArrangeNamespaceInputSchema,
	type ArrangeNamespaceInput,
	ArrangeNamespaceResultSchema,
	type ArrangeNamespaceResult,
	arrangeContract,
	ArrangeAlignInputSchema,
	type ArrangeAlignInput,
	ArrangeAlignResultSchema,
	type ArrangeAlignResult,
	arrangeAlignContract,
	ArrangeDistributeInputSchema,
	type ArrangeDistributeInput,
	ArrangeDistributeResultSchema,
	type ArrangeDistributeResult,
	arrangeDistributeContract,
	ArrangeGroupInputSchema,
	type ArrangeGroupInput,
	ArrangeGroupResultSchema,
	type ArrangeGroupResult,
	arrangeGroupContract,
	ArrangeUngroupInputSchema,
	type ArrangeUngroupInput,
	ArrangeUngroupResultSchema,
	type ArrangeUngroupResult,
	arrangeUngroupContract,
	ArrangeLockInputSchema,
	type ArrangeLockInput,
	ArrangeLockResultSchema,
	type ArrangeLockResult,
	arrangeLockContract,
	ArrangeUnlockInputSchema,
	type ArrangeUnlockInput,
	ArrangeUnlockResultSchema,
	type ArrangeUnlockResult,
	arrangeUnlockContract,
	ArrangeDuplicateInputSchema,
	type ArrangeDuplicateInput,
	ArrangeDuplicateResultSchema,
	type ArrangeDuplicateResult,
	arrangeDuplicateContract,
};
