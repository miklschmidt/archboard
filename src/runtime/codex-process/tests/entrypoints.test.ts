import { describe, expect, test } from "bun:test";

import * as lifecycle from "../index.js";
import { createCodexDiagnosticsBuffer } from "../diagnostics.js";
import { buildCodexChildEnvironment } from "../environment.js";
import { verifyCodexExecutable } from "../executable.js";
import { createCodexProcessGroupOperations } from "../process-group.js";
import { prepareCodexStorage } from "../storage.js";
import { createCodexProcessForTesting } from "../testing.js";

describe("Codex process entrypoints", () => {
	test("keeps the root contract to lifecycle consumers", () => {
		expect(Object.keys(lifecycle).toSorted()).toEqual([
			"CODEX_APP_SERVER_ARGUMENTS",
			"CODEX_PROCESS_STDERR_MAX_BYTES",
			"CodexProcessError",
			"createCodexProcess",
		]);
		expect(createCodexDiagnosticsBuffer).toBeFunction();
		expect(buildCodexChildEnvironment).toBeFunction();
		expect(verifyCodexExecutable).toBeFunction();
		expect(createCodexProcessGroupOperations).toBeFunction();
		expect(prepareCodexStorage).toBeFunction();
		expect(createCodexProcessForTesting).toBeFunction();
	});
});
