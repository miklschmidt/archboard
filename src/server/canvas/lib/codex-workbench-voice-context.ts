import type {
	CoordinatorCallbackDelivery,
	CoordinatorCallbacks,
} from "@/runtime/codex-coordinator-callbacks";
import type { CodexRealtimeGeneration } from "@/runtime/codex-realtime";
import type { BrowserVoiceContext } from "@/shared/codex-browser-model";

/**
 * Whether one delivery was captured under exactly the realtime generation now
 * running: voice evidence from a previous session is not this session's.
 * @param delivery The recorded delivery.
 * @param generation The realtime generation now running.
 * @returns True when the delivery belongs to it.
 */
function sameGeneration(
	delivery: CoordinatorCallbackDelivery,
	generation: CodexRealtimeGeneration,
): boolean {
	const captured = delivery.callback?.correlation.realtimeGeneration;
	if (captured === null || captured === undefined) {
		return false;
	}
	const capturedIdentity = [
		captured.childId,
		captured.epoch,
		captured.coordinatorThreadId,
		captured.wireSessionId,
		captured.browserSessionId,
		captured.browserCorrelationId,
	];
	const runningIdentity = [
		generation.child,
		generation.epoch,
		generation.coordinatorThreadId,
		generation.wireSessionId,
		generation.browserSessionId,
		generation.browserCorrelationId,
	];
	return capturedIdentity.every((part, index) => part === runningIdentity[index]);
}

/**
 * What kind of thing one delivery was, in the vocabulary the browser shows:
 * an operation's own callback, a semantic change, or the callback's own type.
 * @param delivery The recorded delivery.
 * @returns The entry kind.
 */
function entryKind(
	delivery: CoordinatorCallbackDelivery,
): BrowserVoiceContext["entries"][number]["kind"] {
	const callback = delivery.callback;
	if (callback === null || callback.kind === "operation") {
		return "callback";
	}
	if (callback.type === "change") {
		return "semantic";
	}
	return callback.type;
}

/**
 * One recorded delivery as the browser shows it, saying whether it was ever
 * attempted and what became of it.
 * @param delivery The recorded delivery.
 * @returns The entry.
 */
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

/**
 * Project only evidence captured under the exact active realtime generation.
 * @param generation The realtime generation now running, or null for none.
 * @param callbacks Where the recorded deliveries are read from.
 * @returns The voice context, or null while no session is running.
 */
export function projectCanvasVoiceContext(
	generation: CodexRealtimeGeneration | null,
	callbacks: Pick<CoordinatorCallbacks, "inspectHistory">,
): BrowserVoiceContext | null {
	if (generation === null) {
		return null;
	}
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
