import { describe, expect, test } from "bun:test";

import { createThreadLinkController } from "@/ui/workbench-thread-link";
import { FakeTransport, capturing, hostOwner } from "@/ui/workbench-thread-link/tests/fixtures";

describe("thread-link recovery actions", () => {
	test("refreshing state and re-reading the account run through the transport", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: capturing(transport) });
		await controller.recover("refresh_snapshot");
		expect(transport.refreshes).toBe(1);
		expect(controller.snapshot().state).toBe("idle");
		await controller.recover("read_account");
		expect(transport.accountReads).toBe(1);
		expect(controller.snapshot().state).toBe("succeeded");
	});

	test("a host recovery with no declared owner fails with the reason instead of pretending", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: capturing(transport) });
		await controller.recover("start_workbench");
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(settled.state === "failed" ? settled.announcement : "").toContain(
			"has no start workbench owner",
		);
	});

	test("a declared host recovery runs against the captured pane and intent", async () => {
		const transport = new FakeTransport();
		const calls: string[] = [];
		const controller = createThreadLinkController({
			capturePane: capturing(transport, ["unlock_home"]),
			captureHostRecovery: hostOwner("pane-a", (target) => {
				calls.push(`${target.paneId}:${target.intent}`);
				return Promise.resolve();
			}),
		});
		await controller.recover("unlock_home");
		expect(calls).toEqual(["pane-a:unlock_home"]);
		expect(controller.snapshot().state).toBe("succeeded");
	});

	test("a host authority for another pane is refused rather than run", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({
			capturePane: capturing(transport, ["repair_storage"]),
			captureHostRecovery: hostOwner("pane-b", () =>
				Promise.reject(new Error("This recovery must never run.")),
			),
		});
		await controller.recover("repair_storage");
		expect(controller.snapshot().state).toBe("failed");
	});

	test("a failing host recovery reports what happened and what to do next", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({
			capturePane: capturing(transport, ["start_workbench"]),
			captureHostRecovery: hostOwner("pane-a", () =>
				Promise.reject(new Error("The Codex process refused to start.")),
			),
		});
		await controller.recover("start_workbench");
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(settled.state === "failed" ? settled.announcement : "").toBe(
			"The Codex process refused to start.",
		);
		expect(settled.state === "failed" ? settled.recovery?.intent : null).toBe("refresh_snapshot");
	});
});
