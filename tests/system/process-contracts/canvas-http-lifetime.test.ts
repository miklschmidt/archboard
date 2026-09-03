import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import {
	buildOwnedCanvasEnvironment,
	processExists,
	waitForProcessExit,
} from "../support/owned-canvas.ts";
import { records } from "./support/codex-workbench-lifecycle.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");
const serverEntry = join(repoRoot, "src/server.ts");
type HttpFailureMode = "bind-race" | "runtime-error" | "delayed-listen-cancel";

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
				`  ownedServer.listen = (...args) => {\n` +
				`    const options = args[0];\n` +
				`    const port = options && typeof options === "object" ? options.port : options;\n` +
				`    const host = options && typeof options === "object" ? options.host : args[1];\n` +
				`    const listening = args.findLast((value) => typeof value === "function");\n` +
				`    rivalServer = createRealServer();\n` +
				`    rivalServer.listen(port, host, () => {\n` +
				`      ownedServer.once("error", () => rivalServer.close());\n` +
				`      realListen(...args);\n` +
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

function delayedListenWrapperSource(
	fixture: ProductionFixture,
	pendingPath: string,
	outcomePath: string,
): string {
	const executableModule = join(repoRoot, "src/runtime/codex-process/executable.ts");
	const httpFactoryModule = join(repoRoot, "src/server/canvas/lib/http-server.ts");
	return (
		`import { writeFileSync } from "node:fs";\n` +
		`import { mock } from "bun:test";\n` +
		`const { createServer: createRealServer } = process.getBuiltinModule("http");\n` +
		`let ownedServer;\n` +
		`let pending = false;\n` +
		`let lateListen = () => {};\n` +
		`mock.module(${JSON.stringify(httpFactoryModule)}, () => ({ createCanvasHttpServer: (handler) => {\n` +
		`  ownedServer = createRealServer(handler);\n` +
		`  const realListen = ownedServer.listen.bind(ownedServer);\n` +
		`  ownedServer.listen = (...args) => {\n` +
		`    const options = args[0];\n` +
		`    const listening = args.findLast((value) => typeof value === "function");\n` +
		`    pending = true;\n` +
		`    writeFileSync(${JSON.stringify(pendingPath)}, "pending");\n` +
		`    lateListen = () => {\n` +
		`      if (options && typeof options === "object") {\n` +
		`        const { signal: _signal, ...withoutSignal } = options;\n` +
		`        realListen(withoutSignal, listening);\n` +
		`      } else {\n` +
		`        realListen(...args);\n` +
		`      }\n` +
		`    };\n` +
		`    if (options && typeof options === "object" && options.signal) {\n` +
		`      options.signal.addEventListener("abort", () => {\n` +
		`        pending = false;\n` +
		`        ownedServer.emit("close");\n` +
		`      }, { once: true });\n` +
		`    }\n` +
		`    return ownedServer;\n` +
		`  };\n` +
		`  return ownedServer;\n` +
		`} }));\n` +
		`mock.module(${JSON.stringify(executableModule)}, () => ({ resolveProjectCodexExecutable: () => ${JSON.stringify(fixture.executablePath)} }));\n` +
		`const { startServer } = await import(${JSON.stringify(serverEntry)});\n` +
		`try {\n` +
		`  await startServer();\n` +
		`} catch {\n` +
		`  if (!pending) {\n` +
		`    writeFileSync(${JSON.stringify(outcomePath)}, "listen-cancelled");\n` +
		`  } else {\n` +
		`    await new Promise((resolve, reject) => {\n` +
		`      ownedServer.once("error", reject);\n` +
		`      ownedServer.once("listening", () => {\n` +
		`        writeFileSync(${JSON.stringify(outcomePath)}, "late-bind-after-stop");\n` +
		`        ownedServer.close((error) => error ? reject(error) : resolve());\n` +
		`      });\n` +
		`      lateListen();\n` +
		`    });\n` +
		`  }\n` +
		`}\n`
	);
}

async function spawnCanvas(
	resources: AsyncDisposableStack,
	fixture: ProductionFixture,
	mode: HttpFailureMode,
) {
	const port = await freePort();
	const wrapper = join(fixture.root, `${mode}-server.ts`);
	const pendingPath = join(fixture.root, `${mode}.pending`);
	const outcomePath = join(fixture.root, `${mode}.outcome`);
	const paths = {
		home: join(fixture.root, `${mode}-home`),
		xdgConfig: join(fixture.root, `${mode}-xdg-config`),
		xdgState: join(fixture.root, `${mode}-state`),
		temporary: join(fixture.root, `${mode}-tmp`),
	};
	for (const directory of Object.values(paths))
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(
		wrapper,
		mode === "delayed-listen-cancel"
			? delayedListenWrapperSource(fixture, pendingPath, outcomePath)
			: wrapperSource(fixture, mode),
	);
	const child = spawn(process.execPath, [wrapper], {
		cwd: repoRoot,
		detached: true,
		env: buildOwnedCanvasEnvironment({
			paths,
			port,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			},
		}),
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
	return {
		base: `http://127.0.0.1:${port}`,
		child,
		exit,
		outcomePath,
		output: () => output,
		pendingPath,
		pid,
		port,
	};
}

test(
	"startup cancellation settles a delayed listen before lifetime stop completes",
	async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, fixtureSource);
			const canvas = await spawnCanvas(resources, fixture, "delayed-listen-cancel");
			await waitFor(
				async () => (existsSync(canvas.pendingPath) ? true : undefined),
				"delayed HTTP listen",
				{ timeoutMs: TEST_CANVAS_STARTUP_TIMEOUT_MS },
			);
			canvas.child.kill("SIGTERM");
			const result = await Promise.race([
				canvas.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Delayed-listen canvas did not exit.\n${canvas.output()}`)),
						TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
					),
				),
			]);
			expect(result).toEqual({ code: 0, signal: null });
			expect(readFileSync(canvas.outcomePath, "utf8")).toBe("listen-cancelled");

			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined)
				throw new Error(`The delayed-listen Codex owner never started.\n${canvas.output()}`);
			await waitForProcessExit(childPid);
			expect(processExists(childPid)).toBeFalse();

			const probe = createServer();
			resources.defer(async () => {
				if (!probe.listening) return;
				await new Promise<void>((resolve, reject) =>
					probe.close((error) => (error ? reject(error) : resolve())),
				);
			});
			await new Promise<void>((resolve, reject) => {
				probe.once("error", reject);
				probe.listen({ host: "127.0.0.1", port: canvas.port, exclusive: true }, resolve);
			});
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
);

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
