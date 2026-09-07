import type {
	SessionThread,
	SessionThreadPageResult,
	SessionThreadTurnPageResult,
	SessionThreadItemPageResult,
	SessionTurn,
	CodexSession,
} from "@/runtime/codex-session";
import type {
	DynamicCallerAuthority,
	DynamicObservedTarget,
	DynamicTargetAuthority,
} from "@/runtime/codex-dynamic-tools/lib/contract";
import {
	AUTHORITY_PAGE_LIMIT,
	THREAD_SOURCE_KINDS,
	assertCursorPage,
	countIds,
	exhaustLoadedList,
	exhaustThreadList,
	isRecord,
	projectionError,
	threadListParams,
} from "@/runtime/codex-dynamic-tools/lib/projection-pages";
import {
	itemForRequestedTurn,
	outputProjection,
	threadTitle,
	turnSummary,
	type OutputProjection,
} from "@/runtime/codex-dynamic-tools/lib/projection-text";

/** How a target thread is classified against the caller's own authority. */
type TargetClassifier = (
	threadId: unknown,
	observed?: DynamicObservedTarget,
) => Promise<DynamicTargetAuthority>;

/** One thread as a listing reports it. */
interface ListedThreadProjection {
	readonly threadId: string;
	readonly title: string | null;
	readonly status: SessionThread["status"]["type"];
	readonly source: "cli" | "vscode" | "exec" | "appServer";
	readonly epoch: DynamicTargetAuthority["epochState"];
	readonly ownership: DynamicTargetAuthority["ownership"];
	readonly loaded: boolean;
	readonly canAcceptDirectInput: boolean | null;
}

/** One page of a thread listing. */
interface ListProjection {
	readonly threads: readonly ListedThreadProjection[];
	readonly nextCursor: string | null;
}

/** One turn as a read reports it. */
interface ReadTurnProjection {
	readonly turnId: string;
	readonly status: SessionTurn["status"];
	readonly summary: string;
	readonly outputsIncluded: boolean;
	readonly outputsTruncated: boolean;
}

/** One page of a thread read. */
interface ReadProjection {
	readonly threadId: string;
	readonly turns: readonly ReadTurnProjection[];
	readonly nextCursor: string | null;
}

/**
 * The source a thread is reported under, refusing one outside the filter the listing was read
 * with, since that would mean the authority returned a thread the projection did not ask for.
 * @param thread The thread, carrying the source the authority classified it under.
 * @returns The source.
 */
function sourceOf(thread: SessionThread): ListedThreadProjection["source"] {
	const source = thread.source;
	const known = THREAD_SOURCE_KINDS.find((kind) => kind === source);
	if (known === undefined) {
		throw projectionError("thread/list returned a source outside the reviewed sourceKinds filter.");
	}
	return known;
}

/**
 * What was observed about one thread, which is what the classifier weighs its authority against.
 * @param thread The thread, when the listing holds one.
 * @param persistedRows How many persisted rows claim its identity.
 * @param loadedOccurrences How many times it appears as loaded.
 * @returns The observation.
 */
function observationFor(
	thread: SessionThread | null,
	persistedRows: number,
	loadedOccurrences: number,
): DynamicObservedTarget {
	return Object.freeze({ thread, persistedRows, loadedOccurrences });
}

/**
 * The identity a listed row claims, refusing one with nothing to name it by.
 * @param thread The row.
 * @returns Its ThreadId.
 */
function listedThreadId(thread: SessionThread): string {
	if (!isRecord(thread) || typeof thread.id !== "string" || thread.id.length === 0) {
		throw projectionError("thread/list returned a row without a ThreadId.");
	}
	return thread.id;
}

/**
 * One listed thread as the projection reports it, with every field the caller sees taken from
 * the authority's classification rather than from the row itself.
 * @param thread The row.
 * @param target How the classifier read it.
 * @returns The projected row.
 */
function listedRow(thread: SessionThread, target: DynamicTargetAuthority): ListedThreadProjection {
	return {
		threadId: target.wireThreadId,
		title: threadTitle(thread),
		status: target.status,
		source: sourceOf({ ...thread, source: target.source }),
		epoch: target.epochState,
		ownership: target.ownership,
		loaded: target.loaded,
		canAcceptDirectInput: target.directInput,
	};
}

/** What a listing reads through. */
interface ListOptions {
	readonly session: Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;
	readonly classifyTarget: TargetClassifier;
}

/** Where a listing resumes from, and how many rows it reads. */
interface ListInput {
	readonly cursor: string | null;
	readonly limit: number;
}

/**
 * List the threads the caller may see, one page at a time, with every row classified against
 * the caller's own authority. A classifier that renames a thread is refused, because a caller
 * that acted on the renamed id would be acting on a thread it was never shown.
 * @param input Where to resume from, and how many rows to read.
 * @param caller The caller's authority.
 * @param options The session and the target classifier.
 * @returns The page.
 */
