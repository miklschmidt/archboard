// The browser model: the snapshot a pane renders and the DTO union every
// message on the pane transport must be one of. The DTO families live in
// browser-session, browser-thread, browser-approvals, browser-voice and
// browser-commands; this file composes them and checks the relationships
// that hold across families.

import { z } from "zod";

import { createBrowserApprovalSchemas } from "@/shared/codex-browser-model/lib/browser-approvals";
import { createBrowserCommandSchemas } from "@/shared/codex-browser-model/lib/browser-commands";
import { createBrowserSessionSchemas } from "@/shared/codex-browser-model/lib/browser-session";
import { createBrowserThreadSchemas } from "@/shared/codex-browser-model/lib/browser-thread";
import {
	BROWSER_PERMISSION_FILE_ACCESS,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	DeliveryOutcomeSchema,
} from "@/shared/codex-browser-model/lib/browser-vocabulary";
import { createBrowserVoiceSchemas } from "@/shared/codex-browser-model/lib/browser-voice";
import { createDynamicApprovalSchemas } from "@/shared/codex-browser-model/lib/dynamic-approval";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";
import { createBrowserSpokenApprovalSchema } from "@/shared/codex-browser-model/lib/spoken-approval";

interface BrowserSnapshotRelationshipIssue {
	readonly path: readonly string[];
	readonly message: string;
}

interface BrowserSnapshotRelationshipFields {
	readonly threadLink: {
		readonly state: string;
		readonly threadId: string | null;
	};
	readonly timeline: { readonly threadId: string } | null;
	readonly semantic: { readonly threadId: string } | null;
	readonly voice?: { readonly realtimeSessionId: string | null } | undefined;
	readonly voiceContext?: { readonly sessionId: string } | null | undefined;
}

/**
 * Tells whether a thread-scoped field names a thread other than the linked one.
 * @param value - The snapshot fields.
 * @param scoped - The thread-scoped field, or null when absent.
 * @returns True when the field is present and its thread differs from the link's.
 */
function contradictsThreadLink(
	value: BrowserSnapshotRelationshipFields,
	scoped: { readonly threadId: string } | null,
): boolean {
	return scoped !== null && value.threadLink.threadId !== scoped.threadId;
}

/**
 * Tells whether an unbound link is accompanied by thread-scoped state.
 * @param value - The snapshot fields.
 * @returns True when the link is unbound yet a timeline or semantic receipt is present.
 */
function unboundLinkPublishesThreadState(value: BrowserSnapshotRelationshipFields): boolean {
	return (
		value.threadLink.state === "unbound" && (value.timeline !== null || value.semantic !== null)
	);
}

/**
 * Tells whether the voice context names a session other than the active voice session.
 * @param value - The snapshot fields.
 * @returns True when a voice context is present and its session differs from voice's.
 */
function voiceContextContradictsVoice(value: BrowserSnapshotRelationshipFields): boolean {
	const voiceContext = value.voiceContext ?? null;
	return voiceContext !== null && value.voice?.realtimeSessionId !== voiceContext.sessionId;
}

/**
 * Checks relationships between fields after each field has passed its own schema.
 * @param value - The snapshot fields the relationships are about.
 * @returns The issues found, empty when every relationship holds.
 */
function browserSnapshotRelationshipIssues(
	value: BrowserSnapshotRelationshipFields,
): readonly BrowserSnapshotRelationshipIssue[] {
	const issues: BrowserSnapshotRelationshipIssue[] = [];
	for (const [name, scoped] of [
		["timeline", value.timeline],
		["semantic", value.semantic],
	] as const) {
		if (contradictsThreadLink(value, scoped)) {
			issues.push({
				path: [name, "threadId"],
				message: "thread identity contradicts the current thread link",
			});
		}
	}
	if (unboundLinkPublishesThreadState(value)) {
		issues.push({
			path: ["threadLink", "state"],
			message: "an unbound link cannot publish thread-scoped state",
		});
	}
	if (voiceContextContradictsVoice(value)) {
		issues.push({
			path: ["voiceContext", "sessionId"],
			message: "voice context identity contradicts the active voice session",
		});
	}
	return issues;
}

