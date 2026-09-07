import type { CodexSession, SessionThreadTurnPageResult } from "@/runtime/codex-session";
import type { TransportServerNotification } from "@/runtime/codex-transport/server-requests";
import type { ThreadLinkSnapshot } from "@/runtime/codex-thread-link";
import type { ThreadId, TrustedIdentityDecoder } from "@/shared/codex-workbench-identity";
import type {
	BrowserConnectionInstance,
	CodexTimelineProjectionInput,
} from "@/server/codex-workbench";
import {
	projectTurnData,
	textEncoder,
	TIMELINE_CURSOR_LIMIT,
	TIMELINE_PAGE_LIMIT,
	TIMELINE_PAGE_LIMIT_MAX,
	type CanvasBrowserProjectionBudget,
	type TimelineApprovalView,
	type TimelineData,
	type TimelineTurnData,
} from "@/server/canvas/lib/codex-timeline-projection";
import {
	createCanvasBrowserProjectionBudget,
	projectData,
	timelineBytes,
} from "@/server/canvas/lib/codex-timeline-budget";

/** The two session reads one timeline is built from. */
type TimelineSession = Pick<CodexSession, "threadTurnsListPage" | "timelineListPage">;

/** One pane's timeline: which link it is bound to, and what it has read. */
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

/** Reads each pane's thread history and keeps it current. */
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

/** What a timeline owner reads from, and who it tells about changes. */
interface CanvasTimelineOwnerOptions {
	readonly session: TimelineSession;
	readonly identity: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">;
	readonly approvals: {
		readonly inspectViews: () => readonly TimelineApprovalView[];
	};
	readonly onChange: () => void;
	readonly budget?: CanvasBrowserProjectionBudget;
}

/**
 * Whether a value is a plain object that can be read by key.
 * @param value Anything a notification carried.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The key one pane's timeline is retained under: everything about its link
 * that would make the history it read the wrong history.
 * @param paneId The pane.
 * @param revision Its link revision.
 * @param link The link.
 * @param threadCapable Whether the workbench can serve threads yet.
 * @returns The key.
 */
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

/**
 * The thread one notification is about, read from its parameters or, for a
 * thread that has just started, from the thread it carries.
 * @param event The notification.
 * @returns The thread as the wire spells it, or null.
 */
function eventThreadId(event: TransportServerNotification): string | null {
	const params = event.notification.params;
	if (!isRecord(params)) {
		return null;
	}
	if (typeof params["threadId"] === "string") {
		return params["threadId"];
	}
	return event.notification.method === "thread/started" ? startedThreadId(params) : null;
}

/**
 * The thread a thread/started notification carries.
 * @param params The notification's parameters.
 * @returns The thread as the wire spells it, or null.
 */
function startedThreadId(params: Readonly<Record<string, unknown>>): string | null {
	const thread = params["thread"];
	if (!isRecord(thread) || typeof thread["id"] !== "string") {
		return null;
	}
	return thread["id"];
}

/**
 * Whether a notification is about one pane's own thread, comparing both the
 * decoded identity and the wire spelling of it.
 * @param eventId The thread the notification named.
 * @param threadId The pane's thread.
 * @param identity How a thread is spelled on the wire.
 * @returns True when they are the same thread.
 */
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

