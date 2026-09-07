import { canTransitionRealtimeState, type RealtimeState } from "@/shared/codex-realtime-host";

/**
 * The state steps a user input (text, speech or a final user transcript segment) implies from
 * the current phase: speaking is interrupted, listening or muted becomes processing.
 * @param current - The session's current state.
 * @returns The states to apply in order, empty when the phase ignores input.
 */
function inputStates(current: RealtimeState): readonly RealtimeState[] {
	if (current.phase === "speaking") {
		return [{ phase: "processing", reason: "user_interrupted" }];
	}
	if (current.phase === "listening" || current.phase === "muted") {
		return [{ phase: "processing", reason: "input_completed" }];
	}
	return [];
}

/**
 * The state steps a provisional assistant segment implies: the assistant has started speaking,
 * passing through processing when the session was still taking input.
 * @param current - The session's current state.
 * @returns The states to apply in order.
 */
function provisionalAssistantStates(current: RealtimeState): readonly RealtimeState[] {
	if (current.phase === "listening" || current.phase === "muted") {
		return [
			{ phase: "processing", reason: "input_completed" },
			{ phase: "speaking", reason: "assistant_started" },
		];
	}
	if (current.phase === "processing") {
		return [{ phase: "speaking", reason: "assistant_started" }];
	}
	return [];
}

/**
 * The state steps a final assistant segment implies: the assistant is done and the session is
 * listening again.
 * @param current - The session's current state.
 * @returns The states to apply in order.
 */
function finalAssistantStates(current: RealtimeState): readonly RealtimeState[] {
	if (current.phase === "speaking") {
		return [{ phase: "listening", reason: "assistant_finished" }];
	}
	if (current.phase === "processing") {
		return [{ phase: "listening", reason: "processing_complete" }];
	}
	return [];
}

/**
 * The state steps an assistant transcript segment implies given its status.
 * @param current - The session's current state.
 * @param status - Whether the segment is still being produced or is complete.
 * @returns The states to apply in order.
 */
function assistantStates(
	current: RealtimeState,
	status: "provisional" | "final",
): readonly RealtimeState[] {
	return status === "provisional"
		? provisionalAssistantStates(current)
		: finalAssistantStates(current);
}

/**
 * The state steps that bring any phase to closed, so finalisation never skips the stopping step
 * the browser expects to observe.
 * @param current - The session's current state.
 * @returns The states to apply in order, empty when already closed.
 */
function closingStates(current: RealtimeState): readonly RealtimeState[] {
	if (current.phase === "closed") {
		return [];
	}
	if (current.phase === "stopping") {
		return [{ phase: "closed", reason: "stopped" }];
	}
	return [
		current.phase === "idle"
			? { phase: "stopping", reason: "dispose_requested" }
			: { phase: "stopping", reason: "stop_requested" },
		{ phase: "closed", reason: "stopped" },
	];
}

/**
 * The recoverable-error state for a realtime transport failure, when the current phase allows it.
 * @param current - The session's current state.
 * @param message - The failure text to surface.
 * @returns The failure state, or null when the transition is not allowed.
 */
function realtimeFailureState(current: RealtimeState, message: string): RealtimeState | null {
	const failure: RealtimeState = {
		phase: "recoverable_error",
		reason: "realtime_unavailable",
		message,
	};
	return canTransitionRealtimeState(current, failure) ? failure : null;
}

/**
 * The recoverable-error state for an app-server failure, when the current phase allows it.
 * @param current - The session's current state.
 * @param message - The failure text to surface.
 * @returns The failure state, or null when the transition is not allowed.
 */
function appServerFailureState(current: RealtimeState, message: string): RealtimeState | null {
	const failure: RealtimeState = {
		phase: "recoverable_error",
		reason: "app_server_unavailable",
		message,
	};
	return canTransitionRealtimeState(current, failure) ? failure : null;
}

/**
 * The stopping state a stop request moves to, when the current phase allows it.
 * @param current - The session's current state.
 * @returns The stopping state, or null when the transition is not allowed.
 */
function stopState(current: RealtimeState): RealtimeState | null {
	const stopping: RealtimeState = { phase: "stopping", reason: "stop_requested" };
	return canTransitionRealtimeState(current, stopping) ? stopping : null;
}

export {
	inputStates,
	assistantStates,
	closingStates,
	realtimeFailureState,
	appServerFailureState,
	stopState,
};
