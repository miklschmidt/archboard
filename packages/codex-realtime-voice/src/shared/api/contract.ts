// What a conversation UI renders: the snapshot the server publishes and the parts a page
// draws from it. Types only. Safe for the browser.
export type { BrowserDynamicApproval } from "#shared/schemas/dynamic-approval/approval.ts";
export type {
	BrowserApproval,
	BrowserSnapshot,
	BrowserSpokenApproval,
	BrowserTimeline,
	BrowserWorkhorses,
} from "#shared/schemas/browser/snapshot.ts";
