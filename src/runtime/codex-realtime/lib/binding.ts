import type { CodexRealtimeBinding } from "./contract.js";

function sameRealtimeBinding(
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Every identity field is a branded primitive string with a readonly brand marker; the rule cannot prove that primitive representation.
	left: Readonly<CodexRealtimeBinding>,
	// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- Every identity field is a branded primitive string with a readonly brand marker; the rule cannot prove that primitive representation.
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
