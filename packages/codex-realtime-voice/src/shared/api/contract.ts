// What a conversation UI renders: the snapshot the server publishes and the parts a page
// draws from it. Types only. Safe for the browser.
export type { BrowserDynamicApproval } from "#shared/dynamic-approval/schemas/approval.ts";
export type {
	BrowserApproval,
	BrowserSnapshot,
	BrowserSpokenApproval,
	BrowserTimeline,
	BrowserWorkhorses,
} from "#shared/browser/schemas/snapshot.ts";
