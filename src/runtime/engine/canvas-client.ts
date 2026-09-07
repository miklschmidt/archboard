// The typed surface the CLI talks to the canvas server through.
//
// Element writes are here, because they are what the CLI mostly does and what
// ADR 0015 and ADR 0016 have most to say about. The rest of the surface is
// beside it: `lib/canvas-client-boards.ts` for a board's identity and its
// claim, `lib/canvas-client-view.ts` for what is on screen and the pictures
// made from it.
//
// One request goes through `lib/canvas-client-transport.ts`, which owns the
// identity gate and the error shapes; what this invocation says about itself —
// which board, what it is doing, which version it believes it is editing —
// lives in `lib/canvas-client-session.ts` and rides on every request from
// there rather than from thirty call sites.

import { ENABLE_CANVAS_SYNC, EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import { logger } from "@/runtime/engine/logger";
import type { ServerElement } from "@/runtime/engine/types";
import type { BoardWriteConflict } from "@/runtime/engine/board-version";
import { SCENE_REPLACEMENT_MARKER } from "@/runtime/engine/board-write";
import {
	type ApiResponse,
	type BoardFingerprint,
	type ElementInput,
	type WriteAnswer,
	type WriteOptions,
	postingJson,
} from "@/runtime/engine/lib/canvas-client-answers";
import {
	type BoardIdentityPayload,
	type BoardListResponse,
	type BoardResponse,
	type ClaimReleaseReply,
	type ClaimReply,
	type PaneRef,
	boardHeading,
	claimBoard,
	compareBoardsOnCanvas,
	getBoardInfo,
	listBoardsOnCanvas,
	newBoard,
	openBoard,
	releaseBoardClaim,
	saveBoard,
} from "@/runtime/engine/lib/canvas-client-boards";
import {
	type BoardRefusal,
	BOARD_REFUSAL_CODES,
	isBoardRefusal,
} from "@/runtime/engine/lib/canvas-client-refusal";
import {
	addQuery,
	boardHoldSeen,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	forgetVersionsSeen,
	rememberVersion,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	withBoard,
	withWriteClaims,
} from "@/runtime/engine/lib/canvas-client-session";
import {
	CANVAS_SERVICE_NAME,
	assertCanvasIdentity,
	foreignServiceError,
	isConnectionFailure,
	markCanvasIdentityVerified,
	requestJson,
	responseError,
} from "@/runtime/engine/lib/canvas-client-transport";
import {
	type BoardRenderResponse,
	type FindingExportResponse,
	type HealthStatus,
	type LibraryResponse,
	type PaneAddress,
	type PaneLayoutResponse,
	captureBrowser,
	closePane,
	exportFindings,
	getFiles,
	getHealth,
	getLibrary,
	getPanes,
	getSelection,
	getSnapshot,
	getSyncStatus,
	listSnapshots,
	openPane,
	postFiles,
	renderBoard,
	saveSnapshot,
	setViewport,
} from "@/runtime/engine/lib/canvas-client-view";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * The refusal behind an error, when the canvas turned a board write away.
 * @param error The thrown value.
 * @returns The refusal, or null.
 */
export function boardRefusalOf(error: unknown): BoardRefusal | null {
	const refusal = isRecord(error) ? error["refusal"] : undefined;
	return isBoardRefusal(refusal) ? refusal : null;
}

/**
 * A refusal as the CLI prints it: the unchanged reason first, then every
 * structured fact from the same body.
 * @param error The thrown value.
 * @returns The text, or null when the error is not a refusal.
 */
export function formatBoardRefusal(error: unknown): string | null {
	const refusal = boardRefusalOf(error);
	if (!refusal) {
		return null;
	}
	const { success: _success, error: reason, ...details } = refusal;
	return `${reason}\n\n${JSON.stringify(details, null, 2)}`;
}

/**
 * A save the server refused because the destination changed underneath it.
 * @param error The thrown value.
 * @returns The conflict, or null.
 */
export function boardConflictOf(error: unknown): BoardWriteConflict | null {
	const conflict = isRecord(error) ? error["conflict"] : undefined;
	if (!isRecord(conflict)) {
		return null;
	}
	// The canvas's own conflict block, put on the error by responseError; there
	// is no second description of it to check against.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the canvas's declared conflict shape
	return conflict as unknown as BoardWriteConflict;
}

/**
 * The elements as the caller sent them, for the sync-disabled paths that echo
 * their input rather than reaching a canvas.
 * @param elementsData The elements the caller sent.
 * @returns The same elements, as the board would hold them.
 */
function echoed(elementsData: Array<ElementInput | ServerElement>): WriteAnswer {
	return {
		// Nothing validates these because nothing persists them: with sync off
		// there is no board for them to land on, and the caller is handed back
		// what it sent.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller's own input, echoed
		elements: elementsData.map((element) => ({ ...element }) as ServerElement),
	};
}

/**
 * One batch answer, parsed whatever the status was: a refusal says which
 * version the board is at, and that is the answer the next write needs.
 * @param response The answer.
 * @param url What was asked for, for the log line.
 * @returns The answer body.
 * @throws {Error} When the answer was not ok.
 */
async function batchAnswer(response: Response, url: string): Promise<ApiResponse> {
	const data: unknown = await response.json();
	rememberVersion(data);
	if (!response.ok) {
		logger.warn(`Canvas sync returned error status: ${response.status}`, { url });
		throw responseError(data, response);
	}
	logger.debug("Canvas batch sync succeeded", { url });
	// The batch route's own answer shape, which is what this returns.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the route's declared answer shape
	return data as ApiResponse;
}

/**
 * What a thrown value says about itself.
 * @param error The thrown value.
 * @returns Its message, or the value as text.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// The legacy direct batch caller treats a connection failure as no canvas.
// The CLI uses the strict wrappers below and receives hard failures instead.
/**
 * Send one batch through the legacy direct path.
 * @param data The elements to write.
 * @param write Whether to ask for the whole board back.
 * @returns The answer, or null when sync is off or the canvas is unreachable.
 * @throws {Error} When the canvas answers with a failure.
 */
async function syncBatchToCanvas(
	data: Array<ElementInput | ServerElement>,
	write: WriteOptions = {},
): Promise<ApiResponse | null> {
	if (!ENABLE_CANVAS_SYNC) {
		logger.debug("Canvas sync disabled, skipping");
		return null;
	}
	// Only when the caller said so: a write answers with what it touched, and
	// the board itself is 60,000 tokens at 300 elements (TASK-075).
	const boardPath = withBoard("/api/elements/batch");
	const path = write.document ? addQuery(boardPath, "document", 1) : boardPath;
	const url = `${EXPRESS_SERVER_URL}${withWriteClaims(path, "POST")}`;
	try {
		await assertCanvasIdentity();
		logger.debug("Syncing batch to canvas", { url, data });
		const response = await fetch(url, postingJson({ elements: data }));
		return await batchAnswer(response, url);
	} catch (error) {
		logger.warn("Canvas batch sync failed:", messageOf(error));
		if (isConnectionFailure(error)) {
			return null;
		}
		throw error;
	}
}

/**
 * Write a batch through the legacy direct path.
 * @param elementsData The elements to write.
 * @param options Whether to ask for the whole board back.
 * @returns The answer, or null when the canvas could not confirm the batch landed.
 */
export async function batchCreateElementsOnCanvas(
	elementsData: Array<ElementInput | ServerElement>,
	options: WriteOptions = {},
): Promise<WriteAnswer | null> {
	if (!ENABLE_CANVAS_SYNC) {
		return echoed(elementsData);
	}
	const result = await syncBatchToCanvas(elementsData, options);
	return result?.elements ? result : null;
}

/**
 * Replace one board scene through the existing atomic batch write.
 * @param elementsData The scene's elements.
 * @param filesData The scene's files.
 * @returns The answer, or null when nothing came back.
 */
export async function replaceSceneOnCanvas(
	elementsData: Array<ElementInput | ServerElement>,
	filesData: readonly unknown[],
): Promise<WriteAnswer | null> {
	if (!ENABLE_CANVAS_SYNC) {
		return echoed(elementsData);
	}
	const result = await requestJson<WriteAnswer>(
		"/api/elements/batch",
		postingJson({
			elements: elementsData,
			files: filesData,
			mutation: SCENE_REPLACEMENT_MARKER,
		}),
	);
	return result.elements ? result : null;
}

/**
 * Every element on the board.
 * @returns The elements, empty when the board has none.
 */
export async function getElements(): Promise<ServerElement[]> {
	const data = await requestJson<ApiResponse>("/api/elements");
	return data.elements ?? [];
}

/**
 * The elements matching a query.
 * @param queryParams The search terms, as the search route spells them.
 * @returns The matching elements.
 */
export async function searchElements(queryParams: URLSearchParams): Promise<ServerElement[]> {
	const data = await requestJson<ApiResponse>(`/api/elements/search?${queryParams}`);
	return data.elements ?? [];
}

/**
 * Empty the board.
 * @returns What the canvas said about the clearing.
 */
export async function clearCanvas(): Promise<ApiResponse> {
	return requestJson<ApiResponse>("/api/elements/clear", { method: "DELETE" });
}

export interface BridgeWriteResponse extends WriteAnswer {
	success: true;
	board: string;
	bridgeId: string;
	overConnectorId: string;
	underConnectorId: string;
	overSegmentIndex: number;
	underSegmentIndex: number;
	crossing: { x: number; y: number };
	elements: [ServerElement, ServerElement];
}

export interface BridgeRemovalResponse extends WriteAnswer {
	success: true;
	board: string;
	bridgeId: string;
	deleted: [string, string];
	elements: [];
}

/** Which connector hops over which, and where. */
export interface BridgeInput {
	over: string;
	under: string;
	background: string;
	/** Where to put the hop, when the crossing is not the obvious one. */
	at?: { x: number; y: number };
}

/**
 * Hop one connector over another where they cross.
 * @param input Which connector goes over which.
 * @returns The two elements the hop is drawn from.
 */
export async function createBridge(input: BridgeInput): Promise<BridgeWriteResponse> {
	return requestJson<BridgeWriteResponse>("/api/bridges", postingJson(input));
}

/**
 * Remove one connector hop.
 * @param bridgeId The hop's id.
 * @returns What the canvas deleted.
 */
export async function removeBridge(bridgeId: string): Promise<BridgeRemovalResponse> {
	return requestJson<BridgeRemovalResponse>(`/api/bridges/${encodeURIComponent(bridgeId)}`, {
		method: "DELETE",
	});
}

/**
 * Send a Mermaid diagram to the pane holding this call's board.
 *
 * No pane argument, on purpose. Conversion runs in a pane and the elements
 * land on the board that pane holds, so the board already decides which pane
 * (ADR 0009, TASK-046).
 * @param mermaidDiagram The diagram source.
 * @param config Mermaid's own configuration for the conversion.
 * @returns What was drawn, and the pane it went to — the half of the screen
 * the diagram is about to appear on.
 */
export async function sendMermaid(
	mermaidDiagram: string,
	config?: Record<string, unknown>,
): Promise<ApiResponse & { board?: string; count?: number; ids?: string[] }> {
	return requestJson("/api/elements/from-mermaid", postingJson({ mermaidDiagram, config }));
}

// ---- Change feed -------------------------------------------------------
//
// Semantic changes since a cursor. Read-only, and cheap enough to poll: the
// server holds the events, so this never re-transmits the board.
export interface ChangeFeedResponse {
	success: boolean;
	board: string;
	feedId?: string;
	cursor: number;
	since?: string;
	events: Array<Record<string, unknown>>;
	coalesced?: Record<string, unknown> | null;
	truncated?: boolean;
	message?: string;
	feed?: Record<string, unknown>;
}

/** Where to read the change feed from, and how much detail to read. */
export interface ChangeFeedQuery {
	since?: number;
	board?: string;
	coalesce?: boolean;
	detail?: boolean;
}

/**
 * What has happened to a board since a cursor.
 * @param params Where to read from and how much detail to read.
 * @returns The events and the cursor to read from next.
 */
export async function getChanges(params: ChangeFeedQuery): Promise<ChangeFeedResponse> {
	const query = new URLSearchParams();
	query.set("since", String(params.since ?? 0));
	if (params.board) {
		query.set("board", params.board);
	}
	if (params.coalesce) {
		query.set("coalesce", "1");
	}
	if (params.detail) {
		query.set("detail", "1");
	}
	return requestJson<ChangeFeedResponse>(`/api/changes?${query.toString()}`);
}

// ---- Strict CRUD variants (throw on failure) ----
// The direct batch wrapper above swallows connection failures for its legacy
// caller; the CLI wants hard failures with real error messages instead.

/**
 * Create one element.
 * @param element The element to create.
 * @returns The element as the board now holds it.
 * @throws {Error} When the canvas answers without one.
 */
export async function createElementStrict(element: ElementInput): Promise<ServerElement> {
	const data = await requestJson<ApiResponse>("/api/elements", postingJson(element));
	if (!data.element) {
		throw new Error("The canvas created no element");
	}
	return data.element;
}

/**
 * Replace one element.
 * @param element The element, which must name the id it replaces.
 * @param options Whether to ask for the whole board back.
 * @returns The element as the board now holds it.
 * @throws {Error} When the canvas answers without one.
 */
export async function updateElementStrict(
	element: ElementInput & { id: string },
	options: WriteOptions = {},
): Promise<WriteAnswer & { element: ServerElement }> {
	const data = await requestJson<ApiResponse & WriteAnswer>(
		`/api/elements/${element.id}${options.document ? "?document=1" : ""}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(element),
		},
	);
	if (!data.element) {
		throw new Error(`The canvas returned no element for ${element.id}`);
	}
	return { ...data, element: data.element };
}

/**
 * Delete one element.
 * @param id Which element.
 * @returns What the canvas deleted.
 */
export async function deleteElementStrict(id: string): Promise<ApiResponse> {
	return requestJson<ApiResponse>(`/api/elements/${id}`, { method: "DELETE" });
}

/**
 * One element by id.
 * @param id Which element.
 * @returns The element.
 * @throws {Error} When the board holds no such element.
 */
export async function getElementStrict(id: string): Promise<ServerElement> {
	const data = await requestJson<ApiResponse>(`/api/elements/${id}`);
	if (!data.element) {
		throw new Error(`Element ${id} not found`);
	}
	return data.element;
}

/** What one intent does to the board, as one write. */
export interface ElementChanges {
	upserts?: ElementInput[];
	deletes?: string[];
	/** Ask for the whole board back. Off by default; see BoardFingerprint. */
	document?: boolean;
}

export interface ElementChangesResult {
	success: boolean;
	board: string;
	created: number;
	updated: number;
	deleted: number;
	count: number;
	appliedAt: string;
	/**
	 * Every element the write touched, in the form the board now holds it —
	 * including what the server made and the caller never named: minted ids,
	 * a text element expanded from a `label` seed, arrows it re-routed.
	 */
	elements: ServerElement[];
	fingerprint: BoardFingerprint;
	/** The whole board, and only when it was asked for. */
	document?: ServerElement[];
}

/**
 * One intent, one write.
 *
 * Everything an agent does to several elements at once — aligning them,
 * distributing them, locking them, grouping them, applying a patch — arrives
 * here as a single request. It used to arrive as one HTTP write per element,
 * which is merely wasteful today and is lost updates once the note is the only
 * copy of the board and every write is a read-modify-write cycle against it
 * (ADR 0015), or nineteen gaps in a lock somebody else can write into
 * (ADR 0016).
 *
 * `origin: agent` is stated here, in the one place agent writes go through, so
 * no caller can forget it and have its own drawing narrated back at it.
 * @param changes What to write and what to delete.
 * @returns What the write did.
 */
export async function applyElementChanges(changes: ElementChanges): Promise<ElementChangesResult> {
	return requestJson<ElementChangesResult>(
		"/api/elements/changes",
		postingJson({
			upserts: changes.upserts ?? [],
			deletes: changes.deletes ?? [],
			origin: "agent",
			...(changes.document ? { document: true } : {}),
		}),
	);
}

/**
 * Write a batch, failing hard rather than swallowing an unreachable canvas.
 * @param elements The elements to write.
 * @param options Whether to ask for the whole board back.
 * @returns What the write touched.
 */
export async function batchCreateElementsStrict(
	elements: Array<ElementInput | ServerElement>,
	options: WriteOptions = {},
): Promise<WriteAnswer & { elements: ServerElement[] }> {
	const data = await requestJson<ApiResponse & WriteAnswer>(
		`/api/elements/batch${options.document ? "?document=1" : ""}`,
		postingJson({ elements }),
	);
	return { ...data, elements: data.elements ?? [] };
}

export {
	type ApiResponse,
	type BoardFingerprint,
	type BoardIdentityPayload,
	type BoardListResponse,
	type BoardRefusal,
	type BoardRenderResponse,
	type BoardResponse,
	type ClaimReleaseReply,
	type ClaimReply,
	type ElementInput,
	type FindingExportResponse,
	type HealthStatus,
	type LibraryResponse,
	type PaneAddress,
	type PaneLayoutResponse,
	type PaneRef,
	type WriteAnswer,
	type WriteOptions,
	BOARD_REFUSAL_CODES,
	CANVAS_SERVICE_NAME,
	boardHeading,
	boardHoldSeen,
	captureBrowser,
	claimBoard,
	closePane,
	compareBoardsOnCanvas,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	exportFindings,
	foreignServiceError,
	forgetVersionsSeen,
	getBoardInfo,
	getFiles,
	getHealth,
	getLibrary,
	getPanes,
	getSelection,
	getSnapshot,
	getSyncStatus,
	listBoardsOnCanvas,
	listSnapshots,
	markCanvasIdentityVerified,
	newBoard,
	openBoard,
	openPane,
	postFiles,
	releaseBoardClaim,
	renderBoard,
	saveBoard,
	saveSnapshot,
	setExpectedVersion,
	setRequestedBoard,
	setViewport,
	setWriteDoing,
};
