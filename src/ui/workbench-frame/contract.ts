import type { WorkbenchBoardStatusProps } from "../workbench-board-status/index.js";
import type { WorkbenchComposerController } from "../workbench-composer/index.js";
import type { VoiceContextPanelProps } from "../voice-context/index.js";
import type { VoiceSession, VoiceSessionView } from "../voice-session/index.js";
import type { VoiceTranscriptProps } from "../voice-transcript/index.js";
import type {
	ThreadLinkAccountFormId,
	ThreadLinkController,
	ThreadLinkRecoveryIntent,
} from "../workbench-thread-link/index.js";
import type { WorkbenchTimelineProps } from "../workbench-timeline/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

export type WorkbenchFrameDisclosure = "expanded" | "collapsed";
export type WorkbenchFrameSpace = "workspace" | "fullscreen";

/** The shell-authored pane identity. The frame presents these bytes unchanged. */
export interface WorkbenchFramePaneIdentity {
	readonly id: string;
	readonly label: string;
}

export type WorkbenchFrameBoardStatusPort = Omit<WorkbenchBoardStatusProps, "paneLabel">;

export interface WorkbenchFrameThreadLinkPort {
	readonly controller: ThreadLinkController;
	readonly hostRecoveryIntents?: readonly ThreadLinkRecoveryIntent[];
	readonly initialAccountForm?: ThreadLinkAccountFormId;
}

/**
 * One pane's existing module-root ports. The frame composes them but never
 * copies their process, timeline, queue, approval, coordinator, or board state.
 */
export interface WorkbenchFramePane {
	readonly identity: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
	/** Null until this exact pane has a thread whose timeline can be named. */
	readonly timeline: Omit<WorkbenchTimelineProps, "className" | "label"> | null;
	readonly composerController: WorkbenchComposerController;
	readonly threadLink: WorkbenchFrameThreadLinkPort;
	readonly boardStatus: WorkbenchFrameBoardStatusPort;
}

export type WorkbenchFramePanes =
	| readonly [WorkbenchFramePane]
	| readonly [WorkbenchFramePane, WorkbenchFramePane];

const VOICE_SOURCE_CAPTURE = Symbol("workbench-frame-voice-source-capture");

interface WorkbenchFrameVoiceSourceCapture {
	readonly pane: WorkbenchFramePaneIdentity;
	readonly session: VoiceSession;
}

/** A voice slot keeps the pane and session pair captured by its caller. */
export interface WorkbenchFrameVoiceSource {
	readonly [VOICE_SOURCE_CAPTURE]: WorkbenchFrameVoiceSourceCapture;
	readonly pane: WorkbenchFramePaneIdentity;
	readonly session: VoiceSession;
}

export type WorkbenchFrameVoiceContextPort = Pick<
	VoiceContextPanelProps,
	"history" | "clipboard" | "limits"
>;

export type WorkbenchFrameVoiceTranscriptPort = Pick<VoiceTranscriptProps, "records" | "label">;

/** Caller-owned voice presentation inputs. The frame creates no voice state. */
export interface WorkbenchFrameVoiceSlot {
	readonly source: WorkbenchFrameVoiceSource;
	readonly context: WorkbenchFrameVoiceContextPort;
	readonly transcript: WorkbenchFrameVoiceTranscriptPort;
}

export function workbenchFrameVoiceSourceIssue(
	source: WorkbenchFrameVoiceSource,
	view: VoiceSessionView = source.session.view(),
): string | null {
	if (source.pane.id.trim() === "" || source.pane.label.trim() === "") {
		return "The voice session has no exact source pane identity and label.";
	}
	const captured = source[VOICE_SOURCE_CAPTURE];
	if (captured === undefined) {
		return "The voice session has no captured source pane.";
	}
	if (captured.pane !== source.pane) {
		return "The voice session was not captured from the pane identity it displays.";
	}
	if (captured.session !== source.session) {
		return "The voice session no longer matches its captured source pane.";
	}
	if (view.binding !== null && view.binding.paneId !== source.pane.id) {
		return `The voice session is bound to pane ${view.binding.paneId}, not source pane ${source.pane.id}.`;
	}
	return null;
}

