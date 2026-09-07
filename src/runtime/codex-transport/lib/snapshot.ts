import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import type { FrameWriter } from "@/runtime/codex-transport/lib/frame-writer";
import type { TransportSnapshot } from "@/runtime/codex-transport/lib/types";

interface SnapshotCounts {
	readonly state: TransportSnapshot["state"];
	readonly pendingRequests: number;
	readonly pendingReverseRequests: number;
	readonly pendingReverseBytes: number;
}

/**
 * Describes the transport's queues against their configured bounds.
 * @param counts The transport-level state and pending counts.
 * @param writerState The frame writer's lane depths.
 * @returns The frozen snapshot.
 */
function transportSnapshot(
	counts: SnapshotCounts,
	writerState: ReturnType<FrameWriter<unknown>["inspect"]>,
): TransportSnapshot {
	return Object.freeze({
		state: counts.state,
		pendingRequests: counts.pendingRequests,
		pendingReverseRequests: counts.pendingReverseRequests,
		pendingReverseBytes: counts.pendingReverseBytes,
		queuedFrames: writerState.queuedFrames,
		queuedBytes: writerState.queuedBytes,
		responseQueuedFrames: writerState.responseQueuedFrames,
		responseQueuedBytes: writerState.responseQueuedBytes,
		writeInFlight: writerState.writeInFlight,
		maxQueuedFrames: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames,
		maxQueuedBytes: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedBytes,
		maxResponseQueuedFrames: CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames,
		maxResponseQueuedBytes: CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes,
		maxPendingReverseRequests: CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests,
		maxPendingReverseBytes: CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseBytes,
	});
}

export { transportSnapshot };
