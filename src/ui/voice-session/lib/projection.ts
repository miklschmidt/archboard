// The one total mapping from authoritative module, host-adapter, and
// transport state to render-ready values. It reduces no protocol event, keeps
// no history, and chooses no recovery: an actionable failure becomes an
// offered control and the person decides.

import type { RealtimeMediaSnapshot, RealtimeState } from "@/ui/codex-realtime";
import type {
	VoiceSessionControls,
	VoiceSessionFailure,
	VoiceSessionOutcome,
	VoiceSessionProjectionInput,
	VoiceSessionStatus,
	VoiceSessionView,
} from "@/ui/voice-session/contract";
import { failureSubject, presentedFailure, realtimeFailure } from "@/ui/voice-session/lib/failure";
import {
	accessibleSentence,
	narratedDetail,
	narratedStatus,
	statusLabel,
} from "@/ui/voice-session/lib/narration";
import { externalFailure, startBlocker } from "@/ui/voice-session/lib/projection-gates";

const NO_OUTCOME: VoiceSessionOutcome = Object.freeze({ kind: "none" });
const NO_CONTROLS: VoiceSessionControls = Object.freeze({
	canStart: false,
	canMute: false,
	canUnmute: false,
	canStop: false,
	canRestart: false,
	canClose: false,
});

/** Phases in which a realtime run exists, so a second start must be refused. */
const LIVE_PHASES: ReadonlySet<RealtimeState["phase"]> = new Set([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"speaking",
	"stopping",
]);

/** Statuses a host-published recovery renames; a stop or a stopped run is not one. */
const RECOVERABLE_STATUSES: ReadonlySet<VoiceSessionStatus> = new Set([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"agent_speaking",
]);

const REPLACED_RECOVERY =
	"Close this session; a new one can then be started on the current thread link.";
const STOP_UNCONFIRMED_RECOVERY =
	"The realtime host never confirmed the stop, so this session cannot restart. Close it and reconnect this pane.";
const TERMINAL_RECOVERY = "This session cannot be resumed. Close it and start a new one.";
const RESTART_RECOVERY = "Restart voice to negotiate a new realtime session on the coordinator.";
const STOP_FIRST_RECOVERY =
	"Stop voice to close the failed session; it can be started again once the workbench is ready.";
const START_RECOVERY = "Start voice again once the workbench reports it is ready.";
const REPLACED_MESSAGE =
	"The pane, child epoch, thread link, or coordinator this voice session was bound to is no longer the current one.";

/**
 * A retry outcome naming one control.
 * @param control The control.
 * @param label The button label.
 * @param recovery The recovery sentence.
 * @returns The outcome.
 */
function retry(
	control: "start" | "stop" | "restart",
	label: string,
	recovery: string,
): VoiceSessionOutcome {
	return Object.freeze({ kind: "retry", control, label, recovery });
}

/**
 * A terminal outcome.
 * @param label The button label.
 * @param recovery The recovery sentence.
 * @returns The outcome.
 */
function terminal(label: string, recovery: string): VoiceSessionOutcome {
	return Object.freeze({ kind: "terminal", label, recovery });
}

/**
 * Whether a media snapshot describes a realtime run.
 * @param media The snapshot.
 * @returns True when a run exists.
 */
function hasRealtimeRun(media: RealtimeMediaSnapshot | null): media is RealtimeMediaSnapshot {
	return media !== null && (media.correlation !== null || media.state.phase !== "idle");
}

/**
 * True when the module's own serialization has closed this session for good.
 * @param state The realtime state.
 * @returns True for an unconfirmed stop.
 */
function stopUnconfirmed(state: RealtimeState): boolean {
	return state.phase === "recoverable_error" && state.reason === "stop_failed";
}

/**
 * The detail for a failure, with the start blocker when there is one.
 * @param failure The failure.
 * @param blocker The blocker, or null.
 * @returns The detail sentence.
 */
function failureDetail(failure: VoiceSessionFailure, blocker: string | null): string {
	const opening = `${failureSubject(failure.code)} failed. ${failure.message}`;
	return blocker === null ? opening : `${opening} ${blocker}`;
}

/**
 * The retry the controls admit: restart first, then stop, else nothing.
 * @param controls The controls.
 * @returns The outcome.
 */
function retryOffer(controls: VoiceSessionControls): VoiceSessionOutcome {
	if (controls.canRestart) {
		return retry("restart", "Restart voice", RESTART_RECOVERY);
	}
	return controls.canStop ? retry("stop", "Stop voice", STOP_FIRST_RECOVERY) : NO_OUTCOME;
}

/**
 * A frozen view.
 * @param status The status.
 * @param detail The detail sentence.
 * @param failure The failure, or null.
 * @param outcome The outcome.
 * @param controls The controls.
 * @param input The projection input.
 * @returns The view.
 */
