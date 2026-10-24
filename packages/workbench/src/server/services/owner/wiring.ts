import {
	ARCHBOARD_INSTRUCTIONS,
	ARCHBOARD_CONTEXT_CODEC,
} from "#runtime/services/host/archboard.ts";
import { createArchboardVoicePolicy } from "#runtime/services/host/archboard-voice.ts";
import { checkoutNamedBy } from "#server/services/host/archboard-checkouts.ts";
import { createArchboardCoordinatorContextSource } from "#server/services/host/archboard-context-source.ts";
import { logger } from "@archboard/diagnostics/logger";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { codexWiring, resetCodexWorkbenchWiring } from "#server/services/owner/wiring-hooks.ts";
import { semanticChangeFeed } from "#server/services/panes/change-feed.ts";
import { workbenchFeedFor } from "#server/services/sessions/feed.ts";

import type { SettledChangeSourceEvent } from "#runtime/schemas/semantic-context-types.ts";
import {
	serverStartupOwnershipRecord,
	writeServerStartupProtocolRecord,
} from "@archboard/server-lifecycle/startup-terminal";
import type { CodexWorkbenchComponents } from "#server/services/generation/lifecycle.ts";
import type { CodexWorkbenchTabSession } from "#server/protocol/generation/session-contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createServerCodexBrowserSocketOwner } from "#server/services/browser-socket/socket.ts";
import type { createServerCodexWorkbenchApplication } from "#server/services/owner/application.ts";
import type { ArchboardWorkbenchServer } from "#server/services/owner/production.ts";
import {
	canonicalContextFromBrief,
	fullInputFor,
	semanticInputFor,
} from "#server/projections/semantic-context/semantic-input.ts";
import { waitForTargetsWith } from "#server/services/dynamic-tools/target-wait.ts";
import { liveWorkhorseCheckouts } from "#server/projections/browser-state/workhorse-list.ts";
import { checkoutRoot as sourceRoot } from "#server/services/host/module-paths.ts";
import { narrationChangesOf } from "#server/projections/semantic-context/walkthrough-narration.ts";
import { canvasOf } from "#server/projections/semantic-context/tab-canvas.ts";
import {
	browserLeaseLedger,
	codexSocketInstances,
	currentSocketsByClient,
	panes,
} from "#server/services/panes/registry.ts";
import {
	currentShownCheckout,
	endTabSessionsOnceGone,
	onShownChange,
	shownCheckoutOf,
	tabSessionOf,
} from "#server/services/panes/tab-sessions.ts";
import { repositoryOfVault, vaultIn } from "@archboard/workspace/repository-listing";
import {
	boundSessionOf,
	changePane,
	deliveryBound,
	hearsVault,
	openPaneOf,
	operationPane,
	pinnedCheckoutOf,
	presentingPaneOf,
	requireWorkhorse,
	semanticOwners,
} from "#server/services/sessions/panes.ts";

type OperationAuthority = Parameters<ArchboardWorkbenchServer["contextForOperation"]>[0];

/**
 * Whether a pane's thread link still names exactly the authority an
 * operation was leased under.
 * @param binding The pane's current binding.
 * @param authority The leased authority.
 * @returns True when nothing has changed.
 */
function bindingMatchesAuthority(
	binding: ReturnType<CodexWorkbenchComponents["threadLink"]["read"]>,
	authority: OperationAuthority,
): boolean {
	const link = binding.link;
	if (link.state !== "executable") {
		return false;
	}
	return (
		link.threadId === authority.threadId &&
		link.childId === authority.childId &&
		link.epoch === authority.epoch &&
		(authority.linkRevision === undefined || binding.revision === authority.linkRevision)
	);
}

/**
 * Install the workbench gateway's browser hooks over every socket currently
 * presenting a pane, and return the remover. A tab's conversation opens as its
 * first pane connects.
 * @param components The gateway, and the tab sessions it serves.
 * @returns Removes the hooks and disposes the socket owner.
 */
