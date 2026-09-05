import { afterAll, beforeEach, onTestFinished } from "bun:test";

import {
	clearTestWallClockDeclaration,
	createTestWallClockReporter,
	takeTestWallClockDeclaration,
} from "./test-wall-clock.ts";

const monotonicNowMs = Bun.nanoseconds.bind(Bun);
const reporter = createTestWallClockReporter(() => monotonicNowMs() / 1_000_000);

function finishTest(): void {
	const declaration = takeTestWallClockDeclaration();
	reporter.finish(declaration?.test ?? "the Bun test named by this failure", declaration);
}

function reportFailedTestWithoutMaskingIt(): void {
	if (!reporter.started()) {
		return;
	}
	try {
		finishTest();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
	}
}

beforeEach(() => {
	reportFailedTestWithoutMaskingIt();
	clearTestWallClockDeclaration();
	reporter.start();
	onTestFinished(finishTest);
});
afterAll(reportFailedTestWithoutMaskingIt);
