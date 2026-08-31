import { describe, expect, test } from "bun:test";

import {
	CALLBACK_BUFFER_LIMIT,
	createCodexCoordinatorCallbacks,
	normalizeCoordinatorCallback,
} from "../index.js";
import { decodeCanonicalContext, encodeCanonicalContext } from "../../codex-instructions/index.js";
import {
	close,
	contextFor,
	harness,
	identities,
	operationEvent,
	semanticSources,
	type CallbackSourceType,
} from "./support.js";

describe("codex coordinator callbacks", () => {
	test("normalizes the closed operation and semantic unions with immutable correlation", () => {
		const ids = identities();
		const operationTypes: CallbackSourceType[] = [
			"accepted",
			"queued",
			"started",
			"progress",
			"attention",
			"completed",
			"failed",
			"outcome_unknown",
		];
		const normalized = operationTypes.map((type) =>
			normalizeCoordinatorCallback(operationEvent(ids, type)),
		);
		expect(normalized.map((callback) => callback.type)).toEqual(operationTypes);
		expect(normalized.map((callback) => callback.kind)).toEqual(
			operationTypes.map(() => "operation"),
		);
		for (const callback of normalized) {
			expect(Object.isFrozen(callback)).toBe(true);
			expect(Object.isFrozen(callback.correlation)).toBe(true);
			expect(Object.isFrozen(callback.correlation.coordinatorCall)).toBe(true);
			if (callback.kind === "operation")
				expect(Object.isFrozen(callback.queuedSubmissionIds)).toBe(true);
		}

		const semantic = semanticSources(ids, ids.wireSessionId);
		const semanticCallbacks = [semantic.change, semantic.focus, semantic.selection].map((event) =>
			normalizeCoordinatorCallback(event),
		);
		expect(semanticCallbacks.map((callback) => callback.type)).toEqual([
			"change",
			"focus",
			"selection",
		]);
		expect(semanticCallbacks.every((callback) => Object.isFrozen(callback))).toBe(true);
		expect(
			semanticCallbacks.every(
				(callback) => callback.kind === "semantic" && Object.isFrozen(callback.semantic),
			),
		).toBe(true);
		semantic.dispose();
	});

	test("uses canonical active append and eligible inactive injection exactly once", async () => {
		const active = harness(true);
		try {
			const operation = operationEvent(active.ids, "attention");
			const operationDelivery = await active.callbacks.enqueue(operation);
			const semanticDelivery = await active.callbacks.enqueue(active.semantic.change);
			expect(operationDelivery).toMatchObject({
				path: "realtime_appendText",
				outcome: "delivered",
				attempted: true,
			});
			expect(semanticDelivery).toMatchObject({
				path: "realtime_appendText",
				outcome: "delivered",
				attempted: true,
			});
			expect(active.appendRequests).toHaveLength(2);
			for (const request of active.appendRequests)
				expect(request.text).toBe(encodeCanonicalContext(decodeCanonicalContext(request.text)));
			expect(active.injections).toHaveLength(0);

			const inactive = harness(false);
			try {
				const inactiveOperationDelivery = await inactive.callbacks.enqueue(
					operationEvent(inactive.ids, "accepted"),
				);
				const queueDelivery = await inactive.callbacks.enqueue(
					operationEvent(inactive.ids, "queued", "manage_workhorse_queue"),
				);
				const attentionDelivery = await inactive.callbacks.enqueue(
					operationEvent(inactive.ids, "attention"),
				);
				const quietSemantic = await inactive.callbacks.enqueue(inactive.semantic.change);
				for (const delivery of [inactiveOperationDelivery, queueDelivery, attentionDelivery])
					expect(delivery).toMatchObject({
						path: "thread_inject_items",
						outcome: "delivered",
						attempted: true,
					});
				expect(quietSemantic).toMatchObject({
					path: "silent",
					outcome: "not_delivered",
					attempted: false,
					reason: "voice_inactive",
				});
				expect(inactive.appendRequests).toHaveLength(0);
				expect(inactive.injections).toHaveLength(3);
				for (const injected of inactive.injections) {
					expect(injected.threadId).toBe(inactive.ids.workhorse);
					expect(injected.items).toHaveLength(1);
					expect(injected.items[0]).toMatchObject({
						type: "message",
						role: "developer",
						content: [{ type: "input_text" }],
					});
				}
				const queueInjection = inactive.injections[1];
				if (queueInjection === undefined) throw new Error("missing queue injection");
				const queueItemValue = queueInjection.items[0];
				if (queueItemValue === undefined) throw new Error("missing queue item");
				const queueItem = queueItemValue as {
					readonly content?: readonly { readonly text?: unknown }[];
				};
				expect(queueItem.content).toHaveLength(1);
				expect(queueItem.content?.[0]?.text).toBe(queueDelivery.text);
				for (const delivery of [inactiveOperationDelivery, queueDelivery, attentionDelivery]) {
					if (delivery.text === null) throw new Error("missing callback text");
					expect(delivery.text).toBe(encodeCanonicalContext(decodeCanonicalContext(delivery.text)));
				}
			} finally {
				close(inactive);
			}
		} finally {
			close(active);
		}
	});

	test("drains FIFO without reentrant delivery and retains order across callback emission", async () => {
		const h = harness(true);
		try {
			let depth = 0;
			let maxDepth = 0;
			const second = operationEvent(h.ids, "completed");
			h.setAppendHook(() => {
				depth += 1;
				maxDepth = Math.max(maxDepth, depth);
				h.operations.emit(second);
				depth -= 1;
			});
			const firstPromise = h.callbacks.enqueue(operationEvent(h.ids, "started"));
			await h.callbacks.flush();
			const first = await firstPromise;
			expect(first.outcome).toBe("delivered");
			expect(maxDepth).toBe(1);
			expect(h.appendRequests).toHaveLength(2);
			expect(h.callbacks.inspect().map((delivery) => delivery.callback?.type)).toEqual([
				"started",
				"completed",
			]);
		} finally {
			close(h);
		}
	});

	test("coalesces eligible telemetry and bounds unique pending callbacks", async () => {
		const h = harness(true);
		try {
			const firstFocus = h.callbacks.enqueue(h.semantic.focus);
			const secondFocusEvent = h.semantic.nextFocus();
			const secondFocus = h.callbacks.enqueue(secondFocusEvent);
			expect(h.callbacks.pendingCount()).toBe(1);
			expect(await firstFocus).toMatchObject({ outcome: "not_delivered", reason: "coalesced" });
			const unique = Array.from({ length: CALLBACK_BUFFER_LIMIT + 1 }, () =>
				h.callbacks.enqueue(operationEvent(h.ids, "progress")),
			);
			expect(h.callbacks.pendingCount()).toBe(CALLBACK_BUFFER_LIMIT);
			const overflowed = unique[0];
			if (overflowed === undefined) throw new Error("missing overflowed callback");
			expect((await overflowed).reason).toBe("buffer_overflow");
			expect(await secondFocus).toMatchObject({ path: "realtime_appendText" });
			await h.callbacks.flush();
			expect(h.callbacks.pendingCount()).toBe(0);
			expect(h.callbacks.inspect().length).toBeLessThanOrEqual(CALLBACK_BUFFER_LIMIT);
			expect(h.appendRequests.length).toBeLessThanOrEqual(CALLBACK_BUFFER_LIMIT + 1);
		} finally {
			close(h);
		}
	});

	test("refuses stale child, link, session, and active-to-inactive races without fallback", async () => {
		const staleChild = harness(true);
		try {
			const pending = staleChild.callbacks.enqueue(operationEvent(staleChild.ids, "attention"));
			staleChild.state.current = null;
			expect(await pending).toMatchObject({ outcome: "not_delivered", reason: "child_exit" });
			expect(staleChild.appendRequests).toHaveLength(0);
			expect(staleChild.injections).toHaveLength(0);
		} finally {
			close(staleChild);
		}

		const staleLink = harness(true);
		try {
			const pending = staleLink.callbacks.enqueue(operationEvent(staleLink.ids, "attention"));
			staleLink.state.current = { ...staleLink.state.current!, link: null };
			expect(await pending).toMatchObject({ outcome: "not_delivered", reason: "stale_link" });
			expect(staleLink.appendRequests).toHaveLength(0);
		} finally {
			close(staleLink);
		}

		const staleSession = harness(true);
		try {
			const pending = staleSession.callbacks.enqueue(staleSession.semantic.change);
			staleSession.state.current = {
				...staleSession.state.current!,
				realtime: {
					wireSessionId: staleSession.ids.authorities.identity.issuer.mintRealtimeSessionId(),
					correlation: {
						sessionId: staleSession.ids.browserSessionId,
						correlationId: staleSession.ids.browserCorrelationId,
					},
				},
			};
			expect(await pending).toMatchObject({ outcome: "not_delivered", reason: "stale_session" });
			expect(staleSession.appendRequests).toHaveLength(0);
		} finally {
			close(staleSession);
		}

		const staleCoordinator = harness(true);
		try {
			const pending = staleCoordinator.callbacks.enqueue(
				operationEvent(staleCoordinator.ids, "attention"),
			);
			staleCoordinator.state.current = {
				...staleCoordinator.state.current!,
				coordinatorThreadId:
					staleCoordinator.ids.authorities.identity.decoder.adoptThreadId("other-coordinator"),
			};
			expect(await pending).toMatchObject({
				outcome: "not_delivered",
				reason: "stale_coordinator",
			});
			expect(staleCoordinator.appendRequests).toHaveLength(0);
		} finally {
			close(staleCoordinator);
		}

		const priorEpoch = harness(true);
		try {
			const pending = priorEpoch.callbacks.enqueue(operationEvent(priorEpoch.ids, "attention"));
			priorEpoch.state.current = {
				...priorEpoch.state.current!,
				epoch: priorEpoch.ids.authorities.identity.issuer.mintChildEpoch(),
			};
			expect(await pending).toMatchObject({ outcome: "not_delivered", reason: "prior_epoch" });
			expect(priorEpoch.appendRequests).toHaveLength(0);
		} finally {
			close(priorEpoch);
		}

		const race = harness(true);
		try {
			race.setContextHook(() => {
				race.state.current = { ...race.state.current!, realtime: null };
			});
			const racePending = race.callbacks.enqueue(operationEvent(race.ids, "attention"));
			expect(await racePending).toMatchObject({
				outcome: "not_delivered",
				reason: "stale_session",
			});
			expect(race.appendRequests).toHaveLength(0);
		} finally {
			close(race);
		}

		const postAttemptRace = harness(true);
		try {
			postAttemptRace.setAppendHook(() => {
				postAttemptRace.state.current = {
					...postAttemptRace.state.current!,
					realtime: null,
				};
			});
			const pending = postAttemptRace.callbacks.enqueue(
				operationEvent(postAttemptRace.ids, "attention"),
			);
			expect(await pending).toMatchObject({ outcome: "outcome_unknown", reason: "stale_session" });
			expect(postAttemptRace.appendRequests).toHaveLength(1);
			expect(postAttemptRace.injections).toHaveLength(0);
		} finally {
			close(postAttemptRace);
		}
	});

	test("settles delivered, rejected, and unknown remote outcomes once with no alternate attempt", async () => {
		for (const mode of ["delivered", "rejected", "unknown", "lost", "mismatched"] as const) {
			const h = harness(true);
			try {
				h.setAppendMode(mode);
				const event = operationEvent(h.ids, "progress");
				const delivery = await h.callbacks.enqueue(event);
				const duplicate = await h.callbacks.enqueue(event);
				expect(delivery.path).toBe("realtime_appendText");
				expect(duplicate).toEqual(delivery);
				expect(delivery.attempted).toBe(true);
				expect(h.appendRequests).toHaveLength(1);
				expect(h.injections).toHaveLength(0);
				expect(delivery.outcome).toBe(
					mode === "delivered"
						? "delivered"
						: mode === "rejected"
							? "not_delivered"
							: "outcome_unknown",
				);
			} finally {
				close(h);
			}
		}
		for (const mode of ["delivered", "rejected", "unknown"] as const) {
			const h = harness(false);
			try {
				h.setInjectionMode(mode);
				const delivery = await h.callbacks.enqueue(operationEvent(h.ids, "attention"));
				expect(delivery.path).toBe("thread_inject_items");
				expect(delivery.attempted).toBe(true);
				expect(h.injections).toHaveLength(1);
				expect(h.appendRequests).toHaveLength(0);
				expect(delivery.outcome).toBe(
					mode === "delivered"
						? "delivered"
						: mode === "rejected"
							? "not_delivered"
							: "outcome_unknown",
				);
			} finally {
				close(h);
			}
		}
	});

	test("disposes pending work, unsubscribes sources, and permits one clean reloaded instance", async () => {
		const h = harness(true);
		try {
			const pending = h.callbacks.enqueue(operationEvent(h.ids, "attention"));
			h.callbacks.dispose();
			expect(await pending).toMatchObject({ outcome: "not_delivered", reason: "disposed" });
			expect(await h.callbacks.enqueue(operationEvent(h.ids, "failed"))).toMatchObject({
				outcome: "not_delivered",
				reason: "disposed",
			});
			h.operations.emit(operationEvent(h.ids, "completed"));
			await h.callbacks.flush();
			expect(h.appendRequests).toHaveLength(0);

			const reloaded = createCodexCoordinatorCallbacks({
				semantic: h.semantic.publisher,
				operations: h.operations,
				realtime: {
					appendText: async (request) => ({
						sessionId: request.sessionId,
						correlationId: request.correlationId,
						outcome: "delivered",
					}),
				},
				session: { threadInjectItems: async () => ({}) },
				current: () => h.state.current,
				contextFor,
			});
			const reloadedDelivery = await reloaded.enqueue(operationEvent(h.ids, "completed"));
			expect(reloadedDelivery).toMatchObject({
				path: "realtime_appendText",
				outcome: "delivered",
			});
			reloaded.dispose();
		} finally {
			close(h);
		}
	});
});
