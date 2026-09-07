// Board-level calls: identity, listing, opening, saving, comparing, and
// claiming a board for longer than one write.
//
// The canvas server owns the vault I/O: it holds the store, so making it read
// and write the notes keeps the whole scene off the wire on every save and
// means the CLI and browser get the same answer.

import type { Claim } from "@/runtime/engine/board-lock";
import type { CompareResult } from "@/runtime/engine/compare";
import { postingJson } from "@/runtime/engine/lib/canvas-client-answers";
import { requestJson } from "@/runtime/engine/lib/canvas-client-transport";

interface BoardIdentityPayload {
	board: string;
	variant: string;
	level?: string;
	displayName?: string;
}

interface PaneRef {
	paneId: string;
	clientId: string;
	/** "left", "right", "the only pane" — how a human points at it. */
	place: string;
	position: number;
}

interface BoardResponse {
	success: boolean;
	board: string;
	identity: BoardIdentityPayload;
	elementCount: number;
	vaultBacked: boolean;
	file?: string;
	savedAt?: string;
	loadedAt?: string;
	source?: "vault" | "memory";
	created?: boolean;
	saved?: boolean;
	elements?: number;
	overwrote?: boolean;
	forced?: boolean;
	declaredKey?: string;
	/** Where the board landed, when the act was one that put it on screen. */
	pane?: PaneRef | null;
	/**
	 * What a save did to the address (ADR 0012): wrote the board back to its own
	 * note, gave the scratch board its first home, or branched a board that
	 * already had one.
	 */
	saveKind?: "same-board" | "named" | "branch";
	/** The board the save read from, which is only interesting when it differs. */
	savedFrom?: string;
	/**
	 * Set when this save was one of the two outcomes that end a hold: the board
	 * had stopped saving because its note changed underneath, and this write is
	 * what un-sticks it (ADR 0006, TASK-079). `overwrite` put the held copy over
	 * the note; `elsewhere` put it in a note of its own and left theirs alone.
	 */
	resolvedHold?: {
		board: string;
		outcome: "overwrite" | "elsewhere";
		/** How many changes were riding on the choice that was just made. */
		writes: number;
		since: string;
	};
}

interface BoardListEntry {
	key: string;
	identity: BoardIdentityPayload;
	file?: string;
	declaredKey?: string;
	collidesWith?: string[];
	// With ?repo=, each entry also carries the nodes bound to that repository.
	nodes?: Array<{
		node: string;
		kind?: string;
		name?: string;
		path: string;
		branch?: string;
		commit?: string;
	}>;
}

interface BoardListResponse {
	success: boolean;
	vault: string;
	boards: BoardListEntry[];
	/** Set when the listing was narrowed to one repository (TASK-030). */
	repo?: string;
	scanned?: number;
	unreadable?: Array<{ file: string; reason: string }>;
}

/** Which board to put on screen, and where. */
interface OpenBoardParams {
	board: string;
	variant?: string;
	level?: string;
	reload?: boolean;
	/** Which pane to show it in: left, right, 1, focused, a pane id… */
	pane?: string;
}

/** The identity a board is started under. */
interface NewBoardParams {
	board: string;
	variant?: string;
	level?: string;
}

/** Where a save puts the board. */
interface SaveBoardParams {
	name?: string;
	variant?: string;
	level?: string;
	board?: string;
	/**
	 * Overwrite a destination archboard has not seen. The human's call, never
	 * archboard's — see ADR 0006.
	 */
	force?: boolean;
}

/** Which two boards a comparison is between. */
interface CompareBoardsParams {
	from: string;
	to?: string;
}

/** How long a claim stands, and what it is for. */
interface ClaimParams {
	reason: string;
	forMs?: number;
}

interface ClaimReply {
	success: boolean;
	board: string;
	claim: Claim;
	/** False when this extended a claim that was already standing. */
	created: boolean;
}

