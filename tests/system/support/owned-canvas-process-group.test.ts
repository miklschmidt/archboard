import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS,
	TEST_CANVAS_EARLY_DEATH_DELAY_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { processExists, startOwnedCanvas, type OwnedCanvas } from "./owned-canvas.ts";
import {
	createLifecycleChildRunner,
	listenerAnswers,
	type LifecycleTimeoutError,
	type OwnedRecord,
	type ReplacementRecord,
} from "./owned-canvas-process-group-runner.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverPath = path.join(repoRoot, "src/server.ts");
const thisFile = fileURLToPath(import.meta.url);

async function readJson(canvas: OwnedCanvas, responsePromise: Promise<Response>): Promise<unknown> {
	await canvas.assertRunning();
	try {
		const response = await responsePromise;
		await canvas.assertRunning();
		const body = await response.json();
		await canvas.assertRunning();
		return body;
	} catch (error) {
		await canvas.assertRunning(error);
		throw error;
	}
}

if (process.env["ARCHBOARD_LIFECYCLE_SERVER"] === "early-death") {
	Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env["PORT"]),
		fetch(request) {
			const pathname = new URL(request.url).pathname;
			if (pathname === "/health") {
				return Response.json({ pid: process.pid });
			}
			if (pathname === "/die-after-headers") {
				const body = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('{"unfinished":'));
						// oxlint-disable-next-line no-console -- child stderr is the contract under test.
						console.error("intentional early canvas death after response headers");
						setTimeout(() => process.exit(23), TEST_CANVAS_EARLY_DEATH_DELAY_MS);
					},
				});
				return new Response(body, {
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response("not found", { status: 404 });
		},
	});
	await new Promise(() => undefined);
}

const childMode = process.env["ARCHBOARD_LIFECYCLE_CHILD"];
if (childMode) {
	const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
	let owned: OwnedCanvas | undefined;
	try {
		owned = await startOwnedCanvas({
			serverPath: childMode === "early-death" ? thisFile : serverPath,
			vault,
			...(childMode === "early-death"
				? { env: { ARCHBOARD_LIFECYCLE_SERVER: "early-death" } }
				: {}),
		});
		// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
		console.log(
			JSON.stringify({
				marker: "owned-canvas",
				mode: childMode,
				pid: owned.pid!,
				vault,
				base: owned.base,
				namespaceRoot: owned.paths.root,
				at: Date.now(),
			} satisfies OwnedRecord),
		);
		if (childMode === "interrupt") {
			await new Promise(() => undefined);
		}
		if (childMode === "concurrent" || childMode === "concurrent-failure") {
			const releaseFile = process.env["ARCHBOARD_LIFECYCLE_RELEASE_FILE"];
			if (!releaseFile) {
				throw new Error("Concurrent lifecycle child has no release file.");
			}
			while (!fs.existsSync(releaseFile)) {
				await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
			}
			if (childMode === "concurrent-failure") {
				throw new Error("intentional concurrent failure");
			}
		}
		if (childMode === "timeout") {
			await owned.restart({
				async whileStopped() {
					// oxlint-disable-next-line no-console -- JSON lines coordinate the external listener.
					console.log(JSON.stringify({ marker: "retired-canvas", base: owned!.base }));
					const deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
					while (!(await listenerAnswers(owned!.base)) && Date.now() < deadline) {
						await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
					}
				},
			});
			// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
			console.log(
				JSON.stringify({
					marker: "replacement-canvas",
					mode: childMode,
					pid: owned.pid!,
					vault,
					base: owned.base,
				} satisfies ReplacementRecord),
			);
			process.removeAllListeners("SIGTERM");
			process.on("SIGTERM", () => undefined);
			await new Promise(() => undefined);
		}
		if (childMode === "timeout-before-replacement") {
			await owned.restart({
				whileStopped() {
					process.removeAllListeners("SIGTERM");
					process.on("SIGTERM", () => undefined);
					return new Promise(() => undefined);
				},
			});
		}
		if (childMode === "normal") {
			await Promise.all([owned.dispose(), owned.dispose()]);
		}
		if (childMode === "failure") {
			let failed = false;
			try {
				await fetch("http://127.0.0.1:1/forced-fetch-failure");
			} catch {
				failed = true;
			} finally {
				await owned.dispose();
			}
			if (!failed) {
				throw new Error("The lifecycle failure probe did not fail its fetch.");
			}
		}
		if (childMode === "restart-dispose-race") {
			let releaseRestart!: () => void;
			let reachedStopped!: () => void;
			const stopped = new Promise<void>((resolve) => (reachedStopped = resolve));
			const restartGate = new Promise<void>((resolve) => (releaseRestart = resolve));
			const restart = owned.restart({
				whileStopped: () => {
					reachedStopped();
					return restartGate;
				},
			});
			await stopped;
			const disposal = owned.dispose();
			releaseRestart();
			let restartError: unknown;
			try {
				await restart;
			} catch (error) {
				restartError = error;
			}
			await disposal;
			if (
				!(restartError instanceof Error) ||
				!/disposed canvas process/.test(restartError.message)
			) {
				throw new Error(`Restart escaped concurrent disposal as pid ${owned.pid ?? "unknown"}.`);
			}
			// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
			console.log(JSON.stringify({ marker: "restart-race", restartRejected: true }));
		}
		if (childMode === "early-death") {
			let reported = "";
			try {
				await readJson(owned, fetch(`${owned.base}/die-after-headers`));
			} catch (error) {
				reported = error instanceof Error ? error.message : String(error);
			}
			if (!/died/.test(reported) || !/intentional early canvas death/.test(reported)) {
				throw new Error(`Early death was not reported with stderr: ${reported}`);
			}
			// oxlint-disable-next-line no-console -- JSON lines are the child protocol.
			console.log(JSON.stringify({ marker: "early-death", reported }));
		}
		await owned.dispose();
		process.exit(0);
	} catch (error) {
		await owned?.dispose();
		if (!owned) {
			fs.rmSync(vault, { recursive: true, force: true });
		}
		// oxlint-disable-next-line no-console -- the parent retains child diagnostics.
		console.error(error instanceof Error ? error.stack : String(error));
		process.exit(1);
	}
}

