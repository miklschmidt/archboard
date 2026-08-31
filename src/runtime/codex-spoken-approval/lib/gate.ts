import type {
	RealtimeCorrelation,
	RealtimeSemanticEvent,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import {
	IdentityValidationError,
	type TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicServerRequest,
	TransportServerNotification,
} from "../../codex-transport/index.js";
import type {
	CodexSpokenApprovalGate,
	CodexSpokenApprovalGateOptions,
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "./contract.js";
import { CodexSpokenApprovalError } from "./contract.js";
import { EMPTY_SNAPSHOT, type ActiveSlot } from "./state.js";
import {
	recordKey,
	sameRealtime,
	validateArm,
	validSequence,
	type CoordinatorIdentity,
} from "./validation.js";
import {
	resolveSpokenApproval,
	startClassifier,
	type ClassifierTurnHost,
} from "./classifier-turn.js";

function clearTimer(slot: ActiveSlot): void {
	if (slot.timer === null) return;
	clearTimeout(slot.timer);
	slot.timer = null;
}

function rejectTurnReady(slot: ActiveSlot, error: unknown): void {
	const ready = slot.turnReady;
	if (ready === null || ready.settled) return;
	ready.settled = true;
	ready.reject(error);
}

function refusal(reason: "not_ready", message: string): SpokenApprovalToolResult {
	return Object.freeze({ tag: "refused", reason, message });
}

export function createCodexSpokenApprovalGate(
	options: CodexSpokenApprovalGateOptions,
): CodexSpokenApprovalGate {
	const now = options.now ?? Date.now;
	let currentSnapshot = EMPTY_SNAPSHOT;
	let active: ActiveSlot | null = null;
	let disposed = false;

	const notify = (snapshot: SpokenApprovalSnapshot): void => {
		try {
			options.onChange?.(snapshot);
		} catch {
			/* Presentation cannot change the gate's fail-closed state. */
		}
	};

	const notifyFallback = (
		reason: SpokenApprovalFallbackReason,
		snapshot: SpokenApprovalSnapshot,
	): void => {
		try {
			options.onVisualFallback?.(reason, snapshot);
		} catch {
			/* The snapshot remains the authoritative fallback signal. */
		}
	};

	const publish = (slot: ActiveSlot): SpokenApprovalSnapshot => {
		currentSnapshot = Object.freeze({
			state: slot.phase,
			requestId: slot.requestId,
			approvalId: slot.approvalId,
			child: slot.child,
			epoch: slot.epoch,
			coordinatorThreadId: slot.coordinatorThreadId,
			realtimeSessionId: slot.realtime.sessionId,
			realtimeCorrelationId: slot.realtime.correlationId,
			effectSummary: slot.effectSummary,
			effectFingerprint: slot.approvalBinding.effect,
			effectPromptItemId: slot.effectPrompt.itemId,
			effectPromptSequence: slot.effectPrompt.sequence,
			finalUserItemId: slot.finalUser?.itemId ?? null,
			finalUserSequence: slot.finalUser?.sequence ?? null,
			finalUserText: slot.finalUser?.text ?? null,
			operationId: slot.classifier.operationId,
			classifierTurnId: slot.classifierTurnId,
			resolverCallId: slot.resolverCallId,
			expiresAtMs: slot.expiresAtMs,
			settlement: slot.settlement,
			reason: slot.reason,
		});
		notify(currentSnapshot);
		return currentSnapshot;
	};

	const fallbackWithoutSlot = (
		reason: SpokenApprovalFallbackReason,
		requestId: SpokenApprovalSnapshot["requestId"] = null,
	): SpokenApprovalSnapshot => {
		currentSnapshot = Object.freeze({
			...EMPTY_SNAPSHOT,
			state: "visual_fallback",
			requestId,
			reason,
		});
		notify(currentSnapshot);
		notifyFallback(reason, currentSnapshot);
		return currentSnapshot;
	};

	const enterFallback = (slot: ActiveSlot, reason: SpokenApprovalFallbackReason): void => {
		if (slot.phase === "settled" || slot.phase === "visual_fallback") return;
		slot.phase = "visual_fallback";
		slot.reason = reason;
		clearTimer(slot);
		rejectTurnReady(slot, new Error(`Spoken approval fell back to visual review: ${reason}.`));
		const snapshot = publish(slot);
		notifyFallback(reason, snapshot);
	};

	const currentTime = (): number | null => {
		try {
			const value = now();
			return Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	};

	const currentRealtime = (): RealtimeCorrelation | null => {
		try {
			return options.currentRealtime();
		} catch {
			return null;
		}
	};

	const currentCoordinator = (): CoordinatorIdentity | null => {
		try {
			const snapshot = options.coordinator.snapshot();
			if (
				snapshot.state !== "ready" ||
				snapshot.childId === null ||
				snapshot.epoch === null ||
				snapshot.threadId === null
			)
				return null;
			return {
				child: snapshot.childId,
				epoch: snapshot.epoch,
				threadId: snapshot.threadId,
			};
		} catch {
			return null;
		}
	};

	const isLive = (slot: ActiveSlot | null): slot is ActiveSlot =>
		slot !== null &&
		active === slot &&
		slot.phase !== "settled" &&
		slot.phase !== "visual_fallback" &&
		!disposed;

	const validationHost = {
		approvalBroker: options.approvalBroker,
		identity: options.identity,
		currentCoordinator,
		currentRealtime,
		currentTime,
		transcript: () => options.realtime.transcript(),
	};

	const classifierHost: ClassifierTurnHost = {
		approvalBroker: options.approvalBroker,
		session: options.session,
		identity: options.identity,
		currentCoordinator,
		currentRealtime,
		currentTime,
		isLive,
		publish,
		enterFallback,
	};

	const arm = (input: SpokenApprovalArmInput): SpokenApprovalSnapshot => {
		if (disposed)
			throw new CodexSpokenApprovalError(
				"disposed",
				"The spoken approval gate has been disposed and cannot be armed.",
			);
		if (active !== null && active.phase !== "settled" && active.phase !== "visual_fallback")
			throw new CodexSpokenApprovalError(
				"busy",
				"Only one spoken approval may be pending at a time; use the visual approval surface for the second request.",
			);
		active = null;
		currentSnapshot = EMPTY_SNAPSHOT;
		const result = validateArm(validationHost, input);
		if (!result.ok) return fallbackWithoutSlot(result.reason, input.requestId);
		const slot: ActiveSlot = {
			requestId: input.requestId,
			approvalId: result.approval.approvalId,
			approvalFamily: "command_execution",
			approvalBinding: result.approval.binding,
			approvalExpiresAtMs: result.approval.expiresAtMs,
			expiresAtMs: result.expiresAtMs,
			child: result.coordinator.child,
			epoch: result.coordinator.epoch,
			coordinatorThreadId: result.coordinator.threadId,
			realtime: result.realtime,
			effectSummary: result.effectSummary,
			effectPrompt: Object.freeze({ ...input.effectPrompt }),
			classifier: Object.freeze({
				operationId: result.operationId,
				clientUserMessageId: result.clientUserMessageId,
				context: result.context,
			}),
			baselineRecordKeys: result.baselineRecordKeys,
			phase: "awaiting_user",
			reason: null,
			finalUser: null,
			startedTurnId: null,
			classifierTurnId: null,
			resolverCallId: null,
			turnCompleted: false,
			turnReady: null,
			pendingResolverRequest: null,
			settlement: null,
			timer: null,
		};
		active = slot;
		const snapshot = publish(slot);
		if (!isLive(slot)) return currentSnapshot;
		const delay = Math.max(0, result.expiresAtMs - (currentTime() ?? result.expiresAtMs));
		slot.timer = setTimeout(() => {
			if (isLive(slot)) enterFallback(slot, "timeout");
		}, delay);
		if (typeof slot.timer.unref === "function") slot.timer.unref();
		return snapshot;
	};

	const onSemanticEvent = (event: RealtimeSemanticEvent): void => {
		const slot = active;
		if (!isLive(slot)) return;
		if (event.kind === "transcript") {
			const record: RealtimeTranscriptRecord = event.record;
			if (!sameRealtime(record, slot.realtime)) {
				enterFallback(slot, "stale_realtime_session");
				return;
			}
			if (slot.phase !== "awaiting_user") return;
			if (!validSequence(record.sequence)) {
				enterFallback(slot, "stale_state");
				return;
			}
			if (slot.baselineRecordKeys.has(recordKey(record))) return;
			if (record.sequence <= slot.effectPrompt.sequence) return;
			if (record.role === "assistant") {
				enterFallback(slot, "assistant_only");
				return;
			}
			if (record.status !== "final") return;
			if (record.text.length === 0) {
				enterFallback(slot, "missing_user_final");
				return;
			}
			startClassifier(classifierHost, slot, record);
			return;
		}
		if (
			event.sessionId !== slot.realtime.sessionId ||
			event.correlationId !== slot.realtime.correlationId
		) {
			enterFallback(slot, "stale_realtime_session");
			return;
		}
		if (event.kind === "diagnostic") {
			enterFallback(slot, "realtime_unavailable");
			return;
		}
		if (
			event.state.phase === "closed" ||
			event.state.phase === "recoverable_error" ||
			event.state.phase === "terminal_error" ||
			event.state.phase === "idle"
		)
			enterFallback(slot, "realtime_unavailable");
	};

	const onNotification = (event: TransportServerNotification): void => {
		const slot = active;
		if (!isLive(slot)) return;
		const notification = event.notification;
		if (notification.method !== "turn/started" && notification.method !== "turn/completed") return;
		if (notification.params.threadId !== slot.coordinatorThreadId) return;
		if (event.correlation.child !== slot.child || event.correlation.epoch !== slot.epoch) {
			enterFallback(slot, "stale_state");
			return;
		}
		try {
			options.identity.validator.assertCurrentEpoch(
				event.correlation.child,
				event.correlation.epoch,
			);
		} catch {
			enterFallback(slot, "stale_state");
			return;
		}
		let turnId: TurnId;
		try {
			turnId = options.identity.decoder.parseTurnId(notification.params.turn.id);
		} catch (error) {
			enterFallback(
				slot,
				error instanceof IdentityValidationError ? "stale_state" : "classifier_lost",
			);
			return;
		}
		if (notification.method === "turn/started") {
			if (slot.phase === "awaiting_user" || slot.phase === "awaiting_resolver") {
				if (slot.classifierTurnId !== turnId) enterFallback(slot, "stale_state");
				return;
			}
			if (slot.startedTurnId !== null && slot.startedTurnId !== turnId) {
				enterFallback(slot, "classifier_lost");
				return;
			}
			if (slot.classifierTurnId !== null && slot.classifierTurnId !== turnId) {
				enterFallback(slot, "classifier_lost");
				return;
			}
			slot.startedTurnId = turnId;
			return;
		}
		if (
			(slot.startedTurnId !== null && slot.startedTurnId !== turnId) ||
			(slot.classifierTurnId !== null && slot.classifierTurnId !== turnId)
		) {
			enterFallback(slot, "classifier_lost");
			return;
		}
		if (slot.phase === "classifying") {
			slot.startedTurnId ??= turnId;
			slot.turnCompleted = true;
			if (slot.pendingResolverRequest === null) enterFallback(slot, "classifier_lost");
			return;
		}
		if (slot.phase === "awaiting_resolver") enterFallback(slot, "classifier_lost");
	};

	const resolve = (request: DynamicServerRequest): Promise<SpokenApprovalToolResult> => {
		const slot = active;
		if (!isLive(slot))
			return Promise.resolve(
				refusal("not_ready", "There is no pending spoken approval to resolve."),
			);
		return resolveSpokenApproval(classifierHost, slot, request);
	};

	const onChildExit = (exit: {
		readonly child: ActiveSlot["child"];
		readonly epoch: ActiveSlot["epoch"];
	}): void => {
		const slot = active;
		if (!isLive(slot)) return;
		if (exit.child === slot.child && exit.epoch === slot.epoch) enterFallback(slot, "child_exit");
	};

	const unsubscribe = options.realtime.onSemanticEvent(onSemanticEvent);
	return Object.freeze({
		arm,
		snapshot: () => currentSnapshot,
		onSemanticEvent,
		onNotification,
		resolve,
		onChildExit,
		dispose: () => {
			if (disposed) return;
			if (active !== null && isLive(active)) enterFallback(active, "disposed");
			disposed = true;
			unsubscribe();
		},
	});
}

export { CodexSpokenApprovalError } from "./contract.js";
