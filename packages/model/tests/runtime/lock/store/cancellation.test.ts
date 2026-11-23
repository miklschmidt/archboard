import { expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "#runtime/lock/store/lock.ts";
import { TimedOut } from "@archboard/timing";

test("a parent's timeout cancels a pending lock request and leaves the original holder", async () => {
	const vault = mkdtempSync(join(tmpdir(), "archboard-lock-cancellation-"));
	const model = "payments";
	jest.useFakeTimers();
	try {
		const held = await lock.holdModel({
			vault,
			model,
			holder: { id: "user", kind: "human" },
			waits: false,
		});
		const controller = new AbortController();
		const pending = lock.holdModel({
			vault,
			model,
			holder: { id: "later", kind: "agent" },
			signal: controller.signal,
		});
		// Let the first refusal settle so cancellation happens during the wait.
		await new Promise((resolve) => setImmediate(resolve));
		controller.abort(new TimedOut("server.mutationDrain"));
		await expect(pending).rejects.toBeInstanceOf(lock.ModelLockCancelledError);
		expect(lock.modelLockState(vault, model)).toEqual(held.holder);
		expect(jest.getTimerCount()).toBe(0);
	} finally {
		lock.forgetLockAnnouncements();
		jest.useRealTimers();
		rmSync(vault, { recursive: true, force: true });
	}
});