async function projectList(
	input: ListInput,
	caller: DynamicCallerAuthority,
	options: ListOptions,
): Promise<ListProjection> {
	let page: SessionThreadPageResult;
	try {
		page = await options.session.threadListPage(threadListParams(input.cursor, input.limit));
	} catch (error) {
		throw projectionError("thread/list could not be read.", error);
	}
	assertCursorPage(page, "thread/list");
	const loaded = countIds(await exhaustLoadedList(options.session));
	const persisted = countIds(page.data.map((thread) => thread.id));
	const rows: ListedThreadProjection[] = [];
	for (const thread of page.data) {
		const threadId = listedThreadId(thread);
		const observed = observationFor(
			thread,
			persisted.get(threadId) ?? 0,
			loaded.get(threadId) ?? 0,
		);
		// oxlint-disable-next-line eslint/no-await-in-loop -- each row is classified against the caller's authority in turn; a later refusal must not race an earlier one
		const target = await options.classifyTarget(threadId, observed);
		if (target.threadId !== threadId) {
			throw projectionError("target authority changed the listed ThreadId.");
		}
		rows.push(listedRow(thread, target));
	}
	void caller;
	return Object.freeze({ threads: Object.freeze(rows), nextCursor: page.nextCursor });
}

/**
 * Summarise each turn of a page in the order the page returned them, reading each turn's items
 * when outputs were asked for.
 * @param page The page's turns.
 * @param threadId The thread they belong to.
 * @param input What the read asked for.
 * @param session The Codex session.
 * @returns The projected turns.
 */
async function projectTurns(
	page: readonly SessionTurn[],
	threadId: DynamicTargetAuthority["threadId"],
	input: ReadInput,
	session: Pick<CodexSession, "threadItemsListPage">,
): Promise<ReadTurnProjection[]> {
	const turns: ReadTurnProjection[] = [];
	for (const turn of page) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- each turn's items are read in turn so the summaries stay in the page's own order
		const read = input.includeOutputs ? await readTurnOutputs(session, threadId, turn.id) : null;
		turns.push(projectedTurn(turn, read, input.includeOutputs));
	}
	return turns;
}

/**
 * One turn as the read publishes it, with whatever its outputs added to the summary and a note
 * of whether either the summary or the item listing was cut short.
 * @param turn The turn.
 * @param read The turn's outputs, when they were read.
 * @param outputsIncluded Whether outputs were asked for.
 * @returns The projected turn.
 */
function projectedTurn(
	turn: SessionTurn,
	read: TurnOutputs | null,
	outputsIncluded: boolean,
): ReadTurnProjection {
	const summary = turnSummary(turn, read?.outputs ?? null);
	return {
		turnId: String(turn.id),
		status: turn.status,
		summary: summary.value,
		outputsIncluded,
		outputsTruncated: summary.truncated || read?.pageTruncated === true,
	};
}

/**
 * Whether a classified thread is the one that was asked for, by either the identity the caller
 * used or the identity the authority knows it by.
 * @param candidate The classified thread.
 * @param requestedThreadId The identity the caller used, as a string.
 * @param requestedTarget The identity the caller used, as given.
 * @returns Whether it is the requested thread.
 */
function isRequestedThread(
	candidate: DynamicTargetAuthority,
	requestedThreadId: string,
	requestedTarget: unknown,
): boolean {
	return candidate.wireThreadId === requestedThreadId || candidate.threadId === requestedTarget;
}

/**
 * Refuse a second classification of the requested thread that does not agree with the first:
 * the listing has named one thread twice under different authority, and nothing says which of
 * them the caller meant.
 * @param candidate The later classification.
 * @param target The classification already held.
 */
function assertSameAuthority(
	candidate: DynamicTargetAuthority,
	target: DynamicTargetAuthority,
): void {
	const same =
		candidate.authority === target.authority &&
		candidate.threadId === target.threadId &&
		candidate.wireThreadId === target.wireThreadId;
	if (!same) {
		throw projectionError("thread/list returned ambiguous authority for the requested ThreadId.");
	}
}

/**
 * Keep the first classification of the requested thread, refusing a later one that does not
 * agree with it.
 * @param candidate The classification just made.
 * @param target The classification already held, if any.
 * @returns The classification to hold.
 */
function agreedTarget(
	candidate: DynamicTargetAuthority,
	target: DynamicTargetAuthority | null,
): DynamicTargetAuthority {
	if (target === null) {
		return candidate;
	}
	assertSameAuthority(candidate, target);
	return target;
}

/**
 * Find the requested thread among the persisted ones, classifying each in turn against the
 * caller's authority, and falling back to classifying the requested identity on its own when
 * the listing does not hold it.
 * @param requestedTarget The identity the caller used.
 * @param persisted Every persisted thread.
 * @param loadedOccurrences How many times each thread appears as loaded.
 * @param classifyTarget The target classifier.
 * @returns The classified target.
 */
