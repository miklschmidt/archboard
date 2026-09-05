import {
	TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
} from "../../../../src/shared/timing/timing.js";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	processIdentity,
	processIdentityExists,
	signalOwnedProcessGroup,
} from "../../../../src/runtime/engine/process-group.js";
import type {
	ProcessGroupIdentity,
	ProcessIdentity,
} from "../../../../src/runtime/engine/process-group.js";
import {
	forcePackageProcessGroupGone,
	packageProcessGroupIdentityExists,
	processGroupDisappeared,
	waitForPackageProcessFixtureIdentity,
} from "./package-process-identity.js";
import type { PackageProcessGroupIdentity } from "./package-process-identity.js";

interface ProcessResult {
	readonly status: number;
	readonly stdout: string;
	readonly stderr: string;
}

type OwnedSettlementName = "leader" | "stderr" | "stdout";

type OwnedSettlement<T> =
	| { readonly status: "fulfilled"; readonly value: T }
	| { readonly status: "rejected"; readonly error: Readonly<Error> };

interface InspectionSettlements {
	readonly leader: OwnedSettlement<number>;
	readonly stdout: OwnedSettlement<string>;
	readonly stderr: OwnedSettlement<string>;
}

interface TerminationReason {
	readonly kind: "cleanup" | "signal" | "stream" | "timeout";
	readonly error: Readonly<Error>;
}

interface ReadOnlyRunOptions {
	readonly timeoutMs?: number;
	readonly signal?: Readonly<AbortSignal>;
	readonly captureProcessGroup?: (
		pid: number,
	) => Readonly<ProcessGroupIdentity> | Promise<Readonly<ProcessGroupIdentity>>;
	readonly drainStdout?: (stream: Readonly<ReadableStream<Uint8Array>>) => Promise<string>;
	readonly drainStderr?: (stream: Readonly<ReadableStream<Uint8Array>>) => Promise<string>;
	readonly onSpawn?: (group: number) => void;
	readonly onSettlement?: (name: OwnedSettlementName) => void;
	readonly groupIdentityForSignal?: (
		identity: Readonly<ProcessGroupIdentity>,
		signal: NodeJS.Signals,
	) => Readonly<ProcessGroupIdentity>;
}

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

function signalAborted(signal: Readonly<AbortSignal> | undefined): boolean {
	return signal?.aborted === true;
}

function requestIfGroupExists(
	identity: Readonly<ProcessGroupIdentity>,
	message: string,
	requestTermination: (reason: Readonly<TerminationReason>) => void,
): void {
	try {
		if (processGroupExists(identity.group)) {
			requestTermination({ kind: "cleanup", error: new Error(message) });
		}
	} catch (error) {
		requestTermination({ kind: "cleanup", error: asError(error) });
	}
}

async function observeOwned<T>(
	name: OwnedSettlementName,
	promise: Readonly<Promise<T>>,
	onSettlement: (name: OwnedSettlementName) => void,
	onFailure: (error: Readonly<Error>) => void,
): Promise<OwnedSettlement<T>> {
	return promise.then(
		(value) => {
			onSettlement(name);
			return { status: "fulfilled", value };
		},
		(error: unknown) => {
			const failure = asError(error);
			onSettlement(name);
			onFailure(failure);
			return { status: "rejected", error: failure };
		},
	);
}

