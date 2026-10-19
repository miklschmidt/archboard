import { describe, expect, test } from "bun:test";
import { createCheckoutWorkOwner } from "#server/services/checkout-work/checkout-work.ts";

async function waitForAbort(signal: Readonly<AbortSignal>): Promise<string> {
	await new Promise<void>((resolve) => {
		const onAbort = (): void => {
			resolve();
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
	signal.throwIfAborted();
	return "unreachable";
}

async function resolved(value: string): Promise<string> {
	await Promise.resolve();
	return value;
}

describe("checkout work owner", () => {
	test("quiesces admitted work, drains it, and rejects new work", async () => {
		const owner = createCheckoutWorkOwner();
		const running = owner.track("active snapshot", undefined, waitForAbort);
		const runningResult = running.catch((error: unknown) => error);

		await owner.stop();
		expect(await runningResult).toEqual(new Error("Archboard server checkout work stopped."));
		const lateResult = await owner
			.track("late snapshot", undefined, resolved.bind(undefined, "late"))
			.catch((error: unknown) => error);
		expect(lateResult).toEqual(
			new Error("Archboard server checkout work is stopping; late snapshot was not admitted."),
		);
	});

	test("resumes admission after a stopped lifecycle attempt", async () => {
		const owner = createCheckoutWorkOwner();
		await owner.stop();
		owner.resume();

		expect(
			await owner.track("replacement snapshot", undefined, resolved.bind(undefined, "ready")),
		).toBe("ready");
	});
});
