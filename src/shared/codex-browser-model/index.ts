import { createBrowserSchemas } from "./lib/browser.js";
import {
	createIdentitySchemas,
	JsonValueSchema,
	boundedText,
	boundedWireText,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
} from "./lib/scalars.js";
import type { IdentityAuthorities } from "../codex-workbench-identity/index.js";
import type { IdentityContext } from "./lib/scalars.js";

export {
	BROWSER_PERMISSION_FILE_ACCESS,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	browserSnapshotRelationshipIssues,
	DeliveryOutcomeSchema,
} from "./lib/browser.js";
export {
	JsonValueSchema,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
	boundedText,
	boundedWireText,
};
export {
	createDynamicApprovalSchemas,
	canonicalDynamicApprovalJson,
	dynamicApprovalHashForCanonicalJson,
	CODEX_APPROVAL_EXPIRY_MS,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_STATES,
	DYNAMIC_APPROVAL_TOOLS,
} from "./lib/dynamic-approval.js";

export function createCodexBrowserModel(context: IdentityContext | IdentityAuthorities) {
	const normalizedContext: IdentityContext =
		"identity" in context ? { ...context.identity, operation: context.operation } : context;
	const identity = createIdentitySchemas(normalizedContext);
	return {
		...identity,
		...createBrowserSchemas(identity, normalizedContext),
	};
}

export type CodexBrowserModel = ReturnType<typeof createCodexBrowserModel>;

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
	BrowserSchemas,
	DeliveryOutcome,
} from "./lib/browser.js";

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
} from "./lib/dynamic-approval.js";

export type {
	AnyIdentity,
	CodexIdentity,
	IdentityContext,
	IdentitySchemas,
	JsonValue,
} from "./lib/scalars.js";
