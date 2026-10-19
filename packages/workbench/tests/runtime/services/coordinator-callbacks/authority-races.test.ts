import { describe, expect, test } from "bun:test";

import {
	close,
	harness,
	link,
	operationEvent,
	semanticInput,
} from "#tests/runtime/services/coordinator-callbacks/support.ts";

/**
 * One callback down one of the two routes that send anything: a workhorse outcome to the
 * coordinator, or a pick the user made by hand to the voice model as pane news.
 * @param h - The harness.
 * @param route - Which route.
 * @returns The callback source to enqueue.
 */
function userPickOrOutcome(h: ReturnType<typeof harness>, route: "coordinator" | "voice") {
	if (route === "coordinator") {
		return operationEvent(h.ids, "outcome_unknown");
	}
	const base = semanticInput(h.ids, true);
	return h.semantic.publisher.publishPaneSelection({
		...base,
		pane: { ...base.pane, userChanged: ["selection"] },
	});
}

describe("coordinator callback live authority", () => {
	test("refuses child, coordinator, link, executability, and realtime changes before effect", async () => {
		await Promise.all(
			["child", "coordinator", "link", "inspect_only", "provenance", "session"].map(
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
						// A thread that stops taking direct input classifies inspect-only.
						if (scenario === "inspect_only") {
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
						if (scenario === "provenance") {
							h.state.classification = { ...h.state.classification, proof: null };
						}
						if (scenario === "session") {
							h.state.generation = null;
						}
					});
					const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "outcome_unknown"));
					expect(delivery.attempted).toBe(false);
					expect(delivery.outcome).toBe("not_delivered");
					expect(h.realtimeRequests).toHaveLength(0);
					expect(h.reports).toHaveLength(0);
					close(h);
				},
			),
		);
	});

	// TASK-302.07: the live classification observes the thread as it is now, so a running turn
	// shows it active while its link was bound idle. What the person picks by hand is still news;
	// a live link naming another thread, child or epoch is still not the link the pick was for.
	test("a thread's status is not its identity: a pick is delivered while the thread runs, and refused when the link names another thread, child or epoch", async () => {
		const scenarios = {
			running: { status: "active" },
			thread: { threadId: "archboard:thread:s616e6f74686572" },
			child: { childId: "archboard:child:h33333333333333333333333333333333" },
			epoch: {
				epoch:
					"archboard:epoch:h11111111111111111111111111111111.h44444444444444444444444444444444",
			},
		} as const;
		await Promise.all(
			Object.entries(scenarios).map(async ([scenario, change]) => {
				const h = harness(true);
				const live = structuredClone(h.state.classification);
				for (const [field, value] of Object.entries(change)) {
					Reflect.set(live.link, field, value);
				}
				h.state.classification = live;
				const base = semanticInput(h.ids, true);
				const delivery = await h.callbacks.enqueue(
					h.semantic.publisher.publishPaneSelection({
						...base,
						pane: { ...base.pane, userChanged: ["selection"] },
					}),
				);
				if (scenario === "running") {
					expect(delivery.outcome).toBe("delivered");
					expect(h.realtimeRequests).toHaveLength(1);
				} else {
					expect(delivery).toMatchObject({ attempted: false, reason: "stale_link" });
					expect(h.realtimeRequests).toHaveLength(0);
				}
				close(h);
			}),
		);
	});

	test("authority loss after either route is outcome_unknown with no cross-route retry", async () => {
		await Promise.all(
			(["coordinator", "voice"] as const).map(async (route) => {
				const h = harness(true);
				h.setMutationHook(() => {
					h.state.child = null;
				});
				const delivery = await h.callbacks.enqueue(userPickOrOutcome(h, route));
				expect(delivery.attempted).toBe(true);
				expect(delivery.outcome).toBe("outcome_unknown");
				expect(h.realtimeRequests.length + h.reports.length).toBe(1);
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
			(["coordinator", "voice"] as const).flatMap((route) =>
				modes.map(async (mode) => {
					const h = harness(true);
					h.setMutationMode(mode);
					const delivery = await h.callbacks.enqueue(userPickOrOutcome(h, route));
					expect(delivery.outcome).toBe(mode === "lost" ? "outcome_unknown" : "not_delivered");
					expect(h.realtimeRequests.length + h.reports.length).toBe(1);
					close(h);
				}),
			),
		);
	});
});
