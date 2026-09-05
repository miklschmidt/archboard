/**
 * The canonical non-duration capacity contract for one Codex app-server
 * connection. Durations remain in shared/timing/timing.ts.
 */
export const CODEX_APP_SERVER_CAPACITY = Object.freeze({
	frameBytes: 16_777_216,
	partialFrameBytes: 16_777_216,
	stderrRetainedBytes: 65_536,
	text: Object.freeze({
		maxChars: 256,
	}),
	outbound: Object.freeze({
		pendingRequests: 128,
		regularQueuedFrames: 128,
		regularQueuedBytes: 16_777_216,
		pendingReverseRequests: 128,
		pendingReverseBytes: 16_777_216,
		maxReverseResponseBytes: 524_288,
		responseReservedFrames: 128,
		responseReservedBytes: 67_108_864,
	}),
	retention: Object.freeze({
		requestTombstones: 256,
		completedReverseIds: 256,
		lateResponses: 128,
		lateResponseRecordBytes: 4096,
		issues: 256,
		issueRecordBytes: 2048,
	}),
	listenersPerEvent: 1,
} as const);

export type CodexAppServerCapacity = typeof CODEX_APP_SERVER_CAPACITY;
