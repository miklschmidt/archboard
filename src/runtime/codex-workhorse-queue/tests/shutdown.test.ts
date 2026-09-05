import { expect, test } from "bun:test";

import { deferred, fixture, flush, rejected } from "./support.js";

test("shutdown closes admission and drains the accepted command tail", async () => {
	const fixtureValue = fixture();
	const gate = deferred();
	const started = deferred();
	fixtureValue.session.beforeMutation = async (method): Promise<void> => {
		if (method !== "add") {
			return;
		}
		started.resolve();
		await gate.promise;
	};
	const accepted = fixtureValue.queue.add({ operationId: "accepted", prompt: "accepted" });
	await started.promise;
	let drained = false;
	const shutdown = fixtureValue.queue.shutdown().then(() => void (drained = true));
	await flush();
	expect(drained).toBe(false);
	expect(await rejected(fixtureValue.queue.list())).toMatchObject({ code: "closed" });
	gate.resolve();
	await Promise.all([accepted, shutdown]);
	expect(drained).toBe(true);
	expect(
		await rejected(fixtureValue.queue.add({ operationId: "late", prompt: "late" })),
	).toMatchObject({ code: "closed" });
});
