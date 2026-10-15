// The repositories the browser lists, and the one choice a person makes there:
// which checkout of a repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the boards of its chosen
// checkout's vault. Choosing a checkout is `repo use` from the page: it changes
// the choice for the whole machine, so every pane that showed a vault of
// another checkout of that repository is moved to the new one, keeping its
// board, and every tab is told to read the list again. A pane whose board the
// new checkout has not got says so, because the board it asks for is not there.

import path from "path";
import type { Express, Request, Response } from "express";

import { logger } from "@/runtime/engine/logger";
import { parseBoardKey } from "@/runtime/engine/board";
import { declareDirectory, listRegistry, RepoRegistryError } from "@/runtime/engine/repo-registry";
import { createBrowserOriginGuard } from "@/server/browser-origin";
import { asyncEndpoint } from "@/server/archboard/lib/mutation-work";
import { paneBoardOf, sendBoardlessToPane, sendToPane } from "@/server/archboard/lib/pane-registry";
import {
	broadcastEverywhere,
	movePaneVault,
	paneClientsOfVault,
} from "@/server/archboard/lib/pane-vaults";
import { arrivedOnBoard } from "@/server/archboard/lib/pane-routes";
import { listRepositories, vaultIn, VAULT_DIRECTORY } from "@/server/archboard/lib/repositories";
import { serverVault } from "@/server/archboard/lib/server-vault";
import { CheckoutChoiceSchema, type CheckoutChoice } from "@/shared/repositories/index";

/**
 * The repositories, as the navigator lists them.
 * @param _req The request.
 * @param res Its response.
 */
function repositoriesRoute(_req: Request, res: Response): void {
	res.json({ success: true, repositories: listRepositories(), served: serverVault() });
}

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
	const { repository, root, vault } = choice;
	if (!(await chose(root, res))) {
		return;
	}
	movePanesToVault(repository, vault);
	broadcastEverywhere({ type: "repositories_changed" });
	logger.info(`The chosen checkout of ${repository} is ${root}`);
	res.json({ success: true, repository, root });
}

/**
 * The checkout a choice names, when it is a known checkout of the named
 * repository that has a vault: the page offers nothing else. A root it did not
 * offer is refused rather than registered, and a checkout with no vault to read
 * is refused rather than chosen, because a pane moved there could read nothing
 * and name no vault the server accepts.
 * @param req The request.
 * @param res Its response, which carries the refusal when there is one.
 * @returns The repository, the checkout and its vault, or null once refused.
 */
function statedChoice(req: Request, res: Response): (CheckoutChoice & { vault: string }) | null {
	const parsed = CheckoutChoiceSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "Say which checkout to choose: { repository, root }.",
		});
		return null;
	}
	const { repository, root } = parsed.data;
	const checkout = listRegistry().checkouts.find(
		(each) => each.repo === repository && each.root === root,
	);
	if (checkout === undefined) {
		res.status(404).json({
			success: false,
			code: "CHECKOUT_UNKNOWN",
			error: `${root} is not a known checkout of ${repository}. Register it with \`archboard repo add ${root}\`.`,
		});
		return null;
	}
	const vault = checkout.exists ? vaultIn(root) : null;
	if (vault === null) {
		res.status(422).json({
			success: false,
			code: "CHECKOUT_UNUSABLE",
			error: checkout.exists
				? `${root} has no ${VAULT_DIRECTORY}, so it has no boards to read. Choose a checkout of ${repository} that has one.`
				: `${root} is gone from this machine. Choose another checkout of ${repository}, or remove it with \`archboard repo forget ${root}\`.`,
		});
		return null;
	}
	return { repository, root, vault };
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
 * The vaults of a repository's known checkouts, other than one. A checkout that
 * is gone is named by where its vault was, so a pane left in it moves too.
 * @param repository The repository identity.
 * @param except The vault to leave out.
 * @returns The vaults.
 */
function otherCheckoutVaults(repository: string, except: string): Set<string> {
	const vaults = listRegistry()
		.checkouts.filter((each) => each.repo === repository)
		.map((each) => vaultIn(each.root) ?? path.join(each.root, VAULT_DIRECTORY));
	return new Set(vaults.filter((vault) => vault !== except));
}

/**
 * Move every pane that shows a board of a repository to the vault of its chosen
 * checkout, each keeping its board (ADR 0050). Every pane in a vault of any other
 * checkout of it moves, not only those of the checkout chosen before, so a
 * pane left behind by `repo use` or by a choice that raced this one follows
 * too. The board is read again from the new vault, and where it is not there
 * the pane says so, because what it asks for is missing.
 * @param repository The repository identity.
 * @param to The vault of the checkout chosen now.
 */
function movePanesToVault(repository: string, to: string): void {
	const from = otherCheckoutVaults(repository, to);
	for (const clientId of [...from].flatMap(paneClientsOfVault)) {
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
