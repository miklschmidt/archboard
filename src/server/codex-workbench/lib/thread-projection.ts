import type {
	BrowserSnapshot,
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
	BrowserTimeline,
} from "@/shared/codex-browser-model";
import { BROWSER_THREAD_CANDIDATE_LIMIT } from "@/shared/codex-browser-model";
import type {
	BrowserProjectionInput,
	CodexTimelineItemProjectionInput,
} from "@/server/codex-workbench/lib/projection-contract";

type BrowserTimelineItem = BrowserTimeline["turns"][number]["items"][number];
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
	{ readonly kind: "agent_message" | "reasoning_summary" | "plan" }
>;
type ThreadCandidateInput = Extract<
	BrowserProjectionInput["threadCandidates"],
	{ readonly state: "listed" }
>["candidates"][number];
type ThreadLinkSourceInput =
	| Exclude<BrowserProjectionInput["threadLink"]["source"], null>
	| ThreadCandidateInput["source"];
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
	custom: "custom",
	subAgent: "subagent",
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
			};
		case "command_execution":
			return {
				media: "command",
				itemId: item.item.id,
				command: item.item.command,
				status: item.item.status,
			};
		case "file_change":
			return { media: "fileChange", itemId: item.item.id, status: item.item.status };
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
 * Project the owner's timeline, turn by turn, for the browser.
 * @param input The owner's timeline, if it holds one.
 * @returns The browser timeline, or null.
 */
export function projectTimeline(input: BrowserProjectionInput["timeline"]): BrowserTimeline | null {
	if (input === null) return null;
	return {
		kind: "timeline",
		threadId: input.threadId,
		turns: input.turns.map((entry) => ({
			turnId: entry.turn.id,
			status: entry.turn.status,
			items: entry.items.map(projectTimelineItem),
			summary: entry.presentation.summary,
			outputsIncluded: entry.presentation.outputs.included,
			outputsTruncated: entry.presentation.outputs.truncated,
		})),
		nextCursor: input.cursor,
	};
}

/**
 * One source presentation mapper for both shapes the classifier emits: the
 * nested session source a bound link carries, and the flattened source a
 * discovered candidate carries.
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
 * Map the host inventory into the browser vocabulary and bound it. Nothing here
 * reclassifies a record or joins the two Codex lists a second time: TASK-143.01.09
 * owns that, and this projection carries its verdict through unchanged.
 * @param input The host's candidate inventory.
 * @returns The browser candidate list.
 */
export function projectThreadCandidates(
	input: BrowserProjectionInput["threadCandidates"],
): BrowserSnapshot["threadCandidates"] {
	if (input.state === "unknown")
		return {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		};
	if (input.state === "unavailable")
		return {
			kind: "thread_candidates",
			state: "unavailable",
			records: [],
			truncated: false,
			reason: input.reason,
		};
	const records = input.candidates.slice(0, BROWSER_THREAD_CANDIDATE_LIMIT).map((candidate) => ({
		kind: "thread_candidate" as const,
		selectionId: candidate.selectionId,
		threadId: candidate.threadId,
		state: candidate.state,
		reason: candidate.reason,
		sourcePresentation: projectThreadLinkSource(candidate.source),
		status: candidate.status,
		loaded: candidate.loaded,
		canAcceptDirectInput: candidate.canAcceptDirectInput,
	}));
	return {
		kind: "thread_candidates",
		state: "listed",
		records,
		truncated: records.length < input.candidates.length,
		reason: null,
	};
}

/**
 * Project the pane's thread link for the browser, presenting its source.
 * @param input The host's thread-link snapshot for the pane.
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
