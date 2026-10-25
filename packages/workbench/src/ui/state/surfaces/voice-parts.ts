// Names for the parts of the voice package's owners that the Archboard surfaces read, derived
// from the owners themselves so they cannot drift from what the package publishes.

import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchTransport,
	ConversationControllers,
	ConversationTurn,
} from "@archboard/codex-realtime-voice/controllers";
import type { RealtimeState } from "@archboard/codex-realtime-voice/realtime";

/** What the transport may do right now. */
type BrowserWorkbenchCapabilities = ReturnType<BrowserWorkbenchTransport["capabilities"]>;
/** Where the media owner stands: installing, ready to start, or why it cannot. */
type BrowserWorkbenchMediaState = ReturnType<BrowserWorkbenchMediaOwner["state"]>;
/** One voice run's correlation and state. */
type RealtimeMediaSnapshot = NonNullable<ReturnType<BrowserWorkbenchMediaOwner["snapshot"]>>;
/** Why a voice run failed and can be retried. */
type RealtimeRecoverableErrorReason = Extract<
	RealtimeState,
	{ readonly phase: "recoverable_error" }
>["reason"];
/** Why a voice run failed for good. */
type RealtimeTerminalErrorReason = Extract<
	RealtimeState,
	{ readonly phase: "terminal_error" }
>["reason"];
/** One item of a conversation turn. */
type ConversationItem = ConversationTurn["items"][number];
/** Whose conversation a turn belongs to. */
type ConversationOwner = ConversationTurn["owner"];
/** What the composer answers a submission with. */
type WorkbenchComposerSubmissionResult = Awaited<
	ReturnType<ConversationControllers["composer"]["submit"]>
>;
/** The queue panel's actions. */
type WorkbenchQueueActions = ConversationControllers["queue"]["panelActions"];
/** A verdict on a dynamic coordination approval. */
type DynamicApprovalVerdict = Parameters<
	ConversationControllers["approvals"]["panelActions"]["respondToDynamicApproval"]
>[1];

export type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchMediaState,
	ConversationItem,
	ConversationOwner,
	DynamicApprovalVerdict,
	RealtimeMediaSnapshot,
	RealtimeRecoverableErrorReason,
	RealtimeTerminalErrorReason,
	WorkbenchComposerSubmissionResult,
	WorkbenchQueueActions,
};
