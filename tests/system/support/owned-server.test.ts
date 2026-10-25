import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { holderOf, vaultIn } from "./test-vault.ts";
import { TEST_SERVER_HEALTH_POLL_MS } from "./timing.ts";
import { stateDir } from "@archboard/workspace/state-dir";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const serverPath = path.join(repoRoot, "apps/server/src/server.ts");
const thisFile = import.meta.path;

async function probeLoopbackPort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once("error", reject);
		probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = probe.address();
	if (!address || typeof address === "string") {
		probe.close();
		throw new Error("The explicit-port probe did not report a loopback TCP port.");
	}
	await new Promise<void>((resolve, reject) =>
		probe.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

if (process.env["ARCHBOARD_LIFECYCLE_SERVER"] === "collision") {
	// oxlint-disable-next-line no-console -- child stderr is the collision diagnostic fixture.
	console.error(`EADDRINUSE fixture on ${process.env["PORT"]}`);
	process.exit(98);
}

if (process.env["ARCHBOARD_LIFECYCLE_SERVER"] === "namespace") {
	const home = process.env["HOME"]!;
	const xdgConfig = process.env["XDG_CONFIG_HOME"]!;
	const xdgState = process.env["XDG_STATE_HOME"]!;
	const temporary = process.env["TMPDIR"]!;
	const workbench = path.join(stateDir(), "codex-workbench");
	const lock = path.join(workbench, "canvases", process.env["PORT"]!, ".codex-process.lock");
	try {
		fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
		fs.writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
	} catch (error) {
		// oxlint-disable-next-line no-console -- child stderr is the production collision symptom.
		console.error(
			`Another server owns this Codex state at ${path.dirname(lock)}. ` +
				"Stop the other owner before retrying.",
			error,
		);
		process.exit(97);
	}
	Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env["PORT"]),
		fetch(request) {
			if (new URL(request.url).pathname === "/health") {
				return Response.json({ pid: process.pid });
			}
			return Response.json({
				home,
				xdgConfig,
				xdgState,
				temporary,
				workbench,
				lock,
				ambientSentinel: process.env["ARCHBOARD_TEST_AMBIENT_SENTINEL"],
			});
		},
	});
	await new Promise(() => undefined);
}

