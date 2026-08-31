import type { IdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type {
	EpochOperationOutcome,
	EpochOperationRecord,
	EpochOperationStatus,
} from "../../codex-epoch/index.js";
import type {
	SessionLoadedThreadPageResult,
	SessionParams,
	SessionThread,
	SessionThreadPageResult,
	SessionThreadSource,
} from "../../codex-session/index.js";
import type { ThreadLinkCurrentEpoch, ThreadLinkStatus, ThreadLinkTarget } from "../index.js";

export interface ThreadOptions {
	readonly source?: SessionThreadSource;
	readonly status?: ThreadLinkStatus;
	readonly canAcceptDirectInput?: boolean | null;
}

export function thread(
	authority: IdentityAuthority,
	rawId: string,
	options: ThreadOptions = {},
): SessionThread {
	return {
		id: authority.decoder.adoptThreadId(rawId),
		source: options.source ?? "appServer",
		status: { type: options.status ?? "idle" },
		canAcceptDirectInput:
			options.canAcceptDirectInput === undefined ? true : options.canAcceptDirectInput,
	} as unknown as SessionThread;
}

export function threadPage(
	data: readonly SessionThread[],
	nextCursor: string | null = null,
): SessionThreadPageResult {
	return { data, nextCursor, backwardsCursor: null } as SessionThreadPageResult;
}

export function loadedPage(
	data: readonly string[],
	nextCursor: string | null = null,
): SessionLoadedThreadPageResult {
	return { data: data as unknown as SessionLoadedThreadPageResult["data"], nextCursor };
}

type ThreadPageResponse = SessionThreadPageResult | Error;
type LoadedPageResponse = SessionLoadedThreadPageResult | Error;

export class ScriptedSession {
	readonly threadListRequests: Array<SessionParams<"thread/list"> | undefined> = [];
	readonly loadedListRequests: Array<SessionParams<"thread/loaded/list"> | undefined> = [];

	constructor(
		private readonly threadPages: ReadonlyMap<string | null, ThreadPageResponse>,
		private readonly loadedPages: ReadonlyMap<string | null, LoadedPageResponse>,
	) {}

	async threadListPage(params?: SessionParams<"thread/list">): Promise<SessionThreadPageResult> {
		this.threadListRequests.push(params);
		return resolvePage(this.threadPages, params?.cursor ?? null, "thread/list");
	}

	async threadLoadedListPage(
		params?: SessionParams<"thread/loaded/list">,
	): Promise<SessionLoadedThreadPageResult> {
		this.loadedListRequests.push(params);
		return resolvePage(this.loadedPages, params?.cursor ?? null, "thread/loaded/list");
	}
}

function resolvePage<Page>(
	pages: ReadonlyMap<string | null, Page | Error>,
	cursor: string | null,
	method: string,
): Page {
	const page = pages.get(cursor);
	if (page === undefined) throw new Error(`${method} fixture has no page for ${String(cursor)}`);
	if (page instanceof Error) throw page;
	return page;
}

export function session(
	threads: ReadonlyMap<string | null, ThreadPageResponse>,
	loaded: ReadonlyMap<string | null, LoadedPageResponse>,
): ScriptedSession {
	return new ScriptedSession(threads, loaded);
}

export function currentEpoch(authority: IdentityAuthority): ThreadLinkCurrentEpoch {
	return { childId: authority.validator.childId, epoch: authority.validator.epoch };
}

export interface RecordOptions {
	readonly kind?: string;
	readonly rpc?: string | null;
	readonly status?: EpochOperationStatus;
	readonly outcome?: EpochOperationOutcome;
	readonly provenanceThreadId?: string | null;
}

export function operationRecord(
	authority: IdentityAuthority,
	threadId: ReturnType<IdentityAuthority["decoder"]["adoptThreadId"]> | null,
	operationId: string,
	options: RecordOptions = {},
): EpochOperationRecord {
	const epoch = currentEpoch(authority);
	return {
		correlation: { ...epoch, operationId },
		operation: {
			id: operationId,
			kind: options.kind ?? "link",
			rpc: options.rpc === undefined ? "thread/start" : options.rpc,
		},
		status: options.status ?? "committed",
		outcome: options.outcome ?? "delivered",
		provenance: {
			...epoch,
			threadId:
				options.provenanceThreadId === undefined
					? threadId
					: options.provenanceThreadId === null
						? null
						: authority.decoder.adoptThreadId(options.provenanceThreadId),
			turnId: null,
			threadSource: null,
			workspaceRoot: "/workspace/archboard",
			instructionHash: "1".repeat(64),
			manifestHash: "2".repeat(64),
			confirmedAtMs: 1,
		},
		reason: null,
		createdAtMs: 1,
		updatedAtMs: 1,
	};
}

export function target(
	authority: IdentityAuthority,
	rawThreadId: string,
	options: {
		readonly childId?: ThreadLinkTarget["childId"];
		readonly epoch?: ThreadLinkTarget["epoch"];
		readonly operationId?: string;
		readonly provenance?: ThreadLinkTarget["provenance"];
	} = {},
): ThreadLinkTarget {
	const id = authority.decoder.adoptThreadId(rawThreadId);
	return {
		threadId: id,
		childId: options.childId === undefined ? authority.validator.childId : options.childId,
		epoch: options.epoch === undefined ? authority.validator.epoch : options.epoch,
		...(options.operationId === undefined ? {} : { operationId: options.operationId }),
		...(options.provenance === undefined ? {} : { provenance: options.provenance }),
	};
}
