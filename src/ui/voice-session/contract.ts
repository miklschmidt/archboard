// The voice session adapter's typed contract: the statuses and failure codes
// it presents, the view it projects, the ports it reads, and the session it
// returns. The realtime module owns media and the state machine; this module
// owns one binding, the guards around it, and the projection.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { RealtimeMediaSnapshot } from "@/ui/codex-realtime";
import type { BrowserWorkbenchMediaState } from "@/ui/codex-workbench-media";
import type { VoiceControlsView } from "@/ui/voice-controls/contracts";
import type { VoiceOutputLevelSource, VoiceOutputWaveView } from "@/ui/voice-output-level";
import type { BrowserWorkbenchCapabilities, BrowserWorkbenchState } from "@/ui/workbench-transport";

/**
 * Every state the persistent voice control may present. `agent_speaking` is the
 * presentation name for the realtime module's `speaking` phase, and `recovering`
 * is the presentation name for a permission or negotiation phase the module
 * re-entered for `recovery_requested`.
 */
const VOICE_SESSION_STATUSES = Object.freeze([
	"unavailable",
	"ready",
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"agent_speaking",
	"recovering",
	"stopping",
	"stopped",
	"failed",
] as const);

type VoiceSessionStatus = (typeof VOICE_SESSION_STATUSES)[number];

/**
 * The presentation vocabulary for a failure. Every realtime recoverable and
 * terminal reason maps onto exactly one of these, plus the two the adapter owns
 * itself: `replaced` when the bound pane, child epoch, thread link, or
 * coordinator moved underneath a live session, and `host_voice` when the host
 * published a failed voice projection the browser module cannot explain.
 */
const VOICE_SESSION_FAILURE_CODES = Object.freeze([
	"permission",
	"device",
	"sdp",
	"ice",
	"channel",
	"audio_output",
	"realtime",
	"app_server",
	"coordinator",
	"append",
	"recovery",
	"stop",
	"browser",
	"session",
	"protocol",
	"fatal",
	"replaced",
	"host_voice",
] as const);

type VoiceSessionFailureCode = (typeof VOICE_SESSION_FAILURE_CODES)[number];

/** One presented failure. */
interface VoiceSessionFailure {
	readonly code: VoiceSessionFailureCode;
	/** Whether the realtime module classified this failure as recoverable. */
	readonly recoverable: boolean;
	/** The authoritative message from the module or host; never rewritten here. */
	readonly message: string;
}

/** The controls a projected outcome may name; each is a method on the adapter. */
type VoiceSessionControlName = "start" | "stop" | "restart" | "close";

/**
 * What the person can do about the current state. `retry` names one existing
 * control rather than choosing a recovery: the adapter never reconnects on its
 * own, so an actionable failure becomes an offered button and nothing more.
 */
type VoiceSessionOutcome =
	| { readonly kind: "none" }
	| {
			readonly kind: "retry";
			readonly control: Extract<VoiceSessionControlName, "start" | "stop" | "restart">;
			readonly label: string;
			readonly recovery: string;
	  }
	| { readonly kind: "terminal"; readonly label: string; readonly recovery: string };

/** Which controls are offered right now. */
interface VoiceSessionControls {
	readonly canStart: boolean;
	/** Offered from `listening` alone: the only phase the state machine admits `muted` from. */
	readonly canMute: boolean;
	/** The exact inverse: offered from `muted` alone. */
	readonly canUnmute: boolean;
	readonly canStop: boolean;
	readonly canRestart: boolean;
	/** Clears an explicit terminal or replaced session so a new one may be started. */
	readonly canClose: boolean;
}

/**
 * The immutable identity one voice session is bound to, as plain strings. A
 * session keeps the binding it was started with; a snapshot that disagrees with
 * it is a replacement, not a retarget.
 */
interface VoiceSessionBinding {
	readonly paneId: string;
	readonly childId: string;
	readonly epoch: string;
	readonly workhorseThreadId: string;
	readonly coordinatorThreadId: string | null;
}

/** The render-ready view of one voice session. */
interface VoiceSessionView {
	readonly status: VoiceSessionStatus;
	/** A short control label, e.g. "Listening". */
	readonly label: string;
	/** One sentence naming what is true right now. */
	readonly detail: string;
	/** The complete sentence an assistive technology announces for this state. */
	readonly accessibleStatus: string;
	readonly failure: VoiceSessionFailure | null;
	readonly outcome: VoiceSessionOutcome;
	readonly controls: VoiceSessionControls;
	readonly binding: VoiceSessionBinding | null;
	/** The realtime session identity as a plain string, for cross-linking only. */
	readonly sessionId: string | null;
	/** True while a control this adapter drove has not settled. */
	readonly busy: boolean;
}

