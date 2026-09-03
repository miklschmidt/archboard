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
	CodexTimelineItemProjectionInput,
	CodexTimelineProjectionInput,
	CodexTimelineTurnProjectionInput,
} from "../../codex-workbench/index.js";

const TIMELINE_PAGE_LIMIT = 100;
const TIMELINE_PAGE_LIMIT_MAX = 8;
const TIMELINE_TURN_LIMIT = TIMELINE_PAGE_LIMIT * TIMELINE_PAGE_LIMIT_MAX;
const TIMELINE_ITEM_LIMIT = 256;
const TIMELINE_TEXT_LIMIT = 16_384;
const TIMELINE_TOOL_LIMIT = 256;
const TIMELINE_SUMMARY_LIMIT = 512;
const TIMELINE_CURSOR_LIMIT = 1024;
const textEncoder = new TextEncoder();

type TimelineSession = Pick<CodexSession, "threadTurnsListPage"> &
	Partial<Pick<CodexSession, "timelineListPage">>;

interface TimelineData {
	readonly threadId: ThreadId;
	readonly turns: readonly SessionTurn[];
	readonly cursor: string | null;
}

interface TimelinePaneState {
	readonly paneId: string;
	readonly key: string;
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

export interface CanvasTimelineOwner {
	readonly read: (
		paneId: string,
		revision: number,
		link: ThreadLinkSnapshot,
		threadCapable: boolean,
	) => CodexTimelineProjectionInput | null;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly dispose: () => void;
}

export interface CanvasTimelineOwnerOptions {
	readonly session: TimelineSession;
	readonly identity: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">;
	readonly approvals: {
		readonly inspectViews: () => readonly TimelineApprovalView[];
	};
	readonly onChange: () => void;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(
	value: string,
	maximum: number,
	fallback: string,
): { readonly value: string; readonly truncated: boolean } {
	const clean = value.replaceAll("\0", "");
	if (clean.length === 0) return { value: fallback, truncated: false };
	if (textEncoder.encode(clean).byteLength <= maximum) return { value: clean, truncated: false };
	const suffix = "…";
	const budget = maximum - textEncoder.encode(suffix).byteLength;
	const characters: string[] = [];
	let bytes = 0;
	for (const character of clean) {
		const characterBytes = textEncoder.encode(character).byteLength;
		if (bytes + characterBytes > budget) break;
		characters.push(character);
		bytes += characterBytes;
	}
	return { value: `${characters.join("")}${suffix}`, truncated: true };
}

function normalizedText(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function userText(item: SessionThreadItem): string | null {
	if (item.type !== "userMessage") return null;
	for (const content of item.content) {
		if (content.type !== "text") continue;
		const text = normalizedText(content.text);
		if (text.length > 0) return text;
	}
	return item.content.length === 0 ? null : "[media]";
}

function assistantText(item: SessionThreadItem): string | null {
	if (item.type !== "agentMessage") return null;
	const text = normalizedText(item.text);
	return text.length === 0 ? null : text;
}

function reasoningText(item: Extract<SessionThreadItem, { readonly type: "reasoning" }>): string {
	const values = item.summary.length > 0 ? item.summary : item.content;
	return values
		.map(normalizedText)
		.filter((value) => value.length > 0)
		.join("\n");
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
			const text = boundedText(reasoningText(item), TIMELINE_TEXT_LIMIT, "Reasoning");
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
	)
		return null;
	return {
		kind: "approval_request",
		identity: { kind: "item", threadId, turnId, itemId, approvalId },
		state,
	};
}

function turnSummary(
	turn: SessionTurn,
	truncated: boolean,
): { readonly value: string; readonly truncated: boolean } {
	let user: string | null = null;
	let assistant: string | null = null;
	for (const item of turn.items) {
		if (user === null) user = userText(item);
		const next = assistantText(item);
		if (next !== null) assistant = next;
	}
	const summary = boundedText(
		`${turn.status} · user: ${user ?? "none"} · assistant: ${assistant ?? "none"}`,
		TIMELINE_SUMMARY_LIMIT,
		`Codex turn (${turn.status})`,
	);
	return { value: summary.value, truncated: truncated || summary.truncated };
}

function projectTurn(
	threadId: ThreadId,
	turn: SessionTurn,
	approvals: readonly TimelineApprovalView[],
): CodexTimelineTurnProjectionInput {
	const items: CodexTimelineItemProjectionInput[] = [];
	const matchedApprovals = new Set<number>();
	let truncated = turn.itemsView !== "full";
	for (const item of turn.items.slice(0, TIMELINE_ITEM_LIMIT)) {
		const projected = projectItem(item);
		truncated ||= projected.truncated;
		if (projected.item !== null) items.push(projected.item);
		for (const [index, approval] of approvals.entries()) {
			if (matchedApprovals.has(index)) continue;
			const projectedApproval = approvalFor(approval, threadId, turn.id, item.id);
			if (projectedApproval === null) continue;
			matchedApprovals.add(index);
			items.push(projectedApproval);
		}
	}
	if (turn.items.length > TIMELINE_ITEM_LIMIT) truncated = true;
	for (const [index, approval] of approvals.entries()) {
		if (matchedApprovals.has(index) || approval.snapshot.itemId === null) continue;
		const projectedApproval = approvalFor(approval, threadId, turn.id, approval.snapshot.itemId);
		if (projectedApproval !== null) {
			matchedApprovals.add(index);
			items.push(projectedApproval);
		}
	}
	const summary = turnSummary(turn, truncated);
	return {
		turn: { id: turn.id, status: turn.status },
		items,
		presentation: {
			summary: summary.value,
			outputs: { included: turn.itemsView === "full", truncated: summary.truncated },
		},
	};
}

function projectData(
	data: TimelineData,
	approvals: readonly TimelineApprovalView[],
): CodexTimelineProjectionInput {
	return {
		kind: "codex_timeline",
		threadId: data.threadId,
		turns: data.turns.map((turn) => projectTurn(data.threadId, turn, approvals)),
		cursor: data.cursor,
	};
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
	if (isRecord(params) && typeof params.threadId === "string") return params.threadId;
	if (
		event.notification.method === "thread/started" &&
		isRecord(params) &&
		isRecord(params.thread) &&
		typeof params.thread.id === "string"
	)
		return params.thread.id;
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

async function readTurnPages(
	session: TimelineSession,
	threadId: ThreadId,
): Promise<{ readonly turns: readonly SessionTurn[]; readonly cursor: string | null }> {
	const turns: SessionTurn[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	for (let pageNumber = 0; pageNumber < TIMELINE_PAGE_LIMIT_MAX; pageNumber += 1) {
		const page: SessionThreadTurnPageResult = await session.threadTurnsListPage({
			threadId,
			cursor,
			limit: TIMELINE_PAGE_LIMIT,
			sortDirection: "asc",
			itemsView: "full",
		});
		const nextCursor = boundedCursor(page.nextCursor);
		const remaining = TIMELINE_TURN_LIMIT - turns.length;
		turns.push(...page.data.slice(0, Math.max(remaining, 0)));
		if (nextCursor === null || turns.length >= TIMELINE_TURN_LIMIT)
			return { turns, cursor: nextCursor };
		if (nextCursor === cursor || seenCursors.has(nextCursor))
			throw new Error("The Codex timeline turn cursor repeated before its bound.");
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	return { turns, cursor };
}

function boundedCursor(cursor: string | null): string | null {
	if (cursor === null) return null;
	if (cursor.includes("\0") || textEncoder.encode(cursor).byteLength > TIMELINE_CURSOR_LIMIT)
		throw new Error("The Codex timeline cursor exceeds its browser bound.");
	return cursor;
}

export function createCanvasTimelineOwner(
	options: CanvasTimelineOwnerOptions,
): CanvasTimelineOwner {
	const states = new Map<string, TimelinePaneState>();
	let disposed = false;

	const refresh = (state: TimelinePaneState): void => {
		if (disposed || !state.ready || state.link.threadId === null || state.refresh !== null) return;
		state.started = true;
		state.dirty = false;
		const threadId = state.link.threadId;
		const load = (async (): Promise<TimelineData> => {
			const turns = await readTurnPages(options.session, threadId);
			const cursorPage = options.session.timelineListPage;
			const timeline =
				cursorPage === undefined
					? null
					: await cursorPage({ threadId, cursor: null, limit: TIMELINE_PAGE_LIMIT });
			return {
				threadId,
				turns: turns.turns,
				cursor: boundedCursor(timeline?.nextCursor ?? turns.cursor),
			};
		})();
		state.refresh = load.then(
			(data) => {
				state.refresh = null;
				if (disposed || states.get(state.paneId) !== state) return undefined;
				state.data = data;
				options.onChange();
				if (state.dirty) refresh(state);
				return undefined;
			},
			() => {
				state.refresh = null;
				if (disposed || states.get(state.paneId) !== state) return undefined;
				if (state.dirty) refresh(state);
				return undefined;
			},
		);
	};

	const read: CanvasTimelineOwner["read"] = (
		paneId,
		revision,
		link,
		threadCapable,
	): CodexTimelineProjectionInput | null => {
		const key = bindingKey(paneId, revision, link, threadCapable);
		let state = states.get(paneId);
		if (state?.key !== key) {
			state = {
				paneId,
				key,
				link,
				ready: threadCapable,
				started: false,
				data: null,
				refresh: null,
				dirty: false,
			};
			states.set(paneId, state);
		} else {
			state.ready = threadCapable;
		}
		if (state.ready && state.link.threadId !== null && !state.started) refresh(state);
		return state.data === null || !state.ready
			? null
			: projectData(state.data, options.approvals.inspectViews());
	};

	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || !isTimelineNotification(event.notification.method)) return;
		const threadId = eventThreadId(event);
		for (const state of states.values()) {
			if (
				!state.ready ||
				state.link.threadId === null ||
				!eventMatchesThread(threadId, state.link.threadId, options.identity) ||
				(state.link.childId !== null &&
					(event.correlation.child !== state.link.childId ||
						event.correlation.epoch !== state.link.epoch))
			)
				continue;
			state.dirty = true;
			refresh(state);
		}
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		states.clear();
	};

	return Object.freeze({ read, onNotification, dispose });
}
