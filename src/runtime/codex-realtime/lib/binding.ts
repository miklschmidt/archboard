import type { CodexRealtimeBinding } from "@/runtime/codex-realtime/lib/contract";

/**
 * Whether two bindings name the same child epoch, workhorse link and coordinator thread, the
 * identity a realtime session must keep for its whole life.
 * @param left - One binding.
 * @param right - The other binding.
 * @returns True when every identity field matches.
 */
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

/**
 * The text to surface for a failed realtime request, without leaking non-Error throwables.
 * @param error - What was thrown.
 * @returns The error's message, or a fixed fallback.
 */
function realtimeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "The Codex realtime request failed.";
}

export { realtimeErrorMessage, sameRealtimeBinding };
