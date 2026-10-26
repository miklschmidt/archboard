import { CodexSessionMutationError, type SessionParams } from "@archboard/codex-app-server/session";
import {
	createWorkbenchThreadInjectItemsParams,
	type ThreadInjectItemsParams,
} from "#runtime/rules/host/bodies.ts";
import { captureExecutionContext } from "#runtime/rules/host/context.ts";
import type { WorkbenchExecutionContext } from "#runtime/protocol/host/context.ts";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkClassification,
} from "#runtime/rules/thread-link/contract.ts";
import type {
	CodexThreadContextDelivery,
	CodexThreadContextDeliveryOptions,
	CodexThreadContextDeliveryOutcome,
	CodexThreadContextDeliveryReason,
	CodexThreadContextDeliveryState,
	CodexThreadContextEventId,
	WorkhorseContextEvent,
} from "#runtime/services/thread-context/contract.ts";
import {
	afterAttemptReason,
	finalReason,
} from "#runtime/services/thread-context/delivery-guards.ts";
import type { DeliveryState } from "#runtime/services/thread-context/delivery-state.ts";
import { eventId, eventKey } from "#runtime/services/thread-context/event-identity.ts";
import {
	classificationErrorReason,
	eventReason,
	executionReason,
	generationReason,
	readExecution,
	targetLinkReason,
} from "#runtime/services/thread-context/refusal-reasons.ts";

type Reason = CodexThreadContextDeliveryReason;
type Outcome = CodexThreadContextDeliveryOutcome;
type Options = CodexThreadContextDeliveryOptions;

/** One delivery phase either yields its value or names why delivery stops. */
type Step<Value> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false; readonly reason: Reason };

/** What the synchronous preparation captured before any authority read. */
interface PreparedDelivery {
	readonly initialBinding: ThreadLinkBindingSnapshot;
	readonly payload: ThreadInjectItemsParams;
}

/** How the single injection attempt ended. */
interface AttemptResult {
	readonly state: CodexThreadContextDeliveryState;
	readonly reason: Reason;
}

/**
 * Wraps a phase value as a successful step.
 * @param value - The phase's result.
 * @returns The successful step.
 */
function stepValue<Value>(value: Value): Step<Value> {
	return { ok: true, value };
}

/**
 * Wraps a refusal reason as a failed step.
 * @param reason - Why delivery stops here.
 * @returns The failed step.
 */
function stepFailure<Value>(reason: Reason): Step<Value> {
	return { ok: false, reason };
}

/**
 * The immutable outcome record for one change identity.
 * @param event - The announced change.
 * @param options - The delivery options naming link key and target.
 * @param state - Whether the event was delivered, refused, or its response was lost.
 * @param reason - The stable reason for anything but a delivery.
 * @param attempted - Whether `thread/inject_items` was called.
 * @param payload - The canonical body, when it was built before refusal or attempt.
 * @returns The frozen outcome.
 */
function outcome(
	event: WorkhorseContextEvent,
	options: Options,
	state: CodexThreadContextDeliveryState,
	reason: Reason | null,
	attempted: boolean,
	payload: ThreadInjectItemsParams | null,
): Outcome {
	return Object.freeze({
		kind: "thread_context_delivery",
		event: eventId(event),
		linkKey: options.linkKey,
		targetThreadId: options.target.threadId,
		targetChildId: options.target.childId,
		targetEpoch: options.target.epoch,
		targetOperationId: options.target.operationId,
		attempted,
		outcome: state,
		reason,
		freshness: Object.freeze({
			capturedAtMs: event.capturedAtMs,
			freshUntilMs: event.freshUntilMs,
		}),
		payload,
	});
}

/**
 * An outcome for an event refused before any injection attempt.
 * @param event - The announced change.
 * @param options - The delivery options.
 * @param reason - Why it was refused.
 * @param payload - The canonical body, when it had already been built.
 * @returns The frozen `not_delivered` outcome.
 */
function refused(
	event: WorkhorseContextEvent,
	options: Options,
	reason: Reason,
	payload: ThreadInjectItemsParams | null = null,
): Outcome {
	return outcome(event, options, "not_delivered", reason, false, payload);
}

/**
 * Whether a session error proves the mutation never reached the app-server.
 * @param error - Whatever the session threw.
 * @returns True for a known `not_delivered` mutation error.
 */
