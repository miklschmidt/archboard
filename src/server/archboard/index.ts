export { app, startServer } from "@/server/archboard/lib/application";
export { serverStartupFailureMessage } from "@/server/archboard/lib/startup-error";
export {
	ServerApplicationBusyError,
	createServerApplicationLifetime,
	createServerMutationAdmission,
} from "@/server/archboard/lib/application-lifetime";
export { createCheckoutWorkOwner } from "@/server/archboard/lib/checkout-work";
export type { CheckoutTask, CheckoutWorkOwner } from "@/server/archboard/lib/checkout-work";
export { semanticBoardContext } from "@/server/archboard/lib/semantic-board-context";
export type { BoardContext } from "@/server/archboard/lib/semantic-board-context";
export { canonicalContextFromBrief } from "@/server/archboard/lib/codex-semantic-input";
// What the Archboard server publishes about settled board changes, and the publish it
// arrives by. The Codex workbench reads the feed; every write announces through the
// broadcast. They are one path with two ends, and the module says so here
// rather than leaving each end private to whoever found it first.
export { broadcast, panes } from "@/server/archboard/lib/pane-registry";
export {
	semanticChangeFeed,
	settledChangeFields,
} from "@/server/archboard/lib/semantic-change-feed";
export type {
	SettledAnnouncement,
	SettledBoardChange,
} from "@/server/archboard/lib/semantic-change-feed";
export {
	forgetSemanticPaneContexts,
	recordSemanticPaneContext,
	semanticPaneContextFor,
} from "@/server/archboard/lib/semantic-pane-context";
export {
	createPanePresentations,
	panePresentations,
	type PanePresentations,
	type UserPresentationChange,
	type PresentOutcome,
} from "@/server/archboard/lib/pane-presentation";
export {
	narrationFor,
	subscribeNarrationChanges,
} from "@/server/archboard/lib/walkthrough-narration";
export { createVoiceStartTrace } from "@/server/archboard/lib/voice-start-trace";
export { watchTranscriptChanges } from "@/server/archboard/lib/transcript-changes";
export {
	createOutcomeReportPort,
	type OutcomeReportParts,
} from "@/server/archboard/lib/codex-workbench-outcome-report";
