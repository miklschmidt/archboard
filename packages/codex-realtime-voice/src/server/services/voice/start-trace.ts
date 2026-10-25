// What happened each time voice was started, kept so a failure can be read afterwards.
//
// A voice start crosses the browser, this server, the Codex child and OpenAI's realtime backend,
// and when it fails the person is told one sentence: "realtime negotiation was unavailable or
// failed". The server has no log file, and Codex keeps no line for a start it refused. So the
// server keeps the last few attempts itself: every stage it went through, what was sent and how
// large it was, every state the session moved through, and the exact words of whatever refused
// it. Nothing here decides anything. It holds no audio, no SDP, no prompt text and no board
// content: identities, sizes, states and messages only.

/** One thing that happened during a voice start. */
interface VoiceStartTraceEntry {
	/** Milliseconds since the attempt began. */
	readonly atMs: number;
	readonly stage: string;
	readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

/** One attempt to start voice. */
interface VoiceStartAttempt {
	readonly startedAt: string;
	readonly chatId: string;
	readonly entries: VoiceStartTraceEntry[];
}

/** How many attempts are kept, and how many entries of each. */
const KEPT_ATTEMPTS = 8;
const KEPT_ENTRIES = 200;

/** Says what happened during one attempt. */
type VoiceStartNote = (stage: string, detail?: VoiceStartTraceEntry["detail"]) => void;

/** The trace over one server's voice starts. */
interface VoiceStartTrace {
	/**
	 * A new attempt begins. Each browser tab starts its own voice, so two attempts may run at once:
	 * whatever happens during this one is noted through the handle, never into another tab's.
	 * @param chatId The chat voice is starting for.
	 * @returns How to note what happens during this attempt.
	 */
	readonly begin: (chatId: string) => VoiceStartNote;
	/**
	 * Every kept attempt, oldest first.
	 * @returns The attempts.
	 */
	readonly attempts: () => readonly VoiceStartAttempt[];
}

/**
 * Build the trace.
 * @param now The time source, in milliseconds.
 * @returns The trace.
 */
function createVoiceStartTrace(now: () => number = Date.now): VoiceStartTrace {
	let kept: VoiceStartAttempt[] = [];

	/**
	 * A new attempt begins.
	 * @param chatId The chat voice is starting for.
	 * @returns How to note what happens during it, kept only while the attempt is.
	 */
	function begin(chatId: string): VoiceStartNote {
		const began = now();
		const attempt: VoiceStartAttempt = {
			startedAt: new Date(began).toISOString(),
			chatId,
			entries: [],
		};
		kept = [...kept, attempt].slice(-KEPT_ATTEMPTS);
		return (stage, detail = {}) => {
			if (attempt.entries.length < KEPT_ENTRIES) {
				attempt.entries.push({ atMs: now() - began, stage, detail });
			}
		};
	}

	/**
	 * Every kept attempt.
	 * @returns The attempts, oldest first.
	 */
	function attempts(): readonly VoiceStartAttempt[] {
		return kept;
	}

	return { begin, attempts };
}

/** This server's trace. */
const voiceStartTrace = createVoiceStartTrace();

/**
 * One conversation's view of the trace: the attempt its latest voice start began, which what its
 * voice does later is noted into. Before its first start, nothing is kept.
 */
interface SessionVoiceStartTrace {
	/**
	 * This conversation begins a voice start.
	 * @param chatId The chat voice is starting for.
	 */
	readonly begin: (chatId: string) => void;
	/** Note into this conversation's latest attempt. */
	readonly note: VoiceStartNote;
}

/**
 * One conversation's view of a trace.
 * @param trace The trace, this server's by default.
 * @returns The view.
 */
function sessionVoiceStartTrace(trace: VoiceStartTrace = voiceStartTrace): SessionVoiceStartTrace {
	let current: VoiceStartNote | null = null;
	return {
		/**
		 * This conversation begins a voice start.
		 * @param chatId The chat voice is starting for.
		 */
		begin: (chatId) => {
			current = trace.begin(chatId);
		},
		/**
		 * Note into this conversation's latest attempt; before any it is dropped.
		 * @param stage What happened.
		 * @param detail What is known about it.
		 */
		note: (stage, detail) => {
			current?.(stage, detail);
		},
	};
}

/** Where the trace is read. */
const VOICE_START_TRACE_ROUTE = "/api/voice/start-trace";

/** The part of an HTTP response the trace answers through. An Express response has it. */
interface TraceResponse {
	json(body: unknown): unknown;
}

/**
 * The one method of an HTTP application the trace route needs. An Express application has it, so
 * the published types name no Express package.
 */
interface TraceRouteHost {
	get(path: string, handler: (request: unknown, response: TraceResponse) => void): unknown;
}

/**
 * Answer with every kept attempt.
 * @param _request The request.
 * @param response Its response.
 */
function readVoiceStartTrace(_request: unknown, response: TraceResponse): void {
	response.json({ success: true, attempts: voiceStartTrace.attempts() });
}

/**
 * Mount the route the trace is read through.
 * @param app The HTTP application, such as an Express application.
 */
function mountVoiceStartTraceRoute(app: TraceRouteHost): void {
	app.get(VOICE_START_TRACE_ROUTE, readVoiceStartTrace);
}

/**
 * The words of whatever was thrown, for the trace.
 * @param error The thrown value.
 * @returns Its message, or the value as text.
 */
function traceMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

export {
	VOICE_START_TRACE_ROUTE,
	createVoiceStartTrace,
	mountVoiceStartTraceRoute,
	sessionVoiceStartTrace,
	traceMessage,
	type SessionVoiceStartTrace,
	type VoiceStartAttempt,
	type VoiceStartNote,
	type VoiceStartTrace,
};
