import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve as resolvePath } from "node:path";
import { WebSocket } from "ws";

import {
	prepareProductionFixture,
	type ProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { processExists, waitForProcessExit } from "../support/owned-canvas.ts";
import { records } from "./support/codex-workbench-lifecycle.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");
const serverEntry = join(repoRoot, "src/server.ts");

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("No loopback port.");
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

function wrapperSource(fixture: ProductionFixture, mode: "bind-race" | "runtime-error"): string {
	const executableModule = join(repoRoot, "src/runtime/codex-process/executable.ts");
	const httpFactoryModule = join(repoRoot, "src/server/canvas/lib/http-server.ts");
	const bindRace = mode === "bind-race";
	return (
		`import { mock } from "bun:test";\n` +
		`const { createServer: createRealServer } = process.getBuiltinModule("http");\n` +
		`let ownedServer;\n` +
		`let rivalServer;\n` +
		`mock.module(${JSON.stringify(httpFactoryModule)}, () => ({ createCanvasHttpServer: (handler) => {\n` +
		`  ownedServer = createRealServer(handler);\n` +
		(bindRace
			? `  const realListen = ownedServer.listen.bind(ownedServer);\n` +
				`  ownedServer.listen = (port, host, listening) => {\n` +
				`    rivalServer = createRealServer();\n` +
				`    rivalServer.listen(port, host, () => {\n` +
				`      ownedServer.once("error", () => rivalServer.close());\n` +
				`      realListen(port, host, listening);\n` +
				`    });\n` +
				`    return ownedServer;\n` +
				`  };\n`
			: "") +
		`  return ownedServer;\n` +
		`} }));\n` +
		`mock.module(${JSON.stringify(executableModule)}, () => ({ resolveProjectCodexExecutable: () => ${JSON.stringify(fixture.executablePath)} }));\n` +
		`const { startServer } = await import(${JSON.stringify(serverEntry)});\n` +
		`await startServer();\n` +
		(mode === "runtime-error"
			? `process.on("SIGUSR2", () => ownedServer.emit("error", Object.assign(new Error("injected runtime HTTP failure"), { code: "EIO" })));\n`
			: "")
	);
}

async function spawnCanvas(
	resources: AsyncDisposableStack,
	fixture: ProductionFixture,
	mode: "bind-race" | "runtime-error",
) {
	const port = await freePort();
	const wrapper = join(fixture.root, `${mode}-server.ts`);
	writeFileSync(wrapper, wrapperSource(fixture, mode));
	const child = spawn(process.execPath, [wrapper], {
		cwd: repoRoot,
		detached: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: "127.0.0.1",
			ARCHBOARD_VAULT: fixture.vault,
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, `${mode}-state`),
			LOG_LEVEL: "error",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (child.pid === undefined) throw new Error(`${mode} canvas has no pid.`);
	const pid = child.pid;
	let output = "";
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
	const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
		child.once("exit", (code, signal) => resolve({ code, signal })),
	);
	resources.defer(async () => {
		if (processExists(pid)) {
			try {
				process.kill(-pid, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
		}
		await exit;
	});
	return { base: `http://127.0.0.1:${port}`, child, exit, output: () => output, pid };
}

test(
	"an HTTP bind race rejects startup and unwinds the entered Codex owner once",
	async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, fixtureSource);
			const canvas = await spawnCanvas(resources, fixture, "bind-race");
			const result = await Promise.race([
				canvas.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Bind-race canvas did not exit.\n${canvas.output()}`)),
						TEST_CANVAS_STARTUP_TIMEOUT_MS,
					),
				),
			]);
			expect(result.code).not.toBe(0);
			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined)
				throw new Error(`The bind-race Codex owner never started.\n${canvas.output()}`);
			await waitForProcessExit(childPid);
			expect(processExists(canvas.pid)).toBeFalse();
			expect(processExists(childPid)).toBeFalse();
			expect(canvas.output()).toContain("already in use");
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
);

test(
	"a runtime HTTP error enters guarded reverse teardown",
	async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, fixtureSource);
			const canvas = await spawnCanvas(resources, fixture, "runtime-error");
			await waitFor(
				async () => {
					try {
						const response = await fetch(`${canvas.base}/health`);
						const health = (await response.json()) as { application?: { phase?: unknown } };
						return health.application?.phase === "running" ? true : undefined;
					} catch {
						if (!processExists(canvas.pid))
							throw new Error(`Runtime-error canvas exited during startup.\n${canvas.output()}`);
						return undefined;
					}
				},
				"runtime-error canvas readiness",
				{ timeoutMs: TEST_CANVAS_STARTUP_TIMEOUT_MS },
			);
			const socket = new WebSocket(canvas.base.replace("http:", "ws:"));
			resources.defer(() => socket.terminate());
			await new Promise<void>((resolve, reject) => {
				socket.once("open", resolve);
				socket.once("error", reject);
			});
			const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
			canvas.child.kill("SIGUSR2");
			const result = await Promise.race([
				canvas.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Runtime-error canvas did not exit.\n${canvas.output()}`)),
						TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
					),
				),
			]);
			await closed;
			expect(result.code).not.toBe(0);
			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined) throw new Error("The runtime-error Codex owner never started.");
			await waitForProcessExit(childPid);
			expect(processExists(childPid)).toBeFalse();
			expect(canvas.output()).toContain("Canvas HTTP server failed");
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
);
