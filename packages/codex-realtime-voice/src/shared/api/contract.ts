// What the server publishes and a conversation UI renders, and the checked model of it, for a
// host server that extends the snapshot or settles dynamic approvals and for tests that build
// checked snapshots. Safe for the browser.
export { createCodexBrowserModel } from "#shared/browser/schemas/model.ts";
export type { BrowserDynamicApproval } from "#shared/dynamic-approval/schemas/approval.ts";
export type {
	BrowserApproval,
	BrowserSchemas,
	BrowserSnapshot,
	BrowserSpokenApproval,
	BrowserTimeline,
	BrowserWorkhorses,
} from "#shared/browser/schemas/snapshot.ts";
export type { RealtimePhase, RealtimeState } from "#shared/protocol/realtime-contract.ts";
export type {
	BrowserDynamicApprovalEffect,
	BrowserDynamicApprovalResponse,
	DynamicApprovalCanonicalEffect,
} from "#shared/dynamic-approval/schemas/approval.ts";
