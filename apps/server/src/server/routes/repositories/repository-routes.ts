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
// The registry is one file that every server on the machine reads. This server
// changes it from the navigator's menu and from `browser show` in a checkout
// that is not chosen, and follows that change at once. A command changes it
// without any server (`repo use`, `repo add`, `repo forget`, and the first
// command in a checkout), and another checkout's server changes it when a show
// there chooses. So the server watches the file and follows every change it
// did not follow already, whoever made it.

import { agentActivity } from "#server/wiring/owners/server-owners.ts";
import fs from "fs";
import path from "path";
import type { Express, Request, Response } from "express";

import { logger } from "@archboard/diagnostics/logger";
import { readArchitectureModel } from "@archboard/board/store-read";
import { parseBoardKey } from "@archboard/board/address";
import { chooseKnownCheckout, listRegistry, registryPath } from "@archboard/workspace/checkouts";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import {
	semanticPaneContextFor,
	paneBoardOf,
	paneVaults,
	sendBoardlessToPane,
	sendToPane,
} from "@archboard/workbench/panes";
import { broadcastEverywhere, movePaneVault } from "#server/state/pane-vaults/pane-vaults.ts";
import { arrivedOnBoard } from "#server/routes/panes/pane-routes.ts";
import {
	listRepositories,
	openingVault,
	placeOfVault,
	vaultIn,
} from "@archboard/workspace/repository-listing";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";
import type { z } from "zod";
import { CheckoutChoiceSchema } from "@archboard/workspace/repositories";

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
function statedChoice(req: Request, res: Response): z.infer<typeof CheckoutChoiceSchema> | null {
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

/** What the registry file held when the panes last followed it, or null when there was none. */
let followedRegistry: string | null = null;

/** The watch of the registry file's directory, while there is one. */
let registryWatcher: fs.FSWatcher | null = null;

/**
 * The registry file as it is now, compared and never parsed: the panes follow
 * what `listRegistry` reads from it.
 * @returns Its text, or null when there is no file.
 */
function registryText(): string | null {
	try {
		return fs.readFileSync(registryPath(), "utf-8");
	} catch {
		return null;
	}
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
	followedRegistry = registryText();
	for (const entry of listRepositories()) {
		if (entry.vault !== null) agentActivity.follow(entry.vault);
	}
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
 * Preserve the pane's reported canonical presentation when its checkout changes.
 * @param key The canonical presentation key.
 * @param captured The optional exact pane capture.
 * @returns Its stable selectors or the initial structural reading.
 */
function followedReading(
	key: string,
	captured: NonNullable<ReturnType<typeof semanticPaneContextFor>>["architecture"],
) {
	if (captured == null) return { model: key.slice(6), grammar: "architecture" as const };
	return {
		...captured.selection,
		model: key.slice(6),
		grammar: captured.reading.grammar,
		scope: captured.reading.scope,
		focus: captured.reading.focus,
		flow: captured.reading.flow,
	};
}
/**
 * Follow a chosen checkout with the pane's captured canonical reading.
 * @param clientId The pane socket identity.
 * @param to The chosen vault.
 * @param repository The registered repository identity.
 * @param key The canonical presentation key.
 * @param captured The optional exact pane capture.
 */
function moveCanonicalPane(
	clientId: string,
	to: string,
	repository: string | null,
	key: string,
	captured: ReturnType<typeof semanticPaneContextFor> extends infer T
		? T extends { architecture?: infer A }
			? A
			: never
		: never,
): void {
	const reading = followedReading(key, captured);
	const model = readArchitectureModel(to);
	sendToPane(
		clientId,
		{
			type: "pane_model",
			model: key.slice(6),
			reading,
			...(model.success ? { revision: model.revision } : {}),
			vault: to,
			repository,
		},
		key,
	);
	arrivedOnBoard(clientId, key);
}
/**
 * Move one pane into another checkout's vault, keeping its board.
 * @param clientId The pane.
 * @param to The vault it moves into.
 * @param repository The name of the repository it is in.
 */
function movePane(clientId: string, to: string, repository: string | null): void {
	const captured = semanticPaneContextFor(clientId)?.architecture;
	const key = paneBoardOf(clientId);
	movePaneVault(clientId, to);
	if (key?.startsWith("model:")) {
		moveCanonicalPane(clientId, to, repository, key, captured);
		return;
	}
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
 * Follow the registry file whenever it changes and the panes have not followed
 * what it holds now. The directory is watched, because a write replaces the
 * file with a new one. A change this server made and followed already reads
 * the same as what the panes followed, so it is not followed twice.
 */
function watchRegistry(): void {
	if (registryWatcher !== null) {
		return;
	}
	const file = path.resolve(registryPath());
	followedRegistry = registryText();
	for (const entry of listRepositories()) {
		if (entry.vault !== null) agentActivity.follow(entry.vault);
	}
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		registryWatcher = fs.watch(path.dirname(file), { persistent: false }, (_event, name) => {
			if ((name !== null && name !== path.basename(file)) || registryText() === followedRegistry) {
				return;
			}
			logger.info(`The checkout registry ${file} changed, and the panes follow it`);
			followRegistry();
		});
		registryWatcher.on("error", (error) => {
			logger.warn(`Stopped watching the checkout registry ${file}`, { error });
		});
	} catch (error) {
		logger.warn(
			`Cannot watch the checkout registry ${file}, so the panes follow only the changes this server makes`,
			{ error },
		);
	}
}

/** Stop watching the registry file, because the server is stopping. */
function unwatchRegistry(): void {
	registryWatcher?.close();
	registryWatcher = null;
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
	app.put("/api/repositories/chosen", createBrowserOriginGuard("mutation"), chooseCheckoutRoute);
}

export { followRegistry, mountRepositoryRoutes, unwatchRegistry, watchRegistry };
