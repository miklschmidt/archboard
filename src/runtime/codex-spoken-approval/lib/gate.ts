import type {
	RealtimeCorrelation,
	RealtimeSemanticEvent,
	RealtimeTranscriptRecord,
} from "@/shared/codex-realtime-host";
import { IdentityValidationError, type TurnId } from "@/shared/codex-workbench-identity";
import type { DynamicServerRequest, TransportServerNotification } from "@/runtime/codex-transport";
import type {
	CodexSpokenApprovalGate,
	CodexSpokenApprovalGateOptions,
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "@/runtime/codex-spoken-approval/lib/contract";
import { CodexSpokenApprovalError } from "@/runtime/codex-spoken-approval/lib/contract";

/** The child and epoch an exit notification names. */
interface ChildExit {
	readonly child: ActiveSlot["child"];
	readonly epoch: ActiveSlot["epoch"];
}
import {
	EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
	type ActiveSlot,
} from "@/runtime/codex-spoken-approval/lib/state";
import {
	sameRealtime,
	validateArm,
	validSequence,
	type CoordinatorIdentity,
} from "@/runtime/codex-spoken-approval/lib/validation";
import {
	resolveSpokenApproval,
	startClassifier,
	type ClassifierTurnHost,
} from "@/runtime/codex-spoken-approval/lib/classifier-turn";
import {
	answerRefusal,
	armedSlot,
	clearTimer,
	finalUserFields,
	isBaselineRecord,
	isForeignTurn,
	isWatchedTurnNotification,
	sessionEventRefusal,
	refusal,
	rejectTurnReady,
} from "@/runtime/codex-spoken-approval/lib/gate-state";

/**
 * Build the spoken approval gate: the module that lets a person answer one command-execution
 * approval aloud. It arms on an effect the assistant has just read out, watches the voice
 * transcript for the person's answer, asks the coordinator to classify it, and settles the
 * approval from the classifier's resolver call. Anything it cannot prove sends the person to the
 * visual approval surface instead, which is why every refusal carries a fallback reason.
 * @param options - The approval broker, realtime host, session, identity authority and callbacks.
 * @returns The gate.
 */
export function createCodexSpokenApprovalGate(
	options: CodexSpokenApprovalGateOptions,
): CodexSpokenApprovalGate {
	const now = options.now ?? Date.now;
	let currentSnapshot = EMPTY_SPOKEN_APPROVAL_SNAPSHOT;
	let active: ActiveSlot | null = null;
	let disposed = false;

	/**
	 * Hand the current snapshot to whoever is presenting the gate. A presenter that throws is ignored: it cannot change the gate's own fail-closed state.
	 * @param snapshot - The snapshot to publish.
	 */
	const notify = (snapshot: SpokenApprovalSnapshot): void => {
		try {
			options.onChange?.(snapshot);
		} catch {
			/* Presentation cannot change the gate's fail-closed state. */
		}
	};

	/**
	 * Tell the host the person must answer visually instead. The snapshot remains the authoritative signal, so a callback that throws changes nothing.
	 * @param reason - Why voice cannot settle this approval.
	 * @param snapshot - The snapshot at the moment of the fallback.
	 */
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

	/**
	 * Publish the gate's current state as an immutable snapshot: what is pending, what the person was read, what they said, and how it settled.
	 * @param slot - The armed gate.
	 * @returns The published snapshot.
	 */
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
			...finalUserFields(slot),
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

	/**
	 * Fall back before a gate was ever armed, which is what an arm that fails validation produces.
	 * @param reason - Why the gate could not be armed.
	 * @param requestId - The approval the arm was for, when it is known.
	 * @returns The published snapshot.
	 */
	const fallbackWithoutSlot = (
		reason: SpokenApprovalFallbackReason,
		requestId: SpokenApprovalSnapshot["requestId"] = null,
	): SpokenApprovalSnapshot => {
		currentSnapshot = Object.freeze({
			...EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
			state: "visual_fallback",
			requestId,
			reason,
		});
		notify(currentSnapshot);
		notifyFallback(reason, currentSnapshot);
		return currentSnapshot;
	};

	/**
	 * Give up on answering this approval aloud. The gate stops watching, any waiting resolver call is failed, and the person is sent to the visual surface. A gate that has already settled or fallen back stays as it is.
	 * @param slot - The armed gate.
	 * @param reason - Why voice can no longer settle it.
	 */
	const enterFallback = (slot: ActiveSlot, reason: SpokenApprovalFallbackReason): void => {
		if (slot.phase === "settled" || slot.phase === "visual_fallback") {
			return;
		}
		slot.phase = "visual_fallback";
		slot.reason = reason;
		clearTimer(slot);
		rejectTurnReady(slot, new Error(`Spoken approval fell back to visual review: ${reason}.`));
		const snapshot = publish(slot);
		notifyFallback(reason, snapshot);
	};

	/**
	 * The clock, defensively: an unusable time is reported as none rather than allowed to make expiry arithmetic meaningless.
	 * @returns The current time, or null.
	 */
	const currentTime = (): number | null => {
		try {
			const value = now();
			return Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	};

	/**
	 * The host's current voice correlation, or null when it cannot be read.
	 * @returns The correlation, or null.
	 */
	const currentRealtime = (): RealtimeCorrelation | null => {
		try {
			return options.currentRealtime();
		} catch {
			return null;
		}
	};

	/**
	 * The host's current coordinator identity, or null when there is none or it cannot be read.
	 * @returns The coordinator, or null.
	 */
	const currentCoordinator = (): CoordinatorIdentity | null => {
		try {
			const snapshot = options.coordinator.snapshot();
			if (
				snapshot.state !== "ready" ||
				snapshot.childId === null ||
				snapshot.epoch === null ||
				snapshot.threadId === null
			) {
				return null;
			}
			return {
				child: snapshot.childId,
				epoch: snapshot.epoch,
				threadId: snapshot.threadId,
			};
		} catch {
			return null;
		}
	};

	/**
	 * Whether a gate is still the active one and still able to be answered aloud.
	 * @param slot - The gate to check, or null.
	 * @returns True when the gate is live.
	 */
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
		/**
		 * The voice transcript, read through the host so the gate always validates against what the
		 * session says now rather than a copy taken earlier.
		 * @returns The transcript records.
		 */
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

	/**
	 * Refuse to arm a gate this module cannot own: it has been disposed, or a spoken approval is
	 * still pending. Only one approval is ever spoken at a time, so a second one goes to the
	 * visual surface rather than competing for the person's voice.
	 * @throws {CodexSpokenApprovalError} When the gate is disposed or already armed.
	 */
	const assertArmable = (): void => {
		if (disposed) {
			throw new CodexSpokenApprovalError(
				"disposed",
				"The spoken approval gate has been disposed and cannot be armed.",
			);
		}
		if (active !== null && active.phase !== "settled" && active.phase !== "visual_fallback") {
			throw new CodexSpokenApprovalError(
				"busy",
				"Only one spoken approval may be pending at a time; use the visual approval surface for the second request.",
			);
		}
	};

	/**
	 * Arm the gate on one approval the assistant has just read aloud, capturing everything the gate
	 * will later re-check and starting the timer that gives up at its expiry. An arm that cannot be
	 * validated publishes a visual fallback instead.
	 * @param input - The arm request.
	 * @returns The published snapshot.
	 */
	const arm = (input: SpokenApprovalArmInput): SpokenApprovalSnapshot => {
		assertArmable();
		active = null;
		currentSnapshot = EMPTY_SPOKEN_APPROVAL_SNAPSHOT;
		const result = validateArm(validationHost, input);
		if (!result.ok) {
			return fallbackWithoutSlot(result.reason, input.requestId);
		}
		const slot = armedSlot(input, result);
		active = slot;
		const snapshot = publish(slot);
		if (!isLive(slot)) {
			return currentSnapshot;
		}
		armExpiryTimer(slot);
		return snapshot;
	};

	/**
	 * Start the timer that gives up on the spoken gate at its expiry. The timer is unreferenced so
	 * a pending spoken approval never keeps the process alive on its own.
	 * @param slot - The armed gate.
	 */
	const armExpiryTimer = (slot: ActiveSlot): void => {
		const delay = Math.max(0, slot.expiresAtMs - (currentTime() ?? slot.expiresAtMs));
		slot.timer = setTimeout(() => {
			if (isLive(slot)) {
				enterFallback(slot, "timeout");
			}
		}, delay);
		if (typeof slot.timer.unref === "function") {
			slot.timer.unref();
		}
	};

	/**
	 * Take one event from the voice session: a transcript record while the gate waits for the
	 * person, or a session event that says the session can no longer carry an answer.
	 * @param event - The realtime semantic event.
	 */
	const onSemanticEvent = (event: RealtimeSemanticEvent): void => {
		const slot = active;
		if (!isLive(slot)) {
			return;
		}
		if (event.kind === "transcript") {
			if (sameRealtime(event.record, slot.realtime)) {
				onTranscriptRecord(slot, event.record);
			} else {
				enterFallback(slot, "stale_realtime_session");
			}
			return;
		}
		const reason = sessionEventRefusal(slot, event);
		if (reason !== null) {
			enterFallback(slot, reason);
		}
	};

	/**
	 * Take one transcript record from this gate's own voice session while it waits for the person
	 * to answer. The person's first final utterance after the effect prompt is what the classifier
	 * is asked about; the assistant speaking again means they were asked something else, and an
	 * empty final utterance means there is nothing to classify.
	 * @param slot - The armed gate.
	 * @param record - The transcript record.
	 */
	const onTranscriptRecord = (slot: ActiveSlot, record: RealtimeTranscriptRecord): void => {
		if (slot.phase !== "awaiting_user") {
			return;
		}
		if (!validSequence(record.sequence)) {
			enterFallback(slot, "stale_state");
			return;
		}
		if (isBaselineRecord(slot, record)) {
			return;
		}
		const reason = answerRefusal(record);
		if (reason !== null) {
			enterFallback(slot, reason);
			return;
		}
		if (record.status === "final") {
			startClassifier(classifierHost, slot, record);
		}
	};

	/**
	 * Take one turn notification on the coordinator thread. The gate is watching for exactly one
	 * turn: the classifier's. A turn that is not this gate's own, or a classifier turn that ends
	 * without a resolver call, means the classifier is gone and the person must answer visually.
	 * @param event - The transport notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		const slot = active;
		const notification = event.notification;
		if (!isLive(slot) || !isWatchedTurnNotification(slot, notification)) {
			return;
		}
		const turnId = notifiedTurnId(slot, event.correlation, notification.params.turn.id);
		if (turnId === null) {
			return;
		}
		if (notification.method === "turn/started") {
			onTurnStarted(slot, turnId);
			return;
		}
		onTurnCompleted(slot, turnId);
	};

	/**
	 * The turn a notification names, once it is proven to belong to this gate's own child and
	 * epoch. A notification that cannot be trusted falls the gate back rather than being ignored:
	 * the gate is waiting on a turn, so an unreadable notification leaves it waiting forever.
	 * @param slot - The armed gate.
	 * @param correlation - The notification's child and epoch correlation.
	 * @param rawTurnId - The turn identity the notification carried, undecoded.
	 * @returns The turn identity, or null when the gate has fallen back instead.
	 */
	const notifiedTurnId = (
		slot: ActiveSlot,
		correlation: TransportServerNotification["correlation"],
		rawTurnId: unknown,
	): TurnId | null => {
		if (correlation.child !== slot.child || correlation.epoch !== slot.epoch) {
			enterFallback(slot, "stale_state");
			return null;
		}
		try {
			options.identity.validator.assertCurrentEpoch(correlation.child, correlation.epoch);
		} catch {
			enterFallback(slot, "stale_state");
			return null;
		}
		try {
			return options.identity.decoder.parseTurnId(rawTurnId);
		} catch (error) {
			enterFallback(
				slot,
				error instanceof IdentityValidationError ? "stale_state" : "classifier_lost",
			);
			return null;
		}
	};

	/**
	 * Adopt the turn the classifier started. Before the classifier runs, a turn on the coordinator
	 * thread that is not the classifier's is somebody else's work and the gate gives up on voice;
	 * afterwards, a second, different turn means the classifier turn was replaced.
	 * @param slot - The armed gate.
	 * @param turnId - The turn that started.
	 */
	const onTurnStarted = (slot: ActiveSlot, turnId: TurnId): void => {
		if (slot.phase === "awaiting_user" || slot.phase === "awaiting_resolver") {
			if (slot.classifierTurnId !== turnId) {
				enterFallback(slot, "stale_state");
			}
			return;
		}
		if (isForeignTurn(slot, turnId)) {
			enterFallback(slot, "classifier_lost");
			return;
		}
		slot.startedTurnId = turnId;
	};

	/**
	 * Record that the classifier's turn ended. A classifier that finishes without having called
	 * the resolver has not answered, so the gate falls back rather than waiting for a call that
	 * will never come.
	 * @param slot - The armed gate.
	 * @param turnId - The turn that completed.
	 */
	const onTurnCompleted = (slot: ActiveSlot, turnId: TurnId): void => {
		if (isForeignTurn(slot, turnId)) {
			enterFallback(slot, "classifier_lost");
			return;
		}
		if (slot.phase === "classifying") {
			slot.startedTurnId ??= turnId;
			slot.turnCompleted = true;
			if (slot.pendingResolverRequest === null) {
				enterFallback(slot, "classifier_lost");
			}
			return;
		}
		if (slot.phase === "awaiting_resolver") {
			enterFallback(slot, "classifier_lost");
		}
	};

	/**
	 * Resolve the pending spoken approval from a coordinator voice call.
	 * @param request - The resolver call.
	 * @returns The tool result.
	 */
	const resolve = (request: DynamicServerRequest): Promise<SpokenApprovalToolResult> => {
		const slot = active;
		if (!isLive(slot)) {
			return Promise.resolve(
				refusal("not_ready", "There is no pending spoken approval to resolve."),
			);
		}
		return resolveSpokenApproval(classifierHost, slot, request);
	};

	/**
	 * Give up on voice when the Codex child the gate belongs to exits: whatever the person says now
	 * cannot be classified by a coordinator that is gone.
	 * @param exit - The exited child and epoch.
	 */
	const onChildExit = (exit: ChildExit): void => {
		const slot = active;
		if (!isLive(slot)) {
			return;
		}
		if (exit.child === slot.child && exit.epoch === slot.epoch) {
			enterFallback(slot, "child_exit");
		}
	};

	const unsubscribe = options.realtime.onSemanticEvent(onSemanticEvent);
	return Object.freeze({
		arm,
		/**
		 * The gate's current snapshot.
		 * @returns The snapshot.
		 */
		snapshot: () => currentSnapshot,
		onSemanticEvent,
		onNotification,
		resolve,
		onChildExit,
		/**
		 * Stop for good: unsubscribe from the voice session and fall any armed gate back to the visual surface, so a pending approval is never left waiting on a disposed gate.
		 */
		dispose: () => {
			if (disposed) {
				return;
			}
			if (active !== null && isLive(active)) {
				enterFallback(active, "disposed");
			}
			disposed = true;
			unsubscribe();
		},
	});
}

export { CodexSpokenApprovalError } from "@/runtime/codex-spoken-approval/lib/contract";
