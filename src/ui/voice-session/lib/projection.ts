import type { RealtimeMediaSnapshot, RealtimeState } from "../../codex-realtime/index.js";
import type { BrowserWorkbenchMediaState } from "../../codex-workbench-media/index.js";
import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	VoiceSessionControls,
	VoiceSessionFailure,
	VoiceSessionFailureCode,
	VoiceSessionOutcome,
	VoiceSessionProjectionInput,
	VoiceSessionStatus,
	VoiceSessionView,
} from "../contract.js";
import { failureSubject, presentedFailure, realtimeFailure } from "./failure.js";
import { accessibleSentence, narratedDetail, narratedStatus, statusLabel } from "./narration.js";

const NO_OUTCOME: VoiceSessionOutcome = Object.freeze({ kind: "none" });
const NO_CONTROLS: VoiceSessionControls = Object.freeze({
	canStart: false,
	canStop: false,
	canRestart: false,
	canClose: false,
});

/** Phases in which a realtime run exists, so a second start must be refused. */
const LIVE_PHASES = new Set<RealtimeState["phase"]>([
	"requesting_permission",
	"negotiating",
	"listening",
	"muted",
	"processing",
	"speaking",
	"stopping",
]);

type MediaUnavailable = Extract<BrowserWorkbenchMediaState, { readonly state: "unavailable" }>;

/**
 * `detached` and `socket_closed` say the workbench is absent, not that voice
 * broke, so they carry no failure and present as plain unavailability.
 */
const MEDIA_UNAVAILABLE_FAILURES = {
	media_api_unavailable: "browser",
	permission_denied: "permission",
	negotiation_failed: "realtime",
	detached: null,
	socket_closed: null,
} as const satisfies Record<MediaUnavailable["reason"], VoiceSessionFailureCode | null>;

const REPLACED_RECOVERY =
	"Close this session; a new one can then be started on the current thread link.";
const STOP_UNCONFIRMED_RECOVERY =
	"The realtime host never confirmed the stop, so this session cannot restart. Close it and reconnect this pane.";
const TERMINAL_RECOVERY = "This session cannot be resumed. Close it and start a new one.";
const RESTART_RECOVERY = "Restart voice to negotiate a new realtime session on the coordinator.";
const STOP_FIRST_RECOVERY =
	"Stop voice to close the failed session; it can be started again once the workbench is ready.";
const START_RECOVERY = "Start voice again once the workbench reports it is ready.";

function retry(
	control: "start" | "stop" | "restart",
	label: string,
	recovery: string,
): VoiceSessionOutcome {
	return Object.freeze({ kind: "retry", control, label, recovery });
}

function terminal(label: string, recovery: string): VoiceSessionOutcome {
	return Object.freeze({ kind: "terminal", label, recovery });
}

function hasRealtimeRun(media: RealtimeMediaSnapshot | null): media is RealtimeMediaSnapshot {
	return media !== null && (media.correlation !== null || media.state.phase !== "idle");
}

/**
 * True when the module's own serialization has closed this session for good: a
 * stop the realtime host never confirmed refuses every later start on the same
 * media session, so the adapter presents it as terminal rather than offering a
 * restart the module would reject.
 */
function stopUnconfirmed(state: RealtimeState): boolean {
	return state.phase === "recoverable_error" && state.reason === "stop_failed";
}

/** Why the workbench cannot offer a start right now, or null when it can. */
function startBlocker(input: VoiceSessionProjectionInput): string | null {
	const { capabilities, mediaState, transportState } = input;
	if (transportState.kind === "connection")
		return transportState.state === "incompatible_contract"
			? "The Codex workbench gateway speaks an incompatible contract."
			: transportState.reason;
	if (mediaState.state === "attaching")
		return "Archboard is installing realtime microphone and audio support in this browser.";
	if (mediaState.state === "unavailable") return mediaState.message;
	const snapshot = transportState.snapshot;
	if (snapshot === null) return "The host has not published a workbench snapshot yet.";
	if (!capabilities.connected) return "The Codex workbench is not connected.";
	if (capabilities.readiness !== "thread_capable")
		return "The Codex workbench is not ready for thread work yet.";
	if (snapshot.threadLink.state !== "executable")
		return "This pane has no executable thread link to bind a voice session to.";
	if (!capabilities.canClaimLease)
		return "This pane cannot claim the command lease a voice session needs.";
	if (snapshot.coordinator.state === "unbound" || snapshot.coordinator.state === "failed")
		return snapshot.coordinator.reason ?? "The host has no usable coordinator for voice.";
	if (snapshot.coordinator.state === "starting" || snapshot.coordinator.state === "reconnecting")
		return snapshot.coordinator.reason ?? "The host is still confirming the voice coordinator.";
	if (snapshot.voice.state === "unavailable")
		return snapshot.voice.reason ?? "The host reports that voice is unavailable on this pane.";
	return null;
}

