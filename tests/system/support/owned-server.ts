import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import {
	TEST_SERVER_HEALTH_POLL_MS,
	TEST_SERVER_HEALTH_REQUEST_TIMEOUT_MS,
	TEST_SERVER_SHUTDOWN_TIMEOUT_MS,
	TEST_SERVER_STARTUP_TIMEOUT_MS,
} from "./timing.ts";
import {
	buildOwnedServerEnvironment,
	createOwnedServerPaths,
	ownedServerArguments,
	isOwnedServerNamespaceRoot,
	processExists,
	waitForProcessExit,
} from "./owned-server-ownership.ts";
import type {
	OwnedServerEnvironment,
	OwnedServerEnvironmentPaths,
	OwnedServerPaths,
} from "./owned-server-ownership.ts";
import { captureForcedServerCleanup } from "./owned-server-forced-cleanup.ts";
import { registerOwnedServer, unregisterOwnedServer } from "./owned-server-registry.ts";
import type { OwnedServerRegistration } from "./owned-server-registry.ts";
import type {
	AttemptRecord,
	DeathGeneration,
	Exit,
	Generation,
	StoppableGeneration,
} from "./owned-server-lifecycle-types.ts";
import { ensureSemanticVaultConfiguration } from "./semantic-vault.ts";
import { listOnlyVault } from "./test-vault.ts";

type Environment = Readonly<Record<string, string | undefined>>;
interface StartOwnedServerOptions {
	readonly serverPath: string;
	/** A script Bun runs before the server, to replace what the server imports (`bun --preload`). */
	readonly preload?: string;
	readonly port?: number;
	readonly vault: string;
	readonly env?: Environment;
}
interface RestartOwnedServerOptions {
	readonly signal?: NodeJS.Signals;
	readonly whileStopped?: () => void | Promise<void>;
}
interface OwnedServer {
	readonly base: string;
	readonly vault: string;
	/**
	 * The registry the server lists repositories from. Unless the caller named
	 * one with `ARCHBOARD_REPOS`, it is the server's own and lists only its vault,
	 * so the page opens there. A command run against the server uses it too.
	 */
	readonly registry: string;
	readonly paths: OwnedServerPaths;
	readonly pid: number | null;
	readonly stderr: string;
	readonly assertRunning: (cause?: unknown) => Promise<void>;
	readonly restart: (options?: Readonly<RestartOwnedServerOptions>) => Promise<void>;
	readonly dispose: () => Promise<void>;
}
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
		if (foreignPid !== undefined) {
			this.foreignPid = foreignPid;
		}
	}
}

