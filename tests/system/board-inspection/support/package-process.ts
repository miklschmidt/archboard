import { readFileSync } from "node:fs";
import {
	TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS,
	TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.js";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	processIdentity,
	processIdentityExists,
	processIdentityOwnsGroup,
	signalOwnedProcessGroup,
	type ProcessGroupIdentity,
	type ProcessIdentity,
} from "../../../../src/runtime/engine/process-group.js";

export interface ProcessResult {
	status: number;
	stdout: string;
	stderr: string;
}

export { processIdentity, processIdentityExists, type ProcessIdentity };

export interface PackageProcessGroupIdentity {
	group: number;
	leader: ProcessIdentity;
	descendant: ProcessIdentity;
}

export type OwnedSettlementName = "leader" | "stderr" | "stdout";

type OwnedSettlement<T> = { status: "fulfilled"; value: T } | { status: "rejected"; error: Error };

interface InspectionSettlements {
	leader: OwnedSettlement<number>;
	stdout: OwnedSettlement<string>;
	stderr: OwnedSettlement<string>;
}

interface TerminationReason {
	kind: "cleanup" | "signal" | "stream" | "timeout";
	error: Error;
}

export interface ReadOnlyRunOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
	captureProcessGroup?: (pid: number) => ProcessGroupIdentity;
	drainStdout?: (stream: ReadableStream<Uint8Array>) => Promise<string>;
	drainStderr?: (stream: ReadableStream<Uint8Array>) => Promise<string>;
	onSpawn?: (group: number) => void;
	onSettlement?: (name: OwnedSettlementName) => void;
	groupIdentityForSignal?: (
		identity: ProcessGroupIdentity,
		signal: NodeJS.Signals,
	) => ProcessGroupIdentity;
}

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

export function packageProcessGroupIdentityExists(identity: PackageProcessGroupIdentity): boolean {
	return processIdentityExists(identity.leader) || processIdentityExists(identity.descendant);
}

function recordedIdentityOwnsGroup(identity: PackageProcessGroupIdentity): boolean {
	return (
		processIdentityOwnsGroup(identity.leader, identity.group) ||
		processIdentityOwnsGroup(identity.descendant, identity.group)
	);
}

async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS;
	for (;;) {
		if (!processGroupExists(pgid)) return true;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS);
	}
}

export async function forcePackageProcessGroupGone(
	identity: PackageProcessGroupIdentity,
): Promise<void> {
	if (!processGroupExists(identity.group)) return;
	if (!recordedIdentityOwnsGroup(identity)) {
		throw new Error(
			`Refusing to signal package process group ${identity.group}: its recorded identities no longer own that group.`,
		);
	}
	const owner = processIdentityOwnsGroup(identity.leader, identity.group)
		? identity.leader
		: identity.descendant;
	signalOwnedProcessGroup({ group: identity.group, leader: owner }, "SIGKILL");
	if (!(await processGroupDisappeared(identity.group))) {
		throw new Error(`Package process fixture group ${identity.group} survived owner disposal.`);
	}
}

function parseFixtureIdentity(raw: string): PackageProcessGroupIdentity {
	const value = JSON.parse(raw) as Partial<PackageProcessGroupIdentity>;
	for (const candidate of [value.leader, value.descendant]) {
		if (
			!candidate ||
			!Number.isSafeInteger(candidate.pid) ||
			candidate.pid! <= 0 ||
			typeof candidate.startTime !== "string"
		)
			throw new Error(`Package process fixture published invalid identity: ${raw}`);
	}
	if (
		!Number.isSafeInteger(value.group) ||
		value.group! <= 0 ||
		value.group !== value.leader!.pid
	) {
		throw new Error(`Package process fixture published invalid group: ${raw}`);
	}
	return value as PackageProcessGroupIdentity;
}

async function abortableFixtureSleep(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) throw asError(signal.reason ?? "Package fixture readiness was aborted.");
	await new Promise<void>((resolveSleep, rejectSleep) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolveSleep();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			rejectSleep(asError(signal.reason ?? "Package fixture readiness was aborted."));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
}

export async function waitForPackageProcessFixtureIdentity(
	path: string,
	signal: AbortSignal,
): Promise<PackageProcessGroupIdentity> {
	const deadline = Date.now() + TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS;
	let lastError: Error | undefined;
	while (Date.now() < deadline) {
		if (signal.aborted) throw asError(signal.reason ?? "Package fixture readiness was aborted.");
		try {
			const raw = readFileSync(path, "utf8");
			if (raw) return parseFixtureIdentity(raw);
		} catch (cause) {
			lastError = asError(cause);
		}
		await abortableFixtureSleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS, signal);
	}
	throw new Error(
		`Package process fixture did not publish readiness: ${lastError?.message ?? path}`,
	);
}

