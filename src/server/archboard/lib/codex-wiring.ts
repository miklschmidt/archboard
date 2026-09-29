import { logger } from "@/runtime/engine/logger";
import { semanticChangeFeed } from "@/server/archboard/lib/semantic-change-feed";

import { panesInOrder } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import type {
	SemanticUserChange,
	SettledChangeSourceEvent,
} from "@/runtime/codex-semantic-context";
import {
	serverStartupOwnershipRecord,
	writeServerStartupProtocolRecord,
} from "@/shared/server-startup-terminal";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchTabSession,
} from "@/server/archboard/codex-workbench-generation";
import type { TabSessionId } from "@/server/codex-workbench";
import {
	createServerCodexBrowserSocketOwner,
	type BrowserConnectionInstance,
} from "@/server/archboard/codex-workbench-browser";
import type { createServerCodexWorkbenchApplication } from "@/server/archboard/lib/codex-workbench-application";
import type { CodexWorkbenchServer } from "@/server/archboard/lib/codex-workbench-production";
import { presentingPane } from "@/server/archboard/lib/codex-workbench-semantic-pane";
import {
	canonicalContextFromBrief,
	semanticInputFor,
	type ContextPane,
	type SemanticInputOwners,
} from "@/server/archboard/lib/codex-semantic-input";
import { waitForTargetsWith } from "@/server/archboard/lib/codex-target-wait";
import { checkoutRoot } from "@/server/archboard/lib/module-paths";
import { subscribeNarrationChanges } from "@/server/archboard/lib/walkthrough-narration";
import {
	boardForPane,
	browserLeaseLedger,
	codexSocketInstances,
	currentSocketsByClient,
	panes,
} from "@/server/archboard/lib/pane-registry";
import { endTabSessionsOnceGone, tabSessionOf } from "@/server/archboard/lib/tab-sessions";

/** The browser-facing hooks the installed Codex workbench gateway provides, null while none is installed. */
interface CodexWiring {
	codex: {
		publishPaneContext:
			| ((
					clientId: string,
					kind: "focus" | "selection",
					userChanged: readonly SemanticUserChange[],
			  ) => void)
			| null;
		acceptBrowser: ((instance: BrowserConnectionInstance, browserId: string) => void) | null;
		closeBrowser:
			| ((instance: BrowserConnectionInstance, browserId: string) => Promise<void>)
			| null;
		drainBrowsers: (() => Promise<void>) | null;
		handleBrowserMessage:
			| ((
					instance: BrowserConnectionInstance,
					browserId: string,
					input: unknown,
					send: (message: unknown) => Promise<void>,
			  ) => Promise<void>)
			| null;
	};
}

const codexWiring: CodexWiring = {
	codex: {
		publishPaneContext: null,
		acceptBrowser: null,
		closeBrowser: null,
		drainBrowsers: null,
		handleBrowserMessage: null,
	},
};

/**
 * The board a pane is showing, for a context that has to name one.
 *
 * A pane exists whether or not it is showing a board, but a thread is bound to
 * a pane *and its board*: a context built for a pane showing nothing would be a
 * brief about no architecture at all.
 * @param pane The pane.
 * @returns The board key.
 * @throws {Error} When the pane is showing no board.
 */
function shownBoard(pane: PaneRegistration): string {
	const board = boardForPane(pane);
	if (board === null) {
		throw new Error(`Pane ${pane.paneId} is showing no board, so there is no context to read.`);
	}
	return board;
}

/** Forget every browser callback the workbench installed. */
function resetCodexWorkbenchWiring(): void {
	codexWiring.codex.publishPaneContext = null;
	codexWiring.codex.acceptBrowser = null;
	codexWiring.codex.closeBrowser = null;
	codexWiring.codex.drainBrowsers = null;
	codexWiring.codex.handleBrowserMessage = null;
}

type OperationAuthority = Parameters<CodexWorkbenchServer["contextForOperation"]>[0];

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
 * The panes of one browser tab on screen, in reading order.
 * @param tabSessionId The tab's session.
 * @returns The panes.
 */
