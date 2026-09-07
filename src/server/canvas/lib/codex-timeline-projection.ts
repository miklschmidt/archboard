import type { ApprovalOwnerView } from "@/runtime/codex-approvals";
import type { SessionThreadItem, SessionTurn } from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexTimelineItemProjectionInput,
	CodexTimelineTurnProjectionInput,
} from "@/server/codex-workbench";

/** How many turns one page of thread history carries. */
const TIMELINE_PAGE_LIMIT = 100;

/** How many pages of thread history one refresh may read. */
const TIMELINE_PAGE_LIMIT_MAX = 8;

/** How many items of one turn the browser is shown. */
const TIMELINE_ITEM_LIMIT = 256;

/** How much text one item may carry. */
const TIMELINE_TEXT_LIMIT = 16_384;

/** How long a tool name may be. */
const TIMELINE_TOOL_LIMIT = 256;

/** How long one turn's summary line may be. */
const TIMELINE_SUMMARY_LIMIT = 512;

/** How long a paging cursor may be. */
const TIMELINE_CURSOR_LIMIT = 1024;

/** How many bytes the whole projected timeline may take on the wire. */
const TIMELINE_MAX_BYTES = 768 * 1024;

/** How many summary or content parts one reasoning item is read from. */
const TIMELINE_REASONING_PART_LIMIT = 32;

const textEncoder = new TextEncoder();

/** What a browser projection may carry, in turns, items and bytes. */
interface CanvasBrowserProjectionBudget {
	readonly maxTurns: number;
	readonly maxItemsPerTurn: number;
	/** Complete encoded BrowserSnapshot bound; the gateway performs the final fit. */
	readonly maxBytes: number;
}

/** One item of a turn, as the timeline retains it. */
type TimelineItemData = {
	readonly itemId: SessionThreadItem["id"];
	readonly item: CodexTimelineItemProjectionInput | null;
};

/** One turn, as the timeline retains it. */
interface TimelineTurnData {
	readonly turn: Pick<SessionTurn, "id" | "status">;
	readonly items: readonly TimelineItemData[];
	readonly presentation: CodexTimelineTurnProjectionInput["presentation"];
}

/** One thread's retained history, and whether reading it was cut short. */
interface TimelineData {
	readonly threadId: ThreadId;
	readonly turns: readonly TimelineTurnData[];
	readonly truncated: boolean;
	readonly cursor: string | null;
}

/** The part of an approval the timeline places against an item. */
type TimelineApprovalView = {
	readonly snapshot: Pick<
		ApprovalOwnerView["snapshot"],
		"threadId" | "turnId" | "itemId" | "approvalId" | "state"
	>;
};

/**
 * As much of a value as fits a byte bound, with an ellipsis where it was cut.
 * Null characters are dropped rather than counted: a value that is nothing but
 * those is empty, and answers with the caller's fallback.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @param fallback What to say when it carries nothing visible.
 * @returns The bounded text, and whether anything was cut.
 */
function boundedText(
	value: string,
	maximum: number,
	fallback: string,
): { readonly value: string; readonly truncated: boolean } {
	const suffix = "…";
	const characters: { readonly value: string; readonly bytes: number }[] = [];
	let bytes = 0;
	let sawVisible = false;
	let truncated = false;
	for (const character of value) {
		if (character === "\0") {
			continue;
		}
		sawVisible = true;
		const characterBytes = textEncoder.encode(character).byteLength;
		if (bytes + characterBytes > maximum) {
			truncated = true;
			break;
		}
		characters.push({ value: character, bytes: characterBytes });
		bytes += characterBytes;
	}
	if (!sawVisible) {
		return { value: fallback, truncated: false };
	}
	const text = characters.map(({ value: character }) => character).join("");
	if (!truncated) {
		return { value: text, truncated: false };
	}
	return { value: `${trimmedForSuffix(characters, bytes, maximum)}${suffix}`, truncated: true };
}

/**
 * As much of what was kept as leaves room for the ellipsis, dropped one
 * character at a time so a multi-byte one is never cut in half.
 * @param characters What was kept, with each one's byte length.
 * @param keptBytes How many bytes they take.
 * @param maximum The byte bound, ellipsis included.
 * @returns The text that fits.
 */
function trimmedForSuffix(
	characters: { readonly value: string; readonly bytes: number }[],
	keptBytes: number,
	maximum: number,
): string {
	const suffixBytes = textEncoder.encode("…").byteLength;
	let bytes = keptBytes;
	while (characters.length > 0 && bytes + suffixBytes > maximum) {
		bytes -= characters.pop()?.bytes ?? 0;
	}
	return characters.map(({ value: character }) => character).join("");
}

