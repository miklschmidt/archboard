import { logger } from "@/runtime/engine/logger";
import { changeFeed } from "@/runtime/engine/change-feed";
import { panesInOrder } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import type { SettledChangeSourceEvent } from "@/runtime/codex-semantic-context";
import {
	canvasStartupOwnershipRecord,
	writeCanvasStartupProtocolRecord,
} from "@/shared/canvas-startup-terminal";
import type { CodexWorkbenchComponents } from "@/server/canvas/codex-workbench-generation";
import {
	createCanvasCodexBrowserSocketOwner,
	type BrowserConnectionInstance,
} from "@/server/canvas/codex-workbench-browser";
import type { createCanvasCodexWorkbenchApplication } from "@/server/canvas/lib/codex-workbench-application";
import type { CanvasCodexWorkbenchHost } from "@/server/canvas/lib/codex-workbench-production";
import { requireExactSemanticPane } from "@/server/canvas/lib/codex-workbench-semantic-pane";
import {
	canonicalContextFromBrief,
	semanticInputFor,
} from "@/server/canvas/lib/codex-semantic-input";
import { waitForTargetsWith } from "@/server/canvas/lib/codex-target-wait";
import { checkoutRoot } from "@/server/canvas/lib/module-paths";
import {
	boardForPane,
	browserLeaseLedger,
	codexSocketInstances,
	currentSocketsByClient,
	panes,
} from "@/server/canvas/lib/pane-registry";

