// The panes on screen: how a pane is addressed, ordered and reported.
export {
	addressablePanes,
	MAX_PANES,
	paneWords,
	resolvePaneSpec,
	soloPane,
} from "#runtime/rules/panes-addressing.ts";
export { panesInOrder } from "#runtime/rules/panes-layout.ts";
export type { PaneRegistration, PanesReport } from "#runtime/rules/panes-layout.ts";
export { buildPanesReport } from "#runtime/rules/panes.ts";