function panesOfTabSession(tabSessionId: TabSessionId): PaneRegistration[] {
	return panesInOrder(Array.from(panes.values()))
		.map(({ pane }) => pane)
		.filter((pane) => tabSessionOf(pane.clientId) === tabSessionId);
}

/**
 * The pane of a tab session that work nobody's command started presents through: the one it
 * presented through last while that is open, else the focused one, else the first. The session
 * remembers it, so its context is still filed under that pane while none of its panes is open.
 * @param session The tab session.
 * @returns The pane, or null while none of the session's panes is open.
 */
function presentingPaneOf(session: CodexWorkbenchTabSession): PaneRegistration | null {
	const open = panesOfTabSession(session.id);
	if (open.length === 0) {
		return null;
	}
	const pane = presentingPane(session.state.presentingPaneId, open);
	session.state.presentingPaneId = pane.paneId;
	return pane;
}

/**
 * The open pane a tab session's fresh read presents through.
 * @param session The tab session.
 * @returns The pane.
 * @throws {Error} When none of the session's panes is open.
 */
function openPaneOf(session: CodexWorkbenchTabSession): PaneRegistration {
	const pane = presentingPaneOf(session);
	if (pane === null) {
		throw new Error("No canvas pane of this browser tab is open to present its conversation.");
	}
	return pane;
}

/**
 * The pane an operation's context is read through. A browser command names the exact pane that
 * sent it, by client id, which must still be on screen: a pane id repeats in every browser tab.
 * Work nobody's command started names none, and presents through an open pane of its session.
 * @param session The tab session the operation belongs to.
 * @param clientId The exact pane that sent it, or null.
 * @returns The pane.
 */
function operationPane(
	session: CodexWorkbenchTabSession,
	clientId: string | null,
): PaneRegistration {
	if (clientId === null) {
		return openPaneOf(session);
	}
	const pane = panes.get(clientId);
	if (pane === undefined) {
		throw new Error(`The Codex context pane is not open: ${clientId}.`);
	}
	return pane;
}

/**
 * The conversation a pane's news is for: its own tab's, once that has board-change delivery bound.
 * @param components The generation.
 * @param clientId The pane's client id.
 * @returns The tab session, or null while the pane's tab has no bound conversation.
 */
function boundSessionOf(
	components: CodexWorkbenchComponents,
	clientId: string,
): CodexWorkbenchTabSession | null {
	const tabSessionId = tabSessionOf(clientId);
	const session = components.sessions.list().find(({ id }) => id === tabSessionId);
	return session !== undefined && session.components.semanticDelivery.snapshot().binding !== null
		? session
		: null;
}

/**
 * What a tab session's semantic input is read from: its thread link, and its conversation's
 * workhorse, coordinator and voice.
 * @param components The generation.
 * @param session The tab session.
 * @returns The owners.
 */
function semanticOwners(
	components: CodexWorkbenchComponents,
	session: CodexWorkbenchTabSession,
): SemanticInputOwners {
	const { workhorse, coordinator, realtime } = session.components;
	return {
		tabSessionId: session.id,
		threadLink: components.threadLink,
		workhorse,
		coordinator,
		realtime,
	};
}

/**
 * The server the Codex workbench installation runs against: how it reads the
 * server (panes, boards, selection, locks) and how it wires itself into the
 * server's sockets.
 * @returns The server.
 */
