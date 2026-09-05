import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { isOwnedCanvasNamespaceRoot, processExists } from "./owned-canvas.ts";

type JsonRecord = Readonly<Record<string, unknown>>;

interface OwnedRecord {
	readonly marker: "owned-canvas";
	readonly mode: string;
	readonly pid: number;
	readonly vault: string;
	readonly base: string;
	readonly namespaceRoot: string;
	readonly at: number;
}

interface ReplacementRecord {
	readonly marker: "replacement-canvas";
	readonly mode: string;
	readonly pid: number;
	readonly vault: string;
	readonly base: string;
}

interface ChildResult {
	readonly code: number | null;
	readonly stderr: string;
	readonly records: JsonRecord[];
	readonly owned?: OwnedRecord;
	readonly replacement?: ReplacementRecord;
}

interface LifecycleTimeoutError extends Error {
	readonly records: JsonRecord[];
	readonly harnessPid: number;
	readonly owned?: OwnedRecord;
	readonly replacement?: ReplacementRecord;
	readonly signals: string[];
}

interface LifecycleChildOptions {
	readonly timeoutMs?: number;
	readonly releaseFile?: string;
	readonly onRecord?: (record: JsonRecord) => void;
	readonly timeoutAfterRecord?: string;
	readonly spawnWatchdogMs?: number;
}

const isRecord = (value: unknown): value is JsonRecord =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const parseRecords = (stdout: string): JsonRecord[] =>
	stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				const parsed: unknown = JSON.parse(line);
				return isRecord(parsed) ? [parsed] : [];
			} catch {
				return [];
			}
		});

const hasString = (record: JsonRecord, key: string): boolean => typeof record[key] === "string";
const hasNumber = (record: JsonRecord, key: string): boolean => typeof record[key] === "number";
const isOwnedRecord = (record: JsonRecord): record is JsonRecord & OwnedRecord =>
	record["marker"] === "owned-canvas" &&
	hasString(record, "mode") &&
	hasNumber(record, "pid") &&
	hasString(record, "vault") &&
	hasString(record, "base") &&
	hasString(record, "namespaceRoot") &&
	hasNumber(record, "at");
const isReplacementRecord = (record: JsonRecord): record is JsonRecord & ReplacementRecord =>
	record["marker"] === "replacement-canvas" &&
	hasString(record, "mode") &&
	hasNumber(record, "pid") &&
	hasString(record, "vault") &&
	hasString(record, "base");

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

