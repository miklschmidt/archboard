// The browser model's schemas and wire rules, for a host server that extends the snapshot or
// settles dynamic approvals, and for tests that build checked snapshots. A UI renders
// `./contract` instead. Safe for the browser.
export { createCodexBrowserModel, type CodexBrowserModel } from "#shared/browser/schemas/model.ts";
export { JsonValueSchema, boundedText } from "#shared/browser/schemas/scalars.ts";
export type { BrowserSchemas } from "#shared/browser/schemas/snapshot.ts";
export { BROWSER_IDLE_SPOKEN_APPROVAL } from "#shared/browser/schemas/spoken-approval.ts";
export { BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES } from "#shared/browser/schemas/vocabulary.ts";
export {
	type DynamicApprovalCanonicalEffect,
	dynamicApprovalHashForCanonicalJson,
	canonicalDynamicApprovalJson,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApprovalResponse,
} from "#shared/dynamic-approval/schemas/approval.ts";
export { CODEX_APPROVAL_MS } from "#shared/constants/durations.ts";