/**
 * Whether a notification could change what a timeline shows. Realtime thread
 * notifications are the voice session's, not the timeline's.
 * @param method The notification's method.
 * @returns True when the timeline may need re-reading.
 */
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
 * @param session What the pages are read from.
 * @param threadId The thread.
 * @param budget What the browser may be shown.
 * @returns The turns, oldest first, and whether reading stopped short.
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
	/**
	 * The pages read so far, in the order the browser shows them.
	 * @param truncated Whether reading stopped short of the whole thread.
	 * @returns The turns and that fact.
	 */
	const settled = (
		truncated: boolean,
	): { readonly turns: readonly TimelineTurnData[]; readonly truncated: boolean } => ({
		turns: newestFirst.toReversed(),
		truncated,
	});
	for (let pageNumber = 0; pageNumber < TIMELINE_PAGE_LIMIT_MAX; pageNumber += 1) {
		// oxlint-disable-next-line no-await-in-loop -- pages are read newest-first, each cursor coming from the page before it
		const page: SessionThreadTurnPageResult = await session.threadTurnsListPage({
			threadId,
			cursor,
			limit: TIMELINE_PAGE_LIMIT,
			sortDirection: "desc",
			itemsView: "full",
		});
		const nextCursor = boundedCursor(page.nextCursor);
		const kept = keepPage(page.data, newestFirst, retainedBytes, budget);
		retainedBytes = kept.retainedBytes;
		if (kept.full) {
			return settled(true);
		}
		if (nextCursor === null) {
			return settled(false);
		}
		// Stop before fetching history the budget has already spent.
		if (newestFirst.length >= budget.maxTurns) {
			return settled(true);
		}
		cursor = advanceCursor(nextCursor, cursor, seenCursors);
	}
	return settled(true);
}

/**
 * The cursor the next page is read from, refusing one that would read a page
 * this walk has already read: a repeating cursor is a paging fault, not an
 * end.
 * @param nextCursor What the page answered with.
 * @param cursor The cursor that page was read from.
 * @param seenCursors The cursors already followed; added to.
 * @returns The next cursor.
 */
function advanceCursor(
	nextCursor: string,
	cursor: string | null,
	seenCursors: Set<string>,
): string {
	if (nextCursor === cursor || seenCursors.has(nextCursor)) {
		throw new Error("The Codex timeline turn cursor repeated before its bound.");
	}
	seenCursors.add(nextCursor);
	return nextCursor;
}

/**
 * Keep as much of one page as the turn and byte budgets allow.
 * @param page The page's turns, newest first.
 * @param newestFirst What has been kept so far; appended to.
 * @param retainedBytes How many bytes those take.
 * @param budget What the browser may be shown.
 * @returns The bytes now retained, and whether the budget is spent.
 */
function keepPage(
	page: readonly Parameters<typeof projectTurnData>[0][],
	newestFirst: TimelineTurnData[],
	retainedBytes: number,
	budget: CanvasBrowserProjectionBudget,
): { readonly retainedBytes: number; readonly full: boolean } {
	let bytes = retainedBytes;
	for (const turn of page) {
		if (newestFirst.length >= budget.maxTurns) {
			return { retainedBytes: bytes, full: true };
		}
		const projected = projectTurnData(turn, budget.maxItemsPerTurn);
		const projectedBytes = textEncoder.encode(JSON.stringify(projected)).byteLength;
		const nextBytes = bytes + projectedBytes + (newestFirst.length === 0 ? 0 : 1);
		if (nextBytes > budget.maxBytes) {
			return { retainedBytes: bytes, full: true };
		}
		newestFirst.push(projected);
		bytes = nextBytes;
	}
	return { retainedBytes: bytes, full: false };
}

/**
 * A paging cursor the browser can carry, refusing one that is too long or
 * carries a null character.
 * @param cursor The cursor, when there is one.
 * @returns The cursor, or null.
 */
function boundedCursor(cursor: string | null): string | null {
	if (cursor === null) {
		return null;
	}
	if (cursor.includes("\0") || textEncoder.encode(cursor).byteLength > TIMELINE_CURSOR_LIMIT) {
		throw new Error("The Codex timeline cursor exceeds its browser bound.");
	}
	return cursor;
}

/**
 * Own each pane's view of its thread's history: read it when the pane binds,
 * re-read it when something about that thread changes, and project it within
 * the browser's budget.
 * @param options What it reads from, and who it tells.
 * @returns The owner.
 */
