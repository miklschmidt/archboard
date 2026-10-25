import type {
	CoordinatorCallbackDelivery,
	CoordinatorCallbacks,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CodexRealtimeGeneration } from "#runtime/services/realtime/contract.ts";
import type { BrowserVoiceContext } from "#shared/schemas/browser/snapshot.ts";
import {
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_WITHHELD_MAX_UTF8_BYTES,
} from "#shared/schemas/browser/vocabulary.ts";

/**
 * What the page is shown of a host's text: the text itself, cut at the wire's byte limit, and with
 * no NUL, which the wire refuses. A host's words are its own, so the agent bounds them here, where
 * they are shown, rather than refusing them for their length.
 * @param text The text.
 * @param maxBytes The wire's limit for it.
 * @returns The text the page is shown.
 */
function shownText(text: string, maxBytes: number): string {
	const shown = text.replaceAll("\0", "\uFFFD");
	const bytes = new TextEncoder().encode(shown);
	if (bytes.byteLength <= maxBytes) return shown;
	return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/\uFFFD+$/u, "");
}

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
 * What kind of thing one delivery was, in the vocabulary the browser shows: an announced context
 * change, by the audience it was for and with its topic, or an operation's own callback or
 * workhorse news.
 * @param delivery The recorded delivery.
 * @returns The entry kind and topic.
 */
function entryKind(
	delivery: CoordinatorCallbackDelivery,
): Pick<BrowserVoiceContext["entries"][number], "kind" | "topic"> {
	const callback = delivery.callback;
	return callback?.kind === "context"
		? { kind: callback.audience, topic: callback.context.topic }
		: { kind: "callback", topic: null };
}

/**
 * The host's detail of why it told an audience nothing, which only a withheld change has.
 * @param delivery The recorded delivery.
 * @returns The detail the page is shown, or null.
 */
function withheldDetail(delivery: CoordinatorCallbackDelivery): string | null {
	const callback = delivery.callback;
	if (callback?.kind !== "context" || delivery.reason !== "withheld") return null;
	const detail = callback.context.withheld;
	return detail === null ? null : shownText(detail, BROWSER_VOICE_CONTEXT_WITHHELD_MAX_UTF8_BYTES);
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
		...entryKind(delivery),
		sourceOrder: delivery.sourceOrder,
		capturedAtMs: delivery.freshness.capturedAtMs,
		freshUntilMs: delivery.freshness.freshUntilMs,
		reason: delivery.reason,
		withheld: withheldDetail(delivery),
		body: shownText(delivery.text ?? "", BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES),
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
export function projectServerVoiceContext(
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
		canonicalBrief: shownText(generation.startBrief, BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES),
		ownerEntriesTruncated: history.omittedPrefixCount,
		entriesTruncated: history.omittedPrefixCount,
		entries,
	};
}
