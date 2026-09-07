import type { Express, Request, Response } from "express";
import logger from "@/runtime/engine/logger";
import { changeFeed } from "@/runtime/engine/change-feed";
import type { ChangeEvent } from "@/runtime/engine/change-feed";
import { narrateChange } from "@/runtime/engine/changes";
import { boardFromRequest, isFlagOn, messageOf } from "@/server/canvas/lib/request-board";

// ─── Change feed ──────────────────────────────────────────────
//
// Semantic changes, not element deltas: what the board *became*, said in the
// same vocabulary `compare` uses. See change-feed.ts for why an event exists
// at all — briefly, a drag is one event, at rest, or none at all.
//
// Two shapes, because there are two consumers:
//   ?since=N            the events after cursor N, for something watching live
//   ?since=N&coalesce=1 one diff from cursor N to now, for a per-turn hook that
//                       wants the net difference rather than a replay to merge
//
// `detail` (the whole compare result) is off unless asked: it is complete and
// therefore large, and the narration in `text` is what most callers use.

/**
 * An event with or without its full compare detail.
 * @param wantDetail Whether the caller asked for detail.
 * @returns The stripping function.
 */
function eventStripper(wantDetail: boolean): (event: ChangeEvent) => unknown {
	return (event) =>
		wantDetail ? event : { ...event, change: { ...event.change, detail: undefined } };
}

/**
 * The answer to a cursor ahead of the feed's own. It is not "nothing has
 * happened": it came from a previous canvas process, since the board lives
 * in memory and the count restarts with it. Saying "nothing changed" to that
 * would be the most damaging wrong answer available.
 * @param board The board.
 * @param since The cursor asked for.
 * @param coalesce Whether a net diff was asked for.
 * @returns The response body.
 */
function cursorAheadAnswer(board: string, since: number, coalesce: boolean): Record<string, unknown> {
	return {
		success: true,
		board,
		feedId: changeFeed.status().feedId,
		cursor: changeFeed.cursor,
		events: [],
		...(coalesce ? { coalesced: null } : {}),
		truncated: true,
		message:
			`Cursor ${since} is ahead of this feed (now at ${changeFeed.cursor}), so it was issued by a previous ` +
			"canvas process — the board is held in memory and the count restarts with the server. Treat this as " +
			"a fresh start: take the cursor in this response, and read the board with `describe`. Watch `feedId` " +
			"to notice the next restart.",
	};
}

/**
 * The net diff from a cursor to now, or the answer that it cannot be computed.
 * @param board The board.
 * @param since The cursor.
 * @param wantDetail Whether the caller asked for detail.
 * @returns The response body.
 */
function coalescedAnswer(board: string, since: number, wantDetail: boolean): Record<string, unknown> {
	const netDiff = changeFeed.coalesce(since, board);
	if (!netDiff) {
		return {
			success: true,
			board,
			cursor: changeFeed.cursor,
			coalesced: null,
			truncated: true,
			message:
				`Cursor ${since} is older than the change feed's memory of board "${board}", so the net diff ` +
				"since then cannot be computed. Take the cursor in this response as a fresh start, and read " +
				"the board itself with `describe` if you need to know where things stand.",
		};
	}
	return {
		success: true,
		board,
		feedId: changeFeed.status().feedId,
		cursor: netDiff.cursor,
		since: netDiff.since,
		events: netDiff.events.map(eventStripper(wantDetail)),
		coalesced: {
			significance: netDiff.change.significance,
			headline: netDiff.change.headline,
			text: narrateChange(netDiff.change),
			counts: netDiff.change.counts,
			nodes: netDiff.change.nodes,
			edges: netDiff.change.edges,
			layout: netDiff.change.layout,
			warnings: netDiff.change.warnings,
			...(wantDetail ? { detail: netDiff.change.detail } : {}),
		},
	};
}

/**
 * Read the change feed after a cursor, live or coalesced.
 * @param req The request.
 * @param res Its response.
 */
function changeFeedRoute(req: Request, res: Response): void {
	try {
		const since = Number(req.query["since"] ?? 0);
		if (!Number.isFinite(since) || since < 0) {
			res
				.status(400)
				.json({ success: false, error: "since must be a cursor from a previous response" });
			return;
		}
		const { key: board } = boardFromRequest(req, "changes");
		const wantDetail = isFlagOn(req.query["detail"]);
		const coalesce = isFlagOn(req.query["coalesce"]);
		// A caller reading the feed wants the board as it is, not as it was 1.2s
		// ago, so pending settle work is completed before answering.
		if (req.query["settle"] !== "0") {
			changeFeed.settle(board);
		}
		if (since > changeFeed.cursor) {
			res.json(cursorAheadAnswer(board, since, coalesce));
			return;
		}
		if (coalesce) {
			res.json(coalescedAnswer(board, since, wantDetail));
			return;
		}
		res.json({
			success: true,
			board,
			feedId: changeFeed.status().feedId,
			cursor: changeFeed.cursor,
			events: changeFeed.since(since, board).map(eventStripper(wantDetail)),
			feed: changeFeed.status(),
		});
	} catch (error) {
		logger.error("Error reading the change feed:", error);
		res.status(400).json({ success: false, error: messageOf(error) });
	}
}

/**
 * Mount the change-feed route.
 * @param app The application to mount on.
 */
function mountChangeFeedRoute(app: Express): void {
	app.get("/api/changes", changeFeedRoute);
}

export { mountChangeFeedRoute };
