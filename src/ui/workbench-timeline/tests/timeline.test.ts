import { describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import {
	ReadonlyWorkbenchThreadProvider,
	createReadonlyWorkbenchView,
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

const loadedModule: unknown = import.meta.require("../index.tsx");
if (typeof loadedModule !== "object" || loadedModule === null) {
	throw new Error("Workbench timeline module did not load as an object.");
}
const WorkbenchTimeline = (loadedModule as Readonly<Record<string, unknown>>)
	.WorkbenchTimeline as ComponentType<WorkbenchTimelineProps>;
if (typeof WorkbenchTimeline !== "function") {
	throw new TypeError("WorkbenchTimeline export is not a component.");
}

const threadId = "thread-timeline" as BrowserTimeline["threadId"];
const turnId = "turn-timeline" as BrowserTimeline["turns"][number]["turnId"];
const approvalItemId =
	"item-approval" as BrowserTimeline["turns"][number]["items"][number]["itemId"];

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
			output: { content: "result", success: true },
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
	] as readonly CodexWorkbenchItem[];
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
						media: "approval",
						itemId: approvalItemId,
						approvalId: "approval-a" as never,
						status: "pending",
					},
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
		const future = { type: "futureCodexItem", id: "item-future", payload: "opaque" };
		const missingId = { type: "agentMessage", text: "No identity" };
		const duplicate = { type: "plan", id: "item-future", text: "Duplicate identity" };
		const hostile = turn("completed", [
			future,
			missingId,
			duplicate,
		] as unknown as CodexWorkbenchItem[]);
		const first = normalizeTimeline(props({ turns: [hostile] }));
		const second = normalizeTimeline(props({ turns: [hostile] }));
		expect(first.turns.get(turnId)?.items.map((item) => item.identity)).toEqual(
			second.turns.get(turnId)?.items.map((item) => item.identity),
		);
		expect(first.turns.get(turnId)?.items[0]).toMatchObject({
			label: "Unknown item",
			malformed: true,
		});
		expect(first.turns.get(turnId)?.items[1]?.itemId).toMatch(/^malformed-/);
		expect(first.turns.get(turnId)?.items[2]?.identity).toBe(expectedIdentity("item-future", 1));
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
				{ type: "text", text: hostileText },
				{ type: "image", url: repeatedUrl },
				{ type: "image", url: repeatedUrl },
				{ type: "image", url: "javascript:window.hostile = true" },
			],
		} as unknown as CodexWorkbenchItem;
		const unknown = {
			type: "futureCodexItem",
			id: "item-future",
			status: "futureStatus",
			payload: hostileText,
		};
		const markup = renderTimeline({
			history: "prior_epoch",
			turns: [turn("failed", [...items, unknown] as unknown as CodexWorkbenchItem[])],
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
		expect(markup.match(new RegExp(`href="${repeatedUrl}"`, "g"))).toHaveLength(4);
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
