import fs from "node:fs";
import { join } from "node:path";

import { TEST_CANVAS_HEALTH_POLL_MS, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS } from "./timing.ts";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
	type CodexProcessGroupOperations,
} from "../../../src/runtime/codex-process/process-group.ts";
import { listProcessObservations, readProcessObservation } from "@/shared/process-observation";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function directChildGroups(parentPid: number): CodexProcessGroupIdentity[] {
	const children = listProcessObservations().filter(
		(observation) => observation.state !== "zombie" && observation.parentPid === parentPid,
	);
	const operations = createCodexProcessGroupOperations();
	return children.flatMap((child) => {
		try {
			const group = operations.capture(child.pid);
			if (group.leaderStartTime !== child.startTime || group.pgid !== child.pgid) {
				throw new Error(`Child process ${child.pid} changed while its group was captured.`);
			}
			return [group];
		} catch (error) {
			const fresh = readProcessObservation(child.pid);
			if (fresh === undefined || fresh.startTime !== child.startTime || fresh.pgid !== child.pgid) {
				return [];
			}
			throw error;
		}
	});
}

type GroupOperations = Pick<CodexProcessGroupOperations, "inspect" | "signal">;

async function inspectUntilProven(
	group: CodexProcessGroupIdentity,
	operations: GroupOperations,
	deadline: number,
): Promise<ReturnType<GroupOperations["inspect"]>> {
	let status = operations.inspect(group);
	while (status === "unproven" && Date.now() < deadline) {
		await sleep(TEST_CANVAS_HEALTH_POLL_MS);
		status = operations.inspect(group);
	}
	return status;
}

async function waitForQuiescence(
	group: CodexProcessGroupIdentity,
	operations: GroupOperations,
	deadline: number,
): Promise<ReturnType<GroupOperations["inspect"]>> {
	let status = operations.inspect(group);
	while ((status === "owned" || status === "unproven") && Date.now() < deadline) {
		await sleep(TEST_CANVAS_HEALTH_POLL_MS);
		status = operations.inspect(group);
	}
	return status;
}

async function stopChildGroup(
	group: CodexProcessGroupIdentity,
	operations: GroupOperations,
): Promise<void> {
	let deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	let status = await inspectUntilProven(group, operations, deadline);
	if (status === "quiescent") return;
	if (status !== "owned") {
		throw new Error(
			`Owned canvas child group ${group.pgid} did not become quiescent after forced canvas death (${status}).`,
		);
	}
	operations.signal(group, "SIGTERM");
	deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	status = await waitForQuiescence(group, operations, deadline);
	if (status === "owned") {
		operations.signal(group, "SIGKILL");
	}
	deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	const final = status === "owned" ? await waitForQuiescence(group, operations, deadline) : status;
	if (final !== "quiescent") {
		throw new Error(
			`Owned canvas child group ${group.pgid} did not become quiescent after forced canvas death (${final}).`,
		);
	}
}

function removeExactStorageLock(storageLock: string, canvasPid: number): void {
	try {
		const owner = fs.readFileSync(storageLock, "utf8");
		if (owner !== `${canvasPid}\n`) {
			throw new Error(
				`Refusing to remove Codex storage lock ${storageLock}: expected owner ${canvasPid}, received ${JSON.stringify(owner)}.`,
			);
		}
		fs.unlinkSync(storageLock);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

type ForcedCanvasParentOutcome =
	| { readonly exited: true }
	| { readonly exited: false; readonly failure: Error };

interface CompleteCapturedCanvasCleanupOptions {
	readonly groups: readonly CodexProcessGroupIdentity[];
	readonly operations: Pick<CodexProcessGroupOperations, "inspect" | "signal">;
	readonly parent: ForcedCanvasParentOutcome;
	readonly removeStorageLock: () => void;
}

async function completeCapturedCanvasCleanup(
	options: CompleteCapturedCanvasCleanupOptions,
): Promise<void> {
	const failures: unknown[] = options.parent.exited ? [] : [options.parent.failure];
	for (const group of options.groups) {
		try {
			await stopChildGroup(group, options.operations);
		} catch (error) {
			failures.push(error);
		}
	}
	if (options.parent.exited) {
		try {
			options.removeStorageLock();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length === 1) {
		throw failures[0];
	}
	if (failures.length > 1) {
		throw new AggregateError(
			failures,
			"Owned canvas parent and captured descendant cleanup reported multiple failures.",
		);
	}
}

interface ForcedCanvasCleanup {
	complete(parent: ForcedCanvasParentOutcome): Promise<void>;
}

/** Capture exact child ownership before SIGKILL makes the parent process tree unavailable. */
function captureForcedCanvasCleanup(options: {
	canvasPid: number;
	xdgState: string;
}): ForcedCanvasCleanup {
	const groups = directChildGroups(options.canvasPid);
	const stateRoot =
		process.platform === "darwin"
			? join(
					fs.realpathSync(join(options.xdgState, "..", "home")),
					"Library",
					"Application Support",
					"excalidraw-canvas",
				)
			: join(fs.realpathSync(options.xdgState), "excalidraw-canvas");
	const storageLock = join(
		stateRoot,
		"codex-workbench",
		"codex-home",
		".archboard-codex-process.lock",
	);
	const operations = createCodexProcessGroupOperations();
	return {
		complete(parent) {
			return completeCapturedCanvasCleanup({
				groups,
				operations,
				parent,
				removeStorageLock: () => removeExactStorageLock(storageLock, options.canvasPid),
			});
		},
	};
}

export {
	type ForcedCanvasParentOutcome,
	type CompleteCapturedCanvasCleanupOptions,
	completeCapturedCanvasCleanup,
	type ForcedCanvasCleanup,
	captureForcedCanvasCleanup,
};
