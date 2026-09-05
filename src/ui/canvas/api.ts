// Every server call the browser makes, in one place, so a pane and the shell
// disagree about nothing.

import type { BinaryFileData, LibraryItems } from "@excalidraw/excalidraw/types";

import {
	CodeTargetOpenFailureSchema,
	CodeTargetOpenSuccessSchema,
	OpenerSelectionReplySchema,
	OpenerSettingsReplySchema,
	OpenerTestReplySchema,
	type CodeTargetOpenFailure,
	type CodeTargetOpenReply,
	type CodeTargetOpenRequest,
	type OpenerSelection,
	type OpenerSelectionReply,
	type OpenerSettingsReply,
	type OpenerTestReply,
} from "@/shared/code-target";
import type { ChangeReport } from "@/ui/canvas/changes";
import {
	BoardConflictError,
	boardQuery,
	isRecord,
	json,
	mutation,
	post,
	strictReply,
	trustReply,
	type ReplySchema,
} from "@/ui/canvas/lib/http";
import type {
	BoardHold,
	BoardIdentity,
	BoardInfo,
	BoardListing,
	BoardPreviewSnapshot,
	BoardSaveResult,
	BrowserPaneListing,
	LockHolder,
	PersistedBoardListing,
	ServerElement,
} from "@/ui/types";

/**
 * The failure reported when the server's reply matches no schema.
 * @param error What went wrong reading it, when known.
 * @returns A `RESPONSE_INVALID` failure.
 */
function invalidReply(error?: unknown): CodeTargetOpenFailure {
	const detail = error instanceof Error ? ` ${error.message}` : "";
	return {
		success: false,
		code: "RESPONSE_INVALID",
		error: `RESPONSE_INVALID: The canvas server returned an invalid reply.${detail}`,
	};
}

/**
 * A code-target or opener reply, parsed strictly against its schema.
 * @param url The endpoint.
 * @param init Request options.
 * @param successSchema What a 2xx body must satisfy.
 * @returns The parsed success, or the shared failure.
 */
function codeTargetReply<T>(
	url: string,
	init: RequestInit | undefined,
	successSchema: ReplySchema<T>,
): Promise<T | CodeTargetOpenFailure> {
	return strictReply(url, init, successSchema, CodeTargetOpenFailureSchema, invalidReply);
}

/**
 * Ask the server to open a code-bound element in the configured opener.
 * @param request The board and element.
 * @returns The typed success or failure.
 */
function openCodeTarget(request: CodeTargetOpenRequest): Promise<CodeTargetOpenReply> {
	return codeTargetReply(
		"/api/code-targets/open",
		mutation("POST", request),
		CodeTargetOpenSuccessSchema,
	);
}

/**
 * Read the opener settings and the registered checkouts.
 * @returns The settings reply, or the shared failure.
 */
function fetchOpenerSettings(): Promise<OpenerSettingsReply | CodeTargetOpenFailure> {
	return codeTargetReply("/api/settings/opener", undefined, OpenerSettingsReplySchema);
}

/**
 * Persist an opener selection.
 * @param selection The selection to save.
 * @returns The saved selection, or the shared failure.
 */
function saveOpenerSettings(
	selection: OpenerSelection,
): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
	return codeTargetReply(
		"/api/settings/opener",
		mutation("PUT", selection),
		OpenerSelectionReplySchema,
	);
}

/**
 * Restore the platform default opener.
 * @returns The restored selection, or the shared failure.
 */
function resetOpenerSettings(): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
	return codeTargetReply("/api/settings/opener", { method: "DELETE" }, OpenerSelectionReplySchema);
}

/**
 * Launch a selection against a registered checkout without saving it.
 * @param selection The selection under test.
 * @param repository The registered checkout to open.
 * @returns The test outcome, or the shared failure.
 */
function testOpenerSettings(
	selection: OpenerSelection,
	repository: string,
): Promise<OpenerTestReply | CodeTargetOpenFailure> {
	return codeTargetReply(
		"/api/settings/opener/test",
		mutation("POST", { selection, repository }),
		OpenerTestReplySchema,
	);
}

/**
 * One board's elements.
 * @param board The board key.
 * @returns The elements as the server holds them.
 */
function fetchElements(board: string | null): Promise<{ elements: ServerElement[] }> {
	return json(`/api/elements${boardQuery(board)}`);
}

