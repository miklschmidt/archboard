import type {
	VoiceSession,
	VoiceSessionBinding,
	VoiceSessionStatus,
	VoiceSessionView,
} from "../voice-session/index.js";

/**
 * The thirteen states the persistent voice control renders. Twelve come
 * straight from the presentation adapter's status; the thirteenth exists
 * because "failed" is two different situations for the person standing at the
 * board — one they can act on now, and one that is over.
 */
export const VOICE_CONTROL_STATES = Object.freeze([
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
	"retryable_failure",
	"terminal_failure",
] as const);

export type VoiceControlState = (typeof VOICE_CONTROL_STATES)[number];

/** Every non-failure control state is exactly one adapter status. */
export type VoiceControlLiveState = Extract<VoiceControlState, VoiceSessionStatus>;

/**
 * The commands this module may emit. Each name is a method on the voice-session
 * adapter and nothing else: the module owns no media resource, mints no
 * correlation, and has no second path to the realtime session.
 */
export const VOICE_CONTROL_COMMANDS = Object.freeze([
	"start",
	"mute",
	"unmute",
	"stop",
	"restart",
	"close",
] as const);

export type VoiceControlCommand = (typeof VOICE_CONTROL_COMMANDS)[number];

/** The non-colour mark beside a state's name, so the state never needs colour. */
export type VoiceControlGlyph =
	| "microphone"
	| "microphone-muted"
	| "microphone-off"
	| "waveform"
	| "speaker"
	| "stopped"
	| "warning";

export interface VoiceControlAction {
	readonly command: VoiceControlCommand;
	/** The visible label. */
	readonly label: string;
	/** The complete accessible name, which names the pane's session. */
	readonly accessibleLabel: string;
	readonly enabled: boolean;
	/**
	 * Why the person cannot press this right now, in product words, or null when
	 * they can. Every disabled control has one: a control that refuses without
	 * saying why is indistinguishable from a broken one.
	 */
	readonly reason: string | null;
	readonly emphasis: "primary" | "secondary" | "quiet";
}

/**
 * The persistent transport row. It is rendered in every state, including before
 * a session exists and after one ends, because "is anything listening to this
 * room right now" is the question it answers.
 */
export interface VoiceTransportIndicator {
	/** The realtime module's own feature name for the transport it opens. */
	readonly feature: string;
	readonly active: boolean;
	readonly label: string;
	readonly detail: string;
	/** The immutable identity this session is bound to, as plain strings. */
	readonly binding: VoiceSessionBinding | null;
	readonly sessionId: string | null;
}

export interface VoiceControlsView {
	readonly state: VoiceControlState;
	/** The named status, always rendered as text. */
	readonly label: string;
	readonly detail: string;
	/** The one sentence an assistive technology announces. */
	readonly accessibleStatus: string;
	readonly failureMessage: string | null;
	readonly recovery: string | null;
	readonly glyph: VoiceControlGlyph;
	readonly actions: readonly VoiceControlAction[];
	readonly transport: VoiceTransportIndicator;
	/**
	 * Whether a level meter may run at all. False in every state that is not a
	 * live realtime run, which is what keeps a meter from animating after a stop,
	 * a close, or a failure.
	 */
	readonly meter: boolean;
}

export interface VoiceControlsProps {
	/** The presentation adapter for this pane's one voice session. */
	readonly session: VoiceSession;
	readonly className?: string;
}

/** The exact inputs the pure projection reads. */
export interface VoiceControlsInput {
	readonly view: VoiceSessionView;
	/** A command this control sent whose promise has not settled yet. */
	readonly pending: VoiceControlCommand | null;
}
