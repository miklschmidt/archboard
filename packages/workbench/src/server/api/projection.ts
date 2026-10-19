// The browser state: the projection of the workbench into the snapshot that a pane renders, the budget that bounds it and the redaction of secrets in it. The types name the inputs that the server projects from. Bun only.
export { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
export type {
	BrowserAccountProjectionInput,
	BrowserOwnerProjection,
	BrowserProjectionInput,
	CodexQueueProjectionInput,
	CodexTimelineFileChangeEntry,
	CodexTimelineItemProjectionInput,
	CodexTimelinePlanInput,
	CodexTimelineProjectionInput,
	CodexTimelineTurnProjectionInput,
	CodexTimelineUsageInput,
	DynamicApprovalOwnerBinding,
	DynamicApprovalOwnerRequest,
	DynamicApprovalOwnerView,
} from "#server/protocol/projection/projection-contract.ts";
export { redactSecrets } from "#server/rules/snapshot/secret-keys.ts";
export {
	assertBrowserSnapshotBudget,
	BROWSER_SNAPSHOT_MAX_BYTES,
	BROWSER_SNAPSHOT_MIN_BYTES,
} from "#server/rules/snapshot/snapshot-bounds.ts";
