import { describe, expect, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { decodeServerNotification } from "../../../runtime/codex-protocol/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "../../../runtime/codex-thread-tools/index.js";
import { createCodexWaitGraph } from "../../../runtime/codex-wait-graph/index.js";
import { createCanvasDynamicApprovalOwner } from "../codex-workbench-adapters.js";
import { identities, waitOwnerFor, waitProbe } from "./support/codex-workbench-terminal-fixture.js";

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
			expect(owner.pending()).toHaveLength(1);
			expect(settlements).toBe(0);
		}

		const exact = event(
			h.identity.identity.validator.childId,
			h.identity.identity.validator.epoch,
			exactNotification,
		);
		owner.onNotification(exact);
		await Promise.resolve();
		expect(owner.pending()).toHaveLength(0);
		expect({ settlements, cause }).toEqual({ settlements: 1, cause: "call_cancelled" });
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ settlements, pending: owner.pending() }).toEqual({
			settlements: 1,
			pending: [],
		});
	});

	test("active waits ignore every mismatched dimension and reject one exact call once", async () => {
		const h = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = waitOwnerFor(h, "thread-target");
		const { owner, counters } = waitProbe(h, graph);
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
			expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
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
		expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
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
			expect({ settlements, pending: owner.pending().length }).toEqual({
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
		expect({ settlements, cause, pending: owner.pending() }).toEqual({
			settlements: 1,
			cause: "caller_turn_interrupted",
			pending: [],
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ settlements, cause, pending: owner.pending() }).toEqual({
			settlements: 1,
			cause: "caller_turn_interrupted",
			pending: [],
		});
	});

	test("active waits require one exact interrupted turn and reject it once", async () => {
		const h = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = waitOwnerFor(h, "thread-target");
		const { owner, counters } = waitProbe(h, graph);
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
			expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
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
		expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		owner.onNotification(exact);
		await Promise.resolve();
		expect({ ...counters, settlements, edges: graph.inspect().length }).toEqual({
			hostCalls: 1,
			aborts: 1,
			settlements: 1,
			edges: 1,
		});
		await Promise.resolve(owner.port.releaseWaitOwner({ owner: waitOwner, cause: "interruption" }));
		expect(graph.inspect()).toEqual([]);
	});

	test("child exit aborts an active wait once as child_disconnected", async () => {
		const h = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = waitOwnerFor(h, "thread-target");
		const { owner, counters } = waitProbe(h, graph);
		await Promise.resolve(owner.port.registerWaitOwner({ owner: waitOwner }));
		const waiting = owner.port.waitForTargets({
			owner: waitOwner,
			cursor: null,
			timeoutMs: 60_000,
			previousSequence: 0,
		});

		// A foreign child must not disturb the live wait.
		await owner.childExit(h.foreign.identity.validator.childId, waitOwner.epoch);
		expect({ aborts: counters.aborts, edges: graph.inspect().length }).toEqual({
			aborts: 0,
			edges: 1,
		});

		await owner.childExit(waitOwner.child, waitOwner.epoch);
		expect(
			await waiting.then(
				() => null,
				(error: unknown) => error,
			),
		).toMatchObject({ code: "child_disconnected" });
		expect({ aborts: counters.aborts, edges: graph.inspect().length }).toEqual({
			aborts: 1,
			edges: 0,
		});
	});
});
