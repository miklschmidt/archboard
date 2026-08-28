import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_CASE_TIMEOUT_MARGIN_MS,
	TEST_CANVAS_CONCURRENT_RELEASE_DELAY_MS,
	TEST_CANVAS_EARLY_DEATH_DELAY_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { processExists, startOwnedCanvas, type OwnedCanvas } from "./owned-canvas.ts";

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

if (process.env.ARCHBOARD_LIFECYCLE_SERVER === "early-death") {
	Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env.PORT),
		fetch(request) {
			const pathname = new URL(request.url).pathname;
			if (pathname === "/health") return Response.json({ pid: process.pid });
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

interface OwnedRecord {
	marker: "owned-canvas";
	mode: string;
	pid: number;
	vault: string;
	base: string;
	at: number;
}

interface ReplacementRecord {
	marker: "replacement-canvas";
	mode: string;
	pid: number;
	vault: string;
	base: string;
}

interface RetiredRecord {
	marker: "retired-canvas";
	base: string;
}

const childMode = process.env.ARCHBOARD_LIFECYCLE_CHILD;
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
				at: Date.now(),
			} satisfies OwnedRecord),
		);
		if (childMode === "interrupt") await new Promise(() => undefined);
		if (childMode === "concurrent" || childMode === "concurrent-failure") {
			await Bun.sleep(Math.max(0, Number(process.env.ARCHBOARD_LIFECYCLE_RELEASE_AT) - Date.now()));
			if (childMode === "concurrent-failure") throw new Error("intentional concurrent failure");
		}
		if (childMode === "timeout") {
			await owned.restart({
				async whileStopped() {
					// oxlint-disable-next-line no-console -- JSON lines coordinate the external listener.
					console.log(
						JSON.stringify({
							marker: "retired-canvas",
							base: owned!.base,
						} satisfies RetiredRecord),
					);
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
		if (childMode === "normal") await Promise.all([owned.dispose(), owned.dispose()]);
		if (childMode === "failure") {
			let failed = false;
			try {
				await fetch("http://127.0.0.1:1/forced-fetch-failure");
			} catch {
				failed = true;
			} finally {
				await owned.dispose();
			}
			if (!failed) throw new Error("The lifecycle failure probe did not fail its fetch.");
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
		if (!owned) fs.rmSync(vault, { recursive: true, force: true });
		// oxlint-disable-next-line no-console -- the parent retains child diagnostics.
		console.error(error instanceof Error ? error.stack : String(error));
		process.exit(1);
	}
}

interface ChildResult {
	code: number | null;
	stderr: string;
	records: Array<Record<string, unknown>>;
	owned?: OwnedRecord;
	replacement?: ReplacementRecord;
}

interface LifecycleTimeoutError extends Error {
	records: Array<Record<string, unknown>>;
	owned?: OwnedRecord;
	replacement?: ReplacementRecord;
	signals: string[];
}

const parseRecords = (stdout: string): Array<Record<string, unknown>> =>
	stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as Record<string, unknown>];
			} catch {
				return [];
			}
		});

