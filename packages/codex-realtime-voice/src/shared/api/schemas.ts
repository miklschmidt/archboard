// The browser model's schemas and wire rules, for a host server that extends the snapshot or
// settles dynamic approvals, and for tests that build checked snapshots. A UI renders
// `./contract` instead. Safe for the browser.
export { createCodexBrowserModel } from "#shared/browser/schemas/model.ts";
export { parseJsonValue, boundedText } from "#shared/browser/schemas/scalars.ts";
export type { BrowserSchemas } from "#shared/browser/schemas/snapshot.ts";
export {
	type DynamicApprovalCanonicalEffect,
	dynamicApprovalHashForCanonicalJson,
	canonicalDynamicApprovalJson,
	type BrowserDynamicApprovalEffect,
	type BrowserDynamicApprovalResponse,
} from "#shared/dynamic-approval/schemas/approval.ts";
