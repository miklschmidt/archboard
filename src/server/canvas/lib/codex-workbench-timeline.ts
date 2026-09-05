import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import type {
	CodexSession,
	SessionThreadItem,
	SessionThreadTurnPageResult,
	SessionTurn,
} from "../../../runtime/codex-session/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/server-requests.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import type {
	ThreadId,
	TrustedIdentityDecoder,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	BrowserConnectionInstance,
	CodexTimelineItemProjectionInput,
	CodexTimelineProjectionInput,
	CodexTimelineTurnProjectionInput,
} from "../../codex-workbench/index.js";
import { assertBrowserSnapshotBudget } from "../../codex-workbench/index.js";

const TIMELINE_PAGE_LIMIT = 100;
const TIMELINE_PAGE_LIMIT_MAX = 8;
const TIMELINE_ITEM_LIMIT = 256;
const TIMELINE_TEXT_LIMIT = 16_384;
const TIMELINE_TOOL_LIMIT = 256;
const TIMELINE_SUMMARY_LIMIT = 512;
const TIMELINE_CURSOR_LIMIT = 1024;
const TIMELINE_MAX_BYTES = 768 * 1024;
const TIMELINE_REASONING_PART_LIMIT = 32;
const textEncoder = new TextEncoder();

type TimelineSession = Pick<CodexSession, "threadTurnsListPage" | "timelineListPage">;

interface CanvasBrowserProjectionBudget {
	readonly maxTurns: number;
	readonly maxItemsPerTurn: number;
	/** Complete encoded BrowserSnapshot bound; the gateway performs the final fit. */
	readonly maxBytes: number;
}

const DEFAULT_BROWSER_PROJECTION_BUDGET: CanvasBrowserProjectionBudget = Object.freeze({
	maxTurns: TIMELINE_PAGE_LIMIT * TIMELINE_PAGE_LIMIT_MAX,
	maxItemsPerTurn: TIMELINE_ITEM_LIMIT,
	maxBytes: TIMELINE_MAX_BYTES,
});

type TimelineItemData = {
	readonly itemId: SessionThreadItem["id"];
	readonly item: CodexTimelineItemProjectionInput | null;
};

interface TimelineTurnData {
	readonly turn: Pick<SessionTurn, "id" | "status">;
	readonly items: readonly TimelineItemData[];
	readonly presentation: CodexTimelineTurnProjectionInput["presentation"];
}

interface TimelineData {
	readonly threadId: ThreadId;
	readonly turns: readonly TimelineTurnData[];
	readonly truncated: boolean;
	readonly cursor: string | null;
}

interface TimelinePaneState {
	readonly paneId: string;
	readonly key: string;
	readonly connection: BrowserConnectionInstance;
	readonly link: ThreadLinkSnapshot;
	ready: boolean;
	started: boolean;
	data: TimelineData | null;
	refresh: Promise<void> | null;
	dirty: boolean;
}

type TimelineApprovalView = {
	readonly snapshot: Pick<
		ApprovalOwnerView["snapshot"],
		"threadId" | "turnId" | "itemId" | "approvalId" | "state"
	>;
};

interface CanvasTimelineOwner {
	readonly read: (
		paneId: string,
		revision: number,
		link: ThreadLinkSnapshot,
		threadCapable: boolean,
		connection: BrowserConnectionInstance,
	) => CodexTimelineProjectionInput | null;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly retire: (paneId: string, connection: BrowserConnectionInstance) => void;
	readonly dispose: () => void;
}

