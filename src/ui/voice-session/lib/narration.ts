import type { RealtimePhase, RealtimeState } from "../../codex-realtime/index.js";
import type { VoiceSessionStatus } from "../contract.js";

type NarratedPhase = Exclude<RealtimePhase, "recoverable_error" | "terminal_error">;
type ReasonsFor<Phase extends NarratedPhase> = Extract<
	RealtimeState,
	{ readonly phase: Phase }
>["reason"];
type NarrationTable = Readonly<{
	[Phase in NarratedPhase]: Readonly<Record<ReasonsFor<Phase>, string>>;
}>;

/**
 * One sentence for every reachable non-error realtime state. Keyed by reason as
 * well as phase because the reason is the only thing that separates a first
 * start from a recovery, and a stop from a pane closing. A reason added to the
 * neutral host contract is a type error here until it is narrated.
 */
const NARRATION: NarrationTable = Object.freeze({
	idle: Object.freeze({
		created: "Voice is ready to start on this pane's linked coordinator.",
		recovered: "The realtime session recovered and is ready to start again.",
	}),
	requesting_permission: Object.freeze({
		start_requested: "Archboard is asking this browser for the microphone.",
		recovery_requested: "Archboard is asking for the microphone again to recover this session.",
	}),
	negotiating: Object.freeze({
		permission_granted: "The microphone is open and the realtime connection is being negotiated.",
		offer_created: "The realtime offer was created and is on its way to the coordinator.",
		answer_received: "The coordinator answered and the realtime connection is being completed.",
		recovery_requested:
			"The realtime connection is being negotiated again to recover this session.",
	}),
	listening: Object.freeze({
		negotiation_succeeded: "Voice is connected and listening.",
		unmute_requested: "The microphone was unmuted and voice is listening.",
		processing_complete: "The coordinator finished the request and voice is listening again.",
		assistant_finished: "The coordinator finished speaking and voice is listening again.",
	}),
	muted: Object.freeze({
		mute_requested: "The microphone is muted, so the coordinator hears nothing.",
	}),
	processing: Object.freeze({
		input_completed: "The coordinator is working on what was just said.",
		user_interrupted: "The coordinator was interrupted and is working on the correction.",
	}),
	speaking: Object.freeze({
		assistant_started: "The coordinator is speaking.",
	}),
	stopping: Object.freeze({
		stop_requested: "Voice is stopping and the coordinator is being told to close the session.",
		dispose_requested: "Voice is closing with its pane.",
	}),
	closed: Object.freeze({
		stopped: "Voice stopped and the realtime session is closed.",
		disposed: "Voice closed with its pane and the realtime session is closed.",
	}),
});

const LABELS = {
	unavailable: "Voice unavailable",
	ready: "Voice ready",
	requesting_permission: "Requesting microphone",
	negotiating: "Connecting voice",
	listening: "Listening",
	muted: "Microphone muted",
	processing: "Coordinator working",
	agent_speaking: "Coordinator speaking",
	recovering: "Recovering voice",
	stopping: "Stopping voice",
	stopped: "Voice stopped",
	failed: "Voice failed",
} as const satisfies Record<VoiceSessionStatus, string>;

export function statusLabel(status: VoiceSessionStatus): string {
	return LABELS[status];
}

/** The status one realtime state presents as; error phases are the caller's. */
export function narratedStatus(state: RealtimeState): VoiceSessionStatus {
	switch (state.phase) {
		case "idle":
			return "ready";
		case "requesting_permission":
			return state.reason === "recovery_requested" ? "recovering" : "requesting_permission";
		case "negotiating":
			return state.reason === "recovery_requested" ? "recovering" : "negotiating";
		case "listening":
			return "listening";
		case "muted":
			return "muted";
		case "processing":
			return "processing";
		case "speaking":
			return "agent_speaking";
		case "stopping":
			return "stopping";
		case "closed":
			return "stopped";
		case "recoverable_error":
		case "terminal_error":
			return "failed";
	}
}

/** The authoritative sentence for a non-error realtime state. */
export function narratedDetail(state: RealtimeState): string | null {
	switch (state.phase) {
		case "idle":
			return NARRATION.idle[state.reason];
		case "requesting_permission":
			return NARRATION.requesting_permission[state.reason];
		case "negotiating":
			return NARRATION.negotiating[state.reason];
		case "listening":
			return NARRATION.listening[state.reason];
		case "muted":
			return NARRATION.muted[state.reason];
		case "processing":
			return NARRATION.processing[state.reason];
		case "speaking":
			return NARRATION.speaking[state.reason];
		case "stopping":
			return NARRATION.stopping[state.reason];
		case "closed":
			return NARRATION.closed[state.reason];
		case "recoverable_error":
		case "terminal_error":
			return null;
	}
}

/** The single sentence an assistive technology announces. */
export function accessibleSentence(label: string, detail: string, recovery: string | null): string {
	return recovery === null ? `${label}. ${detail}` : `${label}. ${detail} ${recovery}`;
}
