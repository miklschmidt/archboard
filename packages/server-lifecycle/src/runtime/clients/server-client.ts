// The typed surface the CLI talks to the Archboard server through.
//
// Small on purpose. The CLI writes boards through one owner
// (`runtime/clients/semantic-board-client.ts`), which states its own routes; what is
// here is everything else a command needs from a running Archboard server: its health,
// the claim on a board, and the panes on screen.
//
// One request goes through `server-client-transport.ts`, which owns the
// identity gate and the error shapes; what this invocation says about itself —
// which board, what it is doing, which version it believes it is editing —
// lives in `state/server-client-session.ts` and rides on every request from
// there rather than from every call site.

import type { SourceState } from "#runtime/services/staleness.ts";
import {
	type BoardRefusal,
	BOARD_REFUSAL_CODES,
	isBoardRefusal,
} from "#runtime/protocol/server-client-refusal.ts";
import {
	addQuery,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	currentWriteSession,
	setExpectedVersion,
	setRequestedBoard,
	setRequestedVault,
	setWriteDoing,
	setWriteSession,
	withBoard,
	withDoing,
} from "#runtime/state/server-client-session.ts";
import {
	ARCHBOARD_SERVICE_NAME,
	foreignServiceError,
	markServerIdentityVerified,
	OtherSourceError,
	requestJson,
	responseError,
} from "#runtime/clients/server-client-transport.ts";
import { isRecord } from "@archboard/diagnostics/unknown-record";
import type { parseBoardKey } from "@archboard/board/address";

type BoardIdentity = ReturnType<typeof parseBoardKey>;

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

/** What `/health` answers with. */
interface HealthStatus {
	status: string;
	service?: string;
	pid?: number;
	/** How many browsers are looking at this server. */
	websocket_clients?: number;
	/**
	 * Which checkout's source the server runs, and whether it is the source on
	 * disk now. A server older than ADR 0049 names no checkout.
	 */
	source?: Omit<SourceState, "checkout"> & Partial<Pick<SourceState, "checkout">>;
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
	/** The repository the board is in, or null when no registered directory holds its vault. */
	repository: string | null;
	/** The checkout that holds the board's vault, or null when it is not known. */
	checkout: string | null;
	/** The choice of checkout the show made, when it made one (ADR 0050). */
	chose?: { repository: string; checkout: string; replaced: string | null };
	paneId: string;
	pane?: PaneRef | null;
}

/**
 * Whether the server is up, and whether it is the Archboard server rather than something
 * else listening on the port.
 * @returns The health body.
 */
function getHealth(): Promise<HealthStatus> {
	return requestJson<HealthStatus>("/health");
}

/**
 * What the server is holding, for `status`.
 * @returns The sync status body.
 */
function getSyncStatus(): Promise<Record<string, unknown>> {
	return requestJson("/api/sync/status");
}

/**
 * What every pane on screen is showing and reading.
 * @param caller The vault the caller's command finds, so each pane says whether it shows that
 * vault, or null when it finds none.
 * @returns The panes report.
 */
function getPanes(caller: string | null): Promise<Record<string, unknown>> {
	return requestJson(caller === null ? "/api/panes" : addQuery("/api/panes", "vault", caller));
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
 * Point one pane at one board, as an agent: the shell's own shows come from the page, so a show
 * from here says it is an agent's, and which agent session it is when the invocation named one.
 * The voice and its coordinator are told an agent moved the pane, unless it was their own
 * session (TASK-293.06).
 * @param board The board key.
 * @param pane The pane spec, when the caller named one.
 * @returns What the pane is showing now.
 */
function showBoardInPane(board: string, pane?: string): Promise<ShowBoardResponse> {
	const session = currentWriteSession();
	return requestJson<ShowBoardResponse>(
		"/api/panes/show",
		posting({
			board,
			agent: true,
			...(pane === undefined ? {} : { pane }),
			...(session === null ? {} : { session }),
		}),
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
	ARCHBOARD_SERVICE_NAME,
	addQuery,
	boardRefusalOf,
	claimBoard,
	closePane,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	currentWriteSession,
	foreignServiceError,
	formatBoardRefusal,
	getHealth,
	getPanes,
	getSyncStatus,
	markServerIdentityVerified,
	OtherSourceError,
	openPane,
	releaseBoardClaim,
	requestJson,
	responseError,
	setExpectedVersion,
	setRequestedBoard,
	setRequestedVault,
	setWriteDoing,
	setWriteSession,
	showBoardInPane,
	withBoard,
	withDoing,
};
