import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import {
	ATTENTION_FLAGS,
	threadIdWire,
	turnIdFromRaw,
	turnIdWire,
	userMessageClientIds,
	sameBinding,
	type OperationState,
	type RawNotification,
	type TurnNotification,
	type WorkhorseRuntime,
} from "@/runtime/codex-workhorse-operations/lib/internal";

type ProgressMethod =
	| "item/agentMessage/delta"
	| "item/plan/delta"
	| "item/mcpToolCall/progress"
	| "process/outputDelta"
	| "command/exec/outputDelta";
const PROGRESS_METHODS: ReadonlySet<string> = new Set<ProgressMethod>([
	"item/agentMessage/delta",
	"item/plan/delta",
	"item/mcpToolCall/progress",
	"process/outputDelta",
	"command/exec/outputDelta",
]);
type ProgressNotification = Extract<RawNotification, { readonly method: ProgressMethod }>;
type QueueChangedNotification = Extract<
	RawNotification,
	{ readonly method: "thread/queue/changed" }
>;
type StatusChangedNotification = Extract<
	RawNotification,
	{ readonly method: "thread/status/changed" }
>;

/**
 * Recognise a turn lifecycle notification.
 * @param notification - The raw notification.
 * @returns Whether it reports a turn starting or completing.
 */
function isTurnLifecycle(notification: RawNotification): notification is TurnNotification {
	return notification.method === "turn/started" || notification.method === "turn/completed";
}

/**
 * Recognise a notification that carries incremental workhorse progress.
 * @param notification - The raw notification.
 * @returns Whether it is one of the progress delta methods.
 */
function isProgress(notification: RawNotification): notification is ProgressNotification {
	return PROGRESS_METHODS.has(notification.method);
}

/**
 * Recognise a thread status change.
 * @param notification - The raw notification.
 * @returns Whether it reports a thread status change.
 */
function isStatusChanged(notification: RawNotification): notification is StatusChangedNotification {
	return notification.method === "thread/status/changed";
}

/**
 * Pick the human-readable text from a progress notification for the event detail.
 * @param notification - The progress notification.
 * @returns The delta or message text, or a generic label when neither is present.
 */
function progressDetail(notification: ProgressNotification): string {
	if ("delta" in notification.params && typeof notification.params.delta === "string") {
		return notification.params.delta;
	}
	if ("message" in notification.params && typeof notification.params.message === "string") {
		return notification.params.message;
	}
	return "workhorse progress";
}

/**
 * Read the thread a notification concerns.
 * @param notification - The raw notification.
 * @returns The wire thread identity, or null when the notification names no thread.
 */
function notificationThreadId(notification: RawNotification): string | null {
	if (!("threadId" in notification.params) || typeof notification.params.threadId !== "string") {
		return null;
	}
	return notification.params.threadId;
}

/**
 * Read the state's outcome through a call so a mutation by `correlateTurn` is visible to the
 * caller's control flow.
 * @param state - The operation state.
 * @returns Whether the outcome is delivered.
 */
function hasDeliveredOutcome(state: OperationState): boolean {
	return state.outcome === "delivered";
}

/**
 * Decide whether a lifecycle notification's turn belongs to an operation: by its known turn,
 * or by the client identity of its user message when no turn is known yet.
 * @param runtime - The operations runtime.
 * @param state - The operation state.
 * @param rawTurnId - The wire turn identity from the notification.
 * @param clientIds - The client identities of the turn's user messages.
 * @returns Whether the turn is this operation's.
 */
function matchesLifecycleTurn(
	runtime: WorkhorseRuntime,
	state: OperationState,
	rawTurnId: string,
	clientIds: readonly string[],
): boolean {
	if (state.turnId !== null) {
		return turnIdWire(runtime.options, state.turnId) === rawTurnId;
	}
	return state.clientUserMessageId !== null && clientIds.includes(state.clientUserMessageId);
}

/**
 * Emit the terminal event for a completed turn according to how it ended.
 * @param runtime - The operations runtime.
 * @param state - The operation state.
 * @param status - The turn's final status.
 */
function finishTurn(
	runtime: WorkhorseRuntime,
	state: OperationState,
	status: TurnNotification["params"]["turn"]["status"],
): void {
	if (status === "failed" || status === "interrupted") {
		runtime.terminal(state, "failed", [], "The correlated workhorse turn failed.");
		return;
	}
	runtime.terminal(state, "completed", [], null);
}

/**
 * Correlate turn starts and completions with the operations that produced them.
 * @param runtime - The operations runtime.
 * @param notification - The lifecycle notification.
 * @param states - The live operations on the notification's thread.
 */
