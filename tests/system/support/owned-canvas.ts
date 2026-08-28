import fs from "node:fs";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

type Exit = { code: number | null; signal: NodeJS.Signals | null; expected: boolean };
type Environment = Readonly<Record<string, string | undefined>>;

export interface StartOwnedCanvasOptions {
	serverPath: string;
	port: number;
	vault: string;
	env?: Environment;
}

export interface RestartOwnedCanvasOptions {
	signal?: NodeJS.Signals;
	whileStopped?: () => void | Promise<void>;
}

export interface OwnedCanvas {
	readonly base: string;
	readonly vault: string;
	readonly pid: number | null;
	readonly stderr: string;
	assertRunning(cause?: unknown): Promise<void>;
	restart(options?: RestartOwnedCanvasOptions): Promise<void>;
	dispose(): Promise<void>;
}

interface Registration {
	dispose(): Promise<void>;
	disposeSync(): void;
}

type OwnedChild = ChildProcessByStdio<null, null, Readable>;

const activeCanvases = new Set<Registration>();
let handlersInstalled = false;
let interruptionInProgress = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const processExists = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

function uninstallHandlers(): void {
	if (!handlersInstalled || activeCanvases.size > 0) return;
	process.off("SIGINT", onSigint);
	process.off("SIGTERM", onSigterm);
	process.off("exit", onExit);
	handlersInstalled = false;
}

async function disposeForSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interruptionInProgress) return;
	interruptionInProgress = true;
	await Promise.allSettled([...activeCanvases].map((canvas) => canvas.dispose()));
	process.exit(signal === "SIGINT" ? 130 : 143);
}

function onSigint(): void {
	void disposeForSignal("SIGINT");
}

function onSigterm(): void {
	void disposeForSignal("SIGTERM");
}

function onExit(): void {
	for (const canvas of activeCanvases) canvas.disposeSync();
}

function installHandlers(): void {
	if (handlersInstalled) return;
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);
	process.on("exit", onExit);
	handlersInstalled = true;
}

const exitDescription = ({ code, signal }: Exit): string =>
	signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;

export async function startOwnedCanvas({
	serverPath,
	port,
	vault,
	env = {},
}: StartOwnedCanvasOptions): Promise<OwnedCanvas> {
	const base = `http://127.0.0.1:${port}`;
	let child: OwnedChild | null = null;
	let childExit: Exit | null = null;
	let exitPromise: Promise<Exit> | null = null;
	let expectedStop = false;
	let disposed = false;
	let disposalPromise: Promise<void> | null = null;
	let operation: Promise<void> = Promise.resolve();
	let stderr = "";
	let registration: Registration;

	const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
		const result = operation.then(work);
		operation = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};
	const refuseDisposed = (): void => {
		if (disposed) throw new Error("Cannot restart a disposed canvas process.");
	};
	const childPid = (): number => {
		if (child?.pid === undefined) throw new Error("Owned canvas has no process id.");
		return child.pid;
	};
	const deathError = (cause?: unknown): Error & { code: string } => {
		const detail = childExit ? exitDescription(childExit) : "is no longer running";
		const tail = stderr.trim().split("\n").slice(-20).join("\n");
		const error = new Error(
			`Owned canvas pid ${child?.pid ?? "unknown"} died (${detail}).` +
				(tail ? `\nCanvas stderr:\n${tail}` : ""),
			{ cause },
		) as Error & { code: string };
		error.code = "CANVAS_PROCESS_DIED";
		return error;
	};
	const assertRunningNow = (cause?: unknown): void => {
		if (childExit || child?.exitCode !== null || child?.signalCode !== null) {
			throw deathError(cause);
		}
	};
	const assertRunning = async (cause?: unknown): Promise<void> => {
		if (cause && child && !childExit && child.exitCode === null && exitPromise) {
			await Promise.race([exitPromise, sleep(TEST_CANVAS_HEALTH_POLL_MS)]);
		}
		assertRunningNow(cause);
	};
	const waitForExit = async (timeoutMs: number): Promise<boolean> => {
		if (!exitPromise || childExit) return true;
		return Promise.race([exitPromise.then(() => true), sleep(timeoutMs).then(() => false)]);
	};
	const stopCurrent = async (signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
		if (!child || childExit) return;
		expectedStop = true;
		child.kill(signal);
		if (!(await waitForExit(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS)) && processExists(childPid())) {
			child.kill("SIGKILL");
			await waitForExit(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
		}
		if (!childExit && processExists(childPid())) {
			throw new Error(`Owned canvas pid ${childPid()} did not exit after SIGKILL.`);
		}
	};
	const start = async (): Promise<void> => {
		refuseDisposed();
		childExit = null;
		expectedStop = false;
		child = spawn(process.execPath, [serverPath], {
			env: {
				...process.env,
				...env,
				PORT: String(port),
				HOST: "127.0.0.1",
				ARCHBOARD_VAULT: vault,
				LOG_LEVEL: "error",
			},
			stdio: ["ignore", "ignore", "pipe"],
		});
		const startedChild = child;
		const startedPid = childPid();
		stderr += stderr ? `\n--- canvas restart pid ${startedPid} ---\n` : "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		exitPromise = new Promise((resolve) => {
			startedChild.once("exit", (code, signal) => {
				childExit = { code, signal, expected: expectedStop };
				resolve(childExit);
			});
		});

		const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
		while (Date.now() < deadline) {
			assertRunningNow();
			try {
				const response = await fetch(`${base}/health`, {
					signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
				});
				const health = (await response.json()) as { pid?: number };
				if (health.pid === startedPid) return;
				throw new Error(
					`Port ${port} answered for pid ${health.pid ?? "unknown"}, not owned pid ${startedPid}.`,
				);
			} catch (error) {
				if (error instanceof Error && /answered for pid/.test(error.message)) throw error;
				assertRunningNow(error);
				await sleep(TEST_CANVAS_HEALTH_POLL_MS);
			}
		}
		throw new Error(
			`Owned canvas pid ${startedPid} did not answer /health within ${TEST_CANVAS_STARTUP_TIMEOUT_MS}ms.` +
				(stderr.trim() ? `\nCanvas stderr:\n${stderr.trim()}` : ""),
		);
	};
	const disposeSync = (): void => {
		disposed = true;
		if (child && !childExit && processExists(childPid())) child.kill("SIGKILL");
		fs.rmSync(vault, { recursive: true, force: true });
		activeCanvases.delete(registration);
	};

	const handle: OwnedCanvas = {
		base,
		vault,
		get pid() {
			return child?.pid ?? null;
		},
		get stderr() {
			return stderr;
		},
		assertRunning,
		restart(options = {}) {
			refuseDisposed();
			return enqueue(async () => {
				refuseDisposed();
				await stopCurrent(options.signal);
				await options.whileStopped?.();
				refuseDisposed();
				await start();
			});
		},
		dispose() {
			if (disposalPromise) return disposalPromise;
			disposed = true;
			disposalPromise = enqueue(async () => {
				try {
					await stopCurrent();
				} finally {
					fs.rmSync(vault, { recursive: true, force: true });
					activeCanvases.delete(registration);
					uninstallHandlers();
				}
			});
			return disposalPromise;
		},
	};

	registration = { dispose: () => handle.dispose(), disposeSync };
	activeCanvases.add(registration);
	installHandlers();
	try {
		await enqueue(start);
		return handle;
	} catch (error) {
		await handle.dispose();
		throw error;
	}
}
