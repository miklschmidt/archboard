import { describe, expect, test } from "bun:test";

import { CodexThreadContextControllerError, type CodexThreadContextBinding } from "../index.js";
import { bindingFor, createHarness, PANE_ID } from "./delivery-support.js";

function controllerHarness() {
	const harness = createHarness({ controller: true });
	if (harness.controller === null) throw new Error("controller fixture was not created");
	return { harness, controller: harness.controller };
}

function bind(
	controller: ReturnType<typeof controllerHarness>["controller"],
	binding: CodexThreadContextBinding,
) {
	return controller.compareAndSwap({ expected: controller.snapshot().token, next: binding });
}

describe("codex thread-context binding controller", () => {
	test("starts unbound, records an event once, and never retries it after binding", async () => {
		const { harness, controller } = controllerHarness();
		const event = harness.events();

		const unbound = await controller.deliver(event);
		bind(controller, bindingFor(harness));
		const duplicate = await controller.deliver(event);

		expect(unbound).toMatchObject({
			paneId: null,
			attempted: false,
			outcome: "not_delivered",
			reason: "unbound",
		});
		expect(duplicate).toBe(unbound);
		expect(harness.received).toHaveLength(0);
		expect(harness.subscriptionCount()).toBe(1);
	});

	test("binds exact workhorse evidence and rejects stale or duplicate transitions", async () => {
		const { harness, controller } = controllerHarness();
		const initial = controller.snapshot();
		const binding = bindingFor(harness);
		const bound = controller.compareAndSwap({ expected: initial.token, next: binding });

		expect(bound.binding).toMatchObject({ paneId: PANE_ID, target: harness.target });
		expect(await controller.deliver(harness.events())).toMatchObject({
			attempted: true,
			outcome: "delivered",
		});
		expect(() => controller.compareAndSwap({ expected: initial.token, next: null })).toThrow(
			CodexThreadContextControllerError,
		);
		expect(() => controller.compareAndSwap({ expected: bound.token, next: binding })).toThrow(
			"does not change authority",
		);
	});

	test("a stale clear cannot revoke a newer binding", () => {
		const { harness, controller } = controllerHarness();
		const first = bind(controller, bindingFor(harness));
		const cleared = controller.compareAndSwap({ expected: first.token, next: null });
		const rebound = controller.compareAndSwap({
			expected: cleared.token,
			next: bindingFor(harness),
		});

		expect(() => controller.compareAndSwap({ expected: first.token, next: null })).toThrow(/stale/);
		expect(controller.snapshot()).toEqual(rebound);
	});

	test("child exit revokes matching execution, retires its epoch, and disposes once", async () => {
		const { harness, controller } = controllerHarness();
		bind(controller, bindingFor(harness));

		await controller.childExit(harness.target.childId, harness.target.epoch);
		await controller.childExit(harness.target.childId, harness.target.epoch);

		expect(controller.snapshot().binding).toBeNull();
		expect(harness.retiredEpochs()).toBe(1);
		expect(harness.subscriptionCount()).toBe(1);
		expect(await controller.deliver(harness.events({ sequence: 2 }))).toMatchObject({
			reason: "disposed",
			attempted: false,
		});
	});

	test("hook replacement keeps controller identity, subscription, and ledger", async () => {
		const { harness, controller } = controllerHarness();
		bind(controller, bindingFor(harness));
		const first = await controller.deliver(harness.events());
		controller.replaceHooks({ contextForEvent: () => ({}) as never });

		expect(await controller.deliver(harness.events())).toBe(first);
		expect(harness.subscriptionCount()).toBe(1);
		expect(controller.snapshot().binding).not.toBeNull();
	});
});
