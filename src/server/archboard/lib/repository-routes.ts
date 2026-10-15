// The repositories the browser lists, and the one choice a person makes there:
// which checkout of a repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the boards of its chosen
// checkout's vault. Choosing a checkout is `repo use` from the page: it changes
// the choice for the whole machine, so every pane that showed the old checkout's
// vault is moved to the new one, keeping its board, and every tab is told to
// read the list again. A pane whose board the new checkout has not got says so,
// because the board it asks for is not there.

import path from "path";
import type { Express, Request, Response } from "express";
import { z } from "zod";

import { logger } from "@/runtime/engine/logger";
import { parseBoardKey } from "@/runtime/engine/board";
import { declareDirectory, listRegistry, RepoRegistryError } from "@/runtime/engine/repo-registry";
import { createBrowserOriginGuard } from "@/server/browser-origin";
import { asyncEndpoint } from "@/server/archboard/lib/mutation-work";
import { tellPaneAboutVault } from "@/server/archboard/lib/board-announcements";
import { paneBoardOf, sendBoardlessToPane, sendToPane } from "@/server/archboard/lib/pane-registry";
import {
	broadcastEverywhere,
	movePaneVault,
	paneClientsOfVault,
} from "@/server/archboard/lib/pane-vaults";
import { arrivedOnBoard } from "@/server/archboard/lib/pane-routes";
import { listRepositories, vaultIn, VAULT_DIRECTORY } from "@/server/archboard/lib/repositories";
import { serverVault } from "@/server/archboard/lib/server-vault";

/**
 * The repositories, as the navigator lists them.
 * @param _req The request.
 * @param res Its response.
 */
function repositoriesRoute(_req: Request, res: Response): void {
	res.json({ success: true, repositories: listRepositories(), served: serverVault() });
}

const ChoiceSchema = z.object({ repository: z.string().min(1), root: z.string().min(1) });

/**
 * Choose which checkout of a repository this machine reads, as `repo use` does.
 * @param req The request.
 * @param res Its response.
 */
async function chooseCheckoutRoute(req: Request, res: Response): Promise<void> {
	const choice = statedChoice(req, res);
	if (choice === null) {
		return;
	}
	const { repository, root } = choice;
	const before = listRepositories().find((each) => each.name === repository)?.vault;
	if (!(await chose(root, res))) {
		return;
	}
	movePanesToVault(before, vaultIn(root) ?? path.join(root, VAULT_DIRECTORY), repository);
	broadcastEverywhere({ type: "repositories_changed" });
	logger.info(`The chosen checkout of ${repository} is ${root}`);
	res.json({ success: true, repository, root });
}

/**
 * The checkout a choice names, when it is a known checkout of the named
 * repository: the page offers nothing else, and a root it did not offer is
 * refused rather than registered.
 * @param req The request.
 * @param res Its response, which carries the refusal when there is one.
 * @returns The repository and the checkout, or null once refused.
 */
function statedChoice(req: Request, res: Response): z.infer<typeof ChoiceSchema> | null {
	const parsed = ChoiceSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "Say which checkout to choose: { repository, root }.",
		});
		return null;
	}
	const { repository, root } = parsed.data;
	if (!listRegistry().checkouts.some((each) => each.repo === repository && each.root === root)) {
		res.status(404).json({
			success: false,
			code: "CHECKOUT_UNKNOWN",
			error: `${root} is not a known checkout of ${repository}. Register it with \`archboard repo add ${root}\`.`,
		});
		return null;
	}
	return parsed.data;
}

/**
 * Make a checkout the chosen one of its identity.
 * @param root The checkout.
 * @param res The response, which carries the refusal when the registry refuses.
 * @returns Whether it is chosen now.
 */
async function chose(root: string, res: Response): Promise<boolean> {
	try {
		await declareDirectory(root, { choose: true });
		return true;
	} catch (error) {
		if (!(error instanceof RepoRegistryError)) {
			throw error;
		}
		res.status(422).json({ success: false, code: "CHECKOUT_UNUSABLE", error: error.message });
		return false;
	}
}

/**
 * Move every pane that showed one checkout's vault to another's, each keeping
 * its board. The board is read again from the new vault, and where it is not
 * there the pane says so, because what it asks for is missing.
 * @param from The vault of the checkout that was chosen, if it had one.
 * @param to The vault of the checkout chosen now.
 * @param repository The repository both are checkouts of.
 */
function movePanesToVault(from: string | null | undefined, to: string, repository: string): void {
	if (from === null || from === undefined || from === to) {
		return;
	}
	for (const clientId of paneClientsOfVault(from)) {
		movePaneVault(clientId, to);
		const key = paneBoardOf(clientId);
		if (key === null) {
			sendBoardlessToPane(clientId, {
				type: "pane_board",
				board: null,
				identity: null,
				vault: to,
				repository,
			});
		} else {
			const identity = parseBoardKey(key);
			sendToPane(clientId, { type: "pane_board", identity, vault: to, repository }, key);
			arrivedOnBoard(clientId, key);
		}
		tellPaneAboutVault(clientId, to);
	}
}

/**
 * Mount the repository list and the choice of a checkout. Both are the page's
 * own: the list names directories on this machine, and the choice changes what
 * every tab and every agent reads, so each is held to the browser origin the
 * opener settings are held to.
 * @param app The application.
 */
function mountRepositoryRoutes(app: Express): void {
	app.get("/api/repositories", createBrowserOriginGuard("settings-read"), repositoriesRoute);
	app.put(
		"/api/repositories/chosen",
		createBrowserOriginGuard("mutation"),
		asyncEndpoint((req, res) => chooseCheckoutRoute(req, res)),
	);
}

export { mountRepositoryRoutes };