/**
 * One line of text, with every run of whitespace reduced to a single space.
 * @param value The text.
 * @returns The single line.
 */
function normalizedText(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

/**
 * One bounded line of text, for a summary the browser shows on one row.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @returns The bounded line.
 */
function boundedNormalizedText(value: string, maximum: number): string {
	return normalizedText(boundedText(value, maximum, "").value);
}

/**
 * What the person said in one turn, taken from the first text part of their
 * message: a message that is all media says so, and one with nothing at all
 * says nothing.
 * @param item The item.
 * @returns The text, and whether reading it was cut short.
 */
function userText(item: SessionThreadItem): {
	readonly value: string | null;
	readonly truncated: boolean;
} {
	if (item.type !== "userMessage") {
		return { value: null, truncated: false };
	}
	const scanTruncated = item.content.length > TIMELINE_REASONING_PART_LIMIT;
	const said = firstSaidText(item.content.slice(0, TIMELINE_REASONING_PART_LIMIT));
	if (said !== null) {
		return { value: said.value, truncated: scanTruncated || said.truncated };
	}
	return { value: item.content.length === 0 ? null : "[media]", truncated: scanTruncated };
}

/**
 * The first text part of a message that says anything.
 * @param content The message's parts, within the scan bound.
 * @returns The text, and whether it was cut, or null when none says anything.
 */
function firstSaidText(
	content: readonly Extract<
		SessionThreadItem,
		{ readonly type: "userMessage" }
	>["content"][number][],
): { readonly value: string; readonly truncated: boolean } | null {
	for (const part of content) {
		if (part.type !== "text") {
			continue;
		}
		const bounded = boundedText(part.text, TIMELINE_SUMMARY_LIMIT, "");
		const text = normalizedText(bounded.value);
		if (text.length > 0) {
			return { value: text, truncated: bounded.truncated };
		}
	}
	return null;
}

/**
 * What the assistant said in one turn, for the turn's summary line.
 * @param item The item.
 * @returns The text, or null when the item is not an assistant message.
 */
function assistantText(item: SessionThreadItem): string | null {
	if (item.type !== "agentMessage") {
		return null;
	}
	const text = boundedNormalizedText(item.text, TIMELINE_SUMMARY_LIMIT);
	return text.length === 0 ? null : text;
}

/**
 * What one reasoning item says: its summary where it has one, and otherwise
 * its content, bounded in both length and number of parts.
 * @param item The reasoning item.
 * @returns The text, and whether anything was left out.
 */
function reasoningText(item: Extract<SessionThreadItem, { readonly type: "reasoning" }>): {
	readonly value: string;
	readonly truncated: boolean;
} {
	const values = item.summary.length > 0 ? item.summary : item.content;
	const parts: string[] = [];
	let truncated = values.length > TIMELINE_REASONING_PART_LIMIT;
	for (let index = 0; index < Math.min(values.length, TIMELINE_REASONING_PART_LIMIT); index += 1) {
		const value = values[index];
		if (value === undefined) {
			continue;
		}
		const part = boundedNormalizedText(value, TIMELINE_TEXT_LIMIT);
		if (part.length > 0) {
			parts.push(part);
		}
	}
	const bounded = boundedText(parts.join("\n"), TIMELINE_TEXT_LIMIT, "Reasoning");
	return { value: bounded.value, truncated: truncated || bounded.truncated };
}

type ProjectedItem = {
	readonly item: CodexTimelineItemProjectionInput | null;
	readonly truncated: boolean;
};

/**
 * One thread item as the browser shows it, or nothing for an item this
 * projection does not present.
 * @param item The item.
 * @returns The projected item, and whether anything was cut.
 */
function projectItem(item: SessionThreadItem): ProjectedItem {
	const projector = ITEM_PROJECTORS[item.type];
	return projector === undefined ? { item: null, truncated: false } : projector(item);
}

/** One projector per item type the browser shows; anything else is not shown. */
const ITEM_PROJECTORS: Partial<
	Record<SessionThreadItem["type"], (item: SessionThreadItem) => ProjectedItem>
> = {
	/**
	 * What the assistant said.
	 * @param item The item.
	 * @returns The projected item.
	 */
	agentMessage: (item) => {
		if (item.type !== "agentMessage") return { item: null, truncated: false };
		const text = boundedText(item.text, TIMELINE_TEXT_LIMIT, "Assistant message");
		return {
			item: { kind: "agent_message", item: { type: item.type, id: item.id, text: text.value } },
			truncated: text.truncated,
		};
	},
	/**
	 * A tool an MCP server ran.
	 * @param item The item.
	 * @returns The projected item.
	 */
	mcpToolCall: (item) => projectToolCall(item),
	/**
	 * A tool this workbench registered.
	 * @param item The item.
	 * @returns The projected item.
	 */
	dynamicToolCall: (item) => projectToolCall(item),
	/**
	 * A command the agent ran.
	 * @param item The item.
	 * @returns The projected item.
	 */
	commandExecution: (item) => {
		if (item.type !== "commandExecution") return { item: null, truncated: false };
		const command = boundedText(item.command, TIMELINE_TEXT_LIMIT, "Command");
		return {
			item: {
				kind: "command_execution",
				item: { type: item.type, id: item.id, command: command.value, status: item.status },
			},
			truncated: command.truncated,
		};
	},
	/**
	 * A file the agent changed.
	 * @param item The item.
	 * @returns The projected item.
	 */
	fileChange: (item) => {
		if (item.type !== "fileChange") return { item: null, truncated: false };
		return {
			item: { kind: "file_change", item: { type: item.type, id: item.id, status: item.status } },
			truncated: false,
		};
	},
	/**
	 * What the agent was reasoning about.
	 * @param item The item.
	 * @returns The projected item.
	 */
	reasoning: (item) => {
		if (item.type !== "reasoning") return { item: null, truncated: false };
		const text = reasoningText(item);
		return {
			item: { kind: "reasoning_summary", item: { type: item.type, id: item.id }, text: text.value },
			truncated: text.truncated,
		};
	},
	/**
	 * The plan the agent is working to.
	 * @param item The item.
	 * @returns The projected item.
	 */
	plan: (item) => {
		if (item.type !== "plan") return { item: null, truncated: false };
		const text = boundedText(item.text, TIMELINE_TEXT_LIMIT, "Plan");
		return {
			item: { kind: "plan", item: { type: item.type, id: item.id, text: text.value } },
			truncated: text.truncated,
		};
	},
};

/**
 * One tool call, whichever owner registered the tool.
 * @param item The item.
 * @returns The projected item.
 */
function projectToolCall(item: SessionThreadItem): ProjectedItem {
	if (item.type !== "mcpToolCall" && item.type !== "dynamicToolCall") {
		return { item: null, truncated: false };
	}
	const name = boundedText(item.tool, TIMELINE_TOOL_LIMIT, "Tool call");
	return {
		item: {
			kind: "tool_call",
			item: { type: item.type, id: item.id, tool: name.value, status: item.status },
		},
		truncated: name.truncated,
	};
}

type TimelineApprovalState = Extract<
	CodexTimelineItemProjectionInput,
	{ readonly kind: "approval_request" }
>["state"];

/**
 * The state the browser shows an approval in. A staged approval is not shown
 * at all: nothing has been asked of anybody yet.
 * @param view The approval.
 * @returns The state, or null when it is not shown.
 */
function approvalState(view: TimelineApprovalView): TimelineApprovalState | null {
	switch (view.snapshot.state) {
		case "staged":
			return null;
		case "pending":
			return "pending";
		case "settled":
			return "settled";
		default:
			return "cancelled";
	}
}

/**
 * The approval one item carries, when this approval is that item's own.
 * @param view The approval.
 * @param threadId The thread being projected.
 * @param turnId The turn.
 * @param itemId The item.
 * @returns The projected approval, or null when it belongs elsewhere.
 */
function approvalFor(
	view: TimelineApprovalView,
	threadId: ThreadId,
	turnId: SessionTurn["id"],
	itemId: SessionThreadItem["id"],
): CodexTimelineItemProjectionInput | null {
	const state = approvalState(view);
	const approvalId = view.snapshot.approvalId;
	if (
		state === null ||
		view.snapshot.threadId !== threadId ||
		view.snapshot.turnId !== turnId ||
		view.snapshot.itemId !== itemId ||
		approvalId === null
	) {
		return null;
	}
	return {
		kind: "approval_request",
		identity: { kind: "item", threadId, turnId, itemId, approvalId },
		state,
	};
}

/**
 * One turn as the timeline retains it: its items within the per-turn bound,
 * and a summary line naming what each side said.
 * @param turn The turn.
 * @param maxItems How many items it may keep.
 * @returns The retained turn.
 */
function projectTurnData(turn: SessionTurn, maxItems: number): TimelineTurnData {
	const itemCount = Math.min(turn.items.length, maxItems);
	const sources = turn.items.slice(0, itemCount);
	const said = turnSaid(sources);
	const items = sources.map((source) => {
		const projected = projectItem(source);
		return { itemId: source.id, item: projected.item, truncated: projected.truncated };
	});
	const cut = [
		turn.itemsView !== "full",
		turn.items.length > itemCount,
		said.truncated,
		items.some((item) => item.truncated),
	];
	const truncated = cut.includes(true);
	const summary = boundedText(
		`${turn.status} · user: ${said.user ?? "none"} · assistant: ${said.assistant ?? "none"}`,
		TIMELINE_SUMMARY_LIMIT,
		`Codex turn (${turn.status})`,
	);
	return {
		turn: { id: turn.id, status: turn.status },
		items: items.map(({ itemId, item }) => ({ itemId, item })),
		presentation: {
			summary: summary.value,
			outputs: { included: turn.itemsView === "full", truncated: truncated || summary.truncated },
		},
	};
}

/**
 * What each side said in one turn, for its summary line: the first thing the
 * person said, and the last thing the assistant said.
 * @param sources The turn's items, within the per-turn bound.
 * @returns What each side said, and whether reading it was cut short.
 */
function turnSaid(sources: readonly SessionThreadItem[]): {
	readonly user: string | null;
	readonly assistant: string | null;
	readonly truncated: boolean;
} {
	let user: string | null = null;
	let assistant: string | null = null;
	let truncated = false;
	for (const source of sources) {
		if (user === null) {
			const projectedUser = userText(source);
			user = projectedUser.value;
			truncated ||= projectedUser.truncated;
		}
		assistant = assistantText(source) ?? assistant;
	}
	return { user, assistant, truncated };
}

/**
 * One retained turn as the browser shows it, with each approval placed against
 * the item it belongs to and any that names no shown item appended after them.
 * @param threadId The thread.
 * @param turn The retained turn.
 * @param approvals Every approval the owner is presenting.
 * @param maxItems How many items the browser is shown.
 * @returns The projected turn.
 */
function projectTurn(
	threadId: ThreadId,
	turn: TimelineTurnData,
	approvals: readonly TimelineApprovalView[],
	maxItems: number,
): CodexTimelineTurnProjectionInput {
	/**
	 * Add one approval against the item it names, once.
	 * @param index Which approval it is, so it is placed only once.
	 * @param approval The approval.
	 * @param itemId The item it is placed against.
	 */
	const appendApproval = (
		index: number,
		approval: TimelineApprovalView,
		itemId: TimelineItemData["itemId"],
	): void => {
		const projected = approvalFor(approval, threadId, turn.turn.id, itemId);
		if (projected === null) {
			return;
		}
		matchedApprovals.add(index);
		append(projected);
	};
	/**
	 * Add every approval this turn carries against one of its items.
	 * @param itemId The item.
	 */
	const appendApprovalsFor = (itemId: TimelineItemData["itemId"]): void => {
		for (const [index, approval] of approvals.entries()) {
			if (matchedApprovals.has(index)) {
				continue;
			}
			appendApproval(index, approval, itemId);
		}
	};
	const items: CodexTimelineItemProjectionInput[] = [];
	const matchedApprovals = new Set<number>();
	let truncated = turn.presentation.outputs.truncated;
	/**
	 * Add one item, or mark the turn truncated once the bound is reached.
	 * @param item The item.
	 */
	const append = (item: CodexTimelineItemProjectionInput): void => {
		if (items.length >= maxItems) {
			truncated = true;
			return;
		}
		items.push(item);
	};
	for (const source of turn.items) {
		if (source.item !== null) {
			append(source.item);
		}
		appendApprovalsFor(source.itemId);
	}
	for (const [index, approval] of approvals.entries()) {
		const itemId = approval.snapshot.itemId;
		if (matchedApprovals.has(index) || itemId === null) {
			continue;
		}
		appendApproval(index, approval, itemId);
	}
	return {
		turn: turn.turn,
		items,
		presentation: {
			summary: turn.presentation.summary,
			outputs: { ...turn.presentation.outputs, truncated },
		},
	};
}

export {
	boundedText,
	projectTurn,
	projectTurnData,
	TIMELINE_CURSOR_LIMIT,
	TIMELINE_PAGE_LIMIT,
	TIMELINE_PAGE_LIMIT_MAX,
	TIMELINE_MAX_BYTES,
	TIMELINE_ITEM_LIMIT,
	textEncoder,
};
export type {
	CanvasBrowserProjectionBudget,
	TimelineApprovalView,
	TimelineData,
	TimelineItemData,
	TimelineTurnData,
};