function installBrowserGateway(
	components: Pick<CodexWorkbenchComponents, "gateway" | "sessions">,
): () => void {
	const socketOwner = createServerCodexBrowserSocketOwner({
		gateway: components.gateway,
		/**
		 * The pane a browser id presents.
		 * @param browserId The browser's client id.
		 * @returns The pane id, or null while it has no registration.
		 */
		paneForBrowser: (browserId) => panes.get(browserId)?.paneId ?? null,
		/**
		 * The tab session a browser id's socket named.
		 * @param browserId The browser's client id.
		 * @returns The tab session, or null while it named none.
		 */
		tabSessionForBrowser: tabSessionOf,
		/**
		 * Open a connecting tab's conversation, or find it open.
		 * @param tabSessionId The tab session.
		 */
		openTabSession: (tabSessionId) => {
			components.sessions.open(tabSessionId);
		},
	});
	/** Take the hooks down. */
	const remove = (): void => {
		socketOwner.dispose();
		resetCodexWorkbenchWiring();
	};
	/**
	 * Hand one browser message to the socket owner.
	 * @param instance The socket's connection instance.
	 * @param browserId The browser's client id.
	 * @param input The message.
	 * @param send How to answer.
	 * @returns Resolves once handled.
	 */
	codexWiring.codex.handleBrowserMessage = (instance, browserId, input, send) =>
		socketOwner.handle(instance, browserId, input, { send });
	codexWiring.codex.acceptBrowser = socketOwner.accept;
	codexWiring.codex.closeBrowser = socketOwner.close;
	codexWiring.codex.drainBrowsers = socketOwner.drain;
	try {
		for (const [browserId, socket] of currentSocketsByClient) {
			const instance = codexSocketInstances.get(socket);
			if (instance !== undefined) {
				socketOwner.accept(instance, browserId);
			}
		}
	} catch (error) {
		remove();
		throw error;
	}
	return remove;
}

/**
 * The server the Codex workbench installation runs against: how it reads the
 * server (panes, boards, selection, locks) and how it wires itself into the
 * server's sockets.
 * @returns The server.
 */
