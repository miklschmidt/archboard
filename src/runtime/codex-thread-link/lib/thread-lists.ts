import type {
	CodexSession,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
} from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { CodexThreadLinkError } from "@/runtime/codex-thread-link/lib/contract";
import {
	ALLOWED_SOURCES,
	invalidResult,
	isNonEmptyString,
	isRecord,
} from "@/runtime/codex-thread-link/lib/thread-vocabulary";

const PAGE_LIMIT = 100;

type ThreadListSession = Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;

/** One page of a cursor-paginated list as the session returns it. */
interface PageEnvelope<Row> {
	readonly data: readonly Row[];
	readonly nextCursor: string | null;
}

/**
 * The exhaustion-failure error for a page that cannot be paged past.
 * @param rpc The list method.
 * @param what What was invalid.
 * @returns The error.
 */
function exhaustionFailure(rpc: string, what: string): CodexThreadLinkError {
	return new CodexThreadLinkError(
		"list_exhaustion_failure",
		`${rpc} returned an invalid ${what} before exhaustion.`,
	);
}

/**
 * Requires a page to carry a data array and a string-or-null cursor.
 * @param rpc The list method, for the failure message.
 * @param value The page.
 */
function assertPageEnvelope(rpc: string, value: unknown): asserts value is PageEnvelope<unknown> {
	if (!isRecord(value) || !Array.isArray(value["data"])) {
		throw exhaustionFailure(rpc, "page");
	}
	if (value["nextCursor"] !== null && typeof value["nextCursor"] !== "string") {
		throw exhaustionFailure(rpc, "nextCursor");
	}
}

/**
 * Requires a thread/list page whose rows each carry a ThreadId.
 * @param value The page.
 */
function assertThreadPage(value: unknown): asserts value is SessionThreadPageResult {
	assertPageEnvelope("thread/list", value);
	for (const row of value.data) {
		if (!isRecord(row) || !isNonEmptyString(row["id"])) {
			throw invalidResult("thread/list returned a row without a valid ThreadId.");
		}
	}
}

/**
 * Requires a thread/loaded/list page whose entries are ThreadIds.
 * @param value The page.
 */
function assertLoadedPage(value: unknown): asserts value is SessionLoadedThreadPageResult {
	assertPageEnvelope("thread/loaded/list", value);
	for (const id of value.data) {
		if (!isNonEmptyString(id)) {
			throw invalidResult("thread/loaded/list returned a value that is not a ThreadId.");
		}
	}
}

/**
 * Fetches one page, charging a session failure to the transport.
 * @param rpc The list method, for the failure message.
 * @param fetchPage Fetches the page at a cursor.
 * @param cursor The cursor to fetch.
 * @returns The raw page.
 */
async function fetchPageOrFail(
	rpc: string,
	fetchPage: (cursor: string | null) => Promise<unknown>,
	cursor: string | null,
): Promise<unknown> {
	try {
		return await fetchPage(cursor);
	} catch (error) {
		if (error instanceof CodexThreadLinkError) {
			throw error;
		}
		throw new CodexThreadLinkError(
			"transport_failure",
			`${rpc} could not be exhausted; the thread link was not classified.`,
			error,
		);
	}
}

/**
 * Follows a cursor-paginated list to its end, refusing a cursor that repeats.
 * @param rpc The list method, for failure messages.
 * @param fetchPage Fetches the page at a cursor.
 * @param assertPage Validates a raw page as one of this list's pages.
 * @returns Every row, in list order.
 */
async function exhaustPages<Row>(
	rpc: string,
	fetchPage: (cursor: string | null) => Promise<unknown>,
	assertPage: (value: unknown) => asserts value is PageEnvelope<Row>,
): Promise<readonly Row[]> {
	const rows: Row[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | null = null;
	for (;;) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- each page's cursor comes from the page before it; pagination is sequential by contract
		const page = await fetchPageOrFail(rpc, fetchPage, cursor);
		assertPage(page);
		rows.push(...page.data);
		const next = page.nextCursor;
		if (next === null) {
			return rows;
		}
		if (next === cursor || seenCursors.has(next)) {
			throw new CodexThreadLinkError(
				"repeated_cursor",
				`${rpc} repeated cursor ${JSON.stringify(next)} before exhaustion.`,
			);
		}
		seenCursors.add(next);
		cursor = next;
	}
}

/**
 * Reads every persisted thread from the allowed sources, newest first.
 * @param session The session's list methods.
 * @returns Every persisted thread row.
 */
async function exhaustThreadList(session: ThreadListSession): Promise<readonly SessionThread[]> {
	return exhaustPages<SessionThread>(
		"thread/list",
		(cursor) =>
			session.threadListPage({
				cursor,
				limit: PAGE_LIMIT,
				sortKey: "recency_at",
				sortDirection: "desc",
				sourceKinds: [...ALLOWED_SOURCES],
				archived: false,
				useStateDbOnly: false,
			}),
		assertThreadPage,
	);
}

/**
 * Reads every loaded thread id.
 * @param session The session's list methods.
 * @returns Every loaded thread id, with any duplicates the session reports.
 */
async function exhaustLoadedList(session: ThreadListSession): Promise<readonly ThreadId[]> {
	return exhaustPages<ThreadId>(
		"thread/loaded/list",
		(cursor) => session.threadLoadedListPage({ cursor, limit: PAGE_LIMIT }),
		assertLoadedPage,
	);
}

export { exhaustLoadedList, exhaustThreadList };
export type { ThreadListSession };
