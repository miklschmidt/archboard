import {
	canonicalContext,
	createThreadInjectItemsParams,
	encodeCanonicalContext,
	type ArchboardContext,
	type ThreadInjectItemsParams,
} from "../../codex-instructions/index.js";
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import type { AppendOutcome } from "../../../shared/codex-realtime-host/index.js";
import type { ThreadLinkSnapshot } from "../../codex-thread-link/index.js";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCurrent,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryPath,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackOptions,
} from "./contract.js";

export function freeze<T>(value: T): T {
	return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return freeze(value.map((child) => cloneAndFreeze(child))) as T;
	const copy: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) copy[key] = cloneAndFreeze(child);
	return freeze(copy) as T;
}

function sameLink(left: ThreadLinkSnapshot | null, right: ThreadLinkSnapshot | null): boolean {
	if (left === right) return true;
	if (left === null || right === null) return false;
	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch {
		return false;
	}
}

function sameRealtime(
	left: CoordinatorCallbackCurrent["realtime"],
	right: CoordinatorCallbackCurrent["realtime"],
): boolean {
	if (left === right) return true;
	if (left === null || right === null) return false;
	return (
		left.wireSessionId === right.wireSessionId &&
		left.correlation.sessionId === right.correlation.sessionId &&
		left.correlation.correlationId === right.correlation.correlationId
	);
}

function sameCurrent(left: CoordinatorCallbackCurrent, right: CoordinatorCallbackCurrent): boolean {
	return (
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.coordinatorThreadId === right.coordinatorThreadId &&
		sameLink(left.link, right.link) &&
		sameRealtime(left.realtime, right.realtime)
	);
}

function currentSnapshot(options: CoordinatorCallbackOptions): CoordinatorCallbackCurrent | null {
	try {
		const current = options.current();
		if (current === null || current === undefined) return null;
		return freeze({
			childId: current.childId,
			epoch: current.epoch,
			coordinatorThreadId: current.coordinatorThreadId,
			link: cloneAndFreeze(current.link),
			realtime:
				current.realtime === null
					? null
					: freeze({
							wireSessionId: current.realtime.wireSessionId,
							correlation: freeze({ ...current.realtime.correlation }),
						}),
		});
	} catch {
		return null;
	}
}

function authorityReason(
	callback: CoordinatorCallback,
	current: CoordinatorCallbackCurrent | null,
): CoordinatorCallbackDeliveryReason | null {
	if (current === null) return "child_exit";
	const target = callback.correlation;
	if (target.childId === null || target.epoch === null) return "not_ready";
	if (current.childId !== target.childId) return "stale_child";
	if (current.epoch !== target.epoch) return "prior_epoch";
	if (
		target.coordinatorThreadId === null ||
		current.coordinatorThreadId !== target.coordinatorThreadId
	)
		return "stale_coordinator";
	if (
		target.workhorseThreadId === null ||
		current.link?.state !== "executable" ||
		current.link?.threadId !== target.workhorseThreadId
	)
		return "stale_link";
	if (current.link.childId !== current.childId) return "stale_child";
	if (current.link.epoch !== current.epoch) return "prior_epoch";
	if (callback.kind === "semantic" && callback.threadLinkState !== "executable")
		return "stale_link";
	return null;
}

function semanticSessionReason(
	callback: CoordinatorCallback,
	current: CoordinatorCallbackCurrent,
): CoordinatorCallbackDeliveryReason | null {
	if (callback.kind !== "semantic" || current.realtime === null) return null;
	if (callback.correlation.realtimeSessionId !== current.realtime.wireSessionId)
		return "stale_session";
	return null;
}

