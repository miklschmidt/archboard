import { z } from "zod";

import type {
	NamespaceName,
	CoordinatorToolName,
	WorkhorseToolName,
	VoiceToolName,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import {
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";

const InspectWorkhorseInputSchema = z.object({}).strict();
const DelegateToWorkhorseInputSchema = z
	.object({
		input: z.string().min(1).max(4_096),
		transcriptDelta: z.string().min(0).max(4_096),
	})
	.strict();

const QueueOperationSchema = z.enum(["list", "add", "update", "delete", "reorder", "start"]);
type QueueOperation = z.infer<typeof QueueOperationSchema>;

const QueueSubmissionIdSchema = z.string().min(1).max(128);
const QueuePromptSchema = z.string().min(1).max(16_384);
const QueueOrderSchema = z
	.array(QueueSubmissionIdSchema)
	.min(1)
	.max(100)
	.refine((values) => new Set(values).size === values.length, "submission ids must be unique");

const QueueListInputSchema = z.object({ operation: z.literal("list") }).strict();
const QueueAddInputSchema = z
	.object({ operation: z.literal("add"), prompt: QueuePromptSchema })
	.strict();
const QueueUpdateInputSchema = z
	.object({
		operation: z.literal("update"),
		submissionId: QueueSubmissionIdSchema,
		prompt: QueuePromptSchema,
	})
	.strict();
const QueueDeleteInputSchema = z
	.object({ operation: z.literal("delete"), submissionId: QueueSubmissionIdSchema })
	.strict();
const QueueReorderInputSchema = z
	.object({ operation: z.literal("reorder"), orderedSubmissionIds: QueueOrderSchema })
	.strict();
const QueueStartInputSchema = z
	.object({ operation: z.literal("start"), submissionId: QueueSubmissionIdSchema })
	.strict();

const ManageWorkhorseQueueInputSchema = z.discriminatedUnion("operation", [
	QueueListInputSchema,
	QueueAddInputSchema,
	QueueUpdateInputSchema,
	QueueDeleteInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
]);

const SteerWorkhorseInputSchema = z.object({ input: z.string().min(1).max(4_096) }).strict();
const ResolveSpokenApprovalInputSchema = z
	.object({ verdict: z.enum(["accept", "decline"]) })
	.strict();

type InspectWorkhorseInput = z.infer<typeof InspectWorkhorseInputSchema>;
type DelegateToWorkhorseInput = z.infer<typeof DelegateToWorkhorseInputSchema>;
type ManageWorkhorseQueueInput = z.infer<typeof ManageWorkhorseQueueInputSchema>;
type SteerWorkhorseInput = z.infer<typeof SteerWorkhorseInputSchema>;
type ResolveSpokenApprovalInput = z.infer<typeof ResolveSpokenApprovalInputSchema>;

const WORKHORSE_TOOL_INPUT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseInputSchema,
	delegate_to_workhorse: DelegateToWorkhorseInputSchema,
	manage_workhorse_queue: ManageWorkhorseQueueInputSchema,
	steer_workhorse: SteerWorkhorseInputSchema,
} satisfies Record<WorkhorseToolName, z.ZodTypeAny>);

const VOICE_TOOL_INPUT_SCHEMAS = Object.freeze({
	resolve_spoken_approval: ResolveSpokenApprovalInputSchema,
} satisfies Record<VoiceToolName, z.ZodTypeAny>);

/**
 * Validates the arguments the coordinator passed to one workhorse tool.
 * @param toolName - The workhorse tool being called.
 * @param input - The raw tool arguments.
 * @returns The validated arguments.
 */
function parseWorkhorseToolInput(toolName: WorkhorseToolName, input: unknown): unknown {
	return WORKHORSE_TOOL_INPUT_SCHEMAS[toolName].parse(input);
}

/**
 * Validates the arguments the coordinator passed to one voice tool.
 * @param toolName - The voice tool being called.
 * @param input - The raw tool arguments.
 * @returns The validated arguments.
 */
function parseVoiceToolInput(toolName: VoiceToolName, input: unknown): unknown {
	return VOICE_TOOL_INPUT_SCHEMAS[toolName].parse(input);
}

/**
 * Narrows a tool name to the workhorse namespace.
 * @param toolName - Any coordinator tool name.
 * @returns Whether the workhorse namespace declares the tool.
 */
function isWorkhorseToolName(toolName: CoordinatorToolName): toolName is WorkhorseToolName {
	return ARCHBOARD_WORKHORSE_TOOL_NAMES.some((candidate) => candidate === toolName);
}

/**
 * Narrows a tool name to the voice namespace.
 * @param toolName - Any coordinator tool name.
 * @returns Whether the voice namespace declares the tool.
 */
function isVoiceToolName(toolName: CoordinatorToolName): toolName is VoiceToolName {
	return ARCHBOARD_VOICE_TOOL_NAMES.some((candidate) => candidate === toolName);
}

/**
 * Validates tool arguments against the schema of the namespace the call arrived in, refusing
 * a tool name the namespace does not declare even when another namespace does.
 * @param namespace - The namespace the call was made through.
 * @param toolName - The tool being called.
 * @param input - The raw tool arguments.
 * @returns The validated arguments.
 */
function parseCoordinatorToolInput(
	namespace: NamespaceName,
	toolName: CoordinatorToolName,
	input: unknown,
): unknown {
	if (namespace === "archboard_workhorse") {
		if (!isWorkhorseToolName(toolName)) {
			throw new TypeError(`${namespace} does not declare ${toolName}.`);
		}
		return parseWorkhorseToolInput(toolName, input);
	}
	if (!isVoiceToolName(toolName)) {
		throw new TypeError(`${namespace} does not declare ${toolName}.`);
	}
	return parseVoiceToolInput(toolName, input);
}

export {
	InspectWorkhorseInputSchema,
	DelegateToWorkhorseInputSchema,
	QueueOperationSchema,
	type QueueOperation,
	QueueSubmissionIdSchema,
	QueueListInputSchema,
	QueueAddInputSchema,
	QueueUpdateInputSchema,
	QueueDeleteInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
	ManageWorkhorseQueueInputSchema,
	SteerWorkhorseInputSchema,
	ResolveSpokenApprovalInputSchema,
	type InspectWorkhorseInput,
	type DelegateToWorkhorseInput,
	type ManageWorkhorseQueueInput,
	type SteerWorkhorseInput,
	type ResolveSpokenApprovalInput,
	WORKHORSE_TOOL_INPUT_SCHEMAS,
	VOICE_TOOL_INPUT_SCHEMAS,
	parseWorkhorseToolInput,
	parseVoiceToolInput,
	parseCoordinatorToolInput,
};