function observeOwned<T>(
	name: OwnedSettlementName,
	promise: Promise<T>,
	onSettlement: (name: OwnedSettlementName) => void,
	onFailure: (error: Error) => void,
): Promise<OwnedSettlement<T>> {
	return promise.then(
		(value) => {
			onSettlement(name);
			return { status: "fulfilled", value };
		},
		(cause) => {
			const error = asError(cause);
			onSettlement(name);
			onFailure(error);
			return { status: "rejected", error };
		},
	);
}

async function withinCleanup<T>(promise: Promise<T>): Promise<T | undefined> {
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
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function terminateInspectionGroup(
	identity: ProcessGroupIdentity,
	settlements: Promise<InspectionSettlements>,
	groupIdentityForSignal: ReadOnlyRunOptions["groupIdentityForSignal"],
): Promise<InspectionSettlements> {
	const failures: Error[] = [];
	try {
		signalOwnedProcessGroup(groupIdentityForSignal?.(identity, "SIGTERM") ?? identity, "SIGTERM");
	} catch (cause) {
		failures.push(asError(cause));
	}
	let disappeared = false;
	try {
		disappeared = await processGroupDisappeared(identity.group);
	} catch (cause) {
		failures.push(asError(cause));
	}
	if (!disappeared) {
		try {
			signalOwnedProcessGroup(groupIdentityForSignal?.(identity, "SIGKILL") ?? identity, "SIGKILL");
		} catch (cause) {
			failures.push(asError(cause));
		}
		try {
			disappeared = await processGroupDisappeared(identity.group);
		} catch (cause) {
			failures.push(asError(cause));
		}
	}
	if (!disappeared) {
		failures.push(
			new Error(`Package inspection process group ${identity.group} survived SIGKILL.`),
		);
	}
	const settled = await withinCleanup(settlements);
	if (settled === undefined) {
		failures.push(
			new Error(
				`Package inspection process group ${identity.group} left unsettled pipes or leader.`,
			),
		);
	}
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1) {
		throw new AggregateError(
			failures,
			`Package inspection process group ${identity.group} cleanup failed.`,
		);
	}
	return settled!;
}

function rejectedSettlement(settlements: InspectionSettlements): Error | undefined {
	for (const settlement of [settlements.leader, settlements.stdout, settlements.stderr]) {
		if (settlement.status === "rejected") return settlement.error;
	}
	return undefined;
}