if (process.env["ARCHBOARD_FAILED_REAP_CHILD"] === "1") {
	let spawnCount = 0;
	let allowFailedGenerationExit = false;
	class FakeChild extends EventEmitter {
		pid: number;
		exitCode: number | null = null;
		signalCode: NodeJS.Signals | null = null;
		stderr = new PassThrough();

		constructor(pid: number) {
			super();
			this.pid = pid;
		}

		kill(): boolean {
			if (this.pid !== 1_002 || allowFailedGenerationExit) {
				queueMicrotask(() => {
					if (this.exitCode !== null) {
						return;
					}
					this.exitCode = 0;
					this.emit("exit", 0, null);
				});
			}
			return true;
		}
	}
	await mock.module("node:child_process", () => ({
		spawn() {
			spawnCount += 1;
			return new FakeChild(1_000 + spawnCount);
		},
	}));
	globalThis.fetch = Object.assign(
		async () => Response.json({ pid: spawnCount === 1 ? 1_001 : 99_999 }),
		{ preconnect: globalThis.fetch.preconnect },
	);
	const ownedServerUrl = new URL("./owned-server.ts", import.meta.url).href;
	const { startOwnedServer: startMockedServer } = await import(ownedServerUrl);
	const vault = vaultIn(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-failed-reap-")));
	const server = await startMockedServer({ serverPath, vault });
	let surfaced = "";
	try {
		await server.restart();
	} catch (error) {
		surfaced = error instanceof Error ? error.message : String(error);
	}
	const retainedPid = server.pid;
	allowFailedGenerationExit = true;
	await server.dispose();
	// oxlint-disable-next-line no-console -- JSON is the isolated child protocol.
	console.log(
		JSON.stringify({
			spawnCount,
			surfaced,
			retainedPid,
			disposed: server.pid === null,
			vaultExists: fs.existsSync(vault),
		}),
	);
	fs.rmSync(holderOf(vault), { recursive: true, force: true });
	process.exit(0);
}

const { isOwnedServerNamespaceRoot, processExists, startOwnedServer, waitForProcessExit } =
	await import("./owned-server.ts");

describe("owned server direct lifecycle", () => {
	const emergencyVaults = new Set<string>();
	afterAll(() => {
		for (const vault of emergencyVaults) {
			fs.rmSync(vault, { recursive: true, force: true });
		}
	});

	test("only accepts exact disposable namespace roots for emergency removal", () => {
		const temporary = fs.realpathSync(path.resolve(os.tmpdir()));
		expect(
			isOwnedServerNamespaceRoot(path.join(temporary, "archboard-owned-server-Ab3xY9")),
		).toBeTrue();
		for (const unsafe of [
			path.join(temporary, "archboard-owned-server-"),
			path.join(temporary, "archboard-owned-server-abcde"),
			path.join(temporary, "archboard-owned-server-abcdefg"),
			path.join(temporary, "archboard-owned-serverx-abcdef"),
			path.join(temporary, "archboard-owned-server-ab_cde"),
			path.join(temporary, "nested", "archboard-owned-server-abcdef"),
		]) {
			expect(isOwnedServerNamespaceRoot(unsafe)).toBeFalse();
		}
	});

	test("observes a retained short-lived child until delayed disappearance", async () => {
		const child = Bun.spawn(
			[process.execPath, "-e", `await Bun.sleep(${TEST_SERVER_HEALTH_POLL_MS * 10})`],
			{ stdout: "ignore", stderr: "ignore" },
		);
		try {
			expect(processExists(child.pid)).toBeTrue();
			await waitForProcessExit(child.pid);
			expect(await child.exited).toBe(0);
		} finally {
			if (child.exitCode === null) {
				child.kill("SIGKILL");
			}
			await child.exited;
		}
	});

	test("fails closed when process observation is not permitted", () => {
		const expectedPid = 42_424;
		const denied = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
		const kill = spyOn(process, "kill").mockImplementation(() => {
			throw denied;
		});
		try {
			let failure: unknown;
			try {
				processExists(expectedPid);
			} catch (error) {
				failure = error;
			}
			expect(kill).toHaveBeenCalledWith(expectedPid, 0);
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toBe(
				`Process ${expectedPid} observation failed (EPERM): operation not permitted`,
			);
			expect((failure as Error).cause).toBe(denied);
		} finally {
			kill.mockRestore();
		}
	});

	test("reports a retained live child before its handle reaps it", async () => {
		const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(60_000)"], {
			stdout: "ignore",
			stderr: "ignore",
		});
		const timeoutMs = TEST_SERVER_HEALTH_POLL_MS * 2;
		try {
			let failure: unknown;
			try {
				await waitForProcessExit(child.pid, timeoutMs);
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toBe(
				`Process ${child.pid} remained observable after ${timeoutMs}ms; it may be live, zombie, or recycled.`,
			);
		} finally {
			child.kill("SIGKILL");
			await child.exited;
		}
	});

	test("allocates and verifies a port when the caller names none", async () => {
		const vault = vaultIn(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-")));
		emergencyVaults.add(holderOf(vault));
		const server = await startOwnedServer({ serverPath, vault });
		try {
			const health = (await fetch(`${server.base}/health`).then((response) => response.json())) as {
				pid: number;
			};
			expect(health.pid).toBe(server.pid!);
			expect(Number(new URL(server.base).port)).toBeGreaterThan(0);
		} finally {
			await server.dispose();
		}
	});

	test("keeps two live test servers in separate state directories", async () => {
		const callerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-shared-caller-"));
		emergencyVaults.add(callerRoot);
		const callerPaths = {
			home: path.join(callerRoot, "home"),
			xdgConfig: path.join(callerRoot, "xdg-config"),
			xdgState: path.join(callerRoot, "xdg-state"),
			temporary: path.join(callerRoot, "tmp"),
		};
		for (const directory of Object.values(callerPaths)) {
			fs.mkdirSync(directory, { recursive: true });
		}
		const sentinel = path.join(callerRoot, "caller-owned");
		fs.writeFileSync(sentinel, "keep\n");
		const env = {
			ARCHBOARD_LIFECYCLE_SERVER: "namespace",
			HOME: callerPaths.home,
			XDG_CONFIG_HOME: callerPaths.xdgConfig,
			XDG_STATE_HOME: callerPaths.xdgState,
			TMPDIR: callerPaths.temporary,
		};
		const ambientSentinelName = "ARCHBOARD_TEST_AMBIENT_SENTINEL";
		const priorAmbientSentinel = process.env[ambientSentinelName];
		process.env[ambientSentinelName] = "ambient-only";
		let first: Awaited<ReturnType<typeof startOwnedServer>> | undefined;
		let second: Awaited<ReturnType<typeof startOwnedServer>> | undefined;
		const namespaceRoots: string[] = [];
		const namespaces: Array<{
			home: string;
			xdgConfig: string;
			xdgState: string;
			temporary: string;
			workbench: string;
			lock: string;
			ambientSentinel?: string;
		}> = [];
		try {
			first = await startOwnedServer({
				serverPath: thisFile,
				vault: vaultIn(path.join(callerRoot, "vault-first")),
				env,
			});
			second = await startOwnedServer({
				serverPath: thisFile,
				vault: vaultIn(path.join(callerRoot, "vault-second")),
				env,
			});
			for (const server of [first, second]) {
				namespaceRoots.push(server.paths.root);
				namespaces.push(
					(await fetch(`${server.base}/namespace`).then((response) =>
						response.json(),
					)) as (typeof namespaces)[number],
				);
			}
			expect(new Set(namespaces.map(({ xdgState }) => xdgState)).size).toBe(2);
			expect(new Set(namespaces.map(({ lock }) => lock)).size).toBe(2);
			for (const [index, namespace] of namespaces.entries()) {
				const server = [first, second][index]!;
				const { paths } = server;
				const workbench =
					process.platform === "darwin"
						? path.join(
								paths.home,
								"Library",
								"Application Support",
								"archboard",
								"codex-workbench",
							)
						: process.platform === "win32"
							? path.join(paths.home, "AppData", "Local", "Archboard", "codex-workbench")
							: path.join(paths.xdgState, "archboard", "codex-workbench");
				expect(namespace).toMatchObject({
					home: paths.home,
					xdgConfig: paths.xdgConfig,
					xdgState: paths.xdgState,
					temporary: paths.temporary,
				});
				expect(namespace).not.toContainValue(callerPaths.home);
				expect(namespace).not.toContainValue(callerPaths.xdgConfig);
				expect(namespace).not.toContainValue(callerPaths.xdgState);
				expect(namespace).not.toContainValue(callerPaths.temporary);
				expect(namespace.workbench).toBe(workbench);
				expect(namespace.lock).toBe(
					path.join(workbench, "canvases", new URL(server.base).port, ".codex-process.lock"),
				);
				expect(namespace.ambientSentinel).toBeUndefined();
				expect(fs.existsSync(namespace.lock)).toBeTrue();
			}
		} finally {
			await Promise.allSettled([second?.dispose(), first?.dispose()]);
			if (priorAmbientSentinel === undefined) {
				delete process.env[ambientSentinelName];
			} else {
				process.env[ambientSentinelName] = priorAmbientSentinel;
			}
		}
		for (const root of namespaceRoots) {
			expect(fs.existsSync(root)).toBeFalse();
		}
		expect(fs.existsSync(sentinel)).toBeTrue();
		fs.rmSync(callerRoot, { recursive: true, force: true });
	});

	test("reallocates an automatic port stolen after the retired generation exits", async () => {
		const vault = vaultIn(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-")));
		emergencyVaults.add(holderOf(vault));
		const server = await startOwnedServer({ serverPath, vault });
		const retiredBase = server.base;
		const retiredPid = server.pid;
		let foreign: ReturnType<typeof Bun.serve> | undefined;
		try {
			await server.restart({
				whileStopped() {
					expect(server.base).toBe(retiredBase);
					expect(server.pid).toBeNull();
					foreign = Bun.serve({
						hostname: "127.0.0.1",
						port: Number(new URL(retiredBase).port),
						fetch: () => Response.json({ pid: process.pid }),
					});
				},
			});
			expect(server.base).not.toBe(retiredBase);
			expect(server.pid).not.toBe(retiredPid);
			expect(
				await fetch(`${server.base}/health`).then((response) => response.json()),
			).toMatchObject({
				status: "healthy",
				service: "archboard-server",
				pid: server.pid,
			});
			expect(await fetch(`${retiredBase}/health`).then((response) => response.json())).toEqual({
				pid: process.pid,
			});
		} finally {
			void foreign?.stop(true);
			await server.dispose();
		}
	});

	test("bounds repeated bind collisions with all attempt diagnostics", async () => {
		const vault = vaultIn(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-")));
		emergencyVaults.add(holderOf(vault));
		let failure: Error | undefined;
		try {
			await startOwnedServer({
				serverPath: thisFile,
				vault,
				env: { ARCHBOARD_LIFECYCLE_SERVER: "collision" },
			});
		} catch (error) {
			failure = error as Error;
		}
		expect(failure?.message).toContain("exhausted 8 collision-safe start attempts");
		expect(failure?.message.match(/^\d+\. \{/gm)).toHaveLength(8);
		expect(failure?.message.match(/EADDRINUSE fixture/g)).toHaveLength(8);
		expect(failure?.message.match(/"cleanup":"reaped"/g)).toHaveLength(8);
		const paths = JSON.parse(
			/^Owned server paths: (.+)$/m.exec(failure?.message ?? "")?.[1] ?? "null",
		) as { root?: string } | null;
		expect(paths?.root).toStartWith(
			path.join(fs.realpathSync(os.tmpdir()), "archboard-owned-server-"),
		);
		expect(fs.existsSync(paths!.root!)).toBeFalse();
		expect(fs.existsSync(vault)).toBeFalse();
	});

	test("refuses a foreign pid and never reallocates an explicit restart", async () => {
		const port = await probeLoopbackPort();
		const vault = vaultIn(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-foreign-pid-")));
		emergencyVaults.add(holderOf(vault));
		const server = await startOwnedServer({ serverPath, port, vault });
		let foreign: ReturnType<typeof Bun.serve> | undefined;
		try {
			let failure: unknown;
			try {
				await server.restart({
					whileStopped() {
						foreign = Bun.serve({
							hostname: "127.0.0.1",
							port,
							fetch: () => Response.json({ pid: process.pid }),
						});
					},
				});
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toMatch(/answered for pid .* not owned pid/);
			expect(server.base).toBe(`http://127.0.0.1:${port}`);
			expect(await fetch(`${server.base}/health`).then((response) => response.json())).toEqual({
				pid: process.pid,
			});
		} finally {
			void foreign?.stop(true);
			await server.dispose();
		}
		expect(fs.existsSync(vault)).toBeFalse();
	});

	test("retains a failed generation and aborts before another spawn", () => {
		const child = Bun.spawnSync([process.execPath, "test", thisFile], {
			env: { ...process.env, ARCHBOARD_FAILED_REAP_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(child.exitCode).toBe(0);
		const protocol = child.stdout
			.toString()
			.split("\n")
			.find((line) => line.startsWith("{"));
		expect(protocol).toBeDefined();
		const result = JSON.parse(protocol!) as {
			spawnCount: number;
			surfaced: string;
			retainedPid: number | null;
			disposed: boolean;
			vaultExists: boolean;
		};
		expect(result.spawnCount).toBe(2);
		expect(result.surfaced).toContain("did not exit after SIGKILL");
		expect(result.surfaced).toMatch(
			/"cleanup":"Owned server generation 2 did not exit after SIGKILL\.\\nOwned server paths: \{/,
		);
		expect(result.surfaced).toContain("refusing to start another");
		expect(result.retainedPid).toBe(1_002);
		expect(result.disposed).toBeTrue();
		expect(result.vaultExists).toBeFalse();
	});
});
