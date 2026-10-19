// The thread-scoped DTOs: the pane's link to a thread, the timeline it shows,
// and the queue of pending submissions.

import { z } from "zod";

import {
	CodexPatchChangeKindTypeSchema,
	CodexThreadStatusTypeSchema,
	CodexTokenUsageBreakdownSchema,
	CodexTurnPlanStepStatusSchema,
	CodexTurnStatusSchema,
} from "@archboard/codex-app-server/contract";
import {
	BROWSER_TIMELINE_LIMITS as LIMITS,
	refineCurrentTarget,
} from "#shared/schemas/browser/vocabulary.ts";
import { boundedText, optionalNullableText } from "#shared/schemas/browser/scalars.ts";
import type { IdentityContext, IdentitySchemas } from "#shared/schemas/browser/scalars.ts";

/**
 * Builds the thread link, timeline and queue schemas.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @returns The schemas.
 */
function createBrowserThreadSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const {
		ApprovalIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		ItemIdSchema,
		OperationIdSchema,
		QueuedSubmissionIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const NullableReasonSchema = optionalNullableText(512);
	const ThreadLinkStatusSchema = CodexThreadStatusTypeSchema;
	const BrowserThreadLinkSourcePresentationSchema = z.enum([
		"standard",
		"subagent",
		"custom",
		"unknown",
	]);
	const UnboundThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("unbound"),
			childId: z.null(),
			epoch: z.null(),
			threadId: z.null(),
			sourcePresentation: z.null(),
			status: z.literal("notLoaded"),
			loaded: z.literal(false),
			canAcceptDirectInput: z.literal(false),
			reason: NullableReasonSchema,
		})
		.strict();
	const InspectOnlyThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("inspect_only"),
			childId: z.null(),
			epoch: z.null(),
			threadId: ThreadIdSchema,
			sourcePresentation: BrowserThreadLinkSourcePresentationSchema,
			status: ThreadLinkStatusSchema,
			loaded: z.boolean(),
			canAcceptDirectInput: z.literal(false),
			reason: NullableReasonSchema,
		})
		.strict();
	const ExecutableThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("executable"),
			childId: ChildIdSchema,
			epoch: ChildEpochSchema,
			threadId: ThreadIdSchema,
			sourcePresentation: z.literal("standard"),
			status: ThreadLinkStatusSchema.exclude(["notLoaded"]),
			loaded: z.literal(true),
			canAcceptDirectInput: z.literal(true),
			reason: NullableReasonSchema,
		})
		.strict();
	const currentTarget = refineCurrentTarget(context);
	const BrowserThreadLinkSchema = z
		.union([UnboundThreadLinkSchema, InspectOnlyThreadLinkSchema, ExecutableThreadLinkSchema])
		.superRefine((value, refinementContext) => {
			if (value.state === "executable") {
				currentTarget(value, refinementContext);
			}
		});

	/** A duration or a point in time, in milliseconds, when Codex reported one. */
	const MillisecondsSchema = z.number().nonnegative().nullable();
	const LineCountSchema = z.number().int().nonnegative();
	const BrowserTimelineFileChangeSchema = z
		.object({
			path: boundedText(LIMITS.path),
			kind: CodexPatchChangeKindTypeSchema,
			movePath: boundedText(LIMITS.path).nullable(),
			added: LineCountSchema,
			removed: LineCountSchema,
		})
		.strict();
	const BrowserTimelineItemSchema = z.discriminatedUnion("media", [
		z
			.object({ media: z.literal("prompt"), itemId: ItemIdSchema, text: boundedText(LIMITS.text) })
			.strict(),
		z
			.object({ media: z.literal("text"), itemId: ItemIdSchema, text: boundedText(LIMITS.text) })
			.strict(),
		z
			.object({
				media: z.literal("tool"),
				itemId: ItemIdSchema,
				name: boundedText(LIMITS.toolName),
				status: z.enum(["inProgress", "completed", "failed"]),
				server: boundedText(LIMITS.toolName).nullable(),
				arguments: boundedText(LIMITS.toolArguments).nullable(),
				durationMs: MillisecondsSchema,
				error: boundedText(LIMITS.errorMessage).nullable(),
			})
			.strict(),
		z
			.object({
				media: z.literal("command"),
				itemId: ItemIdSchema,
				command: boundedText(LIMITS.text),
				status: z.enum(["inProgress", "completed", "failed", "declined"]),
				cwd: boundedText(LIMITS.path).nullable(),
				exitCode: z.number().int().nullable(),
				durationMs: MillisecondsSchema,
				output: boundedText(LIMITS.outputTail).nullable(),
				outputTruncated: z.boolean(),
			})
			.strict(),
		z
			.object({
				media: z.literal("fileChange"),
				itemId: ItemIdSchema,
				status: z.enum(["inProgress", "completed", "failed", "declined"]),
				changes: z.array(BrowserTimelineFileChangeSchema).max(LIMITS.fileChanges),
				changesTruncated: z.boolean(),
			})
			.strict(),
		z
			.object({
				media: z.literal("reasoning"),
				itemId: ItemIdSchema,
				text: boundedText(LIMITS.text),
			})
			.strict(),
		z
			.object({ media: z.literal("plan"), itemId: ItemIdSchema, text: boundedText(LIMITS.text) })
			.strict(),
		z
			.object({
				media: z.literal("search"),
				itemId: ItemIdSchema,
				query: boundedText(LIMITS.query).nullable(),
			})
			.strict(),
		z.object({ media: z.literal("compaction"), itemId: ItemIdSchema }).strict(),
		z
			.object({
				media: z.literal("approval"),
				itemId: ItemIdSchema,
				approvalId: ApprovalIdSchema,
				status: z.enum(["pending", "resolved", "cancelled"]),
			})
			.strict(),
	]);
	/** The latest plan Codex published for a turn, while the server holds it. */
	const BrowserTimelinePlanSchema = z
		.object({
			explanation: boundedText(LIMITS.planExplanation).nullable(),
			steps: z
				.array(
					z
						.object({
							step: boundedText(LIMITS.planStep),
							status: CodexTurnPlanStepStatusSchema,
						})
						.strict(),
				)
				.max(LIMITS.planSteps),
		})
		.strict();
	const BrowserTimelineTurnSchema = z
		.object({
			turnId: TurnIdSchema,
			status: CodexTurnStatusSchema,
			items: z.array(BrowserTimelineItemSchema),
			summary: boundedText(512),
			outputsIncluded: z.boolean(),
			outputsTruncated: z.boolean(),
			startedAtMs: MillisecondsSchema,
			completedAtMs: MillisecondsSchema,
			durationMs: MillisecondsSchema,
			error: z
				.object({
					message: boundedText(LIMITS.errorMessage),
					details: boundedText(LIMITS.errorDetails).nullable(),
				})
				.strict()
				.nullable(),
			plan: BrowserTimelinePlanSchema.nullable(),
			/** The coordinator turn that delegated this workhorse turn, while the server knows it (TASK-319). */
			delegatedBy: TurnIdSchema.nullable().optional(),
		})
		.strict();
	/** The thread's latest token usage, and the context window it counts against. */
	const BrowserTimelineUsageSchema = z
		.object({
			total: CodexTokenUsageBreakdownSchema,
			last: CodexTokenUsageBreakdownSchema,
			modelContextWindow: z.number().nonnegative().nullable(),
		})
		.strict();
	const BrowserTimelineSchema = z
		.object({
			kind: z.literal("timeline"),
			threadId: ThreadIdSchema,
			turns: z.array(BrowserTimelineTurnSchema),
			nextCursor: boundedText(1024).nullable(),
			usage: BrowserTimelineUsageSchema.nullable(),
		})
		.strict();

	const QueueStatusSchema = z.enum([
		"empty",
		"queued",
		"running",
		"interrupted",
		"approval_blocked",
		"failed",
		"completed",
		"stale",
		"reconnecting",
		"unavailable",
		"outcome_unknown",
	]);
	const BrowserQueueSchema = z
		.object({
			kind: z.literal("queue"),
			status: QueueStatusSchema,
			entries: z.array(
				z
					.object({
						submissionId: QueuedSubmissionIdSchema,
						prompt: boundedText(16_384),
						status: QueueStatusSchema,
						/**
						 * The Archboard operation that queued this submission, or null when
						 * Archboard did not queue it. The server recovers it from the
						 * submission's clientUserMessageId, which the queue port sets to the
						 * serialized OperationId on every add it makes.
						 */
						operationId: OperationIdSchema.nullable(),
					})
					.strict(),
			),
		})
		.strict();

	return {
		BrowserThreadLinkSourcePresentationSchema,
		BrowserThreadLinkSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
	};
}

export { createBrowserThreadSchemas };