async function runLifecycleChild(
	mode: string,
	timeoutMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	releaseAt?: number,
	onRecord?: (record: Record<string, unknown>) => void,
): Promise<ChildResult> {
	const child = spawn(process.execPath, [thisFile], {
		detached: true,
		env: {
			...process.env,
			ARCHBOARD_LIFECYCLE_CHILD: mode,
			...(releaseAt === undefined ? {} : { ARCHBOARD_LIFECYCLE_RELEASE_AT: String(releaseAt) }),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	const ownedGroup = child.pid;
	if (ownedGroup === undefined) throw new Error("Lifecycle harness has no process group.");
	let stdout = "";
	let recordBuffer = "";
	let stderr = "";
	let interrupted = false;
	child.stdout.on("data", (chunk: Buffer) => {
		const text = chunk.toString();
		stdout += text;
		recordBuffer += text;
		for (;;) {
			const newline = recordBuffer.indexOf("\n");
			if (newline < 0) break;
			const line = recordBuffer.slice(0, newline);
			recordBuffer = recordBuffer.slice(newline + 1);
			try {
				onRecord?.(JSON.parse(line) as Record<string, unknown>);
			} catch {
				/* stderr retains malformed child protocol diagnostics */
			}
		}
		if (mode === "interrupt" && !interrupted && stdout.includes('"marker":"owned-canvas"')) {
			interrupted = true;
			child.kill("SIGINT");
		}
	});
	child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	const timedOut = Symbol("lifecycle-timeout");
	let timeout: Timer | undefined;
	const outcome = await Promise.race([
		new Promise<number | null>((resolve) => child.once("exit", resolve)),
		new Promise<typeof timedOut>((resolve) => {
			timeout = setTimeout(() => {
				resolve(timedOut);
			}, timeoutMs);
		}),
	]).finally(() => clearTimeout(timeout));
	const records = parseRecords(stdout);
	const owned = records.find((record) => record.marker === "owned-canvas") as
		| OwnedRecord
		| undefined;
	const replacement = records.find((record) => record.marker === "replacement-canvas") as
		| ReplacementRecord
		| undefined;
	if (outcome === timedOut) {
		const signals = ["harness:SIGTERM"];
		child.kill("SIGTERM");
		const exitedWithin = async (): Promise<boolean> => {
			if (child.exitCode !== null || child.signalCode !== null) return true;
			return Promise.race([
				new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
				Bun.sleep(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS).then(() => false),
			]);
		};
		if (!(await exitedWithin())) {
			signals.push("group:SIGKILL");
			try {
				process.kill(-ownedGroup, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
		}
		const reaped = await exitedWithin();
		if (replacement && reaped) {
			const reapedBy = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
			while (
				(processExists(replacement.pid) || (await listenerAnswers(replacement.base))) &&
				Date.now() < reapedBy
			) {
				await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
			}
		}
		const recordedVault = replacement?.vault ?? owned?.vault;
		if (reaped && recordedVault?.startsWith(path.join(os.tmpdir(), "archboard-lifecycle-child-"))) {
			fs.rmSync(recordedVault, { recursive: true, force: true });
		}
		const detail = reaped ? "did not exit before timeout" : "did not reap after owned group kill";
		throw Object.assign(new Error(`Lifecycle child ${mode} pid ${child.pid} ${detail}.`), {
			records,
			owned,
			replacement,
			signals,
		}) satisfies LifecycleTimeoutError;
	}
	return {
		code: outcome,
		stderr,
		records,
		owned,
		replacement,
	};
}

async function listenerAnswers(base: string): Promise<boolean> {
	try {
		await fetch(`${base}/health`, {
			signal: AbortSignal.timeout(TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS),
		});
		return true;
	} catch {
		return false;
	}
}

describe("owned canvas lifecycle", () => {
	const emergencyVaults = new Set<string>();
	afterAll(() => {
		for (const vault of emergencyVaults) fs.rmSync(vault, { recursive: true, force: true });
	});

	test("cleans mixed concurrent success and forced failure processes", async () => {
		const releaseAt = Date.now() + TEST_CANVAS_CONCURRENT_RELEASE_DELAY_MS;
		const results = await Promise.all(
			["concurrent", "concurrent", "concurrent-failure", "concurrent-failure"].map((mode) =>
				runLifecycleChild(mode, undefined, releaseAt),
			),
		);
		const owned = results.map((result) => result.owned!);
		expect(results.map((result) => result.code).toSorted((a, b) => (a ?? -1) - (b ?? -1))).toEqual([
			0, 0, 1, 1,
		]);
		expect(new Set(owned.map((record) => record.base)).size).toBe(4);
		expect(Math.max(...owned.map((record) => record.at))).toBeLessThan(releaseAt);
		for (const record of owned) {
			expect(processExists(record.pid)).toBeFalse();
			expect(await listenerAnswers(record.base)).toBeFalse();
			expect(fs.existsSync(record.vault)).toBeFalse();
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
				if (mode === "early-death") {
					const report = result.records.find((record) => record.marker === "early-death");
					expect({ marker: report?.marker, reported: String(report?.reported) }).toEqual({
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
			await runLifecycleChild("timeout", TEST_CANVAS_SHUTDOWN_TIMEOUT_MS, undefined, (record) => {
				if (record.marker !== "retired-canvas") return;
				const base = String(record.base);
				foreign = Bun.serve({
					hostname: "127.0.0.1",
					port: Number(new URL(base).port),
					fetch: () => Response.json({ pid: process.pid }),
				});
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
		expect(processExists(owned.pid)).toBeFalse();
		expect(processExists(replacement.pid)).toBeFalse();
		expect(await listenerAnswers(replacement.base)).toBeFalse();
		expect(fs.existsSync(owned.vault)).toBeFalse();
		expect(foreign).toBeDefined();
		expect(foreignSurvived).toBeTrue();
	});

	test("escalates and reaps before any replacement record exists", async () => {
		let failure: LifecycleTimeoutError | undefined;
		try {
			await runLifecycleChild("timeout-before-replacement", TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
		} catch (error) {
			failure = error as LifecycleTimeoutError;
		}
		const owned = failure!.owned!;
		expect(failure?.replacement).toBeUndefined();
		expect(failure?.signals).toEqual(["harness:SIGTERM", "group:SIGKILL"]);
		expect(processExists(owned.pid)).toBeFalse();
		expect(await listenerAnswers(owned.base)).toBeFalse();
		expect(fs.existsSync(owned.vault)).toBeFalse();
	});
});
