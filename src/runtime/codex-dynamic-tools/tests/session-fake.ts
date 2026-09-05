import type { SessionParams, SessionThread, SessionTurn } from "../../codex-session/index.js";
import type {
	SessionLoadedThreadPageResult,
	SessionThreadItemPageResult,
	SessionThreadPageResult,
	SessionThreadTurnPageResult,
	SessionThreadForkResult,
	SessionThreadStartResult,
	SessionTurnResult,
} from "../../codex-session/index.js";
import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";

class FakeSession {
	readonly calls: Array<{ readonly method: string; readonly params: unknown }> = [];
	readonly threadListPages = new Map<string | null, SessionThreadPageResult>();
	readonly loadedListPages = new Map<string | null, SessionLoadedThreadPageResult>();
	readonly turnsPages = new Map<string | null, SessionThreadTurnPageResult>();
	readonly itemPages = new Map<string, SessionThreadItemPageResult>();
	threadStartResult: SessionThreadStartResult | Error | null = null;
	threadForkResult: SessionThreadForkResult | Error | null = null;
	turnStartResult: SessionTurnResult | Error | null = null;

	private record(method: string, params: unknown): void {
		this.calls.push({ method, params });
	}

	async threadStart(params: SessionParams<"thread/start">): Promise<SessionThreadStartResult> {
		this.record("thread/start", params);
		return resolve(this.threadStartResult, "thread/start");
	}

	async threadFork(params: SessionParams<"thread/fork">): Promise<SessionThreadForkResult> {
		this.record("thread/fork", params);
		return resolve(this.threadForkResult, "thread/fork");
	}

	async threadListPage(params?: SessionParams<"thread/list">): Promise<SessionThreadPageResult> {
		this.record("thread/list", params);
		return page(this.threadListPages, params?.cursor ?? null, "thread/list");
	}

	async threadLoadedListPage(
		params?: SessionParams<"thread/loaded/list">,
	): Promise<SessionLoadedThreadPageResult> {
		this.record("thread/loaded/list", params);
		return page(this.loadedListPages, params?.cursor ?? null, "thread/loaded/list");
	}

	async threadTurnsListPage(
		params: SessionParams<"thread/turns/list">,
	): Promise<SessionThreadTurnPageResult> {
		this.record("thread/turns/list", params);
		return page(this.turnsPages, params.cursor ?? null, "thread/turns/list");
	}

	async threadItemsListPage(
		params: SessionParams<"thread/items/list">,
	): Promise<SessionThreadItemPageResult> {
		this.record("thread/items/list", params);
		const result = this.itemPages.get(String(params.turnId));
		if (result === undefined) {
			throw new Error(`thread/items/list fixture has no page for ${String(params.turnId)}`);
		}
		return result;
	}

	async turnStart(params: SessionParams<"turn/start">): Promise<SessionTurnResult> {
		this.record("turn/start", params);
		return resolve(this.turnStartResult, "turn/start");
	}
}

function resolve<T>(value: T | Error | null, label: string): T {
	if (value === null) {
		throw new Error(`${label} fixture was not configured`);
	}
	if (value instanceof Error) {
		throw value;
	}
	return value;
}

function page<T>(pages: ReadonlyMap<string | null, T>, cursor: string | null, label: string): T {
	const value = pages.get(cursor);
	if (value === undefined) {
		throw new Error(`${label} fixture has no page for ${String(cursor)}`);
	}
	return value;
}

function threadPage(
	data: readonly SessionThread[],
	nextCursor: string | null = null,
): SessionThreadPageResult {
	return { data, nextCursor, backwardsCursor: null } as SessionThreadPageResult;
}

function loadedPage(
	data: readonly ThreadId[],
	nextCursor: string | null = null,
): SessionLoadedThreadPageResult {
	return { data, nextCursor };
}

function turnPage(
	data: readonly SessionTurn[],
	nextCursor: string | null = null,
): SessionThreadTurnPageResult {
	return { data, nextCursor, backwardsCursor: null } as SessionThreadTurnPageResult;
}

export { FakeSession, threadPage, loadedPage, turnPage };