const MAX_START_ATTEMPTS = 8;
const settleOperation = (): void => {
	// Intentionally swallow either outcome so later queued operations can continue.
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
const waitForExit = async (
	exitPromise: Readonly<Promise<Exit>>,
	timeoutMs: number,
): Promise<boolean> =>
	Promise.race([exitPromise.then(() => true), sleep(timeoutMs).then(() => false)]);
async function startOwnedServer({
	serverPath,
	preload,
	port: explicitPort,
	vault,
	env = {},
}: Readonly<StartOwnedServerOptions>): Promise<OwnedServer> {
	ensureSemanticVaultConfiguration(vault);
	const paths = createOwnedServerPaths();
	const named = env["ARCHBOARD_REPOS"];
	const registry = named ?? path.join(paths.root, "repos.json");
	if (named === undefined) {
		try {
			listOnlyVault(registry, vault);
		} catch (error) {
			fs.rmSync(paths.root, { recursive: true, force: true });
			throw error;
		}
	}
	const pathsDiagnostic = `\nOwned server paths: ${JSON.stringify(paths)}`;
	let currentGeneration: Generation | null = null;
	let visibleBase = explicitPort === undefined ? "" : `http://127.0.0.1:${explicitPort}`;
	let nextGeneration = 1;
	let disposed = false;
	let disposalPromise: Promise<void> | null = null;
	let operation: Promise<void> = Promise.resolve();
	let stderr = "";
	const registrationState: { current?: OwnedServerRegistration } = {};
	const unregisterRegistration = (): void => {
		if (registrationState.current !== undefined) {
			unregisterOwnedServer(registrationState.current);
		}
	};
	const enqueue = async <T>(work: () => Promise<T>): Promise<T> => {
		const result = operation.then(work);
		operation = result.then(settleOperation, settleOperation);
		return result;
	};
	const refuseDisposed = (): void => {
		if (disposed) {
			throw new Error("Cannot restart a disposed server process.");
		}
	};
	const deathError = (
		generation: Readonly<DeathGeneration> | null,
		cause?: unknown,
	): Error & { readonly code: string } => {
		const detail =
			generation === null ? "has no live generation" : exitDescription(generation.exit);
		const diagnostic = tail(stderr);
		return Object.assign(
			new Error(
				`Owned server pid ${generation?.pid ?? "unknown"} died (${detail}).${
					diagnostic === "" ? "" : `\nServer stderr:\n${diagnostic}`
				}${pathsDiagnostic}`,
				{ cause },
			),
			{ code: "SERVER_PROCESS_DIED" as const },
		);
	};
	const assertRunning = async (cause?: unknown): Promise<void> => {
		const generation = currentGeneration;
		if (Boolean(cause) && generation?.exit === null) {
			await Promise.race([generation.exitPromise, sleep(TEST_SERVER_HEALTH_POLL_MS)]);
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
	const stopGeneration = async (
		generation: Readonly<StoppableGeneration>,
		signal: NodeJS.Signals = "SIGTERM",
	): Promise<void> => {
		const forcedCleanup =
			generation.exit !== null
				? null
				: captureForcedServerCleanup({ serverPid: generation.pid, xdgState: paths.xdgState });
		let forced = signal === "SIGKILL";
		if (generation.exit === null) {
			generation.stop.markExpected();
			generation.child.kill(signal);
			if (!(await waitForExit(generation.exitPromise, TEST_SERVER_SHUTDOWN_TIMEOUT_MS))) {
				forced = true;
				generation.child.kill("SIGKILL");
				await waitForExit(generation.exitPromise, TEST_SERVER_SHUTDOWN_TIMEOUT_MS);
			}
		}
		if (forced && forcedCleanup !== null) {
			await forcedCleanup.complete(
				generation.exit
					? { exited: true }
					: {
							exited: false,
							failure: new Error(
								`Owned server generation ${generation.number} did not exit after SIGKILL.${pathsDiagnostic}`,
							),
						},
			);
		}
		if (currentGeneration === generation) {
			currentGeneration = null;
		}
	};
	const startAttempt = async (candidate: number): Promise<Generation> => {
		const child = spawn(process.execPath, ownedServerArguments(serverPath, preload), {
			env: buildOwnedServerEnvironment({ paths, port: candidate, registry, env }),
			stdio: ["ignore", "ignore", "pipe"],
		});
		if (child.pid === undefined) {
			throw new Error("Owned server has no process id.");
		}
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
			? `\n--- server generation ${generation.number} pid ${generation.pid} ---\n`
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

		const deadline = Date.now() + TEST_SERVER_STARTUP_TIMEOUT_MS;
		const pollHealth = async (): Promise<Generation> => {
			if (Date.now() >= deadline) {
				throw new AttemptError(
					`Owned server pid ${generation.pid} did not answer /health within ${TEST_SERVER_STARTUP_TIMEOUT_MS}ms.`,
					false,
				);
			}
			if (generation.exit !== null || child.exitCode !== null || child.signalCode !== null) {
				if (generation.exit === null) {
					await generation.exitPromise;
				}
				throw new AttemptError(
					`Owned server pid ${generation.pid} died (${exitDescription(generation.exit)}).`,
					/EADDRINUSE|already (?:in use|listening)/iu.test(generation.stderr),
				);
			}
			try {
				const response = await fetch(`${generation.base}/health`, {
					signal: AbortSignal.timeout(TEST_SERVER_HEALTH_REQUEST_TIMEOUT_MS),
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
				await sleep(TEST_SERVER_HEALTH_POLL_MS);
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
					`Owned server exhausted ${MAX_START_ATTEMPTS} collision-safe start attempts.\n${attempts
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
					...("cleanupError" in cleanupResult ? { cleanupError: cleanupResult.cleanupError } : {}),
				};
				attempts.push(failure.attempt);
				if (failure.cleanupError !== undefined) {
					throw new Error(
						`${attemptError.message}\nFailed to reap the exact owned server generation; refusing to start another.\n` +
							`Attempt: ${JSON.stringify(failure.attempt)}${pathsDiagnostic}`,
						{ cause: error },
					);
				}
				if (!attemptError.retryable || explicitPort !== undefined) {
					const diagnostic = tail(failed?.stderr ?? "");
					throw new Error(
						`${attemptError.message}${
							diagnostic === "" ? "" : `\nServer stderr:\n${diagnostic}`
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

	const handle: OwnedServer = {
		get base() {
			return visibleBase;
		},
		vault,
		registry,
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
				if (!retired) {
					throw deathError(null);
				}
				await stopGeneration(retired, options.signal);
				await options.whileStopped?.();
				refuseDisposed();
				await startOperation(retired.port);
			});
		},
		async dispose() {
			if (disposalPromise) {
				return disposalPromise;
			}
			disposed = true;
			disposalPromise = enqueue(async () => {
				let failure: unknown;
				try {
					if (currentGeneration) {
						try {
							await stopGeneration(currentGeneration);
						} catch (error) {
							failure = error;
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

	const registration: OwnedServerRegistration = {
		dispose: async (): Promise<void> => handle.dispose(),
		disposeSync,
	};
	registrationState.current = registration;
	registerOwnedServer(registration);
	try {
		await enqueue(async (): Promise<void> => startOperation());
		return handle;
	} catch (error) {
		await handle.dispose();
		throw error;
	}
}

export {
	buildOwnedServerEnvironment,
	isOwnedServerNamespaceRoot,
	processExists,
	startOwnedServer,
	waitForProcessExit,
	type OwnedServer,
	type OwnedServerEnvironment,
	type OwnedServerEnvironmentPaths,
	type OwnedServerPaths,
	type RestartOwnedServerOptions,
	type StartOwnedServerOptions,
};