/**
 * Builds every browser DTO schema bound to one identity authority, plus the
 * snapshot that composes them and the union the transport accepts.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @returns The DTO schemas, the snapshot and DTO union, and the dynamic approval schemas.
 */
function createBrowserSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const dynamic = createDynamicApprovalSchemas(identity, context);
	const BrowserSpokenApprovalSchema = createBrowserSpokenApprovalSchema(identity);
	const session = createBrowserSessionSchemas(identity);
	const thread = createBrowserThreadSchemas(identity, context);
	const { BrowserApprovalSchema } = createBrowserApprovalSchemas(identity, context);
	const voice = createBrowserVoiceSchemas(identity);
	const commands = createBrowserCommandSchemas(
		identity,
		context,
		dynamic.BrowserDynamicApprovalResponseSchema,
	);

	const BrowserSnapshotSchema = z
		.object({
			kind: z.literal("snapshot"),
			version: z.literal(1),
			readiness: session.BrowserReadinessSchema,
			account: session.BrowserAccountSchema,
			login: session.BrowserLoginSchema,
			threadLink: thread.BrowserThreadLinkSchema,
			threadCandidates: thread.BrowserThreadCandidatesSchema,
			timeline: thread.BrowserTimelineSchema.nullable(),
			queue: thread.BrowserQueueSchema,
			settings: z.array(session.BrowserSettingsSchema),
			approvals: z.array(BrowserApprovalSchema),
			dynamicApprovals: z.array(dynamic.BrowserDynamicApprovalSchema),
			semantic: voice.BrowserSemanticDeliverySchema.nullable(),
			coordinator: voice.BrowserCoordinatorSchema,
			voice: voice.BrowserVoiceSchema,
			spokenApproval: BrowserSpokenApprovalSchema,
			voiceContext: voice.BrowserVoiceContextSchema.nullable().optional(),
			lease: commands.BrowserCommandLeaseSchema.nullable(),
			operation: commands.BrowserOperationOutcomeSchema.nullable(),
		})
		.strict()
		.superRefine((value, refinementContext) => {
			for (const issue of browserSnapshotRelationshipIssues(value)) {
				refinementContext.addIssue({
					code: "custom",
					path: [...issue.path],
					message: issue.message,
				});
			}
		});
	const BrowserDtoSchema = z.union([
		BrowserSnapshotSchema,
		session.BrowserReadinessSchema,
		session.BrowserAccountSchema,
		session.BrowserLoginSchema,
		thread.BrowserThreadLinkSchema,
		thread.BrowserThreadCandidatesSchema,
		thread.BrowserTimelineSchema,
		thread.BrowserQueueSchema,
		session.BrowserSettingsSchema,
		BrowserApprovalSchema,
		dynamic.BrowserDynamicApprovalSchema,
		commands.BrowserTextCommandSchema,
		voice.BrowserSemanticDeliverySchema,
		voice.BrowserCoordinatorSchema,
		voice.BrowserVoiceSchema,
		BrowserSpokenApprovalSchema,
		commands.BrowserCommandLeaseSchema,
		commands.BrowserOperationOutcomeSchema,
	]);

	return {
		BrowserReadinessSchema: session.BrowserReadinessSchema,
		BrowserThreadCandidateSchema: thread.BrowserThreadCandidateSchema,
		BrowserThreadCandidatesSchema: thread.BrowserThreadCandidatesSchema,
		BrowserAccountSchema: session.BrowserAccountSchema,
		BrowserLoginSchema: session.BrowserLoginSchema,
		BrowserThreadLinkSourcePresentationSchema: thread.BrowserThreadLinkSourcePresentationSchema,
		BrowserThreadLinkSchema: thread.BrowserThreadLinkSchema,
		BrowserTimelineSchema: thread.BrowserTimelineSchema,
		BrowserQueueSchema: thread.BrowserQueueSchema,
		BrowserSettingsSchema: session.BrowserSettingsSchema,
		BrowserApprovalSchema,
		BrowserTextCommandSchema: commands.BrowserTextCommandSchema,
		BrowserSemanticDeliverySchema: voice.BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema: voice.BrowserCoordinatorSchema,
		BrowserVoiceSchema: voice.BrowserVoiceSchema,
		BrowserSpokenApprovalSchema,
		BrowserVoiceContextSchema: voice.BrowserVoiceContextSchema,
		BrowserCommandLeaseSchema: commands.BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema: commands.BrowserOperationOutcomeSchema,
		BrowserCommandSchema: commands.BrowserCommandSchema,
		BrowserSnapshotSchema,
		BrowserDtoSchema,
		...dynamic,
	};
}

