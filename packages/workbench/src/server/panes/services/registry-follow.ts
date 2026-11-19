// Every pane follows the checkout registry (ADR 0050).
//
// The registry is the one account of which checkout of a repository this
// machine reads. When it changes, a pane in the vault of a checkout that is not
// chosen moves to the chosen one, keeping its model, every other pane hears the
// name its repository goes by now, and every tab is told to read the list of
// repositories again. A pane whose model the new checkout has not got says so,
// because the model it asks for is not there.
//
// The registry is one file that every server on the machine reads. This server
// changes it from the navigator's menu and from `browser show` in a checkout
// that is not chosen, and follows that change at once. A command changes it
// without any server (`repo use`, `repo add`, `repo forget`, and the first
// command in a checkout), and another checkout's server changes it when a show
// there chooses. So the server watches the file and follows every change it
// did not follow already, whoever made it.

import fs from "fs";
import path from "path";

import { logger } from "@archboard/diagnostics/logger";
import { readArchitectureModel } from "@archboard/model-store";
import { parsePaneKey, type ArchitectureModelRead } from "@archboard/model-contract";
import { listRegistry } from "@archboard/workspace/checkouts";
import { listRepositories } from "@archboard/workspace/repository-listing";
import { placeOfVault } from "@archboard/workspace/vault";

import type { WebSocketMessage } from "#shared/protocol/pane-messages.ts";
import { agentActivity } from "#server/panes/services/agent-activity.ts";
import { semanticPaneContextFor } from "#server/panes/services/context.ts";
import { movePaneVault } from "#server/panes/services/pane-vaults.ts";
import {
	arrivedOnModel,
	paneKeyOfClient,
	panesWithVaults,
	sendKeylessToPane,
	sendToEveryClient,
	sendToPane,
} from "#server/panes/services/registry.ts";

/** What the registry file held when the panes last followed it, or null when there was none. */
let followedRegistry: string | null = null;

/** The watch of the registry file's directory, while there is one. */
let registryWatcher: fs.FSWatcher | null = null;

/** The registry file, which the server reads once and keeps until it stops watching it. */
let registryFile: string | null = null;

/**
 * The registry file, read once.
 * @returns Its path.
 */
function fileOfRegistry(): string {
	registryFile ??= path.resolve(listRegistry().path);
	return registryFile;
}

/**
 * The registry file as it is now, compared and never parsed: the panes follow
 * what `listRegistry` reads from it.
 * @returns Its text, or null when there is no file.
 */
function registryText(): string | null {
	try {
		return fs.readFileSync(fileOfRegistry(), "utf-8");
	} catch {
		return null;
	}
}

/** Tell the activity tracker which vaults a connected pane hears about. */
function registerReadableVaults(): void {
	agentActivity.register(listRepositories().flatMap((entry) => entry.vault ?? []));
}

/**
 * Bring every pane in line with the registry as it is now (ADR 0050). A pane in
 * the vault of a checkout that is not chosen, including one that is gone, moves
 * to the vault of the chosen checkout, keeping its model, and its model is read
 * again there. Every other pane is told where it is again, with the name its
 * repository goes by now, which a forgotten checkout or a renamed untracked
 * vault changes. Then every tab is told to read the list of repositories again.
 */
function followRegistry(): void {
	followedRegistry = registryText();
	registerReadableVaults();
	// A move sets the entry of a pane it has visited already, which adds no entry to visit.
	for (const [clientId, vault] of panesWithVaults()) {
		const { home, repository } = placeOfVault(vault);
		if (home === vault) {
			sendKeylessToPane(clientId, { type: "pane_place", vault, repository });
		} else {
			movePane(clientId, home, repository);
		}
	}
	const changed: WebSocketMessage = { type: "repositories_changed" };
	sendToEveryClient(JSON.stringify(changed));
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
 * Follow the registry file whenever it changes and the panes have not followed
 * what it holds now. The directory is watched, because a write replaces the
 * file with a new one. A change this server made and followed already reads
 * the same as what the panes followed, so it is not followed twice.
 */
function watchRegistry(): void {
	if (registryWatcher !== null) {
		return;
	}
	const file = fileOfRegistry();
	followedRegistry = registryText();
	registerReadableVaults();
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		registryWatcher = fs.watch(path.dirname(file), { persistent: false }, (_event, name) => {
			if ((name !== null && name !== path.basename(file)) || registryText() === followedRegistry) {
				return;
			}
			logger().info(`The checkout registry ${file} changed, and the panes follow it`);
			followRegistry();
		});
		registryWatcher.on("error", (error) => {
			logger().warn(`Stopped watching the checkout registry ${file}`, { error });
		});
	} catch (error) {
		logger().warn(
			`Cannot watch the checkout registry ${file}, so the panes follow only the changes this server makes`,
			{ error },
		);
	}
}

/** Stop watching the registry file, because the server is stopping. */
function unwatchRegistry(): void {
	registryWatcher?.close();
	registryWatcher = null;
	registryFile = null;
}

export { followRegistry, unwatchRegistry, watchRegistry };