/** The browser-facing hooks the installed Codex workbench gateway provides, null while none is installed. */
interface CodexWiring {
	codex: {
		publishPaneContext: ((clientId: string, kind: "focus" | "selection") => void) | null;
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
function resetCodexWorkbenchWiring(): void {
	codexWiring.codex.publishPaneContext = null;
	codexWiring.codex.acceptBrowser = null;
	codexWiring.codex.closeBrowser = null;
	codexWiring.codex.drainBrowsers = null;
	codexWiring.codex.handleBrowserMessage = null;
}

type OperationAuthority = Parameters<CanvasCodexWorkbenchHost["contextForOperation"]>[0];

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
	const socketOwner = createCanvasCodexBrowserSocketOwner({
		gateway,
		/**
		 * The pane a browser id presents.
		 * @param browserId The browser's client id.
		 * @returns The pane id, or null while it has no registration.
		 */
		paneForBrowser: (browserId) => panes.get(browserId)?.paneId ?? null,
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
 * The pane a leased operation names, which must be on screen.
 * @param paneId The pane id.
 * @returns The pane.
 */
function operationPane(paneId: string): PaneRegistration {
	const pane = Array.from(panes.values()).find((candidate) => candidate.paneId === paneId);
	if (pane === undefined) {
		throw new Error(`The Codex context pane is not open: ${paneId}.`);
	}
	return pane;
}

/**
 * The host the Codex workbench installation runs against: how it reads the
 * canvas (panes, boards, selection, locks) and how it wires itself into the
 * canvas's sockets.
 * @returns The host.
 */
function createCodexWorkbenchHost(): CanvasCodexWorkbenchHost {
	let active: CodexWorkbenchComponents | null = null;
	let installedIdentity: CodexWorkbenchComponents["identity"] | null = null;

	/**
	 * The pane the semantic delivery is bound to, exactly.
	 * @param contextBoard The board it must be showing, when known.
	 * @returns The pane.
	 */
	const currentSemanticPane = (contextBoard?: string): PaneRegistration => {
		const binding = active?.semanticDelivery.snapshot().binding ?? null;
		return requireExactSemanticPane({
			bindingPaneId: binding?.paneId ?? null,
			...(contextBoard === undefined ? {} : { contextBoard }),
			panes: panes.values(),
			boardForPane,
		});
	};

	return {
		checkoutRoot,
		/**
		 * Record which process group the Codex app-server runs in, for the startup protocol.
		 * @param codexGroup The process group identity.
		 */
		onCodexProcessGroupOwned: (codexGroup) => {
			writeCanvasStartupProtocolRecord(
				canvasStartupOwnershipRecord({ canvasPid: process.pid, codexGroup }),
			);
		},
		semanticPublisher: {
			feed: changeFeed,
			feedId: changeFeed.status().feedId,
			fresh: {
				/**
				 * A fresh semantic input for the bound pane's board.
				 * @returns The input.
				 */
				read: () => {
					const pane = currentSemanticPane();
					return semanticInputFor(active, boardForPane(pane), null, pane.paneId);
				},
			},
			/**
			 * The semantic input for a settled change on the bound pane's board.
			 * @param event The settled change.
			 * @returns The input, at the change's cursor.
			 */
			contextForChange: (event: SettledChangeSourceEvent) => {
				const pane = currentSemanticPane(event.board);
				return semanticInputFor(
					active,
					event.board,
					{ feedId: changeFeed.status().feedId, sequence: event.cursor },
					pane.paneId,
				);
			},
		},
		/**
		 * Every pane on screen, in reading order.
		 * @returns The pane ids.
		 */
		paneIds: () => panesInOrder(Array.from(panes.values())).map(({ pane }) => pane.paneId),
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
			const pane = operationPane(authority.paneId);
			if (!bindingMatchesAuthority(active.threadLink.read(authority.paneId), authority)) {
				throw new Error("The lease-bound Codex pane context changed before capture.");
			}
			const exactInput = semanticInputFor(active, boardForPane(pane), null, authority.paneId);
			return canonicalContextFromBrief(
				active.semanticPublisher.freshBriefFor(exactInput),
				authority.paneId,
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
			 * Publish fresh context when the linked pane changes focus or selection.
			 * @param clientId The pane reporting a change.
			 * @param kind The semantic change to publish.
			 */
			codexWiring.codex.publishPaneContext = (clientId, kind) => {
				const pane = panes.get(clientId);
				if (
					pane === undefined ||
					components.semanticDelivery.snapshot().binding?.paneId !== pane.paneId
				)
					return;
				try {
					const input = semanticInputFor(components, boardForPane(pane), null, pane.paneId);
					if (kind === "selection") components.semanticPublisher.publishPaneSelection(input);
					else components.semanticPublisher.publishPaneFocus(input);
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
		 * Stop the realtime generation, if one is running.
		 * @param realtime The realtime owner.
		 */
		stopRealtime: async (realtime) => {
			const generation = realtime.generation();
			if (generation === null) {
				return;
			}
			await realtime.stop({
				sessionId: generation.browserSessionId,
				correlationId: generation.browserCorrelationId,
			});
		},
		/**
		 * Shut the workhorse queue down.
		 * @param queue The queue.
		 */
		stopQueue: async (queue) => {
			await queue.shutdown();
		},
		/**
		 * Log a fault the workbench cannot recover from.
		 * @param error The fault.
		 */
		onFatal: (error) => {
			logger.error("Fatal Codex workbench fault:", error);
		},
	};
}

let codexApplication: ReturnType<typeof createCanvasCodexWorkbenchApplication> | null = null;

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
		import("@/server/canvas/codex-workbench-application"),
		import("@/server/canvas/codex-workbench-production"),
	]);
	if (signal.aborted) {
		throw new Error("Codex startup was canceled before installation.");
	}
	const application = applicationModule.createCanvasCodexWorkbenchApplication({
		module: productionModule,
		/**
		 * Build the installation against this canvas's host.
		 * @returns The installation.
		 */
		installation: () =>
			productionModule.createCanvasCodexWorkbenchInstallation(createCodexWorkbenchHost()),
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
 */
function publishPaneContext(clientId: string, kind: "focus" | "selection"): void {
	codexWiring.codex.publishPaneContext?.(clientId, kind);
}

export { codexWiring, publishPaneContext, prepareCodexWorkbench, stopCodexWorkbench };
