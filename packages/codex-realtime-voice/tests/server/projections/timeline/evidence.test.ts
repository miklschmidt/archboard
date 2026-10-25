import { expect, test } from "bun:test";

import { decodeServerNotification } from "@archboard/codex-app-server/protocol";
import type { CodexSession } from "@archboard/codex-app-server/session";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "#runtime/state/spoken-approval/state.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import { BROWSER_TIMELINE_LIMITS } from "#shared/schemas/browser/vocabulary.ts";
import { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "@archboard/codex-app-server/identity";
import { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
import {
	type BrowserProjectionInput,
	type CodexTimelineProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";
import { createServerBrowserProjectionBudget } from "#server/projections/timeline/budget.ts";
import { createServerTimelineOwner } from "#server/projections/timeline/timeline.ts";
import {
	commandExecutionItem,
	dynamicToolCallItem,
	executableLink,
	fileChangeItem,
	flush,
	turnFixture,
} from "#tests/server/support/timeline/timeline-fixture.ts";

/**
 * The smallest owner state a browser snapshot is projected from, carrying the
 * timeline under test.
 */
function browserProjectionInput(
	authorities: IdentityAuthorities,
	timeline: CodexTimelineProjectionInput,
): BrowserProjectionInput {
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: {
			kind: "codex_account_response",
			response: { account: null, requiresOpenaiAuth: true, workspaceRouting: null },
		},
		login: { kind: "login", state: "idle" },
		threadLink: executableLink(authorities, timeline.threadId),
		timeline,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		contextDelivery: { kind: "codex_context_delivery", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "unbound",
			threadId: null,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			unattended: false,
			mediaReady: false,
			generation: null,
			coordinatorState: "unbound",
			transcript: [],
		},
		spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		lease: null,
		operation: null,
	};
}

const bytes = (value: string | null): number => new TextEncoder().encode(value ?? "").byteLength;

test("long outputs, sprawling patches and large arguments are cut to their wire bounds", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("bounds-thread");
	const lines = Array.from({ length: 5_000 }, (_, index) => `line ${index} ✓`);
	const longOutput = `${lines.join("\n")}\n`;
	const unbrokenOutput = "x".repeat(10_000);
	const command = (raw: string, aggregatedOutput: string | null) =>
		commandExecutionItem(authorities, raw, {
			type: "commandExecution",
			pluginId: null,
			scriptPath: null,
			command: "bun test",
			cwd: "",
			processId: null,
			source: "agent",
			status: "failed",
			commandActions: [],
			aggregatedOutput,
			exitCode: 1,
			durationMs: null,
		});
	const turn = turnFixture(authorities, "bounds-turn", [
		command("bounds-long", longOutput),
		command("bounds-unbroken", unbrokenOutput),
		command("bounds-none", null),
		fileChangeItem(authorities, "bounds-files", {
			type: "fileChange",
			changes: Array.from({ length: BROWSER_TIMELINE_LIMITS.fileChanges + 6 }, (_, index) => ({
				path: `/repo/file-${index}.ts`,
				kind: { type: "add" as const },
				diff: "x\n",
			})),
			status: "inProgress",
		}),
		dynamicToolCallItem(authorities, "bounds-tool", {
			type: "dynamicToolCall",
			namespace: null,
			tool: "write",
			arguments: { body: "a".repeat(5_000) },
			status: "inProgress",
			contentItems: null,
			success: null,
			durationMs: null,
		}),
	]);
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async () => ({ data: [turn], nextCursor: null, backwardsCursor: null }),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
	});
	const link = executableLink(authorities, threadId);
	const connection = {};
	owner.read("pane-bounds", 1, link, true, connection);
	await flush();
	const projection = owner.read("pane-bounds", 1, link, true, connection);
	const [long, unbroken, none, files, tool] = projection?.turns[0]?.items ?? [];
	if (
		long?.kind !== "command_execution" ||
		unbroken?.kind !== "command_execution" ||
		none?.kind !== "command_execution" ||
		files?.kind !== "file_change" ||
		tool?.kind !== "tool_call"
	) {
		throw new Error("the bounded items were not projected");
	}
	const tail = long.output.tail ?? "";
	expect(long.output.truncated).toBe(true);
	expect(bytes(tail)).toBeLessThanOrEqual(BROWSER_TIMELINE_LIMITS.outputTail);
	// The tail is the end of the output, starting on a whole line.
	expect(longOutput.endsWith(tail)).toBe(true);
	expect(longOutput.at(-tail.length - 1)).toBe("\n");
	expect(tail.endsWith(`${lines.at(-1)}\n`)).toBe(true);
	expect(long.cwd).toBeNull();
	expect(long.item.durationMs).toBeNull();
	// An output with no line break inside its bound is still cut to it.
	expect(unbroken.output.truncated).toBe(true);
	expect(bytes(unbroken.output.tail)).toBe(BROWSER_TIMELINE_LIMITS.outputTail);
	expect(none.output).toEqual({ tail: null, truncated: false });
	expect(files.changes).toHaveLength(BROWSER_TIMELINE_LIMITS.fileChanges);
	expect(files.changesTruncated).toBe(true);
	expect(tool.server).toBeNull();
	expect(bytes(tool.arguments)).toBeLessThanOrEqual(BROWSER_TIMELINE_LIMITS.toolArguments);
	expect(tool.error).toBeNull();
	owner.dispose();
});

