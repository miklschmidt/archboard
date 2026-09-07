import type { Request, Response } from "express";
import { z } from "zod";
import { boards, SCRATCH_KEY } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { readBoardContent, resolveBoard, resolveInstalledBoard } from "@/runtime/engine/board-io";
import type { BoardContent, ResolvedBoard, ResolvedBoardNote } from "@/runtime/engine/board-io";
import { boardKey, makeIdentity, parseBoardKey, validateLevel } from "@/runtime/engine/board";
import type { BoardIdentity } from "@/runtime/engine/board";
import { recordLockCommit } from "@/runtime/engine/board-lock";
import type { LockHolder } from "@/runtime/engine/board-lock";
import { writeBoard } from "@/runtime/engine/board-write";
import type { BoardWriteRequest, BoardWriteTarget } from "@/runtime/engine/board-write";
import { checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { broadcast } from "@/server/canvas/lib/pane-registry";

/**
 * Whether a value is a plain object that can be read by key.
 * @param value Anything a request carried.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A request's parsed body as a record, or an empty one when there is no body
 * or the body is not an object. Express types the body as `any`; this is the
 * one place that is narrowed.
 * @param req The request.
 * @returns The body's fields.
 */
function bodyOf(req: Request): Record<string, unknown> {
	const body: unknown = req.body;
	return isRecord(body) ? body : {};
}

/**
 * One string field of a request body, or undefined when it is absent or not a string.
 * @param req The request.
 * @param name The field.
 * @returns The string.
 */
function bodyString(req: Request, name: string): string | undefined {
	const value = bodyOf(req)[name];
	return typeof value === "string" ? value : undefined;
}

/**
 * One string query parameter, or undefined when it is absent or repeated.
 * @param req The request.
 * @param name The parameter.
 * @returns The string.
 */
function queryString(req: Request, name: string): string | undefined {
	const value = req.query[name];
	return typeof value === "string" ? value : undefined;
}

/**
 * Whether one query or body flag was switched on.
 * @param value The raw value.
 * @returns True for `true`, `"1"` and `"true"`.
 */
function isFlagOn(value: unknown): boolean {
	return value === true || value === "1" || value === "true";
}

/**
 * Which board a request says it is about, before anything resolves its note:
 * `?board=` or a `board` field in the body. The write boundary uses the
 * resolved key to find the per-board lock.
 * @param req The request.
 * @returns The board as the caller spelled it, or undefined when none was named.
 */
function boardOfRequest(req: Request): string | undefined {
	return queryString(req, "board") ?? bodyString(req, "board");
}

/**
 * Which board a request is about, and what is on it. One of `?board=` or a
 * `board` body field has to be there: a request that names no board is refused
 * (ADR 0009), and `what` names the operation so the refusal can say what it
 * was that needed a board.
 *
 * The note is read here, once, and the request works against what it read. That
 * read is what makes the vault the truth (ADR 0015): there is no map to consult
 * instead, so the answer cannot be a copy that stopped agreeing with the note.
 * @param req The request.
 * @param what The operation, for the refusal.
 * @returns The board's key, state and freshly read content.
 */
function boardFromRequest(
	req: Request,
	what?: string,
): { key: string; board: BoardState; content: BoardContent } {
	return resolveBoard(boardOfRequest(req), what);
}

/** The board the write boundary resolved under the lock, so the route reuses that exact load. */
const resolvedBoardWrites = new WeakMap<Request, ResolvedBoard>();

/**
 * Resolve a write's board without reading its note ahead of the write entry.
 * @param req The request.
 * @param what The operation, for the refusal.
 * @returns The board the write targets.
 */
function boardTargetFromRequest(req: Request, what?: string): BoardWriteTarget {
	const prepared = resolvedBoardWrites.get(req);
	const asked = boardOfRequest(req);
	const key = asked ? boardKey(parseBoardKey(asked)) : "";
	if (prepared?.key === key) {
		return { key: prepared.key, board: prepared.board };
	}
	const { key: resolvedKey, board } = resolveInstalledBoard(asked, what, { write: true });
	return { key: resolvedKey, board };
}

/**
 * Did this caller ask for the whole board? Off unless said, on every surface.
 * @param req The request.
 * @returns True when `document` was switched on in the query or body.
 */
function wantsDocument(req: Request): boolean {
	return isFlagOn(req.query["document"] ?? bodyOf(req)["document"]);
}

/** What a board write learned at the write boundary, for the route that answers it. */
interface WriteBoundaryContext {
	writerKind: "human" | "agent";
	lockKey?: string;
	lockToken?: string;
	lockHolder?: LockHolder;
	/** Set once the write persisted; null when the note carries no version. */
	writtenVersion?: number | null;
}

const writeBoundaryContexts = new WeakMap<Response, WriteBoundaryContext>();

/**
 * The write-boundary context of a response, created on first use.
 * @param res The response.
 * @returns Its context.
 */
function writeContextOf(res: Response): WriteBoundaryContext {
	const existing = writeBoundaryContexts.get(res);
	if (existing) {
		return existing;
	}
	const created: WriteBoundaryContext = { writerKind: "human" };
	writeBoundaryContexts.set(res, created);
	return created;
}

/**
 * Send one board-write answer and retain the version it already produced.
 * @param res The response.
 * @param request The write, as the route describes it.
 */
function answerBoardWrite<T>(res: Response, request: BoardWriteRequest<T>): void {
	const afterPersist = request.afterPersist;
	const context = writeContextOf(res);
	const sourceLockHolder = context.lockKey === request.source.key ? context.lockHolder : undefined;
	res.json(
		writeBoard(
			{
				...request,
				...(sourceLockHolder === undefined ? {} : { sourceLockHolder }),
				checkoutSnapshot: checkoutSnapshotFor(res),
				/**
				 * Record the persisted version and lock commit before the route's own hook runs.
				 * @param persisted What the write produced.
				 */
				afterPersist: (persisted) => {
					if (persisted.written) {
						context.writtenVersion = persisted.written.version;
						if (
							context.lockKey !== undefined &&
							context.lockToken !== undefined &&
							persisted.target.key === context.lockKey
						) {
							recordLockCommit(context.lockKey, context.lockToken, persisted.written.hash);
						}
					}
					afterPersist?.(persisted);
				},
			},
			broadcast,
		),
	);
}

const BoardAddressSchema = z.object({
	board: z.string().min(1),
	variant: z.string().optional(),
	level: z.string().optional(),
});

/** A board opened ahead of its route by the checkout middleware, from the exact note it read. */
interface PreparedBoardOpen {
	readonly key: string;
	readonly resolution: ResolvedBoardNote;
	readonly reload: boolean;
}

const preparedBoardOpens = new WeakMap<Request, PreparedBoardOpen>();

/**
 * A board address as callers write it: "payments", "payments@proposed", or a
 * name plus an explicit variant. The key form is what a human says and what
 * `board list` prints, so it is accepted everywhere a board is named.
 * @param params The address fields.
 * @param params.board The board's name, or a key spelling both name and variant.
 * @param params.variant The variant, when it is given separately.
 * @param params.level The abstraction level, when the caller states one.
 * @returns The board identity.
 */
function identityFromParams(params: {
	board: string;
	variant?: string;
	level?: string;
}): BoardIdentity {
	const base = params.variant
		? makeIdentity({ board: params.board, variant: params.variant })
		: parseBoardKey(params.board);
	return { ...base, ...(params.level ? { level: validateLevel(params.level) } : {}) };
}

/**
 * The identity of a board named by an address schema result.
 * @param address The parsed address.
 * @returns The board identity.
 */
function identityFromAddress(address: z.infer<typeof BoardAddressSchema>): BoardIdentity {
	return identityFromParams({
		board: address.board,
		...(address.variant === undefined ? {} : { variant: address.variant }),
		...(address.level === undefined ? {} : { level: address.level }),
	});
}

/**
 * One board's identity and save state, as every board answer reports it.
 * `content` is passed by callers that have already read the note, which is
 * every route that answers about a board it just touched; the default is for
 * the ones that have not.
 * @param key The board key.
 * @param board The open board.
 * @param content Its content, when the caller has read it already.
 * @returns The identity fields of the answer.
 */
function identityResponse(key: string, board: BoardState, content?: BoardContent) {
	const read = content ?? readBoardContent(board);
	return {
		board: key,
		identity: board.identity,
		elementCount: read.elements.size,
		// Which edit of the board this is, so a writer can state a precondition on
		// its first write rather than having to make one to find out (TASK-091).
		// Null for a note archboard has not written yet, and for one whose own
		// `version` key holds something that is not a count.
		version: read.version ?? null,
		// Scratch has a note like every other board; what it has not got is a name
		// anybody chose. See boardSummaries().
		placeholder: key === SCRATCH_KEY,
		...(board.file ? { file: board.file } : {}),
		...(board.savedAt ? { savedAt: board.savedAt } : {}),
		...(board.loadedAt ? { loadedAt: board.loadedAt } : {}),
	};
}

/**
 * The message of a thrown value, for an answer that quotes it.
 * @param error Whatever was thrown.
 * @returns Its message, or its string form for a non-Error.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether a board is one this canvas has open.
 * @param key The board key.
 * @returns The open board, or undefined.
 */
function openBoard(key: string): BoardState | undefined {
	return boards.get(key);
}

export {
	answerBoardWrite,
	BoardAddressSchema,
	boardFromRequest,
	boardOfRequest,
	boardTargetFromRequest,
	bodyOf,
	bodyString,
	identityFromAddress,
	identityFromParams,
	identityResponse,
	isFlagOn,
	isRecord,
	messageOf,
	openBoard,
	preparedBoardOpens,
	queryString,
	resolvedBoardWrites,
	wantsDocument,
	writeContextOf,
};
export type { PreparedBoardOpen, WriteBoundaryContext };
