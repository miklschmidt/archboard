import type {
	RealtimeRecoverableErrorReason,
	RealtimeState,
	RealtimeTerminalErrorReason,
} from "../../codex-realtime/index.js";
import type { VoiceSessionFailure, VoiceSessionFailureCode } from "../contract.js";

/**
 * One presentation code per authoritative realtime reason. The table is total by
 * construction — a reason added to the neutral host contract is a type error here
 * until it is given a code — and it renames nothing: the module's message is
 * carried through untouched.
 */
const RECOVERABLE_CODES = {
	permission_denied: "permission",
	device_unavailable: "device",
	device_lost: "device",
	sdp_failed: "sdp",
	ice_disconnected: "ice",
	data_channel_closed: "channel",
	remote_media_failed: "audio_output",
	autoplay_suspended: "audio_output",
	realtime_unavailable: "realtime",
	app_server_unavailable: "app_server",
	coordinator_unavailable: "coordinator",
	append_failed: "append",
	recovery_failed: "recovery",
	stop_failed: "stop",
} as const satisfies Record<RealtimeRecoverableErrorReason, VoiceSessionFailureCode>;

const TERMINAL_CODES = {
	unsupported_browser: "browser",
	invalid_session: "session",
	protocol_error: "protocol",
	fatal_error: "fatal",
} as const satisfies Record<RealtimeTerminalErrorReason, VoiceSessionFailureCode>;

/** What the person is told the failure was about, in the same words every time. */
const FAILURE_SUBJECTS = {
	permission: "Microphone permission",
	device: "The microphone",
	sdp: "The realtime negotiation",
	ice: "The realtime audio connection",
	channel: "The realtime events channel",
	audio_output: "The assistant's audio",
	realtime: "The realtime voice service",
	app_server: "The Codex app server",
	coordinator: "The voice coordinator",
	append: "The realtime text append",
	recovery: "The realtime recovery attempt",
	stop: "The realtime stop",
	browser: "This browser's realtime support",
	session: "The realtime session identity",
	protocol: "The realtime protocol",
	fatal: "The realtime session",
	replaced: "This voice session's pane, thread link, or coordinator",
	host_voice: "The host's voice session",
} as const satisfies Record<VoiceSessionFailureCode, string>;

export function failureSubject(code: VoiceSessionFailureCode): string {
	return FAILURE_SUBJECTS[code];
}

/** Projects a realtime error state into the presentation failure vocabulary. */
export function realtimeFailure(state: RealtimeState): VoiceSessionFailure | null {
	if (state.phase === "recoverable_error")
		return Object.freeze({
			code: RECOVERABLE_CODES[state.reason],
			recoverable: true,
			message: state.message,
		});
	if (state.phase === "terminal_error")
		return Object.freeze({
			code: TERMINAL_CODES[state.reason],
			recoverable: false,
			message: state.message,
		});
	return null;
}

/**
 * A failure the adapter presents from a source outside the realtime state
 * machine — the media owner's own unavailability, the host's coordinator or
 * voice projection, or a replaced binding. None of them is recoverable by this
 * session, so recovery is never claimed on their behalf.
 */
export function presentedFailure(
	code: VoiceSessionFailureCode,
	message: string,
): VoiceSessionFailure {
	return Object.freeze({ code, recoverable: false, message });
}
