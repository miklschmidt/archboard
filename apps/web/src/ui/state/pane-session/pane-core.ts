// One pane's entire conversation with the server, wired without React; the hook
// in `use-pane-session.ts` owns the React state and hands this the setters.
//
// A semantic pane never sends board content. It says what it is showing and
// what the person is reading, and hears back which board it is on, who is
// writing it and that the board has moved (ADR 0023). The picture itself is a
// separate read, made by the viewer through the query cache.

import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { takeBoardBack } from "#ui/clients/pane-session/pane-requests.ts";
import { createPaneArrival } from "#ui/rules/pane-session/pane-arrival.ts";
import { createPaneReportDeadline } from "#ui/state/pane-session/pane-deadline.ts";
import { createReadingPublisher, type PaneReading } from "#ui/state/pane-session/pane-reading.ts";
import { createPaneReportSender } from "#ui/clients/pane-session/pane-report-sender.ts";
import {
	createPaneSocketConnector,
	type PaneSocketGeneration,
} from "#ui/clients/pane-session/pane-socket.ts";
import { createPaneStatus } from "#ui/state/pane-session/pane-status.ts";
import { attachWorkbenchOwner } from "#ui/clients/pane-session/pane-workbench-attach.ts";
import {
	handleSocketMessage,
	type MessageContext,
} from "#ui/rules/pane-session/socket-messages.ts";
import {
	UNKNOWN_HOLDER,
	type PaneSessionOptions,
	type TakeBackResult,
} from "#ui/rules/pane-session/session-contracts.ts";
import type { PaneWorkbenchSocketOwner } from "#ui/clients/pane-session/workbench-socket.ts";
import type { WorkbenchTransportPort } from "#ui/rules/pane-session/workbench-port.ts";
import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import { activateCodeTarget } from "@archboard/code-opener/code-target";
import type {
	BoardIdentity,
	DoingEntry,
	LockHolder,
	PaneStatus,
} from "#ui/rules/pane-session/session-types.ts";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];