interface CanvasTimelineOwnerOptions {
	readonly session: TimelineSession;
	readonly identity: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">;
	readonly approvals: {
		readonly inspectViews: () => readonly TimelineApprovalView[];
	};
	readonly onChange: () => void;
	readonly budget?: CanvasBrowserProjectionBudget;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(
	value: string,
	maximum: number,
	fallback: string,
): { readonly value: string; readonly truncated: boolean } {
	const suffix = "…";
	const suffixBytes = textEncoder.encode(suffix).byteLength;
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
	if (!truncated) {
		return {
			value: characters.map(({ value: character }) => character).join(""),
			truncated: false,
		};
	}
	while (characters.length > 0 && bytes + suffixBytes > maximum) {
		bytes -= characters.pop()?.bytes ?? 0;
	}
	return {
		value: `${characters.map(({ value: character }) => character).join("")}${suffix}`,
		truncated: true,
	};
}

function normalizedText(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function boundedNormalizedText(value: string, maximum: number): string {
	return normalizedText(boundedText(value, maximum, "").value);
}

function userText(item: SessionThreadItem): {
	readonly value: string | null;
	readonly truncated: boolean;
} {
	if (item.type !== "userMessage") {
		return { value: null, truncated: false };
	}
	const scanTruncated = item.content.length > TIMELINE_REASONING_PART_LIMIT;
	for (
		let index = 0;
		index < Math.min(item.content.length, TIMELINE_REASONING_PART_LIMIT);
		index += 1
	) {
		const content = item.content[index];
		if (content === undefined) {
			continue;
		}
		if (content.type !== "text") {
			continue;
		}
		const bounded = boundedText(content.text, TIMELINE_SUMMARY_LIMIT, "");
		const text = normalizedText(bounded.value);
		if (text.length > 0) {
			return { value: text, truncated: scanTruncated || bounded.truncated };
		}
	}
	return {
		value: item.content.length === 0 ? null : "[media]",
		truncated: scanTruncated,
	};
}

function assistantText(item: SessionThreadItem): string | null {
	if (item.type !== "agentMessage") {
		return null;
	}
	const text = boundedNormalizedText(item.text, TIMELINE_SUMMARY_LIMIT);
	return text.length === 0 ? null : text;
}

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

function projectItem(item: SessionThreadItem): ProjectedItem {
	switch (item.type) {
		case "agentMessage": {
			const text = boundedText(item.text, TIMELINE_TEXT_LIMIT, "Assistant message");
			return {
				item: { kind: "agent_message", item: { type: item.type, id: item.id, text: text.value } },
				truncated: text.truncated,
			};
		}
		case "mcpToolCall":
		case "dynamicToolCall": {
			const name = boundedText(item.tool, TIMELINE_TOOL_LIMIT, "Tool call");
			return {
				item: {
					kind: "tool_call",
					item: { type: item.type, id: item.id, tool: name.value, status: item.status },
				},
				truncated: name.truncated,
			};
		}
		case "commandExecution": {
			const command = boundedText(item.command, TIMELINE_TEXT_LIMIT, "Command");
			return {
				item: {
					kind: "command_execution",
					item: { type: item.type, id: item.id, command: command.value, status: item.status },
				},
				truncated: command.truncated,
			};
		}
		case "fileChange":
			return {
				item: { kind: "file_change", item: { type: item.type, id: item.id, status: item.status } },
				truncated: false,
			};
		case "reasoning": {
			const text = reasoningText(item);
			return {
				item: {
					kind: "reasoning_summary",
					item: { type: item.type, id: item.id },
					text: text.value,
				},
				truncated: text.truncated,
			};
		}
		case "plan": {
			const text = boundedText(item.text, TIMELINE_TEXT_LIMIT, "Plan");
			return {
				item: { kind: "plan", item: { type: item.type, id: item.id, text: text.value } },
				truncated: text.truncated,
			};
		}
		default:
			return { item: null, truncated: false };
	}
}

type TimelineApprovalState = Extract<
	CodexTimelineItemProjectionInput,
	{ readonly kind: "approval_request" }
>["state"];

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

function projectTurnData(turn: SessionTurn, maxItems: number): TimelineTurnData {
	const items: TimelineItemData[] = [];
	let user: string | null = null;
	let assistant: string | null = null;
	let truncated = turn.itemsView !== "full";
	const itemCount = Math.min(turn.items.length, maxItems);
	for (let index = 0; index < itemCount; index += 1) {
		const source = turn.items[index];
		if (source === undefined) {
			continue;
		}
		if (user === null) {
			const projectedUser = userText(source);
			user = projectedUser.value;
			truncated ||= projectedUser.truncated;
		}
		const nextAssistant = assistantText(source);
		if (nextAssistant !== null) {
			assistant = nextAssistant;
		}
		const projected = projectItem(source);
		truncated ||= projected.truncated;
		items.push({ itemId: source.id, item: projected.item });
	}
	if (turn.items.length > itemCount) {
		truncated = true;
	}
	const summary = boundedText(
		`${turn.status} · user: ${user ?? "none"} · assistant: ${assistant ?? "none"}`,
		TIMELINE_SUMMARY_LIMIT,
		`Codex turn (${turn.status})`,
	);
	return {
		turn: { id: turn.id, status: turn.status },
		items,
		presentation: {
			summary: summary.value,
			outputs: { included: turn.itemsView === "full", truncated: truncated || summary.truncated },
		},
	};
}

function projectTurn(
	threadId: ThreadId,
	turn: TimelineTurnData,
	approvals: readonly TimelineApprovalView[],
	maxItems: number,
): CodexTimelineTurnProjectionInput {
	const items: CodexTimelineItemProjectionInput[] = [];
	const matchedApprovals = new Set<number>();
	let truncated = turn.presentation.outputs.truncated;
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
		for (const [index, approval] of approvals.entries()) {
			if (matchedApprovals.has(index)) {
				continue;
			}
			const projected = approvalFor(approval, threadId, turn.turn.id, source.itemId);
			if (projected === null) {
				continue;
			}
			matchedApprovals.add(index);
			append(projected);
		}
	}
	for (const [index, approval] of approvals.entries()) {
		if (matchedApprovals.has(index) || approval.snapshot.itemId === null) {
			continue;
		}
		const projected = approvalFor(approval, threadId, turn.turn.id, approval.snapshot.itemId);
		if (projected === null) {
			continue;
		}
		matchedApprovals.add(index);
		append(projected);
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

function timelineBytes(
	threadId: ThreadId,
	turns: readonly CodexTimelineTurnProjectionInput[],
	cursor: string | null,
): number {
	return textEncoder.encode(JSON.stringify({ kind: "codex_timeline", threadId, turns, cursor }))
		.byteLength;
}

function markTruncated(turn: CodexTimelineTurnProjectionInput): CodexTimelineTurnProjectionInput {
	if (turn.presentation.outputs.truncated) {
		return turn;
	}
	return {
		...turn,
		presentation: {
			...turn.presentation,
			outputs: { ...turn.presentation.outputs, truncated: true },
		},
	};
}

function fitTurn(
	threadId: ThreadId,
	turns: readonly CodexTimelineTurnProjectionInput[],
	candidate: CodexTimelineTurnProjectionInput,
	cursor: string | null,
	maxBytes: number,
): CodexTimelineTurnProjectionInput | null {
	let fitted = markTruncated(candidate);
	while (
		timelineBytes(threadId, turns.concat(fitted), cursor) > maxBytes &&
		fitted.items.length > 0
	) {
		fitted = Object.assign({}, fitted, { items: fitted.items.slice(0, -1) });
	}
	return timelineBytes(threadId, turns.concat(fitted), cursor) <= maxBytes ? fitted : null;
}

/**
 * Projects the retained turns newest-first and publishes them chronologically.
 *
 * The direction matters for correctness, not presentation. A budget cut must
 * remove the *oldest* history, because the newest turn is the one every current
 * decision reads: the browser composer decides idle-versus-running from it
 * (`src/ui/workbench-composer/lib/link.ts`), and this projection is the only
 * place it can see an in-progress turn. Trimming from the tail hid a running
 * turn on any thread long enough to hit `maxTurns` or `maxBytes`, which made a
 * steer look like a fresh start. The oldest retained turn carries the
 * truncation mark, because that is where history was cut.
 */
function projectData(
	data: TimelineData,
	approvals: readonly TimelineApprovalView[],
	budget: CanvasBrowserProjectionBudget,
): CodexTimelineProjectionInput {
	const newestFirst: CodexTimelineTurnProjectionInput[] = [];
	let truncated = data.truncated || data.turns.length > budget.maxTurns;
	for (let index = data.turns.length - 1; index >= 0; index -= 1) {
		if (newestFirst.length >= budget.maxTurns) {
			truncated = true;
			break;
		}
		const source = data.turns[index];
		if (source === undefined) {
			continue;
		}
		const candidate = projectTurn(data.threadId, source, approvals, budget.maxItemsPerTurn);
		if (
			timelineBytes(data.threadId, newestFirst.concat(candidate), data.cursor) <= budget.maxBytes
		) {
			newestFirst.push(candidate);
			continue;
		}
		const fitted = fitTurn(data.threadId, newestFirst, candidate, data.cursor, budget.maxBytes);
		if (fitted !== null) {
			newestFirst.push(fitted);
		}
		truncated = true;
		break;
	}
	const turns: CodexTimelineTurnProjectionInput[] = newestFirst.toReversed();
	if (truncated && turns.length > 0) {
		turns[0] = markTruncated(turns[0]!);
		while (turns.length > 0 && timelineBytes(data.threadId, turns, data.cursor) > budget.maxBytes) {
			const oldest: CodexTimelineTurnProjectionInput = turns[0]!;
			if (oldest.items.length > 0) {
				turns[0] = { ...markTruncated(oldest), items: oldest.items.slice(0, -1) };
				continue;
			}
			turns.shift();
			if (turns.length > 0) {
				turns[0] = markTruncated(turns[0]!);
			}
		}
	}
	return { kind: "codex_timeline", threadId: data.threadId, turns, cursor: data.cursor };
}

function bindingKey(
	paneId: string,
	revision: number,
	link: ThreadLinkSnapshot,
	threadCapable: boolean,
): string {
	return JSON.stringify([
		paneId,
		revision,
		link.state,
		link.childId,
		link.epoch,
		link.threadId,
		link.status,
		link.loaded,
		link.canAcceptDirectInput,
		threadCapable,
	]);
}

function eventThreadId(event: TransportServerNotification): string | null {
	const params = event.notification.params;
	if (isRecord(params) && typeof params.threadId === "string") {
		return params.threadId;
	}
	if (
		event.notification.method === "thread/started" &&
		isRecord(params) &&
		isRecord(params.thread) &&
		typeof params.thread["id"] === "string"
	) {
		return params.thread["id"];
	}
	return null;
}

function eventMatchesThread(
	eventId: string | null,
	threadId: ThreadId,
	identity: CanvasTimelineOwnerOptions["identity"],
): boolean {
	return (
		eventId !== null &&
		(eventId === threadId || eventId === identity.serializeCodexIdentity(threadId))
	);
}

function isTimelineNotification(method: string): boolean {
	return (
		(method.startsWith("thread/") && !method.startsWith("thread/realtime/")) ||
		method.startsWith("turn/") ||
		method.startsWith("item/")
	);
}

/**
 * Reads the thread's turns newest-first and returns them chronologically.
 *
 * `desc` is what makes the budget safe: the ingestion budget stops at whatever
 * is retained, so it must stop at the *oldest* end. Reading `asc` dropped the
 * newest turns on a long thread — including a turn still in progress — and it
 * also read every page before discarding most of them. Paging from the newest
 * end reads strictly fewer pages for the same retained bytes.
 */
async function readTurnPages(
	session: TimelineSession,
	threadId: ThreadId,
	budget: CanvasBrowserProjectionBudget,
): Promise<{ readonly turns: readonly TimelineTurnData[]; readonly truncated: boolean }> {
	const newestFirst: TimelineTurnData[] = [];
	const seenCursors = new Set<string>();
	let retainedBytes = timelineBytes(threadId, [], "x".repeat(TIMELINE_CURSOR_LIMIT));
	let cursor: string | null = null;
	const settled = (
		truncated: boolean,
	): { readonly turns: readonly TimelineTurnData[]; readonly truncated: boolean } => ({
		turns: newestFirst.toReversed(),
		truncated,
	});
	for (let pageNumber = 0; pageNumber < TIMELINE_PAGE_LIMIT_MAX; pageNumber += 1) {
		const page: SessionThreadTurnPageResult = await session.threadTurnsListPage({
			threadId,
			cursor,
			limit: TIMELINE_PAGE_LIMIT,
			sortDirection: "desc",
			itemsView: "full",
		});
		const nextCursor = boundedCursor(page.nextCursor);
		for (const turn of page.data) {
			if (newestFirst.length >= budget.maxTurns) {
				return settled(true);
			}
			const projected = projectTurnData(turn, budget.maxItemsPerTurn);
			const projectedBytes = textEncoder.encode(JSON.stringify(projected)).byteLength;
			const nextBytes = retainedBytes + projectedBytes + (newestFirst.length === 0 ? 0 : 1);
			if (nextBytes > budget.maxBytes) {
				return settled(true);
			}
			newestFirst.push(projected);
			retainedBytes = nextBytes;
		}
		if (nextCursor === null) {
			return settled(false);
		}
		// Stop before fetching history the budget has already spent.
		if (newestFirst.length >= budget.maxTurns) {
			return settled(true);
		}
		if (nextCursor === cursor || seenCursors.has(nextCursor)) {
			throw new Error("The Codex timeline turn cursor repeated before its bound.");
		}
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	return settled(true);
}

function boundedCursor(cursor: string | null): string | null {
	if (cursor === null) {
		return null;
	}
	if (cursor.includes("\0") || textEncoder.encode(cursor).byteLength > TIMELINE_CURSOR_LIMIT) {
		throw new Error("The Codex timeline cursor exceeds its browser bound.");
	}
	return cursor;
}

function boundedBudgetValue(value: number | undefined, fallback: number, maximum: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? Math.min(value, maximum)
		: fallback;
}

function createCanvasBrowserProjectionBudget(
	input: Partial<CanvasBrowserProjectionBudget> = {},
): CanvasBrowserProjectionBudget {
	const maxBytes = input.maxBytes ?? DEFAULT_BROWSER_PROJECTION_BUDGET.maxBytes;
	assertBrowserSnapshotBudget(maxBytes);
	const budget = Object.freeze({
		maxTurns: boundedBudgetValue(
			input?.maxTurns,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxTurns,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxTurns,
		),
		maxItemsPerTurn: boundedBudgetValue(
			input?.maxItemsPerTurn,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxItemsPerTurn,
			DEFAULT_BROWSER_PROJECTION_BUDGET.maxItemsPerTurn,
		),
		maxBytes,
	});
	return budget;
}

function createCanvasTimelineOwner(options: CanvasTimelineOwnerOptions): CanvasTimelineOwner {
	const states = new Map<string, Map<BrowserConnectionInstance, TimelinePaneState>>();
	const budget = createCanvasBrowserProjectionBudget(options.budget);
	let disposed = false;
	const isCurrent = (state: TimelinePaneState): boolean =>
		states.get(state.paneId)?.get(state.connection) === state;

	const refresh = (state: TimelinePaneState): void => {
		if (disposed || !state.ready || state.link.threadId === null || state.refresh !== null) {
			return;
		}
		state.started = true;
		state.dirty = false;
		const threadId = state.link.threadId;
		const load = (async (): Promise<TimelineData> => {
			const turns = await readTurnPages(options.session, threadId, budget);
			const timeline = await options.session.timelineListPage({
				threadId,
				cursor: null,
				limit: TIMELINE_PAGE_LIMIT,
			});
			return {
				threadId,
				turns: turns.turns,
				truncated: turns.truncated,
				cursor: boundedCursor(timeline.nextCursor),
			};
		})();
		state.refresh = load.then(
			(data) => {
				state.refresh = null;
				if (disposed || !isCurrent(state)) {
					return undefined;
				}
				state.data = data;
				options.onChange();
				if (state.dirty) {
					refresh(state);
				}
				return undefined;
			},
			() => {
				state.refresh = null;
				if (disposed || !isCurrent(state)) {
					return undefined;
				}
				if (state.dirty) {
					refresh(state);
				}
				return undefined;
			},
		);
	};

	const read: CanvasTimelineOwner["read"] = (
		paneId,
		revision,
		link,
		threadCapable,
		connection,
	): CodexTimelineProjectionInput | null => {
		const key = bindingKey(paneId, revision, link, threadCapable);
		let paneStates = states.get(paneId);
		if (paneStates === undefined) {
			paneStates = new Map();
			states.set(paneId, paneStates);
		}
		let state = paneStates.get(connection);
		if (state?.key !== key) {
			state = {
				paneId,
				key,
				connection,
				link,
				ready: threadCapable,
				started: false,
				data: null,
				refresh: null,
				dirty: false,
			};
			paneStates.set(connection, state);
		} else {
			state.ready = threadCapable;
		}
		if (state.ready && state.link.threadId !== null && !state.started) {
			refresh(state);
		}
		return state.data === null || !state.ready
			? null
			: projectData(state.data, options.approvals.inspectViews(), budget);
	};

	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || !isTimelineNotification(event.notification.method)) {
			return;
		}
		const threadId = eventThreadId(event);
		for (const paneStates of states.values()) {
			for (const state of paneStates.values()) {
				if (
					!state.ready ||
					state.link.threadId === null ||
					!eventMatchesThread(threadId, state.link.threadId, options.identity) ||
					(state.link.childId !== null &&
						(event.correlation.child !== state.link.childId ||
							event.correlation.epoch !== state.link.epoch))
				) {
					continue;
				}
				state.dirty = true;
				refresh(state);
			}
		}
	};

	const retire = (paneId: string, connection: BrowserConnectionInstance): void => {
		const paneStates = states.get(paneId);
		const state = paneStates?.get(connection);
		if (state === undefined || paneStates === undefined) {
			return;
		}
		state.ready = false;
		state.dirty = false;
		state.data = null;
		state.refresh = null;
		paneStates.delete(connection);
		if (paneStates.size === 0) {
			states.delete(paneId);
		}
	};

	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		states.clear();
	};

	return Object.freeze({ read, onNotification, retire, dispose });
}

export {
	type CanvasBrowserProjectionBudget,
	type CanvasTimelineOwner,
	type CanvasTimelineOwnerOptions,
	createCanvasBrowserProjectionBudget,
	createCanvasTimelineOwner,
};
