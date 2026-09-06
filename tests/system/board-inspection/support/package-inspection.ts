import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBoardNote } from "../../../../src/runtime/engine/board.js";
import { TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS } from "../../support/timing.ts";
import type {
	PackageInspectionOwner,
	PackageProcessFixtureRun,
	StartedHttpSentinel,
} from "./package-inspection-contract.js";
import {
	forcePackageProcessGroupGone,
	packageProcessGroupIdentityExists,
	processIdentityExists,
	runReadOnlyPackageProcess,
	waitForPackageProcessFixtureIdentity,
} from "./package-process.js";
import type {
	OwnedSettlementName,
	PackageProcessGroupIdentity,
	ProcessIdentity,
	ProcessResult,
	ReadOnlyRunOptions,
} from "./package-process.js";
import { startSentinel } from "./package-sentinel.js";
import type { Sentinel, SentinelAcquisition, SentinelStartOptions } from "./package-sentinel.js";
import {
	assertOwnedVault,
	packageVaultTempRoot,
	snapshotGuardedVault,
	snapshotVault,
} from "./package-vault.js";
import type { VaultEntry } from "./package-vault.js";

const { join, resolve } = path;

const root = resolve(import.meta.dirname, "../../../..");
const manifestValue: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (
	manifestValue === null ||
	typeof manifestValue !== "object" ||
	!("bin" in manifestValue) ||
	manifestValue.bin === null ||
	typeof manifestValue.bin !== "object" ||
	!("archboard" in manifestValue.bin) ||
	typeof manifestValue.bin.archboard !== "string"
) {
	throw new Error("Package manifest does not declare the archboard binary.");
}
const shippedBinary = join(root, manifestValue.bin.archboard);
const tempRoot = packageVaultTempRoot;
const processFixtureEntry = fileURLToPath(
	new URL("../fixtures/package-process-group.ts", import.meta.url),
);
const injectedDrainFailure = "Injected package stdout drain failure.";

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

async function readOnlyRun(
	vault: string,
	command: readonly string[],
	env: Readonly<Record<string, string>>,
	options: Readonly<ReadOnlyRunOptions> = {},
): Promise<ProcessResult> {
	return runReadOnlyPackageProcess(
		root,
		vault,
		command,
		env,
		() => snapshotGuardedVault(vault),
		options,
	);
}

async function drainThenFail(stream: Readonly<ReadableStream<Uint8Array>>): Promise<string> {
	const reader = stream.getReader();
	try {
		const first = await reader.read();
		if (first.done) {
			throw new Error("Package fixture stdout ended before drain injection.");
		}
		throw new Error(injectedDrainFailure);
	} finally {
		reader.releaseLock();
	}
}

async function drainThenDelay(stream: Readonly<ReadableStream<Uint8Array>>): Promise<string> {
	const output = await new Response(stream).text();
	await Bun.sleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS / 2);
	return output;
}

