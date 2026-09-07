// The thread-scoped DTOs: the pane's link to a thread, the candidates it may
// bind, the timeline it shows, and the queue of pending submissions.

import { z } from "zod";

import {
	CodexThreadStatusTypeSchema,
	CodexTurnStatusSchema,
} from "@/shared/codex-app-server-contract/index";
import {
	BROWSER_THREAD_CANDIDATE_LIMIT,
	refineCurrentTarget,
} from "@/shared/codex-browser-model/lib/browser-vocabulary";
import { boundedText, optionalNullableText } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

/**
 * Builds the thread link, thread candidate, timeline and queue schemas.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @returns The schemas, including the candidate record schema on its own.
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

	/**
	 * One host-discovered thread the pane may bind, projected exactly as the
	 * thread-link classifier published it. The browser re-derives none of it:
	 * `state` and `reason` are the classifier's own verdict, and `selectionId`
	 * is the one-shot handle that names which retained candidate a bind consumes.
	 */
	const BrowserThreadCandidateSchema = z
		.object({
			kind: z.literal("thread_candidate"),
			selectionId: boundedText(128),
			threadId: ThreadIdSchema,
			state: z.enum(["executable", "inspect_only"]),
			reason: NullableReasonSchema,
			sourcePresentation: BrowserThreadLinkSourcePresentationSchema,
			status: ThreadLinkStatusSchema,
			loaded: z.boolean(),
			canAcceptDirectInput: z.boolean().nullable(),
		})
		.strict();
	/**
	 * The candidate list is bounded rather than fitted. It is the only variable
	 * snapshot field beside the timeline, and the timeline is the one the
	 * snapshot fitter trims, so this list must never be able to crowd it out.
	 */
	const BrowserThreadCandidatesSchema = z.discriminatedUnion("state", [
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("unknown"),
				records: z.array(BrowserThreadCandidateSchema).length(0),
				truncated: z.literal(false),
				reason: z.null(),
			})
			.strict(),
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("listed"),
				records: z.array(BrowserThreadCandidateSchema).max(BROWSER_THREAD_CANDIDATE_LIMIT),
				truncated: z.boolean(),
				reason: z.null(),
			})
			.strict()
			.superRefine((value, refinementContext) => {
				const seen = new Set<string>();
				for (const record of value.records) {
					if (seen.has(record.selectionId)) {
						refinementContext.addIssue({
							code: "custom",
							path: ["records"],
							message: "a thread candidate selection appears more than once",
						});
					}
					seen.add(record.selectionId);
				}
			}),
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("unavailable"),
				records: z.array(BrowserThreadCandidateSchema).length(0),
				truncated: z.literal(false),
				reason: boundedText(512),
			})
			.strict(),
	]);

	const BrowserTimelineItemSchema = z.discriminatedUnion("media", [
		z
			.object({ media: z.literal("text"), itemId: ItemIdSchema, text: boundedText(16_384) })
			.strict(),
		z
			.object({
				media: z.literal("tool"),
				itemId: ItemIdSchema,
				name: boundedText(256),
				status: z.enum(["inProgress", "completed", "failed"]),
			})
			.strict(),
		z
			.object({
				media: z.literal("command"),
				itemId: ItemIdSchema,
				command: boundedText(16_384),
				status: z.enum(["inProgress", "completed", "failed", "declined"]),
			})
			.strict(),
		z
			.object({
				media: z.literal("fileChange"),
				itemId: ItemIdSchema,
				status: z.enum(["inProgress", "completed", "failed", "declined"]),
			})
			.strict(),
		z
			.object({ media: z.literal("reasoning"), itemId: ItemIdSchema, text: boundedText(16_384) })
			.strict(),
		z
			.object({ media: z.literal("plan"), itemId: ItemIdSchema, text: boundedText(16_384) })
			.strict(),
		z
			.object({
				media: z.literal("approval"),
				itemId: ItemIdSchema,
				approvalId: ApprovalIdSchema,
				status: z.enum(["pending", "resolved", "cancelled"]),
			})
			.strict(),
	]);
	const BrowserTimelineTurnSchema = z
		.object({
			turnId: TurnIdSchema,
			status: CodexTurnStatusSchema,
			items: z.array(BrowserTimelineItemSchema),
			summary: boundedText(512),
			outputsIncluded: z.boolean(),
			outputsTruncated: z.boolean(),
		})
		.strict();
	const BrowserTimelineSchema = z
		.object({
			kind: z.literal("timeline"),
			threadId: ThreadIdSchema,
			turns: z.array(BrowserTimelineTurnSchema),
			nextCursor: boundedText(1024).nullable(),
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
						 * Archboard did not queue it. The host recovers it from the
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
		BrowserThreadCandidateSchema,
		BrowserThreadCandidatesSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
	};
}

export { createBrowserThreadSchemas };
