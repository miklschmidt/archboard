import { workhorseNewsSentence } from "#runtime/rules/coordinator-callbacks/workhorse-news.ts";
import {
	afterAttemptReason,
	classificationAccepted,
	finalAuthorityReason,
	type LiveClassification,
} from "#runtime/rules/coordinator-callbacks/delivery-authority.ts";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryPath,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackMutationResult,
	CoordinatorCallbackOptions,
	CoordinatorSemanticCallback,
	CoordinatorCallbackRealtimeRequest,
	WorkhorseNewsSituation,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

/** What one delivery record says about the attempt it describes. */
interface DeliveryRecordInput {
	/** When the attempt was made, or null when nothing was attempted. */
	readonly attemptedAtMs: number | null;
	readonly path: CoordinatorCallbackDeliveryPath;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
	/** The encoded callback, once it has been encoded. */
	readonly text?: string | null;
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
 * @param options - The server authorities and ports.
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
 * classifies as the one it was captured against, and every server authority still holds.
 * @param callback - The normalized callback.
 * @param options - The server authorities and ports.
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
		text = options.host.encode(callback);
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

/** The delivery path each channel of the live voice session is recorded as. */
const VOICE_PATHS = Object.freeze({
	context: "realtime_appendText",
	speech: "realtime_appendSpeech",
} as const satisfies Record<
	CoordinatorCallbackRealtimeRequest["channel"],
	CoordinatorCallbackDeliveryPath
>);

/** One sentence for the live voice session: the generation it is for, its channel, its words. */
interface VoiceAppend {
	readonly generation: NonNullable<CoordinatorCallbackCorrelation["realtimeGeneration"]>;
	readonly channel: CoordinatorCallbackRealtimeRequest["channel"];
	readonly text: string;
	/** What the record says of an append that went through: agent for an outside agent's doing. */
	readonly reason: CoordinatorCallbackDeliveryReason | null;
}

/**
 * The append request one sentence is: speech, or a developer message of quiet context, addressed
 * to the coordinator thread its generation runs on.
 * @param append - The sentence, its generation and its channel.
 * @returns The frozen request.
 */
function voiceRequest(append: VoiceAppend): CoordinatorCallbackRealtimeRequest {
	const { generation, text } = append;
	const threadId = generation.coordinatorThreadId;
	return append.channel === "speech"
		? freeze({ generation, channel: "speech", params: freeze({ threadId, text }) })
		: freeze({
				generation,
				channel: "context",
				params: freeze({ threadId, text, role: "developer" }),
			});
}

/**
 * What the record of an append says when no authority was lost meanwhile: why the session did
 * not take it, or what the sentence was news of.
 * @param result - How the append settled.
 * @param append - The sentence.
 * @returns The reason, or null.
 */
function recordedReason(
	result: CoordinatorCallbackMutationResult,
	append: VoiceAppend,
): CoordinatorCallbackDeliveryReason | null {
	return result.reason ?? append.reason;
}

/**
 * Append one sentence to the coordinator's live voice session, quietly or as speech. Authority is
 * re-checked after the append, because an append that lands as the generation turns over has an
 * unknown outcome.
 * @param callback - The normalized callback.
 * @param options - The server authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param append - The generation the callback was correlated against, the channel and the sentence.
 * @returns The delivery record.
 */
async function deliverThroughVoice(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	append: VoiceAppend,
): Promise<CoordinatorCallbackDelivery> {
	const realtimeRequest = voiceRequest(append);
	const attemptedAtMs = (options.now ?? Date.now)();
	const result = await options.realtime.append(realtimeRequest);
	const lostAuthority = result.attempted
		? afterAttemptReason(callback, options, isDisposed())
		: null;
	return makeDelivery(callback, evidence, {
		attemptedAtMs: result.attempted ? attemptedAtMs : null,
		path: VOICE_PATHS[append.channel],
		outcome: lostAuthority === null ? result.outcome : "outcome_unknown",
		reason: lostAuthority ?? recordedReason(result, append),
		text: append.text,
		realtimeRequest,
	});
}

/**
 * Whether an operation callback is something the coordinator is told. Only an outcome nobody can
 * vouch for: that a turn ended or waits on the user is workhorse news from the thread itself,
 * whoever started the turn (TASK-321), so telling it here as well would tell it twice.
 * @param callback - The normalized callback.
 * @returns True for an operation whose outcome is unknown.
 */
function reportsOutcome(callback: CoordinatorCallback): boolean {
	return callback.kind === "operation" && callback.type === "outcome_unknown";
}

/**
 * What a callback given to the coordinator is: a wait, a message, or work that ended.
 * @param callback - The normalized callback.
 * @returns The situation the coordinator's prompt is written for.
 */
function situationOf(callback: CoordinatorCallback): WorkhorseNewsSituation {
	if (callback.kind !== "workhorse_news") return "ended";
	if (callback.type === "waiting") return "waiting";
	return callback.type === "message" ? "message" : "ended";
}

/**
 * Give the coordinator one workhorse outcome at once, in the turn it is running or a new one, so
 * it decides what the user hears. Nothing is sent while a recording holds the voice.
 * @param callback - The normalized callback.
 * @param options - The authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param port - The port that reaches the coordinator.
 * @param text - The encoded callback.
 * @returns The delivery record.
 */
async function deliverThroughCoordinatorTurn(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	port: NonNullable<CoordinatorCallbackOptions["coordinatorTurn"]>,
	text: string,
): Promise<CoordinatorCallbackDelivery> {
	const threadId = callback.correlation.coordinatorThreadId;
	if (threadId === null) {
		return recordOnly(callback, evidence, text, "not_ready");
	}
	const attemptedAtMs = (options.now ?? Date.now)();
	const news = workhorseNewsSentence(callback);
	const result = await port.report({ threadId, news, situation: situationOf(callback) });
	if (result === "recording") {
		return recordOnly(callback, evidence, text, "voice_inactive");
	}
	return turnDelivery(callback, evidence, {
		result,
		attemptedAtMs,
		lostAuthority: result.attempted ? afterAttemptReason(callback, options, isDisposed()) : null,
		text,
	});
}

/**
 * The record of one coordinator turn that was, or was not, started.
 * @param callback - The normalized callback.
 * @param evidence - The ordering and freshness evidence.
 * @param attempt - How the start settled, when it was tried, and any authority lost meanwhile.
 * @param attempt.result - How the start settled.
 * @param attempt.attemptedAtMs - When it was tried.
 * @param attempt.lostAuthority - The authority lost while it was in flight, or null.
 * @param attempt.text - The encoded callback.
 * @returns The delivery record.
 */
function turnDelivery(
	callback: CoordinatorCallback,
	evidence: CallbackDeliveryEvidence,
	attempt: {
		readonly result: CoordinatorCallbackMutationResult;
		readonly attemptedAtMs: number;
		readonly lostAuthority: ReturnType<typeof afterAttemptReason>;
		readonly text: string;
	},
): CoordinatorCallbackDelivery {
	const { result, lostAuthority } = attempt;
	return makeDelivery(callback, evidence, {
		attemptedAtMs: result.attempted ? attempt.attemptedAtMs : null,
		path: "coordinator_turn",
		outcome: lostAuthority === null ? result.outcome : "outcome_unknown",
		reason: lostAuthority ?? result.reason,
		text: attempt.text,
	});
}

/**
 * The record of a callback that is kept and delivered to nobody.
 * @param callback - The normalized callback.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param text - The encoded callback, kept on the record.
 * @param reason - Why nobody is told.
 * @returns The delivery record.
 */
function recordOnly(
	callback: CoordinatorCallback,
	evidence: CallbackDeliveryEvidence,
	text: string,
	reason: CoordinatorCallbackDeliveryReason,
): CoordinatorCallbackDelivery {
	return makeDelivery(callback, evidence, {
		attemptedAtMs: null,
		path: "silent",
		outcome: "not_delivered",
		reason,
		text,
	});
}

/**
 * Give the live voice session the pane news a semantic callback is, or record the callback when
 * there is none to give: no voice session, or nothing of it that was the user's own doing.
 *
 * News of what an outside agent did is told to the coordinator as well (TASK-293.06); a write to a
 * board no pane shows was refused as it arrived.
 *
 * Pane news is quiet context, except during a narration, where news that stops a talk is speech:
 * the voice model finishes what it is saying (appended speech does not cut into audio in progress,
 * TASK-293.05), asks about what the user picked, then finishes its step and waits (TASK-251).
 * @param callback - The normalized semantic callback.
 * @param options - The server authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param text - The encoded callback, kept on the record of one that is told to nobody.
 * @returns The delivery record.
 */
function deliverPaneNews(
	callback: CoordinatorSemanticCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	text: string,
): Promise<CoordinatorCallbackDelivery> {
	const generation = callback.correlation.realtimeGeneration;
	const policy = options.host.delivery(callback);
	if (generation === null || !("channel" in policy)) {
		return Promise.resolve(
			recordOnly(
				callback,
				evidence,
				text,
				generation === null ? "voice_inactive" : (policy.reason ?? "recorded_only"),
			),
		);
	}
	const append: VoiceAppend = {
		generation,
		channel: policy.channel,
		text: policy.text,
		reason: policy.reason,
	};
	return policy.coordinatorContext
		? deliverOutsideNews(callback, options, isDisposed, evidence, append)
		: deliverThroughVoice(callback, options, isDisposed, evidence, append);
}

/**
 * Inject quiet context, then recheck authority before the voice append.
 * @param callback The captured callback.
 * @param options The runtime authorities and delivery ports.
 * @param isDisposed Whether this owner is disposed.
 * @param evidence The delivery evidence.
 * @param append The host-selected words and channel.
 * @returns The settled delivery.
 */
async function deliverOutsideNews(
	callback: CoordinatorSemanticCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	append: VoiceAppend,
): Promise<CoordinatorCallbackDelivery> {
	await options.coordinatorContext
		.inject({ threadId: append.generation.coordinatorThreadId, text: append.text })
		.catch(() => undefined);
	const reason = isDisposed() ? "disposed" : finalAuthorityReason(callback, options);
	if (reason !== null) return refuseBeforeAttempt(callback, evidence, reason, append.text);
	return deliverThroughVoice(callback, options, isDisposed, evidence, append);
}

/**
 * What an operation callback does while a voice generation is live. An outcome nobody can vouch
 * for goes to the coordinator at once. The rest reach nobody: that a turn ended or waits on the
 * user is workhorse news (TASK-321), the tool result already told the coordinator how its
 * delegation went in, progress is what inspect_workhorse reads, and the correlation envelope they
 * used to be appended as is machine text a speech model says out loud (TASK-293).
 * @param callback - The normalized operation callback.
 * @param options - The server authorities and ports.
 * @param isDisposed - Whether the callback module has been disposed.
 * @param evidence - The ordering and freshness evidence for the delivery record.
 * @param text - The encoded callback.
 * @returns The delivery record.
 */
function deliverOperationWhileVoiceIsLive(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
	text: string,
): Promise<CoordinatorCallbackDelivery> {
	if (!reportsOutcome(callback)) {
		return Promise.resolve(recordOnly(callback, evidence, text, "recorded_only"));
	}
	const turnPort = options.coordinatorTurn;
	return turnPort === undefined
		? Promise.resolve(recordOnly(callback, evidence, text, "recorded_only"))
		: deliverThroughCoordinatorTurn(callback, options, isDisposed, evidence, turnPort, text);
}

/**
 * Deliver one callback down exactly one path, at most once. While a voice generation is live,
 * workhorse news (a turn that ended or waits on the user, whoever started it) and an operation
 * outcome nobody can vouch for go to the coordinator at once, which decides what the user hears;
 * any other operation callback is recorded and told to nobody. With no voice session the
 * coordinator is never run (it is the voice model's subconscious, TASK-321), so neither is sent.
 *
 * A semantic callback (a change, a focus, a selection) reaches the voice model only as pane news:
 * one sentence of names saying where the user's reading now stands, and only for what the pane
 * marked as the user's own doing (TASK-293, ADR 0034), quietly or, during a narration, as speech.
 * Everything else is recorded and told to nobody. The callback itself used to be appended: a seven-kilobyte envelope of identities and a
 * serialized brief on every report, one per walkthrough step the voice model had asked for, which
 * it then answered (33 of them in the sessions of 2026-09-20). The sentence is a hint for what
 * "this" means; the coordinator still reads the live pane through its own tools when asked.
 * @param callback - The normalized callback.
 * @param options - The server authorities and ports.
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
	if (callback.kind === "semantic") {
		return deliverPaneNews(callback, options, isDisposed, evidence, text);
	}
	if (generation === null) {
		return recordOnly(callback, evidence, text, "voice_inactive");
	}
	if (callback.kind === "workhorse_news") {
		const turnPort = options.coordinatorTurn;
		return turnPort === undefined
			? recordOnly(callback, evidence, text, "recorded_only")
			: deliverThroughCoordinatorTurn(callback, options, isDisposed, evidence, turnPort, text);
	}
	return deliverOperationWhileVoiceIsLive(callback, options, isDisposed, evidence, text);
}

export { type CallbackDeliveryEvidence, makeDelivery, deliverOne };
