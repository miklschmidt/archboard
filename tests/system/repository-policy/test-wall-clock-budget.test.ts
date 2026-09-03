import { describe, expect, jest, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
	createTestWallClockReporter,
	type TestWallClockDeclaration,
} from "./support/test-wall-clock.ts";
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
			`Slow test "pending visual mutation expires" took 91000.00 ms, above its ${TEST_WALL_CLOCK_BUDGET_MS} ms wall-clock budget. Replace production-duration waits with controlled time, or add a source-local declareTestWallClockBudget call as the test body's first statement with its exact name, a reason, TEST_* outer bound, task, and recorded evidence.`,
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
				`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
				test("real owner", () => {
					declareTestWallClockBudget({
						test: "real owner",
						reason: "Uses a real external process.",
						outerBoundMs: TEST_REAL_OWNER_TIMEOUT_MS,
						task: "TASK-148.07",
						evidence: "Recorded at 21,104 ms on the hosted runner.",
					});
				});`,
			],
		]);
		expect(
			inspectTestWallClockPolicy({
				bunfig: '[test]\npreload = ["./tests/system/repository-policy/support/test-preload.ts"]',
				sources,
			}),
		).toEqual([]);
	});

	test("parses TOML so a commented preload cannot satisfy coverage", () => {
		expect(
			inspectTestWallClockPolicy({
				bunfig: '[test]\n# preload = ["./tests/system/repository-policy/support/test-preload.ts"]',
				sources: new Map(),
			}),
		).toEqual([
			"bunfig.toml test.preload must include ./tests/system/repository-policy/support/test-preload.ts",
		]);
	});

	test.each([
		[
			"commented fields",
			`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
			test("real owner", () => {
				declareTestWallClockBudget({
					test: "real owner",
					// reason: "commented out",
					outerBoundMs: TEST_REAL_OWNER_TIMEOUT_MS,
					task: "TASK-148.07",
					// evidence: "commented out",
				});
			});`,
			"wall-clock declaration needs field reason",
		],
		[
			"aliased helper",
			`import { declareTestWallClockBudget as approve } from "../repository-policy/support/test-wall-clock.ts";
			test("real owner", () => { approve({}); });`,
			"declareTestWallClockBudget must not be aliased",
		],
		[
			"indirect declaration",
			`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
			const declaration = { test: "real owner" };
			test("real owner", () => { declareTestWallClockBudget(declaration); });`,
			"declareTestWallClockBudget needs one inline object literal",
		],
		[
			"indirect function",
			`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
			const approve = declareTestWallClockBudget;
			test("real owner", () => { approve({}); });`,
			"declareTestWallClockBudget may only appear in its direct import and call",
		],
		[
			"name mismatch",
			`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
			test("real owner", () => {
				declareTestWallClockBudget({
					test: "other owner",
					reason: "Uses real time.",
					outerBoundMs: TEST_REAL_OWNER_TIMEOUT_MS,
					task: "TASK-148.07",
					evidence: "Recorded at 21,104 ms.",
				});
			});`,
			'wall-clock declaration names "other owner", not its containing test "real owner"',
		],
		[
			"wildcard name",
			`import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
			test("real * owner", () => {
				declareTestWallClockBudget({
					test: "real * owner",
					reason: "Uses real time.",
					outerBoundMs: TEST_REAL_OWNER_TIMEOUT_MS,
					task: "TASK-148.07",
					evidence: "Recorded at 21,104 ms.",
				});
			});`,
			"wall-clock declaration test must not contain a wildcard",
		],
	] as const)("rejects %s", (_case, source, message) => {
		const errors = inspectTestWallClockPolicy({
			bunfig: '[test]\npreload = ["./tests/system/repository-policy/support/test-preload.ts"]',
			sources: new Map([["tests/system/example/owner.test.ts", source]]),
		});
		expect(errors.some((error) => error.includes(message))).toBeTrue();
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