function view(
	status: VoiceSessionStatus,
	detail: string,
	failure: VoiceSessionFailure | null,
	outcome: VoiceSessionOutcome,
	controls: VoiceSessionControls,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const label = statusLabel(status);
	return Object.freeze({
		status,
		label,
		detail,
		accessibleStatus: accessibleSentence(
			label,
			detail,
			outcome.kind === "none" ? null : outcome.recovery,
		),
		failure,
		outcome,
		controls,
		binding: input.binding,
		sessionId: input.media?.correlation?.sessionId ?? null,
		busy: input.busy,
	});
}

/**
 * The view of a session whose binding was replaced under it.
 * @param input The projection input.
 * @returns The view.
 */
function replacedView(input: VoiceSessionProjectionInput): VoiceSessionView {
	const failure = presentedFailure("replaced", REPLACED_MESSAGE);
	return view(
		"failed",
		failureDetail(failure, null),
		failure,
		terminal("Close voice", REPLACED_RECOVERY),
		Object.freeze({ ...NO_CONTROLS, canClose: !input.busy }),
		input,
	);
}

/**
 * The mute toggles a healthy run offers: mute from listening, unmute from muted.
 * @param state The realtime state.
 * @param active Whether no control is in flight.
 * @returns The toggle offers.
 */
function toggleControls(
	state: RealtimeState,
	active: boolean,
): Pick<VoiceSessionControls, "canMute" | "canUnmute"> {
	return {
		canMute: active && state.phase === "listening",
		canUnmute: active && state.phase === "muted",
	};
}

/**
 * The lifecycle controls a healthy run offers: start, stop, restart.
 * @param state The realtime state.
 * @param startable Whether a start could be offered.
 * @param active Whether no control is in flight.
 * @returns The lifecycle offers.
 */
function lifecycleControls(
	state: RealtimeState,
	startable: boolean,
	active: boolean,
): Pick<VoiceSessionControls, "canStart" | "canStop" | "canRestart"> {
	const running = LIVE_PHASES.has(state.phase);
	const live = active && state.phase !== "stopping";
	const idle = active && !running;
	return {
		canStart: idle && startable,
		canStop: live && running,
		canRestart: live && startable,
	};
}

/**
 * The controls a healthy run offers.
 * @param state The realtime state.
 * @param startable Whether a start could be offered.
 * @param busy Whether a control is in flight.
 * @returns The controls.
 */
function runControls(
	state: RealtimeState,
	startable: boolean,
	busy: boolean,
): VoiceSessionControls {
	return Object.freeze({
		...lifecycleControls(state, startable, !busy),
		...toggleControls(state, !busy),
		canClose: false,
	});
}

/**
 * The status a healthy run presents, renamed to recovering while the host recovers it.
 * @param state The realtime state.
 * @param input The projection input.
 * @returns The narrated status and whether the host renamed it.
 */
function runStatus(
	state: RealtimeState,
	input: VoiceSessionProjectionInput,
): { readonly status: VoiceSessionStatus; readonly hostRecovering: boolean } {
	const narrated = narratedStatus(state);
	const hostVoice = input.transportState.snapshot?.voice ?? null;
	const hostRecovering = hostVoice?.state === "recovering" && RECOVERABLE_STATUSES.has(narrated);
	return { status: hostRecovering ? "recovering" : narrated, hostRecovering };
}

/**
 * The narrated detail, extended with the host's recovery reason while recovering.
 * @param detail The narrated detail.
 * @param hostRecovering Whether the host renamed the run to recovering.
 * @param input The projection input.
 * @returns The detail sentence.
 */
function recoveringDetail(
	detail: string,
	hostRecovering: boolean,
	input: VoiceSessionProjectionInput,
): string {
	if (!hostRecovering) {
		return detail;
	}
	const reason = input.transportState.snapshot?.voice.reason ?? null;
	return `${detail} ${reason ?? "The host is recovering this voice session."}`;
}

/**
 * The view of a healthy run.
 * @param state The realtime state.
 * @param detail The narrated detail.
 * @param blocker The start blocker, or null.
 * @param external A failure published outside the state machine, or null.
 * @param input The projection input.
 * @returns The view.
 */
function healthyRunView(
	state: RealtimeState,
	detail: string,
	blocker: string | null,
	external: VoiceSessionFailure | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const { status, hostRecovering } = runStatus(state, input);
	const controls = runControls(state, blocker === null, input.busy);
	const narrated = recoveringDetail(detail, hostRecovering, input);
	// A coordinator or voice failure the host publishes mid-run, or a control
	// this adapter drove and had refused, is the only news on the screen.
	const attached = external ?? input.controlFailure;
	if (attached === null) {
		return view(status, narrated, null, NO_OUTCOME, controls, input);
	}
	return view(
		status,
		`${narrated} ${failureSubject(attached.code)} failed. ${attached.message}`,
		attached,
		retryOffer(controls),
		controls,
		input,
	);
}

