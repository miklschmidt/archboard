import fs from "node:fs";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

type Exit = { code: number | null; signal: NodeJS.Signals | null; expected: boolean };
type Environment = Readonly<Record<string, string | undefined>>;
type OwnedChild = ChildProcessByStdio<null, null, Readable>;

export interface StartOwnedCanvasOptions {
	serverPath: string;
	port?: number;
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

interface Generation {
	number: number;
	child: OwnedChild;
	pid: number;
	port: number;
	base: string;
	expectedStop: boolean;
	exit: Exit | null;
	exitPromise: Promise<Exit>;
	stderr: string;
}

interface AttemptRecord {
	port: number;
	pid: number;
	exit: string;
	foreignPid?: number;
	stderr: string;
	cleanup: string;
}

class AttemptError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
		readonly foreignPid?: number,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

const activeCanvases = new Set<Registration>();
let handlersInstalled = false;
let interruptionInProgress = false;
const MAX_START_ATTEMPTS = 8;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const processExists = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

async function automaticPort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once("error", reject);
		probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = probe.address();
	if (!address || typeof address === "string") {
		probe.close();
		throw new Error("The OS port probe did not report a TCP address.");
	}
	await new Promise<void>((resolve, reject) =>
		probe.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

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

const exitDescription = (exit: Exit | null): string =>
	exit?.signal ? `signal ${exit.signal}` : `exit ${exit?.code ?? "unknown"}`;
const tail = (text: string): string => text.trim().split("\n").slice(-20).join("\n");

export async function startOwnedCanvas({
	serverPath,
	port: explicitPort,
	vault,
	env = {},
}: StartOwnedCanvasOptions): Promise<OwnedCanvas> {
	let currentGeneration: Generation | null = null;
	let visibleBase = explicitPort ? `http://127.0.0.1:${explicitPort}` : "";
	let nextGeneration = 1;
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
	const deathError = (generation: Generation | null, cause?: unknown): Error & { code: string } => {
		const detail = generation ? exitDescription(generation.exit) : "has no live generation";
		const diagnostic = tail(stderr);
		const error = new Error(
			`Owned canvas pid ${generation?.pid ?? "unknown"} died (${detail}).` +
				(diagnostic ? `\nCanvas stderr:\n${diagnostic}` : ""),
			{ cause },
		) as Error & { code: string };
		error.code = "CANVAS_PROCESS_DIED";
		return error;
	};
	const assertGenerationRunning = (generation: Generation | null, cause?: unknown): void => {
		if (
			!generation ||
			generation.exit ||
			generation.child.exitCode !== null ||
			generation.child.signalCode !== null
		) {
			throw deathError(generation, cause);
		}
	};
	const assertRunning = async (cause?: unknown): Promise<void> => {
		const generation = currentGeneration;
		if (cause && generation && !generation.exit) {
			await Promise.race([generation.exitPromise, sleep(TEST_CANVAS_HEALTH_POLL_MS)]);
		}
		assertGenerationRunning(generation, cause);
	};
	const waitForExit = (generation: Generation, timeoutMs: number): Promise<boolean> =>
		Promise.race([generation.exitPromise.then(() => true), sleep(timeoutMs).then(() => false)]);
	const stopGeneration = async (
		generation: Generation,
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<void> => {
		if (!generation.exit) {
			generation.expectedStop = true;
			generation.child.kill(signal);
			if (!(await waitForExit(generation, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS))) {
				generation.child.kill("SIGKILL");
				await waitForExit(generation, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
			}
		}
		if (!generation.exit) {
			throw new Error(`Owned canvas generation ${generation.number} did not exit after SIGKILL.`);
		}
		if (currentGeneration === generation) currentGeneration = null;
	};
	const startAttempt = async (candidate: number): Promise<Generation> => {
		const child = spawn(process.execPath, [serverPath], {
			env: {
				...process.env,
				...env,
				PORT: String(candidate),
				HOST: "127.0.0.1",
				ARCHBOARD_VAULT: vault,
				LOG_LEVEL: "error",
			},
			stdio: ["ignore", "ignore", "pipe"],
		});
		if (child.pid === undefined) throw new Error("Owned canvas has no process id.");
		let resolveExit!: (exit: Exit) => void;
		const generation: Generation = {
			number: nextGeneration++,
			child,
			pid: child.pid,
			port: candidate,
			base: `http://127.0.0.1:${candidate}`,
			expectedStop: false,
			exit: null,
			exitPromise: new Promise((resolve) => (resolveExit = resolve)),
			stderr: "",
		};
		currentGeneration = generation;
		visibleBase = generation.base;
		stderr += stderr
			? `\n--- canvas generation ${generation.number} pid ${generation.pid} ---\n`
			: "";
		child.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			generation.stderr += text;
			stderr += text;
		});
		child.once("exit", (code, signal) => {
			generation.exit = { code, signal, expected: generation.expectedStop };
			resolveExit(generation.exit);
		});

		const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (generation.exit || child.exitCode !== null || child.signalCode !== null) {
				if (!generation.exit) await generation.exitPromise;
				throw new AttemptError(
					`Owned canvas pid ${generation.pid} died (${exitDescription(generation.exit)}).`,
					/EADDRINUSE|already (?:in use|listening)/i.test(generation.stderr),
				);
			}
			try {
				const response = await fetch(`${generation.base}/health`, {
					signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
				});
				const health = (await response.json()) as { pid?: number };
				if (health.pid === generation.pid) return generation;
				throw new AttemptError(
					`Port ${candidate} answered for pid ${health.pid ?? "unknown"}, not owned pid ${generation.pid}.`,
					true,
					health.pid,
				);
			} catch (error) {
				if (error instanceof AttemptError) throw error;
				if (generation.exit) continue;
				await sleep(TEST_CANVAS_HEALTH_POLL_MS);
			}
		}
		throw new AttemptError(
			`Owned canvas pid ${generation.pid} did not answer /health within ${TEST_CANVAS_STARTUP_TIMEOUT_MS}ms.`,
			false,
		);
	};
	const recordFailure = async (
		generation: Generation | null,
		candidate: number,
		error: AttemptError,
	): Promise<{ attempt: AttemptRecord; cleanupError?: unknown }> => {
		let cleanup = "already exited";
		let cleanupError: unknown;
		if (generation) {
			try {
				await stopGeneration(generation);
				cleanup = "reaped";
			} catch (cause) {
				cleanupError = cause;
				cleanup = cause instanceof Error ? cause.message : String(cause);
			}
		}
		return {
			attempt: {
				port: candidate,
				pid: generation?.pid ?? -1,
				exit: generation?.exit ? exitDescription(generation.exit) : error.message,
				...(error.foreignPid === undefined ? {} : { foreignPid: error.foreignPid }),
				stderr: tail(generation?.stderr ?? ""),
				cleanup,
			},
			...(cleanupError === undefined ? {} : { cleanupError }),
		};
	};
	const startOperation = async (retiredPort?: number): Promise<void> => {
		const attempts: AttemptRecord[] = [];
		const limit = explicitPort === undefined ? MAX_START_ATTEMPTS : 1;
		for (let attempt = 0; attempt < limit; attempt += 1) {
			const candidate =
				explicitPort ?? (attempt === 0 && retiredPort ? retiredPort : await automaticPort());
			try {
				await startAttempt(candidate);
				return;
			} catch (cause) {
				const error =
					cause instanceof AttemptError
						? cause
						: new AttemptError(String(cause), false, undefined, { cause });
				const failed = currentGeneration;
				const failure = await recordFailure(failed, candidate, error);
				attempts.push(failure.attempt);
				if (failure.cleanupError !== undefined) {
					throw new Error(
						`${error.message}\nFailed to reap the exact owned canvas generation; refusing to start another.\n` +
							`Attempt: ${JSON.stringify(failure.attempt)}`,
						{ cause },
					);
				}
				if (!error.retryable || explicitPort !== undefined) {
					const diagnostic = tail(failed?.stderr ?? "");
					throw new Error(error.message + (diagnostic ? `\nCanvas stderr:\n${diagnostic}` : ""), {
						cause,
					});
				}
			}
		}
		throw new Error(
			`Owned canvas exhausted ${MAX_START_ATTEMPTS} collision-safe start attempts.\n` +
				attempts.map((attempt, index) => `${index + 1}. ${JSON.stringify(attempt)}`).join("\n"),
		);
	};
	const disposeSync = (): void => {
		disposed = true;
		currentGeneration?.child.kill("SIGKILL");
		fs.rmSync(vault, { recursive: true, force: true });
		activeCanvases.delete(registration);
	};

	const handle: OwnedCanvas = {
		get base() {
			return visibleBase;
		},
		vault,
		get pid() {
			return currentGeneration?.pid ?? null;
		},
		get stderr() {
			return stderr;
		},
		assertRunning,
		restart(options = {}) {
			refuseDisposed();
			return enqueue(async () => {
				refuseDisposed();
				const retired = currentGeneration;
				if (!retired) throw deathError(null);
				await stopGeneration(retired, options.signal);
				await options.whileStopped?.();
				refuseDisposed();
				await startOperation(retired.port);
			});
		},
		dispose() {
			if (disposalPromise) return disposalPromise;
			disposed = true;
			disposalPromise = enqueue(async () => {
				try {
					if (currentGeneration) await stopGeneration(currentGeneration);
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
		await enqueue(() => startOperation());
		return handle;
	} catch (error) {
		await handle.dispose();
		throw error;
	}
}