async function resolveReadTarget(
	requestedTarget: unknown,
	persisted: readonly SessionThread[],
	loadedOccurrences: ReadonlyMap<string, number>,
	classifyTarget: TargetClassifier,
): Promise<DynamicTargetAuthority> {
	const requestedThreadId = String(requestedTarget);
	const persistedOccurrences = countIds(persisted.map((thread) => thread.id));
	let target: DynamicTargetAuthority | null = null;
	for (const thread of persisted) {
		const observed = observationFor(
			thread,
			persistedOccurrences.get(thread.id) ?? 0,
			loadedOccurrences.get(thread.id) ?? 0,
		);
		// oxlint-disable-next-line eslint/no-await-in-loop -- each candidate is classified against the caller's authority in turn; a later refusal must not race an earlier one
		const candidate = await classifyTarget(thread.id, observed);
		if (isRequestedThread(candidate, requestedThreadId, requestedTarget)) {
			target = agreedTarget(candidate, target);
		}
	}
	return target ?? (await classifyTarget(requestedTarget, observationFor(null, 0, 0)));
}

/** What one turn's items produced, and whether the item listing itself was cut short. */
interface TurnOutputs {
	readonly outputs: OutputProjection;
	readonly pageTruncated: boolean;
}

/**
 * Read one turn's items so its outputs can be summarised.
 * @param session The Codex session.
 * @param threadId The thread.
 * @param turnId The turn.
 * @returns The turn's outputs, and whether the item listing itself was cut short.
 */
async function readTurnOutputs(
	session: Pick<CodexSession, "threadItemsListPage">,
	threadId: DynamicTargetAuthority["threadId"],
	turnId: SessionTurn["id"],
): Promise<TurnOutputs> {
	let itemPage: SessionThreadItemPageResult;
	try {
		itemPage = await session.threadItemsListPage({
			threadId,
			turnId,
			cursor: null,
			limit: AUTHORITY_PAGE_LIMIT,
			sortDirection: "asc",
		});
	} catch (error) {
		throw projectionError("thread/items/list could not be read.", error);
	}
	assertCursorPage(itemPage, "thread/items/list");
	const items = itemPage.data.map((entry) => itemForRequestedTurn(entry, String(turnId)));
	return { outputs: outputProjection(items), pageTruncated: itemPage.nextCursor !== null };
}

/**
 * Read one page of a thread's turns, newest first.
 * @param session The Codex session.
 * @param threadId The thread.
 * @param cursor Where to resume from.
 * @param turnLimit How many turns to read.
 * @returns The page.
 */
async function readTurnPage(
	session: Pick<CodexSession, "threadTurnsListPage">,
	threadId: DynamicTargetAuthority["threadId"],
	cursor: string | null,
	turnLimit: number,
): Promise<SessionThreadTurnPageResult> {
	let page: SessionThreadTurnPageResult;
	try {
		page = await session.threadTurnsListPage({
			threadId,
			cursor,
			limit: turnLimit,
			sortDirection: "desc",
			itemsView: "summary",
		});
	} catch (error) {
		throw projectionError("thread/turns/list could not be read.", error);
	}
	assertCursorPage(page, "thread/turns/list");
	return page;
}

/** What a read reads through. */
interface ReadOptions {
	readonly session: Pick<
		CodexSession,
		"threadListPage" | "threadLoadedListPage" | "threadTurnsListPage" | "threadItemsListPage"
	>;
	readonly classifyTarget: TargetClassifier;
}

/** Which thread to read, where to resume from, how many turns, and whether to include outputs. */
interface ReadInput {
	readonly targetThreadId: unknown;
	readonly cursor: string | null;
	readonly turnLimit: number;
	readonly includeOutputs: boolean;
}

/**
 * Read one thread's recent turns, summarising each and, when asked, what its items produced.
 * The thread is resolved against the caller's own authority first, so a caller can only read
 * what its authority actually names.
 * @param input The thread, where to resume from, how many turns, and whether to include outputs.
 * @param caller The caller's authority.
 * @param options The session and the target classifier.
 * @returns The page.
 */
async function projectRead(
	input: ReadInput,
	caller: DynamicCallerAuthority,
	options: ReadOptions,
): Promise<ReadProjection> {
	const persisted = await exhaustThreadList(options.session);
	const loadedOccurrences = countIds(await exhaustLoadedList(options.session));
	const target = await resolveReadTarget(
		input.targetThreadId,
		persisted,
		loadedOccurrences,
		options.classifyTarget,
	);
	if (!isRequestedThread(target, String(input.targetThreadId), input.targetThreadId)) {
		throw projectionError("The target authority changed the requested ThreadId.");
	}
	const page = await readTurnPage(options.session, target.threadId, input.cursor, input.turnLimit);
	const turns = await projectTurns(page.data, target.threadId, input, options.session);
	void caller;
	return Object.freeze({
		threadId: target.wireThreadId,
		turns: Object.freeze(turns),
		nextCursor: page.nextCursor,
	});
}

export {
	THREAD_SOURCE_KINDS,
	AUTHORITY_PAGE_LIMIT,
	type ListedThreadProjection,
	type ListProjection,
	type ReadTurnProjection,
	type ReadProjection,
	projectList,
	projectRead,
};
