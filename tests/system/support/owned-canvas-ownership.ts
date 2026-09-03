import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
} from "../../../src/shared/timing/timing.ts";

export interface OwnedCanvasPaths {
	readonly root: string;
	readonly home: string;
	readonly xdgConfig: string;
	readonly xdgState: string;
	readonly temporary: string;
}

const ownedCanvasNamespaceParent = os.tmpdir();
const ownedCanvasNamespacePrefix = "archboard-owned-canvas-";
const ownedCanvasNamespacePattern = /^archboard-owned-canvas-[A-Za-z0-9]{6}$/;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createOwnedCanvasPaths(): OwnedCanvasPaths {
	const root = fs.mkdtempSync(path.join(ownedCanvasNamespaceParent, ownedCanvasNamespacePrefix));
	const paths = {
		root,
		home: path.join(root, "home"),
		xdgConfig: path.join(root, "xdg-config"),
		xdgState: path.join(root, "xdg-state"),
		temporary: path.join(root, "tmp"),
	};
	try {
		for (const directory of [paths.home, paths.xdgConfig, paths.xdgState, paths.temporary])
			fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		return paths;
	} catch (error) {
		fs.rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

export function isOwnedCanvasNamespaceRoot(candidate: string): boolean {
	const resolved = path.resolve(candidate);
	return (
		path.dirname(resolved) === path.resolve(ownedCanvasNamespaceParent) &&
		ownedCanvasNamespacePattern.test(path.basename(resolved))
	);
}

export function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ESRCH") return false;
		throw new Error(
			`Process ${pid} observation failed (${failure.code ?? "unknown"}): ${failure.message}`,
			{ cause: error },
		);
	}
}

export async function waitForProcessExit(
	pid: number,
	timeoutMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	// Signal zero only observes; PID reuse may prolong this audit but never authorizes cleanup.
	while (processExists(pid)) {
		if (Date.now() >= deadline) {
			throw new Error(
				`Process ${pid} remained observable after ${timeoutMs.toLocaleString("en-US")}ms; it may be live, zombie, or recycled.`,
			);
		}
		await sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
}
