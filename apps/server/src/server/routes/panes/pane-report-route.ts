// What every pane on screen is showing and reading: the answer `browser panes`
// is read from, every turn, so it is built from what the panes reported and the
// registry, and never reads a board.

import type { Request, Response } from "express";

import { parseBoardKey } from "@archboard/board/address";
import { buildPanesReport } from "@archboard/server-lifecycle/panes";
import { serverUrl, statedVault } from "@archboard/workbench/host";
import { boardForPane, panes, semanticPaneContextFor } from "@archboard/workbench/panes";
import { placeOfVault } from "@archboard/workspace/repository-listing";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPaneContext = z.infer<typeof SemanticPaneContextSchema>;

/**
 * What one pane last said it was reading, when that is still about the board
 * it is now showing.
 *
 * A move and a report cross: the server points a pane at B and the pane's last
 * report still names A, which arrived while it was there and was true then.
 * Reported under B it would say that somebody has picked out subjects of B — by
 * ids that belong to A, and which may name something else entirely on B. The
 * board's own answer stands; what the person picked out does not, until the
 * pane says what it is reading now, which it does on its next render.
 * @param clientId The pane's client id.
 * @returns The reading, or null when it is about another board.
 */
function readingAboutBoard(clientId: string): SemanticPaneContext | null {
	const context = semanticPaneContextFor(clientId);
	if (context === null) {
		return null;
	}
	const pane = panes.get(clientId);
	const showing = pane === undefined ? null : boardForPane(pane);
	if (showing === null) {
		return null;
	}
	return context.board?.key === showing ? context : null;
}

/**
 * Report every pane on screen, each with the repository and the checkout of its
 * vault. A call may name the vault its command found, and each pane then says
 * whether it shows that vault. The report is about the screen, so a call that
 * names none, or one the server cannot read, is answered the same, with no pane
 * its own.
 * @param req The request.
 * @param res Its response.
 */
function getPanesRoute(req: Request, res: Response): void {
	const report = buildPanesReport(Array.from(panes.values()), {
		caller: statedVault(req),
		whereabouts: placeOfVault,
		/**
		 * The identity a board key spells.
		 * @param key The board key.
		 * @returns The identity.
		 */
		identity: (key) => parseBoardKey(key),
		/**
		 * What one pane last reported reading: its variant, its view and what the
		 * person picked out (ADR 0023).
		 * @param clientId The pane's client id.
		 * @returns The reading, or null when the pane has said nothing.
		 */
		reading: (clientId) => {
			const context = readingAboutBoard(clientId);
			if (context === null) {
				return null;
			}
			return {
				variant: context.variant,
				view: context.view,
				selection: context.selection.map((subject) => ({
					id: subject.id,
					...(subject.kind === undefined ? {} : { kind: subject.kind }),
					...(subject.name === undefined ? {} : { name: subject.name }),
				})),
				version: context.version,
				at: context.at,
			};
		},
		serverUrl: serverUrl(),
	});
	res.json({ success: true, ...report });
}

export { getPanesRoute };
