import type {
	SessionParams,
	SessionThread,
	SessionThreadPageResult,
	SessionLoadedThreadPageResult,
	CodexSession,
} from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { CodexDynamicToolsError } from "@/runtime/codex-dynamic-tools/lib/contract";

/** The thread sources the projection reads, and so the only ones a listing can report. */
const THREAD_SOURCE_KINDS = Object.freeze(["cli", "vscode", "exec", "appServer"] as const);

/** How many rows one page of an authority listing carries. */
const AUTHORITY_PAGE_LIMIT = 100 as const;

/**
 * Build a projection failure. Everything the projection refuses is a system error: the
 * authority returned something the reviewed shape does not allow.
 * @param message Human-readable explanation.
 * @param cause The underlying thrown value, if any.
 * @returns The error.
 */
function projectionError(message: string, cause?: unknown): CodexDynamicToolsError {
	return new CodexDynamicToolsError("system_error", message, cause);
}

/**
 * Whether a value is a plain object, which is the only shape the projection reads.
 * @param value Untrusted value.
 * @returns Whether the value is a plain object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Refuse a page that is not the reviewed cursor-page shape, so nothing downstream reads rows
 * out of something that only looks like a page.
 * @param value What the authority returned.
 * @param label Which listing it came from.
 */
function assertCursorPage(
	value: unknown,
	label: string,
): asserts value is {
	readonly data: readonly unknown[];
	readonly nextCursor: string | null;
} {
	if (!isRecord(value) || !Array.isArray(value["data"])) {
		throw projectionError(`${label} returned an invalid page.`);
	}
	if (value["nextCursor"] !== null && typeof value["nextCursor"] !== "string") {
		throw projectionError(`${label} returned an invalid nextCursor.`);
	}
}

/**
 * The parameters one page of the thread listing is read with.
 * @param cursor Where to resume from.
 * @param limit How many rows to read.
 * @returns The parameters.
 */
function threadListParams(cursor: string | null, limit: number): SessionParams<"thread/list"> {
	return {
		cursor,
		limit,
		sortKey: "recency_at",
		sortDirection: "desc",
		sourceKinds: [...THREAD_SOURCE_KINDS],
		archived: false,
		useStateDbOnly: false,
	};
}

/**
 * The parameters one page of the loaded-thread listing is read with.
 * @param cursor Where to resume from.
 * @returns The parameters.
 */
function loadedListParams(cursor: string | null): SessionParams<"thread/loaded/list"> {
	return { cursor, limit: AUTHORITY_PAGE_LIMIT };
}

/**
 * Where the next page comes from, refusing a listing that would never end.
 * @param nextCursor The cursor the page returned.
 * @param cursor The cursor this page was read with.
 * @param seen The cursors already followed.
 * @param label Which listing it came from.
 * @returns The next cursor, or null when the listing is exhausted.
 */
function nextCursorOrEnd(
	nextCursor: string | null,
	cursor: string | null,
	seen: Set<string>,
	label: string,
): string | null {
	if (nextCursor === null) {
		return null;
	}
	if (nextCursor === cursor || seen.has(nextCursor)) {
		throw projectionError(`${label} repeated a cursor before exhaustion.`);
	}
	seen.add(nextCursor);
	return nextCursor;
}

/**
 * The rows of one thread-listing page, refusing a row with no ThreadId to name it by.
 * @param page The page.
 * @returns Its rows.
 */
function threadRows(page: SessionThreadPageResult): SessionThread[] {
	return page.data.map((row) => {
		if (!isRecord(row) || typeof row.id !== "string" || row.id.length === 0) {
			throw projectionError("thread/list returned a row without a ThreadId.");
		}
		return row;
	});
}

/**
 * Read the whole thread listing, one page at a time. The listing is walked in order because
 * each page's cursor comes from the page before it.
 * @param session The Codex session.
 * @returns Every persisted thread.
 */
async function exhaustThreadList(
	session: Pick<CodexSession, "threadListPage">,
): Promise<readonly SessionThread[]> {
	const rows: SessionThread[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	for (;;) {
		let page: SessionThreadPageResult;
		try {
			// oxlint-disable-next-line eslint/no-await-in-loop -- each page's cursor comes from the page before it; the listing is sequential by contract
			page = await session.threadListPage(threadListParams(cursor, AUTHORITY_PAGE_LIMIT));
		} catch (error) {
			throw projectionError("thread/list could not be exhausted.", error);
		}
		assertCursorPage(page, "thread/list");
		rows.push(...threadRows(page));
		cursor = nextCursorOrEnd(page.nextCursor, cursor, seen, "thread/list");
		if (cursor === null) {
			return rows;
		}
	}
}

/**
 * The ThreadIds of one loaded-thread page, refusing an id nothing can be looked up by.
 * @param page The page.
 * @returns Its ids.
 */
function loadedIds(page: SessionLoadedThreadPageResult): ThreadId[] {
	return page.data.map((id) => {
		if (typeof id !== "string" || id.length === 0) {
			throw projectionError("thread/loaded/list returned an invalid ThreadId.");
		}
		return id;
	});
}

/**
 * Read the whole loaded-thread listing, one page at a time, in the order its cursors chain.
 * @param session The Codex session.
 * @returns Every loaded ThreadId, including repeats.
 */
async function exhaustLoadedList(
	session: Pick<CodexSession, "threadLoadedListPage">,
): Promise<readonly ThreadId[]> {
	const ids: ThreadId[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	for (;;) {
		let page: SessionLoadedThreadPageResult;
		try {
			// oxlint-disable-next-line eslint/no-await-in-loop -- each page's cursor comes from the page before it; the listing is sequential by contract
			page = await session.threadLoadedListPage(loadedListParams(cursor));
		} catch (error) {
			throw projectionError("thread/loaded/list could not be exhausted.", error);
		}
		assertCursorPage(page, "thread/loaded/list");
		ids.push(...loadedIds(page));
		cursor = nextCursorOrEnd(page.nextCursor, cursor, seen, "thread/loaded/list");
		if (cursor === null) {
			return ids;
		}
	}
}

/**
 * How many times each id occurs, which is what tells a projection that an authority is naming
 * one thread more than once.
 * @param ids The ids.
 * @returns The counts by id.
 */
function countIds(ids: readonly ThreadId[]): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const id of ids) {
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

export {
	AUTHORITY_PAGE_LIMIT,
	THREAD_SOURCE_KINDS,
	assertCursorPage,
	countIds,
	exhaustLoadedList,
	exhaustThreadList,
	isRecord,
	projectionError,
	threadListParams,
};
