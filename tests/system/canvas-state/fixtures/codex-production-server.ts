import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const executable = process.env["ARCHBOARD_TEST_CODEX_EXECUTABLE"];
if (executable === undefined)
	throw new Error("ARCHBOARD_TEST_CODEX_EXECUTABLE is required by the production proof fixture.");
const logPath = process.env["ARCHBOARD_TEST_CODEX_LOG"];
if (logPath !== undefined)
	appendFileSync(
		logPath,
		`${JSON.stringify({ kind: "canvas_fixture_spawn", pid: process.pid })}\n`,
	);

const executableModulePath = resolve(
	import.meta.dir,
	"../../../../src/runtime/codex-process/executable.ts",
);
const executableModule = await import(executableModulePath);
await Promise.resolve(
	mock.module(executableModulePath, () => ({
		...executableModule,
		resolveProjectCodexExecutable: () =>
			process.env["ARCHBOARD_TEST_PRODUCTION_FAIL_STAGE"] === "child_start"
				? `${executable}.missing`
				: executable,
	})),
);

const server = await import("../../../../src/server.ts");
await server.startServer();