function wireEvent(
	authorities: IdentityAuthorities,
	method: string,
	params: unknown,
): TransportServerNotification {
	return {
		correlation: {
			child: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			requestId: null,
		},
		notification: decodeServerNotification({ method, params }),
	};
}

const usageBreakdown = (totalTokens: number) => ({
	totalTokens,
	inputTokens: totalTokens - 10,
	cachedInputTokens: 0,
	cacheWriteInputTokens: 0,
	outputTokens: 10,
	reasoningOutputTokens: 2,
});

test("plan and token usage reports republish the timeline without re-reading history", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("live-thread");
	const wireThreadId = decoder.serializeCodexIdentity(threadId);
	let reads = 0;
	let changes = 0;
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async () => {
				reads += 1;
				return {
					data: [turnFixture(authorities, "live-turn", [], "inProgress")],
					nextCursor: null,
					backwardsCursor: null,
				};
			},
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => {
			changes += 1;
		},
	});
	const link = executableLink(authorities, threadId);
	const connection = {};
	const current = () => owner.read("pane-live", 1, link, true, connection);
	current();
	await flush();
	expect({ reads, changes }).toEqual({ reads: 1, changes: 1 });

	const plan = (explanation: string, status: "inProgress" | "completed") =>
		wireEvent(authorities, "turn/plan/updated", {
			threadId: wireThreadId,
			turnId: "live-turn",
			explanation,
			plan: [
				{ step: "Read the renderer", status: "completed" },
				{ step: "Change the layout", status },
			],
		});
	owner.onNotification(plan("first plan", "inProgress"));
	owner.onNotification(plan("latest plan", "completed"));
	owner.onNotification(
		wireEvent(authorities, "thread/tokenUsage/updated", {
			threadId: wireThreadId,
			turnId: "live-turn",
			tokenUsage: {
				total: usageBreakdown(900),
				last: usageBreakdown(300),
				modelContextWindow: 1_000,
			},
		}),
	);
	// Another thread's plan changes nothing this pane shows.
	owner.onNotification(
		wireEvent(authorities, "turn/plan/updated", {
			threadId: "another-thread",
			turnId: "live-turn",
			explanation: null,
			plan: [],
		}),
	);
	await flush();
	expect({ reads, changes }).toEqual({ reads: 1, changes: 4 });
	const projection = current();
	expect(projection?.turns[0]?.plan).toEqual({
		explanation: "latest plan",
		plan: [
			{ step: "Read the renderer", status: "completed" },
			{ step: "Change the layout", status: "completed" },
		],
	});
	expect(projection?.usage).toEqual({
		total: usageBreakdown(900),
		last: usageBreakdown(300),
		modelContextWindow: 1_000,
	});

	// A plan held for a turn survives the history re-read the next turn event causes.
	owner.onNotification(
		wireEvent(authorities, "turn/completed", {
			threadId: wireThreadId,
			turn: {
				id: "live-turn",
				items: [],
				itemsView: "full",
				status: "completed",
				error: null,
				startedAt: 1,
				completedAt: 2,
				durationMs: 1,
			},
		}),
	);
	await flush();
	expect(reads).toBe(2);
	expect(current()?.turns[0]?.plan?.explanation).toBe("latest plan");
	owner.dispose();
});

