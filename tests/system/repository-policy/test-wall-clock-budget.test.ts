import { describe, expect, jest, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
	createTestWallClockReporter,
	type TestWallClockDeclaration,
} from "../../support/test-wall-clock.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../../../src/shared/timing/timing.ts";
import { inspectTestWallClockPolicy } from "./support/test-wall-clock-policy.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const legitimateContention: TestWallClockDeclaration = {
	test: "every public presentation is fresh, provenance-safe, and board-addressed",
	reason: "It starts a real canvas and exercises every public presentation route.",
	outerBoundMs: 20_000,
	task: "TASK-138",
	evidence: "Recorded at 14,815.78 ms under the one-CPU contention fixture.",
};

function reporterAt(elapsedMs: number) {
	let now = 0;
	const reporter = createTestWallClockReporter(() => now);
	reporter.start();
	now = elapsedMs;
	return reporter;
}

describe("test wall-clock reporter", () => {
	test("accepts fast tests regardless of their declared timeout cap", () => {
		jest.useFakeTimers();
		try {
			expect(() => reporterAt(8).finish("fast owner with a 90-second cap")).not.toThrow();
		} finally {
			jest.useRealTimers();
		}
	}, 90_000);

	test("accepts the recorded 14.816-second contention shape without sleeping", () => {
		expect(() => reporterAt(14_816).finish(legitimateContention.test)).not.toThrow();
	});

	test("rejects the obsolete 91-second approval-expiry shape with corrective output", () => {
		expect(TEST_WALL_CLOCK_BUDGET_MS).toBe(20_000);
		expect(() => reporterAt(91_000).finish("pending visual mutation expires")).toThrow(
			`Slow test "pending visual mutation expires" took 91000.00 ms, above its ${TEST_WALL_CLOCK_BUDGET_MS} ms wall-clock budget. Replace production-duration waits with controlled time, or add a source-local declareTestWallClockBudget call with a reason, TEST_* outer bound, task, and recorded evidence.`,
		);
	});

	test("uses an approved source-local outer bound", () => {
		const realTimeOwner = { ...legitimateContention, outerBoundMs: 120_000 };
		expect(() => reporterAt(40_000).finish(realTimeOwner.test, realTimeOwner)).not.toThrow();
		expect(() => reporterAt(120_001).finish(realTimeOwner.test, realTimeOwner)).toThrow(
			/above its 120000 ms wall-clock budget/,
		);
	});
});

describe("test wall-clock repository policy", () => {
	test("accepts the pinned preload and structured source-local declaration", () => {
		const sources = new Map([
			[
				"tests/system/example/owner.test.ts",
				`test("real owner", () => {});
				declareTestWallClockBudget({
					test: "real owner",
					reason: "Uses a real external process.",
					outerBoundMs: TEST_REAL_OWNER_TIMEOUT_MS,
					task: "TASK-148.07",
					evidence: "Recorded at 21,104 ms on the hosted runner.",
				});`,
			],
		]);
		expect(
			inspectTestWallClockPolicy({
				bunfig: '[test]\npreload = ["./tests/test-preload.ts"]',
				sources,
			}),
		).toEqual([]);
	});

	test("rejects missing preload coverage and unstable declaration fields", () => {
		const errors = inspectTestWallClockPolicy({
			bunfig: "[test]",
			sources: new Map([
				[
					"tests/system/example/owner.test.ts",
					'test("real owner", () => {}); declareTestWallClockBudget({ test: "real owner", outerBoundMs: 42, task: "later" });',
				],
			]),
		});
		expect(errors).toEqual([
			"bunfig.toml must preload ./tests/test-preload.ts for every native Bun test lane",
			"tests/system/example/owner.test.ts: wall-clock declaration needs a non-empty reason string",
			"tests/system/example/owner.test.ts: wall-clock declaration needs a non-empty evidence string",
			"tests/system/example/owner.test.ts: wall-clock declaration outerBoundMs must name a TEST_* constant",
			"tests/system/example/owner.test.ts: wall-clock declaration needs a TASK-* reference",
		]);
	});

	test("keeps the real checkout covered and every declaration structured", () => {
		const sources = new Map<string, string>();
		for (const root of [path.join(repoRoot, "src"), path.join(repoRoot, "tests")]) {
			const pending = [root];
			while (pending.length > 0) {
				const directory = pending.pop()!;
				for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
					const absolute = path.join(directory, entry.name);
					if (entry.isDirectory()) pending.push(absolute);
					else if (entry.name.endsWith(".ts"))
						sources.set(path.relative(repoRoot, absolute), fs.readFileSync(absolute, "utf8"));
				}
			}
		}
		expect(
			inspectTestWallClockPolicy({
				bunfig: fs.readFileSync(path.join(repoRoot, "bunfig.toml"), "utf8"),
				sources,
			}),
		).toEqual([]);
	});
});
