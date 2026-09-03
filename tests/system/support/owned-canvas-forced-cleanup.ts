import fs from "node:fs";
import { join } from "node:path";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "../../../src/runtime/codex-process/process-group.ts";
import { processExists } from "./owned-canvas-ownership.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function directChildGroups(parentPid: number): CodexProcessGroupIdentity[] {
	let childPids: number[];
	try {
		childPids = fs
			.readFileSync(`/proc/${parentPid}/task/${parentPid}/children`, "utf8")
			.trim()
			.split(/\s+/u)
			.filter(Boolean)
			.map(Number);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const operations = createCodexProcessGroupOperations();
	return childPids.flatMap((pid) => {
		try {
			return [operations.capture(pid)];
		} catch (error) {
			if (!processExists(pid)) return [];
			throw error;
		}
	});
}

async function stopChildGroups(groups: readonly CodexProcessGroupIdentity[]): Promise<void> {
	const operations = createCodexProcessGroupOperations();
	for (const group of groups) {
		if (operations.inspect(group) === "owned") operations.signal(group, "SIGTERM");
		let deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
		while (operations.inspect(group) === "owned" && Date.now() < deadline) {
			await sleep(TEST_CANVAS_HEALTH_POLL_MS);
		}
		if (operations.inspect(group) === "owned") operations.signal(group, "SIGKILL");
		deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
		while (operations.inspect(group) === "owned" && Date.now() < deadline) {
			await sleep(TEST_CANVAS_HEALTH_POLL_MS);
		}
		const final = operations.inspect(group);
		if (final !== "quiescent") {
			throw new Error(
				`Owned canvas child group ${group.pgid} did not become quiescent after forced canvas death (${final}).`,
			);
		}
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
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

export interface ForcedCanvasCleanup {
	complete(): Promise<void>;
}

/** Capture exact child ownership before SIGKILL makes the parent process tree unavailable. */
export function captureForcedCanvasCleanup(options: {
	canvasPid: number;
	xdgState: string;
}): ForcedCanvasCleanup {
	const groups = directChildGroups(options.canvasPid);
	const storageLock = join(
		fs.realpathSync(options.xdgState),
		"excalidraw-canvas",
		"codex-workbench",
		"codex-home",
		".archboard-codex-process.lock",
	);
	return {
		async complete() {
			await stopChildGroups(groups);
			removeExactStorageLock(storageLock, options.canvasPid);
		},
	};
}
