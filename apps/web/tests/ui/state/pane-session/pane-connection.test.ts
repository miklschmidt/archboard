import { afterAll, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { createPaneCore } from "#ui/state/pane-session/pane-core.ts";
import { onSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";

GlobalRegistrator.register({ url: "http://localhost/" });
afterAll(async () => GlobalRegistrator.unregister());

/** A socket whose connection lifecycle is driven by the test. */
class ControlledSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly created: ControlledSocket[] = [];
	readyState = ControlledSocket.CONNECTING;
	readonly url: string;

	/**
	 * Capture the socket created by the production connector.
	 * @param url Where the connector dialled.
	 */
	constructor(url: string) {
		super();
		this.url = url;
		ControlledSocket.created.push(this);
	}

	/** The transport connected, before the HTTP pane report was accepted. */
	open(): void {
		this.readyState = ControlledSocket.OPEN;
		this.dispatchEvent(new Event("open"));
	}

	/**
	 * Record the lifecycle event.
	 * @param code The close reason, abnormal for a server restart.
	 */
	close(code = 1006): void {
		this.readyState = 3;
		this.dispatchEvent(new CloseEvent("close", { code }));
	}
}

test("a reconnect becomes connected only after its unchanged pane is registered again", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const statuses: PaneStatus[] = [];
	const reports: unknown[] = [];
	let received = Promise.withResolvers<void>();
	let answer = Promise.withResolvers<Response>();
	let accepted = Promise.withResolvers<void>();
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			(_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
				reports.push(init?.body);
				received.resolve();
				return answer.promise;
			},
			{ preconnect: fetch.preconnect },
		),
	);
	const core = createPaneCore({
		paneId: "A",
		clientId: "A-qz99fo",
		/**
		 * Read the fixture state.
		 * @returns The pane's unchanged facets and status listener.
		 */
		options: () => ({
			paneId: "A",
			theme: "dark",
			openingVault: "/work/archboard/.archboard/vault",
			primary: true,
			focused: true,
			/**
			 * Record the lifecycle event.
			 * @param status The registration and connection published to the shell.
			 */
			onStatus: (status): void => {
				statuses.push(status);
			},
		}),
		/**
		 * Read the fixture state.
		 * @returns No element; an unplaced pane still registers.
		 */
		paneElement: () => null,
		workbenchSockets: null,
		/**
		 * Record the lifecycle event.
		 * @param connected Whether the pane says it is ready for commands.
		 */
		setConnected: (connected) => {
			if (connected) accepted.resolve();
		},
		/** This fixture has no displayed board. */
		setBoard: (): void => {},
		/** This fixture makes no board navigation. */
		setOpened: (): void => {},
		/** This fixture makes no board navigation. */
		arrived: (): void => {},
		/** No board claim is involved. */
		setHeldBy: (): void => {},
		/** No agent activity is involved. */
		setDoing: (): void => {},
		/** The server never moves this pane to another vault. */
		setVault: (): void => {},
	});
	try {
		core.connect();
		const first = ControlledSocket.created.at(-1)!;
		first.open();
		expect(statuses.at(-1)!.connected).toBe(false);
		await received.promise;
		answer.resolve(Response.json({ success: true, registered: true, paneCount: 1 }));
		await accepted.promise;
		expect(statuses.at(-1)!.registered).toBe(true);

		first.close();
		received = Promise.withResolvers<void>();
		answer = Promise.withResolvers<Response>();
		accepted = Promise.withResolvers<void>();
		core.connect();
		ControlledSocket.created.at(-1)!.open();
		expect(statuses.at(-1)!.connected).toBe(false);
		expect(statuses.at(-1)!.registered).toBe(false);
		await received.promise;
		answer.resolve(Response.json({ success: true, registered: true, paneCount: 1 }));
		await accepted.promise;
		expect(statuses.at(-1)!.connected).toBe(true);
		expect(statuses.at(-1)!.registered).toBe(true);
		expect(reports).toHaveLength(2);
		expect(reports[1]).toBe(reports[0]);
	} finally {
		core.dispose();
		fetchMock.mockRestore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

/**
 * Say something to the pane over its socket, as the server does.
 * @param socket The pane's socket.
 * @param message The message.
 */
function deliver(socket: ControlledSocket, message: Record<string, unknown>): void {
	socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
}

/** The vault a pane opens in, and the vault of another checkout of its repository. */
const LEFT_VAULT = "/work/archboard/.archboard/vault";
const CHOSEN_VAULT = "/work/archboard-next/.archboard/vault";
const PAYMENTS = { board: "payments", variant: "current" };

/** One call the pane made, held until the test answers it. */
interface HeldCall {
	readonly path: string;
	readonly vault: string | null;
	/** What the call said. */
	readonly body: unknown;
	readonly answer: ReturnType<typeof Promise.withResolvers<Response>>;
}

/**
 * A pane in the left vault, connected and registered, showing `payments`, with
 * every call it makes held for the test to answer.
 * @param facets Whether the person is in the pane, which the test may change.
 * @param facets.focused Whether the pane is the focused one.
 * @returns The pane, its socket, its calls, and what it said of itself and its holder.
 */
async function paneOnPayments(facets = { focused: true }) {
	const calls: HeldCall[] = [];
	const firstCall = Promise.withResolvers<void>();
	const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			(url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
				const answer = Promise.withResolvers<Response>();
				const parsed = new URL(url instanceof Request ? url.url : url, "http://localhost/");
				const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
				calls.push({
					path: parsed.pathname,
					vault: parsed.searchParams.get("vault"),
					body,
					answer,
				});
				firstCall.resolve();
				return answer.promise;
			},
			{ preconnect: fetch.preconnect },
		),
	);
	const statuses: PaneStatus[] = [];
	const holders: unknown[] = [];
	const core = createPaneCore({
		paneId: "A",
		clientId: "A-mv01",
		/**
		 * Read the fixture state.
		 * @returns The pane's facets and listeners.
		 */
		options: () => ({
			paneId: "A",
			theme: "dark",
			openingVault: LEFT_VAULT,
			primary: true,
			focused: facets.focused,
			/**
			 * Record what the pane says it is.
			 * @param status The pane's status.
			 */
			onStatus: (status): void => {
				statuses.push(status);
			},
			/**
			 * Record who the pane says holds its board.
			 * @param _paneId The pane.
			 * @param _board The board.
			 * @param holder The holder.
			 */
			onHolder: (_paneId, _board, holder): void => {
				holders.push(holder);
			},
		}),
		/**
		 * Read the fixture state.
		 * @returns No element; an unplaced pane still registers.
		 */
		paneElement: () => null,
		workbenchSockets: null,
		/** Read from the published status instead. */
		setConnected: (): void => {},
		/** Read from the published status instead. */
		setBoard: (): void => {},
		/** Read from the published status instead. */
		setOpened: (): void => {},
		/** Read from the published status instead. */
		arrived: (): void => {},
		/** Read from the holder listener instead. */
		setHeldBy: (): void => {},
		/** No agent activity is involved. */
		setDoing: (): void => {},
		/** Read from the published status instead. */
		setVault: (): void => {},
	});
	core.connect();
	const socket = ControlledSocket.created.at(-1)!;
	socket.open();
	await firstCall.promise;
	calls[0]!.answer.resolve(registeredReply());
	deliver(socket, {
		type: "pane_board",
		board: "payments",
		identity: PAYMENTS,
		vault: LEFT_VAULT,
		repository: "r",
	});
	/** Put everything back. */
	function restore(): void {
		core.dispose();
		fetchMock.mockRestore();
	}
	return { core, socket, calls, statuses, holders, restore };
}

