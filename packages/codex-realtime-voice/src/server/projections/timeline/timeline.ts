import type {
	CodexSession,
	SessionThreadTurnPageResult,
} from "@archboard/codex-app-server/session";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type {
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type { BrowserConnectionInstance } from "#server/protocol/gateway/contract.ts";
import type { CodexTimelineProjectionInput } from "#server/protocol/projection/projection-contract.ts";
import {
	projectTurnData,
	TIMELINE_CURSOR_LIMIT,
	TIMELINE_PAGE_LIMIT,
	TIMELINE_PAGE_LIMIT_MAX,
	type ServerBrowserProjectionBudget,
	type TimelineApprovalView,
	type TimelineData,
	type TimelineTurnData,
} from "#server/projections/timeline/projection.ts";
import {
	createServerBrowserProjectionBudget,
	projectData,
	timelineBytes,
} from "#server/projections/timeline/budget.ts";
import { createTimelineLiveHolder, eventThreadId } from "#server/projections/timeline/live.ts";
import { textEncoder } from "#server/rules/timeline/text.ts";

/** The two session reads one timeline is built from. */
type TimelineSession = Pick<CodexSession, "threadTurnsListPage" | "timelineListPage">;

/**
 * The thread one pane's timeline is read from, and the child epoch its notifications arrive on.
 * The key says everything about that binding that would make a history read under another
 * binding the wrong history.
 */
interface TimelineTarget {
	readonly key: string;
	readonly threadId: ThreadId | null;
	readonly childId: ThreadLinkSnapshot["childId"];
	readonly epoch: ThreadLinkSnapshot["epoch"];
}

/** One pane's timeline: which target it is bound to, and what it has read. */
interface TimelinePaneState {
	readonly paneId: string;
	readonly key: string;
	readonly connection: BrowserConnectionInstance;
	readonly target: TimelineTarget;
	ready: boolean;
	started: boolean;
	data: TimelineData | null;
	refresh: Promise<void> | null;
	dirty: boolean;
}

/** Reads each pane's thread history and keeps it current. */
interface ServerTimelineOwner {
	readonly read: (
		paneId: string,
		revision: number,
		link: ThreadLinkSnapshot,
		threadCapable: boolean,
		connection: BrowserConnectionInstance,
	) => CodexTimelineProjectionInput | null;
	/**
	 * The same read for a thread that is not a pane's link, such as the voice coordinator's.
	 * The caller builds the target's key from whatever would make the history the wrong one. A
	 * `keepTurn` keeps only the turns it names, before the budget is spent, so the turns it leaves
	 * out take none of it.
	 */
	readonly readTarget: (
		paneId: string,
		target: TimelineTarget,
		threadCapable: boolean,
		connection: BrowserConnectionInstance,
		keepTurn?: (turnId: TurnId) => boolean,
	) => CodexTimelineProjectionInput | null;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly retire: (paneId: string, connection: BrowserConnectionInstance) => void;
	readonly dispose: () => void;
}

/** What a timeline owner reads from, and who it tells about changes. */
interface ServerTimelineOwnerOptions {
	readonly session: TimelineSession;
	readonly identity: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">;
	readonly approvals: {
		readonly inspectViews: () => readonly TimelineApprovalView[];
	};
	readonly onChange: () => void;
	readonly budget?: ServerBrowserProjectionBudget;
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
	identity: ServerTimelineOwnerOptions["identity"],
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
	budget: ServerBrowserProjectionBudget,
): Promise<{ readonly turns: readonly TimelineTurnData[]; readonly truncated: boolean }> {
	const newestFirst: TimelineTurnData[] = [];
	const seenCursors = new Set<string>();
	let retainedBytes = timelineBytes(
		{
			kind: "codex_timeline",
			threadId,
			cursor: "x".repeat(TIMELINE_CURSOR_LIMIT),
			usage: null,
		},
		[],
	);
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
 * Keep as much of one page as the turn and byte budgets allow. The turn that
 * crosses the byte bound is kept too, and the projection fits it by cutting
 * its oldest items: skipping it would hide a long running turn entirely.
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
	budget: ServerBrowserProjectionBudget,
): { readonly retainedBytes: number; readonly full: boolean } {
	let bytes = retainedBytes;
	for (const turn of page) {
		if (newestFirst.length >= budget.maxTurns) {
			return { retainedBytes: bytes, full: true };
		}
		const projected = projectTurnData(turn, budget.maxItemsPerTurn);
		const projectedBytes = textEncoder.encode(JSON.stringify(projected)).byteLength;
		const nextBytes = bytes + projectedBytes + (newestFirst.length === 0 ? 0 : 1);
		newestFirst.push(projected);
		if (nextBytes > budget.maxBytes) {
			return { retainedBytes: nextBytes, full: true };
		}
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
function createServerTimelineOwner(options: ServerTimelineOwnerOptions): ServerTimelineOwner {
	const states = new Map<string, Map<BrowserConnectionInstance, TimelinePaneState>>();
	const budget = createServerBrowserProjectionBudget(options.budget);
	const live = createTimelineLiveHolder(options.identity);
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
		if (disposed || !state.ready || state.target.threadId === null || state.refresh !== null) {
			return;
		}
		state.started = true;
		state.dirty = false;
		const threadId = state.target.threadId;
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
	 * What one pane should be shown of one target's thread now, starting a read the first time it
	 * binds and answering nothing until that read lands.
	 * @param paneId The pane.
	 * @param target The thread, the child epoch it arrives on, and the key of that binding.
	 * @param threadCapable Whether the workbench can serve threads yet.
	 * @param connection Its browser connection.
	 * @param keepTurn Which turns to keep, when only some are this pane's.
	 * @returns The projected timeline, or null while there is none.
	 */
	const readTarget: ServerTimelineOwner["readTarget"] = (
		paneId,
		target,
		threadCapable,
		connection,
		keepTurn,
	): CodexTimelineProjectionInput | null => {
		const state = stateFor(paneId, connection, target, threadCapable);
		if (state.ready && state.target.threadId !== null && !state.started) {
			refresh(state);
		}
		return state.data === null || !state.ready
			? null
			: projectData(
					state.data,
					options.approvals.inspectViews(),
					live.forThread(state.data.threadId),
					budget,
					keepTurn,
				);
	};

	/**
	 * What one pane should be shown of its own link's thread now.
	 * @param paneId The pane.
	 * @param revision Its link revision.
	 * @param link Its link.
	 * @param threadCapable Whether the workbench can serve threads yet.
	 * @param connection Its browser connection.
	 * @returns The projected timeline, or null while there is none.
	 */
	const read: ServerTimelineOwner["read"] = (paneId, revision, link, threadCapable, connection) =>
		readTarget(
			paneId,
			{
				key: bindingKey(paneId, revision, link, threadCapable),
				threadId: link.threadId,
				childId: link.childId,
				epoch: link.epoch,
			},
			threadCapable,
			connection,
		);

	/**
	 * The retained timeline one pane's current binding owns, replaced whenever
	 * that binding changes: history read under another binding is not this one's.
	 * @param paneId The pane.
	 * @param connection Its browser connection.
	 * @param target Its binding.
	 * @param threadCapable Whether the workbench can serve threads yet.
	 * @returns The retained timeline.
	 */
	const stateFor = (
		paneId: string,
		connection: BrowserConnectionInstance,
		target: TimelineTarget,
		threadCapable: boolean,
	): TimelinePaneState => {
		let paneStates = states.get(paneId);
		if (paneStates === undefined) {
			paneStates = new Map();
			states.set(paneId, paneStates);
		}
		const existing = paneStates.get(connection);
		if (existing?.key === target.key) {
			existing.ready = threadCapable;
			return existing;
		}
		const state: TimelinePaneState = {
			paneId,
			key: target.key,
			connection,
			target,
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
	 * child epoch. A plan or token usage report needs no re-read: it is held,
	 * and a pane already showing that thread is republished with it.
	 * @param event The notification.
	 */
	const onNotification = (event: TransportServerNotification): void => {
		if (disposed || !isTimelineNotification(event.notification.method)) {
			return;
		}
		const concerned = panesConcerned(eventThreadId(event), event);
		if (live.hold(event)) {
			if (concerned.some((state) => state.data !== null)) {
				options.onChange();
			}
			return;
		}
		for (const state of concerned) {
			state.dirty = true;
			refresh(state);
		}
	};

	/**
	 * Every pane timeline one notification is about.
	 * @param threadId The thread the notification named.
	 * @param event The notification.
	 * @returns The pane timelines.
	 */
	const panesConcerned = (
		threadId: string | null,
		event: TransportServerNotification,
	): TimelinePaneState[] =>
		[...states.values()].flatMap((paneStates) =>
			[...paneStates.values()].filter((state) => concernsPane(state, threadId, event)),
		);

	/**
	 * Whether one notification concerns one pane: its own thread, on the child
	 * epoch its target names.
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
		if (!state.ready || state.target.threadId === null) {
			return false;
		}
		if (!eventMatchesThread(threadId, state.target.threadId, options.identity)) {
			return false;
		}
		if (state.target.childId === null) {
			return true;
		}
		return (
			event.correlation.child === state.target.childId &&
			event.correlation.epoch === state.target.epoch
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
		live.clear();
	};

	return Object.freeze({ read, readTarget, onNotification, retire, dispose });
}

export {
	type ServerBrowserProjectionBudget,
	type ServerTimelineOwner,
	type ServerTimelineOwnerOptions,
	type TimelineTarget,
	createServerBrowserProjectionBudget,
	createServerTimelineOwner,
};
