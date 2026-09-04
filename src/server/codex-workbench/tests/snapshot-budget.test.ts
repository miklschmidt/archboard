import { expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";
import { BROWSER_THREAD_CANDIDATE_LIMIT } from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { fitBrowserSnapshotBounded } from "../index.js";
import { startCommand } from "./helpers.js";
import { createGatewayHarness } from "./support.js";

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
			// A full inventory competes for the same bytes as the timeline. It is
			// bounded rather than fitted, so it must stay small enough that the
			// fitter still has timeline history left to trim.
			threadCandidates: {
				kind: "codex_thread_candidates",
				state: "listed",
				candidates: Array.from({ length: BROWSER_THREAD_CANDIDATE_LIMIT }, (_row, index) => ({
					selectionId: `budget-selection-${index}-`.padEnd(48, "x"),
					threadId: decoder.adoptThreadId(`budget-candidate-${index}`),
					state: "inspect_only" as const,
					reason: "prior_epoch" as const,
					source: "appServer",
					status: "idle" as const,
					loaded: true,
					canAcceptDirectInput: null,
				})) as never,
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
						model: "gpt-5.6-sol",
						effort: "high",
						serviceTier: "priority",
						approvalPolicy: "never",
						approvalsReviewer: "user",
						sandboxPolicy: { type: "dangerFullAccess" },
						activePermissionProfile: null,
					},
				},
			],
			semantic: {
				kind: "codex_semantic",
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

	const connection = value.gateway.connect(value.browserId, value.paneId);
	const lease = connection.claimLease();
	const snapshot = (await connection.command(startCommand(value, lease))).snapshot;
	const bytes = wireBytes(snapshot);
	expect(bytes).toBeLessThanOrEqual(32_768);
	expect(snapshot.queue.entries).toHaveLength(1);
	expect(snapshot.settings).toEqual([
		expect.objectContaining({ owner: "workhorse", model: "gpt-5.6-sol" }),
	]);
	expect(snapshot.approvals).toHaveLength(1);
	expect(snapshot.dynamicApprovals).toHaveLength(1);
	expect(snapshot.semantic).toMatchObject({ threadId, delivery: "delivered" });
	expect(snapshot.voice.transcript).toHaveLength(1);
	expect(snapshot.lease).toMatchObject({ commandId: lease.commandId, state: "active" });
	expect(snapshot.operation).toMatchObject({ operationId: lease.commandId, outcome: "delivered" });
	expect(snapshot.timeline?.turns[0]?.items.length).toBeLessThan(3);
	expect(snapshot.timeline?.turns[0]?.outputsTruncated).toBeTrue();
	// The complete bounded inventory survived the fit; only history was trimmed.
	expect(snapshot.threadCandidates.state).toBe("listed");
	expect(
		snapshot.threadCandidates.state === "listed" && snapshot.threadCandidates.records,
	).toHaveLength(BROWSER_THREAD_CANDIDATE_LIMIT);
	expect(wireBytes(snapshot.threadCandidates)).toBeLessThan(32_768 / 2);
});

test("removes the final paginated timeline turn when that alone crosses the byte boundary", () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const value = createGatewayHarness(authorities);
	const base = value.gateway.connect(value.browserId, value.paneId).snapshot().snapshot;
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
							},
						]
					: [],
				nextCursor: "older-turns",
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
