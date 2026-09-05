import type { CodexRealtimeBinding } from "./contract.js";

function sameRealtimeBinding(
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Branded identity fields are immutable capabilities even though the rule cannot prove their nominal internals.
	left: Readonly<CodexRealtimeBinding>,
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Branded identity fields are immutable capabilities even though the rule cannot prove their nominal internals.
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
