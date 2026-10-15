// The repositories the browser lists, and the choice of which checkout of a
// repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the boards of its chosen
// checkout's vault. The registry is the one account of that, and every pane
// follows it: when it changes, a pane in the vault of a checkout that is not
// chosen moves to the chosen one, keeping its board, every other pane hears the
// name its repository goes by now, and every tab is told to read the list again.
// A pane whose board the new checkout has not got says so, because the board it
// asks for is not there.
//
// The registry changes three ways that the server sees: the navigator's menu,
// `browser show` from a checkout that is not chosen, and a command that wrote
// the registry itself and says so here (`repo use`, `repo add`, `repo forget`,
// and the first command in a checkout).

import path from "path";
import type { Express, Request, Response } from "express";

import { logger } from "@/runtime/engine/logger";
import { parseBoardKey } from "@/runtime/engine/board";
import { chooseKnownCheckout, listRegistry, registryPath } from "@/runtime/engine/repo-registry";
import { createBrowserOriginGuard } from "@/server/browser-origin";
import {
	paneBoardOf,
	paneVaults,
	sendBoardlessToPane,
	sendToPane,
} from "@/server/archboard/lib/pane-registry";
import { broadcastEverywhere, movePaneVault } from "@/server/archboard/lib/pane-vaults";
import { arrivedOnBoard } from "@/server/archboard/lib/pane-routes";
import {
	listRepositories,
	openingVault,
	placeOfVault,
	vaultIn,
	VAULT_DIRECTORY,
} from "@/server/archboard/lib/repositories";
import { bodyOf } from "@/server/archboard/lib/request-board";
import { CheckoutChoiceSchema, type CheckoutChoice } from "@/shared/repositories/index";

/**
 * The repositories, as the navigator lists them.
 * @param _req The request.
 * @param res Its response.
 */
function repositoriesRoute(_req: Request, res: Response): void {
	res.json({ success: true, repositories: listRepositories(), served: openingVault() });
}

/**
 * Choose which checkout of a repository this machine reads, as `repo use` does.
 * @param req The request.
 * @param res Its response.
 */
function chooseCheckoutRoute(req: Request, res: Response): void {
	const choice = statedChoice(req, res);
	if (choice === null) {
		return;
	}
	const { repository, root } = choice;
	if (chooseKnownCheckout(root) === undefined) {
		refuseUnknownCheckout(res, repository, root);
		return;
	}
	logger.info(`The chosen checkout of ${repository} is ${root}`);
	// Followed even when the checkout was chosen already: a person who chooses
	// it again from the menu is asking for what it reads, and a pane that a
	// change the server never heard of left in another checkout follows too.
	followRegistry();
	res.json({ success: true, repository, root });
}

/**
 * Refuse a choice of a root that is not a known checkout of the repository.
 * @param res The response.
 * @param repository The repository the choice named.
 * @param root The root it named.
 */
function refuseUnknownCheckout(res: Response, repository: string, root: string): void {
	res.status(404).json({
		success: false,
		code: "CHECKOUT_UNKNOWN",
		error: `${root} is not a known checkout of ${repository}. Register it with \`archboard repo add ${root}\`.`,
	});
}

/**
 * The checkout a choice names, when it is a known checkout of the named
 * repository that has a vault: the page offers nothing else. A root it did not
 * offer is refused rather than registered, and a checkout with no vault to read
 * is refused rather than chosen, because a pane moved there could read nothing
 * and name no vault the server accepts.
 * @param req The request.
 * @param res Its response, which carries the refusal when there is one.
 * @returns The repository and the checkout, or null once refused.
 */
function statedChoice(req: Request, res: Response): CheckoutChoice | null {
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
		refuseUnknownCheckout(res, repository, root);
		return null;
	}
	if (!checkout.exists || vaultIn(root) === null) {
		res.status(422).json({
			success: false,
			code: "CHECKOUT_UNUSABLE",
			error: checkout.exists
				? `${root} has no ${VAULT_DIRECTORY}, so it has no boards to read. Choose a checkout of ${repository} that has one.`
				: `${root} is gone from this machine. Choose another checkout of ${repository}, or remove it with \`archboard repo forget ${root}\`.`,
		});
		return null;
	}
	return { repository, root };
}

/**
 * Bring every pane in line with the registry as it is now (ADR 0050). A pane in
 * the vault of a checkout that is not chosen, including one that is gone, moves
 * to the vault of the chosen checkout, keeping its board, and its board is read
 * again there. Every other pane is told where it is again, with the name its
 * repository goes by now, which a forgotten checkout or a renamed untracked
 * vault changes. Then every tab is told to read the list of repositories again.
 */
function followRegistry(): void {
	// A move sets the entry of a pane it has visited already, which adds no entry to visit.
	for (const [clientId, vault] of paneVaults) {
		const { home, repository } = placeOfVault(vault);
		if (home === vault) {
			sendBoardlessToPane(clientId, { type: "pane_board", vault, repository });
		} else {
			movePane(clientId, home, repository);
		}
	}
	broadcastEverywhere({ type: "repositories_changed" });
}

/**
 * Move one pane into another checkout's vault, keeping its board.
 * @param clientId The pane.
 * @param to The vault it moves into.
 * @param repository The name of the repository it is in.
 */
function movePane(clientId: string, to: string, repository: string | null): void {
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
		return;
	}
	sendToPane(
		clientId,
		{ type: "pane_board", identity: parseBoardKey(key), vault: to, repository },
		key,
	);
	arrivedOnBoard(clientId, key);
}

/**
 * A command wrote the registry and says so: follow it. A command that wrote
 * another registry file than this server reads changes nothing here, so a
 * command with a registry of its own, such as a test's, moves no pane of a
 * server that reads the machine's.
 * @param req The request, whose body names the registry file the command wrote.
 * @param res Its response.
 */
function registryChangedRoute(req: Request, res: Response): void {
	const written = bodyOf(req)["registry"];
	const ours =
		typeof written === "string" && path.resolve(written) === path.resolve(registryPath());
	if (ours) {
		followRegistry();
	}
	res.json({ success: true, followed: ours });
}

/**
 * Mount the repository list, the choice of a checkout and the news that a
 * command changed the registry. The list and the choice are the page's own:
 * the list names directories on this machine, and the choice changes what every
 * tab and every agent reads, so each is held to the browser origin the opener
 * settings are held to. The news changes nothing but what the panes are told,
 * which they are told from the registry, so any local process may send it.
 * @param app The application.
 */
function mountRepositoryRoutes(app: Express): void {
	app.get("/api/repositories", createBrowserOriginGuard("settings-read"), repositoriesRoute);
	app.put("/api/repositories/chosen", createBrowserOriginGuard("mutation"), chooseCheckoutRoute);
	app.post("/api/repositories/changed", registryChangedRoute);
}

export { followRegistry, mountRepositoryRoutes };
