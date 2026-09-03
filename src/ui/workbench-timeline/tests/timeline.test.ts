import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import {
	ReadonlyWorkbenchThreadProvider,
	createReadonlyWorkbenchView,
	workbenchRuntimeMessageId,
} from "../../workbench-runtime/index.js";
import {
	CODEX_THREAD_ITEM_LABELS,
	boundedDetails,
	boundedText,
	normalizeTimeline,
	safeHttpUrl,
} from "../adapter.js";
import type {
	CodexWorkbenchItem,
	CodexWorkbenchTurn,
	WorkbenchTimelineProps,
} from "../contract.js";
import { WorkbenchTimeline } from "../index.tsx";

const threadId = "thread-timeline" as BrowserTimeline["threadId"];
const turnId = "turn-timeline" as BrowserTimeline["turns"][number]["turnId"];
const approvalItemId =
	"item-approval" as BrowserTimeline["turns"][number]["items"][number]["itemId"];
const laterItemId = "item-later" as BrowserTimeline["turns"][number]["items"][number]["itemId"];

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
		{ type: "fileChange", id: "item-file", changes: [], status: "completed" },
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
	] satisfies readonly CodexWorkbenchItem[];
}

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

function runtimeTimeline(status: BrowserTimeline["turns"][number]["status"]): BrowserTimeline {
	return {
		kind: "timeline",
		threadId,
		turns: [
			{
				turnId,
				status,
				items: [
					{
						media: "command",
						itemId: approvalItemId,
						command: "bun test",
						status: "completed",
					},
					{
						media: "approval",
						itemId: approvalItemId,
						approvalId: "approval-a" as never,
						status: "pending",
					},
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

function props(overrides: Partial<WorkbenchTimelineProps> = {}): WorkbenchTimelineProps {
	return { threadId, turns: [turn()], runtimeTimeline: runtimeTimeline("completed"), ...overrides };
}

function expectedIdentity(itemId: string, occurrence = 0): string {
	return JSON.stringify([threadId, turnId, itemId, occurrence]);
}

function renderTimeline(overrides: Partial<WorkbenchTimelineProps> = {}): string {
	const timelineProps = props(overrides);
	const runtime = timelineProps.runtimeTimeline ?? runtimeTimeline("completed");
	const state = timelineProps.history === "prior_epoch" ? "prior_epoch" : "coordinator";
	const view = createReadonlyWorkbenchView(runtime, state, "Focused timeline fixture.");
	if (view.mode !== "readonly") throw new Error("Expected a read-only workbench fixture.");
	return renderToStaticMarkup(
		createElement(
			ReadonlyWorkbenchThreadProvider,
			{ view },
			createElement(WorkbenchTimeline, timelineProps),
		),
	);
}

describe("workbench timeline", () => {
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
		const first = normalizeTimeline(props());
		const second = normalizeTimeline(props());
		const items = first.turns.get(turnId)?.items ?? [];
		expect(items).toHaveLength(completeItems().length + 1);
		expect(items.map((item) => item.identity)).toEqual(
			second.turns.get(turnId)?.items.map((item) => item.identity) ?? [],
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
			props({ turns: [turn("inProgress")], runtimeTimeline: runtimeTimeline("inProgress") }),
		);
		expect(running.streaming).toBe(true);
		const empty = normalizeTimeline(props({ turns: [] }));
		const complete = normalizeTimeline(props());
		expect(empty.turns.size).toBe(0);
		expect(complete.streaming).toBe(false);
		expect(complete.turns.get(turnId)?.items[0]?.identity).toBe(expectedIdentity("item-user"));
	});

	test("keeps prior-epoch and terminal states explicit", () => {
		expect(normalizeTimeline(props({ history: "prior_epoch" })).priorEpoch).toBe(true);
		expect(
			normalizeTimeline(props({ turns: [turn("interrupted")] })).turns.get(turnId)?.status,
		).toBe("interrupted");
		expect(
			normalizeTimeline(props({ turns: [turn("failed")] })).turns.get(turnId)?.error,
		).toMatchObject({ message: "Turn failure" });
	});

	test("normalizes unknown, malformed, and duplicate items deterministically", () => {
		const future = {
			type: "futureCodexItem",
			id: "item-future",
			payload: "opaque",
		} as unknown as CodexWorkbenchItem;
		const duplicate = {
			type: "plan",
			id: "item-future",
			text: "Duplicate identity",
		} satisfies CodexWorkbenchItem;
		const hostile = turn("completed", [future, duplicate]);
		const first = normalizeTimeline(props({ turns: [hostile] }));
		const second = normalizeTimeline(props({ turns: [hostile] }));
		expect(first.turns.get(turnId)?.items.map((item) => item.identity)).toEqual(
			second.turns.get(turnId)?.items.map((item) => item.identity),
		);
		expect(first.turns.get(turnId)?.items[0]).toMatchObject({
			label: "Unknown item",
			malformed: true,
		});
		expect(first.turns.get(turnId)?.items[1]?.identity).toBe(expectedIdentity("item-future", 1));
	});

	test("keeps duplicate occurrences injective from literal suffix-like item ids", () => {
		const hostile = turn("completed", [
			{ type: "plan", id: "item-x", text: "First" },
			{ type: "plan", id: "item-x", text: "Second" },
			{ type: "plan", id: "item-x:duplicate-1", text: "Literal suffix" },
		]);
		const items = normalizeTimeline(props({ turns: [hostile] })).turns.get(turnId)?.items ?? [];
		expect(new Set(items.map((item) => item.identity)).size).toBe(items.length);
	});

	test("keeps a matching approval beside its canonical item before later activity", () => {
		const command = completeItems().find((item) => item.type === "commandExecution");
		if (command?.type !== "commandExecution") throw new Error("Expected a command fixture.");
		const later = completeItems().find((item) => item.type === "agentMessage");
		if (later?.type !== "agentMessage") throw new Error("Expected an agent fixture.");
		const mixedTurn = turn("completed", [
			{ ...command, id: approvalItemId },
			{ ...later, id: laterItemId },
		]);
		const mixedProps = props({ turns: [mixedTurn], runtimeTimeline: runtimeTimeline("completed") });
		const view = createReadonlyWorkbenchView(
			mixedProps.runtimeTimeline ?? null,
			"coordinator",
			"Focused timeline fixture.",
		);
		if (view.state === "runtime_failure") throw new Error(view.reason);
		expect(view.state).toBe("coordinator");
		expect(view.messages[0]?.id).toBe(workbenchRuntimeMessageId(threadId, turnId));
		const runtimeParts = view.messages[0]?.content ?? [];
		expect(runtimeParts.map((part) => ("itemId" in part ? part.itemId : null))).toEqual([
			approvalItemId,
			approvalItemId,
			laterItemId,
		]);
		expect(runtimeParts.map((part) => part.runtimeId)).toEqual([
			JSON.stringify(["part", threadId, turnId, approvalItemId, "command", 0]),
			JSON.stringify(["part", threadId, turnId, approvalItemId, "approval", 0]),
			JSON.stringify(["part", threadId, turnId, laterItemId, "text", 0]),
		]);
		const items = normalizeTimeline(mixedProps).turns.get(turnId)?.items ?? [];
		expect(items.map((item) => item.type)).toEqual([
			"commandExecution",
			"approval",
			"agentMessage",
		]);
		expect(items.map((item) => item.itemId)).toEqual([approvalItemId, approvalItemId, laterItemId]);
		expect(items[0]?.identity).not.toBe(items[1]?.identity);

		const markup = renderTimeline(mixedProps);
		const commandIndex = markup.indexOf('data-item-type="commandExecution"');
		const approvalIndex = markup.indexOf('data-item-type="approval"');
		const laterIndex = markup.indexOf('data-item-type="agentMessage"');
		expect(commandIndex).toBeGreaterThan(-1);
		expect(commandIndex).toBeLessThan(approvalIndex);
		expect(approvalIndex).toBeLessThan(laterIndex);
	});

	test("bounds inert details and accepts only HTTP media links", () => {
		const cycle: Record<string, unknown> = { value: "x".repeat(20_000) };
		cycle.self = cycle;
		const details = boundedDetails(cycle);
		expect(details.text).toContain("[circular]");
		expect(details.text.length).toBeLessThanOrEqual(16_384);
		expect(boundedText("x".repeat(20_000)).omitted).toBe(15_904);
		expect(safeHttpUrl("file:///tmp/private")).toBeNull();
		expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
		expect(safeHttpUrl("https://example.test/image.png")).toBe("https://example.test/image.png");
	});

	test("renders the public component through the read-only provider with stable log semantics", () => {
		const running = renderTimeline({
			turns: [turn("inProgress")],
			runtimeTimeline: runtimeTimeline("inProgress"),
		});
		const headingId = running.match(/<h1[^>]+id="([^"]+)"/)?.[1];
		const log = running.match(/<div[^>]+role="log"[^>]*>/)?.[0];
		expect(headingId).toBeTruthy();
		expect(log).toContain('tabindex="0"');
		expect(log).toContain(`aria-labelledby="${headingId}"`);
		expect(log).toContain('aria-relevant="additions"');
		expect(log).toContain('aria-busy="true"');
		expect(log).toContain("focus-visible:ring-inset");
		expect(log).not.toContain("outline-offset-[");
		expect(running).not.toContain('tabindex="-1"');

		const completed = renderTimeline();
		expect(completed.match(/<div[^>]+role="log"[^>]*>/)?.[0]).not.toContain("aria-busy");
	});

	test("renders prior, terminal, hostile, repeated-link, and bounded disclosure states", () => {
		const repeatedUrl = "https://example.test/repeated.png";
		const hostileText = "<script>window.hostile = true</script>";
		const longOutput = `${"x".repeat(20_000)}TAIL-SENTINEL`;
		const items = [...completeItems(longOutput)];
		const userMessage = items[0];
		if (userMessage?.type !== "userMessage") throw new Error("Expected the user fixture first.");
		items[0] = {
			...userMessage,
			content: [
				{ type: "text", text: hostileText, text_elements: [] },
				{ type: "image", url: repeatedUrl },
				{ type: "image", url: repeatedUrl },
				{ type: "image", url: "javascript:window.hostile = true" },
			],
		};
		const unknown = {
			type: "futureCodexItem",
			id: "item-future",
			status: "futureStatus",
			payload: hostileText,
		} as unknown as CodexWorkbenchItem;
		const markup = renderTimeline({
			history: "prior_epoch",
			turns: [turn("failed", [...items, unknown])],
			runtimeTimeline: runtimeTimeline("failed"),
		});
		expect(markup).toContain("Prior session history · read only");
		expect(markup).toContain('role="alert"');
		expect(markup).toContain("Turn failed");
		expect(markup).toContain("Unknown item");
		expect(markup).toContain('class="m-0 !text-body text-muted-foreground">futureStatus');
		expect(markup).toContain("malformed or uses an unknown Codex variant");
		expect(markup).toContain("&lt;script&gt;window.hostile = true&lt;/script&gt;");
		expect(markup).not.toContain("TAIL-SENTINEL");
		expect(markup).toContain("characters omitted");
		expect(markup.match(new RegExp(`href="${repeatedUrl}"`, "g"))).toHaveLength(2);
		expect(markup).not.toContain('href="javascript:');
		expect(markup).toContain("<details");
		expect(markup).toContain("<summary");
		expect(markup).toContain("Raw details</summary>");
		expect(markup).not.toContain('tabindex="-1"');

		const interrupted = renderTimeline({ turns: [turn("interrupted")] });
		expect(interrupted).toContain('role="status"');
		expect(interrupted).toContain("Turn interrupted");
	});
});
