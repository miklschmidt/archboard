import { z } from "zod";

import type {
	CoordinatorNamespaceRole,
	CoordinatorToolName,
	WorkhorseToolName,
	VoiceToolName,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import {
	VOICE_TOOL_NAMES,
	WORKHORSE_TOOL_NAMES,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";

/**
 * The checkout whose workhorse a tool works with: the directory the host names it by.
 */
const CheckoutSchema = z.string().min(1).max(4_096);

const InspectWorkhorseInputSchema = z.object({ checkout: CheckoutSchema }).strict();
const DelegateToWorkhorseInputSchema = z
	.object({
		checkout: CheckoutSchema,
		input: z.string().min(1).max(4_096),
		transcriptDelta: z.string().min(0).max(4_096),
	})
	.strict();

const QueueOperationSchema = z.enum(["list", "add", "update", "delete", "reorder", "start"]);

const QueueSubmissionIdSchema = z.string().min(1).max(128);
const QueuePromptSchema = z.string().min(1).max(16_384);
const QueueOrderSchema = z
	.array(QueueSubmissionIdSchema)
	.min(1)
	.max(100)
	.refine((values) => new Set(values).size === values.length, "submission ids must be unique");

const QueueListInputSchema = z
	.object({ checkout: CheckoutSchema, operation: z.literal("list") })
	.strict();
const QueueAddInputSchema = z
	.object({ checkout: CheckoutSchema, operation: z.literal("add"), prompt: QueuePromptSchema })
	.strict();
const QueueUpdateInputSchema = z
	.object({
		checkout: CheckoutSchema,
		operation: z.literal("update"),
		submissionId: QueueSubmissionIdSchema,
		prompt: QueuePromptSchema,
	})
	.strict();
const QueueDeleteInputSchema = z
	.object({
		checkout: CheckoutSchema,
		operation: z.literal("delete"),
		submissionId: QueueSubmissionIdSchema,
	})
	.strict();
const QueueReorderInputSchema = z
	.object({
		checkout: CheckoutSchema,
		operation: z.literal("reorder"),
		orderedSubmissionIds: QueueOrderSchema,
	})
	.strict();
const QueueStartInputSchema = z
	.object({
		checkout: CheckoutSchema,
		operation: z.literal("start"),
		submissionId: QueueSubmissionIdSchema,
	})
	.strict();

const ManageWorkhorseQueueInputSchema = z.discriminatedUnion("operation", [
	QueueListInputSchema,
	QueueAddInputSchema,
	QueueUpdateInputSchema,
	QueueDeleteInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
]);

const SteerWorkhorseInputSchema = z
	.object({ checkout: CheckoutSchema, input: z.string().min(1).max(4_096) })
	.strict();
/** A stop names no workhorse: it stops every running workhorse of the calling tab session. */
const StopWorkhorsesInputSchema = z.object({}).strict();
const ResolveSpokenApprovalInputSchema = z
	.object({ verdict: z.enum(["accept", "decline"]) })
	.strict();

type InspectWorkhorseInput = z.infer<typeof InspectWorkhorseInputSchema>;
type DelegateToWorkhorseInput = z.infer<typeof DelegateToWorkhorseInputSchema>;
type ManageWorkhorseQueueInput = z.infer<typeof ManageWorkhorseQueueInputSchema>;
type SteerWorkhorseInput = z.infer<typeof SteerWorkhorseInputSchema>;
type StopWorkhorsesInput = z.infer<typeof StopWorkhorsesInputSchema>;
type ResolveSpokenApprovalInput = z.infer<typeof ResolveSpokenApprovalInputSchema>;

/** One parsed tool input, tagged with the tool so its shape is known wherever it travels. */
type ParsedToolInput =
	| { readonly tool: "inspect_workhorse"; readonly input: InspectWorkhorseInput }
	| { readonly tool: "delegate_to_workhorse"; readonly input: DelegateToWorkhorseInput }
	| { readonly tool: "manage_workhorse_queue"; readonly input: ManageWorkhorseQueueInput }
	| { readonly tool: "steer_workhorse"; readonly input: SteerWorkhorseInput }
	| { readonly tool: "stop_workhorses"; readonly input: StopWorkhorsesInput }
	| { readonly tool: "resolve_spoken_approval"; readonly input: ResolveSpokenApprovalInput };

/**
 * Narrows a tool name to the workhorse namespace.
 * @param toolName - Any coordinator tool name.
 * @returns Whether the workhorse namespace declares the tool.
 */
function isWorkhorseToolName(toolName: CoordinatorToolName): toolName is WorkhorseToolName {
	return WORKHORSE_TOOL_NAMES.some((candidate) => candidate === toolName);
}

/**
 * Narrows a tool name to the voice namespace.
 * @param toolName - Any coordinator tool name.
 * @returns Whether the voice namespace declares the tool.
 */
function isVoiceToolName(toolName: CoordinatorToolName): toolName is VoiceToolName {
	return VOICE_TOOL_NAMES.some((candidate) => candidate === toolName);
}

/**
 * Validates the arguments of a workhorse tool against that tool's own closed schema.
 * @param toolName - The workhorse tool being called.
 * @param input - The raw tool arguments.
 * @returns The tagged, typed arguments.
 */
function parseWorkhorseToolInput(toolName: WorkhorseToolName, input: unknown): ParsedToolInput {
	switch (toolName) {
		case "inspect_workhorse":
			return { tool: toolName, input: InspectWorkhorseInputSchema.parse(input) };
		case "delegate_to_workhorse":
			return { tool: toolName, input: DelegateToWorkhorseInputSchema.parse(input) };
		case "manage_workhorse_queue":
			return { tool: toolName, input: ManageWorkhorseQueueInputSchema.parse(input) };
		case "steer_workhorse":
			return { tool: toolName, input: SteerWorkhorseInputSchema.parse(input) };
		default:
			return { tool: toolName, input: StopWorkhorsesInputSchema.parse(input) };
	}
}

/**
 * Validates tool arguments against the schema of the namespace the call arrived in, refusing
 * a tool name the namespace does not declare even when another namespace does.
 * @param role - The role of the namespace the call was made through.
 * @param toolName - The tool being called.
 * @param input - The raw tool arguments.
 * @returns The tagged, typed arguments.
 */
function parseCoordinatorToolInput(
	role: CoordinatorNamespaceRole,
	toolName: CoordinatorToolName,
	input: unknown,
): ParsedToolInput {
	if (role === "workhorse") {
		if (!isWorkhorseToolName(toolName)) {
			throw new TypeError(`The ${role} namespace does not declare ${toolName}.`);
		}
		return parseWorkhorseToolInput(toolName, input);
	}
	if (!isVoiceToolName(toolName)) {
		throw new TypeError(`The ${role} namespace does not declare ${toolName}.`);
	}
	return { tool: toolName, input: ResolveSpokenApprovalInputSchema.parse(input) };
}

/**
 * Reads the closed input of `resolve_spoken_approval`: only a verdict.
 * @param input - The raw tool arguments.
 * @returns The input when it has exactly an accept or decline verdict, otherwise null.
 */
function parseResolveSpokenApprovalInput(input: unknown): ResolveSpokenApprovalInput | null {
	const parsed = ResolveSpokenApprovalInputSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export {
	QueueOperationSchema,
	QueueSubmissionIdSchema,
	type InspectWorkhorseInput,
	type DelegateToWorkhorseInput,
	type ManageWorkhorseQueueInput,
	type SteerWorkhorseInput,
	type StopWorkhorsesInput,
	type ResolveSpokenApprovalInput,
	type ParsedToolInput,
	parseCoordinatorToolInput,
	parseResolveSpokenApprovalInput,
};