function isKnownNotDelivered(error: unknown): boolean {
	return error instanceof CodexSessionMutationError && error.outcome === "not_delivered";
}

/**
 * Whether a session error means the mutation may have reached the app-server.
 * @param error - Whatever the session threw.
 * @returns True for a known `outcome_unknown` mutation error.
 */
function isKnownUnknown(error: unknown): boolean {
	return error instanceof CodexSessionMutationError && error.outcome === "outcome_unknown";
}

/**
 * Checks the delivery target itself carries an operation id and is the
 * identity authority's current generation.
 * @param options - The delivery options.
 * @returns The refusal reason, or null when the target is usable.
 */
function targetAuthorityReason(options: Options): Reason | null {
	const target = options.target;
	const generation = generationReason(target.childId, target.epoch, {
		threadId: target.threadId,
		childId: options.identity.validator.childId,
		epoch: options.identity.validator.epoch,
		operationId: target.operationId,
	});
	if (generation !== null) {
		return generation;
	}
	if (typeof target.operationId !== "string" || target.operationId.length === 0) {
		return "unknown_provenance";
	}
	return null;
}

/**
 * Everything checked before the link binding is read: the change, its
 * freshness, the target and the live child capability.
 * @param event - The announced change.
 * @param options - The delivery options.
 * @param lastSequence - The highest sequence of its feed reserved before this change.
 * @returns The refusal reason, or null when delivery may continue.
 */
function preflightReason(
	event: WorkhorseContextEvent,
	options: Options,
	lastSequence: number,
): Reason | null {
	const eventFailure = eventReason(event, options, lastSequence);
	if (eventFailure !== null) {
		return eventFailure;
	}
	const now = options.now();
	if (!Number.isFinite(now) || now >= event.freshUntilMs) {
		return "stale_event";
	}
	const targetFailure = targetAuthorityReason(options);
	if (targetFailure !== null) {
		return targetFailure;
	}
	return executionReason(readExecution(options), options.identity, options.target);
}

/**
 * Reads the link's current binding and checks it is executable for the target.
 * @param options - The delivery options.
 * @returns The binding, or the reason it cannot be used.
 */
function readInitialBinding(options: Options): Step<ThreadLinkBindingSnapshot> {
	let binding: ThreadLinkBindingSnapshot;
	try {
		binding = options.threadLink.read(options.linkKey);
	} catch {
		return stepFailure("link_changed");
	}
	if (binding.linkKey !== options.linkKey) {
		return stepFailure("link_changed");
	}
	const linkFailure = targetLinkReason(binding.link, options.target);
	return linkFailure === null ? stepValue(binding) : stepFailure(linkFailure);
}

/**
 * The execution context one change is delivered under: the host's data, then the identities the
 * agent read when the change was announced, which the host's data never replaces.
 * @param event - The announced change, already proven to name the target.
 * @param options - The delivery options naming the target.
 * @returns The validated, frozen context.
 */
function announcedContext(
	event: WorkhorseContextEvent,
	options: Options,
): WorkbenchExecutionContext {
	return captureExecutionContext({
		...event.payload,
		threadLink: event.threadLink,
		child: { id: options.target.childId, epoch: options.target.epoch },
		workhorse: { threadId: options.target.threadId, turnId: null },
		coordinator: event.coordinator,
		brief: {
			text: event.text ?? "",
			capturedAtMs: event.capturedAtMs,
			freshUntilMs: event.freshUntilMs,
		},
		operation: { id: null, kind: null, rpc: null, outcome: null },
	});
}

/**
 * Builds the canonical injection body, refusing a context the codec cannot encode.
 * @param event - The announced change.
 * @param options - The delivery options carrying the codec.
 * @returns The body, or `invalid_context`.
 */
function buildPayload(
	event: WorkhorseContextEvent,
	options: Options,
): Step<ThreadInjectItemsParams> {
	try {
		const context = announcedContext(event, options);
		return stepValue(
			createWorkbenchThreadInjectItemsParams(
				{ threadId: options.target.threadId, context },
				options.contextCodec,
			),
		);
	} catch {
		return stepFailure("invalid_context");
	}
}

/**
 * The last asynchronous authority read: classifies the target thread and
 * requires an executable link with a durable proof.
 * @param options - The delivery options carrying the classifier.
 * @returns The classification, or the reason it refuses the target.
 */
