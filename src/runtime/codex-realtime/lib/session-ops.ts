import type {
	RealtimeCorrelation,
	RealtimeDiagnosticCode,
	RealtimeState,
} from "@/shared/codex-realtime-host";
import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * The adapter-owned operations a session reducer may perform. The adapter alone owns the active
 * session, the listener set and the retained transcript; notification, negotiation and recovery
 * reducers act on a session only through these operations, so ownership never leaks into them.
 */
interface RealtimeSessionOps {
	readonly options: CodexRealtimeAdapterOptions;
	/** Publish a diagnostic event for the session to presentation listeners. */
	readonly emitDiagnostic: (
		session: ActiveRealtimeSession,
		code: RealtimeDiagnosticCode,
		message: string,
	) => void;
	/** Apply one state transition and publish it. */
	readonly state: (session: ActiveRealtimeSession, value: RealtimeState) => void;
	/** Apply several state transitions in order. */
	readonly states: (session: ActiveRealtimeSession, values: readonly RealtimeState[]) => void;
	/** Publish the session's whole ordered transcript. */
	readonly publishTranscript: (session: ActiveRealtimeSession) => void;
	/** Resolve the browser's pending answer once every negotiation precondition holds. */
	readonly settleAnswer: (session: ActiveRealtimeSession) => void;
	/** Close the session, retain its transcript and release it as the active session. */
	readonly finalize: (session: ActiveRealtimeSession) => void;
	/** Retain the session's transcript and release it as the active session without closing. */
	readonly retire: (session: ActiveRealtimeSession) => void;
	/** Whether the session is still the adapter's live session under the current binding. */
	readonly bindingIsCurrent: (session: ActiveRealtimeSession) => boolean;
	/** Whether a browser request names the live session exactly. */
	readonly requestIsCurrent: (
		session: ActiveRealtimeSession,
		request: RealtimeCorrelation,
	) => boolean;
}

export type { RealtimeSessionOps };
