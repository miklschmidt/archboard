import { expect, test } from "bun:test";

import { createVoiceClient } from "#ui/voice-client/clients/voice-client.ts";
import { approval } from "#tests/ui/support/transport/fixtures.ts";
import {
	OpeningSocket,
	SERVER_REASON,
	connected,
	fire,
	gateway,
	until,
} from "#tests/ui/support/voice-client/gateway.ts";

test("the client opens its socket with the chat and tab identity when it is created, and attaches voice", async () => {
	const { client, urls, calls } = gateway();
	await connected(client);
	const url = new URL(urls[0] ?? "");
	expect(url.protocol).toBe("wss:");
	expect(url.pathname).toBe("/api/voice");
	expect(url.searchParams.get("chatId")).toBe("chat-a");
	expect(url.searchParams.get("tabSessionId")).toBe("tab-1");
	expect(calls).toEqual(["attach"]);
	expect(client.snapshot().server?.account.state).toBe("ready");
	await client.dispose();
});

test("a dispose while the first socket opens leaves no socket open", async () => {
	const { client, sockets } = gateway();
	await client.dispose();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(sockets.every((socket) => socket.closeCalls > 0)).toBe(true);
});

test("a socket that does not open, or is lost, opens again by itself after each failed attempt", async () => {
	const { client, sockets, timers } = gateway({ refused: [0, 2, 3] });
	await until(client, (state) => state.failure !== null);
	expect(client.snapshot().failure?.message).toBe("The voice connection closed.");
	await fire(timers);
	expect(client.snapshot().connection).toBe("connected");
	expect(client.snapshot().failure).toBeNull();
	sockets[1]?.close();
	expect(client.snapshot().connection).toBe("reconnecting");
	await fire(timers);
	await fire(timers);
	expect(client.snapshot().connection).toBe("reconnecting");
	await fire(timers);
	expect(sockets).toHaveLength(5);
	expect(client.snapshot().connection).toBe("connected");
	expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
	await client.dispose();
});

test("a dispose ends a reconnect that waits", async () => {
	const { client, sockets, timers } = gateway();
	await connected(client);
	sockets[0]?.close();
	await client.dispose();
	expect(timers.map((timer) => timer.cancelled)).toEqual([true]);
	expect(sockets).toHaveLength(1);
});

test("pagehide releases the socket and the microphone, and pageshow opens the socket again", async () => {
	const { client, sockets, calls, timers, page } = gateway();
	await connected(client);
	page.dispatchEvent(new Event("pagehide"));
	await until(client, () => sockets[0]?.closeCalls === 1);
	expect(calls).toEqual(["attach", "detach"]);
	sockets[0]?.close();
	expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
	page.dispatchEvent(new Event("pageshow"));
	await connected(client);
	expect(sockets).toHaveLength(2);
	expect(calls).toEqual(["attach", "detach", "attach"]);
	await client.dispose();
});

test("an approval from before a reconnect is refused here, and never reaches the new socket", async () => {
	const { client, sockets, commands, timers } = gateway({ approvals: [approval()] });
	await connected(client);
	const stale = client.snapshot().server?.approvals[0];
	if (stale === undefined) throw new Error("The snapshot carries no approval.");
	sockets[0]?.close();
	await fire(timers);
	await connected(client);
	expect(client.snapshot().server?.approvals).toHaveLength(1);
	expect(
		await client.answerApproval(stale, { approvalKind: "command_execution", decision: "accept" }),
	).toBe(false);
	expect(client.snapshot().failure?.message).toBe(
		"This approval is from an earlier state of the conversation. Answer it again from the current state.",
	);
	expect(commands).toEqual([]);
	await client.dispose();
});

test("an approval of the current state is answered with the intent of the state that delivered it", async () => {
	const { client, commands } = gateway({ approvals: [approval()] });
	await connected(client);
	const current = client.snapshot().server?.approvals[0];
	if (current === undefined) throw new Error("The snapshot carries no approval.");
	await client.answerApproval(current, { approvalKind: "command_execution", decision: "accept" });
	expect(client.snapshot().failure?.message).not.toBe(
		"This approval is from an earlier state of the conversation. Answer it again from the current state.",
	);
	expect(commands).toEqual(["approvalRespond"]);
	await client.dispose();
});

test("a reconnect keeps the uncertain failure of the action that the lost socket ended", async () => {
	const { client, timers } = gateway({ lostOnCommand: [0] });
	await connected(client);
	expect(await client.send("Investigate the checkout")).toBe(false);
	expect(client.snapshot().failure?.uncertain).toBe(true);
	await fire(timers);
	expect(client.snapshot().connection).toBe("connected");
	expect(client.snapshot().failure?.uncertain).toBe(true);
	await client.dispose();
});

