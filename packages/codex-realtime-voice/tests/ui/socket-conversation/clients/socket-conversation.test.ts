import { expect, test } from "bun:test";

import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaState,
} from "#ui/media/clients/media-state.ts";
import { createBrowserWorkbenchMediaOwner } from "#ui/media/clients/media-owner.ts";
import { openSocketConversation } from "#ui/socket-conversation/clients/socket-conversation.ts";
import { createBrowserWorkbenchTransport } from "#ui/transport/clients/transport.ts";
import type { BrowserWorkbenchTransport } from "#ui/transport/state/contract.ts";
import { FakeSocket, type FakeSocketRequest } from "#tests/ui/support/transport/fake-socket.ts";
import { snapshot, snapshotMessage } from "#tests/ui/support/transport/fixtures.ts";

/**
 * A pane socket whose server answers every snapshot request.
 * @returns The socket.
 */
function paneSocket(): FakeSocket {
	const socket = new FakeSocket();
	let sequence = 0;
	/**
	 * Answer a snapshot request with the next snapshot.
	 * @param request The request.
	 * @param on The socket it came on.
	 */
	socket.onRequest = (request: FakeSocketRequest, on: FakeSocket) => {
		if (request["action"] === "subscribe" || request["action"] === "snapshot") {
			sequence += 1;
			on.reply(request, snapshotMessage(sequence, snapshot({ linkState: "executable" })));
		}
	};
	return socket;
}

/**
 * A conversation whose transports and media record, in one log, the order of every attach,
 * detach and dispose, each transport named by the generation it was made for.
 * @returns The conversation and the log.
 */
function recordingConversation() {
	const log: string[] = [];
	const names = new Map<BrowserWorkbenchTransport, string>();
	/**
	 * Make one generation's transport.
	 * @returns The transport.
	 */
	const createTransport = (): BrowserWorkbenchTransport => {
		const real = createBrowserWorkbenchTransport();
		const name = `t${names.size + 1}`;
		const transport: BrowserWorkbenchTransport = {
			...real,
			/**
			 * Attach, and log it.
			 * @param socket The socket.
			 * @returns The real transport's state.
			 */
			attach: async (socket) => {
				log.push(`${name}.attach`);
				return real.attach(socket);
			},
			/** Dispose, and log it. */
			dispose: async () => {
				log.push(`${name}.dispose`);
				await real.dispose();
			},
		};
		names.set(transport, name);
		return transport;
	};
	const ready: BrowserWorkbenchMediaState = { state: "ready" };
	const media: BrowserWorkbenchMediaOwner = {
		...createBrowserWorkbenchMediaOwner(),
		/**
		 * Log an attach.
		 * @param transport The transport.
		 * @returns Ready.
		 */
		attach: async (transport: BrowserWorkbenchTransport) => {
			log.push(`media.attach ${names.get(transport)}`);
			return ready;
		},
		/**
		 * Log a detach.
		 * @param transport The transport.
		 */
		detach: async (transport: BrowserWorkbenchTransport) => {
			log.push(`media.detach ${names.get(transport)}`);
		},
		/** Log a dispose. */
		dispose: async () => {
			log.push("media.dispose");
		},
	};
	const conversation = openSocketConversation({ chatId: "chat-a" }, { createTransport, media });
	return { conversation, log };
}

test("each socket gets a fresh transport and controllers, attached before the media and retired after it", async () => {
	const { conversation, log } = recordingConversation();
	const first = paneSocket();
	const second = paneSocket();
	const one = await conversation.attach(first);
	expect(one?.state().connection).toBe("connected");
	expect(conversation.current()).toBe(one);
	const two = await conversation.attach(second);
	expect(two).not.toBeNull();
	expect(two?.controllers).not.toBe(one?.controllers);
	expect(two?.media).toBe(conversation.media);
	expect(log).toEqual([
		"t1.attach",
		"media.attach t1",
		"media.detach t1",
		"t1.dispose",
		"t2.attach",
		"media.attach t2",
	]);
	expect(first.closeCalls).toBe(0);
	await conversation.dispose();
	expect(log.slice(6)).toEqual(["media.detach t2", "t2.dispose", "media.dispose"]);
	expect(conversation.current()).toBeNull();
	expect(await conversation.attach(paneSocket())).toBeNull();
});

test("an attach that a later attach supersedes publishes nothing and makes no transport", async () => {
	const { conversation, log } = recordingConversation();
	const superseded = conversation.attach(paneSocket());
	const latest = conversation.attach(paneSocket());
	expect(await superseded).toBeNull();
	const hosted = await latest;
	expect(hosted).not.toBeNull();
	expect(conversation.current()).toBe(hosted);
	expect(log).toEqual(["t1.attach", "media.attach t1"]);
	await conversation.dispose();
});

test("an attach superseded during its bring-up is retired before the next generation attaches", async () => {
	const { conversation, log } = recordingConversation();
	const socket = paneSocket();
	const first = conversation.attach(socket);
	await Promise.resolve();
	const shared = conversation.attach(socket);
	const latest = conversation.attach(paneSocket());
	expect(await first).toBeNull();
	expect(await shared).toBeNull();
	expect(await latest).toBe(conversation.current());
	expect(log.slice(0, 4)).toEqual(["t1.attach", "media.detach t1", "t1.dispose", "t2.attach"]);
	expect(log).not.toContain("media.attach t1");
	await conversation.dispose();
});

test("attaching the socket of the generation in bring-up shares that bring-up", async () => {
	const { conversation, log } = recordingConversation();
	const socket = paneSocket();
	const first = conversation.attach(socket);
	await Promise.resolve();
	const again = conversation.attach(socket);
	const hosted = await first;
	expect(hosted).not.toBeNull();
	expect(await again).toBe(hosted);
	expect(log).toEqual(["t1.attach", "media.attach t1"]);
	await conversation.dispose();
});

test("a detach retires only the current socket's generation and leaves the socket open", async () => {
	const { conversation, log } = recordingConversation();
	const socket = paneSocket();
	await conversation.attach(socket);
	await conversation.detach(paneSocket());
	expect(conversation.current()).not.toBeNull();
	await conversation.detach(socket);
	expect(conversation.current()).toBeNull();
	expect(log).toEqual(["t1.attach", "media.attach t1", "media.detach t1", "t1.dispose"]);
	expect(socket.closeCalls).toBe(0);
	await conversation.dispose();
});

test("detaching a replacement socket during retirement cancels its pending attach", async () => {
	const { conversation, log } = recordingConversation();
	const first = paneSocket();
	const replacement = paneSocket();
	await conversation.attach(first);
	const attaching = conversation.attach(replacement);
	await conversation.detach(replacement);
	expect(await attaching).toBeNull();
	expect(conversation.current()).toBeNull();
	expect(log).toEqual(["t1.attach", "media.attach t1", "media.detach t1", "t1.dispose"]);
	expect(replacement.closeCalls).toBe(0);
	await conversation.dispose();
});
