import { REALTIME_MEDIA_FEATURE } from "../../codex-realtime/index.js";
import type { VoiceSessionStatus, VoiceSessionView } from "../../voice-session/index.js";
import type {
	VoiceControlAction,
	VoiceControlCommand,
	VoiceControlGlyph,
	VoiceControlState,
	VoiceControlsInput,
	VoiceControlsView,
	VoiceTransportIndicator,
} from "../contract.js";

/** States in which a realtime run exists, so the transport row reads active. */
const LIVE_STATES = new Set<VoiceControlState>([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"agent_speaking",
	"recovering",
	"stopping",
]);

/**
 * The only states a level meter may run in. `stopping`, `stopped`, and both
 * failures are deliberately absent: a meter still moving after the microphone
 * closed is a lie about who is listening.
 */
const METER_STATES = new Set<VoiceControlState>([
	"listening",
	"muted",
	"processing",
	"agent_speaking",
	"recovering",
]);

const GLYPHS = {
	unavailable: "microphone-off",
	ready: "microphone",
	requesting_permission: "microphone",
	negotiating: "waveform",
	listening: "waveform",
	muted: "microphone-muted",
	processing: "waveform",
	agent_speaking: "speaker",
	recovering: "waveform",
	stopping: "stopped",
	stopped: "stopped",
	retryable_failure: "warning",
	terminal_failure: "warning",
} as const satisfies Record<VoiceControlState, VoiceControlGlyph>;

/** What is already running, named so a second press can say what to wait for. */
const PENDING_REASONS = {
	start: "Voice is starting. Wait for it to finish before pressing again.",
	mute: "The microphone is being muted. Wait for it to finish before pressing again.",
	unmute: "The microphone is being unmuted. Wait for it to finish before pressing again.",
	stop: "Voice is stopping. Wait for it to finish before pressing again.",
	restart: "Voice is restarting. Wait for it to finish before pressing again.",
	close: "This voice session is closing. Wait for it to finish before pressing again.",
} as const satisfies Record<VoiceControlCommand, string>;

const NOT_STARTABLE = "The Codex workbench is not ready to start voice on this pane yet.";
const ALREADY_RUNNING = "Voice is already running on this pane. Stop it before starting again.";
const MUTE_WHEN_LISTENING = "Mute is available while voice is listening.";
const UNMUTE_WHEN_MUTED = "Unmute is available while the microphone is muted.";
const NOTHING_TO_STOP = "There is no running voice session to stop.";
const RESTART_WHEN_READY = "Restart is available once the workbench can start voice again.";
const CLOSE_WHEN_ENDED = "Close is available once this voice session has ended.";

/** The states whose own detail sentence already says why a start is refused. */
const SELF_EXPLAINING = new Set<VoiceControlState>([
	"unavailable",
	"retryable_failure",
	"terminal_failure",
]);

/**
 * A failure is terminal exactly when the adapter says it is terminal. Anything
 * else is retryable-when-permitted: the retry may be unavailable right now, and
 * the action carries the reason for that rather than disappearing.
 */
export function voiceControlState(view: VoiceSessionView): VoiceControlState {
	if (view.status !== "failed") return view.status satisfies VoiceSessionStatus;
	return view.outcome.kind === "terminal" ? "terminal_failure" : "retryable_failure";
}

function bound(view: VoiceSessionView): string {
	const binding = view.binding;
	if (binding === null) return "this pane";
	const coordinator = binding.coordinatorThreadId ?? "no coordinator yet";
	return `pane ${binding.paneId}, thread link ${binding.workhorseThreadId}, coordinator ${coordinator}`;
}

function action(
	command: VoiceControlCommand,
	label: string,
	accessibleLabel: string,
	permitted: boolean,
	reason: string,
	emphasis: VoiceControlAction["emphasis"],
	pending: VoiceControlCommand | null,
): VoiceControlAction {
	// Pending beats permission: while a command this control sent is unsettled,
	// every control refuses and names what is running. That is what makes a
	// repeated press, and a press that arrives late, inert without a second
	// state machine deciding it.
	const enabled = pending === null && permitted;
	return Object.freeze({
		command,
		label,
		accessibleLabel,
		enabled,
		reason: enabled ? null : pending === null ? reason : PENDING_REASONS[pending],
		emphasis,
	});
}

