import { CodexSessionMutationError, type SessionParams } from "@/runtime/codex-session";
import { encodeCoordinatorCallback } from "@/runtime/codex-coordinator-callbacks/lib/encoding";
import {
	afterAttemptReason,
	classificationAccepted,
	finalAuthorityReason,
	type LiveClassification,
} from "@/runtime/codex-coordinator-callbacks/lib/delivery-authority";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryPath,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackOptions,
	CoordinatorCallbackRealtimeRequest,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

/** What one delivery record says about the attempt it describes. */
interface DeliveryRecordInput {
	/** When the attempt was made, or null when nothing was attempted. */
	readonly attemptedAtMs: number | null;
	readonly path: CoordinatorCallbackDeliveryPath;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
	/** The encoded callback, once it has been encoded. */
	readonly text?: string | null;
	/** The injection parameters, when delivery went through the thread. */
	readonly payload?: SessionParams<"thread/inject_items"> | null;
	/** The append request, when delivery went through voice. */
	readonly realtimeRequest?: CoordinatorCallbackRealtimeRequest | null;
}

interface CallbackDeliveryEvidence {
	readonly sourceOrder: number;
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
}

/**
 * Freeze one value in place; a delivery record never changes after it is made.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freeze<T>(value: T): T {
	return Object.freeze(value);
}

/**
 * The delivery record's discriminant, as a function so the literal type survives the spread that builds the record.
 * @returns The delivery kind.
 */
function deliveryKind(): "coordinator_callback_delivery" {
	return "coordinator_callback_delivery";
}

/**
 * Build one delivery record. A record with no attempt time is by construction not delivered, so an unattempted callback can never claim an outcome.
 * @param callback - The callback the record is about, or null when none was normalized.
 * @param evidence - The ordering and freshness evidence.
 * @param input - The path, outcome, reason and whatever payload the attempt used.
 * @returns The frozen delivery record.
 */