/** What the core reads out of React and writes back into it. */
interface PaneCorePorts<Transport extends WorkbenchTransportPort> {
	readonly paneId: string;
	readonly clientId: string;
	/**
	 * The latest options.
	 * @returns The options.
	 */
	readonly options: () => PaneSessionOptions<Transport>;
	/**
	 * The element the pane fills.
	 * @returns The element, or null before it mounts.
	 */
	readonly paneElement: () => HTMLElement | null;
	readonly workbenchSockets: PaneWorkbenchSocketOwner<Transport> | null;
	readonly setConnected: (connected: boolean) => void;
	readonly setBoard: (board: BoardIdentity | null) => void;
	/** The server put the pane in another vault (ADR 0050). */
	readonly setVault: (vault: string) => void;
	/** Where the server pointed the pane; a drill-down does not move it. */
	readonly setOpened: (key: string | null) => void;
	/** The server pointed the pane somewhere other than the board on screen. */
	readonly arrived: () => void;
	readonly setHeldBy: (holder: LockHolder | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
}

/** One pane's wiring, as the hook holds it. */
interface PaneCore<Transport extends WorkbenchTransportPort> {
	readonly connect: () => void;
	readonly publishStatus: () => void;
	/** The pane's facets the server hears about changed. */
	readonly facetsChanged: () => void;
	/** The element the pane fills changed or resized. */
	readonly paneElementChanged: () => void;
	/**
	 * What the person is reading in this pane changed.
	 * @param reading The board, variant, view and selection.
	 */
	readonly readingChanged: (reading: PaneReading) => void;
	/** Await the latest reading before starting an action that consumes it. */
	readonly flushReading: () => Promise<boolean>;
	/**
	 * The user asked, by hand, for a part of this pane's reading to change (ADR 0034).
	 * @param part The part their gesture was about.
	 */
	readonly userChanged: (part: SemanticPanePart) => void;
	/**
	 * What the user asked for came to nothing.
	 * @param part The part that is not going to change after all.
	 */
	readonly userChangeFailed: (part: SemanticPanePart) => void;
	readonly takeBack: () => Promise<TakeBackResult>;
	/**
	 * Open the file a subject's binding names.
	 * @param subjectId The semantic id.
	 */
	readonly openCode: (subjectId: string) => void;
	/**
	 * The transport retained by the current socket generation.
	 * @returns The transport, or null.
	 */
	readonly workbenchTransport: () => Transport | null;
	readonly dispose: () => void;
}

/**
 * Wire one pane.
 * @param ports What the core reads from React and writes back to it.
 * @returns The core.
 */
function createPaneCore<Transport extends WorkbenchTransportPort>(
	ports: PaneCorePorts<Transport>,
): PaneCore<Transport> {
	const { paneId, clientId } = ports;
	let disposed = false;
	// Whether a socket has ever opened here: what tells a reconnection apart.
	let openedBefore = false;

	/**
	 * Whether this pane is still mounted.
	 * @returns True until it is disposed.
	 */
	function isLive(): boolean {
		return !disposed;
	}
	const paneReportDeadline = createPaneReportDeadline();
	const reading = createReadingPublisher({ paneId, clientId, vault: paneVault });

	/**
	 * Tell the shell what this pane is, now.
	 * @param snapshot The pane's status.
	 */
	function onStatus(snapshot: PaneStatus): void {
		ports.options().onStatus(snapshot);
	}

	const { live: status, publish: publishStatus } = createPaneStatus({
		paneId,
		clientId,
		vault: ports.options().openingVault,
		onStatus,
	});

	/**
	 * The vault this pane is in now.
	 * @returns The vault.
	 */
	function paneVault(): string {
		return status.vault;
	}

	/**
	 * The board this pane holds.
	 * @returns Its key, or null.
	 */
	function boardKey(): string | null {
		return status.boardKey;
	}

	/**
	 * Who holds the board when it is not this pane.
	 * @param holder The holder, or null when free or ours.
	 * @param _mine Whether this pane is the holder, which changes nothing here.
	 */
	function setHolder(holder: LockHolder | null, _mine = false): void {
		ports.setHeldBy(holder);
		ports.options().onHolder?.(paneId, status.boardKey, holder);
	}

	/**
	 * Record connection health and say so.
	 * @param connected Whether the pane is registered and connected.
	 */
	function setConnected(connected: boolean): void {
		status.connected = connected;
		ports.setConnected(connected);
		publishStatus();
	}

	/**
	 * The server accepted, or stopped accepting, this pane's report.
	 *
	 * Becoming registered is where a reading is said again, and it has to be:
	 * the reader keeps a report only while its pane is one the server has, so a
	 * report sent between a socket opening and its pane being accepted is
	 * dropped and never asked for again. This is the first moment there is a
	 * pane to attach a reading to, and every later acceptance re-arms it, so a
	 * registration that lapses and comes back recovers without a retry loop.
	 * @param registered Whether the server has this pane.
	 */
	function setRegistered(registered: boolean): void {
		if (status.registered === registered) {
			return;
		}
		status.registered = registered;
		publishStatus();
		if (registered) {
			reading.republish();
		}
	}

	/**
	 * Whether this pane is the primary one.
	 * @returns True when primary.
	 */
	function isPrimary(): boolean {
		return ports.options().primary;
	}

	/**
	 * Whether this pane is the one the person last touched.
	 * @returns True when focused.
	 */
	function isFocused(): boolean {
		return ports.options().focused;
	}

	/**
	 * Whether this pane is a recording page's.
	 * @returns True when it is.
	 */
	function isRecording(): boolean {
		return ports.options().recording === true;
	}

	/**
	 * Report what this pane shows, after the debounce or now.
	 * @param immediate Send now rather than after `PANE_MS.report`.
	 */
	function schedulePaneReport(immediate: boolean): void {
		// A pane being removed has nothing to say about what it shows.
		if (!disposed) {
			paneReportDeadline.schedule(paneReports.send, immediate);
		}
	}

	const adoptBoard = createPaneArrival({
		status,
		setVault: ports.setVault,
		setOpened: ports.setOpened,
		setBoard: ports.setBoard,
		setDoing: ports.setDoing,
		/** Forget who holds the board on screen and what was reported of it. */
		forgetBoard: (): void => {
			// The board we are arriving at is somebody else's until we are told it
			// is not; the server sends that immediately behind the board (ADR 0016).
			setHolder(UNKNOWN_HOLDER);
			reading.reset();
		},
		/**
		 * Tell the shell the pane arrived at another board.
		 * @param key The board it shows now.
		 * @param previousKey The board it was pointed at before, or null.
		 */
		arrived: (key: string, previousKey: string | null): void => {
			ports.options().onBoardAdopted?.(paneId, key, previousKey);
			ports.arrived();
		},
		publish: publishStatus,
		/** Report the pane now. */
		report: (): void => {
			schedulePaneReport(true);
		},
	});

	/**
	 * The board this pane is showing has a new version.
	 * @param version The version it is at now.
	 */
	function noteChange(version: number | null): void {
		status.version = version;
		status.lastChangeAt = new Date().toISOString();
		publishStatus();
	}

	/**
	 * What an agent said it was doing (TASK-095).
	 * @param entries The last few, oldest first.
	 */
	function setDoing(entries: DoingEntry[]): void {
		status.doing = entries;
		ports.setDoing(entries);
	}

	const messageContext: MessageContext = {
		clientId,
		boardKey,
		vault: paneVault,
		adoptBoard,
		noteChange,
		publishStatus,
		setHolder,
		setDoing,
		/**
		 * Where a layout request goes; read live, so a rebound shell hears it.
		 * @returns The listener, or undefined when the shell wants none.
		 */
		get onLayoutRequest() {
			return ports.options().onLayoutRequest;
		},
		/**
		 * Where a request to present a walkthrough step goes; read live.
		 * @returns The listener, or undefined when the shell wants none.
		 */
		get onPresentRequest() {
			return ports.options().onPresentRequest;
		},
		/**
		 * Read the current canonical navigation listener.
		 * @returns The router-owned arrival listener.
		 */
		get onModelRequest() {
			return ports.options().onModelRequest;
		},
		/**
		 * Where a board refusal goes; read live.
		 * @returns The listener, or undefined when the shell wants none.
		 */
		get onBoardError() {
			return ports.options().onBoardError;
		},
		/**
		 * Where the agent-activity snapshot goes; read live.
		 * @returns The listener, or undefined when the shell wants none.
		 */
		get onAgentActivity() {
			return ports.options().onAgentActivity;
		},
		/**
		 * Where news of a chosen checkout goes; read live.
		 * @returns The listener, or undefined when the shell wants none.
		 */
		get onExplanationsChanged() {
			return ports.options().onExplanationsChanged;
		},
		/**
		 * Read the current repository change callback.
		 * @returns The current listener, when installed.
		 */
		get onRepositoriesChanged() {
			return ports.options().onRepositoriesChanged;
		},
	};

	/**
	 * The socket opened. The immediate pane report resolves the registration
	 * only after the server has accepted this socket's pane; a workbench
	 * subscription before that point is refused by the gateway.
	 * @param generation The socket generation.
	 */
	function socketOpened(generation: PaneSocketGeneration): void {
		const sockets = ports.workbenchSockets;
		if (sockets !== null) {
			attachWorkbenchOwner({ sockets, generation, connector, live: isLive, publishStatus });
		}
		const returning = openedBefore;
		openedBefore = true;
		status.connected = false;
		// A new socket has not had a pane accepted on it yet, whatever the last
		// one had: until the server answers a report there is no pane to address.
		status.registered = false;
		ports.setConnected(false);
		// The server retires a pane when its socket closes, so a reconnection
		// re-announces this one even though nothing about it changed.
		paneReports.forget();
		// What this pane is reading is said again when the server accepts the pane,
		// not here: until then there is no pane for a report to belong to.
		publishStatus();
		schedulePaneReport(false);
		// Only for a socket that came back: what changed while it was down was
		// never announced, so whoever caches an answer from this server is told
		// to ask again (TASK-167). The first connection has nothing stale yet.
		if (returning) {
			ports.options().onPaneReconnected?.(paneId);
		}
	}

	/** The current socket closed or errored. */
	function socketLost(): void {
		setConnected(false);
	}

	/**
	 * A socket closed, current or not; the workbench must release it either way.
	 *
	 * For a pane that has been disposed this is also where its retirement is
	 * said, because it is the first moment the socket is actually gone — the
	 * shell learns a pane has left the layout earlier, and the server still has
	 * it registered until here (TASK-167).
	 * @param socket The socket.
	 */
	function socketRetired(socket: WebSocket): void {
		void ports.workbenchSockets?.detach(socket).catch(() => undefined);
		if (disposed) {
			ports.options().onPaneRetired?.(paneId);
		}
	}

	/**
	 * A message arrived.
	 * @param data The message.
	 */
	function onSocketMessage(data: Parameters<typeof handleSocketMessage>[1]): void {
		handleSocketMessage(messageContext, data);
	}

	const connector = createPaneSocketConnector(
		clientId,
		paneVault,
		{
			opened: socketOpened,
			message: onSocketMessage,
			closed: socketLost,
			retired: socketRetired,
			errored: socketLost,
		},
		() => ports.options().canonical === true,
	);

	const paneReports = createPaneReportSender({
		paneId,
		clientId,
		boardKey,
		vault: paneVault,
		paneElement: ports.paneElement,
		primary: isPrimary,
		focused: isFocused,
		recording: isRecording,
		connector,
		setConnected,
		setRegistered,
		listeners: ports.options,
	});

	/**
	 * The person releases an agent's claim on their board: the one explicit
	 * control over a claimed board (ADR 0022). Nothing is undone; the board goes
	 * to nobody, and the agent is told once that it lost the board.
	 * @returns Whether the claim was released.
	 */
	async function takeBack(): Promise<TakeBackResult> {
		const target = status.boardKey;
		const vault = status.vault;
		try {
			await takeBoardBack(vault, target, clientId);
			// The same board of another checkout is another board, with its own claim.
			if (status.boardKey !== target || status.vault !== vault) {
				return { outcome: "failure" };
			}
			// Released, or nobody claimed it any more: the board is free either
			// way, and the broadcast says so too.
			setHolder(null);
			return { outcome: "success" };
		} catch {
			return { outcome: "failure" };
		}
	}

	/**
	 * Say what happened, where the person is.
	 * @param notice The notice and whatever it offers.
	 */
	function tell(notice: CodeTargetNotice): void {
		ports.options().onCodeTargetNotice?.(notice);
	}

	/**
	 * Open the file a subject's binding names, in the person's editor.
	 * @param subjectId The semantic id.
	 */
	function openCode(subjectId: string): void {
		activateCodeTarget({
			vault: status.vault,
			boardKey: status.boardKey,
			elementId: subjectId,
			onNotice: tell,
		});
	}

	/** The pane is closing. */
	function dispose(): void {
		disposed = true;
		paneReportDeadline.cancel();
		reading.dispose();
		// Closing the socket is also how this pane stops being reported: the
		// server drops it on the close.
		const sockets = ports.workbenchSockets;
		if (sockets === null) {
			connector.close();
			return;
		}
		void sockets.dispose().finally(connector.close);
	}

	/** The pane's facets the server hears about changed. */
	function facetsChanged(): void {
		schedulePaneReport(false);
	}

	/**
	 * What the person is reading in this pane changed.
	 * @param next The board, variant, view and selection.
	 */
	function readingChanged(next: PaneReading): void {
		if (next.board === null) {
			readingThrough(null);
			reading.publish(next);
			return;
		}
		showing(next.board.key);
		readingThrough(next.view?.id ?? null);
		reading.publish(next);
	}

	/**
	 * The board on screen is being read through this view, or through none.
	 *
	 * Said by the pane rather than remembered by the shell, because the shell's
	 * memory is about the board it pointed this pane at and the pane may be a
	 * level below that. A board arriving with nothing chosen on it clears this,
	 * which is what keeps a view id from outliving the variant it names.
	 * @param view The view's id, or null for the whole variant.
	 */
	function readingThrough(view: string | null): void {
		if (status.view === view) {
			return;
		}
		status.view = view;
		publishStatus();
	}

	/**
	 * The pane is showing this board now.
	 *
	 * Following a drill-down puts another board on screen without anybody
	 * pointing the pane at it, and that board is what this pane IS showing: its
	 * lock, the code a subject opens, what an agent is told, the address and the
	 * inventory are all about the board somebody is looking at. The pane says so
	 * and the server follows it, rather than a second store disagreeing with the
	 * first about which board this pane holds.
	 * @param key The board on screen, or null when there is none.
	 */
	function showing(key: string | null): void {
		if (key === null || status.boardKey === key) {
			return;
		}
		status.boardKey = key;
		// And what that board IS, so the shell names what is on screen rather than
		// the board somebody started from.
		const address = boardAddressOf(key);
		status.board =
			address === null
				? status.board
				: { board: address.board, variant: address.variant ?? "current" };
		ports.setBoard(status.board);
		// A different board is a different version and a different writer.
		status.version = null;
		status.doing = [];
		ports.setDoing([]);
		setHolder(UNKNOWN_HOLDER);
		publishStatus();
		// Immediately, not on the debounce: the pane inventory is read every turn,
		// and a pane reporting the board it came from sends an agent to the wrong
		// one.
		schedulePaneReport(true);
	}

	/**
	 * The transport retained by the current socket generation.
	 * @returns The transport, or null.
	 */
	function workbenchTransport(): Transport | null {
		return ports.workbenchSockets?.current()?.transport ?? null;
	}

	return {
		connect: connector.connect,
		publishStatus,
		facetsChanged,
		paneElementChanged: facetsChanged,
		readingChanged,
		flushReading: reading.flush,
		userChanged: reading.userChanged,
		userChangeFailed: reading.userChangeFailed,
		takeBack,
		openCode,
		workbenchTransport,
		dispose,
	};
}

export { createPaneCore, type PaneCore, type PaneCorePorts };
