// A preload of the real server entry: it makes the server start the Codex stand-in that the test names.
// `startOwnedServer` runs it with `--preload` before `apps/server/src/server.ts`.
import type * as CodexProcessInterface from "@archboard/codex-app-server/process";
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";

import { CODEX_PROCESS_MODULE_PATH } from "../../support/codex-process-module.ts";

const executable = process.env["ARCHBOARD_TEST_CODEX_EXECUTABLE"];
if (executable === undefined) {
	throw new Error("ARCHBOARD_TEST_CODEX_EXECUTABLE is required by the production proof fixture.");
}
const logPath = process.env["ARCHBOARD_TEST_CODEX_LOG"];
if (logPath !== undefined) {
	appendFileSync(
		logPath,
		`${JSON.stringify({ kind: "server_fixture_spawn", pid: process.pid })}\n`,
	);
}

const executableModule: typeof CodexProcessInterface = await import(CODEX_PROCESS_MODULE_PATH);
// Mocking updates the imported namespace in place, so the stand-in keeps the real function.
const { resolveCodexExecutable } = executableModule;
await Promise.resolve(
	mock.module(CODEX_PROCESS_MODULE_PATH, (): typeof executableModule => ({
		...executableModule,
		resolveCodexExecutable: () =>
			resolveCodexExecutable({
				executablePath:
					process.env["ARCHBOARD_TEST_PRODUCTION_FAIL_STAGE"] === "child_start"
						? `${executable}.missing`
						: executable,
			}),
	})),
);
