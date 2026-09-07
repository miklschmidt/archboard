import { createBrowserSchemas } from "@/shared/codex-browser-model/lib/browser";
import {
	createIdentitySchemas,
	JsonValueSchema,
	boundedText,
	boundedWireText,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
} from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityAuthorities } from "@/shared/codex-workbench-identity/index";
import type { IdentityContext } from "@/shared/codex-browser-model/lib/scalars";

/**
 * Builds the complete browser model, every identity and DTO schema, bound to
 * one identity authority so nothing the browser exchanges can name a child,
 * epoch or identity the session did not issue.
 * @param context - The identity authorities, or a decoder-and-validator context with an optional operation capability.
 * @returns The identity schemas together with the browser DTO and command schemas.
 */
function createCodexBrowserModel(context: IdentityContext | IdentityAuthorities) {
	const normalizedContext: IdentityContext =
		"identity" in context ? { ...context.identity, operation: context.operation } : context;
	const identity = createIdentitySchemas(normalizedContext);
	return {
		...identity,
		...createBrowserSchemas(identity, normalizedContext),
	};
}

type CodexBrowserModel = ReturnType<typeof createCodexBrowserModel>;

export {
	JsonValueSchema,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
	boundedText,
	boundedWireText,
	createCodexBrowserModel,
	type CodexBrowserModel,
};
export {
	BROWSER_SPOKEN_APPROVAL_REASONS,
	BROWSER_SPOKEN_APPROVAL_STATES,
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createBrowserSpokenApprovalSchema,
} from "@/shared/codex-browser-model/lib/spoken-approval";
export {
	BROWSER_PERMISSION_FILE_ACCESS,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	browserSnapshotRelationshipIssues,
	DeliveryOutcomeSchema,
} from "@/shared/codex-browser-model/lib/browser";
export {
	createDynamicApprovalSchemas,
	canonicalDynamicApprovalJson,
	dynamicApprovalHashForCanonicalJson,
	CODEX_APPROVAL_EXPIRY_MS,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
} from "@/shared/codex-browser-model/lib/dynamic-approval";
export type {
	BrowserAccount,
	BrowserApproval,
	BrowserCommand,
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserDto,
	BrowserLogin,
	BrowserOperationOutcome,
	BrowserQueue,
	BrowserReadiness,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserTextCommand,
	BrowserThreadCandidate,
	BrowserThreadCandidates,
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
	BrowserTimeline,
	BrowserVoice,
	BrowserSpokenApproval,
	BrowserVoiceContext,
	BrowserSchemas,
	DeliveryOutcome,
} from "@/shared/codex-browser-model/lib/browser";
export type {
	BrowserDynamicApproval,
	BrowserDynamicApprovalEffect,
	BrowserDynamicApprovalResponse,
	BrowserDynamicApprovalResponseCommand,
	BrowserDynamicCoordinationApproval,
	DynamicApprovalCanonicalEffect,
	DynamicApprovalCanonicalIdentity,
	DynamicApprovalCanonicalInput,
	DynamicApprovalBinding,
	DynamicApprovalDecision,
	DynamicApprovalEffect,
	DynamicApprovalIdentity,
	DynamicApprovalLink,
	DynamicApprovalRequest,
	DynamicApprovalResponse,
	DynamicApprovalState,
	DynamicApprovalToolResult,
	DynamicApprovalSchemas,
	DynamicCoordinationApprovalRequest,
	DynamicCoordinationApprovalResponse,
	DynamicCoordinationApprovalState,
} from "@/shared/codex-browser-model/lib/dynamic-approval";
export type {
	AnyIdentity,
	CodexIdentity,
	IdentityContext,
	IdentitySchemas,
	JsonValue,
} from "@/shared/codex-browser-model/lib/scalars";
