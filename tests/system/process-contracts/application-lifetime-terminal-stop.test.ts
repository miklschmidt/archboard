import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCanvasApplicationLifetime } from "../../../src/server/canvas/index.ts";
import { TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { processExists, waitForProcessExit } from "../support/owned-canvas.ts";

test("application timeout force-reaps a real process group before stop resolves", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-lifetime-terminal-stop-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	let identity: { pid: number; descendant: number } | null = null;
	try {
		const fixture = join(root, "owner.ts");
		writeFileSync(
			fixture,
			`import { spawn } from "node:child_process";\n` +
				`const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });\n` +
				`process.stdout.write(JSON.stringify({ pid: process.pid, descendant: descendant.pid }) + "\\n");\n` +
				`process.on("SIGTERM", () => {});\n` +
				`setInterval(() => {}, 1000);\n`,
		);
		chmodSync(fixture, 0o700);
		const child = spawn(process.execPath, [fixture], {
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (child.pid === undefined) {
			throw new Error("The process-group fixture has no pid.");
		}
		const group = child.pid;
		const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		resources.defer(async () => {
			try {
				process.kill(-group, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
					throw error;
				}
			}
			await exited;
			if (identity !== null) {
				await Promise.allSettled([
					waitForProcessExit(identity.pid),
					waitForProcessExit(identity.descendant),
				]);
			}
		});
		let output = "";
		identity = await Promise.race([
			new Promise<{ pid: number; descendant: number }>((resolve, reject) => {
				child.once("error", reject);
				child.stdout.on("data", (chunk: Buffer) => {
					output += chunk.toString();
					const newline = output.indexOf("\n");
					if (newline < 0) {
						return;
					}
					resolve(JSON.parse(output.slice(0, newline)) as { pid: number; descendant: number });
				});
			}),
			new Promise<never>((_resolve, reject) =>
				setTimeout(
					() => reject(new Error("The process-group fixture did not report readiness.")),
					TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
				),
			),
		]);
		let forced = false;
		const lifetime = createCanvasApplicationLifetime({
			resources: [
				{
					name: "real-process-group",
					stopGraceMs: 25,
					stop: async () => {
						process.kill(-group, "SIGTERM");
						await exited;
					},
					forceStop: async () => {
						forced = true;
						process.kill(-group, "SIGKILL");
						await exited;
					},
				},
			],
		});
		await lifetime.start();
		await lifetime.stop("test");

		expect(forced).toBeTrue();
		await waitForProcessExit(identity.pid);
		await waitForProcessExit(identity.descendant);
		expect(processExists(identity.pid)).toBeFalse();
		expect(processExists(identity.descendant)).toBeFalse();
	} finally {
		await resources.disposeAsync();
	}
}, 10_000);

test("process-owner setup failures always reap the group and remove the root", async () => {
	for (const mode of ["spawn-error", "malformed", "assertion", "timeout"] as const) {
		const resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), `archboard-lifetime-${mode}-`));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		let pid: number | undefined;
		let failure: unknown = null;
		try {
			const fixture = join(root, "owner.ts");
			if (mode !== "spawn-error") {
				const readiness =
					mode === "timeout"
						? ""
						: mode === "malformed"
							? `process.stdout.write("not-json\\n");\n`
							: `process.stdout.write(JSON.stringify({ pid: process.pid }) + "\\n");\n`;
				writeFileSync(fixture, `${readiness}setInterval(() => {}, 1000);\n`);
			}
			const child = spawn(
				mode === "spawn-error" ? join(root, "missing-executable") : process.execPath,
				mode === "spawn-error" ? [] : [fixture],
				{ detached: true, stdio: ["ignore", "pipe", "pipe"] },
			);
			pid = child.pid;
			const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
			resources.defer(async () => {
				if (pid !== undefined) {
					try {
						process.kill(-pid, "SIGKILL");
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
							throw error;
						}
					}
				} else {
					child.kill("SIGKILL");
				}
				await closed;
			});

			let timeout: ReturnType<typeof setTimeout> | null = null;
			try {
				const identity = await Promise.race([
					new Promise<{ pid: number }>((resolve, reject) => {
						child.once("error", reject);
						let output = "";
						child.stdout.on("data", (chunk: Buffer) => {
							output += chunk.toString();
							const newline = output.indexOf("\n");
							if (newline < 0) {
								return;
							}
							try {
								const parsed = JSON.parse(output.slice(0, newline)) as { pid?: unknown };
								if (typeof parsed.pid !== "number") {
									throw new Error("Malformed readiness identity.");
								}
								resolve({ pid: parsed.pid });
							} catch (error) {
								reject(error);
							}
						});
					}),
					new Promise<never>((_resolve, reject) => {
						timeout = setTimeout(
							() => reject(new Error("Fixture readiness timed out.")),
							TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
						);
					}),
				]);
				if (mode === "assertion") {
					expect(identity.pid).toBe(-1);
				}
			} finally {
				if (timeout !== null) {
					clearTimeout(timeout);
				}
			}
		} catch (error) {
			failure = error;
		} finally {
			await resources.disposeAsync();
		}
		expect(failure).toBeInstanceOf(Error);
		if (pid !== undefined) {
			expect(processExists(pid)).toBeFalse();
		}
		expect(existsSync(root)).toBeFalse();
	}
}, 10_000);