function startReason(view: VoiceSessionView, state: VoiceControlState): string {
	if (LIVE_STATES.has(state)) return ALREADY_RUNNING;
	return SELF_EXPLAINING.has(state) ? view.detail : NOT_STARTABLE;
}

function transport(view: VoiceSessionView, state: VoiceControlState): VoiceTransportIndicator {
	const active = LIVE_STATES.has(state);
	return Object.freeze({
		feature: REALTIME_MEDIA_FEATURE,
		active,
		label: active ? "Live audio transport" : "No audio transport",
		detail: active
			? `Realtime ${REALTIME_MEDIA_FEATURE} is open on ${bound(view)}.`
			: `No realtime ${REALTIME_MEDIA_FEATURE} transport is open on ${bound(view)}.`,
		binding: view.binding,
		sessionId: view.sessionId,
	});
}

/**
 * The persistent command row plus, at most, one recovery command. The first
 * three slots never move: Start, the microphone toggle, and Stop are in the
 * same place in all thirteen states, because a control that appears and
 * disappears cannot be found by muscle memory on a 75-inch display.
 */
function actions(
	view: VoiceSessionView,
	state: VoiceControlState,
	pending: VoiceControlCommand | null,
): readonly VoiceControlAction[] {
	const identity = bound(view);
	const controls = view.controls;
	const retry = view.outcome.kind === "retry" ? view.outcome : null;
	const startLabel = retry?.control === "start" ? retry.label : "Start voice";
	const stopLabel = retry?.control === "stop" ? retry.label : "Stop voice";
	const muted = state === "muted";
	const list: VoiceControlAction[] = [
		action(
			"start",
			startLabel,
			`${startLabel} on ${identity}`,
			controls.canStart,
			startReason(view, state),
			"primary",
			pending,
		),
		muted
			? action(
					"unmute",
					"Unmute microphone",
					`Unmute the microphone on ${identity}`,
					controls.canUnmute,
					UNMUTE_WHEN_MUTED,
					"primary",
					pending,
				)
			: action(
					"mute",
					"Mute microphone",
					`Mute the microphone on ${identity}`,
					controls.canMute,
					MUTE_WHEN_LISTENING,
					"secondary",
					pending,
				),
		action(
			"stop",
			stopLabel,
			`${stopLabel} on ${identity}`,
			controls.canStop,
			NOTHING_TO_STOP,
			"secondary",
			pending,
		),
	];
	if (retry?.control === "restart")
		list.push(
			action(
				"restart",
				retry.label,
				`${retry.label} on ${identity}`,
				controls.canRestart,
				RESTART_WHEN_READY,
				"primary",
				pending,
			),
		);
	if (view.outcome.kind === "terminal" || controls.canClose)
		list.push(
			action(
				"close",
				"Close voice",
				`Close this voice session on ${identity}`,
				controls.canClose,
				CLOSE_WHEN_ENDED,
				"quiet",
				pending,
			),
		);
	return Object.freeze(list);
}

/**
 * The one pure map from the adapter's projected view, plus this control's own
 * unsettled command, to render-ready values. It reads no media object, keeps no
 * history, and chooses no recovery: the adapter's offered control becomes a
 * button and the person decides.
 */
export function projectVoiceControls({ view, pending }: VoiceControlsInput): VoiceControlsView {
	const state = voiceControlState(view);
	return Object.freeze({
		state,
		label: view.label,
		detail: view.detail,
		accessibleStatus: view.accessibleStatus,
		failureMessage: view.failure?.message ?? null,
		recovery: view.outcome.kind === "none" ? null : view.outcome.recovery,
		glyph: GLYPHS[state],
		actions: actions(view, state, pending),
		transport: transport(view, state),
		meter: METER_STATES.has(state),
	});
}