async function classifyTarget(options: Options): Promise<Step<ThreadLinkClassification>> {
	let classification: ThreadLinkClassification;
	try {
		classification = await options.threadLink.classify(options.target);
	} catch (error) {
		return stepFailure(classificationErrorReason(error));
	}
	const linkFailure = targetLinkReason(classification.link, options.target);
	if (linkFailure !== null) {
		return stepFailure(linkFailure);
	}
	return classification.proof === null
		? stepFailure("unknown_provenance")
		: stepValue(classification);
}

/**
 * Converts the canonical body into the session's typed parameters.
 * @param options - The delivery options carrying the identity decoder.
 * @param payload - The canonical body.
 * @returns The session parameters, or `unknown_provenance` when the thread id does not decode.
 */
function sessionPayloadFor(
	options: Options,
	payload: ThreadInjectItemsParams,
): Step<SessionParams<"thread/inject_items">> {
	try {
		return stepValue({
			...payload,
			threadId: options.identity.decoder.parseThreadId(payload.threadId),
		});
	} catch {
		return stepFailure("unknown_provenance");
	}
}

/**
 * The one `thread/inject_items` attempt. A synchronous throw from the session
 * is a rejection unless it is a known unknown; a rejected response is a
 * rejection when the session proves non-delivery and a lost response otherwise.
 * @param options - The delivery options carrying the session.
 * @param sessionPayload - The typed injection parameters.
 * @returns How the attempt ended, or null when the response arrived.
 */
async function attemptInjection(
	options: Options,
	sessionPayload: SessionParams<"thread/inject_items">,
): Promise<AttemptResult | null> {
	let response: Promise<unknown>;
	try {
		response = options.session.threadInjectItems(sessionPayload);
	} catch (error) {
		return isKnownUnknown(error)
			? { state: "outcome_unknown", reason: "response_lost" }
			: { state: "not_delivered", reason: "session_rejected" };
	}
	try {
		await response;
	} catch (error) {
		return isKnownNotDelivered(error)
			? { state: "not_delivered", reason: "session_rejected" }
			: { state: "outcome_unknown", reason: "response_lost" };
	}
	return null;
}

/**
 * Settles an attempt whose response arrived: the outcome is `delivered` only
 * when every authority the attempt relied on is still intact.
 * @param state - The delivery state.
 * @param options - The delivery options.
 * @returns The final outcome.
 */
function settleAfterAttempt(state: DeliveryState, options: Options): Outcome {
	let afterReason: Reason | null;
	try {
		afterReason = afterAttemptReason(state, options);
	} catch {
		return outcome(state.event, options, "outcome_unknown", "response_lost", true, state.payload);
	}
	if (afterReason !== null) {
		return outcome(state.event, options, "outcome_unknown", afterReason, true, state.payload);
	}
	return outcome(state.event, options, "delivered", null, true, state.payload);
}

/**
 * Runs the asynchronous half of a delivery: classification, the synchronous
 * final guard and the single injection attempt.
 * @param event - The announced change.
 * @param options - The delivery options.
 * @param prepared - The binding and payload captured synchronously.
 * @param highestReservedSequence - Reads the highest sequence reserved so far.
 * @returns The final outcome.
 */
async function deliverPrepared(
	event: WorkhorseContextEvent,
	options: Options,
	prepared: PreparedDelivery,
	highestReservedSequence: (feedId: string) => number,
): Promise<Outcome> {
	const { payload } = prepared;
	// This is deliberately the last asynchronous authority read. The synchronous
	// guard and the one inject_items call follow it without another await.
	const classified = await classifyTarget(options);
	if (!classified.ok) {
		return refused(event, options, classified.reason, payload);
	}
	const session = sessionPayloadFor(options, payload);
	if (!session.ok) {
		return refused(event, options, session.reason, payload);
	}
	const state: DeliveryState = {
		event,
		id: eventId(event),
		initialBinding: prepared.initialBinding,
		payload,
	};
	const finalGuardReason = finalReason(state, options, classified.value, highestReservedSequence);
	if (finalGuardReason !== null) {
		return refused(event, options, finalGuardReason, payload);
	}
	const attempt = await attemptInjection(options, session.value);
	if (attempt !== null) {
		return outcome(event, options, attempt.state, attempt.reason, true, payload);
	}
	return settleAfterAttempt(state, options);
}

