import { basename } from "node:path";
import type {
	CodexWorkbenchDomainScope as CodexWorkbenchComponents,
	CodexWorkbenchTabSession,
} from "#runtime/protocol/voice/extension.ts";
import { ARCHBOARD_APP_MANIFEST_SHA256 } from "#runtime/protocol/thread-tools/manifest.ts";
import { createVoiceAgent, type VoiceAgent } from "@archboard/codex-realtime-voice/server";
import { createArchboardAnnouncements } from "#server/services/host/archboard-announcements.ts";
import { ARCHBOARD_VOICE_PRESENTATION } from "#server/services/host/archboard-presentation.ts";
import { createArchboardDomainTools } from "#server/services/generation/domain.ts";
import { isArchboardRecording } from "#runtime/services/host/archboard-voice.ts";
import { ARCHBOARD_CONTEXT_CODEC, workbenchContextOf } from "#runtime/services/host/archboard.ts";
import { createArchboardVoicePolicy } from "#runtime/services/host/archboard-voice.ts";
import { checkoutNamedBy } from "#server/services/host/archboard-checkouts.ts";
import { createArchboardCoordinatorContextSource } from "#server/services/host/archboard-context-source.ts";
import { logger } from "@archboard/diagnostics/logger";
import { checkoutOfVault } from "@archboard/workspace/vault";
import { codexWiring, resetCodexWorkbenchWiring } from "#server/services/owner/wiring-hooks.ts";
import { semanticChangeFeed } from "#server/services/panes/change-feed.ts";
import { workbenchFeedFor } from "#server/services/sessions/feed.ts";
import type { SettledChangeSourceEvent } from "#runtime/schemas/semantic-context-types.ts";
import { reportStartupOwnership } from "@archboard/server-lifecycle/server-host";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";
import { createServerCodexBrowserSocketOwner } from "@archboard/codex-realtime-voice/server";
import type { ArchboardWorkbenchServer } from "#server/services/owner/production.ts";
import {
	canonicalContextFromBrief,
	fullInputFor,
	semanticInputFor,
} from "#server/projections/semantic-context/semantic-input.ts";
import { waitForTargetsWith } from "#server/services/dynamic-tools/target-wait.ts";
import { liveWorkhorseCheckouts } from "@archboard/codex-realtime-voice/server";
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
	onShownChange,
	shownCheckoutOf,
	tabSessionOf,
} from "#server/services/panes/tab-sessions.ts";
import { repositoryOfVault, vaultIn } from "@archboard/workspace/repository-listing";
import {
	boundSessionOf,
	changePane,
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
 * Whether a pane's thread link still names the operation's exact leased authority.
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
 * Attach the gateway to current pane sockets and open each tab's conversation on its first connection.
 * @param components The gateway, and the tab sessions it serves.
 * @returns Removes the hooks and disposes the socket owner.
 */
function installBrowserGateway(
	components: Parameters<ArchboardWorkbenchServer["installBrowserGateway"]>[0],
): () => void {
	const socketOwner = createServerCodexBrowserSocketOwner({
		gateway: components.gateway,
		/**
		 * The pane a browser id presents.
		 * @param browserId The browser's client id.
		 * @returns The pane id, or null while it has no registration.
		 */
		chatForBrowser: (browserId) => panes.get(browserId)?.paneId ?? null,
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
 * Build the Archboard context and socket integration for the Codex workbench.
 * @returns The server.
 */
function createArchboardWorkbenchServer(): ArchboardWorkbenchServer {
	let active: CodexWorkbenchComponents | null = null;
	const announcements = createArchboardAnnouncements({
		/**
		 * Publish what this tab hears: the changes of the boards of its panes' vaults, each built
		 * for the workhorse of the board's checkout, and the reports of its panes.
		 * @param tabSessionId The tab session.
		 * @returns The publisher options.
		 */
		publisherOptions: (tabSessionId) => ({
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
			 * The semantic input for a settled change, under the identity of the workhorse of the
			 * board's checkout, which is the one told it.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				const { components, session } = liveSession(tabSessionId);
				const workhorse = session.workhorses.get(checkoutOfVault(event.vault)) ?? null;
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
		 * This session's canvas, with no narration while a recording holds the voice.
		 * @param id The tab session.
		 * @returns The canvas.
		 */
		canvas: (id) => {
			const canvas = canvasOf(id);
			const recording = isArchboardRecording(
				active?.sessions
					.list()
					.find((session) => session.id === id)
					?.components.realtime.narrative(),
			);
			return recording ? { ...canvas, narrated: null } : canvas;
		},
		/**
		 * Announce one change through the voice agent.
		 * @param change The change.
		 * @returns Its receipts.
		 */
		announce: async (change) => {
			if (codexApplication === null) throw new Error("The Codex workbench has not been created.");
			return codexApplication.announce(change);
		},
		/**
		 * Log a change that could not be announced.
		 * @param error Why.
		 */
		onError: (error) => {
			logger.error("Cannot announce an Archboard context change:", error);
		},
	});
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
			contextCodec: ARCHBOARD_CONTEXT_CODEC,
			resolveCheckout: checkoutNamedBy,
			/**
			 * Name a checkout by the repository of the vault it holds, else by its directory.
			 * @param checkout The checkout directory.
			 * @returns The registered repository's name, or the checkout directory's name.
			 */
			checkoutLabel: (checkout) => {
				const vault = vaultIn(checkout);
				return (vault === null ? null : repositoryOfVault(vault)) ?? basename(checkout);
			},
			narrative: ARCHBOARD_VOICE_PRESENTATION,
			domainTools: {
				registrations: [
					{ namespace: "archboard_app", manifestHash: ARCHBOARD_APP_MANIFEST_SHA256 },
				],
				/**
				 * Install Archboard domain tools under the current generation's capabilities.
				 * @param scope The capabilities that the core grants to Archboard.
				 * @returns The Archboard domain and its cleanup hooks.
				 */
				install: (scope) => createArchboardDomainTools(integration).install(scope),
			},
			/**
			 * Attach Archboard lifecycle signals to this generation.
			 * @param scope The generation capabilities.
			 * @returns The lifecycle cleanup.
			 */
			onGeneration: (scope) => integration.installLifecycleSignals(scope),
			/**
			 * Attach Archboard browser sockets to the core gateway.
			 * @param scope The gateway and sessions that serve the sockets.
			 * @returns The browser gateway cleanup.
			 */
			onBrowserGateway: (scope) => integration.installBrowserGateway(scope),
			/**
			 * Report an unrecoverable core fault through the Archboard logger.
			 * @param error The reported fault.
			 * @returns Nothing after the fault is reported.
			 */
			onFatal: (error) => integration.onFatal(error),
			/**
			 * Read context for the exact operation and execution authority supplied by the core.
			 * @param authority The core-owned operation authority.
			 * @param operation The pending operation identity.
			 * @returns The canonical context of this exact operation.
			 */
			contextForOperation: (authority, operation) =>
				workbenchContextOf(integration.contextForOperation(authority, operation)),
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
						const publisher = announcements.publisherFor(tabSessionId);
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
			reportStartupOwnership(codexGroup);
		},
		/**
		 * Read the tab's shown checkout and pin its first value from the focused pane, else the asking pane.
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
		 * Capture canonical operation context and refuse a tab session link that changed since the lease.
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
				announcements.publisherFor(session.id).freshBriefFor(exactInput),
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
		 * Make a graph the active one, end its tab sessions once gone, and return the remover.
		 * @param components The graph.
		 * @returns Deactivates that graph, if it is still the active one.
		 */
		installLifecycleSignals: (components) => {
			active = components;
			/** Give every tab session of the graph its publisher, and dispose of the rest. */
			const reconcile = (): void => {
				const ids = components.sessions.list().map(({ id }) => id);
				for (const id of ids) announcements.publisherFor(id);
				announcements.keepOnly(ids);
			};
			reconcile();
			const stopReconciling = components.sessions.onChange(reconcile);
			/**
			 * Publish fresh focus or selection context only to the pane's own tab conversation.
			 * @param clientId The pane reporting a change.
			 * @param kind The semantic change to publish.
			 * @param userChanged What of it the user changed by hand; empty when nothing was.
			 * @param agentSwitch What an agent's `browser show` moved, when one did (TASK-293.06).
			 */
			codexWiring.codex.publishPaneContext = (clientId, kind, userChanged, agentSwitch) => {
				const pane = panes.get(clientId);
				const session = boundSessionOf(components, clientId);
				if (pane === undefined || session === null) return;
				const semanticPublisher = announcements.publisherFor(session.id);
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
			return () => {
				stopReconciling();
				announcements.dispose();
				if (active === components) {
					active = null;
					codexWiring.codex.publishPaneContext = null;
					codexWiring.codex.liveWorkhorseCheckouts = null;
				}
			};
		},
		installBrowserGateway,
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
let codexApplication: VoiceAgent | null = null;

/** Shut the Codex workbench application down and forget its wiring. */
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
 * Prepare the Codex workbench application and shut it down if startup is canceled.
 * @param signal Cancels the preparation.
 */
async function prepareCodexWorkbench(signal: AbortSignal): Promise<void> {
	const productionModule = await import("#server/services/owner/production.ts");
	if (signal.aborted) {
		throw new Error("Codex startup was canceled before installation.");
	}
	const application = createVoiceAgent(
		productionModule.createServerVoiceAgentOptions(createArchboardWorkbenchServer()),
	);
	codexApplication = application;
	/** Shut the application down on cancellation, swallowing the shutdown's own failure. */
	const cancel = (): void => {
		void application.shutdown().catch(() => undefined);
	};
	signal.addEventListener("abort", cancel, { once: true });
	try {
		await application.start();
	} finally {
		signal.removeEventListener("abort", cancel);
	}
}
export { prepareCodexWorkbench, stopCodexWorkbench };