interface ClaimReleaseReply {
	success: boolean;
	board: string;
	released: boolean;
	claim: Claim | null;
}

/**
 * One POST to a board route.
 * @param path The route.
 * @param body What to send.
 * @returns What the canvas said about the board.
 */
async function postBoard(path: string, body: object): Promise<BoardResponse> {
	return requestJson<BoardResponse>(path, postingJson(body));
}

/**
 * One board's identity and save state. There is no "the current board" to ask
 * about: the board is named, like everywhere else (ADR 0009).
 * @returns What the canvas says about this call's board.
 */
async function getBoardInfo(): Promise<BoardResponse> {
	return requestJson<BoardResponse>("/api/boards/info");
}

/**
 * One line naming the board a read is about. Best effort: an older canvas
 * server, or one that cannot reach its vault, still answers scene questions.
 * @returns The heading, or "" when the board cannot be named.
 */
async function boardHeading(): Promise<string> {
	try {
		const current = await getBoardInfo();
		const level = current.identity.level ? `, level ${current.identity.level}` : "";
		return `Board: ${current.board}${level}`;
	} catch {
		return "";
	}
}

/**
 * Every board, or only the ones describing one repository. The identity is
 * resolved by the caller: the canvas server's working directory is nobody's
 * (ADR 0011), so it never turns a path into a repository.
 * @param repo Narrow the listing to the boards bound to this repository.
 * @returns The boards.
 */
async function listBoardsOnCanvas(repo?: string): Promise<BoardListResponse> {
	const query = repo ? `?repo=${encodeURIComponent(repo)}` : "";
	return requestJson<BoardListResponse>(`/api/boards${query}`);
}

/**
 * Put a board on screen.
 * @param params Which board, and which pane to show it in.
 * @returns Where it landed.
 */
async function openBoard(params: OpenBoardParams): Promise<BoardResponse> {
	return postBoard("/api/boards/open", params);
}

/**
 * Start a board that does not exist yet.
 * @param params Its identity.
 * @returns What the canvas made.
 */
async function newBoard(params: NewBoardParams): Promise<BoardResponse> {
	return postBoard("/api/boards/new", params);
}

/**
 * Write a board back to its note, or to a new one.
 * @param params Where to save it.
 * @returns What the save did.
 */
async function saveBoard(params: SaveBoardParams): Promise<BoardResponse> {
	return postBoard("/api/boards/save", params);
}

/**
 * A structured semantic diff between two boards. Read-only on the server: it
 * reads whichever copy of each side is authoritative (memory when the board is
 * open, the vault note otherwise) and never touches the board on screen.
 * @param params Which boards to compare.
 * @returns The differences.
 */
async function compareBoardsOnCanvas(params: CompareBoardsParams): Promise<CompareResult> {
	const query = new URLSearchParams({ from: params.from, ...(params.to ? { to: params.to } : {}) });
	return requestJson<CompareResult>(`/api/boards/compare?${query.toString()}`);
}

/**
 * Claim this call's board for longer than one write (ADR 0016).
 *
 * Nothing is carried between claiming and releasing. The claim lives on the
 * canvas against the board, so every write in between is recognised as the
 * claim's by naming the same board it already had to name — which is what
 * makes claiming usable from a surface that is a fresh process every command.
 * @param params Why the board is being claimed, and for how long.
 * @returns The claim.
 */
async function claimBoard(params: ClaimParams): Promise<ClaimReply> {
	return requestJson<ClaimReply>(
		"/api/boards/claim",
		postingJson({
			reason: params.reason,
			...(params.forMs === undefined ? {} : { forMs: params.forMs }),
		}),
	);
}

/**
 * Give this call's board back.
 * @returns What the release did.
 */
async function releaseBoardClaim(): Promise<ClaimReleaseReply> {
	return requestJson<ClaimReleaseReply>("/api/boards/claim/release", postingJson({}));
}

export {
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
};
