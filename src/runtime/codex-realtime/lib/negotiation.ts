import { realtimeErrorMessage } from "@/runtime/codex-realtime/lib/binding";
import * as phase from "@/runtime/codex-realtime/lib/phase";
import type { RealtimeSessionOps } from "@/runtime/codex-realtime/lib/session-ops";
import { createRealtimeStartParams } from "@/runtime/codex-realtime/lib/start-policy";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * The answer SDP to resolve once every piece of start evidence is in: the start call returned,
 * Codex reported the session started, the SDP arrived, and the answer is not yet settled.
 * @param session - The live session.
 * @returns The answer SDP, or null while any evidence is missing.
 */
function readyAnswerSdp(session: ActiveRealtimeSession): string | null {
	if (
		session.answerSettled ||
		session.state.phase !== "negotiating" ||
		!session.startReturned ||
		!session.started
	) {
		return null;
	}
	return session.answerSdp;
}

/**
 * Resolve the browser's pending answer once all start evidence is in, or reject it when the
 * coordinator identity changed while the evidence was arriving.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 */
function settleAnswer(ops: RealtimeSessionOps, session: ActiveRealtimeSession): void {
	const sdp = readyAnswerSdp(session);
	if (sdp === null) {
		return;
	}
	if (!ops.bindingIsCurrent(session)) {
		session.answerSettled = true;
		session.rejectAnswer(new Error("The realtime coordinator identity changed during start."));
		return;
	}
	session.answerSettled = true;
	ops.state(session, { phase: "negotiating", reason: "answer_received" });
	ops.state(session, { phase: "listening", reason: "negotiation_succeeded" });
	session.resolveAnswer({
		sessionId: session.browserSessionId,
		correlationId: session.correlationId,
		sdp,
	});
}

/**
 * Reject a pending start: surface the app-server failure, move to a recoverable error when the
 * phase allows, and reject the browser's answer.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param error - What the start threw.
 */
function failStart(ops: RealtimeSessionOps, session: ActiveRealtimeSession, error: unknown): void {
	session.stopCatalogueUpdates?.();
	if (session.answerSettled) {
		return;
	}
	session.answerSettled = true;
	ops.emitDiagnostic(session, "app_server", realtimeErrorMessage(error));
	const failure = phase.appServerFailureState(session.state, realtimeErrorMessage(error));
	if (failure !== null) {
		ops.state(session, failure);
	}
	session.rejectAnswer(error instanceof Error ? error : new Error(realtimeErrorMessage(error)));
}

/**
 * Send thread/realtime/start for the session unless it was settled or its binding stopped being
 * current before the send.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param sdp - The browser's offer SDP.
 */
async function beginStart(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	sdp: string,
): Promise<void> {
	if (session.answerSettled) {
		return;
	}
	if (!ops.bindingIsCurrent(session)) {
		ops.finalize(session);
		return;
	}
	await ops.options.session.realtimeStart(
		createRealtimeStartParams({
			threadId: session.binding.coordinatorThreadId,
			realtimeSessionId: session.wireSessionId,
			sdp,
			semanticBrief: session.semanticBrief,
			boardCatalogue: session.boardCatalogue,
		}),
	);
}

/**
 * Record that the start call returned and try to settle the answer.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 */
function completeStart(ops: RealtimeSessionOps, session: ActiveRealtimeSession): void {
	if (session.answerSettled) {
		return;
	}
	session.startReturned = true;
	ops.settleAnswer(session);
}

/**
 * Run the start sequence on a microtask after the offer is accepted, so a caller may still
 * dispose or observe the session before anything is sent.
 * @param ops - The adapter's session operations.
 * @param session - The live session.
 * @param sdp - The browser's offer SDP.
 */
function startNegotiation(
	ops: RealtimeSessionOps,
	session: ActiveRealtimeSession,
	sdp: string,
): void {
	void Promise.resolve()
		.then(() => beginStart(ops, session, sdp))
		.then(
			() => completeStart(ops, session),
			(error: unknown) => failStart(ops, session, error),
		);
}

export { settleAnswer, failStart, startNegotiation };
