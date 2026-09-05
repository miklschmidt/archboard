import { describe, expect, test } from "bun:test";

import { close, harness, link, operationEvent } from "./support.js";

describe("coordinator callback live authority", () => {
	test("refuses child, coordinator, link, status, and realtime changes before effect", async () => {
		await Promise.all(
			["child", "coordinator", "link", "status", "direct_input", "provenance", "session"].map(
				async (scenario) => {
					const h = harness(true);
					h.setClassifyHook(() => {
						if (scenario === "child") {
							h.state.child = null;
						}
						if (scenario === "coordinator") {
							h.state.coordinator = null;
						}
						if (scenario === "link") {
							const changed = link(h.ids);
							h.state.link = {
								...changed,
								binding: { ...changed.binding, revision: changed.binding.revision + 1 },
							};
						}
						if (scenario === "status") {
							h.state.classification = {
								...h.state.classification,
								link: {
									kind: "thread_link",
									state: "inspect_only",
									childId: null,
									epoch: null,
									threadId: h.ids.workhorse,
									source: "appServer",
									status: "active",
									loaded: true,
									canAcceptDirectInput: false,
									reason: "direct_input_false",
								},
							};
						}
						if (scenario === "direct_input") {
							const changed = structuredClone(h.state.classification);
							Reflect.set(changed.link, "canAcceptDirectInput", false);
							h.state.classification = changed;
						}
						if (scenario === "provenance") {
							h.state.classification = { ...h.state.classification, proof: null };
						}
						if (scenario === "session") {
							h.state.generation = null;
						}
					});
					const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "completed"));
					expect(delivery.attempted).toBe(false);
					expect(delivery.outcome).toBe("not_delivered");
					expect(h.realtimeRequests).toHaveLength(0);
					expect(h.injections).toHaveLength(0);
					close(h);
				},
			),
		);
	});

	test("authority loss after either RPC is outcome_unknown with no cross-route retry", async () => {
		await Promise.all(
			[true, false].map(async (active) => {
				const h = harness(active);
				h.setMutationHook(() => {
					h.state.child = null;
				});
				const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "attention"));
				expect(delivery.attempted).toBe(true);
				expect(delivery.outcome).toBe("outcome_unknown");
				expect(h.realtimeRequests.length + h.injections.length).toBe(1);
				close(h);
			}),
		);
	});

	test("lost and rejected responses settle once without fallback", async () => {
		const modes: readonly Parameters<ReturnType<typeof harness>["setMutationMode"]>[0][] = [
			"lost",
			"rejected",
		];
		await Promise.all(
			[true, false].flatMap((active) =>
				modes.map(async (mode) => {
					const h = harness(active);
					h.setMutationMode(mode);
					const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "failed"));
					expect(delivery.outcome).toBe(mode === "lost" ? "outcome_unknown" : "not_delivered");
					expect(h.realtimeRequests.length + h.injections.length).toBe(1);
					close(h);
				}),
			),
		);
	});
});
