import { beforeEach } from "bun:test";

import { TEST_WALL_CLOCK_BUDGET_MS } from "../../src/shared/timing/timing.ts";

export interface TestWallClockDeclaration {
	readonly test: string;
	readonly reason: string;
	readonly outerBoundMs: number;
	readonly task: `TASK-${string}`;
	readonly evidence: string;
}

interface TestWallClockReporter {
	start(): void;
	finish(test: string, declaration?: TestWallClockDeclaration): void;
}

let activeDeclaration: TestWallClockDeclaration | undefined;

export function declareTestWallClockBudget(declaration: TestWallClockDeclaration): void {
	beforeEach(() => {
		activeDeclaration = declaration;
	});
}

export function clearTestWallClockDeclaration(): void {
	activeDeclaration = undefined;
}

export function takeTestWallClockDeclaration(): TestWallClockDeclaration | undefined {
	const declaration = activeDeclaration;
	activeDeclaration = undefined;
	return declaration;
}

export function createTestWallClockReporter(
	nowMs: () => number,
	defaultBudgetMs = TEST_WALL_CLOCK_BUDGET_MS,
): TestWallClockReporter {
	let startedAtMs: number | undefined;
	return {
		start() {
			startedAtMs = nowMs();
		},
		finish(test, declaration) {
			if (startedAtMs === undefined) throw new Error("Test wall-clock reporter was not started.");
			const elapsedMs = Math.max(0, nowMs() - startedAtMs);
			startedAtMs = undefined;
			const budgetMs = declaration?.outerBoundMs ?? defaultBudgetMs;
			if (elapsedMs <= budgetMs) return;
			throw new Error(
				`Slow test ${JSON.stringify(test)} took ${elapsedMs.toFixed(2)} ms, above its ${budgetMs} ms wall-clock budget. ` +
					"Replace production-duration waits with controlled time, or add a source-local declareTestWallClockBudget call with a reason, TEST_* outer bound, task, and recorded evidence.",
			);
		},
	};
}
