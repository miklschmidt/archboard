import logger from "@/runtime/engine/logger";
import { selectionState } from "@/runtime/engine/types";
import { boards } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { readBoardContent } from "@/runtime/engine/board-io";
import { boardLockState } from "@/runtime/engine/board-lock";
import { recentDoing } from "@/runtime/engine/board-doing";
import { vaultPathFor } from "@/runtime/engine/board";
import { describeScene } from "@/runtime/engine/describe";
import { changeFeed } from "@/runtime/engine/change-feed";
import { panesInOrder } from "@/runtime/engine/panes";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { ArchboardContextSchema, type ArchboardContext } from "@/runtime/codex-instructions";
import type {
	SemanticContextInput,
	SettledChangeSourceEvent,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import { canonicalSemanticCursorToken } from "@/runtime/codex-thread-context";
import type { DynamicWaitEvent } from "@/runtime/codex-dynamic-tools";
import { CODEX_WAIT_TARGET_POLL_MS } from "@/shared/timing/timing";
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
import { checkoutRoot } from "@/server/canvas/lib/module-paths";
import {
	boardForPane,
	browserLeaseLedger,
	codexSocketInstances,
	currentSocketsByClient,
	panes,
} from "@/server/canvas/lib/pane-registry";
import { messageOf } from "@/server/canvas/lib/request-board";

/** The browser-facing hooks the installed Codex workbench gateway provides, null while none is installed. */
interface CodexWiring {
	codex: {
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
		acceptBrowser: null,
		closeBrowser: null,
		drainBrowsers: null,
		handleBrowserMessage: null,
	},
};

/** Forget the installed gateway's hooks. */
function resetCodexWorkbenchWiring(): void {
	codexWiring.codex.acceptBrowser = null;
	codexWiring.codex.closeBrowser = null;
	codexWiring.codex.drainBrowsers = null;
	codexWiring.codex.handleBrowserMessage = null;
}

/**
 * Pause for a bounded poll interval.
 * @param ms How long.
 * @returns Resolves after the pause.
 */
function sleepFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

type FreshBrief = ReturnType<CodexWorkbenchComponents["semanticPublisher"]["freshBrief"]>;

/**
 * The canonical Codex context a semantic brief becomes, for one pane and one
 * operation.
 * @param brief The settled or fresh brief.
 * @param paneId The pane the context is for.
 * @param operation The operation the context describes.
 * @returns The validated context.
 */
function canonicalContextFromBrief(
	brief: SettledSemanticChangeEvent | FreshBrief,
	paneId: string,
	operation: ArchboardContext["operation"],
): ArchboardContext {
	if (brief.child.id === null || brief.child.epoch === null) {
		throw new Error("Canonical Codex context requires the active child epoch.");
	}
	return ArchboardContextSchema.parse({
		schema: 1,
		paneId,
		board: {
			note: brief.board.note,
			version: brief.version ?? 0,
			cursor: brief.cursor === null ? null : canonicalSemanticCursorToken(brief.cursor),
		},
		threadLink: brief.threadLink,
		child: { id: brief.child.id, epoch: brief.child.epoch },
		workhorse: brief.workhorse,
		coordinator: brief.coordinator,
		semantic: {
			brief: brief.brief,
			capturedAtMs: brief.freshness.capturedAtMs,
			freshUntilMs: brief.freshness.freshUntilMs,
			truncated: brief.truncated,
		},
		focus: {
			paneId: brief.pane.focused ? brief.pane.paneId : null,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		selection: { elementIds: brief.selection, capturedAtMs: brief.freshness.capturedAtMs },
		claim: brief.claim,
		ambiguity: brief.ambiguity,
		operation,
	});
}

/** What a board's note says, for the semantic brief, or why it could not be read. */
interface BoardDescription {
	description: string;
	version: number | null;
	stale: boolean;
	staleReasons: readonly string[];
}

/**
 * Describe a board from its note, marking the description stale when the
 * note cannot be read.
 * @param board The open board.
 * @returns The description.
 */
function describeBoard(board: BoardState): BoardDescription {
	try {
		const content = readBoardContent(board);
		return {
			description: describeScene(Array.from(content.elements.values())),
			version: content.version ?? null,
			stale: false,
			staleReasons: [],
		};
	} catch (error) {
		return {
			description: `The board note could not be read: ${messageOf(error)}`,
			version: null,
			stale: true,
			staleReasons: ["board_note_unreadable"],
		};
	}
}

/**
 * The exact pane a context is captured for: the one with that id showing that board.
 * @param contextBoard The board key.
 * @param exactPaneId The pane id.
 * @returns The pane.
 */
function contextPane(contextBoard: string, exactPaneId: string): PaneRegistration {
	const pane = Array.from(panes.values()).find(
		(candidate) => candidate.paneId === exactPaneId && boardForPane(candidate) === contextBoard,
	);
	if (pane === undefined) {
		throw new Error(`The Codex context board has no authoritative browser pane: ${contextBoard}.`);
	}
	return pane;
}

type LinkedIdentities = Pick<SemanticContextInput, "child" | "threadLink" | "workhorse" | "coordinator">;

/**
 * The child, thread link, workhorse and coordinator identities a pane's
 * semantic context names, taken from the active workbench graph.
 * @param active The active components, or null while none are installed.
 * @param paneId The pane.
 * @returns The identities.
 */
function linkedIdentities(active: CodexWorkbenchComponents | null, paneId: string): LinkedIdentities {
	const link = active?.threadLink.read(paneId).link;
	const workhorse = active?.workhorse.snapshot();
	const coordinator = active?.coordinator.snapshot();
	const executable = link?.state === "executable" ? link : null;
	const linkedThreadId = executable?.threadId ?? null;
	const linkedCreatedWorkhorse =
		linkedThreadId !== null && workhorse?.threadId === linkedThreadId ? workhorse : null;
	const linkedCoordinator = linkedCreatedWorkhorse === null ? null : coordinator;
	const realtime = linkedCreatedWorkhorse === null ? null : active?.realtime.generation();
	const child =
		executable === null
			? {
					id: workhorse?.childId ?? coordinator?.childId ?? null,
					epoch: workhorse?.epoch ?? coordinator?.epoch ?? null,
				}
			: { id: executable.childId, epoch: executable.epoch };
	return {
		child,
		threadLink: {
			state: link?.state ?? "unbound",
			reason: link?.reason ?? null,
		},
		workhorse: {
			threadId: linkedThreadId,
			turnId: null,
		},
		coordinator: {
			threadId: linkedCoordinator?.threadId ?? null,
			realtimeSessionId: realtime?.wireSessionId ?? null,
		},
	};
}

/**
 * The semantic context input for one board as seen from one pane.
 * @param active The active components, or null while none are installed.
 * @param contextBoard The board key.
 * @param cursor The change-feed cursor the context is at, or null for a fresh read.
 * @param exactPaneId The pane.
 * @returns The input the semantic publisher builds a brief from.
 */
function semanticInputFor(
	active: CodexWorkbenchComponents | null,
	contextBoard: string,
	cursor: SemanticContextInput["cursor"],
	exactPaneId: string,
): SemanticContextInput {
	const pane = contextPane(contextBoard, exactPaneId);
	const board = boards.get(contextBoard);
	if (board === undefined) {
		throw new Error(`The Codex context board is not open: ${contextBoard}.`);
	}
	const described = describeBoard(board);
	const selection = selectionState.byClient.get(pane.clientId);
	const holder = boardLockState(contextBoard);
	const doing = recentDoing(contextBoard).at(-1)?.doing ?? null;
	return {
		repository: checkoutRoot,
		...linkedIdentities(active, pane.paneId),
		board: {
			key: contextBoard,
			note: board.file ?? vaultPathFor(board.identity),
			version: described.version,
		},
		pane: { paneId: pane.paneId, focused: pane.focused },
		selection: selection?.elementIds ?? [],
		claim: { holder: holder?.kind ?? "none", doing: holder?.reason ?? doing },
		doing,
		cursor,
		description: described.description,
		ambiguity: [],
		stale: described.stale,
		staleReasons: described.staleReasons,
	};
}

type WaitInput = Parameters<CanvasCodexWorkbenchHost["waitForTargets"]>[0];

/**
 * Whether one target thread has an approval waiting for a person.
 * @param workbench The active components.
 * @param threadId The thread.
 * @returns True when a pending approval targets it.
 */
function hasPendingApproval(
	workbench: CodexWorkbenchComponents,
	threadId: WaitInput["owner"]["sortedTargetThreadIds"][number],
): boolean {
	return workbench.approvals.inspect().some((snapshot) => {
		const identity = snapshot.identity;
		const targetThreadId = identity.kind === "legacy" ? identity.conversationId : identity.threadId;
		return snapshot.state === "pending" && targetThreadId === threadId;
	});
}

/**
 * Look once at every target thread, in order, for something worth waking the
 * waiter for: an approval needing attention, a failed thread, or a finished one.
 * @param workbench The active components.
 * @param input The wait.
 * @returns The event, or null when every target is still working.
 */
async function observeTargetsOnce(
	workbench: CodexWorkbenchComponents,
	input: WaitInput,
): Promise<DynamicWaitEvent | null> {
	const sequence = input.previousSequence + 1;
	for (const threadId of input.owner.sortedTargetThreadIds) {
		const wireThreadId = workbench.identity.identity.decoder.serializeCodexIdentity(threadId);
		if (hasPendingApproval(workbench, threadId)) {
			return { event: "attention", threadId: wireThreadId, sequence, cursor: input.cursor, targetOwned: true };
		}
		// oxlint-disable-next-line eslint(no-await-in-loop) -- targets are observed in their sorted order, one read at a time
		const result = await workbench.session.threadRead({ threadId, includeTurns: false });
		if (result.thread.status.type === "systemError") {
			return { event: "attention", threadId: wireThreadId, sequence, cursor: input.cursor };
		}
		if (result.thread.status.type === "idle") {
			return { event: "completed", threadId: wireThreadId, sequence, cursor: input.cursor };
		}
	}
	return null;
}

/**
 * Wait for one of the owner's target threads to need attention or finish,
 * polling until the deadline.
 * @param workbench The active components.
 * @param input The wait.
 * @returns The event that ended the wait.
 */
async function waitForTargetsWith(
	workbench: CodexWorkbenchComponents,
	input: WaitInput,
): Promise<DynamicWaitEvent> {
	const deadline = Date.now() + input.timeoutMs;
	do {
		if (input.signal.aborted) {
			throw Object.assign(new Error("The dynamic wait was cancelled."), { code: "cancellation" });
		}
		// oxlint-disable-next-line eslint(no-await-in-loop) -- each poll must see the previous one's answer before waiting again
		const observed = await observeTargetsOnce(workbench, input);
		if (observed !== null) {
			return observed;
		}
		const remaining = deadline - Date.now();
		if (remaining > 0) {
			// oxlint-disable-next-line eslint(no-await-in-loop) -- the poll interval is the pause between sequential observations
			await sleepFor(Math.min(remaining, CODEX_WAIT_TARGET_POLL_MS));
		}
	} while (Date.now() < deadline);
	return {
		event: "timeout",
		threadId: null,
		sequence: input.previousSequence + 1,
		cursor: input.cursor,
	} satisfies DynamicWaitEvent;
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
			const pane = Array.from(panes.values()).find(
				(candidate) => candidate.paneId === authority.paneId,
			);
			if (pane === undefined) {
				throw new Error(`The Codex context pane is not open: ${authority.paneId}.`);
			}
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
			return () => {
				if (active === components) {
					active = null;
				}
			};
		},
		installBrowserGateway,
		/**
		 * Dispose the browser gateway.
		 * @param gateway The gateway.
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
		onFatal: (error) => logger.error("Fatal Codex workbench fault:", error),
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

export { codexWiring, prepareCodexWorkbench, stopCodexWorkbench };
