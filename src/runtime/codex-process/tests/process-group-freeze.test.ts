import { describe, expect, test } from "bun:test";

import { createCodexProcessForTesting as createCodexProcess } from "../testing.js";
import {
	fixture,
	processOptions as options,
	removeRoot,
	startReady,
	temporaryRoot,
} from "./support.js";
import { driveManual, fakeLifecycle } from "./lifecycle-support.js";

describe("Codex process group KILL", () => {
	test("a child that forks into the group after it was stopped is stopped before KILL", async () => {
		// A fork that completes after a census joins the group outside the signals already sent
		// (TASK-470). KILL must therefore wait for two agreeing censuses of stopped members.
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			lifecycle.forkAtCensus(3);
			const executable = fixture(root, `process.on("SIGTERM", () => {}); process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(lifecycle.signals[0]).toBe("SIGTERM");
			expect(lifecycle.signals.at(-1)).toBe("SIGKILL");
			const killed = lifecycle.membersAtKill();
			expect(killed).toHaveLength(2);
			expect(killed.every((member) => member.endsWith(":stopped"))).toBe(true);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});
});
