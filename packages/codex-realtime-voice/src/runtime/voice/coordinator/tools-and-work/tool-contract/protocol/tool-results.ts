import { z } from "zod";

import { codexFieldSchema } from "@archboard/codex-app-server/contract";
import type { CoordinatorToolName } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import {
	OpaqueIdSchema,
	type DynamicToolValue,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/dynamic-tool-envelopes.ts";
import {
	QueueOperationSchema,
	QueueSubmissionIdSchema,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-inputs.ts";

const DeliverySchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
const NullableOpaqueIdSchema = OpaqueIdSchema.nullable();
const QueuedSubmissionIdsSchema = z.array(QueueSubmissionIdSchema).max(100);

const STOP_OUTCOMES = ["stopped", "idle", "partial", "unconfirmed"] as const;
const REMAINING_STATES = ["running", "queued", "unread"] as const;
const INSPECT_READS = ["turns", "subAgents", "queue"] as const;
/** What a partial or unconfirmed stop leaves to do: look again, or stop again. */
const STOP_RECOVERY = ["inspect_workhorse", "stop_workhorses"] as const;
const INSPECT_TEXT_LIMIT = 400;
/** The most threads a stop report names; a stop names the first ones it saw. */
const REMAINING_WORK_LIMIT = 100;
const RemainingWorkSchema = z
	.array(z.object({ threadId: OpaqueIdSchema, state: z.enum(REMAINING_STATES) }).strict())
	.max(REMAINING_WORK_LIMIT);
const InspectWorkhorseResultSchema = z.object({
	threadId: OpaqueIdSchema,
	status: codexFieldSchema("threadStatusType"),
	activeTurnId: NullableOpaqueIdSchema,
	request: z.string().max(INSPECT_TEXT_LIMIT).nullable(),
	recentProgress: z.array(z.string().max(INSPECT_TEXT_LIMIT)).max(3),
	subAgents: z
		.array(
			z.object({ threadId: OpaqueIdSchema, status: codexFieldSchema("threadStatusType") }).strict(),
		)
		.max(50),
	queuedSubmissionIds: QueuedSubmissionIdsSchema,
	unavailable: z.array(z.enum(INSPECT_READS)).max(INSPECT_READS.length),
	lastStop: z
		.object({
			outcome: z.enum(["stopping", ...STOP_OUTCOMES]),
			remaining: RemainingWorkSchema,
		})
		.strict()
		.nullable(),
});
const DelegateToWorkhorseResultSchema = z.object({
	mode: z.enum(["started", "queued"]),
	clientUserMessageId: OpaqueIdSchema,
	queuedSubmissionId: NullableOpaqueIdSchema,
	turnId: NullableOpaqueIdSchema,
});
const ManageWorkhorseQueueResultSchema = z.object({
	operation: QueueOperationSchema,
	queuedSubmissionIds: QueuedSubmissionIdsSchema,
});
const SteerWorkhorseResultSchema = z.object({
	turnId: OpaqueIdSchema,
	delivery: DeliverySchema,
});
const StopWorkhorsesResultSchema = z.object({
	stopped: z
		.array(
			z
				.object({
					checkout: z.string().min(1).max(4_096),
					outcome: z.enum(STOP_OUTCOMES),
					remaining: RemainingWorkSchema,
					recovery: z.array(z.enum(STOP_RECOVERY)).max(STOP_RECOVERY.length),
				})
				.strict(),
		)
		.max(100),
});
const ResolveSpokenApprovalResultSchema = z.object({
	verdict: z.enum(["accept", "decline"]),
	settlement: DeliverySchema,
});

type InspectWorkhorseResult = z.infer<typeof InspectWorkhorseResultSchema>;
type DelegateToWorkhorseResult = z.infer<typeof DelegateToWorkhorseResultSchema>;
type ManageWorkhorseQueueResult = z.infer<typeof ManageWorkhorseQueueResultSchema>;
type SteerWorkhorseResult = z.infer<typeof SteerWorkhorseResultSchema>;
type StopWorkhorsesResult = z.infer<typeof StopWorkhorsesResultSchema>;
type ResolveSpokenApprovalResult = z.infer<typeof ResolveSpokenApprovalResultSchema>;

/**
 * The reviewed result shapes: parsing through one keeps exactly the declared fields, in declared
 * order, and drops anything else a workhorse result carried.
 */
const COORDINATOR_TOOL_RESULT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseResultSchema,
	delegate_to_workhorse: DelegateToWorkhorseResultSchema,
	manage_workhorse_queue: ManageWorkhorseQueueResultSchema,
	steer_workhorse: SteerWorkhorseResultSchema,
	stop_workhorses: StopWorkhorsesResultSchema,
	resolve_spoken_approval: ResolveSpokenApprovalResultSchema,
} satisfies Record<CoordinatorToolName, z.ZodTypeAny>);

/**
 * Reduce the value a server produced for one coordinator tool to its reviewed fields, so a
 * malformed result is refused rather than echoed as a success and the envelope carries nothing
 * undeclared.
 * @param toolName - The tool whose result is being checked.
 * @param value - The raw server result.
 * @returns A fresh object holding only the declared fields.
 * @throws {z.ZodError} When the result does not match the tool's reviewed shape.
 */
function canonicalToolResult(toolName: CoordinatorToolName, value: unknown): DynamicToolValue {
	return COORDINATOR_TOOL_RESULT_SCHEMAS[toolName].parse(value);
}

/**
 * Cap what a stop names at the number of threads its result schema holds.
 * @param remaining - All the remaining work a stop saw.
 * @returns The first ones it saw.
 */
function boundRemainingWork<Item>(remaining: readonly Item[]): Item[] {
	return remaining.slice(0, REMAINING_WORK_LIMIT);
}

export {
	type InspectWorkhorseResult,
	type DelegateToWorkhorseResult,
	type ManageWorkhorseQueueResult,
	type SteerWorkhorseResult,
	type StopWorkhorsesResult,
	type ResolveSpokenApprovalResult,
	canonicalToolResult,
	boundRemainingWork,
};
