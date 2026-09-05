import { describe, expect, test } from "bun:test";

import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupOperations,
} from "../../../src/runtime/codex-process/process-group.ts";
import { completeCapturedCanvasCleanup } from "./owned-canvas-forced-cleanup.ts";

const group = (pid: number): CodexProcessGroupIdentity => ({
	leaderPid: pid,
	pgid: pid,
	leaderStartTime: `start-${pid}`,
});

describe("owned canvas forced cleanup", () => {
	test("attempts later captured child groups after an earlier group fails", () => {
		const first = group(101);
		const second = group(202);
		const signals: number[] = [];
		let lockRemovalAttempts = 0;
		const operations: Pick<CodexProcessGroupOperations, "inspect" | "signal"> = {
			inspect(identity) {
				if (identity === first) {
					return "reused";
				}
				return signals.includes(identity.pgid) ? "quiescent" : "owned";
			},
			signal(identity) {
				signals.push(identity.pgid);
			},
		};

		expect(
			completeCapturedCanvasCleanup({
				groups: [first, second],
				operations,
				parent: { exited: true },
				removeStorageLock() {
					lockRemovalAttempts += 1;
				},
			}),
		).rejects.toThrow("child group 101 did not become quiescent");
		expect(signals).toEqual([second.pgid]);
		expect(lockRemovalAttempts).toBe(1);
	});

	test("retains the storage lock unless the owned parent is proven exited", async () => {
		const parentFailure = new Error("owned parent remains unsettled");
		let lockRemovalAttempts = 0;
		let surfaced: unknown;
		try {
			await completeCapturedCanvasCleanup({
				groups: [],
					operations: {
						inspect: () => "quiescent",
						signal() {
							// No group exists in this parent-only failure case.
						},
				},
				parent: { exited: false, failure: parentFailure },
				removeStorageLock() {
					lockRemovalAttempts += 1;
				},
			});
		} catch (error) {
			surfaced = error;
		}

		expect(surfaced).toBe(parentFailure);
		expect(lockRemovalAttempts).toBe(0);
	});

	test("aggregates unsettled-parent and captured-descendant failures", async () => {
		const descendant = group(303);
		const parentFailure = new Error("owned parent remains unsettled");
		let descendantInspections = 0;
		let lockRemovalAttempts = 0;
		let surfaced: unknown;
		try {
			await completeCapturedCanvasCleanup({
				groups: [descendant],
				operations: {
					inspect() {
						descendantInspections += 1;
							return "unproven";
						},
						signal() {
							// An unproven identity must never be signalled.
						},
				},
				parent: { exited: false, failure: parentFailure },
				removeStorageLock() {
					lockRemovalAttempts += 1;
				},
			});
		} catch (error) {
			surfaced = error;
		}

		expect(surfaced).toBeInstanceOf(AggregateError);
		if (!(surfaced instanceof AggregateError)) {
			throw new Error("Expected forced cleanup failures to aggregate.");
		}
		expect(surfaced.errors[0]).toBe(parentFailure);
		expect(surfaced.errors[1]).toMatchObject({
			message:
				"Owned canvas child group 303 did not become quiescent after forced canvas death (unproven).",
		});
		expect(descendantInspections).toBeGreaterThan(0);
		expect(lockRemovalAttempts).toBe(0);
	});
});
