// What happened each time voice was started, kept so a failure can be read afterwards.
//
// A voice start crosses the browser, this server, the Codex child and OpenAI's realtime backend,
// and when it fails the person is told one sentence: "realtime negotiation was unavailable or
// failed". The canvas has no log file, and Codex keeps no line for a start it refused. So the
// canvas keeps the last few attempts itself: every stage it went through, what was sent and how
// large it was, every state the session moved through, and the exact words of whatever refused
// it. Nothing here decides anything. It holds no audio, no SDP, no prompt text and no board
// content: identities, sizes, states and messages only.

import type { Express, Request, Response } from "express";

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
	readonly paneId: string;
	readonly entries: VoiceStartTraceEntry[];
}

/** How many attempts are kept, and how many entries of each. */
const KEPT_ATTEMPTS = 8;
const KEPT_ENTRIES = 200;

/** The trace over one canvas's voice starts. */
interface VoiceStartTrace {
	/**
	 * A new attempt begins; later entries belong to it.
	 * @param paneId The pane voice is starting for.
	 */
	readonly begin: (paneId: string) => void;
	/**
	 * Something happened during the current attempt.
	 * @param stage What happened, as a short stable word.
	 * @param detail Identities, sizes, states and messages; never content.
	 */
	readonly note: (stage: string, detail?: VoiceStartTraceEntry["detail"]) => void;
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
	let began = now();

	/**
	 * A new attempt begins.
	 * @param paneId The pane voice is starting for.
	 */
	function begin(paneId: string): void {
		began = now();
		const attempt = { startedAt: new Date(began).toISOString(), paneId, entries: [] };
		kept = [...kept, attempt].slice(-KEPT_ATTEMPTS);
	}

	/**
	 * Something happened during the current attempt; before any attempt it is dropped.
	 * @param stage What happened.
	 * @param detail What is known about it.
	 */
	function note(stage: string, detail: VoiceStartTraceEntry["detail"] = {}): void {
		const current = kept.at(-1);
		if (current !== undefined && current.entries.length < KEPT_ENTRIES) {
			current.entries.push({ atMs: now() - began, stage, detail });
		}
	}

	/**
	 * Every kept attempt.
	 * @returns The attempts, oldest first.
	 */
	function attempts(): readonly VoiceStartAttempt[] {
		return kept;
	}

	return { begin, note, attempts };
}

/** This canvas's trace. */
const voiceStartTrace = createVoiceStartTrace();

/** Where the trace is read. */
const VOICE_START_TRACE_ROUTE = "/api/voice/start-trace";

/**
 * Answer with every kept attempt.
 * @param _req The request.
 * @param res Its response.
 */
function readVoiceStartTrace(_req: Request, res: Response): void {
	res.json({ success: true, attempts: voiceStartTrace.attempts() });
}

/**
 * Mount the route the trace is read through.
 * @param app The express application.
 */
function mountVoiceStartTraceRoute(app: Express): void {
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
	traceMessage,
	voiceStartTrace,
	type VoiceStartAttempt,
	type VoiceStartTrace,
};
