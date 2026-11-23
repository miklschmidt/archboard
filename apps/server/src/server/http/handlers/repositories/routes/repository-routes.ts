// The repositories the browser lists, and the choice of which checkout of a
// repository this machine reads (ADR 0050).
//
// The navigator lists every repository identity with a known checkout that has a
// vault, and every untracked vault, each with the models of its chosen
// checkout's vault. The registry is the one account of that, and every pane
// follows it: when the registry changes, a pane in the vault of a checkout that
// is not chosen moves to the chosen one, keeping its model, and every other pane
// hears the name its repository goes by now. A pane whose model the new checkout
// has not got says so, because the model it asks for is not there.
//
// The registry is one file that every server on the machine reads. This server
// changes it from the navigator's menu and from `browser show` in a checkout
// that is not chosen, and follows that change at once. A command changes it
// without any server (`repo use`, `repo add`, `repo forget`, and the first
// command in a checkout), and another checkout's server changes it when a show
// there chooses. So the server watches the file. The listing also reads the
// disk, and a checkout or a vault can come or go with the registry unchanged, so
// while a tab follows the repositories the server looks again on a slow tick.
// Either way it compares the listing with the one it published last and sends
// a different listing to every tab that follows the repositories.

import { agentActivity } from "#server/wiring/server-owners.ts";
import fs from "fs";
import path from "path";
import type { Express, Request, Response } from "express";

import { logger } from "@archboard/diagnostics/logger";
import { readArchitectureModel } from "@archboard/model/store-read";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { parsePaneKey } from "@archboard/model/legacy-address";
import { chooseKnownCheckout, listRegistry, registryPath } from "@archboard/workspace/checkouts";
import { createBrowserOriginGuard } from "@archboard/code-opener/browser-origin";
import {
	arrivedOnModel,
	movePaneVault,
	paneKeyOfClient,
	panesWithVaults,
	semanticPaneContextFor,
	sendKeylessToPane,
	sendToPane,
} from "@archboard/workbench/panes";
import { listRepositories, placeOfVault, vaultIn } from "@archboard/workspace/repository-listing";
import { vaultDirectory } from "@archboard/workspace/vault";
import type { z } from "zod";
import {
	checkoutChoiceSchema,
	type repositoryListingSchema,
} from "@archboard/workspace/repositories";
import { every } from "@archboard/timing";

/**
 * The repositories, as the navigator lists them.
 * @param _req The request.
 * @param res Its response.
 */
