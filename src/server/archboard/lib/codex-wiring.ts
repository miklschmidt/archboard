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
import {
	SHARED_TAB_SESSION_ID,
	type CodexWorkbenchComponents,
	type CodexWorkbenchTabSession,
} from "@/server/archboard/codex-workbench-generation";
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
import { tabSessionOf } from "@/server/archboard/lib/tab-sessions";

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

/** Forget the installed gateway's hooks. */
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
 * presenting a pane, and return the remover.
 * @param gateway The gateway.
 * @returns Removes the hooks and disposes the socket owner.
 */
function installBrowserGateway(gateway: CodexWorkbenchComponents["gateway"]): () => void {
	const socketOwner = createServerCodexBrowserSocketOwner({
		gateway,
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
 * Every pane on screen, in reading order.
 * @returns The panes.
 */
function orderedPanes(): PaneRegistration[] {
	return panesInOrder(Array.from(panes.values())).map(({ pane }) => pane);
}

/**
 * The pane an operation's context is read through. A browser command names the exact pane that
 * sent it, by client id, which must still be on screen: a pane id repeats in every browser tab.
 * Work nobody's command started names none, and presents through an open pane.
 * @param authority The pane the operation names, and the exact pane that sent it, if any.
 * @returns The pane.
 */
function operationPane(authority: OperationAuthority): PaneRegistration {
	if (authority.clientId === null) {
		return presentingPane(authority.paneId, orderedPanes());
	}
	const pane = panes.get(authority.clientId);
	if (pane === undefined) {
		throw new Error(`The Codex context pane is not open: ${authority.paneId}.`);
	}
	return pane;
}

/**
 * The conversation the server's own reads are about: the one tab session every
 * tab shares (TASK-373 S5b gives each tab its own).
 * @param components The generation.
 * @returns The session.
 */
function sharedSession(components: CodexWorkbenchComponents): CodexWorkbenchTabSession {
	return components.sessions.require(SHARED_TAB_SESSION_ID);
}

/**
 * What a pane's semantic input is read from in one generation: its thread link,
 * and the shared conversation's workhorse, coordinator and voice.
 * @param components The generation, or null while none is installed.
 * @returns The owners, or null.
 */
function semanticOwners(components: CodexWorkbenchComponents | null): SemanticInputOwners | null {
	if (components === null) {
		return null;
	}
	const { workhorse, coordinator, realtime } = sharedSession(components).components;
	return { threadLink: components.threadLink, workhorse, coordinator, realtime };
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
	 * The pane the semantic delivery is bound to, by id alone.
	 *
	 * Identity rather than presentation: the binding names it, and whether that
	 * pane is still on screen is a different question from whose session this
	 * delivery belongs to.
	 * @returns The pane id.
	 * @throws {Error} When no delivery is bound, which is not a pane's fault.
	 */
	const boundPaneId = (): string => {
		const bound =
			active === null
				? null
				: (sharedSession(active).components.semanticDelivery.snapshot().binding?.paneId ?? null);
		if (bound === null) {
			throw new Error("The Codex semantic publisher has no current thread-context binding.");
		}
		return bound;
	};

	/**
	 * The pane a fresh read presents through: the one the delivery is bound to
	 * while it is open, and another open pane once it is not, since the
	 * conversation belongs to the server rather than to the pane that made it.
	 *
	 * For the reads that need a pane to speak for what is on screen. A settled
	 * change does not need one — `boundPaneId` answers that.
	 * @returns The pane.
	 */
	const currentSemanticPane = (): PaneRegistration => presentingPane(boundPaneId(), orderedPanes());

	/**
	 * The exact pane a settled change can report presentation from: the bound pane, while one
	 * with the bound id is open, and none once it is not.
	 * @param paneId The bound pane's id.
	 * @returns The pane's client id, or null.
	 */
	const boundClientId = (paneId: string): string | null => {
		const open = orderedPanes();
		if (open.length === 0) {
			return null;
		}
		const pane = presentingPane(paneId, open);
		return pane.paneId === paneId ? pane.clientId : null;
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
		semanticPublisher: {
			feed: semanticChangeFeed,
			feedId: semanticChangeFeed.feedId,
			fresh: {
				/**
				 * A fresh semantic input for the bound pane's board.
				 * @returns The input.
				 */
				read: () => {
					const pane = currentSemanticPane();
					return semanticInputFor(semanticOwners(active), shownBoard(pane), null, pane);
				},
			},
			/**
			 * The semantic input for a settled change on the bound pane's board.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				// The pane the delivery is bound to, whether or not it is open and
				// whatever it is showing. A session hears every board update except
				// its own writes, so a closed pane or a pane looking at another board
				// cannot be the thing that stops the news — it only means there is no
				// presentation to report, which the context says by carrying none.
				const paneId = boundPaneId();
				return semanticInputFor(
					semanticOwners(active),
					event.board,
					{ feedId: semanticChangeFeed.feedId, sequence: event.cursor },
					{ paneId, clientId: boundClientId(paneId) },
				);
			},
		},
		narrationChanges: subscribeNarrationChanges,
		/**
		 * Every pane on screen, in reading order.
		 * @returns The pane ids.
		 */
		paneIds: () => orderedPanes().map((pane) => pane.paneId),
		/**
		 * The canonical context of a settled event for one pane.
		 * @param event The settled event.
		 * @param paneId The pane.
		 * @param operation The operation in flight, if any.
		 * @returns The context.
		 */
		contextForEvent: (event, paneId, operation) =>
			canonicalContextFromBrief(
				event,
				paneId,
				operation === undefined
					? { id: null, kind: null, rpc: null, outcome: null }
					: { ...operation, outcome: null },
			),
		/**
		 * The canonical context of an operation leased under one pane's authority,
		 * refusing when the pane's thread link has changed since the lease.
		 * @param authority The leased authority.
		 * @param operation The operation.
		 * @returns The context.
		 */
		contextForOperation: (authority, operation) => {
			if (active === null) {
				throw new Error("The Codex workbench context is not ready.");
			}
			const pane = operationPane(authority);
			if (!bindingMatchesAuthority(active.threadLink.read(authority.paneId), authority)) {
				throw new Error("The lease-bound Codex pane context changed before capture.");
			}
			const exactInput = semanticInputFor(semanticOwners(active), shownBoard(pane), null, pane);
			return canonicalContextFromBrief(
				sharedSession(active).components.semanticPublisher.freshBriefFor(exactInput),
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
		 * Make a component graph the active one, and return the remover.
		 * @param components The graph.
		 * @returns Deactivates that graph, if it is still the active one.
		 */
		installLifecycleSignals: (components) => {
			if (installedIdentity !== components.identity) {
				throw new Error("The installed identity decoders do not match the active graph.");
			}
			active = components;
			/**
			 * Publish fresh context when any pane changes focus or selection, once
			 * the server has a conversation to tell: it is one conversation
			 * whichever pane the person is reading.
			 * @param clientId The pane reporting a change.
			 * @param kind The semantic change to publish.
			 * @param userChanged What of it the user changed by hand; empty when nothing was.
			 */
			codexWiring.codex.publishPaneContext = (clientId, kind, userChanged) => {
				const pane = panes.get(clientId);
				if (pane === undefined) return;
				const { semanticDelivery, semanticPublisher } = sharedSession(components).components;
				if (semanticDelivery.snapshot().binding === null) return;
				try {
					const read = semanticInputFor(semanticOwners(components), shownBoard(pane), null, pane);
					const input = { ...read, pane: { ...read.pane, userChanged } };
					if (kind === "selection") semanticPublisher.publishPaneSelection(input);
					else semanticPublisher.publishPaneFocus(input);
				} catch (error) {
					logger.error(`Cannot publish ${kind} context for pane ${pane.paneId}:`, error);
				}
			};
			return () => {
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
