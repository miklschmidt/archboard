import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve as resolvePath } from "node:path";
import { WebSocket } from "ws";

import {
	prepareProductionFixture,
	type ProductionFixture,
} from "../server-state/support/codex-production.ts";
import { waitFor } from "../server-state/support/http.ts";
import { listOnlyVault } from "../support/test-vault.ts";
import {
	TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
	TEST_SERVER_STARTUP_TIMEOUT_MS,
} from "../support/timing.ts";
import {
	buildOwnedServerEnvironment,
	processExists,
	waitForProcessExit,
} from "../support/owned-server.ts";
import { productionServer } from "../server-state/support/production-server.ts";
import { records } from "./support/codex-workbench-lifecycle.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/server-state/fixtures/fake-codex-production.ts");
const httpFailurePreload = join(
	repoRoot,
	"apps/server/tests/server/support/http-failure-preload.ts",
);
type HttpFailureMode = "bind-race" | "runtime-error" | "delayed-listen-cancel";

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("No loopback port.");
	}
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

async function spawnServer(
	resources: AsyncDisposableStack,
	fixture: ProductionFixture,
	mode: HttpFailureMode,
) {
	const port = await freePort();
	const pendingPath = join(fixture.root, `${mode}.pending`);
	const outcomePath = join(fixture.root, `${mode}.outcome`);
	const paths = {
		home: join(fixture.root, `${mode}-home`),
		xdgConfig: join(fixture.root, `${mode}-xdg-config`),
		xdgState: join(fixture.root, `${mode}-state`),
		temporary: join(fixture.root, `${mode}-tmp`),
	};
	for (const directory of Object.values(paths)) {
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	const child = spawn(
		process.execPath,
		[
			"--preload",
			productionServer.preload,
			"--preload",
			httpFailurePreload,
			productionServer.serverPath,
		],
		{
			cwd: repoRoot,
			detached: true,
			env: buildOwnedServerEnvironment({
				paths,
				port,
				registry: listOnlyVault(join(fixture.root, `${mode}-repos.json`), fixture.vault),
				env: {
					ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
					ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
					ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
					ARCHBOARD_TEST_HTTP_FAILURE: mode,
					ARCHBOARD_TEST_HTTP_PENDING_PATH: pendingPath,
					ARCHBOARD_TEST_HTTP_OUTCOME_PATH: outcomePath,
				},
			}),
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (child.pid === undefined) {
		throw new Error(`${mode} server has no pid.`);
	}
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
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
					throw error;
				}
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
			const server = await spawnServer(resources, fixture, "delayed-listen-cancel");
			await waitFor(
				async () => (existsSync(server.pendingPath) ? true : undefined),
				"delayed HTTP listen",
				{ timeoutMs: TEST_SERVER_STARTUP_TIMEOUT_MS },
			);
			server.child.kill("SIGTERM");
			const result = await Promise.race([
				server.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Delayed-listen server did not exit.\n${server.output()}`)),
						TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
					),
				),
			]);
			expect(result).toEqual({ code: 1, signal: null });
			expect(readFileSync(server.outcomePath, "utf8")).toBe("listen-cancelled");

			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined) {
				throw new Error(`The delayed-listen Codex owner never started.\n${server.output()}`);
			}
			await waitForProcessExit(childPid);
			expect(processExists(childPid)).toBeFalse();

			const probe = createServer();
			resources.defer(async () => {
				if (!probe.listening) {
					return;
				}
				await new Promise<void>((resolve, reject) =>
					probe.close((error) => (error ? reject(error) : resolve())),
				);
			});
			await new Promise<void>((resolve, reject) => {
				probe.once("error", reject);
				probe.listen({ host: "127.0.0.1", port: server.port, exclusive: true }, resolve);
			});
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
);

test(
	"an HTTP bind race rejects startup and unwinds the entered Codex owner once",
	async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, fixtureSource);
			const server = await spawnServer(resources, fixture, "bind-race");
			const result = await Promise.race([
				server.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Bind-race server did not exit.\n${server.output()}`)),
						TEST_SERVER_STARTUP_TIMEOUT_MS,
					),
				),
			]);
			expect(result.code).not.toBe(0);
			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined) {
				throw new Error(`The bind-race Codex owner never started.\n${server.output()}`);
			}
			await waitForProcessExit(childPid);
			expect(processExists(server.pid)).toBeFalse();
			expect(processExists(childPid)).toBeFalse();
			expect(server.output()).toContain("already in use");
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
);

test(
	"a runtime HTTP error enters guarded reverse teardown",
	async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, fixtureSource);
			const server = await spawnServer(resources, fixture, "runtime-error");
			await waitFor(
				async () => {
					try {
						const response = await fetch(`${server.base}/health`);
						const health = (await response.json()) as { application?: { phase?: unknown } };
						return health.application?.phase === "running" ? true : undefined;
					} catch {
						if (!processExists(server.pid)) {
							throw new Error(`Runtime-error server exited during startup.\n${server.output()}`);
						}
						return undefined;
					}
				},
				"runtime-error server readiness",
				{ timeoutMs: TEST_SERVER_STARTUP_TIMEOUT_MS },
			);
			const socket = new WebSocket(
				`${server.base.replace("http:", "ws:")}/?vault=${encodeURIComponent(fixture.vault)}`,
			);
			resources.defer(() => socket.terminate());
			await new Promise<void>((resolve, reject) => {
				socket.once("open", resolve);
				socket.once("error", reject);
			});
			const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
			server.child.kill("SIGUSR2");
			const result = await Promise.race([
				server.exit,
				new Promise<never>((_resolve, reject) =>
					setTimeout(
						() => reject(new Error(`Runtime-error server did not exit.\n${server.output()}`)),
						TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
					),
				),
			]);
			await closed;
			expect(result.code).not.toBe(0);
			const childPid = records(fixture.logPath).find(
				(entry) => entry.kind === "app_server_spawn",
			)?.pid;
			if (childPid === undefined) {
				throw new Error("The runtime-error Codex owner never started.");
			}
			await waitForProcessExit(childPid);
			expect(processExists(childPid)).toBeFalse();
			expect(server.output()).toContain("HTTP server failed");
		} finally {
			await resources.disposeAsync();
		}
	},
	TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
);