/**
 * The server's answer to a report from a pane it has.
 * @returns The answer.
 */
function registeredReply(): Response {
	return Response.json({ success: true, registered: true, paneCount: 1 });
}

/**
 * The server moves the pane to the chosen checkout of its repository, keeping its board.
 * @param socket The pane's socket.
 */
function chooseOtherCheckout(socket: ControlledSocket): void {
	deliver(socket, {
		type: "pane_board",
		board: "payments",
		identity: PAYMENTS,
		vault: CHOSEN_VAULT,
		repository: "r",
	});
}

test("a pane moved into another checkout's vault reports there, and the answer from the vault it left does not disconnect it", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const pane = await paneOnPayments();
	try {
		// The report of arriving on the board is still unanswered when the
		// repository's chosen checkout changes and the server moves the pane.
		chooseOtherCheckout(pane.socket);
		expect(pane.calls.map((each) => each.vault)).toEqual([LEFT_VAULT, LEFT_VAULT, CHOSEN_VAULT]);
		// The server answers the report that named the vault the pane left as it
		// answers any report from a vault a pane is not in.
		pane.calls[1]!.answer.resolve(
			Response.json({ success: true, registered: false, paneCount: 1 }),
		);
		pane.calls[2]!.answer.resolve(registeredReply());
		await Bun.sleep(0);
		expect(pane.statuses.at(-1)).toMatchObject({
			vault: CHOSEN_VAULT,
			connected: true,
			registered: true,
		});
	} finally {
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("a pane the person leaves tells the server at once, not after the debounce", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const facets = { focused: true };
	const pane = await paneOnPayments(facets);
	try {
		// Waiting would leave two focused panes on the server for an agent's next turn to refuse.
		facets.focused = false;
		pane.core.facetsChanged();
		expect(pane.calls.at(-1)).toMatchObject({ path: "/api/panes", body: { focused: false } });
	} finally {
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("a pane told only where it is takes its repository's new name and keeps its board", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const pane = await paneOnPayments();
	try {
		const calls = pane.calls.length;
		// The registry changed, and the name the repository goes by with it.
		deliver(pane.socket, { type: "pane_board", vault: LEFT_VAULT, repository: "r-2" });
		expect(pane.statuses.at(-1)).toMatchObject({
			vault: LEFT_VAULT,
			repository: "r-2",
			boardKey: "payments",
		});
		// Nothing moved, so the pane has nothing new to report.
		expect(pane.calls).toHaveLength(calls);
	} finally {
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("an answer from the vault a pane left that comes back before the move leaves the pane connected", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const pane = await paneOnPayments();
	try {
		pane.calls[1]!.answer.resolve(registeredReply());
		await Bun.sleep(0);
		deliver(pane.socket, {
			type: "pane_board",
			board: "ledger",
			identity: { board: "ledger", variant: "current" },
			vault: LEFT_VAULT,
			repository: "r",
		});
		expect(pane.calls.map((each) => each.vault)).toEqual([LEFT_VAULT, LEFT_VAULT, LEFT_VAULT]);
		// The server moved the pane before this report reached it, and its answer
		// reaches the pane before the move does.
		pane.calls[2]!.answer.resolve(
			Response.json({ success: true, registered: false, code: "PANE_MOVED", paneCount: 1 }),
		);
		await Bun.sleep(0);
		expect(pane.statuses.at(-1)).toMatchObject({ connected: true, registered: true });
	} finally {
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("a take-back answered after the pane moved to another checkout does not free the board it shows now", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const pane = await paneOnPayments();
	try {
		const taken = pane.core.takeBack();
		const takeBack = pane.calls.at(-1)!;
		expect(takeBack).toMatchObject({ path: "/api/semantic-boards/take-back", vault: LEFT_VAULT });
		chooseOtherCheckout(pane.socket);
		takeBack.answer.resolve(Response.json({ success: true, released: true }));
		expect(await taken).toEqual({ outcome: "failure" });
		// The board of the new checkout is somebody else's until the server says it is not.
		expect(pane.holders.at(-1)).not.toBeNull();
	} finally {
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("news of a board is news of the vault the pane is in, before and after the server moves it", async () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const pane = await paneOnPayments();
	const heard: string[] = [];
	const stop = onSemanticBoardChange((vault) => {
		heard.push(vault);
	});
	try {
		deliver(pane.socket, { type: "board_note", semantic: true, board: "payments", version: 2 });
		chooseOtherCheckout(pane.socket);
		deliver(pane.socket, { type: "board_note", semantic: true, board: "payments", version: 7 });
		// The server sends a pane only its own vault's news, so the board the
		// canvas reads again is the one of the vault it moved to.
		expect(heard).toEqual([LEFT_VAULT, CHOSEN_VAULT]);
	} finally {
		stop();
		pane.restore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

/**
 * Open one pane's socket, the way the shell does for each pane of a tab, and read the tab
 * session it named to the server.
 * @param paneId The pane.
 * @returns The tab session its socket carried.
 */
function dialledTabSession(paneId: string): string | null {
	const core = createPaneCore({
		paneId,
		clientId: `${paneId}-${ControlledSocket.created.length}`,
		/**
		 * Read the fixture state.
		 * @returns The pane's facets.
		 */
		options: () => ({
			paneId,
			theme: "dark",
			openingVault: "/work/archboard/.archboard/vault",
			primary: paneId === "A",
			focused: false,
			/** Nothing here reads the pane's status. */
			onStatus: (): void => {},
		}),
		/**
		 * Read the fixture state.
		 * @returns No element.
		 */
		paneElement: () => null,
		workbenchSockets: null,
		/** The socket is never opened here. */
		setConnected: (): void => {},
		/** This fixture has no displayed board. */
		setBoard: (): void => {},
		/** This fixture makes no board navigation. */
		setOpened: (): void => {},
		/** This fixture makes no board navigation. */
		arrived: (): void => {},
		/** No board claim is involved. */
		setHeldBy: (): void => {},
		/** No agent activity is involved. */
		setDoing: (): void => {},
		/** The server never moves this pane to another vault. */
		setVault: (): void => {},
	});
	core.connect();
	const url = new URL(ControlledSocket.created.at(-1)!.url);
	core.dispose();
	return url.searchParams.get("tabSession");
}

test("both panes' sockets carry one tab session, kept across a reload and new in a fresh tab", () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	try {
		window.sessionStorage.clear();
		const left = dialledTabSession("A");
		expect(left).toBeTruthy();
		expect(dialledTabSession("B")).toBe(left);

		// A reload runs the page again over the same tab's storage.
		expect(dialledTabSession("A")).toBe(left);

		// A new tab or window starts with storage of its own.
		window.sessionStorage.clear();
		const fresh = dialledTabSession("A");
		expect(fresh).toBeTruthy();
		expect(fresh).not.toBe(left);
		expect(dialledTabSession("B")).toBe(fresh);
	} finally {
		window.sessionStorage.clear();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});

test("a tab whose storage refuses still names one session from both panes", () => {
	const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket")!;
	Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: ControlledSocket });
	const refuse = spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
		throw new Error("storage is blocked");
	});
	try {
		const left = dialledTabSession("A");
		expect(left).toBeTruthy();
		expect(dialledTabSession("B")).toBe(left);
	} finally {
		refuse.mockRestore();
		Object.defineProperty(globalThis, "WebSocket", socketDescriptor);
	}
});
