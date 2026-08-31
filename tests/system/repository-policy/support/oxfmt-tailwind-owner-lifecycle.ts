import { readFileSync } from "node:fs";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";

function ownerIsStopped(pid: number): boolean {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const close = stat.lastIndexOf(")");
		const state = stat.slice(close + 2, close + 3);
		return state === "T" || state === "t";
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ESRCH") return true;
		throw error;
	}
}

export async function stopOwnerMutation(child: Bun.Subprocess): Promise<void> {
	try {
		child.kill("SIGSTOP");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
		throw error;
	}
	const deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	while (child.exitCode === null && Date.now() < deadline) {
		if (ownerIsStopped(child.pid)) return;
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	if (child.exitCode === null && !ownerIsStopped(child.pid))
		throw new Error(`Owner ${child.pid} did not stop before exact-root fallback cleanup.`);
}
