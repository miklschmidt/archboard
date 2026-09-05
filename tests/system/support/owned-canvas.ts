import fs from "node:fs";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	buildOwnedCanvasEnvironment,
	createOwnedCanvasPaths,
	isOwnedCanvasNamespaceRoot,
	processExists,
	waitForProcessExit,
} from "./owned-canvas-ownership.ts";
import type {
	OwnedCanvasEnvironment,
	OwnedCanvasEnvironmentPaths,
	OwnedCanvasPaths,
} from "./owned-canvas-ownership.ts";
import { captureForcedCanvasCleanup } from "./owned-canvas-forced-cleanup.ts";
import {
	registerOwnedCanvas,
	unregisterOwnedCanvas,
} from "./owned-canvas-registry.ts";
import type { OwnedCanvasRegistration } from "./owned-canvas-registry.ts";
import { discardHeldBoards } from "./owned-canvas-recovery.ts";

interface Exit { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly expected: boolean }
type Environment = Readonly<Record<string, string | undefined>>;
type OwnedChild = ChildProcessByStdio<null, null, Readable>;
interface StartOwnedCanvasOptions {
	readonly serverPath: string;
	readonly port?: number;
	readonly vault: string;
	readonly env?: Environment;
}
interface RestartOwnedCanvasOptions {
	readonly signal?: NodeJS.Signals;
	readonly whileStopped?: () => void | Promise<void>;
}
interface OwnedCanvas {
	readonly base: string;
	readonly vault: string;
	readonly paths: OwnedCanvasPaths;
	readonly pid: number | null;
	readonly stderr: string;
	readonly assertRunning: (cause?: unknown) => Promise<void>;
	readonly restart: (options?: Readonly<RestartOwnedCanvasOptions>) => Promise<void>;
	readonly dispose: () => Promise<void>;
}
interface Generation {
	number: number;
	child: Readonly<OwnedChild>;
	pid: number;
	port: number;
	base: string;
	stop: Readonly<{ expected: () => boolean; markExpected: () => void }>;
	exit: Exit | null;
	exitPromise: Readonly<Promise<Exit>>;
	stderr: string;
}

interface AttemptRecord { readonly port: number; readonly pid: number; readonly exit: string; readonly foreignPid?: number; readonly stderr: string; readonly cleanup: string }

interface DeathGeneration { readonly pid: number; readonly exit: Readonly<Exit> | null; readonly child: Readonly<Pick<OwnedChild, "exitCode" | "signalCode">> }

interface StoppableGeneration extends DeathGeneration { readonly number: number; readonly child: Readonly<Pick<OwnedChild, "exitCode" | "kill" | "signalCode">>; readonly stop: Readonly<{ expected: () => boolean; markExpected: () => void }>; readonly exitPromise: Readonly<Promise<Exit>> }

class AttemptError extends Error {
	public readonly retryable: boolean;
	public readonly foreignPid?: number;

	public constructor(
		message: string,
		retryable: boolean,
		foreignPid?: number,
		options?: Readonly<ErrorOptions>,
	) {
		super(message, options);
		this.name = "AttemptError";
		this.retryable = retryable;
		if (foreignPid !== undefined) {this.foreignPid = foreignPid;}
	}
}

const MAX_START_ATTEMPTS = 8;
const settleOperation = async (): Promise<void> => {await Promise.resolve();};
const sleep = async (ms: number): Promise<void> => {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
};