/**
 * The already-constructed browser media owner, seen only through the values a
 * presentation adapter may read. `start` and `stop` take no arguments because
 * minting a correlation is media work the UI does not do.
 */
interface VoiceRealtimePort {
	readonly snapshot: () => RealtimeMediaSnapshot | null;
	readonly state: () => BrowserWorkbenchMediaState;
	/** The active session's measured model output level, or null between sessions. */
	readonly outputLevel: () => VoiceOutputLevelSource | null;
	/**
	 * The owner's own publication channel. It carries the browser-originated
	 * realtime changes that no transport delta announces.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	readonly start: () => Promise<RealtimeMediaSnapshot>;
	/** Silences and restores the captured microphone; no lease, no command. */
	readonly mute: () => Promise<RealtimeMediaSnapshot>;
	readonly unmute: () => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
}

/**
 * The already-constructed workbench transport, seen through its read surface.
 * `captureCommandTarget` is absent because it is not a read: on the real
 * transport it renews the command lease and broadcasts before it can refuse.
 */
interface VoiceTransportPort {
	readonly state: () => BrowserWorkbenchState;
	readonly snapshot: () => BrowserSnapshot | null;
	readonly capabilities: () => BrowserWorkbenchCapabilities;
	readonly subscribe: (listener: () => void) => () => void;
}

/** What the adapter is built over. */
interface VoiceSessionPorts {
	readonly realtime: VoiceRealtimePort;
	readonly transport: VoiceTransportPort;
	/** This pane's identity, supplied once by the caller that owns the pane. */
	readonly paneId: string;
}

/** The adapter. */
interface VoiceSession {
	readonly view: () => VoiceSessionView;
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * The measured model output level, 0..1, kept off the status view on
	 * purpose: it moves on every animation frame, and a status view carrying it
	 * would re-render every status consumer sixty times a second.
	 */
	readonly level: () => number;
	readonly subscribeLevel: (listener: () => void) => () => void;
	/** The output wave's inputs for the current phase and level. */
	readonly wave: () => VoiceOutputWaveView;
	/** The voice controls' inputs for the current view. */
	readonly controlsView: () => VoiceControlsView;
	/** Re-reads both authoritative sources and republishes if the view changed. */
	readonly refresh: () => VoiceSessionView;
	readonly start: () => Promise<VoiceSessionView>;
	/** Refused unless the projected `canMute` says the run is listening. */
	readonly mute: () => Promise<VoiceSessionView>;
	/** Refused unless the projected `canUnmute` says the run is muted. */
	readonly unmute: () => Promise<VoiceSessionView>;
	readonly stop: () => Promise<VoiceSessionView>;
	readonly restart: () => Promise<VoiceSessionView>;
	/** Stops the realtime session and releases a terminal or replaced binding. */
	readonly close: () => Promise<VoiceSessionView>;
	/** Releases this adapter's subscriptions. It never disposes the owners it reads. */
	readonly dispose: () => void;
}

/** The exact inputs the pure projection reads; nothing else reaches it. */
interface VoiceSessionProjectionInput {
	readonly media: RealtimeMediaSnapshot | null;
	readonly mediaState: BrowserWorkbenchMediaState;
	readonly transportState: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
	readonly binding: VoiceSessionBinding | null;
	/** True once the captured binding no longer matches the published snapshot. */
	readonly replaced: boolean;
	/** True while a control this adapter started has not settled. */
	readonly busy: boolean;
	/** True once close() retired a session and no new one has replaced it. */
	readonly closed: boolean;
	/** The realtime session identity close() retired, so a newer run still shows. */
	readonly closedSessionId: string | null;
	/** A control this adapter drove rejected; surfaced when nothing else explains it. */
	readonly controlFailure: VoiceSessionFailure | null;
}

export {
	VOICE_SESSION_FAILURE_CODES,
	VOICE_SESSION_STATUSES,
	type VoiceRealtimePort,
	type VoiceSession,
	type VoiceSessionBinding,
	type VoiceSessionControlName,
	type VoiceSessionControls,
	type VoiceSessionFailure,
	type VoiceSessionFailureCode,
	type VoiceSessionOutcome,
	type VoiceSessionPorts,
	type VoiceSessionProjectionInput,
	type VoiceSessionStatus,
	type VoiceSessionView,
	type VoiceTransportPort,
};