/**
 * The images one board draws. Board-scoped like the elements: an image belongs
 * to the board whose elements reference it (TASK-060).
 * @param board The board key.
 * @returns The files by id, when the board has any.
 */
function fetchFiles(board: string | null): Promise<{ files?: Record<string, BinaryFileData> }> {
	return json(`/api/files${boardQuery(board)}`);
}

/** What the server answers a change report with. */
interface ChangeReportReply {
	created: number;
	updated: number;
	deleted: number;
	count: number;
	/** Canonical changes made after input conversion and before persistence. */
	corrections: { upserts: ServerElement[]; deletes: string[] };
	/** The authoritative board fingerprint after persistence. */
	fingerprint: { elements: number; note: string; version: number | null };
	/** Only present for explicit held-board full-report recovery. */
	document?: ServerElement[];
	/** Set when this board has stopped saving: what is held, and the way out. */
	held?: BoardHold;
}

/** The wire shape of one change report. */
interface ChangeReportPayload {
	upserts: Record<string, unknown>[];
	deletes: string[];
	clientId: string;
	timestamp: string;
	fullReport?: true;
}

/**
 * The body of a change report.
 * @param report The computed delta.
 * @param clientId The reporting pane.
 * @param fullReport Whether this says "this is the whole board" (TASK-079).
 * @returns The JSON payload.
 */
function changeReportPayload(
	report: ChangeReport,
	clientId: string,
	fullReport: boolean,
): ChangeReportPayload {
	const payload: ChangeReportPayload = {
		upserts: report.upserts,
		deletes: report.deletes,
		clientId,
		timestamp: new Date().toISOString(),
	};
	// Only ever on a board that has stopped saving, and the server refuses it
	// anywhere else: it says "this is the whole board", which is the one thing
	// a pane is otherwise never allowed to say (TASK-016, TASK-079).
	if (fullReport) {
		payload.fullReport = true;
	}
	return payload;
}

/**
 * Tell the server what changed, and get a compact canonical acknowledgement.
 *
 * The board rides in the query string so that a switch landing mid-flight
 * files the change under the board it came from rather than the one now on
 * screen. Ordinary human reports never return the whole board; a held-board
 * full report keeps its explicit whole-document recovery answer.
 * @param board The board the delta is against.
 * @param report The computed delta.
 * @param clientId The reporting pane.
 * @param fullReport Whether this is a held-board full report.
 * @returns The server's acknowledgement.
 */
function reportChanges(
	board: string | null,
	report: ChangeReport,
	clientId: string,
	fullReport = false,
): Promise<ChangeReportReply> {
	return post(
		`/api/elements/changes${boardQuery(board)}`,
		changeReportPayload(report, clientId, fullReport),
	);
}

/**
 * Send a last delta as the page unloads, when the browser can.
 * @param board The board the delta is against.
 * @param report The computed delta.
 * @param clientId The reporting pane.
 * @returns Whether the browser accepted the beacon.
 */
function beaconChanges(board: string | null, report: ChangeReport, clientId: string): boolean {
	if (typeof navigator.sendBeacon !== "function") {
		return false;
	}
	const body = new Blob([JSON.stringify(changeReportPayload(report, clientId, false))], {
		type: "application/json",
	});
	return navigator.sendBeacon(`/api/elements/changes${boardQuery(board)}`, body);
}

/** What one pane tells the server it has in front of the human. */
interface PaneReport {
	clientId: string;
	paneId: string;
	board: string;
	primary: boolean;
	focused: boolean;
	elementCount: number;
	/** Where the pane is in the page, in CSS pixels. */
	rect: { x: number; y: number; width: number; height: number };
	/** Which part of the board is on screen, in scene coordinates. */
	viewport: { x: number; y: number; width: number; height: number; zoom: number };
	/** Which bundle this tab is running, so the canvas can say when it is old. */
	build?: string;
}

/** The server's answer to a pane report. */
interface PaneReply {
	success: true;
	registered: boolean;
	paneCount: number;
	/**
	 * Set when this tab is running a bundle the canvas no longer serves, i.e.
	 * somebody rebuilt the frontend after the tab was opened (TASK-056).
	 */
	staleFrontend?: { loaded: string | null; current: string | null; message: string | null };
}

/**
 * Tell the server what this pane currently shows: which board, where the pane
 * sits on the display, and what of the board is in view. Registration lives
 * exactly as long as this pane's socket.
 * @param pane The report.
 * @returns Whether the pane is registered, and whether the tab is stale.
 */
