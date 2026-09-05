import type { CodexRealtimeBinding } from "./contract.js";

function sameRealtimeBinding(
	left: Readonly<CodexRealtimeBinding>,
	right: Readonly<CodexRealtimeBinding>,
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.linkedThreadId === right.linkedThreadId &&
		left.coordinatorThreadId === right.coordinatorThreadId
	);
}

function realtimeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The Codex realtime request failed.";
}

export { realtimeErrorMessage, sameRealtimeBinding };
