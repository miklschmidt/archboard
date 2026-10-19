// The browser state: the projection of the workbench into the snapshot that a pane renders. Bun only.
export { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
export type {
	BrowserOwnerProjection,
	BrowserProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