export function makeDelivery(
	callback: CoordinatorCallback | null,
	input: {
		readonly attempted: boolean;
		readonly path: CoordinatorCallbackDeliveryPath;
		readonly outcome: CoordinatorCallbackDeliveryOutcome;
		readonly reason: CoordinatorCallbackDeliveryReason | null;
		readonly text?: string | null;
		readonly payload?: ThreadInjectItemsParams | null;
		readonly realtimeRequest?: CoordinatorCallbackDelivery["realtimeRequest"];
	},
): CoordinatorCallbackDelivery {
	return freeze({
		kind: "coordinator_callback_delivery" as const,
		callback,
		attempted: input.attempted,
		path: input.path,
		outcome: input.outcome,
		reason: input.reason,
		text: input.text ?? null,
		payload: input.payload ?? null,
		realtimeRequest: input.realtimeRequest ?? null,
	});
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function operationContextReason(
	callback: Extract<CoordinatorCallback, { readonly kind: "operation" }>,
	context: ArchboardContext,
): CoordinatorCallbackDeliveryReason | null {
	const target = callback.correlation;
	if (callback.operation === "manage_workhorse_queue") {
		if (
			context.operation.id !== null ||
			context.operation.kind !== null ||
			context.operation.rpc !== null ||
			context.operation.outcome !== null
		)
			return "invalid_context";
		return null;
	}
	if (
		context.operation.id !== target.operationId ||
		context.operation.kind !== callback.operation ||
		context.operation.rpc !== callback.rpc
	)
		return "invalid_context";
	const expectedOutcome = callback.outcome === "pending" ? null : callback.outcome;
	return context.operation.outcome === expectedOutcome ? null : "invalid_context";
}

function semanticContextReason(
	callback: Extract<CoordinatorCallback, { readonly kind: "semantic" }>,
	context: ArchboardContext,
): CoordinatorCallbackDeliveryReason | null {
	const expectedCursor =
		callback.semantic.sequence === null
			? null
			: `${callback.semantic.feedId}:${callback.semantic.sequence}`;
	if (
		context.operation.id !== null ||
		context.operation.kind !== null ||
		context.operation.rpc !== null ||
		context.operation.outcome !== null ||
		context.semantic.brief !== callback.semantic.brief ||
		context.semantic.capturedAtMs !== callback.semantic.capturedAtMs ||
		context.board.cursor !== expectedCursor ||
		context.threadLink.state !== callback.threadLinkState ||
		context.threadLink.reason !== callback.threadLinkReason ||
		context.paneId !== callback.semantic.paneId ||
		!sameStrings(context.selection.elementIds, callback.semantic.selection)
	)
		return "invalid_context";
	if (callback.type === "focus") {
		const expectedPaneId = callback.semantic.focused ? callback.semantic.paneId : null;
		if (
			context.focus.paneId !== expectedPaneId ||
			context.focus.capturedAtMs !== callback.semantic.capturedAtMs
		)
			return "invalid_context";
	}
	if (
		callback.type === "selection" &&
		context.selection.capturedAtMs !== callback.semantic.capturedAtMs
	)
		return "invalid_context";
	return null;
}

function contextReason(
	callback: CoordinatorCallback,
	current: CoordinatorCallbackCurrent,
	context: ArchboardContext,
): CoordinatorCallbackDeliveryReason | null {
	const target = callback.correlation;
	const link = current.link;
	if (
		target.childId === null ||
		target.epoch === null ||
		target.coordinatorThreadId === null ||
		target.workhorseThreadId === null ||
		link?.state !== "executable" ||
		context.child.id !== target.childId ||
		context.child.epoch !== target.epoch ||
		context.coordinator.threadId !== target.coordinatorThreadId ||
		context.coordinator.realtimeSessionId !== (current.realtime?.wireSessionId ?? null) ||
		context.workhorse.threadId !== target.workhorseThreadId ||
		context.workhorse.turnId !== target.turnId ||
		context.threadLink.state !== "executable" ||
		context.threadLink.reason !== null
	)
		return "invalid_context";
	if (callback.kind === "operation") return operationContextReason(callback, context);
	return semanticContextReason(callback, context);
}

function raceReason(
	callback: CoordinatorCallback,
	initial: CoordinatorCallbackCurrent,
	latest: CoordinatorCallbackCurrent | null,
	disposed: boolean,
): CoordinatorCallbackDeliveryReason {
	if (disposed) return "disposed";
	if (latest === null) return "child_exit";
	const latestAuthority = authorityReason(callback, latest);
	if (latestAuthority !== null) return latestAuthority;
	if (!sameLink(initial.link, latest.link)) return "stale_link";
	if (!sameRealtime(initial.realtime, latest.realtime)) return "stale_session";
	return "stale_session";
}

function mapAppendOutcome(outcome: AppendOutcome): {
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
} {
	if (outcome.outcome === "delivered") return { outcome: "delivered", reason: null };
	if (outcome.outcome === "outcome_unknown")
		return {
			outcome: "outcome_unknown",
			reason: outcome.reason === "response_lost" ? "response_lost" : "transport_failure",
		};
	if (outcome.reason === "rejected") return { outcome: "not_delivered", reason: "rejected" };
	if (outcome.reason === "cancelled") return { outcome: "not_delivered", reason: "cancelled" };
	if (outcome.reason === "stale_session")
		return { outcome: "not_delivered", reason: "stale_session" };
	return { outcome: "not_delivered", reason: "not_ready" };
}

function appendCorrelationMatches(
	outcome: AppendOutcome,
	request: CoordinatorCallbackDelivery["realtimeRequest"],
): boolean {
	return (
		request !== null &&
		outcome.sessionId === request.sessionId &&
		outcome.correlationId === request.correlationId
	);
}

function mapSessionError(error: unknown): {
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason;
} {
	if (error instanceof CodexSessionMutationError && error.outcome === "not_delivered")
		return { outcome: "not_delivered", reason: "session_rejected" };
	return { outcome: "outcome_unknown", reason: "response_lost" };
}

export async function deliverOne(
	callback: CoordinatorCallback,
	options: CoordinatorCallbackOptions,
	isDisposed: () => boolean,
): Promise<CoordinatorCallbackDelivery> {
	if (isDisposed())
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason: "disposed",
		});

	const initial = currentSnapshot(options);
	const authorityFailure = authorityReason(callback, initial);
	if (authorityFailure !== null)
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason: authorityFailure,
		});
	if (initial === null) throw new Error("current authority disappeared after validation");
	if (callback.kind === "semantic" && initial.realtime === null)
		return makeDelivery(callback, {
			attempted: false,
			path: "silent",
			outcome: "not_delivered",
			reason: "voice_inactive",
		});
	const sessionFailure = semanticSessionReason(callback, initial);
	if (sessionFailure !== null)
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason: sessionFailure,
		});

	let text: string | null = null;
	let payload: ThreadInjectItemsParams;
	const workhorseThreadId = callback.correlation.workhorseThreadId;
	if (workhorseThreadId === null)
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason: "not_ready",
		});
	try {
		const context = canonicalContext(options.contextFor(callback, initial));
		text = encodeCanonicalContext(context);
		const invalidContext = contextReason(callback, initial, context);
		if (invalidContext !== null)
			return makeDelivery(callback, {
				attempted: false,
				path: "none",
				outcome: "not_delivered",
				reason: invalidContext,
				text,
			});
		payload = createThreadInjectItemsParams({
			threadId: workhorseThreadId,
			context,
		});
	} catch {
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason: "invalid_context",
			text,
		});
	}

	const beforeAttempt = currentSnapshot(options);
	if (
		beforeAttempt === null ||
		!sameCurrent(initial, beforeAttempt) ||
		authorityReason(callback, beforeAttempt) !== null ||
		semanticSessionReason(callback, beforeAttempt) !== null
	) {
		const reason = raceReason(callback, initial, beforeAttempt, isDisposed());
		return makeDelivery(callback, {
			attempted: false,
			path: "none",
			outcome: "not_delivered",
			reason,
			text,
			payload,
		});
	}

	if (initial.realtime !== null) {
		const realtimeRequest = freeze({ ...initial.realtime.correlation, text });
		let appendOutcome: AppendOutcome;
		try {
			appendOutcome = await options.realtime.appendText(realtimeRequest);
		} catch {
			return makeDelivery(callback, {
				attempted: true,
				path: "realtime_appendText",
				outcome: "outcome_unknown",
				reason: "response_lost",
				text,
				realtimeRequest,
			});
		}
		if (!appendCorrelationMatches(appendOutcome, realtimeRequest))
			return makeDelivery(callback, {
				attempted: true,
				path: "realtime_appendText",
				outcome: "outcome_unknown",
				reason: "transport_failure",
				text,
				realtimeRequest,
			});
		const mapped = mapAppendOutcome(appendOutcome);
		const after = currentSnapshot(options);
		if (
			mapped.outcome === "delivered" &&
			(isDisposed() || after === null || !sameCurrent(initial, after))
		)
			return makeDelivery(callback, {
				attempted: true,
				path: "realtime_appendText",
				outcome: "outcome_unknown",
				reason: raceReason(callback, initial, after, isDisposed()),
				text,
				realtimeRequest,
			});
		return makeDelivery(callback, {
			attempted: true,
			path: "realtime_appendText",
			outcome: mapped.outcome,
			reason: mapped.reason,
			text,
			realtimeRequest,
		});
	}

	if (callback.kind === "semantic")
		return makeDelivery(callback, {
			attempted: false,
			path: "silent",
			outcome: "not_delivered",
			reason: "voice_inactive",
			text,
		});

	let injection: Promise<unknown>;
	try {
		const sessionPayload: SessionParams<"thread/inject_items"> = {
			...payload,
			threadId: workhorseThreadId,
		};
		injection = options.session.threadInjectItems(sessionPayload);
	} catch (error) {
		const mapped = mapSessionError(error);
		return makeDelivery(callback, {
			attempted: true,
			path: "thread_inject_items",
			outcome: mapped.outcome,
			reason: mapped.reason,
			text,
			payload,
		});
	}
	try {
		await injection;
	} catch (error) {
		const mapped = mapSessionError(error);
		return makeDelivery(callback, {
			attempted: true,
			path: "thread_inject_items",
			outcome: mapped.outcome,
			reason: mapped.reason,
			text,
			payload,
		});
	}
	const after = currentSnapshot(options);
	if (isDisposed() || after === null || !sameCurrent(initial, after))
		return makeDelivery(callback, {
			attempted: true,
			path: "thread_inject_items",
			outcome: "outcome_unknown",
			reason: raceReason(callback, initial, after, isDisposed()),
			text,
			payload,
		});
	return makeDelivery(callback, {
		attempted: true,
		path: "thread_inject_items",
		outcome: "delivered",
		reason: null,
		text,
		payload,
	});
}
