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

/** How much of one walkthrough step a result carries; a longer body is cut by the host. */
const PRESENT_STEP_RESULT_LIMITS = Object.freeze({
	idChars: 64,
	nameChars: 200,
	headingChars: 512,
	bodyChars: 4_096,
	subjects: 32,
	steps: 1_000,
});

/**
 * The step now on screen, as the coordinator hands it to the voice model: where it is in the
 * walkthrough, what it says, and what it is about by name. It is returned only after the pane
 * said the step had finished arriving.
 */
const PresentStepResultSchema = z
	.object({
		walkthroughId: z.string().min(1).max(PRESENT_STEP_RESULT_LIMITS.idChars),
		walkthroughName: z.string().min(1).max(PRESENT_STEP_RESULT_LIMITS.nameChars),
		step: z.int().min(1).max(PRESENT_STEP_RESULT_LIMITS.steps),
		of: z.int().min(1).max(PRESENT_STEP_RESULT_LIMITS.steps),
		heading: z.string().max(PRESENT_STEP_RESULT_LIMITS.headingChars),
		body: z.string().max(PRESENT_STEP_RESULT_LIMITS.bodyChars),
		subjects: z
			.array(z.string().min(1).max(PRESENT_STEP_RESULT_LIMITS.nameChars))
			.max(PRESENT_STEP_RESULT_LIMITS.subjects),
		view: z.string().min(1).max(PRESENT_STEP_RESULT_LIMITS.nameChars).nullable(),
	})
	.strict();

type InspectWorkhorseResult = z.infer<typeof InspectWorkhorseResultSchema>;
type DelegateToWorkhorseResult = z.infer<typeof DelegateToWorkhorseResultSchema>;
type ManageWorkhorseQueueResult = z.infer<typeof ManageWorkhorseQueueResultSchema>;
type SteerWorkhorseResult = z.infer<typeof SteerWorkhorseResultSchema>;
type ResolveSpokenApprovalResult = z.infer<typeof ResolveSpokenApprovalResultSchema>;
type PresentStepResult = z.infer<typeof PresentStepResultSchema>;

const COORDINATOR_TOOL_RESULT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseResultSchema,
	delegate_to_workhorse: DelegateToWorkhorseResultSchema,
	manage_workhorse_queue: ManageWorkhorseQueueResultSchema,
	steer_workhorse: SteerWorkhorseResultSchema,
	resolve_spoken_approval: ResolveSpokenApprovalResultSchema,
	present_step: PresentStepResultSchema,
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

/**
 * The JSON Schema of a string between two lengths.
 * @param minLength - The fewest characters.
 * @param maxLength - The most characters.
 * @returns The frozen schema.
 */
function boundedJsonString(minLength: number, maxLength: number): JsonSchema {
	return deepFreeze({ type: "string", minLength, maxLength });
}

/**
 * The JSON Schema of an integer between two bounds.
 * @param minimum - The least value.
 * @param maximum - The greatest value.
 * @returns The frozen schema.
 */
function boundedJsonInteger(minimum: number, maximum: number): JsonSchema {
	return deepFreeze({ type: "integer", minimum, maximum });
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
	present_step: strictResultObject(
		{
			walkthroughId: boundedJsonString(1, PRESENT_STEP_RESULT_LIMITS.idChars),
			walkthroughName: boundedJsonString(1, PRESENT_STEP_RESULT_LIMITS.nameChars),
			step: boundedJsonInteger(1, PRESENT_STEP_RESULT_LIMITS.steps),
			of: boundedJsonInteger(1, PRESENT_STEP_RESULT_LIMITS.steps),
			heading: boundedJsonString(0, PRESENT_STEP_RESULT_LIMITS.headingChars),
			body: boundedJsonString(0, PRESENT_STEP_RESULT_LIMITS.bodyChars),
			subjects: deepFreeze({
				type: "array",
				items: boundedJsonString(1, PRESENT_STEP_RESULT_LIMITS.nameChars),
				maxItems: PRESENT_STEP_RESULT_LIMITS.subjects,
			}),
			view: deepFreeze({
				anyOf: [
					boundedJsonString(1, PRESENT_STEP_RESULT_LIMITS.nameChars),
					Object.freeze({ type: "null" }),
				],
			}),
		},
		["walkthroughId", "walkthroughName", "step", "of", "heading", "body", "subjects", "view"],
	),
} satisfies Record<CoordinatorToolName, JsonSchema>);

export {
	InspectWorkhorseResultSchema,
	DelegateToWorkhorseResultSchema,
	ManageWorkhorseQueueResultSchema,
	SteerWorkhorseResultSchema,
	ResolveSpokenApprovalResultSchema,
	PresentStepResultSchema,
	PRESENT_STEP_RESULT_LIMITS,
	type InspectWorkhorseResult,
	type DelegateToWorkhorseResult,
	type ManageWorkhorseQueueResult,
	type SteerWorkhorseResult,
	type ResolveSpokenApprovalResult,
	type PresentStepResult,
	COORDINATOR_TOOL_RESULT_SCHEMAS,
	parseCoordinatorToolResult,
	TOOL_SUCCESS_RESULT_SCHEMAS,
};
