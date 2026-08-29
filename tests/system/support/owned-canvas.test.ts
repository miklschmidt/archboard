import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { TEST_CANVAS_HEALTH_POLL_MS } from "../../../src/shared/timing/timing.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const serverPath = path.join(repoRoot, "src/server.ts");
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

if (process.env.ARCHBOARD_LIFECYCLE_SERVER === "collision") {
	// oxlint-disable-next-line no-console -- child stderr is the collision diagnostic fixture.
	console.error(`EADDRINUSE fixture on ${process.env.PORT}`);
	process.exit(98);
}

if (process.env.ARCHBOARD_FAILED_REAP_CHILD === "1") {
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
					if (this.exitCode !== null) return;
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
	const ownedCanvasUrl = new URL("./owned-canvas.ts", import.meta.url).href;
	const { startOwnedCanvas: startMockedCanvas } = await import(ownedCanvasUrl);
	const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-failed-reap-"));
	const canvas = await startMockedCanvas({ serverPath, vault });
	let surfaced = "";
	try {
		await canvas.restart();
	} catch (error) {
		surfaced = error instanceof Error ? error.message : String(error);
	}
	const retainedPid = canvas.pid;
	allowFailedGenerationExit = true;
	await canvas.dispose();
	// oxlint-disable-next-line no-console -- JSON is the isolated child protocol.
	console.log(
		JSON.stringify({
			spawnCount,
			surfaced,
			retainedPid,
			disposed: canvas.pid === null,
			vaultExists: fs.existsSync(vault),
		}),
	);
	process.exit(0);
}

const { processExists, startOwnedCanvas, waitForProcessExit } = await import("./owned-canvas.ts");

describe("owned canvas direct lifecycle", () => {
	const emergencyVaults = new Set<string>();
	afterAll(() => {
		for (const vault of emergencyVaults) fs.rmSync(vault, { recursive: true, force: true });
	});

	test("observes a retained short-lived child until delayed disappearance", async () => {
		const child = Bun.spawn(
			[process.execPath, "-e", `await Bun.sleep(${TEST_CANVAS_HEALTH_POLL_MS * 10})`],
			{ stdout: "ignore", stderr: "ignore" },
		);
		try {
			expect(processExists(child.pid)).toBeTrue();
			await waitForProcessExit(child.pid);
			expect(await child.exited).toBe(0);
		} finally {
			if (child.exitCode === null) child.kill("SIGKILL");
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
		const timeoutMs = TEST_CANVAS_HEALTH_POLL_MS * 2;
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
		const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
		emergencyVaults.add(vault);
		const canvas = await startOwnedCanvas({ serverPath, vault });
		try {
			const health = (await fetch(`${canvas.base}/health`).then((response) => response.json())) as {
				pid: number;
			};
			expect(health.pid).toBe(canvas.pid!);
			expect(Number(new URL(canvas.base).port)).toBeGreaterThan(0);
		} finally {
			await canvas.dispose();
		}
	});

	test("reallocates an automatic port stolen after the retired generation exits", async () => {
		const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
		emergencyVaults.add(vault);
		const canvas = await startOwnedCanvas({ serverPath, vault });
		const retiredBase = canvas.base;
		const retiredPid = canvas.pid;
		let foreign: ReturnType<typeof Bun.serve> | undefined;
		try {
			await canvas.restart({
				whileStopped() {
					expect(canvas.base).toBe(retiredBase);
					expect(canvas.pid).toBeNull();
					foreign = Bun.serve({
						hostname: "127.0.0.1",
						port: Number(new URL(retiredBase).port),
						fetch: () => Response.json({ pid: process.pid }),
					});
				},
			});
			expect(canvas.base).not.toBe(retiredBase);
			expect(canvas.pid).not.toBe(retiredPid);
			expect(
				await fetch(`${canvas.base}/health`).then((response) => response.json()),
			).toMatchObject({
				status: "healthy",
				service: "mcp-excalidraw-canvas",
				pid: canvas.pid,
			});
			expect(await fetch(`${retiredBase}/health`).then((response) => response.json())).toEqual({
				pid: process.pid,
			});
		} finally {
			void foreign?.stop(true);
			await canvas.dispose();
		}
	});

	test("bounds repeated bind collisions with all attempt diagnostics", async () => {
		const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
		emergencyVaults.add(vault);
		let failure: Error | undefined;
		try {
			await startOwnedCanvas({
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
		expect(fs.existsSync(vault)).toBeFalse();
	});

	test("refuses a foreign pid and never reallocates an explicit restart", async () => {
		const port = await probeLoopbackPort();
		const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-foreign-pid-"));
		emergencyVaults.add(vault);
		const canvas = await startOwnedCanvas({ serverPath, port, vault });
		let foreign: ReturnType<typeof Bun.serve> | undefined;
		try {
			let failure: unknown;
			try {
				await canvas.restart({
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
			expect(canvas.base).toBe(`http://127.0.0.1:${port}`);
			expect(await fetch(`${canvas.base}/health`).then((response) => response.json())).toEqual({
				pid: process.pid,
			});
		} finally {
			void foreign?.stop(true);
			await canvas.dispose();
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
		expect(result.surfaced).toContain("refusing to start another");
		expect(result.retainedPid).toBe(1_002);
		expect(result.disposed).toBeTrue();
		expect(result.vaultExists).toBeFalse();
	});
});
