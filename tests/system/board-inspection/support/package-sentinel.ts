import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
	TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.js";
import { processIdentity, processIdentityExists, type ProcessIdentity } from "./package-process.js";

type OwnedOutcome<T> = { status: "fulfilled"; value: T } | { status: "rejected"; error: Error };

interface Sentinel {
	url: string;
	contacts: () => string;
	child: ReturnType<typeof Bun.spawn>;
	identity: ProcessIdentity;
	log: string;
	leader: Promise<OwnedOutcome<number>>;
	stdout: Promise<OwnedOutcome<void>>;
	stderr: Promise<OwnedOutcome<string>>;
}

interface SentinelStartOptions {
	resistTermination?: boolean;
	failStdout?: boolean;
	failStartup?: boolean;
	startupDelayMs?: number;
	signal?: AbortSignal;
}

interface SentinelAcquisition {
	child: ReturnType<typeof Bun.spawn>;
	log: string;
	ownership: Promise<void>;
	ready: Promise<Sentinel>;
	identity: () => ProcessIdentity | undefined;
	stop: () => Promise<void>;
}

const tempRoot = realpathSync(tmpdir());
const injectedStdoutFailure = "Injected HTTP sentinel stdout failure.";

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

function observeOwned<T>(
	promise: Promise<T>,
	onFailure: (error: Error) => void,
	onSettlement?: () => void,
): Promise<OwnedOutcome<T>> {
	return promise.then(
		(value) => {
			onSettlement?.();
			return { status: "fulfilled", value };
		},
		(cause) => {
			const error = asError(cause);
			onFailure(error);
			onSettlement?.();
			return { status: "rejected", error };
		},
	);
}

function sentinelLineReader(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): () => Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	return async () => {
		for (;;) {
			const newline = text.indexOf("\n");
			if (newline >= 0) {
				const line = text.slice(0, newline);
				text = text.slice(newline + 1);
				return line;
			}
			const next = await reader.read();
			text += decoder.decode(next.value, { stream: !next.done });
			if (next.done) {
				throw new Error("HTTP sentinel exited before publishing its port.");
			}
		}
	};
}

async function readStartupLine(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	readLine: () => Promise<string>,
	failure: Promise<Error>,
): Promise<string> {
	const outcome = await Promise.race([
		readLine().then((line) => ({ kind: "line" as const, line })),
		failure.then((error) => ({ kind: "failure" as const, error })),
	]);
	if (outcome.kind === "line") {
		return outcome.line;
	}
	try {
		await reader.cancel(outcome.error);
	} catch {
		// Process termination still settles the reader and remains the cleanup authority.
	}
	throw outcome.error;
}

