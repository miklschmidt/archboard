import type { RealtimeMediaSnapshot } from "../codex-realtime/index.js";
import type { BrowserWorkbenchMediaState } from "../codex-workbench-media/index.js";
import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
} from "../workbench-transport/index.js";
import type { BrowserSnapshot } from "../../shared/codex-browser-model/index.js";

/**
 * Every state the persistent voice control may present. `agent_speaking` is the
 * presentation name for the realtime module's `speaking` phase, and `recovering`
 * is the presentation name for a permission or negotiation phase the module
 * re-entered for `recovery_requested` — the module has no `recovering` phase of
 * its own, so the reason is what distinguishes a recovery from a first start.
 */
export const VOICE_SESSION_STATUSES = Object.freeze([
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

export type VoiceSessionStatus = (typeof VOICE_SESSION_STATUSES)[number];

/**
 * The presentation vocabulary for a failure. Every realtime recoverable and
 * terminal reason maps onto exactly one of these, plus the two the adapter owns
 * itself: `replaced` when the bound pane, child epoch, thread link, or
 * coordinator moved underneath a live session, and `host_voice` when the host
 * published a failed voice projection while the browser module has no failure of
 * its own to explain it.
 */
export const VOICE_SESSION_FAILURE_CODES = Object.freeze([
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

export type VoiceSessionFailureCode = (typeof VOICE_SESSION_FAILURE_CODES)[number];

export interface VoiceSessionFailure {
	readonly code: VoiceSessionFailureCode;
	/** Whether the realtime module classified this failure as recoverable. */
	readonly recoverable: boolean;
	/** The authoritative message from the module or host; never rewritten here. */
	readonly message: string;
}

/** The controls a projected outcome may name; each is a method on the adapter. */
export type VoiceSessionControlName = "start" | "stop" | "restart" | "close";

/**
 * What the person can do about the current state. `retry` names one existing
 * control rather than choosing a recovery: the adapter never decides to reconnect
 * on its own, so an actionable failure becomes an offered button and nothing more.
 */
export type VoiceSessionOutcome =
	| { readonly kind: "none" }
	| {
			readonly kind: "retry";
			readonly control: Extract<VoiceSessionControlName, "start" | "stop" | "restart">;
			readonly label: string;
			readonly recovery: string;
	  }
	| { readonly kind: "terminal"; readonly label: string; readonly recovery: string };

export interface VoiceSessionControls {
	readonly canStart: boolean;
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
export interface VoiceSessionBinding {
	readonly paneId: string;
	readonly childId: string;
	readonly epoch: string;
	readonly workhorseThreadId: string;
	readonly coordinatorThreadId: string | null;
}

export interface VoiceSessionView {
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
}

/**
 * The already-constructed browser media owner, seen only through the values a
 * presentation adapter may read. `start` and `stop` take no arguments precisely
 * because minting a correlation is media work the UI does not do.
 */
export interface VoiceRealtimePort {
	readonly snapshot: () => RealtimeMediaSnapshot | null;
	readonly state: () => BrowserWorkbenchMediaState;
	/**
	 * The owner's own publication channel. It carries the browser-originated
	 * realtime changes — a removed microphone, a dropped ICE connection, a closed
	 * data channel, each in-start phase — that no transport delta announces, so
	 * this is what keeps the projected view honest between control calls.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	readonly start: () => Promise<RealtimeMediaSnapshot>;
	readonly stop: () => Promise<RealtimeMediaSnapshot>;
}

/**
 * The already-constructed workbench transport, seen through its read surface.
 * Deliberately narrower than the transport: `captureCommandTarget` is absent
 * because it is not a read. On the real transport it expires and renews the
 * command lease and broadcasts before it can refuse, so calling it from a
 * projection would write from inside a documented pure read.
 */
export interface VoiceTransportPort {
	readonly state: () => BrowserWorkbenchState;
	readonly snapshot: () => BrowserSnapshot | null;
	readonly capabilities: () => BrowserWorkbenchCapabilities;
	readonly subscribe: (listener: () => void) => () => void;
}

export interface VoiceSessionPorts {
	readonly realtime: VoiceRealtimePort;
	readonly transport: VoiceTransportPort;
	/**
	 * This pane's identity, supplied once by the caller that owns the pane. The
	 * adapter never asks the transport for it: the only transport call that
	 * reports a pane is a lease operation, not a read.
	 */
	readonly paneId: string;
}

export interface VoiceSession {
	readonly view: () => VoiceSessionView;
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * The microphone level, 0 to 1, kept off the status view on purpose: the
	 * realtime meter publishes it from an animation frame, and a status view
	 * carrying it would re-render every status consumer sixty times a second.
	 */
	readonly level: () => number;
	readonly subscribeLevel: (listener: () => void) => () => void;
	/** Re-reads both authoritative sources and republishes if the view changed. */
	readonly refresh: () => VoiceSessionView;
	readonly start: () => Promise<VoiceSessionView>;
	readonly stop: () => Promise<VoiceSessionView>;
	readonly restart: () => Promise<VoiceSessionView>;
	/**
	 * The explicit rebind guard: stops the realtime session and releases a
	 * terminal or replaced binding, so nothing is left holding the microphone.
	 */
	readonly close: () => Promise<VoiceSessionView>;
	/** Releases this adapter's subscription. It never disposes the owners it reads. */
	readonly dispose: () => void;
}

/** The exact inputs the pure projection reads; nothing else reaches it. */
export interface VoiceSessionProjectionInput {
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
