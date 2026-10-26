// The route that lets a whole board go (TASK-304.02): `semantic delete` and
// `semantic record --discard` (ADR 0057).
//
// A discard is a change to the board like any write: the same envelope, the
// same `?doing=` a person watching is owed, the same mutation admission and the
// same lease, and a refusal answered in the same shape and status. A refusal
// because other boards open the board lists each node that does in
// `openedBy`, and the answer lists the embeds the board tracked. What it
// announces is the news a board removed by somebody else makes — `board_note`
// on the board — so every pane on it reads the board again and finds it gone,
// every navigator reads the listing again, and the agent's change feed says it
// was discarded. The coordinator's catalogue hears the file go on its own
// watch, as it hears any board appear or disappear.

import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import type { BoardDiscardAnswerSchema } from "@archboard/board/commands";
import { forgetDoing } from "@archboard/board/doing";
import { discardSemanticBoard } from "@archboard/board/store-write";
import { announceDoing } from "#server/projections/board-announcements/board-announcements.ts";
import { broadcast, settledChangeFields } from "@archboard/workbench/panes";
import {
	answerRefusal,
	describedWrite,
	writerOf,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";
import {
	expectedVersion,
	statedEnvelope,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";
import { vaultOfRequest } from "@archboard/workbench/host";

/**
 * Tell everything that shows the board that it is gone.
 *
 * The line the discarder wrote goes up first, so a person watching sees why the
 * board is about to leave; then the board's news; then the lines are forgotten,
 * because they were about a board that no longer exists and a new board given
 * the same name did not say them.
 * @param vault The vault the board lived in.
 * @param key The board's canonical key.
 * @param doing The line the discarder wrote, or empty for a person.
 * @param custody Who discarded it: the agent session and the identity it held the board under.
 * @param custody.by The agent session that asked, or null when it named none.
 * @param custody.heldAs The identity the board was held under while it went.
 */
function announceDiscard(
	vault: string,
	key: string,
	doing: string,
	custody: { readonly by: string | null; readonly heldAs: string },
): void {
	if (doing !== "") {
		announceDoing(vault, key, { doing, at: new Date().toISOString(), by: "agent", kind: "agent" });
	}
	broadcast(
		{ type: "board_note", board: key, ...settledChangeFields({ ...custody, discarded: true }) },
		vault,
		key,
	);
	forgetDoing({ vault, board: key });
}

/**
 * Delete one named board, every variant of it.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function discardRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) {
		return;
	}
	const doing = describedWrite(req, res, envelope);
	if (doing === null) {
		return;
	}
	// Unlike an edit's, the version is optional: the agent that made a board to
	// record it discards it. A stated one is checked, and one spelled wrong is
	// refused rather than read as absent.
	const stated = expectedVersion(req);
	if (!stated.ok) {
		res.status(400).json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem });
		return;
	}
	const vault = vaultOfRequest(req);
	const result = await discardSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		expectedVersion: stated.version,
		signal,
	});
	if (result.outcome !== "discarded") {
		answerRefusal(res, result);
		return;
	}
	announceDiscard(vault, result.location.key, doing, {
		by: envelope.session ?? null,
		heldAs: result.heldAs,
	});
	const answer: z.input<typeof BoardDiscardAnswerSchema> = {
		success: true,
		discarded: {
			board: result.location.name,
			version: result.previousVersion,
			trackedEmbeds: [...result.trackedEmbeds],
		},
	};
	res.json(answer);
}

export { discardRoute };