/** Capture one immutable source identity with its caller-owned voice adapter. */
export function captureWorkbenchFrameVoiceSource(
	pane: Pick<WorkbenchFramePane, "identity">,
	session: VoiceSession,
): WorkbenchFrameVoiceSource {
	const identity = Object.freeze({ ...pane.identity });
	const view = session.view();
	const capture = Object.freeze({ pane: identity, session });
	const source = Object.freeze({
		[VOICE_SOURCE_CAPTURE]: capture,
		pane: identity,
		session,
	});
	const issue = workbenchFrameVoiceSourceIssue(source, view);
	if (issue !== null) throw new TypeError(issue);
	return source;
}

export type WorkbenchFrameView =
	| Readonly<{ state: "loading"; detail: string }>
	| Readonly<{ state: "empty"; detail: string }>
	| Readonly<{ state: "error"; detail: string; recovery: string }>
	| Readonly<{
			state: "ready";
			panes: WorkbenchFramePanes;
			activePaneId: WorkbenchFramePaneIdentity["id"];
	  }>;

const REQUEST_SOURCE_CAPTURE = Symbol("workbench-frame-request-source-capture");

interface WorkbenchFrameRequestSourceCapture {
	readonly pane: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
}

/**
 * A request carries its originating transport with its originating identity.
 * It is intentionally separate from the active pane so navigation cannot
 * retarget a response.
 */
export interface WorkbenchFrameRequestSource {
	readonly [REQUEST_SOURCE_CAPTURE]: WorkbenchFrameRequestSourceCapture;
	readonly pane: WorkbenchFramePaneIdentity;
	readonly transport: BrowserWorkbenchTransport;
	readonly now?: () => number;
}

/** Return the reason a captured source cannot safely present request actions. */
export function workbenchFrameRequestSourceIssue(
	source: WorkbenchFrameRequestSource,
	state: BrowserWorkbenchState,
): string | null {
	if (source.pane.id.trim() === "" || source.pane.label.trim() === "") {
		return "The application-wide request has no exact source pane identity and label.";
	}
	const captured = source[REQUEST_SOURCE_CAPTURE];
	if (captured.pane !== source.pane) {
		return "The application-wide request was not captured from the pane identity it displays.";
	}
	if (captured.transport !== source.transport) {
		return "The application-wide request was not captured with the transport it dispatches through.";
	}
	const lease = state.snapshot?.lease ?? null;
	if (lease !== null && lease.paneId !== source.pane.id) {
		return `The application-wide request source ${source.pane.label} does not match transport pane ${lease.paneId}.`;
	}
	return null;
}

/**
 * Capture identity and dispatch from one pane port. Callers cannot construct a
 * source by freely pairing one pane label with another pane's transport.
 */
export function captureWorkbenchFrameRequestSource(
	pane: Pick<WorkbenchFramePane, "identity" | "transport">,
	now?: () => number,
): WorkbenchFrameRequestSource {
	const identity = Object.freeze({ ...pane.identity });
	const sourceCapture = Object.freeze({ pane: identity, transport: pane.transport });
	const captured = Object.freeze({
		[REQUEST_SOURCE_CAPTURE]: sourceCapture,
		pane: identity,
		transport: pane.transport,
		...(now === undefined ? {} : { now }),
	}) satisfies WorkbenchFrameRequestSource;
	const issue = workbenchFrameRequestSourceIssue(captured, pane.transport.state());
	if (issue !== null) throw new TypeError(issue);
	return captured;
}

export type WorkbenchFrameRequest =
	| Readonly<{ state: "loading"; detail: string }>
	| Readonly<{ state: "empty"; detail: string }>
	| Readonly<{ state: "error"; detail: string; recovery: string }>
	| Readonly<{ state: "present"; source: WorkbenchFrameRequestSource }>;

export interface WorkbenchFrameProps {
	readonly view: WorkbenchFrameView;
	readonly request: WorkbenchFrameRequest;
	readonly voice?: WorkbenchFrameVoiceSlot | null;
	readonly disclosure: WorkbenchFrameDisclosure;
	readonly space: WorkbenchFrameSpace;
	readonly onActivePaneChange: (paneId: WorkbenchFramePaneIdentity["id"]) => void;
	readonly onDisclosureChange: (disclosure: WorkbenchFrameDisclosure) => void;
	readonly className?: string;
}