function createPackageInspectionOwner(): PackageInspectionOwner {
	let vault: string | null = null;
	let sentinel: Sentinel | null = null;
	let sentinelAcquisition: SentinelAcquisition | null = null;
	let pendingSentinelStart: Promise<{
		url: string;
		contacts: () => string;
		identity: ProcessIdentity;
	}> | null = null;
	let closing = false;
	let shutdownReason: Error | undefined;
	let firstSignal: "SIGINT" | "SIGTERM" | undefined;
	let shutdownPromise: Promise<void> | undefined;
	const abortController = new AbortController();
	const activeRuns = new Set<Promise<ProcessResult>>();
	const activeReadiness = new Set<Promise<PackageProcessGroupIdentity>>();
	const signalCaptured = new Set<(signal: "SIGINT" | "SIGTERM") => void>();
	const beforeSignalReplay = new Set<() => void>();
	const fixtureFiles = new Set<string>();
	const fixtureGroups = new Map<number, PackageProcessGroupIdentity>();
	const signalListeners: {
		sigint?: () => void;
		sigterm?: () => void;
	} = {};
	const removeSignalListeners = (): void => {
		if (signalListeners.sigint !== undefined) {
			process.removeListener("SIGINT", signalListeners.sigint);
		}
		if (signalListeners.sigterm !== undefined) {
			process.removeListener("SIGTERM", signalListeners.sigterm);
		}
	};
	const removeVault = (): void => {
		if (vault === null) {
			return;
		}
		const owned = vault;
		vault = null;
		if (!existsSync(owned)) {
			return;
		}
		const checked = assertOwnedVault(owned);
		if (!lstatSync(checked).isDirectory()) {
			chmodSync(checked, 0o600);
		}
		rmSync(checked, { recursive: true });
	};
	const shutdown = async (): Promise<void> => {
		closing = true;
		shutdownReason ??= new Error(
			firstSignal
				? `Package inspection owner interrupted by ${firstSignal}.`
				: "Package inspection owner disposed.",
		);
		const reason = shutdownReason;
		abortController.abort(reason);
		const failures: Error[] = [];
		const runs = [...activeRuns];
		const readiness = [...activeReadiness];
		const startingSentinel = pendingSentinelStart;
		const ownedSentinel = sentinelAcquisition;
		if (ownedSentinel) {
			try {
				await ownedSentinel.stop();
			} catch (error) {
				if (error !== reason) {
					failures.push(asError(error));
				}
			} finally {
				rmSync(ownedSentinel.log, { force: true });
				if (sentinelAcquisition === ownedSentinel) {
					sentinelAcquisition = null;
				}
				sentinel = null;
			}
		}
		const operationOutcomes = await Promise.allSettled([
			...runs,
			...readiness,
			...(startingSentinel ? [startingSentinel] : []),
		]);
		for (const outcome of operationOutcomes) {
			if (outcome.status === "rejected" && outcome.reason !== reason) {
				failures.push(asError(outcome.reason));
			}
		}
		const groups = fixtureGroups.entries();
		const cleanNextGroup = async (): Promise<void> => {
			const next = groups.next();
			if (next.done === true) {
				return;
			}
			const [group, identity] = next.value;
			if (!packageProcessGroupIdentityExists(identity)) {
				fixtureGroups.delete(group);
			} else {
				try {
					await forcePackageProcessGroupGone(identity);
					fixtureGroups.delete(group);
				} catch (error) {
					failures.push(asError(error));
				}
			}
			await cleanNextGroup();
		};
		await cleanNextGroup();
		for (const file of fixtureFiles) {
			rmSync(file, { force: true });
			fixtureFiles.delete(file);
		}
		try {
			removeVault();
		} catch (error) {
			failures.push(asError(error));
		}
		if (failures.length === 0 && firstSignal !== undefined) {
			for (const callback of beforeSignalReplay) {
				try {
					callback();
				} catch (error) {
					failures.push(asError(error));
				}
			}
		}
		const [firstFailure] = failures;
		if (firstFailure !== undefined && failures.length === 1) {
			throw firstFailure;
		}
		if (failures.length > 1) {
			throw new AggregateError(failures, "Package inspection owner shutdown failed.");
		}
		if (firstSignal !== undefined) {
			removeSignalListeners();
			process.kill(process.pid, firstSignal);
			await new Promise<never>(() => {
				// Signal replay terminates the process, so this promise intentionally remains pending.
			});
		}
		removeSignalListeners();
	};
	const requestShutdown = async (signal?: "SIGINT" | "SIGTERM"): Promise<void> => {
		if (signal !== undefined) {
			firstSignal ??= signal;
		}
		shutdownPromise ??= shutdown();
		return shutdownPromise;
	};
	const handleSignal = (signal: "SIGINT" | "SIGTERM"): void => {
		for (const callback of signalCaptured) {
			callback(signal);
		}
		void requestShutdown(signal).catch((error: unknown) => {
			process.stderr.write(`Package inspection signal cleanup failed: ${asError(error).message}\n`);
			process.exitCode = 1;
		});
	};
	const onSigint = (): void => {
		handleSignal("SIGINT");
	};
	const onSigterm = (): void => {
		handleSignal("SIGTERM");
	};
	signalListeners.sigint = onSigint;
	signalListeners.sigterm = onSigterm;
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);
	const requireVault = (): string => {
		if (vault === null) {
			throw new Error("Package inspection owner has not started its vault");
		}
		return vault;
	};
	const runOwned = async (
		command: readonly string[],
		env: Readonly<Record<string, string>>,
		options: Readonly<ReadOnlyRunOptions> = {},
	): Promise<ProcessResult> => {
		if (closing) {
			throw new Error("Package inspection owner is shutting down; no new run was started.");
		}
		const result = readOnlyRun(requireVault(), command, env, {
			...options,
			signal: abortController.signal,
		});
		activeRuns.add(result);
		const retire = (): void => {
			activeRuns.delete(result);
		};
		void result.then(retire, retire);
		return result;
	};
	const startProcessFixture = (
		options: Readonly<{
			timeoutMs?: number;
			failStdout?: boolean;
			readinessDelayMs?: number;
		}>,
	): PackageProcessFixtureRun => {
		const marker = join(requireVault(), `.archboard-process-${crypto.randomUUID()}.json`);
		writeFileSync(marker, "");
		fixtureFiles.add(marker);
		const settled = new Set<OwnedSettlementName>();
		let group = 0;
		const result = runOwned(
			[process.execPath, processFixtureEntry],
			{
				ARCHBOARD_PACKAGE_PROCESS_READY: marker,
				ARCHBOARD_PACKAGE_PROCESS_READY_DELAY_MS: String(options.readinessDelayMs ?? 0),
			},
			{
				...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
				...(options.failStdout === true ? { drainStdout: drainThenFail } : {}),
				...(options.failStdout === true ? { drainStderr: drainThenDelay } : {}),
				onSpawn: (spawnedGroup) => {
					group = spawnedGroup;
				},
				onSettlement: (name) => {
					settled.add(name);
				},
			},
		);
		if (group <= 0) {
			throw new Error("Package process fixture did not transfer spawn ownership.");
		}
		void result.catch(() => null);
		const ready = waitForPackageProcessFixtureIdentity(marker, abortController.signal).then(
			(identity: Readonly<PackageProcessGroupIdentity>) => {
				fixtureGroups.set(identity.group, identity);
				const retire = (): void => {
					if (
						fixtureGroups.get(identity.group) === identity &&
						!packageProcessGroupIdentityExists(identity)
					) {
						fixtureGroups.delete(identity.group);
					}
				};
				void result.then(retire, retire);
				return identity;
			},
		);
		activeReadiness.add(ready);
		const retireReadiness = (): void => {
			activeReadiness.delete(ready);
		};
		void ready.then(retireReadiness, retireReadiness);
		void ready.catch(() => null);
		return { group, ready, result, settled: () => [...settled].toSorted() };
	};
	return {
		startVault(): string {
			if (vault !== null) {
				throw new Error("Package inspection owner already started its vault");
			}
			vault = assertOwnedVault(mkdtempSync(join(tempRoot, "archboard-task-130-05-package-")));
			return vault;
		},
		startVaultFile(): string {
			if (vault !== null) {
				throw new Error("Package inspection owner already started its vault");
			}
			const target = join(
				tempRoot,
				`archboard-task-130-05-package-policy-${process.pid}-${crypto.randomUUID()}`,
			);
			writeFileSync(target, "not a vault");
			chmodSync(target, 0);
			vault = assertOwnedVault(target);
			return vault;
		},
		writeBoard(board: string, elements: readonly unknown[]): string {
			const owned = requireVault();
			const note = renderBoardNote(
				{
					type: "excalidraw",
					version: 2,
					source: "archboard",
					elements,
					appState: {},
					files: {},
				},
				null,
				{ board, variant: "current" },
			);
			const target = join(owned, `${board}.excalidraw.md`);
			writeFileSync(target, note);
			return target;
		},
		async runInspection(
			board: string,
			args: readonly string[] = [],
			env: Readonly<Record<string, string>> = {},
		): Promise<ProcessResult> {
			return runOwned([shippedBinary, "check", "--board", board, ...args], env);
		},
		async runBinary(args: readonly string[]): Promise<ProcessResult> {
			return runOwned([shippedBinary, ...args], {});
		},
		startTimeoutFixture(timeoutMs: number): PackageProcessFixtureRun {
			return startProcessFixture({ timeoutMs });
		},
		startDrainFailureFixture(): PackageProcessFixtureRun {
			return startProcessFixture({ failStdout: true });
		},
		startSignalFixture(): PackageProcessFixtureRun {
			return startProcessFixture({});
		},
		startDelayedReadinessFixture(readinessDelayMs: number): PackageProcessFixtureRun {
			return startProcessFixture({ readinessDelayMs });
		},
		artifactPaths(): string[] {
			return [vault, sentinelAcquisition?.log ?? sentinel?.log].filter(
				(candidate): candidate is string => candidate !== null && candidate !== undefined,
			);
		},
		pendingSentinelIdentity(): ProcessIdentity | undefined {
			return sentinelAcquisition?.identity();
		},
		pendingSentinelOwnership(): Promise<void> | undefined {
			return sentinelAcquisition?.ownership;
		},
		onBeforeSignalReplay(callback: () => void): void {
			if (closing) {
				throw new Error("Package inspection owner shutdown already started.");
			}
			beforeSignalReplay.add(callback);
		},
		onSignalCaptured(callback: (signal: "SIGINT" | "SIGTERM") => void): void {
			if (closing) {
				throw new Error("Package inspection owner shutdown already started.");
			}
			signalCaptured.add(callback);
		},
		snapshot(): VaultEntry[] {
			return snapshotVault(requireVault());
		},
		async startHttpSentinel(
			options: Readonly<Omit<SentinelStartOptions, "signal">> = {},
		): Promise<StartedHttpSentinel> {
			if (closing) {
				throw new Error("Package inspection owner is shutting down.");
			}
			if (sentinelAcquisition) {
				throw new Error("Package inspection owner already started its sentinel");
			}
			const acquisition = startSentinel({ ...options, signal: abortController.signal });
			sentinelAcquisition = acquisition;
			const starting = (async (): Promise<StartedHttpSentinel> => {
				const started = await acquisition.ready;
				const stoppedDuringStartup = (): boolean => closing || abortController.signal.aborted;
				if (stoppedDuringStartup()) {
					throw (
						shutdownReason ?? new Error("Package inspection owner stopped during sentinel startup.")
					);
				}
				if (sentinelAcquisition !== acquisition) {
					throw new Error("HTTP sentinel acquisition changed before startup completed.");
				}
				sentinel = started;
				return { url: started.url, contacts: started.contacts, identity: started.identity };
			})();
			pendingSentinelStart = starting;
			void starting.catch(() => null);
			try {
				return await starting;
			} finally {
				if (pendingSentinelStart === starting) {
					pendingSentinelStart = null;
				}
				if (sentinel === null && sentinelAcquisition === acquisition) {
					sentinelAcquisition = null;
				}
			}
		},
		async dispose(): Promise<void> {
			await requestShutdown();
		},
	};
}

export {
	createPackageInspectionOwner,
	processIdentityExists,
	shippedBinary,
	snapshotVault,
	type PackageProcessFixtureRun,
	type PackageProcessGroupIdentity,
	type ProcessIdentity,
	type VaultEntry,
};
