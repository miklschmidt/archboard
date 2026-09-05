import { describe, expect, test } from "bun:test";

import type { BrowserTimeline } from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	CODEX_THREAD_ITEM_LABELS,
	boundedDetails,
	boundedText,
	failureProjection,
	normalizeTimeline,
	projectTimelineTurns,
	safeHttpUrl,
	workbenchRuntimeMessageId,
	type CodexWorkbenchItem,
	type CodexWorkbenchTurn,
	type WorkbenchTimelineInput,
} from "@/ui/workbench-timeline";

const { decoder } = createIdentityAuthorities().identity;
const threadId = decoder.adoptThreadId("thread-timeline");
const turnId = decoder.adoptTurnId("turn-timeline");
const approvalItemId = decoder.adoptItemId("item-approval");
const laterItemId = decoder.adoptItemId("item-later");
const approvalId = decoder.adoptApprovalId("approval-a");

type BrowserTurn = BrowserTimeline["turns"][number];
type BrowserItem = BrowserTurn["items"][number];

/**
 * One decoded item of every recovered family.
 * @param longOutput The command output.
 * @returns The items.
 */
function completeItems(longOutput = "command output"): readonly CodexWorkbenchItem[] {
	return [
		{ type: "userMessage", id: "item-user", clientId: null, content: [] },
		{ type: "hookPrompt", id: "item-hook", fragments: [] },
		{
			type: "agentMessage",
			id: "item-agent",
			text: "Answer",
			phase: null,
			memoryCitation: null,
			delivery: null,
		},
		{
			type: "functionCallOutput",
			id: "item-output",
			name: "inspect",
			namespace: "archboard",
			output: [{ type: "input_text", text: "result" }],
		},
		{ type: "plan", id: "item-plan", text: "Plan" },
		{ type: "reasoning", id: "item-reasoning", summary: ["Summary"], content: [] },
		{
			type: "commandExecution",
			id: "item-command",
			pluginId: null,
			scriptPath: null,
			command: "bun test",
			cwd: "/repo",
			processId: null,
			source: "agent",
			status: "completed",
			commandActions: [],
			aggregatedOutput: longOutput,
			exitCode: 0,
			durationMs: 12,
		},
		{
			type: "fileChange",
			id: "item-file",
			changes: [
				{ path: "src/board.ts", kind: { type: "add" }, diff: "+export const board = true;" },
			],
			status: "completed",
		},
		{
			type: "mcpToolCall",
			id: "item-mcp",
			server: "canvas",
			tool: "describe",
			status: "completed",
			arguments: {},
			appContext: null,
			pluginId: null,
			readOnlyHint: true,
			result: null,
			error: null,
			durationMs: 2,
		},
		{
			type: "dynamicToolCall",
			id: "item-tool",
			namespace: "archboard",
			tool: "inspect",
			arguments: {},
			status: "completed",
			contentItems: null,
			success: true,
			durationMs: 2,
		},
		{
			type: "collabAgentToolCall",
			id: "item-collab",
			tool: "sendMessage",
			status: "completed",
			senderThreadId: "sender",
			receiverThreadIds: ["receiver"],
			prompt: null,
			model: null,
			reasoningEffort: null,
			agentsStates: {},
		},
		{
			type: "subAgentActivity",
			id: "item-subagent",
			kind: "completed",
			agentThreadId: "receiver",
			agentPath: "/root/reviewer",
		},
		{ type: "webSearch", id: "item-web", query: "Archboard", action: null, results: null },
		{ type: "imageView", id: "item-image", path: "/tmp/reference.png" },
		{ type: "sleep", id: "item-sleep", durationMs: 25 },
		{
			type: "imageGeneration",
			id: "item-image-generation",
			status: "completed",
			revisedPrompt: null,
			result: "/tmp/generated.png",
			failure: null,
		},
		{ type: "enteredReviewMode", id: "item-review-in", review: "Review scope" },
		{ type: "exitedReviewMode", id: "item-review-out", review: "Review clean" },
		{ type: "contextCompaction", id: "item-compact" },
	];
}

/**
 * A decoded turn.
 * @param status The turn status.
 * @param items The items.
 * @returns The turn.
 */
