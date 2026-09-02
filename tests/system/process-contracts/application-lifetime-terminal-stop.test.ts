import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCanvasApplicationLifetime } from "../../../src/server/canvas/index.ts";
import { processExists, waitForProcessExit } from "../support/owned-canvas.ts";

test("application timeout force-reaps a real process group before stop resolves", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-lifetime-terminal-stop-"));
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
	if (child.pid === undefined) throw new Error("The process-group fixture has no pid.");
	const group = child.pid;
	let output = "";
	const identity = await new Promise<{ pid: number; descendant: number }>((resolve, reject) => {
		child.once("error", reject);
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
			const newline = output.indexOf("\n");
			if (newline < 0) return;
			resolve(JSON.parse(output.slice(0, newline)) as { pid: number; descendant: number });
		});
	});
	const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
	let forced = false;
	let testFailure: unknown = null;
	try {
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
	} catch (error) {
		testFailure = error;
	}
	let cleanupFailure: unknown = null;
	try {
		if (processExists(identity.pid) || processExists(identity.descendant)) {
			try {
				process.kill(-group, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
			await Promise.allSettled([
				waitForProcessExit(identity.pid),
				waitForProcessExit(identity.descendant),
			]);
		}
		rmSync(root, { recursive: true, force: true });
	} catch (error) {
		cleanupFailure = error;
	}
	if (testFailure !== null && cleanupFailure !== null)
		throw new AggregateError([testFailure, cleanupFailure], "Test and cleanup both failed.");
	if (testFailure !== null) throw testFailure;
	if (cleanupFailure !== null) throw cleanupFailure;
}, 10_000);
