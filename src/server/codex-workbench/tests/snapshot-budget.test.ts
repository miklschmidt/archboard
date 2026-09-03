import { expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createGatewayHarness } from "./support.js";

test("fits timeline history after every competing snapshot field is present", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("gateway-thread");
	const turnId = decoder.adoptTurnId("gateway-turn");
	const largeText = "timeline".repeat(1_750);
	const value = createGatewayHarness(authorities, undefined, undefined, {
		snapshotMaxBytes: 32_768,
		project: (owner) => ({
			...owner,
			timeline: {
				kind: "codex_timeline",
				threadId,
				turns: [
					{
						turn: { id: turnId, status: "completed" },
						items: [
							{
								kind: "agent_message",
								item: {
									type: "agentMessage",
									id: decoder.adoptItemId("budget-item-1"),
									text: largeText,
								},
							},
							{
								kind: "agent_message",
								item: {
									type: "agentMessage",
									id: decoder.adoptItemId("budget-item-2"),
									text: largeText,
								},
							},
							{
								kind: "agent_message",
								item: {
									type: "agentMessage",
									id: decoder.adoptItemId("budget-item-3"),
									text: largeText,
								},
							},
						],
						presentation: {
							summary: "A large turn competes with the rest of the gateway projection.",
							outputs: { included: true, truncated: false },
						},
					},
				],
				cursor: "next-page",
			},
			queue: {
				kind: "codex_queue",
				submissions: [
					{
						id: decoder.adoptQueuedSubmissionId("budget-queue"),
						input: [{ type: "text", text: "queued prompt", text_elements: [] }],
					},
				],
			},
			voice: {
				...owner.voice,
				transcript: [
					{
						sessionId: parseRealtimeSessionId("budget-session"),
						correlationId: parseRealtimeCorrelationId("budget-correlation"),
						itemId: parseRealtimeItemId(String(decoder.adoptItemId("budget-voice"))),
						sequence: 1,
						role: "assistant",
						status: "final",
						text: "spoken result",
					},
				],
			},
		}),
	});
	value.setOrdinaryApproval(value.makeOrdinaryApproval());
	value.setDynamicApprovals([
		value.makeDynamicApproval(authorities.identity.issuer.mintBrowserCommandId()),
	]);

	const snapshot = value.gateway.connect(value.browserId, value.paneId).snapshot().snapshot;
	const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
	expect(bytes).toBeLessThanOrEqual(32_768);
	expect(snapshot.queue.entries).toHaveLength(1);
	expect(snapshot.approvals).toHaveLength(1);
	expect(snapshot.dynamicApprovals).toHaveLength(1);
	expect(snapshot.voice.transcript).toHaveLength(1);
	expect(snapshot.timeline?.turns[0]?.items.length).toBeLessThan(3);
	expect(snapshot.timeline?.turns[0]?.outputsTruncated).toBeTrue();
});
