// The approvals the browser shows and answers: the approval, the dynamic approval with its effect and canonical hash, and the spoken approval. Safe for the browser.
export type { BrowserApproval, BrowserSpokenApproval } from "#shared/schemas/browser/snapshot.ts";
export {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	BROWSER_SPOKEN_APPROVAL_REASONS,
} from "#shared/schemas/browser/spoken-approval.ts";
export {
	canonicalDynamicApprovalJson,
	dynamicApprovalHashForCanonicalJson,
} from "#shared/schemas/dynamic-approval/approval.ts";
export type {
	BrowserDynamicApproval,
	BrowserDynamicApprovalEffect,
	BrowserDynamicApprovalResponse,
	DynamicApprovalCanonicalEffect,
} from "#shared/schemas/dynamic-approval/approval.ts";
export { DYNAMIC_APPROVAL_DECISIONS } from "#shared/schemas/dynamic-approval/effects.ts";
