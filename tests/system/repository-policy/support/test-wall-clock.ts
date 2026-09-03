import { TEST_WALL_CLOCK_BUDGET_MS } from "../../../../src/shared/timing/timing.ts";

export interface TestWallClockDeclaration {
	readonly test: string;
	readonly reason: string;
	readonly outerBoundMs: number;
	readonly task: `TASK-${string}`;
	readonly evidence: string;
}

interface TestWallClockReporter {
	start(): void;
	started(): boolean;
	finish(test: string, declaration?: TestWallClockDeclaration): void;
}

let activeDeclaration: TestWallClockDeclaration | undefined;

export function declareTestWallClockBudget(declaration: TestWallClockDeclaration): void {
	if (activeDeclaration)
		throw new Error("Only one wall-clock declaration may apply to an executing test.");
	activeDeclaration = declaration;
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
		started() {
			return startedAtMs !== undefined;
		},
		finish(test, declaration) {
			if (startedAtMs === undefined) throw new Error("Test wall-clock reporter was not started.");
			const elapsedMs = Math.max(0, nowMs() - startedAtMs);
			startedAtMs = undefined;
			const budgetMs = declaration?.outerBoundMs ?? defaultBudgetMs;
			if (elapsedMs <= budgetMs) return;
			throw new Error(
				`Slow test ${JSON.stringify(test)} took ${elapsedMs.toFixed(2)} ms, above its ${budgetMs} ms wall-clock budget. ` +
					"Replace production-duration waits with controlled time, or add a source-local declareTestWallClockBudget call as the test body's first statement with its exact name, a reason, TEST_* outer bound, task, and recorded evidence.",
			);
		},
	};
}
