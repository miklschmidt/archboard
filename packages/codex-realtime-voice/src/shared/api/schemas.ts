// The browser model's schemas and wire rules, for a host server that extends the snapshot or
// settles dynamic approvals, and for tests that build checked snapshots. A UI renders
// `./contract` instead. Safe for the browser.
export { createCodexBrowserModel, type CodexBrowserModel } from "#shared/schemas/browser/model.ts";
export { JsonValueSchema, boundedText } from "#shared/schemas/browser/scalars.ts";
export type { BrowserSchemas } from "#shared/schemas/browser/snapshot.ts";
export { BROWSER_IDLE_SPOKEN_APPROVAL } from "#shared/schemas/browser/spoken-approval.ts";
export {
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
} from "#shared/schemas/browser/vocabulary.ts";
export {
	type DynamicApprovalCanonicalEffect,
	dynamicApprovalHashForCanonicalJson,
	canonicalDynamicApprovalJson,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApprovalResponse,
} from "#shared/schemas/dynamic-approval/approval.ts";
