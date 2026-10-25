import { expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { fitBrowserSnapshotBounded } from "#server/rules/snapshot/snapshot-bounds.ts";
import { startCommand } from "#tests/server/support/gateway/helpers.ts";
import { createGatewayHarness } from "#tests/server/support/gateway/support.ts";

const wireBytes = (value: unknown): number =>
	new TextEncoder().encode(JSON.stringify(value)).byteLength;

test("fits timeline history after every competing snapshot field is present", async () => {
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
						turn: {
							id: turnId,
							status: "completed",
							startedAt: null,
							completedAt: null,
							durationMs: null,
						},
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
						error: null,
						plan: null,
					},
				],
				cursor: "next-page",
				usage: null,
			},
			queue: {
				kind: "codex_queue",
				submissions: [
					{
						id: decoder.adoptQueuedSubmissionId("budget-queue"),
						input: [{ type: "text", text: "queued prompt", text_elements: [] }],
						operationId: null,
					},
				],
			},
			settings: [
				{
					kind: "codex_thread_settings",
					owner: "workhorse",
					settings: {
						model: "gpt-6-sol",
						effort: "high",
						serviceTier: "priority",
						approvalPolicy: "never",
						approvalsReviewer: "user",
						sandboxPolicy: { type: "dangerFullAccess" },
						activePermissionProfile: null,
					},
				},
			],
			contextDelivery: {
				kind: "codex_context_delivery",
				outcome: { targetThreadId: threadId, outcome: "delivered", reason: null },
				freshness: { capturedAtMs: 1_787_682_840_000, freshUntilMs: 1_787_682_870_000 },
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

	const connection = value.open();
	const lease = connection.claimLease();
	const snapshot = (await connection.command(startCommand(value, lease))).snapshot;
	const bytes = wireBytes(snapshot);
	expect(bytes).toBeLessThanOrEqual(32_768);
	expect(snapshot.queue.entries).toHaveLength(1);
	expect(snapshot.settings).toEqual([
		expect.objectContaining({ owner: "workhorse", model: "gpt-6-sol" }),
	]);
	expect(snapshot.approvals).toHaveLength(1);
	expect(snapshot.dynamicApprovals).toHaveLength(1);
	expect(snapshot.contextDelivery).toMatchObject({ threadId, delivery: "delivered" });
	expect(snapshot.voice.transcript).toHaveLength(1);
	expect(snapshot.lease).toMatchObject({ commandId: lease.commandId, state: "active" });
	expect(snapshot.operation).toMatchObject({ operationId: lease.commandId, outcome: "delivered" });
	expect(snapshot.timeline?.turns[0]?.items.length).toBeLessThan(3);
	// The turn is cut from its oldest end: the newest item is the one kept.
	expect(snapshot.timeline?.turns[0]?.items.at(-1)?.itemId).toBe(
		decoder.adoptItemId("budget-item-3"),
	);
	expect(snapshot.timeline?.turns[0]?.outputsTruncated).toBeTrue();
});

test("removes the final paginated timeline turn when that alone crosses the byte boundary", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const value = createGatewayHarness(authorities);
	const base = value.gateway
		.connect(value.browserId, value.paneId, value.tabSessionId)
		.snapshot().snapshot;
	const threadId = value.threadId;
	const turnId = decoder.adoptTurnId("near-bound-turn");
	const firstQueueId = decoder.adoptQueuedSubmissionId("near-bound-queue-one");
	const secondQueueId = decoder.adoptQueuedSubmissionId("near-bound-queue-two");
	const timelineItemId = decoder.adoptItemId("near-bound-item");
	const makeSnapshot = (paddingLength: number, includeTurn: boolean) =>
		value.model.BrowserSnapshotSchema.parse({
			...base,
			timeline: {
				kind: "timeline",
				threadId,
				turns: includeTurn
					? [
							{
								turnId,
								status: "completed",
								items: [{ media: "text", itemId: timelineItemId, text: "last page item" }],
								summary: "A final paginated timeline turn",
								outputsIncluded: true,
								outputsTruncated: false,
								startedAtMs: null,
								completedAtMs: null,
								durationMs: null,
								error: null,
								plan: null,
							},
						]
					: [],
				nextCursor: "older-turns",
				usage: null,
			},
			queue: {
				kind: "queue",
				status: "queued",
				entries: [
					{
						submissionId: firstQueueId,
						prompt: "a".repeat(16_000),
						status: "queued",
						operationId: null,
					},
					{
						submissionId: secondQueueId,
						prompt: "b".repeat(paddingLength),
						status: "queued",
						operationId: null,
					},
				],
			},
		});
	const emptySeed = makeSnapshot(1, false);
	const paddingLength = 1 + 32_659 - wireBytes(emptySeed);
	expect(paddingLength).toBeWithin(0, 16_384);
	const emptyTimeline = makeSnapshot(paddingLength, false);
	const completeTimeline = makeSnapshot(paddingLength, true);
	expect(wireBytes(emptyTimeline)).toBe(32_659);
	expect(wireBytes(completeTimeline)).toBeGreaterThan(32_768);

	const fitted = fitBrowserSnapshotBounded(completeTimeline, 32_768);
	expect(wireBytes(fitted)).toBe(32_659);
	expect(fitted.timeline).toMatchObject({ nextCursor: "older-turns", turns: [] });
});