const runLifecycleChild = createLifecycleChildRunner(thisFile);

describe("owned canvas lifecycle", () => {
	const emergencyVaults = new Set<string>();
	afterAll(() => {
		for (const vault of emergencyVaults) {
			fs.rmSync(vault, { recursive: true, force: true });
		}
	});

	test("cleans mixed concurrent success and forced failure processes", async () => {
		await using resources = new AsyncDisposableStack();
		const coordinationRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "archboard-lifecycle-concurrent-"),
		);
		resources.defer(() => fs.rmSync(coordinationRoot, { recursive: true, force: true }));
		const releaseFile = path.join(coordinationRoot, "release");
		const ready = new Set<string>();
		const releaseWhenAllAreOwned = (record: Record<string, unknown>): void => {
			if (record["marker"] !== "owned-canvas" || typeof record["base"] !== "string") {
				return;
			}
			ready.add(record["base"]);
			if (ready.size === 4) {
				fs.writeFileSync(releaseFile, "release\n");
			}
		};
		const results = await Promise.all(
			["concurrent", "concurrent", "concurrent-failure", "concurrent-failure"].map((mode) =>
				runLifecycleChild(mode, { releaseFile, onRecord: releaseWhenAllAreOwned }),
			),
		);
		const owned = results.map((result) => result.owned!);
		expect(results.map((result) => result.code).toSorted((a, b) => (a ?? -1) - (b ?? -1))).toEqual([
			0, 0, 1, 1,
		]);
		expect(new Set(owned.map((record) => record.base)).size).toBe(4);
		expect(ready.size).toBe(4);
		expect(fs.existsSync(releaseFile)).toBeTrue();
		for (const record of owned) {
			expect(processExists(record.pid)).toBeFalse();
			expect(await listenerAnswers(record.base)).toBeFalse();
			expect(fs.existsSync(record.vault)).toBeFalse();
			expect(fs.existsSync(record.namespaceRoot)).toBeFalse();
		}
	});

	for (const mode of ["normal", "failure", "interrupt", "early-death", "restart-dispose-race"]) {
		test(
			`cleans up after ${mode}`,
			async () => {
				const result = await runLifecycleChild(mode);
				expect(result.code).toBe(mode === "interrupt" ? 130 : 0);
				expect(result.owned).toBeDefined();
				const owned = result.owned!;
				emergencyVaults.add(owned.vault);
				expect(processExists(owned.pid)).toBeFalse();
				expect(await listenerAnswers(owned.base)).toBeFalse();
				expect(fs.existsSync(owned.vault)).toBeFalse();
				expect(fs.existsSync(owned.namespaceRoot)).toBeFalse();
				if (mode === "early-death") {
					const report = result.records.find((record) => record["marker"] === "early-death");
					expect({ marker: report?.["marker"], reported: String(report?.["reported"]) }).toEqual({
						marker: "early-death",
						reported: expect.stringMatching(
							/(?=.*died)(?=.*intentional early canvas death after response headers)/s,
						),
					});
				}
				if (mode === "restart-dispose-race") {
					expect(result.records).toContainEqual({
						marker: "restart-race",
						restartRejected: true,
					});
				}
			},
			TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS + TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS,
		);
	}

	test("cleans recorded original and replacement ownership after a harness timeout", async () => {
		let failure: LifecycleTimeoutError | undefined;
		let foreign: ReturnType<typeof Bun.serve> | undefined;
		try {
			await runLifecycleChild("timeout", {
				timeoutMs: TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
				onRecord(record) {
					if (record["marker"] !== "retired-canvas") {
						return;
					}
					const base = String(record["base"]);
					foreign = Bun.serve({
						hostname: "127.0.0.1",
						port: Number(new URL(base).port),
						fetch: () => Response.json({ pid: process.pid }),
					});
				},
				timeoutAfterRecord: "replacement-canvas",
			});
		} catch (error) {
			failure = error as LifecycleTimeoutError;
		}
		const foreignSurvived = failure?.owned ? await listenerAnswers(failure.owned.base) : false;
		void foreign?.stop(true);
		expect(failure?.message).toContain("did not exit");
		expect(failure?.owned).toBeDefined();
		expect(failure?.replacement).toBeDefined();
		const owned = failure!.owned!;
		const replacement = failure!.replacement!;
		emergencyVaults.add(owned.vault);
		expect(replacement.pid).not.toBe(owned.pid);
		expect(failure!.signals).toEqual(["harness:SIGTERM", "group:SIGKILL"]);
		expect(failure!.signals.some((target) => target.includes(String(owned.pid)))).toBeFalse();
		expect([owned.pid, replacement.pid].map(processExists)).toEqual([false, false]);
		expect(await listenerAnswers(replacement.base)).toBeFalse();
		expect(fs.existsSync(owned.vault)).toBeFalse();
		expect(fs.existsSync(owned.namespaceRoot)).toBeFalse();
		expect(foreign).toBeDefined();
		expect(foreignSurvived).toBeTrue();
	});

	test("keeps the spawn watchdog when the scenario marker never arrives", async () => {
		let failure: LifecycleTimeoutError | undefined;
		try {
			await runLifecycleChild("timeout-before-replacement", {
				timeoutAfterRecord: "replacement-canvas",
				spawnWatchdogMs: TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
			});
		} catch (error) {
			failure = error as LifecycleTimeoutError;
		}
		const owned = failure!.owned!;
		expect(failure?.message).toContain("did not exit");
		expect(failure?.replacement).toBeUndefined();
		expect(failure?.signals).toEqual(["harness:SIGTERM", "group:SIGKILL"]);
		expect([failure!.harnessPid, owned.pid].map(processExists)).toEqual([false, false]);
		expect(await listenerAnswers(owned.base)).toBeFalse();
		expect(fs.existsSync(owned.vault)).toBeFalse();
		expect(fs.existsSync(owned.namespaceRoot)).toBeFalse();
	});
});
