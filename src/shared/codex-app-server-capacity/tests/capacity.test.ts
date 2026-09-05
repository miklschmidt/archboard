import { describe, expect, test } from "bun:test";

import { CODEX_APP_SERVER_CAPACITY } from "../index.js";

describe("Codex app-server capacity policy", () => {
	test("publishes the capacity contract and relationships", () => {
		expect(CODEX_APP_SERVER_CAPACITY).toEqual({
			frameBytes: 16_777_216,
			partialFrameBytes: 16_777_216,
			stderrRetainedBytes: 65_536,
			text: { maxChars: 256 },
			outbound: {
				pendingRequests: 128,
				regularQueuedFrames: 128,
				regularQueuedBytes: 16_777_216,
				pendingReverseRequests: 128,
				pendingReverseBytes: 16_777_216,
				maxReverseResponseBytes: 524_288,
				responseReservedFrames: 128,
				responseReservedBytes: 67_108_864,
			},
			retention: {
				requestTombstones: 256,
				completedReverseIds: 256,
				lateResponses: 128,
				lateResponseRecordBytes: 4096,
				issues: 256,
				issueRecordBytes: 2048,
			},
			listenersPerEvent: 1,
		});
		expect(CODEX_APP_SERVER_CAPACITY.frameBytes).toBe(CODEX_APP_SERVER_CAPACITY.partialFrameBytes);
		expect(Number(CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes)).toBe(
			Number(CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames) *
				Number(CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes),
		);
		expect(Number(CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes)).toBe(2 * 32_768);
		expect(CODEX_APP_SERVER_CAPACITY.text.maxChars).toBeGreaterThan(0);
	});

	test("freezes the authority, including nested policy records", () => {
		expect(Object.isFrozen(CODEX_APP_SERVER_CAPACITY)).toBeTrue();
		expect(Object.isFrozen(CODEX_APP_SERVER_CAPACITY.outbound)).toBeTrue();
		expect(Object.isFrozen(CODEX_APP_SERVER_CAPACITY.retention)).toBeTrue();
		const before = CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests;
		try {
			(CODEX_APP_SERVER_CAPACITY.outbound as { pendingRequests: number }).pendingRequests = 0;
		} catch {
			// Strict ESM assignment to a frozen object is expected to throw.
		}
		expect(CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests).toBe(before);
	});
});