function reportPane(pane: PaneReport): Promise<PaneReply> {
	return post("/api/panes", pane);
}

/**
 * The entry script this tab loaded, hash and all, read off the served
 * document so the tab and the canvas read the same fact from the same place.
 * @returns The script URL, or undefined when the document names none.
 */
function loadedBundle(): string | undefined {
	const script = document.querySelector('script[type="module"][src]');
	return script?.getAttribute("src") ?? undefined;
}

/**
 * Publish this pane's selection so an agent can read it off server state.
 * @param elementIds The selected ids.
 * @param clientId The publishing pane.
 * @returns The acknowledgement.
 */
function publishSelection(
	elementIds: readonly string[],
	clientId: string,
): Promise<{ success: true }> {
	return post("/api/selection", { elementIds, clientId });
}

/**
 * Answer a browser capture request.
 * @param requestId The request being answered.
 * @param payload The rendered result or the error.
 * @returns The acknowledgement.
 */
function postBrowserCaptureResult(
	requestId: string,
	payload: Record<string, unknown>,
): Promise<{ success: true }> {
	return post("/api/browser/capture/result", { requestId, ...payload });
}

/**
 * Answer a viewport request.
 * @param requestId The request being answered.
 * @param payload The outcome or the error.
 * @returns The acknowledgement.
 */
function postViewportResult(
	requestId: string,
	payload: Record<string, unknown>,
): Promise<{ success: true }> {
	return post("/api/viewport/result", { requestId, ...payload });
}

/** The answer to a hold: who has the board now. */
interface HoldReply {
	held: boolean;
	/** Who has it: this pane on success, somebody else on a refusal. */
	holder: LockHolder | null;
}

/**
 * Read a hold reply body without trusting more of it than it must carry.
 * @param body The decoded body.
 * @returns The success flag and holder, when present.
 */
function holdReplyBody(body: unknown): { success: boolean; holder: LockHolder | null } {
	if (!isRecord(body)) {
		return { success: false, holder: null };
	}
	const holder = body["holder"];
	return {
		success: body["success"] === true,
		holder: isRecord(holder) ? trustReply<LockHolder>(holder) : null,
	};
}

/**
 * Take the board's mutex, or say again that this pane still has it (ADR 0016).
 * Deliberately not `json()`: a refusal here is an answer, not a failure.
 * @param board The board.
 * @param clientId This pane.
 * @returns Whether the board is held by this pane, and who has it otherwise.
 */
async function holdBoard(board: string | null, clientId: string): Promise<HoldReply> {
	const response = await fetch(
		`/api/boards/hold${boardQuery(board)}`,
		mutation("POST", { clientId }),
	);
	const body = holdReplyBody(await response.json().catch(() => ({})));
	if (response.ok && body.success) {
		return { held: true, holder: body.holder };
	}
	return { held: false, holder: body.holder };
}

/**
 * Give the board back. Best effort on purpose: the hold is a lease, so a
 * release that never arrives costs `LOCK_LEASE_MS` and not the board.
 * @param board The board.
 * @param clientId This pane.
 */
function releaseBoard(board: string | null, clientId: string): void {
	void fetch(`/api/boards/hold/release${boardQuery(board)}`, mutation("POST", { clientId })).catch(
		() => undefined,
	);
}

/**
 * Take a claimed board back from the agent that has it, and give it straight
 * back: the board goes to nobody, and the next gesture holds it as any gesture
 * does. Nothing already written is undone (ADR 0016).
 * @param board The board.
 * @param clientId This pane.
 * @returns Whether the board was taken.
 */
async function takeBoardBack(board: string | null, clientId: string): Promise<HoldReply> {
	const taken = await holdBoard(board, clientId);
	if (taken.held) {
		releaseBoard(board, clientId);
	}
	return taken;
}

/**
 * The one call that empties a board. Confirmed in the shell, never here.
 * `clientId` is what says this write is a person's (TASK-095).
 * @param board The board.
 * @param clientId The pane the person is working in.
 * @returns How many elements were removed.
 */
function clearBoard(board: string | null, clientId: string): Promise<{ count: number }> {
	const base = boardQuery(board);
	const query = `${base}${base === "" ? "?" : "&"}clientId=${encodeURIComponent(clientId)}`;
	return json(`/api/elements/clear${query}`, { method: "DELETE" });
}

