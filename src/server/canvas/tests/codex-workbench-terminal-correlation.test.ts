import { describe, expect, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
	type DynamicWaitOwner,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { decodeServerNotification } from "../../../runtime/codex-protocol/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../../runtime/codex-thread-tools/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";
import { createCodexWaitGraph } from "../../../runtime/codex-wait-graph/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import {
	createCanvasDynamicApprovalOwner,
	createCanvasDynamicLifecycleOwner,
} from "../codex-workbench-adapters.js";

function terminalItem(threadId: string, turnId: string, callId: string) {
	return decodeServerNotification({
		method: "item/completed",
		params: {
			threadId,
			turnId,
			item: {
				type: "dynamicToolCall",
				id: callId,
				namespace: "archboard_app",
				tool: "create_thread",
				arguments: { prompt: "bounded effect" },
				status: "completed",
				contentItems: [],
				success: false,
				durationMs: 1,
			},
			completedAtMs: 10,
		},
	});
}

function terminalTurn(
	threadId: string,
	turnId: string,
	status: "completed" | "interrupted" = "interrupted",
) {
	return decodeServerNotification({
		method: "turn/completed",
		params: {
			threadId,
			turn: {
				id: turnId,
				items: [],
				itemsView: "full",
				status,
				error: null,
				startedAt: 1,
				completedAt: 2,
				durationMs: 1,
			},
		},
	});
}

function event(
	child: TransportServerNotification["correlation"]["child"],
	epoch: TransportServerNotification["correlation"]["epoch"],
	notification: TransportServerNotification["notification"],
): TransportServerNotification {
	return { correlation: { child, epoch, requestId: null }, notification };
}

function unrelated(threadId: string) {
	return decodeServerNotification({
		method: "thread/realtime/closed",
		params: { threadId, reason: null },
	});
}

function identities() {
	const identity = createIdentityAuthorities();
	const foreign = createIdentityAuthorities();
	const thread = identity.identity.decoder.adoptThreadId("thread-current");
	const turn = identity.identity.decoder.adoptTurnId("turn-current");
	const call = identity.identity.decoder.adoptDynamicToolCallId("call-current");
	return {
		identity,
		foreign,
		thread,
		turn,
		call,
		wire: {
			thread: identity.identity.decoder.serializeCodexIdentity(thread),
			turn: identity.identity.decoder.serializeCodexIdentity(turn),
			call: identity.identity.decoder.serializeCodexIdentity(call),
		},
	};
}

