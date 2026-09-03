import { afterEach, beforeEach } from "bun:test";

import {
	clearTestWallClockDeclaration,
	createTestWallClockReporter,
	takeTestWallClockDeclaration,
} from "./support/test-wall-clock.ts";

const monotonicNowMs = Bun.nanoseconds.bind(Bun);
const reporter = createTestWallClockReporter(() => monotonicNowMs() / 1_000_000);

beforeEach(() => {
	clearTestWallClockDeclaration();
	reporter.start();
});
afterEach(() => {
	const declaration = takeTestWallClockDeclaration();
	reporter.finish(declaration?.test ?? "the Bun test named by this failure", declaration);
});
