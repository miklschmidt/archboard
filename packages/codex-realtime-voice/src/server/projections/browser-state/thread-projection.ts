import type {
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
	BrowserTimeline,
} from "#shared/schemas/browser/snapshot.ts";
import type {
	BrowserProjectionInput,
	CodexTimelineItemProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";

type BrowserTimelineTurn = BrowserTimeline["turns"][number];
type BrowserTimelineItem = BrowserTimelineTurn["items"][number];
type TimelineTurnInput = NonNullable<BrowserProjectionInput["timeline"]>["turns"][number];
type TimelineUsageInput = NonNullable<BrowserProjectionInput["timeline"]>["usage"];
type TokenUsageBreakdownInput = NonNullable<TimelineUsageInput>["total"];
type BrowserTimelineApprovalStatus = Extract<
	BrowserTimelineItem,
	{ readonly media: "approval" }
>["status"];
type TimelineApprovalState = Extract<
	CodexTimelineItemProjectionInput,
	{ readonly kind: "approval_request" }
>["state"];
type TimelineTextItemInput = Extract<
	CodexTimelineItemProjectionInput,
	{
		readonly kind:
			| "user_message"
			| "agent_message"
			| "reasoning_summary"
			| "plan"
			| "web_search"
			| "context_compaction";
	}
>;
type ThreadLinkSourceInput = Exclude<BrowserProjectionInput["threadLink"]["source"], null>;
type NamedThreadLinkSource = Extract<ThreadLinkSourceInput, string>;

const TIMELINE_APPROVAL_STATUS_BY_STATE = {
	pending: "pending",
	settled: "resolved",
	cancelled: "cancelled",
} as const satisfies Record<TimelineApprovalState, BrowserTimelineApprovalStatus>;

const SOURCE_PRESENTATION_BY_NAMED_SOURCE = {
	cli: "standard",
	vscode: "standard",
	exec: "standard",
	appServer: "standard",
	unknown: "unknown",
} as const satisfies Record<NamedThreadLinkSource, BrowserThreadLinkSourcePresentation>;

/**
 * Fail at compile time when a timeline or thread-link arm is left unprojected;
 * at run time the call always throws, naming the value.
 * @param value The value no arm handled.
 */
function unprojected(value: never): never {
	throw new Error(`the owner value ${JSON.stringify(value)} has no browser projection`);
}

/**
 * Project the items that present as a block of text.
 * @param item The owner's timeline item.
 * @returns The browser timeline item.
 */
function projectTimelineTextItem(item: TimelineTextItemInput): BrowserTimelineItem {
	switch (item.kind) {
		case "agent_message":
			return { media: "text", itemId: item.item.id, text: item.item.text };
		case "reasoning_summary":
			return { media: "reasoning", itemId: item.item.id, text: item.text };
		case "plan":
			return { media: "plan", itemId: item.item.id, text: item.item.text };
		default:
			return projectTimelineConversationItem(item);
	}
}

/**
 * Project what the person said and the markers of what happened to the
 * conversation: a web search, a compaction.
 * @param item The owner's timeline item.
 * @returns The browser timeline item.
 */
function projectTimelineConversationItem(
	item: Exclude<
		TimelineTextItemInput,
		{ readonly kind: "agent_message" | "reasoning_summary" | "plan" }
	>,
): BrowserTimelineItem {
	switch (item.kind) {
		case "user_message":
			return { media: "prompt", itemId: item.item.id, text: item.text };
		case "web_search":
			return { media: "search", itemId: item.item.id, query: item.query };
		case "context_compaction":
			return { media: "compaction", itemId: item.item.id };
		default:
			return unprojected(item);
	}
}

/**
 * Project one owner timeline item into the browser media arm it presents as.
 * @param item The owner's timeline item.
 * @returns The browser timeline item.
 */
function projectTimelineItem(item: CodexTimelineItemProjectionInput): BrowserTimelineItem {
	switch (item.kind) {
		case "tool_call":
			return {
				media: "tool",
				itemId: item.item.id,
				name: item.item.tool,
				status: item.item.status,
				server: item.server,
				arguments: item.arguments,
				durationMs: item.item.durationMs,
				error: item.error,
			};
		case "command_execution":
			return {
				media: "command",
				itemId: item.item.id,
				command: item.item.command,
				status: item.item.status,
				cwd: item.cwd,
				exitCode: item.item.exitCode,
				durationMs: item.item.durationMs,
				output: item.output.tail,
				outputTruncated: item.output.truncated,
			};
		case "file_change":
			return {
				media: "fileChange",
				itemId: item.item.id,
				status: item.item.status,
				changes: item.changes.map((change) => ({
					path: change.path,
					kind: change.kind,
					movePath: change.movePath,
					added: change.added,
					removed: change.removed,
				})),
				changesTruncated: item.changesTruncated,
			};
		case "approval_request":
			return {
				media: "approval",
				itemId: item.identity.itemId,
				approvalId: item.identity.approvalId,
				status: TIMELINE_APPROVAL_STATUS_BY_STATE[item.state],
			};
		default:
			return projectTimelineTextItem(item);
	}
}

/**
 * A Codex Unix timestamp in seconds as milliseconds.
 * @param seconds The timestamp, when Codex reported one.
 * @returns The milliseconds, or null.
 */
function secondsToMilliseconds(seconds: number | null): number | null {
	return seconds === null ? null : seconds * 1000;
}

/**
 * Project one owner turn, with its timing, failure and latest plan.
 * @param entry The owner's turn.
 * @param delegatedBy The coordinator turn that delegated it, when the server knows one.
 * @returns The browser turn.
 */
function projectTimelineTurn(
	entry: TimelineTurnInput,
	delegatedBy: BrowserTimelineTurn["delegatedBy"],
): BrowserTimelineTurn {
	return {
		turnId: entry.turn.id,
		status: entry.turn.status,
		items: entry.items.map(projectTimelineItem),
		summary: entry.presentation.summary,
		outputsIncluded: entry.presentation.outputs.included,
		outputsTruncated: entry.presentation.outputs.truncated,
		startedAtMs: secondsToMilliseconds(entry.turn.startedAt),
		completedAtMs: secondsToMilliseconds(entry.turn.completedAt),
		durationMs: entry.turn.durationMs,
		error:
			entry.error === null ? null : { message: entry.error.message, details: entry.error.details },
		plan:
			entry.plan === null
				? null
				: {
						explanation: entry.plan.explanation,
						steps: entry.plan.plan.map(({ step, status }) => ({ step, status })),
					},
		...(delegatedBy === undefined ? {} : { delegatedBy }),
	};
}

/**
 * One token usage breakdown, closed to the fields the browser is shown.
 * @param usage The breakdown as Codex reported it.
 * @returns The browser breakdown.
 */
function projectTokenUsageBreakdown(
	usage: TokenUsageBreakdownInput,
): NonNullable<BrowserTimeline["usage"]>["total"] {
	return {
		totalTokens: usage.totalTokens,
		inputTokens: usage.inputTokens,
		cachedInputTokens: usage.cachedInputTokens,
		cacheWriteInputTokens: usage.cacheWriteInputTokens,
		outputTokens: usage.outputTokens,
		reasoningOutputTokens: usage.reasoningOutputTokens,
	};
}

/**
 * Project the thread's token usage, when Codex has reported it.
 * @param usage The owner's usage.
 * @returns The browser usage, or null.
 */
function projectTimelineUsage(usage: TimelineUsageInput): BrowserTimeline["usage"] {
	if (usage === null) return null;
	return {
		total: projectTokenUsageBreakdown(usage.total),
		last: projectTokenUsageBreakdown(usage.last),
		modelContextWindow: usage.modelContextWindow,
	};
}

/**
 * Project the owner's timeline, turn by turn, for the browser.
 * @param input The owner's timeline, if it holds one.
 * @param delegations Which coordinator turn delegated each workhorse turn, when any did.
 * @returns The browser timeline, or null.
 */
export function projectTimeline(
	input: BrowserProjectionInput["timeline"],
	delegations?: BrowserProjectionInput["delegations"],
): BrowserTimeline | null {
	if (input === null) return null;
	return {
		kind: "timeline",
		threadId: input.threadId,
		turns: input.turns.map((entry) => projectTimelineTurn(entry, delegations?.get(entry.turn.id))),
		nextCursor: input.cursor,
		usage: projectTimelineUsage(input.usage),
	};
}

/**
 * Present the session source a bound link carries.
 * @param source The thread source as the classifier recorded it.
 * @returns The browser presentation of the source.
 */
function projectThreadLinkSource(
	source: ThreadLinkSourceInput,
): BrowserThreadLinkSourcePresentation {
	if (typeof source === "string") return SOURCE_PRESENTATION_BY_NAMED_SOURCE[source];
	if ("custom" in source) return "custom";
	if ("subAgent" in source) return "subagent";
	return "unknown";
}

/**
 * Project the chat's thread link for the browser, presenting its source.
 * @param input The thread-link snapshot of the chat's tab session.
 * @returns The browser thread link.
 */
export function projectThreadLink(input: BrowserProjectionInput["threadLink"]): BrowserThreadLink {
	switch (input.state) {
		case "unbound":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: null,
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
		case "inspect_only":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: projectThreadLinkSource(input.source),
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
		case "executable":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: "standard",
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
		default:
			return unprojected(input);
	}
}
