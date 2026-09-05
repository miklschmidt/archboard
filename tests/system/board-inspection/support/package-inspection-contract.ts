import type {
	OwnedSettlementName,
	PackageProcessGroupIdentity,
	ProcessIdentity,
	ProcessResult,
} from "./package-process.js";
import type { SentinelStartOptions } from "./package-sentinel.js";
import type { VaultEntry } from "./package-vault.js";

interface PackageProcessFixtureRun {
	readonly group: number;
	readonly ready: Promise<PackageProcessGroupIdentity>;
	readonly result: Promise<ProcessResult>;
	readonly settled: () => OwnedSettlementName[];
}

interface StartedHttpSentinel {
	readonly url: string;
	readonly contacts: () => string;
	readonly identity: ProcessIdentity;
}

interface PackageInspectionOwner {
	readonly startVault: () => string;
	readonly startVaultFile: () => string;
	readonly writeBoard: (board: string, elements: readonly unknown[]) => string;
	readonly runInspection: (
		board: string,
		args?: readonly string[],
		env?: Readonly<Record<string, string>>,
	) => Promise<ProcessResult>;
	readonly runBinary: (args: readonly string[]) => Promise<ProcessResult>;
	readonly startTimeoutFixture: (timeoutMs: number) => PackageProcessFixtureRun;
	readonly startDrainFailureFixture: () => PackageProcessFixtureRun;
	readonly startSignalFixture: () => PackageProcessFixtureRun;
	readonly startDelayedReadinessFixture: (readinessDelayMs: number) => PackageProcessFixtureRun;
	readonly artifactPaths: () => string[];
	readonly pendingSentinelIdentity: () => ProcessIdentity | undefined;
	readonly pendingSentinelOwnership: () => Promise<void> | undefined;
	readonly onBeforeSignalReplay: (callback: () => void) => void;
	readonly onSignalCaptured: (callback: (signal: "SIGINT" | "SIGTERM") => void) => void;
	readonly snapshot: () => VaultEntry[];
	readonly startHttpSentinel: (
		options?: Readonly<Omit<SentinelStartOptions, "signal">>,
	) => Promise<StartedHttpSentinel>;
	readonly dispose: () => Promise<void>;
}

export type { PackageInspectionOwner, PackageProcessFixtureRun, StartedHttpSentinel };