describe("Codex terminal notification correlation", () => {
	test("dynamic approvals ignore every mismatched dimension and settle one exact call once", async () => {
		const h = identities();
		const token = createDynamicAuthorityTokenIssuer();
		const operationId = String(h.identity.operation.issuer.mintOperationId());
		const request: DynamicToolApprovalRequest = {
			identity: {
				child: h.identity.identity.validator.childId,
				epoch: h.identity.identity.validator.epoch,
				threadId: h.thread,
				turnId: h.turn,
				callId: h.call,
				namespace: "archboard_app",
				tool: "create_thread",
				manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
				operationId,
			},
			effect: {
				tool: "create_thread",
				arguments: { prompt: "bounded effect" },
				callerAuthority: token.issue(),
				targetAuthority: null,
				contextAuthority: token.issue(),
				effectiveBoundary: null,
				mutationOperationId: operationId,
				initialTurnOperationId: String(h.identity.operation.issuer.mintOperationId()),
				visualSummary: "Create thread: bounded effect",
			},
			effectHash: `sha256:${"1".repeat(64)}`,
			createdAtMs: 1,
			expiresAtMs: 90_001,
		};
		const owner = createCanvasDynamicApprovalOwner({
			identity: h.identity,
			now: () => 10,
			bindingForCaller: () => ({
				commandId: h.identity.identity.issuer.mintBrowserCommandId(),
				paneId: "pane-current",
				capturedLink: {
					threadId: h.thread,
					childId: h.identity.identity.validator.childId,
					epoch: h.identity.identity.validator.epoch,
				},
			}),
		});
		await owner.port.presentImmutableRequest(request);
		let settlements = 0;
		let cause: string | undefined;
		void owner.port.awaitOneExactVisualDecision(request).then((decision) => {
			settlements += 1;
			cause = decision.cause;
			return undefined;
		});
		const exactNotification = terminalItem(h.wire.thread, h.wire.turn, h.wire.call);
		const mismatches = [
			event(
				h.foreign.identity.validator.childId,
				h.identity.identity.validator.epoch,
				exactNotification,
			),
			event(
				h.identity.identity.validator.childId,
				h.foreign.identity.validator.epoch,
				exactNotification,
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem("thread-wrong", h.wire.turn, h.wire.call),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem(h.wire.thread, "turn-wrong", h.wire.call),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem(h.wire.thread, h.wire.turn, "call-wrong"),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				unrelated(h.wire.thread),
			),
		];
		for (const mismatch of mismatches) {
			owner.onNotification(mismatch);
			await Promise.resolve();
			expect(owner.browser.pending()).toHaveLength(1);
			expect(settlements).toBe(0);
		}

		const exact = event(
			h.identity.identity.validator.childId,
			h.identity.identity.validator.epoch,
			exactNotification,
		);
		owner.onNotification(exact);
		await Promise.resolve();
		expect(owner.browser.pending()).toHaveLength(0);
		expect({ settlements, cause }).toEqual({ settlements: 1, cause: "call_cancelled" });
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ settlements, pending: owner.browser.pending() }).toEqual({
			settlements: 1,
			pending: [],
		});
	});

	test("active waits ignore every mismatched dimension and reject one exact call once", async () => {
		const h = identities();
		const graph = createCodexWaitGraph();
		const target = h.identity.identity.decoder.adoptThreadId("thread-target");
		const waitOwner: DynamicWaitOwner = {
			child: h.identity.identity.validator.childId,
			epoch: h.identity.identity.validator.epoch,
			caller: h.thread,
			turn: h.turn,
			call: h.call,
			namespace: "archboard_app",
			tool: "wait_threads",
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
			sortedTargetThreadIds: [target],
			operationId: null,
		};
		let hostCalls = 0;
		let aborts = 0;
		const owner = createCanvasDynamicLifecycleOwner({
			identity: h.identity,
			waitGraph: graph,
			waitForTargets: ({ signal }) => {
				hostCalls += 1;
				signal.addEventListener("abort", () => (aborts += 1), { once: true });
				return new Promise(() => undefined);
			},
			shutdownEpoch: async () => ({}) as never,
			onFatal: () => undefined,
		});
		await Promise.resolve(owner.port.registerWaitOwner({ owner: waitOwner }));
		let settlements = 0;
		const waiting = owner.port
			.waitForTargets({ owner: waitOwner, cursor: null, timeoutMs: 60_000, previousSequence: 0 })
			.finally(() => {
				settlements += 1;
			});
		const exactNotification = terminalItem(h.wire.thread, h.wire.turn, h.wire.call);
		const mismatches = [
			event(
				h.foreign.identity.validator.childId,
				h.identity.identity.validator.epoch,
				exactNotification,
			),
			event(
				h.identity.identity.validator.childId,
				h.foreign.identity.validator.epoch,
				exactNotification,
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem("thread-wrong", h.wire.turn, h.wire.call),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem(h.wire.thread, "turn-wrong", h.wire.call),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				terminalItem(h.wire.thread, h.wire.turn, "call-wrong"),
			),
			event(
				h.identity.identity.validator.childId,
				h.identity.identity.validator.epoch,
				unrelated(h.wire.thread),
			),
		];
		for (const mismatch of mismatches) {
			owner.onNotification(mismatch);
			await Promise.resolve();
			expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
				hostCalls: 1,
				aborts: 0,
				settlements: 0,
				edges: 1,
			});
		}

		const exact = event(
			h.identity.identity.validator.childId,
			h.identity.identity.validator.epoch,
			exactNotification,
		);
		owner.onNotification(exact);
		const rejection = await waiting.then(
			() => null,
			(error: unknown) => error,
		);
		expect(rejection).toMatchObject({ code: "cancellation" });
		expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		await Promise.resolve(owner.port.releaseWaitOwner({ owner: waitOwner, cause: "cancellation" }));
		expect(graph.inspect()).toEqual([]);
	});

	test("dynamic approvals require one exact interrupted turn and settle it once", async () => {
		const h = identities();
		const token = createDynamicAuthorityTokenIssuer();
		const operationId = String(h.identity.operation.issuer.mintOperationId());
		const request: DynamicToolApprovalRequest = {
			identity: {
				child: h.identity.identity.validator.childId,
				epoch: h.identity.identity.validator.epoch,
				threadId: h.thread,
				turnId: h.turn,
				callId: h.call,
				namespace: "archboard_app",
				tool: "create_thread",
				manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
				operationId,
			},
			effect: {
				tool: "create_thread",
				arguments: { prompt: "bounded effect" },
				callerAuthority: token.issue(),
				targetAuthority: null,
				contextAuthority: token.issue(),
				effectiveBoundary: null,
				mutationOperationId: operationId,
				initialTurnOperationId: String(h.identity.operation.issuer.mintOperationId()),
				visualSummary: "Create thread: bounded effect",
			},
			effectHash: `sha256:${"1".repeat(64)}`,
			createdAtMs: 1,
			expiresAtMs: 90_001,
		};
		const owner = createCanvasDynamicApprovalOwner({
			identity: h.identity,
			now: () => 10,
			bindingForCaller: () => ({
				commandId: h.identity.identity.issuer.mintBrowserCommandId(),
				paneId: "pane-current",
				capturedLink: {
					threadId: h.thread,
					childId: h.identity.identity.validator.childId,
					epoch: h.identity.identity.validator.epoch,
				},
			}),
		});
		await owner.port.presentImmutableRequest(request);
		let settlements = 0;
		let cause: string | undefined;
		void owner.port.awaitOneExactVisualDecision(request).then((decision) => {
			settlements += 1;
			cause = decision.cause;
			return undefined;
		});
		for (const mismatch of [
			terminalTurn("thread-wrong", h.wire.turn),
			terminalTurn(h.wire.thread, "turn-wrong"),
			terminalTurn(h.wire.thread, h.wire.turn, "completed"),
		]) {
			owner.onNotification(
				event(h.identity.identity.validator.childId, h.identity.identity.validator.epoch, mismatch),
			);
			await Promise.resolve();
			expect({ settlements, pending: owner.browser.pending().length }).toEqual({
				settlements: 0,
				pending: 1,
			});
		}

		const exact = event(
			h.identity.identity.validator.childId,
			h.identity.identity.validator.epoch,
			terminalTurn(h.wire.thread, h.wire.turn),
		);
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ settlements, cause, pending: owner.browser.pending() }).toEqual({
			settlements: 1,
			cause: "caller_turn_interrupted",
			pending: [],
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ settlements, cause, pending: owner.browser.pending() }).toEqual({
			settlements: 1,
			cause: "caller_turn_interrupted",
			pending: [],
		});
	});

	test("active waits require one exact interrupted turn and reject it once", async () => {
		const h = identities();
		const graph = createCodexWaitGraph();
		const waitOwner: DynamicWaitOwner = {
			child: h.identity.identity.validator.childId,
			epoch: h.identity.identity.validator.epoch,
			caller: h.thread,
			turn: h.turn,
			call: h.call,
			namespace: "archboard_app",
			tool: "wait_threads",
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
			sortedTargetThreadIds: [h.identity.identity.decoder.adoptThreadId("thread-target")],
			operationId: null,
		};
		let hostCalls = 0;
		let aborts = 0;
		const owner = createCanvasDynamicLifecycleOwner({
			identity: h.identity,
			waitGraph: graph,
			waitForTargets: ({ signal }) => {
				hostCalls += 1;
				signal.addEventListener("abort", () => (aborts += 1), { once: true });
				return new Promise(() => undefined);
			},
			shutdownEpoch: async () => ({}) as never,
			onFatal: () => undefined,
		});
		await Promise.resolve(owner.port.registerWaitOwner({ owner: waitOwner }));
		let settlements = 0;
		const waiting = owner.port
			.waitForTargets({ owner: waitOwner, cursor: null, timeoutMs: 60_000, previousSequence: 0 })
			.finally(() => {
				settlements += 1;
			});
		for (const mismatch of [
			terminalTurn("thread-wrong", h.wire.turn),
			terminalTurn(h.wire.thread, "turn-wrong"),
			terminalTurn(h.wire.thread, h.wire.turn, "completed"),
		]) {
			owner.onNotification(
				event(h.identity.identity.validator.childId, h.identity.identity.validator.epoch, mismatch),
			);
			await Promise.resolve();
			expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
				hostCalls: 1,
				aborts: 0,
				settlements: 0,
				edges: 1,
			});
		}

		const exact = event(
			h.identity.identity.validator.childId,
			h.identity.identity.validator.epoch,
			terminalTurn(h.wire.thread, h.wire.turn),
		);
		owner.onNotification(exact);
		const rejection = await waiting.then(
			() => null,
			(error: unknown) => error,
		);
		expect(rejection).toMatchObject({ code: "interruption" });
		expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ hostCalls, aborts, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		await Promise.resolve(owner.port.releaseWaitOwner({ owner: waitOwner, cause: "interruption" }));
		expect(graph.inspect()).toEqual([]);
	});
});