type BrowserSchemas = ReturnType<typeof createBrowserSchemas>;
type BrowserReadiness = z.infer<BrowserSchemas["BrowserReadinessSchema"]>;
type BrowserAccount = z.infer<BrowserSchemas["BrowserAccountSchema"]>;
type BrowserLogin = z.infer<BrowserSchemas["BrowserLoginSchema"]>;
type BrowserThreadLinkSourcePresentation = z.infer<
	BrowserSchemas["BrowserThreadLinkSourcePresentationSchema"]
>;
type BrowserThreadLink = z.infer<BrowserSchemas["BrowserThreadLinkSchema"]>;
type BrowserThreadCandidate = z.infer<BrowserSchemas["BrowserThreadCandidateSchema"]>;
type BrowserThreadCandidates = z.infer<BrowserSchemas["BrowserThreadCandidatesSchema"]>;
type BrowserTimeline = z.infer<BrowserSchemas["BrowserTimelineSchema"]>;
type BrowserQueue = z.infer<BrowserSchemas["BrowserQueueSchema"]>;
type BrowserSettings = z.infer<BrowserSchemas["BrowserSettingsSchema"]>;
type BrowserApproval = z.infer<BrowserSchemas["BrowserApprovalSchema"]>;
type BrowserTextCommand = z.infer<BrowserSchemas["BrowserTextCommandSchema"]>;
type BrowserSemanticDelivery = z.infer<BrowserSchemas["BrowserSemanticDeliverySchema"]>;
type BrowserCoordinator = z.infer<BrowserSchemas["BrowserCoordinatorSchema"]>;
type BrowserVoice = z.infer<BrowserSchemas["BrowserVoiceSchema"]>;
type BrowserSpokenApproval = z.infer<BrowserSchemas["BrowserSpokenApprovalSchema"]>;
type BrowserVoiceContext = z.infer<BrowserSchemas["BrowserVoiceContextSchema"]>;
type BrowserCommandLease = z.infer<BrowserSchemas["BrowserCommandLeaseSchema"]>;
type BrowserOperationOutcome = z.infer<BrowserSchemas["BrowserOperationOutcomeSchema"]>;
type BrowserCommand = z.infer<BrowserSchemas["BrowserCommandSchema"]>;
type BrowserSnapshot = z.infer<BrowserSchemas["BrowserSnapshotSchema"]>;
type BrowserDto = z.infer<BrowserSchemas["BrowserDtoSchema"]>;
type DeliveryOutcome = z.infer<typeof DeliveryOutcomeSchema>;

export {
	DeliveryOutcomeSchema,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	BROWSER_PERMISSION_FILE_ACCESS,
	type BrowserSnapshotRelationshipIssue,
	browserSnapshotRelationshipIssues,
	createBrowserSchemas,
	type BrowserSchemas,
	type BrowserReadiness,
	type BrowserAccount,
	type BrowserLogin,
	type BrowserThreadLinkSourcePresentation,
	type BrowserThreadLink,
	type BrowserThreadCandidate,
	type BrowserThreadCandidates,
	type BrowserTimeline,
	type BrowserQueue,
	type BrowserSettings,
	type BrowserApproval,
	type BrowserTextCommand,
	type BrowserSemanticDelivery,
	type BrowserCoordinator,
	type BrowserVoice,
	type BrowserSpokenApproval,
	type BrowserVoiceContext,
	type BrowserCommandLease,
	type BrowserOperationOutcome,
	type BrowserCommand,
	type BrowserSnapshot,
	type BrowserDto,
	type DeliveryOutcome,
};