async function automaticPort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once("error", reject);
		probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = probe.address();
	if (address === null || typeof address === "string") {
		probe.close();
		throw new Error("The OS port probe did not report a TCP address.");
	}
	await new Promise<void>((resolve, reject) => {
		probe.close((...errors: readonly [Readonly<Error>?]) => {
			const [error] = errors;
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
	return address.port;
}

const exitDescription = (exit: Readonly<Exit> | null): string =>
	exit?.signal !== null && exit?.signal !== undefined
		? `signal ${exit.signal}`
		: `exit ${exit?.code ?? "unknown"}`;
const tail = (text: string): string => text.trim().split("\n").slice(-20).join("\n");
const healthPid = (value: unknown): number | undefined =>
	value !== null && typeof value === "object" && "pid" in value && typeof value.pid === "number"
		? value.pid
		: undefined;
async function startOwnedCanvas({
	serverPath,
	port: explicitPort,
	vault,
	env = {},
}: Readonly<StartOwnedCanvasOptions>): Promise<OwnedCanvas> {
	const paths = createOwnedCanvasPaths();
	const pathsDiagnostic = `\nOwned canvas paths: ${JSON.stringify(paths)}`;
	let currentGeneration: Generation | null = null;
	let visibleBase =
		explicitPort === undefined ? "" : `http://127.0.0.1:${explicitPort}`;
	let nextGeneration = 1;
	let disposed = false;
	let disposalPromise: Promise<void> | null = null;
	let operation: Promise<void> = Promise.resolve();
	let stderr = "";
	const registrationState: { current?: OwnedCanvasRegistration } = {};
	const unregisterRegistration = (): void => {
		if (registrationState.current !== undefined) {
			unregisterOwnedCanvas(registrationState.current);
		}
	};
	const enqueue = async <T>(work: () => Promise<T>): Promise<T> => {
		const result = operation.then(work);
		operation = result.then(settleOperation, settleOperation);
		return result;
	};
	const refuseDisposed = (): void => {
		if (disposed) {throw new Error("Cannot restart a disposed canvas process.");}
	};
	const deathError = (
		generation: Readonly<DeathGeneration> | null,
		cause?: unknown,
	): Error & { readonly code: string } => {
		const detail = generation === null ? "has no live generation" : exitDescription(generation.exit);
		const diagnostic = tail(stderr);
		return Object.assign(
			new Error(
				`Owned canvas pid ${generation?.pid ?? "unknown"} died (${detail}).${
					diagnostic === "" ? "" : `\nCanvas stderr:\n${diagnostic}`
				}${pathsDiagnostic}`,
				{ cause },
			),
			{ code: "CANVAS_PROCESS_DIED" as const },
		);
	};
	const assertRunning = async (cause?: unknown): Promise<void> => {
		const generation = currentGeneration;
		if (Boolean(cause) && generation?.exit === null) {
			await Promise.race([generation.exitPromise, sleep(TEST_CANVAS_HEALTH_POLL_MS)]);
		}
		const generationUnavailable = generation === null;
		if (
			generationUnavailable ||
			generation.exit !== null ||
			generation.child.exitCode !== null ||
			generation.child.signalCode !== null
		) {
			throw deathError(generation, cause);
		}
	};
	const waitForExit = async (
		exitPromise: Readonly<Promise<Exit>>,
		timeoutMs: number,
	): Promise<boolean> =>
		Promise.race([exitPromise.then(() => true), sleep(timeoutMs).then(() => false)]);
	const stopGeneration = async (
		generation: Readonly<StoppableGeneration>,
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<void> => {
		const forcedCleanup = generation.exit !== null
			? null
			: captureForcedCanvasCleanup({ canvasPid: generation.pid, xdgState: paths.xdgState });
		let forced = signal === "SIGKILL";
		if (generation.exit === null) {
			generation.stop.markExpected();
			generation.child.kill(signal);
			if (!(await waitForExit(generation.exitPromise, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS))) {
				forced = true;
				generation.child.kill("SIGKILL");
				await waitForExit(generation.exitPromise, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
			}
		}
		if (forced && forcedCleanup !== null) {
			await forcedCleanup.complete(
				generation.exit
					? { exited: true }
					: {
							exited: false,
							failure: new Error(
								`Owned canvas generation ${generation.number} did not exit after SIGKILL.${pathsDiagnostic}`,
							),
						},
			);
		}
		if (currentGeneration === generation) {currentGeneration = null;}
	};
	const startAttempt = async (candidate: number): Promise<Generation> => {
		const child = spawn(process.execPath, [serverPath], {
			env: buildOwnedCanvasEnvironment({ paths, port: candidate, vault, env }),
			stdio: ["ignore", "ignore", "pipe"],
		});
		if (child.pid === undefined) {throw new Error("Owned canvas has no process id.");}
		let resolveExit!: (exit: Readonly<Exit>) => void;
		let expectedStop = false;
		const generation: Generation = {
			number: nextGeneration++,
			child,
			pid: child.pid,
			port: candidate,
			base: `http://127.0.0.1:${candidate}`,
			stop: {
				expected: () => expectedStop,
				markExpected: () => {
					expectedStop = true;
				},
			},
			exit: null,
			exitPromise: new Promise((resolve) => {
				resolveExit = resolve;
			}),
			stderr: "",
		};
		currentGeneration = generation;
		visibleBase = generation.base;
		stderr += stderr
			? `\n--- canvas generation ${generation.number} pid ${generation.pid} ---\n`
			: "";
		child.stderr.on("data", (...chunks: readonly unknown[]) => {
			const [chunk] = chunks;
			const text = String(chunk);
			generation.stderr += text;
			stderr += text;
		});
		child.once("exit", (code, signal) => {
			generation.exit = { code, signal, expected: generation.stop.expected() };
			resolveExit(generation.exit);
		});

		const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
		const pollHealth = async (): Promise<Generation> => {
			if (Date.now() >= deadline) {
				throw new AttemptError(
					`Owned canvas pid ${generation.pid} did not answer /health within ${TEST_CANVAS_STARTUP_TIMEOUT_MS}ms.`,
					false,
				);
			}
			if (
				generation.exit !== null ||
				child.exitCode !== null ||
				child.signalCode !== null
			) {
				if (generation.exit === null) {
					await generation.exitPromise;
				}
				throw new AttemptError(
					`Owned canvas pid ${generation.pid} died (${exitDescription(generation.exit)}).`,
					/EADDRINUSE|already (?:in use|listening)/iu.test(generation.stderr),
				);
			}
			try {
				const response = await fetch(`${generation.base}/health`, {
					signal: AbortSignal.timeout(TEST_CANVAS_HEALTH_REQUEST_TIMEOUT_MS),
				});
				const pid = healthPid(await response.json());
				if (pid === generation.pid) {
					return generation;
				}
				throw new AttemptError(
					`Port ${candidate} answered for pid ${pid ?? "unknown"}, not owned pid ${generation.pid}.`,
					true,
					pid,
				);
			} catch (error) {
				if (error instanceof AttemptError) {
					throw error;
				}
				const exitedDuringHealthRequest = (): boolean => generation.exit !== null;
				if (exitedDuringHealthRequest()) {
					return pollHealth();
				}
				await sleep(TEST_CANVAS_HEALTH_POLL_MS);
				return pollHealth();
			}
		};
		return pollHealth();
	};
	const startOperation = async (retiredPort?: number): Promise<void> => {
		const attempts: AttemptRecord[] = [];
		const limit = explicitPort === undefined ? MAX_START_ATTEMPTS : 1;
		const attemptStart = async (attempt: number): Promise<void> => {
			if (attempt >= limit) {
				throw new Error(
					`Owned canvas exhausted ${MAX_START_ATTEMPTS} collision-safe start attempts.\n${attempts
						.map((record, index) => `${index + 1}. ${JSON.stringify(record)}`)
						.join("\n")}${pathsDiagnostic}`,
				);
			}
			const candidate =
				explicitPort ??
				(attempt === 0 && retiredPort !== undefined ? retiredPort : await automaticPort());
			try {
				await startAttempt(candidate);
			} catch (error) {
				const attemptError =
					error instanceof AttemptError
						? error
						: new AttemptError(String(error), false, undefined, { cause: error });
				const failed = currentGeneration;
				const cleanupResult =
					failed === null
						? { cleanup: "already exited" }
						: await stopGeneration(failed).then(
								() => ({ cleanup: "reaped" }),
								(cleanupError: unknown) => ({
									cleanup:
										cleanupError instanceof Error
											? cleanupError.message
											: JSON.stringify(cleanupError),
									cleanupError,
								}),
							);
				const failure = {
					attempt: {
						port: candidate,
						pid: failed?.pid ?? -1,
						exit: failed?.exit ? exitDescription(failed.exit) : attemptError.message,
						...(attemptError.foreignPid === undefined
							? {}
							: { foreignPid: attemptError.foreignPid }),
						stderr: tail(failed?.stderr ?? ""),
						cleanup: cleanupResult.cleanup,
					},
					...("cleanupError" in cleanupResult
						? { cleanupError: cleanupResult.cleanupError }
						: {}),
				};
				attempts.push(failure.attempt);
				if (failure.cleanupError !== undefined) {
					throw new Error(
						`${attemptError.message}\nFailed to reap the exact owned canvas generation; refusing to start another.\n` +
						`Attempt: ${JSON.stringify(failure.attempt)}${pathsDiagnostic}`,
						{ cause: error },
					);
				}
				if (!attemptError.retryable || explicitPort !== undefined) {
					const diagnostic = tail(failed?.stderr ?? "");
					throw new Error(
						`${attemptError.message}${
							diagnostic === "" ? "" : `\nCanvas stderr:\n${diagnostic}`
						}${pathsDiagnostic}`,
						{ cause: error },
					);
				}
				await attemptStart(attempt + 1);
			}
		};
		await attemptStart(0);
	};
	const removeOwnedFileSystem = (): void => {
		try {
			fs.rmSync(vault, { recursive: true, force: true });
		} finally {
			fs.rmSync(paths.root, { recursive: true, force: true });
		}
	};
	const disposeSync = (): void => {
		disposed = true;
		currentGeneration?.child.kill("SIGKILL");
		try {
			removeOwnedFileSystem();
		} finally {
			unregisterRegistration();
		}
	};

	const handle: OwnedCanvas = {
		get base() {
			return visibleBase;
		},
		vault,
		paths,
		get pid() {
			return currentGeneration?.pid ?? null;
		},
		get stderr() {
			return stderr;
		},
		assertRunning,
		 async restart(options = {}) {
			refuseDisposed();
			return enqueue(async () => {
				refuseDisposed();
				const retired = currentGeneration;
				if (!retired) {throw deathError(null);}
				await stopGeneration(retired, options.signal);
				await options.whileStopped?.();
				refuseDisposed();
				await startOperation(retired.port);
			});
		},
		 async dispose() {
			if (disposalPromise) {return disposalPromise;}
			disposed = true;
			disposalPromise = enqueue(async () => {
				let failure: unknown;
				try {
					if (currentGeneration) {
						const generation = currentGeneration;
						try {
							await discardHeldBoards(generation);
						} catch (error) {
							if (generation.exit === null) {failure = error;}
						}
						try {
							await stopGeneration(generation);
						} catch (error) {
							failure =
								failure === undefined
									? error
									: new AggregateError(
											[failure, error],
											"Held-board recovery and canvas process cleanup both failed.",
										);
						}
					}
				} finally {
					try {
						removeOwnedFileSystem();
					} finally {
						unregisterRegistration();
					}
				}
				if (failure !== undefined) {
					throw failure instanceof Error ? failure : new Error(JSON.stringify(failure));
				}
			});
			return disposalPromise;
		},
	};

	const registration: OwnedCanvasRegistration = {
		dispose: async (): Promise<void> => handle.dispose(),
		disposeSync,
	};
	registrationState.current = registration;
	registerOwnedCanvas(registration);
	try {
		await enqueue(async (): Promise<void> => startOperation());
		return handle;
	} catch (error) {
		await handle.dispose();
		throw error;
	}
}

export {
	buildOwnedCanvasEnvironment,
	isOwnedCanvasNamespaceRoot,
	processExists,
	startOwnedCanvas,
	waitForProcessExit,
	type OwnedCanvas,
	type OwnedCanvasEnvironment,
	type OwnedCanvasEnvironmentPaths,
	type OwnedCanvasPaths,
	type RestartOwnedCanvasOptions,
	type StartOwnedCanvasOptions,
};
