import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import {
	ATTENTION_FLAGS,
	threadIdWire,
	turnIdFromRaw,
	turnIdWire,
	userMessageClientIds,
	sameBinding,
	type RawNotification,
	type WorkhorseRuntime,
} from "./internal.js";

type ProgressNotification = Extract<
	RawNotification,
	{
		readonly method:
			| "item/agentMessage/delta"
			| "item/plan/delta"
			| "item/mcpToolCall/progress"
			| "process/outputDelta"
			| "command/exec/outputDelta";
	}
>;

function progressDetail(notification: ProgressNotification): string {
	if ("delta" in notification.params && typeof notification.params.delta === "string")
		return notification.params.delta;
	if ("message" in notification.params && typeof notification.params.message === "string")
		return notification.params.message;
	return "workhorse progress";
}

function notificationThreadId(notification: RawNotification): string | null {
	if (!("threadId" in notification.params) || typeof notification.params.threadId !== "string")
		return null;
	return notification.params.threadId;
}

export function createNotificationHandler(
	runtime: WorkhorseRuntime,
): (event: TransportServerNotification) => void {
	return (event) => {
		if (
			!runtime.options.identity.validator.isCurrentEpoch(
				event.correlation.child,
				event.correlation.epoch,
			)
		)
			return;
		const notification = event.notification;
		if (notification.method === "thread/queue/changed") {
			const currentBinding = runtime.options.currentBinding();
			if (
				currentBinding === null ||
				notification.params.threadId !==
					threadIdWire(runtime.options, currentBinding.workhorse.threadId)
			)
				return;
			runtime.scheduleQueueReconciliation();
			return;
		}
		const threadId = notificationThreadId(notification);
		if (threadId === null) return;
		const currentBinding = runtime.options.currentBinding();
		if (currentBinding === null) return;
		const states = [...runtime.operations.values()].filter(
			(state) =>
				threadId === threadIdWire(runtime.options, state.workhorseThreadId) &&
				sameBinding(currentBinding, state.binding) &&
				!state.terminalEmitted,
		);
		if (states.length === 0) return;

		if (notification.method === "turn/started" || notification.method === "turn/completed") {
			const turn = notification.params.turn;
			const rawTurnId = turn.id;
			const clientIds = userMessageClientIds(turn);
			for (const state of states) {
				if (notification.method === "turn/started" && state.rpc !== "turn/start") continue;
				const matchesClient =
					state.clientUserMessageId !== null && clientIds.includes(state.clientUserMessageId);
				const matchesTurn =
					state.turnId !== null && turnIdWire(runtime.options, state.turnId) === rawTurnId;
				if (!matchesClient && !matchesTurn) continue;
				if (state.turnId !== null && !matchesTurn) continue;
				const priorOutcome = state.outcome;
				state.turnId = turnIdFromRaw(runtime.options, rawTurnId);
				runtime.activeTurns.set(threadId, state.turnId);
				if (state.outcome === "pending" || state.outcome === "outcome_unknown") {
					const outcome = runtime.settleDurable(
						state,
						"delivered",
						"The workhorse turn was later observed with exact correlation.",
					);
					if (outcome === "outcome_unknown" && priorOutcome !== "outcome_unknown")
						runtime.emit(
							state,
							"outcome_unknown",
							outcome,
							[],
							"The correlated workhorse turn could not be durably confirmed.",
						);
					if (outcome === "delivered" && !state.startedEmitted && !state.terminalEmitted) {
						state.startedEmitted = true;
						runtime.emit(state, "started", "delivered", []);
					}
				}
				if (notification.method === "turn/completed") {
					if (turn.status === "failed" || turn.status === "interrupted")
						runtime.terminal(state, "failed", [], "The correlated workhorse turn failed.");
					else runtime.terminal(state, "completed", [], null);
				}
			}
			return;
		}

		if (
			notification.method === "item/agentMessage/delta" ||
			notification.method === "item/plan/delta" ||
			notification.method === "item/mcpToolCall/progress" ||
			notification.method === "process/outputDelta" ||
			notification.method === "command/exec/outputDelta"
		) {
			const rawTurnId = notification.params.turnId;
			for (const state of states) {
				if (state.turnId === null || turnIdWire(runtime.options, state.turnId) !== rawTurnId)
					continue;
				const priorOutcome = state.outcome;
				if (state.outcome === "pending" || state.outcome === "outcome_unknown") {
					const outcome = runtime.settleDurable(
						state,
						"delivered",
						"The workhorse turn later emitted exact correlated progress.",
					);
					if (outcome === "outcome_unknown" && priorOutcome !== "outcome_unknown")
						runtime.emit(
							state,
							"outcome_unknown",
							outcome,
							[],
							"The correlated workhorse progress could not be durably confirmed.",
						);
					if (outcome !== "delivered") continue;
					if (!state.startedEmitted && !state.terminalEmitted) {
						state.startedEmitted = true;
						runtime.emit(state, "started", "delivered", []);
					}
				}
				runtime.emit(state, "progress", "delivered", [], progressDetail(notification));
			}
			return;
		}

		if (
			notification.method === "thread/status/changed" &&
			notification.params.status.type === "active"
		) {
			if (!notification.params.status.activeFlags.some((flag) => ATTENTION_FLAGS.has(flag))) return;
			for (const state of states) {
				if (state.outcome !== "delivered") continue;
				runtime.emit(
					state,
					"attention",
					"delivered",
					[],
					"The workhorse is waiting for attention.",
				);
			}
		}
	};
}
