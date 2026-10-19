import { describe, expect, test } from "bun:test";

import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupOperations,
} from "@archboard/process/codex-group";
import { completeCapturedServerCleanup } from "./owned-server-forced-cleanup.ts";

const group = (pid: number): CodexProcessGroupIdentity => ({
	leaderPid: pid,
	pgid: pid,
	leaderStartTime: `start-${pid}`,
});

describe("owned server forced cleanup", () => {
	test("waits through a transient unproven census before signalling an owned group", async () => {
		const descendant = group(99);
		const inspections: Array<"unproven" | "owned" | "quiescent"> = [
			"unproven",
			"owned",
			"quiescent",
		];
		const signals: string[] = [];
		await completeCapturedServerCleanup({
			groups: [descendant],
			operations: {
				inspect: () => inspections.shift() ?? "quiescent",
				signal(_identity, signal) {
					signals.push(signal);
				},
			},
			parent: { exited: true },
			removeStorageLock() {},
		});

		expect(signals).toEqual(["SIGTERM"]);
	});

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
			completeCapturedServerCleanup({
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
			await completeCapturedServerCleanup({
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
		let descendantSignals = 0;
		let lockRemovalAttempts = 0;
		let surfaced: unknown;
		try {
			await completeCapturedServerCleanup({
				groups: [descendant],
				operations: {
					inspect() {
						descendantInspections += 1;
						return "unproven";
					},
					signal() {
						descendantSignals += 1;
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
				"Owned server child group 303 did not become quiescent after forced server death (unproven).",
		});
		expect(descendantInspections).toBeGreaterThan(0);
		expect(descendantSignals).toBe(0);
		expect(lockRemovalAttempts).toBe(0);
	});
});