function handleTurnLifecycle(
	runtime: WorkhorseRuntime,
	notification: TurnNotification,
	states: readonly OperationState[],
): void {
	const turn = notification.params.turn;
	const clientIds = userMessageClientIds(turn);
	for (const state of states) {
		if (!matchesLifecycleTurn(runtime, state, turn.id, clientIds)) {
			continue;
		}
		runtime.correlateTurn(state, turnIdFromRaw(runtime.options, turn.id));
		if (notification.method === "turn/completed") {
			finishTurn(runtime, state, turn.status);
		}
	}
}

/**
 * Publish progress for operations whose turn produced it; progress on a still-unsettled
 * operation first confirms the turn, and is only published once delivery is settled.
 * @param runtime - The operations runtime.
 * @param notification - The progress notification.
 * @param states - The live operations on the notification's thread.
 */
function handleProgress(
	runtime: WorkhorseRuntime,
	notification: ProgressNotification,
	states: readonly OperationState[],
): void {
	const rawTurnId = notification.params.turnId;
	for (const state of states) {
		if (state.turnId === null || turnIdWire(runtime.options, state.turnId) !== rawTurnId) {
			continue;
		}
		if (state.outcome === "pending" || state.outcome === "outcome_unknown") {
			runtime.correlateTurn(state, state.turnId);
			if (!hasDeliveredOutcome(state)) {
				continue;
			}
		}
		runtime.emit(state, "progress", "delivered", [], progressDetail(notification));
	}
}

/**
 * Publish `attention` when the workhorse waits on approval or user input.
 * @param runtime - The operations runtime.
 * @param notification - The status change notification.
 * @param states - The live operations on the notification's thread.
 */
function handleStatusChanged(
	runtime: WorkhorseRuntime,
	notification: StatusChangedNotification,
	states: readonly OperationState[],
): void {
	const status = notification.params.status;
	if (status.type !== "active" || !status.activeFlags.some((flag) => ATTENTION_FLAGS.has(flag))) {
		return;
	}
	for (const state of states) {
		if (state.outcome === "delivered") {
			runtime.emit(state, "attention", "delivered", [], "The workhorse is waiting for attention.");
		}
	}
}

/**
 * Schedule a queue reconciliation when the current workhorse's queue changed.
 * @param runtime - The operations runtime.
 * @param notification - The queue change notification.
 */
function handleQueueChanged(
	runtime: WorkhorseRuntime,
	notification: QueueChangedNotification,
): void {
	const currentBinding = runtime.options.currentBinding();
	if (
		currentBinding === null ||
		notification.params.threadId !==
			threadIdWire(runtime.options, currentBinding.workhorse.threadId)
	) {
		return;
	}
	runtime.scheduleQueueReconciliation();
}

/**
 * Select the live operations whose workhorse thread and binding the notification concerns.
 * @param runtime - The operations runtime.
 * @param notification - The raw notification.
 * @returns The matching operations, empty when the notification concerns no live operation.
 */
function statesForNotification(
	runtime: WorkhorseRuntime,
	notification: RawNotification,
): readonly OperationState[] {
	const threadId = notificationThreadId(notification);
	const currentBinding = runtime.options.currentBinding();
	if (threadId === null || currentBinding === null) {
		return [];
	}
	return [...runtime.operations.values()].filter(
		(state) =>
			threadId === threadIdWire(runtime.options, state.workhorseThreadId) &&
			sameBinding(currentBinding, state.binding) &&
			!state.terminalEmitted,
	);
}

/**
 * Route a thread-scoped notification to the handler for its method.
 * @param runtime - The operations runtime.
 * @param notification - The raw notification.
 * @param states - The live operations on the notification's thread.
 */
function dispatch(
	runtime: WorkhorseRuntime,
	notification: RawNotification,
	states: readonly OperationState[],
): void {
	if (isTurnLifecycle(notification)) {
		handleTurnLifecycle(runtime, notification, states);
	} else if (isProgress(notification)) {
		handleProgress(runtime, notification, states);
	} else if (isStatusChanged(notification)) {
		handleStatusChanged(runtime, notification, states);
	}
}

/**
 * Create the raw notification boundary. Notifications from a prior epoch are dropped, queue
 * changes schedule a reconciliation, and everything else is correlated to live operations.
 * @param runtime - The operations runtime.
 * @returns The notification handler.
 */
export function createNotificationHandler(
	runtime: WorkhorseRuntime,
): (event: TransportServerNotification) => void {
	return (event) => {
		const { child, epoch } = event.correlation;
		if (!runtime.options.identity.validator.isCurrentEpoch(child, epoch)) {
			return;
		}
		const notification = event.notification;
		if (notification.method === "thread/queue/changed") {
			handleQueueChanged(runtime, notification);
			return;
		}
		const states = statesForNotification(runtime, notification);
		if (states.length > 0) {
			dispatch(runtime, notification, states);
		}
	};
}
