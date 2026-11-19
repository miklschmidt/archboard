// The repositories the browser lists, and the choice of which checkout of a
// repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the models of its chosen
// checkout's vault. A choice changes the checkout registry, and every pane
// follows the registry, which the workbench owns.

import type { Express, Request, Response } from "express";
import type { z } from "zod";

import { logger } from "@archboard/diagnostics/logger";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import { followRegistry } from "@archboard/workbench/server";
import { chooseKnownCheckout, listRegistry } from "@archboard/workspace/checkouts";
import { checkoutChoiceSchema } from "@archboard/workspace/repositories";
import { listRepositories, vaultIn } from "@archboard/workspace/repository-listing";
import { vaultDirectory } from "@archboard/workspace/vault";

/**
 * The repositories, as the navigator lists them.
 * @param _req The request.
 * @param res Its response.
 */
function repositoriesRoute(_req: Request, res: Response): void {
	res.json({ success: true, repositories: listRepositories() });
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
	logger().info(`The chosen checkout of ${repository} is ${root}`);
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
function statedChoice(
	req: Request,
	res: Response,
): z.infer<ReturnType<typeof checkoutChoiceSchema>> | null {
	const parsed = checkoutChoiceSchema().safeParse(req.body);
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
				? `${root} has no ${vaultDirectory()}, so it has no models to read. Choose a checkout of ${repository} that has one.`
				: `${root} is gone from this machine. Choose another checkout of ${repository}, or remove it with \`archboard repo forget ${root}\`.`,
		});
		return null;
	}
	return { repository, root };
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

export { mountRepositoryRoutes };