function makeDelivery(
	callback: CoordinatorCallback | null,
	evidence: CallbackDeliveryEvidence,
	input: DeliveryRecordInput,
): CoordinatorCallbackDelivery {
	const shared = {
		kind: deliveryKind(),
		callback,
		sourceOrder: evidence.sourceOrder,
		freshness: freeze({
			capturedAtMs: evidence.capturedAtMs,
			freshUntilMs: evidence.freshUntilMs,
		}),
		path: input.path,
		reason: input.reason,
		text: input.text ?? null,
		payload: input.payload ?? null,
		realtimeRequest: input.realtimeRequest ?? null,
	};
	return input.attemptedAtMs === null
		? freeze({ ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" })
		: freeze({
				...shared,
				attempted: true,
				attemptedAtMs: input.attemptedAtMs,
				outcome: input.outcome,
			});
}

/**
 * The inject_items payload that carries one callback to the coordinator thread as a single developer message.
 * @param callback - The normalized callback.
 * @param text - The encoded callback.
 * @returns The injection parameters.
 * @throws {TypeError} When the callback names no coordinator thread.
 */
function developerPayload(
	callback: CoordinatorCallback,
	text: string,
): SessionParams<"thread/inject_items"> {
	const threadId = callback.correlation.coordinatorThreadId;
	if (threadId === null) {
		throw new TypeError("Callback has no coordinator thread.");
	}
	return {
		threadId,
		items: [
			{
				type: "message",
				role: "developer",
				content: [{ type: "input_text", text }],
			},
		],
	};
}

/**
 * What a failed session mutation proves: a rejection before delivery is not delivered, and anything else leaves the outcome unknown because the message may have landed.
 * @param error - The thrown value from the session.
 * @returns The outcome and reason to record.
 */
function sessionFailure(error: unknown): {
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason;
} {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered") {
		return { outcome: "not_delivered", reason: "session_rejected" };
	}
	return { outcome: "outcome_unknown", reason: "response_lost" };
}

/**
 * The delivery record for a callback refused before anything was attempted.
 * @param callback - The normalized callback.
 * @param evidence - The ordering and freshness evidence.
 * @param reason - Why the callback was refused.
 * @param text - The encoded callback, when it had already been encoded.
 * @returns The frozen delivery record.
 */
function refuseBeforeAttempt(
	callback: CoordinatorCallback,
	evidence: CallbackDeliveryEvidence,
	reason: CoordinatorCallbackDeliveryReason,
	text: string | null = null,
): CoordinatorCallbackDelivery {
	return makeDelivery(callback, evidence, {
		attemptedAtMs: null,
		path: "none",
		outcome: "not_delivered",
		reason,
		text,
	});
}

/**
 * Re-classify a callback's link target and say why the result does not authorize delivery.
 * @param callback - The normalized callback.
 * @param options - The host authorities and ports.
 * @returns The refusal reason, or null when the fresh classification still authorizes delivery.
 */
async function classifyForDelivery(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
): Promise<CoordinatorCallbackDeliveryReason | null> {
	let live: LiveClassification;
	try {
		live = await options.threadLink.classify(callback.correlation.workhorseLink.target);
	} catch {
		return "transport_failure";
	}
	return classificationAccepted(callback, live) ? null : "stale_link";
}

/**
 * Everything that must hold before a callback may be attempted: it encodes, its link still
 * classifies as the one it was captured against, and every host authority still holds.
 * @param callback - The normalized callback.
 * @param options - The host authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed, read at each step.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @returns The encoded text once the callback is cleared, or the refusal that stops it.
 */
async function clearForDelivery(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
): Promise<{ readonly text: string } | { readonly refusal: CoordinatorCallbackDelivery }> {
	if (isDisposed()) {
		return { refusal: refuseBeforeAttempt(callback, evidence, "disposed") };
	}
	let text: string;
	try {
		text = encodeCoordinatorCallback(callback);
	} catch {
		return { refusal: refuseBeforeAttempt(callback, evidence, "invalid_callback") };
	}
	const classified = await classifyForDelivery(callback, options);
	if (classified !== null) {
		return { refusal: refuseBeforeAttempt(callback, evidence, classified, text) };
	}
	const authorityReason = isDisposed() ? "disposed" : finalAuthorityReason(callback, options);
	if (authorityReason !== null) {
		return { refusal: refuseBeforeAttempt(callback, evidence, authorityReason, text) };
	}
	return { text };
}

/**
 * Speak one callback into the coordinator's live voice session. Authority is re-checked after the
 * append, because an append that lands as the generation turns over has an unknown outcome.
 * @param callback - The normalized callback.
 * @param options - The host authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param generation - The voice generation the callback was correlated against.
 * @param text - The encoded callback.
 * @returns The delivery record.
 */
async function deliverThroughVoice(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	generation: NonNullable<CoordinatorCallbackCorrelation["realtimeGeneration"]>,
	text: string,
): Promise<CoordinatorCallbackDelivery> {
	const realtimeRequest: CoordinatorCallbackRealtimeRequest = freeze({
		generation,
		params: freeze({ threadId: generation.coordinatorThreadId, text, role: "developer" }),
	});
	const attemptedAtMs = (options.now ?? Date.now)();
	const result = await options.realtime.appendDeveloper(realtimeRequest);
	const lostAuthority = result.attempted
		? afterAttemptReason(callback, options, isDisposed())
		: null;
	return makeDelivery(callback, evidence, {
		attemptedAtMs: result.attempted ? attemptedAtMs : null,
		path: "realtime_appendText",
		outcome: lostAuthority === null ? result.outcome : "outcome_unknown",
		reason: lostAuthority ?? result.reason,
		text,
		realtimeRequest,
	});
}

/**
 * Inject one callback into the coordinator thread's model-visible history. Authority is
 * re-checked after the injection for the same reason as after a voice append.
 * @param callback - The normalized callback.
 * @param options - The host authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param text - The encoded callback.
 * @returns The delivery record.
 */
async function deliverThroughInjection(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	text: string,
): Promise<CoordinatorCallbackDelivery> {
	const payload = developerPayload(callback, text);
	const attemptedAtMs = (options.now ?? Date.now)();
	try {
		await options.session.threadInjectItems(payload);
	} catch (error) {
		const failure = sessionFailure(error);
		const lostAuthority = afterAttemptReason(callback, options, isDisposed());
		return makeDelivery(callback, evidence, {
			attemptedAtMs,
			path: "thread_inject_items",
			outcome: lostAuthority === null ? failure.outcome : "outcome_unknown",
			reason: lostAuthority ?? failure.reason,
			text,
			payload,
		});
	}
	const lostAuthority = afterAttemptReason(callback, options, isDisposed());
	return makeDelivery(callback, evidence, {
		attemptedAtMs,
		path: "thread_inject_items",
		outcome: lostAuthority === null ? "delivered" : "outcome_unknown",
		reason: lostAuthority,
		text,
		payload,
	});
}

/**
 * Deliver one callback down exactly one path, at most once: voice when a generation is live,
 * otherwise an injected developer message for an operation callback. Semantic telemetry with no
 * voice session is dropped rather than injected, because it exists to be heard.
 * @param callback - The normalized callback.
 * @param options - The host authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @returns The delivery record, whether or not anything was attempted.
 */
async function deliverOne(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
): Promise<CoordinatorCallbackDelivery> {
	const cleared = await clearForDelivery(callback, options, isDisposed, evidence);
	if ("refusal" in cleared) {
		return cleared.refusal;
	}
	const { text } = cleared;
	const generation = callback.correlation.realtimeGeneration;
	if (generation !== null) {
		return deliverThroughVoice(callback, options, isDisposed, evidence, generation, text);
	}
	if (callback.kind === "semantic") {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "silent",
			outcome: "not_delivered",
			reason: "voice_inactive",
			text,
		});
	}
	return deliverThroughInjection(callback, options, isDisposed, evidence, text);
}

export { type CallbackDeliveryEvidence, makeDelivery, deliverOne };
