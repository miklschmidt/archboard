// The browser model: the snapshot a pane renders, the commands it sends, the outcome of a command, and the schemas that parse them, bound to one identity authority. Safe for the browser.
export { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
export type { CodexBrowserModel } from "#shared/schemas/browser/model.ts";
export { boundedWireText, JsonValueSchema } from "#shared/schemas/browser/scalars.ts";
export type { IdentityContext } from "#shared/schemas/browser/scalars.ts";
export { BROWSER_WORKHORSE_LIMIT } from "#shared/schemas/browser/session.ts";
export { browserSnapshotRelationshipIssues } from "#shared/schemas/browser/snapshot.ts";
export type {
	BrowserAccount,
	BrowserCommand,
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserLogin,
	BrowserOperationOutcome,
	BrowserQueue,
	BrowserReadiness,
	BrowserSchemas,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
	BrowserTimeline,
	BrowserVoice,
	BrowserVoiceContext,
	BrowserVoicePresentation,
	BrowserWorkhorses,
	DeliveryOutcome,
} from "#shared/schemas/browser/snapshot.ts";
export {
	BROWSER_PERMISSION_FILE_ACCESS,
	BROWSER_TIMELINE_LIMITS,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	DeliveryOutcomeSchema,
} from "#shared/schemas/browser/vocabulary.ts";
