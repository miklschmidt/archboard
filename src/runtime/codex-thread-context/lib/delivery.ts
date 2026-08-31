import { CodexEpochError, type EpochExecutionRequest } from "../../codex-epoch/index.js";
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import {
	createThreadInjectItemsParams,
	type ArchboardContext,
	type ThreadInjectItemsParams,
} from "../../codex-instructions/index.js";
import type {
	SemanticCursor,
	SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type {
	ThreadLink,
	ThreadLinkBindingSnapshot,
	ThreadLinkClassification,
	ThreadLinkSnapshot,
} from "../../codex-thread-link/index.js";
import { CodexThreadLinkError, type ThreadLinkReasonCode } from "../../codex-thread-link/index.js";
import type {
	ChildEpoch,
	ChildId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexThreadContextDelivery,
	CodexThreadContextDeliveryOptions,
	CodexThreadContextDeliveryOutcome,
	CodexThreadContextDeliveryReason,
	CodexThreadContextDeliveryState,
	CodexThreadContextEventId,
	CodexThreadContextExecution,
} from "./contract.js";

interface DeliveryTarget {
	readonly threadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

interface DeliveryState {
	readonly event: SettledSemanticChangeEvent;
	readonly id: CodexThreadContextEventId;
	readonly initialBinding: ThreadLinkBindingSnapshot;
	readonly payload: ThreadInjectItemsParams;
}

/** The opaque board cursor carried by the canonical context for one feed event. */
export function canonicalSemanticCursorToken(cursor: SemanticCursor): string {
	return `${cursor.feedId}:${cursor.sequence}`;
}

const keyFor = (event: CodexThreadContextEventId): string =>
	JSON.stringify([event.feedId, event.sequence]);

function eventId(event: SettledSemanticChangeEvent): CodexThreadContextEventId {
	return Object.freeze({ feedId: event.feedId, sequence: event.cursor?.sequence ?? -1 });
}

function generationReason(
	childId: ChildId,
	epoch: ChildEpoch,
	target: DeliveryTarget,
): CodexThreadContextDeliveryReason | null {
	if (childId !== target.childId) return "stale_child";
	if (epoch !== target.epoch) return "prior_epoch";
	return null;
}

function epochErrorReason(error: unknown): CodexThreadContextDeliveryReason {
	if (error instanceof CodexEpochError) {
		if (error.code === "stale_child") return "stale_child";
		if (error.code === "prior_epoch") return "prior_epoch";
		if (error.code === "unknown_provenance") return "unknown_provenance";
	}
	return "thread_revalidation_failed";
}

function linkReason(link: ThreadLinkSnapshot): CodexThreadContextDeliveryReason {
	return link.state === "unbound" ? "unbound" : (link.reason ?? "unknown_provenance");
}

function sameSource(left: ThreadLink["source"], right: ThreadLink["source"]): boolean {
	if (typeof left === "string" || typeof right === "string") return left === right;
	return JSON.stringify(left) === JSON.stringify(right);
}

function sameLink(left: ThreadLinkSnapshot, right: ThreadLinkSnapshot): boolean {
	if (left.state !== right.state) return false;
	if (left.state === "unbound" || right.state === "unbound") return true;
	if (left.threadId !== right.threadId) return false;
	if (left.source === null || right.source === null) return left.source === right.source;
	if (!sameSource(left.source, right.source)) return false;
	if (left.status !== right.status || left.loaded !== right.loaded) return false;
	if (left.canAcceptDirectInput !== right.canAcceptDirectInput) return false;
	if (left.state === "executable" && right.state === "executable") {
		return left.childId === right.childId && left.epoch === right.epoch;
	}
	if (left.state === "inspect_only" && right.state === "inspect_only") {
		return left.reason === right.reason;
	}
	return false;
}

function sameBinding(left: ThreadLinkBindingSnapshot, right: ThreadLinkBindingSnapshot): boolean {
	return (
		left.paneId === right.paneId &&
		left.revision === right.revision &&
		sameLink(left.link, right.link)
	);
}

function sameStringValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readExecution(
	options: CodexThreadContextDeliveryOptions,
): CodexThreadContextExecution | null {
	try {
		return options.currentExecution();
	} catch {
		return null;
	}
}

function executionReason(
	execution: CodexThreadContextExecution | null,
	identity: CodexThreadContextDeliveryOptions["identity"],
	target: DeliveryTarget,
): CodexThreadContextDeliveryReason | null {
	if (execution === null) return "child_exit";
	const currentGeneration = generationReason(execution.childId, execution.epoch, target);
	if (currentGeneration !== null) return currentGeneration;
	if (!identity.validator.isCurrentEpoch(execution.childId, execution.epoch)) {
		return (
			generationReason(execution.childId, execution.epoch, {
				threadId: target.threadId,
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
				operationId: target.operationId,
			}) ?? "unknown_provenance"
		);
	}
	return null;
}

function targetLinkReason(
	link: ThreadLinkSnapshot,
	target: DeliveryTarget,
): CodexThreadContextDeliveryReason | null {
	if (link.state !== "executable") return linkReason(link);
	if (link.threadId !== target.threadId) return "link_changed";
	if (link.childId !== target.childId) return "stale_child";
	if (link.epoch !== target.epoch) return "prior_epoch";
	return null;
}

function eventLinkReason(
	event: SettledSemanticChangeEvent,
): CodexThreadContextDeliveryReason | null {
	if (event.threadLink.state === "executable") return null;
	if (event.threadLink.state === "unbound") return "unbound";
	return isThreadLinkReasonCode(event.threadLink.reason)
		? event.threadLink.reason
		: "unknown_provenance";
}

function isThreadLinkReasonCode(value: string | null): value is ThreadLinkReasonCode {
	switch (value) {
		case "stale_child":
		case "prior_epoch":
		case "thread_start_outcome_unknown":
		case "unknown_provenance":
		case "thread_list_missing":
		case "thread_list_ambiguous":
		case "thread_loaded_list_ambiguous":
		case "thread_source_custom":
		case "thread_source_subagent":
		case "thread_source_unknown":
		case "thread_status_not_loaded":
		case "thread_status_system_error":
		case "thread_loaded_list_missing":
		case "direct_input_false":
		case "direct_input_unknown":
			return true;
		default:
			return false;
	}
}

function eventReason(
	event: SettledSemanticChangeEvent,
	options: CodexThreadContextDeliveryOptions,
	lastSequence: number,
): CodexThreadContextDeliveryReason | null {
	if (event.kind !== "settled_change" || event.source !== "settled_change") {
		return "invalid_event";
	}
	if (event.origin === "agent") return "agent_only";
	if (event.origin !== "human" && event.origin !== "mixed") return "invalid_event";
	if (event.change.significance === "cosmetic") return "cosmetic";
	if (event.change.significance !== "layout" && event.change.significance !== "structural") {
		return "invalid_event";
	}
	if (event.cursor === null) return "invalid_event";
	if (!Number.isInteger(event.cursor.sequence) || event.cursor.sequence < 0) {
		return "invalid_event";
	}
	if (event.feedId !== options.feedId || event.cursor.feedId !== options.feedId) {
		return "stale_cursor";
	}
	if (
		event.change.feedId !== event.feedId ||
		event.change.cursor.feedId !== event.cursor.feedId ||
		event.change.cursor.sequence !== event.cursor.sequence ||
		event.change.origin !== event.origin
	) {
		return "invalid_event";
	}
	if (event.pane.paneId !== options.paneId) return "invalid_event";
	if (event.staleness.state !== "current" || event.freshness.state !== "fresh") {
		return "stale_event";
	}
	const linkReasonValue = eventLinkReason(event);
	if (linkReasonValue !== null) return linkReasonValue;
	if (event.child.id === null || event.child.epoch === null) return "unknown_provenance";
	if (event.workhorse.threadId === null) return "unknown_provenance";
	const target = options.target;
	const generation = generationReason(event.child.id, event.child.epoch, target);
	if (generation !== null) return generation;
	if (event.workhorse.threadId !== target.threadId) return "link_changed";
	if (event.cursor.sequence <= lastSequence) return "stale_cursor";
	return null;
}

function eventIdentityReason(
	event: SettledSemanticChangeEvent,
	expected: CodexThreadContextEventId,
): CodexThreadContextDeliveryReason | null {
	const current = eventId(event);
	return current.feedId === expected.feedId && current.sequence === expected.sequence
		? null
		: "stale_cursor";
}

function contextMatchesEvent(
	event: SettledSemanticChangeEvent,
	context: ArchboardContext,
	target: DeliveryTarget,
	paneId: string,
): boolean {
	if (event.cursor === null || event.version === null) return false;
	const cursor = canonicalSemanticCursorToken(event.cursor);

	return (
		context.paneId === paneId &&
		context.board.note === event.board.note &&
		context.board.version === event.version &&
		context.board.cursor === cursor &&
		context.threadLink.state === event.threadLink.state &&
		context.threadLink.reason === event.threadLink.reason &&
		context.child.id === event.child.id &&
		context.child.epoch === event.child.epoch &&
		context.child.id === target.childId &&
		context.child.epoch === target.epoch &&
		context.workhorse.threadId === event.workhorse.threadId &&
		context.workhorse.threadId === target.threadId &&
		context.workhorse.turnId === event.workhorse.turnId &&
		context.coordinator.threadId === event.coordinator.threadId &&
		context.coordinator.realtimeSessionId === event.coordinator.realtimeSessionId &&
		context.semantic.brief === event.brief &&
		context.semantic.capturedAtMs === event.freshness.capturedAtMs &&
		context.semantic.freshUntilMs === event.freshness.freshUntilMs &&
		context.semantic.truncated === event.truncated &&
		context.focus.paneId === (event.pane.focused ? event.pane.paneId : null) &&
		context.focus.capturedAtMs === event.freshness.capturedAtMs &&
		sameStringValues(context.selection.elementIds, event.selection) &&
		context.selection.capturedAtMs === event.freshness.capturedAtMs &&
		context.claim.holder === event.claim.holder &&
		context.claim.doing === event.claim.doing &&
		sameStringValues(context.ambiguity, event.ambiguity) &&
		context.operation.id === null
	);
}

function requestFor(target: DeliveryTarget): EpochExecutionRequest {
	return {
		childId: target.childId,
		epoch: target.epoch,
		operationId: target.operationId,
		threadId: target.threadId,
	};
}

function finalReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
	classification: ThreadLinkClassification,
	highestReservedSequence: () => number,
): CodexThreadContextDeliveryReason | null {
	const identityFailure = eventIdentityReason(state.event, state.id);
	if (identityFailure !== null) return identityFailure;
	const eventFailure = eventReason(state.event, options, -1);
	if (eventFailure !== null) return eventFailure;
	const execution = readExecution(options);
	const currentExecutionReason = executionReason(execution, options.identity, options.target);
	if (currentExecutionReason !== null) return currentExecutionReason;
	let currentBinding: ThreadLinkBindingSnapshot;
	try {
		currentBinding = options.threadLink.read(options.paneId);
	} catch {
		return "link_changed";
	}
	if (!sameBinding(currentBinding, state.initialBinding)) return "link_changed";
	if (!sameLink(currentBinding.link, classification.link)) return "link_changed";
	const currentLinkReason = targetLinkReason(currentBinding.link, options.target);
	if (currentLinkReason !== null) return currentLinkReason;
	if (typeof options.target.operationId !== "string" || options.target.operationId.length === 0) {
		return "unknown_provenance";
	}
	try {
		options.epoch.assertCurrent(requestFor(options.target));
	} catch (error) {
		return epochErrorReason(error);
	}
	const now = options.now();
	if (!Number.isFinite(now) || now >= state.event.freshness.freshUntilMs) {
		return "stale_event";
	}
	if (state.id.feedId === options.feedId && state.id.sequence < highestReservedSequence()) {
		return "stale_cursor";
	}
	return null;
}

function afterAttemptReason(
	state: DeliveryState,
	options: CodexThreadContextDeliveryOptions,
): CodexThreadContextDeliveryReason | null {
	try {
		const identityFailure = eventIdentityReason(state.event, state.id);
		if (identityFailure !== null) return identityFailure;
		if (eventReason(state.event, options, -1) !== null) return "stale_event";
	} catch {
		return "stale_event";
	}
	const execution = readExecution(options);
	const executionFailure = executionReason(execution, options.identity, options.target);
	if (executionFailure !== null) return executionFailure;
	let currentBinding: ThreadLinkBindingSnapshot;
	try {
		currentBinding = options.threadLink.read(options.paneId);
	} catch {
		return "link_changed";
	}
	if (!sameBinding(currentBinding, state.initialBinding)) return "link_changed";
	try {
		options.epoch.assertCurrent(requestFor(options.target));
	} catch (error) {
		return epochErrorReason(error);
	}
	return null;
}

function outcome(
	event: SettledSemanticChangeEvent,
	options: CodexThreadContextDeliveryOptions,
	state: CodexThreadContextDeliveryState,
	reason: CodexThreadContextDeliveryReason | null,
	attempted: boolean,
	payload: ThreadInjectItemsParams | null,
): CodexThreadContextDeliveryOutcome {
	return Object.freeze({
		kind: "thread_context_delivery",
		event: eventId(event),
		paneId: options.paneId,
		targetThreadId: options.target.threadId,
		targetChildId: options.target.childId,
		targetEpoch: options.target.epoch,
		targetOperationId: options.target.operationId,
		attempted,
		outcome: state,
		reason,
		payload,
	});
}

function isKnownNotDelivered(error: unknown): boolean {
	return error instanceof CodexSessionMutationError && error.outcome === "not_delivered";
}

function isKnownUnknown(error: unknown): boolean {
	return error instanceof CodexSessionMutationError && error.outcome === "outcome_unknown";
}

async function deliverOne(
	event: SettledSemanticChangeEvent,
	options: CodexThreadContextDeliveryOptions,
	lastSequence: number,
	highestReservedSequence: () => number,
): Promise<CodexThreadContextDeliveryOutcome> {
	const reason = eventReason(event, options, lastSequence);
	if (reason !== null) return outcome(event, options, "not_delivered", reason, false, null);

	const target = options.target;
	const targetGeneration = generationReason(target.childId, target.epoch, {
		threadId: target.threadId,
		childId: options.identity.validator.childId,
		epoch: options.identity.validator.epoch,
		operationId: target.operationId,
	});
	if (
		typeof target.operationId !== "string" ||
		target.operationId.length === 0 ||
		targetGeneration
	) {
		return outcome(
			event,
			options,
			"not_delivered",
			targetGeneration ?? "unknown_provenance",
			false,
			null,
		);
	}

	const initialExecution = readExecution(options);
	const initialExecutionReason = executionReason(initialExecution, options.identity, target);
	if (initialExecutionReason !== null || initialExecution === null) {
		return outcome(
			event,
			options,
			"not_delivered",
			initialExecutionReason ?? "child_exit",
			false,
			null,
		);
	}

	let initialBinding: ThreadLinkBindingSnapshot;
	try {
		initialBinding = options.threadLink.read(options.paneId);
	} catch {
		return outcome(event, options, "not_delivered", "link_changed", false, null);
	}
	if (initialBinding.paneId !== options.paneId) {
		return outcome(event, options, "not_delivered", "link_changed", false, null);
	}
	const initialLinkReason = targetLinkReason(initialBinding.link, target);
	if (initialLinkReason !== null) {
		return outcome(event, options, "not_delivered", initialLinkReason, false, null);
	}

	let payload: ThreadInjectItemsParams;
	try {
		const context = options.contextForEvent(event);
		if (!contextMatchesEvent(event, context, target, options.paneId)) {
			return outcome(event, options, "not_delivered", "invalid_context", false, null);
		}
		payload = createThreadInjectItemsParams({ threadId: target.threadId, context });
	} catch {
		return outcome(event, options, "not_delivered", "invalid_context", false, null);
	}

	// This is deliberately the last asynchronous authority read. The synchronous
	// guard and the one inject_items call follow it without another await.
	let classification: ThreadLinkClassification;
	try {
		classification = await options.threadLink.classify(target);
	} catch (error) {
		const classificationReason =
			error instanceof CodexThreadLinkError && error.code === "current_epoch_unavailable"
				? "unknown_provenance"
				: "thread_revalidation_failed";
		return outcome(event, options, "not_delivered", classificationReason, false, payload);
	}
	const classificationReason = targetLinkReason(classification.link, target);
	if (classificationReason !== null) {
		return outcome(event, options, "not_delivered", classificationReason, false, payload);
	}
	if (classification.proof === null) {
		return outcome(event, options, "not_delivered", "unknown_provenance", false, payload);
	}

	let sessionPayload: SessionParams<"thread/inject_items">;
	try {
		sessionPayload = {
			...payload,
			threadId: options.identity.decoder.parseThreadId(payload.threadId),
		};
	} catch {
		return outcome(event, options, "not_delivered", "unknown_provenance", false, payload);
	}

	const state: DeliveryState = {
		event,
		id: eventId(event),
		initialBinding,
		payload,
	};
	const finalGuardReason = finalReason(state, options, classification, highestReservedSequence);
	if (finalGuardReason !== null) {
		return outcome(event, options, "not_delivered", finalGuardReason, false, payload);
	}

	try {
		const response = options.session.threadInjectItems(sessionPayload);
		try {
			await response;
		} catch (error) {
			if (isKnownNotDelivered(error)) {
				return outcome(event, options, "not_delivered", "session_rejected", true, payload);
			}
			return outcome(event, options, "outcome_unknown", "response_lost", true, payload);
		}
	} catch (error) {
		if (isKnownUnknown(error)) {
			return outcome(event, options, "outcome_unknown", "response_lost", true, payload);
		}
		return outcome(event, options, "not_delivered", "session_rejected", true, payload);
	}

	let afterReason: CodexThreadContextDeliveryReason | null;
	try {
		afterReason = afterAttemptReason(state, options);
	} catch {
		return outcome(event, options, "outcome_unknown", "response_lost", true, payload);
	}
	if (afterReason !== null) {
		return outcome(event, options, "outcome_unknown", afterReason, true, payload);
	}
	return outcome(event, options, "delivered", null, true, payload);
}

export function createCodexThreadContextDelivery(
	options: CodexThreadContextDeliveryOptions,
): CodexThreadContextDelivery {
	const pending = new Map<string, Promise<CodexThreadContextDeliveryOutcome>>();
	const settled = new Map<string, CodexThreadContextDeliveryOutcome>();
	const firstSeenKeys: string[] = [];
	let highestReservedSequence = -1;
	let disposed = false;

	const deliver = (
		event: SettledSemanticChangeEvent,
	): Promise<CodexThreadContextDeliveryOutcome> => {
		const id = eventId(event);
		const key = keyFor(id);
		const existing = pending.get(key);
		if (existing !== undefined) return existing;
		const settledOutcome = settled.get(key);
		if (settledOutcome !== undefined) return Promise.resolve(settledOutcome);

		firstSeenKeys.push(key);
		const previousSequence = highestReservedSequence;
		const sequence = event.cursor?.sequence ?? -1;
		if (event.feedId === options.feedId && sequence > highestReservedSequence) {
			highestReservedSequence = sequence;
		}

		const promise = (
			disposed
				? Promise.resolve(outcome(event, options, "not_delivered", "disposed", false, null))
				: deliverOne(event, options, previousSequence, () => highestReservedSequence)
		)
			.catch(() =>
				outcome(event, options, "not_delivered", "thread_revalidation_failed", false, null),
			)
			.then((result) => {
				pending.delete(key);
				settled.set(key, result);
				return result;
			});
		pending.set(key, promise);
		return promise;
	};

	const unsubscribe = options.publisher.subscribeSettledChange((event) => {
		void deliver(event);
	});

	return Object.freeze({
		deliver,
		inspect: () =>
			Object.freeze(
				firstSeenKeys.flatMap((key) => {
					const result = settled.get(key);
					return result === undefined ? [] : [result];
				}),
			),
		get: (event: CodexThreadContextEventId) => settled.get(keyFor(event)),
		dispose: () => {
			if (disposed) return;
			disposed = true;
			unsubscribe();
		},
	});
}
