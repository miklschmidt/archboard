// Pointing one pane at one board.
//
// The one owner of which pane holds what: the navigator, the address bar and
// `browser show` all come through here, so the server's answer is the single
// account of what is on screen (ADR 0009). Nothing here writes a board — a
// board is shown, not opened into existence. An agent's show from a checkout
// that is not the chosen one of its repository chooses it, because the app
// reads the chosen checkout and the agent shows what it works on (ADR 0050).

import type { Request, Response } from "express";

import {
	makeIdentity,
	normalizeBoardKey,
	paneBoardAddress,
	parseBoardKey,
	statedVariant,
	type BoardIdentity,
} from "@archboard/board/address";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { logger } from "@archboard/diagnostics/logger";
import { readSemanticBoard } from "@archboard/board/store-read";
import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import { publishPaneContext } from "@archboard/workbench/server";
import {
	boardForPane,
	paneFromRequest,
	paneResponse,
	sendToPane,
	semanticPaneContextFor,
} from "@archboard/workbench/panes";
import type { SemanticAgentSwitch } from "@archboard/workbench/semantic-context";
import { bodyOf, messageOf, vaultOfRequest } from "@archboard/workbench/host";
import { arrivedOnBoard, noBrowserBody } from "#server/routes/panes/pane-routes.ts";
import { movePaneVault } from "#server/state/pane-vaults/pane-vaults.ts";
import { placeOfVault, type VaultPlace } from "@archboard/workspace/repository-listing";
import { followRegistry } from "#server/routes/repositories/repository-routes.ts";
import {
	chooseKnownCheckout,
	registeredRepositoryOfVault as registeredRepositoryOf,
} from "@archboard/workspace/checkouts";

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
	const vault = vaultOfRequest(req);
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
	const identity = shownIdentity(vault, parseBoardKey(asked), res);
	if (identity === null) {
		return;
	}
	const pane = showablePane(vault, body["pane"], res);
	if (pane === null) {
		return;
	}
	const key = paneBoardAddress(identity);
	const moved = agentSwitch(body, pane, key);
	// An agent shows the board of its own checkout, so the app reads that
	// checkout from now on (ADR 0050).
	const shown = pointPane(pane, identity, vault, body["agent"] === true);
	// A pane on a different board is a different context, and the workbench has
	// to hear it from here: the pane's own registration will say the same thing a
	// moment later, and until it does an agent would answer about the old board.
	// That registration carries no mark, so it tells nobody; this is the one place
	// an agent's show is news (TASK-293.06).
	publishPaneContext(pane.clientId, "focus", [], moved);
	logger.info(`Pane ${pane.paneId} (${pane.clientId}) shows ${key}`);
	res.json({
		success: true,
		board: key,
		identity,
		...shown,
		paneId: pane.paneId,
		...paneResponse(pane),
	});
}

/** A choice of checkout that a show or a move made, as its answer names it. */
interface ShowChoice {
	readonly repository: string;
	/** The checkout chosen now. */
	readonly checkout: string;
	/** The checkout that was chosen before, or null when the repository had none chosen. */
	readonly replaced: string | null;
}

/**
 * Make the checkout of a shown vault the chosen one of its repository, when it
 * is a known checkout that is not chosen. An untracked vault is always read, and
 * a vault no registered directory holds has no repository to choose for. A move
 * into a checkout chooses it the same way (ADR 0051).
 * @param vault The vault of the board shown, or moved into.
 * @param act What chose, as the log says it.
 * @returns The choice, or undefined when it changed no choice.
 */
function chooseShownCheckout(vault: string, act = "A show"): ShowChoice | undefined {
	const shown = registeredRepositoryOf(vault);
	if (shown === undefined || shown.chosen) {
		return undefined;
	}
	const chosen = chooseKnownCheckout(shown.root);
	if (chosen?.changed !== true) {
		return undefined;
	}
	logger.info(`${act} made ${shown.root} the chosen checkout of ${shown.name}`);
	return { repository: shown.name, checkout: shown.root, replaced: chosen.replaced };
}

/**
 * Point a pane at a board, in the vault the board is in. A choice of checkout
 * the show made is followed by every other pane after this one has arrived, so
 * the shown pane is never sent to its old board in the new checkout first.
 * @param pane The pane.
 * @param identity The board it is pointed at.
 * @param vault The vault the board is in.
 * @param byAgent Whether an agent asked, whose show chooses the checkout it shows.
 * @returns The repository and the checkout the board is in, and the choice the show made.
 */
function pointPane(
	pane: PaneRegistration,
	identity: BoardIdentity,
	vault: string,
	byAgent: boolean,
): Pick<VaultPlace, "repository" | "checkout"> & { chose?: ShowChoice } {
	const key = paneBoardAddress(identity);
	// Chosen only here, once nothing can refuse the show (ADR 0050).
	const chose = byAgent ? chooseShownCheckout(vault) : undefined;
	// A pane named by a show of another repository's board moves into that
	// repository's vault first, so the board's news reaches it from here on.
	movePaneVault(pane.clientId, vault);
	const { repository, checkout } = placeOfVault(vault);
	sendToPane(pane.clientId, { type: "pane_board", identity, vault, repository }, key);
	arrivedOnBoard(pane.clientId, key);
	if (chose === undefined) {
		return { repository, checkout };
	}
	followRegistry();
	return { repository, checkout, chose };
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
 * @param vault The vault the address is in.
 * @param identity What the address names.
 * @param res The response, which carries the refusal when there is one.
 * @returns The address to show, or null once the refusal has been sent.
 */
function shownIdentity(
	vault: string,
	identity: BoardIdentity,
	res: Response,
): BoardIdentity | null {
	const read = readSemanticBoard(vault, identity.board);
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
 * @param vault The vault the board is in: an unnamed pane must be one of that vault's.
 * @param spec The pane spec the caller stated, if any.
 * @param res The response.
 * @returns The pane, or null.
 */
function showablePane(vault: string, spec: unknown, res: Response): PaneRegistration | null {
	let pane: PaneRegistration | null;
	try {
		pane = paneFromRequest(vault, spec);
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
		return null;
	}
	if (pane === null) {
		res.status(503).json(noBrowserBody("Showing a board"));
	}
	return pane;
}

export { acceptedIdentity, chooseShownCheckout, showPaneRoute, type ShowChoice };