/** A failure published outside the realtime state machine, if there is one. */
function externalFailure(
	mediaState: BrowserWorkbenchMediaState,
	snapshot: BrowserSnapshot | null,
): VoiceSessionFailure | null {
	if (mediaState.state === "unavailable") {
		const code = MEDIA_UNAVAILABLE_FAILURES[mediaState.reason];
		if (code !== null) return presentedFailure(code, mediaState.message);
	}
	if (snapshot === null) return null;
	if (snapshot.coordinator.state === "failed")
		return presentedFailure(
			"coordinator",
			snapshot.coordinator.reason ?? "The host reported that the voice coordinator failed.",
		);
	if (snapshot.voice.state === "failed")
		return presentedFailure(
			"host_voice",
			snapshot.voice.reason ?? "The host reported that the voice session failed.",
		);
	return null;
}

function failureDetail(failure: VoiceSessionFailure, blocker: string | null): string {
	const opening = `${failureSubject(failure.code)} failed. ${failure.message}`;
	return blocker === null ? opening : `${opening} ${blocker}`;
}

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
		inputLevel: input.media?.inputLevel ?? 0,
		sessionId: input.media?.correlation?.sessionId ?? null,
	});
}

function replacedView(input: VoiceSessionProjectionInput): VoiceSessionView {
	const failure = presentedFailure(
		"replaced",
		"The pane, child epoch, thread link, or coordinator this voice session was bound to is no longer the current one.",
	);
	return view(
		"failed",
		failureDetail(failure, null),
		failure,
		terminal("Close voice", REPLACED_RECOVERY),
		Object.freeze({ ...NO_CONTROLS, canClose: !input.busy }),
		input,
	);
}

function runView(
	media: RealtimeMediaSnapshot,
	blocker: string | null,
	input: VoiceSessionProjectionInput,
): VoiceSessionView {
	const state = media.state;
	const status = narratedStatus(state);
	const detail = narratedDetail(state);
	const startable = blocker === null;
	if (detail !== null) {
		const running = LIVE_PHASES.has(state.phase);
		return view(
			status,
			detail,
			null,
			NO_OUTCOME,
			Object.freeze({
				canStart: !input.busy && !running && startable,
				canStop: !input.busy && running && state.phase !== "stopping",
				canRestart: !input.busy && startable && state.phase !== "stopping",
				canClose: false,
			}),
			input,
		);
	}
	const failure = realtimeFailure(state);
	if (failure === null) throw new TypeError(`No realtime narration exists for ${state.phase}.`);
	if (!failure.recoverable || stopUnconfirmed(state))
		return view(
			status,
			failureDetail(failure, null),
			failure,
			terminal(
				"Close voice",
				stopUnconfirmed(state) ? STOP_UNCONFIRMED_RECOVERY : TERMINAL_RECOVERY,
			),
			Object.freeze({ ...NO_CONTROLS, canClose: !input.busy }),
			input,
		);
	const controls = Object.freeze({
		canStart: false,
		canStop: !input.busy,
		canRestart: !input.busy && startable,
		canClose: !input.busy,
	});
	return view(
		status,
		failureDetail(failure, startable ? null : blocker),
		failure,
		controls.canRestart
			? retry("restart", "Restart voice", RESTART_RECOVERY)
			: controls.canStop
				? retry("stop", "Stop voice", STOP_FIRST_RECOVERY)
				: terminal("Close voice", TERMINAL_RECOVERY),
		controls,
		input,
	);
}

/**
 * The one total mapping from authoritative module, host-adapter, and transport
 * state to render-ready values. It reduces no protocol event, keeps no history,
 * and chooses no recovery: an actionable failure becomes an offered control and
 * the person decides.
 */
export function projectVoiceSession(input: VoiceSessionProjectionInput): VoiceSessionView {
	const { busy, media, mediaState, replaced, transportState } = input;
	const blocker = startBlocker(input);
	if (replaced) return replacedView(input);
	// A close() retires exactly the session it was called on. A later run — one
	// the media owner started after it — is a new session and shows normally.
	const retired = input.closed && input.closedSessionId === (media?.correlation?.sessionId ?? null);
	if (!retired && hasRealtimeRun(media)) return runView(media, blocker, input);

	const failure = externalFailure(mediaState, transportState.snapshot) ?? input.controlFailure;
	if (failure !== null) {
		const controls = Object.freeze({ ...NO_CONTROLS, canStart: !busy && blocker === null });
		return view(
			"failed",
			failureDetail(failure, blocker),
			failure,
			controls.canStart ? retry("start", "Start voice", START_RECOVERY) : NO_OUTCOME,
			controls,
			input,
		);
	}
	if (blocker !== null) return view("unavailable", blocker, null, NO_OUTCOME, NO_CONTROLS, input);
	return view(
		"ready",
		"Voice is ready to start on this pane's linked coordinator.",
		null,
		NO_OUTCOME,
		Object.freeze({ ...NO_CONTROLS, canStart: !busy }),
		input,
	);
}