/**
 * The view of a run whose failure admits no restart.
 * @param status The status.
 * @param failure The failure.
 * @param recovery The recovery sentence.
 * @param input The projection input.
 * @returns The view.
 */
function terminalFailureView(
	status: VoiceSessionStatus,
	failure: VoiceSessionFailure,
	recovery: string,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const controls = Object.freeze({ ...NO_CONTROLS, canClose: !input.busy });
	return view(
		status,
		failureDetail(failure, null),
		failure,
		terminal("Close voice", recovery),
		controls,
		input,
	);
}

/**
 * The view of a run whose failure admits a stop or a restart.
 * @param status The status.
 * @param failure The failure.
 * @param blocker The start blocker, or null.
 * @param input The projection input.
 * @returns The view.
 */
function recoverableFailureView(
	status: VoiceSessionStatus,
	failure: VoiceSessionFailure,
	blocker: string | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const startable = blocker === null;
	const controls = Object.freeze({
		...NO_CONTROLS,
		canStop: !input.busy,
		canRestart: !input.busy && startable,
		canClose: !input.busy,
	});
	const offer = retryOffer(controls);
	return view(
		status,
		failureDetail(failure, startable ? null : blocker),
		failure,
		offer.kind === "none" ? terminal("Close voice", TERMINAL_RECOVERY) : offer,
		controls,
		input,
	);
}

/**
 * The view of a run in an error state.
 * @param state The realtime error state.
 * @param blocker The start blocker, or null.
 * @param input The projection input.
 * @returns The view.
 */
function failedRunView(
	state: RealtimeState,
	blocker: string | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const failure = realtimeFailure(state);
	if (failure === null) {
		throw new TypeError(`No realtime narration exists for ${state.phase}.`);
	}
	const { status } = runStatus(state, input);
	if (stopUnconfirmed(state)) {
		return terminalFailureView(status, failure, STOP_UNCONFIRMED_RECOVERY, input);
	}
	if (!failure.recoverable) {
		return terminalFailureView(status, failure, TERMINAL_RECOVERY, input);
	}
	return recoverableFailureView(status, failure, blocker, input);
}

/**
 * The view while a realtime run exists.
 * @param media The media snapshot.
 * @param blocker The start blocker, or null.
 * @param external A failure published outside the state machine, or null.
 * @param input The projection input.
 * @returns The view.
 */
function runView(
	media: RealtimeMediaSnapshot,
	blocker: string | null,
	external: VoiceSessionFailure | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const detail = narratedDetail(media.state);
	if (detail !== null) {
		return healthyRunView(media.state, detail, blocker, external, input);
	}
	return failedRunView(media.state, blocker, input);
}

/**
 * The view when no run shows and a failure is on the screen.
 * @param blocker The start blocker, or null.
 * @param failure The failure.
 * @param input The projection input.
 * @returns The view.
 */
function idleFailureView(
	blocker: string | null,
	failure: VoiceSessionFailure,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const controls = Object.freeze({ ...NO_CONTROLS, canStart: !input.busy && blocker === null });
	return view(
		"failed",
		failureDetail(failure, blocker),
		failure,
		controls.canStart ? retry("start", "Start voice", START_RECOVERY) : NO_OUTCOME,
		controls,
		input,
	);
}

/**
 * The view when no run shows: failed, unavailable, or ready.
 * @param blocker The start blocker, or null.
 * @param failure A failure to show, or null.
 * @param input The projection input.
 * @returns The view.
 */
function idleView(
	blocker: string | null,
	failure: VoiceSessionFailure | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	if (failure !== null) {
		return idleFailureView(blocker, failure, input);
	}
	if (blocker !== null) {
		return view("unavailable", blocker, null, NO_OUTCOME, NO_CONTROLS, input);
	}
	return view(
		"ready",
		"Voice is ready to start on this pane's linked coordinator.",
		null,
		NO_OUTCOME,
		Object.freeze({ ...NO_CONTROLS, canStart: !input.busy }),
		input,
	);
}

/**
 * Whether the media snapshot shows the exact session close() retired. A later
 * run is a new session and shows normally.
 * @param input The projection input.
 * @returns True when the shown run was retired.
 */
function retiredRun(input: VoiceSessionProjectionInput): boolean {
	const sessionId = input.media?.correlation?.sessionId ?? null;
	return input.closed && input.closedSessionId === sessionId;
}

/**
 * Projects the authoritative sources into one view.
 * @param input The projection input.
 * @returns The view.
 */
function projectVoiceSession(input: VoiceSessionProjectionInput): VoiceSessionView {
	const { media, mediaState, transportState } = input;
	const blocker = startBlocker(input);
	if (input.replaced) {
		return replacedView(input);
	}
	const external = externalFailure(mediaState, transportState.snapshot);
	if (!retiredRun(input) && hasRealtimeRun(media)) {
		return runView(media, blocker, external, input);
	}
	return idleView(blocker, external ?? input.controlFailure, input);
}

export { projectVoiceSession };