function createCanvasTimelineOwner(options: CanvasTimelineOwnerOptions): CanvasTimelineOwner {
	const states = new Map<string, Map<BrowserConnectionInstance, TimelinePaneState>>();
	const budget = createCanvasBrowserProjectionBudget(options.budget);
	let disposed = false;
	/**
	 * Whether one retained timeline is still the pane's own, which a rebind or a
	 * replaced socket ends.
	 * @param state The retained timeline.
	 * @returns True when it is current.
	 */
	const isCurrent = (state: TimelinePaneState): boolean =>
		states.get(state.paneId)?.get(state.connection) === state;

	/**
	 * Re-read one pane's thread, once at a time. A change that arrives while a
	 * read is running marks it dirty, and the read that finishes starts another.
	 * @param state The pane's timeline.
	 */
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

	/**
	 * What one pane should be shown now, starting a read the first time it binds
	 * and answering nothing until that read lands.
	 * @param paneId The pane.
	 * @param revision Its link revision.
	 * @param link Its link.
	 * @param threadCapable Whether the workbench can serve threads yet.
	 * @param connection Its browser connection.
	 * @returns The projected timeline, or null while there is none.
	 */
	const read: CanvasTimelineOwner["read"] = (
		paneId,
		revision,
		link,
		threadCapable,
		connection,
	): CodexTimelineProjectionInput | null => {
		const key = bindingKey(paneId, revision, link, threadCapable);
		const state = stateFor(paneId, connection, key, link, threadCapable);
		if (state.ready && state.link.threadId !== null && !state.started) {
			refresh(state);
		}
		return state.data === null || !state.ready
			? null
			: projectData(state.data, options.approvals.inspectViews(), budget);
	};

	/**
	 * The retained timeline one pane's current binding owns, replaced whenever
	 * that binding changes: history read under another link is not this one's.
	 * @param paneId The pane.
	 * @param connection Its browser connection.
	 * @param key The binding's key.
	 * @param link Its link.
	 * @param threadCapable Whether the workbench can serve threads yet.
	 * @returns The retained timeline.
	 */
	const stateFor = (
		paneId: string,
		connection: BrowserConnectionInstance,
		key: string,
		link: ThreadLinkSnapshot,
		threadCapable: boolean,
	): TimelinePaneState => {
		let paneStates = states.get(paneId);
		if (paneStates === undefined) {
			paneStates = new Map();
			states.set(paneId, paneStates);
		}
		const existing = paneStates.get(connection);
		if (existing?.key === key) {
			existing.ready = threadCapable;
			return existing;
		}
		const state: TimelinePaneState = {
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
		return state;
	};

	/**
	 * Re-read every pane whose own thread this notification is about, on this
	 * child epoch.
	 * @param event The notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || !isTimelineNotification(event.notification.method)) {
			return;
		}
		const threadId = eventThreadId(event);
		for (const paneStates of states.values()) {
			for (const state of paneStates.values()) {
				if (!concernsPane(state, threadId, event)) {
					continue;
				}
				state.dirty = true;
				refresh(state);
			}
		}
	};

	/**
	 * Whether one notification concerns one pane: its own thread, on the child
	 * epoch its link names.
	 * @param state The pane's timeline.
	 * @param threadId The thread the notification named.
	 * @param event The notification.
	 * @returns True when the pane must re-read.
	 */
	const concernsPane = (
		state: TimelinePaneState,
		threadId: string | null,
		event: TransportServerNotification,
	): boolean => {
		if (!state.ready || state.link.threadId === null) {
			return false;
		}
		if (!eventMatchesThread(threadId, state.link.threadId, options.identity)) {
			return false;
		}
		if (state.link.childId === null) {
			return true;
		}
		return (
			event.correlation.child === state.link.childId && event.correlation.epoch === state.link.epoch
		);
	};

	/**
	 * Forget one pane's timeline, because its connection has gone.
	 * @param paneId The pane.
	 * @param connection Its browser connection.
	 */
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

	/** Forget every pane's timeline, because the generation is going. */
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