/**
 * Delivers one event once: every refusal before the attempt is
 * `not_delivered` with its reason, and nothing here ever retries.
 * @param event - The announced change.
 * @param options - The delivery options.
 * @param lastSequence - The highest sequence reserved before this event.
 * @param highestReservedSequence - Reads the highest sequence reserved so far.
 * @returns The final outcome.
 */
async function deliverOne(
	event: WorkhorseContextEvent,
	options: Options,
	lastSequence: number,
	highestReservedSequence: (feedId: string) => number,
): Promise<Outcome> {
	const preflight = preflightReason(event, options, lastSequence);
	if (preflight !== null) {
		return refused(event, options, preflight);
	}
	const binding = readInitialBinding(options);
	if (!binding.ok) {
		return refused(event, options, binding.reason);
	}
	const payload = buildPayload(event, options);
	if (!payload.ok) {
		return refused(event, options, payload.reason);
	}
	return deliverPrepared(
		event,
		options,
		{ initialBinding: binding.value, payload: payload.value },
		highestReservedSequence,
	);
}

/**
 * The once-only delivery port: a ledger keyed by change identity, and a
 * reserved-sequence watermark for each feed.
 * @param options - The delivery options.
 * @returns The delivery port.
 */
function createCodexThreadContextDelivery(options: Options): CodexThreadContextDelivery {
	const pending = new Map<string, Promise<Outcome>>();
	const settled = new Map<string, Outcome>();
	const firstSeenKeys: string[] = [];
	const highestReserved = new Map<string, number>();
	let disposed = false;

	/**
	 * The highest sequence of one feed reserved so far.
	 * @param feedId - The feed.
	 * @returns The sequence, or -1 before any change of that feed.
	 */
	const highestReservedSequence = (feedId: string): number => highestReserved.get(feedId) ?? -1;

	/**
	 * Advances the feed watermark for a newly seen change.
	 * @param event - The announced change.
	 * @returns The watermark of its feed before this change was reserved.
	 */
	const reserveSequence = (event: WorkhorseContextEvent): number => {
		const previousSequence = highestReservedSequence(event.feedId);
		if (event.sequence > previousSequence) {
			highestReserved.set(event.feedId, event.sequence);
		}
		return previousSequence;
	};

	/**
	 * Starts the delivery of a first-seen change; an unexpected throw settles it
	 * as a revalidation failure rather than an unsettled promise.
	 * @param event - The announced change.
	 * @param previousSequence - The watermark of its feed before this change was reserved.
	 * @returns The outcome promise.
	 */
	const start = (event: WorkhorseContextEvent, previousSequence: number): Promise<Outcome> =>
		(disposed
			? Promise.resolve(refused(event, options, "disposed"))
			: deliverOne(event, options, previousSequence, highestReservedSequence)
		).catch(() => refused(event, options, "thread_revalidation_failed"));

	return Object.freeze({
		/**
		 * Delivers a change once: a pending or settled identity returns its
		 * existing outcome instead of a second attempt.
		 * @param event - The announced change.
		 * @returns The outcome promise shared by every caller for this identity.
		 */
		deliver: (event: WorkhorseContextEvent): Promise<Outcome> => {
			const key = eventKey(eventId(event));
			const existing = pending.get(key);
			if (existing !== undefined) {
				return existing;
			}
			const settledOutcome = settled.get(key);
			if (settledOutcome !== undefined) {
				return Promise.resolve(settledOutcome);
			}
			firstSeenKeys.push(key);
			const promise = start(event, reserveSequence(event)).then((result) => {
				pending.delete(key);
				settled.set(key, result);
				return result;
			});
			pending.set(key, promise);
			return promise;
		},
		/**
		 * Settled outcomes in first-seen order.
		 * @returns The frozen list of outcomes.
		 */
		inspect: () =>
			Object.freeze(
				firstSeenKeys.flatMap((key) => {
					const result = settled.get(key);
					return result === undefined ? [] : [result];
				}),
			),
		/**
		 * Looks up the settled outcome for one change identity.
		 * @param event - The change identity.
		 * @returns The outcome, or undefined while pending or never seen.
		 */
		get: (event: CodexThreadContextEventId) => settled.get(eventKey(event)),
		/**
		 * Stops accepting changes; later ones settle as `disposed`.
		 */
		dispose: () => {
			disposed = true;
		},
	});
}

export { createCodexThreadContextDelivery };
