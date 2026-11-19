// The repositories the browser lists, and the choice of which checkout of a
// repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the models of its chosen
// checkout's vault. A choice changes the checkout registry, and every pane
// follows the registry, which the workbench owns.

import type { Express, Request, Response } from "express";

import { logger } from "@archboard/diagnostics/logger";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import { followRegistry } from "@archboard/workbench/server";
import { chooseCheckout } from "@archboard/workspace/checkouts";
import { listRepositories } from "@archboard/workspace/repository-listing";
import { workspaceShape } from "@archboard/workspace/shapes";
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
 * Choose which checkout of a repository this machine reads, as `repo use` does. A choice names a
 * known checkout of the named repository that has a vault: the page offers nothing else. A root it
 * did not offer is refused rather than registered, and a checkout with no vault to read is refused
 * rather than chosen, because a pane moved there could read nothing and name no vault the server
 * accepts.
 * @param req The request.
 * @param res Its response.
 */
function chooseCheckoutRoute(req: Request, res: Response): void {
	const parsed = workspaceShape("checkoutChoice").safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "Say which checkout to choose: { repository, root }.",
		});
		return;
	}
	const { repository, root } = parsed.data;
	const choice = chooseCheckout(repository, root);
	if (choice.kind !== "chosen") {
		refuseChoice(res, choice.kind, repository, root);
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
 * Refuse a choice of a root that is not a known checkout of the repository, is gone, or has no vault.
 * @param res The response.
 * @param refusal Why the checkout cannot be chosen.
 * @param repository The repository the choice named.
 * @param root The root it named.
 */
function refuseChoice(
	res: Response,
	refusal: Exclude<ReturnType<typeof chooseCheckout>["kind"], "chosen">,
	repository: string,
	root: string,
): void {
	if (refusal === "unknown") {
		res.status(404).json({
			success: false,
			code: "CHECKOUT_UNKNOWN",
			error: `${root} is not a known checkout of ${repository}. Register it with \`archboard repo add ${root}\`.`,
		});
		return;
	}
	res.status(422).json({
		success: false,
		code: "CHECKOUT_UNUSABLE",
		error:
			refusal === "no-vault"
				? `${root} has no ${vaultDirectory()}, so it has no models to read. Choose a checkout of ${repository} that has one.`
				: `${root} is gone from this machine. Choose another checkout of ${repository}, or remove it with \`archboard repo forget ${root}\`.`,
	});
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
