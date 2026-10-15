import { afterAll, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { createPaneCore } from "@/ui/pane-session/core";
import type { PaneStatus } from "@/ui/types";

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
