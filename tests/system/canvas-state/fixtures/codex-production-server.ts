import { mock } from "bun:test";
import { resolve } from "node:path";

const executable = process.env.ARCHBOARD_TEST_CODEX_EXECUTABLE;
if (executable === undefined)
	throw new Error("ARCHBOARD_TEST_CODEX_EXECUTABLE is required by the production proof fixture.");

await Promise.resolve(
	mock.module(
		resolve(import.meta.dir, "../../../../src/runtime/codex-process/executable.ts"),
		() => ({
			resolveProjectCodexExecutable: () => executable,
		}),
	),
);

const server = await import("../../../../src/server.ts");
await server.startServer();
