import type * as CodexProcessInterface from "@archboard/codex-app-server/process";
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
import path from "node:path";

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

const executableModulePath = path.resolve(
	import.meta.dir,
	"../../../../packages/codex-app-server/src/runtime/services/executable.ts",
);
const executableModule: typeof CodexProcessInterface = await import(executableModulePath);
await Promise.resolve(
	mock.module(executableModulePath, (): typeof executableModule => ({
		...executableModule,
		resolveProjectCodexExecutable: () =>
			process.env["ARCHBOARD_TEST_PRODUCTION_FAIL_STAGE"] === "child_start"
				? `${executable}.missing`
				: executable,
	})),
);

const server = await import("../../../../src/server.ts");
await server.startServer();