export async function runReadOnlyPackageProcess(
	root: string,
	vault: string,
	command: readonly string[],
	env: Record<string, string>,
	snapshotVault: () => unknown,
	options: ReadOnlyRunOptions = {},
): Promise<ProcessResult> {
	if (options.signal?.aborted) throw asError(options.signal.reason);
	const before = snapshotVault();
	let firstTermination: TerminationReason | undefined;
	let resolveTermination!: (reason: TerminationReason) => void;
	const terminationRequested = new Promise<TerminationReason>((resolveRequest) => {
		resolveTermination = resolveRequest;
	});
	const requestTermination = (reason: TerminationReason): void => {
		if (firstTermination) return;
		firstTermination = reason;
		resolveTermination(reason);
	};
	const onAbort = (): void => {
		requestTermination({
			kind: "signal",
			error: asError(options.signal?.reason ?? "Package inspection interrupted."),
		});
	};
	let child: ReturnType<typeof Bun.spawn>;
	try {
		child = Bun.spawn([...command], {
			cwd: root,
			detached: true,
			env: {
				...process.env,
				...env,
				ARCHBOARD_VAULT: vault,
				EXCALIDRAW_NO_AUTOSTART: "1",
			},
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (cause) {
		throw new Error(`Could not start package inspection: ${(cause as Error).message}`, {
			cause,
		});
	}
	let groupIdentity: ProcessGroupIdentity;
	try {
		groupIdentity = (options.captureProcessGroup ?? captureDetachedProcessGroup)(child.pid);
	} catch (cause) {
		try {
			child.kill("SIGKILL");
		} catch {
			// The exact spawned child may already have exited.
		}
		await Promise.allSettled([
			child.exited,
			new Response(child.stdout as ReadableStream<Uint8Array>).arrayBuffer(),
			new Response(child.stderr as ReadableStream<Uint8Array>).arrayBuffer(),
		]);
		throw new Error(`Could not start package inspection: ${(cause as Error).message}`, {
			cause,
		});
	}
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (options.signal?.aborted) onAbort();
	const recordSettlement = (name: OwnedSettlementName): void => options.onSettlement?.(name);
	const stdoutStream = child.stdout as ReadableStream<Uint8Array>;
	const stderrStream = child.stderr as ReadableStream<Uint8Array>;
	const leader = observeOwned("leader", child.exited, recordSettlement, (error) =>
		requestTermination({ kind: "cleanup", error }),
	);
	const stdout = observeOwned(
		"stdout",
		Promise.resolve().then(() =>
			(options.drainStdout ?? ((stream) => new Response(stream).text()))(stdoutStream),
		),
		recordSettlement,
		(error) => requestTermination({ kind: "stream", error }),
	);
	const stderr = observeOwned(
		"stderr",
		Promise.resolve().then(() =>
			(options.drainStderr ?? ((stream) => new Response(stream).text()))(stderrStream),
		),
		recordSettlement,
		(error) => requestTermination({ kind: "stream", error }),
	);
	void leader.then((outcome) => {
		if (outcome.status !== "fulfilled") return undefined;
		try {
			if (processGroupExists(groupIdentity.group)) {
				requestTermination({
					kind: "cleanup",
					error: new Error(
						"Package inspection leader exited while its process group remained live.",
					),
				});
			}
		} catch (cause) {
			requestTermination({ kind: "cleanup", error: asError(cause) });
		}
		return undefined;
	});
	const settlements = Promise.all([leader, stdout, stderr]).then(
		([settledLeader, settledStdout, settledStderr]): InspectionSettlements => ({
			leader: settledLeader,
			stdout: settledStdout,
			stderr: settledStderr,
		}),
	);
	try {
		options.onSpawn?.(groupIdentity.group);
	} catch (cause) {
		requestTermination({ kind: "cleanup", error: asError(cause) });
	}
	const timeoutMs = options.timeoutMs ?? TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let completed: InspectionSettlements | undefined;
	let cleanupFailure: Error | undefined;
	try {
		timeout = setTimeout(
			() =>
				requestTermination({
					kind: "timeout",
					error: new Error(`Package inspection exceeded ${timeoutMs}ms.`),
				}),
			timeoutMs,
		);
		const first = await Promise.race([
			settlements.then((value) => ({ kind: "complete" as const, value })),
			terminationRequested.then((reason) => ({ kind: "terminate" as const, reason })),
		]);
		if (first.kind === "complete") {
			completed = first.value;
			const rejected = rejectedSettlement(completed);
			if (rejected) requestTermination({ kind: "stream", error: rejected });
			if (!firstTermination) {
				try {
					if (processGroupExists(groupIdentity.group)) {
						requestTermination({
							kind: "cleanup",
							error: new Error(
								"Package inspection completed while its process group remained live.",
							),
						});
					}
				} catch (cause) {
					requestTermination({ kind: "cleanup", error: asError(cause) });
				}
			}
		}
		if (firstTermination) {
			try {
				completed = await terminateInspectionGroup(
					groupIdentity,
					settlements,
					options.groupIdentityForSignal,
				);
			} catch (cause) {
				cleanupFailure = asError(cause);
			}
		}
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
		options.signal?.removeEventListener("abort", onAbort);
	}
	if (firstTermination) {
		if (cleanupFailure) {
			throw new AggregateError(
				[firstTermination.error, cleanupFailure],
				`Package inspection ${firstTermination.kind} and cleanup both failed.`,
			);
		}
		throw firstTermination.error;
	}
	if (!completed) throw new Error("Package inspection settlements were not observed.");
	if (
		completed.leader.status !== "fulfilled" ||
		completed.stdout.status !== "fulfilled" ||
		completed.stderr.status !== "fulfilled"
	)
		throw new Error("Package inspection completed without all owned results.");
	const after = snapshotVault();
	if (JSON.stringify(after) !== JSON.stringify(before))
		throw new Error(
			`Package inspection mutated its vault: ${JSON.stringify({ before, after }, null, 2)}`,
		);
	return {
		status: completed.leader.value,
		stdout: completed.stdout.value,
		stderr: completed.stderr.value,
	};
}
