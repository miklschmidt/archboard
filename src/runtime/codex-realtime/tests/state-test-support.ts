import {
	INITIAL_REALTIME_STATE,
	transitionRealtimeState,
	type RealtimeSemanticEvent,
	type RealtimeState,
} from "../../../shared/codex-realtime-host/index.js";
import type { CodexRealtimeAdapter } from "../index.js";

export function recordReducerCheckedEvents(
	adapter: CodexRealtimeAdapter,
	events: RealtimeSemanticEvent[],
	failures: string[],
): void {
	const states = new Map<string, RealtimeState>();
	adapter.onSemanticEvent((event) => {
		events.push(event);
		if (event.kind !== "state") {
			return;
		}
		try {
			states.set(
				event.sessionId,
				transitionRealtimeState(states.get(event.sessionId) ?? INITIAL_REALTIME_STATE, event.state),
			);
		} catch (error) {
			failures.push(error instanceof Error ? error.message : String(error));
		}
	});
}
