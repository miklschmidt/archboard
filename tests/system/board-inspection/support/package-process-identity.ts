import { readFileSync } from "node:fs";
import {
	processGroupExists,
	processIdentityExists,
	processIdentityOwnsGroup,
	signalOwnedProcessGroup,
} from "../../../../src/runtime/engine/process-group.js";
import type { ProcessIdentity } from "../../../../src/runtime/engine/process-group.js";
import {
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS,
	TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS,
	TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.js";

interface PackageProcessGroupIdentity {
	group: number;
	leader: ProcessIdentity;
	descendant: ProcessIdentity;
}

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

function packageProcessGroupIdentityExists(
	identity: Readonly<PackageProcessGroupIdentity>,
): boolean {
	return processIdentityExists(identity.leader) || processIdentityExists(identity.descendant);
}

function recordedIdentityOwnsGroup(identity: Readonly<PackageProcessGroupIdentity>): boolean {
	return (
		processIdentityOwnsGroup(identity.leader, identity.group) ||
		processIdentityOwnsGroup(identity.descendant, identity.group)
	);
}

async function processGroupDisappeared(pgid: number): Promise<boolean> {
	const deadline = Date.now() + TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_CLEANUP_MS;
	const poll = async (): Promise<boolean> => {
		if (!processGroupExists(pgid)) {
			return true;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		await Bun.sleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS);
		return poll();
	};
	return poll();
}

async function forcePackageProcessGroupGone(
	identity: Readonly<PackageProcessGroupIdentity>,
): Promise<void> {
	if (!processGroupExists(identity.group)) {
		return;
	}
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

function isProcessIdentity(value: unknown): value is ProcessIdentity {
	return (
		value !== null &&
		typeof value === "object" &&
		"pid" in value &&
		Number.isSafeInteger(value.pid) &&
		Number(value.pid) > 0 &&
		"startTime" in value &&
		typeof value.startTime === "string"
	);
}

function isPositiveSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function parseFixtureIdentity(raw: string): PackageProcessGroupIdentity {
	const value: unknown = JSON.parse(raw);
	if (
		value === null ||
		typeof value !== "object" ||
		!("group" in value) ||
		!isPositiveSafeInteger(value.group) ||
		!("leader" in value) ||
		!isProcessIdentity(value.leader) ||
		!("descendant" in value) ||
		!isProcessIdentity(value.descendant)
	) {
		throw new Error(`Package process fixture published invalid identity: ${raw}`);
	}
	if (value.group !== value.leader.pid) {
		throw new Error(`Package process fixture published invalid group: ${raw}`);
	}
	return { group: value.group, leader: value.leader, descendant: value.descendant };
}

async function abortableFixtureSleep(ms: number, signal: Readonly<AbortSignal>): Promise<void> {
	if (signal.aborted) {
		throw asError(signal.reason ?? "Package fixture readiness was aborted.");
	}
	await new Promise<void>((resolve, reject) => {
		const state: { timer?: ReturnType<typeof setTimeout> } = {};
		const onAbort = (): void => {
			if (state.timer !== undefined) {
				clearTimeout(state.timer);
			}
			signal.removeEventListener("abort", onAbort);
			reject(asError(signal.reason ?? "Package fixture readiness was aborted."));
		};
		state.timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) {
			onAbort();
		}
	});
}

async function waitForPackageProcessFixtureIdentity(
	path: string,
	signal: Readonly<AbortSignal>,
): Promise<PackageProcessGroupIdentity> {
	const deadline = Date.now() + TEST_BOARD_INSPECTION_SENTINEL_STARTUP_TIMEOUT_MS;
	const poll = async (lastError?: Readonly<Error>): Promise<PackageProcessGroupIdentity> => {
		if (Date.now() >= deadline) {
			throw new Error(
				`Package process fixture did not publish readiness: ${lastError?.message ?? path}`,
			);
		}
		if (signal.aborted) {
			throw asError(signal.reason ?? "Package fixture readiness was aborted.");
		}
		let nextError = lastError;
		try {
			const raw = readFileSync(path, "utf8");
			if (raw !== "") {
				return parseFixtureIdentity(raw);
			}
		} catch (error) {
			nextError = asError(error);
		}
		await abortableFixtureSleep(TEST_BOARD_INSPECTION_PACKAGE_PROCESS_GROUP_POLL_MS, signal);
		return poll(nextError);
	};
	return poll();
}

export {
	forcePackageProcessGroupGone,
	packageProcessGroupIdentityExists,
	processGroupDisappeared,
	waitForPackageProcessFixtureIdentity,
};
export type { PackageProcessGroupIdentity };
