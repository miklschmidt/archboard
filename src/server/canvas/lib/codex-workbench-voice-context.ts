import type {
	CoordinatorCallbackDelivery,
	CoordinatorCallbacks,
} from "../../../runtime/codex-coordinator-callbacks/index.js";
import type { CodexRealtimeGeneration } from "../../../runtime/codex-realtime/index.js";
import type { BrowserVoiceContext } from "../../../shared/codex-browser-model/index.js";

function sameGeneration(
	delivery: CoordinatorCallbackDelivery,
	generation: CodexRealtimeGeneration,
): boolean {
	const captured = delivery.callback?.correlation.realtimeGeneration;
	return (
		captured !== null &&
		captured !== undefined &&
		captured.childId === generation.child &&
		captured.epoch === generation.epoch &&
		captured.coordinatorThreadId === generation.coordinatorThreadId &&
		captured.wireSessionId === generation.wireSessionId &&
		captured.browserSessionId === generation.browserSessionId &&
		captured.browserCorrelationId === generation.browserCorrelationId
	);
}

function entryKind(
	delivery: CoordinatorCallbackDelivery,
): BrowserVoiceContext["entries"][number]["kind"] {
	const callback = delivery.callback;
	if (callback === null || callback.kind === "operation") return "callback";
	if (callback.type === "change") return "semantic";
	return callback.type;
}

function browserEntry(
	delivery: CoordinatorCallbackDelivery,
): BrowserVoiceContext["entries"][number] {
	const shared = {
		id: `callback-${delivery.sourceOrder}`,
		kind: entryKind(delivery),
		sourceOrder: delivery.sourceOrder,
		capturedAtMs: delivery.freshness.capturedAtMs,
		freshUntilMs: delivery.freshness.freshUntilMs,
		reason: delivery.reason,
		body: delivery.text ?? "",
	};
	return delivery.attempted
		? {
				...shared,
				attempted: true,
				attemptedAtMs: delivery.attemptedAtMs,
				outcome: delivery.outcome,
			}
		: { ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" };
}

/** Project only evidence captured under the exact active realtime generation. */
export function projectCanvasVoiceContext(
	generation: CodexRealtimeGeneration | null,
	callbacks: Pick<CoordinatorCallbacks, "inspectHistory">,
): BrowserVoiceContext | null {
	if (generation === null) return null;
	const history = callbacks.inspectHistory({
		childId: generation.child,
		epoch: generation.epoch,
		coordinatorThreadId: generation.coordinatorThreadId,
		wireSessionId: generation.wireSessionId,
		browserSessionId: generation.browserSessionId,
		browserCorrelationId: generation.browserCorrelationId,
	});
	const ledgerId = JSON.stringify([
		generation.child,
		generation.epoch,
		generation.coordinatorThreadId,
		generation.wireSessionId,
		generation.browserSessionId,
	]);
	const entries = history.deliveries
		.filter((delivery) => sameGeneration(delivery, generation))
		.toSorted((left, right) => left.sourceOrder - right.sourceOrder)
		.map(browserEntry);
	return {
		kind: "voice_context",
		sessionId: generation.browserSessionId,
		ledgerId,
		canonicalBrief: generation.semanticBrief,
		ownerEntriesTruncated: history.omittedPrefixCount,
		entriesTruncated: history.omittedPrefixCount,
		entries,
	};
}