test("the projection keeps within its byte budget with long outputs, plans and many turns", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("budget-thread");
	const wireThreadId = decoder.serializeCodexIdentity(threadId);
	const output = `${"output line\n".repeat(20_000)}done\n`;
	const turnCount = 300;
	const turnIds = Array.from({ length: turnCount }, (_, index) => `budget-turn-${index}`);
	const turns = turnIds.map((raw, index) =>
		turnFixture(
			authorities,
			raw,
			Array.from({ length: 12 }, (_, itemIndex) =>
				commandExecutionItem(authorities, `${raw}-command-${itemIndex}`, {
					type: "commandExecution",
					pluginId: null,
					scriptPath: null,
					command: `bun test ${itemIndex}`,
					cwd: "/repo",
					processId: null,
					source: "agent",
					status: "completed",
					commandActions: [],
					aggregatedOutput: output,
					exitCode: 0,
					durationMs: 10,
				}),
			),
			index === turnCount - 1 ? "inProgress" : "completed",
		),
	);
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async (params: Parameters<CodexSession["threadTurnsListPage"]>[0]) => {
				const offset = params.cursor === null ? 0 : Number(params.cursor);
				const next = offset + (params.limit ?? turns.length);
				const page = turns.toReversed().slice(offset, next);
				return {
					data: page,
					nextCursor: next < turns.length ? String(next) : null,
					backwardsCursor: null,
				};
			},
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
	});
	for (const turnId of turnIds) {
		owner.onNotification(
			wireEvent(authorities, "turn/plan/updated", {
				threadId: wireThreadId,
				turnId,
				explanation: "e".repeat(10_000),
				plan: Array.from({ length: 100 }, () => ({ step: "s".repeat(2_000), status: "pending" })),
			}),
		);
	}
	owner.onNotification(
		wireEvent(authorities, "thread/tokenUsage/updated", {
			threadId: wireThreadId,
			turnId: turnIds.at(-1),
			tokenUsage: {
				total: usageBreakdown(5_000),
				last: usageBreakdown(500),
				modelContextWindow: null,
			},
		}),
	);
	const link = executableLink(authorities, threadId);
	const connection = {};
	owner.read("pane-budget", 1, link, true, connection);
	await flush();
	const projection = owner.read("pane-budget", 1, link, true, connection);
	if (projection === null) {
		throw new Error("the budget timeline was not loaded");
	}
	const encoded = new TextEncoder().encode(JSON.stringify(projection)).byteLength;
	expect(encoded).toBeLessThanOrEqual(createServerBrowserProjectionBudget().maxBytes);
	// History is cut at the oldest end: the running turn and its plan survive.
	const newest = projection.turns.at(-1);
	expect(newest?.turn.id).toBe(decoder.adoptTurnId(turnIds.at(-1)));
	expect(newest?.plan?.plan).toHaveLength(BROWSER_TIMELINE_LIMITS.planSteps);
	expect(projection.turns[0]?.presentation.outputs.truncated).toBe(true);
	expect(projection.usage?.total.totalTokens).toBe(5_000);
	// Everything the owner bounded is something the browser contract accepts.
	const result = projectCodexBrowserState(
		createCodexBrowserModel(authorities),
		browserProjectionInput(authorities, projection),
	);
	expect(result.tag).toBe("projected");
	owner.dispose();
});

test("one long running turn over the byte budget keeps the item the agent is on now", async () => {
	const authorities = createIdentityAuthorities();
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("long-turn-thread");
	const itemCount = 250;
	const output = "o".repeat(7_000);
	const newestIndex = itemCount - 1;
	const items = Array.from({ length: itemCount }, (_, index) =>
		commandExecutionItem(authorities, `long-command-${index}`, {
			type: "commandExecution",
			pluginId: null,
			scriptPath: null,
			command: `step ${index}`,
			cwd: "/repo",
			processId: null,
			source: "agent",
			status: index === newestIndex ? "inProgress" : "completed",
			commandActions: [],
			aggregatedOutput: output,
			exitCode: index === newestIndex ? null : 0,
			durationMs: null,
		}),
	);
	const turn = turnFixture(authorities, "long-turn", items, "inProgress");
	const owner = createServerTimelineOwner({
		session: {
			threadTurnsListPage: async () => ({ data: [turn], nextCursor: null, backwardsCursor: null }),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
		identity: decoder,
		approvals: { inspectViews: () => [] },
		onChange: () => undefined,
	});
	const link = executableLink(authorities, threadId);
	const connection = {};
	owner.read("pane-long-turn", 1, link, true, connection);
	await flush();
	const projection = owner.read("pane-long-turn", 1, link, true, connection);
	const projected = projection?.turns.at(-1);
	if (projection === null || projected === undefined) {
		throw new Error("the long turn was not projected");
	}
	expect(new TextEncoder().encode(JSON.stringify(projection)).byteLength).toBeLessThanOrEqual(
		createServerBrowserProjectionBudget().maxBytes,
	);
	const newest = projected.items.at(-1);
	if (newest?.kind !== "command_execution") {
		throw new Error("the newest item is not a command");
	}
	expect(newest.item.id).toBe(decoder.adoptItemId(`long-command-${newestIndex}`));
	expect(newest.output.tail).not.toBeNull();
	expect(projected.presentation.outputs.truncated).toBe(true);
	// Whatever output an item no longer carries, it says was cut.
	for (const item of projected.items) {
		if (item.kind === "command_execution" && item.output.tail === null) {
			expect(item.output.truncated).toBe(true);
		}
	}
	const result = projectCodexBrowserState(
		createCodexBrowserModel(authorities),
		browserProjectionInput(authorities, projection),
	);
	expect(result.tag).toBe("projected");
	owner.dispose();
});