/** The stencil palette as the server holds it. */
interface LibraryReply {
	items: LibraryItems;
	seeded: string[];
	file: string | null;
	vaultBacked: boolean;
}

/**
 * Read the stencil palette. Never board content.
 * @returns The library and where it lives.
 */
function fetchLibrary(): Promise<LibraryReply> {
	return json("/api/library");
}

/**
 * Write the whole palette, because Excalidraw reports the whole palette.
 * @param items The library items.
 * @returns How many were written and where.
 */
function putLibrary(
	items: LibraryItems,
): Promise<{ count: number; file: string | null; vaultBacked: boolean }> {
	return json("/api/library", mutation("PUT", { items }));
}

/**
 * One board's identity and save state. Named, always (ADR 0009).
 * @param board The board key.
 * @returns The board's info.
 */
function fetchBoardInfo(board: string): Promise<BoardInfo & { success: true }> {
	return json(`/api/boards/info?board=${encodeURIComponent(board)}`);
}

/**
 * The persisted boards and the live pane inventory, as the navigator reads them.
 * @returns The combined listing.
 */
async function fetchBoards(): Promise<BoardListing> {
	const [persisted, browser] = await Promise.all([
		json<PersistedBoardListing>("/api/boards"),
		json<BrowserPaneListing>("/api/panes"),
	]);
	const open = new Map<string, BoardListing["open"][number]>();
	for (const pane of browser.panes) {
		open.set(pane.board, {
			key: pane.board,
			identity: pane.identity,
			elementCount: pane.elementCount,
		});
	}
	return {
		vault: persisted.vault,
		boards: persisted.boards,
		open: [...open.values()],
		onScreen: browser.panes.map(({ paneId, place, board }) => ({ paneId, place, board })),
	};
}

/**
 * A read-only scene for the navigator; rendering stays in the browser.
 * @param board The board key.
 * @param signal Cancels the request.
 * @returns The preview snapshot.
 */
function fetchBoardPreview(
	board: string,
	signal?: AbortSignal,
): Promise<BoardPreviewSnapshot & { success: true }> {
	return json(
		`/api/boards/preview?board=${encodeURIComponent(board)}`,
		signal === undefined ? {} : { signal },
	);
}

/** What `openBoard` asks for; `pane` is required once more than one is open. */
type OpenBoardRequest = Partial<BoardIdentity> & { board: string; reload?: boolean; pane?: string };

/**
 * Point a pane at a board.
 * @param address The board and the pane to show it in.
 * @returns The opened board.
 */
function openBoard(address: OpenBoardRequest): Promise<BoardInfo> {
	return post("/api/boards/open", address);
}

/**
 * Create a board.
 * @param address The new board's identity.
 * @returns The created board.
 */
function newBoard(address: Partial<BoardIdentity> & { board: string }): Promise<BoardInfo> {
	return post("/api/boards/new", address);
}

/** What `saveBoard` asks for. */
interface SaveRequest {
	/** Which board to write. Required: the server has no default (ADR 0009). */
	board: string;
	/** The pane the person pressed Save in: what makes this a person's write (TASK-095). */
	clientId?: string;
	name?: string;
	variant?: string;
	level?: string;
	/** The human's "overwrite it anyway", never the shell's own initiative. */
	force?: boolean;
}

/**
 * Save a board. Throws `BoardConflictError` when the note at the destination
 * is not ours to overwrite (ADR 0006).
 * @param as What to write and where.
 * @returns What the save did (ADR 0012).
 */
function saveBoard(as: SaveRequest): Promise<BoardSaveResult> {
	return post("/api/boards/save", as);
}

export {
	BoardConflictError,
	type ChangeReportReply,
	type HoldReply,
	type LibraryReply,
	type OpenBoardRequest,
	type PaneReply,
	type PaneReport,
	type SaveRequest,
	beaconChanges,
	clearBoard,
	fetchBoardInfo,
	fetchBoardPreview,
	fetchBoards,
	fetchElements,
	fetchFiles,
	fetchLibrary,
	fetchOpenerSettings,
	holdBoard,
	loadedBundle,
	newBoard,
	openBoard,
	openCodeTarget,
	postBrowserCaptureResult,
	postViewportResult,
	publishSelection,
	putLibrary,
	releaseBoard,
	reportChanges,
	reportPane,
	resetOpenerSettings,
	saveBoard,
	saveOpenerSettings,
	takeBoardBack,
	testOpenerSettings,
};