test("gives up the oldest turns and keeps the running one when history crosses the bound", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const value = createGatewayHarness(authorities);
	const base = value.gateway
		.connect(value.browserId, value.paneId, value.tabSessionId)
		.snapshot().snapshot;
	const turn = (raw: string, status: "completed" | "inProgress") => ({
		turnId: decoder.adoptTurnId(raw),
		status,
		items: [
			{ media: "text", itemId: decoder.adoptItemId(`${raw}-item`), text: "t".repeat(12_000) },
		],
		summary: raw,
		outputsIncluded: true,
		outputsTruncated: false,
		startedAtMs: null,
		completedAtMs: null,
		durationMs: null,
		error: null,
		plan: null,
	});
	const complete = value.model.BrowserSnapshotSchema.parse({
		...base,
		timeline: {
			kind: "timeline",
			threadId: value.threadId,
			turns: [
				turn("oldest", "completed"),
				turn("older", "completed"),
				turn("running", "inProgress"),
			],
			nextCursor: null,
			usage: null,
		},
	});

	const fitted = fitBrowserSnapshotBounded(complete, 32_768);

	const turns = fitted.timeline?.turns ?? [];
	expect(turns.map((kept) => kept.turnId)).toEqual([
		decoder.adoptTurnId("older"),
		decoder.adoptTurnId("running"),
	]);
	expect(turns[0]?.outputsTruncated).toBeTrue();
	expect(turns.at(-1)?.items).toHaveLength(1);
	expect(wireBytes(fitted)).toBeLessThanOrEqual(32_768);
});

test("fits voice delivery history in fixed producer records without altering retained bodies", () => {
	const authorities = createIdentityAuthorities();
	const value = createGatewayHarness(authorities);
	const base = value.gateway
		.connect(value.browserId, value.paneId, value.tabSessionId)
		.snapshot().snapshot;
	const sessionId = parseRealtimeSessionId("budget-voice-context");
	const bodies = Array.from(
		{ length: 3 },
		(_, index) => `${index}:${String(index).repeat(12_000)}`,
	);
	const complete = value.model.BrowserSnapshotSchema.parse({
		...base,
		timeline: null,
		voice: { ...base.voice, state: "active", realtimeSessionId: sessionId },
		voiceContext: {
			kind: "voice_context",
			sessionId,
			ledgerId: "budget-ledger",
			canonicalBrief: '{"source":"semantic_context"}',
			ownerEntriesTruncated: 2,
			entriesTruncated: 2,
			entries: bodies.map((body, sourceOrder) => ({
				id: `budget-entry-${sourceOrder}`,
				kind: "callback",
				topic: null,
				sourceOrder,
				capturedAtMs: 100,
				freshUntilMs: 200,
				attempted: true,
				attemptedAtMs: 150,
				outcome: "delivered",
				reason: null,
				body,
			})),
		},
	});
	expect(wireBytes(complete)).toBeGreaterThan(32_768);

	const fitted = fitBrowserSnapshotBounded(complete, 32_768);
	const retained = fitted.voiceContext?.entries ?? [];
	expect(retained.length).toBeLessThan(bodies.length);
	expect(fitted.voiceContext?.ownerEntriesTruncated).toBe(2);
	expect(fitted.voiceContext?.entriesTruncated).toBe(2 + bodies.length - retained.length);
	expect(retained.map((entry) => entry.body)).toEqual(
		bodies.slice(bodies.length - retained.length),
	);
	expect(wireBytes(fitted)).toBeLessThanOrEqual(32_768);
});
