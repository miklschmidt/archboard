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
	ops.options.trace?.("start_failed", { message: realtimeErrorMessage(error).slice(0, 2_000) });
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
	const params = createRealtimeStartParams({
		threadId: session.binding.coordinatorThreadId,
		realtimeSessionId: session.wireSessionId,
		sdp,
		semanticBrief: session.semanticBrief,
		boardCatalogue: session.boardCatalogue,
		presentation: session.presentation,
	});
	ops.options.trace?.("start_sent", startSizes(params));
	await ops.options.session.realtimeStart(params);
	ops.options.trace?.("start_returned", {});
}

/**
 * The size of one text on the wire.
 * @param text The text, or nothing.
 * @returns Its UTF-8 length in bytes.
 */
function wireBytes(text: string | null | undefined): number {
	return Buffer.byteLength(text ?? "");
}

/**
 * How large each part of a start is, in UTF-8 bytes: the first thing to look at when a start
 * that used to connect stops connecting.
 * @param params The start parameters.
 * @returns The sizes, the voice and the mode.
 */
function startSizes(
	params: ReturnType<typeof createRealtimeStartParams>,
): Readonly<Record<string, string | number | boolean | null>> {
	const items = params.initialItems ?? [];
	let initialItemsBytes = 0;
	for (const item of items) {
		initialItemsBytes += wireBytes(item.text);
	}
	return {
		promptBytes: wireBytes(params.prompt),
		startInstructionsBytes: wireBytes(params.realtimeStartInstructions),
		initialItems: items.length,
		initialItemsBytes,
		voice: params.voice ?? null,
		version: params.version ?? null,
		ackFiller: params.delegationAckFiller ?? null,
	};
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