function createLifecycleChildRunner(
	entrypoint: string,
): (mode: string, options?: Readonly<LifecycleChildOptions>) => Promise<ChildResult> {
	return async function runLifecycleChild(
		mode: string,
		{
			timeoutMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
			releaseFile,
			onRecord,
			timeoutAfterRecord,
			spawnWatchdogMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
		}: Readonly<LifecycleChildOptions> = {},
	): Promise<ChildResult> {
		const child = spawn(process.execPath, [entrypoint], {
			detached: true,
			env: {
				...process.env,
				ARCHBOARD_LIFECYCLE_CHILD: mode,
				...(releaseFile === undefined ? {} : { ARCHBOARD_LIFECYCLE_RELEASE_FILE: releaseFile }),
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		const ownedGroup = child.pid;
		if (ownedGroup === undefined) {
			throw new Error("Lifecycle harness has no process group.");
		}
		let stdout = "";
		let recordBuffer = "";
		let stderr = "";
		let interrupted = false;
		const timedOut = Symbol("lifecycle-timeout");
		let timeout: Timer | undefined;
		let resolveTimeout!: (outcome: typeof timedOut) => void;
		const timeoutOutcome = new Promise<typeof timedOut>((resolve) => {
			resolveTimeout = resolve;
		});
		let markerTimeoutArmed = timeoutAfterRecord === undefined;
		const armTimeout = (delayMs: number): void => {
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				resolveTimeout(timedOut);
			}, delayMs);
		};
		armTimeout(markerTimeoutArmed ? timeoutMs : spawnWatchdogMs);
		child.stdout.on("data", (...chunks: readonly unknown[]) => {
			const text = String(chunks[0]);
			stdout += text;
			recordBuffer += text;
			for (;;) {
				const newline = recordBuffer.indexOf("\n");
				if (newline === -1) {
					break;
				}
				const line = recordBuffer.slice(0, newline);
				recordBuffer = recordBuffer.slice(newline + 1);
				try {
					const parsed: unknown = JSON.parse(line);
					if (!isRecord(parsed)) {
						continue;
					}
					const record = parsed;
					onRecord?.(record);
					if (!markerTimeoutArmed && record["marker"] === timeoutAfterRecord) {
						markerTimeoutArmed = true;
						armTimeout(timeoutMs);
					}
				} catch {
					/* stderr retains malformed child protocol diagnostics */
				}
			}
			if (mode === "interrupt" && !interrupted && stdout.includes('"marker":"owned-canvas"')) {
				interrupted = true;
				child.kill("SIGINT");
			}
		});
		child.stderr.on("data", (...chunks: readonly unknown[]) => {
			stderr += String(chunks[0]);
		});
		const outcome = await Promise.race([
			new Promise<number | null>((resolve) => {
				child.once("exit", resolve);
			}),
			timeoutOutcome,
		]).finally(() => {
			clearTimeout(timeout);
		});
		const records = parseRecords(stdout);
		const owned = records.find((record) => isOwnedRecord(record));
		const replacement = records.find((record) => isReplacementRecord(record));
		if (outcome === timedOut) {
			const signals = ["harness:SIGTERM"];
			child.kill("SIGTERM");
			const exitedWithin = async (): Promise<boolean> => {
				if (child.exitCode !== null || child.signalCode !== null) {
					return true;
				}
				return Promise.race([
					new Promise<boolean>((resolve) => {
						child.once("exit", () => {
							resolve(true);
						});
					}),
					Bun.sleep(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS).then(() => false),
				]);
			};
			if (!(await exitedWithin())) {
				signals.push("group:SIGKILL");
				try {
					process.kill(-ownedGroup, "SIGKILL");
				} catch (error) {
					if (!isRecord(error) || error["code"] !== "ESRCH") {
						throw error;
					}
				}
			}
			const reaped = await exitedWithin();
			if (replacement !== undefined && reaped) {
				const reapedBy = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
				const waitForReplacementExit = async (): Promise<void> => {
					const stillAnswers =
						processExists(replacement.pid) || (await listenerAnswers(replacement.base));
					if (!stillAnswers || Date.now() >= reapedBy) {
						return;
					}
					await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
					await waitForReplacementExit();
				};
				await waitForReplacementExit();
			}
			const recordedVault = replacement?.vault ?? owned?.vault;
			if (
				reaped &&
				typeof recordedVault === "string" &&
				recordedVault.startsWith(path.join(os.tmpdir(), "archboard-lifecycle-child-"))
			) {
				fs.rmSync(recordedVault, { recursive: true, force: true });
			}
			if (reaped && owned !== undefined && isOwnedCanvasNamespaceRoot(owned.namespaceRoot)) {
				fs.rmSync(owned.namespaceRoot, { recursive: true, force: true });
			}
			const detail = reaped ? "did not exit before timeout" : "did not reap after owned group kill";
			throw Object.assign(new Error(`Lifecycle child ${mode} pid ${child.pid} ${detail}.`), {
				records,
				harnessPid: ownedGroup,
				...(owned === undefined ? {} : { owned }),
				...(replacement === undefined ? {} : { replacement }),
				signals,
			}) satisfies LifecycleTimeoutError;
		}
		return {
			code: outcome,
			stderr,
			records,
			...(owned === undefined ? {} : { owned }),
			...(replacement === undefined ? {} : { replacement }),
		};
	};
}

export { createLifecycleChildRunner, listenerAnswers };
export type { LifecycleTimeoutError, OwnedRecord, ReplacementRecord };
