// The command DTOs a pane sends and the receipts it gets back: text commands
// on a thread, the lease a command runs under, the outcome of one operation,
// and the discriminated union of every browser command.

import { z } from "zod";

import {
	DeliveryOutcomeSchema,
	refineCurrentTarget,
	TimestampSchema,
} from "@/shared/codex-browser-model/lib/browser-vocabulary";
import {
	boundedText,
	JsonValueSchema,
	optionalNullableText,
} from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";
import type { DynamicApprovalSchemas } from "@/shared/codex-browser-model/lib/dynamic-approval";

/**
 * Builds the text command, command lease, operation outcome and browser
 * command schemas.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @param DynamicApprovalResponseArm - The dynamic approval response command, one arm of the command union.
 * @returns The four schemas.
 */
function createBrowserCommandSchemas(
	identity: IdentitySchemas,
	context: IdentityContext,
	DynamicApprovalResponseArm: DynamicApprovalSchemas["BrowserDynamicApprovalResponseSchema"],
) {
	const {
		ApprovalIdSchema,
		BrowserCommandIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		JsonRpcRequestIdSchema,
		LoginIdSchema,
		QueuedSubmissionIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const NullableReasonSchema = optionalNullableText(512);
	const PaneIdSchema = boundedText(128);
	const currentTarget = refineCurrentTarget(context);

	const TargetSchema = {
		commandId: BrowserCommandIdSchema,
		paneId: PaneIdSchema,
		childId: ChildIdSchema,
		epoch: ChildEpochSchema,
	};
	const BrowserTextCommandSchema = z
		.discriminatedUnion("command", [
			z
				.object({
					kind: z.literal("text_command"),
					command: z.literal("start"),
					...TargetSchema,
					threadId: ThreadIdSchema,
					prompt: boundedText(16_384),
				})
				.strict(),
			z
				.object({
					kind: z.literal("text_command"),
					command: z.literal("steer"),
					...TargetSchema,
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema,
					prompt: boundedText(16_384),
				})
				.strict(),
			z
				.object({
					kind: z.literal("text_command"),
					command: z.literal("interrupt"),
					...TargetSchema,
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema,
				})
				.strict(),
		])
		.superRefine(currentTarget);

	const BrowserCommandLeaseSchema = z
		.object({
			kind: z.literal("command_lease"),
			...TargetSchema,
			state: z.enum(["active", "expired", "released"]),
			expiresAtMs: TimestampSchema,
		})
		.strict()
		.superRefine(currentTarget);
	const BrowserOperationOutcomeSchema = z
		.object({
			kind: z.literal("operation_outcome"),
			operationId: BrowserCommandIdSchema,
			outcome: DeliveryOutcomeSchema,
			message: NullableReasonSchema,
		})
		.strict();

	const BrowserCommandBase = { kind: z.literal("browser_command"), ...TargetSchema };
	const BrowserThreadIdCommand = { threadId: ThreadIdSchema };
	const CommandArms = [
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("accountLogin"),
				login: JsonValueSchema,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("accountLoginCancel"),
				loginId: LoginIdSchema,
			})
			.strict(),
		z.object({ ...BrowserCommandBase, command: z.literal("accountLogout") }).strict(),
		z.object({ ...BrowserCommandBase, command: z.literal("threadLinkCreate") }).strict(),
		z.object({ ...BrowserCommandBase, command: z.literal("threadLinkRefresh") }).strict(),
		// A bind names the one-shot selection it consumes as well as the thread it
		// believes that selection is, so a list the host has since replaced is
		// refused instead of silently binding whatever now sits at that thread id.
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("threadLinkAttach"),
				selectionId: boundedText(128),
				...BrowserThreadIdCommand,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("threadLinkRelink"),
				selectionId: boundedText(128),
				...BrowserThreadIdCommand,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("queueAdd"),
				prompt: boundedText(16_384),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("queueUpdate"),
				submissionId: QueuedSubmissionIdSchema,
				prompt: boundedText(16_384),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("queueDelete"),
				submissionId: QueuedSubmissionIdSchema,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("queueReorder"),
				orderedSubmissionIds: z.array(QueuedSubmissionIdSchema).min(1).max(100),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("queueStart"),
				submissionId: QueuedSubmissionIdSchema,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("approvalRespond"),
				requestId: JsonRpcRequestIdSchema,
				approvalId: ApprovalIdSchema.nullable(),
				response: JsonValueSchema,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("realtimeStart"),
				threadId: ThreadIdSchema,
				sdp: boundedText(16_384),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("realtimeAppendText"),
				threadId: ThreadIdSchema,
				realtimeSessionHandle: BrowserCommandIdSchema,
				text: boundedText(4096),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("realtimeStop"),
				threadId: ThreadIdSchema,
				realtimeSessionHandle: BrowserCommandIdSchema,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("start"),
				threadId: ThreadIdSchema,
				prompt: boundedText(16_384),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("steer"),
				threadId: ThreadIdSchema,
				turnId: TurnIdSchema,
				prompt: boundedText(16_384),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("interrupt"),
				threadId: ThreadIdSchema,
				turnId: TurnIdSchema,
			})
			.strict(),
		DynamicApprovalResponseArm,
	] as const;
	const BrowserCommandSchema = z
		.discriminatedUnion("command", CommandArms)
		.superRefine(currentTarget);

	return {
		BrowserTextCommandSchema,
		BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema,
		BrowserCommandSchema,
	};
}

export { createBrowserCommandSchemas };
