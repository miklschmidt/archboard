import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import type { ThreadLinkEpochProof } from "../../codex-thread-link/index.js";
import { isDeepStrictEqual } from "node:util";
import { encodeCoordinatorCallback } from "./encoding.js";
import { sameRealtimeGeneration } from "./realtime.js";
import type {
	CoordinatorCallback,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryPath,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackOptions,
	CoordinatorCallbackRealtimeRequest,
} from "./contract.js";

export interface CallbackDeliveryEvidence {
	readonly sourceOrder: number;
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
}

function freeze<T>(value: T): T {
	return Object.freeze(value);
}

function deliveryKind(): "coordinator_callback_delivery" {
	return "coordinator_callback_delivery";
}

export function makeDelivery(
	callback: CoordinatorCallback | null,
	evidence: CallbackDeliveryEvidence,
	input: {
		readonly attemptedAtMs: number | null;
		readonly path: CoordinatorCallbackDeliveryPath;
		readonly outcome: CoordinatorCallbackDeliveryOutcome;
		readonly reason: CoordinatorCallbackDeliveryReason | null;
		readonly text?: string | null;
		readonly payload?: SessionParams<"thread/inject_items"> | null;
		readonly realtimeRequest?: CoordinatorCallbackRealtimeRequest | null;
	},
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

function sameJson(left: unknown, right: unknown): boolean {
	return isDeepStrictEqual(left, right);
}

function sameLink(
	left: CoordinatorCallbackLinkCorrelation | null,
	right: CoordinatorCallbackLinkCorrelation,
): boolean {
	return (
		left !== null &&
		left.binding.paneId === right.binding.paneId &&
		left.binding.revision === right.binding.revision &&
		sameJson(left.binding.link, right.binding.link) &&
		sameJson(left.target, right.target)
	);
}

function proofRecord(value: ThreadLinkEpochProof | null | undefined): unknown {
	if (value === null || value === undefined) {
		return null;
	}
	return "record" in value ? value.record : value;
}

function classificationAccepted(
	callback: CoordinatorCallback,
	live: Awaited<ReturnType<CoordinatorCallbackOptions["threadLink"]["classify"]>>,
): boolean {
	const correlation = callback.correlation;
	const captured = correlation.workhorseLink;
	return (
		live.link.state === "executable" &&
		sameJson(live.link, captured.binding.link) &&
		live.link.threadId === correlation.workhorseThreadId &&
		live.link.childId === correlation.childId &&
		live.link.epoch === correlation.epoch &&
		live.link.canAcceptDirectInput &&
		live.link.loaded &&
		live.currentEpoch?.childId === correlation.childId &&
		live.currentEpoch.epoch === correlation.epoch &&
		live.proof !== null &&
		sameJson(live.proof.record, proofRecord(captured.target.provenance)) &&
		(captured.target.provenance === null ||
			captured.target.provenance === undefined ||
			!("record" in captured.target.provenance) ||
			live.proof.manifestRevision === captured.target.provenance.manifestRevision)
	);
}

function finalAuthorityReason(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbackDeliveryReason | null {
	const correlation = callback.correlation;
	const child = options.currentChild();
	if (child === null) {
		return "child_exit";
	}
	if (child.childId !== correlation.childId) {
		return "stale_child";
	}
	if (child.epoch !== correlation.epoch) {
		return "prior_epoch";
	}
	const coordinator = options.currentCoordinator();
	if (
		coordinator === null ||
		coordinator.childId !== correlation.childId ||
		coordinator.epoch !== correlation.epoch ||
		coordinator.threadId !== correlation.coordinatorThreadId
	) {
		return "stale_coordinator";
	}
	if (!sameLink(options.currentWorkhorseLink(), correlation.workhorseLink)) {
		return "stale_link";
	}
	if (
		correlation.workhorseThreadId === null ||
		correlation.workhorseLink.binding.link.state !== "executable" ||
		correlation.workhorseLink.binding.link.threadId !== correlation.workhorseThreadId
	) {
		return "stale_link";
	}
	const generation = options.currentRealtimeGeneration();
	if (!sameRealtimeGeneration(generation, correlation.realtimeGeneration)) {
		return "stale_session";
	}
	if (
		correlation.realtimeGeneration !== null &&
		callback.kind === "semantic" &&
		correlation.realtimeSessionId !== correlation.realtimeGeneration.wireSessionId
	) {
		return "stale_session";
	}
	return null;
}

function afterAttemptReason(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	disposed: boolean,
): CoordinatorCallbackDeliveryReason | null {
	if (disposed) {
		return "disposed";
	}
	return finalAuthorityReason(callback, options);
}

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

function sessionFailure(error: unknown): {
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason;
} {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered") {
		return { outcome: "not_delivered", reason: "session_rejected" };
	}
	return { outcome: "outcome_unknown", reason: "response_lost" };
}

export async function deliverOne(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
	evidence: CallbackDeliveryEvidence,
): Promise<CoordinatorCallbackDelivery> {
	if (isDisposed()) {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "none",
			outcome: "not_delivered",
			reason: "disposed",
		});
	}
	let text: string;
	try {
		text = encodeCoordinatorCallback(callback);
	} catch {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "none",
			outcome: "not_delivered",
			reason: "invalid_callback",
		});
	}
	let live: Awaited<ReturnType<CoordinatorCallbackOptions["threadLink"]["classify"]>>;
	try {
		live = await options.threadLink.classify(callback.correlation.workhorseLink.target);
	} catch {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "none",
			outcome: "not_delivered",
			reason: "transport_failure",
			text,
		});
	}
	if (!classificationAccepted(callback, live)) {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "none",
			outcome: "not_delivered",
			reason: "stale_link",
			text,
		});
	}
	const authorityReason = isDisposed() ? "disposed" : finalAuthorityReason(callback, options);
	if (authorityReason !== null) {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "none",
			outcome: "not_delivered",
			reason: authorityReason,
			text,
		});
	}

	const generation = callback.correlation.realtimeGeneration;
	if (generation !== null) {
		const realtimeRequest: CoordinatorCallbackRealtimeRequest = freeze({
			generation,
			params: freeze({
				threadId: generation.coordinatorThreadId,
				text,
				role: "developer",
			}),
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

	if (callback.kind === "semantic") {
		return makeDelivery(callback, evidence, {
			attemptedAtMs: null,
			path: "silent",
			outcome: "not_delivered",
			reason: "voice_inactive",
			text,
		});
	}
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
