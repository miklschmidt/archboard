// Pointing one pane at one board.
//
// The one owner of which pane holds what: the navigator, the address bar and
// `browser show` all come through here, so the server's answer is the single
// account of what is on screen (ADR 0009). Nothing here writes a board — a
// board is shown, not opened into existence.

import type { Request, Response } from "express";

import {
	makeIdentity,
	normalizeBoardKey,
	paneBoardAddress,
	parseBoardKey,
	statedVariant,
} from "@/runtime/engine/board";
import type { BoardIdentity } from "@/runtime/engine/board";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { logger } from "@/runtime/engine/logger";
import { readSemanticBoard } from "@/runtime/semantic-board-store/index";
import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import { publishPaneContext } from "@/server/archboard/lib/codex-wiring";
import {
	boardForPane,
	paneFromRequest,
	paneResponse,
	sendToPane,
} from "@/server/archboard/lib/pane-registry";
import { semanticPaneContextFor } from "@/server/archboard/lib/semantic-pane-context";
import type { SemanticAgentSwitch } from "@/runtime/codex-semantic-context";
import { bodyOf, messageOf } from "@/server/archboard/lib/request-board";
import { arrivedOnBoard, noBrowserBody } from "@/server/archboard/lib/pane-routes";
import { serverVault } from "@/server/archboard/lib/server-vault";

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
	const identity = shownIdentity(parseBoardKey(asked), res);
	if (identity === null) {
		return;
	}
	const pane = showablePane(body["pane"], res);
	if (pane === null) {
		return;
	}
	const key = paneBoardAddress(identity);
	const moved = agentSwitch(body, pane, key);
	sendToPane(pane.clientId, { type: "pane_board", identity }, key);
	arrivedOnBoard(pane.clientId, key);
	// A pane on a different board is a different context, and the workbench has
	// to hear it from here: the pane's own registration will say the same thing a
	// moment later, and until it does an agent would answer about the old board.
	// That registration carries no mark, so it tells nobody; this is the one place
	// an agent's show is news (TASK-293.06).
	publishPaneContext(pane.clientId, "focus", [], moved);
	logger.info(`Pane ${pane.paneId} (${pane.clientId}) shows ${key}`);
	res.json({ success: true, board: key, identity, paneId: pane.paneId, ...paneResponse(pane) });
}

/**
 * What an agent's show moved, when an agent asked and the pane is not already on that address:
 * the board the pane showed, by the name it last said, and the session the agent stated. The
 * page's own shows state no agent: what the user opens from the navigator is the pane's to mark
 * (ADR 0034), never news of an agent.
 * @param body The request body.
 * @param pane The pane being pointed.
 * @param key The address it is pointed at.
 * @returns The switch, or undefined when no agent moved anything.
 */
function agentSwitch(
	body: Record<string, unknown>,
	pane: PaneRegistration,
	key: string,
): SemanticAgentSwitch | undefined {
	const before = boardForPane(pane);
	if (body["agent"] !== true || before === key) {
		return undefined;
	}
	const session = body["session"];
	return { from: shownName(pane, before), by: typeof session === "string" ? session : null };
}

/**
 * What a pane was showing, by the board's name as the pane last said it, else as its address
 * spells it.
 * @param pane The pane.
 * @param address The address it was on, or null when it was on none.
 * @returns The board's name, or null.
 */
function shownName(pane: PaneRegistration, address: string | null): string | null {
	const said = semanticPaneContextFor(pane.clientId)?.board;
	if (said != null) {
		return said.name;
	}
	return address === null ? null : parseBoardKey(address).board;
}

/**
 * The address a pane is pointed at, refusing when there is no board to show.
 *
 * A show writes nothing — a board is shown, not opened into existence — so a
 * name the vault has not got, or a variant the board has not got, is a refusal
 * rather than something made on the way. A name the board had before a rename
 * opens it under the name it has now (ADR 0036), so a saved address lands on the
 * board and the address bar is rewritten to what the pane then reports.
 * @param identity What the address names.
 * @param res The response, which carries the refusal when there is one.
 * @returns The address to show, or null once the refusal has been sent.
 */
function shownIdentity(identity: BoardIdentity, res: Response): BoardIdentity | null {
	const read = readSemanticBoard(serverVault(), identity.board);
	if (!read.ok) {
		res.status(read.code === "BOARD_MISSING" ? 404 : 422).json({
			success: false,
			code: read.code,
			error: read.problem,
		});
		return null;
	}
	const opened = addressedVariant(read.board, statedVariant(identity));
	if (!opened.ok) {
		res.status(404).json({
			success: false,
			code: "VARIANT_MISSING",
			error: `"${identity.board}": ${opened.problem}. Read it with \`archboard semantic show ${identity.board}\` to see what it has.`,
		});
		return null;
	}
	return acceptedIdentity(identity, read.board, opened.variant);
}

/**
 * An address as the board it opens answers to it now: the board's own name in
 * place of a former one, and the variant's own name in place of a former one.
 * Anything else it says — an id, the bare name, a variant's current name — is
 * already the board's own and is kept exactly as it was spelled.
 * @param identity The address as it was stated.
 * @param board The board it opens.
 * @param variant The variant it opens there.
 * @returns The same address when nothing in it was a former name; otherwise the accepted one.
 */
function acceptedIdentity(
	identity: BoardIdentity,
	board: SemanticBoard,
	variant: SemanticVariant,
): BoardIdentity {
	const stated = statedVariant(identity);
	const renamedVariant = stated !== undefined && stated !== variant.id && stated !== variant.name;
	if (normalizeBoardKey(board.name) === identity.board && !renamedVariant) {
		return identity;
	}
	return makeIdentity({
		board: board.name,
		variant: renamedVariant ? variant.name : identity.variant,
	});
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

export { acceptedIdentity, showPaneRoute };
