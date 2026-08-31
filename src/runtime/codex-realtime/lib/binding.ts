import type { CodexRealtimeBinding } from "./contract.js";

export function sameRealtimeBinding(
	left: CodexRealtimeBinding,
	right: CodexRealtimeBinding,
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.linkedThreadId === right.linkedThreadId &&
		left.coordinatorThreadId === right.coordinatorThreadId
	);
}

export function realtimeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The Codex realtime request failed.";
}