function createArchboardWorkbenchServer(): ArchboardWorkbenchServer {
	let active: CodexWorkbenchComponents | null = null;
	let installedIdentity: CodexWorkbenchComponents["identity"] | null = null;

	/**
	 * The live generation and one of its tab sessions.
	 * @param tabSessionId The tab session.
	 * @returns Both.
	 * @throws {Error} While no generation is installed, or the session is not live in it.
	 */
	const liveSession = (
		tabSessionId: TabSessionId,
	): {
		readonly components: CodexWorkbenchComponents;
		readonly session: CodexWorkbenchTabSession;
	} => {
		if (active === null) {
			throw new Error("The Codex workbench context is not ready.");
		}
		return { components: active, session: active.sessions.require(tabSessionId) };
	};

	const integration: ArchboardWorkbenchServer = {
		host: {
			instructions: ARCHBOARD_INSTRUCTIONS,
			contextCodec: ARCHBOARD_CONTEXT_CODEC,
			resolveCheckout: checkoutNamedBy,
			/**
			 * Read context for the exact operation and execution authority supplied by the core.
			 * @param authority The core-owned operation authority.
			 * @param operation The pending operation identity.
			 * @returns The canonical context of this exact operation.
			 */
			contextForOperation: (authority, operation) =>
				integration.contextForOperation(authority, operation),
			/**
			 * Build this tab session’s Archboard voice policy.
			 * @param tabSessionId The tab session that owns this policy.
			 * @returns The Archboard voice policy for this session.
			 */
			voiceFor: (tabSessionId) => createArchboardVoicePolicy(narrationChangesOf(tabSessionId)),
			/**
			 * Publish complete domain snapshots for this tab session.
			 * @param tabSessionId The tab session that owns this policy.
			 * @returns The context source for this session.
			 */
			coordinatorContextFor: (tabSessionId) =>
				createArchboardCoordinatorContextSource({
					/**
					 * Read the vault of the pane that presents this session.
					 * @returns The presenting vault, or null with no open pane.
					 */
					vault: () => {
						const session = active?.sessions.list().find(({ id }) => id === tabSessionId);
						return session === undefined ? null : (presentingPaneOf(session)?.vault ?? null);
					},
					/**
					 * Subscribe to host context changes and return the subscription cleanup.
					 * @param listener Receives domain changes.
					 * @returns The cleanup that ends the subscriptions.
					 */
					subscribe: (listener) => {
						const publisher = liveSession(tabSessionId).session.components.semanticPublisher;
						const stops = [
							publisher.subscribePaneFocus(listener),
							publisher.subscribePaneSelection(listener),
						];
						return () => {
							for (const stop of stops) stop();
						};
					},
				}),
		},
		sourceRoot,
		/**
		 * Record which process group the Codex app-server runs in, for the startup protocol.
		 * @param codexGroup The process group identity.
		 */
		onCodexProcessGroupOwned: (codexGroup) => {
			writeServerStartupProtocolRecord(
				serverStartupOwnershipRecord({ serverPid: process.pid, codexGroup }),
			);
		},
		/**
		 * Where one tab session's voice context is published from: what the session's panes show,
		 * told as the workhorse voice is bound to is.
		 * @param tabSessionId The tab session.
		 * @returns The publisher options.
		 */
		semanticPublisherFor: (tabSessionId) => ({
			feed: workbenchFeedFor((vault) => {
				const session = active?.sessions.list().find(({ id }) => id === tabSessionId);
				return session !== undefined && hearsVault(session, vault);
			}),
			feedId: semanticChangeFeed.feedId,
			fresh: {
				/**
				 * A fresh semantic input for the board of the pane the session presents through.
				 * @returns The input.
				 */
				read: () => {
					const { components, session } = liveSession(tabSessionId);
					const owners = semanticOwners(components, session, session.voiceWorkhorse());
					return fullInputFor(owners, openPaneOf(session));
				},
			},
			/**
			 * The semantic input for a settled change, as the session's voice is shown it.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				const { components, session } = liveSession(tabSessionId);
				return semanticInputFor(
					semanticOwners(components, session, session.voiceWorkhorse()),
					event.vault,
					event.board,
					{ feedId: semanticChangeFeed.feedId, sequence: event.cursor },
					changePane(session),
				);
			},
		}),
		/**
		 * Where one workhorse's board news is published from: the changes of its checkout's boards
		 * that its tab session hears, told as that workhorse is.
		 * @param tabSessionId The workhorse's tab session.
		 * @param checkout The checkout it works in.
		 * @returns The publisher options.
		 */
		workhorsePublisherFor: (tabSessionId, checkout) => ({
			feed: workbenchFeedFor((vault) => {
				const session = active?.sessions.list().find(({ id }) => id === tabSessionId);
				return (
					session !== undefined && checkoutOfVault(vault) === checkout && hearsVault(session, vault)
				);
			}),
			feedId: semanticChangeFeed.feedId,
			fresh: {
				/**
				 * A fresh semantic input for the board of the pane the session presents through, told
				 * as this workhorse is.
				 * @returns The input.
				 */
				read: () => {
					const { components, session } = liveSession(tabSessionId);
					const owners = semanticOwners(components, session, requireWorkhorse(session, checkout));
					return fullInputFor(owners, openPaneOf(session));
				},
			},
			/**
			 * The semantic input for a settled change, as this workhorse is shown it.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 * @throws {Error} When the workhorse has no delivery bound.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				const { components, session } = liveSession(tabSessionId);
				const workhorse = requireWorkhorse(session, checkout);
				if (!deliveryBound(workhorse)) {
					throw new Error("The Codex semantic publisher has no current thread-context binding.");
				}
				return semanticInputFor(
					semanticOwners(components, session, workhorse),
					event.vault,
					event.board,
					{ feedId: semanticChangeFeed.feedId, sequence: event.cursor },
					changePane(session),
				);
			},
		}),
		/**
		 * The checkout whose conversation a browser pane's tab shows, pinned the first time it is
		 * read to the checkout of the tab's focused pane, else of the asking pane.
		 * @param browserId The browser's client id.
		 * @returns The checkout.
		 */
		shownCheckoutOf: (browserId) => shownCheckoutOf(browserId, () => pinnedCheckoutOf(browserId)),
		shownConversationOf: currentShownCheckout,
		/**
		 * Hear every change of a tab's shown conversation.
		 * @param listener What to tell.
		 * @returns How to stop listening.
		 */
		onShownChange: (listener) => onShownChange(() => listener()),
		/**
		 * The repository a checkout is listed under: that of the vault it holds.
		 * @param checkout The checkout.
		 * @returns The repository's name, or null when no registered directory holds it.
		 */
		repositoryOfCheckout: (checkout) => {
			const vault = vaultIn(checkout);
			return vault === null ? null : repositoryOfVault(vault);
		},
		narrationChangesFor: narrationChangesOf,
		canvasFor: canvasOf,
		/**
		 * The vault of the pane a tab session presents through.
		 * @param tabSessionId The tab session.
		 * @returns The vault's directory, or null while none of its panes is open.
		 */
		presentingVaultFor: (tabSessionId) =>
			presentingPaneOf(liveSession(tabSessionId).session)?.vault ?? null,
		/**
		 * The canonical context of a settled event, filed under the pane it presents.
		 * @param event The settled event.
		 * @param operation The operation in flight, if any.
		 * @returns The context.
		 */
		contextForEvent: (event, operation) =>
			canonicalContextFromBrief(
				event,
				event.pane.paneId,
				operation === undefined
					? { id: null, kind: null, rpc: null, outcome: null }
					: { ...operation, outcome: null },
			),
		/**
		 * The canonical context of an operation leased under one tab session's link,
		 * refusing when that link has changed since the lease.
		 * @param authority The leased authority.
		 * @param operation The operation.
		 * @returns The context.
		 */
		contextForOperation: (authority, operation) => {
			const { components, session } = liveSession(authority.tabSessionId);
			const workhorse = requireWorkhorse(session, authority.checkout);
			const pane = operationPane(session, authority.clientId);
			if (!bindingMatchesAuthority(components.threadLink.read(workhorse.key), authority)) {
				throw new Error("The lease-bound Codex pane context changed before capture.");
			}
			const exactInput = fullInputFor(semanticOwners(components, session, workhorse), pane);
			return canonicalContextFromBrief(
				session.components.semanticPublisher.freshBriefFor(exactInput),
				pane.paneId,
				{ ...operation, outcome: null },
			);
		},
		/**
		 * Wait for one of the owner's target threads to need attention or finish.
		 * @param input The wait.
		 * @returns The event that ended it.
		 */
		waitForTargets: async (input) => {
			const workbench = active;
			if (workbench === null) {
				throw new Error("The Codex workbench is not ready to observe targets.");
			}
			return waitForTargetsWith(workbench, input);
		},
		browserLeaseLedger,
		/**
		 * Remember the identity decoders the next graph must match.
		 * @param identity The decoders.
		 */
		installIdentityDecoders: (identity) => {
			installedIdentity = identity;
		},
		/**
		 * Make a graph the active one, end its tab sessions once gone, and return the remover.
		 * @param components The graph.
		 * @returns Deactivates that graph, if it is still the active one.
		 */
		installLifecycleSignals: (components) => {
			if (installedIdentity !== components.identity) {
				throw new Error("The installed identity decoders do not match the active graph.");
			}
			active = components;
			/**
			 * Publish fresh context when a pane changes focus or selection, to its own tab's
			 * conversation once that has one to tell: another tab's hand is not its news.
			 * @param clientId The pane reporting a change.
			 * @param kind The semantic change to publish.
			 * @param userChanged What of it the user changed by hand; empty when nothing was.
			 * @param agentSwitch What an agent's `browser show` moved, when one did (TASK-293.06).
			 */
			codexWiring.codex.publishPaneContext = (clientId, kind, userChanged, agentSwitch) => {
				const pane = panes.get(clientId);
				const session = boundSessionOf(components, clientId);
				if (pane === undefined || session === null) return;
				const { semanticPublisher } = session.components;
				try {
					const owners = semanticOwners(components, session, session.voiceWorkhorse());
					const read = fullInputFor(owners, pane);
					const said = { ...read.pane, userChanged, ...(agentSwitch ? { agentSwitch } : {}) };
					const input = { ...read, pane: said };
					if (kind === "selection") semanticPublisher.publishPaneSelection(input);
					else semanticPublisher.publishPaneFocus(input);
				} catch (error) {
					logger.error(`Cannot publish ${kind} context for pane ${pane.paneId}:`, error);
				}
			};
			/**
			 * The checkouts of a tab session's live workhorses.
			 * @param tabSessionId The tab session.
			 * @returns Them, or none while the session is not live.
			 */
			codexWiring.codex.liveWorkhorseCheckouts = (tabSessionId) => {
				const session = components.sessions.list().find(({ id }) => id === tabSessionId);
				return session === undefined ? [] : liveWorkhorseCheckouts(session);
			};
			const stopEnding = endTabSessionsOnceGone(components);
			return () => {
				stopEnding();
				if (active === components) {
					active = null;
					codexWiring.codex.publishPaneContext = null;
					codexWiring.codex.liveWorkhorseCheckouts = null;
				}
			};
		},
		installBrowserGateway,
		/**
		 * Dispose the browser gateway.
		 * @param gateway The gateway.
		 * @returns Whatever disposal returns; the hook contract passes it through.
		 */
		stopBrowser: (gateway) => gateway.dispose(),
		/**
		 * Log a fault the workbench cannot recover from.
		 * @param error The fault.
		 */
		onFatal: (error) => {
			logger.error("Fatal Codex workbench fault:", error);
		},
	};
	return integration;
}

let codexApplication: ReturnType<typeof createServerCodexWorkbenchApplication> | null = null;

/**
 * Shut the Codex workbench application down and forget its wiring.
 */
async function stopCodexWorkbench(): Promise<void> {
	const application = codexApplication;
	if (application === null) {
		resetCodexWorkbenchWiring();
		return;
	}
	await application.shutdown();
	if (codexApplication === application) {
		codexApplication = null;
	}
	resetCodexWorkbenchWiring();
}

/**
 * Load and prepare the Codex workbench application, shutting it down again
 * if startup is cancelled meanwhile.
 * @param signal Cancels the preparation.
 */
async function prepareCodexWorkbench(signal: AbortSignal): Promise<void> {
	const [applicationModule, generationModule, productionModule] = await Promise.all([
		import("#server/services/owner/application.ts"),
		import("#server/services/generation/workbench.ts"),
		import("#server/services/owner/production.ts"),
	]);
	if (signal.aborted) {
		throw new Error("Codex startup was canceled before installation.");
	}
	const application = applicationModule.createServerCodexWorkbenchApplication({
		module: generationModule,
		/**
		 * Build the installation against this server.
		 * @returns The installation.
		 */
		installation: () =>
			productionModule.createServerCodexWorkbenchInstallation(createArchboardWorkbenchServer()),
	});
	codexApplication = application;
	/** Shut the application down on cancellation, swallowing the shutdown's own failure. */
	const cancel = (): void => {
		void application.shutdown().catch(() => undefined);
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		await application.prepare();
	} finally {
		signal.removeEventListener("abort", cancel);
	}
}

export { prepareCodexWorkbench, stopCodexWorkbench };
