import type { RealtimeTranscriptRecord } from "../../codex-realtime/index.js";
import type {
	VoiceSession,
	VoiceSessionStatus,
	VoiceSessionView,
} from "../../voice-session/index.js";

type VoiceCommand = "start" | "mute" | "unmute" | "stop" | "restart" | "close";

export interface VoiceSessionFake {
	readonly session: VoiceSession;
	readonly calls: VoiceCommand[];
	readonly setView: (view: VoiceSessionView) => void;
}

export function voiceView(
	status: VoiceSessionStatus,
	failure: "retryable" | "terminal" = "retryable",
): VoiceSessionView {
	const running = status !== "ready" && status !== "stopped" && status !== "failed";
	const failed = status === "failed";
	const outcome: VoiceSessionView["outcome"] = failed
		? failure === "terminal"
			? {
					kind: "terminal",
					label: "Voice ended",
					recovery: "Close this session before starting another.",
				}
			: {
					kind: "retry",
					control: "restart",
					label: "Restart voice",
					recovery: "Restart the existing voice session.",
				}
		: { kind: "none" };
	return Object.freeze({
		status,
		label: status.replaceAll("_", " "),
		detail: `Voice is ${status.replaceAll("_", " ")}.`,
		accessibleStatus: `Live voice is ${status.replaceAll("_", " ")}.`,
		failure: failed
			? {
					code: "realtime" as const,
					recoverable: failure === "retryable",
					message: "The realtime voice connection failed.",
				}
			: null,
		outcome,
		controls: {
			canStart: status === "ready",
			canMute: status === "listening",
			canUnmute: status === "muted",
			canStop: running && status !== "stopping",
			canRestart: failed && failure === "retryable",
			canClose: failed && failure === "terminal",
		},
		binding: running
			? {
					paneId: "pane-a",
					childId: "child-a",
					epoch: "epoch-a",
					workhorseThreadId: "thread-a",
					coordinatorThreadId: "coordinator-a",
				}
			: null,
		sessionId: running ? "realtime-a" : null,
	});
}

export function createSessionFake(initial: VoiceSessionView): VoiceSessionFake {
	let current = initial;
	const calls: VoiceCommand[] = [];
	const listeners = new Set<() => void>();
	const levels = new Set<() => void>();
	const run = async (command: VoiceCommand): Promise<VoiceSessionView> => {
		calls.push(command);
		return current;
	};
	const session: VoiceSession = {
		view: () => current,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => 0.4,
		subscribeLevel: (listener) => {
			levels.add(listener);
			return () => levels.delete(listener);
		},
		refresh: () => current,
		start: () => run("start"),
		mute: () => run("mute"),
		unmute: () => run("unmute"),
		stop: () => run("stop"),
		restart: () => run("restart"),
		close: () => run("close"),
		dispose: () => undefined,
	};
	return {
		session,
		calls,
		setView: (view) => {
			current = view;
			for (const listener of listeners) listener();
		},
	};
}

export function transcriptRecord(): RealtimeTranscriptRecord {
	return {
		sessionId: "realtime-a" as RealtimeTranscriptRecord["sessionId"],
		correlationId: "correlation-a" as RealtimeTranscriptRecord["correlationId"],
		itemId: "voice-evidence-a" as RealtimeTranscriptRecord["itemId"],
		sequence: 12,
		role: "user",
		status: "final",
		text: "Keep Pane A evidence visible.",
	};
}