function turn(
	status: CodexWorkbenchTurn["status"] = "completed",
	items: readonly CodexWorkbenchItem[] = completeItems(),
): CodexWorkbenchTurn {
	return {
		id: turnId,
		items: [...items],
		itemsView: "full",
		status,
		error:
			status === "failed"
				? {
						message: "Turn failure",
						codexErrorInfo: null,
						additionalDetails: null,
						misalignment: null,
					}
				: null,
		startedAt: 1,
		completedAt: status === "inProgress" ? null : 2,
		durationMs: status === "inProgress" ? null : 1_000,
	};
}

/**
 * The runtime timeline: a command, its approval sharing the item id, and later text.
 * @param status The turn status.
 * @returns The timeline.
 */
function runtimeTimeline(status: BrowserTurn["status"]): BrowserTimeline {
	return {
		kind: "timeline",
		threadId,
		turns: [
			{
				turnId,
				status,
				items: [
					{ media: "command", itemId: approvalItemId, command: "bun test", status: "completed" },
					{ media: "approval", itemId: approvalItemId, approvalId, status: "pending" },
					{ media: "text", itemId: laterItemId, text: "Later activity" },
				],
				summary: "Timeline fixture",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: null,
	};
}

/**
 * The normaliser input.
 * @param overrides The fields to replace.
 * @returns The input.
 */
function input(overrides: Partial<WorkbenchTimelineInput> = {}): WorkbenchTimelineInput {
	return { threadId, turns: [turn()], runtimeTimeline: runtimeTimeline("completed"), ...overrides };
}

/**
 * The expected identity of one item occurrence.
 * @param itemId The item.
 * @param occurrence The occurrence.
 * @returns The identity.
 */
function expectedIdentity(itemId: string, occurrence = 0): string {
	return JSON.stringify([threadId, turnId, itemId, occurrence]);
}

/**
 * The items of the fixture turn.
 * @param value The normalised timeline.
 * @returns The items.
 */
function fixtureItems(value: ReturnType<typeof normalizeTimeline>): readonly {
	readonly identity: string;
	readonly itemId: string;
	readonly type: string;
	readonly label: string;
	readonly malformed: boolean;
}[] {
	return value.turns.get(turnId)?.items ?? [];
}

describe("workbench timeline normalisation", () => {
	test("keeps a compile-time-complete label for every recovered ThreadItem arm", () => {
		expect(Object.keys(CODEX_THREAD_ITEM_LABELS)).toEqual([
			"userMessage",
			"hookPrompt",
			"agentMessage",
			"functionCallOutput",
			"plan",
			"reasoning",
			"commandExecution",
			"fileChange",
			"mcpToolCall",
			"dynamicToolCall",
			"collabAgentToolCall",
			"subAgentActivity",
			"webSearch",
			"imageView",
			"sleep",
			"imageGeneration",
			"enteredReviewMode",
			"exitedReviewMode",
			"contextCompaction",
		]);
	});

	test("normalizes every recovered family and approval by stable thread, turn, and item identity", () => {
		const items = fixtureItems(normalizeTimeline(input()));
		expect(items).toHaveLength(completeItems().length + 1);
		expect(items.map((item) => item.identity)).toEqual(
			fixtureItems(normalizeTimeline(input())).map((item) => item.identity),
		);
		for (const item of completeItems()) {
			expect(items.find((candidate) => candidate.itemId === item.id)?.identity).toBe(
				expectedIdentity(item.id),
			);
		}
		expect(items.at(-1)).toMatchObject({
			itemId: approvalItemId,
			label: "Approval",
			type: "approval",
		});
	});

	test("tracks streaming completion and delayed arrival without changing item identity", () => {
		const running = normalizeTimeline(
			input({ turns: [turn("inProgress")], runtimeTimeline: runtimeTimeline("inProgress") }),
		);
		expect(running.streaming).toBe(true);
		const runtimeSettled = normalizeTimeline(
			input({ turns: [turn("inProgress")], runtimeTimeline: runtimeTimeline("completed") }),
		);
		expect(runtimeSettled.turns.get(turnId)?.status).toBe("completed");
		expect(fixtureItems(normalizeTimeline(input({ turns: [] }))).map((item) => item.type)).toEqual([
			"commandExecution",
			"approval",
			"agentMessage",
		]);
		const empty = normalizeTimeline(input({ turns: [], runtimeTimeline: null }));
		const complete = normalizeTimeline(input());
		expect(empty.turns.size).toBe(0);
		expect(complete.streaming).toBe(false);
		expect(fixtureItems(complete)[0]?.identity).toBe(expectedIdentity("item-user"));
	});

	test("keeps prior-epoch and terminal states explicit", () => {
		expect(normalizeTimeline(input({ history: "prior_epoch" })).priorEpoch).toBe(true);
		expect(
			normalizeTimeline(
				input({ turns: [turn("interrupted")], runtimeTimeline: runtimeTimeline("inProgress") }),
			).turns.get(turnId)?.status,
		).toBe("interrupted");
		expect(
			normalizeTimeline(
				input({ turns: [turn("failed")], runtimeTimeline: runtimeTimeline("failed") }),
			).turns.get(turnId)?.error,
		).toMatchObject({ message: "Turn failure" });
	});

	test("normalizes unknown, malformed, and duplicate items deterministically", () => {
		const duplicate: CodexWorkbenchItem = {
			type: "plan",
			id: "item-future",
			text: "Duplicate identity",
		};
		// A hostile item outside the closed union reaches the normaliser as an
		// unknown record; the decoded turn type is bypassed at the wire, not here.
		const hostileTurn: WorkbenchTimelineInput["turns"][number] = {
			...turn("completed", [duplicate]),
			items: [duplicate],
		};
		const unknownRecord: unknown = {
			type: "futureCodexItem",
			id: "item-future",
			payload: "opaque",
		};
		const hostileInput: WorkbenchTimelineInput = {
			threadId,
			turns: [{ ...hostileTurn, items: [unknownRecord, duplicate].filter(isDecodedItem) }],
		};
		const first = fixtureItems(normalizeTimeline(hostileInput));
		const second = fixtureItems(normalizeTimeline(hostileInput));
		expect(first.map((item) => item.identity)).toEqual(second.map((item) => item.identity));
		expect(first[0]).toMatchObject({ label: "Unknown item", malformed: true });
		expect(first[1]?.identity).toBe(expectedIdentity("item-future", 1));
	});

	test("keeps duplicate occurrences injective from literal suffix-like item ids", () => {
		const hostile = turn("completed", [
			{ type: "plan", id: "item-x", text: "First" },
			{ type: "plan", id: "item-x", text: "Second" },
			{ type: "plan", id: "item-x:duplicate-1", text: "Literal suffix" },
		]);
		const items = fixtureItems(normalizeTimeline(input({ turns: [hostile] })));
		expect(new Set(items.map((item) => item.identity)).size).toBe(items.length);
	});

	test("keeps a matching approval beside its canonical item before later activity", () => {
		const mixedTurn = turn("completed", [
			{ ...fixtureItem("commandExecution"), id: approvalItemId },
			{ ...fixtureItem("agentMessage"), id: laterItemId },
		]);
		const items = fixtureItems(
			normalizeTimeline(
				input({ turns: [mixedTurn], runtimeTimeline: runtimeTimeline("completed") }),
			),
		);
		expect(items.map((item) => item.type)).toEqual([
			"commandExecution",
			"approval",
			"agentMessage",
		]);
		expect(items.map((item) => item.itemId)).toEqual([approvalItemId, approvalItemId, laterItemId]);
		expect(items[0]?.identity).not.toBe(items[1]?.identity);
	});

	test("bounds inert details and accepts only HTTP media links", () => {
		const cycle: Record<string, unknown> = { value: "x".repeat(20_000) };
		cycle["self"] = cycle;
		const details = boundedDetails(cycle);
		expect(details.text).toContain("[circular]");
		expect(details.text.length).toBeLessThanOrEqual(16_384);
		expect(boundedText("x".repeat(20_000)).omitted).toBe(15_904);
		expect(safeHttpUrl("file:///tmp/private")).toBeNull();
		expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
		expect(safeHttpUrl("https://example.test/image.png")).toBe("https://example.test/image.png");
	});
});

/**
 * Whether a value is a decoded item, for the hostile fixture only.
 * @param value The value.
 * @returns True always; the hostile record is meant to reach the normaliser.
 */
function isDecodedItem(value: unknown): value is CodexWorkbenchItem {
	return typeof value === "object" && value !== null;
}

describe("workbench timeline projection", () => {
	test("projects one turn per authoritative turn with every item identity retained", () => {
		const turns = projectTimelineTurns(runtimeTimeline("completed"));
		expect(turns).toHaveLength(1);
		const only = firstOf(turns);
		expect(only.id).toBe(workbenchRuntimeMessageId(threadId, turnId));
		expect(only.outcome).toBe("completed");
		expect(only.metadata.items.map((item) => item.itemId)).toEqual([
			approvalItemId,
			approvalItemId,
			laterItemId,
		]);
		expect(only.metadata.items.map((item) => item.kind)).toEqual(["command", "approval", "text"]);
		expect(only.parts.map((part) => part.kind)).toEqual(["tool", "tool", "text"]);
		expect(only.parts[0]).toMatchObject({ kind: "tool", name: "command", detail: "bun test" });
	});

	test("shows the summary for a finished turn without items and nothing for a running one", () => {
		const base = runtimeTimeline("completed");
		const bare: BrowserTimeline = {
			...base,
			turns: [{ ...base.turns[0]!, items: [], status: "completed" }],
		};
		expect(projectTimelineTurns(bare)[0]?.parts).toEqual([
			{ kind: "text", text: "Timeline fixture" },
		]);
		const running: BrowserTimeline = {
			...base,
			turns: [{ ...base.turns[0]!, items: [], status: "inProgress" }],
		};
		expect(projectTimelineTurns(running)[0]).toMatchObject({ outcome: "running", parts: [] });
	});

	test("an unsupported item keeps its identity, marked unsupported", () => {
		const base = runtimeTimeline("completed");
		const future: unknown = { media: "futureCodexItem", itemId: "item-future", payload: "opaque" };
		const hostile: BrowserTimeline = {
			...base,
			turns: [{ ...base.turns[0]!, items: [future].filter(isBrowserItem) }],
		};
		const items = firstOf(projectTimelineTurns(hostile)).metadata.items;
		expect(items.map((item) => String(item.itemId))).toEqual(["item-future"]);
		expect(items[0]).toMatchObject({
			kind: "futureCodexItem",
			supported: false,
			value: { media: "futureCodexItem", itemId: "item-future", payload: "opaque" },
		});
	});

	test("duplicate turn and item identities are refused, and a failure projection names them", () => {
		const base = runtimeTimeline("completed");
		const duplicateTurns: BrowserTimeline = { ...base, turns: [base.turns[0]!, base.turns[0]!] };
		expect(() => projectTimelineTurns(duplicateTurns)).toThrow("Duplicate Codex turn identity");
		const command: BrowserItem = {
			media: "command",
			itemId: approvalItemId,
			command: "bun test",
			status: "completed",
		};
		const duplicateItems: BrowserTimeline = {
			...base,
			turns: [{ ...base.turns[0]!, items: [command, command] }],
		};
		expect(() => projectTimelineTurns(duplicateItems)).toThrow("Duplicate Codex item identity");
		const failure = failureProjection(threadId, "Duplicate Codex turn identity: x");
		expect(failure.outcome).toBe("failed");
		expect(failure.parts).toEqual([{ kind: "text", text: "Duplicate Codex turn identity: x" }]);
		expect(failure.id).toBe(workbenchRuntimeMessageId(threadId, `runtime-failure:${threadId}`));
	});
});

/**
 * Whether a value is a published item, for the hostile fixture only.
 * @param value The value.
 * @returns True always; the hostile record is meant to reach the projection.
 */
function isBrowserItem(value: unknown): value is BrowserItem {
	return typeof value === "object" && value !== null;
}

/**
 * The decoded fixture item of one type.
 * @param type The item type.
 * @returns The item.
 */
function fixtureItem(type: CodexWorkbenchItem["type"]): CodexWorkbenchItem {
	const item = completeItems().find((candidate) => candidate.type === type);
	if (item === undefined) {
		throw new Error(`Expected the ${type} fixture.`);
	}
	return item;
}

/**
 * The first element of a non-empty list.
 * @param list The list.
 * @returns The first element.
 */
function firstOf<Item>(list: readonly Item[]): Item {
	const [first] = list;
	if (first === undefined) {
		throw new Error("Expected at least one element.");
	}
	return first;
}
