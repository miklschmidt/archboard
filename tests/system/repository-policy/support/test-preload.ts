import { afterAll, beforeEach, onTestFinished } from "bun:test";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import {
	clearTestWallClockDeclaration,
	createTestWallClockReporter,
	takeTestWallClockDeclaration,
} from "./test-wall-clock.ts";

// macOS exposes its temporary directory through /var -> /private/var. Fixtures
// use the same physical directory with canonical ancestry; explicit symlink
// refusal cases still construct and pass their own symbolic-link paths.
if (process.platform === "darwin") {
	process.env["TMPDIR"] = realpathSync(tmpdir());
}

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
