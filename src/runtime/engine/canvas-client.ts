// The typed surface the CLI talks to the canvas server through.
//
// Small on purpose. The CLI writes boards through one owner
// (`src/runtime/semantic-board-client`), which states its own routes; what is
// here is everything else a command needs from a running canvas: its health,
// the claim on a board, and the panes on screen.
//
// One request goes through `lib/canvas-client-transport.ts`, which owns the
// identity gate and the error shapes; what this invocation says about itself —
// which board, what it is doing, which version it believes it is editing —
// lives in `lib/canvas-client-session.ts` and rides on every request from
// there rather than from every call site.

import type { BoardIdentity } from "@/runtime/engine/board";
import {
	type BoardRefusal,
	BOARD_REFUSAL_CODES,
	isBoardRefusal,
} from "@/runtime/engine/lib/canvas-client-refusal";
import {
	addQuery,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	withBoard,
	withDoing,
} from "@/runtime/engine/lib/canvas-client-session";
import {
	CANVAS_SERVICE_NAME,
	foreignServiceError,
	markCanvasIdentityVerified,
	requestJson,
} from "@/runtime/engine/lib/canvas-client-transport";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * The options for a POST carrying a JSON body.
 * @param payload The body.
 * @returns The fetch options.
 */
function posting(payload: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	};
}

/** What one pane is called where a person points at it. */
interface PaneRef {
	paneId: string;
	clientId: string;
	place: string;
	position: number;
}

/** What the source-freshness half of a health answer says (TASK-056). */
interface SourceFreshness {
	stale: boolean;
	evaluatedAt: string;
	newestFile: string | null;
	newestAt: string | null;
}

/** What `/health` answers with. */
interface HealthStatus {
	status: string;
	service?: string;
	pid?: number;
	/** How many boards the vault holds. */
	boards?: number;
	/** How many browsers are looking at this canvas. */
	websocket_clients?: number;
	/** Whether this process is running the source that is on disk now. */
	source?: SourceFreshness;
	[key: string]: unknown;
}

/** What a claim answers with. */
interface ClaimReply {
	success: true;
	board: string;
	claim: { board: string; holder: { id: string; reason?: string }; expires: string };
	created: boolean;
	/** The version the claim was told about, which its first write states. */
	version: number | null;
}

/** What releasing a claim answers with. */
interface ClaimReleaseReply {
	success: true;
	board: string;
	released: boolean;
}

/** What a layout change answers with. */
interface PaneLayoutResponse {
	success: true;
	pane?: PaneRef | null;
	closed?: PaneRef & { board: string };
	paneCount: number;
	onScreen: Array<{ paneId: string; place: string; board: string }>;
}

/** What showing a board in a pane answers with. */
interface ShowBoardResponse {
	success: true;
	board: string;
	identity: BoardIdentity;
	paneId: string;
	pane?: PaneRef | null;
}

/**
 * Whether the canvas is up, and whether it is the canvas rather than something
 * else listening on the port.
 * @returns The health body.
 */
function getHealth(): Promise<HealthStatus> {
	return requestJson<HealthStatus>("/health");
}

/**
 * What the canvas is holding, for `status`.
 * @returns The sync status body.
 */
function getSyncStatus(): Promise<Record<string, unknown>> {
	return requestJson("/api/sync/status");
}

/**
 * What every pane on screen is showing and reading.
 * @returns The panes report.
 */
function getPanes(): Promise<Record<string, unknown>> {
	return requestJson("/api/panes");
}

/**
 * Split the canvas: one more pane beside what is already there.
 * @returns Where the new pane landed.
 */
function openPane(): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/open", posting({}));
}

/**
 * Close one pane, named the way every other pane is named.
 * @param spec The pane spec.
 * @returns What was closed and what is left.
 */
function closePane(spec: string): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/close", posting({ pane: spec }));
}

/**
 * Point one pane at one board.
 * @param board The board key.
 * @param pane The pane spec, when the caller named one.
 * @returns What the pane is showing now.
 */
function showBoardInPane(board: string, pane?: string): Promise<ShowBoardResponse> {
	return requestJson<ShowBoardResponse>(
		"/api/panes/show",
		posting({ board, ...(pane === undefined ? {} : { pane }) }),
	);
}

/** What a claim asks for. */
interface ClaimParams {
	reason: string;
	forMs?: number;
}

/**
 * Take a board for a stretch of work (ADR 0016).
 * @param params The reason, and how long it is wanted for.
 * @returns The claim, and the version it was told about.
 */
function claimBoard(params: ClaimParams): Promise<ClaimReply> {
	return requestJson<ClaimReply>(
		"/api/semantic-boards/claim",
		posting({
			reason: params.reason,
			...(params.forMs === undefined ? {} : { forMs: params.forMs }),
		}),
	);
}

/**
 * Give a claimed board back.
 * @returns Whether a claim was released.
 */
function releaseBoardClaim(): Promise<ClaimReleaseReply> {
	return requestJson<ClaimReleaseReply>("/api/semantic-boards/claim/release", posting({}));
}

/**
 * The refusal a thrown value carries, when it carries one.
 * @param error The thrown value.
 * @returns The refusal, or null.
 */
function boardRefusalOf(error: unknown): BoardRefusal | null {
	const refusal = isRecord(error) ? error["refusal"] : undefined;
	return isBoardRefusal(refusal) ? refusal : null;
}

/**
 * A refusal as the CLI prints it: the unchanged reason first, then every
 * structured fact from the same body.
 * @param error The thrown value.
 * @returns The text, or null when the error is not a refusal.
 */
function formatBoardRefusal(error: unknown): string | null {
	const refusal = boardRefusalOf(error);
	if (!refusal) {
		return null;
	}
	const { success: _success, error: reason, ...details } = refusal;
	return `${reason}\n\n${JSON.stringify(details, null, 2)}`;
}

export {
	type BoardRefusal,
	type ClaimReleaseReply,
	type ClaimReply,
	type HealthStatus,
	type PaneLayoutResponse,
	type PaneRef,
	type ShowBoardResponse,
	BOARD_REFUSAL_CODES,
	CANVAS_SERVICE_NAME,
	addQuery,
	boardRefusalOf,
	claimBoard,
	closePane,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	foreignServiceError,
	formatBoardRefusal,
	getHealth,
	getPanes,
	getSyncStatus,
	markCanvasIdentityVerified,
	openPane,
	releaseBoardClaim,
	requestJson,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	showBoardInPane,
	withBoard,
	withDoing,
};
