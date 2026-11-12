import { afterAll, beforeEach, onTestFinished, setDefaultTimeout } from "bun:test";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import { TEST_CASE_TIMEOUT_MS } from "../../support/timing.ts";
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

// A test never records or sends usage (ADR 0079). Bun's NODE_ENV=test already turns it off, and
// this also covers a process that a test starts with an environment of its own making.
process.env["ARCHBOARD_TELEMETRY"] = "0";

setDefaultTimeout(TEST_CASE_TIMEOUT_MS);

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
