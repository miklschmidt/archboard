import { z } from "zod";

import {
	CODEX_THREAD_STATUS_TYPES,
	CodexThreadStatusTypeSchema,
} from "@/shared/codex-app-server-contract";
import type {
	JsonSchema,
	CoordinatorToolName,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import { deepFreeze } from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import { OpaqueIdSchema } from "@/runtime/codex-coordinator-tool-contract/lib/dynamic-tool-envelopes";
import {
	QueueOperationSchema,
	QueueSubmissionIdSchema,
} from "@/runtime/codex-coordinator-tool-contract/lib/tool-inputs";

const DeliverySchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
const NullableOpaqueIdSchema = OpaqueIdSchema.nullable();
const QueuedSubmissionIdsSchema = z.array(QueueSubmissionIdSchema).max(100);

const InspectWorkhorseResultSchema = z
	.object({
		threadId: OpaqueIdSchema,
		status: CodexThreadStatusTypeSchema,
		activeTurnId: NullableOpaqueIdSchema,
		queuedSubmissionIds: QueuedSubmissionIdsSchema,
	})
	.strict();
const DelegateToWorkhorseResultSchema = z
	.object({
		mode: z.enum(["started", "queued"]),
		clientUserMessageId: OpaqueIdSchema,
		queuedSubmissionId: NullableOpaqueIdSchema,
		turnId: NullableOpaqueIdSchema,
	})
	.strict();
const ManageWorkhorseQueueResultSchema = z
	.object({
		operation: QueueOperationSchema,
		queuedSubmissionIds: QueuedSubmissionIdsSchema,
	})
	.strict();
const SteerWorkhorseResultSchema = z
	.object({
		turnId: OpaqueIdSchema,
		delivery: DeliverySchema,
	})
	.strict();
const ResolveSpokenApprovalResultSchema = z
	.object({
		verdict: z.enum(["accept", "decline"]),
		settlement: DeliverySchema,
	})
	.strict();

type InspectWorkhorseResult = z.infer<typeof InspectWorkhorseResultSchema>;
type DelegateToWorkhorseResult = z.infer<typeof DelegateToWorkhorseResultSchema>;
type ManageWorkhorseQueueResult = z.infer<typeof ManageWorkhorseQueueResultSchema>;
type SteerWorkhorseResult = z.infer<typeof SteerWorkhorseResultSchema>;
type ResolveSpokenApprovalResult = z.infer<typeof ResolveSpokenApprovalResultSchema>;

const COORDINATOR_TOOL_RESULT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseResultSchema,
	delegate_to_workhorse: DelegateToWorkhorseResultSchema,
	manage_workhorse_queue: ManageWorkhorseQueueResultSchema,
	steer_workhorse: SteerWorkhorseResultSchema,
	resolve_spoken_approval: ResolveSpokenApprovalResultSchema,
} satisfies Record<CoordinatorToolName, z.ZodTypeAny>);

/**
 * Validates the value a host produced for one coordinator tool before it is returned to the
 * model, so a malformed host result is refused rather than echoed as a success.
 * @param toolName - The tool whose result is being checked.
 * @param value - The raw host result.
 * @returns The validated result value.
 */
function parseCoordinatorToolResult(toolName: CoordinatorToolName, value: unknown): unknown {
	return COORDINATOR_TOOL_RESULT_SCHEMAS[toolName].parse(value);
}

const JsonStringSchema: JsonSchema = Object.freeze({ type: "string" });
const JsonNullableStringSchema: JsonSchema = deepFreeze({
	anyOf: [JsonStringSchema, Object.freeze({ type: "null" })],
});

/**
 * Builds the closed JSON Schema object that mirrors one zod result schema for the manifest.
 * @param properties - The JSON Schema of each result field.
 * @param required - The fields every result must carry.
 * @returns A frozen JSON Schema object that rejects unknown fields.
 */
function strictResultObject(
	properties: Readonly<Record<string, JsonSchema>>,
	required: readonly string[],
): JsonSchema {
	return deepFreeze({
		type: "object",
		properties,
		required: [...required],
		additionalProperties: false,
	});
}

const ResultOperationSchema: JsonSchema = deepFreeze({
	type: "string",
	enum: [...QueueOperationSchema.options],
});
const ResultStatusSchema: JsonSchema = deepFreeze({
	type: "string",
	enum: [...CODEX_THREAD_STATUS_TYPES],
});
const ResultDeliverySchema: JsonSchema = deepFreeze({
	type: "string",
	enum: ["delivered", "not_delivered", "outcome_unknown"],
});
const ResultQueuedSubmissionIdsSchema: JsonSchema = deepFreeze({
	type: "array",
	items: JsonStringSchema,
	maxItems: 100,
});

const TOOL_SUCCESS_RESULT_SCHEMAS = deepFreeze({
	inspect_workhorse: strictResultObject(
		{
			threadId: JsonStringSchema,
			status: ResultStatusSchema,
			activeTurnId: JsonNullableStringSchema,
			queuedSubmissionIds: ResultQueuedSubmissionIdsSchema,
		},
		["threadId", "status", "activeTurnId", "queuedSubmissionIds"],
	),
	delegate_to_workhorse: strictResultObject(
		{
			mode: deepFreeze({ type: "string", enum: ["started", "queued"] }),
			clientUserMessageId: JsonStringSchema,
			queuedSubmissionId: JsonNullableStringSchema,
			turnId: JsonNullableStringSchema,
		},
		["mode", "clientUserMessageId", "queuedSubmissionId", "turnId"],
	),
	manage_workhorse_queue: strictResultObject(
		{ operation: ResultOperationSchema, queuedSubmissionIds: ResultQueuedSubmissionIdsSchema },
		["operation", "queuedSubmissionIds"],
	),
	steer_workhorse: strictResultObject(
		{ turnId: JsonStringSchema, delivery: ResultDeliverySchema },
		["turnId", "delivery"],
	),
	resolve_spoken_approval: strictResultObject(
		{
			verdict: deepFreeze({ type: "string", enum: ["accept", "decline"] }),
			settlement: ResultDeliverySchema,
		},
		["verdict", "settlement"],
	),
} satisfies Record<CoordinatorToolName, JsonSchema>);

export {
	InspectWorkhorseResultSchema,
	DelegateToWorkhorseResultSchema,
	ManageWorkhorseQueueResultSchema,
	SteerWorkhorseResultSchema,
	ResolveSpokenApprovalResultSchema,
	type InspectWorkhorseResult,
	type DelegateToWorkhorseResult,
	type ManageWorkhorseQueueResult,
	type SteerWorkhorseResult,
	type ResolveSpokenApprovalResult,
	COORDINATOR_TOOL_RESULT_SCHEMAS,
	parseCoordinatorToolResult,
	TOOL_SUCCESS_RESULT_SCHEMAS,
};
