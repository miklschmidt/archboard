// The board's mutex and an agent's claim, from the browser's side: take a
// hold, give it back, and release a claim (ADR 0016, ADR 0022). Split from
// `api.ts`, which re-exports these, so that file stays within its size.

import { boardQuery, isRecord, mutation, post, trustReply } from "@/ui/canvas/lib/http";
import type { LockHolder, ServerElement } from "@/ui/types";

/** The answer to a hold: who has the board now. */
interface HoldReply {
	held: boolean;
	/** Who has it: this pane on success, somebody else on a refusal. */
	holder: LockHolder | null;
	/**
	 * On a refusal under an agent's claim (ADR 0022): the board as the note
	 * holds it and the version it is at, so the pane can withdraw its edit
	 * without another read.
	 */
	document?: readonly ServerElement[];
	version?: number | null;
}

/**
 * Read a hold reply body without trusting more of it than it must carry.
 * @param body The decoded body.
 * @returns The success flag, the holder and the refusal's document, when present.
 */
function holdReplyBody(body: unknown): { success: boolean } & Omit<HoldReply, "held"> {
	if (!isRecord(body)) {
		return { success: false, holder: null };
	}
	const holder = body["holder"];
	const document = body["document"];
	const version = body["version"];
	return {
		success: body["success"] === true,
		holder: isRecord(holder) ? trustReply<LockHolder>(holder) : null,
		...(Array.isArray(document) ? { document: trustReply<ServerElement[]>(document) } : {}),
		...(typeof version === "number" || version === null ? { version } : {}),
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
	const { success, ...body } = holdReplyBody(await response.json().catch(() => ({})));
	return { held: response.ok && success, ...body };
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

/** The answer to a take-back: whether a claim was released, and which. */
interface TakeBackReply {
	success: true;
	released: boolean;
	claim?: LockHolder;
}

/**
 * Release an agent's claim on a board: the one explicit control a person has
 * over a claimed board (ADR 0022). The board goes to nobody, the agent is told
 * once that it lost the board, and nothing already written is undone.
 * @param board The board.
 * @param clientId This pane.
 * @returns Whether a claim was released.
 */
function takeBoardBack(board: string | null, clientId: string): Promise<TakeBackReply> {
	return post(`/api/boards/take-back${boardQuery(board)}`, { clientId });
}

export { holdBoard, releaseBoard, takeBoardBack, type HoldReply, type TakeBackReply };
