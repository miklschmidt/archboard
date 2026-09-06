import { canTransitionRealtimeState, type RealtimeState } from "@/shared/codex-realtime-host";

/**
 *
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
 *
 */
function assistantStates(
	current: RealtimeState,
	status: "provisional" | "final",
): readonly RealtimeState[] {
	if (status === "provisional") {
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
	if (current.phase === "speaking") {
		return [{ phase: "listening", reason: "assistant_finished" }];
	}
	if (current.phase === "processing") {
		return [{ phase: "listening", reason: "processing_complete" }];
	}
	return [];
}

/**
 *
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
 *
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
 *
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
 *
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