test("a reconnect stops for good when the server speaks a contract this browser cannot read", async () => {
	const { client, sockets, timers } = gateway({ unreadable: [1] });
	await connected(client);
	sockets[0]?.close();
	await fire(timers);
	expect(sockets).toHaveLength(2);
	expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
	expect(client.snapshot().connection).toBe("stopped");
	expect(client.snapshot().failure?.uncertain).toBe(false);
	await client.dispose();
});

test("a socket the server closes before its first snapshot fails with the server's reason and opens again", async () => {
	const { client, sockets, calls, timers } = gateway({ closed: [0] });
	await until(client, (state) => state.failure !== null && !state.busy);
	expect(client.snapshot().failure?.message).toBe(SERVER_REASON);
	expect(client.snapshot().connection).toBe("reconnecting");
	expect(calls).toEqual([]);
	await fire(timers);
	expect(sockets).toHaveLength(2);
	expect(client.snapshot().connection).toBe("connected");
	expect(client.snapshot().failure).toBeNull();
	await client.dispose();
});

test("an uncertain delivery stays visible and is never sent again", async () => {
	const { client, commands } = gateway({ outcome: "outcome_unknown" });
	await connected(client);
	expect(await client.send("Investigate the checkout")).toBe(false);
	expect(commands).toEqual(["start"]);
	expect(client.snapshot().failure?.uncertain).toBe(true);
	expect(await client.refresh()).toBe(true);
	expect(client.snapshot().failure).toBeNull();
	expect(commands).toEqual(["start"]);
	await client.dispose();
});

test("voice stops during another action and the workhorse keeps working", async () => {
	const { client, calls, commands } = gateway();
	await connected(client);
	const sending = client.send("Keep working");
	expect(client.snapshot().busy).toBe(true);
	expect(await client.startVoice()).toBe(false);
	expect(await client.stopVoice()).toBe(true);
	expect(await sending).toBe(true);
	expect(calls).toEqual(["attach", "stop"]);
	expect(commands).toEqual(["start"]);
	expect(client.snapshot().busy).toBe(false);
	await client.dispose();
});

/** One page load: a client that opens its socket and is disposed. */
async function loadPage(): Promise<void> {
	const client = createVoiceClient({ url: "/api/voice" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await client.dispose();
}

/**
 * The tab session id that each of two page loads of one tab names, over replaced page globals.
 * @param storage The tab's `sessionStorage`.
 * @returns The id each load named on its socket.
 */
async function tabSessionIds(storage: Pick<Storage, "getItem" | "setItem">): Promise<string[]> {
	const urls: string[] = [];
	const page: Record<string, unknown> = globalThis;
	const browserSocket = page["WebSocket"];
	page["WebSocket"] = class extends OpeningSocket {
		/**
		 * Record the URL the client opened.
		 * @param url The URL.
		 */
		constructor(url: string) {
			super(url);
			urls.push(url);
		}
	};
	page["sessionStorage"] = storage;
	page["location"] = { href: "https://host.test/page" };
	try {
		await loadPage();
		await loadPage();
	} finally {
		page["WebSocket"] = browserSocket;
		delete page["sessionStorage"];
		delete page["location"];
	}
	return urls.map((url) => new URL(url).searchParams.get("tabSessionId") ?? "");
}

/** Storage that a privacy setting turned off. */
function refuseStorage(): never {
	throw new DOMException("Storage is disabled.", "SecurityError");
}

test("every page load of a tab names one tab session, also when storage refuses", async () => {
	const stored = new Map<string, string>();
	const kept = await tabSessionIds({
		/**
		 * Read a stored value.
		 * @param key The key.
		 * @returns The value, or null.
		 */
		getItem: (key) => stored.get(key) ?? null,
		/**
		 * Store a value.
		 * @param key The key.
		 * @param value The value.
		 */
		setItem: (key, value) => {
			stored.set(key, value);
		},
	});
	expect(kept).toHaveLength(2);
	expect(kept[0]).not.toBe("");
	expect(kept[1]).toBe(kept[0]);
	const unstored = await tabSessionIds({ getItem: refuseStorage, setItem: refuseStorage });
	expect(unstored).toHaveLength(2);
	expect(unstored[0]).not.toBe("");
	expect(unstored[1]).toBe(unstored[0]);
});
