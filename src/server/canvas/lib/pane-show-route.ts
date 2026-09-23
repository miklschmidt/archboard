// Pointing one pane at one board.
//
// The one owner of which pane holds what: the navigator, the address bar and
// `browser show` all come through here, so the server's answer is the single
// account of what is on screen (ADR 0009). Nothing here writes a board — a
// board is shown, not opened into existence.

import type { Request, Response } from "express";

import { paneBoardAddress, parseBoardKey, statedVariant } from "@/runtime/engine/board";
import type { BoardIdentity } from "@/runtime/engine/board";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { logger } from "@/runtime/engine/logger";
import { readSemanticBoard } from "@/runtime/semantic-board-store/index";
import { addressedVariant } from "@/shared/semantic-board/index";
import { publishPaneContext } from "@/server/canvas/lib/canvas-codex-host";
import { paneFromRequest, paneResponse, sendToPane } from "@/server/canvas/lib/pane-registry";
import { bodyOf, messageOf } from "@/server/canvas/lib/request-board";
import { arrivedOnBoard, noBrowserBody } from "@/server/canvas/lib/pane-routes";

/**
 * Point one pane at one board.
 *
 * The one owner of which pane holds what: the navigator, the address bar and
 * `browser show` all come through here, so the server's answer is the single
 * account of what is on screen (ADR 0009). Nothing is written — a board is
 * shown, not opened into existence — so a board the vault has not got is a
 * refusal rather than a new board.
 * @param req The request.
 * @param res Its response.
 */
function showPaneRoute(req: Request, res: Response): void {
	const body = bodyOf(req);
	const asked = typeof body["board"] === "string" ? body["board"].trim() : "";
	if (asked === "") {
		res.status(400).json({
			success: false,
			error: "Say which board to show: `browser show <name> --pane <spec>`.",
		});
		return;
	}
	// A pane address names a board and, after the last `@`, one of its variants
	// (ADR 0009). The board file is the whole family, so the variant is resolved
	// against what was read rather than looked for on disk.
	const identity = parseBoardKey(asked);
	if (!showableBoard(identity, res)) {
		return;
	}
	const pane = showablePane(body["pane"], res);
	if (pane === null) {
		return;
	}
	const key = paneBoardAddress(identity);
	sendToPane(pane.clientId, { type: "pane_board", identity }, key);
	arrivedOnBoard(pane.clientId, key);
	// A pane on a different board is a different context, and the workbench has
	// to hear it from here: the pane's own registration will say the same thing a
	// moment later, and until it does an agent would answer about the old board.
	publishPaneContext(pane.clientId, "focus");
	logger.info(`Pane ${pane.paneId} (${pane.clientId}) shows ${key}`);
	res.json({ success: true, board: key, identity, paneId: pane.paneId, ...paneResponse(pane) });
}

/**
 * Whether there is a board to show, refusing when there is not.
 *
 * A show writes nothing — a board is shown, not opened into existence — so a
 * name the vault has not got, or a variant the board has not got, is a refusal
 * rather than something made on the way.
 * @param identity What the address names.
 * @param res The response, which carries the refusal when there is one.
 * @returns True when the pane can be pointed at it.
 */
function showableBoard(identity: BoardIdentity, res: Response): boolean {
	const read = readSemanticBoard(identity.board);
	if (!read.ok) {
		res.status(read.code === "BOARD_MISSING" ? 404 : 422).json({
			success: false,
			code: read.code,
			error: read.problem,
		});
		return false;
	}
	const opened = addressedVariant(read.board, statedVariant(identity));
	if (!opened.ok) {
		res.status(404).json({
			success: false,
			code: "VARIANT_MISSING",
			error: `"${identity.board}": ${opened.problem}. Read it with \`archboard semantic show ${identity.board}\` to see what it has.`,
		});
		return false;
	}
	return true;
}

/**
 * The pane a show is addressed to, or nothing once the refusal has been sent.
 * @param spec The pane spec the caller stated, if any.
 * @param res The response.
 * @returns The pane, or null.
 */
function showablePane(spec: unknown, res: Response): PaneRegistration | null {
	let pane: PaneRegistration | null;
	try {
		pane = paneFromRequest(spec);
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
		return null;
	}
	if (pane === null) {
		res.status(503).json(noBrowserBody("Showing a board"));
	}
	return pane;
}

export { showPaneRoute };
