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

	/** Capture the socket created by the production connector. */
	constructor() {
		super();
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
		/** No board claim is involved. */
		setHeldBy: (): void => {},
		/** No agent activity is involved. */
		setDoing: (): void => {},
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