function createCodexWorkbenchServer(): CodexWorkbenchServer {
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

	/**
	 * The pane a settled change is filed under for one session: its presenting pane while one is
	 * open, else the pane it presented through last, which has no presentation to report. A
	 * session hears every board update except its own writes, so a closed pane or a pane looking
	 * at another board cannot be the thing that stops the news.
	 * @param session The tab session.
	 * @returns The pane.
	 * @throws {Error} When the session has no delivery bound, or never had a pane on screen.
	 */
	const changePane = (session: CodexWorkbenchTabSession): ContextPane => {
		if (session.components.semanticDelivery.snapshot().binding === null) {
			throw new Error("The Codex semantic publisher has no current thread-context binding.");
		}
		const open = presentingPaneOf(session);
		if (open !== null) {
			return { paneId: open.paneId, clientId: open.clientId };
		}
		if (session.state.presentingPaneId === null) {
			throw new Error("No pane of this browser tab was ever open to file its context under.");
		}
		return { paneId: session.state.presentingPaneId, clientId: null };
	};

	return {
		checkoutRoot,
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
		 * Where one tab session's semantic context is published from.
		 * @param tabSessionId The tab session.
		 * @returns The publisher options.
		 */
		semanticPublisherFor: (tabSessionId) => ({
			feed: semanticChangeFeed,
			feedId: semanticChangeFeed.feedId,
			fresh: {
				/**
				 * A fresh semantic input for the board of the pane the session presents through.
				 * @returns The input.
				 */
				read: () => {
					const { components, session } = liveSession(tabSessionId);
					const pane = openPaneOf(session);
					return semanticInputFor(
						semanticOwners(components, session),
						shownBoard(pane),
						null,
						pane,
					);
				},
			},
			/**
			 * The semantic input for a settled change, as the session is shown it.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				const { components, session } = liveSession(tabSessionId);
				return semanticInputFor(
					semanticOwners(components, session),
					event.board,
					{ feedId: semanticChangeFeed.feedId, sequence: event.cursor },
					changePane(session),
				);
			},
		}),
		/**
		 * What a person does by hand to a walkthrough one tab session's voice narrates: only a pane
		 * of that tab is its news.
		 * @param tabSessionId The tab session.
		 * @returns The subscription.
		 */
		narrationChangesFor: (tabSessionId) => (listener) =>
			subscribeNarrationChanges((change, clientId) => {
				if (tabSessionOf(clientId) === tabSessionId) {
					listener(change);
				}
			}),
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
			const pane = operationPane(session, authority.clientId);
			if (!bindingMatchesAuthority(components.threadLink.read(session.id), authority)) {
				throw new Error("The lease-bound Codex pane context changed before capture.");
			}
			const exactInput = semanticInputFor(
				semanticOwners(components, session),
				shownBoard(pane),
				null,
				pane,
			);
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
			 */
			codexWiring.codex.publishPaneContext = (clientId, kind, userChanged) => {
				const pane = panes.get(clientId);
				const session = boundSessionOf(components, clientId);
				if (pane === undefined || session === null) return;
				const { semanticPublisher } = session.components;
				try {
					const read = semanticInputFor(
						semanticOwners(components, session),
						shownBoard(pane),
						null,
						pane,
					);
					const input = { ...read, pane: { ...read.pane, userChanged } };
					if (kind === "selection") semanticPublisher.publishPaneSelection(input);
					else semanticPublisher.publishPaneFocus(input);
				} catch (error) {
					logger.error(`Cannot publish ${kind} context for pane ${pane.paneId}:`, error);
				}
			};
			const stopEnding = endTabSessionsOnceGone(components);
			return () => {
				stopEnding();
				if (active === components) {
					active = null;
					codexWiring.codex.publishPaneContext = null;
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
	const [applicationModule, productionModule] = await Promise.all([
		import("@/server/archboard/codex-workbench-application"),
		import("@/server/archboard/codex-workbench-production"),
	]);
	if (signal.aborted) {
		throw new Error("Codex startup was canceled before installation.");
	}
	const application = applicationModule.createServerCodexWorkbenchApplication({
		module: productionModule,
		/**
		 * Build the installation against this server.
		 * @returns The installation.
		 */
		installation: () =>
			productionModule.createServerCodexWorkbenchInstallation(createCodexWorkbenchServer()),
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

/**
 * Publish pane context through the currently installed workbench, when present.
 * @param clientId The pane that changed.
 * @param kind Whether focus or selection changed.
 * @param userChanged What of it the user changed by hand (ADR 0034). Nothing unless the caller
 * knows otherwise, and what nobody marked is told to nobody.
 */
function publishPaneContext(
	clientId: string,
	kind: "focus" | "selection",
	userChanged: readonly SemanticUserChange[] = [],
): void {
	codexWiring.codex.publishPaneContext?.(clientId, kind, userChanged);
}

export { codexWiring, publishPaneContext, prepareCodexWorkbench, stopCodexWorkbench };
