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

export interface OwnedRecord {
	marker: "owned-canvas";
	mode: string;
	pid: number;
	vault: string;
	base: string;
	namespaceRoot: string;
	at: number;
}

export interface ReplacementRecord {
	marker: "replacement-canvas";
	mode: string;
	pid: number;
	vault: string;
	base: string;
}

interface ChildResult {
	code: number | null;
	stderr: string;
	records: Array<Record<string, unknown>>;
	owned?: OwnedRecord;
	replacement?: ReplacementRecord;
}

export interface LifecycleTimeoutError extends Error {
	records: Array<Record<string, unknown>>;
	harnessPid: number;
	owned?: OwnedRecord;
	replacement?: ReplacementRecord;
	signals: string[];
}

interface LifecycleChildOptions {
	timeoutMs?: number;
	releaseFile?: string;
	onRecord?: (record: Record<string, unknown>) => void;
	timeoutAfterRecord?: string;
	spawnWatchdogMs?: number;
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

export function createLifecycleChildRunner(
	entrypoint: string,
): (mode: string, options?: LifecycleChildOptions) => Promise<ChildResult> {
	return async function runLifecycleChild(
		mode: string,
		{
			timeoutMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
			releaseFile,
			onRecord,
			timeoutAfterRecord,
			spawnWatchdogMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
		}: LifecycleChildOptions = {},
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
		if (ownedGroup === undefined) throw new Error("Lifecycle harness has no process group.");
		let stdout = "";
		let recordBuffer = "";
		let stderr = "";
		let interrupted = false;
		const timedOut = Symbol("lifecycle-timeout");
		let timeout: Timer | undefined;
		let resolveTimeout!: (outcome: typeof timedOut) => void;
		const timeoutOutcome = new Promise<typeof timedOut>((resolve) => (resolveTimeout = resolve));
		let markerTimeoutArmed = timeoutAfterRecord === undefined;
		const armTimeout = (delayMs: number): void => {
			clearTimeout(timeout);
			timeout = setTimeout(() => resolveTimeout(timedOut), delayMs);
		};
		armTimeout(markerTimeoutArmed ? timeoutMs : spawnWatchdogMs);
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
					const record = JSON.parse(line) as Record<string, unknown>;
					onRecord?.(record);
					if (!markerTimeoutArmed && record.marker === timeoutAfterRecord) {
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
		child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
		const outcome = await Promise.race([
			new Promise<number | null>((resolve) => child.once("exit", resolve)),
			timeoutOutcome,
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
			if (
				reaped &&
				recordedVault?.startsWith(path.join(os.tmpdir(), "archboard-lifecycle-child-"))
			) {
				fs.rmSync(recordedVault, { recursive: true, force: true });
			}
			if (reaped && owned && isOwnedCanvasNamespaceRoot(owned.namespaceRoot)) {
				fs.rmSync(owned.namespaceRoot, { recursive: true, force: true });
			}
			const detail = reaped ? "did not exit before timeout" : "did not reap after owned group kill";
			throw Object.assign(new Error(`Lifecycle child ${mode} pid ${child.pid} ${detail}.`), {
				records,
				harnessPid: ownedGroup,
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
	};
}

export async function listenerAnswers(base: string): Promise<boolean> {
	try {
		await fetch(`${base}/health`, {
			signal: AbortSignal.timeout(TEST_CANVAS_LISTENER_PROBE_TIMEOUT_MS),
		});
		return true;
	} catch {
		return false;
	}
}
