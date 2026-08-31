import { describe, expect, jest, test } from "bun:test";

import { CodexTransportRequestError } from "../errors.js";
import {
	HUMAN_APPROVAL_METHODS,
	SESSION_SERVER_REQUEST_METHODS,
	type DynamicDispatcherRegistration,
	type HumanApprovalMethod,
	type TransportServerNotification,
	type TransportServerRequest,
} from "../server-requests.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import {
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "../../../shared/codex-browser-model/index.js";
import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
import {
	captureRejection,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	issueKinds,
	sendJson,
	sendRaw,
} from "./fake-child.js";

describe("Codex app-server transport", () => {
	test("frames client requests, errors, notifications, and correlated server events", async () => {
		const { child, identity, transport, close } = createHarness();
		try {
			const deliveredPromise = transport.request("turn/steer", {
				threadId: "thread-1",
				turnId: "turn-1",
				input: [],
			});
			const requestFrame = frameAt(child, 0);
			expect(requestFrame).toMatchObject({
				method: "turn/steer",
				params: { threadId: "thread-1", turnId: "turn-1", input: [] },
			});
			if (typeof requestFrame.id !== "string")
				throw new Error("request id was not serialized as text");
			const requestId = requestFrame.id;
			sendJson(child, { id: requestId, result: { turnId: "turn-1" } });
			const delivered = await deliveredPromise;
			expect(delivered.result).toEqual({ turnId: "turn-1" });
			expect(delivered.correlation).toEqual({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				requestId: delivered.correlation.requestId,
			});
			expect(identity.decoder.serializeCodexIdentity(delivered.correlation.requestId)).toBe(
				requestId,
			);

			const errorPromise = transport.request("turn/steer", {});
			const errorFrame = frameAt(child, 1);
			sendJson(child, { id: errorFrame.id, error: { code: -32603, message: "fixture failure" } });
			expect(await captureRejection(errorPromise)).toMatchObject({
				name: "CodexTransportRemoteError",
				method: "turn/steer",
				rpcError: { code: -32603, message: "fixture failure" },
			});

			await transport.sendNotification("initialized");
			expect(frames(child)[2]).toEqual({ method: "initialized" });

			let notification: TransportServerNotification | undefined;
			transport.onServerNotification((event) => {
				notification = event;
			});
			sendJson(child, {
				method: "thread/realtime/closed",
				params: { threadId: "thread-1", reason: null },
			});
			await flushStreams();
			expect(notification?.notification).toEqual({
				method: "thread/realtime/closed",
				params: { threadId: "thread-1", reason: null },
			});
			expect(notification?.correlation).toMatchObject({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				requestId: null,
			});
		} finally {
			await close();
		}
	});

	test("recovers after malformed, unknown, oversized, split, and duplicate frames", async () => {
		const { child, transport, close } = createHarness();
		try {
			const malformedPromise = transport.request("turn/steer", {});
			const malformedId = frameAt(child, 0).id;
			sendJson(child, {
				id: malformedId,
				result: { turnId: "turn-1" },
				error: { code: -32603, message: "both" },
			});
			expect(await captureRejection(malformedPromise)).toMatchObject({
				name: "CodexTransportRequestError",
				reason: "malformed-response",
			});

			sendRaw(child, "not json");
			sendRaw(child, Buffer.from("\uFEFF{}\n", "utf8"));
			sendJson(child, { id: "foreign-response", result: {} });

			const recoveredPromise = transport.request("turn/steer", {});
			const recoveredId = frameAt(child, 1).id;
			const recoveredFrame = JSON.stringify({ id: recoveredId, result: { turnId: "turn-2" } });
			child.stdout.write(recoveredFrame.slice(0, 8));
			await flushStreams();
			expect(transport.inspectIssues()).not.toContainEqual(
				expect.objectContaining({ requestId: recoveredId }),
			);
			child.stdout.write(`${recoveredFrame.slice(8)}\n`);
			expect((await recoveredPromise).result).toEqual({ turnId: "turn-2" });

			sendJson(child, { id: recoveredId, result: { turnId: "late" } });
			await flushStreams();
			expect(transport.inspectLateResponses()).toContainEqual(
				expect.objectContaining({
					kind: "result",
					outcome: "duplicate",
					payload: { turnId: "late" },
				}),
			);
			expect(transport.inspectLateResponses()[0]?.requestId).toBe(
				transport.inspectLateResponses()[0]?.correlation?.requestId,
			);
			expect(issueKinds(transport)).toEqual(
				expect.arrayContaining(["malformed-frame", "unknown-response", "duplicate-response"]),
			);
		} finally {
			await close();
		}
	});

	test("routes every response owner and preserves dynamic logical identity", async () => {
		const registrations: readonly DynamicDispatcherRegistration[] = [
			{ owner: "codex-dynamic-tools", namespace: "archboard_app", manifestHash: "app-manifest" },
			{
				owner: "codex-coordinator-tools",
				namespace: "archboard_voice",
				manifestHash: "voice-manifest",
			},
		];
		const { child, identity, transport, close } = createHarness(registrations);
		try {
			const requests: TransportServerRequest[] = [];
			transport.onServerRequest((request) => requests.push(request));
			const humanParams: Record<HumanApprovalMethod, unknown> = {
				"item/commandExecution/requestApproval": {
					kind: "command",
					threadId: "thread-1",
					turnId: "turn-1",
					itemId: "item-1",
					startedAtMs: 1,
					environmentId: null,
				},
				"item/fileChange/requestApproval": {
					threadId: "thread-1",
					turnId: "turn-1",
					itemId: "item-1",
					startedAtMs: 1,
				},
				"item/tool/requestUserInput": {
					threadId: "thread-1",
					turnId: "turn-1",
					itemId: "item-1",
					questions: [],
					isBlocking: true,
					autoResolutionMs: null,
				},
				"mcpServer/elicitation/request": {
					threadId: "thread-1",
					turnId: null,
					serverName: "fixture",
					mode: "form",
					_meta: null,
					message: "fixture",
					requestedSchema: { type: "object", properties: {} },
				},
				"item/permissions/requestApproval": {
					threadId: "thread-1",
					turnId: "turn-1",
					itemId: "item-1",
					environmentId: null,
					startedAtMs: 1,
					cwd: "/tmp/archboard",
					reason: null,
					permissions: { network: null, fileSystem: null },
				},
				applyPatchApproval: {
					conversationId: "thread-1",
					callId: "call-1",
					fileChanges: { "/tmp/file": { type: "add", content: "fixture" } },
					reason: null,
					grantRoot: null,
				},
				execCommandApproval: {
					conversationId: "thread-1",
					callId: "call-1",
					approvalId: null,
					command: ["true"],
					cwd: "/tmp/archboard",
					reason: null,
					parsedCmd: [],
				},
			};

			for (const [index, method] of HUMAN_APPROVAL_METHODS.entries()) {
				sendJson(child, { id: `human-${index}`, method, params: humanParams[method] });
				await flushStreams();
				const request = requests.at(-1);
				expect(request?.owner).toBe("codex-approvals");
				if (!request) throw new Error("human request was not routed");
				expect(request.correlation).toMatchObject({
					child: identity.validator.childId,
					epoch: identity.validator.epoch,
					requestId: request.requestId,
				});
				const response =
					method === "item/tool/requestUserInput"
						? { result: { answers: {} } }
						: method === "mcpServer/elicitation/request"
							? { result: { action: "accept", content: null, _meta: null } }
							: method === "item/permissions/requestApproval"
								? { result: { permissions: {}, scope: "turn" } }
								: method === "applyPatchApproval" || method === "execCommandApproval"
									? { result: { decision: "approved" } }
									: { result: { decision: "accept" } };
				await transport.respond(request, "codex-approvals", response);
			}
			expect(requests).toHaveLength(HUMAN_APPROVAL_METHODS.length);

			const dynamicRoutes = [
				{ namespace: "archboard_app", owner: "codex-dynamic-tools", manifestHash: "app-manifest" },
				{
					namespace: "archboard_voice",
					owner: "codex-coordinator-tools",
					manifestHash: "voice-manifest",
				},
			] as const;
			for (const [index, { namespace, owner, manifestHash }] of dynamicRoutes.entries()) {
				sendJson(child, {
					id: `dynamic-${index}`,
					method: "item/tool/call",
					params: {
						threadId: "thread-1",
						turnId: "turn-1",
						callId: `call-${index}`,
						namespace,
						tool: "inspect",
						arguments: { board: "fixture" },
					},
				});
				await flushStreams();
				const request = requests.at(-1);
				expect(request?.owner).toBe(owner);
				if (!request || !("logicalCall" in request))
					throw new Error("dynamic request was not routed");
				expect(request.logicalCall).toMatchObject({
					child: identity.validator.childId,
					epoch: identity.validator.epoch,
					namespace,
					tool: "inspect",
					manifestHash,
				});
				expect(request.correlation.requestId).toBe(request.requestId);
				await transport.respond(request, owner, {
					result: { contentItems: [{ type: "inputText", text: "ok" }], success: true },
				});
			}

			sendJson(child, {
				id: "current-time",
				method: "currentTime/read",
				params: { threadId: "thread-1" },
			});
			await flushStreams();
			const currentTime = requests.at(-1);
			expect(currentTime?.owner).toBe("codex-session");
			if (currentTime?.method !== "currentTime/read")
				throw new Error("currentTime request was not routed");
			expect(currentTime.params.threadId).toBe(identity.decoder.resolveThreadId("thread-1"));
			await transport.respond(currentTime, "codex-session", { result: { currentTimeAt: 0 } });

			for (const [index, [method, error]] of (
				[
					["account/chatgptAuthTokens/refresh", UNSUPPORTED_TOKEN_REFRESH_ERROR],
					["attestation/generate", UNSUPPORTED_ATTESTATION_ERROR],
				] as const
			).entries()) {
				sendJson(child, {
					id: `unsupported-${index}`,
					method,
					params: method.endsWith("refresh") ? { reason: "unauthorized" } : {},
				});
				await flushStreams();
				const request = requests.at(-1);
				expect(request?.owner).toBe("codex-session");
				if (!request) throw new Error("unsupported request was not routed");
				await transport.respond(request, "codex-session", { error });
			}

			const output = frames(child).slice(HUMAN_APPROVAL_METHODS.length);
			expect(output.every((frame) => !Object.hasOwn(frame, "jsonrpc"))).toBeTrue();
			expect(SESSION_SERVER_REQUEST_METHODS).toEqual([
				"currentTime/read",
				"account/chatgptAuthTokens/refresh",
				"attestation/generate",
			]);
		} finally {
			await close();
		}
	});

	test("settles timeout and cancellation locally, retaining late uncertainty without retry", async () => {
		const { child, transport, close } = createHarness();
		let fakeTimers = false;
		try {
			jest.useFakeTimers();
			fakeTimers = true;
			const timedOut = transport.request("turn/steer", {});
			const timedOutId = frameAt(child, 0).id;
			jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
			expect(await captureRejection(timedOut)).toMatchObject({
				reason: "timeout",
				outcome: "outcome_unknown",
				accepted: true,
			});
			sendJson(child, { id: timedOutId, result: { turnId: "late" } });
			await flushStreams();
			expect(transport.inspectLateResponses()).toContainEqual(
				expect.objectContaining({ outcome: "outcome_unknown", settlement: "outcome_unknown" }),
			);
			expect(transport.inspectLateResponses()[0]?.requestId).toBe(
				transport.inspectLateResponses()[0]?.correlation?.requestId,
			);

			const controller = new AbortController();
			const cancelled = transport.request("turn/steer", {}, { signal: controller.signal });
			const cancelledId = frameAt(child, 1).id;
			controller.abort();
			expect(await captureRejection(cancelled)).toMatchObject({
				reason: "cancelled",
				outcome: "outcome_unknown",
				accepted: true,
			});
			expect(frames(child).some((frame) => frame.method === "turn/interrupt")).toBeFalse();
			sendJson(child, { id: cancelledId, result: { turnId: "cancelled-late" } });
			await flushStreams();

			await flushStreams();
			const idempotent = transport.request("turn/steer", {}, { idempotent: true });
			jest.advanceTimersByTime(CODEX_REQUEST_SETTLEMENT_MS);
			let idempotentError: unknown;
			try {
				await idempotent;
			} catch (error) {
				idempotentError = error;
			}
			expect(idempotentError).toBeInstanceOf(CodexTransportRequestError);
			expect((idempotentError as CodexTransportRequestError).reason).toBe("timeout");
			expect((idempotentError as CodexTransportRequestError).outcome).toBe("outcome_unknown");
			expect((idempotentError as CodexTransportRequestError).accepted).toBeTrue();
		} finally {
			if (fakeTimers) jest.useRealTimers();
			await close();
		}
	});

	test("bounds queued writes and drains stderr independently", async () => {
		const { child, transport, close } = createHarness();
		try {
			child.stdin.blockNext = true;
			const first = transport.sendNotification("initialized");
			const queued = Array.from(
				{ length: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames },
				() => transport.sendNotification("initialized"),
			);
			expect(transport.inspect()).toMatchObject({
				queuedFrames: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames,
				queuedBytes: expect.any(Number),
				writeInFlight: true,
			});
			expect(transport.inspect().queuedBytes).toBeLessThanOrEqual(
				CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedBytes,
			);
			const overflow = transport.sendNotification("initialized");
			expect(await captureRejection(overflow)).toMatchObject({
				name: "CodexTransportWriteError",
				reason: "backpressure",
			});
			child.stdin.release();
			await Promise.all([first, ...queued]);
			expect(frames(child)).toHaveLength(
				CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames + 1,
			);

			const stderrChunks: string[] = [];
			transport.onStderr((chunk) => stderrChunks.push(chunk.text));
			child.stderr.write("first stderr\n");
			child.stderr.write(Buffer.alloc(CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes + 1, 0x73));
			await flushStreams();
			expect(stderrChunks.join("")).toContain("first stderr");
			expect(transport.inspectStderr()).toMatchObject({
				retainedBytes: CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes,
				truncated: true,
			});
		} finally {
			await close();
		}
	});

	test("writes one reverse response, rejects wrong or duplicate ownership, and shuts down deterministically", async () => {
		const { child, transport, close } = createHarness();
		try {
			let request: TransportServerRequest | undefined;
			transport.onServerRequest((value) => {
				request = value;
			});
			sendJson(child, {
				id: "approval-once",
				method: "item/fileChange/requestApproval",
				params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", startedAtMs: 1 },
			});
			await flushStreams();
			if (!request) throw new Error("reverse request was not routed");
			expect(
				await captureRejection(
					transport.respond(request, "codex-session", { result: { decision: "accept" } }),
				),
			).toMatchObject({ name: "CodexTransportOwnershipError" });
			await transport.respond(request, "codex-approvals", { result: { decision: "accept" } });
			sendJson(child, {
				id: "approval-once",
				method: "item/fileChange/requestApproval",
				params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", startedAtMs: 1 },
			});
			await flushStreams();
			expect(issueKinds(transport)).toContain("duplicate-server-request");
			expect(
				await captureRejection(
					transport.respond(request, "codex-approvals", { result: { decision: "again" } }),
				),
			).toMatchObject({
				name: "CodexTransportOwnershipError",
			});
			expect(frames(child).filter((frame) => frame.id === "approval-once")).toHaveLength(1);

			child.stdin.blockNext = true;
			const queued = transport.sendNotification("initialized");
			const shutdown = transport.shutdown();
			expect(transport.inspect().state).toBe("closing");
			expect(child.stdin.finalizations).toBe(0);
			child.stdin.release();
			await queued;
			await shutdown;
			expect(transport.inspect().state).toBe("closed");
			expect(child.stdin.finalizations).toBe(1);
		} finally {
			await close();
		}
	});

	test("settles pending requests and emits one exit event when the child exits", async () => {
		const { child, transport, close } = createHarness();
		try {
			const exits: unknown[] = [];
			transport.onExit((event) => exits.push(event));
			const pending = transport.request("turn/steer", {});
			child.exit(17, "SIGTERM");
			expect(await captureRejection(pending)).toMatchObject({
				reason: "child-exit",
				outcome: "outcome_unknown",
				accepted: true,
			});
			await flushStreams();
			expect(exits).toHaveLength(1);
			expect(exits[0]).toMatchObject({ code: 17, signal: "SIGTERM" });
			expect(transport.inspect().state).toBe("closed");
		} finally {
			await close();
		}
	});
});