function repositoriesRoute(_req: Request, res: Response): void {
	res.json(refresh());
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
	// The answer is the listing, so the page that chose has it without a frame.
	res.json(followRegistry());
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

/** The listing as this server publishes it. */
type Listing = z.infer<ReturnType<typeof repositoryListingSchema>>;

/** What this server last published, and its text, which a new look is compared with. */
let published: { readonly listing: Listing; readonly text: string } | null = null;

/** Every tab that follows the repositories, by what sends it the listing. */
const followers = new Set<(listing: Listing) => void>();

/** The slow look at the disk, while a tab follows the repositories. */
let recheck: (() => void) | null = null;

/** The watch of the registry file's directory, while there is one. */
let registryWatcher: fs.FSWatcher | null = null;

/** The registry contents that panes last followed, independent of what the navigator can list. */
let followedRegistry: string | null = null;

/**
 * Read the registry contents to recognise changes that affect pane placement.
 * @returns The contents, or null when the file is missing or unreadable.
 */
function registryText(): string | null {
	try {
		return fs.readFileSync(registryPath(), "utf-8");
	} catch {
		return null;
	}
}

/**
 * Send a changed listing to the tabs that follow it.
 * @param repositories The current list.
 * @param text The serialized list used to recognize changes.
 * @returns The listing as published.
 */
function publish(repositories: Listing["repositories"], text: string): Listing {
	const revision = (published?.listing.revision ?? -1) + 1;
	const listing: Listing = { success: true, revision, repositories };
	agentActivity.register(repositories.flatMap((entry) => entry.vault ?? []));
	published = { listing, text };
	for (const send of followers) send(listing);
	return listing;
}

/**
 * Follow changes in pane placement and publish changes to the listing.
 * @param chosenHere Whether this server made a choice whose panes must follow.
 * @returns The current listing.
 */
function refresh(chosenHere = false): Listing {
	const repositories = listRepositories();
	const text = JSON.stringify(repositories);
	const cached = published?.text === text ? published.listing : undefined;
	followPanes(chosenHere || cached === undefined);
	return cached ?? publish(repositories, text);
}

/**
 * Bring every pane in line with the registry (ADR 0050). A pane in the vault of
 * an unchosen checkout moves to the chosen vault, keeping its model. Every other
 * pane hears its repository name, even if the navigator has no entry for it.
 * @param placementMayHaveChanged Whether a listing or a local choice can affect pane placement.
 */
function followPanes(placementMayHaveChanged: boolean): void {
	const registry = registryText();
	if (!placementMayHaveChanged && registry === followedRegistry) return;
	// A move sets the entry of a pane it has visited already, which adds no entry to visit.
	for (const [clientId, vault] of panesWithVaults()) {
		const { home, repository } = placeOfVault(vault);
		if (home === vault) {
			sendKeylessToPane(clientId, { type: "pane_place", vault, repository });
		} else {
			movePane(clientId, home, repository);
		}
	}
	followedRegistry = registry;
}

/**
 * Follow a checkout choice from this server and return the listing it produces.
 * @returns The listing as published.
 */
function followRegistry(): Listing {
	return refresh(true);
}

/**
 * Look again from a watch or a tick, where a failure has no caller to answer.
 * @param why What made the server look.
 */
function lookAgainFor(why: string): void {
	try {
		refresh();
	} catch (error) {
		logger().warn(`Cannot list the repositories of this machine after ${why}`, { error });
	}
}

/**
 * Send a tab the listing now, and every listing that differs from then on. While any tab
 * follows, the server looks at the disk again on a slow tick. A look that fails sends the
 * listing published last, or nothing until a look succeeds.
 * @param send What sends the tab one listing.
 * @returns The function that stops following.
 */
function followRepositories(send: (listing: Listing) => void): () => void {
	lookAgainFor("a tab followed the repositories");
	followers.add(send);
	if (published !== null) send(published.listing);
	if (recheck === null) {
		recheck = every("pane.repositoryRecheck", () => lookAgainFor("a recheck"));
	}
	return () => {
		followers.delete(send);
		if (followers.size > 0 || recheck === null) return;
		recheck();
		recheck = null;
	};
}

type CapturedArchitecture = NonNullable<ReturnType<typeof semanticPaneContextFor>>["architecture"];

/**
 * Preserve the pane's reported canonical presentation when its checkout changes.
 * @param key The canonical presentation key.
 * @param captured The optional exact pane capture.
 * @param model The chosen checkout's available policy.
 * @returns Its stable selectors or the initial structural reading.
 */
function followedReading(
	key: string,
	captured: CapturedArchitecture,
	model: ArchitectureModelRead,
) {
	if (captured == null) return { model: key.slice(6), grammar: "architecture" as const };
	const { relationshipKinds } = captured.reading;
	return {
		...captured.selection,
		model: key.slice(6),
		grammar: captured.reading.grammar,
		scope: captured.reading.scope,
		focus: captured.reading.focus,
		expand: captured.reading.expand,
		flow: captured.reading.flow,
		lens: captured.reading.lens,
		hideKinds: model.success
			? Object.keys(model.policy.relationshipKinds).filter(
					(kind) => !relationshipKinds.includes(kind),
				)
			: undefined,
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
	captured: CapturedArchitecture,
): void {
	const model = readArchitectureModel(to);
	const reading = followedReading(key, captured, model);
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
	arrivedOnModel(clientId, key);
}
/**
 * Move one pane into another checkout's vault, keeping its model.
 * @param clientId The pane.
 * @param to The vault it moves into.
 * @param repository The name of the repository it is in.
 */
function movePane(clientId: string, to: string, repository: string | null): void {
	const captured = semanticPaneContextFor(clientId)?.architecture;
	const key = paneKeyOfClient(clientId);
	movePaneVault(clientId, to);
	if (key?.startsWith("model:")) {
		moveCanonicalPane(clientId, to, repository, key, captured);
		return;
	}
	if (key === null) {
		sendKeylessToPane(clientId, {
			type: "pane_place",
			paneKey: null,
			identity: null,
			vault: to,
			repository,
		});
		return;
	}
	sendToPane(
		clientId,
		{ type: "pane_place", identity: parsePaneKey(key), vault: to, repository },
		key,
	);
	arrivedOnModel(clientId, key);
}

/**
 * Look at the repositories again whenever the registry file changes. The
 * directory is watched, because a write replaces the file with a new one. A
 * change this server made and followed already need only check the listing.
 */
function watchRegistry(): void {
	if (registryWatcher !== null) {
		return;
	}
	const file = path.resolve(registryPath());
	refresh();
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		registryWatcher = fs.watch(path.dirname(file), { persistent: false }, (_event, name) => {
			if (name !== null && name !== path.basename(file)) return;
			lookAgainFor(`a change of the checkout registry ${file}`);
		});
		registryWatcher.on("error", (error) => {
			logger().warn(`Stopped watching the checkout registry ${file}`, { error });
		});
	} catch (error) {
		logger().warn(
			`Cannot watch the checkout registry ${file}. The server still checks it while a tab follows the repositories.`,
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

export {
	followRegistry,
	followRepositories,
	mountRepositoryRoutes,
	unwatchRegistry,
	watchRegistry,
};
