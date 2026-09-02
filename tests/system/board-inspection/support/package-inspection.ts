import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBoardNote } from "../../../../src/runtime/engine/board.js";
import { TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS } from "../../../../src/shared/timing/timing.js";
import {
	forcePackageProcessGroupGone,
	packageProcessGroupIdentityExists,
	runReadOnlyPackageProcess,
	waitForPackageProcessFixtureIdentity,
	type OwnedSettlementName,
	type PackageProcessGroupIdentity,
	type ProcessIdentity,
	type ProcessResult,
	type ReadOnlyRunOptions,
} from "./package-process.js";
import {
	startSentinel,
	type Sentinel,
	type SentinelAcquisition,
	type SentinelStartOptions,
} from "./package-sentinel.js";

export {
	processIdentityExists,
	type PackageProcessGroupIdentity,
	type ProcessIdentity,
} from "./package-process.js";

export interface VaultEntry {
	path: string;
	bytes: string;
	mtimeMs: number;
}

export interface PackageProcessFixtureRun {
	group: number;
	ready: Promise<PackageProcessGroupIdentity>;
	result: Promise<ProcessResult>;
	settled: () => OwnedSettlementName[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	bin: { archboard: string };
};
export const shippedBinary = join(root, manifest.bin.archboard);
const tempRoot = realpathSync(tmpdir());
const vaultPrefix = `${tempRoot}/archboard-task-130-05-package-`;
const processFixtureEntry = fileURLToPath(
	new URL("../fixtures/package-process-group.ts", import.meta.url),
);
const injectedDrainFailure = "Injected package stdout drain failure.";

function assertOwnedVault(vault: string): string {
	const resolved = realpathSync(vault);
	if (!resolved.startsWith(vaultPrefix))
		throw new Error(`Refusing unsafe package vault: ${resolved}`);
	return resolved;
}

export function snapshotVault(vault: string): VaultEntry[] {
	if (!existsSync(vault)) return [];
	const rootInfo = lstatSync(vault);
	if (!rootInfo.isDirectory())
		return [
			{
				path: ".",
				bytes: readFileSync(vault).toString("base64"),
				mtimeMs: statSync(vault).mtimeMs,
			},
		];
	const visit = (directory: string): VaultEntry[] =>
		readdirSync(directory).flatMap((name) => {
			const full = join(directory, name);
			const info = lstatSync(full);
			if (info.isDirectory()) return visit(full);
			return [
				{
					path: relative(vault, full),
					bytes: readFileSync(full).toString("base64"),
					mtimeMs: statSync(full).mtimeMs,
				},
			];
		});
	return visit(vault).toSorted((a, b) => a.path.localeCompare(b.path));
}

function snapshotGuardedVault(vault: string): VaultEntry[] {
	const info = lstatSync(vault);
	const mode = info.mode & 0o777;
	if (info.isDirectory() || (mode & 0o400) !== 0) return snapshotVault(vault);
	chmodSync(vault, mode | 0o600);
	try {
		return snapshotVault(vault);
	} finally {
		chmodSync(vault, mode);
	}
}

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

async function readOnlyRun(
	vault: string,
	command: readonly string[],
	env: Record<string, string>,
	options: ReadOnlyRunOptions = {},
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

async function drainThenFail(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	try {
		const first = await reader.read();
		if (first.done) throw new Error("Package fixture stdout ended before drain injection.");
		throw new Error(injectedDrainFailure);
	} finally {
		reader.releaseLock();
	}
}

async function drainThenDelay(stream: ReadableStream<Uint8Array>): Promise<string> {
	const output = await new Response(stream).text();
	await Bun.sleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS / 2);
	return output;
}

export function createPackageInspectionOwner() {
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
	const removeSignalListeners = (): void => {
		process.removeListener("SIGINT", onSigint);
		process.removeListener("SIGTERM", onSigterm);
	};
	const removeVault = (): void => {
		if (!vault) return;
		const owned = vault;
		vault = null;
		if (!existsSync(owned)) return;
		const checked = assertOwnedVault(owned);
		if (!lstatSync(checked).isDirectory()) chmodSync(checked, 0o600);
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
			} catch (cause) {
				if (cause !== reason) failures.push(asError(cause));
			} finally {
				rmSync(ownedSentinel.log, { force: true });
				if (sentinelAcquisition === ownedSentinel) sentinelAcquisition = null;
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
		for (const [group, identity] of fixtureGroups) {
			if (!packageProcessGroupIdentityExists(identity)) {
				fixtureGroups.delete(group);
				continue;
			}
			try {
				await forcePackageProcessGroupGone(identity);
				fixtureGroups.delete(group);
			} catch (cause) {
				failures.push(asError(cause));
			}
		}
		for (const file of fixtureFiles) {
			rmSync(file, { force: true });
			fixtureFiles.delete(file);
		}
		try {
			removeVault();
		} catch (cause) {
			failures.push(asError(cause));
		}
		if (failures.length === 0 && firstSignal) {
			for (const callback of beforeSignalReplay) {
				try {
					callback();
				} catch (cause) {
					failures.push(asError(cause));
				}
			}
		}
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1) {
			throw new AggregateError(failures, "Package inspection owner shutdown failed.");
		}
		if (firstSignal) {
			removeSignalListeners();
			process.kill(process.pid, firstSignal);
			await new Promise<never>(() => undefined);
		}
		removeSignalListeners();
	};
	const requestShutdown = (signal?: "SIGINT" | "SIGTERM"): Promise<void> => {
		if (signal) firstSignal ??= signal;
		shutdownPromise ??= shutdown();
		return shutdownPromise;
	};
	const handleSignal = (signal: "SIGINT" | "SIGTERM"): void => {
		for (const callback of signalCaptured) callback(signal);
		void requestShutdown(signal).catch((cause) => {
			process.stderr.write(`Package inspection signal cleanup failed: ${asError(cause).message}\n`);
			process.exitCode = 1;
		});
	};
	const onSigint = (): void => handleSignal("SIGINT");
	const onSigterm = (): void => handleSignal("SIGTERM");
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);
	const requireVault = () => {
		if (!vault) throw new Error("Package inspection owner has not started its vault");
		return vault;
	};
	const startProcessFixture = (options: {
		timeoutMs?: number;
		failStdout?: boolean;
		readinessDelayMs?: number;
	}): PackageProcessFixtureRun => {
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
				...(options.failStdout ? { drainStdout: drainThenFail } : {}),
				...(options.failStdout ? { drainStderr: drainThenDelay } : {}),
				onSpawn: (spawnedGroup) => {
					group = spawnedGroup;
				},
				onSettlement: (name) => settled.add(name),
			},
		);
		if (group <= 0) throw new Error("Package process fixture did not transfer spawn ownership.");
		void result.catch(() => undefined);
		const ready = waitForPackageProcessFixtureIdentity(marker, abortController.signal).then(
			(identity) => {
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
		void ready.catch(() => undefined);
		return { group, ready, result, settled: () => [...settled].toSorted() };
	};
	const runOwned = async (
		command: readonly string[],
		env: Record<string, string>,
		options: ReadOnlyRunOptions = {},
	): Promise<ProcessResult> => {
		if (closing)
			throw new Error("Package inspection owner is shutting down; no new run was started.");
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
	return {
		startVault(): string {
			if (vault) throw new Error("Package inspection owner already started its vault");
			vault = assertOwnedVault(mkdtempSync(join(tempRoot, "archboard-task-130-05-package-")));
			return vault;
		},
		startVaultFile(): string {
			if (vault) throw new Error("Package inspection owner already started its vault");
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
		runInspection(
			board: string,
			args: readonly string[] = [],
			env: Record<string, string> = {},
		): Promise<ProcessResult> {
			return runOwned([shippedBinary, "check", "--board", board, ...args], env);
		},
		runBinary(args: readonly string[]): Promise<ProcessResult> {
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
				(path): path is string => path !== null && path !== undefined,
			);
		},
		pendingSentinelIdentity(): ProcessIdentity | undefined {
			return sentinelAcquisition?.identity();
		},
		pendingSentinelOwnership(): Promise<void> | undefined {
			return sentinelAcquisition?.ownership;
		},
		onBeforeSignalReplay(callback: () => void): void {
			if (closing) throw new Error("Package inspection owner shutdown already started.");
			beforeSignalReplay.add(callback);
		},
		onSignalCaptured(callback: (signal: "SIGINT" | "SIGTERM") => void): void {
			if (closing) throw new Error("Package inspection owner shutdown already started.");
			signalCaptured.add(callback);
		},
		snapshot(): VaultEntry[] {
			return snapshotVault(requireVault());
		},
		async startHttpSentinel(options: Omit<SentinelStartOptions, "signal"> = {}): Promise<{
			url: string;
			contacts: () => string;
			identity: ProcessIdentity;
		}> {
			if (closing) throw new Error("Package inspection owner is shutting down.");
			if (sentinelAcquisition) {
				throw new Error("Package inspection owner already started its sentinel");
			}
			const acquisition = startSentinel({ ...options, signal: abortController.signal });
			sentinelAcquisition = acquisition;
			const starting = acquisition.ready.then((started) => {
				if (closing || abortController.signal.aborted) {
					throw (
						shutdownReason ?? new Error("Package inspection owner stopped during sentinel startup.")
					);
				}
				if (sentinelAcquisition !== acquisition) {
					throw new Error("HTTP sentinel acquisition changed before startup completed.");
				}
				sentinel = started;
				return { url: started.url, contacts: started.contacts, identity: started.identity };
			});
			pendingSentinelStart = starting;
			void starting.catch(() => undefined);
			try {
				return await starting;
			} finally {
				if (pendingSentinelStart === starting) pendingSentinelStart = null;
				if (!sentinel && sentinelAcquisition === acquisition) sentinelAcquisition = null;
			}
		},
		async dispose(): Promise<void> {
			await requestShutdown();
		},
	};
}