async function withinSentinelCleanup<T>(promise: Promise<T>): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<undefined>((resolveDeadline) => {
				timer = setTimeout(
					() => resolveDeadline(undefined),
					TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
				);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

function throwFailures(primary: Error | undefined, cleanup: Error[]): void {
	if (primary && cleanup.length === 0) {
		throw primary;
	}
	if (!primary && cleanup.length === 1) {
		throw cleanup[0];
	}
	const failures = [...(primary ? [primary] : []), ...cleanup];
	if (failures.length > 0) {
		throw new AggregateError(failures, "HTTP sentinel lifecycle failed.");
	}
}

function startSentinel(options: SentinelStartOptions = {}): SentinelAcquisition {
	const log = join(
		tempRoot,
		`archboard-task-130-05-http-${process.pid}-${crypto.randomUUID()}.log`,
	);
	writeFileSync(log, "");
	const code =
		"const fs=require('node:fs');if(process.env.SENTINEL_RESIST_TERMINATION==='1'){process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{})}const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){fs.appendFileSync(process.env.SENTINEL_LOG,'contact\\n');return new Response('unexpected')}});process.stdout.write('owned\\n');setTimeout(()=>process.stdout.write(String(s.port)+'\\n'),Number(process.env.SENTINEL_STARTUP_DELAY_MS||0))";
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([process.execPath, "-e", code], {
			env: {
				...process.env,
				SENTINEL_LOG: log,
				SENTINEL_RESIST_TERMINATION: options.resistTermination ? "1" : "0",
				SENTINEL_STARTUP_DELAY_MS: String(options.startupDelayMs ?? 0),
			},
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (cause) {
		rmSync(log, { force: true });
		throw new Error(`Could not start HTTP sentinel: ${asError(cause).message}`, { cause });
	}
	const stdoutStream = child.stdout as ReadableStream<Uint8Array>;
	const stderrStream = child.stderr as ReadableStream<Uint8Array>;
	let identity: ProcessIdentity | undefined;
	let primaryFailure: Error | undefined;
	let leaderSettled = false;
	const rememberFailure = (error: Error): void => {
		primaryFailure ??= error;
	};
	try {
		identity = processIdentity(child.pid);
	} catch (cause) {
		rememberFailure(
			new Error(
				`Could not capture HTTP sentinel ${child.pid} identity: ${asError(cause).message}`,
				{
					cause,
				},
			),
		);
	}
	const leader = observeOwned(child.exited, rememberFailure, () => {
		leaderSettled = true;
	});
	const stderr = observeOwned(
		Promise.resolve().then(() => new Response(stderrStream).text()),
		rememberFailure,
	);
	let resolveReady!: (sentinel: Sentinel) => void;
	let rejectReady!: (error: Error) => void;
	let readySettled = false;
	const rawReady = new Promise<Sentinel>((resolve, reject) => {
		resolveReady = (sentinel) => {
			readySettled = true;
			resolve(sentinel);
		};
		rejectReady = (error) => {
			readySettled = true;
			reject(error);
		};
	});
	let resolveOwnership!: () => void;
	let rejectOwnership!: (error: Error) => void;
	let ownershipSettled = false;
	const ownership = new Promise<void>((resolve, reject) => {
		resolveOwnership = () => {
			ownershipSettled = true;
			resolve();
		};
		rejectOwnership = (error) => {
			ownershipSettled = true;
			reject(error);
		};
	});
	void ownership.catch(() => undefined);
	let stdout!: Promise<OwnedOutcome<void>>;
	stdout = observeOwned(
		Promise.resolve().then(async () => {
			let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			let startupFailure: Error | undefined;
			let resolveStartupFailure!: (error: Error) => void;
			const startupFailed = new Promise<Error>((resolve) => {
				resolveStartupFailure = resolve;
			});
			const failStartup = (error: Error): void => {
				if (startupFailure) {
					return;
				}
				startupFailure = error;
				resolveStartupFailure(error);
			};
			const onAbort = (): void =>
				failStartup(asError(options.signal?.reason ?? "HTTP sentinel startup aborted."));
			try {
				if (!identity) {
					throw primaryFailure ?? new Error("HTTP sentinel identity was not captured.");
				}
				reader = stdoutStream.getReader();
				const readLine = sentinelLineReader(reader);
				options.signal?.addEventListener("abort", onAbort, { once: true });
				if (options.signal?.aborted) {
					onAbort();
				}
				timeout = setTimeout(
					() => failStartup(new Error("HTTP sentinel startup timed out")),
					TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS,
				);
				const ownershipLine = await readStartupLine(reader, readLine, startupFailed);
				if (startupFailure) {
					throw startupFailure;
				}
				if (ownershipLine !== "owned") {
					throw new Error(`HTTP sentinel published invalid ownership: ${ownershipLine}`);
				}
				resolveOwnership();
				const portLine = await readStartupLine(reader, readLine, startupFailed);
				if (startupFailure) {
					throw startupFailure;
				}
				if (options.failStartup) {
					throw new Error("Injected HTTP sentinel startup failure.");
				}
				const port = Number(portLine.trim());
				if (!Number.isInteger(port) || port <= 0) {
					throw new Error("HTTP sentinel did not publish a valid port");
				}
				if (timeout !== undefined) {
					clearTimeout(timeout);
					timeout = undefined;
				}
				resolveReady({
					url: `http://127.0.0.1:${port}`,
					contacts: () => readFileSync(log, "utf8"),
					child,
					identity,
					log,
					leader,
					stdout,
					stderr,
				});
				if (options.failStdout) {
					throw new Error(injectedStdoutFailure);
				}
				while (!(await reader.read()).done) {
					// The sentinel owns no stdout protocol after its readiness line.
				}
			} catch (cause) {
				const error = startupFailure ?? asError(cause);
				if (!ownershipSettled) {
					rejectOwnership(error);
				}
				if (!readySettled) {
					rejectReady(error);
				}
				throw error;
			} finally {
				if (timeout !== undefined) {
					clearTimeout(timeout);
				}
				options.signal?.removeEventListener("abort", onAbort);
				reader?.releaseLock();
			}
		}),
		rememberFailure,
	);
	const settlements = Promise.all([leader, stdout, stderr]);
	let stopPromise: Promise<void> | undefined;
	const stop = (): Promise<void> => {
		stopPromise ??= (async () => {
			const cleanupFailures: Error[] = [];
			try {
				if (!leaderSettled) {
					child.kill("SIGTERM");
				}
			} catch (cause) {
				cleanupFailures.push(asError(cause));
			}
			let settled = await withinSentinelCleanup(settlements);
			let identityLive = identity ? processIdentityExists(identity) : !leaderSettled;
			if (settled === undefined || identityLive) {
				try {
					if (!leaderSettled) {
						child.kill("SIGKILL");
					}
				} catch (cause) {
					cleanupFailures.push(asError(cause));
				}
				settled = await withinSentinelCleanup(settlements);
				identityLive = identity ? processIdentityExists(identity) : !leaderSettled;
			}
			if (settled === undefined) {
				cleanupFailures.push(new Error(`HTTP sentinel ${child.pid} did not settle after SIGKILL.`));
			}
			if (identityLive) {
				cleanupFailures.push(
					new Error(`HTTP sentinel ${identity?.pid ?? child.pid} remained live after settlement.`),
				);
			}
			throwFailures(primaryFailure, cleanupFailures);
		})();
		return stopPromise;
	};
	const ready = rawReady.catch(async (startupError: unknown) => {
		try {
			await stop();
		} finally {
			rmSync(log, { force: true });
		}
		throw asError(startupError);
	});
	return { child, log, ownership, ready, identity: () => identity, stop };
}

export { type Sentinel, type SentinelStartOptions, type SentinelAcquisition, startSentinel };