async function withinCleanup<T>(promise: Readonly<Promise<T>>): Promise<T | undefined> {
	const deadlineReached = Symbol("deadlineReached");
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const outcome = await Promise.race([
			promise,
			new Promise<typeof deadlineReached>((resolve) => {
				timer = setTimeout(() => {
					resolve(deadlineReached);
				}, TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS);
			}),
		]);
		return outcome === deadlineReached ? undefined : outcome;
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

async function terminateInspectionGroup(
	identity: Readonly<ProcessGroupIdentity>,
	settlements: Readonly<Promise<InspectionSettlements>>,
	groupIdentityForSignal: ReadOnlyRunOptions["groupIdentityForSignal"],
): Promise<InspectionSettlements> {
	const failures: Error[] = [];
	try {
		signalOwnedProcessGroup(groupIdentityForSignal?.(identity, "SIGTERM") ?? identity, "SIGTERM");
	} catch (error) {
		failures.push(asError(error));
	}
	let disappeared = false;
	try {
		disappeared = await processGroupDisappeared(identity.group);
	} catch (error) {
		failures.push(asError(error));
	}
	if (!disappeared) {
		try {
			signalOwnedProcessGroup(groupIdentityForSignal?.(identity, "SIGKILL") ?? identity, "SIGKILL");
		} catch (error) {
			failures.push(asError(error));
		}
		try {
			disappeared = await processGroupDisappeared(identity.group);
		} catch (error) {
			failures.push(asError(error));
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
	const [firstFailure] = failures;
	if (firstFailure !== undefined && failures.length === 1) {
		throw firstFailure;
	}
	if (failures.length > 1) {
		throw new AggregateError(
			failures,
			`Package inspection process group ${identity.group} cleanup failed.`,
		);
	}
	if (settled === undefined) {
		throw new Error("Package inspection cleanup did not settle.");
	}
	return settled;
}

function rejectedSettlement(
	settlements: Readonly<InspectionSettlements>,
): Readonly<Error> | undefined {
	for (const settlement of [settlements.leader, settlements.stdout, settlements.stderr]) {
		if (settlement.status === "rejected") {
			return settlement.error;
		}
	}
	return undefined;
}

async function terminateFreshDetachedGroup(
	group: number,
	settlements: Readonly<Promise<InspectionSettlements>>,
): Promise<void> {
	try {
		process.kill(-group, "SIGKILL");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
			throw asError(error);
		}
	}
	const completed = await withinCleanup(Promise.all([processGroupDisappeared(group), settlements]));
	if (completed === undefined) {
		throw new Error(
			`Fresh package inspection process group ${group} left live members or unsettled pipes.`,
		);
	}
	if (!completed[0]) {
		throw new Error(`Fresh package inspection process group ${group} survived SIGKILL.`);
	}
}

async function runReadOnlyPackageProcess(
	root: string,
	vault: string,
	command: readonly string[],
	env: Readonly<Record<string, string>>,
	snapshotVault: () => unknown,
	options: Readonly<ReadOnlyRunOptions> = {},
): Promise<ProcessResult> {
	if (options.signal?.aborted === true) {
		throw asError(options.signal.reason);
	}
	const before = snapshotVault();
	let firstTermination: TerminationReason | undefined;
	let resolveTermination!: (reason: Readonly<TerminationReason>) => void;
	const terminationRequested = new Promise<TerminationReason>((resolve) => {
		resolveTermination = resolve;
	});
	const requestTermination = (reason: Readonly<TerminationReason>): void => {
		if (firstTermination !== undefined) {
			return;
		}
		firstTermination = reason;
		resolveTermination(reason);
	};
	const onAbort = (): void => {
		requestTermination({
			kind: "signal",
			error: asError(options.signal?.reason ?? "Package inspection interrupted."),
		});
	};
	const child = ((): Bun.Subprocess<"ignore", "pipe", "pipe"> => {
		try {
			return Bun.spawn([...command], {
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
		} catch (error) {
			throw new Error(`Could not start package inspection: ${asError(error).message}`, {
				cause: error,
			});
		}
	})();
	const recordSettlement = (name: OwnedSettlementName): void => {
		options.onSettlement?.(name);
	};
	const stdoutStream = child.stdout;
	const stderrStream = child.stderr;
	const leader = observeOwned("leader", child.exited, recordSettlement, (error) => {
		requestTermination({ kind: "cleanup", error });
	});
	const stdout = observeOwned(
		"stdout",
		Promise.resolve().then(async (): Promise<string> => {
			const drain =
				options.drainStdout ??
				(async (stream: Readonly<ReadableStream<Uint8Array>>): Promise<string> =>
					new Response(stream).text());
			return drain(stdoutStream);
		}),
		recordSettlement,
		(error) => {
			requestTermination({ kind: "stream", error });
		},
	);
	const stderr = observeOwned(
		"stderr",
		Promise.resolve().then(async (): Promise<string> => {
			const drain =
				options.drainStderr ??
				(async (stream: Readonly<ReadableStream<Uint8Array>>): Promise<string> =>
					new Response(stream).text());
			return drain(stderrStream);
		}),
		recordSettlement,
		(error) => {
			requestTermination({ kind: "stream", error });
		},
	);
	const settlements = Promise.all([leader, stdout, stderr]).then(
		(
			values: readonly [OwnedSettlement<number>, OwnedSettlement<string>, OwnedSettlement<string>],
		): InspectionSettlements => {
			const [settledLeader, settledStdout, settledStderr] = values;
			return {
				leader: settledLeader,
				stdout: settledStdout,
				stderr: settledStderr,
			};
		},
	);
	let groupIdentity: ProcessGroupIdentity;
	try {
		const captured = (options.captureProcessGroup ?? captureDetachedProcessGroup)(child.pid);
		groupIdentity = captured instanceof Promise ? await captured : captured;
	} catch (error) {
		let cleanupFailure: unknown;
		try {
			await terminateFreshDetachedGroup(child.pid, settlements);
		} catch (cleanupError) {
			cleanupFailure = cleanupError;
		}
		const startFailure = new Error(
			`Could not start package inspection: ${asError(error).message}`,
			{
				cause: error,
			},
		);
		if (cleanupFailure !== undefined) {
			throw new AggregateError(
				[startFailure, cleanupFailure],
				`${startFailure.message}; detached process-group cleanup failed.`,
				{ cause: error },
			);
		}
		throw startFailure;
	}
	options.signal?.addEventListener("abort", onAbort, { once: true });
	if (signalAborted(options.signal)) {
		onAbort();
	}
	void leader.then((outcome: Readonly<OwnedSettlement<number>>) => {
		if (outcome.status !== "fulfilled") {
			return null;
		}
		requestIfGroupExists(
			groupIdentity,
			"Package inspection leader exited while its process group remained live.",
			requestTermination,
		);
		return null;
	});
	try {
		options.onSpawn?.(groupIdentity.group);
	} catch (error) {
		requestTermination({ kind: "cleanup", error: asError(error) });
	}
	const timeoutMs = options.timeoutMs ?? TEST_BOARD_INSPECTION_PACKAGE_COMMAND_TIMEOUT_MS;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let completed: InspectionSettlements | undefined;
	let cleanupFailure: Error | undefined;
	try {
		timeout = setTimeout(() => {
			requestTermination({
				kind: "timeout",
				error: new Error(`Package inspection exceeded ${timeoutMs}ms.`),
			});
		}, timeoutMs);
		const first = await Promise.race([
			settlements.then((value: Readonly<InspectionSettlements>) => ({
				kind: "complete" as const,
				value,
			})),
			terminationRequested.then((reason: Readonly<TerminationReason>) => ({
				kind: "terminate" as const,
				reason,
			})),
		]);
		if (first.kind === "complete") {
			completed = first.value;
			const rejected = rejectedSettlement(completed);
			if (rejected !== undefined) {
				requestTermination({ kind: "stream", error: rejected });
			}
			if (firstTermination === undefined) {
				requestIfGroupExists(
					groupIdentity,
					"Package inspection completed while its process group remained live.",
					requestTermination,
				);
			}
		}
		if (firstTermination) {
			try {
				completed = await terminateInspectionGroup(
					groupIdentity,
					settlements,
					options.groupIdentityForSignal,
				);
			} catch (error) {
				cleanupFailure = asError(error);
			}
		}
	} finally {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}
		options.signal?.removeEventListener("abort", onAbort);
	}
	if (firstTermination) {
		if (cleanupFailure) {
			throw new AggregateError(
				[firstTermination.error, cleanupFailure],
				`Package inspection ${firstTermination.kind} and cleanup both failed.`,
			);
		}
		throw asError(firstTermination.error);
	}
	if (!completed) {
		throw new Error("Package inspection settlements were not observed.");
	}
	if (
		completed.leader.status !== "fulfilled" ||
		completed.stdout.status !== "fulfilled" ||
		completed.stderr.status !== "fulfilled"
	) {
		throw new Error("Package inspection completed without all owned results.");
	}
	const after = snapshotVault();
	if (JSON.stringify(after) !== JSON.stringify(before)) {
		throw new Error(
			`Package inspection mutated its vault: ${JSON.stringify({ before, after }, null, 2)}`,
		);
	}
	return {
		status: completed.leader.value,
		stdout: completed.stdout.value,
		stderr: completed.stderr.value,
	};
}

export {
	forcePackageProcessGroupGone,
	packageProcessGroupIdentityExists,
	processIdentity,
	processIdentityExists,
	runReadOnlyPackageProcess,
	waitForPackageProcessFixtureIdentity,
	type OwnedSettlementName,
	type PackageProcessGroupIdentity,
	type ProcessIdentity,
	type ProcessResult,
	type ReadOnlyRunOptions,
};
